import Head from "next/head";
import { useEffect } from "react";

export type LegacyPageProps = {
  title: string;
  description: string;
  bodyHtml: string;
  pageScript: "customer.js" | "admin.js";
  basePath?: string;
};

function assetPath(basePath: string, fileName: string): string {
  return `${basePath || ""}/${fileName}`.replace(/\/{2,}/g, "/");
}

export default function LegacyPage({ title, description, bodyHtml, pageScript, basePath = "" }: LegacyPageProps) {
  useEffect(() => {
    const loadScript = (src: string): Promise<void> => new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-legacy-src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.legacySrc = src;
      script.onload = () => resolve();
      script.onerror = reject;
      document.body.appendChild(script);
    });

    Promise.all([
      loadScript("https://unpkg.com/lucide@latest"),
      loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2")
    ])
      .then(() => loadScript(assetPath(basePath, "runtime-config.js?v=47")))
      .then(() => loadScript(assetPath(basePath, "db.js?v=47")))
      .then(() => loadScript(assetPath(basePath, pageScript + "?v=47")))
      .catch((err) => console.error("Legacy script loading failed:", err));
  }, [basePath, pageScript]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const registerServiceWorker = () => {
      navigator.serviceWorker
        .register(assetPath(basePath, "service-worker.js"))
        .then((reg) => console.log("Service Worker registered:", reg.scope))
        .catch((err) => console.error("Service Worker registration failed:", err));
    };

    const schedule = window.requestIdleCallback || ((callback: IdleRequestCallback) => setTimeout(callback, 1200));
    if (document.readyState === "complete") {
      schedule(registerServiceWorker);
    } else {
      window.addEventListener("load", () => schedule(registerServiceWorker), { once: true });
    }
  }, [basePath]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator && !localStorage.getItem('tfl_sw_cleaned_v47')) {
            navigator.serviceWorker.getRegistrations().then(function(regs) {
              for (var i = 0; i < regs.length; i++) { regs[i].unregister(); }
            });
            if ('caches' in window) {
              caches.keys().then(function(keys) {
                for (var i = 0; i < keys.length; i++) { caches.delete(keys[i]); }
              });
            }
            localStorage.setItem('tfl_sw_cleaned_v47', 'true');
            setTimeout(function() { window.location.reload(); }, 200);
          }
        ` }} />
        <meta name="theme-color" content="#16a34a" />
        <link rel="icon" type="image/x-icon" href={assetPath(basePath, "favicon.ico?v=43")} />
        <link rel="icon" type="image/png" sizes="32x32" href={assetPath(basePath, "favicon-32.png?v=43")} />
        <link rel="shortcut icon" href={assetPath(basePath, "favicon.ico?v=43")} />
        <link rel="apple-touch-icon" sizes="180x180" href={assetPath(basePath, "apple-touch-icon.png?v=43")} />
        <link rel="preconnect" href="https://unpkg.com" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rtlnhteibmtudqchlzbv.supabase.co"} />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="manifest" href={assetPath(basePath, "manifest.json?v=43")} />
        <link rel="preload" as="image" href={assetPath(basePath, "tfl_hero.png")} />
        <link rel="preload" as="image" href={assetPath(basePath, "tfl_logo.png")} />
        <link rel="preload" as="script" href={assetPath(basePath, "runtime-config.js?v=47")} />
        <link rel="preload" as="script" href={assetPath(basePath, "db.js?v=47")} />
        <link rel="preload" as="script" href={assetPath(basePath, pageScript + "?v=47")} />
        <link rel="stylesheet" href={assetPath(basePath, "style.css?v=47")} />
        <link rel="stylesheet" href={assetPath(basePath, (pageScript === "admin.js" ? "admin.css" : "customer.css") + "?v=47")} />
      </Head>

      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </>
  );
}
