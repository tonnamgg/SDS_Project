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

	 Create a `.env` file in the `payment` folder:

	 ```powershell
	 PAYMENT_HOST=0.0.0.0
	 PAYMENT_PORT=8082
	 PRODUCT_CATALOG_URL=http://localhost:3000
	 ```

	 The service loads these values automatically when it starts. The payment
	 balance starts at `0` and must be added through `POST /api/payment/balance`.

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
	-e PRODUCT_CATALOG_URL=http://localhost:3000 `
	payment-mock
```

---

## 📡 API Endpoints

### 1. Process a Payment (POST)
*   **URL:** `POST /api/payment`
*   **Body:** One or more products, each with a positive integer quantity

```json
{
	"items": [
		{"sku": "CPU-INT-14900K", "quantity": 1},
		{"sku": "RAM-32GB", "quantity": 2}
	]
}
```

The service gets the product price and stock for every item from `GET
/api/products` on the Product Catalog and calculates the total as the sum of
`price * quantity`. It then charges the payment balance and updates each
product's stock through `PUT /api/admin/products/:sku`. Payments succeed only
when every requested quantity is in stock and the calculated total is within
the current balance. The original single-product body with `sku` and
`quantity` is also supported for compatibility.
Because the service starts with a balance of `0`, add funds at runtime with the
balance top-up endpoint below before making a payment.

The following successful payment example assumes the balance was previously
topped up to `100000.00`:

```json
{
    "status": "success",
    "transaction_id": "txn_592f37c43ad7",
    "amount": 24999.98,
    "remaining_balance": 75000.02,
    "items": [
        {
            "sku": "CPU-INT-14900K",
            "quantity": 1,
            "unit_price": 24900.0,
            "remaining_stock": 9
        },
        {
            "sku": "RAM-32GB",
            "quantity": 2,
            "unit_price": 49.99,
            "remaining_stock": 8
        }
    ]
}
```

Amounts above the configured balance return HTTP `402`:

```json
{
    "status": "failed",
    "reason": "insufficient_funds",
    "transaction_id": "txn_428a2d816e15",
    "amount": 49800.0,
    "remaining_balance": 400.0,
    "sku": "CPU-INT-14900K",
    "quantity": 2,
    "unit_price": 24900.0
}
```

An empty items list, invalid SKU, or non-positive/non-integer quantity returns
HTTP `400`.
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
	"balance": 400.0
}
```

### 3. Add Balance (POST)
*   **URL:** `POST /api/payment/balance`
*   **Body:** A positive amount to add to the current balance

```json
{
	"amount": 600.0
}
```

The response returns the added amount and the new balance:

```json
{
	"added_amount": 600.0,
	"balance": 1000.0
}
```

Invalid or non-positive amounts return HTTP `400`.

---

## 🧪 Testing

```powershell
python -m unittest -v
```
