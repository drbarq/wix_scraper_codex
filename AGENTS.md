# Repository Guidelines

## Project Structure & Module Organization
- `src/`: main code
  - `crawler.js` (discover URLs), `scraper.js` (Playwright capture),
    `assetDownloader.js` (assets), `rewriter.js` (HTML rewrite),
    `responsiveHandler.js` (mobile/desktop merge), `gps.js` (map build),
    `server.js` (preview), `deploy.js` (vercel config).
- `config/settings.json`: project config (URLs, concurrency, GPS).
- `data/`, `temp/`, `output/`: discovery, raw pages, final site (all git‑ignored).
- `gps/`: input tracks (`.gpx`, `.kml`, `.geojson`).
- `.codex/memory.json`: project memory for agents.

## Build, Test, and Development Commands
- Install: `npm install` (then `npx playwright install chromium`).
- Discover: `npm run discover` → writes `data/sitemap.json`.
- Capture: `npm run capture` → saves desktop/mobile HTML to `temp/pages`.
- Assets: `npm run assets` → downloads to `output/assets`.
- Process: `npm run process` → rewrites HTML into `output/`.
- GPS: `npm run gps` → builds `/current-location/` map.
- Preview: `npm run preview` → http://localhost:3000.
- Full pipeline: `npm run archive` (discover→capture→assets→process→gps).
- Sanitize: `npm run sanitize` → strips Wix runtime/telemetry scripts and preloads from built HTML.
- Export: `npm run export` → copies `output/` to `./qr646` for deployment elsewhere.

## Coding Style & Naming Conventions
- Node.js (v18+), CommonJS modules, 2‑space indent, semicolons.
- Prefer small, single‑purpose modules under `src/`.
- File/dir names: kebab‑case; functions: camelCase.
- No linter configured; match existing style. Keep patches minimal and focused.

## Testing Guidelines
- No test framework configured yet. If adding tests, colocate under `__tests__/` and mirror `src/` paths.
- Prefer fast, deterministic unit tests around pure utilities (`src/utils/*`).

## Commit & Pull Request Guidelines
- Commits: imperative, scoped messages (e.g., `crawler: recurse nested sitemaps`).
- PRs must include: concise summary, why, how verified (commands/logs), and any config changes.
- Include screenshots or terminal snippets for user‑visible changes (e.g., map on `/current-location/`).

## Security & Configuration Tips
- Do not commit secrets. `output/`, `temp/`, and `data/*.json` are git‑ignored by default.
- Tune behavior via `config/settings.json` (e.g., `parallel`, `captureParallel`, `gps.markerEvery`).
- When adding networked features, keep all assets local for static hosting.
- Sanitizer removes third-party runtime and telemetry by default from `output/`. Preserve only what’s required (Leaflet, GPS init).
