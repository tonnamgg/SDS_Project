# 💳 Payment Mock Service (Python + Standard Library)

A deterministic mock payment service for the e-commerce system. It accepts a
product SKU and quantity, retrieves the product price from the Product Catalog,
and returns either a successful payment or an insufficient-funds response with
a simulated transaction ID.

---

## ⚙️ Prerequisites
1. **Python:** version 3.10 or later
2. **Docker:** for container deployment (optional)

The service uses Python's standard library plus the dependencies listed in
`requirements.txt`.

---

## 🚀 Local Setup (for Developers)

1. **Move into the payment service folder**
	 ```powershell
	 cd payment
	 ```

2. **Install dependencies**
	 ```powershell
	 python -m pip install -r requirements.txt
	 ```

3. **Run the server**
	 ```powershell
	 python payment_service.py
	 ```
	 *The server will run at `http://localhost:8082`.*

4. **Configure the service (optional)**

	 The host, port, available mock balance, and Product Catalog URL can be
	 overridden with `PAYMENT_HOST`, `PAYMENT_PORT`, `PAYMENT_BALANCE`, and
	 `PRODUCT_CATALOG_URL`.

	 ```powershell
	 $env:PAYMENT_BALANCE = "500.00"
	 $env:PRODUCT_CATALOG_URL = "http://localhost:3000"
	 python payment_service.py
	 ```

---

## 🐳 Running with Docker (for Deployment)

**1. Build the Docker image**
```powershell
docker build -t payment-mock .
```

**2. Run the Docker container**
```powershell
docker run -d --name payment-mock -p 8082:8082 payment-mock
```

When the Product Catalog runs in another Docker container, provide its container
name or network address with `PRODUCT_CATALOG_URL`:
```powershell
docker run -d --name payment-mock `
	-p 8082:8082 `
	-e PAYMENT_BALANCE=500.00 `
	-e PRODUCT_CATALOG_URL=http://product-catalog:3000 `
	payment-mock
```

---

## 📡 API Endpoints

### 1. Process a Payment (POST)
*   **URL:** `POST /api/payment`
*   **Body:** A product SKU and a positive integer quantity

```json
{
	"sku": "CPU-INT-14900K",
	"quantity": 2
}
```

The service gets the product price and stock from `GET /api/products` on the
Product Catalog and calculates `amount = price * quantity`. It then charges the
payment balance and updates the product stock through
`PUT /api/admin/products/:sku`. Payments succeed only when both the requested
quantity is in stock and the calculated amount is within the current balance.
The initial balance can come from `PAYMENT_BALANCE` (default: `100000.00`) or
be added at runtime with the balance top-up endpoint below:

```json
{
	"status": "success",
	"transaction_id": "txn_abc123...",
	"sku": "CPU-INT-14900K",
	"quantity": 2,
	"unit_price": 24900,
	"amount": 49800,
	"remaining_balance": 50200,
	"remaining_stock": 13
}
```

Amounts above the configured balance return HTTP `402`:

```json
{
	"status": "failed",
	"reason": "insufficient_funds",
	"transaction_id": "txn_abc123...",
	"sku": "CPU-INT-14900K",
	"quantity": 2,
	"unit_price": 24900,
	"amount": 49800,
	"remaining_balance": 1000,
	"remaining_stock": 13
}
```

Invalid SKU or non-positive/non-integer quantities return HTTP `400`.
Unknown SKUs return HTTP `404`. Requests above available stock return HTTP
`409`, and an unavailable Product Catalog or failed stock update returns HTTP
`502`.

The stock update preserves all existing product fields, including `specs` and
`image_url`. It changes only `stock` and `status`: status remains `Active` when
stock remains above zero and becomes `Out of Stock` when stock reaches zero.

### 2. Check Available Balance (GET)
*   **URL:** `GET /api/payment/balance`
*   **Response:** Returns the current balance. Successful payments deduct from
    this balance; failed payments do not.

```json
{
	"balance": 50200
}
```

### 3. Add Balance (POST)
*   **URL:** `POST /api/payment/balance`
*   **Body:** A positive amount to add to the current balance

```json
{
	"amount": 500.00
}
```

The response returns the added amount and the new balance:

```json
{
	"added_amount": 500,
	"balance": 50700
}
```

Invalid or non-positive amounts return HTTP `400`.

---

## 🧪 Testing

```powershell
python -m unittest -v
```
