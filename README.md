# Microservices E-Commerce Shop

This project is a stateless microservices-based e-commerce application developed for the 2110415 Software-Defined Systems course. It is designed to run on a Kubernetes cluster built with Raspberry Pi nodes.

## What Does This Application Do?
The application is a mock e-commerce platform that allows users to view products, make purchases, and track delivery statuses. It also includes an admin interface for managing the product catalog and updating delivery statuses. To ensure the system remains completely stateless, we use Google Sheets as an external database.

Every client request is processed by at least 2 different containers to demonstrate inter-service communication and SDN principles.

### Architecture & Services
Our system consists of 5 independent container images:
1. **Frontend (Port 3000):** Customer UI & Admin Dashboard.
2. **API Gateway (Port 8080):** Central orchestrator routing requests to internal services.
3. **Product Catalog (Port 8081):** Manages product data via Google Sheets and triggers the checkout process.
4. **Payment Mock (Port 8082):** Simulates a payment gateway (Success/Fail logic).
5. **Delivery Service (Port 8083):** Manages shipping statuses and tracking IDs via Google Sheets.

---

## How to Set Up the Kubernetes Cluster
1. **Prepare the Hardware:**
   - Flash Raspbian OS onto 5 Raspberry Pi 3 B+ devices.
   - Connect all Raspberry Pi devices to the provided TP-Link TL-WR841N router via Ethernet cables.
2. **Configure the Master Node:**
   - Set up an Ubuntu VM on a notebook to act as the Kubernetes Master Node.
   - Install `k3s` on the Master Node.
3. **Join Worker Nodes:**
   - SSH into each Raspberry Pi and run the K3s agent join command using the token from the Master Node.
   - Verify the cluster status by running `kubectl get nodes` on the Master.

---

## How to Deploy the Application
We have prepared an automated deployment script that applies all necessary Kubernetes manifests (Deployments, Services, and Resource Limits).

1. Clone this repository to your Master Node:
   ```bash
   git clone https://github.com/tonnamgg/SDS_Project.git
   cd sds-microservices-shop