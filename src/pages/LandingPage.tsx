import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import botHappy96 from "../assets/mascot/bot-happy-96.svg";
import { PLAY_DASHBOARD_PATH } from "../playEntry";
import challengeScreenshot from "../../RPS_Screenshot_Examples/Figure 48 Routed challenge cockpit.png";
import leaderboardScreenshot from "../../RPS_Screenshot_Examples/Figure 49 Routed leaderboard page.png";
import statsScreenshot from "../../RPS_Screenshot_Examples/Figure 50 Routed stats page.png";

const heroSignals = [
  "Adaptive AI that learns your patterns round by round",
  "Coach-style insights that explain what the model is seeing",
  "Smooth instant-play sessions with zero setup friction",
];

const featureHighlights = [
  {
    eyebrow: "Predictive training",
    title: "Teach the model, then test your habits under pressure",
    description:
      "RPS Predictor watches move history, rhythm, and streak behavior to build a readable profile before the challenge begins.",
  },
  {
    eyebrow: "Live explainability",
    title: "See how the AI adjusts instead of hiding the decision",
    description:
      "Insight panels and round summaries turn every match into a visible learning loop to help you understand what the predictor noticed and how it is adjusting.",
  },
  {
    eyebrow: "Built for repeat play",
    title: "Fast matches that reward strategy and variation, not memorization",
    description:
      "Short sessions, clear feedback, and adaptive play make every rematch a chance to change your habits and improve your edge.",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Train the AI your style",
    description: "Play a few opening rounds so the model can start learning your habits, tendencies, and move patterns.",
  },
  {
    step: "02",
    title: "Enter the real match",
    description: "Jump into the full game and face an AI that actively adjusts as it tries to predict your next move.",
  },
  {
    step: "03",
    title: "Study the feedback",
    description: "Review stats, insights, and match signals to see what the predictor noticed and where your patterns showed up.",
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.55, ease: "easeOut" },
};

export default function LandingPage() {
  return (
    <div className="landing-shell min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-12rem] top-[-8rem] h-[28rem] w-[28rem] rounded-full bg-cyan-500/18 blur-3xl" />
        <div className="absolute right-[-10rem] top-[8rem] h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute inset-x-0 top-[28rem] h-[32rem] bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_42%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 pb-20 pt-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between rounded-full border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-sky-500 to-emerald-400 shadow-[0_12px_30px_rgba(14,165,233,0.35)]">
              <img src={botHappy96} alt="" className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/80">RPS Predictor</p>
              <p className="text-xs text-slate-400">Adaptive rock-paper-scissors with visible AI reasoning</p>
            </div>
          </div>
          <nav className="flex items-center gap-3">
            <a href="#how-it-works" className="hidden text-sm text-slate-300 transition hover:text-white sm:inline-flex">
              How it works
            </a>
            <Link
              to={PLAY_DASHBOARD_PATH}
              className="inline-flex items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-5 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/15 hover:text-white"
            >
              Play now
            </Link>
          </nav>
        </header>

        <main className="relative flex-1">
          <section className="grid items-center gap-16 pb-20 pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:pt-20">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-100/90">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(134,239,172,0.8)]" />
                Live AI strategy game
              </div>
              <h1 className="mt-6 text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">
                Outsmart an AI that studies every move you make.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300 sm:text-xl">
                RPS Predictor turns rock-paper-scissors into a real strategy battle. 
                The AI learns your habits, adapts as you play, and gives you live feedback on how it is reading your moves.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  to={PLAY_DASHBOARD_PATH}
                  className="inline-flex min-h-16 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400 px-8 text-lg font-semibold text-slate-950 shadow-[0_20px_50px_rgba(14,165,233,0.35)] transition duration-200 hover:scale-[1.01] hover:shadow-[0_24px_60px_rgba(52,211,153,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200"
                >
                  Get Started
                </Link>
                <p className="text-sm text-slate-400">
                  Launches the game 
                </p>
              </div>
              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {heroSignals.map(signal => (
                  <div
                    key={signal}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-slate-200 backdrop-blur"
                  >
                    {signal}
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.65, ease: "easeOut", delay: 0.1 }}
              className="relative mx-auto w-full max-w-2xl"
            >
                <div className="relative z-10 rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-[0_30px_80px_rgba(2,6,23,0.55)] backdrop-blur">
                <div className="rounded-[1.55rem] border border-white/10 bg-slate-900 p-3">
                  <div className="flex items-center gap-2 border-b border-white/10 px-2 pb-3">
                    <span className="h-3 w-3 rounded-full bg-rose-400" />
                    <span className="h-3 w-3 rounded-full bg-amber-300" />
                    <span className="h-3 w-3 rounded-full bg-emerald-300" />
                    <p className="ml-3 text-xs uppercase tracking-[0.24em] text-slate-400">Gameplay Preview</p>
                  </div>
                  <div className="mt-3 overflow-hidden rounded-[1.1rem] border border-white/10 bg-slate-950">
                    <img
                      src={challengeScreenshot}
                      alt="RPS Predictor challenge cockpit preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          <motion.section
            id="how-it-works"
            {...fadeUp}
            className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-8 backdrop-blur sm:px-8 lg:px-10"
          >
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/80">How It Works</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                Learn the pattern. Beat the predictor. Review the insights. Repeat.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-300">
                RPS Predictor turns every round into a strategy battle. The AI studies your habits, adapts to your choices, and gives you live insight into how it thinks.
                The more you play, the more you can outsmart it.
              </p>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {howItWorks.map(item => (
                <article key={item.step} className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/75">{item.step}</p>
                  <h3 className="mt-5 text-2xl font-semibold text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
                </article>
              ))}
            </div>
          </motion.section>

          <motion.section {...fadeUp} className="py-20">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div className="max-w-xl">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-200/80">Feature Highlights</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                  A smarter rock-paper-scissors experience built around adaptation.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-300">
                  RPS Predictor goes beyond random rounds by tracking behavior, responding to patterns, and showing you how the AI is learning as the match unfolds.
                </p>
              </div>
              <div className="grid gap-4">
                {featureHighlights.map(card => (
                  <article key={card.title} className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/75">{card.eyebrow}</p>
                    <h3 className="mt-3 text-2xl font-semibold text-white">{card.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{card.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </motion.section>

          <motion.section {...fadeUp} className="pb-20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Inside The Experience</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                  Real gameplay, real feedback, real adaptation.
                </h2>
              </div>
              <Link
                to={PLAY_DASHBOARD_PATH}
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-200/60 hover:bg-white/10"
              >
                Launch Game
              </Link>
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <article className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-[0_30px_80px_rgba(2,6,23,0.55)] backdrop-blur">
                <div className="rounded-[1.55rem] border border-white/10 bg-slate-900 p-3">
                  <div className="flex items-center gap-2 border-b border-white/10 px-2 pb-3">
                    <span className="h-3 w-3 rounded-full bg-rose-400" />
                    <span className="h-3 w-3 rounded-full bg-amber-300" />
                    <span className="h-3 w-3 rounded-full bg-emerald-300" />
                    <p className="ml-3 text-xs uppercase tracking-[0.24em] text-slate-400">Leaderboard Preview</p>
                  </div>
                  <div className="mt-3 overflow-hidden rounded-[1.1rem] border border-white/10 bg-slate-950">
                    <img
                      src={leaderboardScreenshot}
                      alt="RPS Predictor leaderboard page"
                      className="h-full w-full object-contain object-top"
                    />
                  </div>
                </div>
              </article>
              <div className="grid gap-5">
                <article className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-[0_30px_80px_rgba(2,6,23,0.55)] backdrop-blur">
                  <div className="rounded-[1.55rem] border border-white/10 bg-slate-900 p-3">
                    <div className="flex items-center gap-2 border-b border-white/10 px-2 pb-3">
                      <span className="h-3 w-3 rounded-full bg-rose-400" />
                      <span className="h-3 w-3 rounded-full bg-amber-300" />
                      <span className="h-3 w-3 rounded-full bg-emerald-300" />
                      <p className="ml-3 text-xs uppercase tracking-[0.24em] text-slate-400">Statistics Preview</p>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-[1.1rem] border border-white/10 bg-slate-950">
                      <img
                        src={statsScreenshot}
                        alt="RPS Predictor statistics page"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                </article>
                <article className="rounded-[2rem] border border-cyan-300/15 bg-gradient-to-br from-cyan-400/10 via-slate-900 to-emerald-400/10 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/80">WHY IT STANDS OUT</p>
                  <p className="mt-4 text-2xl font-semibold text-white">The game shows you how the AI thinks.</p>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Live screenshots highlight the actual match experience, from prediction signals to habit tracking and performance feedback. 
                    What you see here is the real game in action.
                  </p>
                </article>
              </div>
            </div>
          </motion.section>

          <motion.section
            {...fadeUp}
            className="rounded-[2rem] border border-cyan-300/15 bg-gradient-to-r from-cyan-400/12 via-slate-900 to-emerald-400/12 px-6 py-10 text-center sm:px-8"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-100/80">Ready To Play</p>
            <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Step in, stay unpredictable, and see if you can beat the predictor.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Start from the homepage, launch the game in one click, and take on an AI that learns from every move you make.
            </p>
            <div className="mt-8">
              <Link
                to={PLAY_DASHBOARD_PATH}
                className="inline-flex min-h-16 items-center justify-center rounded-2xl bg-white px-8 text-lg font-semibold text-slate-950 shadow-[0_16px_40px_rgba(255,255,255,0.16)] transition hover:scale-[1.01] hover:bg-cyan-50"
              >
                Get Started
              </Link>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
