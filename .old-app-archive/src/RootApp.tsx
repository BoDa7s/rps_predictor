import React, { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import RPSDoodleApp from "./App";
import { LoginPage } from "./routes/Login";
import { SignupPage } from "./routes/Signup";
import { RecoverUsernamePage } from "./routes/RecoverUsername";
import { ResetPasswordPage } from "./routes/ResetPassword";
import { useAuth } from "./context/AuthContext";
import { isSupabaseConfigured } from "./lib/supabaseClient";
import { LocalModeProvider, useLocalMode } from "./context/LocalModeContext";
import { PlayersProvider } from "./players";
import { RouteBoundary, RouteLoadingScreen } from "./routes/RouteBoundary";
import { hasBootSequenceCompleted } from "./lib/navigation";
import { CloudHydrationProvider, useCloudHydration } from "./context/CloudHydrationContext";

function BootRouteGuard(): null {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === "/boot" && hasBootSequenceCompleted()) {
      navigate("/welcome", { replace: true });
    }
  }, [location.pathname, navigate]);

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactElement }): JSX.Element {
  const { user, loading } = useAuth();
  const { localModeEnabled } = useLocalMode();
  const { status: hydrationStatus } = useCloudHydration();

  if (!isSupabaseConfigured) {
    return children;
  }

  if (loading) {
    return <RouteLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  const shouldWaitForHydration = !localModeEnabled && hydrationStatus !== "disabled";
  if (shouldWaitForHydration && (hydrationStatus === "idle" || hydrationStatus === "hydrating")) {
    return <RouteLoadingScreen />;
  }

  return children;
}

export function RootApp(): JSX.Element {
  const renderApp = () => (
    <RouteBoundary>
      <RPSDoodleApp />
    </RouteBoundary>
  );

  return (
    <LocalModeProvider>
      <PlayersProvider>
        <CloudHydrationProvider>
          <BootRouteGuard />
          <Routes>
          <Route
            path="/auth/login"
            element={(
              <RouteBoundary>
                <LoginPage />
              </RouteBoundary>
            )}
          />
          <Route
            path="/auth/signup"
            element={(
              <RouteBoundary>
                <SignupPage />
              </RouteBoundary>
            )}
          />
          <Route path="/login" element={<Navigate to="/auth/login" replace />} />
          <Route path="/signup" element={<Navigate to="/auth/signup" replace />} />
          <Route
            path="/recover-username"
            element={(
              <RouteBoundary>
                <RecoverUsernamePage />
              </RouteBoundary>
            )}
          />
          <Route
            path="/reset-password"
            element={(
              <RouteBoundary>
                <ResetPasswordPage />
              </RouteBoundary>
            )}
          />
          <Route
            path="/training"
            element={(
              <ProtectedRoute>
                {renderApp()}
              </ProtectedRoute>
            )}
          />
          <Route path="/boot" element={renderApp()} />
          <Route path="/welcome" element={renderApp()} />
          <Route
            path="/modes"
            element={(
              <ProtectedRoute>
                {renderApp()}
              </ProtectedRoute>
            )}
          />
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          <Route path="*" element={<Navigate to="/welcome" replace />} />
          </Routes>
        </CloudHydrationProvider>
      </PlayersProvider>
    </LocalModeProvider>
  );
}
