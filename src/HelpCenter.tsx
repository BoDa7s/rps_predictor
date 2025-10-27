import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type HelpQuestion = {
  id: string;
  question: string;
  answer: string;
};

interface HelpCenterProps {
  open: boolean;
  onClose: () => void;
  questions: HelpQuestion[];
  activeQuestionId: string | null;
  onChangeActiveQuestion: (id: string | null) => void;
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

const overlayTransition = { duration: 0.2, ease: [0.22, 0.61, 0.36, 1] } as const;
const accordionTransition = { duration: 0.22, ease: [0.4, 0, 0.2, 1] } as const;

export const HelpCenter: React.FC<HelpCenterProps> = ({
  open,
  onClose,
  questions,
  activeQuestionId,
  onChangeActiveQuestion,
}) => {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const modalId = "help-center-modal";

  const groupedQuestions = useMemo(() => {
    const groups = new Map<
      string,
      { category: string; entries: { id: string; question: string; answer: string }[] }
    >();

    questions.forEach(question => {
      const parts = question.question.split("·");
      const category = parts.length > 1 ? parts[0].trim() : "General";
      const label = parts.length > 1 ? parts.slice(1).join("·").trim() : question.question.trim();

      const existing = groups.get(category);
      const entry = { id: question.id, question: label, answer: question.answer };
      if (existing) {
        existing.entries.push(entry);
      } else {
        groups.set(category, { category, entries: [entry] });
      }
    });

    return Array.from(groups.values());
  }, [questions]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleOverlayClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const card = (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 id="help-center-title" className="text-lg font-semibold text-slate-900">
            Help &amp; Questions
          </h2>
          <p className="text-sm text-slate-500">Tap a question to see the answer.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
          aria-label="Close help"
        >
          ×
        </button>
      </div>
      <div className="mt-4 flex-1 space-y-6 overflow-y-auto pr-1">
        {groupedQuestions.map(group => (
          <section key={group.category} className="space-y-3">
            <h3 className="text-lg font-bold uppercase tracking-wide text-slate-900">
              {group.category}
            </h3>
            <div className="space-y-2">
              {group.entries.map(question => {
                const isActive = activeQuestionId === question.id;
                const containerClass = `rounded-xl border bg-white shadow-sm transition-colors ${
                  isActive ? "border-sky-200 bg-sky-50/80" : "border-slate-200"
                }`;
                return (
                  <div key={question.id} className={containerClass}>
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                        isActive
                          ? "text-sky-700"
                          : "text-slate-800 hover:bg-slate-50"
                      } focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`}
                      aria-expanded={isActive}
                      aria-controls={`${question.id}-content`}
                      onClick={() => onChangeActiveQuestion(isActive ? null : question.id)}
                    >
                      <span>{question.question}</span>
                      <span
                        aria-hidden
                        className={`flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-200 ${
                          isActive ? "rotate-90 bg-sky-100 text-sky-600" : ""
                        }`}
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M7 5l6 5-6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isActive && (
                        <motion.div
                          key="content"
                          id={`${question.id}-content`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={accordionTransition}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 text-sm leading-relaxed text-slate-600">
                            {question.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {isMobile ? (
            <motion.div
              key="help-sheet"
              className="fixed inset-x-0 bottom-0 z-[97] flex justify-center"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={overlayTransition}
            >
              <div className="absolute inset-0 -z-10 bg-slate-900/50" onClick={handleOverlayClick} />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="help-center-title"
                className="relative flex h-[min(100vh,600px)] w-full max-w-md flex-col rounded-t-3xl bg-white p-5 shadow-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={overlayTransition}
                onClick={event => event.stopPropagation()}
                id={modalId}
              >
                {card}
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="help-modal"
              className="fixed inset-0 z-[97] grid place-items-center bg-slate-900/45 px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={overlayTransition}
              onClick={handleOverlayClick}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="help-center-title"
                className="w-[min(760px,95vw)] max-h-[80vh] overflow-hidden rounded-2xl bg-white p-6 shadow-2xl"
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={overlayTransition}
                onClick={event => event.stopPropagation()}
                id={modalId}
              >
                <div className="max-h-[calc(80vh-2rem)] overflow-y-auto pr-1">{card}</div>
              </motion.div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
};

export default HelpCenter;
