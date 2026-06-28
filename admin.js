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
    checkLowStockAlerts();
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
    speakText("New order received");
    TFL_DB.showToast(`New order received: ${newPendingOrders[0].id}`, "success");
  }
}

function speakText(text) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(v => v.lang.startsWith("en-"));
      if (englishVoice) utterance.voice = englishVoice;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis failed:", e);
    }
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
    inventory: "Daily Stock & Inventory Control",
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
  const overlay = document.getElementById("sidebar-overlay");
  sidebar.classList.toggle("active");
  if (overlay) {
    overlay.classList.toggle("active");
  }
}

// Render tabs logic routing
function renderTabContent(tabId) {
  // Auto-close sidebar on mobile after clicking
  if (window.innerWidth <= 900) {
    document.getElementById("dashboard-sidebar").classList.remove("active");
    const overlay = document.getElementById("sidebar-overlay");
    if (overlay) {
      overlay.classList.remove("active");
    }
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
    case 'inventory':
      renderInventoryTable();
      break;
  }
  lucide.createIcons();
}

// --- TAB: DASHBOARD LOGIC ---
function filterKPIs(range) {
  currentKpiFilter = range;
  if (range !== 'custom') {
    const picker = document.getElementById("kpi-date-picker");
    if (picker) picker.value = "";
  }
  renderDashboard();
}

function clearKpiDatePicker() {
  const picker = document.getElementById("kpi-date-picker");
  if (picker) {
    picker.value = "";
    picker.type = "text";
  }
  filterKPIs('today');
}

function filterOrdersByDate() {
  renderOrdersTable();
}

function clearOrderDatePicker() {
  const picker = document.getElementById("order-date-picker");
  if (picker) {
    picker.value = "";
    picker.type = "text";
  }
  renderOrdersTable();
}

function formatCustomDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const year = parts[0];
  const monthNum = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[monthNum] || parts[1]} ${year}`;
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
  const customDatePicker = document.getElementById("kpi-date-picker");
  const customDateVal = customDatePicker ? customDatePicker.value : "";

  const isInPeriod = (order) => {
    const orderTime = TFL_DB.getOrderTime(order);
    if (!orderTime) return false;
    const oDate = new Date(orderTime);

    if (currentKpiFilter === 'custom') {
      if (!customDateVal) return false;
      const orderLocalDateStr = oDate.getFullYear() + '-' + String(oDate.getMonth() + 1).padStart(2, '0') + '-' + String(oDate.getDate()).padStart(2, '0');
      return orderLocalDateStr === customDateVal;
    } else if (currentKpiFilter === 'today') {
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
  let totalDiscounts = 0;
  
  deliveredOrders.forEach(order => {
    totalRevenue += order.grandTotal;
    totalDelivery += (order.deliveryCharge || 0);
    totalLateNight += (order.lateNightFee || 0);
    totalDiscounts += (order.discountAmount || 0);
    
    // Calculate cost of items inside order
    let orderCost = 0;
    order.items.forEach(item => {
      const origProd = products.find(p => p.id === item.id);
      const baseCost = item.costPrice !== undefined ? item.costPrice : (origProd ? (origProd.costPrice || 0) : 0);
      let itemCostTotal = baseCost * item.quantity;
      if (item.condiments && Array.isArray(item.condiments)) {
        item.condiments.forEach(c => {
          const cName = typeof c === 'object' ? c.name : c;
          const cQty = typeof c === 'object' ? (c.quantity || 1) : 1;
          if (typeof c === 'object' && c.costPrice !== undefined) {
            itemCostTotal += c.costPrice * cQty;
          } else if (origProd && origProd.condiments) {
            const origCond = origProd.condiments.find(oc => oc.name === cName);
            if (origCond) {
              itemCostTotal += (origCond.costPrice || 0) * cQty;
            }
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
    month: "This Month's Orders",
    custom: customDateVal ? `Orders on ${formatCustomDate(customDateVal)}` : "Select Date..."
  };
  
  const ordersLabelEl = document.getElementById("kpi-orders-label");
  if (ordersLabelEl) {
    ordersLabelEl.innerText = labelMap[currentKpiFilter] || "Orders List";
  }
  
  document.getElementById("kpi-orders-count").innerText = filteredOrders.length;
  document.getElementById("kpi-sales").innerText = `₹${totalRevenue.toFixed(0)}`;
  document.getElementById("kpi-cost").innerText = `₹${totalCost.toFixed(0)}`;
  document.getElementById("kpi-delivery").innerText = `₹${totalDelivery.toFixed(0)}`;
  document.getElementById("kpi-late-night").innerText = `₹${totalLateNight.toFixed(0)}`;
  document.getElementById("kpi-profit").innerText = `₹${totalProfit.toFixed(0)}`;
  const kpiDiscountsEl = document.getElementById("kpi-discounts");
  if (kpiDiscountsEl) {
    kpiDiscountsEl.innerText = `₹${totalDiscounts.toFixed(0)}`;
  }
  
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
      <td data-label="Order ID" style="font-weight: 600; color: var(--color-primary);">${order.id}</td>
      <td data-label="Time">${timeStr}</td>
      <td data-label="Customer Info">
        <div><strong>${order.customerName} ${order.customerGender ? `(${order.customerGender})` : ''}</strong></div>
        <div style="font-size: 0.75rem; color: var(--color-text-muted);">${order.customerPhone}</div>
      </td>
      <td data-label="Items Summary" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsSummary}">${itemsSummary}</td>
      <td data-label="Net Price" style="font-weight: 700;">
        <div>₹${order.grandTotal}</div>
        ${order.promoCode ? `<div style="font-size: 0.72rem; color: var(--color-success); font-weight: normal;">Code: ${order.promoCode} (-₹${order.discountAmount})</div>` : ''}
      </td>
      <td data-label="Payment Mode">${order.paymentMode}</td>
      <td data-label="Payment Status"><span class="status-pill status-${(order.paymentStatus || 'Unpaid').toLowerCase()}">${order.paymentStatus || 'Unpaid'}</span></td>
      <td data-label="Delivery Status"><span class="status-pill status-${order.status.toLowerCase()}">${order.status}</span></td>
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
  
  const datePicker = document.getElementById("order-date-picker");
  const selectedDate = datePicker ? datePicker.value : "";

  let filtered = orders;
  if (currentOrderFilter !== 'all') {
    filtered = filtered.filter(o => o.status === currentOrderFilter);
  }
  
  if (selectedDate) {
    filtered = filtered.filter(o => {
      const orderTime = TFL_DB.getOrderTime(o);
      if (!orderTime) return false;
      const oDate = new Date(orderTime);
      const orderLocalDateStr = oDate.getFullYear() + '-' + String(oDate.getMonth() + 1).padStart(2, '0') + '-' + String(oDate.getDate()).padStart(2, '0');
      return orderLocalDateStr === selectedDate;
    });
  }
  
  if (filtered.length === 0) {
    const dateLabel = selectedDate ? ` on ${formatCustomDate(selectedDate)}` : '';
    container.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--color-text-muted); padding: var(--space-xl) 0;">
          <i data-lucide="archive" style="width: 48px; height: 48px; stroke-width: 1; margin-bottom: 12px;"></i>
          <p>No orders cataloged under "${currentOrderFilter}" status${dateLabel}.</p>
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
      const preOrderBadgeHtml = item.is_backorder 
        ? ` <span class="status-pill status-pending" style="font-size: 0.62rem; padding: 1px 4px; background: rgba(245, 158, 11, 0.15) !important; color: #f59e0b !important; border: 1px solid rgba(245, 158, 11, 0.3) !important; font-weight: 700;">Pre-Order (+${item.prep_delay_minutes || 20}m)</span>`
        : "";
      itemsDetailHtml += `<div>• ${item.name} x ${item.quantity}${condimentText}${preOrderBadgeHtml}</div>`;
    });
    
    // Calculate cost details for Owner/Manager transparency
    let orderCost = 0;
    order.items.forEach(item => {
      const origProd = products.find(p => p.id === item.id);
      const baseCost = item.costPrice !== undefined ? item.costPrice : (origProd ? (origProd.costPrice || 0) : 0);
      let itemCostTotal = baseCost * item.quantity;
      if (item.condiments && Array.isArray(item.condiments)) {
        item.condiments.forEach(cond => {
          const cName = typeof cond === 'object' ? cond.name : cond;
          const cQty = typeof cond === 'object' ? (cond.quantity || 1) : 1;
          if (typeof cond === 'object' && cond.costPrice !== undefined) {
            itemCostTotal += cond.costPrice * cQty;
          } else if (origProd && origProd.condiments) {
            const origCond = origProd.condiments.find(oc => oc.name === cName);
            if (origCond) {
              itemCostTotal += (origCond.costPrice || 0) * cQty;
            }
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
      <td data-label="Order ID" style="font-weight: 600; color: var(--color-primary);">${order.id}</td>
      <td data-label="Date / Time" style="font-size: 0.8rem; line-height: 1.3;">
        <div>${order.orderDate.split(', ')[0]}</div>
        <div style="color: var(--color-text-muted);">${order.orderDate.split(', ')[1] || ''}</div>
      </td>
      <td data-label="Customer Info" style="font-size: 0.82rem; line-height: 1.4; max-width: 150px;">
        <strong>${order.customerName} ${order.customerGender ? `(${order.customerGender})` : ''}</strong><br>
        WhatsApp: <a href="https://wa.me/${formatWhatsAppNumber(order.customerPhone)}" target="_blank" style="color: var(--color-primary); text-decoration: none;">${order.customerPhone}</a><br>
        <span style="font-size: 0.75rem; color: var(--color-text-muted); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${order.customerAddress}">${order.customerAddress}</span>
        ${order.customerIp ? `<span style="font-size: 0.7rem; color: var(--color-warning); display: block; margin-top: 2px;">IP: ${order.customerIp}</span>` : ''}
      </td>
      <td data-label="Formulation Details" style="font-size: 0.8rem; line-height: 1.4;">${itemsDetailHtml}</td>
      <td data-label="Invoice">
        <div style="font-weight: 700; color: #fff;">₹${order.grandTotal}</div>
        ${order.promoCode ? `<div style="font-size: 0.72rem; color: var(--color-success);">Code: ${order.promoCode} (-₹${order.discountAmount})</div>` : ''}
        ${financialInfoHtml}
      </td>
      <td data-label="Payment Mode" style="font-size: 0.8rem;">${order.paymentMode}</td>
      <td data-label="Payment Status"><span class="status-pill status-${paymentStatus.toLowerCase()}">${paymentStatus}</span></td>
      <td data-label="Delivery Status"><span class="status-pill status-${order.status.toLowerCase()}">${order.status}</span></td>
      <td data-label="Operations">
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
  message += `Delivery Charges: Rs ${order.deliveryCharge === 0 ? '0 (Free)' : order.deliveryCharge}\n`;
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
    const itemsText = o.items.map(i => `${i.name} x${i.quantity}${i.is_backorder ? ' (Pre-Order)' : ''}`).join(" | ");
    const escapedAddress = o.customerAddress.replace(/"/g, '""');
    
    // Calculate cost for this specific order
    let orderCost = 0;
    o.items.forEach(item => {
      const origProd = products.find(p => p.id === item.id);
      const baseCost = item.costPrice !== undefined ? item.costPrice : (origProd ? (origProd.costPrice || 0) : 0);
      let itemCostTotal = baseCost * item.quantity;
      if (item.condiments && Array.isArray(item.condiments)) {
        item.condiments.forEach(c => {
          const cName = typeof c === 'object' ? c.name : c;
          const cQty = typeof c === 'object' ? (c.quantity || 1) : 1;
          if (typeof c === 'object' && c.costPrice !== undefined) {
            itemCostTotal += c.costPrice * cQty;
          } else if (origProd && origProd.condiments) {
            const origCond = origProd.condiments.find(oc => oc.name === cName);
            if (origCond) {
              itemCostTotal += (origCond.costPrice || 0) * cQty;
            }
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
    const preOrderBadgeText = item.is_backorder 
      ? ` <span style="font-size: 0.65rem; color: #f97316; font-weight: bold; border: 1px solid #f97316; padding: 1px 3px; border-radius: 3px; text-transform: uppercase;">Pre-Order (+${item.prep_delay_minutes || 20}m)</span>`
      : "";
    itemsHtml += `
      <tr>
        <td style="padding: 4px 0;">${item.name} x ${item.quantity}${preOrderBadgeText}</td>
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
          <td style="text-align: right;">${order.deliveryCharge === 0 ? 'Free' : `₹${order.deliveryCharge.toFixed(2)}`}</td>
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
      
    let bestsellerBadge = "";
    if (p.tags && Array.isArray(p.tags)) {
      p.tags.forEach(tag => {
        const cleanTag = tag.trim();
        if (cleanTag) {
          const badgeClass = cleanTag.toLowerCase() === 'bestseller' ? 'badge-offer' : 'badge-veg';
          bestsellerBadge += `<span class="badge ${badgeClass}" style="margin-left: 2px;">${cleanTag}</span>`;
        }
      });
    } else if (p.bestseller) {
      bestsellerBadge = `<span class="badge badge-offer">Bestseller</span>`;
    }
      
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
      <td data-label="Product Info" style="display: flex; gap: var(--space-md); align-items: center;">
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
      <td data-label="Category"><span style="font-size: 0.8rem; font-weight: 600; color: var(--color-primary);">${subBrandName}</span></td>
      <td data-label="Price Details">
        <div>Sell: <strong>₹${p.price}</strong></div>
        <div style="font-size: 0.75rem; color: var(--color-text-muted);">Cost: ₹${p.costPrice}</div>
        <div style="font-size: 0.75rem; color: var(--color-success); font-weight: 600;">Margin: ₹${profit}</div>
      </td>
      <td data-label="Allowed Condiments" style="font-size: 0.75rem; color: var(--color-text-muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${allowedConds}">${allowedConds}</td>
      <td data-label="Stock">
        <label class="checkbox-label" style="font-size: 0.8rem;">
          <input type="checkbox" class="checkbox-custom" ${p.inStock ? 'checked' : ''} onchange="toggleProductStock('${p.id}', this.checked)">
          <span>In Stock</span>
        </label>
      </td>
      <td data-label="Actions">
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

function renderInventoryTable() {
  const products = TFL_DB.getProducts();
  const container = document.getElementById("inventory-admin-list");
  if (!container) return;
  container.innerHTML = "";
  
  if (products.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--color-text-muted);">
          No products formulated yet. Create products in the Products tab first!
        </td>
      </tr>
    `;
    return;
  }
  
  products.forEach(p => {
    const row = document.createElement("tr");
    
    const remaining = p.stockLimit !== undefined && p.stockLimit !== null 
      ? Math.max(0, p.stockLimit - (p.currentStockSold || 0)) 
      : "Unlimited";
      
    let statusBadge = `<span class="badge badge-veg">In Stock</span>`;
    if (remaining === 0) {
      statusBadge = `<span class="badge badge-nonveg">Out of Stock</span>`;
    } else if (remaining !== "Unlimited" && remaining <= (p.lowStockThreshold || 2)) {
      statusBadge = `<span class="badge" style="background-color: rgba(249,115,22,0.15); color: #f97316; border: 1px solid rgba(249,115,22,0.3);">Low Stock</span>`;
    }

    const subBrandName = getProductSubBrandName(p);

    row.innerHTML = `
      <td data-label="Product Info">
        <div style="font-weight: 600; color: #fff;">${p.name}</div>
        <div style="font-size: 0.7rem; color: var(--color-text-muted);">${p.veg ? 'Veg' : 'Non-Veg'}</div>
      </td>
      <td data-label="Category" style="font-size: 0.8rem;">${subBrandName}</td>
      <td data-label="Stock Limit">
        <input type="number" class="form-control inv-limit" data-id="${p.id}" value="${p.stockLimit !== null && p.stockLimit !== undefined ? p.stockLimit : ''}" placeholder="Unlimited" style="width: 100px; height: 32px; font-size: 0.8rem; text-align: center;" onchange="saveInventoryField('${p.id}', 'limit', this.value)">
      </td>
      <td data-label="Low Threshold">
        <input type="number" class="form-control inv-threshold" data-id="${p.id}" value="${p.lowStockThreshold !== undefined ? p.lowStockThreshold : 2}" style="width: 80px; height: 32px; font-size: 0.8rem; text-align: center;" onchange="saveInventoryField('${p.id}', 'threshold', this.value)">
      </td>
      <td data-label="Sold Today">
        <input type="number" class="form-control inv-sold" data-id="${p.id}" value="${p.currentStockSold || 0}" style="width: 80px; height: 32px; font-size: 0.8rem; text-align: center;" onchange="saveInventoryField('${p.id}', 'sold', this.value)">
      </td>
      <td data-label="Remaining Stock" style="font-weight: 600; font-size: 0.85rem; color: ${remaining === 0 ? 'var(--color-danger)' : (remaining <= (p.lowStockThreshold || 2) ? '#f97316' : '#fff')};">
        ${remaining}
      </td>
      <td data-label="Status">${statusBadge}</td>
    `;
    container.appendChild(row);
  });
}

function saveInventoryField(productId, field, value) {
  const products = TFL_DB.getProducts();
  const p = products.find(prod => prod.id === productId);
  if (!p) return;
  
  if (field === 'limit') {
    p.stockLimit = value.trim() === '' ? null : parseInt(value);
  } else if (field === 'threshold') {
    p.lowStockThreshold = parseInt(value) || 0;
  } else if (field === 'sold') {
    p.currentStockSold = parseInt(value) || 0;
  }
  
  TFL_DB.saveProducts(products);
  renderInventoryTable();
  triggerBackgroundSync();
}

function resetDailyInventory() {
  if (!confirm("Are you sure you want to reset today's inventory sold counts? This will set 'Sold Today' to 0 for all items.")) return;
  
  const products = TFL_DB.getProducts();
  products.forEach(p => {
    p.currentStockSold = 0;
  });
  TFL_DB.saveProducts(products);
  TFL_DB.showToast("Daily inventory sold counts successfully reset to 0!", "success");
  
  localStorage.removeItem("tfl_low_stock_alerts_sent");
  
  renderInventoryTable();
  triggerBackgroundSync();
}

window.saveInventoryField = saveInventoryField;
window.resetDailyInventory = resetDailyInventory;
window.renderInventoryTable = renderInventoryTable;

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
    document.getElementById("p-tags").value = product.tags ? (Array.isArray(product.tags) ? product.tags.join(", ") : product.tags) : "";
    document.getElementById("p-show-out-of-stock").checked = product.showOutOfStock !== false;
    document.getElementById("p-stock-limit").value = product.stockLimit !== null && product.stockLimit !== undefined ? product.stockLimit : "";
    document.getElementById("p-stock-threshold").value = product.lowStockThreshold !== undefined ? product.lowStockThreshold : 2;
    document.getElementById("p-stock-sold").value = product.currentStockSold || 0;
    document.getElementById("p-prep-delay").value = product.prepDelay !== undefined && product.prepDelay !== null ? product.prepDelay : 20;
    
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
    document.getElementById("p-tags").value = "";
    document.getElementById("p-show-out-of-stock").checked = true;
    document.getElementById("p-stock-limit").value = "";
    document.getElementById("p-stock-threshold").value = 2;
    document.getElementById("p-stock-sold").value = 0;
    document.getElementById("p-prep-delay").value = 20;
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
  const tagsInput = document.getElementById("p-tags").value.trim();
  const tags = tagsInput ? tagsInput.split(",").map(t => t.trim()).filter(Boolean) : [];
  const showOutOfStock = document.getElementById("p-show-out-of-stock").checked;
  const limitVal = document.getElementById("p-stock-limit").value.trim();
  const stockLimit = limitVal === "" ? null : parseInt(limitVal);
  const lowStockThreshold = parseInt(document.getElementById("p-stock-threshold").value) || 0;
  const currentStockSold = parseInt(document.getElementById("p-stock-sold").value) || 0;
  const prepDelay = parseInt(document.getElementById("p-prep-delay").value) || 20;
  
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

  const optionGroups = Array.from(document.querySelectorAll("#product-choice-groups-list .choice-group-card")).map(card => {
    const groupName = card.querySelector(".choice-group-title-input")?.value.trim() || "";
    const options = Array.from(card.querySelectorAll(".choice-option-editor-row")).map(row => {
      const name = row.querySelector(".choice-option-input")?.value.trim() || "";
      const price = parseFloat(row.querySelector(".choice-option-price")?.value) || 0;
      const costPrice = parseFloat(row.querySelector(".choice-option-cost")?.value) || 0;
      return { name, price, costPrice };
    }).filter(opt => opt.name);
    return { name: groupName, options };
  }).filter(group => group.name && group.options.length >= 2);
  
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
      bestseller: tags.some(t => t.toLowerCase() === 'bestseller') || bestseller,
      tags,
      showOutOfStock,
      stockLimit,
      lowStockThreshold,
      currentStockSold,
      prepDelay,
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
      name, description: desc, category, image, costPrice: cost, price, veg, bestseller: tags.some(t => t.toLowerCase() === 'bestseller') || bestseller, tags, showOutOfStock, 
      stockLimit, lowStockThreshold, currentStockSold, prepDelay,
      condiments, hiddenCondiments, optionGroups, pairings,
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
      <td data-label="Logo">${logoPreviewHtml}</td>
      <td data-label="Name">
        <div style="font-weight: 600; color: #fff;">${s.name}</div>
        <div style="font-size: 0.72rem; color: var(--color-text-muted);">ID: ${s.id}</div>
      </td>
      <td data-label="Order"><strong>${s.sortOrder}</strong></td>
      <td data-label="Status">${visibleBadge}</td>
      <td data-label="Actions">
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
      <td data-label="Image"><img src="${u.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=120&q=80'}" style="width: 80px; height: 45px; border-radius: 4px; object-fit: cover; border: 1px solid var(--color-border);"></td>
      <td data-label="Details">
        <div style="font-weight: 600; color: #fff;">${u.title}</div>
        <div style="font-size: 0.72rem; color: var(--color-text-muted); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${u.description}</div>
      </td>
      <td data-label="Launch Date"><strong>${u.launchDate || 'N/A'}</strong></td>
      <td data-label="Type"><span class="badge tag-${u.type || 'new_launch'}">${(u.type || 'new_launch').replace('_', ' ')}</span></td>
      <td data-label="Status">${activeBadge}</td>
      <td data-label="Actions">
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
      <td data-label="Code"><strong style="color: #fff; text-transform: uppercase;">${p.code}</strong></td>
      <td data-label="Discount"><strong>${p.discountPercent}%</strong></td>
      <td data-label="Expiry">
        <span>${p.validTill || 'No Expiry'}</span>
        ${expiredLabel}
      </td>
      <td data-label="Status">
        <label class="checkbox-label" style="font-size: 0.8rem; margin: 0;">
          <input type="checkbox" class="checkbox-custom" ${p.active ? 'checked' : ''} onchange="togglePromoCodeActive('${p.code}', this.checked)">
          <span>${p.active ? 'Active' : 'Inactive'}</span>
        </label>
      </td>
      <td data-label="Actions">
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
      <td data-label="Name"><div style="font-weight: 600; color: #fff;">${a.name}</div></td>
      <td data-label="Username"><code>${a.username}</code></td>
      <td data-label="Role"><span class="role-badge role-${a.role.toLowerCase()}">${a.role}</span></td>
      <td data-label="Actions">${actionsHtml}</td>
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
  document.getElementById("settings-free-delivery-toggle").checked = settings.freeDeliveryMinOrderEnabled || false;
  document.getElementById("settings-free-delivery-min-price").value = settings.freeDeliveryMinOrderAmount || 0;
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
  settings.freeDeliveryMinOrderEnabled = document.getElementById("settings-free-delivery-toggle").checked;
  settings.freeDeliveryMinOrderAmount = parseFloat(document.getElementById("settings-free-delivery-min-price").value) || 0;
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
  
  const cleanOptions = [];
  const seen = new Set();
  options.forEach(opt => {
    let optName = "";
    let price = 0;
    let cost = 0;
    if (opt && typeof opt === 'object') {
      optName = (opt.name || "").trim();
      price = opt.price || 0;
      cost = opt.costPrice || 0;
    } else {
      optName = String(opt).trim();
    }
    if (optName && !seen.has(optName.toLowerCase())) {
      seen.add(optName.toLowerCase());
      cleanOptions.push({ name: optName, price, costPrice: cost });
    }
  });
  
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
  addOptionBtn.onclick = () => appendChoiceOptionInput(optionsEditor, { name: "", price: 0, costPrice: 0 });

  header.appendChild(title);
  header.appendChild(removeBtn);
  card.appendChild(header);
  card.appendChild(optionsEditor);
  card.appendChild(addOptionBtn);
  listDiv.appendChild(card);
}

function appendChoiceOptionInput(container, value = "") {
  let name = "";
  let price = 0;
  let cost = 0;

  if (value && typeof value === 'object') {
    name = value.name || "";
    price = value.price || 0;
    cost = value.costPrice || 0;
  } else {
    name = value || "";
  }

  const row = document.createElement("div");
  row.className = "choice-option-editor-row";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "form-control choice-option-input";
  input.value = name;
  input.placeholder = `Option e.g. Regular`;

  const priceInput = document.createElement("input");
  priceInput.type = "number";
  priceInput.className = "form-control choice-option-price";
  priceInput.value = price;
  priceInput.min = "0";
  priceInput.placeholder = "Sell";
  priceInput.style.padding = "4px 8px";

  const costInput = document.createElement("input");
  costInput.type = "number";
  costInput.className = "form-control choice-option-cost";
  costInput.value = cost;
  costInput.min = "0";
  costInput.placeholder = "Cost";
  costInput.style.padding = "4px 8px";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "mini-delete-btn";
  deleteBtn.setAttribute("aria-label", "Delete radio option");
  deleteBtn.innerHTML = "&times;";
  deleteBtn.onclick = () => row.remove();

  row.appendChild(input);
  row.appendChild(priceInput);
  row.appendChild(costInput);
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

// --- OPERATIONS: MANUAL ORDER CREATION PANEL (CALL/WALK-IN) ---
let manualOrderCart = [];

function handleManualProductSelectChange() {
  const select = document.getElementById("mo-product-select");
  const productId = select.value;
  const container = document.getElementById("mo-condiments-container");
  const list = document.getElementById("mo-condiments-list");
  const choiceContainer = document.getElementById("mo-choices-container");
  const choiceList = document.getElementById("mo-choices-list");
  
  if (container) {
    container.style.display = "none";
    list.innerHTML = "";
  }
  if (choiceContainer) {
    choiceContainer.style.display = "none";
    choiceList.innerHTML = "";
  }
  
  if (!productId) return;
  
  const products = TFL_DB.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;

  // Render choice groups (portion size radios)
  const choiceGroups = product.choiceGroups || product.optionGroups || [];
  if (choiceContainer && choiceList && choiceGroups.length > 0) {
    choiceContainer.style.display = "block";
    choiceGroups.forEach((group, gIdx) => {
      const title = document.createElement("div");
      title.style.fontWeight = "600";
      title.style.color = "#fff";
      title.style.fontSize = "0.75rem";
      title.style.marginBottom = "4px";
      title.innerText = group.name;
      choiceList.appendChild(title);

      const options = group.options || group.choices || [];
      options.forEach((opt, oIdx) => {
        const optName = typeof opt === 'object' ? opt.name : opt;
        const optPrice = typeof opt === 'object' ? (opt.price || 0) : 0;
        const optCost = typeof opt === 'object' ? (opt.costPrice || 0) : 0;
        
        const label = document.createElement("label");
        label.className = "checkbox-label";
        label.style.margin = "2px 0 6px 0";
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "6px";
        label.style.cursor = "pointer";
        label.style.fontSize = "0.78rem";

        const priceLabel = product.price === 0 ? `₹${optPrice}` : `+₹${optPrice}`;

        label.innerHTML = `
          <input type="radio" name="mo-choice-group-${gIdx}" class="mo-choice-radio" value="${optName}" data-group="${group.name}" data-price="${optPrice}" data-cost="${optCost}" ${oIdx === 0 ? 'checked' : ''} style="margin: 0;">
          <span style="color: var(--color-text);">${optName} (Sell: ${priceLabel}, Cost: ₹${optCost})</span>
        `;
        choiceList.appendChild(label);
      });
    });
  }

  // Render condiments checkboxes
  if (product.condiments && product.condiments.length > 0) {
    container.style.display = "block";
    product.condiments.forEach((cond, idx) => {
      const itemDiv = document.createElement("div");
      itemDiv.style.display = "flex";
      itemDiv.style.alignItems = "center";
      itemDiv.style.justifyContent = "space-between";
      itemDiv.style.gap = "8px";
      itemDiv.style.fontSize = "0.78rem";
      itemDiv.style.padding = "4px 0";
      itemDiv.style.borderBottom = "1px dashed rgba(255,255,255,0.03)";
      
      itemDiv.innerHTML = `
        <label class="checkbox-label" style="margin: 0; display: flex; align-items: center; gap: 6px; cursor: pointer;">
          <input type="checkbox" class="checkbox-custom mo-condiment-checkbox" data-index="${idx}" data-name="${cond.name}" data-price="${cond.price}" data-cost="${cond.costPrice || 0}" style="margin: 0;">
          <span style="color: var(--color-text);">${cond.name} (Sell: +₹${cond.price || 0}, Cost: +₹${cond.costPrice || 0})</span>
        </label>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="color: var(--color-text-muted);">Qty:</span>
          <input type="number" class="form-control mo-condiment-qty" data-index="${idx}" min="1" value="1" style="width: 50px; height: 26px; padding: 2px 4px; font-size: 0.75rem; border-radius: 4px; text-align: center; background: rgba(0,0,0,0.3); border: 1px solid var(--color-border); color: #fff;">
        </div>
      `;
      list.appendChild(itemDiv);
    });
  }
}

window.handleManualProductSelectChange = handleManualProductSelectChange;

function openManualOrderModal() {
  // Reset form inputs
  document.getElementById("manual-order-form").reset();
  
  // Set current date-time in local timezone format (YYYY-MM-DDTHH:MM)
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, 16);
  document.getElementById("mo-datetime").value = localISOTime;
  
  // Reset pricing inputs
  document.getElementById("mo-delivery-charge").value = 40;
  document.getElementById("mo-late-night").value = 0;
  document.getElementById("mo-discount").value = 0;
  
  // Reset condiments container
  document.getElementById("mo-condiments-container").style.display = "none";
  document.getElementById("mo-condiments-list").innerHTML = "";
  
  // Populate products dropdown
  const select = document.getElementById("mo-product-select");
  select.innerHTML = "";
  const products = TFL_DB.getProducts();
  const activeProducts = products.filter(p => !p.unlisted);
  
  if (activeProducts.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.innerText = "No products formulated";
    select.appendChild(opt);
  } else {
    activeProducts.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.innerText = `${p.name} (₹${p.price})`;
      select.appendChild(opt);
    });
  }
  
  // Clear cart
  manualOrderCart = [];
  renderManualOrderCart();
  recalculateManualOrderTotal();
  
  // Populate condiments for default selected product
  handleManualProductSelectChange();
  
  // Hide finance summary for Staff role
  const financeSummary = document.getElementById("mo-finance-summary");
  if (financeSummary) {
    if (loggedInUser && loggedInUser.role === 'Staff') {
      financeSummary.style.display = "none";
    } else {
      financeSummary.style.display = "flex";
    }
  }
  
  // Show modal
  document.getElementById("manual-order-modal").classList.add("active");
  document.getElementById("admin-modal-backdrop").classList.add("active");
}

function closeManualOrderModal() {
  document.getElementById("manual-order-modal").classList.remove("active");
  document.getElementById("admin-modal-backdrop").classList.remove("active");
}

function addManualOrderItem() {
  const select = document.getElementById("mo-product-select");
  const productId = select.value;
  if (!productId) {
    TFL_DB.showToast("No product selected", "error");
    return;
  }
  
  const qty = parseInt(document.getElementById("mo-product-qty").value) || 1;
  const products = TFL_DB.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const remaining = product.stockLimit !== undefined && product.stockLimit !== null ? Math.max(0, product.stockLimit - (product.currentStockSold || 0)) : null;
  if (remaining !== null && qty > remaining) {
    TFL_DB.showToast(`Only ${remaining} items are left in stock for this product.`, "error");
    return;
  }
  
  // Collect selected condiments
  const selectedCondiments = [];
  
  // Collect selected choice group options (radio buttons)
  const selectedChoices = document.querySelectorAll("#mo-choices-list input[type='radio']:checked");
  selectedChoices.forEach(radio => {
    const groupName = radio.getAttribute("data-group") || "Option";
    const choiceName = radio.value;
    const choicePrice = parseFloat(radio.getAttribute("data-price")) || 0;
    const choiceCost = parseFloat(radio.getAttribute("data-cost")) || 0;
    if (choiceName) {
      selectedCondiments.push({
        name: `${groupName}: ${choiceName}`,
        price: choicePrice,
        costPrice: choiceCost,
        quantity: qty,
        type: "choice",
        group: groupName,
        choice: choiceName
      });
    }
  });
  const checkboxes = document.querySelectorAll(".mo-condiment-checkbox");
  checkboxes.forEach(cb => {
    if (cb.checked) {
      const idx = cb.dataset.index;
      const name = cb.dataset.name;
      const price = parseFloat(cb.dataset.price) || 0;
      const costPrice = parseFloat(cb.dataset.cost) || 0;
      const qtyInput = document.querySelector(`.mo-condiment-qty[data-index="${idx}"]`);
      const condQty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
      
      selectedCondiments.push({
        name: name,
        price: price,
        costPrice: costPrice,
        quantity: condQty
      });
    }
  });
  
  const basePrice = product.price;
  const baseCost = product.costPrice || 0;
  
  const condimentsPrice = selectedCondiments.reduce((sum, c) => sum + (c.price * c.quantity), 0);
  const condimentsCost = selectedCondiments.reduce((sum, c) => sum + (c.costPrice * c.quantity), 0);
  
  const unitPrice = basePrice + (condimentsPrice / qty);
  
  const areCondimentsEqual = (cond1, cond2) => {
    if (cond1.length !== cond2.length) return false;
    const sorted1 = [...cond1].sort((a,b) => a.name.localeCompare(b.name));
    const sorted2 = [...cond2].sort((a,b) => a.name.localeCompare(b.name));
    return sorted1.every((c, i) => c.name === sorted2[i].name && c.quantity === sorted2[i].quantity);
  };
  
  const existingIdx = manualOrderCart.findIndex(item => item.id === productId && areCondimentsEqual(item.condiments, selectedCondiments));
  if (existingIdx !== -1) {
    const prevQty = manualOrderCart[existingIdx].quantity;
    const newQty = prevQty + qty;
    
    const prevCondPrice = manualOrderCart[existingIdx].condiments.reduce((sum, c) => sum + (c.price * c.quantity), 0);
    const newCondPrice = prevCondPrice + condimentsPrice;
    
    manualOrderCart[existingIdx].quantity = newQty;
    manualOrderCart[existingIdx].price = basePrice + (newCondPrice / newQty);
    manualOrderCart[existingIdx].costPrice = baseCost;
    
    selectedCondiments.forEach(sc => {
      const existingCond = manualOrderCart[existingIdx].condiments.find(c => c.name === sc.name);
      if (existingCond) {
        existingCond.quantity += sc.quantity;
      } else {
        manualOrderCart[existingIdx].condiments.push(sc);
      }
    });
  } else {
    manualOrderCart.push({
      id: product.id,
      name: product.name,
      price: unitPrice,
      costPrice: baseCost,
      quantity: qty,
      condiments: selectedCondiments,
      category: product.category,
      subBrand: product.category
    });
  }
  
  // Reset quantity selector
  document.getElementById("mo-product-qty").value = 1;
  handleManualProductSelectChange();
  
  renderManualOrderCart();
  recalculateManualOrderTotal();
  TFL_DB.showToast(`${product.name} added to draft order`, "info");
}

window.addManualOrderItem = addManualOrderItem;

function deleteManualOrderItem(index) {
  manualOrderCart.splice(index, 1);
  renderManualOrderCart();
  recalculateManualOrderTotal();
}

window.deleteManualOrderItem = deleteManualOrderItem;

function renderManualOrderCart() {
  const list = document.getElementById("manual-order-cart-list");
  list.innerHTML = "";
  
  if (manualOrderCart.length === 0) {
    list.innerHTML = `<p style="font-size: 0.78rem; color: var(--color-text-muted); text-align: center; margin: 10px 0;">No items added yet.</p>`;
    return;
  }
  
  manualOrderCart.forEach((item, idx) => {
    const condimentNames = (item.condiments || []).map(c => {
      const qtyText = c.quantity && c.quantity > 1 ? ` (x${c.quantity})` : '';
      return `${c.name}${qtyText}`;
    });
    const condimentText = condimentNames.length > 0 
      ? `<div style="font-size: 0.72rem; color: var(--color-primary); padding-left: 8px; margin-top: 2px;">+ Add-ons: ${condimentNames.join(', ')}</div>` 
      : '';
      
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.alignItems = "center";
    div.style.padding = "6px var(--space-sm)";
    div.style.background = "rgba(255, 255, 255, 0.05)";
    div.style.borderRadius = "var(--radius-sm)";
    div.style.fontSize = "0.8rem";
    div.innerHTML = `
      <div style="display: flex; flex-direction: column;">
        <span style="color: #fff;">${item.name} x <strong>${item.quantity}</strong></span>
        ${condimentText}
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="color: var(--color-primary); font-weight: 600;">₹${(item.price * item.quantity).toFixed(2)}</span>
        <button type="button" class="mini-delete-btn" onclick="deleteManualOrderItem(${idx})" style="background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 1.2rem; padding: 0 4px; line-height: 1;">&times;</button>
      </div>
    `;
    list.appendChild(div);
  });
}

window.renderManualOrderCart = renderManualOrderCart;

function recalculateManualOrderTotal() {
  const subtotal = manualOrderCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Calculate total cost price of the draft manual order
  let totalCost = 0;
  manualOrderCart.forEach(item => {
    let itemCostTotal = (item.costPrice || 0) * item.quantity;
    if (item.condiments && Array.isArray(item.condiments)) {
      item.condiments.forEach(c => {
        itemCostTotal += (c.costPrice || 0) * (c.quantity || 1);
      });
    }
    totalCost += itemCostTotal;
  });
  
  const deliveryCharge = parseFloat(document.getElementById("mo-delivery-charge").value) || 0;
  const lateNightFee = parseFloat(document.getElementById("mo-late-night").value) || 0;
  const discountAmount = parseFloat(document.getElementById("mo-discount").value) || 0;
  
  const grandTotal = Math.max(0, subtotal + deliveryCharge + lateNightFee - discountAmount);
  const estimatedProfit = grandTotal - totalCost;
  
  document.getElementById("mo-grand-total").innerText = `₹${grandTotal.toFixed(2)}`;
  document.getElementById("mo-total-cost").innerText = `₹${totalCost.toFixed(2)}`;
  
  const profitEl = document.getElementById("mo-estimated-profit");
  profitEl.innerText = `₹${estimatedProfit.toFixed(2)}`;
  if (estimatedProfit < 0) {
    profitEl.style.color = "var(--color-danger)";
  } else {
    profitEl.style.color = "var(--color-success)";
  }
}

window.recalculateManualOrderTotal = recalculateManualOrderTotal;

async function getNextOrderSequenceForDate(year, month, date) {
  const prefix = `TFL-${year}${month}${date}-`;
  let maxSeq = 100;

  // 1. Query Supabase
  const settings = TFL_DB.getSettings();
  if (settings.supabaseEnabled && window.supabase) {
    const client = TFL_DB.getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from("tfl_orders")
          .select("order_id")
          .like("order_id", `${prefix}%`);
        
        if (!error && data && data.length > 0) {
          data.forEach(row => {
            const idStr = row.order_id;
            const parts = idStr.split("-");
            if (parts.length === 3) {
              const seq = parseInt(parts[2]);
              if (!isNaN(seq) && seq > maxSeq) {
                maxSeq = seq;
              }
            }
          });
        }
      } catch (err) {
        console.warn("Failed to query Supabase for order sequence:", err);
      }
    }
  }

  // 2. Check local cache
  const localOrders = TFL_DB.getOrders();
  localOrders.forEach(o => {
    if (o && o.id && o.id.startsWith(prefix)) {
      const parts = o.id.split("-");
      if (parts.length === 3) {
        const seq = parseInt(parts[2]);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
  });

  // 3. Fallback to localStorage tracking
  const localSeqKey = `tfl_order_seq_${year}${month}${date}`;
  let localSeq = parseInt(localStorage.getItem(localSeqKey) || "100");
  if (localSeq > maxSeq) {
    maxSeq = localSeq;
  }

  const nextSeq = maxSeq + 1;
  localStorage.setItem(localSeqKey, nextSeq);
  return `${prefix}${nextSeq}`;
}

async function handleManualOrderSubmit(event) {
  event.preventDefault();
  
  if (manualOrderCart.length === 0) {
    alert("Please add at least one item to the order.");
    return;
  }
  
  const dtInput = document.getElementById("mo-datetime").value;
  const name = document.getElementById("mo-name").value.trim();
  const phone = document.getElementById("mo-phone").value.trim();
  const gender = document.getElementById("mo-gender").value;
  const address = document.getElementById("mo-address").value.trim();
  const paymentMode = document.getElementById("mo-payment-mode").value;
  const paymentStatus = document.getElementById("mo-payment-status").value;
  const status = document.getElementById("mo-delivery-status").value;
  const deliveryCharge = parseFloat(document.getElementById("mo-delivery-charge").value) || 0;
  const lateNightFee = parseFloat(document.getElementById("mo-late-night").value) || 0;
  const discountAmount = parseFloat(document.getElementById("mo-discount").value) || 0;
  
  const orderDateObj = new Date(dtInput);
  const year = orderDateObj.getFullYear();
  const month = String(orderDateObj.getMonth() + 1).padStart(2, '0');
  const date = String(orderDateObj.getDate()).padStart(2, '0');
  
  // Format orderDate string: e.g. "23/06/2026, 18:29:32"
  const dayStr = String(orderDateObj.getDate()).padStart(2, '0');
  const monthStr = String(orderDateObj.getMonth() + 1).padStart(2, '0');
  const yearStr = orderDateObj.getFullYear();
  const hrsStr = String(orderDateObj.getHours()).padStart(2, '0');
  const minsStr = String(orderDateObj.getMinutes()).padStart(2, '0');
  const secsStr = String(orderDateObj.getSeconds()).padStart(2, '0');
  const orderDateStr = `${dayStr}/${monthStr}/${yearStr}, ${hrsStr}:${minsStr}:${secsStr}`;
  
  TFL_DB.showToast("Validating inventory stock...", "info");
  const stockCheck = await TFL_DB.verifyStockAndIncrement(manualOrderCart);
  if (!stockCheck.success) {
    TFL_DB.showToast(stockCheck.errorMessage, "error");
    return;
  }

  TFL_DB.showToast("Allocating non-colliding order ID...", "info");
  const orderId = await getNextOrderSequenceForDate(year, month, date);
  
  const subtotal = manualOrderCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const grandTotal = Math.max(0, subtotal + deliveryCharge + lateNightFee - discountAmount);
  
  const orderObj = {
    id: orderId,
    createdAt: orderDateObj.toISOString(),
    orderDate: orderDateStr,
    customerName: name,
    customerPhone: phone,
    customerGender: gender,
    customerAddress: address,
    customerIp: "Manual Admin Entry",
    paymentMode: paymentMode,
    paymentStatus: paymentStatus,
    status: status,
    items: manualOrderCart,
    subtotal: subtotal,
    deliveryCharge: deliveryCharge,
    lateNightFee: lateNightFee,
    discountAmount: discountAmount,
    grandTotal: grandTotal,
    discountPercent: subtotal > 0 ? Math.round((discountAmount / subtotal) * 100) : 0
  };
  
  TFL_DB.addOrder(orderObj);
  
  try {
    await TFL_DB.upsertOrderToSupabase(orderObj);
    TFL_DB.showToast(`Order ${orderId} created successfully!`, "success");
  } catch (err) {
    console.error("Failed to sync manual order to Supabase:", err);
    TFL_DB.showToast("Order saved locally, cloud sync failed.", "warning");
  }
  
  closeManualOrderModal();
  renderOrdersTable();
  renderDashboard();
}

window.openManualOrderModal = openManualOrderModal;
window.closeManualOrderModal = closeManualOrderModal;
window.handleManualOrderSubmit = handleManualOrderSubmit;

function checkLowStockAlerts() {
  if (!loggedInUser) return;
  const products = TFL_DB.getProducts();
  const alertsContainer = document.getElementById("low-stock-alerts-container");
  if (!alertsContainer) return;
  
  const todayStr = new Date().toISOString().split("T")[0];
  let sentAlerts = {};
  try {
    sentAlerts = JSON.parse(localStorage.getItem("tfl_low_stock_alerts_sent") || "{}");
  } catch (e) {}

  if (sentAlerts.date !== todayStr) {
    sentAlerts = { date: todayStr, productIds: [] };
  }

  const lowStockItems = [];
  products.forEach(p => {
    if (p.stockLimit !== undefined && p.stockLimit !== null) {
      const remaining = p.stockLimit - (p.currentStockSold || 0);
      if (remaining <= (p.lowStockThreshold || 2)) {
        lowStockItems.push({ product: p, remaining });
        
        if (!sentAlerts.productIds.includes(p.id)) {
          sentAlerts.productIds.push(p.id);
          localStorage.setItem("tfl_low_stock_alerts_sent", JSON.stringify(sentAlerts));
          
          TFL_DB.showToast(`Warning: "${p.name}" has reached low stock! (${remaining} left)`, "warning");
          speakText(`${p.name} low in stock`);
          
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(440, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
            setTimeout(() => {
              const osc2 = audioCtx.createOscillator();
              osc2.connect(gain);
              osc2.frequency.setValueAtTime(554.37, audioCtx.currentTime);
              osc2.start();
              osc2.stop(audioCtx.currentTime + 0.25);
            }, 180);
          } catch (e) {
            console.warn("Could not play audio chime:", e);
          }
        }
      }
    }
  });

  if (lowStockItems.length > 0) {
    alertsContainer.style.display = "flex";
    alertsContainer.innerHTML = lowStockItems.map(item => {
      const p = item.product;
      const rem = item.remaining;
      const color = rem === 0 ? "var(--color-danger)" : "var(--color-warning)";
      const bg = rem === 0 ? "rgba(239, 68, 68, 0.1)" : "rgba(249, 115, 22, 0.1)";
      const border = rem === 0 ? "rgba(239, 68, 68, 0.3)" : "rgba(249, 115, 22, 0.3)";
      const statusText = rem === 0 ? "OUT OF STOCK" : `ONLY ${rem} LEFT`;

      return `
        <div style="background: ${bg}; border: 1px solid ${border}; border-radius: var(--radius-sm); padding: var(--space-xs) var(--space-sm); display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 0.8rem;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="alert-triangle" style="width: 14px; height: 14px; color: ${color};"></i>
            <span style="color: #fff; font-weight: 500;">"${p.name}" is running low on stock!</span>
          </div>
          <span style="color: ${color}; font-weight: 700; font-size: 0.72rem; text-transform: uppercase; background: rgba(0,0,0,0.2); padding: 2px 8px; border-radius: 999px;">${statusText}</span>
        </div>
      `;
    }).join("");
    if (typeof lucide !== "undefined") lucide.createIcons();
  } else {
    alertsContainer.style.display = "none";
    alertsContainer.innerHTML = "";
  }
}

window.checkLowStockAlerts = checkLowStockAlerts;


