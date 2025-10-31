export const HYDRATION_WARNING_STORAGE_KEY = "rps_hydration_warning_v1";

export interface HydrationWarningPayload {
  message: string;
  at: number;
}

export function enqueueHydrationWarning(message: string): void {
  if (typeof window === "undefined") return;
  try {
    const payload: HydrationWarningPayload = { message, at: Date.now() };
    window.sessionStorage.setItem(HYDRATION_WARNING_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

export function consumeHydrationWarning(): HydrationWarningPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(HYDRATION_WARNING_STORAGE_KEY);
    if (!stored) return null;
    window.sessionStorage.removeItem(HYDRATION_WARNING_STORAGE_KEY);
    const parsed = JSON.parse(stored) as HydrationWarningPayload | null;
    if (!parsed || typeof parsed.message !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

