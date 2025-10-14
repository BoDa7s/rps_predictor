import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Move, Mode, AIMode, Outcome, BestOf } from "./gameTypes";
import { StatsProvider, useStats, RoundLog, MixerTrace, HeuristicTrace, DecisionPolicy } from "./stats";
import { PlayersProvider, usePlayers, Grade, Gender, PlayerProfile, CONSENT_TEXT_VERSION, GRADE_OPTIONS, GENDER_OPTIONS } from "./players";
import { DEV_MODE_ENABLED } from "./devMode";
import { DeveloperConsole } from "./DeveloperConsole";
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

// Main component
function RPSDoodleAppInner(){
  const {
    rounds: profileRounds,
    matches: profileMatches,
    logRound,
    logMatch,
    exportJson,
    exportRoundsCsv,
    profiles: statsProfiles,
    currentProfile,
    createProfile: createStatsProfile,
    selectProfile,
    updateProfile: updateStatsProfile,
    forkProfileVersion,
  } = useStats();
  const { currentPlayer, hasConsented, createPlayer, updatePlayer } = usePlayers();
  const [statsOpen, setStatsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsTab, setStatsTab] = useState<"overview" | "matches" | "rounds" | "insights">("overview");
  const statsModalRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasSettingsOpenRef = useRef(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [roundPage, setRoundPage] = useState(0);
  const [liveAiConfidence, setLiveAiConfidence] = useState<number | null>(null);
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
  const isPlayerModalOpen = playerModalMode !== "hidden";
  useEffect(() => {
    if (!hasConsented) {
      setPlayerModalMode(currentPlayer ? "edit" : "create");
    }
  }, [hasConsented, currentPlayer]);
  useEffect(() => { if (!hasConsented) setLeaderboardOpen(false); }, [hasConsented]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), 4000);
    return () => window.clearTimeout(id);
  }, [toastMessage]);
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

  type Scene = "BOOT"|"MODE"|"MATCH"|"RESULTS";
  const [scene, setScene] = useState<Scene>("BOOT");

  const prefersReduced = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState<boolean>(prefersReduced ?? false);
  useEffect(() => {
    setReducedMotion(prefersReduced ?? false);
  }, [prefersReduced]);
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

  const [predictorMode, setPredictorMode] = useState<boolean>(currentProfile?.predictorDefault ?? true);
  const [aiMode, setAiMode] = useState<AIMode>("normal");
  const TRAIN_ROUNDS = 10;
  const trainingCount = currentProfile?.trainingCount ?? 0;
  const isTrained = currentProfile?.trained ?? false;
  const [trainingActive, setTrainingActive] = useState<boolean>(false);

  const trainingComplete = trainingCount >= TRAIN_ROUNDS;
  const needsTraining = !isTrained && !trainingComplete;
  const shouldGateTraining = needsTraining && !trainingActive;
  const modesDisabled = trainingActive || needsTraining;
  const trainingDisplayCount = Math.min(trainingCount, TRAIN_ROUNDS);
  const trainingProgress = Math.min(trainingDisplayCount / TRAIN_ROUNDS, 1);
  const showTrainingCompleteBadge = !needsTraining && trainingCount >= TRAIN_ROUNDS;

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
  const countdownRef = useRef<number | null>(null);
  const trainingAnnouncementsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    setTrainingActive(false);
    trainingAnnouncementsRef.current.clear();
  }, [currentProfile?.id]);
  const clearCountdown = ()=>{ if (countdownRef.current!==null){ clearInterval(countdownRef.current); countdownRef.current=null; } };
  const startCountdown = ()=>{
    const modeForTiming: Mode = selectedMode ?? "practice";
    const baseInterval = matchTimings[modeForTiming].countdownTickMs;
    const interval = reducedMotion ? Math.min(300, baseInterval) : baseInterval;
    setPhase("countdown");
    setCount(3);
    clearCountdown();
    countdownRef.current = window.setInterval(()=>{
      setCount(prev=>{
        const next = prev - 1;
        audio.tick();
        if (!reducedMotion) tryVibrate(6);
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
    decisionTraceRef.current = null;
    lastDecisionMsRef.current = null;
  }, [logRound, selectedMode, bestOf, aiMode]);

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
    if (scene !== "MATCH") return;
    if (phase !== "idle") return;
    roundStartRef.current = performance.now();
    lastDecisionMsRef.current = null;
  }, [scene, phase, round]);

  const armedRef = useRef(false);
  const armAudio = () => { if (!armedRef.current){ audio.ensureCtx(); audio.setEnabled(audioOn); armedRef.current = true; } };
  useEffect(()=>{ audio.setEnabled(audioOn); }, [audioOn]);

  useEffect(() => {
    if (scene !== "BOOT") return;
    if (!currentProfile || !hasConsented) return;
    const t = window.setTimeout(() => {
      if (needsTraining) {
        startMatch("practice", { silent: true });
        if (!trainingActive) {
          setTrainingActive(true);
        }
      } else {
        setScene("MODE");
      }
    }, 900);
    return () => window.clearTimeout(t);
  }, [scene, currentProfile, hasConsented, needsTraining, trainingActive]);

  const statsTabs = [
    { key: "overview", label: "Overview" },
    { key: "matches", label: "Matches" },
    { key: "rounds", label: "Rounds" },
    { key: "insights", label: "Insights" },
  ] as const;

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
  const playerWins = matches.reduce((acc, m) => acc + (m.score.you > m.score.ai ? 1 : 0), 0);
  const overallWinRate = totalMatches ? playerWins / totalMatches : 0;

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

  const EXPORT_WARNING_TEXT = "Export may include personal/demographic info. You are responsible for how exported files are stored and shared. No liability is assumed.";
  const RESET_TRAINING_TOAST =
    "You’re starting a new training run. Your previous results are archived and linked as Profile History. You can review past vs new results in Statistics.";
  const sanitizeForFile = useCallback((value: string) => {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }, []);

  const handleSelectProfile = useCallback((id: string) => {
    if (!id) return;
    selectProfile(id);
  }, [selectProfile]);

  const handleCreateProfile = useCallback(() => {
    if (!currentPlayer) {
      setPlayerModalMode("create");
      return;
    }
    setCreateProfileDialogAcknowledged(false);
    setCreateProfileDialogOpen(true);
  }, [currentPlayer, setPlayerModalMode]);

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

  const handleExportJson = useCallback(() => {
    if (!currentPlayer || !currentProfile) return;
    if (!window.confirm(EXPORT_WARNING_TEXT)) return;
    const data = exportJson();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const profileSegment = sanitizeForFile(currentProfile.name || 'profile') || 'profile';
    a.download = `rps-${profileSegment}-stats.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentPlayer, currentProfile, exportJson, sanitizeForFile]);

  const handleExportCsv = useCallback(() => {
    if (!currentPlayer || !currentProfile) return;
    if (!window.confirm(EXPORT_WARNING_TEXT)) return;
    const data = exportRoundsCsv();
    const blob = new Blob([data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const profileSegment = sanitizeForFile(currentProfile.name || 'profile') || 'profile';
    a.download = `rps-${profileSegment}-rounds.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentPlayer, currentProfile, exportRoundsCsv, sanitizeForFile]);

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
    setLive("Settings opened. Press Escape to close.");
  }, [setLive]);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    setLive("Settings closed.");
  }, [setLive]);

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
        decisionTraceRef.current = {
          policy: "heuristic",
          heuristic: { predicted: heur.move, conf: heur.conf, reason: heur.reason || "Low confidence – random choice" },
          confidence: heur.conf ?? 0.33,
        };
        setLiveAiConfidence(heur.conf ?? null);
        return fallbackMove;
      }
      const predicted = heur.move as Move;
      const heuristicDist: Dist = { rock:0, paper:0, scissors:0 };
      heuristicDist[predicted] = 1;
      const move = policyCounterFromDist(heuristicDist, aiMode);
      const heurConf = heur.conf ?? 0.5;
      decisionTraceRef.current = {
        policy: "heuristic",
        heuristic: { predicted: heur.move, conf: heur.conf, reason: heur.reason },
        confidence: heurConf,
      };
      setLiveAiConfidence(heurConf);
      return move;
    }
    const ctx: Ctx = { playerMoves: lastMoves, aiMoves: aiHistory, outcomes: outcomesHist, rng };
    const dist = getMixer().predict(ctx);
    const snapshot = getMixer().snapshot();
    const move = policyCounterFromDist(dist, aiMode);
    const confidence = Math.max(dist.rock, dist.paper, dist.scissors);
    decisionTraceRef.current = {
      policy: "mixer",
      mixer: {
        dist,
        experts: snapshot.experts,
        counter: move,
        confidence,
      },
      confidence,
    };
    setLiveAiConfidence(confidence);
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
    resetMatch();
    aiStreakRef.current = 0;
    youStreakRef.current = 0;
    matchStartRef.current = new Date().toISOString();
    currentMatchIdRef.current = makeLocalId("match");
    roundStartRef.current = performance.now();
    lastDecisionMsRef.current = null;
    if (mode) setSelectedMode(mode);
    setScene("MATCH");
  }

  function resetTraining(){
    trainingAnnouncementsRef.current.clear();
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
    if (roundStartRef.current !== null) {
      const elapsed = Math.max(0, Math.round(performance.now() - roundStartRef.current));
      lastDecisionMsRef.current = elapsed;
    } else {
      lastDecisionMsRef.current = null;
    }
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
    const baseHold = matchTimings[modeForTiming].revealHoldMs;
    const holdMs = reducedMotion ? Math.min(600, baseHold) : baseHold;
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
      return;
    }
    const progress = Math.min(trainingCount / TRAIN_ROUNDS, 1);
    const thresholds = [0.25, 0.5, 0.75, 1];
    thresholds.forEach(threshold => {
      if (progress >= threshold && !trainingAnnouncementsRef.current.has(threshold)) {
        trainingAnnouncementsRef.current.add(threshold);
        setLive(`AI training ${Math.round(threshold * 100)} percent complete.`);
      }
    });
  }, [trainingActive, trainingCount, needsTraining]);

  useEffect(() => {
    if (!trainingActive) return;
    if (trainingCount < TRAIN_ROUNDS) return;
    setTrainingActive(false);
    if (currentProfile && !currentProfile.trained) {
      updateStatsProfile(currentProfile.id, { trained: true });
    }
    trainingAnnouncementsRef.current.clear();
  }, [trainingActive, trainingCount, currentProfile, updateStatsProfile]);

  // Failsafes: if something stalls, advance automatically
  useEffect(()=>{ if (phase === "selected"){ const t = setTimeout(()=>{ if (phase === "selected") startCountdown(); }, 500); return ()=> clearTimeout(t); } }, [phase]);
  useEffect(()=>{
    if (phase !== "countdown") return;
    const modeForTiming: Mode = selectedMode ?? "practice";
    const baseInterval = matchTimings[modeForTiming].countdownTickMs;
    const interval = reducedMotion ? Math.min(300, baseInterval) : baseInterval;
    const failSafeMs = Math.max(interval * 4, interval * 3 + 600);
    const t = setTimeout(()=>{ if (phase === "countdown"){ clearCountdown(); reveal(); } }, failSafeMs);
    return ()=> clearTimeout(t);
  }, [phase, selectedMode, matchTimings, reducedMotion]);
  useEffect(()=>{ return ()=> clearCountdown(); },[]);

  // Next round or end match
  useEffect(() => {
    if (phase !== "feedback") return;
    const modeForTiming: Mode = selectedMode ?? "practice";
    const baseDelay = matchTimings[modeForTiming].resultBannerMs;
    const delayBase = reducedMotion ? Math.min(300, baseDelay) : baseDelay;
    const delay = trainingActive ? Math.min(delayBase, 600) : delayBase;
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
  }, [phase, trainingActive, playerScore, aiScore, bestOf, reducedMotion, matchTimings, selectedMode]);

  // Helpers
  function tryVibrate(ms:number){ if ((navigator as any).vibrate) (navigator as any).vibrate(ms); }
  function bannerColor(){ if (resultBanner === "Victory") return "bg-green-500"; if (resultBanner === "Defeat") return "bg-rose-500"; return "bg-amber-500"; }
  // navigation + timer guards to avoid stuck overlays when returning to MODE
  const timersRef = useRef<number[]>([]);
  const addT = (fn:()=>void, ms:number)=>{ const id = window.setTimeout(fn, ms); timersRef.current.push(id); return id; };
  const clearTimers = ()=>{ timersRef.current.forEach(id=> clearTimeout(id)); timersRef.current = []; };
  function goToMode(){ clearCountdown(); clearTimers(); setWipeRun(false); setSelectedMode(null); setScene("MODE"); }
  function goToMatch(){ clearTimers(); startMatch(selectedMode ?? "practice"); }

  // ---- Mode selection flow ----
  function handleModeSelect(mode: Mode){
    if (needsTraining && mode !== "practice") return;
    armAudio(); audio.cardSelect(); setSelectedMode(mode); setLive(`${modeLabel(mode)} mode selected. Loading match.`);
    if (reducedMotion){ setTimeout(()=>{ startMatch(mode); }, 200); return; }
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
    <div className="relative min-h-screen overflow-hidden select-none" style={{ fontSize: `${textScale*16}px` }}>
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

      {toastMessage && (
        <div className="fixed top-20 right-4 z-[95]" role="status" aria-live="polite">
          <div className="rounded-lg bg-slate-900/90 px-4 py-2 text-sm text-white shadow-lg">{toastMessage}</div>
        </div>
      )}

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

      {/* Header / Settings */}
      <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between">
        <motion.h1 layout className="text-2xl font-extrabold tracking-tight text-sky-700 drop-shadow-sm">RPS Lab</motion.h1>
        <div className="flex items-center gap-2">
          {trainingActive && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">Training</span>}
          {showTrainingCompleteBadge && (
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">Training complete</span>
          )}
          {liveAiConfidence !== null && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 text-sky-700">AI conf: {Math.round((liveAiConfidence ?? 0) * 100)}%</span>}
            <button onClick={() => setStatsOpen(true)} className="px-3 py-1.5 rounded-xl shadow text-sm bg-white/70 hover:bg-white text-sky-900">Statistics</button>
            <button
              onClick={() => setLeaderboardOpen(true)}
              className={"px-3 py-1.5 rounded-xl shadow text-sm " + (hasConsented ? "bg-white/70 hover:bg-white text-sky-900" : "bg-white/50 text-slate-400 cursor-not-allowed")}
              disabled={!hasConsented}
              title={!hasConsented ? "Check consent to continue." : undefined}
            >
              Leaderboard
            </button>
            <div
              className={"px-3 py-1.5 rounded-xl shadow text-sm bg-white/70 text-slate-700 flex items-center gap-2 " + (demographicsNeedReview ? "ring-2 ring-amber-400" : "")}
              aria-live="polite"
            >
              <span>{playerLabel}</span>
              {demographicsNeedReview && (
                <span className="text-xs font-semibold text-amber-600">Needs review</span>
              )}
            </div>
            <button
              onClick={() => {
                if (!hasConsented) {
                  setPlayerModalMode(currentPlayer ? "edit" : "create");
                  return;
                }
                goToMode();
              }}
              title={!hasConsented ? "Check consent to continue." : undefined}
              disabled={modesDisabled || !hasConsented}
              className={"px-3 py-1.5 rounded-xl shadow text-sm " + ((modesDisabled || !hasConsented) ? "bg-white/50 text-slate-400 cursor-not-allowed" : "bg-white/70 hover:bg-white text-sky-900")}
            >
              Modes
            </button>
          <details className="bg-white/70 rounded-xl shadow group">
            <summary className="list-none px-3 py-1.5 cursor-pointer text-sm text-slate-900">Settings ⚙️</summary>
            <div className="p-3 pt-0 space-y-2 text-sm">
              <label className="flex items-center justify-between gap-4"><span>Audio</span><input type="checkbox" checked={audioOn} onChange={e=> setAudioOn(e.target.checked)} /></label>
              <label className="flex items-center justify-between gap-4"><span>Reduced motion</span><input type="checkbox" checked={reducedMotion} onChange={e=> setReducedMotion(e.target.checked)} /></label>
              <label className="flex items-center justify-between gap-4"><span>Text size</span><input type="range" min={0.9} max={1.4} step={0.05} value={textScale} onChange={e=> setTextScale(parseFloat(e.target.value))} /></label>
              <hr className="my-2" />
              <label className="flex items-center justify-between gap-4" title="When ON, the AI studies your recent moves to predict—and counter—your next move."><span>AI Predictor</span><input type="checkbox" checked={predictorMode} onChange={e=> handlePredictorToggle(e.target.checked)} disabled={!isTrained} /></label>
              <label className="flex items-center justify-between gap-4"><span>AI Difficulty</span>
                <select value={aiMode} onChange={e=> setAiMode(e.target.value as AIMode)} disabled={!isTrained || !predictorMode} className="px-2 py-1 rounded bg-white shadow-inner">
                  <option value="fair">Fair</option>
                  <option value="normal">Normal</option>
                  <option value="ruthless">Ruthless</option>
                </select>
              </label>
              <hr className="my-2" />
              <div className="space-y-2">
                <div className="text-xs text-slate-500">Profile &amp; data</div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    className="px-2 py-1 rounded bg-sky-100 text-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => setPlayerModalMode(currentPlayer ? "edit" : "create")}
                    disabled={!currentPlayer}
                  >
                    Edit demographics
                  </button>
                  <button
                    className="px-2 py-1 rounded bg-white shadow text-slate-700 hover:bg-slate-50"
                    onClick={() => setPlayerModalMode("create")}
                  >
                    Create new player
                  </button>
                </div>
                {demographicsNeedReview && (
                  <p className="text-xs text-amber-600">Demographics need review. Update grade and age from Edit demographics.</p>
                )}
                <p className="text-xs text-slate-500 max-w-xs">Use the Statistics panel to export your data. Exports always include your demographics alongside the selected statistics profile.</p>
              </div>
              <label className="flex items-center justify-between gap-4"><span>Best of</span>
                <select value={bestOf} onChange={e=> setBestOf(Number(e.target.value) as BestOf)} className="px-2 py-1 rounded bg-white shadow-inner">
                  <option value={3}>3</option><option value={5}>5</option><option value={7}>7</option>
                </select>
              </label>
              <button
                className="px-2 py-1 rounded bg-white shadow"
                type="button"
                onClick={() => {
                  setResetDialogAcknowledged(false);
                  setResetDialogOpen(true);
                }}
              >
                Reset AI training
              </button>
            </div>
          </details>
            <button
              ref={settingsButtonRef}
              type="button"
              onClick={handleOpenSettings}
              className={`px-3 py-1.5 rounded-xl shadow text-sm transition ${settingsOpen ? "bg-sky-600 text-white" : "bg-white/70 hover:bg-white text-sky-900"}`}
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
            >
              Settings ⚙️
            </button>
        </div>
      </div>

     
      {/* BOOT */}
      <AnimatePresence mode="wait">
        {scene === "BOOT" && (
          <motion.div key="boot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="grid place-items-center min-h-screen">
            <div className="flex flex-col items-center gap-4">
              <motion.div initial={{ scale: .95 }} animate={{ scale: 1.05 }} transition={{ repeat: Infinity, repeatType: "reverse", duration: .9 }} className="text-4xl">
                <span>🤖</span>
              </motion.div>
              <div className="w-48 h-1 bg-slate-200 rounded overflow-hidden"><motion.div initial={{ width: "10%" }} animate={{ width: "100%" }} transition={{ duration: .9, ease: "easeInOut" }} className="h-full bg-sky-500"/></div>
              <div className="text-slate-500 text-sm">Booting...</div>
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
              {selectedMode && (
                <motion.div key="fs" className={`fullscreen ${selectedMode}`} layoutId={`card-${selectedMode}`} initial={{ borderRadius: 16 }} animate={{ borderRadius: 0, transition: { duration: 0.44, ease: [0.22,0.61,0.36,1] }}}>
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
            {/* HUD */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }} className="w-[min(92vw,680px)] bg-white/70 rounded-2xl shadow px-4 py-3">
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
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-700">Round <strong>{round}</strong> / Best of {bestOf}</div>
                    <div className="flex items-center gap-6 text-xl">
                      <div className="flex items-center gap-2"><span className="text-slate-500 text-sm">You</span><strong>{playerScore}</strong></div>
                      <div className="flex items-center gap-2"><span className="text-slate-500 text-sm">AI</span><strong>{aiScore}</strong></div>
                    </div>
                  </div>
                  {showTrainingCompleteBadge && (
                    <div className="mt-2">
                      <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">Training complete</span>
                    </div>
                  )}
                </>
              )}
            </motion.div>

            {trainingActive && (
              <div className="mt-3 w-[min(92vw,680px)] flex items-center justify-between text-sm text-slate-600">
                <span>Keep playing to finish training.</span>
                <span className="text-slate-500">Training completes after {TRAIN_ROUNDS} rounds.</span>
              </div>
            )}

            {/* Arena */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }} className="mt-6 w-[min(92vw,680px)] grid grid-rows-[1fr_auto_1fr] gap-4">
              <div className="grid place-items-center">
                <motion.div layout className="text-5xl" aria-label="AI hand" role="img">
                  <AnimatePresence mode="popLayout">
                    {aiPick && (
                      <motion.div key={aiPick} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
                        <span>{moveEmoji[aiPick]}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>

              {/* Countdown */}
              <div className="h-10 grid place-items-center">
                <AnimatePresence>
                  {phase === "countdown" && count>0 && (
                    <motion.div key={count} initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1.08, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .3, ease: [0.22,0.61,0.36,1] }} className="text-2xl font-black text-slate-800">{count}</motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid place-items-center">
                <motion.div layout className="text-5xl" aria-label="Your hand" role="img">
                  <AnimatePresence mode="popLayout">
                    {playerPick && (
                      <motion.div key={playerPick} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
                        <span>{moveEmoji[playerPick]}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            </motion.div>

            {/* Outcome feedback */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }} className="h-8 mt-2 text-lg font-semibold">
              <AnimatePresence mode="wait">
                {(phase === "resolve" || phase === "feedback") && outcome && (
                  <motion.div key={outcome} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: .22 }} className={ outcome === "win" ? "text-green-700" : outcome === "lose" ? "text-rose-700" : "text-amber-700" }>
                    {outcome === "win" ? "You win!" : outcome === "lose" ? "You lose." : "Tie."}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Controls */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 }} className="mt-6 grid grid-cols-3 gap-3 w-[min(92vw,680px)]">
              {MOVES.map((m)=>{
                const selected = playerPick === m && (phase === "selected" || phase === "countdown" || phase === "reveal" || phase === "resolve");
                return (
                  <button key={m} onClick={()=> onSelect(m)} disabled={phase!=="idle"}
                    className={["group relative px-4 py-4 bg-white rounded-2xl shadow hover:shadow-md transition active:scale-95", phase!=="idle"?"opacity-60 cursor-default":"", selected?"ring-4 ring-sky-300":""].join(" ")}
                    aria-pressed={selected} aria-label={`Choose ${m}`}>
                    <div className="text-4xl">{moveEmoji[m]}</div>
                    <div className="mt-1 text-sm text-slate-600 capitalize">{m}</div>
                    <span className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-active:opacity-100 group-active:scale-105 transition bg-sky-100"/>
                  </button>
                )
              })}
            </motion.div>
          </motion.section>
        )}

        {/* RESULTS */}
        {scene === "RESULTS" && (
          <motion.section key="results" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} transition={{ duration: .32 }} className="min-h-screen pt-28 flex flex-col items-center">
            <div className={`px-4 py-2 rounded-2xl text-white font-black text-2xl ${bannerColor()}`}>{resultBanner}</div>
            <div className="mt-4 bg-white/80 rounded-2xl shadow p-4 w-[min(92vw,520px)]">
              <div className="flex items-center justify-around text-xl">
                <div className="flex flex-col items-center"><div className="text-slate-500 text-sm">You</div><div className="font-bold">{playerScore}</div></div>
                <div className="flex flex-col items-center"><div className="text-slate-500 text-sm">AI</div><div className="font-bold">{aiScore}</div></div>
              </div>
              <div className="mt-4 flex items-center justify-center gap-3">
                <button onClick={()=>{ resetMatch(); setScene("MATCH"); }} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow">Rematch</button>
                <button onClick={()=> goToMode()} className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 shadow">Modes</button>
              </div>
            </div>
            {!reducedMotion && <Confetti />}
          </motion.section>
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
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }} className="bg-white rounded-2xl shadow-2xl w-[min(95vw,900px)] max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" ref={statsModalRef}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-800">Statistics</h2>
                <button onClick={() => setStatsOpen(false)} className="text-slate-500 hover:text-slate-700 text-sm">Close ✕</button>
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
                      <select value={currentProfile?.id ?? ''} onChange={e => handleSelectProfile(e.target.value)} className="border rounded px-2 py-1" disabled={!statsProfiles.length}>
                        {statsProfiles.map(profile => (
                          <option key={profile.id} value={profile.id}>{profile.name}</option>
                        ))}
                      </select>
                    </label>
                    <button onClick={handleCreateProfile} className="px-2 py-1 rounded bg-sky-100 text-sky-700">New profile</button>
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
                    data-focus-first={tab.key === statsTabs[0].key ? true : undefined}
                    onClick={() => setStatsTab(tab.key)}
                    className={"px-3 py-1.5 rounded-full text-sm " + (statsTab === tab.key ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="px-4 pb-4 pt-3 overflow-y-auto space-y-4" style={{ maxHeight: "65vh" }}>
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
                <div className="flex gap-2">
                  <button onClick={handleExportJson} disabled={!currentPlayer || !currentProfile} className="px-3 py-1.5 rounded bg-sky-100 text-sky-700 disabled:opacity-50 disabled:cursor-not-allowed">Export JSON</button>
                  <button onClick={handleExportCsv} disabled={!currentPlayer || !currentProfile} className="px-3 py-1.5 rounded bg-sky-100 text-sky-700 disabled:opacity-50 disabled:cursor-not-allowed">Export CSV</button>
                </div>
                <p className="text-xs text-slate-500">Exports bundle your demographics with this statistics profile.</p>
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
            className="fixed inset-0 z-[70] bg-black/30 grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onKeyDown={(e:any)=>{ if (e.key==='Escape' && hasConsented) setPlayerModalMode("hidden"); }}
          >
            <motion.div role="dialog" aria-modal="true" aria-label="Player Setup" className="bg-white rounded-2xl shadow-xl w-[min(94vw,520px)]" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 6, opacity: 0 }}>
              <PlayerSetupForm
                mode={resolvedModalMode}
                player={modalPlayer}
                onClose={()=> { if (hasConsented) setPlayerModalMode("hidden"); }}
                onSaved={(result) => {
                  setPlayerModalMode("hidden");
                  if (result.action === "create") {
                    setToastMessage("New player starts a fresh training session (10 rounds).");
                    setLive("New player created. Training required before challenge modes unlock.");
                  } else {
                    setLive("Player demographics updated.");
                  }
                }}
                createPlayer={createPlayer}
                updatePlayer={updatePlayer}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer robot idle (personality beat) */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .4 }} className="fixed bottom-3 right-3 bg-white/70 rounded-2xl shadow px-3 py-2 flex items-center gap-2">
        <motion.span animate={{ y: [0,-1,0] }} transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}>
          <span>🤖</span>
        </motion.span>
        <span className="text-sm text-slate-700">Ready!</span>
      </motion.div>
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
}

const AGE_OPTIONS = Array.from({ length: 96 }, (_, index) => 5 + index);

function PlayerSetupForm({ mode, player, onClose, onSaved, createPlayer, updatePlayer }: PlayerSetupFormProps){
  const [playerName, setPlayerName] = useState(player?.playerName ?? "");
  const [grade, setGrade] = useState<Grade | "">(player?.grade ?? "");
  const [age, setAge] = useState<string>(player?.age != null ? String(player.age) : "");
  const [school, setSchool] = useState(player?.school ?? "");
  const [gender, setGender] = useState<Gender>(player?.gender ?? "Prefer not to say");
  const [priorExperience, setPriorExperience] = useState(player?.priorExperience ?? "");
  const [consentChecked, setConsentChecked] = useState<boolean>(player?.consent?.agreed ?? false);

  useEffect(() => {
    setPlayerName(player?.playerName ?? "");
    setGrade(player?.grade ?? "");
    setAge(player?.age != null ? String(player.age) : "");
    setSchool(player?.school ?? "");
    setGender(player?.gender ?? "Prefer not to say");
    setPriorExperience(player?.priorExperience ?? "");
    setConsentChecked(player?.consent?.agreed ?? false);
  }, [player, mode]);

  const saveDisabled = !playerName.trim() || !grade || !age || !consentChecked;
  const title = mode === "edit" ? "Edit player demographics" : "Create new player";
  const showReviewNotice = mode === "edit" && player?.needsReview;
  const genderOptions = GENDER_OPTIONS;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = playerName.trim();
    if (!trimmedName || !grade || !age || !consentChecked) return;
    const parsedAge = Number.parseInt(age, 10);
    if (!Number.isFinite(parsedAge)) return;
    const schoolValue = school.trim();
    const priorValue = priorExperience.trim();
    const consent = {
      agreed: consentChecked,
      timestamp: new Date().toISOString(),
      consentTextVersion: CONSENT_TEXT_VERSION,
    };
    const payload = {
      playerName: trimmedName,
      grade: grade as Grade,
      age: parsedAge,
      school: schoolValue ? schoolValue : undefined,
      gender,
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
    <form onSubmit={handleSubmit} className="p-5 space-y-4" aria-label="Player setup form">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">Close</button>
      </div>
      <div className="grid gap-3">
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
          Player name
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 shadow-inner"
            placeholder="e.g. Alex"
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
          Gender
          <select value={gender} onChange={e => setGender(e.target.value as Gender)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 shadow-inner">
            {genderOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Prior experience (optional)
          <textarea
            value={priorExperience}
            onChange={e => setPriorExperience(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 shadow-inner"
            placeholder="Tell us about previous AI or RPS experience"
          />
        </label>
      </div>
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} className="mt-1" />
        <span>
          I consent to participate in this activity and understand how my gameplay data will be used (consent text {CONSENT_TEXT_VERSION}).
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200">Cancel</button>
        <button type="submit" disabled={saveDisabled} className={`px-3 py-1.5 rounded text-white ${saveDisabled ? 'bg-slate-300 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700 shadow'}`}>
          Save profile
        </button>
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
