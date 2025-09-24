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

## Config

Edit `config/settings.json` to change site URL, viewports, concurrency, and behavior flags (e.g., `singleResponsive`, `removeTracking`, `downloadHighRes`).
  - `parallel`: concurrency for crawling and asset downloads.
  - `captureParallel`: concurrency for page capture (default 2). Increase gradually if stable.

## Notes

- First pass focuses on full-site coverage and a single responsive output. Forms and interactive widgets can be handled after content parity is validated.
- Some Wix image URLs include transformation segments. The downloader attempts to fetch original-quality images by removing `/v1/...` transforms.
