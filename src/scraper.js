const path = require('path');
const fs = require('fs-extra');
const { chromium } = require('playwright');
const pLimit = require('p-limit');
const logger = require('./utils/logger');
const { outputPathForUrl } = require('./utils/urlParser');

const settings = require(path.resolve(__dirname, '../config/settings.json'));
const DATA_DIR = path.resolve(__dirname, '../data');
const TEMP_DIR = path.resolve(__dirname, '../temp/pages');
const SITEMAP_PATH = path.join(DATA_DIR, 'sitemap.json');
const ASSET_MANIFEST = path.join(DATA_DIR, 'assets.json');

async function loadSitemap() {
  if (await fs.pathExists(SITEMAP_PATH)) {
    return (await fs.readJson(SITEMAP_PATH)).pages;
  }
  return [settings.siteUrl];
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight - window.innerHeight - 50) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}

async function capturePage(browser, url, viewport, label, assets) {
  const context = await browser.newContext({ viewport, userAgent: label === 'mobile' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)' : undefined });
  const page = await context.newPage();

  page.on('response', async (response) => {
    try {
      const req = response.request();
      const url = req.url();
      const ct = response.headers()['content-type'] || '';
      if (/image|font|css/.test(ct) || ['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        assets.add(url);
      }
    } catch {}
  });

  logger.info(`Navigating [${label}]`, url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: settings.timeout });
  await autoScroll(page);
  // Wait a bit for lazy content
  await page.waitForTimeout(800);
  const html = await page.content();

  const filePath = outputPathForUrl(TEMP_DIR, url, settings.siteUrl, label === 'mobile' ? '.mobile.html' : '.desktop.html');
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, html, 'utf-8');
  logger.success(`Saved ${label} HTML: ${path.relative(process.cwd(), filePath)}`);

  await context.close();
}

async function scrapeAll() {
  await fs.ensureDir(TEMP_DIR);
  await fs.ensureDir(DATA_DIR);
  const pages = await loadSitemap();
  const browser = await chromium.launch();

  const allAssets = new Set();
  const limit = pLimit(settings.captureParallel || settings.parallel || 2);
  const tasks = pages.map((url) => limit(async () => {
    const pageAssets = new Set();
    try {
      await capturePage(browser, url, settings.viewports.desktop, 'desktop', pageAssets);
      await capturePage(browser, url, settings.viewports.mobile, 'mobile', pageAssets);
    } catch (e) {
      logger.warn('Failed to capture', url, e.message);
    }
    pageAssets.forEach((a) => allAssets.add(a));
  }));

  await Promise.all(tasks);

  await browser.close();

  const manifest = {
    site: settings.siteUrl,
    count: allAssets.size,
    assets: Array.from(allAssets),
    generatedAt: new Date().toISOString(),
  };
  await fs.writeJson(ASSET_MANIFEST, manifest, { spaces: 2 });
  logger.success(`Wrote asset manifest with ${manifest.count} assets to ${ASSET_MANIFEST}`);
}

if (require.main === module) {
  scrapeAll().catch((err) => {
    logger.error('Scraper failed', err);
    process.exitCode = 1;
  });
}

module.exports = { scrapeAll };
