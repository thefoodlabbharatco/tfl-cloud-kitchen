// db.js - Shared Local Database & Google Sheets Sync Module for The Food Lab (TFL)

const DEFAULT_SETTINGS = {
  restaurantName: "The Food Lab",
  tagline: "Lab Tested Deliciousness",
  // Change your numbers here (include country code without + sign, e.g. 919999999999 for India)
  whatsappNumber: "919999999999", 
  supportNumber: "919999999999",
  // Change your UPI ID and QR code here
  upiId: "tfl@upi", 
  qrImageUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg",
  // Change Google Form prefilled URL link here (Submit backup order)
  googleFormLink: "https://docs.google.com/forms/d/e/1FAIpQLSf_your_form_id/formResponse?entry.111111111={name}&entry.222222222={phone}&entry.333333333={address}&entry.444444444={items}&entry.555555555={total}&entry.666666666={payment}",
  deliveryCharge: 40,
  lateNightFeeEnabled: false,
  lateNightFeeAmount: 30,
  isOpen: true,
  closedMessage: "Our kitchen is currently closed. We are formulating new recipes! Opening tomorrow at 12 PM.",
  brandLogo: "tfl_logo.png", // Optional Base64 or URL
  heroImage: "tfl_hero.png",
  themePrimaryColor: "#ff6b00",
  themeBgColor: "#0b0b0c",
  googleSheetUrl: "", // Paste your Apps Script URL here to enable cloud sync
  googleSheetEnabled: false
};

const DEFAULT_SUBBRANDS = [
  { id: "project-paratha", name: "Project Paratha", logo: "🥞", visible: true, sortOrder: 1 },
  { id: "rice-bowl-rocketry", name: "Rice Bowl Rocketry", logo: "🍚", visible: true, sortOrder: 2 },
  { id: "ministry-of-meals", name: "Ministry of Meals", logo: "🍱", visible: true, sortOrder: 3 },
  { id: "snacks", name: "Snacks", logo: "🍟", visible: true, sortOrder: 4 },
  { id: "drinks", name: "Drinks", logo: "🥤", visible: true, sortOrder: 5 },
  { id: "combos", name: "Combos", logo: "🎒", visible: true, sortOrder: 6 }
];

const DEFAULT_PRODUCTS = [
  {
    id: "p1",
    name: "Tandoori Aloo Paratha",
    description: "Fluffy wheat flatbread stuffed with spiced potatoes, baked in tandoor. Served with creamy curd.",
    price: 99,
    costPrice: 40,
    category: "project-paratha",
    image: "https://images.unsplash.com/photo-1626132647523-66f5bf380027?auto=format&fit=crop&w=400&q=80",
    veg: true,
    bestseller: true,
    inStock: true,
    condiments: [
      { name: "Extra butter", price: 10 },
      { name: "Achaar", price: 0 },
      { name: "Green chutney", price: 0 }
    ]
  },
  {
    id: "p2",
    name: "Cheese Paneer Paratha",
    description: "Rich flatbread filled with spiced cottage cheese and melted mozzarella. A lab favorite!",
    price: 159,
    costPrice: 70,
    category: "project-paratha",
    image: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=400&q=80",
    veg: true,
    bestseller: false,
    inStock: true,
    condiments: [
      { name: "Extra butter", price: 10 },
      { name: "Raita", price: 15 },
      { name: "Mint chutney", price: 0 },
      { name: "Spicy", price: 0 }
    ]
  },
  {
    id: "p3",
    name: "Butter Chicken Rocket Bowl",
    description: "Tender chicken pieces in a velvety rich tomato gravy served over fragrant basmati rice.",
    price: 220,
    costPrice: 100,
    category: "rice-bowl-rocketry",
    image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=400&q=80",
    veg: false,
    bestseller: true,
    inStock: true,
    condiments: [
      { name: "Extra onion", price: 5 },
      { name: "Raita", price: 15 },
      { name: "Spicy", price: 0 },
      { name: "Less spicy", price: 0 }
    ]
  },
  {
    id: "p4",
    name: "Dal Makhani Fusion Bowl",
    description: "Slow-cooked black lentils in butter and cream, served with basmati rice and red pickle.",
    price: 169,
    costPrice: 65,
    category: "rice-bowl-rocketry",
    image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80",
    veg: true,
    bestseller: false,
    inStock: true,
    condiments: [
      { name: "Extra butter", price: 10 },
      { name: "Achaar", price: 0 },
      { name: "Green chutney", price: 0 }
    ]
  },
  {
    id: "p5",
    name: "The Lab Executive Veg Thali",
    description: "2 Butter Roti, Fragnant Basmati Rice, Dal Makhani, Paneer Butter Masala, Raita, Pickle and Sweet.",
    price: 249,
    costPrice: 110,
    category: "ministry-of-meals",
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80",
    veg: true,
    bestseller: true,
    inStock: true,
    condiments: [
      { name: "Extra butter", price: 10 },
      { name: "Extra roti", price: 12 },
      { name: "Raita", price: 15 },
      { name: "Achaar", price: 0 }
    ]
  },
  {
    id: "p6",
    name: "Crispy Peri Peri Fries",
    description: "Golden premium fries tossed in spicy peri peri seasoning. Served with signature garlic dip.",
    price: 89,
    costPrice: 30,
    category: "snacks",
    image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=400&q=80",
    veg: true,
    bestseller: false,
    inStock: true,
    condiments: [
      { name: "Spicy", price: 0 },
      { name: "Less spicy", price: 0 }
    ]
  },
  {
    id: "p7",
    name: "Masala Shikanji Lab Style",
    description: "Refreshing Indian lemonade with roasted cumin, black salt, and freshly squeezed mint.",
    price: 59,
    costPrice: 15,
    category: "drinks",
    image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80",
    veg: true,
    bestseller: true,
    inStock: true,
    condiments: []
  },
  {
    id: "p8",
    name: "Paratha + Shikanji Combo",
    description: "1 Tandoori Aloo Paratha + 1 Masala Shikanji + Pickle, Curd & butter block.",
    price: 139,
    costPrice: 50,
    category: "combos",
    image: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?auto=format&fit=crop&w=400&q=80",
    veg: true,
    bestseller: true,
    inStock: true,
    condiments: [
      { name: "Extra butter", price: 10 },
      { name: "Achaar", price: 0 }
    ]
  }
];

const DEFAULT_ADMINS = [
  { username: "vivek.tfl", password: "chikkichiku", role: "Owner", name: "Vivek (Owner)" },
  { username: "kartavya.tfl", password: "ravyaradha", role: "Manager", name: "Kartavya (Manager)" },
  { username: "sumit.tfl", password: "sumityadav@4321", role: "Staff", name: "Sumit (Staff)" }
];

const DEFAULT_UPDATES = [
  {
    id: "up-1",
    title: "Grand Launching: Rice Bowl Rocketry!",
    description: "Introducing our high-velocity gourmet Rice Bowls. Made with premium basmati rice and authentic rich gravies. Grab yours now!",
    imageUrl: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80",
    launchDate: "2026-05-22",
    active: true,
    type: "new_launch"
  },
  {
    id: "up-2",
    title: "WEEKEND OFFER: 50% Off on Drinks!",
    description: "Order any combo or meal and get your Shikanji at half price. Valid until Sunday.",
    imageUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
    launchDate: "2026-05-23",
    active: true,
    type: "offer_banner"
  }
];

const TFL_DB = {
  _cache: {},

  // Safe helper to parse local storage with in-memory caching
  getLocal(key, fallback) {
    if (this._cache[key] !== undefined) {
      return JSON.parse(JSON.stringify(this._cache[key]));
    }
    const val = localStorage.getItem("tfl_" + key);
    if (!val) {
      this._cache[key] = fallback;
      return JSON.parse(JSON.stringify(fallback));
    }
    try {
      const parsed = JSON.parse(val);
      this._cache[key] = parsed;
      return JSON.parse(JSON.stringify(parsed));
    } catch (e) {
      this._cache[key] = fallback;
      return JSON.parse(JSON.stringify(fallback));
    }
  },

  pruneOldOrders(orders) {
    if (!Array.isArray(orders) || orders.length <= 250) return orders;
    const activeOrders = [];
    const inactiveOrders = []; // Delivered or Cancelled
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (o && o.status !== "Delivered" && o.status !== "Cancelled") {
        activeOrders.push(o);
      } else if (o) {
        inactiveOrders.push(o);
      }
    }
    if (activeOrders.length >= 250) {
      return activeOrders;
    }
    const allowedInactiveCount = 250 - activeOrders.length;
    const keptInactiveOrders = inactiveOrders.slice(0, allowedInactiveCount);
    const keptInactiveSet = new Set(keptInactiveOrders.map(o => o.id));
    return orders.filter(o => {
      return (o.status !== "Delivered" && o.status !== "Cancelled") || keptInactiveSet.has(o.id);
    });
  },

  setLocal(key, data) {
    if (key === "orders" && Array.isArray(data)) {
      data = this.pruneOldOrders(data);
    }
    // Synchronously write to in-memory cache
    this._cache[key] = JSON.parse(JSON.stringify(data));

    // Asynchronously serialize and write to localStorage to prevent blocking the main UI thread
    setTimeout(() => {
      try {
        localStorage.setItem("tfl_" + key, JSON.stringify(data));
      } catch (e) {
        console.error(`Failed to serialize and write to localStorage for key: tfl_${key}`, e);
      }
    }, 0);
  },

  init() {
    this._cache = {};
    if (!localStorage.getItem("tfl_settings")) this.setLocal("settings", DEFAULT_SETTINGS);
    if (!localStorage.getItem("tfl_subbrands")) this.setLocal("subbrands", DEFAULT_SUBBRANDS);
    if (!localStorage.getItem("tfl_products")) this.setLocal("products", DEFAULT_PRODUCTS);
    if (!localStorage.getItem("tfl_admins")) this.setLocal("admins", DEFAULT_ADMINS);
    if (!localStorage.getItem("tfl_updates")) this.setLocal("updates", DEFAULT_UPDATES);
    if (!localStorage.getItem("tfl_orders")) this.setLocal("orders", []);

    // Pre-warm/prime the cache for all known keys so subsequent reads are instant
    this.getLocal("settings", DEFAULT_SETTINGS);
    this.getLocal("subbrands", DEFAULT_SUBBRANDS);
    this.getLocal("products", DEFAULT_PRODUCTS);
    this.getLocal("admins", DEFAULT_ADMINS);
    this.getLocal("updates", DEFAULT_UPDATES);
    this.getLocal("orders", []);

    this.applyThemeColors();
  },

  getSettings() { 
    const settings = this.getLocal("settings", DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...settings };
  },
  saveSettings(settings) { 
    this.setLocal("settings", settings); 
    this.applyThemeColors();
  },

  getProducts() { return this.getLocal("products", DEFAULT_PRODUCTS); },
  saveProducts(products) { this.setLocal("products", products); },

  getSubBrands() { return this.getLocal("subbrands", DEFAULT_SUBBRANDS); },
  saveSubBrands(subbrands) { this.setLocal("subbrands", subbrands); },

  getOrders() { return this.getLocal("orders", []); },
  saveOrders(orders) { this.setLocal("orders", orders); },
  addOrder(order) {
    const orders = this.getOrders();
    orders.unshift(order); // Add new order to the beginning
    this.saveOrders(orders);
  },
  updateOrder(order) {
    const orders = this.getOrders();
    const idx = orders.findIndex(o => o.id === order.id);
    if (idx !== -1) {
      orders[idx] = order;
      this.saveOrders(orders);
    }
  },

  getAdmins() { return this.getLocal("admins", DEFAULT_ADMINS); },
  saveAdmins(admins) { this.setLocal("admins", admins); },

  getUpdates() { return this.getLocal("updates", DEFAULT_UPDATES); },
  saveUpdates(updates) { this.setLocal("updates", updates); },

  applyThemeColors() {
    const settings = this.getSettings();
    const primaryColor = settings.themePrimaryColor || "#ff6b00";
    const bgColor = settings.themeBgColor || "#0b0b0c";
    
    // Set custom CSS properties dynamically
    document.documentElement.style.setProperty('--color-primary', primaryColor);
    
    if (this._currentTheme === 'light') {
      document.documentElement.style.removeProperty('--color-bg');
    } else {
      document.documentElement.style.setProperty('--color-bg', bgColor);
    }
    
    // Convert primary hex to HSL for transparency gradients if needed
    const rgb = this.hexToRgb(primaryColor);
    if (rgb) {
      const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
      document.documentElement.style.setProperty('--color-primary-h', hsl.h);
      document.documentElement.style.setProperty('--color-primary-s', hsl.s + '%');
      document.documentElement.style.setProperty('--color-primary-l', hsl.l + '%');
    }
  },

  // --- THEME ENGINE ---
  _currentTheme: 'dark',

  initTheme() {
    let theme = localStorage.getItem("tfl_theme");
    if (!theme) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
      theme = prefersDark.matches ? 'dark' : 'light';
      prefersDark.addEventListener('change', e => {
        if (!localStorage.getItem("tfl_theme")) {
          this.applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
    
    if (document.body) {
      this.applyTheme(theme);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        this.applyTheme(theme);
      });
    }
  },

  applyTheme(theme) {
    this._currentTheme = theme;
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    this.applyThemeColors();
    this.updateThemeIcons();
  },

  toggleTheme() {
    const newTheme = this._currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem("tfl_theme", newTheme);
    this.applyTheme(newTheme);
    return newTheme;
  },

  updateThemeIcons() {
    const toggleBtns = document.querySelectorAll(".theme-toggle-btn");
    toggleBtns.forEach(btn => {
      const isLight = this._currentTheme === 'light';
      if (isLight) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
      } else {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
      }
    });
  },

  // --- GLOBAL TOAST ENGINE ---
  showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12" y1="16" y2="16.01"/></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12" y1="17" y2="17.01"/></svg>`;
    } else {
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
    }
    
    toast.innerHTML = `
      ${iconSvg}
      <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
      toast.classList.add('active');
    });
    
    setTimeout(() => {
      toast.classList.remove('active');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      });
    }, 3500);
  },

  // Color conversion helpers
  hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  },

  rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if (max == min) {
      h = s = 0; // achromatic
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  },

  // --- GOOGLE SHEETS CLOUD SYNC SERVICES ---

  async syncFromGoogleSheets() {
    const settings = this.getSettings();
    if (!settings.googleSheetEnabled || !settings.googleSheetUrl) {
      return Promise.reject("Google Sheet Sync is not enabled or URL is missing.");
    }

    try {
      const url = `${settings.googleSheetUrl}?action=getData`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Network response was not ok");
      
      const result = await response.json();
      if (result.status === "success") {
        if (result.settings && result.settings.length > 0) {
          // Prevent overwriting the sync URL itself in this browser
          const localUrlSetting = settings.googleSheetUrl;
          const mergedSettings = { ...result.settings[0], googleSheetUrl: localUrlSetting, googleSheetEnabled: true };
          this.setLocal("settings", mergedSettings);
        }
        if (result.products) this.setLocal("products", result.products);
        if (result.subbrands) this.setLocal("subbrands", result.subbrands);
        if (result.orders) this.setLocal("orders", result.orders);
        if (result.updates) this.setLocal("updates", result.updates);
        if (result.admins) this.setLocal("admins", result.admins);
        
        this.applyThemeColors();
        return result;
      } else {
        throw new Error(result.message || "Failed to load cloud data");
      }
    } catch (error) {
      console.error("Google Sheets Sync Error:", error);
      throw error;
    }
  },

  async syncToGoogleSheets() {
    const settings = this.getSettings();
    if (!settings.googleSheetEnabled || !settings.googleSheetUrl) {
      return Promise.reject("Google Sheet Sync is not enabled or URL is missing.");
    }

    const payload = {
      action: "syncAll",
      settings: [settings],
      products: this.getProducts(),
      subbrands: this.getSubBrands(),
      updates: this.getUpdates(),
      admins: this.getAdmins(),
      orders: this.getOrders()
    };

    try {
      const response = await fetch(settings.googleSheetUrl, {
        method: "POST",
        mode: "no-cors", // Required to handle redirection constraints on Apps Script
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      // Mode 'no-cors' will return opaque responses, so we assume success if no exception is thrown
      return { status: "success", message: "Data pushed to Google Sheets" };
    } catch (error) {
      console.error("Push to Google Sheets Failed:", error);
      throw error;
    }
  },

  async addOrderToCloud(order) {
    const settings = this.getSettings();
    if (!settings.googleSheetEnabled || !settings.googleSheetUrl) {
      return Promise.resolve({ status: "local_only" });
    }

    const payload = {
      action: "addOrder",
      order: order
    };

    try {
      await fetch(settings.googleSheetUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return { status: "success" };
    } catch (error) {
      console.error("Add order to cloud failed:", error);
      throw error;
    }
  },

  async updateOrderStatusInCloud(orderId, status) {
    const settings = this.getSettings();
    if (!settings.googleSheetEnabled || !settings.googleSheetUrl) {
      return Promise.resolve({ status: "local_only" });
    }

    const payload = {
      action: "updateOrderStatus",
      orderId: orderId,
      status: status
    };

    try {
      await fetch(settings.googleSheetUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return { status: "success" };
    } catch (error) {
      console.error("Update status in cloud failed:", error);
      throw error;
    }
  },

  async updatePaymentStatusInCloud(orderId, paymentStatus) {
    const settings = this.getSettings();
    if (!settings.googleSheetEnabled || !settings.googleSheetUrl) {
      return Promise.resolve({ status: "local_only" });
    }

    const payload = {
      action: "updatePaymentStatus",
      orderId: orderId,
      paymentStatus: paymentStatus
    };

    try {
      await fetch(settings.googleSheetUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return { status: "success" };
    } catch (error) {
      console.error("Update payment status in cloud failed:", error);
      throw error;
    }
  },


  async uploadImageToCloud(fileName, mimeType, base64Data) {
    const settings = this.getSettings();
    if (!settings.googleSheetEnabled || !settings.googleSheetUrl) {
      return Promise.reject("Google Sheet Sync is not enabled or URL is missing.");
    }

    const payload = {
      action: "uploadImage",
      fileName: fileName,
      mimeType: mimeType,
      base64Data: base64Data
    };

    try {
      const response = await fetch(settings.googleSheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Network response was not ok");
      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Cloud image upload failed:", error);
      throw error;
    }
  }
};

// Initialize DB immediately
TFL_DB.init();
