import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, type Transition, useReducedMotion } from "framer-motion";
import { Move, Mode, AIMode, Outcome, BestOf } from "./gameTypes";
import {
  StatsProvider,
  useStats,
  RoundLog,
  MixerTrace,
  HeuristicTrace,
  DecisionPolicy,
  StoredPredictorModelState,
  HedgeMixerSerializedState,
  SerializedExpertState,
  ThemePreference,
  ThemeMode,
  ThemeModeColors,
  ThemeColorPreferences,
  DEFAULT_PROFILE_PREFERENCES,
  DEFAULT_THEME_COLOR_PREFERENCES,
  cloneProfilePreferences,
} from "./stats";
import { PlayersProvider, usePlayers, Grade, PlayerProfile, CONSENT_TEXT_VERSION, GRADE_OPTIONS } from "./players";
import { DEV_MODE_ENABLED } from "./devMode";
import { DeveloperConsole } from "./DeveloperConsole";
import { devInstrumentation } from "./devInstrumentation";
import { lockSecureStore } from "./secureStore";
import {
  MATCH_TIMING_DEFAULTS,
  MatchTimings,
  clearSavedMatchTimings,
  loadMatchTimings,
  normalizeMatchTimings,
  saveMatchTimings,
} from "./matchTimings";
import AboutModal from "./AboutModal";
import LeaderboardModal from "./LeaderboardModal";
import InsightPanel, { type LiveInsightSnapshot } from "./InsightPanel";
import { computeMatchScore } from "./leaderboard";
import {
  collectLeaderboardEntries,
  findTopLeaderboardEntryForPlayer,
  groupRoundsByMatch,
  type LeaderboardPlayerInfo,
} from "./leaderboardData";
import { MoveIcon, MoveLabel } from "./moveIcons";
import botIdle48 from "./assets/mascot/bot-idle-48.svg";
import botIdle64 from "./assets/mascot/bot-idle-64.svg";
import botIdle96 from "./assets/mascot/bot-idle-96.svg";
import botHappy48 from "./assets/mascot/bot-happy-48.svg";
import botHappy64 from "./assets/mascot/bot-happy-64.svg";
import botHappy96 from "./assets/mascot/bot-happy-96.svg";
import botMeh48 from "./assets/mascot/bot-meh-48.svg";
import botMeh64 from "./assets/mascot/bot-meh-64.svg";
import botMeh96 from "./assets/mascot/bot-meh-96.svg";
import botSad48 from "./assets/mascot/bot-sad-48.svg";
import botSad64 from "./assets/mascot/bot-sad-64.svg";
import botSad96 from "./assets/mascot/bot-sad-96.svg";
import HelpCenter, { type HelpQuestion } from "./HelpCenter";
import {
  darken,
  getReadableTextColor,
  lighten,
  mixHexColors,
  normalizeHexColor,
} from "./colorUtils";

// ---------------------------------------------
// Rock-Paper-Scissors Google Doodle-style demo
// Single-file React app implementing ModeSelect full-graphic morph
// + Ensemble AI (Hedge) with Practice + Training + Exploit flow
// Notes:
// - Emoji-based visuals throughout; no external animation URLs required
// - Framer Motion handles shared-element scene morph + wipe
// - WebAudio provides simple SFX; audio starts after first user gesture
// - Keyboard: 1=Rock, 2=Paper, 3=Scissors, Esc=Back
// ---------------------------------------------

// Utility: seeded PRNG (Mulberry32)
function mulberry32(a:number){
  return function(){
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Types
const MOVES: Move[] = ["rock", "paper", "scissors"];
const MODES: Mode[] = ["challenge", "practice"];
const VISIBLE_MODE_OPTIONS: Mode[] = MODES.filter(mode => mode !== "practice");

const DIFFICULTY_INFO: Record<AIMode, { label: string; helper: string }> = {
  fair: { label: "Fair", helper: "Gentle counterplay tuned for learning." },
  normal: { label: "Normal", helper: "Balanced challenge that reacts to streaks." },
  ruthless: { label: "Ruthless", helper: "Aggressive mix-ups that punish predictability." },
};

const DIFFICULTY_SEQUENCE: AIMode[] = ["fair", "normal", "ruthless"];
const BEST_OF_OPTIONS: BestOf[] = [3, 5, 7];
const LEGACY_WELCOME_SEEN_KEY = "rps_welcome_seen_v1";
const WELCOME_PREF_KEY = "rps_welcome_pref_v1";
const INSIGHT_PANEL_STATE_KEY = "rps_insight_panel_open_v1";
const SCENE_STORAGE_KEY = "rps_last_scene_v1";
const THEME_PREFERENCE_STORAGE_KEY = "rps_theme_pref_v1";
const THEME_COLOR_STORAGE_KEY = "rps_theme_colors_v1";
type WelcomePreference = "show" | "skip";

type RobotVariant = "idle" | "happy" | "meh" | "sad";
type RobotReaction = { emoji: string; body?: string; label: string; variant: RobotVariant };

type ModernToastVariant = "danger" | "warning";

type ModernToast = {
  variant: ModernToastVariant;
  title: string;
  message: string;
};

type Scene = "WELCOME" | "BOOT" | "MODE" | "MATCH" | "RESULTS";

const MODERN_TOAST_BASE_CLASSES =
  "pointer-events-auto flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl px-4 py-3 text-sm text-slate-700 shadow-2xl";

const MODERN_TOAST_STYLES: Record<ModernToastVariant, {
  container: string;
  icon: string;
  iconWrapper: string;
  title: string;
  dismiss: string;
}> = {
  danger: {
    container: "border border-rose-200/80 bg-white/95 ring-1 ring-rose-200/70",
    icon: "🚫",
    iconWrapper: "bg-rose-100 text-rose-600",
    title: "text-sm font-semibold text-rose-600",
    dismiss: "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-200",
  },
  warning: {
    container: "border border-amber-200/80 bg-white/95 ring-1 ring-amber-200/70",
    icon: "⚠️",
    iconWrapper: "bg-amber-100 text-amber-600",
    title: "text-sm font-semibold text-amber-700",
    dismiss: "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-200",
  },
};

type PartialThemeColorPreferences = Partial<Record<ThemeMode, Partial<ThemeModeColors>>>;

function mergeThemeColorPreferences(
  base: ThemeColorPreferences,
  override?: PartialThemeColorPreferences | ThemeColorPreferences | null,
): ThemeColorPreferences {
  const result: ThemeColorPreferences = {
    light: { ...base.light },
    dark: { ...base.dark },
  };
  if (!override) {
    return result;
  }
  (Object.keys(override) as ThemeMode[]).forEach(mode => {
    if (!override[mode]) return;
    const next = override[mode]!;
    if (next.accent) {
      result[mode].accent = normalizeHexColor(next.accent, result[mode].accent);
    }
    if (next.background) {
      result[mode].background = normalizeHexColor(next.background, result[mode].background);
    }
  });
  return result;
}

function parseStoredThemeColors(raw: string | null): ThemeColorPreferences | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PartialThemeColorPreferences;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return mergeThemeColorPreferences(DEFAULT_THEME_COLOR_PREFERENCES, parsed);
  } catch {
    return null;
  }
}

function themeModeColorsEqual(a: ThemeModeColors, b: ThemeModeColors): boolean {
  return a.accent === b.accent && a.background === b.background;
}

function themeColorPreferencesEqual(
  a: ThemeColorPreferences,
  b: ThemeColorPreferences,
): boolean {
  return themeModeColorsEqual(a.light, b.light) && themeModeColorsEqual(a.dark, b.dark);
}

function deriveThemeCssVariables(mode: ThemeMode, colors: ThemeModeColors): Record<string, string> {
  const defaults = DEFAULT_THEME_COLOR_PREFERENCES[mode];
  const accent = normalizeHexColor(colors.accent, defaults.accent);
  const background = normalizeHexColor(colors.background, defaults.background);
  const accentStrong = mode === "dark" ? lighten(accent, 0.25) : darken(accent, 0.2);
  const accentHover = mode === "dark" ? lighten(accent, 0.15) : darken(accent, 0.12);
  const accentActive = mode === "dark" ? lighten(accent, 0.22) : darken(accent, 0.2);
  const accentSoft = mode === "dark" ? lighten(accent, 0.75) : lighten(accent, 0.7);
  const accentMuted = mode === "dark" ? lighten(accent, 0.55) : lighten(accent, 0.5);
  const onAccent = getReadableTextColor(accent);
  const textStrong = mode === "dark" ? lighten(background, 0.85) : darken(background, 0.85);
  const textPrimary = mode === "dark" ? lighten(background, 0.75) : darken(background, 0.75);
  const textSecondary = mode === "dark" ? lighten(background, 0.6) : darken(background, 0.6);
  const textMuted = mode === "dark" ? lighten(background, 0.45) : darken(background, 0.45);
  const surfaceCard = mode === "dark" ? lighten(background, 0.18) : lighten(background, 0.93);
  const surfaceInput = mode === "dark" ? lighten(background, 0.24) : lighten(background, 0.88);
  const surfaceSubtle = mode === "dark" ? lighten(background, 0.14) : lighten(background, 0.82);
  const surfaceHover = mode === "dark" ? lighten(background, 0.3) : lighten(background, 0.76);
  const border = mode === "dark" ? lighten(background, 0.38) : darken(background, 0.2);
  const borderStrong = mode === "dark" ? lighten(background, 0.52) : darken(background, 0.28);
  const ring = mode === "dark" ? lighten(accent, 0.4) : darken(accent, 0.18);
  const overlay = mode === "dark" ? "rgba(4, 10, 33, 0.74)" : "rgba(15, 23, 42, 0.4)";
  const gradientStart = mode === "dark" ? lighten(background, 0.08) : lighten(background, 0.7);
  const gradientMiddle = mode === "dark" ? lighten(background, 0.16) : lighten(background, 0.85);
  const gradientEnd = mode === "dark" ? lighten(background, 0.25) : lighten(background, 0.95);
  const orbPrimary = mixHexColors(accent, background, mode === "dark" ? 0.4 : 0.25);
  const orbSecondary = mixHexColors(accent, background, mode === "dark" ? 0.55 : 0.35);
  const orbTertiary = mixHexColors(accent, background, mode === "dark" ? 0.7 : 0.5);
  const orbOpacity = mode === "dark" ? "0.3" : "0.55";
  return {
    "--app-bg": background,
    "--app-accent": accent,
    "--app-accent-strong": accentStrong,
    "--app-accent-hover": accentHover,
    "--app-accent-active": accentActive,
    "--app-accent-soft": accentSoft,
    "--app-accent-muted": accentMuted,
    "--app-on-accent": onAccent,
    "--app-text-strong": textStrong,
    "--app-text-primary": textPrimary,
    "--app-text-secondary": textSecondary,
    "--app-text-muted": textMuted,
    "--app-surface-card": surfaceCard,
    "--app-surface-input": surfaceInput,
    "--app-surface-subtle": surfaceSubtle,
    "--app-surface-hover": surfaceHover,
    "--app-border": border,
    "--app-border-strong": borderStrong,
    "--app-ring": ring,
    "--app-overlay": overlay,
    "--app-gradient-start": gradientStart,
    "--app-gradient-middle": gradientMiddle,
    "--app-gradient-end": gradientEnd,
    "--app-orb-primary": orbPrimary,
    "--app-orb-secondary": orbSecondary,
    "--app-orb-tertiary": orbTertiary,
    "--app-orb-opacity": orbOpacity,
  };
}

const ROBOT_ASSETS: Record<RobotVariant, { 48: string; 64: string; 96: string }> = {
  idle: { 48: botIdle48, 64: botIdle64, 96: botIdle96 },
  happy: { 48: botHappy48, 64: botHappy64, 96: botHappy96 },
  meh: { 48: botMeh48, 64: botMeh64, 96: botMeh96 },
  sad: { 48: botSad48, 64: botSad64, 96: botSad96 },
};

const ROBOT_BASE_GLOW = "drop-shadow(0 0 8px rgba(14, 165, 233, 0.35))";

type MascotPattern = {
  keyframes: {
    rotate: number[];
    y: number[];
    x: number[];
    scale: number[];
    filter: string[];
  };
  transition: Transition;
};

const ROBOT_MOTION_PATTERNS: MascotPattern[] = [
  {
    keyframes: {
      rotate: [0, -2.4, 1.6, -1.2, 0.5, 0],
      y: [0, -3.4, 1.6, -2.6, 0.9, 0],
      x: [0, 1.6, 0.3, -1.1, 0.4, 0],
      scale: [1, 1.024, 1.008, 0.992, 1.012, 1],
      filter: [
        ROBOT_BASE_GLOW,
        "drop-shadow(0 0 14px rgba(56, 189, 248, 0.55))",
        "drop-shadow(0 0 11px rgba(59, 130, 246, 0.48))",
        "drop-shadow(0 0 16px rgba(147, 197, 253, 0.6))",
        "drop-shadow(0 0 10px rgba(14, 165, 233, 0.5))",
        ROBOT_BASE_GLOW,
      ],
    },
    transition: {
      duration: 7.6,
      ease: "easeInOut",
      times: [0, 0.18, 0.37, 0.63, 0.84, 1],
    },
  },
  {
    keyframes: {
      rotate: [0, 1.4, -1.8, 1.1, -0.6, 0],
      y: [0, 2.3, -3.6, 1.8, -1.2, 0],
      x: [0, -1.1, 0.9, -0.4, 0.2, 0],
      scale: [1, 0.992, 1.022, 1.006, 0.994, 1],
      filter: [
        ROBOT_BASE_GLOW,
        "drop-shadow(0 0 9px rgba(59, 130, 246, 0.45))",
        "drop-shadow(0 0 14px rgba(96, 165, 250, 0.58))",
        "drop-shadow(0 0 12px rgba(14, 165, 233, 0.52))",
        "drop-shadow(0 0 10px rgba(56, 189, 248, 0.46))",
        ROBOT_BASE_GLOW,
      ],
    },
    transition: {
      duration: 6.9,
      ease: "easeInOut",
      times: [0, 0.22, 0.44, 0.68, 0.85, 1],
    },
  },
  {
    keyframes: {
      rotate: [0, -1.1, 0.8, -0.9, 1.2, 0],
      y: [0, -1.5, 2.4, -1.8, 1.1, 0],
      x: [0, 0.5, -1.3, 0.8, -0.4, 0],
      scale: [1, 1.012, 0.99, 1.018, 1.004, 1],
      filter: [
        ROBOT_BASE_GLOW,
        "drop-shadow(0 0 11px rgba(37, 99, 235, 0.48))",
        "drop-shadow(0 0 13px rgba(14, 165, 233, 0.55))",
        "drop-shadow(0 0 12px rgba(129, 140, 248, 0.58))",
        "drop-shadow(0 0 9px rgba(56, 189, 248, 0.5))",
        ROBOT_BASE_GLOW,
      ],
    },
    transition: {
      duration: 7.8,
      ease: "easeInOut",
      times: [0, 0.17, 0.39, 0.61, 0.83, 1],
    },
  },
  {
    keyframes: {
      rotate: [0, 0.9, -0.6, 1.4, -1.5, 0],
      y: [0, 1.8, -1.2, 2.6, -2.1, 0],
      x: [0, -0.8, 1.4, -1.2, 0.6, 0],
      scale: [1, 0.996, 1.018, 0.988, 1.02, 1],
      filter: [
        ROBOT_BASE_GLOW,
        "drop-shadow(0 0 10px rgba(56, 189, 248, 0.5))",
        "drop-shadow(0 0 15px rgba(59, 130, 246, 0.56))",
        "drop-shadow(0 0 11px rgba(14, 165, 233, 0.52))",
        "drop-shadow(0 0 13px rgba(96, 165, 250, 0.55))",
        ROBOT_BASE_GLOW,
      ],
    },
    transition: {
      duration: 7.4,
      ease: "easeInOut",
      times: [0, 0.2, 0.42, 0.66, 0.86, 1],
    },
  },
];

interface RobotMascotProps {
  className?: string;
  variant?: RobotVariant;
  sizeConfig?: string;
  "aria-label"?: string;
}

const RobotMascot: React.FC<RobotMascotProps> = ({
  className = "",
  variant = "idle",
  sizeConfig = "(min-width: 1024px) 96px, (min-width: 640px) 64px, 48px",
  "aria-label": ariaLabel,
}) => {
  const assets = ROBOT_ASSETS[variant] ?? ROBOT_ASSETS.idle;
  const [patternIndex, setPatternIndex] = useState(() =>
    Math.floor(Math.random() * ROBOT_MOTION_PATTERNS.length),
  );
  const currentPattern = ROBOT_MOTION_PATTERNS[patternIndex] ?? ROBOT_MOTION_PATTERNS[0];

  const handlePatternComplete = useCallback(() => {
    if (ROBOT_MOTION_PATTERNS.length <= 1) return;
    setPatternIndex(prev => {
      let next = Math.floor(Math.random() * ROBOT_MOTION_PATTERNS.length);
      if (next === prev) {
        next = (next + 1) % ROBOT_MOTION_PATTERNS.length;
      }
      return next;
    });
  }, []);

  return (
    <motion.div
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      initial={{ rotate: 0, y: 0, x: 0, scale: 1, filter: ROBOT_BASE_GLOW }}
      animate={currentPattern.keyframes}
      transition={currentPattern.transition}
      onAnimationComplete={handlePatternComplete}
      style={{ transformOrigin: "50% 50%" }}
    >
      <img
        src={assets[64]}
        srcSet={`${assets[48]} 48w, ${assets[64]} 64w, ${assets[96]} 96w`}
        sizes={sizeConfig}
        alt=""
        aria-hidden="true"
        className="h-full w-full select-none object-contain"
        draggable={false}
      />
    </motion.div>
  );
};

function getInitialWelcomePreference(): WelcomePreference {
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

function getInitialScene(): Scene {
  if (typeof window === "undefined") return "BOOT";
  try {
    const stored = window.sessionStorage.getItem(SCENE_STORAGE_KEY);
    if (stored === "WELCOME" || stored === "MODE" || stored === "MATCH" || stored === "RESULTS") {
      return stored;
    }
  } catch {
    /* noop */
  }
  return "BOOT";
}

// ---- Core game logic (pure) ----
export function resolveOutcome(player: Move, ai: Move): Outcome {
  if (player === ai) return "tie";
  if ((player === "rock" && ai === "scissors") ||
      (player === "paper" && ai === "rock") ||
      (player === "scissors" && ai === "paper")) return "win";
  return "lose";
}

export function mostFrequentMove(moves: Move[]): Move | null {
  if (!moves.length) return null;
  const freq: Record<Move, number> = { rock:0, paper:0, scissors:0 };
  for (const m of moves) freq[m]++;
  let best: Move = "rock"; let count = -1;
  (Object.keys(freq) as Move[]).forEach(k=>{ if (freq[k] > count){ best = k; count = freq[k]; } });
  return best;
}

export function counterMove(m: Move): Move {
  const counter: Record<Move, Move> = { rock: "paper", paper: "scissors", scissors: "rock" };
  return counter[m];
}

// --- Ensemble AI (Mixture of Experts + Hedge) ------------------------------
// Dist helpers
type Dist = Record<Move, number>;
const UNIFORM: Dist = { rock: 1/3, paper: 1/3, scissors: 1/3 };
function normalize(d: Dist): Dist { const s = d.rock + d.paper + d.scissors; return s>0? { rock: d.rock/s, paper: d.paper/s, scissors: d.scissors/s } : { ...UNIFORM }; }
function fromCounts(c: Record<Move, number>, alpha=1): Dist { return normalize({ rock: (c.rock||0)+alpha, paper:(c.paper||0)+alpha, scissors:(c.scissors||0)+alpha }); }

const MODEL_STATE_VERSION = 1;
const HISTORY_BASE_WEIGHT = 0.3;
const HISTORY_EARLY_WEIGHT = 0.6;
const HISTORY_SWITCH_ROUNDS = 4;
const HISTORY_DECAY_MS = 45 * 60 * 1000;

// Context passed to experts
interface Ctx { playerMoves: Move[]; aiMoves: Move[]; outcomes: Outcome[]; rng: ()=>number; }

interface Expert { predict(ctx: Ctx): Dist; update(ctx: Ctx, actual: Move): void }

// Frequency over sliding window W
class FrequencyExpert implements Expert{
  constructor(private W=20, private alpha=1){}
  predict(ctx: Ctx): Dist{
    const window = ctx.playerMoves.slice(-this.W);
    const counts: Record<Move, number> = { rock:0,paper:0,scissors:0 };
    window.forEach(m=> counts[m]++);
    return fromCounts(counts, this.alpha);
  }
  update(){ /* stateless */ }
  getState(): SerializedExpertState {
    return { type: "FrequencyExpert", window: this.W, alpha: this.alpha };
  }
  setState(state: Extract<SerializedExpertState, { type: "FrequencyExpert" }>) {
    if (!state) return;
    if (Number.isFinite(state.window)) {
      const next = Math.max(1, Math.floor(state.window));
      this.W = next;
    }
    if (Number.isFinite(state.alpha)) {
      this.alpha = Math.max(0, state.alpha);
    }
  }
}

// Recency-biased frequency (exponential decay)
class RecencyExpert implements Expert{
  constructor(private gamma=0.85, private alpha=1){} // lower gamma = more recency
  predict(ctx: Ctx): Dist{
    const n = ctx.playerMoves.length; const w: Record<Move, number> = { rock:0,paper:0,scissors:0 };
    for (let i=0;i<n;i++){ const m = ctx.playerMoves[i]; const weight = Math.pow(this.gamma, n-1-i); w[m] += weight; }
    return fromCounts(w, this.alpha);
  }
  update(){}
  getState(): SerializedExpertState {
    return { type: "RecencyExpert", gamma: this.gamma, alpha: this.alpha };
  }
  setState(state: Extract<SerializedExpertState, { type: "RecencyExpert" }>) {
    if (!state) return;
    if (Number.isFinite(state.gamma)) {
      const next = Number(state.gamma);
      this.gamma = Math.min(0.995, Math.max(0.01, next));
    }
    if (Number.isFinite(state.alpha)) {
      this.alpha = Math.max(0, state.alpha);
    }
  }
}

// Markov n-gram with Laplace smoothing + online update
class MarkovExpert implements Expert{
  table = new Map<string, {rock:number,paper:number,scissors:number}>();
  constructor(private k=1, private alpha=1){}
  private key(ctx: Ctx){
    const n = ctx.playerMoves.length; if (n < this.k) return "";
    const seq = ctx.playerMoves.slice(n-this.k).join("|");
    return seq;
  }
  predict(ctx: Ctx): Dist{
    let k = this.k; let counts: any = null; let key = "";
    while (k>=1){
      const n = ctx.playerMoves.length; if (n < k){ k--; continue; }
      key = ctx.playerMoves.slice(n-k).join("|");
      counts = this.table.get(key);
      if (counts) break; k--;
    }
    if (!counts) return UNIFORM;
    return fromCounts(counts, this.alpha);
  }
  update(ctx: Ctx, actual: Move){
    if (ctx.playerMoves.length < this.k) return;
    const k = this.key(ctx);
    const entry = this.table.get(k) || {rock:0,paper:0,scissors:0};
    entry[actual]++; this.table.set(k, entry);
  }
  getState(): SerializedExpertState {
    return {
      type: "MarkovExpert",
      order: this.k,
      alpha: this.alpha,
      table: Array.from(this.table.entries()).map(([key, counts]) => [key, { ...counts }]),
    };
  }
  setState(state: Extract<SerializedExpertState, { type: "MarkovExpert" }>) {
    if (!state) return;
    if (Number.isFinite(state.order)) {
      this.k = Math.max(1, Math.floor(state.order));
    }
    if (Number.isFinite(state.alpha)) {
      this.alpha = Math.max(0, state.alpha);
    }
    if (Array.isArray(state.table)) {
      const next = new Map<string, { rock: number; paper: number; scissors: number }>();
      state.table.forEach(entry => {
        if (!Array.isArray(entry) || entry.length !== 2) return;
        const [key, counts] = entry as [string, { rock: number; paper: number; scissors: number }];
        if (typeof key !== "string" || !counts || typeof counts !== "object") return;
        next.set(key, {
          rock: Number.isFinite((counts as any).rock) ? Number((counts as any).rock) : 0,
          paper: Number.isFinite((counts as any).paper) ? Number((counts as any).paper) : 0,
          scissors: Number.isFinite((counts as any).scissors) ? Number((counts as any).scissors) : 0,
        });
      });
      this.table = next;
    }
  }
}

// Outcome-conditioned next move
class OutcomeExpert implements Expert{
  byOutcome = { win:{rock:0,paper:0,scissors:0}, lose:{rock:0,paper:0,scissors:0}, tie:{rock:0,paper:0,scissors:0} };
  constructor(private alpha=1){}
  predict(ctx: Ctx): Dist{
    const last = ctx.outcomes[ctx.outcomes.length-1];
    if (!last) return UNIFORM;
    return fromCounts(this.byOutcome[last], this.alpha);
  }
  update(ctx: Ctx, actual: Move){
    const last = ctx.outcomes[ctx.outcomes.length-1]; if (!last) return;
    this.byOutcome[last][actual]++;
  }
  getState(): SerializedExpertState {
    return {
      type: "OutcomeExpert",
      alpha: this.alpha,
      byOutcome: {
        win: { ...this.byOutcome.win },
        lose: { ...this.byOutcome.lose },
        tie: { ...this.byOutcome.tie },
      },
    };
  }
  setState(state: Extract<SerializedExpertState, { type: "OutcomeExpert" }>) {
    if (!state) return;
    if (Number.isFinite(state.alpha)) {
      this.alpha = Math.max(0, state.alpha);
    }
    if (state.byOutcome) {
      const keys: Outcome[] = ["win", "lose", "tie"];
      keys.forEach(key => {
        const source = (state.byOutcome as any)[key];
        if (source && typeof source === "object") {
          this.byOutcome[key] = {
            rock: Number.isFinite(source.rock) ? Number(source.rock) : 0,
            paper: Number.isFinite(source.paper) ? Number(source.paper) : 0,
            scissors: Number.isFinite(source.scissors) ? Number(source.scissors) : 0,
          };
        }
      });
    }
  }
}

// Win-Stay / Lose-Shift keyed by (lastOutcome,lastMove)
class WinStayLoseShiftExpert implements Expert{
  table = new Map<string,{rock:number,paper:number,scissors:number}>();
  constructor(private alpha=1){}
  predict(ctx: Ctx): Dist{
    const n = ctx.playerMoves.length; const lastM = ctx.playerMoves[n-1]; const lastO = ctx.outcomes[ctx.outcomes.length-1];
    if (!lastM || !lastO) return UNIFORM;
    const key = `${lastO}|${lastM}`; const counts = this.table.get(key);
    return counts ? fromCounts(counts,this.alpha) : UNIFORM;
  }
  update(ctx: Ctx, actual: Move){
    const n = ctx.playerMoves.length; const lastM = ctx.playerMoves[n-1]; const lastO = ctx.outcomes[ctx.outcomes.length-1];
    if (!lastM || !lastO) return;
    const key = `${lastO}|${lastM}`; const counts = this.table.get(key) || {rock:0,paper:0,scissors:0};
    counts[actual]++; this.table.set(key, counts);
  }
  getState(): SerializedExpertState {
    return {
      type: "WinStayLoseShiftExpert",
      alpha: this.alpha,
      table: Array.from(this.table.entries()).map(([key, counts]) => [key, { ...counts }]),
    };
  }
  setState(state: Extract<SerializedExpertState, { type: "WinStayLoseShiftExpert" }>) {
    if (!state) return;
    if (Number.isFinite(state.alpha)) {
      this.alpha = Math.max(0, state.alpha);
    }
    if (Array.isArray(state.table)) {
      const next = new Map<string, { rock: number; paper: number; scissors: number }>();
      state.table.forEach(entry => {
        if (!Array.isArray(entry) || entry.length !== 2) return;
        const [key, counts] = entry as [string, { rock: number; paper: number; scissors: number }];
        if (typeof key !== "string" || !counts || typeof counts !== "object") return;
        next.set(key, {
          rock: Number.isFinite((counts as any).rock) ? Number((counts as any).rock) : 0,
          paper: Number.isFinite((counts as any).paper) ? Number((counts as any).paper) : 0,
          scissors: Number.isFinite((counts as any).scissors) ? Number((counts as any).scissors) : 0,
        });
      });
      this.table = next;
    }
  }
}

// Periodic detector (period 2..5 via simple autocorrelation)
class PeriodicExpert implements Expert{
  constructor(private maxPeriod=5, private minPeriod=2, private window=18, private confident=0.65){}
  predict(ctx: Ctx): Dist{
    const arr = ctx.playerMoves.slice(-this.window); const n = arr.length; if (n< this.minPeriod+1) return UNIFORM;
    let bestP = -1, bestScore = 0;
    for (let p=this.minPeriod;p<=this.maxPeriod;p++){
      let matches=0, total=0;
      for (let i=p;i<n;i++){ total++; if (arr[i]===arr[i-p]) matches++; }
      const score = total? matches/total : 0;
      if (score>bestScore){ bestScore=score; bestP=p; }
    }
    if (bestP<0 || bestScore < this.confident){ return UNIFORM; }
    const guess = arr[n-bestP];
    const dist: Dist = { rock:0, paper:0, scissors:0 }; dist[guess] = 0.9; // concentrate on guess
    return normalize({...dist, rock:dist.rock+0.05, paper:dist.paper+0.05, scissors:dist.scissors+0.05});
  }
  update(){}
  getState(): SerializedExpertState {
    return {
      type: "PeriodicExpert",
      maxPeriod: this.maxPeriod,
      minPeriod: this.minPeriod,
      window: this.window,
      confident: this.confident,
    };
  }
  setState(state: Extract<SerializedExpertState, { type: "PeriodicExpert" }>) {
    if (!state) return;
    if (Number.isFinite(state.maxPeriod)) this.maxPeriod = Math.max(2, Math.floor(state.maxPeriod));
    if (Number.isFinite(state.minPeriod)) this.minPeriod = Math.max(1, Math.floor(state.minPeriod));
    if (Number.isFinite(state.window)) this.window = Math.max(3, Math.floor(state.window));
    if (Number.isFinite(state.confident)) this.confident = Math.max(0, Math.min(1, state.confident));
  }
}

// Response-to-our-last-move (bait detector)
class BaitResponseExpert implements Expert{
  table = { rock:{rock:0,paper:0,scissors:0}, paper:{rock:0,paper:0,scissors:0}, scissors:{rock:0,paper:0,scissors:0} };
  constructor(private alpha=1){}
  predict(ctx: Ctx): Dist{
    const lastAI = ctx.aiMoves[ctx.aiMoves.length-1]; if (!lastAI) return UNIFORM;
    return fromCounts(this.table[lastAI], this.alpha);
  }
  update(ctx: Ctx, actual: Move){
    const lastAI = ctx.aiMoves[ctx.aiMoves.length-1]; if (!lastAI) return;
    this.table[lastAI][actual]++;
  }
  getState(): SerializedExpertState {
    return {
      type: "BaitResponseExpert",
      alpha: this.alpha,
      table: {
        rock: { ...this.table.rock },
        paper: { ...this.table.paper },
        scissors: { ...this.table.scissors },
      },
    };
  }
  setState(state: Extract<SerializedExpertState, { type: "BaitResponseExpert" }>) {
    if (!state) return;
    if (Number.isFinite(state.alpha)) {
      this.alpha = Math.max(0, state.alpha);
    }
    if (state.table) {
      (Object.keys(this.table) as (keyof typeof this.table)[]).forEach(key => {
        const source = (state.table as any)[key];
        if (source && typeof source === "object") {
          this.table[key] = {
            rock: Number.isFinite(source.rock) ? Number(source.rock) : 0,
            paper: Number.isFinite(source.paper) ? Number(source.paper) : 0,
            scissors: Number.isFinite(source.scissors) ? Number(source.scissors) : 0,
          };
        }
      });
    }
  }
}

// Hedge (multiplicative weights) mixer
class HedgeMixer{
  w: number[];
  experts: Expert[];
  eta: number;
  labels: string[];
  private lastPreds: Dist[] = [];
  private lastMix: Dist = { ...UNIFORM };
  constructor(experts: Expert[], labels: string[], eta=1.6){
    this.experts = experts;
    this.labels = labels;
    this.eta = eta;
    this.w = experts.map(()=>1);
  }
  predict(ctx: Ctx): Dist{
    this.lastPreds = this.experts.map(e=> e.predict(ctx));
    const W = this.w.reduce((a,b)=>a+b,0) || 1;
    const mix: Dist = { rock:0, paper:0, scissors:0 };
    this.lastPreds.forEach((p,i)=>{
      (Object.keys(mix) as Move[]).forEach(m=>{ mix[m] += (this.w[i]/W) * p[m]; });
    });
    this.lastMix = normalize(mix);
    return this.lastMix;
  }
  update(ctx: Ctx, actual: Move){
    const preds = this.lastPreds.length ? this.lastPreds : this.experts.map(e=> e.predict(ctx));
    const losses = preds.map(p=> 1 - Math.max(1e-6, p[actual] || 0));
    this.w = this.w.map((w,i)=> w * Math.exp(-this.eta * losses[i]));
    this.experts.forEach(e=> e.update(ctx, actual));
  }
  snapshot(){
    const W = this.w.reduce((a,b)=>a+b,0) || 1;
    return {
      dist: { ...this.lastMix },
      experts: this.experts.map((_,i)=>({
        name: i < this.labels.length ? this.labels[i] : ('Expert ' + (i+1)),
        weight: this.w[i]/W,
        dist: this.lastPreds[i] ?? { ...UNIFORM }
      }))
    };
  }
  getWeights(){
    return [...this.w];
  }
  setWeights(weights: number[]){
    if (!Array.isArray(weights)) return;
    this.w = this.experts.map((_, index) => {
      const value = weights[index];
      if (Number.isFinite(value) && value > 0) {
        return Number(value);
      }
      return 1;
    });
  }
}

function createDefaultExperts(): Expert[] {
  return [
    new FrequencyExpert(20, 1),
    new RecencyExpert(0.85, 1),
    new MarkovExpert(1, 1),
    new MarkovExpert(2, 1),
    new OutcomeExpert(1),
    new WinStayLoseShiftExpert(1),
    new PeriodicExpert(5, 2, 18, 0.65),
    new BaitResponseExpert(1),
  ];
}

function serializeExpertInstance(expert: Expert): SerializedExpertState {
  if (expert instanceof FrequencyExpert) return expert.getState();
  if (expert instanceof RecencyExpert) return expert.getState();
  if (expert instanceof MarkovExpert) return expert.getState();
  if (expert instanceof OutcomeExpert) return expert.getState();
  if (expert instanceof WinStayLoseShiftExpert) return expert.getState();
  if (expert instanceof PeriodicExpert) return expert.getState();
  if (expert instanceof BaitResponseExpert) return expert.getState();
  return { type: "FrequencyExpert", window: 20, alpha: 1 };
}

function instantiateExpertFromState(state: SerializedExpertState | null | undefined): Expert {
  if (!state) {
    return createDefaultExperts()[0];
  }
  switch (state.type) {
    case "FrequencyExpert": {
      const expert = new FrequencyExpert(state.window ?? 20, state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    case "RecencyExpert": {
      const expert = new RecencyExpert(state.gamma ?? 0.85, state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    case "MarkovExpert": {
      const expert = new MarkovExpert(state.order ?? 1, state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    case "OutcomeExpert": {
      const expert = new OutcomeExpert(state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    case "WinStayLoseShiftExpert": {
      const expert = new WinStayLoseShiftExpert(state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    case "PeriodicExpert": {
      const expert = new PeriodicExpert(
        state.maxPeriod ?? 5,
        state.minPeriod ?? 2,
        state.window ?? 18,
        state.confident ?? 0.65,
      );
      expert.setState(state);
      return expert;
    }
    case "BaitResponseExpert": {
      const expert = new BaitResponseExpert(state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    default: {
      const fallback = new FrequencyExpert(20, 1);
      return fallback;
    }
  }
}

function serializeMixerInstance(mixer: HedgeMixer): HedgeMixerSerializedState {
  return {
    eta: mixer.eta,
    weights: mixer.getWeights(),
    experts: mixer.experts.map(serializeExpertInstance),
  };
}

function instantiateMixerFromState(state: HedgeMixerSerializedState | null | undefined): HedgeMixer {
  if (state && Array.isArray(state.experts) && state.experts.length) {
    const experts = state.experts.map(instantiateExpertFromState);
    const mixer = new HedgeMixer(experts, EXPERT_LABELS, Number.isFinite(state.eta) ? Number(state.eta) : 1.6);
    if (Array.isArray(state.weights) && state.weights.length) {
      mixer.setWeights(state.weights);
    }
    return mixer;
  }
  const experts = createDefaultExperts();
  return new HedgeMixer(experts, EXPERT_LABELS, 1.6);
}

function blendDistributions(realtime: Dist, history: Dist, weights: { realtimeWeight: number; historyWeight: number }): Dist {
  const combined: Dist = {
    rock: realtime.rock * weights.realtimeWeight + history.rock * weights.historyWeight,
    paper: realtime.paper * weights.realtimeWeight + history.paper * weights.historyWeight,
    scissors: realtime.scissors * weights.realtimeWeight + history.scissors * weights.historyWeight,
  };
  if (combined.rock === 0 && combined.paper === 0 && combined.scissors === 0) {
    return { ...UNIFORM };
  }
  return normalize(combined);
}

function computeBlendWeights(
  sessionRounds: number,
  persisted: StoredPredictorModelState | null,
): { realtimeWeight: number; historyWeight: number } {
  const hasHistory = Boolean(
    persisted &&
      persisted.roundsSeen > 0 &&
      persisted.state &&
      Array.isArray(persisted.state.experts) &&
      persisted.state.experts.length,
  );
  if (!hasHistory) {
    return { realtimeWeight: 1, historyWeight: 0 };
  }
  const progress = Math.max(0, Math.min(1, sessionRounds / HISTORY_SWITCH_ROUNDS));
  const baseHistory = HISTORY_BASE_WEIGHT;
  const earlyHistory = Math.max(baseHistory, HISTORY_EARLY_WEIGHT);
  let historyWeight = earlyHistory + (baseHistory - earlyHistory) * progress;
  const updatedAt = persisted?.updatedAt ? Date.parse(persisted.updatedAt) : NaN;
  if (Number.isFinite(updatedAt)) {
    const ageMs = Math.max(0, Date.now() - updatedAt);
    const decay = Math.exp(-ageMs / HISTORY_DECAY_MS);
    historyWeight *= Number.isFinite(decay) ? decay : 1;
  }
  historyWeight = Math.max(0, Math.min(0.8, historyWeight));
  const realtimeWeight = Math.max(0, 1 - historyWeight);
  const total = historyWeight + realtimeWeight;
  if (total <= 0) {
    return { realtimeWeight: 1, historyWeight: 0 };
  }
  return { realtimeWeight: realtimeWeight / total, historyWeight: historyWeight / total };
}

type RoundFilterMode = Mode | "all";
type RoundFilterDifficulty = AIMode | "all";
type RoundFilterOutcome = Outcome | "all";

interface PendingDecision {
  policy: DecisionPolicy;
  mixer?: {
    dist: Dist;
    experts: { name: string; weight: number; dist: Dist; source?: "realtime" | "history" }[];
    counter: Move;
    confidence: number;
    realtimeDist: Dist;
    historyDist: Dist;
    realtimeWeight: number;
    historyWeight: number;
    realtimeExperts: { name: string; weight: number; dist: Dist }[];
    historyExperts: { name: string; weight: number; dist: Dist }[];
    realtimeRounds: number;
    historyRounds: number;
    conflict?: { realtime: Move | null; history: Move | null } | null;
  };
  heuristic?: HeuristicTrace;
  confidence: number;
}

function prettyMove(move: Move){
  return move.charAt(0).toUpperCase() + move.slice(1);
}

function moveLabelNode(move: Move, options?: { className?: string; iconSize?: number | string; textClassName?: string }){
  return (
    <MoveLabel
      move={move}
      className={options?.className}
      iconSize={options?.iconSize ?? 18}
      textClassName={options?.textClassName}
    />
  );
}

function makeReasonChips(reason?: string | null): string[] {
  if (!reason) return [];
  const sanitized = reason
    .replace(/\u2022|•|–|—/g, "|")
    .replace(/[,;]+/g, "|");
  const segments = sanitized
    .split("|")
    .map(segment => segment.trim())
    .filter(Boolean);
  const cleaned = (segments.length ? segments : [reason])
    .map(segment => segment.split(/\s+/).slice(0, 4).join(" "))
    .filter(Boolean);
  return cleaned.slice(0, 2);
}

const CONFIDENCE_BADGE_INFO: Record<
  "low" | "medium" | "high",
  { label: string; face: string; className: string }
> = {
  low: { label: "Low", face: "😮‍💨", className: "bg-rose-500 text-white" },
  medium: { label: "Med", face: "😐", className: "bg-[#A65613] text-white" },
  high: { label: "High", face: "🙂", className: "bg-emerald-500 text-white" },
};

const OUTCOME_CARD_STYLES: Record<
  Outcome,
  { border: string; badge: string; label: string }
> = {
  win: { border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", label: "Win" },
  lose: { border: "border-rose-200", badge: "bg-rose-100 text-rose-700", label: "Loss" },
  tie: { border: "border-amber-200", badge: "bg-amber-100 text-amber-700", label: "Tie" },
};

function confidenceBucket(value: number): "low" | "medium" | "high" {
  if (value >= 0.7) return "high";
  if (value >= 0.45) return "medium";
  return "low";
}

function clamp01(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function useMediaQuery(query: string, fallback = false): boolean {
  const getMatch = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return fallback;
    }
    return window.matchMedia(query).matches;
  }, [query, fallback]);

  const [matches, setMatches] = useState<boolean>(() => getMatch());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [getMatch, query]);

  return matches;
}

function expectedPlayerMoveFromAi(aiMove: Move | null | undefined): Move | null {
  if (!aiMove) return null;
  const mapping: Record<Move, Move> = {
    rock: "scissors",
    paper: "rock",
    scissors: "paper",
  };
  return mapping[aiMove];
}

function expertReasonText(name: string, move: Move, percent: number){
  const pretty = prettyMove(move);
  const pct = Math.round(percent * 100);
  switch(name){
    case "FrequencyExpert":
      return "Frequency expert estimated " + pct + "% chance you play " + pretty + ".";
    case "RecencyExpert":
      return "Recency expert weighted " + pct + "% toward " + pretty + " from your latest moves.";
    case "MarkovExpert(k=1)":
      return "Markov order-1 expert projected " + pretty + " (" + pct + "%).";
    case "MarkovExpert(k=2)":
      return "Markov order-2 expert leaned " + pct + "% toward " + pretty + ".";
    case "OutcomeExpert":
      return "Outcome expert saw " + pct + "% likelihood after that result for " + pretty + ".";
    case "WinStayLoseShiftExpert":
      return "Win/Stay-Lose/Switch expert assigned " + pct + "% to " + pretty + ".";
    case "PeriodicExpert":
      return "Periodic expert detected a loop pointing " + pct + "% to " + pretty + ".";
    case "BaitResponseExpert":
      return "Bait response expert predicted " + pretty + " with " + pct + "% weight.";
    default:
      return name + " estimated " + pct + "% on " + pretty + ".";
  }
}

function describeDecision(policy: DecisionPolicy, mixer: MixerTrace | undefined, heuristic: HeuristicTrace | undefined, player: Move, ai: Move){
  const playerPretty = prettyMove(player);
  const aiPretty = prettyMove(ai);
  if (policy === "mixer" && mixer){
    const top = mixer.topExperts[0];
    if (top){
      return expertReasonText(top.name, player, top.pActual ?? 0) + " AI played " + aiPretty + " to counter.";
    }
    return "Mixer blended experts and countered " + playerPretty + " with " + aiPretty + ".";
  }
  if (heuristic){
    const parts: string[] = [];
    if (heuristic.reason) parts.push(heuristic.reason);
    if (heuristic.predicted){
      const pct = heuristic.conf ? Math.round((heuristic.conf || 0) * 100) : null;
      let detail = "Predicted " + prettyMove(heuristic.predicted);
      if (pct !== null) detail += " (" + pct + "%)";
      detail += ".";
      parts.push(detail);
    }
    parts.push("Countered with " + aiPretty + ".");
    return parts.join(' ');
  }
  return "AI played " + aiPretty + " against " + playerPretty + ".";
}

const AI_FAQ_QUESTIONS: HelpQuestion[] = [
  {
    id: "gameplay-how-to-play",
    question: "Gameplay · How do I play?",
    answer: "Pick Rock, Paper, or Scissors. Rock beats Scissors, Scissors beats Paper, and Paper beats Rock.",
  },
  {
    id: "gameplay-best-of",
    question: "Gameplay · What does \"Best of 5/7\" mean?",
    answer: "It is a race to a majority of wins. First to 3 wins takes a best-of-5 match; first to 4 wins takes a best-of-7 match.",
  },
  {
    id: "gameplay-tie",
    question: "Gameplay · What happens on a tie?",
    answer: "Neither side scores. Just play the next round.",
  },
  {
    id: "gameplay-practice-vs-challenge",
    question: "Gameplay · Practice vs. Challenge?",
    answer: "Practice slows the pace, adds hints, and shows \"what-if\" previews. Challenge is faster with fewer hints.",
  },
  {
    id: "gameplay-robot",
    question: "Gameplay · What does the robot do?",
    answer: "It reacts to your patterns and confidence level with animations and emotes. Reaction pop-up toasts stay off here.",
  },
  {
    id: "gameplay-training-complete",
    question: "Gameplay · Why does it say \"Training complete\"?",
    answer: "You have played enough rounds for the AI to learn your basic patterns. It keeps adapting as you continue.",
  },
  {
    id: "hud-settings",
    question: "HUD & Navigation · Where is Settings?",
    answer: "Look for the gear icon in the top-right corner of the header.",
  },
  {
    id: "hud-live-insight-open",
    question: "HUD & Navigation · How do I open Live AI Insight?",
    answer: "Click the Insight button on the match HUD or enable Show Live AI Insight inside Settings.",
  },
  {
    id: "hud-insight-close",
    question: "HUD & Navigation · How do I close the Insight panel?",
    answer: "Click Close, press Esc, tap outside on mobile, or toggle it off from Settings or HUD controls.",
  },
  {
    id: "hud-shift-left",
    question: "HUD & Navigation · Why did the HUD shift left?",
    answer: "When Insight is open the HUD slides over so the two panels never overlap.",
  },
  {
    id: "hud-stats",
    question: "HUD & Navigation · Where are my stats?",
    answer: "Open the header menu and choose Statistics to see your session summaries.",
  },
  {
    id: "hud-leaderboard",
    question: "HUD & Navigation · Where is the leaderboard?",
    answer: "It lives under Header → Leaderboard. The option only appears if your teacher enabled it.",
  },
  {
    id: "hud-difficulty",
    question: "HUD & Navigation · Can I change difficulty?",
    answer: "Yes. Go to Settings and pick an AI difficulty: Fair, Normal, or Ruthless.",
  },
  {
    id: "hud-player-switch",
    question: "HUD & Navigation · How do I switch or create a player?",
    answer: "Settings → Player lets you choose an existing profile or create a new one.",
  },
  {
    id: "hud-export",
    question: "HUD & Navigation · How do I export data?",
    answer: "Use Export CSV from the Statistics screen or inside Settings.",
  },
  {
    id: "insight-confidence",
    question: "Live AI Insight · What is the Confidence gauge?",
    answer: "It shows how sure the AI feels about its next move, on a 0–100% scale.",
  },
  {
    id: "insight-probability-bars",
    question: "Live AI Insight · What are the three probability bars?",
    answer: "They display the AI's estimated chances for Rock, Paper, or Scissors on this round.",
  },
  {
    id: "insight-best-counter",
    question: "Live AI Insight · What does \"Best counter\" mean?",
    answer: "It recommends the move that beats the AI's current prediction. In Practice you can preview how choices play out.",
  },
  {
    id: "insight-reason-chips",
    question: "Live AI Insight · What are Reason chips?",
    answer: "Short explanations such as Frequent Scissors or Recent streak. Select one to view a tiny visual like a streak or n-gram peek.",
  },
  {
    id: "insight-time-to-adapt",
    question: "Live AI Insight · What is Time-to-Adapt?",
    answer: "It tracks how quickly the AI settles after you change patterns.",
  },
  {
    id: "insight-tiny-timeline",
    question: "Live AI Insight · What is the Tiny Timeline?",
    answer: "It previews recent rounds. Hover or tap to see what the AI noticed at each moment.",
  },
  {
    id: "stats-calibration",
    question: "Statistics · What is Calibration (ECE)?",
    answer: "Expected Calibration Error measures how closely confidence matches actual accuracy. Lower is better.",
  },
  {
    id: "stats-brier",
    question: "Statistics · What is the Brier score?",
    answer: "It captures overall probability forecast quality. Smaller values mean better predictions.",
  },
  {
    id: "stats-sharpness",
    question: "Statistics · What is Sharpness?",
    answer: "Sharpness reports how peaked the AI's probabilities are, independent of correctness.",
  },
  {
    id: "stats-high-confidence",
    question: "Statistics · What is High-confidence coverage?",
    answer: "It is the share of rounds where confidence meets a chosen threshold (for example 70%), along with accuracy at that level.",
  },
  {
    id: "stats-demographics",
    question: "Statistics · Why don't I see demographics here?",
    answer: "Statistics focuses on performance. Personal information stays tied to your profile, not the charts.",
  },
  {
    id: "ai-basics-predict",
    question: "AI Basics · How does the AI predict?",
    answer: "It studies your recent sequence of moves using a lightweight Markov or n-gram model plus simple frequency checks.",
  },
  {
    id: "ai-basics-mind-reading",
    question: "AI Basics · Is it reading my mind?",
    answer: "No. It only uses the history from your in-game rounds.",
  },
  {
    id: "ai-basics-change",
    question: "AI Basics · Why does the prediction change?",
    answer: "When you shift patterns the model updates its probabilities and confidence to match the new behavior.",
  },
  {
    id: "ai-basics-beat",
    question: "AI Basics · How can I beat the AI?",
    answer: "Mix up your play, avoid obvious repeats, and watch the Insight panel for hints about its expectations.",
  },
  {
    id: "ai-basics-pattern",
    question: "AI Basics · What counts as a pattern?",
    answer: "Any habit the model can catch, such as always picking Scissors after a tie.",
  },
  {
    id: "ai-basics-33",
    question: "AI Basics · Why is confidence sometimes about 33%?",
    answer: "That means the AI sees no strong signal yet, so it spreads probability evenly across moves.",
  },
  {
    id: "privacy-data-stored",
    question: "Privacy & Data · What data is stored?",
    answer: "Round logs for the current session: your moves, AI probabilities, and outcomes.",
  },
  {
    id: "privacy-export",
    question: "Privacy & Data · Can I download my data?",
    answer: "Yes. Use Export CSV from either Statistics or Settings.",
  },
  {
    id: "privacy-access",
    question: "Privacy & Data · Who can see my data?",
    answer: "Only you and the developers. It is used strictly for learning and analysis.",
  },
  {
    id: "accessibility-keyboard",
    question: "Accessibility · Keyboard & screen readers?",
    answer: "All controls are focusable. The Insight panel opens as a dialog with a focus trap, and Esc closes it. Icons include labels.",
  },
  {
    id: "accessibility-motion",
    question: "Accessibility · Motion sensitivity?",
    answer: "Turn on reduced motion to replace big animations with softer fades.",
  },
  {
    id: "accessibility-color",
    question: "Accessibility · Color-blind support?",
    answer: "We pair colors with icons and text so no information relies on color alone.",
  },
  {
    id: "troubleshooting-insight",
    question: "Troubleshooting · Insight panel covers the HUD.",
    answer: "Close and reopen Insight or resize the window. The HUD will automatically make space.",
  },
  {
    id: "troubleshooting-buttons",
    question: "Troubleshooting · Buttons do not respond.",
    answer: "Check whether a modal is open, press Esc to close it, and reload the page if needed.",
  },
  {
    id: "troubleshooting-stats",
    question: "Troubleshooting · Stats look empty.",
    answer: "Play a few more rounds. Many metrics appear only after enough data is collected.",
  },
  {
    id: "troubleshooting-csv",
    question: "Troubleshooting · CSV is blank.",
    answer: "Finish at least one round and make sure your browser can download files.",
  },
  {
    id: "glossary-confidence",
    question: "Quick Glossary · Confidence",
    answer: "How sure the AI feels about a prediction.",
  },
  {
    id: "glossary-calibration",
    question: "Quick Glossary · Calibration",
    answer: "The match between confidence and real accuracy.",
  },
  {
    id: "glossary-brier",
    question: "Quick Glossary · Brier score",
    answer: "A measure of forecast error. Lower numbers are better.",
  },
  {
    id: "glossary-sharpness",
    question: "Quick Glossary · Sharpness",
    answer: "How concentrated the probability spread is.",
  },
  {
    id: "glossary-markov",
    question: "Quick Glossary · Markov/n-gram",
    answer: "A model that predicts the next move based on the recent sequence of moves.",
  },
  {
    id: "glossary-coverage",
    question: "Quick Glossary · Coverage@tau",
    answer: "The percent of rounds where confidence clears a chosen threshold tau.",
  },
];

function fireAnalyticsEvent(name: string, payload: Record<string, unknown> = {}) {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(name, { detail: payload }));
  }
  if (DEV_MODE_ENABLED) {
    // eslint-disable-next-line no-console
    console.debug(`[analytics] ${name}`, payload);
  }
}

function computeSwitchRate(moves: Move[]): number{
  if (moves.length <= 1) return 0;
  let switches = 0;
  for (let i=1;i<moves.length;i++) if (moves[i] !== moves[i-1]) switches++;
  return switches / moves.length;
}

function outcomeBadgeClass(outcome: Outcome){
  if (outcome === "win") return "bg-green-100 text-green-700";
  if (outcome === "lose") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function makeLocalId(prefix: string){
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,6);
}

const EXPERT_LABELS = [
  "FrequencyExpert",
  "RecencyExpert",
  "MarkovExpert(k=1)",
  "MarkovExpert(k=2)",
  "OutcomeExpert",
  "WinStayLoseShiftExpert",
  "PeriodicExpert",
  "BaitResponseExpert",
];

// --- Light heuristics (kept for fallback) -------------------------------
function markovNext(moves: Move[]): { move: Move | null; conf: number } {
  if (moves.length < 2) return { move: null, conf: 0 };
  const trans: Record<Move, Record<Move, number>> = {
    rock: { rock: 0, paper: 0, scissors: 0 },
    paper: { rock: 0, paper: 0, scissors: 0 },
    scissors: { rock: 0, paper: 0, scissors: 0 },
  };
  for (let i = 1; i < moves.length; i++) { const prev = moves[i - 1]; const next = moves[i]; trans[prev][next]++; }
  const last = moves[moves.length - 1]; const row = trans[last]; const sum = row.rock + row.paper + row.scissors; if (sum === 0) return { move: null, conf: 0 };
  let best: Move = "rock"; let max = -1; (Object.keys(row) as Move[]).forEach(k => { if (row[k] > max) { best = k; max = row[k]; } });
  return { move: best, conf: max / sum };
}
function detectPatternNext(moves: Move[]): { move: Move | null; reason?: string } {
  const n = moves.length;
  if (n >= 3 && moves[n-1] === moves[n-2] && moves[n-2] === moves[n-3]) {
    return { move: moves[n-1], reason: "Recent triple repeat detected" };
  }
  if (n >= 6) {
    const a = moves.slice(n-6, n-3).join("-");
    const b = moves.slice(n-3).join("-");
    if (a === b) return { move: moves[n-3], reason: "Repeating three-beat pattern spotted" };
  }
  if (n >= 4) {
    const a = moves[n-4], b = moves[n-3], c = moves[n-2], d = moves[n-1];
    if (a === c && b === d && a !== b) return { move: a, reason: "Alternating two-step pattern detected" };
  }
  return { move: null };
}
function predictNext(moves: Move[], rng: () => number): { move: Move | null; conf: number; reason?: string } {
  const mk = markovNext(moves);
  const patRes = detectPatternNext(moves);
  const pat = patRes.move;
  if (mk.move && pat && mk.move === pat) {
    return { move: mk.move, conf: Math.max(0.8, mk.conf), reason: "Markov and pattern consensus" };
  }
  if (pat && (!mk.move || mk.conf < 0.6)) {
    return { move: pat, conf: 0.75, reason: patRes.reason || "Pattern repetition heuristic" };
  }
  if (mk.move && pat && mk.conf >= 0.6) {
    const choice = rng() < 0.6 ? pat : mk.move;
    const baseReason = choice === pat ? (patRes.reason || "Pattern repetition heuristic") : "Markov transition preference";
    return { move: choice, conf: 0.7, reason: baseReason };
  }
  if (mk.move) {
    return { move: mk.move, conf: mk.conf * 0.65, reason: "Markov transition heuristic" };
  }
  if (pat) {
    return { move: pat, conf: 0.6, reason: patRes.reason || "Pattern repetition heuristic" };
  }
  return { move: null, conf: 0, reason: "Insufficient signal" };
}

// Simple Audio Manager using WebAudio
class AudioManager {
  ctx: AudioContext | null = null; masterGain: GainNode | null = null; musicGain: GainNode | null = null; sfxGain: GainNode | null = null; enabled = true;
  ensureCtx() { if (!this.ctx) { this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); this.masterGain = this.ctx.createGain(); this.musicGain = this.ctx.createGain(); this.sfxGain = this.ctx.createGain(); this.musicGain.gain.value = 0.2; this.sfxGain.gain.value = 0.5; this.masterGain.gain.value = 1.0; this.musicGain.connect(this.masterGain!); this.sfxGain.connect(this.masterGain!); this.masterGain!.connect(this.ctx.destination); } }
  setEnabled(on: boolean){ this.enabled = on; if (this.masterGain) this.masterGain.gain.value = on ? 1 : 0; }
  setSfxVol(v:number){ if (this.sfxGain) this.sfxGain.gain.value = v; }
  crossFadeMusic(_duration=0.3){ if (!this.musicGain) return; /* hook music here */ }
  tone(freq=440, dur=0.08, type: OscillatorType = "sine", gain=0.5, out?: GainNode){ if (!this.enabled) return; this.ensureCtx(); if (!this.ctx || !this.sfxGain) return; const osc = this.ctx.createOscillator(); const g = this.ctx.createGain(); osc.type = type; osc.frequency.value = freq; g.gain.value = gain; const dest = out || this.sfxGain; osc.connect(g); g.connect(dest); const t0 = this.ctx.currentTime; osc.start(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); osc.stop(t0 + dur + 0.02); }
  tick(){ this.tone(880, 0.045, "square", 0.2); } cardSelect(){ this.tone(1600, 0.06, "square", 0.25); }
  whooshShort(){ this.noise(0.09, 0.25); } pop(){ this.tone(2200, 0.06, "square", 0.2); }
  whoosh(){ this.noise(0.15, 0.2); } snare(){ this.noise(0.06, 0.35); } thud(){ this.tone(140, 0.08, "sine", 0.4); }
  win(){ this.tone(880, 0.12, "triangle", 0.35); this.tone(1320, 0.18, "triangle", 0.3); }
  lose(){ this.tone(330, 0.14, "sawtooth", 0.3); } tie(){ this.tone(600, 0.12, "triangle", 0.32); }
  noise(dur=0.08, gain=0.3){ if (!this.enabled) return; this.ensureCtx(); if (!this.ctx || !this.sfxGain) return; const bufferSize = this.ctx.sampleRate * dur; const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = (Math.random()*2-1) * 0.6; const noise = this.ctx.createBufferSource(); const g = this.ctx.createGain(); g.gain.value = gain; noise.buffer = buffer; noise.connect(g); g.connect(this.sfxGain); noise.start(); }
}
const audio = new AudioManager();

// Confetti particles (CSS transforms only)
function Confetti({count=18}:{count?:number}){
  const parts = Array.from({length: count});
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {parts.map((_,i)=>{
        const left = Math.random()*100; const rot = Math.random()*360; const delay = Math.random()*0.2; const dur = 1 + Math.random()*0.8;
        return (
          <motion.div key={i} initial={{ y: -20, opacity: 0, rotate: rot }} animate={{ y: "120%", opacity: [0,1,1,0] }} transition={{ duration: dur, delay, ease: [0.22,0.61,0.36,1] }} className="absolute top-0" style={{ left: left+"%" }}>
            <div className="w-2 h-3 rounded-sm" style={{ background: `hsl(${Math.floor(Math.random()*360)} 90% 55%)`}}/>
          </motion.div>
        )
      })}
    </div>
  )
}

// Accessibility live region
function LiveRegion({message}:{message:string}){ return <div aria-live="polite" className="sr-only" role="status">{message}</div> }

// Mode card component
function ModeCard({
  mode,
  onSelect,
  isDimmed,
  disabled = false,
  disabledReason,
  onDisabledClick,
  onDisabledHover,
}: {
  mode: Mode;
  onSelect: (m: Mode) => void;
  isDimmed: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
  onDisabledClick?: (mode: Mode) => void;
  onDisabledHover?: (mode: Mode) => void;
}) {
  const label = mode.charAt(0).toUpperCase()+mode.slice(1);
  const isUnavailable = disabled || Boolean(disabledReason);
  const descriptionId = disabledReason ? `${mode}-mode-disabled-reason` : undefined;
  return (
    <motion.button
      className={`mode-card ${mode} ${isDimmed ? "dim" : ""} ${
        isUnavailable ? "opacity-60 cursor-not-allowed" : ""
      } bg-white/80 rounded-2xl shadow relative overflow-hidden px-5 py-6 text-left`}
      data-dev-label={`mode.${mode}.card`}
      layoutId={`card-${mode}`}
      onClick={event => {
        if (disabled) return;
        if (disabledReason) {
          event.preventDefault();
          event.stopPropagation();
          onDisabledClick?.(mode);
          return;
        }
        onSelect(mode);
      }}
      disabled={disabled}
      onMouseEnter={() => {
        if (disabledReason) {
          onDisabledHover?.(mode);
        }
      }}
      onFocus={() => {
        if (disabledReason) {
          onDisabledHover?.(mode);
        }
      }}
      whileTap={{ scale: isUnavailable ? 1 : 0.98 }}
      whileHover={{ y: isUnavailable ? 0 : -4 }}
      aria-label={`${label} mode`}
      aria-disabled={isUnavailable ? true : undefined}
      aria-describedby={descriptionId}
      title={disabledReason ?? undefined}
    >
      <div className="text-lg font-bold text-slate-800">{label}</div>
      <div className="text-sm text-slate-600 mt-1">
        {mode === "challenge" && "Timed rounds, high stakes—can you outsmart the AI?"}
        {mode === "practice" && "No score; experiment and learn."}
      </div>
      <span className="ink-pop" />
      {disabledReason && (
        <span id={descriptionId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </motion.button>
  );
}

type OnOffToggleProps = {
  value: boolean;
  onChange: (next: boolean, event?: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
  className?: string;
};

function OnOffToggle({
  value,
  onChange,
  disabled = false,
  onLabel,
  offLabel,
  ariaLabel,
  ariaLabelledby,
  ariaDescribedby,
  className,
}: OnOffToggleProps) {
  const baseButton =
    "px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500";
  return (
    <div
      className={`inline-flex items-center overflow-hidden rounded-full border border-slate-300 bg-white shadow-sm ${
        disabled ? "opacity-60" : ""
      } ${className ?? ""}`}
      aria-disabled={disabled || undefined}
    >
      <button
        type="button"
        className={`${baseButton} ${value ? "bg-sky-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        aria-pressed={value}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        onClick={event => {
          if (!disabled) {
            onChange(true, event);
          }
        }}
        disabled={disabled}
        data-dev-label={onLabel}
      >
        On
      </button>
      <button
        type="button"
        className={`${baseButton} ${!value ? "bg-slate-200 text-slate-700 shadow-inner" : "text-slate-500 hover:bg-slate-100"}`}
        aria-pressed={!value}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        onClick={event => {
          if (!disabled) {
            onChange(false, event);
          }
        }}
        disabled={disabled}
        data-dev-label={offLabel}
      >
        Off
      </button>
    </div>
  );
}

// Main component
function RPSDoodleAppInner(){
  const {
    rounds: profileRounds,
    matches: profileMatches,
    logRound,
    logMatch,
    exportRoundsCsv,
    profiles: statsProfiles,
    currentProfile,
    createProfile: createStatsProfile,
    selectProfile,
    updateProfile: updateStatsProfile,
    forkProfileVersion,
    getModelStateForProfile,
    saveModelStateForProfile,
    clearModelStateForProfile,
    adminMatches,
    adminRounds,
  } = useStats();
  const { players, currentPlayer, hasConsented, createPlayer, updatePlayer, setCurrentPlayer } = usePlayers();
  const initialWelcomePreferenceRef = useRef<WelcomePreference | null>(null);
  if (initialWelcomePreferenceRef.current === null) {
    initialWelcomePreferenceRef.current = getInitialWelcomePreference();
  }
  const initialWelcomePreference = initialWelcomePreferenceRef.current;
  const initialSceneRef = useRef<Scene | null>(null);
  if (initialSceneRef.current === null) {
    initialSceneRef.current = getInitialScene();
  }
  const initialScene = initialSceneRef.current;
  const [welcomeSeen, setWelcomeSeen] = useState<boolean>(initialWelcomePreference === "skip");
  const [welcomeActive, setWelcomeActive] = useState(initialScene === "WELCOME");
  const [welcomeStage, setWelcomeStage] = useState<"intro" | "create" | "restore">("intro");
  const [welcomeOrigin, setWelcomeOrigin] = useState<"launch" | "settings" | null>(null);
  const [welcomeSlide, setWelcomeSlide] = useState(0);
  const [statsOpen, setStatsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeButtonRef = useRef<HTMLButtonElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const [fallbackThemePreference, setFallbackThemePreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    try {
      const stored = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
      return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
    } catch {
      return "system";
    }
  });
  const [fallbackThemeColors, setFallbackThemeColors] = useState<ThemeColorPreferences>(() => {
    const defaults = cloneProfilePreferences(DEFAULT_PROFILE_PREFERENCES).themeColors;
    if (typeof window === "undefined") return defaults;
    try {
      const stored = window.localStorage.getItem(THEME_COLOR_STORAGE_KEY);
      const parsed = parseStoredThemeColors(stored);
      return parsed ?? defaults;
    } catch {
      return defaults;
    }
  });
  const systemPrefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const themePreference: ThemePreference = currentProfile?.preferences.theme ?? fallbackThemePreference;
  const resolvedTheme = themePreference === "system" ? (systemPrefersDark ? "dark" : "light") : themePreference;
  const resolvedThemeMode: ThemeMode = resolvedTheme === "dark" ? "dark" : "light";
  const isDarkTheme = resolvedThemeMode === "dark";
  const themeOptions = useMemo(
    () => [
      {
        value: "dark" as ThemePreference,
        label: "Dark",
        icon: "⏾",
        description: "Dim surfaces for low light spaces.",
      },
      {
        value: "light" as ThemePreference,
        label: "Light",
        icon: "☼",
        description: "Bright contrast for daylight hours.",
      },
      {
        value: "system" as ThemePreference,
        label: `System (${systemPrefersDark ? "Dark" : "Light"} now)`,
        icon: "☾☼",
        description: "Follow your device setting.",
      },
    ],
    [systemPrefersDark],
  );
  const headerThemeIcon = themePreference === "system" ? "☾☼" : themePreference === "dark" ? "⏾" : "☼";
  const headerThemeLabel =
    themePreference === "system"
      ? `Theme: System (${systemPrefersDark ? "Dark" : "Light"} now)`
      : themePreference === "dark"
        ? "Theme: Dark"
        : "Theme: Light";
  const resolvedThemeLabel =
    themePreference === "system"
      ? systemPrefersDark
        ? "Dark"
        : "Light"
      : themePreference === "dark"
        ? "Dark"
        : "Light";
  const profileThemeColors = currentProfile?.preferences.themeColors;
  const mergedThemeColors = useMemo(() => {
    const withFallback = mergeThemeColorPreferences(
      DEFAULT_THEME_COLOR_PREFERENCES,
      fallbackThemeColors,
    );
    return profileThemeColors
      ? mergeThemeColorPreferences(withFallback, profileThemeColors)
      : withFallback;
  }, [fallbackThemeColors, profileThemeColors]);
  const activeThemeColors = mergedThemeColors[resolvedThemeMode];
  const themeVariables = useMemo(
    () => deriveThemeCssVariables(resolvedThemeMode, activeThemeColors),
    [resolvedThemeMode, activeThemeColors.accent, activeThemeColors.background],
  );
  const backgroundGradientStyle = useMemo(
    () => ({
      backgroundImage: `linear-gradient(180deg, ${themeVariables["--app-gradient-start"]} 0%, ${themeVariables["--app-gradient-middle"]} 50%, ${themeVariables["--app-gradient-end"]} 100%)`,
    }),
    [themeVariables],
  );
  const orbStyles = useMemo(
    () => ({
      primary: {
        backgroundColor: themeVariables["--app-orb-primary"],
        borderColor: themeVariables["--app-border-strong"],
        borderWidth: 1,
        borderStyle: "solid" as const,
      },
      secondary: {
        backgroundColor: themeVariables["--app-orb-secondary"],
        borderColor: themeVariables["--app-border"],
        borderWidth: 1,
        borderStyle: "solid" as const,
      },
      tertiary: {
        backgroundColor: themeVariables["--app-orb-tertiary"],
        borderColor: themeVariables["--app-border"],
        borderWidth: 1,
        borderStyle: "solid" as const,
      },
    }),
    [themeVariables],
  );
  const orbOpacity = useMemo(() => {
    const raw = themeVariables["--app-orb-opacity"];
    const parsed = raw ? parseFloat(raw) : null;
    if (parsed !== null && !Number.isNaN(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
    return isDarkTheme ? 0.3 : 0.55;
  }, [isDarkTheme, themeVariables]);
  const [themeColorEditingMode, setThemeColorEditingMode] = useState<ThemeMode>(resolvedThemeMode);
  useEffect(() => {
    setThemeColorEditingMode(resolvedThemeMode);
  }, [resolvedThemeMode]);
  const themeColorEditingColors = mergedThemeColors[themeColorEditingMode];
  const isEditingModeDefault = themeModeColorsEqual(
    mergedThemeColors[themeColorEditingMode],
    DEFAULT_THEME_COLOR_PREFERENCES[themeColorEditingMode],
  );
  const editingModeLabel = themeColorEditingMode === "dark" ? "Dark" : "Light";
  const [statsTab, setStatsTab] = useState<"overview" | "rounds" | "insights">("overview");
  const [roundsViewMode, setRoundsViewMode] = useState<"card" | "table">(() => {
    if (typeof window === "undefined") return "card";
    const stored = window.sessionStorage.getItem("rps_rounds_view_v1");
    return stored === "table" ? "table" : "card";
  });
  const [habitDrawer, setHabitDrawer] = useState<
    "repeat" | "switch" | "transition" | "pattern" | null
  >(null);
  const statsModalRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const toastReaderCloseRef = useRef<HTMLButtonElement | null>(null);
  const wasSettingsOpenRef = useRef(false);
  const [roundPage, setRoundPage] = useState(0);
  const decisionTraceRef = useRef<PendingDecision | null>(null);
  const aiStreakRef = useRef(0);
  const youStreakRef = useRef(0);
  const matchStartRef = useRef<string>(new Date().toISOString());
  const currentMatchIdRef = useRef<string>(makeLocalId("match"));
  const roundStartRef = useRef<number | null>(null);
  const lastDecisionMsRef = useRef<number | null>(null);
  const currentMatchRoundsRef = useRef<RoundLog[]>([]);
  const [lastMoves, setLastMoves] = useState<Move[]>([]);
  const historyMixerRef = useRef<HedgeMixer | null>(null);
  const sessionMixerRef = useRef<HedgeMixer | null>(null);
  const historyDisplayMixerRef = useRef<HedgeMixer | null>(null);
  const persistedModelRef = useRef<StoredPredictorModelState | null>(null);
  const roundsSeenRef = useRef<number>(0);
  const modelPersistTimeoutRef = useRef<number | null>(null);
  const modelPersistPendingRef = useRef(false);
  const [trainingActive, setTrainingActive] = useState<boolean>(false);
  const [forceTrainingPrompt, setForceTrainingPrompt] = useState(false);
  const prevTrainingActiveRef = useRef(trainingActive);
  const [roundFilters, setRoundFilters] = useState<{ mode: RoundFilterMode; difficulty: RoundFilterDifficulty; outcome: RoundFilterOutcome; from: string; to: string }>({ mode: "all", difficulty: "all", outcome: "all", from: "", to: "" });
  useEffect(() => {
    setRoundPage(0);
  }, [roundFilters, profileRounds, roundsViewMode]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("rps_rounds_view_v1", roundsViewMode);
    }
  }, [roundsViewMode]);
  useEffect(() => {
    const profileTheme = currentProfile?.preferences.theme;
    if (!profileTheme) return;
    setFallbackThemePreference(prev => (prev === profileTheme ? prev : profileTheme));
  }, [currentProfile?.preferences.theme]);
  useEffect(() => {
    const profileColors = currentProfile?.preferences.themeColors;
    if (!profileColors) return;
    const cloned = cloneProfilePreferences(currentProfile.preferences).themeColors;
    setFallbackThemeColors(prev => (themeColorPreferencesEqual(prev, cloned) ? prev : cloned));
  }, [currentProfile?.preferences, currentProfile?.preferences.themeColors]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themePreference);
    } catch {
      /* noop */
    }
  }, [themePreference]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THEME_COLOR_STORAGE_KEY, JSON.stringify(fallbackThemeColors));
    } catch {
      /* noop */
    }
  }, [fallbackThemeColors]);
  function resetSessionMixer() {
    sessionMixerRef.current = instantiateMixerFromState(null);
  }

  function loadPersistedModel(state: StoredPredictorModelState | null) {
    persistedModelRef.current = state;
    historyMixerRef.current = instantiateMixerFromState(state?.state);
    historyDisplayMixerRef.current = state ? instantiateMixerFromState(state.state) : null;
    roundsSeenRef.current = state?.roundsSeen ?? 0;
  }

  function ensureHistoryMixer(): HedgeMixer {
    if (!historyMixerRef.current) {
      historyMixerRef.current = instantiateMixerFromState(persistedModelRef.current?.state);
    }
    return historyMixerRef.current;
  }

  function ensureSessionMixer(): HedgeMixer {
    if (!sessionMixerRef.current) {
      resetSessionMixer();
    }
    return sessionMixerRef.current!;
  }

  function ensureHistoryDisplayMixer(): HedgeMixer | null {
    if (!persistedModelRef.current) {
      return null;
    }
    if (!historyDisplayMixerRef.current) {
      historyDisplayMixerRef.current = instantiateMixerFromState(persistedModelRef.current.state);
    }
    return historyDisplayMixerRef.current;
  }

  const buildPersistedModelSnapshot = useCallback((): StoredPredictorModelState | null => {
    if (!currentProfile?.id) return null;
    if (!historyMixerRef.current) return null;
    return {
      profileId: currentProfile.id,
      modelVersion: MODEL_STATE_VERSION,
      updatedAt: new Date().toISOString(),
      roundsSeen: roundsSeenRef.current,
      state: serializeMixerInstance(historyMixerRef.current),
    };
  }, [currentProfile?.id]);

  const persistModelStateNow = useCallback(() => {
    if (!currentProfile?.id) return;
    const snapshot = buildPersistedModelSnapshot();
    if (!snapshot) return;
    saveModelStateForProfile(currentProfile.id, snapshot);
    persistedModelRef.current = snapshot;
    modelPersistPendingRef.current = false;
  }, [buildPersistedModelSnapshot, currentProfile?.id, saveModelStateForProfile]);

  const scheduleModelPersist = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!currentProfile?.id) return;
    if (modelPersistTimeoutRef.current !== null) {
      window.clearTimeout(modelPersistTimeoutRef.current);
    }
    modelPersistPendingRef.current = true;
    modelPersistTimeoutRef.current = window.setTimeout(() => {
      modelPersistTimeoutRef.current = null;
      persistModelStateNow();
    }, 250);
  }, [currentProfile?.id, persistModelStateNow]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const flush = () => {
      if (modelPersistTimeoutRef.current !== null) {
        window.clearTimeout(modelPersistTimeoutRef.current);
        modelPersistTimeoutRef.current = null;
      }
      if (modelPersistPendingRef.current) {
        persistModelStateNow();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    const handleBeforeUnload = () => {
      flush();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flush();
    };
  }, [persistModelStateNow]);

  useEffect(() => {
    if (typeof window !== "undefined" && modelPersistTimeoutRef.current !== null) {
      window.clearTimeout(modelPersistTimeoutRef.current);
      modelPersistTimeoutRef.current = null;
    }
    modelPersistPendingRef.current = false;
    if (!currentProfile?.id) {
      loadPersistedModel(null);
      resetSessionMixer();
      return;
    }
    const stored = getModelStateForProfile(currentProfile.id);
    loadPersistedModel(stored ?? null);
    resetSessionMixer();
  }, [currentProfile?.id, getModelStateForProfile]);

  useEffect(() => {
    const previous = prevTrainingActiveRef.current;
    if (!previous && trainingActive) {
      if (typeof window !== "undefined" && modelPersistTimeoutRef.current !== null) {
        window.clearTimeout(modelPersistTimeoutRef.current);
        modelPersistTimeoutRef.current = null;
      }
      modelPersistPendingRef.current = false;
      loadPersistedModel(null);
      resetSessionMixer();
    } else if (previous && !trainingActive) {
      if (modelPersistPendingRef.current) {
        persistModelStateNow();
      }
      if (currentProfile?.id) {
        const stored = getModelStateForProfile(currentProfile.id) ?? persistedModelRef.current;
        loadPersistedModel(stored ?? null);
      } else {
        loadPersistedModel(null);
      }
      resetSessionMixer();
    }
    prevTrainingActiveRef.current = trainingActive;
  }, [trainingActive, currentProfile?.id, getModelStateForProfile, persistModelStateNow]);

  const rounds = useMemo(() => profileRounds, [profileRounds]);
  const matches = useMemo(() => profileMatches, [profileMatches]);
  const leaderboardPlayersById = useMemo(() => {
    const map = new Map<string, LeaderboardPlayerInfo>();
    players.forEach(player => {
      map.set(player.id, {
        name: player.playerName,
        grade: player.grade,
      });
    });
    return map;
  }, [players]);
  const leaderboardRoundsByMatch = useMemo(() => groupRoundsByMatch(adminRounds), [adminRounds]);
  const { entries: leaderboardEntries } = useMemo(
    () => collectLeaderboardEntries({ matches: adminMatches, roundsByMatchId: leaderboardRoundsByMatch, playersById: leaderboardPlayersById }),
    [adminMatches, leaderboardRoundsByMatch, leaderboardPlayersById],
  );
  const topLeaderboardEntry = useMemo(
    () => findTopLeaderboardEntryForPlayer(leaderboardEntries, currentPlayer?.id),
    [leaderboardEntries, currentPlayer?.id],
  );
  const leaderboardHeaderScore = topLeaderboardEntry?.score ?? null;
  const leaderboardHeaderScoreDisplay = useMemo(
    () => (leaderboardHeaderScore ?? 0).toLocaleString(),
    [leaderboardHeaderScore],
  );
  const showLeaderboardHeaderBadge = hasConsented && leaderboardHeaderScore !== null;
  type PlayerModalMode = "hidden" | "create" | "edit";
  const [playerModalMode, setPlayerModalMode] = useState<PlayerModalMode>("hidden");
  const [playerModalOrigin, setPlayerModalOrigin] = useState<"welcome" | "settings" | null>(null);
  const isPlayerModalOpen = playerModalMode !== "hidden";
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreSelectedPlayerId, setRestoreSelectedPlayerId] = useState<string | null>(null);
  const [scene, setScene] = useState<Scene>(initialScene);
  const [bootNext, setBootNext] = useState<"WELCOME" | "AUTO">(
    initialScene === "BOOT" ? (initialWelcomePreference === "show" ? "WELCOME" : "AUTO") : "AUTO"
  );
  const [bootProgress, setBootProgress] = useState(0);
  const [bootReady, setBootReady] = useState(false);
  const bootStartRef = useRef<number | null>(null);
  const bootAnimationRef = useRef<number | null>(null);
  const bootAdvancingRef = useRef(false);
  const [pendingWelcomeExit, setPendingWelcomeExit] = useState<
    null | { reason: "setup" | "restore" | "dismiss" }
  >(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (scene === "BOOT") {
        window.sessionStorage.removeItem(SCENE_STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(SCENE_STORAGE_KEY, scene);
      }
    } catch {
      /* noop */
    }
  }, [scene]);
  useEffect(() => {
    if (welcomeActive || restoreDialogOpen) return;
    if (scene === "BOOT") return;
    if (!hasConsented) {
      setPlayerModalOrigin("welcome");
      setPlayerModalMode(currentPlayer ? "edit" : "create");
    }
  }, [
    hasConsented,
    currentPlayer,
    welcomeActive,
    restoreDialogOpen,
    scene,
    setPlayerModalMode,
    setPlayerModalOrigin,
  ]);
  useEffect(() => { if (!hasConsented) setLeaderboardOpen(false); }, [hasConsented]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastReaderOpen, setToastReaderOpen] = useState(false);
  const [toastConfirm, setToastConfirm] = useState<
    { confirmLabel: string; cancelLabel?: string; onConfirm: () => void; context?: "logout" } | null
  >(null);
  const [logoutAutoExport, setLogoutAutoExport] = useState(false);
  const logoutAutoExportRef = useRef(false);
  const [helpToast, setHelpToast] = useState<{ title: string; message: string } | null>(null);
  const [modernToast, setModernToast] = useState<ModernToast | null>(null);
  const modernToastTimeoutRef = useRef<number | null>(null);
  const [helpGuideOpen, setHelpGuideOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const aboutButtonRef = useRef<HTMLButtonElement | null>(null);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const headerOverlayActive =
    statsOpen ||
    leaderboardOpen ||
    settingsOpen ||
    helpCenterOpen ||
    aboutOpen ||
    themeMenuOpen;
  const previousHeaderOverlayActiveRef = useRef(headerOverlayActive);
  const [helpActiveQuestionId, setHelpActiveQuestionId] = useState<string | null>(
    AI_FAQ_QUESTIONS[0]?.id ?? null,
  );
  const [robotHovered, setRobotHovered] = useState(false);
  const [robotFocused, setRobotFocused] = useState(false);
  const [robotResultReaction, setRobotResultReaction] = useState<RobotReaction | null>(null);
  const reduceMotion = useReducedMotion();
  const [live, setLive] = useState<string>("");
  const applyThemePreference = useCallback(
    (value: ThemePreference) => {
      if (value === themePreference) {
        return;
      }
      if (currentProfile) {
        const nextPreferences = cloneProfilePreferences(currentProfile.preferences);
        nextPreferences.theme = value;
        updateStatsProfile(currentProfile.id, { preferences: nextPreferences });
      }
      setFallbackThemePreference(prev => (prev === value ? prev : value));
      const label =
        value === "system"
          ? `System (${systemPrefersDark ? "Dark" : "Light"})`
          : value === "dark"
            ? "Dark"
            : "Light";
      setLive(`Theme set to ${label}.`);
    },
    [currentProfile, themePreference, updateStatsProfile, setLive, systemPrefersDark],
  );
  const handleThemeMenuSelect = useCallback(
    (value: ThemePreference) => {
      if (value !== themePreference) {
        applyThemePreference(value);
      }
      setThemeMenuOpen(false);
      requestAnimationFrame(() => themeButtonRef.current?.focus());
    },
    [applyThemePreference, themePreference],
  );
  const handleSettingsThemeChange = useCallback(
    (value: ThemePreference) => {
      applyThemePreference(value);
    },
    [applyThemePreference],
  );
  const handleThemeColorInputChange = useCallback(
    (mode: ThemeMode, key: keyof ThemeModeColors, value: string) => {
      const currentValue = mergedThemeColors[mode][key];
      const sanitized = normalizeHexColor(value, currentValue);
      if (sanitized === currentValue) {
        return;
      }
      setFallbackThemeColors(prev => {
        const next = mergeThemeColorPreferences(prev, { [mode]: { [key]: sanitized } });
        return themeColorPreferencesEqual(prev, next) ? prev : next;
      });
      if (currentProfile) {
        const nextPreferences = cloneProfilePreferences(currentProfile.preferences);
        nextPreferences.themeColors = mergeThemeColorPreferences(nextPreferences.themeColors, {
          [mode]: { [key]: sanitized },
        });
        updateStatsProfile(currentProfile.id, { preferences: nextPreferences });
      }
      const modeLabel = mode === "dark" ? "Dark" : "Light";
      const colorLabel = key === "accent" ? "accent" : "background";
      setLive(`${modeLabel} ${colorLabel} color updated.`);
    },
    [mergedThemeColors, currentProfile, updateStatsProfile, setLive],
  );
  const handleResetThemeColors = useCallback(
    (mode: ThemeMode) => {
      const defaults = DEFAULT_THEME_COLOR_PREFERENCES[mode];
      if (themeModeColorsEqual(mergedThemeColors[mode], defaults)) {
        return;
      }
      setFallbackThemeColors(prev => {
        const next = mergeThemeColorPreferences(prev, { [mode]: defaults });
        return themeColorPreferencesEqual(prev, next) ? prev : next;
      });
      if (currentProfile) {
        const nextPreferences = cloneProfilePreferences(currentProfile.preferences);
        nextPreferences.themeColors = mergeThemeColorPreferences(nextPreferences.themeColors, {
          [mode]: defaults,
        });
        updateStatsProfile(currentProfile.id, { preferences: nextPreferences });
      }
      const modeLabel = mode === "dark" ? "Dark" : "Light";
      setLive(`${modeLabel} colors reset to default.`);
    },
    [mergedThemeColors, currentProfile, updateStatsProfile, setLive],
  );
  useEffect(() => {
    if (!themeMenuOpen) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (themeMenuRef.current?.contains(target)) return;
      if (themeButtonRef.current?.contains(target)) return;
      setThemeMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setThemeMenuOpen(false);
        requestAnimationFrame(() => themeButtonRef.current?.focus());
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [themeMenuOpen]);
  useEffect(() => {
    if (!themeMenuOpen) return;
    if (statsOpen || leaderboardOpen || settingsOpen || helpCenterOpen || aboutOpen) {
      setThemeMenuOpen(false);
    }
  }, [
    themeMenuOpen,
    statsOpen,
    leaderboardOpen,
    settingsOpen,
    helpCenterOpen,
    aboutOpen,
  ]);
  const [insightPanelOpen, setInsightPanelOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = sessionStorage.getItem(INSIGHT_PANEL_STATE_KEY);
      if (stored === "false") {
        return false;
      }
      return scene === "MATCH";
    } catch {
      return false;
    }
  });
  const [insightPreferred, setInsightPreferred] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem(INSIGHT_PANEL_STATE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const insightPanelRef = useRef<HTMLDivElement | null>(null);
  const insightHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const insightReturnFocusRef = useRef<HTMLElement | null>(null);
  const insightShouldFocusRef = useRef(false);
  const insightDismissedForMatchRef = useRef(false);
  const hudShellRef = useRef<HTMLDivElement | null>(null);
  const hudMainColumnRef = useRef<HTMLDivElement | null>(null);
  const [hudShellWidth, setHudShellWidth] = useState(0);
  const [hudMainColumnHeight, setHudMainColumnHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  const [liveDecisionSnapshot, setLiveDecisionSnapshot] = useState<LiveInsightSnapshot | null>(null);
  const [liveInsightRounds, setLiveInsightRounds] = useState<RoundLog[]>([]);
  const persistInsightPreference = useCallback((next: boolean) => {
    setInsightPreferred(next);
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(INSIGHT_PANEL_STATE_KEY, next ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, []);

  const computeInsightRailWidth = useCallback((vw: number, shellWidth: number) => {
    if (vw >= 1024) {
      return Math.min(520, vw * 0.4);
    }
    if (vw >= 768) {
      return Math.min(440, vw * 0.6);
    }
    if (shellWidth > 0) {
      return shellWidth;
    }
    if (vw > 0) {
      return vw;
    }
    return 360;
  }, []);

  const buildLiveSnapshot = useCallback(
    (trace: PendingDecision, aiMove: Move): LiveInsightSnapshot => {
      if (trace.policy === "mixer" && trace.mixer) {
        const distribution = normalize(trace.mixer.dist);
        const predicted = MOVES.reduce((best, move) => (distribution[move] > distribution[best] ? move : best), MOVES[0]);
        const counter = trace.mixer.counter;
        const realtimeDist = normalize(trace.mixer.realtimeDist);
        const historyDist = normalize(trace.mixer.historyDist);
        const realtimeWeight = clamp01(trace.mixer.realtimeWeight ?? 0);
        const historyWeight = clamp01(trace.mixer.historyWeight ?? 0);
        const realtimeMove = MOVES.reduce((best, move) => (realtimeDist[move] > realtimeDist[best] ? move : best), MOVES[0]);
        const historyMove = trace.mixer.historyExperts.length
          ? MOVES.reduce((best, move) => (historyDist[move] > historyDist[best] ? move : best), MOVES[0])
          : null;
        const topExperts = [...trace.mixer.experts]
          .map(expert => {
            const expertDist = normalize(expert.dist ?? { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 });
            const expertTop = MOVES.reduce(
              (best, move) => (expertDist[move] > expertDist[best] ? move : best),
              MOVES[0],
            );
            return {
              name: expert.name,
              weight: clamp01(expert.weight),
              topMove: expertTop,
              probability: clamp01(expertDist[expertTop]),
            };
          })
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 3);
        const realtimeExperts = trace.mixer.realtimeExperts.map(expert => {
          const expertDist = normalize(expert.dist);
          const expertTop = MOVES.reduce(
            (best, move) => (expertDist[move] > expertDist[best] ? move : best),
            MOVES[0],
          );
          return {
            name: expert.name,
            weight: clamp01(expert.weight),
            topMove: expertTop,
            probability: clamp01(expertDist[expertTop]),
          };
        });
        const historyExperts = trace.mixer.historyExperts.map(expert => {
          const expertDist = normalize(expert.dist);
          const expertTop = MOVES.reduce(
            (best, move) => (expertDist[move] > expertDist[best] ? move : best),
            MOVES[0],
          );
          return {
            name: expert.name,
            weight: clamp01(expert.weight),
            topMove: expertTop,
            probability: clamp01(expertDist[expertTop]),
          };
        });
        let reason: string | null = null;
        if (topExperts[0] && predicted) {
          reason = expertReasonText(topExperts[0].name, predicted, topExperts[0].probability);
        } else if (predicted) {
          reason = `Mixer consensus leans ${prettyMove(predicted)}.`;
        } else {
          reason = "Mixer blending experts for a balanced counter.";
        }
        return {
          policy: trace.policy,
          confidence: trace.confidence,
          predictedMove: predicted,
          counterMove: counter,
          distribution,
          topExperts,
          reason,
          realtimeDistribution: realtimeDist,
          historyDistribution: historyDist,
          realtimeWeight,
          historyWeight,
          realtimeExperts,
          historyExperts,
          realtimeRounds: trace.mixer.realtimeRounds ?? lastMoves.length,
          historyRounds: trace.mixer.historyRounds ?? (persistedModelRef.current?.roundsSeen ?? 0),
          historyUpdatedAt: persistedModelRef.current?.updatedAt ?? null,
          conflict: trace.mixer.conflict ?? null,
          realtimeMove,
          historyMove,
        } satisfies LiveInsightSnapshot;
      }

      const predicted = trace.heuristic?.predicted ?? expectedPlayerMoveFromAi(aiMove);
      const confidence = clamp01(trace.heuristic?.conf ?? trace.confidence ?? 0.34);
      let base: Record<Move, number>;
      if (predicted) {
        const remainder = Math.max(0, 1 - confidence);
        const others = MOVES.filter(move => move !== predicted);
        const share = others.length ? remainder / others.length : 0;
        base = { rock: share, paper: share, scissors: share };
        base[predicted] = confidence;
      } else {
        base = { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 };
      }
      const distribution = normalize(base);
      const reason = trace.heuristic?.reason
        ? trace.heuristic.reason
        : predicted
          ? `Heuristic leans toward ${prettyMove(predicted)} (${Math.round(confidence * 100)}%).`
          : "Low confidence – exploring for new patterns.";
      return {
        policy: trace.policy,
        confidence: trace.confidence,
        predictedMove: predicted,
        counterMove: aiMove,
        distribution,
        topExperts: [],
        reason,
        realtimeDistribution: distribution,
        historyDistribution: { ...UNIFORM },
        realtimeWeight: 1,
        historyWeight: 0,
        realtimeExperts: [],
        historyExperts: [],
        realtimeRounds: lastMoves.length,
        historyRounds: persistedModelRef.current?.roundsSeen ?? 0,
        historyUpdatedAt: persistedModelRef.current?.updatedAt ?? null,
        conflict: null,
        realtimeMove: predicted,
        historyMove: null,
      } satisfies LiveInsightSnapshot;
    },
    [lastMoves.length],
  );

  const openInsightPanel = useCallback(
    (
      trigger?: HTMLElement | null,
      options?: { focus?: boolean; persistPreference?: boolean },
    ) => {
      const shouldFocus = options?.focus ?? true;
      const shouldPersist = options?.persistPreference ?? true;
      if (shouldPersist) {
        persistInsightPreference(true);
      }
      insightDismissedForMatchRef.current = false;
      insightReturnFocusRef.current =
        trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      insightShouldFocusRef.current = shouldFocus;
      setInsightPanelOpen(true);
      setLive("Live AI Insight panel opened inside the HUD.");
    },
    [persistInsightPreference, setLive],
  );

  const closeInsightPanel = useCallback(
    (
      options: {
        restoreFocus?: boolean;
        persistPreference?: boolean;
        announce?: string | null;
        suppressForMatch?: boolean;
      } = {},
    ) => {
      const {
        restoreFocus = true,
        persistPreference = false,
        announce = "Live AI Insight panel closed.",
        suppressForMatch = false,
      } = options;
      if (persistPreference) {
        persistInsightPreference(false);
      }
      if (suppressForMatch) {
        insightDismissedForMatchRef.current = true;
      }
      setInsightPanelOpen(false);
      insightShouldFocusRef.current = false;
      if (announce) {
        setLive(announce);
      }
      if (restoreFocus) {
        const target = insightReturnFocusRef.current;
        if (target) {
          requestAnimationFrame(() => target.focus());
        }
      }
      if (persistPreference) {
        insightReturnFocusRef.current = null;
      }
    },
    [persistInsightPreference, setLive],
  );

  const suspendInsightPanelForHeader = useCallback(() => {
    if (scene !== "MATCH") {
      return;
    }
    if (insightPanelOpen) {
      closeInsightPanel({
        persistPreference: false,
        suppressForMatch: true,
        restoreFocus: false,
        announce: null,
      });
    }
    insightDismissedForMatchRef.current = true;
  }, [closeInsightPanel, insightPanelOpen, scene]);

  const resumeInsightPanelAfterHeader = useCallback(() => {
    if (scene !== "MATCH") {
      return;
    }
    if (!insightPreferred) {
      return;
    }
    if (insightPanelOpen) {
      return;
    }
    if (!insightDismissedForMatchRef.current) {
      return;
    }
    insightDismissedForMatchRef.current = false;
    openInsightPanel(null, { focus: false, persistPreference: false });
  }, [insightPanelOpen, insightPreferred, openInsightPanel, scene]);

  const handleCloseAbout = useCallback(() => {
    setAboutOpen(false);
    setLive("About closed.");
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        aboutButtonRef.current?.focus();
      });
    }
  }, [setLive]);

  const handleOpenAbout = useCallback(() => {
    suspendInsightPanelForHeader();
    setAboutOpen(true);
    setLive("About opened. Press Escape to close.");
  }, [setLive, suspendInsightPanelForHeader]);

  useEffect(() => {
    const wasActive = previousHeaderOverlayActiveRef.current;
    if (headerOverlayActive && !wasActive) {
      suspendInsightPanelForHeader();
    } else if (!headerOverlayActive && wasActive) {
      resumeInsightPanelAfterHeader();
    }
    previousHeaderOverlayActiveRef.current = headerOverlayActive;
  }, [headerOverlayActive, resumeInsightPanelAfterHeader, suspendInsightPanelForHeader]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const node = hudShellRef.current;
    if (!node) {
      setHudShellWidth(0);
      return;
    }
    const updateShellMetrics = () => {
      const rect = node.getBoundingClientRect();
      setHudShellWidth(rect.width);
    };
    updateShellMetrics();
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => updateShellMetrics());
      resizeObserver.observe(node);
      return () => {
        resizeObserver?.disconnect();
      };
    }
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener("resize", updateShellMetrics);
    return () => {
      window.removeEventListener("resize", updateShellMetrics);
    };
  }, [scene]);

  useEffect(() => {
    const node = hudMainColumnRef.current;
    if (!node) {
      setHudMainColumnHeight(0);
      return;
    }
    const updateMainHeight = () => {
      const rect = node.getBoundingClientRect();
      setHudMainColumnHeight(rect.height);
    };
    updateMainHeight();
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => updateMainHeight());
      resizeObserver.observe(node);
      return () => {
        resizeObserver?.disconnect();
      };
    }
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener("resize", updateMainHeight);
    return () => {
      window.removeEventListener("resize", updateMainHeight);
    };
  }, [scene]);

  const insightRailTargetWidth = useMemo(
    () => computeInsightRailWidth(viewportWidth, hudShellWidth),
    [computeInsightRailWidth, hudShellWidth, viewportWidth],
  );

  const fallbackInsightRailWidth = useMemo(() => {
    if (viewportWidth > 0) {
      return Math.max(280, Math.min(520, viewportWidth * 0.9));
    }
    return 360;
  }, [viewportWidth]);

  const insightRailWidthForMotion =
    insightRailTargetWidth > 0 ? insightRailTargetWidth : fallbackInsightRailWidth;

  const insightRailMaxHeight = useMemo(() => {
    if (viewportWidth < 768) {
      return null;
    }
    if (hudMainColumnHeight <= 0) {
      return null;
    }
    return hudMainColumnHeight;
  }, [hudMainColumnHeight, viewportWidth]);

  const insightRailTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : { duration: 0.24, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    [reduceMotion],
  );
  const robotResultTimeoutRef = useRef<number | null>(null);
  const robotRestTimeoutRef = useRef<number | null>(null);
  const robotButtonRef = useRef<HTMLButtonElement | null>(null);
  const welcomeToastShownRef = useRef(false);
  const welcomeFinalToastShownRef = useRef(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDialogAcknowledged, setExportDialogAcknowledged] = useState(false);
  const [exportDialogSource, setExportDialogSource] = useState<"settings" | "stats" | null>(null);
  const exportDialogRef = useRef<HTMLDivElement | null>(null);
  const exportDialogCheckboxRef = useRef<HTMLInputElement | null>(null);
  const exportDialogReturnFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!DEV_MODE_ENABLED) return;
    devInstrumentation.setScope({
      playerId: currentPlayer?.id ?? null,
      playerName: currentPlayer?.playerName ?? null,
      profileId: currentProfile?.id ?? null,
      profileName: currentProfile?.name ?? null,
    });
  }, [currentPlayer?.id, currentPlayer?.playerName, currentProfile?.id, currentProfile?.name]);
  useEffect(() => {
    if (!toastMessage) return;
    if (toastReaderOpen) return;
    if (toastConfirm?.context === "logout") return;
    const id = window.setTimeout(() => setToastMessage(null), 4000);
    return () => window.clearTimeout(id);
  }, [toastMessage, toastReaderOpen, toastConfirm]);
  useEffect(() => {
    if (!modernToast) return;
    if (modernToastTimeoutRef.current !== null) {
      window.clearTimeout(modernToastTimeoutRef.current);
    }
    modernToastTimeoutRef.current = window.setTimeout(() => {
      setModernToast(null);
      modernToastTimeoutRef.current = null;
    }, 4800);
    return () => {
      if (modernToastTimeoutRef.current !== null) {
        window.clearTimeout(modernToastTimeoutRef.current);
        modernToastTimeoutRef.current = null;
      }
    };
  }, [modernToast]);
  useEffect(() => {
    if (!toastMessage && toastReaderOpen) {
      setToastReaderOpen(false);
    }
  }, [toastMessage, toastReaderOpen]);
  useEffect(() => {
    if (toastMessage) return;
    setToastConfirm(null);
  }, [toastMessage]);
  useEffect(() => {
    logoutAutoExportRef.current = logoutAutoExport;
  }, [logoutAutoExport]);
  useEffect(() => {
    if (!toastConfirm || toastConfirm.context !== "logout") {
      setLogoutAutoExport(false);
    }
  }, [toastConfirm]);
  useEffect(() => {
    if (!toastReaderOpen) return;
    requestAnimationFrame(() => toastReaderCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setToastReaderOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toastReaderOpen]);
  const showModernToast = useCallback(
    (toast: ModernToast) => {
      setModernToast(toast);
      setLive(`${toast.title}. ${toast.message}`);
    },
    [setLive],
  );
  const dismissModernToast = useCallback(() => {
    if (modernToastTimeoutRef.current !== null) {
      window.clearTimeout(modernToastTimeoutRef.current);
      modernToastTimeoutRef.current = null;
    }
    setModernToast(null);
  }, []);
  useEffect(() => {
    if (!insightPanelOpen || !insightShouldFocusRef.current) {
      return;
    }
    insightShouldFocusRef.current = false;
    const node = insightPanelRef.current;
    const focusableSelector =
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
    requestAnimationFrame(() => {
      const focusable = node
        ? Array.from(node.querySelectorAll<HTMLElement>(focusableSelector)).filter(
            element => !element.hasAttribute("disabled"),
          )
        : [];
      const focusTarget = insightHeadingRef.current ?? focusable[0];
      focusTarget?.focus();
    });
  }, [insightPanelOpen]);
  useEffect(() => {
    if (welcomeActive) {
      setWelcomeSlide(0);
    }
  }, [welcomeActive]);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const developerTriggerRef = useRef({ count: 0, lastClick: 0 });
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetDialogAcknowledged, setResetDialogAcknowledged] = useState(false);
  const [createProfileDialogOpen, setCreateProfileDialogOpen] = useState(false);
  const [createProfileDialogAcknowledged, setCreateProfileDialogAcknowledged] = useState(false);
  const handleDeveloperHotspotClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!DEV_MODE_ENABLED) return;
      if (!event.altKey) {
        developerTriggerRef.current.count = 0;
        return;
      }
      const now = Date.now();
      if (now - developerTriggerRef.current.lastClick > 1200) {
        developerTriggerRef.current.count = 0;
      }
      developerTriggerRef.current.count += 1;
      developerTriggerRef.current.lastClick = now;
      if (developerTriggerRef.current.count >= 3) {
        developerTriggerRef.current.count = 0;
        setDeveloperOpen(true);
      }
    },
    [setDeveloperOpen]
  );
  const handleResetDialogClose = useCallback(() => {
    setResetDialogOpen(false);
    setResetDialogAcknowledged(false);
  }, []);
  const handleConfirmTrainingReset = useCallback(() => {
    resetTraining();
    handleResetDialogClose();
  }, [resetTraining, handleResetDialogClose]);

  useEffect(() => {
    if (!restoreDialogOpen) return;
    if (!players.length) {
      if (restoreSelectedPlayerId !== null) setRestoreSelectedPlayerId(null);
      return;
    }
    const preferredId =
      (restoreSelectedPlayerId && players.some(p => p.id === restoreSelectedPlayerId))
        ? restoreSelectedPlayerId
        : currentPlayer?.id && players.some(p => p.id === currentPlayer.id)
          ? currentPlayer.id
          : players[0].id;
    if (preferredId !== restoreSelectedPlayerId) {
      setRestoreSelectedPlayerId(preferredId);
    }
  }, [restoreDialogOpen, players, currentPlayer?.id, restoreSelectedPlayerId]);

  useEffect(() => {
    if (!developerOpen) {
      lockSecureStore();
    }
  }, [developerOpen, lockSecureStore]);

  const handleDeveloperClose = useCallback(() => {
    lockSecureStore();
    setDeveloperOpen(false);
  }, [lockSecureStore, setDeveloperOpen]);

  const handleInsightPreferenceToggle = useCallback(
    (next: boolean, trigger?: HTMLElement | null) => {
      if (next) {
        const source =
          trigger ??
          (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        openInsightPanel(source, { persistPreference: true });
      } else {
        closeInsightPanel({ persistPreference: true, suppressForMatch: true });
      }
    },
    [closeInsightPanel, openInsightPanel],
  );

  const style = `
  :root{ --challenge:#FF77AA; --practice:#88AA66; }
  .mode-grid{ display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px; width:min(92vw,640px); }
  .mode-card.dim{ filter: blur(2px) brightness(.85); }
  .ink-pop{ position:absolute; inset:0; background: radial-gradient(600px circle at var(--x,50%) var(--y,50%), rgba(255,255,255,.6), transparent 40%); opacity:0; transition:opacity .22s; }
  .mode-card:active .ink-pop{ opacity:1; }
  .fullscreen{ position:fixed; inset:0; z-index:50; will-change:transform; }
  .fullscreen.challenge{ background: var(--challenge); }
  .fullscreen.practice{ background: var(--practice); }
  .wipe{ position:fixed; inset:0; pointer-events:none; z-index:60; transform:translateX(110%); will-change:transform; background:linear-gradient(12deg, rgba(255,255,255,.9), rgba(255,255,255,1)); }
  .wipe.run{ animation: wipeIn 400ms cubic-bezier(.22,.61,.36,1) forwards; }
  @keyframes wipeIn{ 0%{ transform:translateX(110%) rotate(.5deg) } 100%{ transform:translateX(0) rotate(0) } }
  `;

  const gradeDisplay = currentPlayer ? (currentPlayer.grade === "Not applicable" ? "N/A" : currentPlayer.grade) : null;
  const playerLabel = currentPlayer ? `Player: ${currentPlayer.playerName} (Grade ${gradeDisplay})` : "Player: Not set";
  const demographicsNeedReview = Boolean(currentPlayer?.needsReview);
  const resolvedModalMode: "create" | "edit" = playerModalMode === "edit" && currentPlayer ? "edit" : "create";
  const modalPlayer = resolvedModalMode === "edit" ? currentPlayer : null;
  const hasLocalProfiles = players.length > 0;

  const [audioOn, setAudioOn] = useState(true);
  const [textScale, setTextScale] = useState(1);

  const [matchTimings, setMatchTimings] = useState<MatchTimings>(() => normalizeMatchTimings(loadMatchTimings()));
  const updateMatchTimings = useCallback((next: MatchTimings, options?: { persist?: boolean; clearSaved?: boolean }) => {
    const normalized = normalizeMatchTimings(next);
    setMatchTimings(normalized);
    if (options?.persist) {
      saveMatchTimings(normalized);
    } else if (options?.clearSaved) {
      clearSavedMatchTimings();
    }
  }, []);
  const resetMatchTimings = useCallback(() => {
    const defaults = normalizeMatchTimings(MATCH_TIMING_DEFAULTS);
    setMatchTimings(defaults);
    clearSavedMatchTimings();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (scene !== "BOOT") {
      if (bootAnimationRef.current !== null) {
        window.cancelAnimationFrame(bootAnimationRef.current);
        bootAnimationRef.current = null;
      }
      bootStartRef.current = null;
      setBootProgress(0);
      setBootReady(false);
      bootAdvancingRef.current = false;
      return;
    }
    bootAdvancingRef.current = false;
    setBootProgress(0);
    setBootReady(false);
    bootStartRef.current = null;
    const minimumDuration = 5000;
    const step = (timestamp: number) => {
      if (bootStartRef.current === null) {
        bootStartRef.current = timestamp;
      }
      const start = bootStartRef.current ?? timestamp;
      const elapsed = timestamp - start;
      const ratio = Math.min(elapsed / minimumDuration, 1);
      const nextProgress = Math.min(100, ratio * 100);
      setBootProgress(prev => (nextProgress > prev ? nextProgress : prev));
      if (elapsed >= minimumDuration) {
        setBootProgress(100);
        setBootReady(true);
        bootAnimationRef.current = null;
        return;
      }
      bootAnimationRef.current = window.requestAnimationFrame(step);
    };
    bootAnimationRef.current = window.requestAnimationFrame(step);
    return () => {
      if (bootAnimationRef.current !== null) {
        window.cancelAnimationFrame(bootAnimationRef.current);
        bootAnimationRef.current = null;
      }
    };
  }, [scene]);

  const [predictorMode, setPredictorMode] = useState<boolean>(currentProfile?.predictorDefault ?? false);
  const [aiMode, setAiMode] = useState<AIMode>("normal");
  const [difficultyHint, setDifficultyHint] = useState<string>(DIFFICULTY_INFO["normal"].helper);
  const TRAIN_ROUNDS = 5;
  const trainingCount = currentProfile?.trainingCount ?? 0;
  const isTrained = currentProfile?.trained ?? false;
  const previousTrainingCountRef = useRef(trainingCount);
  const [trainingCalloutQueue, setTrainingCalloutQueue] = useState<string[]>([]);
  const [postTrainingCtaOpen, setPostTrainingCtaOpen] = useState(false);
  const [postTrainingCtaAcknowledged, setPostTrainingCtaAcknowledged] = useState(
    currentProfile?.seenPostTrainingCTA ?? false,
  );
  const welcomeSlides = useMemo(
    () => [
      {
        title: "Welcome to Rock Paper Scissors AI Predictor!",
        body: `You’ll train for ${TRAIN_ROUNDS} rounds, then unlock the Challenge mode where the AI plays against you trying to predict your moves.`,
      },
      {
        title: "Your Data",
        body: "We collect gameplay data for learning. Exports will include your data and demographics.",
      },
    ],
    [TRAIN_ROUNDS],
  );
  const welcomeSlideCount = welcomeSlides.length;
  const welcomeProgress = welcomeSlideCount ? ((welcomeSlide + 1) / welcomeSlideCount) * 100 : 100;
  const isWelcomeLastSlide = welcomeSlide >= welcomeSlideCount - 1;
  const showMainUi = !welcomeActive && scene !== "WELCOME" && scene !== "BOOT";
  const trainingComplete = trainingCount >= TRAIN_ROUNDS;
  const needsTraining = !isTrained && !trainingComplete;
  const shouldGateTraining = needsTraining && !trainingActive;
  const modesDisabled = trainingActive || needsTraining;
  const trainingDisplayCount = Math.min(trainingCount, TRAIN_ROUNDS);
  const trainingProgress = Math.min(trainingDisplayCount / TRAIN_ROUNDS, 1);
  const showTrainingCompleteBadge = !needsTraining && trainingCount >= TRAIN_ROUNDS;
  const postTrainingLockActive = postTrainingCtaOpen;

  const acknowledgePostTrainingCta = useCallback(() => {
    if (!postTrainingCtaOpen) return false;
    setPostTrainingCtaOpen(false);
    setPostTrainingCtaAcknowledged(true);
    if (currentProfile && !currentProfile.seenPostTrainingCTA) {
      updateStatsProfile(currentProfile.id, { seenPostTrainingCTA: true });
    }
    return true;
  }, [currentProfile, postTrainingCtaOpen, updateStatsProfile]);

  const handleEnablePredictorForChallenge = useCallback(() => {
    if (predictorMode) return;
    setPredictorMode(true);
    if (currentProfile) {
      updateStatsProfile(currentProfile.id, { predictorDefault: true });
    }
    setLive("AI predictor enabled. Challenge unlocked.");
  }, [currentProfile, predictorMode, setLive, updateStatsProfile]);

  useEffect(() => {
    setPostTrainingCtaAcknowledged(currentProfile?.seenPostTrainingCTA ?? false);
  }, [currentProfile?.id]);

  useEffect(() => {
    if (currentProfile?.seenPostTrainingCTA && !postTrainingCtaAcknowledged) {
      setPostTrainingCtaAcknowledged(true);
    }
  }, [currentProfile?.seenPostTrainingCTA, postTrainingCtaAcknowledged]);

  useEffect(() => {
    if (scene !== "MATCH") {
      insightDismissedForMatchRef.current = false;
      return;
    }
    if (!insightPanelOpen && insightPreferred && !insightDismissedForMatchRef.current) {
      openInsightPanel(null, { focus: false, persistPreference: false });
    }
  }, [insightPanelOpen, insightPreferred, openInsightPanel, scene]);

  useEffect(() => {
    if (scene === "MATCH" || !insightPanelOpen) {
      return;
    }
    closeInsightPanel({ restoreFocus: false, persistPreference: false });
  }, [closeInsightPanel, insightPanelOpen, scene]);

  const difficultyDisabled = !isTrained || !predictorMode;
  const bootPercent = Math.round(bootProgress);
  const bootBarWidth = Math.min(100, bootProgress > 0 ? bootProgress : 4);

  useEffect(() => {
    if (difficultyDisabled) {
      setDifficultyHint("Enable the predictor to adjust difficulty.");
      return;
    }
    setDifficultyHint(DIFFICULTY_INFO[aiMode].helper);
  }, [aiMode, difficultyDisabled]);

  useEffect(() => {
    if (predictorMode) return;
    if (insightPanelOpen) {
      closeInsightPanel({ persistPreference: false, suppressForMatch: true });
    }
    if (insightPreferred) {
      persistInsightPreference(false);
    }
  }, [
    predictorMode,
    insightPanelOpen,
    insightPreferred,
    closeInsightPanel,
    persistInsightPreference,
  ]);

  useEffect(() => {
    if (!needsTraining && trainingActive) {
      setTrainingActive(false);
      trainingAnnouncementsRef.current.clear();
    }
  }, [needsTraining, trainingActive]);

  const [seed] = useState(()=>Math.floor(Math.random()*1e9));
  const rng = useMemo(()=>mulberry32(seed), [seed]);
  const [bestOf, setBestOf] = useState<BestOf>(5);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [matchScoreTotal, setMatchScoreTotal] = useState<number | null>(null);
  const matchScoreTotalRef = useRef(0);
  const [matchScoreChange, setMatchScoreChange] = useState<{ value: number; key: number } | null>(null);
  const scoreChangeTimeoutRef = useRef<number | null>(null);
  const matchScoreDisplay = useMemo(() => (matchScoreTotal ?? 0).toLocaleString(), [matchScoreTotal]);
  const [round, setRound] = useState(1);
  const [aiHistory, setAiHistory] = useState<Move[]>([]);
  const [outcomesHist, setOutcomesHist] = useState<Outcome[]>([]);

  type Phase = "idle"|"selected"|"countdown"|"reveal"|"resolve"|"feedback";
  const [phase, setPhase] = useState<Phase>("idle");
  const [playerPick, setPlayerPick] = useState<Move|undefined>();
  const [aiPick, setAiPick] = useState<Move|undefined>();
  const [count, setCount] = useState<number>(3);
  const [outcome, setOutcome] = useState<Outcome|undefined>();
  const [resultBanner, setResultBanner] = useState<"Victory"|"Defeat"|"Tie"|null>(null);
  useEffect(() => {
    return () => {
      if (scoreChangeTimeoutRef.current !== null) {
        window.clearTimeout(scoreChangeTimeoutRef.current);
        scoreChangeTimeoutRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (!showMainUi) {
      setHelpCenterOpen(false);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      if (target?.isContentEditable) {
        return;
      }
      const key = event.key.toLowerCase();
      const altH = event.altKey && key === "h";
      const questionKey = !event.altKey && event.key === "?";
      if (!altH && !questionKey) return;
      event.preventDefault();
      setHelpCenterOpen(prev => {
        const next = !prev;
        setLive(next ? "Help opened. Press Escape to close." : "Help closed.");
        return next;
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setLive, showMainUi]);
  useEffect(() => {
    if (welcomeActive) {
      if (!welcomeToastShownRef.current) {
        if (!toastMessage) {
          setToastMessage("Use Next to review the intro, then choose how to continue.");
        }
        setLive(`Welcome intro opened. Slide 1 of ${welcomeSlideCount}.`);
        welcomeToastShownRef.current = true;
      }
    } else {
      welcomeToastShownRef.current = false;
      welcomeFinalToastShownRef.current = false;
    }
  }, [welcomeActive, toastMessage, welcomeSlideCount, setLive, setToastMessage]);
  useEffect(() => {
    if (!welcomeActive) return;
    if (welcomeSlide === welcomeSlideCount - 1 && !welcomeFinalToastShownRef.current) {
      if (!toastMessage) {
        setToastMessage("Choose Get started to set up or Load my data to continue where you left off.");
      }
      welcomeFinalToastShownRef.current = true;
    }
  }, [welcomeActive, welcomeSlide, welcomeSlideCount, toastMessage, setToastMessage]);
  const countdownRef = useRef<number | null>(null);
  const trainingAnnouncementsRef = useRef<Set<number>>(new Set());
  const clearRobotReactionTimers = useCallback(() => {
    if (robotResultTimeoutRef.current) {
      window.clearTimeout(robotResultTimeoutRef.current);
      robotResultTimeoutRef.current = null;
    }
    if (robotRestTimeoutRef.current) {
      window.clearTimeout(robotRestTimeoutRef.current);
      robotRestTimeoutRef.current = null;
    }
  }, []);
  const startRobotRest = useCallback(
    (duration: number, context: "round" | "result") => {
      if (duration <= 0) {
        setRobotResultReaction(null);
        robotRestTimeoutRef.current = null;
        return;
      }
      const restReaction: RobotReaction =
        context === "round"
          ? {
              emoji: "😴",
              body: "Taking a breather before the next round.",
              label: "Robot resting after the round reaction.",
              variant: "idle",
            }
          : {
              emoji: "😴",
              body: "Cooling down after that match.",
              label: "Robot resting after the match reaction.",
              variant: "idle",
            };
      setRobotResultReaction(restReaction);
      if (robotRestTimeoutRef.current) {
        window.clearTimeout(robotRestTimeoutRef.current);
      }
      const restTimeoutId = window.setTimeout(() => {
        if (robotRestTimeoutRef.current !== restTimeoutId) return;
        setRobotResultReaction(null);
        robotRestTimeoutRef.current = null;
      }, duration);
      robotRestTimeoutRef.current = restTimeoutId;
    },
    [setRobotResultReaction],
  );
  useEffect(() => {
    setTrainingActive(false);
    trainingAnnouncementsRef.current.clear();
  }, [currentProfile?.id]);
  const clearCountdown = ()=>{ if (countdownRef.current!==null){ clearInterval(countdownRef.current); countdownRef.current=null; } };
  const startCountdown = ()=>{
    const modeForTiming: Mode = selectedMode ?? "practice";
    const interval = matchTimings[modeForTiming].countdownTickMs;
    setPhase("countdown");
    setCount(3);
    clearCountdown();
    countdownRef.current = window.setInterval(()=>{
      setCount(prev=>{
        const next = prev - 1;
        audio.tick();
        tryVibrate(6);
        if (next <= 0){
          clearCountdown();
          reveal();
        }
        return next;
      });
    }, interval);
  };

  const [selectedMode, setSelectedMode] = useState<Mode|null>(null);
  const showMatchScoreBadge = !trainingActive && (selectedMode ?? "practice") === "challenge";
  const hudInsightDisabled = (selectedMode ?? "practice") === "practice" && !predictorMode;
  const showResultsScoreBadge = showMatchScoreBadge && matchScoreTotal !== null;
  const resultMascot = useMemo((): { variant: RobotVariant; alt: string } => {
    if (resultBanner === "Victory") {
      return { variant: "sad", alt: "Robot looking disappointed after your loss." };
    }
    if (resultBanner === "Defeat") {
      return { variant: "happy", alt: "Robot smiling after your win." };
    }
    if (resultBanner === "Tie") {
      return { variant: "meh", alt: "Robot with a neutral expression after a tie." };
    }
    return { variant: "idle", alt: "Robot mascot." };
  }, [resultBanner]);
  const hideUiDuringModeTransition = scene === "MODE" && selectedMode !== null;
  const [wipeRun, setWipeRun] = useState(false);
  const modeLabel = (m:Mode)=> m.charAt(0).toUpperCase()+m.slice(1);
  const activeMatchMode: Mode = selectedMode ?? "practice";
  const matchModeBadgeTheme =
    activeMatchMode === "challenge"
      ? "border-rose-500 bg-rose-600 text-white"
      : "border-sky-200 bg-sky-100 text-sky-700";
  const aiStatusPill = useMemo(() => {
    const offState = {
      label: "AI OFF (Random)",
      className: "border border-slate-200 bg-white/80 text-slate-600",
    };
    if (trainingActive || needsTraining || !isTrained || !predictorMode) {
      return offState;
    }
    const difficultyLabel = `${DIFFICULTY_INFO[aiMode].label} Mode`;
    return {
      label: `AI ACTIVE (${difficultyLabel})`,
      className: "border border-emerald-500 bg-emerald-600 text-white",
    };
  }, [aiMode, isTrained, needsTraining, predictorMode, trainingActive]);

  const handlePredictorToggle = useCallback(
    (checked: boolean) => {
      if (!checked) {
        const inActiveMatch = selectedMode !== null && scene === "MATCH";
        if (inActiveMatch) {
          showModernToast({
            variant: "danger",
            title: "Finish the current match first",
            message:
              "Finish your current Challenge or Practice match or exit to Modes before turning off the AI predictor.",
          });
          return;
        }
      } else {
        const inPracticeMatch = selectedMode === "practice" && scene === "MATCH";
        if (inPracticeMatch) {
          showModernToast({
            variant: "danger",
            title: "Finish the current match first",
            message:
              "Finish your current Practice match or exit to Modes before turning on the AI predictor.",
          });
          return;
        }
      }
      setPredictorMode(checked);
      if (currentProfile) {
        updateStatsProfile(currentProfile.id, { predictorDefault: checked });
      }
    },
    [currentProfile, scene, selectedMode, showModernToast, updateStatsProfile],
  );

  const goToWelcomeSlide = useCallback(
    (delta: number) => {
      setWelcomeSlide(prev => {
        const next = Math.min(Math.max(0, prev + delta), Math.max(0, welcomeSlideCount - 1));
        if (next !== prev) {
          setLive(`Intro slide ${next + 1} of ${welcomeSlideCount}.`);
        }
        return next;
      });
    },
    [welcomeSlideCount, setLive],
  );

  const handleWelcomeNext = useCallback(() => {
    goToWelcomeSlide(1);
  }, [goToWelcomeSlide]);

  const handleWelcomePrevious = useCallback(() => {
    goToWelcomeSlide(-1);
  }, [goToWelcomeSlide]);

  const openWelcome = useCallback(
    (options: { announce?: string; resetPlayer?: boolean; bootFirst?: boolean; origin?: "launch" | "settings" } = {}) => {
      clearCountdown();
      setPhase("idle");
      setCount(3);
      setPlayerPick(undefined);
      setAiPick(undefined);
      setOutcome(undefined);
      setResultBanner(null);
      setSelectedMode(null);
      setWipeRun(false);
      setPlayerScore(0);
      setAiScore(0);
      setRound(1);
      setLastMoves([]);
      setAiHistory([]);
      setOutcomesHist([]);
      currentMatchRoundsRef.current = [];
      setTrainingActive(false);
      setTrainingCalloutQueue([]);
      trainingAnnouncementsRef.current.clear();
      setPostTrainingCtaOpen(false);
      clearRobotReactionTimers();
      setRobotResultReaction(null);
      setRobotHovered(false);
      setRobotFocused(false);
      setStatsOpen(false);
      setLeaderboardOpen(false);
      setSettingsOpen(false);
      setHelpGuideOpen(false);
      setHelpToast(null);
      setToastReaderOpen(false);
      setToastMessage(null);
      setResetDialogOpen(false);
      setResetDialogAcknowledged(false);
      setCreateProfileDialogOpen(false);
      setCreateProfileDialogAcknowledged(false);
      setExportDialogOpen(false);
      setExportDialogAcknowledged(false);
      setExportDialogSource(null);
      setRestoreDialogOpen(false);
      setRestoreSelectedPlayerId(null);
      setDeveloperOpen(false);
      setPlayerModalMode("hidden");
      setPlayerModalOrigin(null);
      if (options.resetPlayer) {
        setCurrentPlayer(null);
      }
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(WELCOME_PREF_KEY, "show");
          window.localStorage.removeItem(LEGACY_WELCOME_SEEN_KEY);
        } catch {
          /* noop */
        }
      }
      setWelcomeSeen(false);
      setWelcomeSlide(0);
      setWelcomeStage("intro");
      setPendingWelcomeExit(null);
      setWelcomeOrigin(options.origin ?? (options.bootFirst ? "launch" : "settings"));
      if (options.bootFirst) {
        setWelcomeActive(false);
        setBootNext("WELCOME");
        setScene("BOOT");
      } else {
        setScene("WELCOME");
        setBootNext("AUTO");
        setWelcomeActive(true);
      }
      welcomeToastShownRef.current = false;
      welcomeFinalToastShownRef.current = false;
      if (options.announce) {
        setLive(options.announce);
      }
    },
    [
      clearCountdown,
      clearRobotReactionTimers,
      setAiHistory,
      setAiPick,
      setAiScore,
      setCount,
      setCreateProfileDialogAcknowledged,
      setCreateProfileDialogOpen,
      setCurrentPlayer,
      setDeveloperOpen,
      setExportDialogAcknowledged,
      setExportDialogOpen,
      setExportDialogSource,
      setHelpGuideOpen,
      setHelpToast,
      setLeaderboardOpen,
      setLastMoves,
      setOutcomesHist,
      setPhase,
      setPlayerModalMode,
      setPlayerModalOrigin,
      setPlayerPick,
      setPlayerScore,
      setResetDialogAcknowledged,
      setResetDialogOpen,
      setResultBanner,
      setRobotFocused,
      setRobotHovered,
      setRobotResultReaction,
      setRound,
      setScene,
      setBootNext,
      setSelectedMode,
      setSettingsOpen,
      setStatsOpen,
      setToastMessage,
      setToastReaderOpen,
      setTrainingActive,
      setTrainingCalloutQueue,
      setWelcomeActive,
      setWelcomeSeen,
      setWelcomeSlide,
      setWelcomeStage,
      setWelcomeOrigin,
      setPendingWelcomeExit,
      setWipeRun,
      setLive,
    ],
  );

  const persistWelcomeSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(WELCOME_PREF_KEY, "skip");
      window.localStorage.setItem(LEGACY_WELCOME_SEEN_KEY, "true");
    } catch {
      /* noop */
    }
  }, []);

  const finishWelcomeFlow = useCallback(
    (reason: "setup" | "restore" | "dismiss") => {
      setWelcomeActive(false);
      setWelcomeSlide(0);
      setWelcomeStage("intro");
      setBootNext("AUTO");
      setWelcomeSeen(true);
      persistWelcomeSeen();
      setWelcomeOrigin(null);
      welcomeToastShownRef.current = false;
      welcomeFinalToastShownRef.current = false;
      setPendingWelcomeExit({ reason });
    },
    [
      setBootNext,
      setPendingWelcomeExit,
      setWelcomeActive,
      setWelcomeOrigin,
      setWelcomeSeen,
      setWelcomeSlide,
      setWelcomeStage,
      persistWelcomeSeen,
    ],
  );

  const handleWelcomeAction = useCallback(
    (mode: "setup" | "restore" | "dismiss") => {
      if (mode === "setup") {
        setWelcomeStage("create");
        setPlayerModalOrigin("welcome");
        setPlayerModalMode("create");
        setToastMessage("Let’s set up your player profile.");
        setLive("Opening player setup from welcome intro.");
        return;
      }
      if (mode === "restore") {
        if (players.length > 0) {
          setWelcomeStage("restore");
          setRestoreDialogOpen(true);
          setToastMessage("Pick your saved player to continue.");
          setLive("Opening saved player picker.");
        } else {
          setWelcomeStage("intro");
          setToastMessage("No saved data found on this device.");
          setLive("No saved player profiles available.");
        }
        return;
      }
      if (welcomeOrigin === "launch") {
        return;
      }
      finishWelcomeFlow("dismiss");
      setToastMessage("Welcome dismissed. You can replay it from Settings → Help.");
      setLive("Welcome intro dismissed.");
    },
    [
      finishWelcomeFlow,
      players.length,
      setLive,
      setPlayerModalMode,
      setPlayerModalOrigin,
      setRestoreDialogOpen,
      setToastMessage,
      setWelcomeStage,
      welcomeOrigin,
    ],
  );

  const selectedRestorePlayer = useMemo(() => {
    if (!restoreSelectedPlayerId) return null;
    return players.find(player => player.id === restoreSelectedPlayerId) ?? null;
  }, [players, restoreSelectedPlayerId]);

  const handleRestoreBack = useCallback(() => {
    setRestoreDialogOpen(false);
    setRestoreSelectedPlayerId(null);
    setWelcomeStage("intro");
    setLive("Returning to the welcome intro.");
  }, [setLive, setRestoreDialogOpen, setRestoreSelectedPlayerId, setWelcomeStage]);

  const handleRestoreConfirm = useCallback(() => {
    if (!restoreSelectedPlayerId) return;
    const target = players.find(player => player.id === restoreSelectedPlayerId);
    if (!target) return;
    setRestoreDialogOpen(false);
    setRestoreSelectedPlayerId(null);
    setWelcomeStage("intro");
    setToastMessage(`Welcome back, ${target.playerName}! Choose a mode when you're ready.`);
    setLive(`Loaded saved player ${target.playerName}.`);
    setCurrentPlayer(target.id);
    finishWelcomeFlow("restore");
  }, [
    finishWelcomeFlow,
    players,
    restoreSelectedPlayerId,
    setCurrentPlayer,
    setLive,
    setRestoreDialogOpen,
    setRestoreSelectedPlayerId,
    setToastMessage,
    setWelcomeStage,
  ]);

  const handlePlayerModalClose = useCallback(() => {
    if (playerModalOrigin === "welcome") {
      setPlayerModalMode("hidden");
      setPlayerModalOrigin(null);
      setWelcomeStage("intro");
      setLive("Returning to the welcome intro.");
      return;
    }
    if (hasConsented) {
      setPlayerModalMode("hidden");
      setPlayerModalOrigin(null);
    }
  }, [hasConsented, playerModalOrigin, setLive, setPlayerModalMode, setPlayerModalOrigin, setWelcomeStage]);

  const recordRound = useCallback((playerMove: Move, aiMove: Move, outcomeForPlayer: Outcome) => {
    const trace = decisionTraceRef.current;
    const policy: DecisionPolicy = trace?.policy ?? "heuristic";
    const mixer = trace?.mixer;
    let mixerTrace: MixerTrace | undefined;
    if (mixer) {
      const realtimeWeight = mixer.realtimeWeight ?? 1;
      const historyWeight = mixer.historyWeight ?? 1;
      mixerTrace = {
        dist: mixer.dist,
        counter: mixer.counter,
        topExperts: mixer.experts
          .map(e => ({ name: e.name, weight: e.weight, pActual: e.dist[playerMove] ?? 0 }))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 3),
        confidence: mixer.confidence,
        realtimeWeight: mixer.realtimeWeight,
        historyWeight: mixer.historyWeight,
        realtimeTopExperts: (mixer.realtimeExperts ?? [])
          .map(expert => ({
            name: expert.name,
            weight: expert.weight * realtimeWeight,
            pActual: expert.dist[playerMove] ?? 0,
          }))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 3),
        historyTopExperts: (mixer.historyExperts ?? [])
          .map(expert => ({
            name: expert.name,
            weight: expert.weight * historyWeight,
            pActual: expert.dist[playerMove] ?? 0,
          }))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 3),
        realtimeRounds: mixer.realtimeRounds,
        historyRounds: mixer.historyRounds,
        conflict: mixer.conflict ?? null,
      };
    }
    const heuristicTrace = trace?.heuristic;
    const confidence = trace?.confidence ?? mixerTrace?.confidence ?? heuristicTrace?.conf ?? 0;
    const now = new Date().toISOString();
    const aiStreak = outcomeForPlayer === "lose" ? aiStreakRef.current + 1 : 0;
    const youStreak = outcomeForPlayer === "win" ? youStreakRef.current + 1 : 0;
    aiStreakRef.current = aiStreak;
    youStreakRef.current = youStreak;
    const reason = describeDecision(policy, mixerTrace, heuristicTrace, playerMove, aiMove);
    const confBucket = confidenceBucket(confidence);
    const decisionTimeMs = typeof lastDecisionMsRef.current === "number" ? lastDecisionMsRef.current : undefined;
    const logged = logRound({
      t: now,
      mode: selectedMode ?? "practice",
      matchId: currentMatchIdRef.current,
      bestOf,
      difficulty: aiMode,
      player: playerMove,
      ai: aiMove,
      outcome: outcomeForPlayer,
      policy,
      mixer: mixerTrace,
      heuristic: heuristicTrace,
      streakAI: aiStreak,
      streakYou: youStreak,
      reason,
      confidence,
      confidenceBucket: confBucket,
      decisionTimeMs,
    });
    if (logged) {
      currentMatchRoundsRef.current = [...currentMatchRoundsRef.current, logged];
      setLiveInsightRounds([...currentMatchRoundsRef.current]);
      const activeMode: Mode = selectedMode ?? "practice";
      if (activeMode === "challenge") {
        const breakdown = computeMatchScore(currentMatchRoundsRef.current);
        const nextTotal = breakdown?.total ?? 0;
        const previousTotal = matchScoreTotalRef.current;
        matchScoreTotalRef.current = nextTotal;
        setMatchScoreTotal(nextTotal);
        const delta = nextTotal - previousTotal;
        if (delta !== 0) {
          if (scoreChangeTimeoutRef.current !== null) {
            window.clearTimeout(scoreChangeTimeoutRef.current);
          }
          const changeKey = Date.now();
          setMatchScoreChange({ value: delta, key: changeKey });
          scoreChangeTimeoutRef.current = window.setTimeout(() => {
            setMatchScoreChange(null);
            scoreChangeTimeoutRef.current = null;
          }, 600);
        } else {
          if (scoreChangeTimeoutRef.current !== null) {
            window.clearTimeout(scoreChangeTimeoutRef.current);
            scoreChangeTimeoutRef.current = null;
          }
          setMatchScoreChange(null);
        }
      }
    }
    devInstrumentation.roundCompleted({
      matchId: currentMatchIdRef.current,
      roundNumber: round,
      outcome: outcomeForPlayer,
      aiStreak,
      youStreak,
      completedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
    });
    decisionTraceRef.current = null;
    lastDecisionMsRef.current = null;
  }, [logRound, selectedMode, bestOf, aiMode, round]);

  useEffect(() => {
    if (!needsTraining && !trainingActive) return;
    if (aiMode !== "fair") setAiMode("fair");
  }, [needsTraining, trainingActive, aiMode]);

  useEffect(() => {
    if (needsTraining || trainingActive) {
      if (predictorMode) setPredictorMode(false);
      return;
    }
    const preferred = currentProfile?.predictorDefault ?? false;
    setPredictorMode(preferred);
  }, [currentProfile?.id, currentProfile?.predictorDefault, needsTraining, trainingActive, predictorMode]);

  useEffect(() => {
    if (scene !== "MATCH") return;
    if (phase !== "idle") return;
    const readyAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    roundStartRef.current = readyAt;
    lastDecisionMsRef.current = null;
    const currentMatchId = currentMatchIdRef.current;
    const matchMode: Mode = selectedMode ?? "practice";
    devInstrumentation.roundReady({
      matchId: currentMatchId,
      roundNumber: round,
      mode: matchMode,
      difficulty: aiMode,
      bestOf,
      readyAt,
      playerId: currentPlayer?.id ?? null,
      profileId: currentProfile?.id ?? null,
    });
  }, [scene, phase, round, selectedMode, aiMode, bestOf, currentPlayer?.id, currentProfile?.id]);

  useEffect(() => {
    const parts: string[] = [scene];
    if (statsOpen) parts.push("STATS");
    if (leaderboardOpen) parts.push("LEADERBOARD");
    if (settingsOpen) parts.push("SETTINGS");
    if (helpGuideOpen) parts.push("HELP");
    if (welcomeActive) parts.push("WELCOME");
    if (insightPanelOpen) parts.push("INSIGHT");
    devInstrumentation.setView(parts.join("+"));
  }, [scene, statsOpen, leaderboardOpen, settingsOpen, helpGuideOpen, welcomeActive, insightPanelOpen]);

  useEffect(() => {
    devInstrumentation.trackPromptState("help-guide", helpGuideOpen);
  }, [helpGuideOpen]);

  useEffect(() => {
    devInstrumentation.trackPromptState("stats-modal", statsOpen);
  }, [statsOpen]);

  useEffect(() => {
    devInstrumentation.trackPromptState("settings-panel", settingsOpen);
  }, [settingsOpen]);

  useEffect(() => {
    devInstrumentation.trackPromptState("leaderboard-modal", leaderboardOpen);
  }, [leaderboardOpen]);
  useEffect(() => {
    devInstrumentation.trackPromptState("insight-panel", insightPanelOpen);
  }, [insightPanelOpen]);

  const armedRef = useRef(false);
  const armAudio = () => { if (!armedRef.current){ audio.ensureCtx(); audio.setEnabled(audioOn); armedRef.current = true; } };
  useEffect(()=>{ audio.setEnabled(audioOn); }, [audioOn]);

  useEffect(() => {
    if (scene !== "BOOT") return;
    if (!bootReady) return;
    if (bootAdvancingRef.current) return;
    bootAdvancingRef.current = true;
    if (bootNext === "WELCOME") {
      setWelcomeOrigin("launch");
      setWelcomeStage("intro");
      setWelcomeSeen(false);
      setWelcomeActive(true);
      setScene("WELCOME");
      setBootNext("AUTO");
      return;
    }
    if (needsTraining && currentProfile && hasConsented) {
      if (forceTrainingPrompt) {
        if (trainingActive) {
          setTrainingActive(false);
        }
      } else if (!trainingActive) {
        setTrainingActive(true);
      }
      startMatch("practice", { silent: true });
      setForceTrainingPrompt(false);
      return;
    }
    setForceTrainingPrompt(false);
    setScene("MODE");
  }, [
    scene,
    bootReady,
    bootNext,
    needsTraining,
    currentProfile,
    hasConsented,
    trainingActive,
    forceTrainingPrompt,
    setWelcomeOrigin,
    setWelcomeSeen,
    setWelcomeStage,
  ]);

  useEffect(() => {
    if (!pendingWelcomeExit) return;
    const { reason } = pendingWelcomeExit;
    if (reason === "setup" && (!hasConsented || !currentProfile)) {
      return;
    }
    if (reason !== "dismiss" && needsTraining && currentProfile && hasConsented) {
      if (reason === "setup") {
        if (trainingActive) {
          setTrainingActive(false);
        }
      } else if (!trainingActive) {
        setTrainingActive(true);
      }
      startMatch("practice", { silent: true });
    } else {
      setScene("MODE");
    }
    setPendingWelcomeExit(null);
  }, [
    pendingWelcomeExit,
    needsTraining,
    currentProfile,
    hasConsented,
    trainingActive,
    setPendingWelcomeExit,
    setScene,
    setTrainingActive,
    startMatch,
  ]);

  const statsTabs = [
    { key: "overview", label: "Overview" },
    { key: "rounds", label: "Rounds" },
    { key: "insights", label: "Insights" },
  ] as const;

  const helpGuideItems = useMemo(() => [
    {
      title: "How to start",
      message: "Pick Challenge or Practice to launch a match against the AI.",
    },
    {
      title: "What is Training",
      message: `Training is a ${TRAIN_ROUNDS}-round warmup that lets the AI learn your style before tougher matches.`,
    },
    {
      title: "What is statistics",
      message: "Statistics saves your rounds and matches so you can review progress and trends anytime.",
    },
  ], [TRAIN_ROUNDS]);

  const filteredRounds = useMemo(() => {
    const items = [...rounds].sort((a, b) => b.t.localeCompare(a.t));
    return items.filter(r => {
      if (roundFilters.mode !== "all" && r.mode !== roundFilters.mode) return false;
      if (roundFilters.difficulty !== "all" && r.difficulty !== roundFilters.difficulty) return false;
      if (roundFilters.outcome !== "all" && r.outcome !== roundFilters.outcome) return false;
      if (roundFilters.from){
        if (r.t < roundFilters.from) return false;
      }
      if (roundFilters.to){
        if (r.t > roundFilters.to + "T23:59:59") return false;
      }
      return true;
    });
  }, [rounds, roundFilters]);

  const isCardView = roundsViewMode === "card";
  const pageSize = isCardView ? 24 : 200;
  const totalRoundPages = Math.max(1, Math.ceil(filteredRounds.length / pageSize));
  useEffect(() => {
    if (roundPage >= totalRoundPages) {
      setRoundPage(Math.max(0, totalRoundPages - 1));
    }
  }, [roundPage, totalRoundPages]);
  const roundsPageSlice = filteredRounds.slice(roundPage * pageSize, (roundPage + 1) * pageSize);
  const roundPageStartIndex = roundPage * pageSize;

  const totalMatches = matches.length;
  const totalRounds = rounds.length;
  const hasExportData = totalRounds > 0;
  const canExportData = Boolean(currentPlayer && currentProfile && hasExportData);
  const shouldShowNoExportMessage = !currentPlayer || !currentProfile || !hasExportData;
  const playerWins = matches.reduce((acc, m) => acc + (m.score.you > m.score.ai ? 1 : 0), 0);
  const overallWinRate = totalMatches ? playerWins / totalMatches : 0;
  const trainingRoundDisplay = Math.min(trainingCount + 1, TRAIN_ROUNDS);
  const shouldShowIdleBubble = !trainingActive && !postTrainingCtaOpen && !robotResultReaction && (robotHovered || robotFocused || helpGuideOpen);
  const robotBubbleContent: { message: React.ReactNode; buttons?: { label: string; onClick: () => void }[]; ariaLabel?: string } | null =
    trainingActive
      ? {
          message: `Training round ${Math.min(trainingRoundDisplay, TRAIN_ROUNDS)}/${TRAIN_ROUNDS}—keep going!`,
        }
      : shouldShowIdleBubble
        ? {
            message: "Ready! Choose a Mode to start.",
          }
        : null;

  const hudRobotVariant: RobotVariant = useMemo(() => {
    if (robotResultReaction?.variant) return robotResultReaction.variant;
    if ((phase === "resolve" || phase === "feedback") && outcome) {
      if (outcome === "win") return "sad";
      if (outcome === "lose") return "happy";
      return "meh";
    }
    return "idle";
  }, [robotResultReaction, phase, outcome]);

  const behaviorStats = useMemo(() => {
    if (rounds.length === 0) {
      return { repeatAfterWin: 0, switchAfterLoss: 0, favoriteMove: null as Move | null, favoritePct: 0 };
    }
    let repeatWins = 0; let winCases = 0;
    let switchLoss = 0; let lossCases = 0;
    for (let i=1;i<rounds.length;i++){
      const prev = rounds[i-1];
      const curr = rounds[i];
      if (prev.outcome === "win"){
        winCases++; if (curr.player === prev.player) repeatWins++;
      }
      if (prev.outcome === "lose"){
        lossCases++; if (curr.player !== prev.player) switchLoss++;
      }
    }
    const counts: Record<Move, number> = { rock:0, paper:0, scissors:0 };
    rounds.forEach(r => { counts[r.player] += 1; });
    let favorite: Move = "rock";
    let favoriteCount = 0;
    (Object.keys(counts) as Move[]).forEach(m => { if (counts[m] > favoriteCount){ favorite = m; favoriteCount = counts[m]; } });
    return {
      repeatAfterWin: winCases ? repeatWins / winCases : 0,
      switchAfterLoss: lossCases ? switchLoss / lossCases : 0,
      favoriteMove: favoriteCount ? favorite : null,
      favoritePct: totalRounds ? favoriteCount / totalRounds : 0,
    };
  }, [rounds, totalRounds]);
  const repeatAfterWinPct = Math.round(behaviorStats.repeatAfterWin * 100);
  const switchAfterLossPct = Math.round(behaviorStats.switchAfterLoss * 100);

  const topTransition = useMemo(() => {
    const map = new Map<string, number>();
    for (let i=1;i<rounds.length;i++){
      const key = rounds[i-1].player + "→" + rounds[i].player;
      map.set(key, (map.get(key) || 0) + 1);
    }
    const sorted = [...map.entries()].sort((a,b)=> b[1]-a[1]);
    return sorted.length ? { pair: sorted[0][0], count: sorted[0][1] } : null;
  }, [rounds]);
  const topTransitionDisplay = useMemo<React.ReactNode>(() => {
    if (!topTransition) return null;
    const [from, to] = topTransition.pair.split("→") as [Move, Move];
    if (!from || !to) return null;
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {moveLabelNode(from, { iconSize: 22, textClassName: "font-semibold" })}
        <span className="text-slate-400">→</span>
        {moveLabelNode(to, { iconSize: 22, textClassName: "font-semibold" })}
        <span className="text-sm font-medium text-slate-500">({topTransition.count})</span>
      </span>
    );
  }, [topTransition]);

  const recentTrendDots = useMemo(() => {
    const slice = rounds.slice(-20);
    if (!slice.length)
      return [] as { x: number; outcome: Outcome; label: string }[];
    const width = 220;
    const step = slice.length > 1 ? (width - 20) / (slice.length - 1) : 0;
    return slice.map((r, idx) => {
      const x = 10 + step * idx;
      return {
        x,
        outcome: r.outcome,
        label: `${new Date(r.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}: ${r.outcome}`,
      };
    });
  }, [rounds]);
  const recentConfidenceSpark = useMemo(() => {
    const slice = rounds.slice(-20);
    if (!slice.length)
      return [] as { x: number; y: number; value: number }[];
    const width = 180;
    const height = 42;
    const step = slice.length > 1 ? (width - 20) / (slice.length - 1) : 0;
    return slice.map((r, idx) => {
      const confidence = clamp01(r.confidence);
      const x = 10 + step * idx;
      const y = height - 8 - confidence * (height - 16);
      return { x, y, value: confidence };
    });
  }, [rounds]);
  const confidenceSparkPoints = useMemo(
    () => recentConfidenceSpark.map(p => `${p.x},${p.y}`).join(" "),
    [recentConfidenceSpark],
  );
  const lastConfidencePercent = recentConfidenceSpark.length
    ? Math.round(recentConfidenceSpark[recentConfidenceSpark.length - 1].value * 100)
    : null;
  const averageConfidenceLast20 = recentConfidenceSpark.length
    ? Math.round(
        (recentConfidenceSpark.reduce((acc, point) => acc + point.value, 0) /
          recentConfidenceSpark.length) *
          100,
      )
    : null;
  const averageConfidenceAll = totalRounds
    ? Math.round(
        (rounds.reduce((acc, item) => acc + clamp01(item.confidence), 0) / totalRounds) * 100,
      )
    : null;

  const confidenceBandStats = useMemo(() => {
    const bands = [
      { key: "low" as const, min: 0, max: 0.34, label: "0-33%", tone: "Not sure" },
      { key: "mid" as const, min: 0.34, max: 0.67, label: "34-66%", tone: "Kinda sure" },
      { key: "high" as const, min: 0.67, max: 1.01, label: "67-100%", tone: "Very sure" },
    ];
    const results = bands.map(band => ({
      ...band,
      total: 0,
      playerWins: 0,
      playerLosses: 0,
      ties: 0,
    }));
    rounds.forEach(r => {
      const conf = clamp01(r.confidence);
      const bandIndex = results.findIndex(b => conf >= b.min && conf < b.max);
      const bucket = bandIndex >= 0 ? results[bandIndex] : results[results.length - 1];
      bucket.total += 1;
      if (r.outcome === "win") bucket.playerWins += 1;
      else if (r.outcome === "lose") bucket.playerLosses += 1;
      else bucket.ties += 1;
    });
    return results.map(b => ({
      ...b,
      playerWinRate: b.total ? b.playerWins / b.total : 0,
      aiWinRate: b.total ? b.playerLosses / b.total : 0,
    }));
  }, [rounds]);

  const calibrationSummary = useMemo(() => {
    if (!rounds.length) {
      return {
        bins: [] as {
          midpoint: number;
          avgConfidence: number;
          actual: number;
          total: number;
        }[],
        ece: null as number | null,
        brier: null as number | null,
        sharpness: 0,
      };
    }
    const binCount = 5;
    const bins = Array.from({ length: binCount }, (_, idx) => ({
      midpoint: (idx + 0.5) / binCount,
      min: idx / binCount,
      max: (idx + 1) / binCount,
      sumConfidence: 0,
      sumActual: 0,
      total: 0,
    }));
    let brierSum = 0;
    let sharpnessSum = 0;
    rounds.forEach(r => {
      const conf = clamp01(r.confidence);
      const actual = r.outcome === "lose" ? 1 : r.outcome === "win" ? 0 : 0.5;
      const binIndex = Math.min(binCount - 1, Math.floor(conf * binCount));
      const bin = bins[binIndex];
      bin.sumConfidence += conf;
      bin.sumActual += actual;
      bin.total += 1;
      brierSum += (conf - actual) * (conf - actual);
      sharpnessSum += Math.abs(conf - 0.5);
    });
    const total = rounds.length;
    const computedBins = bins.map(bin => ({
      midpoint: bin.midpoint,
      avgConfidence: bin.total ? bin.sumConfidence / bin.total : bin.midpoint,
      actual: bin.total ? bin.sumActual / bin.total : bin.midpoint,
      total: bin.total,
    }));
    const ece = computedBins.reduce((acc, bin) => acc + Math.abs(bin.avgConfidence - bin.actual) * (bin.total / total), 0);
    return {
      bins: computedBins,
      ece,
      brier: total ? brierSum / total : null,
      sharpness: total ? sharpnessSum / total : 0,
    };
  }, [rounds]);

  const flipRate = useMemo(() => {
    if (rounds.length < 2) return 0;
    let flips = 0;
    for (let i = 1; i < rounds.length; i++) {
      if (rounds[i].ai !== rounds[i - 1].ai) {
        flips += 1;
      }
    }
    return flips / (rounds.length - 1);
  }, [rounds]);

  const activeCalibrationBins = calibrationSummary.bins.filter(bin => bin.total > 0);
  const reliabilityPolyline = activeCalibrationBins
    .map(bin => `${Math.round(bin.avgConfidence * 100)},${Math.round(100 - bin.actual * 100)}`)
    .join(" ");
  const ecePercent = calibrationSummary.ece !== null ? Math.round(calibrationSummary.ece * 1000) / 10 : null;
  const sharpnessPercent = Math.round(Math.min(1, calibrationSummary.sharpness * 2) * 100);
  const flipRatePercent = Math.round(flipRate * 100);

  const favoriteMovePercent = behaviorStats.favoriteMove ? Math.round(behaviorStats.favoritePct * 100) : null;

  const patternInfo = useMemo(() => {
    if (rounds.length < 6) return null;
    const sequence = rounds.map(r => r.player);
    const info = detectPatternNext(sequence);
    if (info.move && info.reason) {
      return { move: info.move, reason: info.reason };
    }
    return null;
  }, [rounds]);

  const periodPatternLabel = useMemo<React.ReactNode>(() => {
    if (!patternInfo) return "No strong cycle yet";
    const moveNode = moveLabelNode(patternInfo.move, { iconSize: 20, textClassName: "font-semibold" });
    if (patternInfo.reason.includes("three-beat")) {
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          Every 3 moves: often
          {moveNode}
        </span>
      );
    }
    if (patternInfo.reason.includes("Alternating")) {
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          Every other move:
          {moveNode}
        </span>
      );
    }
    if (patternInfo.reason.includes("triple repeat")) {
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          Hot streak:
          {moveNode}
        </span>
      );
    }
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        Leans toward
        {moveNode}
      </span>
    );
  }, [patternInfo]);

  const habitCards: Array<{
    key: "repeat" | "switch" | "transition" | "pattern";
    title: string;
    value: React.ReactNode;
    blurb: string;
  }> = [
    {
      key: "repeat" as const,
      title: "Repeat after win",
      value: totalRounds ? `${repeatAfterWinPct}%` : "—",
      blurb: "Same move?",
    },
    {
      key: "switch" as const,
      title: "Switch after loss",
      value: totalRounds ? `${switchAfterLossPct}%` : "—",
      blurb: "Change it up",
    },
    {
      key: "transition" as const,
      title: "Top transition",
      value: topTransitionDisplay ?? "—",
      blurb: "Common next step",
    },
    {
      key: "pattern" as const,
      title: "Period pattern",
      value: periodPatternLabel,
      blurb: "Any rhythm?",
    },
  ];

  const habitDrawerContent = useMemo<
    | {
        title: string;
        copy: React.ReactNode;
        visual: React.ReactNode;
      }
    | null
  >(() => {
    if (!habitDrawer) return null;
    if (habitDrawer === "repeat") {
      const stayedPct = totalRounds ? repeatAfterWinPct : 0;
      const changedPct = totalRounds ? Math.max(0, 100 - repeatAfterWinPct) : 0;
      return {
        title: "Repeat after win",
        copy: "After you win, this is how often you picked the same move again.",
        visual: (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between font-semibold text-slate-700">
              <span>Stayed same</span>
              <span>{totalRounds ? `${stayedPct}%` : "—"}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full rounded-full bg-sky-400" style={{ width: `${stayedPct}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Switched</span>
              <span>{totalRounds ? `${changedPct}%` : "—"}</span>
            </div>
          </div>
        ),
      };
    }
    if (habitDrawer === "switch") {
      const switchedPct = totalRounds ? switchAfterLossPct : 0;
      const stayedPct = totalRounds ? Math.max(0, 100 - switchAfterLossPct) : 0;
      return {
        title: "Switch after loss",
        copy: "After you lose, this is how often you changed your move.",
        visual: (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between font-semibold text-slate-700">
              <span>Switched</span>
              <span>{totalRounds ? `${switchedPct}%` : "—"}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${switchedPct}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Stayed</span>
              <span>{totalRounds ? `${stayedPct}%` : "—"}</span>
            </div>
          </div>
        ),
      };
    }
    if (habitDrawer === "transition") {
      const from = topTransition ? (topTransition.pair.split("→")[0] as Move) : null;
      const to = topTransition ? (topTransition.pair.split("→")[1] as Move) : null;
      const count = topTransition?.count ?? 0;
      return {
        title: "Top transition",
        copy: topTransition ? (
          <span>
            Your most common next step is {" "}
            {moveLabelNode(from!, { textClassName: "font-semibold" })}
            <span className="mx-1 text-slate-500" aria-hidden>
              →
            </span>
            {moveLabelNode(to!, { textClassName: "font-semibold" })} ({count} times).
          </span>
        ) : (
          "Your most common next step is waiting for more rounds."
        ),
        visual: (
          <div className="space-y-2 text-center text-sm">
            <div className="flex items-center justify-center gap-4">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900/80" aria-hidden="true">
                {from ? <MoveIcon move={from} size={36} /> : <span className="text-2xl">🔍</span>}
              </span>
              <span className="text-slate-500">→</span>
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900/80" aria-hidden="true">
                {to ? <MoveIcon move={to} size={36} /> : null}
              </span>
            </div>
            <div className="text-xs text-slate-500">
              {topTransition
                ? `${prettyMove(from!)} to ${prettyMove(to!)} pops up often.`
                : "Keep playing to reveal your go-to hop."}
            </div>
          </div>
        ),
      };
    }
    if (habitDrawer === "pattern") {
      return {
        title: "Period pattern",
        copy: patternInfo
          ? (
              <span>
                We spotted a rhythm: {periodPatternLabel}.
              </span>
            )
          : "No strong rhythm yet. If we spot one (like every 3 moves), we’ll show it.",
        visual: (
          <div className="space-y-2 text-center text-sm">
            <div className="flex items-center justify-center gap-4">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900/80" aria-hidden="true">
                {patternInfo?.move ? <MoveIcon move={patternInfo.move} size={36} /> : <span className="text-2xl">🌀</span>}
              </span>
              {patternInfo?.move ? <span className="text-2xl text-slate-400">↻</span> : null}
            </div>
            <div className="text-xs text-slate-500">
              {patternInfo ? patternInfo.reason : "We’re watching for repeating beats."}
            </div>
          </div>
        ),
      };
    }
    return null;
  }, [habitDrawer, totalRounds, repeatAfterWinPct, switchAfterLossPct, topTransition, patternInfo, periodPatternLabel]);

  const EXPORT_WARNING_TEXT = "Export may include personal/demographic information. You are responsible for how exported files are stored and shared. No liability is assumed.";
  const RESET_TRAINING_TOAST =
    "You’re starting a new training run. Your previous results are archived and linked as Profile History. You can review past vs new results in Statistics.";
  const sanitizeForFile = useCallback((value: string) => {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }, []);

  const handleSelectProfile = useCallback((id: string) => {
    if (!id) return;
    selectProfile(id);
  }, [selectProfile]);

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
    setLive(
      postTrainingLockActive
        ? "Settings opened. Training celebration stays visible while you make changes."
        : "Settings opened. Press Escape to close."
    );
  }, [postTrainingLockActive, setLive]);

  const showChallengeNeedsPredictorPrompt = useCallback(() => {
    showModernToast({
      variant: "danger",
      title: "Enable AI predictor to play Challenge",
      message: "Turn on the AI predictor in Settings to unlock Challenge mode.",
    });
    setToastMessage(null);
    setToastConfirm(null);
    setLive("Challenge needs the AI predictor. Turn it on from settings.");
  }, [setLive, setToastConfirm, setToastMessage, showModernToast]);

  const handleDisabledInsightClick = useCallback(() => {
    showModernToast({
      variant: "warning",
      title: "Enable AI predictor for Live Insight",
      message: "Turn on the AI predictor in Settings to view Live AI Insight during Practice matches.",
    });
  }, [showModernToast]);

  const handleCloseSettings = useCallback(
    (announce: boolean = true) => {
      setSettingsOpen(false);
      if (announce) {
        setLive("Settings closed.");
      }
    },
    [setLive]
  );

  const performCsvExport = useCallback(() => {
    if (!currentPlayer || !currentProfile || !hasExportData) return;
    const data = exportRoundsCsv();
    const blob = new Blob([data], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const profileSegment = sanitizeForFile(currentProfile.name || "profile") || "profile";
    a.download = `rps-${profileSegment}-rounds.csv`;
    a.click();
    URL.revokeObjectURL(url);
    const label = currentProfile.name ? ` for ${currentProfile.name}` : "";
    setToastMessage(`CSV export ready${label}. Check your downloads.`);
    setLive(`Rounds exported as CSV${label}. Download starting.`);
  }, [currentPlayer, currentProfile, exportRoundsCsv, hasExportData, sanitizeForFile, setLive, setToastMessage]);

  const handleLogOut = useCallback(() => {
    setLogoutAutoExport(false);
    logoutAutoExportRef.current = false;
    setToastMessage("Confirm log out? This will log you out into the welcome screen after the boot sequence.");
    setToastConfirm({
      confirmLabel: "Log out now",
      cancelLabel: "Cancel",
      context: "logout",
      onConfirm: () => {
        setToastConfirm(null);
        setToastMessage(null);
        if (logoutAutoExportRef.current && canExportData) {
          performCsvExport();
        }
        handleCloseSettings(false);
        openWelcome({
          announce: "Logging out. Boot sequence starting for the welcome intro.",
          resetPlayer: true,
          bootFirst: true,
          origin: "launch",
        });
      },
    });
    setLive("Log out requested. Confirm via toast to log out and reboot.");
  }, [
    canExportData,
    handleCloseSettings,
    logoutAutoExportRef,
    openWelcome,
    performCsvExport,
    setLive,
    setToastConfirm,
    setToastMessage,
  ]);

  const handleCreateProfile = useCallback(() => {
    if (settingsOpen) {
      handleCloseSettings();
    }
    if (!currentPlayer) {
      setPlayerModalOrigin("settings");
      setPlayerModalMode("create");
      return;
    }
    setPlayerModalOrigin("settings");
    setCreateProfileDialogAcknowledged(false);
    setCreateProfileDialogOpen(true);
  }, [currentPlayer, handleCloseSettings, setPlayerModalMode, settingsOpen]);

  const handleCloseCreateProfileDialog = useCallback(() => {
    setCreateProfileDialogOpen(false);
    setCreateProfileDialogAcknowledged(false);
  }, []);

  const handleConfirmCreateProfile = useCallback(() => {
    const created = createStatsProfile();
    if (!created) return;
    setCreateProfileDialogOpen(false);
    setCreateProfileDialogAcknowledged(false);
    const message = `New profile created: ${created.name}. Training starts now (${TRAIN_ROUNDS} rounds). Your previous results remain available in Statistics.`;
    setToastMessage(message);
    setLive(`New statistics profile created: ${created.name}. Training starts now (${TRAIN_ROUNDS} rounds). Previous results remain available in Statistics.`);
  }, [createStatsProfile, setToastMessage, setLive, TRAIN_ROUNDS]);

  const closeExportDialog = useCallback(
    (announce?: string) => {
      setExportDialogOpen(false);
      setExportDialogAcknowledged(false);
      setExportDialogSource(null);
      if (announce) {
        setLive(announce);
      }
    },
    [setLive]
  );

  const handleOpenExportDialog = useCallback(
    (source: "settings" | "stats", trigger?: HTMLButtonElement | null) => {
      if (!canExportData) return;
      exportDialogReturnFocusRef.current = trigger ?? null;
      setExportDialogSource(source);
      setExportDialogAcknowledged(false);
      setExportDialogOpen(true);
      setLive("Export confirmation open. Check the agreement box to continue.");
    },
    [canExportData, setLive]
  );

  const handleConfirmExport = useCallback(() => {
    if (!exportDialogAcknowledged || !canExportData) return;
    const source = exportDialogSource;
    performCsvExport();
    closeExportDialog();
    if (source === "settings") {
      handleCloseSettings(false);
    }
  }, [
    canExportData,
    closeExportDialog,
    exportDialogAcknowledged,
    exportDialogSource,
    handleCloseSettings,
    performCsvExport,
  ]);

  const handleCancelExport = useCallback(() => {
    closeExportDialog("Export cancelled.");
  }, [closeExportDialog]);

  useEffect(() => {
    if (!exportDialogOpen) {
      const trigger = exportDialogReturnFocusRef.current;
      if (trigger) {
        requestAnimationFrame(() => trigger.focus());
        exportDialogReturnFocusRef.current = null;
      }
      return;
    }
    const node = exportDialogRef.current;
    if (!node) return;
    const focusableSelector = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
    const getFocusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(focusableSelector)).filter(el => !el.hasAttribute("disabled"));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancelExport();
        return;
      }
      if (event.key === "Tab") {
        const focusable = getFocusable();
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first || document.activeElement === node) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => {
      const checkbox = exportDialogCheckboxRef.current;
      const focusTarget = checkbox ?? getFocusable()[0];
      focusTarget?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [exportDialogOpen, handleCancelExport]);

  useEffect(() => {
    if (!settingsOpen) {
      if (wasSettingsOpenRef.current) {
        wasSettingsOpenRef.current = false;
        settingsButtonRef.current?.focus();
      }
      return;
    }
    wasSettingsOpenRef.current = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseSettings();
    };
    window.addEventListener("keydown", onKey);
    const node = settingsPanelRef.current;
    if (node) {
      requestAnimationFrame(() => {
        const first =
          node.querySelector<HTMLElement>("[data-focus-first]") ??
          node.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        (first ?? node).focus();
      });
    }
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, handleCloseSettings]);

  useEffect(() => {
    if (!statsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStatsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const node = statsModalRef.current;
    if (node){
      const first = node.querySelector<HTMLElement>("[data-focus-first]");
      if (first) first.focus();
    }
    return () => window.removeEventListener("keydown", onKey);
  }, [statsOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (scene === "MATCH" && phase === "idle" && !shouldGateTraining) {
        if (e.key === "1") onSelect("rock");
        if (e.key === "2") onSelect("paper");
        if (e.key === "3") onSelect("scissors");
      }
      if (e.key === "Escape") {
        if (scene === "MATCH" && !trainingActive && !needsTraining) goToMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, phase, shouldGateTraining, trainingActive, needsTraining]);

  // Mixer setup (once)
  const mixerRef = useRef<HedgeMixer | null>(null);
  function getMixer(){
    if (!mixerRef.current){
      const expertInstances: Expert[] = [
        new FrequencyExpert(20, 1),
        new RecencyExpert(0.85, 1),
        new MarkovExpert(1, 1),
        new MarkovExpert(2, 1),
        new OutcomeExpert(1),
        new WinStayLoseShiftExpert(1),
        new PeriodicExpert(5,2,18,0.65),
        new BaitResponseExpert(1),
      ];
      mixerRef.current = new HedgeMixer(expertInstances, EXPERT_LABELS, 1.6);
    }
    return mixerRef.current!;
  }

  // AI pick via policy
  function policyCounterFromDist(dist: Dist, mode: AIMode){
    if (mode === "fair") return MOVES[Math.floor(rng()*3)] as Move;
    const lambda = mode === "ruthless" ? 4.0 : 2.0;
    const logits = MOVES.map(m => Math.log(Math.max(1e-6, dist[m])) * lambda);
    const mx = Math.max(...logits); const exps = logits.map(x=>Math.exp(x-mx)); const Z = exps.reduce((a,b)=>a+b,0);
    const probs = exps.map(v=> v/Z);
    const idx = probs[0] > probs[1] ? (probs[0] > probs[2] ? 0 : 2) : (probs[1] > probs[2] ? 1 : 2);
    const likelyPlayer = MOVES[idx];
    let move = counterMove(likelyPlayer);
    const epsilon = mode === "normal" ? 0.05 : 0.0; // tiny noise to feel less perfect
    if (rng() < epsilon) move = MOVES[Math.floor(rng()*3)] as Move;
    return move;
  }

  function aiChoose(): Move {
    decisionTraceRef.current = null;
    // Practice mode uses soft/none exploit unless user enabled predictorMode
    const useMix = isTrained && !trainingActive && predictorMode && aiMode !== "fair";
    if (!useMix){
      // fallback to light heuristics until we have signal
      const heur = predictNext(lastMoves, rng);
      if (!heur.move || (heur.conf ?? 0) < 0.34) {
        const fallbackMove = MOVES[Math.floor(rng()*3)] as Move;
        const trace: PendingDecision = {
          policy: "heuristic",
          heuristic: { predicted: heur.move, conf: heur.conf, reason: heur.reason || "Low confidence – random choice" },
          confidence: heur.conf ?? 0.33,
        };
        decisionTraceRef.current = trace;
        setLiveDecisionSnapshot(buildLiveSnapshot(trace, fallbackMove));
        const confValue = typeof heur.conf === "number" ? heur.conf : 0;
        fireAnalyticsEvent("ai_confidence_updated", { value: Math.round(confValue * 100) });
        return fallbackMove;
      }
      const predicted = heur.move as Move;
      const heuristicDist: Dist = { rock:0, paper:0, scissors:0 };
      heuristicDist[predicted] = 1;
      const move = policyCounterFromDist(heuristicDist, aiMode);
      const heurConf = heur.conf ?? 0.5;
      const trace: PendingDecision = {
        policy: "heuristic",
        heuristic: { predicted: heur.move, conf: heur.conf, reason: heur.reason },
        confidence: heurConf,
      };
      decisionTraceRef.current = trace;
      setLiveDecisionSnapshot(buildLiveSnapshot(trace, move));
      fireAnalyticsEvent("ai_confidence_updated", { value: Math.round(heurConf * 100) });
      return move;
    }
    const ctx: Ctx = { playerMoves: lastMoves, aiMoves: aiHistory, outcomes: outcomesHist, rng };
    const sessionMixer = ensureSessionMixer();
    const realtimeDist = sessionMixer.predict(ctx);
    const realtimeSnapshot = sessionMixer.snapshot();
    const realtimeExperts = realtimeSnapshot.experts.map(expert => ({
      name: expert.name,
      weight: clamp01(expert.weight),
      dist: normalize(expert.dist),
    }));

    const historyDisplay = ensureHistoryDisplayMixer();
    let historyDist: Dist = { ...UNIFORM };
    let historySnapshot: ReturnType<HedgeMixer["snapshot"]> | null = null;
    if (historyDisplay) {
      historyDist = historyDisplay.predict(ctx);
      historySnapshot = historyDisplay.snapshot();
    }
    const historyExperts = historySnapshot
      ? historySnapshot.experts.map(expert => ({
          name: expert.name,
          weight: clamp01(expert.weight),
          dist: normalize(expert.dist),
        }))
      : [];

    const blendWeights = computeBlendWeights(lastMoves.length, persistedModelRef.current);
    const blendedDist = blendDistributions(realtimeDist, historyDist, blendWeights);
    const move = policyCounterFromDist(blendedDist, aiMode);
    const confidence = Math.max(blendedDist.rock, blendedDist.paper, blendedDist.scissors);

    const realtimeTop = MOVES.reduce((best, m) => (realtimeDist[m] > realtimeDist[best] ? m : best), MOVES[0]);
    const historyTop = historyExperts.length
      ? MOVES.reduce((best, m) => (historyDist[m] > historyDist[best] ? m : best), MOVES[0])
      : null;
    const blendedTop = MOVES.reduce((best, m) => (blendedDist[m] > blendedDist[best] ? m : best), MOVES[0]);

    const combinedExperts = [
      ...realtimeExperts.map(expert => ({
        name: expert.name,
        weight: expert.weight * blendWeights.realtimeWeight,
        dist: expert.dist,
        source: "realtime" as const,
      })),
      ...historyExperts.map(expert => ({
        name: expert.name,
        weight: expert.weight * blendWeights.historyWeight,
        dist: expert.dist,
        source: "history" as const,
      })),
    ];

    const trace: PendingDecision = {
      policy: "mixer",
      mixer: {
        dist: blendedDist,
        experts: combinedExperts,
        counter: move,
        confidence,
        realtimeDist,
        historyDist,
        realtimeWeight: blendWeights.realtimeWeight,
        historyWeight: blendWeights.historyWeight,
        realtimeExperts,
        historyExperts,
        realtimeRounds: lastMoves.length,
        historyRounds: persistedModelRef.current?.roundsSeen ?? 0,
        conflict:
          historyTop && blendedTop && historyTop !== blendedTop
            ? { realtime: realtimeTop, history: historyTop }
            : null,
      },
      confidence,
    };
    decisionTraceRef.current = trace;
    setLiveDecisionSnapshot(buildLiveSnapshot(trace, move));
    fireAnalyticsEvent("ai_confidence_updated", { value: Math.round(confidence * 100) });
    return move;
  }

  function resetMatch(){
    setPlayerScore(0);
    setAiScore(0);
    if (scoreChangeTimeoutRef.current !== null) {
      window.clearTimeout(scoreChangeTimeoutRef.current);
      scoreChangeTimeoutRef.current = null;
    }
    matchScoreTotalRef.current = 0;
    setMatchScoreChange(null);
    setMatchScoreTotal(null);
    setRound(1);
    setLastMoves([]);
    setAiHistory([]);
    setOutcomesHist([]);
    setOutcome(undefined);
    setAiPick(undefined);
    setPlayerPick(undefined);
    setPhase("idle");
    setResultBanner(null);
    decisionTraceRef.current = null;
    currentMatchRoundsRef.current = [];
    lastDecisionMsRef.current = null;
    roundStartRef.current = performance.now();
    setLiveDecisionSnapshot(null);
    setLiveInsightRounds([]);
    resetSessionMixer();
  }

  function startMatch(mode?: Mode, opts: { silent?: boolean } = {}){
    const { silent = false } = opts;
    if (!silent) {
      armAudio();
      audio.whoosh();
    }
    clearRobotReactionTimers();
    setRobotResultReaction(null);
    resetMatch();
    insightDismissedForMatchRef.current = false;
    if (insightPreferred) {
      openInsightPanel(null, { focus: false, persistPreference: false });
    }
    aiStreakRef.current = 0;
    youStreakRef.current = 0;
    matchStartRef.current = new Date().toISOString();
    const matchMode: Mode = mode ?? selectedMode ?? "practice";
    const matchId = makeLocalId("match");
    currentMatchIdRef.current = matchId;
    if (matchMode === "challenge") {
      matchScoreTotalRef.current = 0;
      setMatchScoreTotal(0);
    } else {
      matchScoreTotalRef.current = 0;
      setMatchScoreTotal(null);
    }
    setMatchScoreChange(null);
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    roundStartRef.current = startedAt;
    lastDecisionMsRef.current = null;
    devInstrumentation.matchStarted({
      matchId,
      mode: matchMode,
      difficulty: aiMode,
      bestOf,
      startedAt,
      playerId: currentPlayer?.id ?? null,
      profileId: currentProfile?.id ?? null,
      playerName: currentPlayer?.playerName ?? null,
      profileName: currentProfile?.name ?? null,
    });
    if (mode) setSelectedMode(mode);
    setScene("MATCH");
  }

  function resetTraining(){
    trainingAnnouncementsRef.current.clear();
    setTrainingCalloutQueue([]);
    let createdNewProfile = false;
    if (currentProfile) {
      const forked = forkProfileVersion(currentProfile.id);
      if (forked) {
        createdNewProfile = true;
      } else {
        updateStatsProfile(currentProfile.id, { trainingCount: 0, trained: false });
      }
      clearModelStateForProfile(currentProfile.id);
    }
    if (typeof window !== "undefined" && modelPersistTimeoutRef.current !== null) {
      window.clearTimeout(modelPersistTimeoutRef.current);
      modelPersistTimeoutRef.current = null;
    }
    modelPersistPendingRef.current = false;
    loadPersistedModel(null);
    resetSessionMixer();
    setPredictorMode(false);
    setAiMode("fair");
    setTrainingActive(false);
    startMatch("practice", { silent: true });
    setToastMessage(RESET_TRAINING_TOAST);
    if (createdNewProfile) {
      setLive("New statistics profile created for training reset.");
    }
  }

  function beginTrainingSession(){
    setSelectedMode('practice');
    resetMatch();
    setTrainingActive(true);
  }

  function onSelect(m: Move){
    if (phase !== "idle") return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (roundStartRef.current !== null) {
      const elapsed = Math.max(0, Math.round(now - roundStartRef.current));
      lastDecisionMsRef.current = elapsed;
    } else {
      lastDecisionMsRef.current = null;
    }
    devInstrumentation.moveSelected({
      matchId: currentMatchIdRef.current,
      roundNumber: round,
      at: now,
    });
    setPlayerPick(m);
    setPhase("selected");
    setLive(`You selected ${m}.`);
    audio.pop();
    setTimeout(startCountdown, 140);
  }

  function reveal(){
    const player = playerPick; if (!player) return;
    const ai = aiChoose(); setAiPick(ai); setAiHistory(h=>[...h, ai]); setPhase("reveal");
    const modeForTiming: Mode = selectedMode ?? "practice";
    const holdMs = matchTimings[modeForTiming].revealHoldMs;
    setTimeout(()=>{
      const res = resolveOutcome(player, ai); setOutcome(res); setPhase("resolve");
      // Online update mixer with context prior to adding current move
      const ctx: Ctx = { playerMoves: lastMoves, aiMoves: aiHistory, outcomes: outcomesHist, rng };
      const shouldUpdateHistory = trainingActive || (predictorMode && aiMode !== "fair");
      const shouldUpdateSession = isTrained && !trainingActive && predictorMode && aiMode !== "fair";
      if (shouldUpdateHistory) {
        const historyMixer = ensureHistoryMixer();
        historyMixer.update(ctx, player);
        roundsSeenRef.current += 1;
        scheduleModelPersist();
      }
      if (shouldUpdateSession) {
        const sessionMixer = ensureSessionMixer();
        sessionMixer.update(ctx, player);
      }
      setOutcomesHist(o=>[...o, res]);
      setLive(`AI chose ${ai}. ${res === 'win' ? 'You win this round.' : res === 'lose' ? 'You lose this round.' : 'Tie.'}`);
      if (res === "win") audio.thud(); else if (res === "lose") audio.snare(); else audio.tie();
      setTimeout(()=>{
        recordRound(player, ai, res);
        if (trainingActive && currentProfile) {
          const nextCount = Math.min(TRAIN_ROUNDS, trainingCount + 1);
          updateStatsProfile(currentProfile.id, {
            trainingCount: nextCount,
            trained: nextCount >= TRAIN_ROUNDS ? true : currentProfile.trained,
          });
        }
        setPhase("feedback");
        setLastMoves(prev=>[...prev, player]);
      }, 150);
    }, holdMs);
  }

  // Commit score once when outcome resolved
  useEffect(() => {
    if (phase !== "resolve" || outcome == null) return;
    if (trainingActive) return;
    if (outcome === "win") setPlayerScore(s => s + 1);
    if (outcome === "lose") setAiScore(s => s + 1);
  }, [phase, outcome, trainingActive]);

  // Training progress announcements + completion
  useEffect(() => {
    if (!trainingActive) {
      if (!needsTraining) trainingAnnouncementsRef.current.clear();
      if (trainingCalloutQueue.length) {
        setTrainingCalloutQueue([]);
      }
      return;
    }
    const progress = Math.min(trainingCount / TRAIN_ROUNDS, 1);
    const thresholds = [0.25, 0.5, 0.75, 1];
    thresholds.forEach(threshold => {
      if (progress >= threshold && !trainingAnnouncementsRef.current.has(threshold)) {
        trainingAnnouncementsRef.current.add(threshold);
        const percentage = Math.round(threshold * 100);
        const message = `AI training ${percentage}% complete.`;
        setTrainingCalloutQueue(prev => [...prev, message]);
      }
    });
  }, [trainingActive, trainingCount, needsTraining, trainingCalloutQueue.length]);

  useEffect(() => {
    if (!trainingActive) return;
    if (trainingCount < TRAIN_ROUNDS) return;
    setTrainingActive(false);
    if (currentProfile && !currentProfile.trained) {
      updateStatsProfile(currentProfile.id, { trained: true });
    }
    trainingAnnouncementsRef.current.clear();
  }, [trainingActive, trainingCount, currentProfile, updateStatsProfile]);

  useEffect(() => {
    if (!trainingActive) return;
    if (!trainingCalloutQueue.length) return;
    if (robotResultReaction) return;
    if (toastMessage) return;
    const [next, ...rest] = trainingCalloutQueue;
    setTrainingCalloutQueue(rest);
    setToastMessage(next);
    setLive(next);
  }, [trainingActive, trainingCalloutQueue, robotResultReaction, toastMessage, setLive]);

  useEffect(() => {
    if (previousTrainingCountRef.current < TRAIN_ROUNDS && trainingCount >= TRAIN_ROUNDS) {
      if (currentProfile && !currentProfile.predictorDefault) {
        updateStatsProfile(currentProfile.id, { predictorDefault: true });
      }
      if (!predictorMode) {
        setPredictorMode(true);
      }
      if (currentProfile && !currentProfile.seenPostTrainingCTA && !postTrainingCtaAcknowledged) {
        setPostTrainingCtaOpen(true);
        setHelpGuideOpen(false);
        setLive("Training complete. You’re ready for Modes.");
        if (scene !== "MODE") {
          goToMode();
        }
      }
    }
    if (trainingCount < TRAIN_ROUNDS) {
      setPostTrainingCtaOpen(false);
    }
    previousTrainingCountRef.current = trainingCount;
  }, [
    currentProfile,
    postTrainingCtaAcknowledged,
    predictorMode,
    scene,
    trainingCount,
    updateStatsProfile,
  ]);

  useEffect(() => {
    if (!currentProfile) {
      if (postTrainingCtaOpen) {
        setPostTrainingCtaOpen(false);
      }
      return;
    }
    if (postTrainingCtaAcknowledged) {
      if (postTrainingCtaOpen) {
        setPostTrainingCtaOpen(false);
      }
      return;
    }
    if (trainingActive || needsTraining) {
      if (postTrainingCtaOpen) {
        setPostTrainingCtaOpen(false);
      }
      return;
    }
    if (currentProfile.trainingCount >= TRAIN_ROUNDS && !currentProfile.seenPostTrainingCTA) {
      if (!postTrainingCtaOpen) {
        setPostTrainingCtaOpen(true);
        setHelpGuideOpen(false);
      }
      if (scene !== "MODE") {
        goToMode();
      }
    } else if (postTrainingCtaOpen) {
      setPostTrainingCtaOpen(false);
    }
  }, [
    currentProfile,
    needsTraining,
    postTrainingCtaAcknowledged,
    postTrainingCtaOpen,
    scene,
    trainingActive,
  ]);

  // Failsafes: if something stalls, advance automatically
  useEffect(()=>{ if (phase === "selected"){ const t = setTimeout(()=>{ if (phase === "selected") startCountdown(); }, 500); return ()=> clearTimeout(t); } }, [phase]);
  useEffect(()=>{
    if (phase !== "countdown") return;
    const modeForTiming: Mode = selectedMode ?? "practice";
    const interval = matchTimings[modeForTiming].countdownTickMs;
    const failSafeMs = Math.max(interval * 4, interval * 3 + 600);
    const t = setTimeout(()=>{ if (phase === "countdown"){ clearCountdown(); reveal(); } }, failSafeMs);
    return ()=> clearTimeout(t);
  }, [phase, selectedMode, matchTimings]);
  useEffect(()=>{ return ()=> clearCountdown(); },[]);

  // Next round or end match
  useEffect(() => {
    if (phase !== "feedback") return;
    const modeForTiming: Mode = selectedMode ?? "practice";
    const delayBase = matchTimings[modeForTiming].resultBannerMs;
    const delay = trainingActive
      ? Math.min(delayBase, 600)
      : delayBase;
    const t = setTimeout(() => {
      if (trainingActive) {
        setRound(r => r + 1);
        setPlayerPick(undefined);
        setAiPick(undefined);
        setOutcome(undefined);
        setPhase("idle");
        return;
      }
      const totalNeeded = Math.ceil(bestOf / 2);
      const someoneWon = playerScore >= totalNeeded || aiScore >= totalNeeded;
      if (someoneWon) {
        const banner = playerScore > aiScore ? "Victory" : playerScore < aiScore ? "Defeat" : "Tie";
        const endedAt = new Date().toISOString();
        const totalRounds = outcomesHist.length;
        const aiWins = outcomesHist.filter(o => o === "lose").length;
        const switchRate = computeSwitchRate(lastMoves);
        const matchMode: Mode = selectedMode ?? "practice";
        const leaderboardEligible = matchMode === "challenge";
        const matchScore = leaderboardEligible ? computeMatchScore(currentMatchRoundsRef.current) : null;
        logMatch({
          clientId: currentMatchIdRef.current,
          startedAt: matchStartRef.current,
          endedAt,
          mode: matchMode,
          bestOf,
          difficulty: aiMode,
          score: { you: playerScore, ai: aiScore },
          rounds: totalRounds,
          aiWinRate: totalRounds ? aiWins / totalRounds : 0,
          youSwitchedRate: switchRate,
          notes: undefined,
          leaderboardScore: leaderboardEligible ? matchScore?.total : undefined,
          leaderboardMaxStreak: leaderboardEligible ? matchScore?.maxStreak : undefined,
          leaderboardRoundCount: leaderboardEligible ? matchScore?.rounds : undefined,
          leaderboardTimerBonus: leaderboardEligible ? matchScore?.timerBonus : undefined,
          leaderboardBeatConfidenceBonus: leaderboardEligible ? matchScore?.beatConfidenceBonus : undefined,
          leaderboardType: leaderboardEligible ? "Challenge" : "Practice Legacy",
        });
        devInstrumentation.matchEnded({
          matchId: currentMatchIdRef.current,
          endedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
          playerId: currentPlayer?.id ?? null,
          profileId: currentProfile?.id ?? null,
        });
        currentMatchRoundsRef.current = [];
        matchStartRef.current = new Date().toISOString();
        currentMatchIdRef.current = makeLocalId("match");
        setResultBanner(banner);
        if (banner === "Victory") audio.win();
        else if (banner === "Defeat") audio.lose();
        else audio.tie();
        setScene("RESULTS");
        return;
      }
      setRound(r => r + 1);
      setPlayerPick(undefined);
      setAiPick(undefined);
      setOutcome(undefined);
      setPhase("idle");
    }, delay);
    return () => clearTimeout(t);
  }, [phase, trainingActive, playerScore, aiScore, bestOf, matchTimings, selectedMode]);

  useEffect(() => {
    if (scene !== "MATCH") return;
    if (phase !== "feedback") return;
    if (!outcome) return;
    if (trainingActive) return;
    const modeForReaction: Mode = selectedMode ?? "practice";
    const reaction: RobotReaction = modeForReaction === "challenge"
      ? outcome === "win"
        ? {
            emoji: "😏",
            body: "Lucky hit! Don’t get cocky!",
            label: "Robot teases after you winning the round: Lucky hit. Don’t get cocky.",
            variant: "sad",
          }
        : outcome === "tie"
          ? {
              emoji: "🤨",
              body: "Not bad! But I’m still catching up!",
              label: "Robot comments on a tied round: Not bad, but still catching up.",
              variant: "meh",
            }
          : {
              emoji: "😎",
              body: "Too easy! Try to keep up!",
              label: "Robot boasts after you losing the round: Too easy. Try to keep up.",
              variant: "happy",
            }
      : outcome === "win"
        ? {
            emoji: "😊",
            body: "Nice counter!",
            label: "Robot congratulates your win: Nice counter.",
            variant: "sad",
          }
        : outcome === "tie"
          ? {
              emoji: "🤝",
              body: "Even match! Try mixing it up!",
              label: "Robot suggests mixing it up after a tie.",
              variant: "meh",
            }
          : {
              emoji: "🤍",
              body: "I saw a pattern! Can you break it?",
              label: "Robot encourages you after a loss to break the pattern.",
              variant: "happy",
            };
    clearRobotReactionTimers();
    setRobotResultReaction(reaction);
    const reactionDuration = matchTimings[modeForReaction].robotRoundReactionMs;
    const restDuration = matchTimings[modeForReaction].robotRoundRestMs;
    const timeoutId = window.setTimeout(() => {
      if (robotResultTimeoutRef.current !== timeoutId) return;
      robotResultTimeoutRef.current = null;
      startRobotRest(restDuration, "round");
    }, reactionDuration);
    robotResultTimeoutRef.current = timeoutId;
  }, [
    scene,
    phase,
    outcome,
    selectedMode,
    trainingActive,
    matchTimings,
    clearRobotReactionTimers,
    startRobotRest,
  ]);

  useEffect(() => {
    if (scene !== "RESULTS" || !resultBanner) return;
    const modeForReaction: Mode = selectedMode ?? "practice";
    const reaction: RobotReaction = (() => {
      if (modeForReaction === "practice") {
        return resultBanner === "Victory"
          ? {
              emoji: "😊",
              body: "Nice counter!",
              label: "Robot encourages you: Nice counter.",
              variant: "sad",
            }
          : resultBanner === "Defeat"
            ? {
                emoji: "🤍",
                body: "I saw a pattern—can you break it?",
                label: "Robot reflects on the loss and encourages you to break the pattern.",
                variant: "happy",
              }
            : {
                emoji: "🤝",
                body: "Even match—try mixing it up.",
                label: "Robot suggests mixing it up after an even match.",
                variant: "meh",
              };
      }
      return resultBanner === "Victory"
        ? { emoji: "😮", label: "Robot is surprised by the loss.", variant: "sad" }
        : resultBanner === "Defeat"
          ? { emoji: "😄", label: "Robot celebrates the win.", variant: "happy" }
          : { emoji: "🤔", label: "Robot is thinking about the tie.", variant: "meh" };
    })();
    clearRobotReactionTimers();
    setRobotResultReaction(reaction);
    const reactionDuration = matchTimings[modeForReaction].robotResultReactionMs;
    const restDuration = matchTimings[modeForReaction].robotResultRestMs;
    const timeoutId = window.setTimeout(() => {
      if (robotResultTimeoutRef.current !== timeoutId) return;
      robotResultTimeoutRef.current = null;
      startRobotRest(restDuration, "result");
    }, reactionDuration);
    robotResultTimeoutRef.current = timeoutId;
  }, [scene, resultBanner, selectedMode, matchTimings, clearRobotReactionTimers, startRobotRest]);

  useEffect(() => {
    if (scene === "RESULTS" || scene === "MATCH" || scene === "MODE") return;
    setRobotResultReaction(null);
    clearRobotReactionTimers();
  }, [scene, clearRobotReactionTimers]);

  useEffect(() => {
    return () => {
      clearRobotReactionTimers();
    };
  }, [clearRobotReactionTimers]);

  // Helpers
  function tryVibrate(ms:number){ if ((navigator as any).vibrate) (navigator as any).vibrate(ms); }
  function bannerColor(){ if (resultBanner === "Victory") return "bg-green-500"; if (resultBanner === "Defeat") return "bg-rose-500"; return "bg-amber-500"; }
  // navigation + timer guards to avoid stuck overlays when returning to MODE
  const timersRef = useRef<number[]>([]);
  const addT = (fn:()=>void, ms:number)=>{ const id = window.setTimeout(fn, ms); timersRef.current.push(id); return id; };
  const clearTimers = ()=>{ timersRef.current.forEach(id=> clearTimeout(id)); timersRef.current = []; };
  function goToMode(){
    clearCountdown();
    clearTimers();
    resetMatch();
    setWipeRun(false);
    setSelectedMode(null);
    setScene("MODE");
  }
  function goToMatch(){ clearTimers(); startMatch(selectedMode ?? "practice"); }

  // ---- Mode selection flow ----
  function handleModeSelect(mode: Mode){
    if (needsTraining && mode !== "practice") return;
    if (mode === "challenge" && !predictorMode) {
      showChallengeNeedsPredictorPrompt();
      return;
    }
    if (postTrainingCtaOpen) {
      acknowledgePostTrainingCta();
    }
    armAudio(); audio.cardSelect(); setSelectedMode(mode); setLive(`${modeLabel(mode)} mode selected. Loading match.`);
    addT(()=>{ audio.whooshShort(); }, 140); // morph start cue
    const graphicBudget = 1400; addT(()=>{ startSceneWipe(mode); }, graphicBudget);
  }
  function startSceneWipe(mode: Mode){ setWipeRun(true); audio.crossFadeMusic(0.3); addT(()=>{ setWipeRun(false); startMatch(mode); }, 400); }

  // ---- DEV SELF-TESTS (run once in dev) ----
  useEffect(()=>{
    if (import.meta.env.PROD) return;
    console.groupCollapsed("RPS self-tests");
    const cases: [Move,Move,string][] = [["rock","rock","tie"],["rock","paper","lose"],["rock","scissors","win"],["paper","rock","win"],["paper","paper","tie"],["paper","scissors","lose"],["scissors","rock","lose"],["scissors","paper","win"],["scissors","scissors","tie"]];
    for (const [p,a,exp] of cases){ console.assert(resolveOutcome(p,a)===exp, `resolveOutcome(${p},${a}) !== ${exp}`); }
    console.assert(mostFrequentMove(["rock","rock","paper"]) === "rock", "mostFrequentMove failed");
    console.assert(mostFrequentMove([]) === null, "mostFrequentMove empty failed");
    console.assert(counterMove("rock") === "paper" && counterMove("paper") === "scissors" && counterMove("scissors") === "rock", "counterMove failed");
    const cycle = (m:Move)=>counterMove(counterMove(counterMove(m))); console.assert(cycle("rock") === "rock" && cycle("paper") === "paper" && cycle("scissors") === "scissors", "counterMove cycle failed");
    const hist1: Move[] = ["rock","paper","rock","paper","rock"]; console.assert(markovNext(hist1).move === "paper", "markovNext failed");
    const hist2: Move[] = ["rock","paper","rock","paper"]; console.assert(detectPatternNext(hist2).move === "rock", "detectPatternNext L2 failed");
    // Mixer sanity: expert that predicts constant 'rock' should win on rock-heavy stream
    const mix = new HedgeMixer([new FrequencyExpert(20,1)], ["FrequencyExpert"], 1.6);
    let ctx: Ctx = { playerMoves: [], aiMoves: [], outcomes: [], rng: ()=>Math.random() };
    ["rock","rock","paper","rock","rock"].forEach((m,i)=>{ const d = mix.predict(ctx); const top = (Object.keys(d) as Move[]).reduce((a,b)=> d[a]>d[b]?a:b); console.assert(["rock","paper","scissors"].includes(top), "dist valid"); mix.update(ctx, m as Move); ctx = { ...ctx, playerMoves:[...ctx.playerMoves, m as Move] } });
    console.groupEnd();
  },[]);

  return (
    <>
      <div
        className="app-theme"
        data-theme={resolvedTheme}
        data-theme-preference={themePreference}
        style={themeVariables as React.CSSProperties}
      >
        <div
          className={`relative flex min-h-screen flex-col select-none overflow-x-hidden overflow-y-auto ${isDarkTheme ? "text-slate-100" : ""}`}
          style={{ fontSize: `${textScale * 16}px` }}
        >
          <style>{style}</style>

          {/* Parallax background */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-gradient-to-b" style={backgroundGradientStyle} />
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
              className="absolute -top-20 left-0 right-0 h-60"
              style={{ opacity: orbOpacity }}
            >
              <div
                className="absolute left-10 top-10 h-40 w-40 rounded-full"
                style={orbStyles.primary as React.CSSProperties}
              />
              <div
                className="absolute right-16 top-8 h-24 w-24 rounded-full"
                style={orbStyles.secondary as React.CSSProperties}
              />
              <div
                className="absolute left-1/2 top-2 h-28 w-28 rounded-full"
                style={orbStyles.tertiary as React.CSSProperties}
              />
            </motion.div>
          </div>

      <LiveRegion message={live} />

      {modernToast && (() => {
        const variantStyles = MODERN_TOAST_STYLES[modernToast.variant];
        return (
          <div className="pointer-events-none fixed inset-0 z-[96] flex items-center justify-center p-4">
            <div
              role="alert"
              aria-live="assertive"
              className={`${MODERN_TOAST_BASE_CLASSES} ${variantStyles.container}`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${variantStyles.iconWrapper}`}
                aria-hidden="true"
              >
                {variantStyles.icon}
              </div>
              <div className="flex-1 space-y-1">
                <p className={variantStyles.title}>{modernToast.title}</p>
                <p className="text-sm leading-relaxed text-slate-600">{modernToast.message}</p>
              </div>
              <button
                type="button"
                onClick={dismissModernToast}
                className={variantStyles.dismiss}
                aria-label="Dismiss alert"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })()}

      {toastMessage && toastConfirm ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 px-4"
          onClick={() => {
            setToastConfirm(null);
            setToastMessage(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-slate-800 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="text-base font-semibold text-slate-900">Confirm action</div>
              <p className="text-sm text-slate-600">{toastMessage}</p>
              {toastConfirm.context === "logout" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-600">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      checked={logoutAutoExport}
                      onChange={event => setLogoutAutoExport(event.target.checked)}
                      disabled={!canExportData}
                      data-dev-label="logout.autoExport"
                    />
                    <span className="leading-snug">
                      Auto-export my match data before logging out.
                      {!canExportData && (
                        <>
                          <br />
                          <span className="text-xs text-slate-500">
                            No exportable data yet — play a match to enable this option.
                          </span>
                        </>
                      )}
                    </span>
                  </label>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  onClick={() => {
                    setToastConfirm(null);
                    setToastMessage(null);
                  }}
                >
                  {toastConfirm.cancelLabel ?? "Cancel"}
                </button>
                <button
                  type="button"
                  className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-700 
                                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
                  onClick={() => {
                    toastConfirm.onConfirm();
                  }}
                >
                  {toastConfirm.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        toastMessage && (
          <div className="fixed top-20 right-4 z-[95] flex flex-col items-end gap-2">
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg bg-slate-900/90 px-4 py-3 text-sm text-white shadow-lg"
            >
              <div>{toastMessage}</div>
            </div>
            <button
              type="button"
              className="rounded-lg bg-white/80 px-3 py-1 text-xs font-semibold text-slate-800 shadow hover:bg-white"
              onClick={() => setToastReaderOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={toastReaderOpen}
            >
              Open toast reader
            </button>
          </div>
        )
      )}

      {helpToast && (
        <div className="fixed bottom-6 right-4 z-[94]">
          <div
            role="status"
            aria-live="polite"
            className="w-72 rounded-xl bg-white/95 px-4 py-3 text-sm text-slate-700 shadow-xl ring-1 ring-slate-200"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">{helpToast.title}</p>
              <p className="text-sm leading-relaxed text-slate-600">{helpToast.message}</p>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="inline-flex items-center rounded-lg bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-slate-900"
                onClick={() => setHelpToast(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpCenter
        open={helpCenterOpen}
        onClose={() => {
          setHelpCenterOpen(false);
          setLive("Help closed.");
          requestAnimationFrame(() => helpButtonRef.current?.focus());
        }}
        questions={AI_FAQ_QUESTIONS}
        activeQuestionId={helpActiveQuestionId}
        onChangeActiveQuestion={setHelpActiveQuestionId}
      />

      <AnimatePresence>
        {toastReaderOpen && toastMessage && (
          <motion.div
            className="fixed inset-0 z-[96] grid place-items-center bg-slate-900/40 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setToastReaderOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-[min(480px,100%)] space-y-4 rounded-2xl bg-white p-5 text-slate-700 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="toast-reader-title"
              onClick={e => e.stopPropagation()}
            >
              <h3 id="toast-reader-title" className="text-base font-semibold text-slate-900">
                Latest message
              </h3>
              <p className="text-sm leading-relaxed text-slate-600">{toastMessage}</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  onClick={() => {
                    setToastMessage(null);
                    setToastReaderOpen(false);
                  }}
                >
                  Dismiss message
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-sky-700"
                  onClick={() => setToastReaderOpen(false)}
                  data-focus-first
                  ref={toastReaderCloseRef}
                >
                  Close reader
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {exportDialogOpen && (
          <motion.div
            className="fixed inset-0 z-[97] flex items-end justify-center bg-slate-900/50 px-4 pb-10 sm:items-center sm:pb-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancelExport}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-200 sm:rounded-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="export-confirm-title"
              aria-describedby="export-confirm-body"
              onClick={event => event.stopPropagation()}
              ref={exportDialogRef}
            >
              <form
                className="space-y-4"
                onSubmit={event => {
                  event.preventDefault();
                  handleConfirmExport();
                }}
                onKeyDown={event => {
                  if (event.key === "Enter" && !exportDialogAcknowledged) {
                    event.preventDefault();
                  }
                }}
              >
                <div className="space-y-2">
                  <h2 id="export-confirm-title" className="text-base font-semibold text-slate-900">
                    Export data (CSV)
                  </h2>
                  <p id="export-confirm-body" className="text-sm leading-relaxed text-slate-600">
                    {EXPORT_WARNING_TEXT}
                  </p>
                </div>
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={exportDialogAcknowledged}
                    onChange={event => setExportDialogAcknowledged(event.target.checked)}
                    className="mt-1"
                    ref={exportDialogCheckboxRef}
                  />
                  <span>“I understand and agree.”</span>
                </label>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleCancelExport}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!exportDialogAcknowledged}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Confirm &amp; Download
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {resetDialogOpen && (
          <motion.div
            className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/50 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleResetDialogClose}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-[min(520px,100%)] rounded-2xl bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-training-title"
              aria-describedby="reset-training-body"
              onClick={e => e.stopPropagation()}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 id="reset-training-title" className="text-lg font-semibold text-slate-900">
                    Reset AI Training (Visible Only)
                  </h2>
                  <p id="reset-training-body" className="text-sm text-slate-600">
                    This will restart training for your current statistics profile view. Historical round/match data is not deleted and stays available to developers for later analysis. A new linked profile snapshot will track your fresh training.
                  </p>
                </div>
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={resetDialogAcknowledged}
                    onChange={e => setResetDialogAcknowledged(e.target.checked)}
                    className="mt-1"
                  />
                  <span>I understand my past results remain archived and visible to developers.</span>
                </label>
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleResetDialogClose}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmTrainingReset}
                    disabled={!resetDialogAcknowledged}
                    className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow ${resetDialogAcknowledged ? "bg-sky-600 hover:bg-sky-700" : "bg-slate-400 cursor-not-allowed"}`}
                  >
                    Reset training
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createProfileDialogOpen && (
          <motion.div
            className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/50 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseCreateProfileDialog}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-[min(520px,100%)] rounded-2xl bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-profile-title"
              aria-describedby="create-profile-body"
              onClick={e => e.stopPropagation()}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 id="create-profile-title" className="text-lg font-semibold text-slate-900">
                    Create New Statistics Profile
                  </h2>
                  <p id="create-profile-body" className="text-sm text-slate-600">
                    New statistics profile requires retraining ({TRAIN_ROUNDS} rounds) before normal play. Existing stats remain
                    available in Statistics but do not merge.
                  </p>
                </div>
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={createProfileDialogAcknowledged}
                    onChange={e => setCreateProfileDialogAcknowledged(e.target.checked)}
                    className="mt-1"
                  />
                  <span>I understand retraining is required and past results won't merge.</span>
                </label>
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseCreateProfileDialog}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCreateProfile}
                    disabled={!createProfileDialogAcknowledged}
                    className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow ${createProfileDialogAcknowledged ? "bg-sky-600 hover:bg-sky-700" : "bg-slate-400 cursor-not-allowed"}`}
                  >
                    Create Profile
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {restoreDialogOpen && (
          <motion.div
            className="fixed inset-0 z-[91] grid place-items-center bg-slate-900/45 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-[min(520px,100%)] rounded-2xl bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="restore-profile-title"
              aria-describedby="restore-profile-body"
              onClick={e => e.stopPropagation()}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 id="restore-profile-title" className="text-lg font-semibold text-slate-900">
                    Load saved player
                  </h2>
                  <p id="restore-profile-body" className="text-sm text-slate-600">
                    Choose an existing player profile stored on this device.
                  </p>
                </div>
                <label className="text-sm font-medium text-slate-700">
                  Player
                  <select
                    value={restoreSelectedPlayerId ?? ""}
                    onChange={e => setRestoreSelectedPlayerId(e.target.value || null)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-inner"
                  >
                    {players.length === 0 ? (
                      <option value="">No saved players</option>
                    ) : (
                      players.map(player => (
                        <option key={player.id} value={player.id}>
                          {player.playerName}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                {selectedRestorePlayer ? (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-800">{selectedRestorePlayer.playerName}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Grade {selectedRestorePlayer.grade}
                      {selectedRestorePlayer.needsReview ? " • Needs review" : ""}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                    No saved players yet.
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleRestoreBack}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleRestoreConfirm}
                    disabled={!restoreSelectedPlayerId}
                    className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow ${restoreSelectedPlayerId ? "bg-sky-600 hover:bg-sky-700" : "bg-slate-400 cursor-not-allowed"}`}
                  >
                    Load profile
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header / Settings */}
      {showMainUi && !hideUiDuringModeTransition && (
        <motion.div
          layout
          className="absolute top-0 left-0 right-0 z-[75] flex items-center justify-between p-3"
        >
          <motion.h1 layout className="text-2xl font-extrabold tracking-tight text-sky-700 drop-shadow-sm">RPS Lab</motion.h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                ref={themeButtonRef}
                type="button"
                className={`inline-flex items-center justify-center rounded-xl px-2.5 py-1.5 text-base shadow transition ${
                  themeMenuOpen ? "bg-sky-600 text-white" : "bg-white/70 hover:bg-white text-sky-900"
                }`}
                aria-haspopup="menu"
                aria-expanded={themeMenuOpen}
                aria-label={headerThemeLabel}
                title={headerThemeLabel}
                onClick={() => {
                  if (themeMenuOpen) {
                    setThemeMenuOpen(false);
                  } else {
                    suspendInsightPanelForHeader();
                    setThemeMenuOpen(true);
                  }
                }}
                data-dev-label="hdr.theme"
              >
                <span aria-hidden>{headerThemeIcon}</span>
                <span className="sr-only">{headerThemeLabel}</span>
              </button>
              <AnimatePresence>
                {themeMenuOpen && (
                  <motion.div
                    ref={themeMenuRef}
                    key="theme-menu"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                    className="absolute left-0 top-full z-[85] mt-2 w-52 rounded-xl bg-white/95 p-2 text-sm shadow-xl ring-1 ring-slate-200"
                    role="menu"
                    aria-label="Theme"
                  >
                    {themeOptions.map(option => {
                      const isActive = option.value === themePreference;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleThemeMenuSelect(option.value)}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition ${
                            isActive
                              ? "bg-sky-600 text-white shadow"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                          role="menuitemradio"
                          aria-checked={isActive}
                          data-dev-label={`hdr.theme.${option.value}`}
                        >
                          <span className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-2">
                              <span aria-hidden className="text-base">
                                {option.icon}
                              </span>
                              <span className="font-semibold">{option.label}</span>
                            </span>
                            <span className="text-xs text-slate-500">{option.description}</span>
                          </span>
                          {isActive && (
                            <span aria-hidden className="text-xs font-semibold">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {trainingActive && (
              <span
                className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700"
                data-dev-label="hdr.trainingBadge"
              >
                Training
              </span>
            )}
            {showTrainingCompleteBadge && (
              <span
                className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-600 text-white"
                data-dev-label="hdr.trainingBadge"
              >
                Training complete
              </span>
            )}
            <button
              onClick={() => {
                if (postTrainingLockActive) {
                  setLive("Choose a mode or dismiss the banner to view Statistics.");
                  return;
                }
                suspendInsightPanelForHeader();
                setStatsOpen(true);
              }}
              disabled={postTrainingLockActive}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl shadow text-sm ${
                postTrainingLockActive ? "bg-white/50 text-slate-400 cursor-not-allowed" : "bg-white/70 hover:bg-white text-sky-900"
              }`}
              data-dev-label="hdr.stats"
            >
              <span aria-hidden className="text-base leading-none">📊</span>
              Statistics
            </button>
            <button
              onClick={() => {
                if (postTrainingLockActive) {
                  setLive("Choose a mode or dismiss the banner to view the leaderboard.");
                  return;
                }
                suspendInsightPanelForHeader();
                setLeaderboardOpen(true);
              }}
              className={
                "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm shadow " +
                (!hasConsented || postTrainingLockActive
                  ? "cursor-not-allowed bg-white/50 text-slate-400"
                  : "bg-white/70 hover:bg-white text-sky-900")
              }
              disabled={!hasConsented || postTrainingLockActive}
              title={!hasConsented ? "Select a player to continue." : postTrainingLockActive ? "Choose a mode or dismiss the banner first." : undefined}
              data-dev-label="hdr.leaderboard"
            >
              <span aria-hidden className="text-base leading-none">🏆</span>
              <span>Leaderboard</span>
              {showLeaderboardHeaderBadge && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-slate-900/90 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-white shadow"
                  aria-live="polite"
                >
                  <span className="text-[0.55rem] font-semibold uppercase tracking-[0.32em] text-slate-200/80">Score</span>
                  <span className="text-xs font-semibold tracking-normal">{leaderboardHeaderScoreDisplay}</span>
                </span>
              )}
            </button>
            <div
              className={"px-3 py-1.5 rounded-xl shadow text-sm bg-white/70 text-slate-700 flex items-center gap-2 " + (demographicsNeedReview ? "ring-2 ring-amber-400" : "")}
              aria-live="polite"
              data-dev-label="hdr.player"
            >
              <span>{playerLabel}</span>
              {demographicsNeedReview && (
                <span className="text-xs font-semibold text-amber-600">Needs review</span>
              )}
            </div>
            <button
              onClick={() => {
                if (!hasConsented) {
                  setPlayerModalOrigin("welcome");
                  setPlayerModalMode(currentPlayer ? "edit" : "create");
                  return;
                }
                if (postTrainingLockActive) {
                  setLive("Finish with the celebration banner before leaving Modes.");
                  return;
                }
                suspendInsightPanelForHeader();
                goToMode();
              }}
              title={!hasConsented ? "Select a player to continue." : undefined}
              disabled={modesDisabled || !hasConsented || postTrainingLockActive}
              className={
                "px-3 py-1.5 rounded-xl shadow text-sm " +
                (modesDisabled || !hasConsented || postTrainingLockActive
                  ? "bg-white/50 text-slate-400 cursor-not-allowed"
                  : "bg-white/70 hover:bg-white text-sky-900")
              }
              data-dev-label="hdr.home"
            >
              🏠 Home
            </button>
            <button
              ref={helpButtonRef}
              type="button"
              onClick={() => {
                if (!helpCenterOpen) {
                  suspendInsightPanelForHeader();
                }
                setHelpCenterOpen(prev => {
                  const next = !prev;
                  setLive(next ? "Help opened. Press Escape to close." : "Help closed.");
                  return next;
                });
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl shadow text-sm transition ${
                helpCenterOpen ? "bg-sky-600 text-white" : "bg-white/70 hover:bg-white text-sky-900"
              }`}
              aria-haspopup="dialog"
              aria-expanded={helpCenterOpen}
              aria-keyshortcuts="Alt+H"
              data-dev-label="hdr.help"
            >
              <span aria-hidden className="text-base leading-none">ℹ️</span>
              Help
            </button>
            <button
              ref={aboutButtonRef}
              type="button"
              onClick={() => {
                if (aboutOpen) {
                  handleCloseAbout();
                } else {
                  handleOpenAbout();
                }
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl shadow text-sm transition ${
                aboutOpen ? "bg-sky-600 text-white" : "bg-white/70 hover:bg-white text-sky-900"
              }`}
              aria-haspopup="dialog"
              aria-expanded={aboutOpen}
              data-dev-label="hdr.about"
            >
              <span aria-hidden className="text-base leading-none">📘</span>
              About
            </button>
            <button
              ref={settingsButtonRef}
              type="button"
              onClick={() => {
                suspendInsightPanelForHeader();
                handleOpenSettings();
              }}
              className={`px-3 py-1.5 rounded-xl shadow text-sm transition ${
                settingsOpen ? "bg-sky-600 text-white" : "bg-white/70 hover:bg-white text-sky-900"
              }`}
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              data-dev-label="hdr.settings"
            >
            ⚙️ Settings
          </button>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {showMainUi && settingsOpen && (
          <motion.div
            className="fixed inset-0 z-[85] bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => handleCloseSettings()}
          >
            <motion.aside
              ref={settingsPanelRef}
              initial={{ x: 32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 32, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              className="relative ml-auto flex h-full w-full max-w-[460px] flex-col gap-5 overflow-y-auto rounded-l-3xl bg-white/95 p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-drawer-title"
              onClick={e => e.stopPropagation()}
              tabIndex={-1}
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <h2 id="settings-drawer-title" className="text-lg font-semibold text-slate-900">
                  Settings
                </h2>
                <button
                  type="button"
                  onClick={() => handleCloseSettings()}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  data-focus-first
                >
                  Close ✕
                </button>
              </div>
              <div className="space-y-6 text-sm text-slate-700">
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profile &amp; Data</h2>
                  <div className="space-y-4 rounded-lg border border-slate-200/80 bg-white/80 p-3">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-slate-900">{playerLabel}</span>
                        {demographicsNeedReview && (
                          <span className="text-xs font-semibold text-amber-600">Needs review</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          className="rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => {
                            if (!currentPlayer) return;
                            handleCloseSettings();
                            setPlayerModalOrigin("settings");
                            setPlayerModalMode("edit");
                          }}
                          disabled={!currentPlayer}
                          data-dev-label="set.editDemographics"
                        >
                          Edit demographics
                        </button>
                        <button
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => {
                            handleCloseSettings();
                            setPlayerModalOrigin("settings");
                            setPlayerModalMode("create");
                          }}
                          data-dev-label="set.createPlayer"
                        >
                          Create new player
                        </button>
                      </div>
                      {demographicsNeedReview && (
                        <p className="text-xs text-amber-600">Update grade from Edit demographics.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">Statistics profile</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label htmlFor="settings-profile-select" className="sr-only">
                          Select statistics profile
                        </label>
                        <select
                          id="settings-profile-select"
                          value={currentProfile?.id ?? ""}
                          onChange={e => handleSelectProfile(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-inner"
                          disabled={!statsProfiles.length}
                          data-dev-label="set.profile.select"
                        >
                          {statsProfiles.length === 0 ? (
                            <option value="">No profiles yet</option>
                          ) : (
                            <>
                              {!currentProfile && <option value="">Select a profile…</option>}
                              {statsProfiles.map(profile => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.name}
                                  {!profile.trained && (profile.trainingCount ?? 0) < TRAIN_ROUNDS ? " • Training required" : ""}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                        <button
                          type="button"
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-700"
                          onClick={handleCreateProfile}
                          data-dev-label="set.profile.createNew"
                        >
                          Create new
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">Profiles don’t merge; new ones require {TRAIN_ROUNDS}-round training.</p>
                    </div>
                    <div className="space-y-2 border-t border-slate-200 pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">Export data</span>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={event => handleOpenExportDialog("settings", event.currentTarget)}
                          disabled={!canExportData}
                          className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          data-dev-label="set.exportCSV"
                        >
                          Export (CSV)
                        </button>
                        <p className={`text-xs ${shouldShowNoExportMessage ? "text-amber-600" : "text-slate-500"}`}>
                          {shouldShowNoExportMessage
                            ? "No data available to export."
                            : "Includes demographics for the selected profile."}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Training</h2>
                  <div className="space-y-3 rounded-lg border border-slate-200/80 bg-white/80 p-3">
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          handleCloseSettings();
                          setResetDialogAcknowledged(false);
                          setResetDialogOpen(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Training history is preserved."
                        disabled={!currentProfile}
                        data-dev-label="set.resetTraining"
                      >
                        Reset AI training
                      </button>
                    </div>
                  </div>
                </section>
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gameplay</h2>
                  <div className="space-y-4 rounded-lg border border-slate-200/80 bg-white/80 p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">AI Predictor</span>
                            <span className="text-xs text-slate-400" title="AI predicts your next move from recent patterns.">ⓘ</span>
                          </div>
                          <OnOffToggle
                            value={predictorMode}
                            onChange={handlePredictorToggle}
                            disabled={!isTrained}
                            onLabel="set.aiPredictor.on"
                            offLabel="set.aiPredictor.off"
                          />
                        </div>
                        {!isTrained && (
                          <p className="text-xs text-amber-600">Complete {TRAIN_ROUNDS} training rounds to unlock predictions.</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800" id="live-ai-insight-label">
                            Show Live AI Insight
                          </span>
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500"
                            title="When on, the panel opens automatically at the start of each match. When off, open it manually from the match HUD."
                            aria-hidden="true"
                          >
                            i
                          </span>
                        </div>
                        <OnOffToggle
                          value={predictorMode ? insightPreferred : false}
                          onChange={(next, event) =>
                            handleInsightPreferenceToggle(next, event?.currentTarget ?? undefined)
                          }
                          disabled={!predictorMode}
                          ariaLabelledby="live-ai-insight-label"
                          ariaDescribedby={!predictorMode ? "live-ai-insight-helper disabled-insight-helper" : "live-ai-insight-helper"}
                          className="self-start sm:self-auto"
                          onLabel="set.insight.on"
                          offLabel="set.insight.off"
                        />
                      </div>
                      <p className="settings-helper-clamp text-xs text-slate-500" id="live-ai-insight-helper">
                        When on, the panel opens automatically at the start of each match. When off, open it manually from the match HUD.
                      </p>
                      {!predictorMode && (
                        <p className="text-xs text-slate-500" id="disabled-insight-helper">
                          Enable the AI predictor to view Live Insight tools.
                        </p>
                      )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">AI Difficulty</span>
                          <span className="text-xs text-slate-400" title="Fine-tune how boldly the AI counters your moves.">ⓘ</span>
                        </div>
                      <div
                        className="flex flex-wrap gap-2"
                        role="radiogroup"
                        aria-label="AI difficulty"
                        onMouseLeave={() => {
                          if (!difficultyDisabled) setDifficultyHint(DIFFICULTY_INFO[aiMode].helper);
                        }}
                      >
                        {DIFFICULTY_SEQUENCE.map(level => {
                          const info = DIFFICULTY_INFO[level];
                          const isActive = aiMode === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              role="radio"
                              aria-checked={isActive}
                              data-dev-label={`set.difficulty.${level}`}
                              onFocus={() => setDifficultyHint(info.helper)}
                              onMouseEnter={() => setDifficultyHint(info.helper)}
                              onBlur={() => setDifficultyHint(difficultyDisabled ? "Enable the predictor to adjust difficulty." : DIFFICULTY_INFO[aiMode].helper)}
                              onClick={() => {
                                if (difficultyDisabled) return;
                                setAiMode(level);
                              }}
                              disabled={difficultyDisabled}
                              className={`rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition-colors ${
                                isActive
                                  ? "border-sky-500 bg-sky-600 text-white"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700"
                              } ${difficultyDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                            >
                              {info.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className={`text-xs ${difficultyDisabled ? "text-slate-400" : "text-slate-500"}`}>{difficultyHint}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">Best of</span>
                        <span className="text-xs text-slate-400" title="Rounds needed to win a match.">ⓘ</span>
                      </div>
                      <div className="inline-flex rounded-full border border-slate-300 bg-white shadow-sm" role="radiogroup" aria-label="Best of series length">
                        {BEST_OF_OPTIONS.map(option => {
                          const isActive = bestOf === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              role="radio"
                              aria-checked={isActive}
                              data-dev-label={`set.bestOf.${option}`}
                              onClick={() => {
                                if (bestOf === option) return;
                                const inMode = selectedMode !== null;
                                const matchOver = scene === "RESULTS";
                                if (inMode && !matchOver) {
                                  showModernToast({
                                    variant: "danger",
                                    title: "Finish the current match first",
                                    message:
                                      "Finish your current Challenge or Practice match or exit to Modes before changing Best of.",
                                  });
                                  return;
                                }
                                if (modernToast) {
                                  dismissModernToast();
                                }
                                setBestOf(option);
                              }}
                              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                                isActive ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accessibility &amp; Display</h2>
                  <div className="space-y-4 rounded-lg border border-slate-200/80 bg-white/80 p-3">
                    <div className="space-y-2">
                      <span className="font-medium text-slate-800">Theme</span>
                      <p className="text-xs text-slate-500">
                        Choose a light or dark experience, or follow your system setting.
                      </p>
                      <label htmlFor="settings-theme-select" className="sr-only">
                        Select theme
                      </label>
                      <select
                        id="settings-theme-select"
                        value={themePreference}
                        onChange={event => handleSettingsThemeChange(event.target.value as ThemePreference)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-inner"
                        data-dev-label="set.theme.select"
                      >
                        {themeOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500">Currently showing {resolvedThemeLabel.toLowerCase()} mode.</p>
                    </div>
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-inner">
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                        <div>
                          <span className="font-medium text-slate-800">{editingModeLabel} mode colors</span>
                          <p className="text-xs text-slate-500">
                            Adjust accent highlights and interface backgrounds for each theme.
                          </p>
                        </div>
                        <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm self-start">
                          <button
                            type="button"
                            className={`px-3 py-1 text-xs font-semibold transition-colors ${
                              themeColorEditingMode === "light"
                                ? "bg-slate-200 text-slate-700 shadow-inner"
                                : "text-slate-500 hover:bg-slate-100"
                            }`}
                            onClick={() => setThemeColorEditingMode("light")}
                          >
                            Light
                          </button>
                          <button
                            type="button"
                            className={`px-3 py-1 text-xs font-semibold transition-colors ${
                              themeColorEditingMode === "dark"
                                ? "bg-slate-200 text-slate-700 shadow-inner"
                                : "text-slate-500 hover:bg-slate-100"
                            }`}
                            onClick={() => setThemeColorEditingMode("dark")}
                          >
                            Dark
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accent</span>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={themeColorEditingColors.accent}
                              onChange={event =>
                                handleThemeColorInputChange(
                                  themeColorEditingMode,
                                  "accent",
                                  event.target.value,
                                )
                              }
                              aria-label={`${editingModeLabel} accent color`}
                              className="h-10 w-16 cursor-pointer rounded-md border border-slate-300 bg-transparent"
                            />
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-slate-500">
                              {themeColorEditingColors.accent}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">
                            Buttons, chips, and interactive highlights update instantly.
                          </span>
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Background</span>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={themeColorEditingColors.background}
                              onChange={event =>
                                handleThemeColorInputChange(
                                  themeColorEditingMode,
                                  "background",
                                  event.target.value,
                                )
                              }
                              aria-label={`${editingModeLabel} background color`}
                              className="h-10 w-16 cursor-pointer rounded-md border border-slate-300 bg-transparent"
                            />
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-slate-500">
                              {themeColorEditingColors.background}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">
                            Surface cards and gradients blend with this base tone.
                          </span>
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleResetThemeColors(themeColorEditingMode)}
                        disabled={isEditingModeDefault}
                        className={`inline-flex items-center justify-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold transition-colors ${
                          isEditingModeDefault
                            ? "cursor-not-allowed bg-slate-100 text-slate-400"
                            : "bg-white text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        Reset {editingModeLabel.toLowerCase()} defaults
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="font-medium text-slate-800">Audio</span>
                      </div>
                      <OnOffToggle
                        value={audioOn}
                        onChange={next => setAudioOn(next)}
                        onLabel="set.audio.on"
                        offLabel="set.audio.off"
                      />
                    </div>
                    <div className="space-y-2">
                      <span className="font-medium text-slate-800">Text size</span>
                      <input
                        type="range"
                        min={0.9}
                        max={1.4}
                        step={0.05}
                        value={textScale}
                        onChange={e => setTextScale(parseFloat(e.target.value))}
                        className="w-full accent-sky-600"
                        data-dev-label="set.textSize.slider"
                      />
                      <div className="flex justify-between text-[10px] uppercase tracking-wide text-slate-400">
                        <span>Smaller</span>
                        <span>Default</span>
                        <span>Larger</span>
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Log out</div>
                        <p className="text-xs text-slate-500">Log out and reboot into the welcome screen.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLogOut}
                        className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-700 
                                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
                        data-dev-label="set.logout"
                      >
                        Log out
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {scene === "WELCOME" && (
          <motion.main
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
            className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 px-6 py-12 text-slate-800"
          >
            <div className="mx-auto flex w-[min(560px,100%)] max-w-full flex-col gap-8 rounded-3xl bg-white/90 p-8 shadow-2xl ring-1 ring-slate-200">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span>Intro</span>
                <span>
                  {welcomeSlide + 1} / {welcomeSlideCount}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={1} aria-valuemax={welcomeSlideCount} aria-valuenow={welcomeSlide + 1}>
                <motion.div
                  className="h-full rounded-full bg-sky-500"
                  initial={false}
                  animate={{ width: `${welcomeProgress}%` }}
                  transition={{ duration: 0.25 }}
                />
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={welcomeSlide}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
                  className="space-y-4"
                >
                  <h2 className="text-3xl font-bold text-slate-900">{welcomeSlides[welcomeSlide]?.title}</h2>
                  <p className="text-base leading-relaxed text-slate-700">{welcomeSlides[welcomeSlide]?.body}</p>
                </motion.div>
              </AnimatePresence>
              {isWelcomeLastSlide ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={handleWelcomePrevious}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Back
                    </button>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700"
                        onClick={() => handleWelcomeAction("setup")}
                      >
                        Get started
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleWelcomeAction("restore")}
                        disabled={!hasLocalProfiles}
                      >
                        Already played? Load my data
                      </button>
                    </div>
                  </div>
                  {!hasLocalProfiles && (
                    <p className="text-xs text-slate-500">No saved profiles detected on this device.</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleWelcomePrevious}
                    disabled={welcomeSlide === 0}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleWelcomeNext}
                    className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </motion.main>
        )}
        {scene === "BOOT" && (
          <motion.div
            key="boot"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative min-h-screen overflow-hidden"
          >
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 20% 20%, rgba(125, 211, 252, 0.4), transparent 55%)," +
                  "radial-gradient(circle at 80% 30%, rgba(14, 165, 233, 0.35), transparent 60%)," +
                  "linear-gradient(135deg, #0f172a, #1e293b)",
                backgroundSize: "160% 160%, 140% 140%, 100% 100%",
              }}
              animate={{
                backgroundPosition: [
                  "0% 50%, 50% 50%, 0% 0%",
                  "100% 50%, 50% 50%, 100% 100%",
                  "0% 50%, 50% 50%, 0% 0%",
                ],
              }}
              transition={{ duration: 12, ease: "easeInOut", repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-0"
              style={{ background: "radial-gradient(ellipse at bottom, rgba(56, 189, 248, 0.18), transparent 65%)" }}
              animate={{ opacity: [0.25, 0.55, 0.25] }}
              transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
            />
            <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center text-white">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
                className="text-4xl font-black tracking-wide md:text-5xl"
              >
                RPS AI Lab
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
                className="w-full max-w-xs space-y-3"
              >
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/30 backdrop-blur">
                  <motion.div
                    className="h-full rounded-full bg-white"
                    initial={false}
                    animate={{ width: `${bootBarWidth}%` }}
                    transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
                  />
                </div>
                <div className="text-sm font-medium uppercase tracking-[0.35em] text-white/80">
                  Booting… {bootPercent}%
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
                className="text-xs uppercase tracking-[0.45em] text-white/60"
              >
                Initializing predictive engines
              </motion.div>
            </div>
          </motion.div>
        )}
        {/* MODE SELECT */}
        {scene === "MODE" && (
          <motion.main key="mode" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: .36, ease: [0.22,0.61,0.36,1] }} className="min-h-screen pt-28 flex flex-col items-center gap-6">
            {postTrainingCtaOpen ? (
              <div className="w-full px-4">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-3xl bg-white/95 p-6 text-slate-700 shadow-2xl ring-1 ring-sky-100">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h2 className="text-xl font-semibold text-sky-800">Nice job! Training complete!</h2>
                      <p className="text-sm text-slate-600">You’re ready to challenge the AI and play for points.</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Dismiss training celebration"
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-200"
                      onClick={() => {
                        if (acknowledgePostTrainingCta()) {
                          setLive("Training celebration dismissed.");
                        }
                      }}
                    >
                      Dismiss ✕
                    </button>
                  </div>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    <li>
                      <span className="font-semibold text-slate-800">On Challenge,</span> Your best scores go to the leaderboard. Can you beat the high scores?
                    </li>
                  </ul>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      disabled={!predictorMode}
                      className={`rounded-full px-4 py-2 text-sm font-semibold shadow transition focus-visible:outline focus-visible:outline-2 
                        focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                        predictorMode
                          ? "bg-sky-600 text-white hover:bg-sky-700"
                          : "cursor-not-allowed bg-slate-200 text-slate-400"
                      }`}
                      onClick={() => {
                        if (!predictorMode) return;
                        handleModeSelect("challenge");
                      }}
                    >
                      Play Challenge
                    </button>
                  </div>
                  {!predictorMode && (
                    <p className="text-xs font-medium text-amber-600">
                        Enable AI to play Challenge. Open{" "}
                        <span className="rounded bg-slate-100 px-1">Settings</span>
                        <span className="px-1" aria-hidden="true" role="presentation">›</span>
                        <span className="rounded bg-slate-100 px-1">AI Predictor</span>.
                        <button
                          type="button"
                          className="ml-2 font-semibold text-sky-600 underline decoration-dotted underline-offset-2 transition hover:text-sky-700 
                          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                          onClick={handleEnablePredictorForChallenge}
                        >
                          Enable AI now
                      </button>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <motion.div layout className="text-4xl font-black text-sky-700">Choose Your Mode</motion.div>
                <div className="mode-grid">
                  {VISIBLE_MODE_OPTIONS.map(m => {
                    const isChallenge = m === "challenge";
                    const disabledBase = (isChallenge && needsTraining) || !hasConsented;
                    const challengeNeedsPredictor =
                      isChallenge && !needsTraining && hasConsented && !predictorMode;
                    const disabledReason = isChallenge
                      ? needsTraining
                        ? "Complete training to unlock Challenge."
                        : !hasConsented
                          ? "Consent is required before starting a match."
                          : challengeNeedsPredictor
                            ? "Enable AI to play Challenge."
                            : null
                      : null;
                    return (
                      <ModeCard
                        key={m}
                        mode={m}
                        onSelect={handleModeSelect}
                        isDimmed={!!selectedMode && selectedMode !== m}
                        disabled={disabledBase}
                        disabledReason={disabledReason}
                        onDisabledClick={
                          challengeNeedsPredictor
                            ? (_mode: Mode) => {
                                showChallengeNeedsPredictorPrompt();
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>

                {/* Fullscreen morph container */}
                <AnimatePresence>
                  {/* Trying to add different colors to challenge and training backgrounds.  Original code block commented out below.  This changed the splash page that welcomes player to the challenge or training mode.  */}
                  {selectedMode && (
                    <motion.div
                      key="fs"
                      className={`fullscreen ${
                        selectedMode === 'challenge'
                          ? 'bg-[radial-gradient(circle_at_top,_#ff7849,_#240c36)]'
                          : selectedMode === 'practice'
                            ? 'bg-[radial-gradient(circle_at_top,_#38c8ff,_#10204a)]'
                            : 'bg-[radial-gradient(circle_at_top,_#94a3b8,_#131b36)]'
                      }`}
                      layoutId={`card-${selectedMode}`}
                      initial={{ borderRadius: 16 }}
                      animate={{
                        borderRadius: 0,
                        transition: { duration: 0.44, ease: [0.22, 0.61, 0.36, 1] },
                      }}
                    >
                      {/* <motion.div key="fs" className={`fullscreen ${selectedMode}`} layoutId={`card-${selectedMode}`} initial={{ borderRadius: 16 }} animate={{ borderRadius: 0, transition: { duration: 0.44, ease: [0.22,0.61,0.36,1] }}/> */}
                      <div className="absolute inset-0 grid place-items-center">
                        <motion.div initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: .36 }} className="text-7xl">
                          {selectedMode === 'challenge' ? '🎯' : '💡'}
                        </motion.div>
                      </div>

                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .74, duration: .28 }} className="absolute bottom-10 left-0 right-0 text-center text-white text-3xl font-black drop-shadow">{modeLabel(selectedMode)}</motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.main>
        )}

        {/* MATCH */}
        {scene === "MATCH" && (
          <motion.section key="match" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: .36 }} className="min-h-screen pt-24 pb-20 flex flex-col items-center">
            {shouldGateTraining && (
              <div className="fixed inset-0 z-[70] grid place-items-center bg-white/90">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-[min(92vw,520px)] text-center space-y-4">
                  <div className="text-2xl font-black">Train the AI</div>
                  <p className="text-slate-700">We'll learn your patterns in a quick practice ({TRAIN_ROUNDS} rounds).</p>
                  <button
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow"
                    onClick={beginTrainingSession}
                    aria-label="Start AI training"
                  >
                    Start AI training
                  </button>
                </div>
              </div>
            )}
            <div className="w-full px-4">
              <div className="mx-auto w-full max-w-[1400px]">
                <div
                  ref={hudShellRef}
                  className="relative flex w-full flex-col items-stretch gap-6 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-stretch md:gap-5"
                >
                  <motion.div ref={hudMainColumnRef} className="mx-auto flex w-full max-w-[820px] flex-col items-center gap-6">
                    <div className="flex w-full flex-col items-center gap-4 lg:gap-6">
                  {/* HUD */}
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }} className="relative w-full max-w-[820px] bg-white/70 rounded-2xl shadow px-4 pt-12 pb-4">
                    <div
                      className={`absolute left-4 top-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${matchModeBadgeTheme}`}
                    >
                      <span aria-hidden="true" className="text-base">
                        {needsTraining || trainingActive
                          ? "🧠"
                          : activeMatchMode === "challenge"
                            ? "🎯"
                            : "💡"}
                      </span>
                      <span className="leading-none">
                        {needsTraining || trainingActive
                          ? "TRAINING PHASE"
                          : `${modeLabel(activeMatchMode)} Mode`}
                      </span>
                    </div>
                    <div className="absolute right-4 top-3 flex items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${aiStatusPill.className}`}>
                        {aiStatusPill.label}
                      </span>
                      {!needsTraining && !trainingActive && (
                        <button
                          type="button"
                          className={`rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700 shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
                            hudInsightDisabled ? "cursor-not-allowed opacity-60" : "hover:bg-sky-200"
                          }`}
                          onClick={event => {
                            if (hudInsightDisabled) {
                              event.preventDefault();
                              event.stopPropagation();
                              handleDisabledInsightClick();
                              return;
                            }
                            if (insightPanelOpen) {
                              closeInsightPanel({
                                persistPreference: false,
                                suppressForMatch: true,
                              });
                            } else {
                              openInsightPanel(event.currentTarget, { persistPreference: insightPreferred });
                            }
                          }}
                          aria-pressed={hudInsightDisabled ? undefined : insightPanelOpen}
                          aria-expanded={hudInsightDisabled ? undefined : insightPanelOpen}
                          aria-controls="live-insight-panel"
                          aria-disabled={hudInsightDisabled || undefined}
                          data-dev-label="hud.insight"
                        >
                          Insight
                          {hudInsightDisabled && (
                            <span className="sr-only">Enable AI to view insights</span>
                          )}
                        </button>
                      )}
                    </div>
                    {(needsTraining || trainingActive) ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm text-slate-700">
                          <span>Training the AI on your moves…</span>
                          <span>{trainingDisplayCount} / {TRAIN_ROUNDS}</span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded">
                          <div className="h-full bg-sky-500 rounded" style={{ width: `${Math.min(100, trainingProgress * 100)}%` }} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex w-full flex-col items-center gap-4">
                        <div className="flex w-full flex-col items-center gap-3 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-slate-700">
                            <div>Round <strong>{round}</strong> • Best of {bestOf}</div>
                            {showMatchScoreBadge && (
                              <div className="relative flex items-center justify-center" aria-live="polite">
                                <motion.span
                                  className="inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white shadow-sm"
                                  animate={matchScoreChange && !reduceMotion ? { scale: 1.06 } : { scale: 1 }}
                                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 24, mass: 0.7 }}
                                >
                                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-slate-200/80">Score</span>
                                  <span className="text-sm font-semibold tracking-normal">{matchScoreDisplay}</span>
                                </motion.span>
                                <AnimatePresence>
                                  {matchScoreChange && matchScoreChange.value !== 0 && (
                                    <motion.span
                                      key={matchScoreChange.key}
                                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                                      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                                      transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }}
                                      className={`absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-semibold ${matchScoreChange.value > 0 ? "text-emerald-500" : "text-rose-500"}`}
                                    >
                                      {matchScoreChange.value > 0
                                        ? `+${matchScoreChange.value.toLocaleString()}`
                                        : `-${Math.abs(matchScoreChange.value).toLocaleString()}`}
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-xs font-bold uppercase tracking-widest ring-2 ring-current shadow-lg ${
                              (phase === "resolve" || phase === "feedback") && outcome
                                ? outcome === "win"
                                  ? "hud-result hud-result-win bg-emerald-500 text-[#ffffff]"
                                  : outcome === "lose"
                                    ? "hud-result hud-result-lose bg-rose-500 text-[#ffffff]"
                                    : "hud-result hud-result-tie bg-[#A65613] text-[#ffffff]"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {(phase === "resolve" || phase === "feedback") && outcome
                              ? outcome === "win"
                                ? "YOU WON"
                                : outcome === "lose"
                                  ? "YOU LOST"
                                  : "WE TIED"
                              : "LEAD THE ROUND"}
                          </span>
                          <div className="flex items-center gap-6 text-2xl font-semibold text-slate-900 sm:gap-8">
                            <div className="flex flex-col items-center gap-1 text-base font-normal text-slate-500">
                              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">You</span>
                              <span className="text-3xl font-semibold text-slate-900">{playerScore}</span>
                            </div>
                            <div className="h-10 w-px bg-slate-200" aria-hidden />
                            <div className="flex flex-col items-center gap-1 text-base font-normal text-slate-500">
                              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI</span>
                              <span className="text-3xl font-semibold text-slate-900">{aiScore}</span>
                            </div>
                          </div>
                        </div>
                        <RobotMascot
                          className="flex h-12 w-12 items-center justify-center md:h-16 md:w-16 lg:h-20 lg:w-20"
                          aria-label="Ready robot scoreboard mascot"
                          variant={hudRobotVariant}
                          sizeConfig="(min-width: 1024px) 80px, (min-width: 768px) 64px, 48px"
                        />
                      </div>
                    )}
                  </motion.div>

                  {trainingActive && (
                    <div className="flex w-full max-w-[820px] items-center justify-between text-sm text-slate-600">
                      <span>Keep playing to finish training.</span>
                      <span className="text-slate-500">Training completes after {TRAIN_ROUNDS} rounds.</span>
                    </div>
                  )}

                  {/* Arena */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: .1 }}
                    className="relative mt-6 grid w-full max-w-[820px] gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
                  >
                    <div className="flex">
                      <motion.div layout className="relative flex w-full flex-col rounded-3xl bg-white/80 p-5 shadow-lg">
                        <div className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">You</div>
                          <motion.div layout className="flex flex-1 items-center justify-center" aria-label="Your hand" role="img">
                            <AnimatePresence mode="popLayout">
                              {playerPick ? (
                                <motion.span
                                  key={playerPick}
                                  initial={{ scale: 0.9, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: .2 }}
                                  className="flex items-center justify-center"
                                >
                                  <MoveIcon move={playerPick} size={80} />
                                </motion.span>
                              ) : (
                                <motion.span
                                  key="you-placeholder"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 0.6 }}
                                  exit={{ opacity: 0 }}
                                  className="text-4xl text-slate-300"
                                >
                                  ?
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </motion.div>
                      </motion.div>
                    </div>

                    <div className="pointer-events-none flex items-center justify-center py-6 sm:py-0 sm:min-w-[112px]">
                      <AnimatePresence mode="wait">
                        {phase === "countdown" && count>0 && (
                          <motion.div
                            key={count}
                            initial={{ y: -48, opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                            animate={{ y: 0, opacity: 1, scale: 1, filter: "blur(0px)" }}
                            exit={{ y: 48, opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                            transition={{ duration: .35, ease: [0.22, 0.61, 0.36, 1] }}
                            className="rounded-full bg-white/90 px-7 py-3 text-2xl font-black text-slate-800 shadow-lg"
                          >
                            {count}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex">
                      <motion.div layout className="relative flex w-full flex-col rounded-3xl bg-white/80 p-5 shadow-lg">
                        <div className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">AI</div>
                          <motion.div layout className="flex flex-1 items-center justify-center" aria-label="AI hand" role="img">
                            <AnimatePresence mode="popLayout">
                              {aiPick ? (
                                <motion.span
                                  key={aiPick}
                                  initial={{ scale: 0.9, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: .2 }}
                                  className="flex items-center justify-center"
                                >
                                  <MoveIcon move={aiPick} size={80} />
                                </motion.span>
                              ) : (
                                <motion.span
                                  key="ai-placeholder"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 0.6 }}
                                  exit={{ opacity: 0 }}
                                  className="text-4xl text-slate-300"
                                >
                                  ?
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </motion.div>
                      </motion.div>
                    </div>

                  </motion.div>

                  {/* Controls */}
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 }} className="mt-6 grid w-full max-w-[820px] grid-cols-3 gap-3">
                    {MOVES.map((m)=>{
                      const selected = playerPick === m && (phase === "selected" || phase === "countdown" || phase === "reveal" || phase === "resolve");
                      return (
                        <button key={m} onClick={()=> onSelect(m)} disabled={phase!=="idle"}
                          className={["group relative px-4 py-4 bg-white rounded-2xl shadow hover:shadow-md transition active:scale-95", phase!=="idle"?"opacity-60 cursor-default":"", selected?"ring-4 ring-sky-300":""].join(" ")}
                          data-dev-label={`hand.${m}`}
                          aria-pressed={selected} aria-label={`Choose ${m}`}>
                          <div className="flex items-center justify-center">
                            <MoveIcon move={m} size={56} />
                          </div>
                          <div className="mt-1 text-sm text-slate-600 capitalize">{m}</div>
                          <span className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-active:opacity-100 group-active:scale-105 transition bg-sky-100"/>
                        </button>
                      )
                    })}
                  </motion.div>
                </div>
                  </motion.div>
                  <AnimatePresence initial={false}>
                    {insightPanelOpen && (
                      <>
                        <motion.div
                          key="insight-rail-scrim"
                          className="absolute inset-0 z-10 bg-slate-900/40 md:hidden"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={insightRailTransition}
                          aria-hidden="true"
                          onClick={() =>
                            closeInsightPanel({ persistPreference: false, suppressForMatch: true })
                          }
                        />
                        <motion.aside
                          key="insight-panel"
                          id="live-insight-panel"
                          role="dialog"
                          aria-label="Live AI Insight panel."
                          ref={insightPanelRef}
                          style={
                            insightRailMaxHeight
                              ? { maxHeight: insightRailMaxHeight }
                              : undefined
                          }
                          initial={
                            reduceMotion
                              ? { opacity: 1, width: insightRailWidthForMotion }
                              : { opacity: 0, width: 0 }
                          }
                          animate={{ opacity: 1, width: insightRailWidthForMotion }}
                          exit={
                            reduceMotion
                              ? { opacity: 1, width: 0 }
                              : { opacity: 0, width: 0 }
                          }
                          transition={insightRailTransition}
                          className="pointer-events-auto absolute inset-0 z-20 flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-200 md:static md:h-full md:min-h-0 md:max-h-[calc(100vh-11rem)] md:self-stretch md:rounded-3xl md:bg-white/85 md:shadow-lg"
                        >
                          <InsightPanel
                            snapshot={liveDecisionSnapshot}
                            liveRounds={liveInsightRounds}
                            historicalRounds={rounds}
                            titleRef={insightHeadingRef}
                            onClose={() =>
                              closeInsightPanel({ persistPreference: false, suppressForMatch: true })
                            }
                          />
                        </motion.aside>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* RESULTS */}
        {scene === "RESULTS" && (
          <motion.div
            key="results"
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="relative w-[min(520px,95vw)] rounded-3xl bg-white/95 p-6 text-slate-800 shadow-2xl ring-1 ring-slate-200"
              role="dialog"
              aria-modal="true"
              aria-labelledby="match-results-title"
            >
              <div
                id="match-results-title"
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-[#ffffff] results-banner ${bannerColor()} ${
                  resultBanner === "Defeat" ? "results-banner-defeat" : ""
                }`}
              >
                {resultBanner}
              </div>
              {showResultsScoreBadge && (
                <div className="absolute right-6 top-6">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.25em] text-white shadow-sm">
                    <span className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-slate-200/80">Score</span>
                    <span className="text-sm font-semibold tracking-normal">{matchScoreDisplay}</span>
                  </div>
                </div>
              )}
              <div className="mt-4 rounded-2xl bg-slate-50/80 p-4">
                <div className="flex items-center justify-around gap-6 text-xl">
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-slate-500 text-sm">You</div>
                    <div className="text-3xl font-semibold text-slate-900">{playerScore}</div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-full border border-slate-200 bg-white/90 p-3 shadow-sm">
                      <img
                        src={ROBOT_ASSETS[resultMascot.variant][96]}
                        alt={resultMascot.alt}
                        className="h-16 w-16 md:h-20 md:w-20"
                        style={{ filter: ROBOT_BASE_GLOW }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-slate-500 text-sm">AI</div>
                    <div className="text-3xl font-semibold text-slate-900">{aiScore}</div>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700"
                  onClick={() => {
                    clearRobotReactionTimers();
                    setRobotResultReaction(null);
                    resetMatch();
                    setScene("MATCH");
                  }}
                >
                  Play Again
                </button>
                <button
                  type="button"
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  onClick={() => goToMode()}
                >
                  Exit Match
                </button>
                <button
                  type="button"
                  className="rounded-full bg-slate-900/90 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-900"
                  onClick={() => {
                    setLeaderboardOpen(true);
                  }}
                >
                  View Leaderboard
                </button>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-800">Change Best Of</span>
                  <select
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-inner"
                    value={bestOf}
                    onChange={event => setBestOf(Number(event.target.value) as BestOf)}
                    data-dev-label="results.bestOf"
                  >
                    {BEST_OF_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        Best of {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-800">AI Difficulty</span>
                  <select
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-inner disabled:cursor-not-allowed disabled:bg-slate-100"
                    value={aiMode}
                    onChange={event => setAiMode(event.target.value as AIMode)}
                    disabled={difficultyDisabled}
                    data-dev-label="results.difficulty"
                  >
                    {DIFFICULTY_SEQUENCE.map(level => (
                      <option key={level} value={level}>
                        {DIFFICULTY_INFO[level].label}
                      </option>
                    ))}
                  </select>
                  <p className={`text-xs ${difficultyDisabled ? "text-amber-600" : "text-slate-500"}`}>
                    {difficultyDisabled
                      ? "Enable the AI predictor to adjust difficulty."
                      : DIFFICULTY_INFO[aiMode].helper}
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute -top-10 right-6">
                <Confetti />
              </div>
            </motion.div>
          </motion.div>
      )}
      </AnimatePresence>

      {/* Wipe overlay */}
      <div className={"wipe " + (wipeRun ? 'run' : '')} aria-hidden={true} />

      {/* Calibration modal */}
      {/* Calibration modal removed */}

      <AnimatePresence>
        {aboutOpen && <AboutModal open={aboutOpen} onClose={handleCloseAbout} />}
      </AnimatePresence>

      <AnimatePresence>
        {leaderboardOpen && (
          <LeaderboardModal open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {statsOpen && (
          <motion.div className="fixed inset-0 z-[80] grid place-items-center bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setStatsOpen(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }} className="flex w-[min(95vw,900px)] max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" ref={statsModalRef}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-800">Statistics</h2>
                <button onClick={() => setStatsOpen(false)} className="text-slate-500 hover:text-slate-700 text-sm" data-dev-label="stats.close">Close ✕</button>
              </div>
              <div className="px-4 pt-3 pb-2 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Active statistics profile</div>
                    <div className="text-xs text-slate-500">
                      {currentProfile ? (
                        <span>{currentProfile.name}{(!currentProfile.trained && currentProfile.trainingCount < TRAIN_ROUNDS) ? ' • Training required' : ''}</span>
                      ) : 'No profile selected.'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600 flex items-center gap-2">
                      <span>Profile</span>
                      <select value={currentProfile?.id ?? ''} onChange={e => handleSelectProfile(e.target.value)} className="border rounded px-2 py-1" disabled={!statsProfiles.length} data-dev-label="stats.profile.select">
                        {statsProfiles.map(profile => (
                          <option key={profile.id} value={profile.id}>{profile.name}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={handleCreateProfile}
                      className="px-2 py-1 rounded app-accent-soft"
                      data-dev-label="stats.profile.new"
                    >
                      New profile
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Profiles keep logs, training, and exports separate. Switch profiles to return to previous stats instantly.</p>
              </div>
              <div className="px-4 pt-3 flex flex-wrap gap-2" role="tablist" aria-label="Statistics tabs">
                {statsTabs.map(tab => (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={statsTab === tab.key}
                    data-dev-label={`stats.tab.${tab.key}`}
                    data-focus-first={tab.key === statsTabs[0].key ? true : undefined}
                    onClick={() => setStatsTab(tab.key)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      statsTab === tab.key ? 'app-accent-pill' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
                {statsTab === "overview" && (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <div
                        className="rounded-2xl border p-4 shadow-sm"
                        style={{ backgroundColor: "var(--app-accent)", borderColor: "var(--app-accent-strong)", color: "#000000" }}
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-black">
                          Matches
                        </div>
                        <div className="mt-2 text-3xl font-bold text-black">{totalMatches}</div>
                        <p className="mt-1 text-xs text-black">
                          How many games you played.
                        </p>
                      </div>
                      <div
                        className="rounded-2xl border p-4 shadow-sm"
                        style={{ backgroundColor: "var(--app-accent)", borderColor: "var(--app-accent-strong)", color: "#000000" }}
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-black">
                          Rounds
                        </div>
                        <div className="mt-2 text-3xl font-bold text-black">{totalRounds}</div>
                        <p className="mt-1 text-xs text-black">
                          Total turns logged.
                        </p>
                      </div>
                      <div
                        className="rounded-2xl border p-4 shadow-sm"
                        style={{ backgroundColor: "var(--app-accent)", borderColor: "var(--app-accent-strong)", color: "#000000" }}
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-black">
                          Win rate
                        </div>
                        <div className="mt-2 text-3xl font-bold text-black">
                          {totalMatches ? `${Math.round(overallWinRate * 100)}%` : "—"}
                        </div>
                        <p className="mt-1 text-xs text-black">
                          Wins per match.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Favorite move</div>
                          <div className="mt-2 flex items-baseline gap-2 text-slate-900">
                            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/80" aria-hidden="true">
                              {behaviorStats.favoriteMove ? <MoveIcon move={behaviorStats.favoriteMove} size={40} /> : <span className="text-xl">🎲</span>}
                            </span>
                          <span className="text-lg font-bold">
                            {behaviorStats.favoriteMove ? prettyMove(behaviorStats.favoriteMove) : "None yet"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {favoriteMovePercent !== null
                            ? `${favoriteMovePercent}% of your plays.`
                            : "Play more rounds to find your fave."}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <span>AI sure?</span>
                          <span className="text-slate-600">
                            {averageConfidenceLast20 !== null ? `${averageConfidenceLast20}% avg` : "—"}
                          </span>
                        </div>
                        <div className="mt-2 h-14">
                          {recentConfidenceSpark.length ? (
                            <svg viewBox="0 0 200 50" className="h-full w-full" aria-hidden="true">
                              <polyline
                                fill="none"
                                stroke="var(--app-accent-strong)"
                                strokeWidth="3"
                                strokeLinecap="round"
                                points={confidenceSparkPoints}
                              />
                            </svg>
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-slate-400">
                              No rounds yet.
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Last round: {lastConfidencePercent !== null ? `${lastConfidencePercent}%` : "—"}.
                          <br />
                          AI was very sure last round. High confidence doesn’t always mean correct!
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-7">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-700">Recent trend</h3>
                          <span className="text-xs text-slate-500">Last 20 rounds</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Last 20 rounds: green = wins, gray = ties, red = losses.
                        </p>
                        <div className="mt-3">
                          {recentTrendDots.length ? (
                            <svg viewBox="0 0 240 50" className="h-14 w-full">
                              {recentTrendDots.map((dot, idx) => (
                                <circle
                                  key={`${dot.x}-${idx}`}
                                  cx={dot.x}
                                  cy={25}
                                  r={6}
                                  fill={dot.outcome === "win" ? "#22c55e" : dot.outcome === "tie" ? "#94a3b8" : "#ef4444"}
                                  stroke="#0f172a"
                                  strokeWidth="1"
                                >
                                  <title>{dot.label}</title>
                                </circle>
                              ))}
                            </svg>
                          ) : (
                            <div className="rounded-2xl bg-slate-50 py-6 text-center text-sm text-slate-500">
                              Play rounds to see your trend.
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                            Win
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
                            Tie
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
                            Loss
                          </span>
                        </div>
                      </div>
                      <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-700">Your habits</h3>
                          <span className="text-xs text-slate-500">Tap a card to peek</span>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {habitCards.map(card => (
                            <button
                              key={card.key}
                              type="button"
                              onClick={() => setHabitDrawer(prev => (prev === card.key ? null : card.key))}
                              className={`rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50 ${
                                habitDrawer === card.key ? "ring-2 ring-sky-300" : ""
                              }`}
                            >
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {card.blurb}
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-700">{card.title}</div>
                              <div className="mt-2 text-xl font-bold text-slate-900">{card.value}</div>
                            </button>
                          ))}
                        </div>
                        <AnimatePresence>
                          {habitDrawer && habitDrawerContent && (
                            <motion.div
                              key={habitDrawer}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              className="pointer-events-none mt-3"
                            >
                              <div
                                className="pointer-events-auto relative rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
                                role="dialog"
                                aria-live="polite"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-700">
                                      {habitDrawerContent.title}
                                    </div>
                                    <p className="mt-1 text-sm text-slate-600">{habitDrawerContent.copy}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setHabitDrawer(null)}
                                    className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                                    aria-label="Close habit details"
                                  >
                                    ✕
                                  </button>
                                </div>
                                <div className="mt-3">{habitDrawerContent.visual}</div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                )}

                {statsTab === "rounds" && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                          <span>Mode</span>
                          <select
                            value={roundFilters.mode}
                            onChange={e =>
                              setRoundFilters(f => ({ ...f, mode: e.target.value as RoundFilterMode }))
                            }
                            className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
                          >
                            <option value="all">All</option>
                            <option value="practice">Practice</option>
                            <option value="challenge">Challenge</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                          <span>Difficulty</span>
                          <select
                            value={roundFilters.difficulty}
                            onChange={e =>
                              setRoundFilters(f => ({
                                ...f,
                                difficulty: e.target.value as RoundFilterDifficulty,
                              }))
                            }
                            className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
                          >
                            <option value="all">All</option>
                            <option value="fair">Fair</option>
                            <option value="normal">Normal</option>
                            <option value="ruthless">Ruthless</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                          <span>Outcome</span>
                          <select
                            value={roundFilters.outcome}
                            onChange={e =>
                              setRoundFilters(f => ({ ...f, outcome: e.target.value as RoundFilterOutcome }))
                            }
                            className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
                          >
                            <option value="all">All</option>
                            <option value="win">Win</option>
                            <option value="lose">Loss</option>
                            <option value="tie">Tie</option>
                          </select>
                        </label>
                        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                          <span>Date</span>
                          <input
                            type="date"
                            value={roundFilters.from}
                            onChange={e => setRoundFilters(f => ({ ...f, from: e.target.value }))}
                            className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
                            aria-label="From date"
                          />
                          <span className="text-slate-400">to</span>
                          <input
                            type="date"
                            value={roundFilters.to}
                            onChange={e => setRoundFilters(f => ({ ...f, to: e.target.value }))}
                            className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
                            aria-label="To date"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRoundsViewMode(prev => (prev === "card" ? "table" : "card"))}
                        className="rounded-full border app-accent-border app-accent-soft px-3 py-1.5 text-sm font-semibold transition"
                      >
                        {isCardView ? "Table view (advanced)" : "Card view"}
                      </button>
                    </div>
                    {isCardView ? (
                      roundsPageSlice.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {roundsPageSlice.map((round, idx) => {
                            const bucketKey = round.confidenceBucket ?? confidenceBucket(round.confidence);
                            const badgeInfo = CONFIDENCE_BADGE_INFO[bucketKey];
                            const outcomeStyle = OUTCOME_CARD_STYLES[round.outcome];
                            const dist = round.mixer?.dist
                              ? {
                                  rock: clamp01(round.mixer.dist.rock),
                                  paper: clamp01(round.mixer.dist.paper),
                                  scissors: clamp01(round.mixer.dist.scissors),
                                }
                              : { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 };
                            const sumDist = dist.rock + dist.paper + dist.scissors || 1;
                            const normalized = {
                              rock: (dist.rock / sumDist) * 100,
                              paper: (dist.paper / sumDist) * 100,
                              scissors: (dist.scissors / sumDist) * 100,
                            };
                            const chips = makeReasonChips(round.reason);
                            const expertName =
                              round.mixer?.topExperts?.[0]?.name || (round.policy === "heuristic" ? "Heuristic" : "Mixer");
                            const roundIndex = roundPageStartIndex + idx + 1;
                            const playedAt = new Date(round.t).toLocaleString();
                            return (
                              <article
                                key={round.id}
                                className={`rounded-2xl border ${outcomeStyle.border} bg-white p-4 shadow-sm transition hover:shadow-md`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 text-3xl">
                                      <span aria-label={`You played ${prettyMove(round.player)}`} className="inline-flex items-center justify-center">
                                        <MoveIcon move={round.player} size={40} />
                                      </span>
                                      <span className="text-base font-semibold text-slate-500">vs</span>
                                      <span aria-label={`AI played ${prettyMove(round.ai)}`} className="inline-flex items-center justify-center">
                                        <MoveIcon move={round.ai} size={40} />
                                      </span>
                                  </div>
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${badgeInfo.className}`}
                                  >
                                    <span aria-hidden="true">{badgeInfo.face}</span>
                                    <span>{badgeInfo.label}</span>
                                    <span>{Math.round(round.confidence * 100)}%</span>
                                  </span>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${outcomeStyle.badge}`}>
                                    {outcomeStyle.label}
                                  </span>
                                  {round.mode === "practice" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                                      No score — Practice
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-600 capitalize">
                                      {round.mode} · {round.difficulty}
                                    </span>
                                  )}
                                  <span className="ml-auto text-slate-500">#{roundIndex}</span>
                                </div>
                                {chips.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {chips.map(chip => (
                                      <span
                                        key={chip}
                                        className="rounded-full app-accent-soft px-2 py-1 text-xs font-medium"
                                      >
                                        {chip}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="mt-4">
                                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                                    <span>R / P / S guess</span>
                                    <span>{expertName}</span>
                                  </div>
                                  <div className="mt-2 flex h-16 items-end gap-2">
                                    {MOVES.map(move => (
                                      <div
                                        key={move}
                                        className="relative flex-1"
                                        aria-label={`${prettyMove(move)} ${Math.round(normalized[move])}%`}
                                      >
                                        <div className="absolute inset-0 flex items-end justify-center rounded-t-lg bg-slate-100">
                                          <div
                                            className="w-7 rounded-t-lg app-accent-fill"
                                            style={{
                                              height: `${Math.min(100, Math.max(4, Math.round(normalized[move])))}%`,
                                            }}
                                          />
                                        </div>
                                        <div className="relative flex flex-col items-center justify-end gap-1">
                                          <span className="inline-flex items-center justify-center" aria-hidden="true">
                                            <MoveIcon move={move} size={28} />
                                          </span>
                                          <span className="text-[0.65rem] font-semibold text-slate-600">
                                            {Math.round(normalized[move])}%
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="mt-4 flex items-center justify-between text-[0.7rem] text-slate-500">
                                  <span>{playedAt}</span>
                                  <span>Confidence badge: {badgeInfo.label}</span>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                          Play rounds to unlock card insights.
                        </div>
                      )
                    ) : (
                      <div className="space-y-3">
                        <div className="overflow-auto rounded-2xl border border-slate-200">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-left text-slate-600">
                              <tr>
                                <th className="px-3 py-2">#</th>
                                <th className="px-3 py-2">You</th>
                                <th className="px-3 py-2">AI</th>
                                <th className="px-3 py-2">Outcome</th>
                                <th className="px-3 py-2">Confidence</th>
                                <th className="px-3 py-2">Mode</th>
                                <th className="px-3 py-2">Reason</th>
                                <th className="px-3 py-2">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {roundsPageSlice.map((round, idx) => {
                                const badgeInfo = CONFIDENCE_BADGE_INFO[round.confidenceBucket ?? confidenceBucket(round.confidence)];
                                const roundIndex = roundPageStartIndex + idx + 1;
                                return (
                                  <tr key={round.id} className="border-b border-slate-100 last:border-none">
                                    <td className="px-3 py-2">{roundIndex}</td>
                                    <td className="px-3 py-2">{prettyMove(round.player)}</td>
                                    <td className="px-3 py-2">{prettyMove(round.ai)}</td>
                                    <td className="px-3 py-2 capitalize">{round.outcome}</td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${badgeInfo.className}`}>
                                        <span aria-hidden="true">{badgeInfo.face}</span>
                                        <span>{Math.round(round.confidence * 100)}%</span>
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-600">
                                      {round.mode === "practice"
                                        ? "Practice · No score — Practice"
                                        : `${round.mode} · ${round.difficulty}`}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-600">{round.reason || "—"}</td>
                                    <td className="px-3 py-2 text-xs text-slate-500">
                                      {new Date(round.t).toLocaleString()}
                                    </td>
                                  </tr>
                                );
                              })}
                              {!roundsPageSlice.length && (
                                <tr>
                                  <td className="px-3 py-4 text-center text-sm text-slate-500" colSpan={8}>
                                    Play rounds to see table stats.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-slate-500">
                          Practice rows show “No score — Practice.” Challenge rows list the mode and difficulty you faced.
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>
                        Page {Math.min(roundPage + 1, totalRoundPages)} of {totalRoundPages}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={roundPage === 0}
                          onClick={() => setRoundPage(p => Math.max(0, p - 1))}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          disabled={roundPage + 1 >= totalRoundPages}
                          onClick={() => setRoundPage(p => Math.min(totalRoundPages - 1, p + 1))}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {statsTab === "insights" && (
                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700">Win/Lose by confidence</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {totalRounds
                            ? `When AI is very sure, you win ${Math.round((confidenceBandStats.find(b => b.key === "high")?.playerWinRate ?? 0) * 100)}%.`
                            : "Play rounds to see how confidence changes outcomes."}
                        </p>
                        <div className="mt-3 space-y-3">
                          {confidenceBandStats.map(band => {
                            const winPct = Math.round(band.playerWinRate * 100);
                            const tiePct = band.total ? Math.round((band.ties / band.total) * 100) : 0;
                            const lossPct = Math.round(band.aiWinRate * 100);
                            return (
                              <div key={band.key} className="space-y-2 rounded-xl bg-slate-50/80 p-3">
                                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                                  <span>{band.tone}</span>
                                  <span>{band.total} rounds</span>
                                </div>
                                <div className="relative h-6 overflow-hidden rounded-full">
                                  <div className="absolute inset-0 flex">
                                    <div style={{ width: `${winPct}%` }} className="bg-emerald-400" aria-hidden="true" />
                                    <div style={{ width: `${tiePct}%` }} className="bg-slate-300" aria-hidden="true" />
                                    <div style={{ width: `${lossPct}%` }} className="bg-rose-400" aria-hidden="true" />
                                  </div>
                                  <div className="relative z-10 flex h-full w-full items-center justify-between px-2 text-[0.7rem] font-semibold">
                                    <span className="flex items-center gap-1 text-emerald-50">
                                      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />Win {winPct}%
                                    </span>
                                    <span className="flex items-center gap-1 text-slate-700">
                                      <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />Tie {tiePct}%
                                    </span>
                                    <span className="flex items-center gap-1 text-rose-50">
                                      <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />AI {lossPct}%
                                    </span>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-500">
                                  When AI is {band.tone.toLowerCase()}, you win {winPct}%.
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700">Calibration</h3>
                        <p className="mt-1 text-xs text-slate-500">If I say 70% sure, I should be right about 70%.</p>
                        <div className="mt-3 flex items-center gap-4">
                          <svg viewBox="0 0 100 100" className="h-28 w-28">
                            <rect x="0" y="0" width="100" height="100" fill="#f1f5f9" rx="12" />
                            <line x1="0" y1="100" x2="100" y2="0" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 3" />
                            {activeCalibrationBins.length ? (
                              <polyline
                                fill="none"
                                stroke="#0f172a"
                                strokeWidth="2"
                                points={reliabilityPolyline}
                                strokeLinecap="round"
                              />
                            ) : null}
                            {activeCalibrationBins.map((bin, index) => (
                              <circle
                                key={index}
                                cx={Math.round(bin.avgConfidence * 100)}
                                cy={Math.round(100 - bin.actual * 100)}
                                r={2.5}
                                fill="#f97316"
                              />
                            ))}
                          </svg>
                          <div className="text-sm font-semibold text-slate-700">
                            {ecePercent !== null ? `${ecePercent}% ECE` : "—"}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700">Sharpness</h3>
                        <p className="mt-1 text-xs text-slate-500">Pointy = strong guess, flat = unsure.</p>
                        <div className="mt-3">
                          <div className="h-3 w-full rounded-full bg-slate-100" aria-hidden="true">
                            <div
                              className="h-full rounded-full bg-sky-400"
                              style={{ width: `${Math.min(100, Math.max(0, sharpnessPercent))}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>Flat</span>
                            <span>{sharpnessPercent}%</span>
                            <span>Pointy</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">More details</summary>
                      <div className="mt-2 space-y-1 text-sm text-slate-600">
                        <div>Brier score: {calibrationSummary.brier !== null ? calibrationSummary.brier.toFixed(3) : "—"}</div>
                        <div>Flip rate: {totalRounds > 1 ? `${flipRatePercent}%` : "—"}</div>
                        <div>Avg AI confidence: {averageConfidenceAll !== null ? `${averageConfidenceAll}%` : "—"}</div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
                <button
                  onClick={event => handleOpenExportDialog("stats", event.currentTarget)}
                  disabled={!canExportData}
                  className="px-3 py-1.5 rounded bg-sky-100 text-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-dev-label="stats.exportCSV"
                >
                  Export (CSV)
                </button>
                <p className={`text-xs ${shouldShowNoExportMessage ? "text-amber-600" : "text-slate-500"}`}>
                  {shouldShowNoExportMessage
                    ? "No data available to export."
                    : "Exports bundle your demographics with this statistics profile."}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Player Setup Modal */}
      <AnimatePresence>
        {isPlayerModalOpen && (
          <motion.div
            key="pmask"
            className="fixed inset-0 z-[70] bg-black/30 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onKeyDown={(e:any)=>{ if (e.key==='Escape' && hasConsented) setPlayerModalMode("hidden"); }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Player Setup"
              className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl max-h-[calc(100vh-2rem)] sm:max-h-[90vh]"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 6, opacity: 0 }}
            >
              <PlayerSetupForm
                mode={resolvedModalMode}
                player={modalPlayer}
                onClose={handlePlayerModalClose}
                onSaved={(result) => {
                  const origin = playerModalOrigin;
                  setPlayerModalMode("hidden");
                  setPlayerModalOrigin(null);
                  if (origin === "welcome") {
                    finishWelcomeFlow("setup");
                  } else if (origin === "settings" && result.action === "create") {
                    setForceTrainingPrompt(true);
                    openWelcome({
                      bootFirst: true,
                      origin: "settings",
                      announce: "New player saved. Booting into training setup.",
                    });
                    setBootNext("AUTO");
                    setWelcomeOrigin(null);
                    setWelcomeSeen(true);
                    setToastMessage("New player saved. Booting up to start training.");
                    setLive("New player saved. Boot sequence initiated to start training.");
                    return;
                  }
                  if (result.action === "create") {
                    setToastMessage(`New player starts a fresh training session (${TRAIN_ROUNDS} rounds).`);
                    setLive("New player created. Training required before challenge modes unlock.");
                  } else {
                    setLive("Player demographics updated.");
                  }
                }}
                createPlayer={createPlayer}
                updatePlayer={updatePlayer}
                origin={playerModalOrigin}
                onBack={playerModalOrigin === "welcome" ? handlePlayerModalClose : undefined}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer robot idle (personality beat) */}
      {showMainUi && !settingsOpen && !hideUiDuringModeTransition && (
        <div className="pointer-events-none fixed bottom-3 right-3 z-[90] flex flex-col items-end gap-3">
          <AnimatePresence>
            {robotBubbleContent && (
              <motion.div
                key="robot-bubble"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-auto relative max-w-xs rounded-2xl bg-white/95 px-4 py-2 text-sm text-slate-700 shadow-xl ring-1 ring-slate-200"
                role="status"
                aria-live="polite"
                aria-label={
                  robotBubbleContent.ariaLabel ??
                  (typeof robotBubbleContent.message === "string" ? robotBubbleContent.message : undefined)
                }
              >
                <div className="text-sm font-medium text-slate-800">{robotBubbleContent.message}</div>
                {robotBubbleContent.buttons && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {robotBubbleContent.buttons.map(button => (
                      <button
                        key={button.label}
                        type="button"
                        className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-sky-700"
                        data-dev-label="robot.bubble.link"
                        onClick={button.onClick}
                      >
                        {button.label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="pointer-events-none absolute bottom-[-6px] right-5 h-3 w-3 rotate-45 bg-white/95 ring-1 ring-slate-200/70" />
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            type="button"
            ref={robotButtonRef}
            className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-white/80 shadow-lg ring-1 ring-slate-200 backdrop-blur transition hover:bg-white"
            data-dev-label="robot.icon.click"
            onClick={() => {
              setHelpGuideOpen(prev => {
                const next = !prev;
                setLive(next ? "Ready robot help guide opened." : "Ready robot help guide closed.");
                return next;
              });
            }}
            onMouseEnter={() => setRobotHovered(true)}
            onMouseLeave={() => setRobotHovered(false)}
            onFocus={() => setRobotFocused(true)}
            onBlur={() => setRobotFocused(false)}
            aria-label="Ready robot help"
            aria-expanded={helpGuideOpen}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <RobotMascot
              className="pointer-events-none h-12 w-12"
              variant={hudRobotVariant}
              sizeConfig="(min-width: 640px) 64px, 48px"
            />
          </motion.button>
          <AnimatePresence>
            {helpGuideOpen && (
              <motion.div
                key="robot-help"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-auto w-[min(280px,80vw)] rounded-2xl bg-white/95 p-4 text-sm text-slate-700 shadow-2xl ring-1 ring-slate-200"
              >
                <div className="space-y-3">
                  {helpGuideItems.map(item => (
                    <div key={item.title} className="rounded-xl bg-slate-50/80 p-3 shadow-inner">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="rounded-lg bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-slate-900"
                    onClick={() => {
                      setHelpGuideOpen(false);
                      setLive("Ready robot help guide closed.");
                      requestAnimationFrame(() => robotButtonRef.current?.focus());
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
        </div>
      </div>
      {DEV_MODE_ENABLED && (
        <>
          <div
            aria-hidden="true"
            role="presentation"
            className="fixed bottom-0 left-0 z-[60] h-8 w-8"
            onClick={handleDeveloperHotspotClick}
          />
          <DeveloperConsole
            open={developerOpen}
            onClose={handleDeveloperClose}
            timings={matchTimings}
            onTimingsUpdate={updateMatchTimings}
            onTimingsReset={resetMatchTimings}
          />
        </>
      )}
    </>
  );
}

interface PlayerSetupFormProps {
  mode: "create" | "edit";
  player: PlayerProfile | null;
  onClose: () => void;
  onSaved: (result: { action: "create" | "update"; player: PlayerProfile }) => void;
  createPlayer: (input: Omit<PlayerProfile, "id">) => PlayerProfile;
  updatePlayer: (id: string, patch: Partial<Omit<PlayerProfile, "id">>) => void;
  origin?: "welcome" | "settings" | null;
  onBack?: () => void;
}

function extractNameParts(fullName: string){
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "", lastInitial: "" };
  const segments = trimmed.split(/\s+/);
  if (segments.length === 1) {
    return { firstName: segments[0], lastInitial: "" };
  }
  const lastSegment = segments[segments.length - 1].replace(/[^A-Za-z]/g, "");
  const first = segments.slice(0, -1).join(" ");
  const initial = lastSegment ? lastSegment[0].toUpperCase() : "";
  return { firstName: first, lastInitial: initial };
}

function formatLastInitial(value: string){
  const match = value.trim().match(/[A-Za-z]/);
  const upper = match ? match[0].toUpperCase() : "";
  return upper ? `${upper}.` : "";
}

function PlayerSetupForm({ mode, player, onClose, onSaved, createPlayer, updatePlayer, origin, onBack }: PlayerSetupFormProps){
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [grade, setGrade] = useState<Grade | "">(player?.grade ?? "");
  const [school, setSchool] = useState(player?.school ?? "");
  const [priorExperience, setPriorExperience] = useState(player?.priorExperience ?? "");

  useEffect(() => {
    const parts = extractNameParts(player?.playerName ?? "");
    setFirstName(parts.firstName);
    setLastInitial(parts.lastInitial);
    setGrade(player?.grade ?? "");
    setSchool(player?.school ?? "");
    setPriorExperience(player?.priorExperience ?? "");
  }, [player, mode]);

  const saveDisabled = !firstName.trim() || !lastInitial.trim() || !grade;
  const title = mode === "edit" ? "Edit player demographics" : "Create new player";
  const showReviewNotice = mode === "edit" && player?.needsReview;
  const showBackButton = origin === "welcome" && mode === "create";
  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      onClose();
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastInitial.trim();
    if (!trimmedFirst || !trimmedLast || !grade) return;
    const schoolValue = school.trim();
    const priorValue = priorExperience.trim();
    const formattedLastInitial = formatLastInitial(trimmedLast);
    const combinedName = formattedLastInitial ? `${trimmedFirst} ${formattedLastInitial}` : trimmedFirst;
    const consent = {
      agreed: true,
      timestamp: new Date().toISOString(),
      consentTextVersion: CONSENT_TEXT_VERSION,
    };
    const payload = {
      playerName: combinedName,
      grade: grade as Grade,
      school: schoolValue ? schoolValue : undefined,
      priorExperience: priorValue ? priorValue : undefined,
      consent,
      needsReview: false,
    } satisfies Omit<PlayerProfile, "id">;
    if (mode === "edit" && player) {
      updatePlayer(player.id, payload);
      onSaved({ action: "update", player: { ...player, ...payload } });
    } else {
      const created = createPlayer(payload);
      onSaved({ action: "create", player: created });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-1 min-h-0 flex-col"
      aria-label="Player setup form"
    >
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <button
          type="button"
          onClick={showBackButton ? handleBackClick : onClose}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          {showBackButton ? "Back" : "Close"}
        </button>
      </div>
      <div className="mt-4 flex-1 min-h-0 overflow-y-auto px-5">
        <div className="space-y-3 pb-5">
          {showReviewNotice && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Please confirm the player name and grade to continue.
            </div>
          )}
          {mode === "create" && (
            <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
              A new player will begin a fresh training session after saving.
            </div>
          )}
          <label className="text-sm font-medium text-slate-700">
            First name
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 shadow-inner"
              placeholder="e.g. Alex"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Last name initial
            <input
              type="text"
              value={lastInitial}
              onChange={e => setLastInitial(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 shadow-inner"
              placeholder="e.g. W"
              maxLength={3}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Grade
            <select
              value={grade}
              onChange={e => setGrade(e.target.value as Grade | "")}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 shadow-inner"
              required
            >
              <option value="" disabled>
                Select grade
              </option>
              {GRADE_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            School (optional)
            <input
              type="text"
              value={school}
              onChange={e => setSchool(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 shadow-inner"
              placeholder="e.g. Roosevelt Elementary"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Prior experience (optional)
            <textarea
              value={priorExperience}
              onChange={e => setPriorExperience(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 shadow-inner"
              placeholder="Tell us, have you played Rock-Paper-Scissors before, or do you know some AI basics?"
            />
          </label>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {showBackButton ? (
            <>
              <button
                type="button"
                onClick={handleBackClick}
                className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={saveDisabled}
                className={`px-3 py-1.5 rounded text-white ${saveDisabled ? 'bg-slate-300 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700 shadow'}`}
              >
                Save profile
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveDisabled}
                className={`px-3 py-1.5 rounded text-white ${saveDisabled ? 'bg-slate-300 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700 shadow'}`}
              >
                Save profile
              </button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}

export default function RPSDoodleApp(){
  return (
    <PlayersProvider>
      <StatsProvider>
        <RPSDoodleAppInner />
      </StatsProvider>
    </PlayersProvider>
  );
}
