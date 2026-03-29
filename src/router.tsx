import React from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import AboutPage from "./pages/play/AboutPage";
import BootPage from "./pages/play/BootPage";
import ChallengeGamePage from "./pages/play/ChallengeGamePage";
import CreatePlayerPage from "./pages/play/CreatePlayerPage";
import DashboardPage from "./pages/play/DashboardPage";
import DeveloperPage from "./pages/play/DeveloperPage";
import GameplayPage from "./pages/play/GameplayPage";
import HelpPage from "./pages/play/HelpPage";
import LeaderboardPage from "./pages/play/LeaderboardPage";
import RestorePlayerPage from "./pages/play/RestorePlayerPage";
import SettingsPage from "./pages/play/SettingsPage";
import StatsPage from "./pages/play/StatsPage";
import TrainingGamePage from "./pages/play/TrainingGamePage";
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
                path: "dashboard",
                element: <DashboardPage />,
              },
              {
                path: "training",
                element: <TrainingGamePage />,
              },
              {
                path: "challenge",
                element: <ChallengeGamePage />,
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
              {
                path: "developer",
                element: <DeveloperPage />,
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
