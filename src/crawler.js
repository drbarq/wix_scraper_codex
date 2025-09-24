const path = require('path');
const fs = require('fs-extra');
const cheerio = require('cheerio');
const pLimit = require('p-limit');
const logger = require('./utils/logger');
const { chromium } = require('playwright');
const { toAbsoluteUrl, normalizeUrl, isInternal } = require('./utils/urlParser');

const settings = require(path.resolve(__dirname, '../config/settings.json'));
const SITE = new URL(settings.siteUrl).origin;

const DATA_DIR = path.resolve(__dirname, '../data');
const SITEMAP_PATH = path.join(DATA_DIR, 'sitemap.json');

async function fetchText(url, timeout = settings.timeout) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function seedFromSitemapXml() {
  const seen = new Set();
  const urls = new Set();
  async function fetchSitemap(url) {
    if (seen.has(url)) return; seen.add(url);
    try {
      const xml = await fetchText(url);
      // If this is an index sitemap with <sitemap><loc> children, recurse
      const submaps = Array.from(xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/g)).map(m => m[1]);
      if (submaps.length) {
        for (const sm of submaps) {
          if (isInternal(sm, SITE)) await fetchSitemap(sm);
        }
      }
      // Collect URL locs
      const locs = Array.from(xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g)).map(m => m[1]);
      if (!locs.length) {
        // Fallback: collect any <loc> if <url> not used
        const anyLocs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map(m => m[1]);
        for (const loc of anyLocs) {
          if (isInternal(loc, SITE)) urls.add(normalizeUrl(loc));
        }
      } else {
        for (const loc of locs) {
          if (isInternal(loc, SITE)) urls.add(normalizeUrl(loc));
        }
      }
    } catch (e) {
      logger.warn('Failed to parse sitemap', url, e.message);
    }
  }
  try {
    const xmlUrl = new URL('/sitemap.xml', SITE).toString();
    await fetchSitemap(xmlUrl);
  } catch (e) {
    logger.warn('No sitemap.xml or failed to initiate. Continuing with crawl.');
  }
  // Try blog posts sitemap variants explicitly (Wix sometimes exposes these)
  try {
    const postsXml = new URL('/blog-posts-sitemap.xml', SITE).toString();
    await fetchSitemap(postsXml);
  } catch {}
  try {
    const htmlUrl = new URL('/blog-posts-sitemap.html', SITE).toString();
    const html = await fetchText(htmlUrl);
    const $ = cheerio.load(html);
    $('a[href*="/single-post/"]').each((_i, el) => {
      const abs = toAbsoluteUrl($(el).attr('href') || '', htmlUrl);
      if (abs && isInternal(abs, SITE)) urls.add(normalizeUrl(abs));
    });
  } catch {}
  return Array.from(urls);
}

async function discoverLinks(url, html) {
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    const abs = toAbsoluteUrl(href, url);
    if (!abs) return;
    if (!isInternal(abs, SITE)) return;
    links.add(normalizeUrl(abs));
  });
  return Array.from(links);
}

function discoverNumericPagination(url, html) {
  // Specifically handle /home/page/N style pagination
  try {
    const current = new URL(url);
    const $ = cheerio.load(html);
    let maxPage = 1;
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/home\/page\/(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n)) maxPage = Math.max(maxPage, n);
      }
    });
    // If config cap is set and we're on home, enforce exact range 2..cap
    const pathname = current.pathname.replace(/\/+$/, '') || '/';
    const isHome = pathname === '/' || pathname === '/home';
    let targetMax = maxPage;
    if (isHome && Number.isInteger(settings.homePaginationMax) && settings.homePaginationMax > 1) {
      targetMax = settings.homePaginationMax;
    }
    if (targetMax > 1) {
      const pages = [];
      for (let n = 2; n <= targetMax; n += 1) {
        const p = new URL(`/home/page/${n}`, current.origin).toString();
        pages.push(normalizeUrl(p));
      }
      return pages;
    }
  } catch {}
  return [];
}

async function crawl() {
  await fs.ensureDir(DATA_DIR);
  const visited = new Set();
  const queue = [];
  const edges = {}; // url -> discoveredFrom array

  // Seed
  const siteUrlNorm = normalizeUrl(settings.siteUrl);
  queue.push(siteUrlNorm);
  try {
    const u = new URL(settings.siteUrl);
    const rootHost = u.hostname.replace(/^www\./i, '');
    const variants = [
      `${u.protocol}//${rootHost}`,
      `${u.protocol}//www.${rootHost}`,
    ];
    for (const v of variants) {
      const vv = normalizeUrl(new URL(v, u).toString());
      if (!queue.includes(vv)) queue.push(vv);
    }
  } catch {}
  for (const seed of await seedFromSitemapXml()) queue.push(seed);

  const limit = pLimit(settings.parallel || 3);

  async function processUrl(url) {
    if (visited.has(url)) return;
    visited.add(url);
    try {
      logger.info('Fetching', url);
      const html = await fetchText(url);
      let links = await discoverLinks(url, html);
      // Add numeric pagination pages if present
      discoverNumericPagination(url, html).forEach((p) => links.push(p));

      // Dynamic discovery for homepage listings
      let { pathname } = new URL(url);
      pathname = pathname.replace(/\/+$/, '') || '/';
      const isListing = pathname === '/' || pathname === '/home' || /^\/home\/page\/\d+$/.test(pathname);
      if (isListing) {
        try {
          const browser = await chromium.launch();
          const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
          const page = await context.newPage();
          await page.goto(url, { waitUntil: 'networkidle', timeout: settings.timeout });
          // basic scroll to trigger lazy rendering
          await page.evaluate(async () => {
            await new Promise((resolve) => {
              let total = 0; const step = 400; const id = setInterval(() => {
                window.scrollBy(0, step); total += step;
                if (total >= document.body.scrollHeight - window.innerHeight - 50) { clearInterval(id); resolve(); }
              }, 150);
            });
          });
          await page.waitForTimeout(500);
          // Collect only blog post links and pagination links
          const hrefs = await page.$$eval('a[href]', (as) => as.map(a => a.getAttribute('href') || '').filter(Boolean).filter(h => h.includes('/single-post/') || /\/home\/page\//.test(h)));
          await context.close();
          await browser.close();
          for (const h of hrefs) {
            const abs = toAbsoluteUrl(h, url);
            if (abs && isInternal(abs, SITE)) links.push(normalizeUrl(abs));
          }
          logger.info(`Dynamic discovery added ${hrefs.length} blog/pagination hrefs from`, url);
        } catch (e) {
          logger.warn('Dynamic discovery failed for', url, e.message);
        }
      }
      for (const l of links) {
        if (!edges[l]) edges[l] = new Set();
        edges[l].add(url);
        if (!visited.has(l)) queue.push(l);
      }
    } catch (e) {
      logger.warn('Failed to fetch', url, e.message);
    }
  }

  while (queue.length) {
    const batch = queue.splice(0, settings.parallel || 3);
    await Promise.all(batch.map(u => limit(() => processUrl(u))));
  }

  // Prepare output
  const pages = Array.from(visited).sort();
  const rel = {};
  for (const [k, v] of Object.entries(edges)) {
    rel[k] = Array.from(v);
  }
  const out = {
    site: SITE,
    count: pages.length,
    pages,
    edges: rel,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeJson(SITEMAP_PATH, out, { spaces: 2 });
  logger.success(`Wrote sitemap with ${pages.length} pages to ${SITEMAP_PATH}`);
}

if (require.main === module) {
  crawl().catch(err => {
    logger.error('Crawler failed', err);
    process.exitCode = 1;
  });
}

module.exports = { crawl };
