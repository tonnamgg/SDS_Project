package main

import (
	"context"
	"fmt"
	"log"

	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

const spreadsheetID = "1TizQw2siUgnzB88A-hfcYT1ajMn6q4pFcBYRShAKjnY"

func main() {
	ctx := context.Background()
	
	// 1. สร้าง Client เชื่อมต่อกับ Google Sheets
	_, err := sheets.NewService(ctx, option.WithCredentialsFile("credentials.json"))
	if err != nil {
		log.Fatalf("Unable to retrieve Sheets client: %v", err)
	}

	// เรียกใช้งานฟังก์ชัน CRUD ด้านล่าง
	fmt.Print("Hello golang")
}