// db.js - Shared Local Database & Google Sheets Sync Module for The Food Lab (TFL)

const TFL_RUNTIME_CONFIG = typeof window !== "undefined" && window.TFL_CONFIG ? window.TFL_CONFIG : {};

const DEFAULT_SETTINGS = {
  restaurantName: "The Food Lab",
  tagline: "Lab Tested Deliciousness",
  // Change your numbers in Admin > Settings (include country code without + sign, e.g. 919876543210 for India)
  whatsappNumber: "",
  supportNumber: "",
  // Change your UPI ID and QR code here
  upiId: "tfl@upi", 
  qrImageUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg",
  deliveryCharge: 40,
  lateNightFeeEnabled: false,
  lateNightFeeAmount: 30,
  isOpen: true,
  closedMessage: "Our kitchen is currently closed. We are formulating new recipes! Opening tomorrow at 12 PM.",
  brandLogo: "tfl_logo.png", // Optional Base64 or URL
  heroImage: "tfl_hero.png",
  themePrimaryColor: "#16a34a",
  themeBgColor: "#0b0b0c",
  googleSheetUrl: "", // Paste your Apps Script URL here to enable cloud sync
  googleSheetEnabled: false,
  supabaseEnabled: true,
  supabaseUrl: TFL_RUNTIME_CONFIG.supabaseUrl || "https://rtlnhteibmtudqchlzbv.supabase.co",
  supabaseKey: TFL_RUNTIME_CONFIG.supabaseKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0bG5odGVpYm10dWRxY2hsemJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODA1MzksImV4cCI6MjA5NTE1NjUzOX0.T7ECe1xGhpV9jkKwulZrrlQsVDnXGuU-hgCloIVlLs4",
  orderRetentionDays: 2,
  maxCompletedOrders: 100
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
      { name: "Add Onion Filling", price: 0 },
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
      { name: "Add Onion Filling", price: 0 },
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
  _broadcastChannel: null,
  _realtimeChannel: null,
  _supabaseClient: null,
  _tabId: `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  _isFlushingOrders: false,
  _syncState: {
    pending: 0,
    syncing: false,
    lastSyncedAt: null,
    lastError: null,
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false
  },

  getRuntimeConfig() {
    return typeof window !== "undefined" && window.TFL_CONFIG ? window.TFL_CONFIG : {};
  },

  applyRuntimeConfig(settings) {
    const runtime = this.getRuntimeConfig();
    const merged = { ...settings };
    if (runtime.lockSupabaseConfig && runtime.supabaseUrl) merged.supabaseUrl = runtime.supabaseUrl;
    if (runtime.lockSupabaseConfig && runtime.supabaseKey) merged.supabaseKey = runtime.supabaseKey;
    if (merged.supabaseUrl) merged.supabaseUrl = this.normalizeSupabaseUrl(merged.supabaseUrl);
    if (merged.supabaseKey) merged.supabaseKey = String(merged.supabaseKey).trim();
    return merged;
  },

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
    if (!Array.isArray(orders)) return [];
    const settings = this.getSettings ? this.getSettings() : DEFAULT_SETTINGS;
    const retentionDays = Number(settings.orderRetentionDays || 2);
    const maxCompletedOrders = Number(settings.maxCompletedOrders || 100);
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const activeOrders = [];
    const completedOrders = [];

    orders.forEach(order => {
      if (!order) return;
      if (order.status !== "Delivered" && order.status !== "Cancelled") {
        activeOrders.push(order);
      } else if (this.getOrderTime(order) >= cutoff) {
        completedOrders.push(order);
      }
    });

    completedOrders.sort((a, b) => this.getOrderTime(b) - this.getOrderTime(a));
    const keptCompletedOrders = completedOrders.slice(0, maxCompletedOrders);
    const keptIds = new Set([...activeOrders, ...keptCompletedOrders].map(order => order.id));
    return orders.filter(order => order && keptIds.has(order.id));
  },

  setLocal(key, data) {
    if (key === "orders" && Array.isArray(data)) {
      data = this.pruneOldOrders(data);
    }
    // Synchronously write to in-memory cache
    this._cache[key] = JSON.parse(JSON.stringify(data));

    const writeLocalStorage = () => {
      try {
        localStorage.setItem("tfl_" + key, JSON.stringify(data));
      } catch (e) {
        console.error(`Failed to serialize and write to localStorage for key: tfl_${key}`, e);
      }
    };

    // Keep menu/admin metadata durable immediately, but keep larger order writes off the hot path.
    if (key === "orders") {
      setTimeout(writeLocalStorage, 0);
    } else {
      writeLocalStorage();
    }

    this.broadcastLocalUpdate(key, data);
    this.dispatchDbUpdated(key, "local", data);
  },

  broadcastLocalUpdate(key, data) {
    if (!this._broadcastChannel) return;
    try {
      this._broadcastChannel.postMessage({
        type: "local_update",
        source: this._tabId,
        key,
        data
      });
    } catch (e) {
      console.warn("BroadcastChannel update failed.", e);
    }
  },

  dispatchDbUpdated(key, source = "local", data = null) {
    if (typeof document === "undefined") return;
    if (typeof CustomEvent !== "function") return;
    document.dispatchEvent(new CustomEvent("tfl_db_updated", {
      detail: { key, source, data }
    }));
  },

  updateSyncState(patch) {
    this._syncState = {
      ...this._syncState,
      ...patch,
      online: typeof navigator === "undefined" ? true : navigator.onLine !== false
    };
    this.dispatchDbUpdated("sync_status", "local", this.getSyncState());
  },

  getSyncState() {
    return {
      ...this._syncState,
      pending: this.getPendingCloudOrders ? this.getPendingCloudOrders().length : this._syncState.pending,
      online: typeof navigator === "undefined" ? true : navigator.onLine !== false
    };
  },

  initBroadcastChannel() {
    if (typeof BroadcastChannel === "undefined" || this._broadcastChannel) return;
    try {
      this._broadcastChannel = new BroadcastChannel("tfl_sync_channel");
      this._broadcastChannel.onmessage = (event) => {
        const message = event.data || {};
        if (message.type !== "local_update" || message.source === this._tabId) return;
        if (message.key) {
          this._cache[message.key] = JSON.parse(JSON.stringify(message.data));
        }
        this.dispatchDbUpdated(message.key, "broadcast", message.data);
      };
    } catch (e) {
      console.warn("BroadcastChannel is unavailable.", e);
    }
  },

  getSupabaseClient() {
    const settings = this.getSettings();
    if (!settings.supabaseEnabled || !settings.supabaseUrl || !settings.supabaseKey) return null;
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      console.warn("Supabase client library is not loaded.");
      return null;
    }
    const supabaseUrl = this.normalizeSupabaseUrl(settings.supabaseUrl);
    const supabaseKey = String(settings.supabaseKey || "").trim();
    if (!supabaseUrl || !supabaseKey) return null;
    if (
      this._supabaseClient &&
      this._supabaseUrl === supabaseUrl &&
      this._supabaseKey === supabaseKey
    ) {
      return this._supabaseClient;
    }
    this._supabaseUrl = supabaseUrl;
    this._supabaseKey = supabaseKey;
    this._supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    return this._supabaseClient;
  },

  normalizeSupabaseUrl(url) {
    const trimmed = String(url || "").trim().replace(/\/+$/, "");
    return trimmed.replace(/\/rest\/v1$/i, "");
  },

  async initRealtimeSubscription() {
    const client = this.getSupabaseClient();
    if (this._realtimeChannel) {
      try {
        await this._supabaseClient.removeChannel(this._realtimeChannel);
      } catch (e) {
        console.warn("Could not remove previous Supabase realtime channel.", e);
      }
      this._realtimeChannel = null;
    }
    if (!client) return;

    const handleChange = async (payload) => {
      try {
        await this.syncFromSupabase();
        this.dispatchDbUpdated(payload.table === "tfl_orders" ? "orders" : "all", "supabase", payload);
      } catch (e) {
        console.warn("Realtime refresh failed.", e);
      }
    };

    this._realtimeChannel = client
      .channel("tfl_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tfl_metadata" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "tfl_orders" }, handleChange)
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("Supabase realtime channel error.");
        }
      });
  },

  init() {
    this._cache = {};
    this.initBroadcastChannel();
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.updateSyncState({ online: true, lastError: null });
        this.flushPendingCloudOrders();
      });
      window.addEventListener("offline", () => {
        this.updateSyncState({ online: false, syncing: false, lastError: "offline" });
      });
    }
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
    this.initRealtimeSubscription();
    setTimeout(() => this.flushPendingCloudOrders(), 500);
  },

  getSettings() { 
    const settings = this.getLocal("settings", DEFAULT_SETTINGS);
    return this.applyRuntimeConfig({ ...DEFAULT_SETTINGS, ...settings });
  },
  saveSettings(settings) { 
    this.setLocal("settings", this.applyRuntimeConfig(settings)); 
    this.applyThemeColors();
    this.initRealtimeSubscription();
  },

  makeSubBrandId(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "")
      || `subbrand${Date.now()}`;
  },

  normalizeSubBrandIds(subbrands) {
    if (!Array.isArray(subbrands)) return subbrands;
    const usedIds = new Set();
    return subbrands.map(subbrand => {
      if (!subbrand) return subbrand;
      const isParathaverse = String(subbrand.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "") === "parathaverse";
      let nextId = isParathaverse ? "parathaverse" : subbrand.id;
      if (!nextId) nextId = this.makeSubBrandId(subbrand.name);
      if (usedIds.has(nextId)) {
        nextId = `${nextId}${subbrand.sortOrder || usedIds.size + 1}`;
      }
      usedIds.add(nextId);
      return { ...subbrand, id: nextId };
    });
  },

  normalizeProductCategory(product) {
    if (!product) return product;
    const subbrands = this.normalizeSubBrandIds(this.getLocal("subbrands", DEFAULT_SUBBRANDS)) || [];
    const parathaverse = subbrands.find(s => String(s.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "") === "parathaverse");
    if (parathaverse && product.category === "drinks") {
      return { ...product, category: parathaverse.id };
    }
    return product;
  },

  ensureParathaOnionFilling(products) {
    if (!Array.isArray(products)) return products;
    return products.map(product => {
      product = this.normalizeProductCategory(product);
      if (!product || product.category !== "project-paratha") return product;
      const hiddenCondiments = (product.hiddenCondiments || []).map(name => String(name).trim().toLowerCase());
      if (hiddenCondiments.includes("add onion filling")) return product;
      const condiments = Array.isArray(product.condiments) ? product.condiments : [];
      const hasOnionFilling = condiments.some(cond => {
        const name = typeof cond === "object" && cond !== null ? cond.name : cond;
        return String(name || "").trim().toLowerCase() === "add onion filling";
      });
      if (hasOnionFilling) return product;
      return {
        ...product,
        condiments: [{ name: "Add Onion Filling", price: 0 }, ...condiments]
      };
    });
  },

  getProducts() { return this.ensureParathaOnionFilling(this.getLocal("products", DEFAULT_PRODUCTS)); },
  saveProducts(products) { this.setLocal("products", this.ensureParathaOnionFilling(products)); },

  getSubBrands() { return this.normalizeSubBrandIds(this.getLocal("subbrands", DEFAULT_SUBBRANDS)); },
  saveSubBrands(subbrands) { this.setLocal("subbrands", this.normalizeSubBrandIds(subbrands)); },

  getOrders() { return this.getLocal("orders", []); },
  saveOrders(orders) { this.setLocal("orders", orders); },
  addOrder(order) {
    order.createdAt = order.createdAt || new Date().toISOString();
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

  updateBrandIcons(iconUrl) {
    if (!iconUrl) return;

    const iconLinks = [
      { selector: "link[rel='icon'][type='image/x-icon']", rel: "icon", type: "image/x-icon" },
      { selector: "link[rel='icon'][type='image/png']", rel: "icon", type: "image/png" },
      { selector: "link[rel='shortcut icon']", rel: "shortcut icon" },
      { selector: "link[rel='apple-touch-icon']", rel: "apple-touch-icon" }
    ];

    iconLinks.forEach(({ selector, rel, type }) => {
      let link = document.querySelector(selector);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        if (type) link.type = type;
        document.head.appendChild(link);
      }
      link.href = iconUrl;
    });
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

  // --- SUPABASE CLOUD SYNC SERVICES ---

  async syncFromSupabase() {
    const client = this.getSupabaseClient();
    if (!client) {
      return Promise.reject("Supabase Sync is not enabled or credentials are missing.");
    }
    this.updateSyncState({ syncing: true, lastError: null });

    try {
      const { data: metadata, error: metadataError } = await client
        .from("tfl_metadata")
        .select("key,value");
      if (metadataError) throw metadataError;

      const localSettings = this.getSettings();
      (metadata || []).forEach(row => {
        if (!row || !row.key) return;
        if (row.key === "settings") {
          this.setLocal("settings", this.applyRuntimeConfig({
            ...row.value,
            supabaseEnabled: true,
            supabaseUrl: localSettings.supabaseUrl,
            supabaseKey: localSettings.supabaseKey
          }));
        } else {
          this.setLocal(row.key, row.value);
        }
      });

      const { data: orderRows, error: ordersError } = await client
        .from("tfl_orders")
        .select("order_data,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (ordersError) throw ordersError;

      if (orderRows) {
        this.setLocal("orders", orderRows.map(row => row.order_data).filter(Boolean));
      }

      this.applyThemeColors();
      this.updateSyncState({ syncing: false, lastSyncedAt: new Date().toISOString(), lastError: null });
      return { status: "success" };
    } catch (error) {
      this.updateSyncState({ syncing: false, lastError: error.message || "sync_failed" });
      throw error;
    }
  },

  async syncToSupabase() {
    const client = this.getSupabaseClient();
    if (!client) {
      return Promise.reject("Supabase Sync is not enabled or credentials are missing.");
    }
    this.updateSyncState({ syncing: true, lastError: null });

    try {
      const metadataRows = ["settings", "products", "subbrands", "updates", "admins"].map(key => ({
        key,
        value: key === "settings" ? this.getSettings() : this.getLocal(key, [])
      }));

      const { error: metadataError } = await client
        .from("tfl_metadata")
        .upsert(metadataRows, { onConflict: "key" });
      if (metadataError) throw metadataError;

      const orderRows = this.getOrders().map(order => ({
        order_id: order.id,
        order_data: order,
        created_at: this.getOrderTimestamp(order)
      }));

      if (orderRows.length > 0) {
        const { error: ordersError } = await client
          .from("tfl_orders")
          .upsert(orderRows, { onConflict: "order_id" });
        if (ordersError) throw ordersError;
      }

      this.updateSyncState({ syncing: false, lastSyncedAt: new Date().toISOString(), lastError: null });
      return { status: "success", message: "Data pushed to Supabase" };
    } catch (error) {
      this.updateSyncState({ syncing: false, lastError: error.message || "sync_failed" });
      throw error;
    }
  },

  async upsertOrderToSupabase(order) {
    const client = this.getSupabaseClient();
    if (!client) return { status: "local_only" };
    const { error } = await client
      .from("tfl_orders")
      .upsert({
        order_id: order.id,
        order_data: order,
        created_at: this.getOrderTimestamp(order)
      }, { onConflict: "order_id" });
    if (error) throw error;
    return { status: "success" };
  },

  getOrderTimestamp(order) {
    const parsed = order && (order.createdAt || order.orderDate) ? new Date(order.createdAt || order.orderDate) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return new Date().toISOString();
  },

  getOrderTime(order) {
    const parsed = order && (order.createdAt || order.orderDate) ? new Date(order.createdAt || order.orderDate) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return parsed.getTime();
    return 0;
  },

  getPendingCloudOrders() {
    try {
      return JSON.parse(localStorage.getItem("tfl_pending_cloud_orders") || "[]");
    } catch (e) {
      return [];
    }
  },

  savePendingCloudOrders(orders) {
    localStorage.setItem("tfl_pending_cloud_orders", JSON.stringify(orders));
    this.updateSyncState({ pending: orders.length });
  },

  queuePendingCloudOrder(order) {
    const settings = this.getSettings();
    if (!settings.supabaseEnabled && !settings.googleSheetEnabled) return;
    const pending = this.getPendingCloudOrders().filter(item => item.id !== order.id);
    pending.push(order);
    this.savePendingCloudOrders(pending);
  },

  syncOrderInBackground(order) {
    this.queuePendingCloudOrder(order);
    this.flushPendingCloudOrders();
  },

  async flushPendingCloudOrders() {
    if (this._isFlushingOrders) return;
    const settings = this.getSettings();
    if (!settings.supabaseEnabled && !settings.googleSheetEnabled) return;
    const pending = this.getPendingCloudOrders();
    if (pending.length === 0) return;

    this._isFlushingOrders = true;
    this.updateSyncState({ pending: pending.length, syncing: true, lastError: null });
    const remaining = [];
    for (const order of pending) {
      try {
        await this.addOrderToCloud(order);
      } catch (e) {
        console.warn("Queued order sync failed, will retry.", e);
        remaining.push(order);
      }
    }
    this.savePendingCloudOrders(remaining);
    this._isFlushingOrders = false;
    this.updateSyncState({
      pending: remaining.length,
      syncing: false,
      lastSyncedAt: remaining.length === 0 ? new Date().toISOString() : this._syncState.lastSyncedAt,
      lastError: remaining.length === 0 ? null : "retry_pending"
    });
  },

  async deleteOrderFromCloud(orderId) {
    const settings = this.getSettings();
    if (settings.supabaseEnabled) {
      const client = this.getSupabaseClient();
      if (!client) return { status: "local_only" };
      const { error } = await client.from("tfl_orders").delete().eq("order_id", orderId);
      if (error) throw error;
      return { status: "success" };
    }
    return Promise.resolve({ status: "local_only" });
  },

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
    if (settings.supabaseEnabled) {
      return this.upsertOrderToSupabase(order);
    }
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
    if (settings.supabaseEnabled) {
      const orders = this.getOrders();
      const order = orders.find(o => o.id === orderId);
      if (!order) return { status: "local_only" };
      order.status = status;
      return this.upsertOrderToSupabase(order);
    }
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
    if (settings.supabaseEnabled) {
      const orders = this.getOrders();
      const order = orders.find(o => o.id === orderId);
      if (!order) return { status: "local_only" };
      order.paymentStatus = paymentStatus;
      return this.upsertOrderToSupabase(order);
    }
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
    if (settings.supabaseEnabled) {
      const client = this.getSupabaseClient();
      if (!client) return Promise.reject("Supabase Sync is not enabled or credentials are missing.");
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error } = await client.storage
        .from("product-images")
        .upload(safeName, bytes, { contentType: mimeType, upsert: true });
      if (error) throw error;
      const { data } = client.storage.from("product-images").getPublicUrl(safeName);
      return { status: "success", imageUrl: data.publicUrl };
    }
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

let deferredPwaInstallPrompt = null;

function isPwaStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function updatePwaInstallButton() {
  const installBtn = document.getElementById("pwa-install-btn");
  if (!installBtn) return;

  const canInstall = Boolean(deferredPwaInstallPrompt);
  const showIosHint = isIosDevice() && !isPwaStandalone();
  installBtn.hidden = isPwaStandalone() || (!canInstall && !showIosHint);
}

async function handlePwaInstallClick() {
  const installBtn = document.getElementById("pwa-install-btn");

  if (isIosDevice() && !deferredPwaInstallPrompt) {
    TFL_DB.showToast("On iPhone, tap Share, then Add to Home Screen.", "info");
    return;
  }

  if (!deferredPwaInstallPrompt) {
    TFL_DB.showToast("Install is available from your browser menu on this device.", "info");
    updatePwaInstallButton();
    return;
  }

  if (installBtn) installBtn.disabled = true;
  deferredPwaInstallPrompt.prompt();
  const choiceResult = await deferredPwaInstallPrompt.userChoice;
  deferredPwaInstallPrompt = null;
  if (installBtn) installBtn.disabled = false;
  updatePwaInstallButton();

  if (choiceResult.outcome === "accepted") {
    TFL_DB.showToast("App installed. Future visits will open faster.", "success");
  }
}

function initPwaInstallButton() {
  const installBtn = document.getElementById("pwa-install-btn");
  if (!installBtn) return;

  installBtn.addEventListener("click", handlePwaInstallClick);
  updatePwaInstallButton();
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPwaInstallPrompt = event;
  updatePwaInstallButton();
});

window.addEventListener("appinstalled", () => {
  deferredPwaInstallPrompt = null;
  updatePwaInstallButton();
  TFL_DB.showToast("The Food Lab app is installed.", "success");
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPwaInstallButton);
} else {
  initPwaInstallButton();
}
