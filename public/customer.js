// customer.js - Customer Front-end Interactivity for The Food Lab (TFL)

// Global State
let cart = [];
let activeSubBrand = 'all';
let vegFilter = 'all'; // 'all', 'veg', 'nonveg'
let priceSortDirection = null; // null, 'asc', 'desc'
let searchQuery = "";
let selectedProductForAddons = null;
let currentReceiptOrder = null;
let productRenderFrame = null;

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
  let products = TFL_DB.getProducts();
  
  // Filter out unlisted products (done in admin as unlist, here we assume all products has inStock/list property, we add visible check)
  // Let's filter listed only. If unlisted, admin sets visible=false or similar. Let's make sure it handles unlisted status.
  // We'll support an `unlisted` property which default to false.
  products = products.filter(p => !p.unlisted);
  
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
    const card = document.createElement("div");
    card.className = `product-card ${!p.inStock ? 'out-of-stock' : ''}`;
    
    // Veg/NonVeg dot indicators
    const vegBadge = p.veg 
      ? `<span class="dot-icon dot-icon-veg" title="Vegetarian"></span>` 
      : `<span class="dot-icon dot-icon-nonveg" title="Non-Vegetarian"></span>`;
      
    // Badges Row
    let badgeHtml = "";
    if (p.bestseller) {
      badgeHtml += `<span class="badge badge-bestseller">Bestseller</span>`;
    }
    
    // Find quantity currently in cart for this specific item structure
    // Since condiments create unique order entries, we aggregate quantities for this base product
    const totalQty = getCartProductQty(p.id);
    
    let actionBtnHtml = "";
    if (!kitchenOpen) {
      actionBtnHtml = `<button class="add-btn-empty add-btn-disabled" type="button" disabled>Closed</button>`;
    } else if (!p.inStock) {
      actionBtnHtml = `<div class="out-of-stock-badge">Sold Out</div>`;
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
          <button onclick="initiateAddToCart('${p.id}')">+</button>
        </div>
      `;
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
        <div class="product-price-row">
          <span class="product-price">₹${p.price}</span>
        </div>
      </div>
      <div class="product-img-container">
        <img src="${p.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80'}" alt="${p.name}" loading="lazy" decoding="async">
        <div class="product-action">
          ${actionBtnHtml}
        </div>
      </div>
    `;
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
function initiateAddToCart(productId) {
  const settings = TFL_DB.getSettings();
  if (!settings.isOpen) {
    TFL_DB.showToast("Kitchen is closed right now. You can view the menu, but ordering is disabled.", "warning");
    return;
  }
  const product = TFL_DB.getProducts().find(p => p.id === productId);
  if (!product || !product.inStock) return;
  
  selectedProductForAddons = product;
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
  currentQty += offset;
  if (currentQty < 1) currentQty = 1;
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

// Open Customize Modal Sheet
function openAddonsModal(product) {
  document.getElementById("addon-item-name").innerText = `Customize ${product.name}`;
  document.getElementById("addon-item-qty").innerText = "1";
  
  const listContainer = document.getElementById("addons-checkboxes-container");
  listContainer.innerHTML = "";
  
  const subtitleEl = document.getElementById("addon-item-subtitle");
  const condiments = product.condiments || [];
  
  if (condiments.length > 0) {
    if (subtitleEl) subtitleEl.innerText = "Choose optional add-ons";
    listContainer.style.display = "flex";
  } else {
    if (subtitleEl) subtitleEl.innerText = "Select quantity";
    listContainer.style.display = "none";
  }
  
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
    
    condimentSpans.forEach(span => {
      const qty = parseInt(span.innerText) || 0;
      if (qty > 0) {
        const name = span.getAttribute("data-name");
        const price = parseFloat(span.getAttribute("data-price")) || 0;
        selectedCondiments.push({ name, price, quantity: qty });
      }
    });
    
    addProductToCart(product, productQty, selectedCondiments);
    toggleAddonsModal(false);
  };
  
  toggleAddonsModal(true);
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
function addProductToCart(product, quantity, condiments) {
  if (currentReceiptOrder) {
    const items = currentReceiptOrder.items || [];
    const existingIdx = items.findIndex(item => 
      item.id === product.id && 
      areCondimentsEqual(item.condiments, condiments)
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
        condiments: condiments
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

  // Check if an item with the exact same product and condiments list already exists in cart
  const existingIdx = cart.findIndex(item => 
    item.product.id === product.id && 
    areCondimentsEqual(item.condiments, condiments)
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
      subtotal: subtotal
    });
  }
  
  // Save cart to session cache
  sessionStorage.setItem("tfl_customer_cart", JSON.stringify(cart));
  
  updateCartDisplay();
  renderProducts(); // Update count widgets on cards
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
  const delivery = cartSubtotal > 0 ? settings.deliveryCharge : 0;
  const lateNight = (cartSubtotal > 0 && settings.lateNightFeeEnabled) ? settings.lateNightFeeAmount : 0;
  const grandTotal = cartSubtotal + delivery + lateNight;
  
  if (totalItems > 0) {
    stickyPanel.style.display = "flex";
    document.getElementById("sticky-cart-qty-text").innerText = `${totalItems} Item${totalItems > 1 ? 's' : ''} Added`;
    document.getElementById("sticky-cart-total-text").innerText = `₹${grandTotal.toFixed(2)}`;
  } else {
    stickyPanel.style.display = "none";
  }
  
  document.getElementById("cart-subtotal-price").innerText = `₹${cartSubtotal.toFixed(2)}`;
  document.getElementById("cart-delivery-charge").innerText = `₹${delivery.toFixed(2)}`;
  
  const lateNightRow = document.getElementById("cart-late-night-row");
  if (lateNightRow) {
    if (lateNight > 0) {
      lateNightRow.style.display = "flex";
      document.getElementById("cart-late-night-fee").innerText = `₹${lateNight.toFixed(2)}`;
    } else {
      lateNightRow.style.display = "none";
    }
  }
  
  document.getElementById("cart-grand-total-price").innerText = `₹${grandTotal.toFixed(2)}`;
  
  renderCartItems();
  lucide.createIcons();
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
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h4 style="font-size: 0.95rem; color: #fff;">${item.product.name}</h4>
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
function generateOrderCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  
  // Read running count from localStorage, fallback to random
  let count = localStorage.getItem("tfl_order_seq") || 100;
  count = parseInt(count) + 1;
  localStorage.setItem("tfl_order_seq", count);
  
  return `TFL-${year}${month}${date}-${count}`;
}

// Place Order Submit Action
async function submitOrder(event) {
  event.preventDefault();
  
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
  
  const orderId = generateOrderCode();
  const cartSubtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const delivery = settings.deliveryCharge;
  const lateNight = settings.lateNightFeeEnabled ? settings.lateNightFeeAmount : 0;
  const grandTotal = cartSubtotal + delivery + lateNight;
  
  // Formulate items summary object array
  const orderedItems = cart.map(item => ({
    id: item.product.id,
    name: item.product.name,
    category: item.product.category,
    subBrand: item.product.category,
    quantity: item.quantity,
    price: item.subtotal / item.quantity,
    condiments: item.condiments
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
    grandTotal: grandTotal,
    status: "Pending", // Status defaults to Pending
    orderDate: new Date().toLocaleString(),
    createdAt: new Date().toISOString()
  };
  
  // Save order to Local Database
  TFL_DB.addOrder(orderObj);
  
  // Sync runs in the background so the customer gets an instant receipt.
  TFL_DB.syncOrderInBackground(orderObj);

  currentReceiptOrder = orderObj;
  
  // Clear cart and clean inputs
  cart = [];
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
      
    itemsHtml += `
      <div class="receipt-item-row">
        <span>${item.name} x ${item.quantity}</span>
        <span>₹${(item.price * item.quantity).toFixed(2)}</span>
      </div>
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
      <div class="receipt-total-row">
        <span>Delivery Charges</span>
        <span>₹${order.deliveryCharge.toFixed(2)}</span>
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
  document.getElementById("receipt-modal").classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
  updateCartDisplay();
}

function startNewOrder() {
  currentReceiptOrder = null;
  cart = [];
  sessionStorage.removeItem("tfl_customer_cart");
  updateCartDisplay();
  renderProducts();
  document.getElementById("receipt-modal").classList.remove("active");
  document.getElementById("modal-backdrop").classList.remove("active");
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
  const delivery = subtotal > 0 ? settings.deliveryCharge : 0;
  const lateNight = (subtotal > 0 && settings.lateNightFeeEnabled) ? settings.lateNightFeeAmount : 0;
  const grandTotal = subtotal + delivery + lateNight;
  
  order.subtotal = subtotal;
  order.deliveryCharge = delivery;
  order.lateNightFee = lateNight;
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
    message += `${item.name} x ${item.quantity} - Rs ${(item.price * item.quantity).toFixed(2)}\n`;
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
  message += `Delivery Charges: Rs ${currentReceiptOrder.deliveryCharge}\n`;
  if (currentReceiptOrder.lateNightFee && currentReceiptOrder.lateNightFee > 0) {
    message += `Late Night Fee: Rs ${currentReceiptOrder.lateNightFee}\n`;
  }
  message += `Grand Total: Rs ${currentReceiptOrder.grandTotal}\n`;
  message += `--------------------------------------\n\n`;
  
  message += `CUSTOMER DETAILS:\n`;
  message += `Name: ${currentReceiptOrder.customerName}\n`;
  message += `WhatsApp: ${currentReceiptOrder.customerPhone}\n`;
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
  // We can open the print dialogue. Because we styled `@media print` perfectly,
  // the user can select "Save as PDF" directly which generates a flawless, vector PDF invoice.
  // Alternatively, we show a native alert explaining how to save it.
  TFL_DB.showToast("In the print menu that opens next, select 'Save as PDF' to save your official receipt.", "info");
  window.print();
}
