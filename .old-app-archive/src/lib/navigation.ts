import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

const FALLBACK_PATH = "/welcome";
export const BOOT_SEEN_SESSION_KEY = "rps_boot_seen_v1";

export function hasBootSequenceCompleted(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(BOOT_SEEN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markBootSequenceCompleted(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(BOOT_SEEN_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function hasReactRouterHistoryState(state: unknown): state is { idx?: number } {
  return Boolean(state && typeof state === "object");
}

export function useSafeBackNavigation(fallbackPath: string = FALLBACK_PATH): () => void {
  const navigate = useNavigate();

  return useCallback(() => {
    if (typeof window !== "undefined") {
      const { history, location } = window;
      const state = history.state;
      const historyIndex = hasReactRouterHistoryState(state) && typeof state.idx === "number" ? state.idx : null;
      const sameOriginReferrer = typeof document !== "undefined" && document.referrer.startsWith(`${location.origin}/`);

      if (historyIndex !== null && historyIndex > 0) {
        navigate(-1);
        return;
      }

      if (sameOriginReferrer && history.length > 1) {
        navigate(-1);
        return;
      }
    }

    navigate(fallbackPath, { replace: true });
  }, [fallbackPath, navigate]);
}
