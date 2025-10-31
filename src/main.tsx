import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import RPSDoodleApp from "./App";
import Welcome from "./pages/Welcome";
import { getPostAuthPath } from "./lib/env";
import "./index.css";

const postAuthPath = getPostAuthPath();
const appPaths = new Set<string>();
if (postAuthPath && postAuthPath !== "/") {
  appPaths.add(postAuthPath);
}
appPaths.add("/modes");
appPaths.add("/training");

const routes = [
  { path: "/", element: <Welcome /> },
  { path: "/welcome", element: <Welcome /> },
  ...Array.from(appPaths).map(path => ({ path, element: <RPSDoodleApp /> })),
  { path: "*", element: <Navigate to="/" replace /> },
];

const router = createBrowserRouter(routes);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
