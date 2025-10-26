import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type AiInsightChip = {
  id: string;
  label: string;
  detail: string;
};

export type AiFaqQuestion = {
  id: string;
  question: string;
  answer: string;
  more: string;
};

interface AIConfidencePanelProps {
  confidence: number | null;
  chips: AiInsightChip[];
  questions: AiFaqQuestion[];
  onAnalyticsEvent?: (name: string, payload?: Record<string, unknown>) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const TOAST_DURATION_MS = 6000;

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

const toastVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 12 },
};

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
  questions,
  onAnalyticsEvent,
  mobileOpen,
  onMobileClose,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const isLarge = useMediaQuery("(min-width: 1024px)");
  const isMediumUp = useMediaQuery("(min-width: 768px)");

  const [accordionOpen, setAccordionOpen] = useState(true);
  const [activeChipId, setActiveChipId] = useState<string | null>(null);
  const [activeToast, setActiveToast] = useState<AiFaqQuestion | null>(null);
  const [moreQuestion, setMoreQuestion] = useState<AiFaqQuestion | null>(null);

  useEffect(() => {
    if (isLarge) {
      setAccordionOpen(true);
    } else if (isMediumUp) {
      setAccordionOpen(false);
    } else {
      setAccordionOpen(true);
    }
  }, [isLarge, isMediumUp]);

  useEffect(() => {
    if (!mobileOpen && !isMediumUp) {
      setActiveToast(null);
      setActiveChipId(null);
    }
  }, [isMediumUp, mobileOpen]);

  useEffect(() => {
    if (!activeToast) return;
    const timer = window.setTimeout(() => setActiveToast(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [activeToast]);

  useEffect(() => {
    if (!activeToast || !onAnalyticsEvent) return;
    onAnalyticsEvent("toast_shown", { question_id: activeToast.id });
  }, [activeToast, onAnalyticsEvent]);

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

  const handleQuestionClick = useCallback(
    (question: AiFaqQuestion) => {
      setActiveToast(question);
      if (onAnalyticsEvent) {
        onAnalyticsEvent("faq_question_clicked", { question_id: question.id });
      }
    },
    [onAnalyticsEvent],
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

      <div className="space-y-3 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">Questions</h4>
          {!isLarge && isMediumUp && (
            <button
              type="button"
              className="text-xs font-semibold text-sky-600 hover:text-sky-700"
              onClick={() => setAccordionOpen(prev => !prev)}
              aria-expanded={accordionOpen}
            >
              {accordionOpen ? "Hide" : "Show"}
            </button>
          )}
        </div>
        {(accordionOpen || isLarge || !isMediumUp) && (
          <div className="flex flex-col gap-2">
            {questions.map(question => (
              <button
                key={question.id}
                type="button"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                onClick={() => handleQuestionClick(question)}
                data-analytics-id={`faq.${question.id}`}
              >
                {question.question}
              </button>
            ))}
          </div>
        )}
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

  const toastClass = isMediumUp
    ? "fixed bottom-6 left-1/2 z-[90] w-[min(90vw,360px)] -translate-x-1/2"
    : "absolute bottom-24 left-1/2 z-[90] w-[min(90vw,340px)] -translate-x-1/2";

  const toastContent = (
    <AnimatePresence>
      {activeToast && (
        <motion.div
          key={activeToast.id}
          className={toastClass}
          variants={toastVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
        >
          <div className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-slate-900/95 p-4 text-slate-100 shadow-2xl">
            <div className="flex-1 space-y-2">
              <div className="text-sm font-semibold text-white">{activeToast.question}</div>
              <p className="text-sm leading-snug text-slate-100/90">{activeToast.answer}</p>
              <button
                type="button"
                className="text-xs font-semibold text-sky-200 underline-offset-2 hover:text-sky-100"
                onClick={() => setMoreQuestion(activeToast)}
              >
                More
              </button>
            </div>
            <button
              type="button"
              className="mt-0.5 text-sm font-semibold text-slate-300 transition hover:text-white"
              onClick={() => setActiveToast(null)}
              aria-label="Close toast"
            >
              ×
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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
              {toastContent}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isMediumUp && toastContent}

      <AnimatePresence>
        {moreQuestion && (
          <motion.div
            className="fixed inset-0 z-[96] grid place-items-center bg-slate-900/50 px-4"
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
            onClick={() => setMoreQuestion(null)}
          >
            <motion.div
              className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 text-slate-700 shadow-2xl"
              variants={modalCardVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.2, 0.7, 0.3, 1] }}
              onClick={event => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-question-more-title"
            >
              <h3 id="ai-question-more-title" className="text-base font-semibold text-slate-900">
                {moreQuestion.question}
              </h3>
              <p className="text-sm leading-relaxed text-slate-600">{moreQuestion.more}</p>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white shadow hover:bg-sky-700"
                  onClick={() => setMoreQuestion(null)}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIConfidencePanel;
