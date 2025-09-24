const path = require('path');
const fs = require('fs-extra');
const cheerio = require('cheerio');

const OUT_DIR = path.resolve(__dirname, '../output');

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) {
      yield full;
    }
  }
}

function shouldRemoveExternalScriptSrc(src) {
  if (!src) return false;
  // Keep our GPS init and Leaflet
  if (src.includes('/assets/gps/map-init.js')) return false;
  if (/unpkg\.com\/leaflet@/i.test(src)) return false;
  // Remove any blob URLs
  if (/^blob:/i.test(src)) return true;
  // Remove Wix/Thunderbolt/AMD/Sentry/Firebase/Chat runtimes
  if (/static\.parastorage\.com/i.test(src)) return true; // any parastorage scripts
  if (/wixstatic\.com\/.*\.js(\?|$)/i.test(src)) return true;
  if (/parastorage\.com\/unpkg\/react/i.test(src)) return true;
  if (/parastorage\.com\/unpkg\/react-dom/i.test(src)) return true;
  if (/requirejs/i.test(src)) return true;
  if (/sentry-next\.wixpress\.com/i.test(src)) return true;
  if (/viewer-apps\.parastorage\.com/i.test(src)) return true;
  if (/wixapps\.net/i.test(src)) return true;
  if (/firebase/i.test(src)) return true;
  // Remove any other external scripts except allowed Leaflet
  if (/^https?:\/\//i.test(src)) return true;
  return false;
}

function isNoisyInline(code) {
  if (!code) return false;
  const c = code;
  return (
    /thunderbolt/i.test(c) ||
    /tb\.init/i.test(c) ||
    /requirejs/i.test(c) ||
    /define\(/.test(c) ||
    /Sentry\./.test(c) ||
    /firebase/i.test(c) ||
    /wix-?chat/i.test(c) ||
    /viewerModel/.test(c) ||
    /rb_wixui|wixui|wix-embeds/i.test(c) ||
    /document\.getElementById\(['"]wix-essential-viewer-model['"]\)/.test(c) ||
    /clientSideRender\s*=/.test(c)
  );
}

async function sanitizeFile(file) {
  const original = await fs.readFile(file, 'utf-8');
  const $ = cheerio.load(original, { decodeEntities: false });

  // Remove link preloads/modulepreloads
  $('link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"], link[rel="preconnect"], link[rel="dns-prefetch"]').remove();

  // Remove blob links
  $('link[href^="blob:"]').remove();

  // Remove noisy external scripts
  $('script[src]').each((_i, el) => {
    const src = $(el).attr('src') || '';
    if (shouldRemoveExternalScriptSrc(src)) $(el).remove();
  });

  // Remove JSON/script tags carrying Wix viewer model or site data
  $('script[id*="viewer-model"], script[id*="SITE_DATA"], script[id*="wix-essential-viewer-model"]').remove();

  // Remove scripts with data-url pointing to wix/thunderbolt
  $('script[data-url]').each((_i, el) => {
    const du = ($(el).attr('data-url') || '').toLowerCase();
    if (du.includes('wix-thunderbolt') || du.includes('wixui') || du.includes('parastorage')) {
      $(el).remove();
    }
  });

  // Remove noisy inline scripts
  $('script:not([src])').each((_i, el) => {
    const code = $(el).html() || '';
    if (isNoisyInline(code)) $(el).remove();
  });

  // Aggressive: remove any remaining inline scripts (keep DOM static)
  $('script:not([src])').remove();

  // Remove iframes from problematic hosts (spotwalla, wixapps, wix)
  $('iframe[src*="spotwalla"], iframe[src*="wixapps.net"], iframe[src*="wix.com"], iframe[src*="wixstatic.com"]').each((_i, el) => {
    const parent = $(el).parent();
    $(el).remove();
    if (parent && parent.children().length === 0) parent.remove();
  });

  // Remove Wix Chat iframes
  $('iframe[title="Wix Chat"], iframe[src*="engage.wixapps.net"], iframe[src*="wixapps.net"]').each((_i, el) => {
    const parent = $(el).parent();
    $(el).remove();
    if (parent && parent.children().length === 0) parent.remove();
  });

  // Tidy allow attributes: remove 'vr'
  $('[allow]').each((_i, el) => {
    const allow = ($(el).attr('allow') || '').split(';').map(s => s.trim()).filter(Boolean);
    const cleaned = allow.filter(tok => tok.toLowerCase() !== 'vr');
    if (cleaned.length) $(el).attr('allow', cleaned.join('; ')); else $(el).removeAttr('allow');
  });
  // Remove stray allowvr attribute if present
  $('[allowvr]').removeAttr('allowvr');

  const out = $.html();
  if (out !== original) {
    await fs.writeFile(file, out, 'utf-8');
    return true;
  }
  return false;
}

async function main() {
  const exists = await fs.pathExists(OUT_DIR);
  if (!exists) {
    console.warn('output/ not found, nothing to sanitize');
    return;
  }
  let changed = 0;
  for await (const file of walk(OUT_DIR)) {
    const ok = await sanitizeFile(file);
    if (ok) changed += 1;
  }
  console.log(`Sanitize completed. Updated ${changed} file(s).`);
}

if (require.main === module) {
  main().catch((err) => { console.error('sanitize-output failed', err); process.exitCode = 1; });
}

module.exports = { sanitizeFile };
