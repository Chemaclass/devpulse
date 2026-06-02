import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";
import { ThemeProvider } from "./theme.js";

const el = document.getElementById("root");
if (!el) throw new Error("Root element not found");
createRoot(el).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
