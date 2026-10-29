const queryApiBase = new URLSearchParams(window.location.search).get("api");
const defaultApiBase = window.location.port === "3000"
  ? window.location.origin
  : `http://${window.location.hostname}:8080`;
const API_BASE = (queryApiBase || window.FRONTEND_API_BASE || defaultApiBase).replace(/\/$/, "");
let products = [];
let selectedProduct = null;
let adminProducts = [];

const $ = (id) => document.getElementById(id);

function showMessage(message, error = false) {
  const element = $("global-message");
  element.textContent = message;
  element.className = `message${error ? " error" : ""}`;
}

function money(value) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value || 0);
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function renderProducts() {
  $("product-count").textContent = `${products.length} items`;
  const container = $("products");
  if (!products.length) {
    container.innerHTML = '<div class="empty">No products available, or loading failed.</div>';
    return;
  }
  container.innerHTML = products.map((product, index) => {
    const unavailable = Number(product.stock) <= 0 || product.status === "Out of Stock";
    const image = product.image_url || "https://placehold.co/600x400/eef2ff/536dfe?text=Product";
    return `<article class="product-card">
      <img class="product-image" src="${image}" alt="${product.name || product.sku}" onerror="this.src='https://placehold.co/600x400/eef2ff/536dfe?text=Product'" />
      <div class="product-body">
        <span class="sku">${product.sku || "No SKU"}</span>
        <h3>${product.name || "Unnamed product"}</h3>
        <span class="muted">${product.brand || ""} ${product.category ? `· ${product.category}` : ""}</span>
        <div class="price">${money(product.price)}</div>
        <div class="stock ${unavailable ? "muted" : ""}">${unavailable ? "Out of stock" : `${product.stock} available`}</div>
        <button data-product-index="${index}" ${unavailable ? "disabled" : ""}>Order</button>
      </div>
    </article>`;
  }).join("");
  container.querySelectorAll("[data-product-index]").forEach((button) => {
    button.addEventListener("click", () => openCheckout(products[button.dataset.productIndex]));
  });
}

async function loadProducts() {
  $("products").innerHTML = '<div class="empty">Loading products...</div>';
  try {
    products = await request("/api/products");
    renderProducts();
  } catch (error) {
    products = [];
    renderProducts();
    showMessage(`Failed to load products: ${error.message}`, true);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function renderDelivery(delivery) {
  const result = $("tracking-result");
  const status = String(delivery.status || "PENDING").toUpperCase();
  const statuses = ["PENDING", "PROCESSING", "SHIPPED", "IN_TRANSIT", "DELIVERED"];
  const currentIndex = statuses.indexOf(status);
  const items = Array.isArray(delivery.items) ? delivery.items : [];

  const itemMarkup = items.length
    ? items.map((item) => {
        const product = products.find((entry) => entry.sku === item.sku) || {};
        const image = product.image_url || "https://placehold.co/120x120/eef2ff/536dfe?text=Item";
        return `<div class="delivery-item">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(item.name || item.sku)}" onerror="this.src='https://placehold.co/120x120/eef2ff/536dfe?text=Item'" />
          <div class="delivery-item-info"><strong>${escapeHtml(item.name || "Unnamed item")}</strong><span class="small muted">${escapeHtml(item.sku || "No SKU")}</span></div>
          <span class="delivery-quantity">× ${escapeHtml(item.quantity)}</span>
        </div>`;
      }).join("")
    : '<p class="muted">No items in this order.</p>';

  result.className = "result delivery-result";
  result.innerHTML = `<div class="delivery-summary">
    <div><span class="eyebrow">ORDER</span><h3>${escapeHtml(delivery.orderId || "Unknown order")}</h3></div>
    <span class="status-badge status-${status.toLowerCase()}">${escapeHtml(status.replaceAll("_", " "))}</span>
  </div>
  <div class="delivery-meta"><span>Created <strong>${escapeHtml(formatDate(delivery.createdAt))}</strong></span><span>Updated <strong>${escapeHtml(formatDate(delivery.updatedAt))}</strong></span></div>
  <div class="delivery-timeline">${statuses.map((step, index) => `<div class="timeline-step ${index <= currentIndex ? "active" : ""}"><span class="timeline-dot"></span><span>${step.replaceAll("_", " ")}</span></div>`).join("")}</div>
  <div class="delivery-items"><h4>Items</h4>${itemMarkup}</div>`;
}

function openCheckout(product) {
  selectedProduct = product;
  $("checkout-title").textContent = `Order ${product.name || product.sku}`;
  $("checkout-price").textContent = `${money(product.price)} · SKU: ${product.sku}`;
  $("checkout-result").textContent = "";
  $("checkout-modal").classList.remove("hidden");
}

async function checkout(event) {
  event.preventDefault();
  if (!selectedProduct) return;
  const quantity = Number($("checkout-quantity").value);
  const result = $("checkout-result");
  result.textContent = "Placing order...";
  try {
    // The assignment calls this field product_id; the catalog currently exposes SKU,
    // so SKU is used as the temporary product identifier.
    const body = { product_id: selectedProduct.sku, quantity };
    const response = await request("/api/checkout", { method: "POST", body: JSON.stringify(body) });
    const orderId = response.orderId || response.order_id || response.delivery?.orderId || "No Order ID returned";
    const deliveryStatus = response.delivery?.status || response.status || "PROCESSING";
    result.textContent = `Order placed successfully\nOrder ID: ${orderId}\nDelivery status: ${deliveryStatus}`;
    showMessage("Order placed successfully");
    await loadProducts();
  } catch (error) {
    result.textContent = `Order failed: ${error.message}`;
  }
}

async function trackDelivery(event) {
  event.preventDefault();
  const orderId = $("tracking-id").value.trim();
  const result = $("tracking-result");
  result.textContent = "Searching...";
  try {
    // Delivery Service uses orderId. The browser still talks to the Gateway only.
    const response = await request(`/api/delivery/${encodeURIComponent(orderId)}`);
    renderDelivery(response);
  } catch (error) {
    result.textContent = `Unable to search: ${error.message}\n(TODO: API Gateway delivery route is not available yet.)`.trim();
  }
}

function showCustomerApp() {
  $("auth-screen").classList.add("hidden");
  $("admin-app").classList.add("hidden");
  $("customer-app").classList.remove("hidden");
  loadProducts();
}

function showAdminApp() {
  $("auth-screen").classList.add("hidden");
  $("customer-app").classList.add("hidden");
  $("admin-app").classList.remove("hidden");
  loadAdminProducts();
}

function logout() {
  $("customer-app").classList.add("hidden");
  $("admin-app").classList.add("hidden");
  $("auth-screen").classList.remove("hidden");
  $("auth-form").reset();
}

function showAdminMessage(message, error = false) {
  const element = $("admin-message");
  element.textContent = message;
  element.className = `message${error ? " error" : ""}`;
}

function renderAdminProducts() {
  $("admin-product-count").textContent = `${adminProducts.length} items`;
  const container = $("admin-products");
  if (!adminProducts.length) {
    container.innerHTML = '<div class="empty">No catalog items found.</div>';
    return;
  }
  container.innerHTML = adminProducts.map((product) => `
    <div class="admin-product-row">
      <div><strong>${product.name || "Unnamed product"}</strong><br><span class="small muted">${product.sku || "No SKU"}</span></div>
      <span>${money(product.price)}</span>
      <span>${product.stock} in stock</span>
      <button class="secondary" data-edit-sku="${product.sku}">Edit</button>
      <button class="secondary" data-delete-sku="${product.sku}">Delete</button>
    </div>
  `).join("");
  container.querySelectorAll("[data-delete-sku]").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(button.dataset.deleteSku));
  });
  container.querySelectorAll("[data-edit-sku]").forEach((button) => {
    button.addEventListener("click", () => editProduct(button.dataset.editSku));
  });
}

async function loadAdminProducts() {
  $("admin-products").innerHTML = '<div class="empty">Loading catalog...</div>';
  try {
    adminProducts = await request("/api/products");
    renderAdminProducts();
  } catch (error) {
    adminProducts = [];
    renderAdminProducts();
    showAdminMessage(`Failed to load catalog: ${error.message}`, true);
  }
}

async function addProduct(event) {
  event.preventDefault();
  const product = {
    sku: $("product-sku").value.trim(),
    name: $("product-name").value.trim(),
    category: $("product-category").value.trim(),
    brand: $("product-brand").value.trim(),
    price: Number($("product-price").value),
    stock: Number($("product-stock").value),
    image_url: $("product-image").value.trim(),
    specs: $("product-specs").value.trim(),
    status: Number($("product-stock").value) > 0 ? "Active" : "Out of Stock",
  };
  try {
    const editingSku = $("product-edit-sku").value.trim();
    const path = editingSku
      ? `/api/admin/products/${encodeURIComponent(editingSku)}`
      : "/api/admin/products";
    const method = editingSku ? "PUT" : "POST";
    await request(path, { method, body: JSON.stringify(product) });
    $("product-form").reset();
    $("product-edit-sku").value = "";
    $("product-sku").disabled = false;
    $("product-submit").textContent = "Add Product";
    showAdminMessage(editingSku ? "Product updated successfully" : "Product added successfully");
    await loadAdminProducts();
  } catch (error) {
    showAdminMessage(`Failed to add product: ${error.message}`, true);
  }
}

function editProduct(sku) {
  const product = adminProducts.find((item) => item.sku === sku);
  if (!product) return;
  $("product-edit-sku").value = product.sku || "";
  $("product-sku").value = product.sku || "";
  $("product-sku").disabled = true;
  $("product-name").value = product.name || "";
  $("product-category").value = product.category || "";
  $("product-brand").value = product.brand || "";
  $("product-price").value = product.price ?? "";
  $("product-stock").value = product.stock ?? "";
  $("product-image").value = product.image_url || "";
  $("product-specs").value = product.specs || "";
  $("product-submit").textContent = "Update Product";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteProduct(sku) {
  if (!window.confirm(`Delete product ${sku}?`)) return;
  try {
    await request(`/api/admin/products/${encodeURIComponent(sku)}`, { method: "DELETE" });
    showAdminMessage("Product deleted successfully");
    await loadAdminProducts();
  } catch (error) {
    showAdminMessage(`Failed to delete product: ${error.message}`, true);
  }
}

async function updateDeliveryStatus(event) {
  event.preventDefault();
  const orderId = $("delivery-order-id").value.trim();
  const status = $("delivery-status").value;
  const result = $("delivery-status-result");
  result.textContent = "Updating delivery status...";
  try {
    const response = await request(`/api/delivery/${encodeURIComponent(orderId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    result.textContent = `Updated ${response.orderId || orderId} to ${response.status || status}`;
    showAdminMessage("Delivery status updated successfully");
  } catch (error) {
    result.textContent = `Unable to update delivery status: ${error.message}\n(TODO: API Gateway delivery route is not available yet.)`;
  }
}

$("auth-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const username = $("username").value;
  const password = $("password").value;
  if (username === "admin" && password === "admin") {
    showAdminApp();
  } else {
    showCustomerApp();
  }
});

$("customer-logout").addEventListener("click", logout);
$("admin-logout").addEventListener("click", logout);
$("product-form").addEventListener("submit", addProduct);
$("reload-admin-products").addEventListener("click", loadAdminProducts);
$("delivery-status-form").addEventListener("submit", updateDeliveryStatus);

$("reload-products").addEventListener("click", loadProducts);
$("checkout-form").addEventListener("submit", checkout);
$("tracking-form").addEventListener("submit", trackDelivery);
$("close-modal").addEventListener("click", () => $("checkout-modal").classList.add("hidden"));
$("checkout-modal").addEventListener("click", (event) => {
  if (event.target.id === "checkout-modal") $("checkout-modal").classList.add("hidden");
});
// The authentication screen is shown first. API calls begin after the user chooses a role.
