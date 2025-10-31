import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import { devInstrumentation } from "../devInstrumentation";
import { useAuth, type DemographicsProfile } from "../context/AuthContext";
import { useCloudHydration, type CloudHydrationResult } from "../context/CloudHydrationContext";
import {
  demographicsProfileToStored,
  usePlayers,
  type StoredDemographics,
  type PlayerProfile,
} from "../players";
import type { EdgeSessionTokens } from "../lib/edgeFunctions";
import { enqueueHydrationWarning } from "../lib/postAuthFlow";

type PostAuthIntent = "login" | "signup";

interface PostAuthInput {
  username: string;
  session: EdgeSessionTokens;
  supabaseUser?: Session["user"];
  fallbackDemographics: StoredDemographics;
}

interface PostAuthFlowResult {
  route: "/training" | "/modes";
  hydration: CloudHydrationResult;
  profile: DemographicsProfile | null;
  player: PlayerProfile | null;
}

export function usePostAuthFlow(intent: PostAuthIntent) {
  const navigate = useNavigate();
  const { setSessionFromFunction, refreshProfile } = useAuth();
  const { linkCloudProfile } = usePlayers();
  const { refresh: refreshCloudHydration } = useCloudHydration();
  const routeTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (routeTimerRef.current != null) {
        window.clearTimeout(routeTimerRef.current);
        routeTimerRef.current = null;
      }
    },
    [],
  );

  return useCallback(
    async (input: PostAuthInput): Promise<PostAuthFlowResult> => {
      devInstrumentation.logMarker("auth_success", { intent });

      const session = await setSessionFromFunction(input.session);

      let nextProfile: DemographicsProfile | null = null;
      try {
        nextProfile = await refreshProfile();
      } catch (error) {
        console.error("Failed to refresh profile after authentication", error);
        nextProfile = null;
      }

      const userId =
        nextProfile?.user_id ?? session?.user?.id ?? input.supabaseUser?.id ?? null;
      let linkedProfile: PlayerProfile | null = null;
      const demographics = nextProfile
        ? demographicsProfileToStored(nextProfile)
        : input.fallbackDemographics;

      if (userId) {
        linkedProfile = linkCloudProfile({ user_id: userId, username: input.username }, demographics);
      }

      devInstrumentation.logMarker("hydrate_start", { intent });
      let hydrationResult: CloudHydrationResult;
      try {
        hydrationResult = await refreshCloudHydration();
      } catch (error) {
        hydrationResult = {
          status: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
      devInstrumentation.logMarker("hydrate_done", {
        intent,
        status: hydrationResult.status,
      });

      if (hydrationResult.status === "error") {
        enqueueHydrationWarning("Cloud sync is offline. Playing locally for now.");
      }

      const trainingCompleted = Boolean(nextProfile?.training_completed);
      const route: "/training" | "/modes" =
        intent === "signup" || !trainingCompleted ? "/training" : "/modes";

      devInstrumentation.logMarker(route === "/training" ? "route_training" : "route_modes", {
        intent,
      });

      routeTimerRef.current = window.setTimeout(() => {
        devInstrumentation.logMarker("route_timeout", {
          intent,
          target: route,
          reason: "navigation_blocked",
        });
        routeTimerRef.current = null;
      }, 2_000);

      await new Promise<void>((resolve) => {
        if (typeof window.queueMicrotask === "function") {
          window.queueMicrotask(resolve);
        } else {
          Promise.resolve().then(resolve);
        }
      });

      devInstrumentation.logMarker("route_before_navigate", {
        intent,
        target: route,
        pathname: window.location.pathname,
      });

      navigate(route, { replace: true });

      const logAfterNavigate = () => {
        devInstrumentation.logMarker("route_after_navigate", {
          intent,
          target: route,
          pathname: window.location.pathname,
        });
        if (routeTimerRef.current != null) {
          window.clearTimeout(routeTimerRef.current);
          routeTimerRef.current = null;
        }
      };

      if (typeof window.queueMicrotask === "function") {
        window.queueMicrotask(logAfterNavigate);
      } else {
        Promise.resolve().then(logAfterNavigate);
      }

      return { route, hydration: hydrationResult, profile: nextProfile, player: linkedProfile };
    },
    [intent, linkCloudProfile, navigate, refreshCloudHydration, refreshProfile, setSessionFromFunction],
  );
}

