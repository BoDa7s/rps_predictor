import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import OfficialSiteRedirectPage from "./pages/OfficialSiteRedirectPage";
import {
  getOfficialSiteRedirectUrl,
  shouldRedirectToOfficialSite,
} from "./officialSiteRedirect";
import { router } from "./router";
import "./index.css";

function AppBootstrap() {
  if (typeof window !== "undefined" && shouldRedirectToOfficialSite(window.location)) {
    return <OfficialSiteRedirectPage destination={getOfficialSiteRedirectUrl(window.location)} />;
  }

  return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppBootstrap />
  </React.StrictMode>
);
