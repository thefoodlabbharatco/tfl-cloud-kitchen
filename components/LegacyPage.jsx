import Head from "next/head";
import { useEffect } from "react";

function assetPath(basePath, fileName) {
  return `${basePath || ""}/${fileName}`.replace(/\/{2,}/g, "/");
}

export default function LegacyPage({ title, description, bodyHtml, pageScript, basePath = "" }) {
  useEffect(() => {
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-legacy-src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.legacySrc = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });

    Promise.all([
      loadScript("https://unpkg.com/lucide@latest"),
      loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2")
    ])
      .then(() => loadScript(assetPath(basePath, "db.js")))
      .then(() => loadScript(assetPath(basePath, pageScript)))
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

    if (document.readyState === "complete") {
      registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
    }
  }, [basePath]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#ff6b00" />
        <link rel="preconnect" href="https://unpkg.com" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://napbxlmhmbelwuxxbnyq.supabase.co" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="manifest" href={assetPath(basePath, "manifest.json")} />
        <link rel="preload" as="image" href={assetPath(basePath, "tfl_hero.png")} />
        <link rel="preload" as="image" href={assetPath(basePath, "tfl_logo.png")} />
        <link rel="preload" as="script" href={assetPath(basePath, "db.js")} />
        <link rel="preload" as="script" href={assetPath(basePath, pageScript)} />
        <link rel="stylesheet" href={assetPath(basePath, "style.css")} />
        <link rel="stylesheet" href={assetPath(basePath, pageScript === "admin.js" ? "admin.css" : "customer.css")} />
      </Head>

      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </>
  );
}
