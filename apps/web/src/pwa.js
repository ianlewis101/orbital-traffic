export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((r) => console.log("SW registered:", r.scope))
        .catch((e) => console.warn("SW failed:", e));
    });
  }
}
