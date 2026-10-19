# Payment Mock Service

The payment mock runs on port `8082` and exposes `POST /pay`. It uses only
Python's standard library, so no package installation is required.

## Run

```powershell
python payment_service.py
```

The host and port can be overridden with `PAYMENT_HOST` and `PAYMENT_PORT`.

Then run this in new terminal (if you want to do it in terminal).

```
curl.exe -X POST http://localhost:8082/pay `
  -H "Content-Type: application/json" `
  -d '{\"amount\":amount}'
```

where amount must not be negative.

## API

Request:

```http
POST /pay
Content-Type: application/json

{"amount": 125.50}
```

There is an 80% chance of a successful payment:

```json
{
	"status": "success",
	"transaction_id": "txn_abc123...",
	"amount": 125.5
}
```

Otherwise the service returns HTTP `402`:

```json
{
	"status": "failed",
	"reason": "insufficient_funds",
	"transaction_id": "txn_abc123...",
	"amount": 125.5
}
```

Invalid or non-positive amounts return HTTP `400`.

## Test

```powershell
python -m unittest -v
```
