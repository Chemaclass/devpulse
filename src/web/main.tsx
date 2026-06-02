import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";
import { ThemeProvider } from "./theme.js";
import { TokenProvider } from "./token.js";

const el = document.getElementById("root");
if (!el) throw new Error("Root element not found");
createRoot(el).render(
  <React.StrictMode>
    <ThemeProvider>
      <TokenProvider>
        <App />
      </TokenProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
