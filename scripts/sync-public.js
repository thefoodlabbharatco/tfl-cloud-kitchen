const fs = require("fs");
const path = require("path");

const root = process.cwd();
const publicDir = path.join(root, "public");
const files = [
  "style.css",
  "customer.css",
  "admin.css",
  "db.js",
  "customer.js",
  "admin.js",
  "manifest.json",
  "service-worker.js",
  "tfl_logo.png",
  "tfl_hero.png"
];

fs.mkdirSync(publicDir, { recursive: true });

const runtimeConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rtlnhteibmtudqchlzbv.supabase.co",
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0bG5odGVpYm10dWRxY2hsemJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODA1MzksImV4cCI6MjA5NTE1NjUzOX0.T7ECe1xGhpV9jkKwulZrrlQsVDnXGuU-hgCloIVlLs4",
  lockSupabaseConfig: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
};

fs.writeFileSync(
  path.join(publicDir, "runtime-config.js"),
  `window.TFL_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n`,
  "utf8"
);

files.forEach((file) => {
  fs.copyFileSync(path.join(root, file), path.join(publicDir, file));
});
