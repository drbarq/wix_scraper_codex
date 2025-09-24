const path = require('path');
const fs = require('fs-extra');
const pLimit = require('p-limit');
const logger = require('./utils/logger');

const settings = require(path.resolve(__dirname, '../config/settings.json'));
const DATA_DIR = path.resolve(__dirname, '../data');
const OUTPUT_ASSETS = path.resolve(__dirname, '../output/assets');
const ASSET_MANIFEST = path.join(DATA_DIR, 'assets.json');
const LOCAL_MANIFEST = path.join(DATA_DIR, 'assets.local.json');

function normalizeWixImage(u) {
  try {
    const url = new URL(u);
    if (url.hostname.includes('wixstatic.com') && url.pathname.includes('/media/')) {
      // Strip any transformation segment like /v1/...
      const idx = url.pathname.indexOf('/v1/');
      if (idx !== -1) {
        url.pathname = url.pathname.slice(0, idx);
        url.search = '';
        return url.toString();
      }
    }
  } catch {}
  return u;
}

function guessFolder(url) {
  const lower = url.toLowerCase();
  if (/[.](png|jpe?g|gif|webp|svg|avif)($|[?])/i.test(lower)) return 'images';
  if (/[.](woff2?|ttf|otf|eot)($|[?])/i.test(lower)) return 'fonts';
  if (/[.](css)($|[?])/i.test(lower)) return 'css';
  if (/[.](js)($|[?])/i.test(lower)) return 'js';
  return 'misc';
}

function fileNameFromUrl(u) {
  try {
    const url = new URL(u);
    const base = path.basename(url.pathname) || 'file';
    if (base.includes('.')) return base;
    const ext = guessFolder(u) === 'css' ? '.css' : '';
    return base + ext;
  } catch {
    return 'file';
  }
}

async function downloadTo(url, outPath) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), settings.timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fs.ensureDir(path.dirname(outPath));
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(outPath, buf);
  } finally {
    clearTimeout(t);
  }
}

async function downloadAll() {
  if (!(await fs.pathExists(ASSET_MANIFEST))) {
    logger.warn('No assets.json found. Run capture first.');
    return;
  }
  const manifest = await fs.readJson(ASSET_MANIFEST);
  const urls = manifest.assets || [];
  const limit = pLimit(settings.parallel || 3);
  const mapping = {};

  let i = 0;
  await Promise.all(
    urls.map((orig) =>
      limit(async () => {
        i += 1;
        const url = settings.downloadHighRes ? normalizeWixImage(orig) : orig;
        const folder = guessFolder(url);
        const name = fileNameFromUrl(url);
        const outPath = path.join(OUTPUT_ASSETS, folder, name);
        try {
          await downloadTo(url, outPath);
          mapping[orig] = path.relative(path.resolve(__dirname, '../output'), outPath).replace(/\\/g, '/');
          if (i % 25 === 0) logger.info(`Downloaded ${i}/${urls.length} assets...`);
        } catch (e) {
          logger.warn('Failed asset', url, e.message);
        }
      })
    )
  );

  await fs.writeJson(LOCAL_MANIFEST, mapping, { spaces: 2 });
  logger.success(`Assets downloaded. Mapping saved to ${LOCAL_MANIFEST}`);
}

if (require.main === module) {
  downloadAll().catch((err) => {
    logger.error('Asset downloader failed', err);
    process.exitCode = 1;
  });
}

module.exports = { downloadAll };

