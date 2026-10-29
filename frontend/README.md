# Frontend

This is the customer and admin website for the SDS Shop project.

The frontend uses simple HTML, CSS, and JavaScript. There is no build tool.
The source files are in the `src` folder:

- `src/index.html` - page layout
- `src/style.css` - page style
- `src/app.js` - page logic and API calls

## Main idea

The browser must call the API Gateway only.

```text
Frontend :3000
    |
    v
API Gateway :8080
    |
    +-- Product Catalog :8081
    +-- Payment Service :8082
    +-- Delivery Service :8083
```

The frontend does not call Product Catalog, Payment, or Delivery directly.

When running with Docker, Nginx proxies `/api/*` to `api-gateway:8080`.
This keeps browser requests on the same origin and avoids a local CORS problem.

## Login demo

The login is only a simple frontend demo:

- Username: `admin`
- Password: `admin`

Using these values opens the Admin Product Catalog page.
Any other username and password opens the normal Customer page.

This is not real security. Real authentication should be checked by the API Gateway.

## Customer page

The customer page can:

- Show products
- Open the checkout form
- Send a checkout request
- Search delivery status with an Order ID

The frontend expects these Gateway routes:

```text
GET  /api/products
POST /api/checkout
GET  /api/deliveries/:orderId
```

The checkout request currently sends:

```json
{
  "product_id": "CPU-INT-14900K",
  "quantity": 1
}
```

The product SKU is used as the temporary `product_id`.

## Admin page

The admin page can:

- Add a product
- Edit a product
- Delete a product
- Update delivery status

The frontend expects these Gateway routes:

```text
GET    /api/products
POST   /api/admin/products
PUT    /api/admin/products/:sku
DELETE /api/admin/products/:sku
PATCH  /api/deliveries/:orderId/status
```

Allowed delivery statuses:

```text
PENDING
PROCESSING
SHIPPED
IN_TRANSIT
DELIVERED
CANCELLED
```

## Run with Docker

Build the image:

```powershell
cd frontend
docker build -t sds-frontend .
```

Run the container:

```powershell
docker run --rm -p 3000:3000 sds-frontend
```

If the API Gateway is also running in Docker, use the shared network:

```powershell
docker run --rm --network sds-network -p 3000:3000 sds-frontend
```

Open the website:

```text
http://localhost:3000
```

You can use another Gateway URL without rebuilding the image:

```text
http://localhost:3000/?api=http://localhost:8080
```

## Run without Docker

You can use any simple static server. For example:

```powershell
cd frontend
npx serve . -l 3000
```

## API Gateway setting

The default Gateway URL is:

```text
http://localhost:8080
```

This value is set in `src/app.js`:

```javascript
const API_BASE = window.FRONTEND_API_BASE || "http://localhost:8080";
```

If the Gateway uses another URL, change this value.

The URL can also be passed in the browser with the `api` query parameter.

## Waiting for the API Gateway

The frontend is ready for the Gateway routes, but the Gateway source code is not in the project yet.

Until the Gateway is running:

- The website can open normally
- The login screen works
- The UI can be checked
- Product and delivery API calls will show an error

The following details still need to be confirmed with the Gateway developer:

- Checkout response format
- The returned Order ID field name
- Delivery tracking response format
- Error response format
- Admin authentication
