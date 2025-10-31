import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { RootApp } from "./RootApp";

if (typeof window !== "undefined") {
  window.addEventListener("error", event => {
    console.error("GlobalError:", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", event => {
    console.error("UnhandledRejection:", event.reason);
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RootApp />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
