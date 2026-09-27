import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));

// Benign Chrome notice (layout settled a frame late); never actionable, keep it out of the error overlay.
const isRoLoop = (m) => typeof m === "string" && m.includes("ResizeObserver loop");
window.addEventListener("error", (e) => {
  if (isRoLoop(e.message)) { e.stopImmediatePropagation(); e.preventDefault(); }
}, true);
window.addEventListener("unhandledrejection", (e) => {
  if (isRoLoop(e.reason?.message)) e.preventDefault();
});
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA: register the safe (network-first) service worker in production builds only.
// Dev/preview skips it so hot reload never fights a SW.
if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/pwa-sw.js").catch(() => {});
  });
}
