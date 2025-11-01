import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import RPSDoodleApp from "./App";
import Welcome from "./pages/Welcome";
import { BOOT_ROUTE, MODES_ROUTE, TRAINING_ROUTE, WELCOME_ROUTE } from "./lib/routes";
import "./index.css";

function AppLayout(): JSX.Element {
  return (
    <>
      <RPSDoodleApp />
      <Outlet />
    </>
  );
}

function AppRouteMarker(): JSX.Element | null {
  return null;
}

const appChildPaths = [BOOT_ROUTE, MODES_ROUTE, TRAINING_ROUTE]
  .map(route => (route.startsWith("/") ? route.slice(1) : route))
  .filter(route => route.length > 0);

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to={BOOT_ROUTE} replace /> },
      ...appChildPaths.map(path => ({ path, element: <AppRouteMarker /> })),
    ],
  },
  { path: WELCOME_ROUTE, element: <Welcome /> },
  { path: "*", element: <Navigate to={WELCOME_ROUTE} replace /> },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
