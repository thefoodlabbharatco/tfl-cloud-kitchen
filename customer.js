// customer.js - Customer Front-end Interactivity for The Food Lab (TFL)

// Global Error Handler for Mobile Debugging
window.onerror = function(message, source, lineno, colno, error) {
  const errorMsg = error ? error.message : message;
  TFL_DB.showToast(`JS Error: ${errorMsg} at ${source}:${lineno}`, "error");
  console.error("Global Error:", errorMsg, error);
  return false;
};

window.onunhandledrejection = function(event) {
  const reason = event.reason ? (event.reason.message || event.reason) : "Unknown rejection";
  TFL_DB.showToast(`Promise Rejection: ${reason}`, "error");
  console.error("Global Promise Rejection:", reason, event);
};

// Global State
let cart = [];
let activeSubBrand = 'all';
let vegFilter = 'all'; // 'all', 'veg', 'nonveg'
let priceSortDirection = null; // null, 'asc', 'desc'
let searchQuery = "";
let selectedProductForAddons = null;
let selectedProductIsPreOrder = false;
let currentReceiptOrder = null;
let productRenderFrame = null;
let appliedPromoCode = null; // Stores { code, discountPercent }

function scheduleIdle(callback) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(callback, { timeout: 1500 });
  } else {
    setTimeout(callback, 0);
  }
}

function scheduleProductRender() {
  if (productRenderFrame) cancelAnimationFrame(productRenderFrame);
  productRenderFrame = requestAnimationFrame(() => {
    productRenderFrame = null;
    renderProducts();
  });
}

// Initialize Page
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCustomerPage);
} else {
  initCustomerPage();
}

async function initCustomerPage() {
  if (!localStorage.getItem("tfl_theme")) {
    localStorage.setItem("tfl_theme", "light");
  }

  // Initialize theme first
  TFL_DB.initTheme();
  document.addEventListener("tfl_db_updated", handleDbUpdated);

  // 1. Set up elements from database configurations
  loadBrandCustomization();

  // 2. Render immediately. Cloud sync refreshes the page in the background.
  renderApp();
  resetCheckoutForm();

  // 3. Set up search input listener
  const searchInput = document.getElementById("menu-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      scheduleProductRender();
    });
  }
  
  // Load local cart if present in session
  const savedCart = sessionStorage.getItem("tfl_customer_cart");
  if (savedCart) {
    try {
      cart = JSON.parse(savedCart);
      updateCartDisplay();
    } catch(e){}
  }

  scheduleIdle(syncCustomerCloudData);
}

async function syncCustomerCloudData() {
  try {
    const settings = TFL_DB.getSettings();
    if (settings.supabaseEnabled && settings.supabaseUrl && settings.supabaseKey) {
      console.log("Syncing menu with Supabase...");
      await TFL_DB.syncFromSupabase();
      loadBrandCustomization();
      renderApp();
    } else if (settings.googleSheetEnabled && settings.googleSheetUrl) {
      console.log("Syncing menu with cloud...");
      await TFL_DB.syncFromGoogleSheets();
      loadBrandCustomization();
      renderApp();
    }
  } catch (e) {
    console.warn("Background sync failed. Running on local cache.", e);
  }
}

function handleDbUpdated(event) {
  const key = event.detail && event.detail.key;
  if (key === "sync_status") {
    updateCustomerSyncStatus();
  }
  if (key === "settings" || key === "products" || key === "subbrands" || key === "updates" || key === "all") {
    loadBrandCustomization();
    renderApp();
  }

  if ((key === "orders" || key === "all") && currentReceiptOrder) {
    const latestOrder = TFL_DB.getOrders().find(order => order.id === currentReceiptOrder.id);
    if (latestOrder) {
      currentReceiptOrder = latestOrder;
      if (document.getElementById("receipt-modal").classList.contains("active")) {
        openReceiptModal(latestOrder);
      }
      updateCartDisplay();
      renderProducts();
    }
  }
}

function updateCustomerSyncStatus() {
  const el = document.getElementById("customer-sync-status");
  if (!el || !TFL_DB.getSyncState) return;
  const state = TFL_DB.getSyncState();
  el.className = "customer-sync-status";
  if (!state.online) {
    el.classList.add("is-warning");
    el.innerText = "Offline";
  } else if (state.syncing) {
    el.classList.add("is-syncing");
    el.innerText = "Syncing";
  } else if (state.pending > 0) {
    el.classList.add("is-warning");
    el.innerText = "Saving";
  } else if (state.lastError) {
    el.classList.add("is-warning");
    el.innerText = "Retrying";
  } else {
    el.classList.add("is-synced");
    el.innerText = "Live";
  }
}

// Load logo, hero, status, color settings
function loadBrandCustomization() {
  const settings = TFL_DB.getSettings();
  
  // Update Restaurant details
  document.getElementById("restaurant-title").innerHTML = settings.restaurantName.replace(
    /\bLab\b/gi, 
    "<span>Lab</span>"
  );
  document.getElementById("restaurant-tagline").innerText = settings.tagline;
  
  // Apply images
  if (settings.brandLogo) {
    document.getElementById("tfl-logo").src = settings.brandLogo;
    TFL_DB.updateBrandIcons(settings.brandLogo);
  }
  if (settings.heroImage) {
    document.getElementById("tfl-hero").style.backgroundImage = `url('${settings.heroImage}')`;
  }
  
  // Status Badge
  const statusBadge = document.getElementById("kitchen-status-badge");
  const closedScreen = document.getElementById("kitchen-closed-screen");
  const closedMsg = document.getElementById("kitchen-closed-message");
  const productsContainer = document.getElementById("menu-products-container");
  const announcementsSection = document.getElementById("announcements-section");
  
  if (settings.isOpen) {
    statusBadge.innerText = "Open";
    statusBadge.className = "status-badge status-open";
    closedScreen.style.display = "none";
    productsContainer.style.display = "grid";
    announcementsSection.style.display = "block";
  } else {
    statusBadge.innerText = "Closed";
    statusBadge.className = "status-badge status-closed";
    closedScreen.style.display = "flex";
    closedMsg.innerText = settings.closedMessage || "Kitchen is currently closed.";
    productsContainer.style.display = "grid";
    announcementsSection.style.display = "block";
  }

  refreshCheckoutUpiDetails(settings);
  updateCustomerSyncStatus();
  
  // Apply theme styling colors
  TFL_DB.applyThemeColors();
  lucide.createIcons();
}

function renderApp() {
  renderUpdates();
  renderSubBrands();
  renderProducts();
}

// Render Promotions / Updates carousel
function renderUpdates() {
  const container = document.getElementById("updates-carousel-container");
  if (!container) return;
  
  const updates = TFL_DB.getUpdates().filter(u => u.active);
  
  if (updates.length === 0) {
    document.getElementById("announcements-section").style.display = "none";
    return;
  }
  
  document.getElementById("announcements-section").style.display = "block";
  const fragment = document.createDocumentFragment();
  
  updates.forEach(u => {
    const slide = document.createElement("div");
    slide.className = "update-slide hover-float";
    
    // Fallback image if empty
    const imgUrl = u.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80";
    
    slide.innerHTML = `
      <img src="${imgUrl}" alt="${u.title}" class="update-img" loading="lazy" decoding="async">
      <div class="update-overlay">
        <span class="update-tag tag-${u.type || 'new_launch'}">${(u.type || 'New Launch').replace('_', ' ')}</span>
        <h3 class="update-title">${u.title}</h3>
        <p class="update-desc">${u.description}</p>
      </div>
    `;
    fragment.appendChild(slide);
  });
  container.replaceChildren(fragment);
}

// Render Sub-brands logo horizontal grid
function renderSubBrands() {
  const container = document.getElementById("subbrands-grid-container");
  if (!container) return;
  
  const subbrands = TFL_DB.getSubBrands()
    .filter(s => s.visible)
    .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    
  const fragment = document.createDocumentFragment();
  
  // Add an "All" option card
  const allCard = document.createElement("div");
  allCard.className = `subbrand-card ${activeSubBrand === 'all' ? 'active' : ''}`;
  allCard.onclick = () => selectSubBrand('all');
  allCard.innerHTML = `
    <div class="subbrand-logo">🧪</div>
    <div class="subbrand-name">All Labs</div>
  `;
  fragment.appendChild(allCard);
  
  subbrands.forEach(s => {
    const card = document.createElement("div");
    card.className = `subbrand-card ${activeSubBrand === s.id ? 'active' : ''}`;
    card.onclick = () => selectSubBrand(s.id);
    
    // Check if the logo is an emoji or an image URL
    const isEmoji = s.logo.length <= 4;
    const logoHtml = isEmoji 
      ? `<div class="subbrand-logo">${s.logo}</div>`
      : `<img src="${s.logo}" alt="${s.name}" class="subbrand-logo" style="object-fit: cover;" loading="lazy" decoding="async">`;

    card.innerHTML = `
      ${logoHtml}
      <div class="subbrand-name">${s.name}</div>
    `;
    fragment.appendChild(card);
  });
  container.replaceChildren(fragment);
}

// Select category/sub-brand
function selectSubBrand(id) {
  activeSubBrand = id;
  renderSubBrands();
  renderProducts();
  
  // Smoothly auto-scroll the chosen filter pill to the horizontal center of the viewport
  setTimeout(() => {
    const container = document.getElementById("subbrands-grid-container");
    if (container) {
      const activeCard = container.querySelector(".subbrand-card.active");
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, 50);
}

// Set Veg/Nonveg Filters
function setVegFilter(type) {
  vegFilter = type;
  document.getElementById("filter-all").className = `filter-pill ${type === 'all' ? 'active' : ''}`;
  document.getElementById("filter-veg").className = `filter-pill ${type === 'veg' ? 'active' : ''}`;
  document.getElementById("filter-nonveg").className = `filter-pill ${type === 'nonveg' ? 'active' : ''}`;
  renderProducts();
}

// Toggle sorting order
function toggleSortPrice() {
  const btn = document.getElementById("btn-sort");
  if (priceSortDirection === null) {
    priceSortDirection = 'asc';
    btn.className = "filter-pill active";
    btn.innerHTML = `<i data-lucide="arrow-up" style="width: 14px; height: 14px;"></i> Low-High`;
  } else if (priceSortDirection === 'asc') {
    priceSortDirection = 'desc';
    btn.className = "filter-pill active";
    btn.innerHTML = `<i data-lucide="arrow-down" style="width: 14px; height: 14px;"></i> High-Low`;
  } else {
    priceSortDirection = null;
    btn.className = "filter-pill";
    btn.innerHTML = `<i data-lucide="arrow-up-down" style="width: 14px; height: 14px;"></i> Price`;
  }
  lucide.createIcons();
  renderProducts();
}

// Render Products Grid
function renderProducts() {
  const container = document.getElementById("menu-products-container");
  if (!container) return;
  
  const settings = TFL_DB.getSettings();
  const kitchenOpen = !!settings.isOpen;
  const hideProductPrices = settings.hideProductPrices === true || settings.hideProductPrices === "true" || settings.hideProductPrices === 1 || settings.hideProductPrices === "1";
  document.body.classList.toggle("hide-product-prices", hideProductPrices);
  const sortBtn = document.getElementById("btn-sort");
  if (sortBtn) sortBtn.style.display = hideProductPrices ? "none" : "";
  let products = TFL_DB.getProducts();
  
  // Filter out unlisted products (done in admin as unlist, here we assume all products has inStock/list property, we add visible check)
  // Let's filter listed only. If unlisted, admin sets visible=false or similar. Let's make sure it handles unlisted status.
  // We'll support an `unlisted` property which default to false.
  products = products.filter(p => !p.unlisted);
  
  // Filter out products that are out of stock and set to be hidden (showOutOfStock === false)
  products = products.filter(p => {
    const isActuallyInStock = p.inStock && (
      p.stockLimit === undefined || 
      p.stockLimit === null || 
      (p.stockLimit - (p.currentStockSold || 0)) > 0
    );
    return isActuallyInStock || p.showOutOfStock !== false;
  });
  
  // Filter out products belonging to hidden sub-brands
  const visibleSubBrands = new Set(
    TFL_DB.getSubBrands()
      .filter(s => s && (s.visible === true || s.visible === "true" || s.visible === 1 || s.visible === "1"))
      .map(s => s.id)
  );
  products = products.filter(p => visibleSubBrands.has(p.category));
  
  // Apply category filter
  if (activeSubBrand !== 'all') {
    products = products.filter(p => p.category === activeSubBrand);
  }
  
  // Apply search query
  if (searchQuery !== "") {
    products = products.filter(p => 
      p.name.toLowerCase().includes(searchQuery) || 
      p.description.toLowerCase().includes(searchQuery)
    );
  }
  
  // Apply Veg filter
  if (vegFilter === 'veg') {
    products = products.filter(p => p.veg);
  } else if (vegFilter === 'nonveg') {
    products = products.filter(p => !p.veg);
  }
  
  // Apply price sorting
  if (priceSortDirection === 'asc') {
    products.sort((a, b) => a.price - b.price);
  } else if (priceSortDirection === 'desc') {
    products.sort((a, b) => b.price - a.price);
  }
  
  if (products.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px var(--space-md); color: var(--color-text-muted);">
        <i data-lucide="search-code" style="width: 48px; height: 48px; margin-bottom: 12px; stroke-width: 1.5;"></i>
        <p>No formulations found matching your filter specs.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  const fragment = document.createDocumentFragment();
  
  products.forEach(p => {
    const remainingStock = p.stockLimit !== undefined && p.stockLimit !== null ? Math.max(0, p.stockLimit - (p.currentStockSold || 0)) : null;
    const isItemInStock = p.inStock && (remainingStock === null || remainingStock > 0);

    const card = document.createElement("div");
    card.className = `product-card ${!isItemInStock ? 'out-of-stock' : ''}`;
    
    // Veg/NonVeg dot indicators
    const vegBadge = p.veg 
      ? `<span class="dot-icon dot-icon-veg" title="Vegetarian"></span>` 
      : `<span class="dot-icon dot-icon-nonveg" title="Non-Vegetarian"></span>`;
      
    // Badges Row
    let badgeHtml = "";
    if (p.tags && Array.isArray(p.tags)) {
      p.tags.forEach(tag => {
        const cleanTag = tag.trim();
        if (cleanTag) {
          const badgeClass = cleanTag.toLowerCase() === 'bestseller' ? 'badge-bestseller' : 'badge-custom';
          badgeHtml += `<span class="badge ${badgeClass}">${cleanTag}</span>`;
        }
      });
    } else if (p.bestseller) {
      badgeHtml += `<span class="badge badge-bestseller">Bestseller</span>`;
    }
    
    // Find quantity currently in cart for this specific item structure
    const totalQty = getCartProductQty(p.id);
    
    let actionBtnHtml = "";
    if (!kitchenOpen) {
      actionBtnHtml = `<button class="add-btn-empty add-btn-disabled" type="button" disabled>Closed</button>`;
    } else if (!isItemInStock) {
      const delay = p.prepDelay || 20;
      actionBtnHtml = `
        <div class="out-of-stock-actions">
          <button class="add-btn-soldout" type="button" disabled>Sold Out</button>
          <button class="add-btn-waitorder" type="button" onclick="initiateAddToCart('${p.id}', true)">Wait for Order (+${delay}m)</button>
        </div>
      `;
    } else if (totalQty === 0) {
      actionBtnHtml = `
        <button class="add-btn-empty btn-primary" onclick="initiateAddToCart('${p.id}')">
          ADD <i data-lucide="plus" style="width: 12px; height: 12px; display: inline;"></i>
        </button>
      `;
    } else {
      actionBtnHtml = `
        <div class="add-btn-wrapper">
          <button onclick="handleProductDecrement('${p.id}')">-</button>
          <span class="add-btn-qty">${totalQty}</span>
          <button onclick="initiateAddToCart('${p.id}', ${!isItemInStock})">+</button>
        </div>
      `;
    }
    
    // Portion size dynamic price label
    let priceHtml = "";
    const choiceGroups = p.choiceGroups || p.optionGroups || [];
    if (p.price === 0 && choiceGroups.length > 0) {
      const firstGroup = choiceGroups[0];
      const opts = firstGroup.options || firstGroup.choices || [];
      const minPrice = opts.reduce((min, opt) => Math.min(min, opt.price || 0), Infinity);
      if (minPrice !== Infinity) {
        priceHtml = `<span class="product-price">From ₹${minPrice}</span>`;
      } else {
        priceHtml = `<span class="product-price">₹0</span>`;
      }
    } else {
      priceHtml = `
        <span class="product-original-price">₹${Math.round(p.price * 1.20)}</span>
        <span class="product-price">₹${p.price}</span>
        <span class="product-save-badge">SAVE</span>
      `;
    }

    let lowStockHtml = "";
    if (isItemInStock && remainingStock !== null && remainingStock <= (p.lowStockThreshold || 2)) {
      lowStockHtml = `<span class="low-stock-warning">Only ${remainingStock} left!</span>`;
    }

    card.innerHTML = `
      <div class="product-info">
        <div>
          <div class="product-meta">
            ${vegBadge}
            ${badgeHtml}
          </div>
          <h3 class="product-name">${p.name}</h3>
          <p class="product-desc">${p.description}</p>
        </div>
        <div class="product-price-row" style="align-items: center; gap: 8px;">
          ${priceHtml}
          ${lowStockHtml}
        </div>
      </div>
      <div class="product-img-container ${!isItemInStock ? 'is-out-of-stock' : ''}">
        <img src="${p.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80'}" alt="${p.name}" loading="lazy" decoding="async">
        <div class="product-action">
          ${actionBtnHtml}
        </div>
      </div>
    `;
    if (hideProductPrices) {
      card.querySelector(".product-price-row")?.remove();
    }
    fragment.appendChild(card);
  });
  container.replaceChildren(fragment);
  
  lucide.createIcons();
}

// Find aggregated quantities for display
function getCartProductQty(productId) {
  if (currentReceiptOrder) {
    return (currentReceiptOrder.items || [])
      .filter(item => item.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  }
  return cart
    .filter(item => item.product.id === productId)
    .reduce((sum, item) => sum + item.quantity, 0);
}

// Initiate add to cart, check if condiments needed
function initiateAddToCart(productId, isPreOrder = false) {
  const settings = TFL_DB.getSettings();
  if (!settings.isOpen) {
    TFL_DB.showToast("Kitchen is closed right now. You can view the menu, but ordering is disabled.", "warning");
    return;
  }
  const product = TFL_DB.getProducts().find(p => p.id === productId);
  if (!product) return;
  
  if (!isPreOrder) {
    const remaining = product.stockLimit !== undefined && product.stockLimit !== null ? Math.max(0, product.stockLimit - (product.currentStockSold || 0)) : null;
    const isItemInStock = product.inStock && (remaining === null || remaining > 0);
    if (!isItemInStock) {
      TFL_DB.showToast("Sorry, this item is out of stock!", "warning");
      return;
    }
  }
  
  selectedProductForAddons = product;
  selectedProductIsPreOrder = isPreOrder;
  openAddonsModal(product);
}

// Handle product decrement from card buttons
function handleProductDecrement(productId) {
  if (currentReceiptOrder) {
    const items = currentReceiptOrder.items || [];
    let index = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].id === productId) {
        index = i;
        break;
      }
    }
    if (index !== -1) {
      items[index].quantity -= 1;
      if (items[index].quantity <= 0) {
        items.splice(index, 1);
      } else {
        // Clamp condiment quantities in the active order to the new product quantity
        const newQty = items[index].quantity;
        (items[index].condiments || []).forEach(c => {
          if (isFreeCondiment(c)) {
            if (c.quantity > newQty) {
              c.quantity = newQty;
            }
          }
        });
      }
      if (items.length === 0) {
        startNewOrder();
        return;
      }
      recalculateReceiptOrderTotals(currentReceiptOrder);
      TFL_DB.updateOrder(currentReceiptOrder);
      try {
        TFL_DB.addOrderToCloud(currentReceiptOrder);
      } catch (e) {}
      if (document.getElementById("receipt-modal").classList.contains("active")) {
        openReceiptModal(currentReceiptOrder);
      }
      updateCartDisplay();
      renderProducts();
    }
    return;
  }
  // Find the last added variant of this product in cart and decrement it
  const index = findLastCartIndexByProductId(productId);
  if (index !== -1) {
    updateCartQty(index, -1);
  }
}

function findLastCartIndexByProductId(productId) {
  for (let i = cart.length - 1; i >= 0; i--) {
    if (cart[i].product.id === productId) {
      return i;
    }
  }
  return -1;
}

function isFreeCondiment(condiment) {
  return typeof condiment === 'object' && condiment !== null && (Number(condiment.price) || 0) <= 0;
}

// Helper functions for customization modal quantity control
function adjustAddonProductQty(offset) {
  const qtyEl = document.getElementById("addon-item-qty");
  if (!qtyEl) return;
  let currentQty = parseInt(qtyEl.innerText) || 1;
  const p = selectedProductForAddons;
  const remaining = p && p.stockLimit !== undefined && p.stockLimit !== null ? Math.max(0, p.stockLimit - (p.currentStockSold || 0)) : null;
  currentQty += offset;
  if (currentQty < 1) currentQty = 1;
  if (remaining !== null && currentQty > remaining) {
    TFL_DB.showToast(`Only ${remaining} items are left in stock.`, "warning");
    currentQty = remaining;
  }
  qtyEl.innerText = currentQty;
  
  // Clamp all condiment quantities to the new limit
  const qtySpans = document.querySelectorAll("#addons-checkboxes-container .add-btn-qty");
  qtySpans.forEach(span => {
    const price = parseFloat(span.getAttribute("data-price")) || 0;
    if (price > 0) return;
    let condQty = parseInt(span.innerText) || 0;
    if (condQty > currentQty) {
      span.innerText = currentQty;
    }
  });
}

function adjustCondimentQty(condName, offset) {
  const safeName = condName.replace(/[^a-zA-Z0-9]/g, '-');
  const span = document.getElementById(`cond-qty-${safeName}`);
  if (!span) return;
  
  const productQtyEl = document.getElementById("addon-item-qty");
  const maxFreeQty = productQtyEl ? (parseInt(productQtyEl.innerText) || 1) : 1;
  const price = parseFloat(span.getAttribute("data-price")) || 0;
  
  let currentQty = parseInt(span.innerText) || 0;
  currentQty += offset;
  
  if (currentQty < 0) currentQty = 0;
  if (price <= 0 && currentQty > maxFreeQty) currentQty = maxFreeQty;
  
  span.innerText = currentQty;
}

function getProductPairings(product) {
  if (!product) return [];
  let pairings = product.pairings || [];
  if (typeof pairings === 'string') {
    try {
      pairings = pairings.trim();
      if (pairings.startsWith('[') || pairings.startsWith('{')) {
        pairings = JSON.parse(pairings);
      } else {
        pairings = pairings.split(',').map(s => s.trim()).filter(Boolean);
      }
    } catch (e) {
      pairings = [];
    }
  }
  return Array.isArray(pairings) ? pairings : [];
}

// Open Customize Modal Sheet
function openAddonsModal(product) {
  document.getElementById("addon-item-name").innerText = `Customize ${product.name}`;
  document.getElementById("addon-item-qty").innerText = "1";
  
  const listContainer = document.getElementById("addons-checkboxes-container");
  listContainer.innerHTML = "";
  
  const subtitleEl = document.getElementById("addon-item-subtitle");
  const condiments = product.condiments || [];
  const optionGroups = product.optionGroups || product.choiceGroups || [];
  
  if (condiments.length > 0 || optionGroups.length > 0) {
    if (subtitleEl) subtitleEl.innerText = "Choose options and add-ons";
    listContainer.style.display = "flex";
  } else {
    if (subtitleEl) subtitleEl.innerText = "Select quantity";
    listContainer.style.display = "none";
  }

  optionGroups.forEach((group, groupIndex) => {
    const groupName = group.name || `Option ${groupIndex + 1}`;
    const options = group.options || group.choices || [];
    if (!Array.isArray(options) || options.length === 0) return;

    const groupWrap = document.createElement("div");
    groupWrap.className = "choice-group";
    const radioName = `choice-${product.id}-${groupIndex}`;

    const title = document.createElement("div");
    title.className = "choice-group-title";
    title.innerText = groupName;
    groupWrap.appendChild(title);

    options.forEach((option, optionIndex) => {
      const optName = (option && typeof option === 'object') ? (option.name || "") : String(option).trim();
      if (!optName) return;
      const optPrice = (option && typeof option === 'object') ? (option.price || 0) : 0;
      const optCost = (option && typeof option === 'object') ? (option.costPrice || 0) : 0;

      const label = document.createElement("label");
      label.className = "choice-option-row";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = radioName;
      radio.value = optName;
      radio.setAttribute("data-group", groupName);
      radio.setAttribute("data-price", optPrice);
      radio.setAttribute("data-cost", optCost);
      radio.checked = optionIndex === 0;

      const span = document.createElement("span");
      let priceText = "";
      if (product.price === 0) {
        priceText = ` (₹${optPrice})`;
      } else {
        priceText = optPrice > 0 ? ` (+₹${optPrice})` : '';
      }
      span.innerText = `${optName}${priceText}`;

      label.appendChild(radio);
      label.appendChild(span);
      groupWrap.appendChild(label);
    });

    listContainer.appendChild(groupWrap);
  });
  
  condiments.forEach(cond => {
    const cName = typeof cond === 'object' ? cond.name : cond;
    const cPrice = typeof cond === 'object' ? (cond.price || 0) : 0;
    const priceText = cPrice > 0 ? ` (+₹${cPrice})` : ' (Free)';
    const safeName = cName.replace(/[^a-zA-Z0-9]/g, '-');

    const row = document.createElement("div");
    row.className = "condiment-row";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.padding = "8px 0";
    row.style.borderBottom = "1px solid rgba(255, 255, 255, 0.05)";

    row.innerHTML = `
      <div style="display: flex; flex-direction: column;">
        <span style="font-weight: 500; color: #fff; font-size: 0.9rem;">${cName}</span>
        <span style="font-size: 0.72rem; color: var(--color-text-muted);">${priceText}</span>
      </div>
      <div class="add-btn-wrapper" style="transform: scale(0.9);">
        <button type="button" onclick="adjustCondimentQty('${cName.replace(/'/g, "\\'")}', -1)">-</button>
        <span id="cond-qty-${safeName}" class="add-btn-qty" data-name="${cName}" data-price="${cPrice}">0</span>
        <button type="button" onclick="adjustCondimentQty('${cName.replace(/'/g, "\\'")}', 1)">+</button>
      </div>
    `;
    listContainer.appendChild(row);
  });
  
  // Set button handler
  const saveBtn = document.getElementById("btn-save-addons");
  saveBtn.onclick = () => {
    const qtyEl = document.getElementById("addon-item-qty");
    const productQty = qtyEl ? (parseInt(qtyEl.innerText) || 1) : 1;
    
    const condimentSpans = document.querySelectorAll("#addons-checkboxes-container .add-btn-qty");
    const selectedCondiments = [];
    const selectedChoices = document.querySelectorAll("#addons-checkboxes-container .choice-option-row input[type='radio']:checked");
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
          quantity: 1,
          type: "choice",
          group: groupName,
          choice: choiceName
        });
      }
    });
    
    condimentSpans.forEach(span => {
      const qty = parseInt(span.innerText) || 0;
      if (qty > 0) {
        const name = span.getAttribute("data-name");
        const price = parseFloat(span.getAttribute("data-price")) || 0;
        selectedCondiments.push({ name, price, quantity: qty });
      }
    });
    
    addProductToCart(product, productQty, selectedCondiments, selectedProductIsPreOrder);
    toggleAddonsModal(false);
  };

  // Populate Pairings
  const pairingsContainer = document.getElementById("addon-pairings-container");
  const pairingsList = document.getElementById("addon-pairings-list");
  if (pairingsList) pairingsList.innerHTML = "";
  
  if (pairingsContainer && pairingsList) {
    const pairings = getProductPairings(product);
    if (pairings.length > 0) {
      pairingsContainer.style.display = "block";
      const allProducts = TFL_DB.getProducts();
      const visibleSubBrands = new Set(
        TFL_DB.getSubBrands()
          .filter(s => s && (s.visible === true || s.visible === "true" || s.visible === 1 || s.visible === "1"))
          .map(s => s.id)
      );
      
      pairings.forEach(pId => {
        const pairedProd = allProducts.find(p => p.id === pId && !p.unlisted && p.inStock && visibleSubBrands.has(p.category));
        if (!pairedProd) return;
        
        const card = document.createElement("div");
        card.className = "pairing-card";
        
        const vegClass = pairedProd.veg ? "veg" : "nonveg";
        const inCartQty = getCartProductQty(pairedProd.id);
        const actionContainerId = `pairing-action-${pairedProd.id}`;
        
        card.innerHTML = `
          <div class="pairing-img-container">
            <div class="pairing-veg-badge ${vegClass}"></div>
            <img src="${pairedProd.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80'}" alt="${pairedProd.name}">
          </div>
          <div class="pairing-name" title="${pairedProd.name}">${pairedProd.name}</div>
          <div class="pairing-price-container">
            <span class="pairing-original-price">₹${Math.round(pairedProd.price * 1.20)}</span>
            <span class="pairing-price">₹${pairedProd.price}</span>
          </div>
          <div id="${actionContainerId}" style="width: 100%; margin-top: auto; display: flex; align-items: center; justify-content: center;">
            ${getPairingActionBtnHtml(pairedProd.id, inCartQty)}
          </div>
        `;
        pairingsList.appendChild(card);
      });
      
      if (pairingsList.children.length === 0) {
        pairingsContainer.style.display = "none";
      }
    } else {
      pairingsContainer.style.display = "none";
    }
  }
  
  toggleAddonsModal(true);
}

function addPairedProductToCart(pairedProductId) {
  const product = TFL_DB.getProducts().find(p => p.id === pairedProductId);
  if (!product) return;
  
  const remaining = product.stockLimit !== undefined && product.stockLimit !== null ? Math.max(0, product.stockLimit - (product.currentStockSold || 0)) : null;
  const isItemInStock = product.inStock && (remaining === null || remaining > 0);
  
  const conds = product.condiments || [];
  const choiceGroups = product.optionGroups || product.choiceGroups || [];
  
  if (conds.length === 0 && choiceGroups.length === 0) {
    addProductToCart(product, 1, [], !isItemInStock);
    TFL_DB.showToast(`${product.name} added to cart!`, "success");
    updatePairingsDisplay();
  } else {
    toggleAddonsModal(false);
    setTimeout(() => {
      initiateAddToCart(pairedProductId, !isItemInStock);
    }, 300);
  }
}

function getPairingActionBtnHtml(productId, qty) {
  if (qty > 0) {
    return `
      <div class="pairing-qty-wrapper">
        <button type="button" onclick="handleProductDecrement('${productId}')">-</button>
        <span class="pairing-qty-qty">${qty}</span>
        <button type="button" onclick="addPairedProductToCart('${productId}')">+</button>
      </div>
    `;
  } else {
    return `
      <button type="button" class="pairing-add-btn" onclick="addPairedProductToCart('${productId}')">
        ADD <span style="font-size:0.65rem; vertical-align: middle;">+</span>
      </button>
    `;
  }
}

function updatePairingsDisplay() {
  if (!selectedProductForAddons) return;
  const pairings = getProductPairings(selectedProductForAddons);
  const allProducts = TFL_DB.getProducts();
  
  pairings.forEach(pId => {
    const container = document.getElementById(`pairing-action-${pId}`);
    if (container) {
      const inCartQty = getCartProductQty(pId);
      container.innerHTML = getPairingActionBtnHtml(pId, inCartQty);
    }
  });
}

function toggleAddonsModal(show) {
  const modal = document.getElementById("condiments-modal-sheet");
  const backdrop = document.getElementById("modal-backdrop");
  if (show) {
    modal.classList.add("active");
    backdrop.classList.add("active");
  } else {
    modal.classList.remove("active");
    backdrop.classList.remove("active");
    selectedProductForAddons = null;
  }
}

// Helper to compare condiments names and quantities for duplicate checks
function areCondimentsEqual(cond1, cond2) {
  const getCondKey = c => typeof c === 'object' && c !== null ? `${c.name}:${c.quantity || 0}` : `${c}:0`;
  const c1 = (cond1 || []).map(getCondKey).sort();
  const c2 = (cond2 || []).map(getCondKey).sort();
  return JSON.stringify(c1) === JSON.stringify(c2);
}

// Helper to push items to Cart array
function addProductToCart(product, quantity, condiments, isPreOrder = false) {
  if (currentReceiptOrder) {
    const items = currentReceiptOrder.items || [];
    const existingIdx = items.findIndex(item => 
      item.id === product.id && 
      areCondimentsEqual(item.condiments, condiments) &&
      (item.is_backorder || false) === (isPreOrder || false)
    );
    
    const basePrice = product.price;
    
    if (existingIdx !== -1) {
      items[existingIdx].quantity += quantity;
      items[existingIdx].condiments.forEach(c1 => {
        const incoming = condiments.find(c2 => (typeof c2 === 'object' ? c2.name : c2) === (typeof c1 === 'object' ? c1.name : c1));
        if (incoming && typeof c1 === 'object') {
          c1.quantity = (c1.quantity || 0) + (incoming.quantity || 0);
        }
      });
      const itemCondPrice = items[existingIdx].condiments.reduce((sum, c) => sum + (typeof c === 'object' ? (c.price || 0) * (c.quantity || 0) : 0), 0);
      items[existingIdx].price = basePrice + (itemCondPrice / items[existingIdx].quantity);
    } else {
      const condimentsPrice = condiments.reduce((sum, c) => sum + (typeof c === 'object' ? (c.price || 0) * (c.quantity || 0) : 0), 0);
      const unitPrice = basePrice + (quantity > 0 ? (condimentsPrice / quantity) : 0);
      items.push({
        id: product.id,
        name: product.name,
        quantity: quantity,
        price: unitPrice,
        condiments: condiments,
        is_backorder: isPreOrder,
        prep_delay_minutes: isPreOrder ? (product.prepDelay || 20) : undefined
      });
    }
    
    recalculateReceiptOrderTotals(currentReceiptOrder);
    TFL_DB.updateOrder(currentReceiptOrder);
    try {
      TFL_DB.addOrderToCloud(currentReceiptOrder);
    } catch (e) {}
    if (document.getElementById("receipt-modal").classList.contains("active")) {
      openReceiptModal(currentReceiptOrder);
    }
    updateCartDisplay();
    renderProducts();
    return;
  }

  // Check if an item with the exact same product, condiments list, and pre-order status already exists in cart
  const existingIdx = cart.findIndex(item => 
    item.product.id === product.id && 
    areCondimentsEqual(item.condiments, condiments) &&
    (item.is_backorder || false) === (isPreOrder || false)
  );
  
  const basePrice = product.price;
  const condimentsPrice = condiments.reduce((sum, c) => sum + (typeof c === 'object' ? (c.price || 0) * (c.quantity || 0) : 0), 0);
  const subtotal = (quantity * basePrice) + condimentsPrice;
  
  if (existingIdx !== -1) {
    cart[existingIdx].quantity += quantity;
    cart[existingIdx].condiments.forEach(c1 => {
      const incoming = condiments.find(c2 => (typeof c2 === 'object' ? c2.name : c2) === (typeof c1 === 'object' ? c1.name : c1));
      if (incoming && typeof c1 === 'object') {
        c1.quantity = (c1.quantity || 0) + (incoming.quantity || 0);
      }
    });
    const itemQty = cart[existingIdx].quantity;
    const itemCondPrice = cart[existingIdx].condiments.reduce((sum, c) => sum + (typeof c === 'object' ? (c.price || 0) * (c.quantity || 0) : 0), 0);
    cart[existingIdx].subtotal = (itemQty * basePrice) + itemCondPrice;
  } else {
    cart.push({
      product: product,
      quantity: quantity,
      condiments: condiments,
      subtotal: subtotal,
      is_backorder: isPreOrder,
      prep_delay_minutes: isPreOrder ? (product.prepDelay || 20) : undefined
    });
  }
  
  // Save cart to session cache
  sessionStorage.setItem("tfl_customer_cart", JSON.stringify(cart));
  
  updateCartDisplay();
  renderProducts(); // Update count widgets on cards
}

function applyPromoCode(source) {
  const inputId = source === 'cart' ? 'cart-promo-input' : 'checkout-promo-input';
  const msgId = source === 'cart' ? 'cart-promo-message' : 'checkout-promo-message';
  
  const inputEl = document.getElementById(inputId);
  const msgEl = document.getElementById(msgId);
  
  if (!inputEl) return;
  
  // If a code is currently applied, the button is "Remove"
  if (appliedPromoCode) {
    removePromoCode();
    return;
  }
  
  const code = inputEl.value.trim().toUpperCase();
  if (!code) {
    TFL_DB.showToast("Please enter a promo code first.", "warning");
    return;
  }
  
  const promocodes = TFL_DB.getPromoCodes ? TFL_DB.getPromoCodes() : [];
  const match = promocodes.find(p => p.code.toUpperCase() === code);
  
  if (!match) {
    TFL_DB.showToast("Invalid promo code. Please try again.", "error");
    if (msgEl) {
      msgEl.innerText = "Invalid promo code.";
      msgEl.style.color = "var(--color-danger)";
      msgEl.style.display = "block";
    }
    return;
  }
  
  if (match.active === false || match.active === "false" || match.active === 0 || match.active === "0") {
    TFL_DB.showToast("This promo code is no longer active.", "error");
    if (msgEl) {
      msgEl.innerText = "Inactive promo code.";
      msgEl.style.color = "var(--color-danger)";
      msgEl.style.display = "block";
    }
    return;
  }
  
  const todayStr = new Date().toISOString().split('T')[0];
  if (match.validTill && match.validTill < todayStr) {
    TFL_DB.showToast("This promo code has expired.", "error");
    if (msgEl) {
      msgEl.innerText = "Expired promo code.";
      msgEl.style.color = "var(--color-danger)";
      msgEl.style.display = "block";
    }
    return;
  }
  
  // Success!
  appliedPromoCode = {
    code: match.code,
    discountPercent: parseFloat(match.discountPercent) || 0
  };
  
  TFL_DB.showToast(`Promo code '${match.code}' applied successfully!`, "success");
  
  // Sync both inputs & UI state
  syncPromoCodeInputs();
  updateCartDisplay();
}

function removePromoCode() {
  appliedPromoCode = null;
  TFL_DB.showToast("Promo code removed.", "info");
  syncPromoCodeInputs();
  updateCartDisplay();
}

function syncPromoCodeInputs() {
  const cartInput = document.getElementById('cart-promo-input');
  const cartMsg = document.getElementById('cart-promo-message');
  const cartBtn = document.getElementById('btn-apply-promo-cart');
  
  const checkInput = document.getElementById('checkout-promo-input');
  const checkMsg = document.getElementById('checkout-promo-message');
  const checkBtn = document.getElementById('btn-apply-promo-checkout');
  
  if (appliedPromoCode) {
    if (cartInput) {
      cartInput.value = appliedPromoCode.code;
      cartInput.disabled = true;
    }
    if (cartBtn) {
      cartBtn.innerText = "Remove";
      cartBtn.className = "btn btn-danger";
    }
    if (cartMsg) {
      cartMsg.innerText = `Code '${appliedPromoCode.code}' applied (${appliedPromoCode.discountPercent}% off subtotal).`;
      cartMsg.style.color = "var(--color-success)";
      cartMsg.style.display = "block";
    }
    
    if (checkInput) {
      checkInput.value = appliedPromoCode.code;
      checkInput.disabled = true;
    }
    if (checkBtn) {
      checkBtn.innerText = "Remove";
      checkBtn.className = "btn btn-danger";
    }
    if (checkMsg) {
      checkMsg.innerText = `Code '${appliedPromoCode.code}' applied (${appliedPromoCode.discountPercent}% off subtotal).`;
      checkMsg.style.color = "var(--color-success)";
      checkMsg.style.display = "block";
    }
  } else {
    if (cartInput) {
      cartInput.value = "";
      cartInput.disabled = false;
    }
    if (cartBtn) {
      cartBtn.innerText = "Apply";
      cartBtn.className = "btn btn-primary";
    }
    if (cartMsg) {
      cartMsg.style.display = "none";
      cartMsg.innerText = "";
    }
    
    if (checkInput) {
      checkInput.value = "";
      checkInput.disabled = false;
    }
    if (checkBtn) {
      checkBtn.innerText = "Apply";
      checkBtn.className = "btn btn-primary";
    }
    if (checkMsg) {
      checkMsg.style.display = "none";
      checkMsg.innerText = "";
    }
  }
}

// Helper to determine delivery charges based on free delivery settings
function calculateDeliveryCharge(subtotal, settings) {
  if (subtotal <= 0) return 0;
  if (settings.freeDeliveryMinOrderEnabled && subtotal >= settings.freeDeliveryMinOrderAmount) {
    return 0;
  }
  return settings.deliveryCharge;
}

// Update Cart totals and displays
function updateCartDisplay() {
  const stickyPanel = document.getElementById("sticky-cart-panel");
  if (!stickyPanel) return;
  
  if (currentReceiptOrder) {
    const totalItems = (currentReceiptOrder.items || []).reduce((sum, item) => sum + item.quantity, 0);
    const grandTotal = currentReceiptOrder.grandTotal || 0;
    
    if (totalItems > 0) {
      stickyPanel.style.display = "flex";
      stickyPanel.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      stickyPanel.style.borderColor = "#10b981";
      document.getElementById("sticky-cart-qty-text").innerText = `Modifying Order: ${currentReceiptOrder.id}`;
      document.getElementById("sticky-cart-total-text").innerText = `₹${grandTotal.toFixed(2)}`;
      
      const viewCartDiv = stickyPanel.querySelector(".sticky-cart-view");
      if (viewCartDiv) {
        viewCartDiv.innerHTML = `View Receipt <i data-lucide="check-circle"></i>`;
      }
      
      stickyPanel.onclick = () => openReceiptModal(currentReceiptOrder);
    } else {
      stickyPanel.style.display = "none";
    }
    lucide.createIcons();
    updatePairingsDisplay();
    return;
  }

  // Restore default styles for regular cart mode
  stickyPanel.style.background = "";
  stickyPanel.style.borderColor = "";
  const viewCartDiv = stickyPanel.querySelector(".sticky-cart-view");
  if (viewCartDiv) {
    viewCartDiv.innerHTML = `View Cart <i data-lucide="shopping-bag"></i>`;
  }
  stickyPanel.onclick = () => toggleCartPanel(true);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  
  const settings = TFL_DB.getSettings();
  const delivery = calculateDeliveryCharge(cartSubtotal, settings);
  const lateNight = (cartSubtotal > 0 && settings.lateNightFeeEnabled) ? settings.lateNightFeeAmount : 0;
  
  let discountAmount = 0;
  if (appliedPromoCode) {
    discountAmount = Math.round(cartSubtotal * (appliedPromoCode.discountPercent / 100));
  }
  
  let dynamicDiscount = 0;
  const isScheduledLater = document.querySelector('input[name="delivery-option"]:checked')?.value === 'later';
  const selectedSlotEl = document.getElementById("delivery-time-slot");
  const isOffPeakSlot = isScheduledLater && selectedSlotEl && selectedSlotEl.options[selectedSlotEl.selectedIndex]?.dataset.isPeak === "false";
  
  if (isOffPeakSlot && settings.discountPercent > 0) {
    dynamicDiscount += cartSubtotal * (settings.discountPercent / 100);
  }
  
  cart.forEach(item => {
    if (item.is_backorder && settings.discountPercent > 0) {
      dynamicDiscount += item.subtotal * (settings.discountPercent / 100);
    }
  });
  
  dynamicDiscount = Math.round(dynamicDiscount);
  const totalDiscount = discountAmount + dynamicDiscount;
  const grandTotal = Math.max(0, cartSubtotal - totalDiscount + delivery + lateNight);
  
  if (totalItems > 0) {
    stickyPanel.style.display = "flex";
    document.getElementById("sticky-cart-qty-text").innerText = `${totalItems} Item${totalItems > 1 ? 's' : ''} Added`;
    document.getElementById("sticky-cart-total-text").innerText = `₹${grandTotal.toFixed(2)}`;
  } else {
    stickyPanel.style.display = "none";
  }
  
  document.getElementById("cart-subtotal-price").innerText = `₹${cartSubtotal.toFixed(2)}`;
  
  const cartDeliveryEl = document.getElementById("cart-delivery-charge");
  if (cartDeliveryEl) {
    if (delivery === 0 && settings.freeDeliveryMinOrderEnabled && cartSubtotal >= settings.freeDeliveryMinOrderAmount) {
      cartDeliveryEl.innerHTML = `<span style="text-decoration: line-through; color: var(--color-text-muted); margin-right: 6px;">₹${settings.deliveryCharge.toFixed(2)}</span><span style="color: var(--color-success); font-weight: 600;">Free</span>`;
    } else {
      cartDeliveryEl.innerText = `₹${delivery.toFixed(2)}`;
    }
  }

  // Update Free Delivery Banner/Progress Indicator
  const freeDeliveryBanner = document.getElementById("cart-free-delivery-banner");
  if (freeDeliveryBanner) {
    if (cartSubtotal > 0 && settings.freeDeliveryMinOrderEnabled) {
      freeDeliveryBanner.style.display = "flex";
      if (cartSubtotal >= settings.freeDeliveryMinOrderAmount) {
        freeDeliveryBanner.innerHTML = `<span>🎉 <strong>Free Delivery unlocked!</strong> You saved ₹${settings.deliveryCharge.toFixed(2)}</span>`;
        freeDeliveryBanner.style.background = "rgba(22, 163, 74, 0.1)";
        freeDeliveryBanner.style.borderColor = "rgba(22, 163, 74, 0.2)";
        freeDeliveryBanner.style.color = "var(--color-success)";
      } else {
        const needed = settings.freeDeliveryMinOrderAmount - cartSubtotal;
        freeDeliveryBanner.innerHTML = `<span>🚚 Add <strong>₹${needed.toFixed(2)}</strong> more for <strong>FREE Delivery</strong>!</span>`;
        freeDeliveryBanner.style.background = "rgba(249, 115, 22, 0.1)";
        freeDeliveryBanner.style.borderColor = "rgba(249, 115, 22, 0.2)";
        freeDeliveryBanner.style.color = "var(--color-warning)";
      }
    } else {
      freeDeliveryBanner.style.display = "none";
    }
  }
  
  const lateNightRow = document.getElementById("cart-late-night-row");
  if (lateNightRow) {
    if (lateNight > 0) {
      lateNightRow.style.display = "flex";
      document.getElementById("cart-late-night-fee").innerText = `₹${lateNight.toFixed(2)}`;
    } else {
      lateNightRow.style.display = "none";
    }
  }
  
  const cartDiscountRow = document.getElementById("cart-discount-row");
  const cartDiscountPercent = document.getElementById("cart-discount-percent");
  const cartDiscountAmount = document.getElementById("cart-discount-amount");
  if (cartDiscountRow && cartDiscountPercent && cartDiscountAmount) {
    if (totalDiscount > 0) {
      cartDiscountRow.style.display = "flex";
      let discountLabels = [];
      if (appliedPromoCode) discountLabels.push(`${appliedPromoCode.code} (${appliedPromoCode.discountPercent}%)`);
      if (isOffPeakSlot) discountLabels.push(`Off-Peak (${settings.discountPercent}%)`);
      const hasBackorder = cart.some(i => i.is_backorder);
      if (hasBackorder) discountLabels.push(`Pre-Order (${settings.discountPercent}%)`);
      
      cartDiscountPercent.innerText = discountLabels.join(" + ") || "Discount";
      cartDiscountAmount.innerText = `-₹${totalDiscount.toFixed(2)}`;
    } else {
      cartDiscountRow.style.display = "none";
    }
  }
  
  document.getElementById("cart-grand-total-price").innerText = `₹${grandTotal.toFixed(2)}`;

  // Update Checkout summary display
  const checkoutSubtotal = document.getElementById("checkout-subtotal-price");
  const checkoutDiscountRow = document.getElementById("checkout-discount-row");
  const checkoutDiscountPercent = document.getElementById("checkout-discount-percent");
  const checkoutDiscountAmount = document.getElementById("checkout-discount-amount");
  const checkoutDelivery = document.getElementById("checkout-delivery-charge");
  const checkoutLateNightRow = document.getElementById("checkout-late-night-row");
  const checkoutLateNightFee = document.getElementById("checkout-late-night-fee");
  const checkoutGrandTotal = document.getElementById("checkout-grand-total-price");

  if (checkoutSubtotal) checkoutSubtotal.innerText = `₹${cartSubtotal.toFixed(2)}`;
  if (checkoutDelivery) {
    if (delivery === 0 && settings.freeDeliveryMinOrderEnabled && cartSubtotal >= settings.freeDeliveryMinOrderAmount) {
      checkoutDelivery.innerHTML = `<span style="text-decoration: line-through; color: var(--color-text-muted); margin-right: 6px;">₹${settings.deliveryCharge.toFixed(2)}</span><span style="color: var(--color-success); font-weight: 600;">Free</span>`;
    } else {
      checkoutDelivery.innerText = `₹${delivery.toFixed(2)}`;
    }
  }
  if (checkoutLateNightRow && checkoutLateNightFee) {
    if (lateNight > 0) {
      checkoutLateNightRow.style.display = "flex";
      checkoutLateNightFee.innerText = `₹${lateNight.toFixed(2)}`;
    } else {
      checkoutLateNightRow.style.display = "none";
    }
  }
  if (checkoutDiscountRow && checkoutDiscountPercent && checkoutDiscountAmount) {
    if (totalDiscount > 0) {
      checkoutDiscountRow.style.display = "flex";
      let discountLabels = [];
      if (appliedPromoCode) discountLabels.push(`${appliedPromoCode.code} (${appliedPromoCode.discountPercent}%)`);
      if (isOffPeakSlot) discountLabels.push(`Off-Peak (${settings.discountPercent}%)`);
      const hasBackorder = cart.some(i => i.is_backorder);
      if (hasBackorder) discountLabels.push(`Pre-Order (${settings.discountPercent}%)`);
      
      checkoutDiscountPercent.innerText = discountLabels.join(" + ") || "Discount";
      checkoutDiscountAmount.innerText = `-₹${totalDiscount.toFixed(2)}`;
    } else {
      checkoutDiscountRow.style.display = "none";
    }
  }
  if (checkoutGrandTotal) checkoutGrandTotal.innerText = `₹${grandTotal.toFixed(2)}`;
  
  renderCartItems();
  lucide.createIcons();
  updatePairingsDisplay();
}

// Render Items inside Slide over
function renderCartItems() {
  const container = document.getElementById("cart-items-container");
  if (!container) return;
  
  if (cart.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 0; color: var(--color-text-muted);">
        <i data-lucide="shopping-bag" style="width: 48px; height: 48px; stroke-width: 1.5; margin-bottom: var(--space-sm);"></i>
        <p>Your research cart is empty.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  container.innerHTML = "";
  
  cart.forEach((item, index) => {
    const row = document.createElement("div");
    row.style.borderBottom = "1px solid var(--color-border)";
    row.style.padding = "12px 0";
    row.style.display = "flex";
    row.style.flexDirection = "column";
    row.style.gap = "4px";
    
    const condimentListStr = item.condiments.length > 0 
      ? `<span style="font-size: 0.72rem; color: var(--color-primary); font-weight: 500;">Add-ons: ${item.condiments.map(c => {
          if (c && typeof c === 'object') {
            const qtyText = c.quantity && c.quantity > 1 ? ` (x${c.quantity})` : '';
            return `${c.name}${qtyText} (+₹${c.price})`;
          }
          return c;
        }).join(', ')}</span>`
      : "";
      
    const eachPrice = (item.subtotal / item.quantity).toFixed(2);
    const preorderBadgeStr = item.is_backorder 
      ? `<span class="cart-preorder-badge" style="margin-left: 6px; vertical-align: middle;">Pre-Order (+${item.prep_delay_minutes || 20}m)</span>`
      : "";
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h4 style="font-size: 0.95rem; color: #fff; display: flex; align-items: center; flex-wrap: wrap;">
            ${item.product.name}
            ${preorderBadgeStr}
          </h4>
          ${condimentListStr}
        </div>
        <span style="font-weight: 700; font-size: 0.95rem; color: #fff;">₹${item.subtotal}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
        <span style="font-size: 0.8rem; color: var(--color-text-muted);">₹${eachPrice} each</span>
        <div class="add-btn-wrapper" style="transform: scale(0.9);">
          <button onclick="updateCartQty(${index}, -1)">-</button>
          <span class="add-btn-qty">${item.quantity}</span>
          <button onclick="updateCartQty(${index}, 1)">+</button>
        </div>
      </div>
    `;
    container.appendChild(row);
  });
}

// Modify cart quantities
function updateCartQty(index, offset) {
  if (offset > 0 && cart[index] && cart[index].product && !cart[index].is_backorder) {
    const product = cart[index].product;
    const remaining = product.stockLimit !== undefined && product.stockLimit !== null ? Math.max(0, product.stockLimit - (product.currentStockSold || 0)) : null;
    if (remaining !== null && cart[index].quantity + offset > remaining) {
      TFL_DB.showToast(`Only ${remaining} items are left in stock.`, "warning");
      return;
    }
  }
  cart[index].quantity += offset;
  
  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  } else {
    const newQty = cart[index].quantity;
    if (cart[index].condiments) {
      cart[index].condiments.forEach(c => {
        if (isFreeCondiment(c)) {
          if (c.quantity > newQty) {
            c.quantity = newQty;
          }
        }
      });
    }
    const product = cart[index].product;
    const condiments = cart[index].condiments || [];
    const basePrice = product.price;
    const condimentsPrice = condiments.reduce((sum, c) => sum + (typeof c === 'object' ? (c.price || 0) * (c.quantity || 0) : 0), 0);
    cart[index].subtotal = (newQty * basePrice) + condimentsPrice;
  }
  
  sessionStorage.setItem("tfl_customer_cart", JSON.stringify(cart));
  updateCartDisplay();
  renderProducts();
}

// Open & Close Panels
function toggleCartPanel(show) {
  const panel = document.getElementById("cart-slide-over");
  const backdrop = document.getElementById("modal-backdrop");
  if (show) {
    panel.classList.add("active");
    backdrop.classList.add("active");
  } else {
    panel.classList.remove("active");
    backdrop.classList.remove("active");
  }
}

function toggleCheckoutPanel(show) {
  const panel = document.getElementById("checkout-slide-over");
  const backdrop = document.getElementById("modal-backdrop");
  if (show) {
    panel.classList.add("active");
    backdrop.classList.add("active");
  } else {
    panel.classList.remove("active");
    backdrop.classList.remove("active");
  }
}

function closeAllPanels() {
  toggleCartPanel(false);
  toggleCheckoutPanel(false);
  toggleAddonsModal(false);
  closeReceiptModal();
}

function openCheckoutPanel() {
  if (cart.length === 0) return;
  currentReceiptOrder = null;
  resetCheckoutForm();
  toggleCartPanel(false);
  toggleCheckoutPanel(true);
  syncPromoCodeInputs();
  
  const settings = TFL_DB.getSettings();
  const schedSection = document.getElementById("scheduling-section");
  if (schedSection) {
    if (settings.isSchedulingEnabled) {
      schedSection.style.display = "block";
      populateTimeSlots(settings);
    } else {
      schedSection.style.display = "none";
    }
  }
  
  updateCartDisplay();
}

function resetCheckoutForm() {
  const form = document.getElementById("checkout-form");
  if (!form) return;
  form.reset();
  const gender = document.getElementById("cust-gender");
  if (gender) gender.value = "";
  const codOption = document.querySelector('input[name="payment-mode"][value="COD"]');
  if (codOption) codOption.checked = true;
  toggleUpiSection(false);
  
  const deliverNow = document.querySelector('input[name="delivery-option"][value="now"]');
  if (deliverNow) deliverNow.checked = true;
  const schedSelect = document.getElementById("scheduling-select-container");
  if (schedSelect) schedSelect.style.display = "none";
  
  const checkoutBtn = document.getElementById("btn-submit-checkout");
  if (checkoutBtn) {
    checkoutBtn.disabled = false;
    checkoutBtn.innerText = "Place Order";
  }
}

// Toggle UPI payment instructions
function toggleUpiSection(show) {
  const upiDiv = document.getElementById("checkout-upi-info");
  if (!upiDiv) return;
  if (show) {
    refreshCheckoutUpiDetails();
  }
  upiDiv.style.display = show ? "flex" : "none";
}

function refreshCheckoutUpiDetails(currentSettings) {
  const settings = currentSettings || TFL_DB.getSettings();
  const upiId = settings.upiId || "UPI ID not configured";
  const upiInput = document.getElementById("checkout-upi-id");
  const upiDisplay = document.getElementById("checkout-upi-display-value");
  const upiQr = document.getElementById("checkout-upi-qr");

  if (upiInput) upiInput.value = upiId;
  if (upiDisplay) upiDisplay.innerText = upiId;
  if (upiQr) {
    upiQr.src = settings.qrImageUrl || "";
    upiQr.style.display = settings.qrImageUrl ? "block" : "none";
  }
}

function copyUpiId() {
  const upiInput = document.getElementById("checkout-upi-id");
  upiInput.select();
  upiInput.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(upiInput.value);
  TFL_DB.showToast("UPI ID Copied to Clipboard: " + upiInput.value, "success");
}

// Generate Receipt order code
async function generateOrderCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const prefix = `TFL-${year}${month}${date}-`;

  let maxSeq = 100;

  // 1. Try to query Supabase for the highest sequence number for this date prefix
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
        console.warn("Failed to query Supabase for order sequence, falling back to local:", err);
      }
    }
  }

  // 2. Also check local orders cache in case we added some locally
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

  // 3. Fallback to localStorage tracking if it is higher
  const localSeqKey = `tfl_order_seq_${year}${month}${date}`;
  let localSeq = parseInt(localStorage.getItem(localSeqKey) || "100");
  if (localSeq > maxSeq) {
    maxSeq = localSeq;
  }

  const nextSeq = maxSeq + 1;
  // Save next sequence to localStorage for this specific day
  localStorage.setItem(localSeqKey, nextSeq);

  return `${prefix}${nextSeq}`;
}

// Place Order Submit Action
async function submitOrder(event) {
  event.preventDefault();
  
  let clientIp = "Unknown";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const ipRes = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    clearTimeout(timeoutId);
    if (ipRes.ok) {
      const ipData = await ipRes.json();
      clientIp = ipData.ip || "Unknown";
    }
  } catch (e) {
    console.warn("Failed to fetch client IP:", e);
  }
  
  const settings = TFL_DB.getSettings();
  if (!settings.isOpen) {
    TFL_DB.showToast("Our kitchen is currently closed. Order cannot be placed.", "error");
    return;
  }
  
  const name = document.getElementById("cust-name").value.trim();
  const gender = document.getElementById("cust-gender").value;
  const phone = document.getElementById("cust-phone").value.trim();
  const address = document.getElementById("cust-address").value.trim();
  const email = document.getElementById("cust-email").value.trim();
  const note = document.getElementById("cust-note").value.trim();
  const paymentMode = document.querySelector('input[name="payment-mode"]:checked').value;
  
  // Live stock validation check
  const checkoutBtn = document.getElementById("btn-submit-checkout");
  if (checkoutBtn) {
    checkoutBtn.disabled = true;
    checkoutBtn.innerText = "Verifying stock...";
  }

  try {
    const stockCheck = await TFL_DB.verifyStockAndIncrement(cart);
    if (!stockCheck.success) {
      TFL_DB.showToast(stockCheck.errorMessage, "error");
      if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.innerText = "Place Order";
      }
      return;
    }
  } catch (e) {
    console.error("Stock check failed:", e);
    TFL_DB.showToast("Stock validation failed. Please try again.", "error");
    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.innerText = "Place Order";
    }
    return;
  }

  const orderId = await generateOrderCode();
  const cartSubtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const delivery = calculateDeliveryCharge(cartSubtotal, settings);
  const lateNight = settings.lateNightFeeEnabled ? settings.lateNightFeeAmount : 0;
  
  let discountAmount = 0;
  let promoCodeName = "";
  let promoDiscountPercent = 0;
  if (appliedPromoCode) {
    promoCodeName = appliedPromoCode.code;
    promoDiscountPercent = appliedPromoCode.discountPercent;
    discountAmount = Math.round(cartSubtotal * (promoDiscountPercent / 100));
  }
  
  let dynamicDiscount = 0;
  const deliveryOption = document.querySelector('input[name="delivery-option"]:checked')?.value || 'now';
  const scheduledTimeSlot = deliveryOption === 'later' ? document.getElementById("delivery-time-slot")?.value || '' : '';
  
  const selectedSlotEl = document.getElementById("delivery-time-slot");
  const isOffPeakSlot = deliveryOption === 'later' && selectedSlotEl && selectedSlotEl.options[selectedSlotEl.selectedIndex]?.dataset.isPeak === "false";
  
  if (isOffPeakSlot && settings.discountPercent > 0) {
    dynamicDiscount += cartSubtotal * (settings.discountPercent / 100);
  }
  
  cart.forEach(item => {
    if (item.is_backorder && settings.discountPercent > 0) {
      dynamicDiscount += item.subtotal * (settings.discountPercent / 100);
    }
  });
  
  dynamicDiscount = Math.round(dynamicDiscount);
  const totalDiscount = discountAmount + dynamicDiscount;
  const grandTotal = Math.max(0, cartSubtotal - totalDiscount + delivery + lateNight);
  
  // Formulate items summary object array
  const orderedItems = cart.map(item => ({
    id: item.product.id,
    name: item.product.name,
    category: item.product.category,
    subBrand: item.product.category,
    quantity: item.quantity,
    price: item.subtotal / item.quantity,
    condiments: item.condiments,
    is_backorder: item.is_backorder || false,
    prep_delay_minutes: item.prep_delay_minutes || null
  }));

  const orderObj = {
    id: orderId,
    customerName: name,
    customerGender: gender,
    customerPhone: phone,
    customerWhatsapp: phone,
    customerAddress: address,
    customerEmail: email || "N/A",
    customerNote: note || "",
    paymentMode: paymentMode,
    paymentStatus: "Unpaid", // Payment status defaults to Unpaid
    items: orderedItems, // Array of structured items
    subtotal: cartSubtotal,
    deliveryCharge: delivery,
    lateNightFee: lateNight,
    promoCode: promoCodeName,
    discountPercent: promoDiscountPercent,
    discountAmount: totalDiscount,
    grandTotal: grandTotal,
    deliveryOption: deliveryOption,
    scheduledTimeSlot: scheduledTimeSlot,
    status: "Pending", // Status defaults to Pending
    orderDate: new Date().toLocaleString(),
    createdAt: new Date().toISOString(),
    customerIp: clientIp
  };
  
  // Save order to Local Database
  TFL_DB.addOrder(orderObj);
  
  // Sync runs in the background so the customer gets an instant receipt.
  TFL_DB.syncOrderInBackground(orderObj);

  currentReceiptOrder = orderObj;
  
  // Clear cart and clean inputs
  cart = [];
  appliedPromoCode = null;
  sessionStorage.removeItem("tfl_customer_cart");
  document.getElementById("checkout-form").reset();
  updateCartDisplay();
  renderProducts();
  
  // Show Receipt Modal
  toggleCheckoutPanel(false);
  openReceiptModal(orderObj);

  // Notification runs after receipt generation and never blocks it.
  sendOrderWhatsApp({ automatic: true });
}

// Render receipt markup inside modal
function openReceiptModal(order) {
  // Load the latest status from local storage in case the admin updated it
  const updatedOrder = TFL_DB.getOrders().find(o => o.id === order.id) || order;
  currentReceiptOrder = updatedOrder;
  const container = document.getElementById("print-receipt-area");
  container.innerHTML = "";
  
  let itemsHtml = "";
  order.items.forEach(item => {
    let condimentsList = [];
    if (item.condiments && item.condiments.length > 0) {
      condimentsList = item.condiments.map(c => {
        if (c && typeof c === 'object') {
          const qtyText = c.quantity && c.quantity > 1 ? ` (x${c.quantity})` : '';
          return `${c.name}${qtyText} (₹${c.price.toFixed(2)})`;
        }
        return c;
      });
    }
    const condimentsStr = condimentsList.length > 0 
      ? `<div class="receipt-condiments" style="font-size: 0.75rem; color: var(--color-text-muted); padding-left: 10px;">+ Add-ons: ${condimentsList.join(', ')}</div>` 
      : '';
      
    const preOrderBadge = item.is_backorder 
      ? `<div style="font-size: 0.68rem; color: #f59e0b; font-weight: 700; padding-left: 10px; text-transform: uppercase; margin-top: -2px; margin-bottom: 2px;">[Pre-Order: +${item.prep_delay_minutes || 20}m delay]</div>`
      : "";
    itemsHtml += `
      <div class="receipt-item-row">
        <span>${item.name} x ${item.quantity}</span>
        <span>₹${(item.price * item.quantity).toFixed(2)}</span>
      </div>
      ${preOrderBadge}
      ${condimentsStr}
    `;
  });

  const settings = TFL_DB.getSettings();
  
  container.innerHTML = `
    <div class="receipt-header">
      <h3 class="receipt-title">${settings.restaurantName.toUpperCase()}</h3>
      <p style="font-size: 0.72rem; letter-spacing: 0.1em; color: #555;">${settings.tagline.toUpperCase()}</p>
      <div class="receipt-meta">
        <div><strong>Order ID:</strong> ${order.id}</div>
        <div><strong>Date:</strong> ${order.orderDate}</div>
      </div>
    </div>
    
    <div class="receipt-items">
      ${itemsHtml}
    </div>
    
    <div class="receipt-totals">
      <div class="receipt-total-row">
        <span>Subtotal</span>
        <span>₹${order.subtotal.toFixed(2)}</span>
      </div>
      ${order.promoCode ? `
      <div class="receipt-total-row" style="color: var(--color-success);">
        <span>Discount (${order.promoCode} - ${order.discountPercent}%)</span>
        <span>-₹${(order.discountAmount || 0).toFixed(2)}</span>
      </div>
      ` : ''}
      <div class="receipt-total-row">
        <span>Delivery Charges</span>
        <span>${order.deliveryCharge === 0 ? '<span style="color: var(--color-success); font-weight: 600;">Free</span>' : `₹${order.deliveryCharge.toFixed(2)}`}</span>
      </div>
      ${order.lateNightFee && order.lateNightFee > 0 ? `
      <div class="receipt-total-row">
        <span>Late Night Fee</span>
        <span>₹${order.lateNightFee.toFixed(2)}</span>
      </div>
      ` : ''}
      <div class="receipt-total-row receipt-grand-total">
        <span>GRAND TOTAL</span>
        <span>₹${order.grandTotal.toFixed(2)}</span>
      </div>
    </div>
    
    <div class="receipt-customer">
      <strong>Customer Specifications:</strong><br>
      Name: ${order.customerName}<br>
      Phone: ${order.customerPhone}<br>
      Address: ${order.customerAddress}<br>
      ${order.customerNote ? `Note: ${order.customerNote}<br>` : ''}
      Payment: ${order.paymentMode} (${order.paymentStatus || 'Unpaid'})<br>
      Delivery Status: ${order.status}
    </div>
    
    <div class="receipt-footer-msg">
      🔬 Lab Formulated Goodness! 🔬<br>
      Thank you for testing our recipes.
    </div>
  `;

  // Keep payment verification visible for every receipt; UPI customers send screenshots,
  // COD customers can still send payment confirmation if requested by staff.
  const verificationBox = document.getElementById("upi-verification-whatsapp-box");
  if (verificationBox) verificationBox.style.display = "block";

  updateRestaurantCallLink(settings);
  
  document.getElementById("receipt-modal").classList.add("active");
  document.getElementById("modal-backdrop").classList.add("active");
}

function closeReceiptModal() {
  currentReceiptOrder = null;
  document.getElementById("receipt-modal").classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
  updateCartDisplay();
}

function startNewOrder(confirmFirst = false) {
  if (confirmFirst && cart.length > 0) {
    if (!confirm("Are you sure you want to discard this order and start a new one?")) {
      return;
    }
  }
  currentReceiptOrder = null;
  cart = [];
  sessionStorage.removeItem("tfl_customer_cart");
  updateCartDisplay();
  renderProducts();
  closeAllPanels();
}

function goBackToCartFromCheckout() {
  toggleCheckoutPanel(false);
  toggleCartPanel(true);
}

// Recalculates all pricing variables for an order during post-checkout edits
function recalculateReceiptOrderTotals(order) {
  const settings = TFL_DB.getSettings();
  const products = TFL_DB.getProducts();
  
  (order.items || []).forEach(item => {
    const product = products.find(p => p.id === item.id);
    const basePrice = product ? product.price : (item.price - (((item.condiments || []).reduce((sum, c) => sum + (typeof c === 'object' ? (c.price || 0) * (c.quantity || 0) : 0), 0)) / (item.quantity || 1)));
    const condimentsPrice = (item.condiments || []).reduce((sum, c) => sum + (typeof c === 'object' ? (c.price || 0) * (c.quantity || 0) : 0), 0);
    item.price = basePrice + (item.quantity > 0 ? (condimentsPrice / item.quantity) : 0);
  });

  const subtotal = (order.items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const delivery = calculateDeliveryCharge(subtotal, settings);
  const lateNight = (subtotal > 0 && settings.lateNightFeeEnabled) ? settings.lateNightFeeAmount : 0;
  
  let discountAmount = 0;
  if (order.promoCode && order.discountPercent) {
    discountAmount = Math.round(subtotal * (order.discountPercent / 100));
  }
  const grandTotal = subtotal - discountAmount + delivery + lateNight;
  
  order.subtotal = subtotal;
  order.deliveryCharge = delivery;
  order.lateNightFee = lateNight;
  order.discountAmount = discountAmount;
  order.grandTotal = grandTotal;
}

// Helper to format WhatsApp phone numbers by stripping non-numeric characters and prepending country code 91 if it's 10 digits
function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (clean === "919999999999" || clean === "9999999999") return "";
  if (clean.length === 10) {
    clean = "91" + clean;
  }
  return clean;
}

function getRestaurantWhatsAppNumber(settings, order) {
  const orderNumber = formatWhatsAppNumber(settings.whatsappNumber);
  const supportNumber = formatWhatsAppNumber(settings.supportNumber);
  const customerNumber = formatWhatsAppNumber(order && order.customerPhone);

  if (orderNumber && orderNumber !== customerNumber) return orderNumber;
  if (supportNumber && supportNumber !== customerNumber) return supportNumber;
  return "";
}

function formatDisplayPhone(phone) {
  const clean = formatWhatsAppNumber(phone);
  if (!clean) return "";
  if (clean.startsWith("91") && clean.length === 12) {
    return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
  }
  return `+${clean}`;
}

function getRestaurantCallNumber(settings) {
  return formatWhatsAppNumber(settings.whatsappNumber) || formatWhatsAppNumber(settings.supportNumber);
}

function updateRestaurantCallLink(settings) {
  const callLink = document.getElementById("receipt-call-restaurant");
  const callNumber = document.getElementById("receipt-call-number");
  if (!callLink || !callNumber) return;

  const phone = getRestaurantCallNumber(settings);
  if (!phone) {
    callLink.href = "#";
    callNumber.innerText = "Phone number not configured";
    callLink.setAttribute("aria-disabled", "true");
    return;
  }

  callLink.href = `tel:+${phone}`;
  callNumber.innerText = formatDisplayPhone(phone);
  callLink.removeAttribute("aria-disabled");
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

// Assembles WhatsApp link to place/send order details
function sendOrderWhatsApp(options = {}) {
  if (!currentReceiptOrder) return;
  const settings = TFL_DB.getSettings();
  
  const salutation = getGenderSalutation(currentReceiptOrder);
  const brandGreeting = getSubBrandGreeting(currentReceiptOrder);
  
  // Format the text message
  let message = `Order Received\n`;
  message += `${brandGreeting}\n`;
  message += `${salutation},\n\n`;
  message += `Order Details:\n`;
  message += `--------------------------------------\n`;
  message += `Order ID: ${currentReceiptOrder.id}\n`;
  message += `Date: ${currentReceiptOrder.orderDate}\n`;
  message += `--------------------------------------\n\n`;
  
  currentReceiptOrder.items.forEach(item => {
    const preOrderText = item.is_backorder ? ` [Pre-Order: +${item.prep_delay_minutes || 20}m delay]` : "";
    message += `${item.name} x ${item.quantity}${preOrderText} - Rs ${(item.price * item.quantity).toFixed(2)}\n`;
    const addons = item.condiments.map(c => {
      if (c && typeof c === 'object') {
        const qtyText = c.quantity && c.quantity > 1 ? ` (x${c.quantity})` : '';
        return `${c.name}${qtyText} (+Rs ${c.price})`;
      }
      return c;
    }).join(', ');
    if (addons) {
      message += `  Add-ons: ${addons}\n`;
    }
    message += `\n`;
  });
  
  message += `--------------------------------------\n`;
  message += `Subtotal: Rs ${currentReceiptOrder.subtotal}\n`;
  if (currentReceiptOrder.promoCode) {
    message += `Discount (${currentReceiptOrder.promoCode} - ${currentReceiptOrder.discountPercent}%): -Rs ${currentReceiptOrder.discountAmount}\n`;
  }
  message += `Delivery Charges: Rs ${currentReceiptOrder.deliveryCharge === 0 ? '0 (Free)' : currentReceiptOrder.deliveryCharge}\n`;
  if (currentReceiptOrder.lateNightFee && currentReceiptOrder.lateNightFee > 0) {
    message += `Late Night Fee: Rs ${currentReceiptOrder.lateNightFee}\n`;
  }
  message += `Grand Total: Rs ${currentReceiptOrder.grandTotal}\n`;
  message += `--------------------------------------\n\n`;
  
  message += `CUSTOMER DETAILS:\n`;
  message += `Name: ${currentReceiptOrder.customerName}\n`;
  message += `WhatsApp: ${currentReceiptOrder.customerPhone}\n`;
  if (currentReceiptOrder.deliveryOption === 'later') {
    message += `Delivery option: Scheduled for ${currentReceiptOrder.scheduledTimeSlot} (Schedule & Save)\n`;
  } else {
    message += `Delivery option: Deliver Now\n`;
  }
  message += `Address: ${currentReceiptOrder.customerAddress}\n`;
  if (currentReceiptOrder.customerNote) {
    message += `Note: ${currentReceiptOrder.customerNote}\n`;
  }
  message += `Payment Mode: ${currentReceiptOrder.paymentMode}\n`;
  message += `Payment Status: ${currentReceiptOrder.paymentStatus || 'Unpaid'}\n\n`;
  
  message += `Please confirm receipt and estimate delivery time!`;
  
  const encodedMsg = encodeURIComponent(message);
  const waNumber = getRestaurantWhatsAppNumber(settings, currentReceiptOrder);
  if (!waNumber) {
    TFL_DB.showToast("Restaurant WhatsApp number is not configured correctly. Please contact the kitchen.", "error");
    return;
  }
  
  // Open wa.me link
  window.open(`https://wa.me/${waNumber}?text=${encodedMsg}`, '_blank');
}

// Assembles screenshot verification whatsapp trigger
function sendUpiScreenshotWhatsApp() {
  if (!currentReceiptOrder) return;
  const settings = TFL_DB.getSettings();
  
  let message = `Payment Status Update\n\n`;
  message += `Verify UPI Payment for order ID: ${currentReceiptOrder.id}.\n`;
  message += `Customer Name: ${currentReceiptOrder.customerName}\n`;
  message += `Amount Paid: Rs ${currentReceiptOrder.grandTotal}\n\n`;
  message += `Attaching receipt screenshot below.`;
  
  const encodedMsg = encodeURIComponent(message);
  // Send to customer support or restaurant WhatsApp, never to the customer's own number.
  const waNumber = getRestaurantWhatsAppNumber(settings, currentReceiptOrder);
  if (!waNumber) {
    TFL_DB.showToast("Restaurant WhatsApp number is not configured correctly. Please contact the kitchen.", "error");
    return;
  }
  
  const opened = window.open(`https://wa.me/${waNumber}?text=${encodedMsg}`, '_blank');
  if (!opened && options.automatic) {
    TFL_DB.showToast("Order is ready. Please tap 'Send Order to Restaurant WhatsApp' if WhatsApp did not open.", "info");
  }
}


// Trigger browser printing window
function printReceipt() {
  window.print();
}

// Download receipt PDF
function downloadReceiptPDF() {
  TFL_DB.showToast("In the print menu that opens next, select 'Save as PDF' to save your official receipt.", "info");
  window.print();
}

// --- ORDER SCHEDULING CONTROLLERS ---
function toggleSchedulingSelect(show) {
  const container = document.getElementById("scheduling-select-container");
  if (container) {
    container.style.display = show ? "block" : "none";
  }
  updateCartDisplay();
}

function handleTimeSlotChange() {
  const select = document.getElementById("delivery-time-slot");
  const info = document.getElementById("scheduling-discount-info");
  if (select && info) {
    const selectedOption = select.options[select.selectedIndex];
    const isPeak = selectedOption?.dataset.isPeak === "true";
    const settings = TFL_DB.getSettings();
    if (!isPeak && settings.discountPercent > 0) {
      info.innerText = `🎉 Off-Peak Slot Selected! Save ${settings.discountPercent}% on this order!`;
    } else {
      info.innerText = isPeak ? "Peak Hour Slot selected (Normal Pricing applies)" : "";
    }
  }
  updateCartDisplay();
}

function populateTimeSlots(settings) {
  const select = document.getElementById("delivery-time-slot");
  const info = document.getElementById("scheduling-discount-info");
  if (!select) return;
  select.innerHTML = "";
  if (info) info.innerText = "";

  const now = new Date();
  let startMinutes = now.getHours() * 60 + now.getMinutes() + 45; // Start slots from now + 45 minutes
  startMinutes = Math.ceil(startMinutes / 30) * 30; // Round to nearest 30-minute interval

  const endMinutes = 22 * 60; // Slots end at 10:00 PM (22:00)
  
  if (startMinutes >= endMinutes) {
    select.innerHTML = `<option value="" disabled selected>No delivery slots left for today</option>`;
    return;
  }

  // Parse peak hours
  const parseTime = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
  };
  const peakStart = parseTime(settings.peakHourStart || "19:30");
  const peakEnd = parseTime(settings.peakHourEnd || "21:00");

  let optionsAdded = 0;
  for (let m = startMinutes; m <= endMinutes; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const slotTimeStr = `${hh}:${mm}`;
    
    // Check if slot falls in peak hour window
    const isPeak = m >= peakStart && m <= peakEnd;
    const discountNote = !isPeak && settings.discountPercent > 0 
      ? ` (Save ${settings.discountPercent}%)` 
      : "";
    
    const option = document.createElement("option");
    option.value = slotTimeStr;
    option.dataset.isPeak = isPeak;
    option.innerText = `${slotTimeStr}${discountNote}`;
    select.appendChild(option);
    optionsAdded++;
  }

  if (optionsAdded === 0) {
    select.innerHTML = `<option value="" disabled selected>No delivery slots left for today</option>`;
  } else {
    // Fire event once populated
    handleTimeSlotChange();
  }
}

// Expose functions to window
window.toggleSchedulingSelect = toggleSchedulingSelect;
window.handleTimeSlotChange = handleTimeSlotChange;
window.populateTimeSlots = populateTimeSlots;
window.printReceipt = printReceipt;
window.downloadReceiptPDF = downloadReceiptPDF;
