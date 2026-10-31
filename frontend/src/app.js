const queryApiBase = new URLSearchParams(window.location.search).get("api");
const defaultApiBase = window.location.port === "3000"
  ? window.location.origin
  : `http://${window.location.hostname}:8080`;
const API_BASE = (queryApiBase || window.FRONTEND_API_BASE || defaultApiBase).replace(/\/$/, "");
let products = [];
let adminProducts = [];
let adminDeliveries = [];
let cart = [];
let balance = 0;
let selectedProduct = null;
let selectedQuantity = 1;

const $ = (id) => document.getElementById(id);

function showMessage(message, error = false) {
  const element = $("global-message");
  element.textContent = message;
  element.className = `message${error ? " error" : ""}`;
}

function showToast(message, type = "success") {
  const container = $("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
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
  if (!response.ok) throw new Error(body.error || body.reason || `Request failed (${response.status})`);
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
        <button data-product-index="${index}" ${unavailable ? "disabled" : ""}>Add to Cart</button>
      </div>
    </article>`;
  }).join("");
  container.querySelectorAll("[data-product-index]").forEach((button) => {
    button.addEventListener("click", () => openQuantitySelector(products[button.dataset.productIndex]));
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

function openQuantitySelector(product) {
  selectedProduct = product;
  selectedQuantity = 1;
  $("quantity-product-title").textContent = product.name || product.sku;
  $("quantity-product-price").textContent = `${money(product.price)} · SKU: ${product.sku}`;
  $("quantity-stock").textContent = `${product.stock} available`;
  $("quantity-value").textContent = selectedQuantity;
  $("quantity-modal").classList.remove("hidden");
}

async function loadBalance() {
  try {
    const response = await request("/api/payment/balance");
    balance = Number(response.balance) || 0;
  } catch (error) {
    showMessage(`Failed to load balance: ${error.message}`, true);
  }
  renderWallet();
}

// Show the current balance and whether it covers the cart.
function renderWallet() {
  const total = cartTotal();
  const after = balance - total;
  $("nav-balance").textContent = money(balance);
  $("wallet-panel-balance").textContent = money(balance);
  $("wallet-balance").textContent = money(balance);
  $("wallet-after").textContent = money(after);
  $("wallet-after").classList.toggle("insufficient", after < 0);
  $("go-top-up").classList.toggle("hidden", after >= 0);
  $("confirm-cart").disabled = !cart.length || after < 0;
  $("confirm-cart").textContent = after < 0 ? "Insufficient balance" : `Pay ${money(total)}`;
}

async function topUp(amount) {
  if (!(amount > 0)) return;
  try {
    const response = await request("/api/payment/balance", { method: "POST", body: JSON.stringify({ amount }) });
    balance = Number(response.balance) || 0;
    $("top-up-form").reset();
    renderWallet();
    showToast(`Added ${money(amount)} · balance ${money(balance)}`);
  } catch (error) {
    showToast(`Top-up failed: ${error.message}`, "error");
  }
}

function addToCart(product, quantity = 1) {
  const existing = cart.find((item) => item.sku === product.sku);
  if (existing) {
    if (existing.quantity + quantity > Number(product.stock)) {
      showMessage("You cannot add more than the available stock", true);
      return;
    }
    existing.quantity += quantity;
  } else {
    cart.push({ ...product, quantity });
  }
  renderCart();
  showToast(`${product.name || product.sku} added to cart · ${cartQuantity()} item(s) in cart`);
}

function changeSelectedQuantity(amount) {
  if (!selectedProduct) return;
  selectedQuantity = Math.max(1, Math.min(Number(selectedProduct.stock), selectedQuantity + amount));
  $("quantity-value").textContent = selectedQuantity;
}

function confirmAddToCart() {
  if (!selectedProduct) return;
  addToCart(selectedProduct, selectedQuantity);
  $("quantity-modal").classList.add("hidden");
}

function cartQuantity() {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

function cartTotal() {
  return cart.reduce((total, item) => total + Number(item.price || 0) * item.quantity, 0);
}

function renderCart() {
  $("cart-count").textContent = cartQuantity();
  const container = $("cart-items");
  if (!cart.length) {
    container.innerHTML = '<div class="empty">Your cart is empty.</div>';
    $("cart-total-price").textContent = money(0);
    renderWallet();
    return;
  }
  container.innerHTML = cart.map((item, index) => {
    const image = item.image_url || "https://placehold.co/80x80/eef2ff/536dfe?text=Item";
    return `<div class="cart-item">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(item.name || item.sku)}" onerror="this.src='https://placehold.co/80x80/eef2ff/536dfe?text=Item'" />
      <div class="cart-item-info"><strong>${escapeHtml(item.name || "Unnamed product")}</strong><span class="small muted">${escapeHtml(item.sku)}</span><span>${money(item.price)} each</span></div>
      <div class="quantity-control"><button type="button" data-cart-minus="${index}">−</button><span>${item.quantity}</span><button type="button" data-cart-plus="${index}">+</button></div>
      <button class="remove-button" type="button" data-cart-remove="${index}">Remove</button>
    </div>`;
  }).join("");
  $("cart-total-price").textContent = money(cartTotal());
  renderWallet();
  container.querySelectorAll("[data-cart-minus]").forEach((button) => button.addEventListener("click", () => changeCartQuantity(Number(button.dataset.cartMinus), -1)));
  container.querySelectorAll("[data-cart-plus]").forEach((button) => button.addEventListener("click", () => changeCartQuantity(Number(button.dataset.cartPlus), 1)));
  container.querySelectorAll("[data-cart-remove]").forEach((button) => button.addEventListener("click", () => removeFromCart(Number(button.dataset.cartRemove))));
}

function changeCartQuantity(index, amount) {
  const item = cart[index];
  if (!item) return;
  const nextQuantity = item.quantity + amount;
  if (nextQuantity <= 0) return removeFromCart(index);
  if (nextQuantity > Number(item.stock)) {
    showMessage("You cannot add more than the available stock", true);
    return;
  }
  item.quantity = nextQuantity;
  renderCart();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

function openCart() {
  $("checkout-result").textContent = "";
  renderCart();
  $("checkout-modal").classList.remove("hidden");
  loadBalance();
}

const PAYMENT_ERRORS = {
  insufficient_funds: "Insufficient balance. Please top up and try again.",
  insufficient_stock: "Some items are no longer available. Please review your cart and try again.",
  product_not_found: "Some items no longer exist in the catalog. Please remove them from your cart.",
  order_id_already_exists: "This order was already placed. Your balance was refunded.",
  delivery_service_unavailable: "Could not create the delivery. Your balance was refunded.",
  product_catalog_unavailable: "The product catalog is unavailable. Please try again later.",
  product_catalog_update_failed: "Could not update stock. Your balance was refunded.",
};

async function checkout() {
  if (!cart.length) return;
  const result = $("checkout-result");
  const payButton = $("confirm-cart");
  result.textContent = "Processing payment...";
  payButton.disabled = true;
  try {
    const body = { items: cart.map((item) => ({ sku: item.sku, quantity: item.quantity })) };
    const response = await request("/api/payment", { method: "POST", body: JSON.stringify(body) });
    balance = Number(response.remaining_balance) || 0;
    const orderId = response.order_id || response.delivery?.orderId || "No Order ID returned";
    const deliveryStatus = response.delivery?.status || "PROCESSING";
    result.textContent = `Payment successful\nOrder ID: ${orderId}\nPaid: ${money(response.amount)}\nRemaining balance: ${money(balance)}\nDelivery status: ${deliveryStatus}`;
    showToast(`Paid ${money(response.amount)} · Order ${orderId}`);
    $("tracking-id").value = orderId;
    cart = [];
    renderCart();
    await loadProducts();
  } catch (error) {
    result.textContent = `Payment failed: ${PAYMENT_ERRORS[error.message] || error.message}`;
    showToast("Payment failed", "error");
    await Promise.all([loadBalance(), loadProducts()]);
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
  loadBalance();
}

function showAdminApp() {
  $("auth-screen").classList.add("hidden");
  $("customer-app").classList.add("hidden");
  $("admin-app").classList.remove("hidden");
  loadAdminProducts();
  loadAdminDeliveries();
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
      <img class="admin-product-thumb" src="${escapeHtml(product.image_url || "https://placehold.co/80x80/eef2ff/536dfe?text=Item")}" alt="${escapeHtml(product.name || product.sku)}" onerror="this.src='https://placehold.co/80x80/eef2ff/536dfe?text=Item'" />
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

const DELIVERY_STATUSES = ["PENDING", "PROCESSING", "SHIPPED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];

function renderAdminDeliveries() {
  const search = $("delivery-search").value.trim().toLowerCase();
  const filter = $("delivery-filter").value;
  const visible = adminDeliveries.filter((delivery) => {
    if (filter && delivery.status !== filter) return false;
    if (!search) return true;
    return delivery.orderId.toLowerCase().includes(search)
      || (delivery.items || []).some((item) => String(item.sku || "").toLowerCase().includes(search));
  });
  $("admin-delivery-count").textContent = `${visible.length} of ${adminDeliveries.length} orders`;
  const container = $("admin-deliveries");
  if (!visible.length) {
    container.innerHTML = '<div class="empty">No deliveries found.</div>';
    return;
  }
  container.innerHTML = visible.map((delivery) => {
    const status = String(delivery.status || "PENDING").toUpperCase();
    const items = (delivery.items || []).length
      ? delivery.items.map((item) => `<span>${escapeHtml(item.name || item.sku)} <span class="muted">(${escapeHtml(item.sku)})</span> × ${escapeHtml(item.quantity)}</span>`).join("")
      : '<span class="muted">No items</span>';
    return `<div class="admin-delivery-row">
      <div class="delivery-id">
        <strong>${escapeHtml(delivery.orderId)}</strong>
        <span class="status-badge status-${status.toLowerCase()}">${escapeHtml(status.replaceAll("_", " "))}</span>
        <span class="small muted">Updated ${escapeHtml(formatDate(delivery.updatedAt))}</span>
      </div>
      <div class="delivery-items-list">${items}</div>
      <select data-delivery-status="${escapeHtml(delivery.orderId)}" aria-label="Status for ${escapeHtml(delivery.orderId)}">
        ${DELIVERY_STATUSES.map((option) => `<option value="${option}" ${option === status ? "selected" : ""}>${option}</option>`).join("")}
      </select>
      <button type="button" data-save-delivery="${escapeHtml(delivery.orderId)}">Save</button>
    </div>`;
  }).join("");
  container.querySelectorAll("[data-save-delivery]").forEach((button) => {
    button.addEventListener("click", () => {
      const orderId = button.dataset.saveDelivery;
      const select = [...container.querySelectorAll("[data-delivery-status]")].find((element) => element.dataset.deliveryStatus === orderId);
      updateDeliveryStatus(orderId, select.value, button);
    });
  });
}

async function loadAdminDeliveries() {
  $("admin-deliveries").innerHTML = '<div class="empty">Loading deliveries...</div>';
  try {
    const deliveries = await request("/api/delivery");
    // Newest orders first.
    adminDeliveries = deliveries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } catch (error) {
    adminDeliveries = [];
    showAdminMessage(`Failed to load deliveries: ${error.message}`, true);
  }
  renderAdminDeliveries();
}

async function updateDeliveryStatus(orderId, status, button) {
  const delivery = adminDeliveries.find((entry) => entry.orderId === orderId);
  if (delivery && delivery.status === status) {
    showToast(`${orderId} is already ${status}`, "error");
    return;
  }
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const response = await request(`/api/delivery/${encodeURIComponent(orderId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (delivery) Object.assign(delivery, response);
    showToast(`Updated ${orderId} to ${response.status || status}`);
  } catch (error) {
    showToast(`Failed to update ${orderId}: ${error.message}`, "error");
  }
  renderAdminDeliveries();
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
$("reload-deliveries").addEventListener("click", loadAdminDeliveries);
$("delivery-search").addEventListener("input", renderAdminDeliveries);
$("delivery-filter").addEventListener("change", renderAdminDeliveries);

$("reload-products").addEventListener("click", loadProducts);
$("open-cart").addEventListener("click", openCart);
$("confirm-cart").addEventListener("click", checkout);
$("top-up-form").addEventListener("submit", (event) => {
  event.preventDefault();
  topUp(Number($("top-up-amount").value));
});
document.querySelectorAll("[data-top-up]").forEach((button) => {
  button.addEventListener("click", () => topUp(Number(button.dataset.topUp)));
});
$("go-top-up").addEventListener("click", () => $("checkout-modal").classList.add("hidden"));
$("quantity-minus").addEventListener("click", () => changeSelectedQuantity(-1));
$("quantity-plus").addEventListener("click", () => changeSelectedQuantity(1));
$("confirm-add-cart").addEventListener("click", confirmAddToCart);
$("tracking-form").addEventListener("submit", trackDelivery);
$("close-modal").addEventListener("click", () => $("checkout-modal").classList.add("hidden"));
$("close-quantity-modal").addEventListener("click", () => $("quantity-modal").classList.add("hidden"));
$("checkout-modal").addEventListener("click", (event) => {
  if (event.target.id === "checkout-modal") $("checkout-modal").classList.add("hidden");
});
$("quantity-modal").addEventListener("click", (event) => {
  if (event.target.id === "quantity-modal") $("quantity-modal").classList.add("hidden");
});
// The authentication screen is shown first. API calls begin after the user chooses a role.
