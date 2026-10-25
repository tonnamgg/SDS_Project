const API_BASE = window.FRONTEND_API_BASE || "http://localhost:8080";
let products = [];
let selectedProduct = null;

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
    const tracking = response.tracking_id || response.trackingId || response.tracking || "No Tracking ID returned";
    result.textContent = `Order placed successfully\nTracking ID: ${tracking}`;
    showMessage("Order placed successfully");
    await loadProducts();
  } catch (error) {
    result.textContent = `Order failed: ${error.message}`;
  }
}

async function trackDelivery(event) {
  event.preventDefault();
  const trackingId = $("tracking-id").value.trim();
  const result = $("tracking-result");
  result.textContent = "Searching...";
  try {
    // Endpoint is left configurable until the Delivery Service contract is defined.
    const response = await request(`/api/delivery/${encodeURIComponent(trackingId)}`);
    result.textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    result.textContent = `Unable to search: ${error.message}\n(TODO: Confirm the Delivery API endpoint)`.trim();
  }
}

$("reload-products").addEventListener("click", loadProducts);
$("checkout-form").addEventListener("submit", checkout);
$("tracking-form").addEventListener("submit", trackDelivery);
$("close-modal").addEventListener("click", () => $("checkout-modal").classList.add("hidden"));
$("checkout-modal").addEventListener("click", (event) => {
  if (event.target.id === "checkout-modal") $("checkout-modal").classList.add("hidden");
});
document.querySelectorAll("[data-todo]").forEach((button) => {
  button.addEventListener("click", () => showMessage(`${button.dataset.todo}: Admin API and permissions are still pending`));
});

loadProducts();
