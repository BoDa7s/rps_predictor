import React, { useMemo, useState } from "react";
import PlaySectionLayout, { type PlaySection } from "../../components/play/PlaySectionLayout";
import { AI_FAQ_QUESTIONS, type HelpQuestion } from "../../playFaq";

type HelpSectionDefinition = {
  id: string;
  label: string;
  title: string;
  description: string;
  questionIds: string[];
};

const helpSections: HelpSectionDefinition[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    title: "Learn the basic flow before you queue a match",
    description: "Core controls, mode selection, and the quickest path into the gameplay workspace.",
    questionIds: [
      "gameplay-how-to-play",
      "gameplay-best-of",
      "gameplay-tie",
      "hud-settings",
      "hud-stats",
    ],
  },
  {
    id: "training-phase",
    label: "Training Phase",
    title: "Understand what training changes and when it finishes",
    description: "Warm-up rounds teach the model your current habits before tougher challenge sessions begin.",
    questionIds: [
      "gameplay-training-complete",
      "hud-player-switch",
      "stats-demographics",
    ],
  },
  {
    id: "challenge-mode",
    label: "Challenge Mode",
    title: "Know what changes when the AI starts fighting back",
    description: "Challenge mode is the competitive surface where the leaderboard and stronger counterplay matter.",
    questionIds: [
      "gameplay-practice-vs-challenge",
      "hud-difficulty",
      "hud-leaderboard",
      "ai-basics-beat",
      "ai-basics-pattern",
    ],
  },
  {
    id: "ai-insight",
    label: "AI Insight",
    title: "Interpret confidence, counters, and the live reasoning panel",
    description: "These answers explain what the AI is seeing and how to use that feedback to change your play.",
    questionIds: [
      "hud-live-insight-open",
      "hud-insight-close",
      "hud-shift-left",
      "insight-confidence",
      "insight-probability-bars",
      "insight-best-counter",
      "insight-reason-chips",
      "insight-time-to-adapt",
      "insight-tiny-timeline",
      "ai-basics-predict",
      "ai-basics-mind-reading",
      "ai-basics-change",
      "ai-basics-33",
    ],
  },
  {
    id: "profiles-data",
    label: "Profiles & Data",
    title: "Manage players, exports, and local saved histories",
    description: "Player switching, statistics profiles, exports, privacy expectations, and how stored data is scoped.",
    questionIds: [
      "hud-export",
      "privacy-data-stored",
      "privacy-export",
      "privacy-access",
      "glossary-confidence",
      "glossary-calibration",
      "glossary-brier",
      "glossary-sharpness",
      "glossary-markov",
      "glossary-coverage",
    ],
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    title: "Resolve common interaction and accessibility issues",
    description: "Quick fixes for overlays, empty stats, downloads, and motion or accessibility preferences.",
    questionIds: [
      "accessibility-keyboard",
      "accessibility-motion",
      "accessibility-color",
      "troubleshooting-insight",
      "troubleshooting-buttons",
      "troubleshooting-stats",
      "troubleshooting-csv",
    ],
  },
];

function questionsById() {
  const map = new Map<string, HelpQuestion>();
  AI_FAQ_QUESTIONS.forEach(question => {
    map.set(question.id, question);
  });
  return map;
}

function renderQuestionCards(
  questions: HelpQuestion[],
  activeQuestionId: string | null,
  setActiveQuestionId: React.Dispatch<React.SetStateAction<string | null>>,
) {
  return (
    <div className="grid gap-3">
      {questions.map(question => {
        const [, ...rest] = question.question.split(" - ");
        const label = rest.join(" - ").trim() || question.question;
        const isActive = activeQuestionId === question.id;

        return (
          <article
            key={question.id}
            className={`rounded-2xl border transition ${
              isActive
                ? "border-cyan-300/35 bg-cyan-400/10"
                : "border-white/10 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveQuestionId(current => (current === question.id ? null : question.id))}
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
            >
              <span className={`text-sm font-semibold ${isActive ? "text-cyan-100" : "text-white"}`}>{label}</span>
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-lg ${
                  isActive
                    ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-100"
                    : "border-white/10 bg-white/[0.05] text-slate-300"
                }`}
                aria-hidden
              >
                {isActive ? "-" : "+"}
              </span>
            </button>
            {isActive && <div className="border-t border-white/10 px-4 py-4 text-sm leading-7 text-slate-300">{question.answer}</div>}
          </article>
        );
      })}
    </div>
  );
}

export default function HelpPage() {
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(AI_FAQ_QUESTIONS[0]?.id ?? null);
  const faqById = useMemo(() => questionsById(), []);

  const sections = useMemo<PlaySection[]>(
    () =>
      helpSections.map(section => ({
        id: section.id,
        label: section.label,
        title: section.title,
        description: section.description,
        content: renderQuestionCards(
          section.questionIds
            .map(questionId => faqById.get(questionId))
            .filter((question): question is HelpQuestion => question != null),
          activeQuestionId,
          setActiveQuestionId,
        ),
      })),
    [activeQuestionId, faqById],
  );

  return <PlaySectionLayout sections={sections} navLabel="Help Topics" />;
}
