import type { StatsProfile } from "./stats";

export type WelcomePreference = "show" | "skip";

export type PlayEntryStep = "play" | "welcome" | "new" | "restore";
export type PlayLaunchIntent = "challenge";

export const LEGACY_WELCOME_SEEN_KEY = "rps_welcome_seen_v1";
export const WELCOME_PREF_KEY = "rps_welcome_pref_v1";
export const PLAY_BOOT_DURATION_MS = 5000;
export const TRAINING_ROUNDS_REQUIRED = 5;
export const PLAY_LAUNCH_MODE_PARAM = "mode";
export const CHALLENGE_LAUNCH_VALUE: PlayLaunchIntent = "challenge";
export const PLAY_DASHBOARD_PATH = "/play/dashboard";
export const PLAY_TRAINING_PATH = "/play/training";
export const PLAY_CHALLENGE_PATH = "/play/challenge";

export const PLAY_WELCOME_SLIDES = [
  {
    title: "Welcome to Rock Paper Scissors AI Predictor!",
    body: "You'll train for 5 rounds, then unlock Challenge mode where the AI plays against you trying to predict your moves.",
  },
  {
    title: "Your Data",
    body: "We collect gameplay data for learning. Exports will include your data and demographics.",
  },
] as const;

export function getStoredWelcomePreference(): WelcomePreference {
  if (typeof window === "undefined") return "show";
  try {
    const stored = window.localStorage.getItem(WELCOME_PREF_KEY);
    if (stored === "show" || stored === "skip") {
      return stored;
    }
    const legacy = window.localStorage.getItem(LEGACY_WELCOME_SEEN_KEY);
    if (legacy === "true") {
      return "skip";
    }
  } catch {
    /* noop */
  }
  return "show";
}

export function persistWelcomePreference(value: WelcomePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WELCOME_PREF_KEY, value);
    if (value === "skip") {
      window.localStorage.setItem(LEGACY_WELCOME_SEEN_KEY, "true");
    } else {
      window.localStorage.removeItem(LEGACY_WELCOME_SEEN_KEY);
    }
  } catch {
    /* noop */
  }
}

export function getPlayEntryStep(options: {
  welcomePreference: WelcomePreference;
  hasCurrentPlayer: boolean;
  savedPlayerCount: number;
}): PlayEntryStep {
  const { welcomePreference, hasCurrentPlayer, savedPlayerCount } = options;
  if (welcomePreference === "show") {
    return "welcome";
  }
  if (hasCurrentPlayer) {
    return "play";
  }
  return savedPlayerCount > 0 ? "restore" : "new";
}

export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  if (!value.startsWith("/play")) return null;
  if (
    value === "/play/boot" ||
    value === "/play/welcome" ||
    value === "/play/profile/new" ||
    value === "/play/profile/restore"
  ) {
    return null;
  }
  return value;
}

function isBarePlayReturn(value: string | null | undefined): boolean {
  if (!value) return false;
  return value === "/play" || value.startsWith("/play?") || value.startsWith("/play#");
}

export function profileNeedsTraining(
  profile: Pick<StatsProfile, "trainingCount" | "trained"> | null | undefined,
): boolean {
  if (!profile) return true;
  const trainingCount = Math.max(0, profile.trainingCount ?? 0);
  const trainingComplete = trainingCount >= TRAINING_ROUNDS_REQUIRED;
  return !profile.trained && !trainingComplete;
}

export function buildTrainingStartPath(): string {
  return PLAY_TRAINING_PATH;
}

export function buildChallengeStartPath(): string {
  return PLAY_CHALLENGE_PATH;
}

export function getPlayHomeDestination(
  profile: Pick<StatsProfile, "trainingCount" | "trained"> | null | undefined,
): string {
  return profileNeedsTraining(profile) ? buildTrainingStartPath() : PLAY_DASHBOARD_PATH;
}

export function buildPostOnboardingDestination(options: {
  returnTo?: string | null;
  profile?: Pick<StatsProfile, "trainingCount" | "trained"> | null;
  forceTraining?: boolean;
}): string {
  const { returnTo, profile, forceTraining = false } = options;
  if (forceTraining || profileNeedsTraining(profile)) {
    return buildTrainingStartPath();
  }
  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (isBarePlayReturn(safeReturnTo)) {
    return PLAY_DASHBOARD_PATH;
  }
  return safeReturnTo ?? PLAY_DASHBOARD_PATH;
}

export function getBootDestination(options: {
  welcomePreference: WelcomePreference;
  hasCurrentPlayer: boolean;
  savedPlayerCount: number;
  returnTo?: string | null;
  currentProfile?: Pick<StatsProfile, "trainingCount" | "trained"> | null;
}): string {
  const { welcomePreference, hasCurrentPlayer, savedPlayerCount, returnTo, currentProfile } = options;
  const nextStep = getPlayEntryStep({ welcomePreference, hasCurrentPlayer, savedPlayerCount });
  if (nextStep === "play") {
    return buildPostOnboardingDestination({ returnTo, profile: currentProfile });
  }
  return buildPlayPath(nextStep, returnTo);
}

export function buildPlayPath(step: PlayEntryStep, returnTo?: string | null): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (step === "play") {
    if (isBarePlayReturn(safeReturnTo)) {
      return PLAY_DASHBOARD_PATH;
    }
    return safeReturnTo ?? PLAY_DASHBOARD_PATH;
  }

  const pathname =
    step === "welcome"
      ? "/play/welcome"
      : step === "new"
        ? "/play/profile/new"
        : "/play/profile/restore";

  if (!safeReturnTo) {
    return pathname;
  }

  const searchParams = new URLSearchParams();
  searchParams.set("returnTo", safeReturnTo);
  return `${pathname}?${searchParams.toString()}`;
}

export function buildBootPath(returnTo?: string | null): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (!safeReturnTo) {
    return "/play/boot";
  }
  const searchParams = new URLSearchParams();
  searchParams.set("returnTo", safeReturnTo);
  return `/play/boot?${searchParams.toString()}`;
}
