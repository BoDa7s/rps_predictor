import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

// ---------------------------------------------
// Rock-Paper-Scissors Google Doodle-style demo
// Single-file React app implementing ModeSelect full-graphic morph
// + Ensemble AI (Hedge) with Practice + Calibrate + Exploit flow
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
export type Move = "rock" | "paper" | "scissors";
export type Mode = "speed" | "practice";
export type AIMode = "fair" | "normal" | "ruthless";
const MOVES: Move[] = ["rock", "paper", "scissors"];
const MODES: Mode[] = ["speed","practice"];
export type PredictorLevel = "off" | "basic" | "smart" | "adaptive"; // legacy knob (kept for compat)

// Icons (emoji fallback)
const moveEmoji: Record<Move, string> = { rock: "\u270A", paper: "\u270B", scissors: "\u270C\uFE0F" };

// ---- Core game logic (pure) ----
export function resolveOutcome(player: Move, ai: Move): "win" | "lose" | "tie" {
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
type Outcome = "win"|"lose"|"tie"; // player's perspective
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
  w: number[]; experts: Expert[]; eta: number;
  constructor(experts: Expert[], eta=1.6){ this.experts = experts; this.eta = eta; this.w = experts.map(()=>1); }
  predict(ctx: Ctx): Dist{
    const preds = this.experts.map(e=> e.predict(ctx));
    const W = this.w.reduce((a,b)=>a+b,0);
    const mix: Dist = { rock:0, paper:0, scissors:0 };
    preds.forEach((p,i)=>{ (Object.keys(mix) as Move[]).forEach(m=>{ mix[m] += (this.w[i]/W) * p[m]; }); });
    return normalize(mix);
  }
  update(ctx: Ctx, actual: Move){
    const preds = this.experts.map(e=> e.predict(ctx));
    const losses = preds.map(p=> 1 - Math.max(1e-6, p[actual] || 0));
    this.w = this.w.map((w,i)=> w * Math.exp(-this.eta * losses[i]));
    // online update experts
    this.experts.forEach(e=> e.update(ctx, actual));
  }
}

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
function detectPatternNext(moves: Move[]): Move | null {
  const n = moves.length; if (n >= 3 && moves[n-1] === moves[n-2] && moves[n-2] === moves[n-3]) return moves[n-1];
  if (n >= 6) { const a = moves.slice(n-6, n-3).join("-"); const b = moves.slice(n-3).join("-"); if (a === b) return moves[n-3]; }
  if (n >= 4) { const a = moves[n-4], b = moves[n-3], c = moves[n-2], d = moves[n-1]; if (a === c && b === d && a !== b) return a; }
  return null;
}
function predictNext(moves: Move[], rng: () => number): { move: Move | null; conf: number } {
  const mk = markovNext(moves); const pat = detectPatternNext(moves);
  if (mk.move && pat && mk.move === pat) return { move: mk.move, conf: Math.max(0.8, mk.conf) };
  if (pat && (!mk.move || mk.conf < 0.6)) return { move: pat, conf: 0.75 };
  if (mk.move && pat && mk.conf >= 0.6) return { move: (rng() < 0.6 ? pat : mk.move)!, conf: 0.7 };
  return { move: mk.move || pat || null, conf: mk.move ? mk.conf * 0.65 : (pat ? 0.6 : 0) };
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
        {mode === "speed" && "Beat the countdown—fast decisions!"}
        {mode === "practice" && "No score; experiment and learn."}
      </div>
      <span className="ink-pop" />
    </motion.button>
  );
}

// Main component
export default function RPSDoodleApp(){
  // Inject brand CSS and wipe animation
  const style = `
  :root{ --speed:#FF77AA; --practice:#88AA66; }
  .mode-grid{ display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px; width:min(92vw,640px); }
  .mode-card.dim{ filter: blur(2px) brightness(.85); }
  .ink-pop{ position:absolute; inset:0; background: radial-gradient(600px circle at var(--x,50%) var(--y,50%), rgba(255,255,255,.6), transparent 40%); opacity:0; transition:opacity .22s; }
  .mode-card:active .ink-pop{ opacity:1; }
  .fullscreen{ position:fixed; inset:0; z-index:50; will-change:transform; }
  .fullscreen.speed{ background: var(--speed); }
  .fullscreen.practice{ background: var(--practice); }
  .wipe{ position:fixed; inset:0; pointer-events:none; z-index:60; transform:translateX(110%); will-change:transform; background:linear-gradient(12deg, rgba(255,255,255,.9), rgba(255,255,255,1)); }
  .wipe.run{ animation: wipeIn 400ms cubic-bezier(.22,.61,.36,1) forwards; }
  @keyframes wipeIn{ 0%{ transform:translateX(110%) rotate(.5deg) } 100%{ transform:translateX(0) rotate(0) } }
  `;

  // Scenes
  type Scene = "BOOT"|"MODE"|"MATCH"|"RESULTS";
  const [scene, setScene] = useState<Scene>("BOOT");

  // Settings
  const prefersReduced = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState<boolean>(prefersReduced ?? false);
  useEffect(() => {
    setReducedMotion(prefersReduced ?? false);
  }, [prefersReduced]);
  const [audioOn, setAudioOn] = useState(true);
  const [textScale, setTextScale] = useState(1);
  const [predictorMode, setPredictorMode] = useState(false); // master enable for AI mix
  const [aiMode, setAiMode] = useState<AIMode>("normal"); // Fair/Normal/Ruthless
  const [predictorLevel, setPredictorLevel] = useState<PredictorLevel>("smart"); // legacy knob
  const TRAIN_ROUNDS = 15;
  const TRAIN_KEY = "rps_trained";
  const TRAIN_COUNT_KEY = "rps_training_count";
  const [isTrained, setIsTrained] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(TRAIN_KEY) === "1";
  });
  const [trainingCount, setTrainingCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const stored = parseInt(localStorage.getItem(TRAIN_COUNT_KEY) ?? "0", 10);
    if (Number.isNaN(stored)) return 0;
    return Math.min(Math.max(stored, 0), TRAIN_ROUNDS);
  });
  const [trainingActive, setTrainingActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const trained = localStorage.getItem(TRAIN_KEY) === "1";
    if (trained) return false;
    const stored = parseInt(localStorage.getItem(TRAIN_COUNT_KEY) ?? "0", 10);
    if (Number.isNaN(stored)) return false;
    return stored > 0 && stored < TRAIN_ROUNDS;
  });

  // Game state
  const trainingComplete = trainingCount >= TRAIN_ROUNDS;
  const needsTraining = !isTrained && !trainingComplete;
  const shouldAutoResumeTraining = needsTraining && trainingActive;
  const shouldGateTraining = needsTraining && !trainingActive;
  const bootNeedsTraining = useRef(needsTraining);
  const bootAutoResumeTraining = useRef(shouldAutoResumeTraining);
  const bootInitialTrainingActive = useRef(trainingActive);
  const modesDisabled = trainingActive || needsTraining;
  const trainingDisplayCount = Math.min(trainingCount, TRAIN_ROUNDS);
  const trainingProgress = Math.min(trainingDisplayCount / TRAIN_ROUNDS, 1);
  const [seed] = useState(()=>Math.floor(Math.random()*1e9));
  const rng = useMemo(()=>mulberry32(seed), [seed]);
  const [bestOf, setBestOf] = useState<3|5|7>(5);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [round, setRound] = useState(1);
  const [lastMoves, setLastMoves] = useState<Move[]>([]);
  const [aiHistory, setAiHistory] = useState<Move[]>([]);
  const [outcomesHist, setOutcomesHist] = useState<Outcome[]>([]);

  // Round sub-state
  type Phase = "idle"|"selected"|"countdown"|"reveal"|"resolve"|"feedback";
  const [phase, setPhase] = useState<Phase>("idle");
  const [playerPick, setPlayerPick] = useState<Move|undefined>();
  const [aiPick, setAiPick] = useState<Move|undefined>();
  const [count, setCount] = useState<number>(3);
  const [outcome, setOutcome] = useState<Outcome|undefined>();
  const [resultBanner, setResultBanner] = useState<"Victory"|"Defeat"|"Tie"|null>(null);
  const [live, setLive] = useState("");
  // countdown timer ref + helpers (prevents stale closure freezes)
  const countdownRef = useRef<number | null>(null);
  const trainingAnnouncementsRef = useRef<Set<number>>(new Set());
  const clearCountdown = ()=>{ if (countdownRef.current!==null){ clearInterval(countdownRef.current); countdownRef.current=null; } };
  const startCountdown = ()=>{ setPhase("countdown"); setCount(3); clearCountdown(); countdownRef.current = window.setInterval(()=>{ setCount(prev=>{ const next = prev - 1; audio.tick(); if (!reducedMotion) tryVibrate(6); if (next <= 0){ clearCountdown(); reveal(); } return next; }); }, 300); };

  // Mode select animation state
  const [selectedMode, setSelectedMode] = useState<Mode|null>(null);
  const [wipeRun, setWipeRun] = useState(false);
  const modeLabel = (m:Mode)=> m.charAt(0).toUpperCase()+m.slice(1);

  // Calibration overlay (Practice → Calibrate)
  const [showCal, setShowCal] = useState(false);
  const [calText, setCalText] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(TRAIN_KEY, isTrained ? "1" : "0");
  }, [isTrained]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const value = Math.min(trainingCount, TRAIN_ROUNDS);
    localStorage.setItem(TRAIN_COUNT_KEY, String(value));
  }, [trainingCount]);

  useEffect(() => {
    if (!needsTraining && !trainingActive) return;
    if (predictorMode) setPredictorMode(false);
    if (aiMode !== "fair") setAiMode("fair");
  }, [needsTraining, trainingActive, predictorMode, aiMode]);

  // Create audio context on first interaction
  const armedRef = useRef(false);
  const armAudio = () => { if (!armedRef.current){ audio.ensureCtx(); audio.setEnabled(audioOn); armedRef.current = true; } };
  useEffect(()=>{ audio.setEnabled(audioOn); }, [audioOn]);

  // Boot → initial scene routing
  useEffect(() => {
    const t = setTimeout(() => {
      if (bootNeedsTraining.current) {
        startMatch("practice", { silent: true });
        if (!bootInitialTrainingActive.current && bootAutoResumeTraining.current) {
          setTrainingActive(true);
        }
      } else {
        setScene("MODE");
      }
    }, 900);
    return () => clearTimeout(t);
  }, []);

  // Keyboard controls for MATCH
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
      const experts: Expert[] = [
        new FrequencyExpert(20, 1),
        new RecencyExpert(0.85, 1),
        new MarkovExpert(1, 1),
        new MarkovExpert(2, 1),
        new OutcomeExpert(1),
        new WinStayLoseShiftExpert(1),
        new PeriodicExpert(5,2,18,0.65),
        new BaitResponseExpert(1),
      ];
      mixerRef.current = new HedgeMixer(experts, 1.6);
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
    // Practice mode uses soft/none exploit unless user enabled predictorMode
    const useMix = isTrained && !trainingActive && predictorMode && aiMode !== "fair";
    if (!useMix || lastMoves.length === 0){
      // fallback to light heuristics until we have signal
      const { move: predicted, conf } = predictNext(lastMoves, rng);
      if (!predicted || conf < 0.34) return MOVES[Math.floor(rng()*3)] as Move;
      return policyCounterFromDist(({rock:0,paper:0,scissors:0, [predicted]:1} as any), aiMode);
    }
    const ctx: Ctx = { playerMoves: lastMoves, aiMoves: aiHistory, outcomes: outcomesHist, rng };
    const dist = getMixer().predict(ctx);
    return policyCounterFromDist(dist, aiMode);
  }

  function resetMatch(){
    setPlayerScore(0); setAiScore(0); setRound(1); setLastMoves([]); setAiHistory([]); setOutcomesHist([]);
    setOutcome(undefined); setAiPick(undefined); setPlayerPick(undefined);
    setPhase("idle"); setResultBanner(null);
  }

  function startMatch(mode?: Mode, opts: { silent?: boolean } = {}){
    const { silent = false } = opts;
    if (!silent) {
      armAudio();
      audio.whoosh();
    }
    resetMatch();
    if (mode) setSelectedMode(mode);
    setScene("MATCH");
  }

  function resetTraining(){
    if (typeof window !== "undefined") {
      localStorage.setItem(TRAIN_KEY, "0");
      localStorage.setItem(TRAIN_COUNT_KEY, "0");
    }
    trainingAnnouncementsRef.current.clear();
    setShowCal(false);
    setIsTrained(false);
    setPredictorMode(false);
    setAiMode("fair");
    setTrainingCount(0);
    setTrainingActive(false);
    startMatch("practice", { silent: true });
  }

  function beginTrainingSession(){
    setSelectedMode('practice');
    resetMatch();
    setTrainingActive(true);
  }

  function onSelect(m: Move){ if (phase !== "idle") return; setPlayerPick(m); setPhase("selected"); setLive(`You selected ${m}.`); audio.pop(); setTimeout(startCountdown, 140); }

  function reveal(){
    const player = playerPick; if (!player) return;
    const ai = aiChoose(); setAiPick(ai); setAiHistory(h=>[...h, ai]); setPhase("reveal");
    setTimeout(()=>{
      const res = resolveOutcome(player, ai); setOutcome(res); setPhase("resolve");
      // Online update mixer with context prior to adding current move
      const ctx: Ctx = { playerMoves: lastMoves, aiMoves: aiHistory, outcomes: outcomesHist, rng };
      if (predictorMode && aiMode !== "fair") getMixer().update(ctx, player);
      setOutcomesHist(o=>[...o, res]);
      setLive(`AI chose ${ai}. ${res === 'win' ? 'You win this round.' : res === 'lose' ? 'You lose this round.' : 'Tie.'}`);
      if (res === "win") audio.thud(); else if (res === "lose") audio.snare(); else audio.tie();
      setTimeout(()=>{ if (trainingActive) setTrainingCount(count=> Math.min(TRAIN_ROUNDS, count + 1)); setPhase("feedback"); setLastMoves(prev=>[...prev, player]); }, 150);
    }, 240);
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
    if (!isTrained) setIsTrained(true);
    trainingAnnouncementsRef.current.clear();
    computeCalibration();
  }, [trainingActive, trainingCount, isTrained]);

  // Failsafes: if something stalls, advance automatically
  useEffect(()=>{ if (phase === "selected"){ const t = setTimeout(()=>{ if (phase === "selected") startCountdown(); }, 500); return ()=> clearTimeout(t); } }, [phase]);
  useEffect(()=>{ if (phase === "countdown"){ const t = setTimeout(()=>{ if (phase === "countdown"){ clearCountdown(); reveal(); } }, 2200); return ()=> clearTimeout(t); } }, [phase]);
  useEffect(()=>{ return ()=> clearCountdown(); },[]);

  // Next round or end match
  useEffect(() => {
    if (phase !== "feedback") return;
    const delay = trainingActive ? 260 : (reducedMotion ? 300 : 520);
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
  }, [phase, trainingActive, playerScore, aiScore, bestOf, reducedMotion]);

  // Helpers
  function tryVibrate(ms:number){ if ((navigator as any).vibrate) (navigator as any).vibrate(ms); }
  function bannerColor(){ if (resultBanner === "Victory") return "bg-green-500"; if (resultBanner === "Defeat") return "bg-rose-500"; return "bg-amber-500"; }
  // navigation + timer guards to avoid stuck overlays when returning to MODE
  const timersRef = useRef<number[]>([]);
  const addT = (fn:()=>void, ms:number)=>{ const id = window.setTimeout(fn, ms); timersRef.current.push(id); return id; };
  const clearTimers = ()=>{ timersRef.current.forEach(id=> clearTimeout(id)); timersRef.current = []; };
  function goToMode(){ clearCountdown(); clearTimers(); setWipeRun(false); setSelectedMode(null); setScene("MODE"); }
  function goToMatch(){ clearTimers(); startMatch(selectedMode ?? "practice"); }

  // ---- Practice → Calibrate overlay ----
  function computeCalibration(){
    const n = lastMoves.length; if (n < 6){ setCalText("Play ~10 rounds in Practice to calibrate."); return; }
    // Favorite move
    const fav = mostFrequentMove(lastMoves);
    const favPct = fav ? Math.round(100* lastMoves.filter(m=>m===fav).length / n) : 0;
    // Repeat after win
    let rw=0, tw=0, ls=0, tl=0;
    for (let i=1;i<outcomesHist.length;i++){
      if (outcomesHist[i-1]==='win'){ tw++; if (lastMoves[i]===lastMoves[i-1]) rw++; }
      if (outcomesHist[i-1]==='lose'){ tl++; if (lastMoves[i]!==lastMoves[i-1]) ls++; }
    }
    const rwPct = tw? Math.round(100*rw/tw):0; const lsPct = tl? Math.round(100*ls/tl):0;
    setCalText(`Favorite: ${fav??'-'} (${favPct}%). Repeat-after-win: ${rwPct}%. Switch-after-loss: ${lsPct}%.`);
    setShowCal(true);
  }

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
    const hist2: Move[] = ["rock","paper","rock","paper"]; console.assert(detectPatternNext(hist2) === "rock", "detectPatternNext L2 failed");
    // Mixer sanity: expert that predicts constant 'rock' should win on rock-heavy stream
    const mix = new HedgeMixer([new FrequencyExpert(20,1)], 1.6);
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

      {/* Header / Settings */}
      <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between">
        <motion.h1 layout className="text-2xl font-extrabold tracking-tight text-sky-700 drop-shadow-sm">RPS Lab</motion.h1>
        <div className="flex items-center gap-2">
          <button onClick={() => goToMode()} disabled={modesDisabled} className={`px-3 py-1.5 rounded-xl shadow text-sm ${modesDisabled ? "bg-white/50 text-slate-400 cursor-not-allowed" : "bg-white/70 hover:bg-white text-sky-900"}`}>Modes</button>
          <details className="bg-white/70 rounded-xl shadow group">
            <summary className="list-none px-3 py-1.5 cursor-pointer text-sm text-slate-900">Settings ⚙️</summary>
            <div className="p-3 pt-0 space-y-2 text-sm">
              <label className="flex items-center justify-between gap-4"><span>Audio</span><input type="checkbox" checked={audioOn} onChange={e=> setAudioOn(e.target.checked)} /></label>
              <label className="flex items-center justify-between gap-4"><span>Reduced motion</span><input type="checkbox" checked={reducedMotion} onChange={e=> setReducedMotion(e.target.checked)} /></label>
              <label className="flex items-center justify-between gap-4"><span>Text size</span><input type="range" min={0.9} max={1.4} step={0.05} value={textScale} onChange={e=> setTextScale(parseFloat(e.target.value))} /></label>
              <hr className="my-2" />
              <label className="flex items-center justify-between gap-4"><span>AI Predictor</span><input type="checkbox" checked={predictorMode} onChange={e=> setPredictorMode(e.target.checked)} disabled={!isTrained} /></label>
              <label className="flex items-center justify-between gap-4"><span>AI Difficulty</span>
                <select value={aiMode} onChange={e=> setAiMode(e.target.value as AIMode)} disabled={!isTrained || !predictorMode} className="px-2 py-1 rounded bg-white shadow-inner">
                  <option value="fair">Fair</option>
                  <option value="normal">Normal</option>
                  <option value="ruthless">Ruthless</option>
                </select>
              </label>
              {/* Legacy level preserved (tunes epsilon in heuristics path) */}
              <label className="flex items-center justify-between gap-4"><span>Legacy level</span>
                <select value={predictorLevel} onChange={e=> setPredictorLevel(e.target.value as PredictorLevel)} className="px-2 py-1 rounded bg-white shadow-inner">
                  <option value="basic">Basic</option>
                  <option value="smart">Smart</option>
                  <option value="adaptive">Adaptive</option>
                </select>
              </label>
              <hr className="my-2" />
              <label className="flex items-center justify-between gap-4"><span>Best of</span>
                <select value={bestOf} onChange={e=> setBestOf(Number(e.target.value) as any)} className="px-2 py-1 rounded bg-white shadow-inner">
                  <option value={3}>3</option><option value={5}>5</option><option value={7}>7</option>
                </select>
              </label>
              <button className="px-2 py-1 rounded bg-white shadow" onClick={resetTraining}>Reset AI training</button>
            </div>
          </details>
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
                <ModeCard key={m} mode={m} onSelect={handleModeSelect} isDimmed={!!selectedMode && selectedMode!==m} disabled={m === "speed" && needsTraining} />
              ))}
            </div>

            {/* Fullscreen morph container */}
            <AnimatePresence>
              {selectedMode && (
                <motion.div key="fs" className={`fullscreen ${selectedMode}`} layoutId={`card-${selectedMode}`} initial={{ borderRadius: 16 }} animate={{ borderRadius: 0, transition: { duration: 0.44, ease: [0.22,0.61,0.36,1] }}}>
                  <div className="absolute inset-0 grid place-items-center">
                    <motion.div initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: .36 }} className="text-7xl">
                      {selectedMode === 'speed' ? '⏱️' : '💡'}
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
            {shouldGateTraining && !showCal && (
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
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-700">Round <strong>{round}</strong> / Best of {bestOf}</div>
                  <div className="flex items-center gap-6 text-xl">
                    <div className="flex items-center gap-2"><span className="text-slate-500 text-sm">You</span><strong>{playerScore}</strong></div>
                    <div className="flex items-center gap-2"><span className="text-slate-500 text-sm">AI</span><strong>{aiScore}</strong></div>
                  </div>
                </div>
              )}
            </motion.div>

            {trainingActive && (
              <div className="mt-3 w-[min(92vw,680px)] flex items-center justify-between text-sm text-slate-600">
                <span>Keep playing to finish training.</span>
                <span className="text-slate-500">Calibration unlocks at {TRAIN_ROUNDS} rounds.</span>
              </div>
            )}
            {selectedMode === 'practice' && (
              <div className="mt-3 w-[min(92vw,680px)] flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:gap-8">
                <button
                  className="px-3 py-1.5 rounded-xl bg-white shadow hover:bg-slate-50"
                  disabled={trainingActive || needsTraining || lastMoves.length<10}
                  onClick={computeCalibration}
                >
                  Calibrate
                </button>
                <div className="text-slate-600">
                  {(trainingActive || needsTraining)
                    ? 'Finish training to unlock calibration statistics.'
                    : <>Play ~10+ rounds, then calibrate. Toggle <strong>AI Predictor</strong> + set <strong>AI Difficulty</strong> to switch to exploit.</>}
                </div>
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
                {phase === "resolve" && outcome && (
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
      <div className={`wipe ${wipeRun ? 'run' : ''}`} aria-hidden/>

      {/* Calibration modal */}
      <AnimatePresence>
        {showCal && (
          <motion.div key="cal" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="fixed inset-0 z-[70] grid place-items-center bg-black/40">
            <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} exit={{ y:20, opacity:0 }} className="bg-white rounded-2xl shadow-xl w-[min(92vw,520px)] p-4">
              <div className="text-xl font-black mb-1">Calibration</div>
              <p className="text-slate-700 text-sm mb-2">{calText}</p>
              <div className="flex items-center justify-end gap-3 mt-3">
                <select
                  className="px-2 py-1 rounded bg-white shadow-inner mr-1"
                  value={aiMode}
                  onChange={e=> setAiMode(e.target.value as AIMode)}
                >
                  <option value="fair">Fair</option>
                  <option value="normal">Normal</option>
                  <option value="ruthless">Ruthless</option>
                </select>
                <button
                  className="px-3 py-1.5 rounded-xl bg-sky-600 text-white shadow"
                  onClick={()=>{
                    setShowCal(false);
                    setPredictorMode(true);
                    setIsTrained(true);
                    resetMatch();
                    setScene("MATCH");
                  }}
                >
                  Start Match
                </button>
                <button className="px-3 py-1.5 rounded-xl bg-white shadow" onClick={()=> setShowCal(false)}>Keep practicing</button>
              </div>
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

    </div>
  );
}
