// admin.js - Operations Management Dashboard Controller for The Food Lab (TFL)

// Global State
let currentTab = 'dashboard';
let currentOrderFilter = 'all';
let loggedInUser = null;
let currentKpiFilter = 'today';
let knownOrderIds = new Set();
let adminRefreshTimer = null;

// Initialize Admin Portal
document.addEventListener("DOMContentLoaded", () => {
  TFL_DB.initTheme();
  knownOrderIds = new Set(TFL_DB.getOrders().map(order => order.id));
  document.addEventListener("tfl_db_updated", handleDbUpdated);
  checkSession();
  
  // Connect input color pickers with text inputs for Customization
  const primaryColorPicker = document.getElementById("cust-primary-color");
  const primaryColorText = document.getElementById("cust-primary-color-text");
  const bgColorPicker = document.getElementById("cust-bg-color");
  const bgColorText = document.getElementById("cust-bg-color-text");
  
  if (primaryColorPicker && primaryColorText) {
    primaryColorPicker.addEventListener("input", (e) => primaryColorText.value = e.target.value);
    primaryColorText.addEventListener("input", (e) => {
      if (/^#[0-9A-F]{6}$/i.test(e.target.value)) primaryColorPicker.value = e.target.value;
    });
  }
  if (bgColorPicker && bgColorText) {
    bgColorPicker.addEventListener("input", (e) => bgColorText.value = e.target.value);
    bgColorText.addEventListener("input", (e) => {
      if (/^#[0-9A-F]{6}$/i.test(e.target.value)) bgColorPicker.value = e.target.value;
    });
  }
});

// Check Session & Auth Status
function checkSession() {
  const session = sessionStorage.getItem("tfl_admin_session");
  const loginOverlay = document.getElementById("login-overlay");
  const dashboardContainer = document.getElementById("admin-dashboard-container");
  
  if (session) {
    loggedInUser = JSON.parse(session);
    loginOverlay.style.display = "none";
    dashboardContainer.style.display = "flex";
    
    // Set Profile UI
    document.getElementById("admin-avatar").innerText = loggedInUser.name.charAt(0);
    document.getElementById("admin-name").innerText = loggedInUser.name;
    document.getElementById("admin-role").innerText = loggedInUser.role;
    
    // Apply UI customizations and restrictions
    restrictUI();
    loadCustomizationSettings();
    updateSyncStatusIndicator();
    
    // Default render
    switchTab('dashboard');
  } else {
    loginOverlay.style.display = "grid";
    dashboardContainer.style.display = "none";
  }
}

// Restrict Sidebar tabs and actions based on user roles
function restrictUI() {
  const role = loggedInUser.role; // Owner, Manager, Staff
  
  // Sidebar elements
  const tabProducts = document.getElementById("tab-products");
  const tabSubBrands = document.getElementById("tab-subbrands");
  const tabAnnouncements = document.getElementById("tab-announcements");
  const tabCustomization = document.getElementById("tab-customization");
  const tabAdmins = document.getElementById("tab-admins");
  const tabSettings = document.getElementById("tab-settings");
  
  // Actions
  const btnClearDelivered = document.getElementById("btn-clear-delivered");
  
  // Reset visibility
  tabProducts.style.display = "flex";
  tabSubBrands.style.display = "flex";
  tabAnnouncements.style.display = "flex";
  tabCustomization.style.display = "flex";
  tabAdmins.style.display = "flex";
  tabSettings.style.display = "flex";
  if (btnClearDelivered) btnClearDelivered.style.display = "inline-flex";
  
  if (role === "Staff") {
    // Staff can only manage orders
    tabProducts.style.display = "none";
    tabSubBrands.style.display = "none";
    tabAnnouncements.style.display = "none";
    tabCustomization.style.display = "none";
    tabAdmins.style.display = "none";
    tabSettings.style.display = "none";
    if (btnClearDelivered) btnClearDelivered.style.display = "none";
  } else if (role === "Manager") {
    // Managers can manage products & categories, but not settings/admins/brand
    tabCustomization.style.display = "none";
    tabAdmins.style.display = "none";
    tabSettings.style.display = "none";
  }
  
  // Check if Google Sheet Sync or Supabase Sync is enabled overall to show button
  const settings = TFL_DB.getSettings();
  const forceSyncBtn = document.getElementById("btn-force-sync");
  if ((settings.googleSheetEnabled || settings.supabaseEnabled) && role === "Owner") {
    forceSyncBtn.style.display = "inline-flex";
  } else {
    forceSyncBtn.style.display = "none";
  }
}

function handleDbUpdated(event) {
  const key = event.detail && event.detail.key;
  if (key === "orders" || key === "all") {
    notifyForNewOrders();
  }
  if (!loggedInUser) return;
  clearTimeout(adminRefreshTimer);
  adminRefreshTimer = setTimeout(() => {
    renderTabContent(currentTab);
    updateSyncStatusIndicator();
  }, 120);
}

function notifyForNewOrders() {
  const orders = TFL_DB.getOrders();
  const newPendingOrders = orders.filter(order => {
    return order && order.status === "Pending" && !knownOrderIds.has(order.id);
  });
  orders.forEach(order => {
    if (order && order.id) knownOrderIds.add(order.id);
  });
  if (newPendingOrders.length > 0 && loggedInUser) {
    playNewOrderChime();
    TFL_DB.showToast(`New order received: ${newPendingOrders[0].id}`, "success");
  }
}

function playNewOrderChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const notes = [
      { freq: 740, start: 0, duration: 0.12 },
      { freq: 988, start: 0.14, duration: 0.18 }
    ];

    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, now + note.start);
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.03);
    });
  } catch (e) {
    console.warn("New order chime failed.", e);
  }
}

// Load customization values
function loadCustomizationSettings() {
  const settings = TFL_DB.getSettings();
  
  // Top-bar Logo / Title
  document.getElementById("admin-sidebar-title").innerHTML = settings.restaurantName.replace(/\bLab\b/gi, "<span>Lab</span>");
  if (settings.brandLogo) {
    document.getElementById("admin-logo-preview").src = settings.brandLogo;
  }
  
  // Dynamic stylesheets
  TFL_DB.applyThemeColors();
  lucide.createIcons();
}

// Login verification
function handleAdminLogin(event) {
  event.preventDefault();
  const userIn = document.getElementById("login-username").value.trim();
  const passIn = document.getElementById("login-password").value.trim();
  
  const admins = TFL_DB.getAdmins();
  const found = admins.find(a => a.username === userIn && a.password === passIn);
  
  if (found) {
    sessionStorage.setItem("tfl_admin_session", JSON.stringify(found));
    document.getElementById("admin-login-form").reset();
    document.getElementById("login-error-msg").style.display = "none";
    checkSession();
  } else {
    document.getElementById("login-error-msg").style.display = "block";
  }
}

// Logout action
function handleAdminLogout() {
  sessionStorage.removeItem("tfl_admin_session");
  loggedInUser = null;
  checkSession();
}

// Navigation switcher
function switchTab(tabId) {
  currentTab = tabId;
  
  // Toggle Active sidebar highlight
  document.querySelectorAll(".sidebar-item").forEach(item => {
    item.classList.remove("active");
  });
  const activeTabEl = document.getElementById(`tab-${tabId}`);
  if (activeTabEl) activeTabEl.classList.add("active");
  
  // Toggle visible sections
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.style.display = "none";
  });
  const activePanelEl = document.getElementById(`section-${tabId}`);
  if (activePanelEl) activePanelEl.style.display = "block";
  
  // Update header text
  const titleMap = {
    dashboard: "Operations Dashboard",
    orders: "Incoming Customer Orders",
    products: "Menu Formulations Manager",
    subbrands: "Sub-Brands & Categorization",
    announcements: "Updates & Offers announcements",
    customization: "Aesthetic Brand Customizer",
    admins: "Operations Staff Access",
    settings: "System Operational Settings"
  };
  document.getElementById("page-title").innerText = titleMap[tabId] || "TFL Lab Dashboard";
  
  // Fetch Tab Specific content
  renderTabContent(tabId);
}

// Side menu slider toggle (for Mobile viewports)
function toggleSidebarMenu() {
  const sidebar = document.getElementById("dashboard-sidebar");
  sidebar.classList.toggle("active");
}

// Render tabs logic routing
function renderTabContent(tabId) {
  // Auto-close sidebar on mobile after clicking
  if (window.innerWidth <= 900) {
    document.getElementById("dashboard-sidebar").classList.remove("active");
  }

  switch (tabId) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'orders':
      renderOrdersTable();
      break;
    case 'products':
      renderProductsTable();
      break;
    case 'subbrands':
      renderSubBrandsTable();
      break;
    case 'announcements':
      renderUpdatesTable();
      break;
    case 'customization':
      renderCustomizationForm();
      break;
    case 'admins':
      renderAdminsTable();
      break;
    case 'settings':
      renderSettingsForm();
      break;
  }
  lucide.createIcons();
}

// --- TAB: DASHBOARD LOGIC ---
function filterKPIs(range) {
  currentKpiFilter = range;
  renderDashboard();
}

function renderDashboard() {
  const orders = TFL_DB.getOrders();
  const products = TFL_DB.getProducts();
  const now = new Date();
  
  // Set start boundaries
  const startOfToday = new Date(now);
  startOfToday.setHours(0,0,0,0);
  
  const startOfWeek = new Date(now);
  const day = now.getDay();
  const diff = now.getDate() - (day === 0 ? 6 : day - 1); // Monday as start of the week
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0,0,0,0);
  
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Check if order date is within the current range.
  // Use createdAt/orderDate through TFL_DB so Indian display dates do not break parsing.
  const isInPeriod = (order) => {
    const orderTime = TFL_DB.getOrderTime(order);
    if (!orderTime) return false;
    const oDate = new Date(orderTime);

    if (currentKpiFilter === 'today') {
      return oDate >= startOfToday;
    } else if (currentKpiFilter === 'week') {
      return oDate >= startOfWeek;
    } else if (currentKpiFilter === 'month') {
      return oDate >= startOfMonth;
    }
    return false;
  };

  // Filter active lists
  const filteredOrders = orders.filter(o => isInPeriod(o));
  const deliveredOrders = filteredOrders.filter(o => o.status === "Delivered");
  
  let totalRevenue = 0;
  let totalCost = 0;
  let totalDelivery = 0;
  let totalLateNight = 0;
  
  deliveredOrders.forEach(order => {
    totalRevenue += order.grandTotal;
    totalDelivery += (order.deliveryCharge || 0);
    totalLateNight += (order.lateNightFee || 0);
    
    // Calculate cost of items inside order
    let orderCost = 0;
    order.items.forEach(item => {
      const origProd = products.find(p => p.id === item.id);
      const itemCostPrice = origProd ? (origProd.costPrice || 0) : 0;
      orderCost += itemCostPrice * item.quantity;
    });
    totalCost += orderCost;
  });
  
  const totalProfit = totalRevenue - totalCost;
  
  // Update UI Labels and Counts
  const labelMap = {
    today: "Today's Orders",
    week: "This Week's Orders",
    month: "This Month's Orders"
  };
  
  const ordersLabelEl = document.getElementById("kpi-orders-label");
  if (ordersLabelEl) {
    ordersLabelEl.innerText = labelMap[currentKpiFilter];
  }
  
  document.getElementById("kpi-orders-count").innerText = filteredOrders.length;
  document.getElementById("kpi-sales").innerText = `₹${totalRevenue.toFixed(0)}`;
  document.getElementById("kpi-cost").innerText = `₹${totalCost.toFixed(0)}`;
  document.getElementById("kpi-delivery").innerText = `₹${totalDelivery.toFixed(0)}`;
  document.getElementById("kpi-late-night").innerText = `₹${totalLateNight.toFixed(0)}`;
  document.getElementById("kpi-profit").innerText = `₹${totalProfit.toFixed(0)}`;
  
  // Update filter pill UI classes
  ['today', 'week', 'month'].forEach(f => {
    const btn = document.getElementById(`kpi-filter-${f}`);
    if (btn) {
      if (f === currentKpiFilter) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });

  // For the recent activity feed, we always show today's incoming orders
  const todayStr = now.toDateString();
  const todayOrders = orders.filter(o => {
    const orderTime = TFL_DB.getOrderTime(o);
    if (!orderTime) return false;
    return new Date(orderTime).toDateString() === todayStr;
  });

  // Render recent 5 orders today
  const recentContainer = document.getElementById("recent-orders-list");
  recentContainer.innerHTML = "";
  
  const recent = todayOrders.slice(0, 5);
  
  if (recent.length === 0) {
    recentContainer.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--color-text-muted);">
          No formulations ordered today yet.
        </td>
      </tr>
    `;
    return;
  }
  
  recent.forEach(order => {
    const itemsSummary = (order.items || []).map(i => `${i.name} (${i.quantity})`).join(", ");
    const dateObj = new Date(TFL_DB.getOrderTime(order));
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="font-weight: 600; color: var(--color-primary);">${order.id}</td>
      <td>${timeStr}</td>
      <td>
        <div><strong>${order.customerName} ${order.customerGender ? `(${order.customerGender})` : ''}</strong></div>
        <div style="font-size: 0.75rem; color: var(--color-text-muted);">${order.customerPhone}</div>
      </td>
      <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsSummary}">${itemsSummary}</td>
      <td style="font-weight: 700;">₹${order.grandTotal}</td>
      <td>${order.paymentMode}</td>
      <td><span class="status-pill status-${(order.paymentStatus || 'Unpaid').toLowerCase()}">${order.paymentStatus || 'Unpaid'}</span></td>
      <td><span class="status-pill status-${order.status.toLowerCase()}">${order.status}</span></td>
    `;
    recentContainer.appendChild(row);
  });
}

// --- TAB: ORDERS MANAGEMENT LOGIC ---
function renderOrdersTable() {
  const orders = TFL_DB.getOrders();
  const products = TFL_DB.getProducts();
  const container = document.getElementById("orders-full-list");
  container.innerHTML = "";
  
  // Apply visual button updates for active filter
  const filterButtons = ['all', 'Pending', 'Preparing', 'Delivered', 'Cancelled'];
  filterButtons.forEach(f => {
    const btn = document.getElementById(`order-filter-${f.toLowerCase()}`);
    if (btn) {
      btn.className = `filter-pill ${currentOrderFilter === f ? 'active' : ''}`;
    }
  });
  
  let filtered = orders;
  if (currentOrderFilter !== 'all') {
    filtered = orders.filter(o => o.status === currentOrderFilter);
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--color-text-muted); padding: var(--space-xl) 0;">
          <i data-lucide="archive" style="width: 48px; height: 48px; stroke-width: 1; margin-bottom: 12px;"></i>
          <p>No orders cataloged under "${currentOrderFilter}" status.</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }
  
  filtered.forEach(order => {
    // Formulate details HTML
    let itemsDetailHtml = "";
    order.items.forEach(item => {
      const condimentNames = item.condiments.map(c => {
        if (typeof c === 'object' && c !== null) {
          const qtyText = c.quantity && c.quantity > 1 ? ` (x${c.quantity})` : '';
          return `${c.name}${qtyText}`;
        }
        return c;
      });
      const condimentText = condimentNames.length > 0 ? ` (+ ${condimentNames.join(', ')})` : '';
      itemsDetailHtml += `<div>• ${item.name} x ${item.quantity}${condimentText}</div>`;
    });
    
    // Calculate cost details for Owner/Manager transparency
    let orderCost = 0;
    order.items.forEach(item => {
      const origProd = products.find(p => p.id === item.id);
      const c = origProd ? (origProd.costPrice || 0) : 0;
      orderCost += c * item.quantity;
    });
    const orderProfit = order.grandTotal - orderCost;
    
    const financialInfoHtml = loggedInUser.role !== 'Staff' 
      ? `<div style="font-size: 0.72rem; color: var(--color-text-muted); margin-top: 4px;">Cost: ₹${orderCost} | Profit: ₹${orderProfit}</div>`
      : '';
      
    const statusSelectHtml = `
      <select class="form-control" style="font-size: 0.8rem; padding: 0.3rem 0.5rem; width: 110px;" onchange="updateOrderStatus('${order.id}', this.value)">
        <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="Preparing" ${order.status === 'Preparing' ? 'selected' : ''}>Preparing</option>
        <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
        <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
      </select>
    `;

    const paymentStatus = order.paymentStatus || "Unpaid";
    const paymentStatusSelectHtml = `
      <select class="form-control" style="font-size: 0.8rem; padding: 0.3rem 0.5rem; width: 110px;" onchange="updatePaymentStatus('${order.id}', this.value)">
        <option value="Unpaid" ${paymentStatus === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
        <option value="Paid" ${paymentStatus === 'Paid' ? 'selected' : ''}>Paid</option>
        <option value="Refunded" ${paymentStatus === 'Refunded' ? 'selected' : ''}>Refunded</option>
      </select>
    `;
    
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="font-weight: 600; color: var(--color-primary);">${order.id}</td>
      <td style="font-size: 0.8rem; line-height: 1.3;">
        <div>${order.orderDate.split(', ')[0]}</div>
        <div style="color: var(--color-text-muted);">${order.orderDate.split(', ')[1] || ''}</div>
      </td>
      <td style="font-size: 0.82rem; line-height: 1.4; max-width: 150px;">
        <strong>${order.customerName} ${order.customerGender ? `(${order.customerGender})` : ''}</strong><br>
        WhatsApp: <a href="https://wa.me/${formatWhatsAppNumber(order.customerPhone)}" target="_blank" style="color: var(--color-primary); text-decoration: none;">${order.customerPhone}</a><br>
        <span style="font-size: 0.75rem; color: var(--color-text-muted); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${order.customerAddress}">${order.customerAddress}</span>
      </td>
      <td style="font-size: 0.8rem; line-height: 1.4;">${itemsDetailHtml}</td>
      <td>
        <div style="font-weight: 700; color: #fff;">₹${order.grandTotal}</div>
        ${financialInfoHtml}
      </td>
      <td style="font-size: 0.8rem;">${order.paymentMode}</td>
      <td><span class="status-pill status-${paymentStatus.toLowerCase()}">${paymentStatus}</span></td>
      <td><span class="status-pill status-${order.status.toLowerCase()}">${order.status}</span></td>
      <td>
        <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
          <div style="font-size: 0.7rem; color: var(--color-text-muted); font-weight: 600;">Delivery:</div>
          ${statusSelectHtml}
          <div style="font-size: 0.7rem; color: var(--color-text-muted); font-weight: 600; margin-top: 4px;">Payment:</div>
          ${paymentStatusSelectHtml}
          <div style="display: flex; gap: 4px; margin-top: var(--space-xs);">
            <button class="btn btn-secondary btn-sm" onclick="resendOrderDetailsWhatsApp('${order.id}')" title="Resend details on WhatsApp" style="padding: 4px 6px;">
              <i data-lucide="message-square" style="width: 12px; height: 12px;"></i>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="printReceiptFromAdmin('${order.id}')" title="Print Invoice" style="padding: 4px 6px;">
              <i data-lucide="printer" style="width: 12px; height: 12px;"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteOrder('${order.id}')" title="Delete Order" style="padding: 4px 6px;">
              <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
            </button>
          </div>
        </div>
      </td>
    `;
    container.appendChild(row);
  });
}

function filterOrdersByStatus(status) {
  currentOrderFilter = status;
  renderOrdersTable();
}

// Modify Order Status in storage & Cloud Sheet
async function updateOrderStatus(orderId, newStatus) {
  const orders = TFL_DB.getOrders();
  const index = orders.findIndex(o => o.id === orderId);
  
  if (index !== -1) {
    const order = orders[index];
    order.status = newStatus;
    TFL_DB.saveOrders(orders);
    renderOrdersTable();
    renderDashboard();
    
    // Trigger WhatsApp status update message redirect
    sendWhatsAppStatusUpdate(order, newStatus);
    
    // Attempt status update on cloud sheet
    try {
      await TFL_DB.updateOrderStatusInCloud(orderId, newStatus);
      TFL_DB.showToast("Cloud status synced!", "success");
    } catch(e) {
      console.warn("Could not sync order status change to Google Sheets.", e);
    }
  }
}

// Modify Payment Status in storage & Cloud Sheet
async function updatePaymentStatus(orderId, newPaymentStatus) {
  const orders = TFL_DB.getOrders();
  const index = orders.findIndex(o => o.id === orderId);
  
  if (index !== -1) {
    const order = orders[index];
    order.paymentStatus = newPaymentStatus;
    TFL_DB.saveOrders(orders);
    renderOrdersTable();
    renderDashboard();
    
    // Trigger WhatsApp payment status update message redirect
    sendWhatsAppPaymentStatusUpdate(order, newPaymentStatus);
    
    // Attempt status update on cloud sheet
    try {
      await TFL_DB.updatePaymentStatusInCloud(orderId, newPaymentStatus);
      TFL_DB.showToast("Cloud payment status synced!", "success");
    } catch(e) {
      console.warn("Could not sync order payment status change to Google Sheets.", e);
    }
  }
}

// Clear all Delivered/Cancelled orders to release local cache storage
async function clearDeliveredOrders() {
  if (confirm("Clear all Delivered and Cancelled orders from the live dashboard? Export CSV first if you need records for the day.")) {
    const orders = TFL_DB.getOrders();
    const activeOrders = orders.filter(o => o.status !== "Delivered" && o.status !== "Cancelled");
    const clearedOrders = orders.filter(o => o.status === "Delivered" || o.status === "Cancelled");
    TFL_DB.saveOrders(activeOrders);
    renderOrdersTable();
    renderDashboard();

    const settings = TFL_DB.getSettings();
    if (settings.supabaseEnabled) {
      try {
        await Promise.all(clearedOrders.map(order => TFL_DB.deleteOrderFromCloud(order.id)));
        TFL_DB.showToast("Completed orders cleared from live Supabase data.", "success");
      } catch (e) {
        console.warn("Could not clear every completed order from Supabase.", e);
        TFL_DB.showToast("Some completed orders may still exist in Supabase.", "warning");
      }
    }
  }
}

// Delete a specific order permanently
async function deleteOrder(orderId) {
  if (confirm(`Are you sure you want to delete order #${orderId}? This action cannot be undone.`)) {
    const orders = TFL_DB.getOrders();
    const updatedOrders = orders.filter(o => o.id !== orderId);
    TFL_DB.saveOrders(updatedOrders);
    
    // Refresh UI
    renderOrdersTable();
    renderDashboard();

    const settings = TFL_DB.getSettings();
    if (settings.supabaseEnabled) {
      try {
        await TFL_DB.deleteOrderFromCloud(orderId);
        TFL_DB.showToast("Order deleted from Supabase.", "success");
      } catch (err) {
        console.error("Failed to delete order from Supabase:", err);
        TFL_DB.showToast("Order deleted locally, but Supabase delete failed.", "warning");
      }
    }
    
    // Sync to Google Sheets if enabled
    await triggerBackgroundSync();
  }
}

// Helper to format WhatsApp phone numbers by stripping non-numeric characters and prepending country code 91 if it's 10 digits
function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    clean = "91" + clean;
  }
  return clean;
}

// Helper for gender greeting
function getGenderSalutation(order) {
  if (order.customerGender === "Female") {
    return `Hi ${order.customerName} Ma'am`;
  } else if (order.customerGender === "Male") {
    return `Hi ${order.customerName} Boss`;
  } else {
    return `Hi ${order.customerName}`;
  }
}

// Helper for sub-brand greeting
function getSubBrandGreeting(order) {
  const products = TFL_DB.getProducts();
  const subbrands = TFL_DB.getSubBrands();
  
  const itemCategories = (order.items || []).map(item => {
    const p = products.find(prod => prod.id === item.id);
    return p ? p.category : null;
  }).filter(c => c !== null);
  
  const counts = {};
  itemCategories.forEach(c => counts[c] = (counts[c] || 0) + 1);
  
  let maxCat = null;
  let maxCount = 0;
  for (const cat in counts) {
    if (counts[cat] > maxCount) {
      maxCount = counts[cat];
      maxCat = cat;
    }
  }
  
  const sb = subbrands.find(s => s.id === maxCat);
  if (sb) {
    return `Greetings From ${sb.name}! Thanks for ordering.`;
  }
  return "Greetings From The Food Lab! Thanks for ordering.";
}

// Send automated status updates to Customer via WhatsApp redirect
function sendWhatsAppStatusUpdate(order, newStatus) {
  if (!order) return;
  
  let statusMsg = "";
  if (newStatus === "Preparing") {
    statusMsg = "is now PREPARING! Our kitchen laboratory has started formulating your recipes.";
  } else if (newStatus === "Delivered") {
    statusMsg = "has been DELIVERED! Enjoy your lab-tested deliciousness.";
  } else if (newStatus === "Cancelled") {
    statusMsg = "has been CANCELLED. If you have any questions or want to re-order, please get in touch with us.";
  } else if (newStatus === "Pending") {
    statusMsg = "is now PENDING confirmation. We will notify you once preparation starts.";
  } else {
    statusMsg = `status has been updated to ${newStatus.toUpperCase()}.`;
  }
  
  const salutation = getGenderSalutation(order);
  const brandGreeting = getSubBrandGreeting(order);
  
  let message = `Delivery Update\n`;
  message += `${brandGreeting}\n`;
  message += `${salutation},\n\n`;
  message += `Your order #${order.id} ${statusMsg}\n\n`;
  message += `Thank you for choosing The Food Lab!`;
  
  const encodedMsg = encodeURIComponent(message);
  window.open(`https://wa.me/${formatWhatsAppNumber(order.customerPhone)}?text=${encodedMsg}`, '_blank');
}

// Send automated payment status updates to Customer via WhatsApp redirect
function sendWhatsAppPaymentStatusUpdate(order, newPaymentStatus) {
  if (!order) return;
  
  let statusMsg = "";
  if (newPaymentStatus === "Paid") {
    statusMsg = "has been successfully PAID! Thank you for the payment.";
  } else if (newPaymentStatus === "Refunded") {
    statusMsg = "has been REFUNDED. If you have any queries, feel free to reach out to us.";
  } else if (newPaymentStatus === "Unpaid") {
    statusMsg = "is currently UNPAID. Please arrange for payment as per your selected payment mode.";
  } else {
    statusMsg = `payment status has been updated to ${newPaymentStatus.toUpperCase()}.`;
  }
  
  const salutation = getGenderSalutation(order);
  const brandGreeting = getSubBrandGreeting(order);
  
  let message = `Payment Status Update\n`;
  message += `${brandGreeting}\n`;
  message += `${salutation},\n\n`;
  message += `The payment status for your order #${order.id} ${statusMsg}\n\n`;
  message += `Order Grand Total: Rs ${order.grandTotal}\n`;
  message += `Payment Mode: ${order.paymentMode}\n\n`;
  message += `Thank you for choosing The Food Lab!`;
  
  const encodedMsg = encodeURIComponent(message);
  window.open(`https://wa.me/${formatWhatsAppNumber(order.customerPhone)}?text=${encodedMsg}`, '_blank');
}

// Resend details to Customer WhatsApp from Admin panel
function resendOrderDetailsWhatsApp(orderId) {
  const order = TFL_DB.getOrders().find(o => o.id === orderId);
  if (!order) return;
  
  const salutation = getGenderSalutation(order);
  const brandGreeting = getSubBrandGreeting(order);
  
  let message = `Order Received\n`;
  message += `${brandGreeting}\n`;
  message += `${salutation},\n\n`;
  message += `Order Status: ${order.status}\n`;
  message += `--------------------------------------\n`;
  message += `Order ID: ${order.id}\n`;
  message += `Date: ${order.orderDate}\n`;
  message += `--------------------------------------\n\n`;
  
  order.items.forEach(item => {
    message += `${item.name} x ${item.quantity} - Rs ${(item.price * item.quantity)}\n`;
    if (item.condiments && item.condiments.length > 0) {
      const addons = item.condiments.map(c => {
        if (typeof c === 'object' && c !== null) {
          const qtyText = c.quantity && c.quantity > 1 ? ` (x${c.quantity})` : '';
          return `${c.name}${qtyText} (+Rs ${c.price})`;
        }
        return c;
      }).join(', ');
      message += `  Add-ons: ${addons}\n`;
    }
    message += `\n`;
  });
  
  message += `--------------------------------------\n`;
  if (order.lateNightFee && order.lateNightFee > 0) {
    message += `Subtotal: Rs ${order.subtotal}\n`;
    message += `Delivery Charges: Rs ${order.deliveryCharge}\n`;
    message += `Late Night Fee: Rs ${order.lateNightFee}\n`;
  }
  message += `Grand Total: Rs ${order.grandTotal}\n`;
  message += `--------------------------------------\n\n`;
  message += `Thank you for choosing The Food Lab!`;
  
  const encodedMsg = encodeURIComponent(message);
  window.open(`https://wa.me/${formatWhatsAppNumber(order.customerPhone)}?text=${encodedMsg}`, '_blank');
}

// CSV export for business analytics
function exportOrdersCSV() {
  const orders = TFL_DB.getOrders();
  const products = TFL_DB.getProducts();
  if (orders.length === 0) {
    TFL_DB.showToast("No orders available to export.", "warning");
    return;
  }
  
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Order ID,Date,Name,WhatsApp,Address,Items,Subtotal,Delivery,Late Night Fee,Revenue,Cost,Net Profit,Payment Mode,Payment Status,Delivery Status\n";
  
  orders.forEach(o => {
    const itemsText = o.items.map(i => `${i.name} x${i.quantity}`).join(" | ");
    const escapedAddress = o.customerAddress.replace(/"/g, '""');
    
    // Calculate cost for this specific order
    let orderCost = 0;
    o.items.forEach(item => {
      const origProd = products.find(p => p.id === item.id);
      const itemCostPrice = origProd ? (origProd.costPrice || 0) : 0;
      orderCost += itemCostPrice * item.quantity;
    });
    
    const revenue = o.grandTotal;
    const netProfit = revenue - orderCost;
    
    csvContent += `"${o.id}","${o.orderDate}","${o.customerName}","${o.customerPhone}","${escapedAddress}","${itemsText}",${o.subtotal},${o.deliveryCharge},${o.lateNightFee || 0},${revenue},${orderCost},${netProfit},"${o.paymentMode}","${o.paymentStatus || 'Unpaid'}","${o.status}"\n`;
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `TFL_Orders_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Print Invoice Receipt
function printReceiptFromAdmin(orderId) {
  // Build a tiny temporary print window or iframe to trigger styled printing
  const order = TFL_DB.getOrders().find(o => o.id === orderId);
  if (!order) return;
  
  const printWindow = window.open("", "_blank");
  let itemsHtml = "";
  order.items.forEach(item => {
    itemsHtml += `
      <tr>
        <td style="padding: 4px 0;">${item.name} x ${item.quantity}</td>
        <td style="text-align: right; padding: 4px 0;">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `;
    if (item.condiments && item.condiments.length > 0) {
      const addons = item.condiments.map(c => {
        if (typeof c === 'object' && c !== null) {
          const qtyText = c.quantity && c.quantity > 1 ? ` (x${c.quantity})` : '';
          return `${c.name}${qtyText} (₹${c.price.toFixed(2)})`;
        }
        return c;
      }).join(', ');
      itemsHtml += `
        <tr>
          <td colspan="2" style="font-size: 0.72rem; color: #555; padding-left: 10px;">+ Add-ons: ${addons}</td>
        </tr>
      `;
    }
  });
  
  const settings = TFL_DB.getSettings();
  const lateNightHtml = order.lateNightFee && order.lateNightFee > 0
    ? `
      <tr>
        <td>Late Night Fee</td>
        <td style="text-align: right;">₹${order.lateNightFee.toFixed(2)}</td>
      </tr>
    `
    : '';

  printWindow.document.write(`
    <html>
    <head>
      <title>Invoice - ${order.id}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 14px; padding: 20px; color: #000; }
        .center { text-align: center; }
        .dashed-line { border-top: 1px dashed #000; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; }
      </style>
    </head>
    <body onload="window.print(); window.close();">
      <div class="center">
        <h3 style="margin: 0; font-size: 18px;">${settings.restaurantName.toUpperCase()}</h3>
        <p style="margin: 2px 0 10px 0; font-size: 12px;">${settings.tagline.toUpperCase()}</p>
        <div><strong>Order ID:</strong> ${order.id}</div>
        <div><strong>Date:</strong> ${order.orderDate}</div>
      </div>
      <div class="dashed-line"></div>
      <table>
        ${itemsHtml}
      </table>
      <div class="dashed-line"></div>
      <table>
        <tr>
          <td>Subtotal</td>
          <td style="text-align: right;">₹${order.subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Delivery Charge</td>
          <td style="text-align: right;">₹${order.deliveryCharge.toFixed(2)}</td>
        </tr>
        ${lateNightHtml}
        <tr style="font-weight: bold; font-size: 16px;">
          <td>GRAND TOTAL</td>
          <td style="text-align: right;">₹${order.grandTotal.toFixed(2)}</td>
        </tr>
      </table>
      <div class="dashed-line"></div>
      <div>
        <strong>Delivery Specifications:</strong><br>
        Customer: ${order.customerName}<br>
        Phone: ${order.customerPhone}<br>
        Address: ${order.customerAddress}<br>
        Payment Mode: ${order.paymentMode} (${order.paymentStatus || 'Unpaid'})<br>
        Delivery Status: ${order.status}
      </div>
      <div class="dashed-line" style="margin-top: 15px;"></div>
      <div class="center" style="margin-top: 10px; font-size: 12px;">
        🔬 Lab Formulated Goodness! 🔬<br>
        Thank you for testing our recipes.
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// --- TAB: PRODUCTS FORMULATION LOGIC (CRUD) ---
function renderProductsTable() {
  const products = TFL_DB.getProducts();
  const container = document.getElementById("products-admin-list");
  container.innerHTML = "";
  
  if (products.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--color-text-muted);">
          No products formulated yet. Click 'Add Product' to begin!
        </td>
      </tr>
    `;
    return;
  }
  
  products.forEach(p => {
    const vegBadge = p.veg 
      ? `<span class="badge badge-veg">Veg</span>` 
      : `<span class="badge badge-nonveg">Non-Veg</span>`;
      
    const bestsellerBadge = p.bestseller 
      ? `<span class="badge badge-offer">Bestseller</span>` 
      : '';
      
    const allowedConds = p.condiments && p.condiments.length > 0 
      ? p.condiments.map(c => typeof c === 'object' ? `${c.name} (+₹${c.price})` : c).join(", ") 
      : 'None';
      
    const profit = p.price - p.costPrice;
    
    // Action button to List/Unlist product formulation
    const listedLabel = p.unlisted ? "List" : "Unlist";
    const listedBtnClass = p.unlisted ? "btn-success" : "btn-secondary";
    
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="display: flex; gap: var(--space-md); align-items: center;">
        <img src="${p.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80'}" alt="${p.name}" style="width: 50px; height: 50px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--color-border);">
        <div>
          <div style="font-weight: 600; color: #fff;">${p.name}</div>
          <div style="font-size: 0.72rem; color: var(--color-text-muted); max-width: 240px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${p.description}</div>
          <div style="display: flex; gap: 4px; margin-top: 4px;">
            ${vegBadge}
            ${bestsellerBadge}
          </div>
        </div>
      </td>
      <td><span style="font-size: 0.8rem; font-weight: 600; color: var(--color-primary); text-transform: uppercase;">${p.category.replace('-', ' ')}</span></td>
      <td>
        <div>Sell: <strong>₹${p.price}</strong></div>
        <div style="font-size: 0.75rem; color: var(--color-text-muted);">Cost: ₹${p.costPrice}</div>
        <div style="font-size: 0.75rem; color: var(--color-success); font-weight: 600;">Margin: ₹${profit}</div>
      </td>
      <td style="font-size: 0.75rem; color: var(--color-text-muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${allowedConds}">${allowedConds}</td>
      <td>
        <label class="checkbox-label" style="font-size: 0.8rem;">
          <input type="checkbox" class="checkbox-custom" ${p.inStock ? 'checked' : ''} onchange="toggleProductStock('${p.id}', this.checked)">
          <span>In Stock</span>
        </label>
      </td>
      <td>
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-secondary btn-sm" onclick="openProductModal('${p.id}')" style="padding: 4px 8px;">Edit</button>
          <button class="btn ${listedBtnClass} btn-sm" onclick="toggleProductListing('${p.id}')" style="padding: 4px 8px;">${listedLabel}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')" style="padding: 4px 8px;"><i data-lucide="trash" style="width: 12px; height: 12px;"></i></button>
        </div>
      </td>
    `;
    container.appendChild(row);
  });
}

function calculateModalProfit() {
  const cost = parseFloat(document.getElementById("p-cost").value) || 0;
  const price = parseFloat(document.getElementById("p-price").value) || 0;
  const margin = price - cost;
  document.getElementById("p-profit-margin").innerText = `₹${margin.toFixed(2)}`;
}

function openProductModal(productId = null) {
  const selectCategory = document.getElementById("p-category");
  selectCategory.innerHTML = "";
  
  // Load current categories/subbrands
  const subbrands = TFL_DB.getSubBrands();
  subbrands.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.innerText = s.name;
    selectCategory.appendChild(opt);
  });
  
  // Render condiments checkboxes checklist
  const condimentsList = ["Extra onion", "Green chutney", "Mint chutney", "Raita", "Achaar", "Extra butter", "Extra roti", "Spicy", "Less spicy"];
  const listDiv = document.getElementById("product-condiments-checklist");
  listDiv.innerHTML = "";
  condimentsList.forEach(c => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    label.style.display = "flex";
    label.style.justifyContent = "space-between";
    label.style.alignItems = "center";
    label.style.width = "100%";
    label.style.gap = "10px";
    label.style.marginBottom = "4px";
    label.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <input type="checkbox" name="p-condiment-opt" value="${c}" class="checkbox-custom" onchange="toggleCondimentPriceInput(this)">
        <span style="font-size: 0.78rem;">${c}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="font-size: 0.75rem; color: var(--color-text-muted);">+₹</span>
        <input type="number" name="p-condiment-price-${c.replace(/\s+/g, '_')}" class="form-control" style="width: 60px; padding: 2px 4px; height: 26px; font-size: 0.8rem; margin: 0;" min="0" value="0" disabled>
      </div>
    `;
    listDiv.appendChild(label);
  });
  
  if (productId) {
    // Edit Mode
    const product = TFL_DB.getProducts().find(p => p.id === productId);
    document.getElementById("product-modal-title").innerText = "Modify Formulation";
    document.getElementById("product-modal-id").value = product.id;
    document.getElementById("p-name").value = product.name;
    document.getElementById("p-desc").value = product.description;
    document.getElementById("p-category").value = product.category;
    document.getElementById("p-image").value = product.image;
    document.getElementById("p-cost").value = product.costPrice || 0;
    document.getElementById("p-price").value = product.price;
    document.getElementById("p-veg").checked = product.veg;
    document.getElementById("p-bestseller").checked = product.bestseller;
    
    // Check checkboxes and set prices
    if (product.condiments) {
      document.querySelectorAll('input[name="p-condiment-opt"]').forEach(cb => {
        const found = product.condiments.find(c => (typeof c === 'object' ? c.name : c) === cb.value);
        if (found) {
          cb.checked = true;
          const priceInputName = `p-condiment-price-${cb.value.replace(/\s+/g, '_')}`;
          const priceInput = document.querySelector(`input[name="${priceInputName}"]`);
          if (priceInput) {
            priceInput.disabled = false;
            priceInput.value = typeof found === 'object' ? found.price : 0;
          }
        }
      });
    }
    
    calculateModalProfit();
  } else {
    // Add Mode
    document.getElementById("product-modal-title").innerText = "Formulate New Product";
    document.getElementById("product-form").reset();
    document.getElementById("product-modal-id").value = "";
    document.getElementById("p-profit-margin").innerText = "₹0.00";
    document.getElementById("p-image-status").style.display = "none";
    document.querySelectorAll('input[name^="p-condiment-price-"]').forEach(inp => {
      inp.disabled = true;
      inp.value = 0;
    });
  }
  
  document.getElementById("product-modal").classList.add("active");
  document.getElementById("admin-modal-backdrop").classList.add("active");
}

function closeProductModal() {
  document.getElementById("product-modal").classList.remove("active");
  document.getElementById("admin-modal-backdrop").classList.remove("active");
}

// Save/Update product formulations
async function handleProductSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("product-modal-id").value;
  const name = document.getElementById("p-name").value.trim();
  const desc = document.getElementById("p-desc").value.trim();
  const category = document.getElementById("p-category").value;
  const image = document.getElementById("p-image").value.trim();
  const cost = parseFloat(document.getElementById("p-cost").value) || 0;
  const price = parseFloat(document.getElementById("p-price").value) || 0;
  const veg = document.getElementById("p-veg").checked;
  const bestseller = document.getElementById("p-bestseller").checked;
  
  const checkedBoxes = document.querySelectorAll('input[name="p-condiment-opt"]:checked');
  const condiments = Array.from(checkedBoxes).map(cb => {
    const name = cb.value;
    const priceInputName = `p-condiment-price-${name.replace(/\s+/g, '_')}`;
    const priceInput = document.querySelector(`input[name="${priceInputName}"]`);
    const price = priceInput ? (parseFloat(priceInput.value) || 0) : 0;
    return { name, price };
  });
  
  const products = TFL_DB.getProducts();
  
  if (id) {
    // Edit Product
    const index = products.findIndex(p => p.id === id);
    products[index] = {
      ...products[index],
      name, description: desc, category, image, costPrice: cost, price, veg, bestseller, condiments
    };
  } else {
    // Add Product
    const newId = "p-" + Date.now();
    products.push({
      id: newId,
      name, description: desc, category, image, costPrice: cost, price, veg, bestseller, condiments,
      inStock: true
    });
  }
  
  TFL_DB.saveProducts(products);
  closeProductModal();
  renderProductsTable();
  
  // Sync changes to sheets if enabled
  triggerBackgroundSync();
}

async function toggleProductStock(productId, isChecked) {
  const products = TFL_DB.getProducts();
  const index = products.findIndex(p => p.id === productId);
  if (index !== -1) {
    products[index].inStock = isChecked;
    TFL_DB.saveProducts(products);
    triggerBackgroundSync();
  }
}

async function toggleProductListing(productId) {
  const products = TFL_DB.getProducts();
  const index = products.findIndex(p => p.id === productId);
  if (index !== -1) {
    products[index].unlisted = !products[index].unlisted;
    TFL_DB.saveProducts(products);
    renderProductsTable();
    triggerBackgroundSync();
  }
}

async function deleteProduct(productId) {
  if (confirm("Are you sure you want to delete this product formulation?")) {
    const products = TFL_DB.getProducts();
    const filtered = products.filter(p => p.id !== productId);
    TFL_DB.saveProducts(filtered);
    renderProductsTable();
    triggerBackgroundSync();
  }
}

// --- TAB: SUB-BRANDS (CATEGORIES) LOGIC (CRUD) ---
function renderSubBrandsTable() {
  const subbrands = TFL_DB.getSubBrands();
  const container = document.getElementById("subbrands-admin-list");
  container.innerHTML = "";
  
  subbrands.sort((a,b) => a.sortOrder - b.sortOrder).forEach(s => {
    const isEmoji = s.logo.length <= 4;
    const logoPreviewHtml = isEmoji 
      ? `<div style="font-size: 1.5rem;">${s.logo}</div>` 
      : `<img src="${s.logo}" alt="Logo" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">`;
      
    const visibleBadge = s.visible 
      ? `<span class="badge badge-veg">Active</span>` 
      : `<span class="badge badge-nonveg">Hidden</span>`;
      
    row = document.createElement("tr");
    row.innerHTML = `
      <td>${logoPreviewHtml}</td>
      <td>
        <div style="font-weight: 600; color: #fff;">${s.name}</div>
        <div style="font-size: 0.72rem; color: var(--color-text-muted);">ID: ${s.id}</div>
      </td>
      <td><strong>${s.sortOrder}</strong></td>
      <td>${visibleBadge}</td>
      <td>
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-secondary btn-sm" onclick="openSubBrandModal('${s.id}')" style="padding: 4px 8px;">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSubBrand('${s.id}')" style="padding: 4px 8px;"><i data-lucide="trash" style="width: 12px; height: 12px;"></i></button>
        </div>
      </td>
    `;
    container.appendChild(row);
  });
}

function openSubBrandModal(subBrandId = null) {
  if (subBrandId) {
    const sb = TFL_DB.getSubBrands().find(s => s.id === subBrandId);
    document.getElementById("subbrand-modal-title").innerText = "Modify Sub-Brand";
    document.getElementById("subbrand-modal-id").value = sb.id;
    document.getElementById("sb-name").value = sb.name;
    document.getElementById("sb-logo").value = sb.logo;
    document.getElementById("sb-sort").value = sb.sortOrder;
    document.getElementById("sb-visible").checked = sb.visible;
  } else {
    document.getElementById("subbrand-modal-title").innerText = "Add New Sub-Brand";
    document.getElementById("subbrand-form").reset();
    document.getElementById("subbrand-modal-id").value = "";
  }
  document.getElementById("subbrand-modal").classList.add("active");
  document.getElementById("admin-modal-backdrop").classList.add("active");
}

function closeSubBrandModal() {
  document.getElementById("subbrand-modal").classList.remove("active");
  document.getElementById("admin-modal-backdrop").classList.remove("active");
}

async function handleSubBrandSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("subbrand-modal-id").value;
  const name = document.getElementById("sb-name").value.trim();
  const logo = document.getElementById("sb-logo").value.trim();
  const sort = parseInt(document.getElementById("sb-sort").value) || 99;
  const visible = document.getElementById("sb-visible").checked;
  
  const subbrands = TFL_DB.getSubBrands();
  
  if (id) {
    const index = subbrands.findIndex(s => s.id === id);
    subbrands[index] = { ...subbrands[index], name, logo, sortOrder: sort, visible };
  } else {
    // Generate clean URL ID
    const newId = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    subbrands.push({ id: newId, name, logo, sortOrder: sort, visible });
  }
  
  TFL_DB.saveSubBrands(subbrands);
  closeSubBrandModal();
  renderSubBrandsTable();
  triggerBackgroundSync();
}

async function deleteSubBrand(subBrandId) {
  if (confirm("Are you sure you want to delete this sub-brand? All products configured under it might not render properly.")) {
    const subbrands = TFL_DB.getSubBrands();
    const filtered = subbrands.filter(s => s.id !== subBrandId);
    TFL_DB.saveSubBrands(filtered);
    renderSubBrandsTable();
    triggerBackgroundSync();
  }
}

// --- TAB: UPDATES (ANNOUNCEMENTS) LOGIC (CRUD) ---
function renderUpdatesTable() {
  const updates = TFL_DB.getUpdates();
  const container = document.getElementById("updates-admin-list");
  container.innerHTML = "";
  
  if (updates.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--color-text-muted);">
          No updates published. Click 'Add Update' to create promo banners!
        </td>
      </tr>
    `;
    return;
  }
  
  updates.forEach(u => {
    const activeBadge = u.active 
      ? `<span class="badge badge-veg">Active</span>` 
      : `<span class="badge badge-nonveg">Hidden</span>`;
      
    row = document.createElement("tr");
    row.innerHTML = `
      <td><img src="${u.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=120&q=80'}" style="width: 80px; height: 45px; border-radius: 4px; object-fit: cover; border: 1px solid var(--color-border);"></td>
      <td>
        <div style="font-weight: 600; color: #fff;">${u.title}</div>
        <div style="font-size: 0.72rem; color: var(--color-text-muted); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${u.description}</div>
      </td>
      <td><strong>${u.launchDate || 'N/A'}</strong></td>
      <td><span class="badge tag-${u.type || 'new_launch'}">${(u.type || 'new_launch').replace('_', ' ')}</span></td>
      <td>${activeBadge}</td>
      <td>
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-secondary btn-sm" onclick="openUpdateModal('${u.id}')" style="padding: 4px 8px;">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteUpdate('${u.id}')" style="padding: 4px 8px;"><i data-lucide="trash" style="width: 12px; height: 12px;"></i></button>
        </div>
      </td>
    `;
    container.appendChild(row);
  });
}

function openUpdateModal(updateId = null) {
  if (updateId) {
    const u = TFL_DB.getUpdates().find(x => x.id === updateId);
    document.getElementById("update-modal-title").innerText = "Modify Announcement Card";
    document.getElementById("update-modal-id").value = u.id;
    document.getElementById("u-title").value = u.title;
    document.getElementById("u-desc").value = u.description;
    document.getElementById("u-image").value = u.imageUrl || "";
    document.getElementById("u-date").value = u.launchDate || "";
    document.getElementById("u-type").value = u.type || "new_launch";
    document.getElementById("u-active").checked = u.active;
  } else {
    document.getElementById("update-modal-title").innerText = "Publish New Announcement Banner";
    document.getElementById("update-form").reset();
    document.getElementById("update-modal-id").value = "";
    document.getElementById("u-date").value = new Date().toISOString().slice(0, 10);
  }
  document.getElementById("update-modal").classList.add("active");
  document.getElementById("admin-modal-backdrop").classList.add("active");
}

function closeUpdateModal() {
  document.getElementById("update-modal").classList.remove("active");
  document.getElementById("admin-modal-backdrop").classList.remove("active");
}

async function handleUpdateSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("update-modal-id").value;
  const title = document.getElementById("u-title").value.trim();
  const desc = document.getElementById("u-desc").value.trim();
  const imageUrl = document.getElementById("u-image").value.trim();
  const launchDate = document.getElementById("u-date").value;
  const type = document.getElementById("u-type").value;
  const active = document.getElementById("u-active").checked;
  
  const updates = TFL_DB.getUpdates();
  
  if (id) {
    const index = updates.findIndex(x => x.id === id);
    updates[index] = { ...updates[index], title, description: desc, imageUrl, launchDate, type, active };
  } else {
    const newId = "up-" + Date.now();
    updates.push({ id: newId, title, description: desc, imageUrl, launchDate, type, active });
  }
  
  TFL_DB.saveUpdates(updates);
  closeUpdateModal();
  renderUpdatesTable();
  triggerBackgroundSync();
}

async function deleteUpdate(updateId) {
  if (confirm("Are you sure you want to delete this update announcement?")) {
    const updates = TFL_DB.getUpdates();
    const filtered = updates.filter(x => x.id !== updateId);
    TFL_DB.saveUpdates(filtered);
    renderUpdatesTable();
    triggerBackgroundSync();
  }
}

// --- TAB: BRAND CUSTOMIZATION FORM LOGIC ---
function renderCustomizationForm() {
  const settings = TFL_DB.getSettings();
  
  document.getElementById("cust-brand-name").value = settings.restaurantName;
  document.getElementById("cust-brand-tagline").value = settings.tagline;
  document.getElementById("cust-primary-color").value = settings.themePrimaryColor;
  document.getElementById("cust-primary-color-text").value = settings.themePrimaryColor;
  document.getElementById("cust-bg-color").value = settings.themeBgColor;
  document.getElementById("cust-bg-color-text").value = settings.themeBgColor;
  document.getElementById("cust-logo-url").value = settings.brandLogo || "";
  document.getElementById("cust-hero-url").value = settings.heroImage || "";
}

async function saveCustomization(event) {
  event.preventDefault();
  const settings = TFL_DB.getSettings();
  
  settings.restaurantName = document.getElementById("cust-brand-name").value.trim();
  settings.tagline = document.getElementById("cust-brand-tagline").value.trim();
  settings.themePrimaryColor = document.getElementById("cust-primary-color-text").value.trim();
  settings.themeBgColor = document.getElementById("cust-bg-color-text").value.trim();
  settings.brandLogo = document.getElementById("cust-logo-url").value.trim();
  settings.heroImage = document.getElementById("cust-hero-url").value.trim();
  
  TFL_DB.saveSettings(settings);
  loadCustomizationSettings();
  TFL_DB.showToast("Branding Customizations successfully applied to both applications!", "success");
  triggerBackgroundSync();
}

// --- TAB: ADMIN USERS LOGIC (CRUD) ---
function renderAdminsTable() {
  const admins = TFL_DB.getAdmins();
  const container = document.getElementById("admins-admin-list");
  container.innerHTML = "";
  
  admins.forEach(a => {
    // Determine edit controls based on Owner permissions or current session user
    const selfEditOnly = loggedInUser.role !== "Owner" && loggedInUser.username !== a.username;
    
    let actionsHtml = "";
    if (selfEditOnly) {
      actionsHtml = `<span style="font-size: 0.8rem; color: var(--color-text-muted);">Restricted</span>`;
    } else {
      actionsHtml = `
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-secondary btn-sm" onclick="openAdminModal('${a.username}')" style="padding: 4px 8px;">Edit</button>
          ${loggedInUser.username !== a.username ? `<button class="btn btn-danger btn-sm" onclick="deleteAdminUser('${a.username}')" style="padding: 4px 8px;">Delete</button>` : ''}
        </div>
      `;
    }
    
    row = document.createElement("tr");
    row.innerHTML = `
      <td><div style="font-weight: 600; color: #fff;">${a.name}</div></td>
      <td><code>${a.username}</code></td>
      <td><span class="role-badge role-${a.role.toLowerCase()}">${a.role}</span></td>
      <td>${actionsHtml}</td>
    `;
    container.appendChild(row);
  });
}

function openAdminModal(username = null) {
  if (username) {
    const admin = TFL_DB.getAdmins().find(a => a.username === username);
    document.getElementById("admin-modal-title").innerText = "Modify Admin Account Credentials";
    document.getElementById("admin-modal-mode").value = "edit";
    document.getElementById("admin-original-username").value = admin.username;
    
    document.getElementById("adm-name").value = admin.name;
    document.getElementById("adm-username").value = admin.username;
    document.getElementById("adm-password").value = admin.password;
    document.getElementById("adm-role").value = admin.role;
    
    // Disable role toggle if not Owner
    document.getElementById("adm-role").disabled = loggedInUser.role !== "Owner";
  } else {
    document.getElementById("admin-modal-title").innerText = "Formulate New Admin User";
    document.getElementById("admin-user-form").reset();
    document.getElementById("admin-modal-mode").value = "add";
    document.getElementById("adm-role").disabled = false;
  }
  
  document.getElementById("admin-user-modal").classList.add("active");
  document.getElementById("admin-modal-backdrop").classList.add("active");
}

function closeAdminModal() {
  document.getElementById("admin-user-modal").classList.remove("active");
  document.getElementById("admin-modal-backdrop").classList.remove("active");
}

async function handleAdminSubmit(event) {
  event.preventDefault();
  const mode = document.getElementById("admin-modal-mode").value;
  const originalUsername = document.getElementById("admin-original-username").value;
  
  const name = document.getElementById("adm-name").value.trim();
  const username = document.getElementById("adm-username").value.trim().toLowerCase();
  const password = document.getElementById("adm-password").value.trim();
  const role = document.getElementById("adm-role").value;
  
  const admins = TFL_DB.getAdmins();
  
  // Verify usernames duplicate checks
  if (mode === "add" && admins.some(a => a.username === username)) {
    TFL_DB.showToast("This username already exists. Choose a unique handle.", "error");
    return;
  }
  
  if (mode === "edit") {
    const idx = admins.findIndex(a => a.username === originalUsername);
    if (idx !== -1) {
      admins[idx] = { name, username, password, role };
      
      // If editing current logged in user, update session details
      if (loggedInUser.username === originalUsername) {
        sessionStorage.setItem("tfl_admin_session", JSON.stringify(admins[idx]));
        loggedInUser = admins[idx];
      }
    }
  } else {
    admins.push({ name, username, password, role });
  }
  
  TFL_DB.saveAdmins(admins);
  closeAdminModal();
  checkSession(); // Reload session controls
  renderAdminsTable();
  triggerBackgroundSync();
}

async function deleteAdminUser(username) {
  if (confirm(`Are you sure you want to delete admin user "${username}"?`)) {
    const admins = TFL_DB.getAdmins();
    const filtered = admins.filter(a => a.username !== username);
    TFL_DB.saveAdmins(filtered);
    renderAdminsTable();
    triggerBackgroundSync();
  }
}

// --- TAB: SETTINGS LOGIC ---
function renderSettingsForm() {
  const settings = TFL_DB.getSettings();
  
  document.getElementById("settings-kitchen-toggle").checked = settings.isOpen;
  document.getElementById("settings-delivery-charge").value = settings.deliveryCharge;
  document.getElementById("settings-late-night-toggle").checked = settings.lateNightFeeEnabled;
  document.getElementById("settings-late-night-amount").value = settings.lateNightFeeAmount;
  document.getElementById("settings-closed-msg").value = settings.closedMessage || "";
  document.getElementById("settings-order-retention").value = settings.orderRetentionDays || 2;
  document.getElementById("settings-max-completed-orders").value = settings.maxCompletedOrders || 100;
  
  document.getElementById("settings-wa-orders").value = settings.whatsappNumber;
  document.getElementById("settings-wa-support").value = settings.supportNumber;
  
  document.getElementById("settings-upi-id").value = settings.upiId || "";
  document.getElementById("settings-upi-qr").value = settings.qrImageUrl || "";
  
  document.getElementById("settings-sheet-toggle").checked = settings.googleSheetEnabled;
  document.getElementById("settings-sheet-url").value = settings.googleSheetUrl || "";
  document.getElementById("settings-supabase-toggle").checked = settings.supabaseEnabled || false;
  document.getElementById("settings-supabase-url").value = settings.supabaseUrl || "";
  document.getElementById("settings-supabase-key").value = settings.supabaseKey || "";
  document.getElementById("settings-gform-link").value = settings.googleFormLink || "";
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = TFL_DB.getSettings();
  
  settings.isOpen = document.getElementById("settings-kitchen-toggle").checked;
  settings.deliveryCharge = parseFloat(document.getElementById("settings-delivery-charge").value) || 0;
  settings.lateNightFeeEnabled = document.getElementById("settings-late-night-toggle").checked;
  settings.lateNightFeeAmount = parseFloat(document.getElementById("settings-late-night-amount").value) || 0;
  settings.closedMessage = document.getElementById("settings-closed-msg").value.trim();
  settings.orderRetentionDays = parseInt(document.getElementById("settings-order-retention").value, 10) || 2;
  settings.maxCompletedOrders = parseInt(document.getElementById("settings-max-completed-orders").value, 10) || 100;
  
  settings.whatsappNumber = document.getElementById("settings-wa-orders").value.trim();
  settings.supportNumber = document.getElementById("settings-wa-support").value.trim();
  
  settings.upiId = document.getElementById("settings-upi-id").value.trim();
  settings.qrImageUrl = document.getElementById("settings-upi-qr").value.trim();
  
  settings.googleSheetEnabled = document.getElementById("settings-sheet-toggle").checked;
  settings.googleSheetUrl = document.getElementById("settings-sheet-url").value.trim();
  settings.supabaseEnabled = document.getElementById("settings-supabase-toggle").checked;
  settings.supabaseUrl = document.getElementById("settings-supabase-url").value.trim();
  settings.supabaseKey = document.getElementById("settings-supabase-key").value.trim();
  settings.googleFormLink = document.getElementById("settings-gform-link").value.trim();
  
  TFL_DB.saveSettings(settings);
  TFL_DB.saveOrders(TFL_DB.getOrders());
  restrictUI(); // Reload UI to show/hide Sync buttons based on settings
  updateSyncStatusIndicator();
  TFL_DB.showToast("Operational system settings successfully configured!", "success");
  triggerBackgroundSync();
}

// Close panels helper
function closeAllModals() {
  closeProductModal();
  closeSubBrandModal();
  closeUpdateModal();
  closeAdminModal();
}

// --- SYNC SERVICES ---
function updateSyncStatusIndicator() {
  const settings = TFL_DB.getSettings();
  const banner = document.getElementById("db-sync-status-banner");
  
  if (!banner) return;
  
  if (settings.supabaseEnabled && settings.supabaseUrl && settings.supabaseKey) {
    banner.style.display = "inline-flex";
    banner.className = "badge sync-banner synced";
    banner.style.backgroundColor = "#24b47e";
    banner.innerHTML = `<i data-lucide="database" style="width: 12px; height: 12px; margin-right: 4px;"></i> Supabase Sync Enabled`;
  } else if (settings.googleSheetEnabled && settings.googleSheetUrl) {
    banner.style.display = "inline-flex";
    banner.className = "badge sync-banner synced";
    banner.style.removeProperty("background-color");
    banner.innerHTML = `<i data-lucide="cloud" style="width: 12px; height: 12px; margin-right: 4px;"></i> Cloud DB Sync Enabled`;
  } else {
    banner.style.display = "none";
  }
  lucide.createIcons();
}

async function syncCloudDB() {
  const button = document.getElementById("btn-force-sync");
  const origText = button.innerHTML;
  
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-2" class="anim-spin" style="width: 14px; height: 14px;"></i> Syncing...`;
  lucide.createIcons();
  
  const settings = TFL_DB.getSettings();
  try {
    if (settings.supabaseEnabled) {
      await TFL_DB.syncToSupabase();
      await TFL_DB.syncFromSupabase();
      TFL_DB.showToast("Supabase database sync completed!", "success");
    } else {
      await TFL_DB.syncToGoogleSheets();
      await TFL_DB.syncFromGoogleSheets();
      TFL_DB.showToast("Database sync completed!", "success");
    }
    renderTabContent(currentTab);
  } catch (err) {
    const message = settings.supabaseEnabled
      ? "Sync failed: Check Supabase URL, anon key, and SQL setup."
      : "Sync failed: Check your Google Apps Script URL configuration and permissions.";
    TFL_DB.showToast(message, "error");
    console.error(err);
  } finally {
    button.disabled = false;
    button.innerHTML = origText;
    lucide.createIcons();
  }
}

// Trigger background updates silently without blocking UI
async function triggerBackgroundSync() {
  const settings = TFL_DB.getSettings();
  if (settings.supabaseEnabled && settings.supabaseUrl && settings.supabaseKey) {
    try {
      await TFL_DB.syncToSupabase();
      TFL_DB.showToast("Supabase database updated.", "success");
    } catch(e) {
      console.warn("Background Supabase auto-sync failed.", e);
    }
  } else if (settings.googleSheetEnabled && settings.googleSheetUrl) {
    try {
      await TFL_DB.syncToGoogleSheets();
      TFL_DB.showToast("Cloud database updated.", "success");
    } catch(e) {
      console.warn("Background auto-sync failed.", e);
    }
  }
}

// Toast alerts helper (Deprecated - Use TFL_DB.showToast instead)
function showTemporaryToast(message) {
  TFL_DB.showToast(message, "info");
}

function toggleCondimentPriceInput(checkbox) {
  const name = checkbox.value;
  const priceInputName = `p-condiment-price-${name.replace(/\s+/g, '_')}`;
  const priceInput = document.querySelector(`input[name="${priceInputName}"]`);
  if (priceInput) {
    priceInput.disabled = !checkbox.checked;
    if (!checkbox.checked) {
      priceInput.value = 0;
    }
  }
}

function compressImage(file, maxWidth, maxHeight, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(compressedDataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

async function handleProductImageUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const statusDiv = document.getElementById("p-image-status");
  statusDiv.style.display = "block";
  statusDiv.style.color = "var(--color-primary)";
  statusDiv.innerText = "Processing & compressing image...";

  try {
    const base64DataWithHeader = await compressImage(file, 800, 800, 0.7);
    if (!base64DataWithHeader) {
      throw new Error("Compression resulted in empty data");
    }

    const commaIdx = base64DataWithHeader.indexOf(",");
    const base64Data = base64DataWithHeader.substring(commaIdx + 1);
    const mimeType = "image/jpeg";
    let fileName = file.name || "product_image.jpg";
    const extIdx = fileName.lastIndexOf(".");
    if (extIdx !== -1) {
      fileName = fileName.substring(0, extIdx) + ".jpg";
    } else {
      fileName = fileName + ".jpg";
    }

    const settings = TFL_DB.getSettings();

    if (settings.supabaseEnabled && settings.supabaseUrl && settings.supabaseKey) {
      statusDiv.innerText = "Uploading to Supabase Storage...";
      try {
        const result = await TFL_DB.uploadImageToCloud(fileName, mimeType, base64Data);
        if (result.status === "success" && result.imageUrl) {
          document.getElementById("p-image").value = result.imageUrl;
          statusDiv.style.color = "var(--color-success)";
          statusDiv.innerText = "Successfully uploaded to Supabase product-images bucket!";
        } else {
          throw new Error(result.message || "Unknown error from Supabase upload");
        }
      } catch (err) {
        console.error(err);
        statusDiv.style.color = "var(--color-danger)";
        statusDiv.innerText = "Supabase upload failed. Saving compressed Base64 locally.";
        document.getElementById("p-image").value = base64DataWithHeader;
      }
    } else if (settings.googleSheetEnabled && settings.googleSheetUrl) {
      statusDiv.innerText = "Uploading to Google Drive...";
      try {
        const result = await TFL_DB.uploadImageToCloud(fileName, mimeType, base64Data);
        if (result.status === "success" && result.imageUrl) {
          document.getElementById("p-image").value = result.imageUrl;
          statusDiv.style.color = "var(--color-success)";
          statusDiv.innerText = "Successfully uploaded to Google Drive folder 'TFL Product Images'!";
        } else {
          throw new Error(result.message || "Unknown error from Drive upload API");
        }
      } catch (err) {
        console.error(err);
        statusDiv.style.color = "var(--color-danger)";
        statusDiv.innerText = "Drive upload failed. Saving compressed Base64 locally.";
        document.getElementById("p-image").value = base64DataWithHeader;
      }
    } else {
      document.getElementById("p-image").value = base64DataWithHeader;
      statusDiv.style.color = "var(--color-success)";
      statusDiv.innerText = "Cloud sync disabled. Compressed image saved locally as Base64.";
    }
  } catch (err) {
    console.error(err);
    statusDiv.style.color = "var(--color-danger)";
    statusDiv.innerText = "Failed to process/compress image: " + err.message;
  }
}
