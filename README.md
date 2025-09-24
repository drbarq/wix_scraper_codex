# Wix Archiver

Static archiver for `qr646.com` (Wix). Crawls the site, captures rendered HTML for desktop and mobile, downloads assets, merges into a single responsive page per URL, and prepares a static package for Vercel.

## Requirements

- Node.js 18+
- npm

## Install

```
npm install
```

## Commands

- `npm run discover` — Crawl and build `data/sitemap.json`.
- `npm run capture` — Use Playwright to save desktop and mobile HTML to `temp/pages/` and collect assets.
- `npm run assets` — Download assets to `output/assets/` and write `data/assets.local.json` mapping.
- `npm run process` — Merge desktop/mobile, rewrite asset URLs, strip tracking, write final HTML to `output/`.
- `npm run preview` — Serve `output/` locally on `http://localhost:3000`.
- `npm run deploy` — Generate `output/vercel.json`.
- `npm run archive` — Run discover → capture → assets → process.
- `npm run gps` — Build GPS GeoJSON and inject a Leaflet map on `/current-location/`.
- `npm run sanitize` — Post-process `output/` HTML to remove leftover Wix/analytics boot scripts, preloads, and noisy iframes.
- `npm run export` — Copy `output/` into `./qr646` (use `node src/export.js --dest <path>` to choose a different folder).

## Config

Edit `config/settings.json` to change site URL, viewports, concurrency, and behavior flags (e.g., `singleResponsive`, `removeTracking`, `downloadHighRes`).
  - `parallel`: concurrency for crawling and asset downloads.
  - `captureParallel`: concurrency for page capture (default 2). Increase gradually if stable.
  - `gps.markerEvery`: sample interval for markers.
  - `gps.markerLabels`: label behavior — `click` (default), `hover`, or `always`.

## Notes

- First pass focuses on full-site coverage and a single responsive output. Forms and interactive widgets can be handled after content parity is validated.
- Some Wix image URLs include transformation segments. The downloader attempts to fetch original-quality images by removing `/v1/...` transforms.
- The sanitizer removes Wix Thunderbolt runtime, telemetry, and widget iframes from built HTML. Leaflet and the GPS init script are preserved.

## GPS Map

- Sources: drop GPX (`.gpx`), KML (`.kml`), or GeoJSON into `gps/` then run `npm run gps`.
- GPX points provide timestamps used in marker popups. KML LineString tracks without timestamps are included as lines only (no timestamp-less markers).
- Popups show a friendly local time; labels are click-only by default (`gps.markerLabels: "click"`).

## Export and Run Elsewhere

- Export the static site: `npm run export` (copies `output/` → `./qr646`).
- Quick local servers from the exported folder (root-relative paths assumed):
  - Python: `python3 -m http.server 3000`
  - Node: `npx serve -l 3000 .` or `npx http-server -p 3000 .`

## Deploy (Vercel)

- Ensure `vercel.json` exists in the exported folder (use `npm run deploy` before export if needed).
- From the exported folder: `npx vercel --prod`.
- `vercel.json` sets long cache for `/assets/**` and `trailingSlash: true` for clean directory routes.
