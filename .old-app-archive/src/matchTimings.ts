import { Mode } from "./gameTypes";

export interface ModeTimingConfig {
  countdownTickMs: number;
  revealHoldMs: number;
  resultBannerMs: number;
  robotRoundReactionMs: number;
  robotRoundRestMs: number;
  robotResultReactionMs: number;
  robotResultRestMs: number;
}

export type MatchTimings = Record<Mode, ModeTimingConfig>;

export const MATCH_TIMING_DEFAULTS: MatchTimings = {
  challenge: {
    countdownTickMs: 800,
    revealHoldMs: 1600,
    resultBannerMs: 1600,
    robotRoundReactionMs: 10000,
    robotRoundRestMs: 120000,
    robotResultReactionMs: 10000,
    robotResultRestMs: 120000,
  },
  practice: {
    countdownTickMs: 800,
    revealHoldMs: 1600,
    resultBannerMs: 1600,
    robotRoundReactionMs: 10000,
    robotRoundRestMs: 120000,
    robotResultReactionMs: 10000,
    robotResultRestMs: 120000,
  },
};

const STORAGE_KEY = "rps_match_timings_v1";

function sanitizeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
}

export function normalizeMatchTimings(input: Partial<Record<Mode, Partial<ModeTimingConfig>>> | MatchTimings): MatchTimings {
  return {
    challenge: {
      countdownTickMs: sanitizeNumber(input.challenge?.countdownTickMs, MATCH_TIMING_DEFAULTS.challenge.countdownTickMs),
      revealHoldMs: sanitizeNumber(input.challenge?.revealHoldMs, MATCH_TIMING_DEFAULTS.challenge.revealHoldMs),
      resultBannerMs: sanitizeNumber(input.challenge?.resultBannerMs, MATCH_TIMING_DEFAULTS.challenge.resultBannerMs),
      robotRoundReactionMs: sanitizeNumber(
        input.challenge?.robotRoundReactionMs,
        MATCH_TIMING_DEFAULTS.challenge.robotRoundReactionMs,
      ),
      robotRoundRestMs: sanitizeNumber(
        input.challenge?.robotRoundRestMs,
        MATCH_TIMING_DEFAULTS.challenge.robotRoundRestMs,
      ),
      robotResultReactionMs: sanitizeNumber(
        input.challenge?.robotResultReactionMs,
        MATCH_TIMING_DEFAULTS.challenge.robotResultReactionMs,
      ),
      robotResultRestMs: sanitizeNumber(
        input.challenge?.robotResultRestMs,
        MATCH_TIMING_DEFAULTS.challenge.robotResultRestMs,
      ),
    },
    practice: {
      countdownTickMs: sanitizeNumber(input.practice?.countdownTickMs, MATCH_TIMING_DEFAULTS.practice.countdownTickMs),
      revealHoldMs: sanitizeNumber(input.practice?.revealHoldMs, MATCH_TIMING_DEFAULTS.practice.revealHoldMs),
      resultBannerMs: sanitizeNumber(input.practice?.resultBannerMs, MATCH_TIMING_DEFAULTS.practice.resultBannerMs),
      robotRoundReactionMs: sanitizeNumber(
        input.practice?.robotRoundReactionMs,
        MATCH_TIMING_DEFAULTS.practice.robotRoundReactionMs,
      ),
      robotRoundRestMs: sanitizeNumber(
        input.practice?.robotRoundRestMs,
        MATCH_TIMING_DEFAULTS.practice.robotRoundRestMs,
      ),
      robotResultReactionMs: sanitizeNumber(
        input.practice?.robotResultReactionMs,
        MATCH_TIMING_DEFAULTS.practice.robotResultReactionMs,
      ),
      robotResultRestMs: sanitizeNumber(
        input.practice?.robotResultRestMs,
        MATCH_TIMING_DEFAULTS.practice.robotResultRestMs,
      ),
    },
  };
}

export function loadMatchTimings(): MatchTimings {
  if (typeof window === "undefined") {
    return normalizeMatchTimings(MATCH_TIMING_DEFAULTS);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return normalizeMatchTimings(MATCH_TIMING_DEFAULTS);
    }
    const parsed = JSON.parse(raw);
    return normalizeMatchTimings(parsed);
  } catch (err) {
    console.warn("Failed to load match timings", err);
    return normalizeMatchTimings(MATCH_TIMING_DEFAULTS);
  }
}

export function saveMatchTimings(timings: MatchTimings) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timings));
  } catch (err) {
    console.warn("Failed to persist match timings", err);
  }
}

export function clearSavedMatchTimings() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to clear match timings", err);
  }
}
