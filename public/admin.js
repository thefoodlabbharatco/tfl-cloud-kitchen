// admin.js - Operations Management Dashboard Controller for The Food Lab (TFL)

// Global State
let currentTab = 'dashboard';
let currentOrderFilter = 'all';
let loggedInUser = null;
let currentKpiFilter = 'today';
let knownOrderIds = new Set();
let adminRefreshTimer = null;

function scheduleIdle(callback) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(callback, { timeout: 1500 });
  } else {
    setTimeout(callback, 0);
  }
}

// Initialize Admin Portal
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdminPage);
} else {
  initAdminPage();
}

async function initAdminPage() {
  if (!localStorage.getItem("tfl_theme")) {
    localStorage.setItem("tfl_theme", "light");
  }

  resetLoginFields();
  TFL_DB.initTheme();
  knownOrderIds = new Set(TFL_DB.getOrders().map(order => order.id));
  document.addEventListener("tfl_db_updated", handleDbUpdated);
  checkSession();
  scheduleIdle(loadAdminCloudData);
  
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
}

async function loadAdminCloudData() {
  const settings = TFL_DB.getSettings();
  if (!settings.supabaseEnabled || !settings.supabaseUrl || !settings.supabaseKey) return;

  try {
    await TFL_DB.syncFromSupabase();
    knownOrderIds = new Set(TFL_DB.getOrders().map(order => order.id));
    if (loggedInUser) {
      restrictUI();
      updateSyncStatusIndicator();
      renderTabContent(currentTab);
    }
  } catch (e) {
    console.warn("Initial admin Supabase sync failed.", e);
  }
}

function resetLoginFields() {
  const username = document.getElementById("login-username");
  const password = document.getElementById("login-password");
  if (username) {
    username.value = "";
    username.setAttribute("autocomplete", "off");
  }
  if (password) {
    password.value = "";
    password.setAttribute("autocomplete", "off");
  }
}

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
    resetLoginFields();
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
  const tabPromoCodes = document.getElementById("tab-promocodes");
  const tabCustomization = document.getElementById("tab-customization");
  const tabAdmins = document.getElementById("tab-admins");
  const tabSettings = document.getElementById("tab-settings");
  
  // Actions
  const btnClearDelivered = document.getElementById("btn-clear-delivered");
  
  // Reset visibility
  if (tabProducts) tabProducts.style.display = "flex";
  if (tabSubBrands) tabSubBrands.style.display = "flex";
  if (tabAnnouncements) tabAnnouncements.style.display = "flex";
  if (tabPromoCodes) tabPromoCodes.style.display = "flex";
  if (tabCustomization) tabCustomization.style.display = "flex";
  if (tabAdmins) tabAdmins.style.display = "flex";
  if (tabSettings) tabSettings.style.display = "flex";
  if (btnClearDelivered) btnClearDelivered.style.display = "inline-flex";
  
  if (role === "Staff") {
    // Staff can only manage orders
    if (tabProducts) tabProducts.style.display = "none";
    if (tabSubBrands) tabSubBrands.style.display = "none";
    if (tabAnnouncements) tabAnnouncements.style.display = "none";
    if (tabPromoCodes) tabPromoCodes.style.display = "none";
    if (tabCustomization) tabCustomization.style.display = "none";
    if (tabAdmins) tabAdmins.style.display = "none";
    if (tabSettings) tabSettings.style.display = "none";
    if (btnClearDelivered) btnClearDelivered.style.display = "none";
  } else if (role === "Manager") {
    // Managers can manage products & categories, but not settings/admins/brand
    if (tabCustomization) tabCustomization.style.display = "none";
    if (tabAdmins) tabAdmins.style.display = "none";
    if (tabSettings) tabSettings.style.display = "none";
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
    TFL_DB.updateBrandIcons(settings.brandLogo);
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
    promocodes: "Promo Codes Manager",
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
    case 'promocodes':
      renderPromoCodesTable();
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
      let itemCostTotal = itemCostPrice * item.quantity;
      if (item.condiments && Array.isArray(item.condiments) && origProd && origProd.condiments) {
        item.condiments.forEach(c => {
          const cName = typeof c === 'object' ? c.name : c;
          const cQty = typeof c === 'object' ? (c.quantity || 1) : 1;
          const origCond = origProd.condiments.find(oc => oc.name === cName);
          if (origCond) {
            itemCostTotal += (origCond.costPrice || 0) * cQty;
          }
        });
      }
      orderCost += itemCostTotal;
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
      <td style="font-weight: 700;">
        <div>₹${order.grandTotal}</div>
        ${order.promoCode ? `<div style="font-size: 0.72rem; color: var(--color-success); font-weight: normal;">Code: ${order.promoCode} (-₹${order.discountAmount})</div>` : ''}
      </td>
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
      let itemCostTotal = c * item.quantity;
      if (item.condiments && Array.isArray(item.condiments) && origProd && origProd.condiments) {
        item.condiments.forEach(cond => {
          const cName = typeof cond === 'object' ? cond.name : cond;
          const cQty = typeof cond === 'object' ? (cond.quantity || 1) : 1;
          const origCond = origProd.condiments.find(oc => oc.name === cName);
          if (origCond) {
            itemCostTotal += (origCond.costPrice || 0) * cQty;
          }
        });
      }
      orderCost += itemCostTotal;
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
        ${order.promoCode ? `<div style="font-size: 0.72rem; color: var(--color-success);">Code: ${order.promoCode} (-₹${order.discountAmount})</div>` : ''}
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

function getSubBrandNameById(subBrandId) {
  const subbrand = TFL_DB.getSubBrands().find(s => s.id === subBrandId);
  return subbrand ? subbrand.name : "";
}

function getOrderItemSubBrandId(item) {
  const products = TFL_DB.getProducts();
  const product = products.find(prod => prod.id === item.id);
  return product ? product.category : (item.category || item.subBrand || "");
}

function getProductSubBrandName(product) {
  return getSubBrandNameById(product.category) || product.category || "Unassigned";
}

// Helper for sub-brand greeting
function getSubBrandGreeting(order) {
  const itemCategories = (order.items || []).map(item => {
    const subBrandId = getOrderItemSubBrandId(item);
    return subBrandId || null;
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
  
  const subBrandName = getSubBrandNameById(maxCat);
  if (subBrandName) {
    return `Greetings From ${subBrandName}! Thanks for ordering.`;
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
  message += `Subtotal: Rs ${order.subtotal}\n`;
  if (order.promoCode) {
    message += `Discount (${order.promoCode} - ${order.discountPercent}%): -Rs ${order.discountAmount}\n`;
  }
  message += `Delivery Charges: Rs ${order.deliveryCharge}\n`;
  if (order.lateNightFee && order.lateNightFee > 0) {
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
  csvContent += "Order ID,Date,Name,WhatsApp,Address,Items,Subtotal,Promo Code,Discount %,Discount Amount,Delivery,Late Night Fee,Revenue,Cost,Net Profit,Payment Mode,Payment Status,Delivery Status\n";
  
  orders.forEach(o => {
    const itemsText = o.items.map(i => `${i.name} x${i.quantity}`).join(" | ");
    const escapedAddress = o.customerAddress.replace(/"/g, '""');
    
    // Calculate cost for this specific order
    let orderCost = 0;
    o.items.forEach(item => {
      const origProd = products.find(p => p.id === item.id);
      const itemCostPrice = origProd ? (origProd.costPrice || 0) : 0;
      let itemCostTotal = itemCostPrice * item.quantity;
      if (item.condiments && Array.isArray(item.condiments) && origProd && origProd.condiments) {
        item.condiments.forEach(c => {
          const cName = typeof c === 'object' ? c.name : c;
          const cQty = typeof c === 'object' ? (c.quantity || 1) : 1;
          const origCond = origProd.condiments.find(oc => oc.name === cName);
          if (origCond) {
            itemCostTotal += (origCond.costPrice || 0) * cQty;
          }
        });
      }
      orderCost += itemCostTotal;
    });
    
    const revenue = o.grandTotal;
    const netProfit = revenue - orderCost;
    
    csvContent += `"${o.id}","${o.orderDate}","${o.customerName}","${o.customerPhone}","${escapedAddress}","${itemsText}",${o.subtotal},"${o.promoCode || ''}",${o.discountPercent || 0},${o.discountAmount || 0},${o.deliveryCharge},${o.lateNightFee || 0},${revenue},${orderCost},${netProfit},"${o.paymentMode}","${o.paymentStatus || 'Unpaid'}","${o.status}"\n`;
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
        ${order.promoCode ? `
        <tr style="color: green;">
          <td>Discount (${order.promoCode} - ${order.discountPercent}%)</td>
          <td style="text-align: right;">-₹${(order.discountAmount || 0).toFixed(2)}</td>
        </tr>
        ` : ''}
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
  const settings = TFL_DB.getSettings();
  const container = document.getElementById("products-admin-list");
  container.innerHTML = "";
  updateProductPriceVisibilityButton(settings);
  
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
      ? p.condiments.map(c => typeof c === 'object' ? `${c.name} (Sell: +₹${c.price}, Cost: +₹${c.costPrice || 0})` : c).join(", ") 
      : 'None';
      
    const profit = p.price - p.costPrice;
    const subBrandName = getProductSubBrandName(p);
    
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
      <td><span style="font-size: 0.8rem; font-weight: 600; color: var(--color-primary);">${subBrandName}</span></td>
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

function updateProductPriceVisibilityButton(settings = TFL_DB.getSettings()) {
  const btn = document.getElementById("btn-toggle-product-prices");
  if (!btn) return;
  const pricesHidden = normalizeBoolean(settings.hideProductPrices);
  btn.dataset.hiddenPrices = pricesHidden ? "true" : "false";
  btn.className = `btn ${pricesHidden ? "btn-success" : "btn-secondary"} btn-sm`;
  btn.innerHTML = pricesHidden
    ? `<i data-lucide="eye" style="width: 14px; height: 14px;"></i> Show Prices`
    : `<i data-lucide="eye-off" style="width: 14px; height: 14px;"></i> Hide Prices`;
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function toggleProductPriceVisibility() {
  const btn = document.getElementById("btn-toggle-product-prices");
  const settings = TFL_DB.getSettings();
  const currentHidden = btn?.dataset.hiddenPrices
    ? normalizeBoolean(btn.dataset.hiddenPrices)
    : normalizeBoolean(settings.hideProductPrices);
  const nextHidden = !currentHidden;
  settings.hideProductPrices = nextHidden;
  TFL_DB.saveSettings(settings);
  updateProductPriceVisibilityButton(settings);
  triggerBackgroundSync();
  TFL_DB.showToast(nextHidden ? "Customer menu prices are now hidden." : "Customer menu prices are now visible.", "success");
}

function calculateModalProfit() {
  const cost = parseFloat(document.getElementById("p-cost").value) || 0;
  const price = parseFloat(document.getElementById("p-price").value) || 0;
  const margin = price - cost;
  document.getElementById("p-profit-margin").innerText = `₹${margin.toFixed(2)}`;
}

function syncProductCategorySelection(selectEl) {
  if (!selectEl) return "";
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const selectedValue = selectedOption ? selectedOption.value : selectEl.value;
  selectEl.dataset.currentValue = selectedValue || "";
  return selectEl.dataset.currentValue;
}

function getProductCategorySelection() {
  const selectEl = document.getElementById("p-category");
  const selectedValue = syncProductCategorySelection(selectEl);
  const validSubBrandIds = new Set(TFL_DB.getSubBrands().map(subBrand => subBrand.id));
  if (!selectedValue || !validSubBrandIds.has(selectedValue)) {
    TFL_DB.showToast("Please select a valid sub-brand category.", "error");
    return "";
  }
  return selectedValue;
}

function openProductModal(productId = null) {
  const selectCategory = document.getElementById("p-category");
  selectCategory.innerHTML = "";
  selectCategory.onchange = () => syncProductCategorySelection(selectCategory);
  const product = productId ? TFL_DB.getProducts().find(p => p.id === productId) : null;
  
  // Load current categories/subbrands
  const subbrands = TFL_DB.getSubBrands();
  subbrands.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.innerText = s.name;
    selectCategory.appendChild(opt);
  });
  
  // Render condiments checkboxes checklist
  const baseCondimentsList = getBaseCondimentOptions();
  const hiddenCondiments = (product?.hiddenCondiments || []).map(name => String(name).trim().toLowerCase());
  const savedCondimentNames = (product?.condiments || []).map(c => typeof c === "object" ? c.name : c).filter(Boolean);
  const condimentsList = Array.from(new Set([...baseCondimentsList.filter(name => !hiddenCondiments.includes(name.toLowerCase())), ...savedCondimentNames]));
  const listDiv = document.getElementById("product-condiments-checklist");
  listDiv.innerHTML = "";
  listDiv.dataset.deletedCondiments = JSON.stringify(product?.hiddenCondiments || []);
  condimentsList.forEach(c => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    label.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <input type="checkbox" name="p-condiment-opt" value="${c}" class="checkbox-custom" onchange="toggleCondimentPriceInput(this)">
        <span style="font-size: 0.78rem;">${c}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="font-size: 0.75rem; color: var(--color-text-muted);" title="Selling Price">S:</span>
        <input type="number" name="p-condiment-price-${c.replace(/\s+/g, '_')}" class="form-control condiment-price-input" style="width: 50px; padding: 2px 4px; height: 26px; font-size: 0.8rem; margin: 0;" min="0" value="0" disabled placeholder="Price">
        <span style="font-size: 0.75rem; color: var(--color-text-muted);" title="Cost Price">C:</span>
        <input type="number" name="p-condiment-cost-${c.replace(/\s+/g, '_')}" class="form-control condiment-cost-input" style="width: 50px; padding: 2px 4px; height: 26px; font-size: 0.8rem; margin: 0;" min="0" value="0" disabled placeholder="Cost">
        <button type="button" class="mini-delete-btn" onclick="removeCondimentOption(this)" aria-label="Delete condiment">&times;</button>
      </div>
    `;
    listDiv.appendChild(label);
  });

  document.getElementById("custom-condiment-name").value = "";
  document.getElementById("custom-condiment-price").value = 0;
  document.getElementById("custom-condiment-cost").value = 0;
  document.getElementById("custom-choice-group-name").value = "";
  document.getElementById("custom-choice-option-1").value = "";
  document.getElementById("custom-choice-option-2").value = "";
  const choiceGroupsList = document.getElementById("product-choice-groups-list");
  choiceGroupsList.innerHTML = "";
  (product?.optionGroups || product?.choiceGroups || []).forEach(group => renderChoiceGroupOption(group.name, group.options || group.choices || []));
  
  // Render pairings checklist
  const pairingsChecklist = document.getElementById("product-pairings-checklist");
  if (pairingsChecklist) {
    pairingsChecklist.innerHTML = "";
    const allProducts = TFL_DB.getProducts();
    const otherProducts = allProducts.filter(p => p.id !== productId);
    
    if (otherProducts.length === 0) {
      pairingsChecklist.innerHTML = `<p style="font-size: 0.75rem; color: var(--color-text-muted); padding: 4px;">No other products formulated yet.</p>`;
    } else {
      otherProducts.forEach(op => {
        const label = document.createElement("label");
        label.className = "checkbox-label";
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "6px";
        label.style.marginBottom = "2px";
        
        const isChecked = product && product.pairings && product.pairings.includes(op.id) ? "checked" : "";
        
        label.innerHTML = `
          <input type="checkbox" name="p-pairing-opt" value="${op.id}" class="checkbox-custom" ${isChecked}>
          <span style="font-size: 0.78rem;">${op.name} (₹${op.price})</span>
        `;
        pairingsChecklist.appendChild(label);
      });
    }
  }

  if (productId) {
    // Edit Mode
    document.getElementById("product-modal-title").innerText = "Modify Formulation";
    document.getElementById("product-modal-id").value = product.id;
    document.getElementById("p-name").value = product.name;
    document.getElementById("p-desc").value = product.description;
    document.getElementById("p-category").value = product.category;
    syncProductCategorySelection(selectCategory);
    document.getElementById("p-image").value = product.image;
    document.getElementById("p-cost").value = product.costPrice || 0;
    document.getElementById("p-price").value = product.price;
    document.getElementById("p-veg").checked = product.veg;
    document.getElementById("p-bestseller").checked = product.bestseller;
    
    // Check checkboxes and set prices/costs
    if (product.condiments) {
      document.querySelectorAll('input[name="p-condiment-opt"]').forEach(cb => {
        const found = product.condiments.find(c => (typeof c === 'object' ? c.name : c) === cb.value);
        if (found) {
          cb.checked = true;
          const priceInput = cb.closest(".checkbox-label")?.querySelector('.condiment-price-input');
          if (priceInput) {
            priceInput.disabled = false;
            priceInput.value = typeof found === 'object' ? found.price : 0;
          }
          const costInput = cb.closest(".checkbox-label")?.querySelector('.condiment-cost-input');
          if (costInput) {
            costInput.disabled = false;
            costInput.value = typeof found === 'object' ? (found.costPrice || 0) : 0;
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
    syncProductCategorySelection(selectCategory);
    document.getElementById("p-profit-margin").innerText = "₹0.00";
    document.getElementById("p-image-status").style.display = "none";
    document.querySelectorAll('input[name^="p-condiment-price-"], input[name^="p-condiment-cost-"]').forEach(inp => {
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
  const category = getProductCategorySelection();
  if (!category) return;
  const image = document.getElementById("p-image").value.trim();
  const cost = parseFloat(document.getElementById("p-cost").value) || 0;
  const price = parseFloat(document.getElementById("p-price").value) || 0;
  const veg = document.getElementById("p-veg").checked;
  const bestseller = document.getElementById("p-bestseller").checked;
  
  const checkedBoxes = document.querySelectorAll('input[name="p-condiment-opt"]:checked');
  const condimentsListEl = document.getElementById("product-condiments-checklist");
  const hiddenCondiments = JSON.parse(condimentsListEl?.dataset.deletedCondiments || "[]");
  const condiments = Array.from(checkedBoxes).map(cb => {
    const name = cb.value;
    const priceInput = cb.closest(".checkbox-label")?.querySelector('.condiment-price-input');
    const price = priceInput ? (parseFloat(priceInput.value) || 0) : 0;
    const costInput = cb.closest(".checkbox-label")?.querySelector('.condiment-cost-input');
    const costPrice = costInput ? (parseFloat(costInput.value) || 0) : 0;
    return { name, price, costPrice };
  });
  
  const checkedPairings = document.querySelectorAll('input[name="p-pairing-opt"]:checked');
  const pairings = Array.from(checkedPairings).map(cb => cb.value);

  const optionGroups = Array.from(document.querySelectorAll("#product-choice-groups-list .choice-group-card")).map(card => ({
    name: card.querySelector(".choice-group-title-input")?.value.trim() || "",
    options: Array.from(card.querySelectorAll(".choice-option-input")).map(input => input.value.trim()).filter(Boolean)
  })).filter(group => group.name && group.options.length >= 2);
  
  const products = TFL_DB.getProducts();
  
  if (id) {
    // Edit Product
    const index = products.findIndex(p => p.id === id);
    if (index === -1) {
      TFL_DB.showToast("Product could not be found. Please refresh and try again.", "error");
      return;
    }
    const existingProduct = products[index];
    products[index] = {
      ...existingProduct,
      name,
      description: desc,
      category,
      image,
      costPrice: cost,
      price,
      veg,
      bestseller,
      condiments,
      hiddenCondiments,
      optionGroups,
      pairings
    };
  } else {
    // Add Product
    const newId = "p-" + Date.now();
    products.push({
      id: newId,
      name, description: desc, category, image, costPrice: cost, price, veg, bestseller, condiments, hiddenCondiments, optionGroups, pairings,
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
  const logoStatus = document.getElementById("sb-logo-status");
  if (logoStatus) {
    logoStatus.style.display = "none";
    logoStatus.innerText = "";
  }

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
  const nextId = TFL_DB.makeSubBrandId ? TFL_DB.makeSubBrandId(name) : name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  
  const subbrands = TFL_DB.getSubBrands();
  
  if (id) {
    const index = subbrands.findIndex(s => s.id === id);
    if (index === -1) {
      TFL_DB.showToast("Sub-brand could not be found. Please refresh and try again.", "error");
      return;
    }
    const previousId = subbrands[index]?.id;
    subbrands[index] = { ...subbrands[index], id: nextId, name, logo, sortOrder: sort, visible };
    if (previousId && previousId !== nextId) {
      const products = TFL_DB.getProducts().map(product => (
        product.category === previousId ? { ...product, category: nextId } : product
      ));
      TFL_DB.saveProducts(products);
    }
  } else {
    subbrands.push({ id: nextId, name, logo, sortOrder: sort, visible });
  }
  
  TFL_DB.saveSubBrands(subbrands);
  closeSubBrandModal();
  renderSubBrandsTable();
  renderProductsTable();
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

// --- TAB: PROMO CODES LOGIC (CRUD) ---
function renderPromoCodesTable() {
  const promocodes = TFL_DB.getPromoCodes ? TFL_DB.getPromoCodes() : [];
  const container = document.getElementById("promocodes-admin-list");
  if (!container) return;
  container.innerHTML = "";
  
  if (promocodes.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--color-text-muted);">
          No promo codes formulated yet. Click 'Add Promo Code' to begin!
        </td>
      </tr>
    `;
    return;
  }
  
  promocodes.forEach(p => {
    const activeBadge = p.active 
      ? `<span class="badge badge-veg">Active</span>` 
      : `<span class="badge badge-nonveg">Inactive</span>`;
      
    const todayStr = new Date().toISOString().split('T')[0];
    const isExpired = p.validTill && p.validTill < todayStr;
    const expiredLabel = isExpired 
      ? `<span class="badge badge-nonveg" style="margin-left: 4px;">Expired</span>` 
      : '';

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong style="color: #fff; text-transform: uppercase;">${p.code}</strong></td>
      <td><strong>${p.discountPercent}%</strong></td>
      <td>
        <span>${p.validTill || 'No Expiry'}</span>
        ${expiredLabel}
      </td>
      <td>
        <label class="checkbox-label" style="font-size: 0.8rem; margin: 0;">
          <input type="checkbox" class="checkbox-custom" ${p.active ? 'checked' : ''} onchange="togglePromoCodeActive('${p.code}', this.checked)">
          <span>${p.active ? 'Active' : 'Inactive'}</span>
        </label>
      </td>
      <td>
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-secondary btn-sm" onclick="openPromoCodeModal('${p.code}')" style="padding: 4px 8px;">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deletePromoCode('${p.code}')" style="padding: 4px 8px;"><i data-lucide="trash" style="width: 12px; height: 12px;"></i></button>
        </div>
      </td>
    `;
    container.appendChild(row);
  });
}

function openPromoCodeModal(codeName = null) {
  if (codeName) {
    const p = TFL_DB.getPromoCodes().find(x => x.code === codeName);
    document.getElementById("promocode-modal-title").innerText = "Modify Promo Code";
    document.getElementById("promocode-modal-id").value = p.code;
    document.getElementById("pc-code").value = p.code;
    document.getElementById("pc-code").disabled = true;
    document.getElementById("pc-discount").value = p.discountPercent;
    document.getElementById("pc-valid-till").value = p.validTill || "";
    document.getElementById("pc-active").checked = p.active;
  } else {
    document.getElementById("promocode-modal-title").innerText = "Configure New Promo Code";
    document.getElementById("promocode-form").reset();
    document.getElementById("promocode-modal-id").value = "";
    document.getElementById("pc-code").disabled = false;
    document.getElementById("pc-valid-till").value = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    document.getElementById("pc-active").checked = true;
  }
  document.getElementById("promocode-modal").classList.add("active");
  document.getElementById("admin-modal-backdrop").classList.add("active");
}

function closePromoCodeModal() {
  document.getElementById("promocode-modal").classList.remove("active");
  document.getElementById("admin-modal-backdrop").classList.remove("active");
}

async function handlePromoCodeSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("promocode-modal-id").value;
  const code = document.getElementById("pc-code").value.trim().toUpperCase();
  const discountPercent = parseFloat(document.getElementById("pc-discount").value) || 0;
  const validTill = document.getElementById("pc-valid-till").value;
  const active = document.getElementById("pc-active").checked;
  
  const promocodes = TFL_DB.getPromoCodes ? TFL_DB.getPromoCodes() : [];
  
  if (id) {
    const index = promocodes.findIndex(x => x.code === id);
    if (index !== -1) {
      promocodes[index] = { code: id, discountPercent, validTill, active };
    }
  } else {
    const exists = promocodes.some(x => x.code.toUpperCase() === code);
    if (exists) {
      TFL_DB.showToast("This promo code name already exists.", "error");
      return;
    }
    promocodes.push({ code, discountPercent, validTill, active });
  }
  
  TFL_DB.savePromoCodes(promocodes);
  closePromoCodeModal();
  renderPromoCodesTable();
  triggerBackgroundSync();
}

async function togglePromoCodeActive(codeName, isChecked) {
  const promocodes = TFL_DB.getPromoCodes ? TFL_DB.getPromoCodes() : [];
  const index = promocodes.findIndex(x => x.code === codeName);
  if (index !== -1) {
    promocodes[index].active = isChecked;
    TFL_DB.savePromoCodes(promocodes);
    renderPromoCodesTable();
    triggerBackgroundSync();
  }
}

async function deletePromoCode(codeName) {
  if (confirm(`Are you sure you want to delete promo code ${codeName}?`)) {
    const promocodes = TFL_DB.getPromoCodes ? TFL_DB.getPromoCodes() : [];
    const filtered = promocodes.filter(x => x.code !== codeName);
    TFL_DB.savePromoCodes(filtered);
    renderPromoCodesTable();
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
  
  const qrStatus = document.getElementById("settings-upi-qr-status");
  if (qrStatus) {
    qrStatus.style.display = "none";
    qrStatus.innerText = "";
  }
  
  document.getElementById("settings-sheet-toggle").checked = settings.googleSheetEnabled;
  document.getElementById("settings-sheet-url").value = settings.googleSheetUrl || "";
  document.getElementById("settings-supabase-toggle").checked = settings.supabaseEnabled || false;
  document.getElementById("settings-supabase-url").value = settings.supabaseUrl || "";
  document.getElementById("settings-supabase-key").value = settings.supabaseKey || "";
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
  closePromoCodeModal();
}

// --- SYNC SERVICES ---
function updateSyncStatusIndicator() {
  const settings = TFL_DB.getSettings();
  const syncState = TFL_DB.getSyncState ? TFL_DB.getSyncState() : { pending: 0, syncing: false, lastError: null, online: true };
  const banner = document.getElementById("db-sync-status-banner");
  
  if (!banner) return;
  
  if (settings.supabaseEnabled && settings.supabaseUrl && settings.supabaseKey) {
    banner.style.display = "inline-flex";
    banner.style.removeProperty("background-color");
    if (!syncState.online) {
      banner.className = "badge sync-banner unsynced";
      banner.innerHTML = `<i data-lucide="wifi-off" style="width: 12px; height: 12px; margin-right: 4px;"></i> Offline`;
    } else if (syncState.syncing) {
      banner.className = "badge sync-banner";
      banner.innerHTML = `<i data-lucide="loader-2" class="anim-spin" style="width: 12px; height: 12px; margin-right: 4px;"></i> Syncing`;
    } else if (syncState.pending > 0) {
      banner.className = "badge sync-banner unsynced";
      banner.innerHTML = `<i data-lucide="cloud-upload" style="width: 12px; height: 12px; margin-right: 4px;"></i> ${syncState.pending} Pending`;
    } else if (syncState.lastError) {
      banner.className = "badge sync-banner unsynced";
      banner.innerHTML = `<i data-lucide="alert-triangle" style="width: 12px; height: 12px; margin-right: 4px;"></i> Retry Ready`;
    } else {
      banner.className = "badge sync-banner synced";
      banner.innerHTML = `<i data-lucide="database" style="width: 12px; height: 12px; margin-right: 4px;"></i> Supabase Synced`;
    }
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
  const inputs = checkbox.closest(".checkbox-label")?.querySelectorAll('input[type="number"]');
  if (inputs) {
    inputs.forEach(inp => {
      inp.disabled = !checkbox.checked;
      if (!checkbox.checked) {
        inp.value = 0;
      }
    });
  }
}

function getBaseCondimentOptions() {
  return ["Add Onion Filling", "Extra onion", "Green chutney", "Mint chutney", "Raita", "Achaar", "Extra butter", "Extra roti", "Spicy", "Less spicy"];
}

function removeCondimentOption(button) {
  const row = button.closest(".checkbox-label");
  const listDiv = document.getElementById("product-condiments-checklist");
  const input = row?.querySelector('input[name="p-condiment-opt"]');
  const name = input?.value || "";
  if (!row || !listDiv || !name) return;

  const baseNames = getBaseCondimentOptions().map(option => option.toLowerCase());
  const deleted = JSON.parse(listDiv.dataset.deletedCondiments || "[]");
  if (baseNames.includes(name.toLowerCase()) && !deleted.some(option => option.toLowerCase() === name.toLowerCase())) {
    deleted.push(name);
    listDiv.dataset.deletedCondiments = JSON.stringify(deleted);
  }
  row.remove();
}

function addCustomCondimentOption() {
  const nameInput = document.getElementById("custom-condiment-name");
  const priceInput = document.getElementById("custom-condiment-price");
  const costInput = document.getElementById("custom-condiment-cost");
  const name = (nameInput?.value || "").trim();
  const price = parseFloat(priceInput?.value || "0") || 0;
  const cost = parseFloat(costInput?.value || "0") || 0;
  const listDiv = document.getElementById("product-condiments-checklist");

  if (!name) {
    TFL_DB.showToast("Enter a condiment name first.", "warning");
    nameInput?.focus();
    return;
  }

  const exists = Array.from(listDiv.querySelectorAll('input[name="p-condiment-opt"]'))
    .some(input => input.value.trim().toLowerCase() === name.toLowerCase());
  if (exists) {
    TFL_DB.showToast("This condiment already exists for this item.", "warning");
    return;
  }

  const label = document.createElement("label");
  label.className = "checkbox-label";
  const safeValue = name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const deleted = JSON.parse(listDiv.dataset.deletedCondiments || "[]")
    .filter(option => option.toLowerCase() !== name.toLowerCase());
  listDiv.dataset.deletedCondiments = JSON.stringify(deleted);

  label.innerHTML = `
    <div style="display: flex; align-items: center; gap: 6px;">
      <input type="checkbox" name="p-condiment-opt" value="${safeValue}" class="checkbox-custom" checked onchange="toggleCondimentPriceInput(this)">
      <span style="font-size: 0.78rem;"></span>
    </div>
    <div style="display: flex; align-items: center; gap: 4px;">
      <span style="font-size: 0.75rem; color: var(--color-text-muted);">S:</span>
      <input type="number" name="p-condiment-price-${safeValue.replace(/\s+/g, '_')}" class="form-control condiment-price-input" style="width: 50px; padding: 2px 4px; height: 26px; font-size: 0.8rem; margin: 0;" min="0" value="${price}">
      <span style="font-size: 0.75rem; color: var(--color-text-muted);">C:</span>
      <input type="number" name="p-condiment-cost-${safeValue.replace(/\s+/g, '_')}" class="form-control condiment-cost-input" style="width: 50px; padding: 2px 4px; height: 26px; font-size: 0.8rem; margin: 0;" min="0" value="${cost}">
      <button type="button" class="mini-delete-btn" onclick="removeCondimentOption(this)" aria-label="Delete condiment">&times;</button>
    </div>
  `;
  label.querySelector("span").innerText = name;
  listDiv.appendChild(label);
  if (nameInput) nameInput.value = "";
  if (priceInput) priceInput.value = 0;
}

function renderChoiceGroupOption(name, options) {
  const listDiv = document.getElementById("product-choice-groups-list");
  if (!listDiv || !name || !Array.isArray(options) || options.length === 0) return;
  const cleanName = String(name).trim();
  const cleanOptions = Array.from(new Set(options.map(option => String(option).trim()).filter(Boolean)));
  if (!cleanName || cleanOptions.length === 0) return;

  const exists = Array.from(listDiv.querySelectorAll(".choice-group-card"))
    .some(card => (card.querySelector(".choice-group-title-input")?.value || "").trim().toLowerCase() === cleanName.toLowerCase());
  if (exists) {
    TFL_DB.showToast("This radio group already exists for this item.", "warning");
    return;
  }

  const card = document.createElement("div");
  card.className = "choice-group-card";

  const header = document.createElement("div");
  header.className = "choice-group-card-header";

  const title = document.createElement("input");
  title.type = "text";
  title.className = "form-control choice-group-title-input";
  title.value = cleanName;
  title.placeholder = "Radio title";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-secondary";
  removeBtn.style.padding = "0.35rem 0.6rem";
  removeBtn.innerText = "Delete";
  removeBtn.onclick = () => card.remove();

  const optionsEditor = document.createElement("div");
  optionsEditor.className = "choice-options-editor";
  cleanOptions.forEach(option => appendChoiceOptionInput(optionsEditor, option));

  const addOptionBtn = document.createElement("button");
  addOptionBtn.type = "button";
  addOptionBtn.className = "btn btn-secondary";
  addOptionBtn.style.marginTop = "8px";
  addOptionBtn.style.width = "fit-content";
  addOptionBtn.innerText = "Add Option";
  addOptionBtn.onclick = () => appendChoiceOptionInput(optionsEditor, "");

  header.appendChild(title);
  header.appendChild(removeBtn);
  card.appendChild(header);
  card.appendChild(optionsEditor);
  card.appendChild(addOptionBtn);
  listDiv.appendChild(card);
}

function appendChoiceOptionInput(container, value = "") {
  const row = document.createElement("div");
  row.className = "choice-option-editor-row";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "form-control choice-option-input";
  input.value = value;
  input.placeholder = `Radio option ${container.querySelectorAll(".choice-option-input").length + 1}`;

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "mini-delete-btn";
  deleteBtn.setAttribute("aria-label", "Delete radio option");
  deleteBtn.innerHTML = "&times;";
  deleteBtn.onclick = () => row.remove();

  row.appendChild(input);
  row.appendChild(deleteBtn);
  container.appendChild(row);
}

function addChoiceGroupOption() {
  const groupInput = document.getElementById("custom-choice-group-name");
  const optionOneInput = document.getElementById("custom-choice-option-1");
  const optionTwoInput = document.getElementById("custom-choice-option-2");
  const groupName = (groupInput?.value || "").trim();
  const options = [optionOneInput?.value || "", optionTwoInput?.value || ""].map(option => option.trim()).filter(Boolean);

  if (!groupName) {
    TFL_DB.showToast("Enter a radio group name first.", "warning");
    groupInput?.focus();
    return;
  }
  if (options.length < 2) {
    TFL_DB.showToast("Add at least option 1 and option 2.", "warning");
    optionOneInput?.focus();
    return;
  }

  renderChoiceGroupOption(groupName, options);
  if (groupInput) groupInput.value = "";
  if (optionOneInput) optionOneInput.value = "";
  if (optionTwoInput) optionTwoInput.value = "";
}

function compressImage(file, maxWidth, maxHeight, quality, outputMimeType = "image/webp") {
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
        const compressedDataUrl = canvas.toDataURL(outputMimeType, quality);
        resolve(compressedDataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

async function uploadOptimizedImage(input, targetInputId, statusId, options = {}) {
  const file = input.files[0];
  if (!file) return;

  const statusDiv = document.getElementById(statusId);
  const targetInput = document.getElementById(targetInputId);
  if (!statusDiv || !targetInput) return;

  const maxWidth = options.maxWidth || 800;
  const maxHeight = options.maxHeight || 800;
  const quality = options.quality || 0.82;
  const prefix = options.prefix || "image";
  const mimeType = "image/webp";

  statusDiv.style.display = "block";
  statusDiv.style.color = "var(--color-primary)";
  statusDiv.innerText = "Optimizing image to WebP...";

  try {
    const base64DataWithHeader = await compressImage(file, maxWidth, maxHeight, quality, mimeType);
    if (!base64DataWithHeader) {
      throw new Error("Compression resulted in empty data");
    }

    const commaIdx = base64DataWithHeader.indexOf(",");
    const base64Data = base64DataWithHeader.substring(commaIdx + 1);
    let fileName = file.name || `${prefix}_image.webp`;
    const extIdx = fileName.lastIndexOf(".");
    if (extIdx !== -1) {
      fileName = `${prefix}-${fileName.substring(0, extIdx)}.webp`;
    } else {
      fileName = `${prefix}-${fileName}.webp`;
    }

    const settings = TFL_DB.getSettings();

    if (settings.supabaseEnabled && settings.supabaseUrl && settings.supabaseKey) {
      statusDiv.innerText = "Uploading to Supabase Storage...";
      try {
        const result = await TFL_DB.uploadImageToCloud(fileName, mimeType, base64Data);
        if (result.status === "success" && result.imageUrl) {
          targetInput.value = result.imageUrl;
          statusDiv.style.color = "var(--color-success)";
          statusDiv.innerText = "Uploaded as optimized WebP to Supabase Storage.";
        } else {
          throw new Error(result.message || "Unknown error from Supabase upload");
        }
      } catch (err) {
        console.error(err);
        statusDiv.style.color = "var(--color-danger)";
        statusDiv.innerText = "Supabase upload failed. Optimized image saved locally.";
        targetInput.value = base64DataWithHeader;
      }
    } else {
      targetInput.value = base64DataWithHeader;
      statusDiv.style.color = "var(--color-success)";
      statusDiv.innerText = "Supabase not configured. Optimized image saved locally.";
    }
  } catch (err) {
    console.error(err);
    statusDiv.style.color = "var(--color-danger)";
    statusDiv.innerText = "Failed to optimize image: " + err.message;
  } finally {
    input.value = "";
  }
}

async function handleProductImageUpload(input) {
  return uploadOptimizedImage(input, "p-image", "p-image-status", {
    maxWidth: 800,
    maxHeight: 800,
    quality: 0.82,
    prefix: "product"
  });
}

async function handleAdminImageUpload(input, targetInputId, statusId, options = {}) {
  return uploadOptimizedImage(input, targetInputId, statusId, options);
}


