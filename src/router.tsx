import React from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import PlayPage from "./pages/PlayPage";
import PlayLayout from "./routes/PlayLayout";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/play",
    element: <PlayLayout />,
    children: [
      {
        index: true,
        element: <PlayPage />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
