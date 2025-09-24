const path = require('path');

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'igshid', 'ref', 'refsrc'
]);

function toAbsoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    // Lowercase host for consistency
    url.hostname = url.hostname.toLowerCase();
    // Remove known tracking params
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return u;
  }
}

function isInternal(u, siteOrigin) {
  try {
    const base = new URL(siteOrigin);
    const url = new URL(u, siteOrigin);
    const stripWww = (h) => h.replace(/^www\./i, '').toLowerCase();
    const baseHost = stripWww(base.hostname);
    const urlHost = stripWww(url.hostname);
    return base.protocol === url.protocol && (urlHost === baseHost);
  } catch {
    return false;
  }
}

function urlToRelativePath(u, siteOrigin) {
  const url = new URL(u, siteOrigin);
  let pathname = url.pathname;
  if (!pathname) pathname = '/';
  // Normalize: remove double slashes
  pathname = pathname.replace(/\/+/, '/');
  // Ensure directory path, use index.html convention
  let rel = pathname;
  if (rel.endsWith('/')) {
    rel = path.join(rel, 'index');
  } else {
    // If it has an extension, keep base name; else make index under dir
    const ext = path.extname(rel);
    if (!ext) {
      rel = path.join(rel, 'index');
    } else {
      rel = rel.slice(0, -ext.length);
    }
  }
  // Include search if it affects content (kept by caller if desired)
  const search = url.search ? '_' + encodeURIComponent(url.search.slice(1)) : '';
  return rel + search;
}

function safeFile(base, ext = '.html') {
  // Remove leading slash and sanitize
  let s = base.replace(/^\//, '');
  s = s.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
  if (!s) s = 'index';
  return s + ext;
}

function outputPathForUrl(rootDir, urlStr, siteOrigin, ext = '.html') {
  const url = new URL(urlStr, siteOrigin);
  const rel = urlToRelativePath(urlStr, siteOrigin);
  const fileRel = safeFile(rel, ext);
  return path.join(rootDir, fileRel);
}

module.exports = {
  toAbsoluteUrl,
  normalizeUrl,
  isInternal,
  urlToRelativePath,
  safeFile,
  outputPathForUrl,
};
