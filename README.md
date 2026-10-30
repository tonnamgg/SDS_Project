# Microservices E-Commerce Shop

This project is a stateless microservices-based e-commerce application developed for the 2110415 Software-Defined Systems course. It is designed to run on a Kubernetes cluster built with Raspberry Pi nodes.

## What Does This Application Do?
The application is a mock e-commerce platform that allows users to view products, make purchases, and track delivery statuses. It also includes an admin interface for managing the product catalog and updating delivery statuses. To ensure the system remains completely stateless, we use Google Sheets as an external database.

Every client request is processed by at least 2 different containers to demonstrate inter-service communication and SDN principles.

### Architecture & Services
Our system consists of 5 independent container images:

| # | Service | Port | Tech | Responsibility |
|---|---|---|---|---|
| 1 | [Frontend](frontend/README.md) | 3000 | nginx + HTML/JS | Customer UI & Admin Dashboard. Its nginx also forwards `/api/*` to the API Gateway. |
| 2 | [API Gateway](api-gateway/README.md) | 8080 | nginx | Single entry point that routes requests to the internal services. |
| 3 | [Product Catalog](product-catalog/README.md) | 8081 | Go (Fiber) | Product CRUD backed by Google Sheets. |
| 4 | [Payment Mock](payment/README.md) | 8082 | Python | Calculates the order total from catalog prices, deducts the balance, updates stock and creates the delivery. |
| 5 | [Delivery Service](delivery-service/README.md) | 8083 | Node.js (Express) | Manages delivery records and statuses in Google Sheets. |

### Request Flow

```
Browser ──▶ Frontend (3000) ──▶ API Gateway (8080) ──┬──▶ Product Catalog (8081)
                                                     ├──▶ Payment (8082) ──┬──▶ Product Catalog
                                                     │                     └──▶ Delivery
                                                     └──▶ Delivery (8083)
```

- The browser only talks to the Frontend. The Frontend's nginx proxies `/api/*` to the API Gateway, so there are no CORS issues and the browser never needs internal service addresses.
- Internal services call each other by service name (e.g. `http://delivery-service:8083`), read from environment variables.

### Project Structure

```
SDS_Project/
├── .env.example          # Shared config template for docker compose
├── docker-compose.yml    # Runs all 5 services locally
├── frontend/
├── api-gateway/
├── product-catalog/
├── payment/
└── delivery-service/
```

---

## Configuration

Product Catalog and Delivery Service share one Google Spreadsheet (different tabs) and one service-account key.

1. **Google Sheets credentials:** place the service-account key at `credentials.json` in the project root. **Request the file from Tonnam.** Share the spreadsheet with the key's `client_email` as an Editor.
2. **Environment file:** copy `.env.example` to `.env` and fill it in:

   ```env
   GOOGLE_SHEETS_SPREADSHEET_ID=<the part of the sheet URL between /d/ and /edit>
   CATALOG_SHEET_TAB=Sheet1
   DELIVERY_SHEET_TAB=Deliveries
   ```

> [!IMPORTANT]
> `.env` and `credentials.json` are listed in `.gitignore`. Never commit them, and never copy `credentials.json` into a Docker image; it is mounted at runtime instead.

---

## How to Run Locally (Docker Compose)

Requires [Docker Desktop](https://docs.docker.com/get-docker/).

```bash
docker compose up --build
```

Then open **http://localhost:3000**.

| Service | Local URL |
|---|---|
| Frontend | http://localhost:3000 |
| API Gateway | http://localhost:8080/health |
| Product Catalog | http://localhost:8081/api/products |
| Payment | http://localhost:8082/api/payment/balance |
| Delivery | http://localhost:8083/health |

Useful commands:

```bash
docker compose up --build <service>   # Rebuild and restart one service after a code change
docker compose logs -f <service>      # Follow one service's logs
docker compose down                   # Stop everything
```

The payment balance starts at 0. Top it up before checking out:

```powershell
Invoke-RestMethod -Method Post http://localhost:8082/api/payment/balance `
  -ContentType "application/json" -Body '{"amount":100000}'
```

To run a single service without Docker, see that service's README (each has its own `.env.example`).

---

## How to Set Up the Kubernetes Cluster
1. **Prepare the Hardware:**
   - Flash Raspberry Pi OS (64-bit) onto 5 Raspberry Pi 3 B+ devices.
   - Connect all Raspberry Pi devices to the provided TP-Link TL-WR841N router via Ethernet cables.
   - Enable memory cgroups on each Pi (append `cgroup_memory=1 cgroup_enable=memory` to `/boot/firmware/cmdline.txt`, then reboot).
2. **Configure the Master Node:**
   - Set up an Ubuntu VM on a notebook to act as the Kubernetes Master Node. Use a **bridged** network adapter so the Pis can reach it.
   - Install `k3s` on the Master Node.
3. **Join Worker Nodes:**
   - SSH into each Raspberry Pi and run the K3s agent join command using the token from the Master Node.
   - Verify the cluster status by running `kubectl get nodes` on the Master.

The Raspberry Pis are worker nodes: Kubernetes decides which Pi runs each pod and pulls the image from Docker Hub automatically.

---

## How to Deploy the Application

1. Build and push multi-architecture images (the Pis are ARM):
   ```bash
   docker buildx build --platform linux/arm64 -t <dockerhub-user>/<service>:<tag> --push ./<service>
   ```
2. Clone this repository to your Master Node:
   ```bash
   git clone https://github.com/tonnamgg/SDS_Project.git
   cd SDS_Project
   ```
3. Create the secrets used by the manifests (from the same `credentials.json` and spreadsheet ID):
   ```bash
   kubectl create secret generic delivery-google-credentials --from-file=credentials.json=./credentials.json
   kubectl create secret generic delivery-service-config --from-literal=spreadsheet-id=<SPREADSHEET_ID>
   ```
4. Apply each service's manifests, backends first (nginx in the gateway and frontend fails to start if its upstream services do not exist yet):
   ```bash
   kubectl apply -f delivery-service/k8s/
   kubectl apply -f api-gateway/k8s/
   kubectl get pods -o wide
   ```

> [!NOTE]
> Kubernetes manifests currently exist for `delivery-service` and `api-gateway` only. Manifests for `product-catalog`, `payment` and `frontend` are still to be written.
