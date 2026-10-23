# 💳 Payment Mock Service (Python + Standard Library)

A deterministic mock payment service for the e-commerce system. It retrieves
product prices and stock from the Product Catalog, processes payments against a
service balance, and updates product stock after successful payments.

---

## ⚙️ Prerequisites

1. **Python:** version 3.10 or later
2. **Product Catalog:** running locally at `http://localhost:3000` or available
   as the Docker container `catalog-api`
3. **Docker:** for container deployment (optional)

The payment service uses Python's standard library plus the dependency listed
in `requirements.txt`.

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

   The payment service listens at `http://localhost:8082`.

The default Product Catalog URL for a local Python process is
`http://localhost:3000`. You can override the service configuration with a
`.env` file in the `payment` directory:

```text
PAYMENT_HOST=0.0.0.0
PAYMENT_PORT=8082
PRODUCT_CATALOG_URL=http://localhost:3000
```

---

## 🐳 Running with Docker (for Deployment)

**1. Build the payment image**

```powershell
cd payment
docker build -t product-payment-api .
```

The Product Catalog image and container setup are documented in the Product
Catalog README. Before starting the payment container, make sure the catalog
container is running as `catalog-api`.

The payment and Product Catalog containers must be on the same Docker network.
Inside a container, `localhost` refers to that same container. The payment
service therefore reaches the catalog through `http://catalog-api:3000`.

**2. Create a shared Docker network**

```powershell
docker network create sds-network
```

**3. Connect the Product Catalog to the network**

```powershell
docker network connect sds-network catalog-api
```

**4. Run the payment container**

```powershell
docker run -d --name payment-api --network sds-network -p 8082:8082 product-payment-api
```

The payment service is available from the host at `http://localhost:8082`.

If the network already exists, Docker may report an error for
`docker network create`; continue with the remaining commands.

**5. Check the payment container**

```powershell
docker ps
docker logs payment-api
```

Stop and remove the payment container when finished:

```powershell
docker rm -f payment-api
```

---

## 📡 API Endpoints

### 1. Process a Payment (POST)
*   **URL:** `POST /api/payment`
*   **Body:** An `items` array containing one or more SKUs and positive integer
    quantities

```json
{
	"items": [
		{"sku": "CPU-INT-14900K", "quantity": 1},
		{"sku": "MON-LG-27GR95QE", "quantity": 2}
	]
}
```

The service gets the product price and stock for every item from
`GET /api/products` on the Product Catalog and calculates the total as the sum
of `price * quantity` for all items. It then charges the payment balance and
updates each product's stock through `PUT /api/admin/products/:sku`. Payments
succeed only when every requested quantity is in stock and the calculated total
is within the current balance.
Because the service starts with a balance of `0`, add funds at runtime with the
balance top-up endpoint below before making a payment.

The following successful payment example assumes the balance was previously
topped up to `100000.00`:

```json
{
    "status": "success",
    "transaction_id": "txn_592f37c43ad7",
    "amount": 84700.0,
    "remaining_balance": 15300.0,
    "items": [
        {
            "sku": "CPU-INT-14900K",
            "quantity": 1,
            "unit_price": 24900.0,
            "remaining_stock": 9
        },
        {
            "sku": "MON-LG-27GR95QE",
            "quantity": 2,
            "unit_price": 29900.0,
            "remaining_stock": 8
        }
    ]
}
```

Trying to make the same payment again, but with remaining balance of 15300.0 will return HTTP `402`:

```json
{
    "status": "failed",
    "reason": "insufficient_funds",
    "transaction_id": "txn_428a2d816e15",
    "amount": 84700.0,
    "remaining_balance": 15300.0,
    "items": [
        {
            "sku": "CPU-INT-14900K",
            "quantity": 1,
            "unit_price": 24900.0
        },
        {
            "sku": "MON-LG-27GR95QE",
            "quantity": 2,
            "unit_price": 29900.0
        }
    ]
}
```

An empty `items` array, invalid SKU, or non-positive/non-integer quantity returns
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
	"balance": 15300.0
}
```

### 3. Add Balance (POST)
*   **URL:** `POST /api/payment/balance`
*   **Body:** A positive amount to add to the current balance

```json
{
	"amount": 15300.0
}
```

The response returns the added amount and the new balance:

```json
{
	"added_amount": 100000.0,
	"balance": 115300.0
}
```

Invalid or non-positive amounts return HTTP `400`.

---