import React, { useMemo } from "react";
import PlaySectionLayout, { type PlaySection } from "../../components/play/PlaySectionLayout";

const sectionCardClass = "play-shell-card rounded-2xl p-5";

const aboutSections = {
  whatItIs: {
    title: "An explainable AI game wrapped in a familiar pattern game",
    body: "RPS Predictor turns Rock Paper Scissors into a transparent machine learning demo. Learners can watch a simple predictor react, adapt, and expose its own confidence in real time instead of hiding the model behind a black box.",
  },
  whyWeBuiltIt: {
    title: "Built to make AI literacy fast, playful, and inspectable",
    body: "We wanted a practical way for K-12 learners to explore how sequence models find patterns, how confidence shifts, and why calibration and sharpness matter for trustworthy AI. The project treats AI as something you can test, question, and beat.",
  },
  howItWorks: [
    "Tracks your recent move sequence and frequencies.",
    "Predicts the next move with a lightweight online Markov and n-gram model.",
    "Displays Live AI Insight with prediction, confidence, reasons, and a quick timeline.",
  ],
  team: [
    "Developers: Adam Ali (project lead, AI logic and architecture) and John N. Weaver (front-end, test runs and UX)",
    "Institution: University of Texas at San Antonio (UTSA) - College of AI, Cyber and Computing",
    "Advisors/Instructors: Dr. Fred Martin, Dr. Ismaila Sanusi, Dr. Deepti Tagare",
  ],
  privacy: [
    "Round events, your move, AI probabilities, and outcomes are logged on this device.",
    "No external personal data is collected by the gameplay surface itself.",
    "You can export profile-linked round data from Statistics or Settings.",
  ],
};

export default function AboutPage() {
  const sections = useMemo<PlaySection[]>(
    () => [
      {
        id: "what-it-is",
        label: "What It Is",
        title: aboutSections.whatItIs.title,
        description: "The product overview, educational framing, and the public-facing identity of RPS Predictor.",
        content: (
          <div className="grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
            <article className={sectionCardClass}>
              <p className="text-sm leading-7 text-slate-300">{aboutSections.whatItIs.body}</p>
            </article>
            <article className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-5 text-cyan-50">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/75">Version</p>
              <div className="mt-3 text-4xl font-semibold tracking-[-0.05em]">v5.3</div>
              <p className="mt-3 text-sm leading-7 text-cyan-50/80">
                Launch build focused on accessible gameplay, explainable AI feedback, and routed tools for stats,
                settings, help, and leaderboard review.
              </p>
            </article>
          </div>
        ),
      },
      {
        id: "why-we-built-it",
        label: "Why We Built It",
        title: aboutSections.whyWeBuiltIt.title,
        description: "The educational goals behind the project and the AI literacy ideas it tries to make concrete.",
        content: (
          <div className="grid gap-4 lg:grid-cols-2">
            <article className={sectionCardClass}>
              <p className="text-sm leading-7 text-slate-300">{aboutSections.whyWeBuiltIt.body}</p>
            </article>
            <article className={sectionCardClass}>
              <h3 className="text-lg font-semibold text-white">Alignment</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Inspired by the AI4K12 Five Big Ideas, especially Learning, Representation and Reasoning, and
                Societal Impact through transparency and fairness.
              </p>
            </article>
          </div>
        ),
      },
      {
        id: "how-it-works",
        label: "How It Works",
        title: "What the predictor tracks and what the learner sees",
        description: "The product mechanics that turn a simple rules game into an explainable AI experience.",
        content: (
          <div className="grid gap-4 lg:grid-cols-[1fr,0.9fr]">
            <article className={sectionCardClass}>
              <ul className="space-y-3 text-sm leading-7 text-slate-300">
                {aboutSections.howItWorks.map(item => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            <article className={sectionCardClass}>
              <h3 className="text-lg font-semibold text-white">Built with</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                React, TypeScript, Vite, and Framer Motion with accessibility-first design.
              </p>
            </article>
          </div>
        ),
      },
      {
        id: "team-credits",
        label: "Team / Credits",
        title: "The people and institution behind the project",
        description: "Project ownership, advising support, and the academic home for the work.",
        content: (
          <div className="grid gap-3">
            {aboutSections.team.map(item => (
              <article key={item} className={sectionCardClass}>
                <p className="text-sm leading-7 text-slate-300">{item}</p>
              </article>
            ))}
          </div>
        ),
      },
      {
        id: "privacy-data",
        label: "Privacy & Data",
        title: "What is stored, what is not, and how exports fit in",
        description: "A simple summary of the local data model used by the game and routed tools.",
        content: (
          <div className="grid gap-3">
            {aboutSections.privacy.map(item => (
              <article key={item} className={sectionCardClass}>
                <p className="text-sm leading-7 text-slate-300">{item}</p>
              </article>
            ))}
          </div>
        ),
      },
      {
        id: "links",
        label: "Links",
        title: "Source and feedback channels",
        description: "Repository links for code, issues, and ongoing project feedback.",
        content: (
          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href="https://github.com/BoDa7s/rps_predictor"
              target="_blank"
              rel="noreferrer"
              className={`${sectionCardClass} transition hover:border-cyan-300/40 hover:bg-white/[0.06]`}
            >
              <div className="text-lg font-semibold text-white">GitHub repository</div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Source code, build configuration, routed play shell, and gameplay implementation.
              </p>
            </a>
            <a
              href="https://github.com/BoDa7s/rps_predictor/issues"
              target="_blank"
              rel="noreferrer"
              className={`${sectionCardClass} transition hover:border-cyan-300/40 hover:bg-white/[0.06]`}
            >
              <div className="text-lg font-semibold text-white">Issue tracker and feedback</div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Report bugs, suggest improvements, or send product and classroom feedback.
              </p>
            </a>
          </div>
        ),
      },
    ],
    [],
  );

  return <PlaySectionLayout sections={sections} navLabel="About Sections" />;
}
