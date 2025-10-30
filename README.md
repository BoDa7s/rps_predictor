## [Releases History](../../releases)

Explore previous versions, changelogs, and downloadable artifacts on the project's Releases page.
# RPS AI Predictor

The RPS AI Predirtor is an interactive Rock–Paper–Scissors web game powered by AI machine learning that challenges players to outsmart an adaptive AI opponent. Instead of picking moves at random, the AI analyzes your play patterns using simple machine-learning logic (like Markov prediction and frequency analysis) to predict your next move.

Players can experiment with different strategies, view live prediction confidence, and see how the AI “learns” over time — making it both fun and educational.

**Built with React + TypeScript, the project focuses on:**

* Transparent AI behavior (“glass-box” learning)

* Real-time stats and visual feedback

* Player profiles and downloadable gameplay data

# Website
**You can try the RPS AI Predictor [here.](https://rps-predictor.pages.dev/)**

> This is the latest deployed version of the game


# Project Background
This project was developed as part of the University of Texas at San Antonio (UTSA) College of AI, Cyber, and Computing, under the guidance of **Dr. Fred Martin**.

## Contributors 

* [Adam Ali](https://github.com/BoDa7s) – Lead Developer, AI logic & architecture

* [John Weaver](https://github.com/John-N-Weaver) – Partner & Contributor: background transitions, launchers, and interface refinements.

# Data & Privacy

RPS Predictor is an educational game that shows how simple AIs learn patterns from Rock–Paper–Scissors. We keep the experience transparent, safe, and in the student’s control.

## Storage modes

* This device only (no cloud): All data stays in the browser (localStorage/IndexedDB). Nothing is sent to our servers. Clear browser data to erase everything.

* Cloud account: If a player signs up or logs in, their profile, gameplay, and AI learning state can sync across devices in real time. Players can still export/delete their own data.

## What we collect (and why)

| Category          | Examples                                                                 | Why we collect it                                                         | Where it's stored                                      |
|-------------------|--------------------------------------------------------------------------|----------------------------------------------------------------------------|--------------------------------------------------------|
| **Gameplay**       | Player move, AI prediction, outcome, confidence, round time             | Teach how prediction works; show stats & patterns                          | Browser only (local mode) • Supabase (cloud mode)      |
| **Profile (optional)** | First name/nickname, grade, age range, prior experience                 | Personalize UI; support class/group analysis                               | Browser only • Supabase (cloud)                        |
| **AI State**       | N-gram/Markov counts, last moves, simple model settings                 | Make the AI adaptive and explainable                                       | Browser only • Supabase (cloud)                        |
| **Exports (optional)** | CSV with rounds, timestamps, confidence, (optional) profile fields       | Student/researcher analysis; class activities                              | Downloaded file on the user’s device                   |

> We **never** collect IP addresses, device identifiers, or third-party analytics.  
> **No ads. No tracking pixels.**

## Consent & use

* The game is designed for transparency, autonomy, and confidentiality in K–12 contexts.

* Players can run local-only if preferred; And may optionally sign in to enable sync.

* Player can export a CSV of results for reflection, math activities, or science-fair style analysis.

## Compliance notes (plain language)

* Built to align with FERPA expectations for student data minimization, UTSA data-governance principles, and the ACM Code of Ethics spirit for responsible computing.

* By default, the app collects only what’s needed to make the AI work and to show learning outcomes.

## Delete / reset

* Local-only: Clear site data or use the in-app “Reset data” to remove everything.

* Cloud: Use “Delete account & data” to remove cloud records (profiles, rounds, AI state, stats, device shadows).
> **Note:** Some **gameplay** data **will be retained for a short period of time** to improve analysis and reliability, and **then it is discarded**. We do **not** keep it longer than needed.

## Research & sharing

* Nothing is shared automatically. If a CSV is downloaded, the file is under the user control.


# Local Installation Guides

## Docker (Recommended)

1. Build the image: `docker build -t rps-predictor .`
2. Run the container: `docker run --rm -p 8080:80 rps-predictor`
3. Visit http://localhost:8080 to play the game.

The Docker image uses a multi-stage build (Node for compilation, Nginx for serving static files). Rebuild the image whenever you change application code.

## Local development

1. Install dependencies: `npm install`
2. Start the Vite dev server: `npm run dev`
3. Open the URL that Vite prints (defaults to http://localhost:5173).

## Windows batch launcher

For a one-click experience on Windows, use the provided `launch_RPS_Predictor.bat` script (stored alongside `package.json`). The
launcher automatically:

- Switches to the project directory where the batch file lives so it stays portable if you move the folder.
- Verifies that Node.js and npm are available, stopping with helpful guidance if either is missing.
- Installs dependencies on demand by running `npm install` whenever `node_modules/` is absent.
- Starts the development server in a new Command Prompt window (`npm run dev`).
- Opens your default browser to http://localhost:5173 after giving the server a moment to boot.

Just double-click the batch file to start the predictor; close the new Command Prompt window to stop the dev server when you are
done.
