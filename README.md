## [Releases History](../../releases)

Explore previous versions, changelogs, and downloadable artifacts on the project's Releases page.
# rps_predictor
Interactive Rock-Paper-Scissors predictor built with React, Framer Motion, and a collection of ensemble AI forecasters.

## Local development

1. Install dependencies: `npm install`
2. Start the Vite dev server: `npm run dev`
3. Open the URL that Vite prints (defaults to http://localhost:5173).

## Production build

- Generate an optimized build with `npm run build`. The compiled assets land in `dist/`.
- Preview the production bundle locally with `npm run preview` (served on http://localhost:4173).

## Developer console & instrumentation

- Unlock the in-game Developer Control Room to inspect live data.
- A dedicated **Instrumentation** tab surfaces response-time, engagement, click-activity, and click-speed cards alongside a rolling rounds table and heatmap.
- Snapshot capture happens automatically on match end, every few rounds, and every few minutes; manual capture is available from the tab.
- Use the Live Snapshots panel for the most recent entries and paginate/search the full history, with per-snapshot notes, pinning, comparison, and CSV/JSON export.

## Docker

1. Build the image: `docker build -t rps-predictor .`
2. Run the container: `docker run --rm -p 8080:80 rps-predictor`
3. Visit http://localhost:8080 to play the game.

The Docker image uses a multi-stage build (Node for compilation, Nginx for serving static files). Rebuild the image whenever you change application code.
