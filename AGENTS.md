# RPS Predictor Agent Guide

## 1. Title & Purpose
Single-player Rock-Paper-Scissors predictor built with React, TypeScript, and Vite; this guide orients contributors and CI agents.

## 2. Prerequisites
- **Node.js 20 LTS & npm**
  ```bash
  node -v
  npm -v
  ```
- **Git** for source control.
- **Docker Desktop** (optional, recommended for production parity).
- **OS shells**: Windows (PowerShell), macOS (zsh), Linux (bash).

## 3. Clone & Project Layout
```bash
git clone https://github.com/<org>/rps_predictor.git
cd rps_predictor
```
Key folders: `src/` (React app), `public/` (static assets folder—create if missing), `Dockerfile` (multi-stage build), `vite.config.ts` (Vite config), `package.json` (scripts/deps).

## 4. Environment Variables
Copy `.env.example` to `.env` if present. Currently, no required environment variables.

## 5. Install Dependencies
Prefer reproducible install:
```bash
npm ci
```
Fallback when `package-lock.json` is absent:
```bash
npm install
```

## 6. Run (Development)
Start the Vite dev server with hot reload:
```bash
npm run dev
```
Default URL: http://localhost:5173. Change the port via `npm run dev -- --port <port>` or update `vite.config.ts`.

## 7. Type Checking & Linting
TypeScript check (add `typecheck` script if missing):
```bash
npm run typecheck
# fallback: npx tsc --noEmit
```
Lint and auto-fix (configure ESLint scripts before use):
```bash
npm run lint
npm run lint:fix
# fallback: npx eslint "src/**/*.{ts,tsx}" --fix
```

## 8. Build (Production)
Run the production build only after implementing new code changes. Clean & build optimized assets: 
```bash
npm run build
```
Output: `dist/`. Preview locally:
```bash
npm run preview
```

## 9. Run (Production, Docker)
Build the Nginx-served image and run the container:
```bash
docker build -t rps-predictor .
docker run --rm -p 5173:80 rps-predictor
```
Port `5173` maps to container port `80`; change the host port via `-p <host>:80`.

## 10. NPM Scripts Reference
| Script | Description |
| --- | --- |
| `dev` | Start Vite dev server with hot reload. |
| `build` | Type-check via `tsc -b` and build production bundle. |
| `preview` | Serve built assets from `dist/` for local preview. |
| `typecheck` | *Not defined by default; add if needed (`tsc --noEmit`).* |
| `lint` | *Not defined by default; configure ESLint if desired.* |
| `lint:fix` | *Not defined by default; configure ESLint auto-fix.* |
| `test` | *Not defined; add testing framework as needed.* |

## 11. Tests (if applicable)
No automated test suites are defined. Place unit tests under `src/` (e.g., `src/__tests__/`) or integration tests under `tests/` and add matching npm scripts.

## 12. CI Tips (Agents)
- Non-interactive dependency install:
  ```bash
  npm ci --no-audit --no-fund
  ```
- Cache `node_modules/` and `~/.npm` keyed by `package-lock.json` hash.
- Docker CI: use a multi-stage build (`node:20-alpine` → `nginx:1.27-alpine`), copying `dist/` into `/usr/share/nginx/html`.

## 13. Troubleshooting
- **Port already in use**: run `npm run dev -- --port 5174` or free the port.
- **TypeScript errors**: run `npm run typecheck` (or `npx tsc --noEmit`).
- **Clean install**:
  ```bash
  rm -rf node_modules package-lock.json
  npm ci
  ```
- **Docker build fails at `npm run build`**: run the build locally to view TypeScript/Vite errors.

## 14. Security & Privacy
No secrets stored in the repo. Use `.env.local` for overrides. Never commit `.env*` files.

## 15. License & Maintainers
License: not specified; confirm with repository owners. Maintainers: contact the RPS Predictor project team via repository issues.
