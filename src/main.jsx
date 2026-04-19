import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  const first = args[0];
  const msg =
    first instanceof Error
      ? `${first.message}\n${first.stack || ""}`
      : typeof first === "string"
        ? first
        : "";
  if (msg.includes("_renderer.value.dimensions")) return;
  originalConsoleError(...args);
};
window.addEventListener("error", (event) => {
  if (event.message && event.message.includes("_renderer.value.dimensions")) {
    event.preventDefault();
  }
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const msg = reason?.message || String(reason || "");
  if (msg.includes("_renderer.value.dimensions")) {
    event.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
