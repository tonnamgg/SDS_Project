package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"product-catalog/models"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

// ค่าเหล่านี้อ่านจาก environment variable (หรือไฟล์ .env) ตอนเริ่ม main()
var (
	spreadsheetID   string
	sheetName       string
	credentialsPath string
)

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func findRowBySKU(srv *sheets.Service, targetSKU string) (int, error) {
	readRange := fmt.Sprintf("%s!A:A", sheetName) // อ่านเฉพาะคอลัมน์ A (SKU)
	resp, err := srv.Spreadsheets.Values.Get(spreadsheetID, readRange).Do()
	if err != nil {
		return -1, err
	}
	for i, row := range resp.Values {
		if len(row) > 0 && fmt.Sprintf("%v", row[0]) == targetSKU {
			return i + 1, nil // +1 เพราะ Google Sheets เริ่มแถวที่ 1 (A1)
		}
	}
	return -1, nil // คืนค่า -1 ถ้าไม่พบ
}

func getCellString(row []interface{}, colIdx int) string {
	if colIdx < len(row) {
		return fmt.Sprintf("%v", row[colIdx])
	}
	return ""
}

func main() {
	// โหลด .env ถ้ามี (ใน Docker/K8s ไม่มีไฟล์นี้ ค่าจะมาจาก environment แทน)
	_ = godotenv.Load()

	spreadsheetID = os.Getenv("GOOGLE_SHEETS_SPREADSHEET_ID")
	if spreadsheetID == "" {
		log.Fatal("GOOGLE_SHEETS_SPREADSHEET_ID is not configured")
	}
	sheetName = getEnv("GOOGLE_SHEETS_TAB_NAME", "Sheet1")
	credentialsPath = getEnv("GOOGLE_APPLICATION_CREDENTIALS", "credentials.json")

	ctx := context.Background()
	srv, err := sheets.NewService(ctx, option.WithCredentialsFile(credentialsPath))
	if err != nil {
		log.Fatalf("Unable to retrieve Sheets client: %v", err)
	}

	app := fiber.New()

	// ==========================================
	// 1. READ ALL (GET) - ดึงข้อมูลทั้งหมด
	// ==========================================
	app.Get("/api/products", func(c *fiber.Ctx) error {
		readRange := fmt.Sprintf("%s!A2:J", sheetName) // ข้ามแถวที่ 1 (หัวตาราง)
		resp, err := srv.Spreadsheets.Values.Get(spreadsheetID, readRange).Do()
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch data"})
		}

		var products []models.Product
		for _, row := range resp.Values {
			if len(row) == 0 {
				continue // ข้ามแถวว่าง
			}

			price, _ := strconv.ParseFloat(getCellString(row, 4), 64)
			stock, _ := strconv.Atoi(getCellString(row, 5))

			products = append(products, models.Product{
				SKU:      getCellString(row, 0),
				Name:     getCellString(row, 1),
				Category: getCellString(row, 2),
				Brand:    getCellString(row, 3),
				Price:    price,
				Stock:    stock,
				Specs:    getCellString(row, 6),
				ImageURL: getCellString(row, 7),
				Status:   getCellString(row, 8),
			})
		}
		return c.JSON(products)
	})

	// ==========================================
	// 2. CREATE (POST) - เพิ่มข้อมูลใหม่
	// ==========================================
	app.Post("/api/admin/products", func(c *fiber.Ctx) error {
		// 1. รับข้อมูลจาก Request เข้ามาเก็บใน Struct ที่ชื่อว่า 'p'
		p := new(models.Product)

		if err := c.BodyParser(p); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid input format"})
		}

		if strings.TrimSpace(p.SKU) == "" {
			return c.Status(400).JSON(fiber.Map{"error": "SKU is required"})
		}

		rowIdx, err := findRowBySKU(srv, p.SKU)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to verify SKU with database"})
		}
		if rowIdx != -1 {
			return c.Status(400).JSON(fiber.Map{"error": "SKU already exists"})
		}

		// 2. ดึงค่าจาก Struct 'p' มาเรียงลำดับให้ตรงกับคอลัมน์ใน Google Sheets
		var vr sheets.ValueRange
		val := []interface{}{
			p.SKU,
			p.Name,
			p.Category,
			p.Brand,
			p.Price,
			p.Stock,
			p.Specs,
			p.ImageURL,
			p.Status,
		}
		vr.Values = append(vr.Values, val)

		// 3. ยิงคำสั่งบันทึกลง Google Sheets
		_, err = srv.Spreadsheets.Values.Append(spreadsheetID, sheetName, &vr).
			ValueInputOption("USER_ENTERED").
			Do()

		if err != nil {
			log.Printf("Google Sheets API Error: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "Failed to save data to sheet"})

		}

		return c.Status(201).JSON(fiber.Map{
			"message": "Product created successfully",
			"data":    p,
		})
	})

	// ==========================================
	// 3. UPDATE (PUT) - แก้ไขข้อมูลตาม SKU
	// ==========================================
	app.Put("/api/admin/products/:sku", func(c *fiber.Ctx) error {
		targetSKU := c.Params("sku")

		// หาว่าอยู่แถวไหน
		rowIdx, err := findRowBySKU(srv, targetSKU)
		if err != nil || rowIdx == -1 {
			return c.Status(404).JSON(fiber.Map{"error": "Product not found"})
		}

		p := new(models.Product)
		if err := c.BodyParser(p); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid input format"})
		}

		updateRange := fmt.Sprintf("%s!A%d:J%d", sheetName, rowIdx, rowIdx)

		var vr sheets.ValueRange
		// ไม่ยอมให้แก้ SKU (บังคับใช้ SKU เดิม)
		val := []interface{}{targetSKU, p.Name, p.Category, p.Brand, p.Price, p.Stock, p.Specs, p.ImageURL, p.Status}
		vr.Values = append(vr.Values, val)

		_, err = srv.Spreadsheets.Values.Update(spreadsheetID, updateRange, &vr).
			ValueInputOption("USER_ENTERED").Do()

		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to update data"})
		}

		p.SKU = targetSKU
		return c.JSON(fiber.Map{"message": "Product updated", "data": p})
	})

	// ==========================================
	// 4. DELETE - ลบข้อมูลตาม SKU
	// ==========================================
	app.Delete("/api/admin/products/:sku", func(c *fiber.Ctx) error {
		targetSKU := c.Params("sku")

		rowIdx, err := findRowBySKU(srv, targetSKU)
		if err != nil || rowIdx == -1 {
			return c.Status(404).JSON(fiber.Map{"error": "Product not found"})
		}

		// ดึง SheetID เชิงตัวเลข เพื่อใช้ลบแกน (Delete Dimension)
		var sheetId int64 = -1
		spreadsheet, _ := srv.Spreadsheets.Get(spreadsheetID).Do()
		for _, s := range spreadsheet.Sheets {
			if s.Properties.Title == sheetName {
				sheetId = s.Properties.SheetId
				break
			}
		}

		// คำสั่งลบแถวทิ้ง (ไม่ใช่แค่เคลียร์ข้อมูล แต่ลบบรรทัดออกเลย)
		req := &sheets.BatchUpdateSpreadsheetRequest{
			Requests: []*sheets.Request{
				{
					DeleteDimension: &sheets.DeleteDimensionRequest{
						Range: &sheets.DimensionRange{
							SheetId:    sheetId,
							Dimension:  "ROWS",
							StartIndex: int64(rowIdx - 1), // Index นับจาก 0
							EndIndex:   int64(rowIdx),
						},
					},
				},
			},
		}

		_, err = srv.Spreadsheets.BatchUpdate(spreadsheetID, req).Do()
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to delete row"})
		}

		return c.JSON(fiber.Map{"message": "Product deleted successfully"})
	})

	log.Fatal(app.Listen(":8081"))
}
