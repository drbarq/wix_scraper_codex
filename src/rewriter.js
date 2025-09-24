const path = require('path');
const fs = require('fs-extra');
const cheerio = require('cheerio');
const logger = require('./utils/logger');
const { outputPathForUrl, isInternal, toAbsoluteUrl } = require('./utils/urlParser');
const { mergeDesktopMobile } = require('./responsiveHandler');

const settings = require(path.resolve(__dirname, '../config/settings.json'));
const DATA_DIR = path.resolve(__dirname, '../data');
const TEMP_DIR = path.resolve(__dirname, '../temp/pages');
const OUT_DIR = path.resolve(__dirname, '../output');
const SITEMAP_PATH = path.join(DATA_DIR, 'sitemap.json');
const LOCAL_ASSETS = path.join(DATA_DIR, 'assets.local.json');

async function loadList() {
  if (await fs.pathExists(SITEMAP_PATH)) return (await fs.readJson(SITEMAP_PATH)).pages;
  return [settings.siteUrl];
}

async function rewriteAssets(html, mapping) {
  // Replace known asset URLs with local paths
  for (const [remote, localPath] of Object.entries(mapping)) {
    const escaped = remote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    html = html.replace(re, '/' + localPath);
  }
  return html;
}

function removeTracking(html) {
  if (!settings.removeTracking) return html;
  const $ = cheerio.load(html, { decodeEntities: false });
  $('script[src], script').each((_i, el) => {
    const $el = $(el);
    const src = $el.attr('src') || '';
    const code = $el.html() || '';
    const isTracker = /google-analytics|googletagmanager|gtag|facebook\.net|clarity|hotjar|wix-analytics|segment|mixpanel/i.test(src + ' ' + code);
    if (isTracker) $el.remove();
  });
  return $.html();
}

function rewriteInternalLinks(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  $('a[href]').each((_i, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href) return;
    const abs = toAbsoluteUrl(href, settings.siteUrl);
    if (!abs) return;
    if (!isInternal(abs, new URL(settings.siteUrl).origin)) return;
    try {
      const u = new URL(abs);
      let newHref = u.pathname + (u.search || '') + (u.hash || '');
      // Prefer trailing slash for directory-style routes (static index.html)
      if (!newHref.endsWith('/') && !/\.\w{1,6}(?:$|[?#])/.test(newHref)) {
        newHref = newHref + '/';
      }
      $el.attr('href', newHref);
    } catch {}
  });
  // Optionally adjust canonical to local path
  $('link[rel="canonical"][href]').each((_i, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const abs = toAbsoluteUrl(href, settings.siteUrl);
    if (!abs) return;
    if (!isInternal(abs, new URL(settings.siteUrl).origin)) return;
    try {
      const u = new URL(abs);
      let newHref = u.pathname + (u.search || '');
      if (!newHref.endsWith('/') && !/\.\w{1,6}(?:$|[?#])/.test(newHref)) newHref += '/';
      $el.attr('href', newHref);
    } catch {}
  });
  return $.html();
}

async function processAll() {
  await fs.ensureDir(OUT_DIR);
  const pages = await loadList();
  const mapping = (await fs.pathExists(LOCAL_ASSETS)) ? await fs.readJson(LOCAL_ASSETS) : {};

  for (const url of pages) {
    const desktopPath = outputPathForUrl(TEMP_DIR, url, settings.siteUrl, '.desktop.html');
    const mobilePath = outputPathForUrl(TEMP_DIR, url, settings.siteUrl, '.mobile.html');
    const outPath = outputPathForUrl(OUT_DIR, url, settings.siteUrl, '.html');
    try {
      const desktopExists = await fs.pathExists(desktopPath);
      const mobileExists = await fs.pathExists(mobilePath);
      if (!desktopExists && !mobileExists) {
        logger.warn('No temp HTML found for', url);
        continue;
      }
      const desk = desktopExists ? await fs.readFile(desktopPath, 'utf-8') : '';
      const mob = mobileExists ? await fs.readFile(mobilePath, 'utf-8') : '';

      let html = desk;
      if (settings.singleResponsive && desk && mob) {
        html = mergeDesktopMobile(desk, mob);
      } else if (!desk && mob) {
        html = mob;
      }

      html = await rewriteAssets(html, mapping);
      html = removeTracking(html);
      html = rewriteInternalLinks(html);

      await fs.ensureDir(path.dirname(outPath));
      await fs.writeFile(outPath, html, 'utf-8');
      logger.success('Wrote', path.relative(process.cwd(), outPath));
    } catch (e) {
      logger.warn('Failed to process', url, e.message);
    }
  }
}

if (require.main === module) {
  processAll().catch((err) => {
    logger.error('Rewriter failed', err);
    process.exitCode = 1;
  });
}

module.exports = { processAll };
