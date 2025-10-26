import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, type Transition } from "framer-motion";
import { Move, Mode, AIMode, Outcome, BestOf } from "./gameTypes";
import { StatsProvider, useStats, RoundLog, MixerTrace, HeuristicTrace, DecisionPolicy } from "./stats";
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
import LeaderboardModal from "./LeaderboardModal";
import { computeMatchScore } from "./leaderboard";
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
import AIConfidencePanel, { AiInsightChip } from "./AIConfidencePanel";
import HelpCenter, { type HelpQuestion } from "./HelpCenter";

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
const MODES: Mode[] = ["challenge","practice"];

// Icons (emoji fallback)
const moveEmoji: Record<Move, string> = { rock: "\u270A", paper: "\u270B", scissors: "\u270C\uFE0F" };

const DIFFICULTY_INFO: Record<AIMode, { label: string; helper: string }> = {
  fair: { label: "Fair", helper: "Gentle counterplay tuned for learning." },
  normal: { label: "Normal", helper: "Balanced challenge that reacts to streaks." },
  ruthless: { label: "Ruthless", helper: "Aggressive mix-ups that punish predictability." },
};

const DIFFICULTY_SEQUENCE: AIMode[] = ["fair", "normal", "ruthless"];
const BEST_OF_OPTIONS: BestOf[] = [3, 5, 7];
const LEGACY_WELCOME_SEEN_KEY = "rps_welcome_seen_v1";
const WELCOME_PREF_KEY = "rps_welcome_pref_v1";
type WelcomePreference = "show" | "skip";

type RobotVariant = "idle" | "happy" | "meh" | "sad";
type RobotReaction = { emoji: string; body?: string; label: string; variant: RobotVariant };

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
}

type RoundFilterMode = Mode | "all";
type RoundFilterDifficulty = AIMode | "all";
type RoundFilterOutcome = Outcome | "all";

interface PendingDecision {
  policy: DecisionPolicy;
  mixer?: {
    dist: Dist;
    experts: { name: string; weight: number; dist: Dist }[];
    counter: Move;
    confidence: number;
  };
  heuristic?: HeuristicTrace;
  confidence: number;
}

function prettyMove(move: Move){
  return move.charAt(0).toUpperCase() + move.slice(1);
}

function confidenceBucket(value: number): "low" | "medium" | "high" {
  if (value >= 0.7) return "high";
  if (value >= 0.45) return "medium";
  return "low";
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
    id: "what-is-confidence",
    question: "What is AI confidence?",
    answer: "How sure the computer feels about its prediction—the higher the %, the more certain it is.",
  },
  {
    id: "why-up-down",
    question: "Why does confidence go up or down?",
    answer: "It rises when your play has patterns and drops when your choices look random.",
  },
  {
    id: "what-does-50",
    question: "What does 50% mean?",
    answer: "The AI isn’t very sure—two choices look almost equally likely.",
  },
  {
    id: "what-does-90",
    question: "What does 90%+ mean?",
    answer: "The AI sees a strong pattern and is very confident about the next move.",
  },
  {
    id: "training-effect",
    question: "How does Training Mode affect confidence?",
    answer: "Confidence starts low and grows as the AI gathers data about your habits.",
  },
  {
    id: "challenge-use",
    question: "How does Challenge Mode use confidence?",
    answer: "The AI uses what it learned to predict and counter your next move; the % shows certainty.",
  },
  {
    id: "example-85",
    question: "Example: What does “Confidence 85%” mean?",
    answer: "The AI thinks one move is very likely, so it chooses the counter to try to beat you.",
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

function chipLabelForExpert(name: string, move: Move): string {
  const pretty = prettyMove(move);
  switch (name) {
    case "FrequencyExpert":
      return `Frequent ${pretty}`;
    case "RecencyExpert":
      return `Recent bias: ${pretty}`;
    case "MarkovExpert(k=1)":
      return `Sequence hints ${pretty}`;
    case "MarkovExpert(k=2)":
      return `Longer pattern → ${pretty}`;
    case "OutcomeExpert":
      return `After last result: ${pretty}`;
    case "WinStayLoseShiftExpert":
      return `Win/Lose habit: ${pretty}`;
    case "PeriodicExpert":
      return `Alternating pattern: ${pretty}`;
    case "BaitResponseExpert":
      return `Reacting to us: ${pretty}`;
    default:
      return `Expert hint: ${pretty}`;
  }
}

function chipDetailForExpert(name: string, move: Move, weight: number, probability: number): string {
  const pretty = prettyMove(move);
  const weightPct = Math.round(weight * 100);
  const probPct = Math.round(probability * 100);
  const friendlyName = name
    .replace("MarkovExpert", "Markov expert")
    .replace("WinStayLoseShiftExpert", "Win/Stay-Lose/Switch expert")
    .replace("PeriodicExpert", "Periodic expert")
    .replace("FrequencyExpert", "Frequency expert")
    .replace("RecencyExpert", "Recency expert")
    .replace("OutcomeExpert", "Outcome expert")
    .replace("BaitResponseExpert", "Bait response expert");
  return `${friendlyName} leaned ${probPct}% toward ${pretty}, contributing ${weightPct}% of the mix.`;
}

function makeInsightChips(trace: PendingDecision | null): AiInsightChip[] {
  if (!trace) return [];
  const chips: AiInsightChip[] = [];

  const pushChip = (chip: AiInsightChip) => {
    if (!chip.detail) return;
    if (chips.some(existing => existing.id === chip.id)) return;
    chips.push(chip);
  };

  if (trace.heuristic?.reason) {
    const reason = trace.heuristic.reason;
    pushChip({
      id: "heuristic-reason",
      label: reason.length > 52 ? reason.slice(0, 49) + "…" : reason,
      detail: reason,
    });
  }

  if (trace.heuristic?.predicted) {
    const predicted = trace.heuristic.predicted;
    const pct = trace.heuristic.conf != null ? Math.round((trace.heuristic.conf ?? 0) * 100) : null;
    const pretty = prettyMove(predicted);
    const detailParts = [`Heuristic expected ${pretty}`];
    if (pct != null) detailParts.push(`about ${pct}% of the time`);
    detailParts.push("and picked the counter move.");
    pushChip({
      id: "heuristic-prediction",
      label: `Expecting ${pretty}`,
      detail: detailParts.join(" "),
    });
  }

  if (trace.mixer?.experts?.length) {
    const sorted = [...trace.mixer.experts].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    sorted.slice(0, 2).forEach((expert, index) => {
      let topMove: Move = "rock";
      let topScore = -Infinity;
      (Object.keys(expert.dist) as Move[]).forEach(move => {
        const score = expert.dist[move] ?? 0;
        if (score > topScore) {
          topScore = score;
          topMove = move;
        }
      });
      pushChip({
        id: `expert-${index}-${expert.name}`,
        label: chipLabelForExpert(expert.name, topMove),
        detail: chipDetailForExpert(expert.name, topMove, expert.weight ?? 0, topScore > 0 ? topScore : 0),
      });
    });
  }

  return chips.slice(0, 2);
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
function ModeCard({ mode, onSelect, isDimmed, disabled = false }: { mode: Mode, onSelect: (m:Mode)=>void, isDimmed:boolean, disabled?: boolean }){
  const label = mode.charAt(0).toUpperCase()+mode.slice(1);
  return (
    <motion.button className={`mode-card ${mode} ${isDimmed ? "dim" : ""} ${disabled ? "opacity-60 cursor-not-allowed" : ""} bg-white/80 rounded-2xl shadow relative overflow-hidden px-5 py-6 text-left`}
      data-dev-label={`mode.${mode}.card`}
      layoutId={`card-${mode}`} onClick={() => { if (!disabled) onSelect(mode); }} disabled={disabled} whileTap={{ scale: disabled ? 1 : 0.98 }} whileHover={{ y: disabled ? 0 : -4 }} aria-label={`${label} mode`}>
      <div className="text-lg font-bold text-slate-800">{label}</div>
      <div className="text-sm text-slate-600 mt-1">
        {mode === "challenge" && "Timed rounds, high stakes—can you outsmart the AI?"}
        {mode === "practice" && "No score; experiment and learn."}
      </div>
      <span className="ink-pop" />
    </motion.button>
  );
}

function OnOffToggle({ value, onChange, disabled = false, onLabel, offLabel }: { value: boolean; onChange: (next: boolean) => void; disabled?: boolean; onLabel?: string; offLabel?: string }) {
  const baseButton = "px-3 py-1 text-xs font-semibold transition-colors";
  return (
    <div className="inline-flex items-center overflow-hidden rounded-full border border-slate-300 bg-white shadow-sm">
      <button
        type="button"
        className={`${baseButton} ${value ? "bg-sky-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
        aria-pressed={value}
        onClick={() => !disabled && onChange(true)}
        disabled={disabled}
        data-dev-label={onLabel}
      >
        On
      </button>
      <button
        type="button"
        className={`${baseButton} ${!value ? "bg-slate-200 text-slate-700" : "text-slate-500 hover:bg-slate-100"}`}
        aria-pressed={!value}
        onClick={() => !disabled && onChange(false)}
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
  } = useStats();
  const { players, currentPlayer, hasConsented, createPlayer, updatePlayer, setCurrentPlayer } = usePlayers();
  const initialWelcomePreferenceRef = useRef<WelcomePreference | null>(null);
  if (initialWelcomePreferenceRef.current === null) {
    initialWelcomePreferenceRef.current = getInitialWelcomePreference();
  }
  const initialWelcomePreference = initialWelcomePreferenceRef.current;
  const [welcomePreference, setWelcomePreference] = useState<WelcomePreference>(initialWelcomePreference);
  const [welcomeSeen, setWelcomeSeen] = useState<boolean>(initialWelcomePreference === "skip");
  const [welcomeActive, setWelcomeActive] = useState(false);
  const [welcomeStage, setWelcomeStage] = useState<"intro" | "create" | "restore">("intro");
  const [welcomeOrigin, setWelcomeOrigin] = useState<"launch" | "settings" | null>(null);
  const [welcomeSlide, setWelcomeSlide] = useState(0);
  const [statsOpen, setStatsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsTab, setStatsTab] = useState<"overview" | "matches" | "rounds" | "insights">("overview");
  const statsModalRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const toastReaderCloseRef = useRef<HTMLButtonElement | null>(null);
  const wasSettingsOpenRef = useRef(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [roundPage, setRoundPage] = useState(0);
  const [liveAiConfidence, setLiveAiConfidence] = useState<number | null>(null);
  const [liveAiInsights, setLiveAiInsights] = useState<AiInsightChip[]>([]);
  const [aiPanelMobileOpen, setAiPanelMobileOpen] = useState(false);
  const decisionTraceRef = useRef<PendingDecision | null>(null);
  const aiStreakRef = useRef(0);
  const youStreakRef = useRef(0);
  const matchStartRef = useRef<string>(new Date().toISOString());
  const currentMatchIdRef = useRef<string>(makeLocalId("match"));
  const roundStartRef = useRef<number | null>(null);
  const lastDecisionMsRef = useRef<number | null>(null);
  const currentMatchRoundsRef = useRef<RoundLog[]>([]);
  const [roundFilters, setRoundFilters] = useState<{ mode: RoundFilterMode; difficulty: RoundFilterDifficulty; outcome: RoundFilterOutcome; from: string; to: string }>({ mode: "all", difficulty: "all", outcome: "all", from: "", to: "" });
  useEffect(() => { setRoundPage(0); }, [roundFilters, profileRounds]);
  const rounds = useMemo(() => profileRounds, [profileRounds]);
  const matches = useMemo(() => profileMatches, [profileMatches]);
  type PlayerModalMode = "hidden" | "create" | "edit";
  const [playerModalMode, setPlayerModalMode] = useState<PlayerModalMode>("hidden");
  const [playerModalOrigin, setPlayerModalOrigin] = useState<"welcome" | "settings" | null>(null);
  const isPlayerModalOpen = playerModalMode !== "hidden";
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreSelectedPlayerId, setRestoreSelectedPlayerId] = useState<string | null>(null);
  type Scene = "WELCOME"|"BOOT"|"MODE"|"MATCH"|"RESULTS";
  const [scene, setScene] = useState<Scene>("BOOT");
  const [bootNext, setBootNext] = useState<"WELCOME" | "AUTO">(
    initialWelcomePreference === "show" ? "WELCOME" : "AUTO"
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
    { confirmLabel: string; cancelLabel?: string; onConfirm: () => void } | null
  >(null);
  const [helpToast, setHelpToast] = useState<{ title: string; message: string } | null>(null);
  const [helpGuideOpen, setHelpGuideOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [helpActiveQuestionId, setHelpActiveQuestionId] = useState<string | null>(
    AI_FAQ_QUESTIONS[0]?.id ?? null,
  );
  const [robotHovered, setRobotHovered] = useState(false);
  const [robotFocused, setRobotFocused] = useState(false);
  const [robotResultReaction, setRobotResultReaction] = useState<RobotReaction | null>(null);
  const robotResultTimeoutRef = useRef<number | null>(null);
  const robotRestTimeoutRef = useRef<number | null>(null);
  const [trainingCelebrationActive, setTrainingCelebrationActive] = useState(false);
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
    const id = window.setTimeout(() => setToastMessage(null), 4000);
    return () => window.clearTimeout(id);
  }, [toastMessage, toastReaderOpen]);
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
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(WELCOME_PREF_KEY, welcomePreference);
      if (welcomePreference === "skip") {
        window.localStorage.setItem(LEGACY_WELCOME_SEEN_KEY, "true");
      } else {
        window.localStorage.removeItem(LEGACY_WELCOME_SEEN_KEY);
      }
    } catch {
      /* noop */
    }
  }, [welcomePreference]);
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

  const handlePredictorToggle = useCallback((checked: boolean) => {
    setPredictorMode(checked);
    if (currentProfile) {
      updateStatsProfile(currentProfile.id, { predictorDefault: checked });
    }
  }, [currentProfile, updateStatsProfile]);

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

  const [predictorMode, setPredictorMode] = useState<boolean>(currentProfile?.predictorDefault ?? true);
  const [aiMode, setAiMode] = useState<AIMode>("normal");
  const [difficultyHint, setDifficultyHint] = useState<string>(DIFFICULTY_INFO["normal"].helper);
  const TRAIN_ROUNDS = 10;
  const trainingCount = currentProfile?.trainingCount ?? 0;
  const isTrained = currentProfile?.trained ?? false;
  const previousTrainingCountRef = useRef(trainingCount);
  const [trainingActive, setTrainingActive] = useState<boolean>(false);
  const [trainingCalloutQueue, setTrainingCalloutQueue] = useState<string[]>([]);
  const welcomeSlides = useMemo(
    () => [
      {
        title: "Welcome to RPS AI Lab",
        body: `You’ll train for ${TRAIN_ROUNDS} rounds, then choose a Mode: Challenge (Smarter AI prediction) or Practice (Experiment and learn).`,
      },
      {
        title: "Your data",
        body: "We collect gameplay for learning. Exports will include your data and demographics.",
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
  const [round, setRound] = useState(1);
  const [lastMoves, setLastMoves] = useState<Move[]>([]);
  const [aiHistory, setAiHistory] = useState<Move[]>([]);
  const [outcomesHist, setOutcomesHist] = useState<Outcome[]>([]);

  type Phase = "idle"|"selected"|"countdown"|"reveal"|"resolve"|"feedback";
  const [phase, setPhase] = useState<Phase>("idle");
  const [playerPick, setPlayerPick] = useState<Move|undefined>();
  const [aiPick, setAiPick] = useState<Move|undefined>();
  const [count, setCount] = useState<number>(3);
  const [outcome, setOutcome] = useState<Outcome|undefined>();
  const [resultBanner, setResultBanner] = useState<"Victory"|"Defeat"|"Tie"|null>(null);
  const [live, setLive] = useState("");
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
  const [wipeRun, setWipeRun] = useState(false);
  const modeLabel = (m:Mode)=> m.charAt(0).toUpperCase()+m.slice(1);

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
      setTrainingCelebrationActive(false);
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
      setTrainingCelebrationActive,
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

  const finishWelcomeFlow = useCallback(
    (reason: "setup" | "restore" | "dismiss") => {
      setWelcomeActive(false);
      setWelcomeSlide(0);
      setWelcomeStage("intro");
      setBootNext("AUTO");
      setWelcomeSeen(true);
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
    let mixerTrace: MixerTrace | undefined = trace?.mixer
      ? {
          dist: trace.mixer.dist,
          counter: trace.mixer.counter,
          topExperts: trace.mixer.experts
            .map(e => ({ name: e.name, weight: e.weight, pActual: e.dist[playerMove] ?? 0 }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3),
          confidence: trace.mixer.confidence,
        }
      : undefined;
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
    const preferred = currentProfile?.predictorDefault ?? true;
    setPredictorMode(preferred);
  }, [currentProfile?.id, currentProfile?.predictorDefault, needsTraining, trainingActive, predictorMode]);

  useEffect(() => {
    if (scene !== "MATCH") {
      setAiPanelMobileOpen(false);
    }
  }, [scene]);

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
    devInstrumentation.setView(parts.join("+"));
  }, [scene, statsOpen, leaderboardOpen, settingsOpen, helpGuideOpen, welcomeActive]);

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
      startMatch("practice", { silent: true });
      if (!trainingActive) {
        setTrainingActive(true);
      }
      return;
    }
    setScene("MODE");
  }, [
    scene,
    bootReady,
    bootNext,
    needsTraining,
    currentProfile,
    hasConsented,
    trainingActive,
    setWelcomeOrigin,
    setWelcomeSeen,
    setWelcomeStage,
  ]);

  useEffect(() => {
    if (!pendingWelcomeExit) return;
    const { reason } = pendingWelcomeExit;
    if (reason !== "dismiss" && needsTraining && currentProfile && hasConsented) {
      if (!trainingActive) {
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
    { key: "matches", label: "Matches" },
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

  const matchesSorted = useMemo(() => {
    return [...matches].sort((a, b) => (b.endedAt || b.startedAt).localeCompare(a.endedAt || a.startedAt));
  }, [matches]);

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

  const pageSize = 200;
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
  const shouldShowIdleBubble = !trainingActive && !trainingCelebrationActive && !robotResultReaction && (robotHovered || robotFocused || helpGuideOpen);
  const robotBubbleContent: { message: React.ReactNode; buttons?: { label: string; onClick: () => void }[]; ariaLabel?: string; emphasise?: boolean } | null = trainingCelebrationActive
    ? {
        message: "Training complete! You can now play Modes (Challenge or Practice).",
        buttons: [
          {
            label: "Play Challenge",
            onClick: () => {
              setTrainingCelebrationActive(false);
              setHelpGuideOpen(false);
              setLive("Opening Challenge mode from training completion.");
              handleModeSelect("challenge");
            },
          },
          {
            label: "View My Stats",
            onClick: () => {
              setTrainingCelebrationActive(false);
              setHelpGuideOpen(false);
              setLive("Opening statistics after training completion.");
              setStatsOpen(true);
            },
          },
        ],
      }
    : robotResultReaction
      ? {
          message: (
            <div className="flex flex-col items-center gap-1 text-center text-slate-800">
              <span className="text-3xl leading-none" aria-hidden="true">
                {robotResultReaction.emoji}
              </span>
              {robotResultReaction.body && (
                <span className="text-sm font-medium text-slate-800">
                  {robotResultReaction.body}
                </span>
              )}
            </div>
          ),
          ariaLabel: robotResultReaction.label,
          emphasise: true,
        }
      : trainingActive
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

  const difficultySummary = useMemo(() => {
    const base = {
      fair: { wins: 0, total: 0, confidence: 0 },
      normal: { wins: 0, total: 0, confidence: 0 },
      ruthless: { wins: 0, total: 0, confidence: 0 },
    } as Record<AIMode, { wins: number; total: number; confidence: number }>;
    matches.forEach(m => {
      base[m.difficulty].total += 1;
      if (m.score.you > m.score.ai) base[m.difficulty].wins += 1;
    });
    rounds.forEach(r => {
      base[r.difficulty].confidence += r.confidence;
    });
    return (Object.keys(base) as AIMode[]).map(key => {
      const entry = base[key];
      const totalConfRounds = rounds.filter(r => r.difficulty === key).length;
      const avgConf = totalConfRounds ? entry.confidence / totalConfRounds : 0;
      return { difficulty: key, winRate: entry.total ? entry.wins / entry.total : 0, avgConfidence: avgConf };
    });
  }, [matches, rounds]);

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
  const topTransitionLabel = topTransition
  ? `${topTransition.pair} (${topTransition.count})`
  : "Not enough data";

  const recentTrend = useMemo(() => {
    const slice = rounds.slice(-20);
    if (!slice.length) return [] as { x: number; y: number; value: number }[];
    const width = 220;
    const height = 60;
    const step = slice.length > 1 ? (width - 20) / (slice.length - 1) : 0;
    return slice.map((r, idx) => {
      const winValue = r.outcome === "win" ? 1 : r.outcome === "tie" ? 0.5 : 0;
      const x = 10 + step * idx;
      const y = height - 10 - winValue * (height - 20);
      return { x, y, value: winValue };
    });
  }, [rounds]);
  const sparklinePoints = useMemo(() => recentTrend.map(p => `${p.x},${p.y}`).join(" "), [recentTrend]);
  const lastTrendPercent = recentTrend.length ? Math.round(recentTrend[recentTrend.length - 1].value * 100) : 0;

  const confidenceBuckets = useMemo(() => {
    const buckets = [
      { label: "0-33%", wins: 0, total: 0 },
      { label: "34-66%", wins: 0, total: 0 },
      { label: "67-100%", wins: 0, total: 0 },
    ];
    rounds.forEach(r => {
      const conf = r.confidence;
      const idx = conf < 0.34 ? 0 : conf < 0.67 ? 1 : 2;
      const bucket = buckets[idx];
      bucket.total += 1;
      if (r.outcome === "lose") bucket.wins += 1;
    });
    return buckets.map(b => ({ ...b, winRate: b.total ? b.wins / b.total : 0 }));
  }, [rounds]);

  const expertContribution = useMemo(() => {
    const counts = new Map<string, number>();
    rounds.forEach(r => {
      const top = r.mixer?.topExperts?.[0];
      if (top){
        counts.set(top.name, (counts.get(top.name) || 0) + 1);
      }
    });
    return [...counts.entries()].sort((a,b)=> b[1]-a[1]);
  }, [rounds]);

  const averageYouStreak = totalRounds ? (rounds.reduce((acc, r) => acc + r.streakYou, 0) / totalRounds).toFixed(2) : "0.00";
  const averageAiStreak = totalRounds ? (rounds.reduce((acc, r) => acc + r.streakAI, 0) / totalRounds).toFixed(2) : "0.00";
  const selectedMatch = useMemo(() => matches.find(m => m.id === selectedMatchId) || null, [matches, selectedMatchId]);
  const selectedMatchKey = selectedMatch ? (selectedMatch.clientId || selectedMatch.id) : null;
  const selectedMatchResult = selectedMatch ? (selectedMatch.score.you > selectedMatch.score.ai ? "Win" : selectedMatch.score.you === selectedMatch.score.ai ? "Tie" : "Loss") : "";
  const selectedMatchDate = selectedMatch ? new Date(selectedMatch.endedAt || selectedMatch.startedAt).toLocaleString() : "";
  const selectedMatchRounds = useMemo(() => {
    if (!selectedMatchKey) return [] as RoundLog[];
    return rounds.filter(r => r.matchId === selectedMatchKey);
  }, [rounds, selectedMatchKey]);

  const matchExpertBreakdown = useMemo(() => {
    if (!selectedMatchRounds.length) return [] as { name: string; count: number }[];
    const map = new Map<string, number>();
    selectedMatchRounds.forEach(r => {
      const top = r.mixer?.topExperts?.[0];
      if (top) map.set(top.name, (map.get(top.name) || 0) + 1);
    });
    return [...map.entries()].sort((a,b)=> b[1]-a[1]).map(([name,count])=>({ name, count }));
  }, [selectedMatchRounds]);

  const matchAiWins = selectedMatchRounds.filter(r => r.outcome === "lose");

  const favoriteMoveText = behaviorStats.favoriteMove ? prettyMove(behaviorStats.favoriteMove) + " (" + Math.round(behaviorStats.favoritePct * 100) + "%)" : "None yet";

  const patternHint = useMemo(() => {
    if (rounds.length < 6) return null;
    const sequence = rounds.map(r => r.player);
    const info = detectPatternNext(sequence);
    if (info.move && info.reason) {
      return info.reason;
    }
    return null;
  }, [rounds]);

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

  const handleWelcomeReplayToggle = useCallback(
    (value: boolean) => {
      const nextPreference: WelcomePreference = value ? "show" : "skip";
      setWelcomePreference(nextPreference);
      if (nextPreference === "show") {
        setToastMessage("The welcome intro will show next time you open RPS AI Lab.");
        setLive("Welcome intro scheduled to replay on the next launch.");
      } else {
        setToastMessage("The welcome intro will stay hidden on launch.");
        setLive("Welcome intro replay disabled.");
      }
    },
    [setLive, setToastMessage, setWelcomePreference],
  );

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
    setLive("Settings opened. Press Escape to close.");
  }, [setLive]);

  const handleCloseSettings = useCallback(
    (announce: boolean = true) => {
      setSettingsOpen(false);
      if (announce) {
        setLive("Settings closed.");
      }
    },
    [setLive]
  );

  const handleReboot = useCallback(() => {
    setToastMessage("Confirm reboot? This will replay the welcome intro after the boot sequence.");
    setToastConfirm({
      confirmLabel: "Reboot now",
      cancelLabel: "Cancel",
      onConfirm: () => {
        setToastConfirm(null);
        setToastMessage(null);
        handleCloseSettings(false);
        openWelcome({
          announce: "Rebooting. Boot sequence starting for the welcome intro.",
          resetPlayer: true,
          bootFirst: true,
          origin: "launch",
        });
      },
    });
    setLive("Reboot requested. Confirm via toast to restart.");
  }, [handleCloseSettings, openWelcome, setLive, setToastConfirm, setToastMessage]);

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
    if (!useMix || lastMoves.length === 0){
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
        const confValue = typeof heur.conf === "number" ? heur.conf : 0;
        setLiveAiConfidence(heur.conf ?? null);
        setLiveAiInsights(makeInsightChips(trace));
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
      setLiveAiConfidence(heurConf);
      setLiveAiInsights(makeInsightChips(trace));
      fireAnalyticsEvent("ai_confidence_updated", { value: Math.round(heurConf * 100) });
      return move;
    }
    const ctx: Ctx = { playerMoves: lastMoves, aiMoves: aiHistory, outcomes: outcomesHist, rng };
    const dist = getMixer().predict(ctx);
    const snapshot = getMixer().snapshot();
    const move = policyCounterFromDist(dist, aiMode);
    const confidence = Math.max(dist.rock, dist.paper, dist.scissors);
    const trace: PendingDecision = {
      policy: "mixer",
      mixer: {
        dist,
        experts: snapshot.experts,
        counter: move,
        confidence,
      },
      confidence,
    };
    decisionTraceRef.current = trace;
    setLiveAiConfidence(confidence);
    setLiveAiInsights(makeInsightChips(trace));
    fireAnalyticsEvent("ai_confidence_updated", { value: Math.round(confidence * 100) });
    return move;
  }

  function resetMatch(){
    setPlayerScore(0);
    setAiScore(0);
    setRound(1);
    setLastMoves([]);
    setAiHistory([]);
    setOutcomesHist([]);
    setOutcome(undefined);
    setAiPick(undefined);
    setPlayerPick(undefined);
    setPhase("idle");
    setResultBanner(null);
    setLiveAiConfidence(null);
    setLiveAiInsights([]);
    decisionTraceRef.current = null;
    currentMatchRoundsRef.current = [];
    lastDecisionMsRef.current = null;
    roundStartRef.current = performance.now();
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
    aiStreakRef.current = 0;
    youStreakRef.current = 0;
    matchStartRef.current = new Date().toISOString();
    const matchMode: Mode = mode ?? selectedMode ?? "practice";
    const matchId = makeLocalId("match");
    currentMatchIdRef.current = matchId;
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
    }
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
      if (predictorMode && aiMode !== "fair") getMixer().update(ctx, player);
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
      setTrainingCelebrationActive(true);
      setHelpGuideOpen(false);
      setLive("Training complete. You can now play Challenge or Practice modes.");
    }
    if (trainingCount < TRAIN_ROUNDS) {
      setTrainingCelebrationActive(false);
    }
    previousTrainingCountRef.current = trainingCount;
  }, [trainingCount]);

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
        const matchScore = computeMatchScore(currentMatchRoundsRef.current);
        logMatch({
          clientId: currentMatchIdRef.current,
          startedAt: matchStartRef.current,
          endedAt,
          mode: selectedMode ?? "practice",
          bestOf,
          difficulty: aiMode,
          score: { you: playerScore, ai: aiScore },
          rounds: totalRounds,
          aiWinRate: totalRounds ? aiWins / totalRounds : 0,
          youSwitchedRate: switchRate,
          notes: undefined,
          leaderboardScore: matchScore?.total,
          leaderboardMaxStreak: matchScore?.maxStreak,
          leaderboardRoundCount: matchScore?.rounds,
          leaderboardTimerBonus: matchScore?.timerBonus,
          leaderboardBeatConfidenceBonus: matchScore?.beatConfidenceBonus,
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
    <div className="relative flex min-h-screen flex-col select-none overflow-x-hidden overflow-y-auto" style={{ fontSize: `${textScale*16}px` }}>
      <style>{style}</style>

      {/* Parallax background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-100 to-white"/>
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, ease: [0.22,0.61,0.36,1] }} className="absolute -top-20 left-0 right-0 h-60 opacity-60">
          <div className="absolute left-10 top-10 w-40 h-40 rounded-full bg-sky-200"/>
          <div className="absolute right-16 top-8 w-24 h-24 rounded-full bg-sky-300"/>
          <div className="absolute left-1/2 top-2 w-28 h-28 rounded-full bg-sky-200"/>
        </motion.div>
      </div>

      <LiveRegion message={live} />

      <AnimatePresence>
        {trainingCelebrationActive && (
          <motion.div
            key="training-complete-toast"
            className="fixed top-4 left-1/2 z-[95] w-[min(90vw,480px)] -translate-x-1/2"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="rounded-2xl bg-white/95 px-4 py-4 text-sm text-slate-700 shadow-2xl ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Training complete!</div>
              <p className="mt-1 text-sm text-slate-600">
                You can now play Modes (Challenge or Practice).
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-sky-700"
                  onClick={() => {
                    setTrainingCelebrationActive(false);
                    setHelpGuideOpen(false);
                    setLive("Opening Challenge mode from training completion.");
                    handleModeSelect("challenge");
                  }}
                >
                  Play Challenge
                </button>
                <button
                  type="button"
                  className="rounded-full bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-slate-900"
                  onClick={() => {
                    setTrainingCelebrationActive(false);
                    setHelpGuideOpen(false);
                    setLive("Opening statistics after training completion.");
                    setStatsOpen(true);
                  }}
                >
                  View My Stats
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => setTrainingCelebrationActive(false)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {toastMessage && toastConfirm ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-slate-800 shadow-2xl"
          >
            <div className="space-y-4">
              <div className="text-base font-semibold text-slate-900">Confirm action</div>
              <p className="text-sm text-slate-600">{toastMessage}</p>
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
                  className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white shadow hover:bg-sky-700"
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
                      {selectedRestorePlayer.age ? ` • Age ${selectedRestorePlayer.age}` : ""}
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
      {showMainUi && (
        <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between">
          <motion.h1 layout className="text-2xl font-extrabold tracking-tight text-sky-700 drop-shadow-sm">RPS Lab</motion.h1>
          <div className="flex items-center gap-2">
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
                className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700"
                data-dev-label="hdr.trainingBadge"
              >
                Training complete
              </span>
            )}
            {liveAiConfidence !== null && (
              <span
                className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 text-sky-700"
                data-dev-label="hdr.aiConfBadge"
              >
                AI conf: {Math.round((liveAiConfidence ?? 0) * 100)}%
              </span>
            )}
            <button
              onClick={() => setStatsOpen(true)}
              className="px-3 py-1.5 rounded-xl shadow text-sm bg-white/70 hover:bg-white text-sky-900"
              data-dev-label="hdr.stats"
            >
              Statistics
            </button>
            <button
              onClick={() => setLeaderboardOpen(true)}
              className={"px-3 py-1.5 rounded-xl shadow text-sm " + (hasConsented ? "bg-white/70 hover:bg-white text-sky-900" : "bg-white/50 text-slate-400 cursor-not-allowed")}
              disabled={!hasConsented}
              title={!hasConsented ? "Select a player to continue." : undefined}
              data-dev-label="hdr.leaderboard"
            >
              Leaderboard
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
                goToMode();
              }}
              title={!hasConsented ? "Select a player to continue." : undefined}
              disabled={modesDisabled || !hasConsented}
              className={"px-3 py-1.5 rounded-xl shadow text-sm " + ((modesDisabled || !hasConsented) ? "bg-white/50 text-slate-400 cursor-not-allowed" : "bg-white/70 hover:bg-white text-sky-900")}
              data-dev-label="hdr.modes"
            >
              Modes
            </button>
            <button
              ref={helpButtonRef}
              type="button"
              onClick={() => {
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
              ref={settingsButtonRef}
              type="button"
              onClick={handleOpenSettings}
              className={`px-3 py-1.5 rounded-xl shadow text-sm transition ${settingsOpen ? "bg-sky-600 text-white" : "bg-white/70 hover:bg-white text-sky-900"}`}
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              data-dev-label="hdr.settings"
            >
            Settings ⚙️
          </button>
          </div>
        </div>
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
                        <p className="text-xs text-amber-600">Update grade and age from Edit demographics.</p>
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
                              onClick={() => setBestOf(option)}
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
                        <div className="text-sm font-semibold text-slate-800">Show welcome again</div>
                        <p className="text-xs text-slate-500">Replay the intro on the next launch.</p>
                      </div>
                      <OnOffToggle
                        value={welcomePreference === "show"}
                        onChange={handleWelcomeReplayToggle}
                        onLabel="set.welcomeAgain.on"
                        offLabel="set.welcomeAgain.off"
                      />
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Reboot</div>
                        <p className="text-xs text-slate-500">Restart with the boot animation and welcome intro.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleReboot}
                        className="rounded-full bg-slate-900/90 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-slate-900"
                        data-dev-label="set.reboot"
                      >
                        Reboot
                      </button>
                    </div>
                  </div>
                </section>
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Help &amp; About</h2>
                  <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sky-700">
                      <button
                        type="button"
                        className="text-xs font-semibold hover:underline"
                        onClick={() => {
                          goToMode();
                          setHelpToast({
                            title: "What are Modes?",
                            message: "Modes show different ways to play and practice.",
                          });
                          setLive("Opening modes overview and showing help toast.");
                        }}
                      >
                        What are Modes?
                      </button>
                      <span aria-hidden className="text-slate-300">•</span>
                      <button
                        type="button"
                        className="text-xs font-semibold hover:underline"
                        onClick={() => {
                          setHelpToast({
                            title: "How training works",
                            message: `Training runs ${TRAIN_ROUNDS} rounds so the AI can learn your habits.`,
                          });
                          setLive("Training overview shared in help toast.");
                        }}
                      >
                        How training works
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
            <motion.div layout className="text-4xl font-black text-sky-700">Choose Your Mode</motion.div>
            <div className="mode-grid">
              {MODES.map(m => (
                <ModeCard key={m} mode={m} onSelect={handleModeSelect} isDimmed={!!selectedMode && selectedMode!==m} disabled={(m === "challenge" && needsTraining) || !hasConsented} />
              ))}
            </div>

            {/* Fullscreen morph container */}
            <AnimatePresence>
              {/* Trying to add different colors to challenge and training backgrounds.  Original code block commented out below.  This changed the splash page that welcomes player to the challenge or training mode.  */}
              {selectedMode && (
                <motion.div
                  key="fs"
                  className={`fullscreen ${
                    selectedMode === 'challenge'
                      ? 'bg-red-700'
                      : selectedMode === 'practice'
                      ? 'bg-blue-700'
                      : 'bg-gray-700'
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
              <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                <div className="flex flex-col items-center gap-4 lg:gap-6">
            {/* HUD */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }} className="relative w-full max-w-[820px] bg-white/70 rounded-2xl shadow px-4 py-3">
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
                <div className="flex w-full items-center justify-between gap-3 sm:gap-6">
                  <div className="flex flex-1 flex-col items-center gap-3 text-center">
                    <div className="text-sm text-slate-700">Round <strong>{round}</strong> • Best of {bestOf}</div>
                    <span
                      className={`inline-flex items-center justify-center rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide ${
                        (phase === "resolve" || phase === "feedback") && outcome
                          ? outcome === "win"
                            ? "bg-emerald-100 text-emerald-700"
                            : outcome === "lose"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {(phase === "resolve" || phase === "feedback") && outcome
                        ? outcome === "win"
                          ? "WIN"
                          : outcome === "lose"
                            ? "LOSS"
                            : "TIE"
                        : "READY"}
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
                    className="mr-1 flex h-12 w-12 flex-shrink-0 items-center justify-center md:h-16 md:w-16 lg:h-20 lg:w-20"
                    aria-label="Ready robot scoreboard mascot"
                    variant={hudRobotVariant}
                    sizeConfig="(min-width: 1024px) 80px, (min-width: 768px) 64px, 48px"
                  />
                </div>
              )}
              <button
                type="button"
                className="md:hidden absolute right-4 top-4 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm"
                onClick={() => setAiPanelMobileOpen(true)}
                aria-label="Open AI insight panel"
              >
                ℹ️
              </button>
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
                  <motion.div layout className="flex flex-1 items-center justify-center text-6xl" aria-label="Your hand" role="img">
                    <AnimatePresence mode="popLayout">
                      {playerPick ? (
                        <motion.span key={playerPick} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
                          {moveEmoji[playerPick]}
                        </motion.span>
                      ) : (
                        <motion.span key="you-placeholder" initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} exit={{ opacity: 0 }} className="text-4xl text-slate-300">
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
                  <motion.div layout className="flex flex-1 items-center justify-center text-6xl" aria-label="AI hand" role="img">
                    <AnimatePresence mode="popLayout">
                      {aiPick ? (
                        <motion.span key={aiPick} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
                          {moveEmoji[aiPick]}
                        </motion.span>
                      ) : (
                        <motion.span key="ai-placeholder" initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} exit={{ opacity: 0 }} className="text-4xl text-slate-300">
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
                    <div className="text-4xl">{moveEmoji[m]}</div>
                    <div className="mt-1 text-sm text-slate-600 capitalize">{m}</div>
                    <span className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-active:opacity-100 group-active:scale-105 transition bg-sky-100"/>
                  </button>
                )
              })}
            </motion.div>
          </div>

          <AIConfidencePanel
            confidence={liveAiConfidence}
            chips={liveAiInsights}
            mobileOpen={aiPanelMobileOpen}
            onMobileClose={() => setAiPanelMobileOpen(false)}
          />
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
              <div id="match-results-title" className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white ${bannerColor()}`}>
                {resultBanner}
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50/80 p-4">
                <div className="flex items-center justify-around text-xl">
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-slate-500 text-sm">You</div>
                    <div className="text-3xl font-semibold text-slate-900">{playerScore}</div>
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
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow hover:bg-slate-50"
                  onClick={() => goToMode()}
                >
                  Change Mode
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
                    <button onClick={handleCreateProfile} className="px-2 py-1 rounded bg-sky-100 text-sky-700" data-dev-label="stats.profile.new">New profile</button>
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
                    className={"px-3 py-1.5 rounded-full text-sm " + (statsTab === tab.key ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-3">
                {statsTab === "overview" && (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-sky-50 p-3">
                        <div className="text-xs uppercase text-slate-500">Matches</div>
                        <div className="text-2xl font-semibold text-sky-700">{totalMatches}</div>
                      </div>
                      <div className="rounded-xl bg-sky-50 p-3">
                        <div className="text-xs uppercase text-slate-500">Rounds</div>
                        <div className="text-2xl font-semibold text-sky-700">{totalRounds}</div>
                      </div>
                      <div className="rounded-xl bg-sky-50 p-3">
                        <div className="text-xs uppercase text-slate-500">Win rate</div>
                        <div className="text-2xl font-semibold text-sky-700">{Math.round(overallWinRate * 100)}%</div>
                      </div>
                      <div className="rounded-xl bg-sky-50 p-3">
                        <div className="text-xs uppercase text-slate-500">Favorite move</div>
                        <div className="text-2xl font-semibold text-sky-700">{favoriteMoveText}</div>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {difficultySummary.map(card => (
                        <div key={card.difficulty} className="rounded-xl border border-slate-200 p-3">
                          <div className="text-xs uppercase text-slate-500">{card.difficulty}</div>
                          <div className="text-lg font-semibold text-slate-800">Win {Math.round(card.winRate * 100)}%</div>
                          <div className="text-xs text-slate-500">Avg AI confidence {Math.round(card.avgConfidence * 100)}%</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>Recent 20-round trend</span>
                        <span>{lastTrendPercent}% last round win chance</span>
                      </div>
                      <svg width="240" height="60" className="mt-2">
                        <polyline fill="none" stroke="#0ea5e9" strokeWidth="2" points={sparklinePoints} />
                      </svg>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 p-3">
                        <div className="text-xs uppercase text-slate-500">Repeat after win</div>
                        <div className="text-lg font-semibold text-slate-800">{repeatAfterWinPct}%</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 p-3">
                        <div className="text-xs uppercase text-slate-500">Switch after loss</div>
                        <div className="text-lg font-semibold text-slate-800">{switchAfterLossPct}%</div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
                      <div>Top transition: {topTransition ? topTransitionLabel : "Not enough data"}</div>
                      <div>Periodicity hint: {patternHint || 'No strong cycle detected yet.'}</div>
                    </div>
                  </div>
                )}

                {statsTab === "matches" && (
                  <div className="space-y-4">
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2 pr-3">Date</th>
                            <th className="py-2 pr-3">Mode</th>
                            <th className="py-2 pr-3">Best of</th>
                            <th className="py-2 pr-3">Difficulty</th>
                            <th className="py-2 pr-3">Score</th>
                            <th className="py-2 pr-3">Result</th>
                            <th className="py-2 pr-3">Rounds</th>
                            <th className="py-2">View</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matchesSorted.map(m => {
                            const result = m.score.you > m.score.ai ? 'Win' : m.score.you === m.score.ai ? 'Tie' : 'Loss';
                            return (
                              <tr key={m.id} className="border-b border-slate-100 last:border-none">
                                <td className="py-2 pr-3">{new Date(m.endedAt || m.startedAt).toLocaleString()}</td>
                                <td className="py-2 pr-3 capitalize">{m.mode}</td>
                                <td className="py-2 pr-3">{m.bestOf}</td>
                                <td className="py-2 pr-3 capitalize">{m.difficulty}</td>
                                <td className="py-2 pr-3">{m.score.you} – {m.score.ai}</td>
                                <td className="py-2 pr-3">{result}</td>
                                <td className="py-2 pr-3">{m.rounds}</td>
                                <td className="py-2"><button className="px-2 py-1 rounded bg-sky-100 text-sky-700 text-xs" onClick={() => setSelectedMatchId(m.id)}>View</button></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {selectedMatch && (
                      <div className="border border-slate-200 rounded-xl p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-slate-500">Match detail</div>
                            <div className="text-lg font-semibold text-slate-800">{selectedMatchDate}</div>
                            <div className="text-xs text-slate-500">Result: {selectedMatchResult}</div>
                          </div>
                          <button className="text-xs text-slate-500" onClick={() => setSelectedMatchId(null)}>Clear</button>
                        </div>
                        <div className="overflow-x-auto flex gap-1 text-xs">
                          {selectedMatchRounds.map((r, idx) => (
                            <span key={r.id} className={"px-2 py-1 rounded-full text-xs " + outcomeBadgeClass(r.outcome)}>{idx+1}</span>
                          ))}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-slate-700 mb-1">Why the AI won</div>
                          {matchAiWins.length ? (
                            <ul className="space-y-1 text-sm text-slate-600">
                              {matchAiWins.map(r => (
                                <li key={r.id}>Round reason: {r.reason}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-sm text-slate-500">No AI wins to explain in this match.</div>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-slate-700 mb-1">Top experts this match</div>
                          <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                            {matchExpertBreakdown.length ? matchExpertBreakdown.map(item => (
                              <span key={item.name} className="px-2 py-1 rounded-full bg-slate-100">{item.name}: {item.count}</span>
                            )) : <span className="text-slate-500">No expert data.</span>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {statsTab === "rounds" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-sm">
                      <label className="flex items-center gap-1">Mode
                        <select value={roundFilters.mode} onChange={e=> setRoundFilters(f => ({ ...f, mode: e.target.value as RoundFilterMode }))} className="ml-1 border rounded px-2 py-1">
                          <option value="all">All</option>
                          <option value="practice">Practice</option>
                          <option value="challenge">Challenge</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1">Difficulty
                        <select value={roundFilters.difficulty} onChange={e=> setRoundFilters(f => ({ ...f, difficulty: e.target.value as RoundFilterDifficulty }))} className="ml-1 border rounded px-2 py-1">
                          <option value="all">All</option>
                          <option value="fair">Fair</option>
                          <option value="normal">Normal</option>
                          <option value="ruthless">Ruthless</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1">Outcome
                        <select value={roundFilters.outcome} onChange={e=> setRoundFilters(f => ({ ...f, outcome: e.target.value as RoundFilterOutcome }))} className="ml-1 border rounded px-2 py-1">
                          <option value="all">All</option>
                          <option value="win">Win</option>
                          <option value="lose">Lose</option>
                          <option value="tie">Tie</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1">From
                        <input type="date" value={roundFilters.from} onChange={e=> setRoundFilters(f => ({ ...f, from: e.target.value }))} className="ml-1 border rounded px-2 py-1" />
                      </label>
                      <label className="flex items-center gap-1">To
                        <input type="date" value={roundFilters.to} onChange={e=> setRoundFilters(f => ({ ...f, to: e.target.value }))} className="ml-1 border rounded px-2 py-1" />
                      </label>
                    </div>
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2 pr-3">#</th>
                            <th className="py-2 pr-3">Player</th>
                            <th className="py-2 pr-3">AI</th>
                            <th className="py-2 pr-3">Outcome</th>
                            <th className="py-2 pr-3">Confidence</th>
                            <th className="py-2 pr-3">Top expert</th>
                            <th className="py-2 pr-3">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roundsPageSlice.map((r, idx) => (
                            <tr key={r.id} className="border-b border-slate-100 last:border-none">
                              <td className="py-2 pr-3">{roundPageStartIndex + idx + 1}</td>
                              <td className="py-2 pr-3">{prettyMove(r.player)}</td>
                              <td className="py-2 pr-3">{prettyMove(r.ai)}</td>
                              <td className="py-2 pr-3 capitalize">{r.outcome}</td>
                              <td className="py-2 pr-3">{Math.round(r.confidence * 100)}% ({r.confidenceBucket})</td>
                              <td className="py-2 pr-3">{r.mixer?.topExperts?.[0]?.name || (r.policy === 'heuristic' ? 'Heuristic' : 'N/A')}</td>
                              <td className="py-2 pr-3 text-slate-600">{r.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>Page {roundPage + 1} of {totalRoundPages}</span>
                      <div className="flex gap-2">
                        <button disabled={roundPage === 0} onClick={()=> setRoundPage(p=> Math.max(0, p-1))} className="px-2 py-1 rounded bg-slate-100 disabled:opacity-50">Prev</button>
                        <button disabled={roundPage + 1 >= totalRoundPages} onClick={()=> setRoundPage(p=> Math.min(totalRoundPages-1, p+1))} className="px-2 py-1 rounded bg-slate-100 disabled:opacity-50">Next</button>
                      </div>
                    </div>
                  </div>
                )}

                {statsTab === "insights" && (
                  <div className="space-y-3 text-sm text-slate-600">
                    <div className="font-semibold text-slate-700">Things we've learned</div>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Favorite move: {favoriteMoveText}</li>
                      <li>Repeat after win: {repeatAfterWinPct}%</li>
                      <li>Switch after loss: {switchAfterLossPct}%</li>
                      <li>Top transition: {topTransition ? topTransitionLabel : 'Not enough data yet.'}</li>
                      <li>{patternHint || 'No strong periodic pattern detected yet.'}</li>
                    </ul>
                    <div className="font-semibold text-slate-700">Against you, the AI excels when…</div>
                    <div className="space-y-1">
                      {confidenceBuckets.map(bucket => (
                        <div key={bucket.label}>Confidence {bucket.label}: {bucket.total} rounds, AI win rate {bucket.total ? Math.round(bucket.winRate * 100) : 0}%</div>
                      ))}
                    </div>
                    <div className="font-semibold text-slate-700">Expert contributions</div>
                    <div className="flex flex-wrap gap-2">
                      {expertContribution.length ? expertContribution.map(([name, count]) => (
                        <span key={name} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">{name}: {count}</span>
                      )) : <span className="text-slate-500">Not enough mixer data yet.</span>}
                    </div>
                    <div className="text-xs text-slate-500">Average streaks — You: {averageYouStreak} | AI: {averageAiStreak}. Reveal timing currently not tracked.</div>
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
                  setPlayerModalMode("hidden");
                  setPlayerModalOrigin(null);
                  if (playerModalOrigin === "welcome") {
                    finishWelcomeFlow("setup");
                  }
                  if (result.action === "create") {
                    setToastMessage("New player starts a fresh training session (10 rounds).");
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
      {showMainUi && !settingsOpen && (
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
                <div className={robotBubbleContent.emphasise ? "text-slate-800" : "text-sm font-medium text-slate-800"}>
                  {robotBubbleContent.message}
                </div>
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
    </div>
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

const AGE_OPTIONS = Array.from({ length: 96 }, (_, index) => 5 + index);

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
  const [age, setAge] = useState<string>(player?.age != null ? String(player.age) : "");
  const [school, setSchool] = useState(player?.school ?? "");
  const [priorExperience, setPriorExperience] = useState(player?.priorExperience ?? "");

  useEffect(() => {
    const parts = extractNameParts(player?.playerName ?? "");
    setFirstName(parts.firstName);
    setLastInitial(parts.lastInitial);
    setGrade(player?.grade ?? "");
    setAge(player?.age != null ? String(player.age) : "");
    setSchool(player?.school ?? "");
    setPriorExperience(player?.priorExperience ?? "");
  }, [player, mode]);

  const saveDisabled = !firstName.trim() || !lastInitial.trim() || !grade || !age;
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
    if (!trimmedFirst || !trimmedLast || !grade || !age) return;
    const parsedAge = Number.parseInt(age, 10);
    if (!Number.isFinite(parsedAge)) return;
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
      age: parsedAge,
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
              Please confirm the player name, grade, and age to continue.
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
            Age
            <select
              value={age}
              onChange={e => setAge(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 shadow-inner"
              required
            >
              <option value="" disabled>
                Select age
              </option>
              {AGE_OPTIONS.map(option => (
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
