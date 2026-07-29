const API_URL = "https://sql-based-inventory-warehouse.onrender.com";

// ---------- Toasts ----------
function toast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ---------- API helpers ----------
async function apiGet(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `POST ${path} failed`);
  return data;
}
async function apiPut(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `PUT ${path} failed`);
  return data;
}
async function apiDelete(path) {
  const res = await fetch(`${API_URL}${path}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `DELETE ${path} failed`);
  return data;
}

// ---------- Currency (INR) ----------
const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
function formatINR(value) {
  return inrFormatter.format(Number(value) || 0);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Caches (used to populate dropdowns + show names instead of raw IDs) ----------
let productsCache = [];
let suppliersCache = [];

function populateProductSelects() {
  const selects = [
    document.getElementById("purchase-product-select"),
    document.getElementById("sale-product-select"),
  ];
  selects.forEach(sel => {
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = `<option value="" disabled ${!current ? "selected" : ""}>Select product…</option>` +
      productsCache.map(p => `<option value="${p.product_id}">#${p.product_id} — ${escapeHtml(p.name)} (${p.quantity} in stock)</option>`).join("");
    if (current) sel.value = current;
  });
}

function populateSupplierSelects() {
  const sel = document.getElementById("purchase-supplier-select");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="" disabled ${!current ? "selected" : ""}>Select supplier…</option>` +
    suppliersCache.map(s => `<option value="${s.supplier_id}">#${s.supplier_id} — ${escapeHtml(s.name)}</option>`).join("");
  if (current) sel.value = current;
}

function productName(id) {
  const p = productsCache.find(p => p.product_id === Number(id));
  return p ? p.name : `#${id}`;
}

function supplierName(id) {
  const s = suppliersCache.find(s => s.supplier_id === Number(id));
  return s ? s.name : `#${id}`;
}

// ---------- Sidebar navigation (SPA-style view switching) ----------
const views = ["dashboard", "products", "suppliers", "purchases", "sales", "stock", "reports"];
const titles = {
  dashboard: "Dashboard", products: "Products", suppliers: "Suppliers",
  purchases: "Purchases", sales: "Sales", stock: "Stock Alerts", reports: "Reports",
};

function showView(view) {
  views.forEach(v => document.getElementById(`view-${v}`).classList.toggle("hidden", v !== view));
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.getElementById("page-title").textContent = titles[view];
  closeSidebarOnMobile();
  loadDataForView(view);
}

document.querySelectorAll(".nav-link").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function loadDataForView(view) {
  if (view === "dashboard") loadDashboard();
  if (view === "products") loadProducts();
  if (view === "suppliers") loadSuppliers();
  if (view === "purchases") loadPurchasesView();
  if (view === "sales") loadSalesView();
  if (view === "stock") loadAlerts();
  if (view === "reports") loadReports();
}

async function loadPurchasesView() {
  await Promise.all([loadProducts(true), loadSuppliers(true)]);
  loadPurchases();
}

async function loadSalesView() {
  await loadProducts(true);
  loadSales();
}

// ---------- Mobile sidebar ----------
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
document.getElementById("menu-toggle").addEventListener("click", () => {
  sidebar.classList.add("open");
  overlay.classList.remove("hidden");
});
overlay.addEventListener("click", closeSidebarOnMobile);
function closeSidebarOnMobile() {
  sidebar.classList.remove("open");
  overlay.classList.add("hidden");
}

// ---------- Dashboard ----------
let salesChart, topChart, reportCompareChart, reportRevenueChart;

async function loadDashboard() {
  try {
    const s = await apiGet("/reports/summary");
    document.getElementById("stat-products").textContent = s.total_products;
    document.getElementById("stat-suppliers").textContent = s.total_suppliers;
    document.getElementById("stat-lowstock").textContent = s.low_stock_count;
    document.getElementById("stat-sales30").textContent = formatINR(s.sales_last_30_days);
    document.getElementById("topbar-value").textContent = formatINR(s.total_inventory_value);
    updateAlertBadge(s.low_stock_count);

    const sales = await apiGet("/reports/sales-timeseries?days=30");
    toggleEmptyState("chart-sales", "chart-sales-empty", sales.length === 0);
    if (sales.length > 0) {
      renderLineChart("chart-sales", salesChart, sales.map(d => d.day), [
        { label: "Units sold", data: sales.map(d => d.units), color: "#6C63FF" },
      ], c => salesChart = c);
    }

    const top = await apiGet("/reports/top-products?limit=5");
    toggleEmptyState("chart-top", "chart-top-empty", top.length === 0);
    if (top.length > 0) {
      renderBarChart("chart-top", topChart, top.map(t => t.name), top.map(t => t.total_sold), c => topChart = c);
    }
  } catch (err) {
    toast(`Dashboard load failed: ${err.message}`, "error");
  }
}

function toggleEmptyState(canvasId, emptyId, isEmpty) {
  document.getElementById(canvasId).classList.toggle("hidden", isEmpty);
  document.getElementById(emptyId).classList.toggle("hidden", !isEmpty);
}

function updateAlertBadge(count) {
  const badge = document.getElementById("alert-badge");
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function renderLineChart(canvasId, existing, labels, datasets, setter) {
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label, data: d.data, borderColor: d.color,
        backgroundColor: d.color + "22", tension: 0.35, fill: true, pointRadius: 2,
      })),
    },
    options: { responsive: true, plugins: { legend: { display: datasets.length > 1 } } },
  });
  setter(chart);
}

function renderBarChart(canvasId, existing, labels, data, setter) {
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  const chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Units sold", data, backgroundColor: "#6C63FF" }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
  setter(chart);
}

// ---------- Products ----------
async function loadProducts(silent = false) {
  try {
    const products = await apiGet("/products/");
    productsCache = products;
    populateProductSelects();

    const tbody = document.getElementById("products-tbody");
    let sumValue = 0;
    tbody.innerHTML = products.map(p => {
      const isLow = p.quantity <= p.reorder_level;
      const isOut = p.quantity === 0;
      const totalValue = p.quantity * p.price;
      sumValue += totalValue;
      const pillClass = isOut ? "status-out" : isLow ? "status-low" : "status-ok";
      const pillText = isOut ? "Out of stock" : isLow ? "Low" : "OK";
      return `
        <tr>
          <td>${p.product_id}</td>
          <td>${escapeHtml(p.name)}</td>
          <td class="font-mono text-xs">${escapeHtml(p.sku || "—")}</td>
          <td>${p.quantity}</td>
          <td>${p.reorder_level}</td>
          <td>${formatINR(p.price)}</td>
          <td class="font-semibold">${formatINR(totalValue)}</td>
          <td><span class="status-pill ${pillClass}">${pillText}</span></td>
          <td><button class="btn-danger" onclick="deleteProduct(${p.product_id})">Delete</button></td>
        </tr>`;
    }).join("") || `<tr><td colspan="9" class="text-mute text-sm py-3">No products yet.</td></tr>`;

    document.getElementById("products-total-value").textContent = formatINR(sumValue);
  } catch (err) {
    if (!silent) toast(`Failed to load products: ${err.message}`, "error");
  }
}

async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  try {
    await apiDelete(`/products/${id}`);
    toast("Product deleted");
    loadProducts();
  } catch (err) {
    toast(err.message, "error");
  }
}

document.getElementById("product-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    await apiPost("/products/", {
      name: form.name.value,
      sku: form.sku.value,
      quantity: Number(form.quantity.value),
      reorder_level: Number(form.reorder_level.value),
      price: Number(form.price.value),
    });
    form.reset();
    toast("Product added");
    loadProducts();
  } catch (err) {
    toast(`Could not add product: ${err.message}`, "error");
  }
});

// ---------- Suppliers ----------
async function loadSuppliers(silent = false) {
  try {
    const suppliers = await apiGet("/suppliers/");
    suppliersCache = suppliers;
    populateSupplierSelects();

    const tbody = document.getElementById("suppliers-tbody");
    tbody.innerHTML = suppliers.map(s => `
      <tr>
        <td>${s.supplier_id}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.contact || "—")}</td>
        <td>${escapeHtml(s.email || "—")}</td>
        <td>${escapeHtml(s.address || "—")}</td>
        <td><button class="btn-danger" onclick="deleteSupplier(${s.supplier_id})">Delete</button></td>
      </tr>`).join("") || `<tr><td colspan="6" class="text-mute text-sm py-3">No suppliers yet.</td></tr>`;
  } catch (err) {
    if (!silent) toast(`Failed to load suppliers: ${err.message}`, "error");
  }
}

async function deleteSupplier(id) {
  if (!confirm("Delete this supplier?")) return;
  try {
    await apiDelete(`/suppliers/${id}`);
    toast("Supplier deleted");
    loadSuppliers();
  } catch (err) {
    toast(err.message, "error");
  }
}

document.getElementById("supplier-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    await apiPost("/suppliers/", {
      name: form.name.value,
      contact: form.contact.value,
      email: form.email.value,
      address: form.address.value,
    });
    form.reset();
    toast("Supplier added");
    loadSuppliers();
  } catch (err) {
    toast(`Could not add supplier: ${err.message}`, "error");
  }
});

// ---------- Purchases ----------
async function loadPurchases() {
  try {
    const purchases = await apiGet("/purchases/");
    const tbody = document.getElementById("purchases-tbody");
    tbody.innerHTML = purchases.map(p => `
      <tr>
        <td>${p.purchase_id}</td>
        <td>${escapeHtml(productName(p.product_id))}</td>
        <td>${escapeHtml(supplierName(p.supplier_id))}</td>
        <td>${p.quantity_purchased}</td>
        <td>${formatINR(p.unit_cost)}</td>
        <td class="font-semibold">${formatINR(p.quantity_purchased * p.unit_cost)}</td>
        <td class="font-mono text-xs">${new Date(p.purchase_date).toLocaleString()}</td>
      </tr>`).join("") || `<tr><td colspan="7" class="text-mute text-sm py-3">No purchases yet.</td></tr>`;
  } catch (err) {
    toast(`Failed to load purchases: ${err.message}`, "error");
  }
}

document.getElementById("purchase-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById("purchase-msg");
  try {
    await apiPost("/purchases/", {
      product_id: Number(form.product_id.value),
      supplier_id: Number(form.supplier_id.value),
      quantity_purchased: Number(form.quantity_purchased.value),
      unit_cost: Number(form.unit_cost.value),
    });
    msg.textContent = "✔ Purchase recorded";
    msg.className = "msg text-green-600";
    form.reset();
    toast("Purchase recorded");
    loadPurchases();
    loadProducts(true);
  } catch (err) {
    msg.textContent = `✘ ${err.message}`;
    msg.className = "msg text-red-600";
    toast(err.message, "error");
  }
});

// ---------- Sales ----------
async function loadSales() {
  try {
    const sales = await apiGet("/sales/");
    const tbody = document.getElementById("sales-tbody");
    tbody.innerHTML = sales.map(s => `
      <tr>
        <td>${s.sale_id}</td>
        <td>${escapeHtml(productName(s.product_id))}</td>
        <td>${escapeHtml(s.customer_name || "—")}</td>
        <td>${s.quantity_sold}</td>
        <td>${formatINR(s.unit_price)}</td>
        <td class="font-semibold">${formatINR(s.quantity_sold * s.unit_price)}</td>
        <td class="font-mono text-xs">${new Date(s.sale_date).toLocaleString()}</td>
      </tr>`).join("") || `<tr><td colspan="7" class="text-mute text-sm py-3">No sales yet.</td></tr>`;
  } catch (err) {
    toast(`Failed to load sales: ${err.message}`, "error");
  }
}

document.getElementById("sale-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById("sale-msg");
  try {
    await apiPost("/sales/", {
      product_id: Number(form.product_id.value),
      customer_name: form.customer_name.value,
      quantity_sold: Number(form.quantity_sold.value),
    });
    msg.textContent = "✔ Sale recorded";
    msg.className = "msg text-green-600";
    form.reset();
    toast("Sale recorded");
    loadSales();
    loadProducts(true);
  } catch (err) {
    msg.textContent = `✘ ${err.message}`;
    msg.className = "msg text-red-600";
    toast(err.message, "error");
  }
});

// ---------- Stock alerts ----------
async function loadAlerts() {
  try {
    const alerts = await apiGet("/stock/alerts");
    const unresolved = alerts.filter(a => !a.resolved);
    const container = document.getElementById("alerts-list");
    updateAlertBadge(unresolved.length);
    container.innerHTML = unresolved.map(a => {
      const isOut = a.severity === "OUT_OF_STOCK";
      return `
      <div class="card flex items-center justify-between py-3 ${isOut ? "border-red-300" : "border-amber-300"}">
        <div class="flex items-center gap-3">
          <span class="status-pill ${isOut ? "status-out" : "status-low"}">${isOut ? "Out of stock" : "Low stock"}</span>
          <p class="text-sm font-mono ${isOut ? "text-red-600" : "text-amber-500"}">${escapeHtml(a.alert_message)}</p>
        </div>
        <button onclick="resolveAlert(${a.alert_id})" class="btn-outline">Resolve</button>
      </div>`;
    }).join("") || `<p class="text-mute text-sm">No active alerts. Stock levels look fine.</p>`;
  } catch (err) {
    toast(`Failed to load alerts: ${err.message}`, "error");
  }
}

async function resolveAlert(id) {
  try {
    await apiPost(`/stock/alerts/${id}/resolve`, {});
    toast("Alert resolved");
    loadAlerts();
  } catch (err) {
    toast(err.message, "error");
  }
}

document.getElementById("btn-generate-report").addEventListener("click", async () => {
  try {
    await apiPost("/stock/generate-report", {});
    toast("Report generated via cursor procedure");
    loadAlerts();
  } catch (err) {
    toast(err.message, "error");
  }
});

// ---------- Reports ----------
async function loadReports() {
  try {
    const [sales, purchases, top] = await Promise.all([
      apiGet("/reports/sales-timeseries?days=30"),
      apiGet("/reports/purchases-timeseries?days=30"),
      apiGet("/reports/top-products?limit=8"),
    ]);

    const days = [...new Set([...sales.map(s => s.day), ...purchases.map(p => p.day)])].sort();
    const salesByDay = Object.fromEntries(sales.map(s => [s.day, s]));
    const purchByDay = Object.fromEntries(purchases.map(p => [p.day, p]));

    toggleEmptyState("chart-report-compare", "chart-compare-empty", days.length === 0);
    if (days.length > 0) {
      if (reportCompareChart) reportCompareChart.destroy();
      reportCompareChart = new Chart(document.getElementById("chart-report-compare").getContext("2d"), {
        type: "bar",
        data: {
          labels: days,
          datasets: [
            { label: "Units Sold", data: days.map(d => salesByDay[d]?.units || 0), backgroundColor: "#6C63FF" },
            { label: "Units Purchased", data: days.map(d => purchByDay[d]?.units || 0), backgroundColor: "#FF8A3D" },
          ],
        },
        options: { responsive: true },
      });
    }

    toggleEmptyState("chart-report-revenue", "chart-revenue-empty", sales.length === 0);
    if (sales.length > 0) {
      if (reportRevenueChart) reportRevenueChart.destroy();
      reportRevenueChart = new Chart(document.getElementById("chart-report-revenue").getContext("2d"), {
        type: "line",
        data: {
          labels: sales.map(s => s.day),
          datasets: [{ label: "Revenue", data: sales.map(s => s.revenue), borderColor: "#6C63FF", backgroundColor: "#6C63FF22", fill: true, tension: 0.35 }],
        },
        options: { responsive: true },
      });
    }

    document.getElementById("topproducts-tbody").innerHTML = top.map(t => `
      <tr><td>${t.product_id}</td><td>${escapeHtml(t.name)}</td><td>${t.total_sold}</td></tr>
    `).join("") || `<tr><td colspan="3" class="text-mute text-sm py-3">No sales recorded yet.</td></tr>`;
  } catch (err) {
    toast(`Failed to load reports: ${err.message}`, "error");
  }
  
}

// ---------- Init ----------
showView("dashboard");



const toggle = document.getElementById("themeToggle");

toggle.addEventListener("click",()=>{

    document.body.classList.toggle("light");

    if(document.body.classList.contains("light")){
        localStorage.setItem("theme","light");
    }else{
        localStorage.setItem("theme","dark");
    }

});




