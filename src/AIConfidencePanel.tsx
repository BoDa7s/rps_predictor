import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type AiInsightChip = {
  id: string;
  label: string;
  detail: string;
};

interface AIConfidencePanelProps {
  confidence: number | null;
  chips: AiInsightChip[];
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function clampPercent(value: number | null): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function barTone(percent: number): string {
  if (percent >= 75) return "bg-emerald-400";
  if (percent >= 50) return "bg-sky-400";
  return "bg-slate-400";
}

function confidenceLabel(percent: number | null): string {
  if (percent == null) return "—";
  const clamped = clampPercent(percent);
  return `${clamped}%`;
}

function useMediaQuery(query: string): boolean {
  const getMatches = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  }, [query]);

  const [matches, setMatches] = useState<boolean>(() => getMatches());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [getMatches, query]);

  return matches;
}

const chipInitial = { opacity: 0, y: 6 };
const chipAnimate = { opacity: 1, y: 0 };
const chipExit = { opacity: 0, y: -6 };

const modalVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalCardVariants = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 12 },
};

export const AIConfidencePanel: React.FC<AIConfidencePanelProps> = ({
  confidence,
  chips,
  mobileOpen,
  onMobileClose,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const isMediumUp = useMediaQuery("(min-width: 768px)");

  const [activeChipId, setActiveChipId] = useState<string | null>(null);

  useEffect(() => {
    if (!mobileOpen && !isMediumUp) {
      setActiveChipId(null);
    }
  }, [isMediumUp, mobileOpen]);

  const percent = useMemo(() => clampPercent(confidence), [confidence]);
  const progressTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.3, ease: [0.2, 0.7, 0.3, 1] };

  const handleChipClick = useCallback(
    (id: string) => {
      setActiveChipId(prev => (prev === id ? null : id));
    },
    [setActiveChipId],
  );

  const inlineContent = (
    <div className="flex h-full flex-col gap-5">
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Live AI Insight</h3>
            <span className="text-sm font-semibold text-slate-600">{confidenceLabel(confidence)}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <motion.div
              className={`h-full rounded-full ${barTone(percent)}`}
              initial={false}
              animate={{ width: `${confidence == null ? 0 : percent}%` }}
              transition={progressTransition}
            />
          </div>
          <p className="text-xs text-slate-500">Higher = more sure about its prediction.</p>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why this prediction</div>
          {chips.length ? (
            <div className="flex flex-wrap gap-2">
              <AnimatePresence>
                {chips.slice(0, 2).map(chip => (
                  <motion.button
                    key={chip.id}
                    type="button"
                    className={`rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                      activeChipId === chip.id ? "bg-sky-50 border-sky-300 text-sky-700" : "bg-white"
                    }`}
                    onClick={() => handleChipClick(chip.id)}
                    initial={chipInitial}
                    animate={chipAnimate}
                    exit={chipExit}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
                    aria-pressed={activeChipId === chip.id}
                  >
                    {chip.label}
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <p className="text-xs text-slate-500">No strong patterns spotted yet. Keep playing to reveal more.</p>
          )}
          <AnimatePresence>
            {activeChipId && (
              <motion.div
                key={activeChipId}
                className="rounded-lg bg-slate-900/90 px-3 py-2 text-xs text-slate-100 shadow-lg"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
              >
                {chips.find(chip => chip.id === activeChipId)?.detail}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  const panelCard = (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-white/85 p-5 shadow-xl backdrop-blur">
      <div className="flex-1 overflow-y-auto pr-1">
        {inlineContent}
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:block lg:sticky lg:top-28">
        {panelCard}
      </div>

      <AnimatePresence>
        {!isMediumUp && mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[95] bg-slate-900/40 px-4"
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
            onClick={onMobileClose}
          >
            <motion.div
              className="relative mx-auto mt-24 w-full max-w-sm"
              variants={modalCardVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.2, 0.7, 0.3, 1] }}
              onClick={event => event.stopPropagation()}
            >
              {panelCard}
              <button
                type="button"
                className="absolute -top-10 right-0 rounded-full bg-slate-900/80 px-3 py-1 text-sm font-semibold text-white shadow-lg"
                onClick={onMobileClose}
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
};

export default AIConfidencePanel;
