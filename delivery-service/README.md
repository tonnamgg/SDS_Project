# Delivery Service

Node.js + Express microservice for the Microservices E-Commerce Shop project. It stores delivery records in Google Sheets and listens on port 8083.

## 1. Google Sheets setup

1. Create a Google spreadsheet.
2. Add a tab named `Deliveries`.
3. Put these column headers in row 1:

   `order_id | tracking_id | status | created_at | updated_at`

4. In Google Cloud Console, enable the Google Sheets API and create a service account key in JSON format.
5. Share the spreadsheet with the service account's `client_email` as an Editor.
6. Keep the JSON key private. Do not commit it to Git.
7. Copy the spreadsheet ID from its URL. It is the segment between `/d/` and `/edit`.

## 2. Run locally (PowerShell)

Install Node.js 20 or newer, then from this directory:

```powershell
npm install
$env:PORT="8083"
$env:GOOGLE_SHEETS_SPREADSHEET_ID="YOUR_SPREADSHEET_ID"
$env:GOOGLE_SHEETS_TAB_NAME="Deliveries"
$env:GOOGLE_APPLICATION_CREDENTIALS="$PWD\credentials.json"
npm start
```

Place your service-account JSON file at `credentials.json` in this directory. It is ignored by `.gitignore`.

Check health:

```powershell
Invoke-RestMethod http://localhost:8083/health
```

## 3. API examples

Create a delivery (your checkout workflow should call this only after payment succeeds):

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8083/deliveries `
  -ContentType "application/json" -Body '{"orderId":"ORD-1001"}'
```

Get a delivery by order ID:

```powershell
Invoke-RestMethod http://localhost:8083/deliveries/ORD-1001
```

Track by tracking ID:

```powershell
Invoke-RestMethod http://localhost:8083/deliveries/tracking/TRK-XXXXXXXX
```

List deliveries:

```powershell
Invoke-RestMethod http://localhost:8083/deliveries
```

Update status:

```powershell
Invoke-RestMethod -Method Patch -Uri http://localhost:8083/deliveries/ORD-1001/status `
  -ContentType "application/json" -Body '{"status":"SHIPPED"}'
```

Allowed statuses: `PENDING`, `PROCESSING`, `SHIPPED`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`.

## 4. Docker

Build and run:

```powershell
docker build -t YOUR_DOCKERHUB_USERNAME/delivery-service:1.0.0 .
docker run --rm -p 8083:8083 `
  -e PORT=8083 `
  -e GOOGLE_SHEETS_SPREADSHEET_ID="YOUR_SPREADSHEET_ID" `
  -e GOOGLE_SHEETS_TAB_NAME="Deliveries" `
  -e GOOGLE_APPLICATION_CREDENTIALS="/var/secrets/google/credentials.json" `
  -v "${PWD}\credentials.json:/var/secrets/google/credentials.json:ro" `
  YOUR_DOCKERHUB_USERNAME/delivery-service:1.0.0
```

## 5. Kubernetes

Create the spreadsheet ID secret:

```powershell
kubectl create secret generic delivery-service-config `
  --from-literal=spreadsheet-id="YOUR_SPREADSHEET_ID"
```

Create a secret from your local JSON key:

```powershell
kubectl create secret generic delivery-google-credentials `
  --from-file=credentials.json=.\credentials.json
```

Edit `k8s/delivery-service.yaml` and replace `YOUR_DOCKERHUB_USERNAME` with your Docker Hub username. Build and push the image:

```powershell
docker build -t YOUR_DOCKERHUB_USERNAME/delivery-service:1.0.0 .
docker push YOUR_DOCKERHUB_USERNAME/delivery-service:1.0.0
kubectl apply -f k8s/delivery-service.yaml
kubectl get pods
kubectl get svc delivery-service
```

Other pods in the same Kubernetes namespace can call:

`http://delivery-service:8083`

To test locally through port-forwarding:

```powershell
kubectl port-forward svc/delivery-service 8083:8083
```

Then call `http://localhost:8083/health`.

## Notes and limitations

- This is a standalone implementation based on the README's stated requirements; the existing API Gateway and checkout code were not provided, so integration call sites may need adapting.
- The create endpoint performs a duplicate check but Google Sheets is not transactional; simultaneous requests for the same order can still create duplicates. A production service should use a database with a unique constraint or add an idempotency mechanism.
- This service does not independently verify payment. The checkout caller must only request delivery creation after payment succeeds, and the API should be restricted to trusted internal callers.
- For an actual public deployment, add authentication/authorization and stricter delivery-status transition rules.
