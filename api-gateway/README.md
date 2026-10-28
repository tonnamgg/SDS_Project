# 🌐 API Gateway (Nginx Reverse Proxy)

The **API Gateway** acts as the single entrypoint for the e-commerce microservices cluster deployed on Raspberry Pi nodes. It orchestrates incoming traffic from the frontend and routes requests to the appropriate backend microservices while managing CORS and request headers.

---

## 🏛️ Architecture & Routing

The API Gateway listens on port `8080` (exposed via NodePort `30080` in Kubernetes) and reverse-proxies requests as follows:

| Endpoint Path | Target Service | Backend URL | Purpose |
| :--- | :--- | :--- | :--- |
| `GET /health` | *Internal (Nginx)* | `200 OK` | Health check for Kubernetes liveness & readiness probes |
| `GET /api/products` | **Product Catalog** | `http://product-catalog:8081` | Fetch all products from Google Sheets |
| `/api/admin/products` | **Product Catalog** | `http://product-catalog:8081` | Admin CRUD operations (POST, PUT, DELETE) |
| `POST /api/checkout` | **Product Catalog** | `http://product-catalog:8081` | Trigger checkout and initiate payment process |
| `/api/delivery` | **Delivery Service** | `http://delivery-service:8083` | Track deliveries and update shipping status (rewrites to `/deliveries`) |

### Key Features
- **Stateless Orchestration:** Does not hold any application state or business logic.
- **Path Rewriting:** Transparently rewrites incoming `/api/delivery/*` paths into `/deliveries/*` before forwarding to the Delivery Service.
- **CORS Handling:** Automatically injects CORS headers and handles preflight `OPTIONS` requests (HTTP 204) for all API endpoints, allowing the Frontend (Port 3000) to communicate without cross-origin blocks.
- **ARM / Raspberry Pi Ready:** Lightweight footprint powered by `nginx:alpine` (CPU request: 50m, Memory request: 32Mi).

---

## 🚀 Local Development & Testing

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed locally.

### 1. Build Docker Image
```bash
docker build -t api-gateway:local .
```

> [!NOTE]
> When building for Raspberry Pi (ARM architecture), use Docker Buildx:
> ```bash
> docker buildx build --platform linux/arm64,linux/amd64 -t <dockerhub-username>/api-gateway:1.0 --push .
> ```

### 2. Run Locally
```bash
docker run -d --name api-gateway -p 8080:8080 api-gateway:local
```

### 3. Verify Health
```bash
curl http://localhost:8080/health
# Output: OK
```

---

## ☸️ Kubernetes Deployment

The gateway can be deployed to the Kubernetes cluster using the provided manifests:

```bash
# 1. Apply Deployment (2 Replicas, resource limits, readiness/liveness probes)
kubectl apply -f api-gateway-deployment.yaml

# 2. Apply NodePort Service (NodePort: 30080)
kubectl apply -f api-gateway-service.yaml

# 3. Check status
kubectl get pods -l app=api-gateway
kubectl get svc api-gateway
```

---

## 📁 File Structure

```
api-gateway/
├── Dockerfile                      # Nginx Alpine image build definition
├── nginx.conf                      # Reverse proxy & CORS configuration
├── api-gateway-deployment.yaml     # Kubernetes Deployment manifest
├── api-gateway-service.yaml        # Kubernetes NodePort Service manifest
└── README.md                       # Service documentation
```
