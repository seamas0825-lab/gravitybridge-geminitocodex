import React from "react";
import ReactDOM from "react-dom/client";
import { installGravityBridgeFetch } from "./gravitybridge-api";
import { GravityLanguageProvider } from "./i18n/gravitybridge-provider";
import GravityBridge from "./pages/GravityBridge";

installGravityBridgeFetch();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GravityLanguageProvider>
      <GravityBridge apiBase={import.meta.env.VITE_API_BASE || ""} />
    </GravityLanguageProvider>
  </React.StrictMode>,
);
