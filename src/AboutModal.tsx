import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutModal({ open, onClose }: AboutModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>("[data-focus-first]");
    if (firstFocusable) {
      firstFocusable.focus();
    }
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="flex w-[min(95vw,760px)] max-h-[85vh] flex-col overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="About RPS Predictor"
        onClick={event => event.stopPropagation()}
        ref={modalRef}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
          <div>
            <h2 className="text-2xl font-bold">About RPS Predictor</h2>
            <p className="text-sm text-slate-200">Glass-box AI learning through Rock-Paper-Scissors.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            data-focus-first
          >
            Close ✕
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-6 text-sm leading-relaxed">
          <div className="space-y-6">
            <section>
              <h3 className="text-base font-semibold text-slate-900">What this is</h3>
              <p className="mt-2 text-slate-600">
                <strong>RPS Predictor</strong> is an interactive game that teaches glass-box AI. The app shares live probabilities,
                confidence, and reasoning for every prediction so learners can inspect how simple models adapt and how to beat them.
              </p>
            </section>
            <section>
              <h3 className="text-base font-semibold text-slate-900">Who made it</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                <li>
                  <span className="font-semibold">Developers:</span> Adam Ali (project lead, AI logic &amp; architecture) and John N. Weaver (front-end, test runs &amp; UX)
                </li>
                <li>
                  <span className="font-semibold">Institution:</span> University of Texas at San Antonio (UTSA) — College of AI, Cyber &amp; Computing
                </li>
                <li>
                  <span className="font-semibold">Advisors/Instructors:</span> Dr. Fred Martin, Dr. Ismaila Sanusi, Dr. Deepti Tagare
                </li>
              </ul>
            </section>
            <section>
              <h3 className="text-base font-semibold text-slate-900">Why we built it</h3>
              <p className="mt-2 text-slate-600">
                We wanted a fast, playful way for K–12 learners to explore how sequence models find patterns, how confidence shifts,
                and why calibration and sharpness matter for trustworthy AI. The game emphasizes that AI is statistics you can test,
                question, and beat.
              </p>
            </section>
            <section>
              <h3 className="text-base font-semibold text-slate-900">How it works</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                <li>Tracks your recent move sequence and frequencies</li>
                <li>Predicts the next move with a lightweight online Markov/n-gram model</li>
                <li>Displays Live AI Insight with prediction, confidence, reasons, and a quick timeline</li>
              </ul>
            </section>
            <section>
              <h3 className="text-base font-semibold text-slate-900">Built with</h3>
              <p className="mt-2 text-slate-600">React · TypeScript · Vite · Framer Motion with accessibility-first design.</p>
            </section>
            <section>
              <h3 className="text-base font-semibold text-slate-900">Privacy &amp; data</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                <li>Round events (your move, AI probabilities, outcome) are logged for this session only.</li>
                <li>No external personal data is collected.</li>
                <li>You can export your data anytime from Statistics or Settings → Export CSV.</li>
              </ul>
            </section>
            <section>
              <h3 className="text-base font-semibold text-slate-900">Alignment</h3>
              <p className="mt-2 text-slate-600">
                Inspired by the AI4K12 “Five Big Ideas,” especially Learning, Representation &amp; Reasoning, and Societal Impact through transparency and fairness.
              </p>
            </section>
            <section>
              <h3 className="text-base font-semibold text-slate-900">Credits &amp; acknowledgments</h3>
              <p className="mt-2 text-slate-600">Thanks to classmates and partners in CS 5463 for UI/UX feedback.</p>
            </section>
            <section>
              <h3 className="text-base font-semibold text-slate-900">Links &amp; contact</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                <li>
                  GitHub: <a href="https://github.com/BoDa7s/rps_predictor" className="text-sky-600 underline" target="_blank" rel="noreferrer">BoDa7s/rps_predictor</a>
                </li>
                <li>
                  Issues &amp; feedback: <a href="https://github.com/BoDa7s/rps_predictor/issues" className="text-sky-600 underline" target="_blank" rel="noreferrer">Project issue tracker</a>
                </li>
              </ul>
            </section>
            <section className="border-t border-slate-200 pt-4">
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-500">
                <span>Version: v5.3</span>
                <span>Launch build</span>
              </div>
            </section>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
