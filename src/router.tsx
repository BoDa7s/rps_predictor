import React from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import AboutPage from "./pages/play/AboutPage";
import BootPage from "./pages/play/BootPage";
import CreatePlayerPage from "./pages/play/CreatePlayerPage";
import GameplayPage from "./pages/play/GameplayPage";
import HelpPage from "./pages/play/HelpPage";
import LeaderboardPage from "./pages/play/LeaderboardPage";
import RestorePlayerPage from "./pages/play/RestorePlayerPage";
import SettingsPage from "./pages/play/SettingsPage";
import StatsPage from "./pages/play/StatsPage";
import WelcomePage from "./pages/play/WelcomePage";
import PlayEntryGate from "./routes/PlayEntryGate";
import PlayLayout from "./routes/PlayLayout";
import PlayOnboardingLayout from "./routes/PlayOnboardingLayout";
import PlayProvidersLayout from "./routes/PlayProvidersLayout";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/play",
    element: <PlayProvidersLayout />,
    children: [
      {
        element: <PlayOnboardingLayout />,
        children: [
          {
            path: "boot",
            element: <BootPage />,
          },
          {
            path: "welcome",
            element: <WelcomePage />,
          },
          {
            path: "profile/new",
            element: <CreatePlayerPage />,
          },
          {
            path: "profile/restore",
            element: <RestorePlayerPage />,
          },
        ],
      },
      {
        element: <PlayEntryGate />,
        children: [
          {
            element: <PlayLayout />,
            children: [
              {
                index: true,
                element: <GameplayPage />,
              },
              {
                path: "stats",
                element: <StatsPage />,
              },
              {
                path: "leaderboard",
                element: <LeaderboardPage />,
              },
              {
                path: "settings",
                element: <SettingsPage />,
              },
              {
                path: "help",
                element: <HelpPage />,
              },
              {
                path: "about",
                element: <AboutPage />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
