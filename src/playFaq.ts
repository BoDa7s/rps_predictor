export type HelpQuestion = {
  id: string;
  question: string;
  answer: string;
};

export const AI_FAQ_QUESTIONS: HelpQuestion[] = [
  {
    id: "gameplay-how-to-play",
    question: "Gameplay - How do I play?",
    answer: "Pick Rock, Paper, or Scissors. Rock beats Scissors, Scissors beats Paper, and Paper beats Rock.",
  },
  {
    id: "gameplay-best-of",
    question: 'Gameplay - What does "Best of 5/7" mean?',
    answer:
      "It is a race to a majority of wins. First to 3 wins takes a best-of-5 match; first to 4 wins takes a best-of-7 match.",
  },
  {
    id: "gameplay-tie",
    question: "Gameplay - What happens on a tie?",
    answer: "Neither side scores. Just play the next round.",
  },
  {
    id: "gameplay-practice-vs-challenge",
    question: "Gameplay - Practice vs. Challenge?",
    answer: "Practice slows the pace, adds hints, and shows what-if previews. Challenge is faster with fewer hints.",
  },
  {
    id: "gameplay-robot",
    question: "Gameplay - What does the robot do?",
    answer:
      "It reacts to your patterns and confidence level with animations and emotes. Reaction pop-up toasts stay off here.",
  },
  {
    id: "gameplay-training-complete",
    question: 'Gameplay - Why does it say "Training complete"?',
    answer:
      "You have played enough rounds for the AI to learn your basic patterns. It keeps adapting as you continue.",
  },
  {
    id: "hud-settings",
    question: "HUD & Navigation - Where is Settings?",
    answer: "Use the routed Play navigation at the top of the page to open Settings.",
  },
  {
    id: "hud-live-insight-open",
    question: "HUD & Navigation - How do I open Live AI Insight?",
    answer: "Click the Insight button on the match HUD or enable Show Live AI Insight inside the gameplay settings flow.",
  },
  {
    id: "hud-insight-close",
    question: "HUD & Navigation - How do I close the Insight panel?",
    answer: "Click Close, press Esc, tap outside on mobile, or toggle it off from Settings or HUD controls.",
  },
  {
    id: "hud-shift-left",
    question: "HUD & Navigation - Why did the HUD shift left?",
    answer: "When Insight is open the HUD slides over so the two panels never overlap.",
  },
  {
    id: "hud-stats",
    question: "HUD & Navigation - Where are my stats?",
    answer: "Open the Statistics route from the top play navigation to see summaries, recent rounds, and exports.",
  },
  {
    id: "hud-leaderboard",
    question: "HUD & Navigation - Where is the leaderboard?",
    answer:
      "Open the Leaderboard route from the top play navigation to see the best challenge scores saved on this device.",
  },
  {
    id: "hud-difficulty",
    question: "HUD & Navigation - Can I change difficulty?",
    answer:
      "Yes. Match-specific controls remain in the gameplay workspace and results flow so they stay tied to the live game engine.",
  },
  {
    id: "hud-player-switch",
    question: "HUD & Navigation - How do I switch or create a player?",
    answer:
      "Open Settings to switch the active player, edit demographics, create a new player, or make a fresh statistics profile.",
  },
  {
    id: "hud-export",
    question: "HUD & Navigation - How do I export data?",
    answer: "Use Export CSV from either the Statistics page or the Settings page.",
  },
  {
    id: "insight-confidence",
    question: "Live AI Insight - What is the Confidence gauge?",
    answer: "It shows how sure the AI feels about its next move, on a 0-100% scale.",
  },
  {
    id: "insight-probability-bars",
    question: "Live AI Insight - What are the three probability bars?",
    answer: "They display the AI's estimated chances for Rock, Paper, or Scissors on this round.",
  },
  {
    id: "insight-best-counter",
    question: 'Live AI Insight - What does "Best counter" mean?',
    answer:
      "It recommends the move that beats the AI's current prediction. In Practice you can preview how choices play out.",
  },
  {
    id: "insight-reason-chips",
    question: "Live AI Insight - What are Reason chips?",
    answer:
      "Short explanations such as Frequent Scissors or Recent streak. Select one to view a tiny visual like a streak or n-gram peek.",
  },
  {
    id: "insight-time-to-adapt",
    question: "Live AI Insight - What is Time-to-Adapt?",
    answer: "It tracks how quickly the AI settles after you change patterns.",
  },
  {
    id: "insight-tiny-timeline",
    question: "Live AI Insight - What is the Tiny Timeline?",
    answer: "It previews recent rounds. Hover or tap to see what the AI noticed at each moment.",
  },
  {
    id: "stats-calibration",
    question: "Statistics - What is Calibration (ECE)?",
    answer: "Expected Calibration Error measures how closely confidence matches actual accuracy. Lower is better.",
  },
  {
    id: "stats-brier",
    question: "Statistics - What is the Brier score?",
    answer: "It captures overall probability forecast quality. Smaller values mean better predictions.",
  },
  {
    id: "stats-sharpness",
    question: "Statistics - What is Sharpness?",
    answer: "Sharpness reports how peaked the AI's probabilities are, independent of correctness.",
  },
  {
    id: "stats-high-confidence",
    question: "Statistics - What is High-confidence coverage?",
    answer:
      "It is the share of rounds where confidence meets a chosen threshold, for example 70%, along with accuracy at that level.",
  },
  {
    id: "stats-demographics",
    question: "Statistics - Why do I not see demographics here?",
    answer: "Statistics focuses on performance. Personal information stays tied to your player profile, not the charts.",
  },
  {
    id: "ai-basics-predict",
    question: "AI Basics - How does the AI predict?",
    answer:
      "It studies your recent sequence of moves using a lightweight Markov or n-gram model plus simple frequency checks.",
  },
  {
    id: "ai-basics-mind-reading",
    question: "AI Basics - Is it reading my mind?",
    answer: "No. It only uses the history from your in-game rounds.",
  },
  {
    id: "ai-basics-change",
    question: "AI Basics - Why does the prediction change?",
    answer: "When you shift patterns the model updates its probabilities and confidence to match the new behavior.",
  },
  {
    id: "ai-basics-beat",
    question: "AI Basics - How can I beat the AI?",
    answer: "Mix up your play, avoid obvious repeats, and watch the Insight panel for hints about its expectations.",
  },
  {
    id: "ai-basics-pattern",
    question: "AI Basics - What counts as a pattern?",
    answer: "Any habit the model can catch, such as always picking Scissors after a tie.",
  },
  {
    id: "ai-basics-33",
    question: "AI Basics - Why is confidence sometimes about 33%?",
    answer: "That means the AI sees no strong signal yet, so it spreads probability evenly across moves.",
  },
  {
    id: "privacy-data-stored",
    question: "Privacy & Data - What data is stored?",
    answer: "Round logs for the current session: your moves, AI probabilities, and outcomes.",
  },
  {
    id: "privacy-export",
    question: "Privacy & Data - Can I download my data?",
    answer: "Yes. Use Export CSV from either Statistics or Settings.",
  },
  {
    id: "privacy-access",
    question: "Privacy & Data - Who can see my data?",
    answer: "Only you and the developers. It is used strictly for learning and analysis.",
  },
  {
    id: "accessibility-keyboard",
    question: "Accessibility - Keyboard & screen readers?",
    answer:
      "All controls are focusable. The Insight panel opens as a dialog with a focus trap, and Esc closes it. Icons include labels.",
  },
  {
    id: "accessibility-motion",
    question: "Accessibility - Motion sensitivity?",
    answer: "Turn on reduced motion to replace big animations with softer fades.",
  },
  {
    id: "accessibility-color",
    question: "Accessibility - Color-blind support?",
    answer: "We pair colors with icons and text so no information relies on color alone.",
  },
  {
    id: "troubleshooting-insight",
    question: "Troubleshooting - Insight panel covers the HUD.",
    answer: "Close and reopen Insight or resize the window. The HUD will automatically make space.",
  },
  {
    id: "troubleshooting-buttons",
    question: "Troubleshooting - Buttons do not respond.",
    answer: "Check whether a modal is open, press Esc to close it, and reload the page if needed.",
  },
  {
    id: "troubleshooting-stats",
    question: "Troubleshooting - Stats look empty.",
    answer: "Play a few more rounds. Many metrics appear only after enough data is collected.",
  },
  {
    id: "troubleshooting-csv",
    question: "Troubleshooting - CSV is blank.",
    answer: "Finish at least one round and make sure your browser can download files.",
  },
  {
    id: "glossary-confidence",
    question: "Quick Glossary - Confidence",
    answer: "How sure the AI feels about a prediction.",
  },
  {
    id: "glossary-calibration",
    question: "Quick Glossary - Calibration",
    answer: "The match between confidence and real accuracy.",
  },
  {
    id: "glossary-brier",
    question: "Quick Glossary - Brier score",
    answer: "A measure of forecast error. Lower numbers are better.",
  },
  {
    id: "glossary-sharpness",
    question: "Quick Glossary - Sharpness",
    answer: "How concentrated the probability spread is.",
  },
  {
    id: "glossary-markov",
    question: "Quick Glossary - Markov/n-gram",
    answer: "A model that predicts the next move based on the recent sequence of moves.",
  },
  {
    id: "glossary-coverage",
    question: "Quick Glossary - Coverage@tau",
    answer: "The percent of rounds where confidence clears a chosen threshold tau.",
  },
];
