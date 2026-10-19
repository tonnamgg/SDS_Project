# 📦 Product Catalog API (Go + Fiber + Google Sheets)

An API for managing a computer hardware product catalog, built with **Go (Golang)** and the **Fiber** framework, using **Google Sheets** as its main database. It supports full CRUD (Create, Read, Update, Delete) operations and can be deployed with Docker.

---

## ⚙️ Prerequisites
1. **Go:** version 1.26 or later (for running locally)
2. **Google Cloud Service Account:** a `credentials.json` file with access to the Google Sheets API 
3. **Google Sheets:** create a spreadsheet and share it with the Service Account's email address as an Editor (PASS)
4. **Docker:** for deployment (optional)

---

## 🚀 Local Setup (for Developers)

1. **Clone the project and download dependencies**
   ```bash
   git clone <repository-url>
   cd product-catalog
   go mod download
   ```

2. **Configure the database (Google Sheets)**
   * Place the `credentials.json` file in the same folder as `main.go`
   * **Request the file from Tonnam**

3. **Run the server**
   ```bash
   go run main.go
   ```
   *The server will run at `http://localhost:3000`*

---

## 🐳 Running with Docker (for Deployment)


**1. Build the Docker image**
```bash
docker build -t product-catalog-api .
```

**2. Run the Docker container (with the key file attached)**

*For Windows (PowerShell):*
```powershell
docker run -d --name catalog-api -p 3000:3000 product-catalog-api
```




---

## 📡 API Endpoints

The product data structure (JSON payload) is as follows:
```json
{
  "sku": "CPU-INT-14900K",
  "name": "Intel Core i9-14900K",
  "category": "CPU",
  "brand": "Intel",
  "price": 24900,
  "stock": 15,
  "warranty": "3 Years",
  "specs": "24 Cores (8P+16E), 32 Threads",
  "image_url": "https://example.com/image.jpg",
  "status": "Active"
}
```

### 1. Get All Products (GET)
*   **URL:** `GET /api/products`
*   **Response:** Returns an array of all products in the catalog (fetched live from Google Sheets)

### 2. Add a New Product (POST)
*   **URL:** `POST /api/admin/products`
*   **Body:** JSON data (following the structure above)
*   **Validation:** Returns a `400` error if the submitted SKU already exists

### 3. Update a Product (PUT)
*   **URL:** `PUT /api/admin/products/:sku` (e.g. `/api/admin/products/CPU-INT-14900K`)
*   **Body:** The updated JSON data (the SKU in the URL always takes precedence)

### 4. Delete a Product (DELETE)
*   **URL:** `DELETE /api/admin/products/:sku`
*   **Response:** Deletes the entire row from Google Sheets immediately
