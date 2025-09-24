const path = require('path');
const fs = require('fs-extra');
const { XMLParser } = require('fast-xml-parser');
const logger = require('./utils/logger');
const cheerio = require('cheerio');

const GPS_DIR = path.resolve(__dirname, '../gps');
const OUT_DIR = path.resolve(__dirname, '../output');
const OUT_GPS_DIR = path.join(OUT_DIR, 'assets/gps');
let markerEvery = 100;
let markerLabels = 'hover';
try {
  const settings = require(path.resolve(__dirname, '../config/settings.json'));
  if (settings?.gps?.markerEvery && Number.isInteger(settings.gps.markerEvery)) {
    markerEvery = settings.gps.markerEvery;
  }
  if (settings?.gps?.markerLabels) {
    markerLabels = String(settings.gps.markerLabels);
  }
} catch {}

function formatISODate(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return null;
  }
}

function coordsToLineString(coords) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  };
}

function normalizeFeatureCollection(fc) {
  if (!fc || fc.type !== 'FeatureCollection') return null;
  // Filter to LineString or MultiLineString; convert Multi to multiple LineStrings
  const lineFeatures = [];
  const markerFeatures = [];
  for (const f of fc.features || []) {
    if (!f || !f.geometry) continue;
    const g = f.geometry;
    if (g.type === 'LineString') {
      lineFeatures.push({ ...f, properties: { ...(f.properties||{}), __kind: 'track' } });
      // sample markers every N points (no dates in generic GeoJSON)
      const coords = g.coordinates || [];
      coords.forEach((c, idx) => {
        if (idx % markerEvery === 0) {
          markerFeatures.push({
            type: 'Feature',
            properties: { __kind: 'marker', seq: idx, label: `Pt ${idx}` },
            geometry: { type: 'Point', coordinates: c }
          });
        }
      });
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates || []) {
        lineFeatures.push({ type: 'Feature', properties: { ...(f.properties||{}), __kind: 'track' }, geometry: { type: 'LineString', coordinates: line } });
        line.forEach((c, idx) => {
          if (idx % markerEvery === 0) {
            markerFeatures.push({ type: 'Feature', properties: { __kind: 'marker', seq: idx, label: `Pt ${idx}` }, geometry: { type: 'Point', coordinates: c } });
          }
        });
      }
    }
  }
  return { type: 'FeatureCollection', features: [...lineFeatures, ...markerFeatures] };
}

async function loadGeoJSON(file) {
  const raw = await fs.readFile(file, 'utf-8');
  try {
    const data = JSON.parse(raw);
    if (data.type === 'FeatureCollection') return normalizeFeatureCollection(data);
    if (data.type === 'Feature') return normalizeFeatureCollection({ type: 'FeatureCollection', features: [data] });
    return null;
  } catch (e) {
    logger.warn('Invalid GeoJSON', file, e.message);
    return null;
  }
}

async function loadGPX(file) {
  const xml = await fs.readFile(file, 'utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const obj = parser.parse(xml);
  const trks = obj?.gpx?.trk;
  const lineFeatures = [];
  const markerFeatures = [];
  const arr = Array.isArray(trks) ? trks : (trks ? [trks] : []);
  for (const trk of arr) {
    const segs = trk?.trkseg;
    const segArr = Array.isArray(segs) ? segs : (segs ? [segs] : []);
    for (const seg of segArr) {
      const pts = seg?.trkpt || [];
      const pArr = Array.isArray(pts) ? pts : [pts];
      const coords = [];
      const times = [];
      for (const p of pArr) {
        const lon = parseFloat(p['@_lon']);
        const lat = parseFloat(p['@_lat']);
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
          coords.push([lon, lat]);
          const t = p?.time || p?.Time || null;
          times.push(t || null);
        }
      }
      if (coords.length > 1) {
        lineFeatures.push({ ...coordsToLineString(coords), properties: { __kind: 'track' } });
        coords.forEach((c, idx) => {
          if (idx % markerEvery === 0) {
            const iso = times[idx];
            const formatted = iso ? formatISODate(iso) : null;
            const label = formatted || (iso || undefined) || `Pt ${idx}`;
            markerFeatures.push({ type: 'Feature', properties: { __kind: 'marker', seq: idx, time: iso || undefined, label }, geometry: { type: 'Point', coordinates: c } });
          }
        });
      }
    }
  }
  return { type: 'FeatureCollection', features: [...lineFeatures, ...markerFeatures] };
}

async function loadKML(file) {
  const xml = await fs.readFile(file, 'utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true });
  const obj = parser.parse(xml);
  const lineFeatures = [];
  const markerFeatures = [];
  const placemarks = [];
  function collectPlacemarks(node) {
    if (!node || typeof node !== 'object') return;
    if (node.Placemark) {
      const p = node.Placemark;
      if (Array.isArray(p)) placemarks.push(...p); else placemarks.push(p);
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') collectPlacemarks(v);
    }
  }
  collectPlacemarks(obj?.kml || obj);
  for (const pm of placemarks) {
    // gx:Track typically has parallel arrays of <when> and <gx:coord>
    const whens = (pm?.gx_Track?.when || pm?.Track?.when) || [];
    const whenArr = Array.isArray(whens) ? whens : (whens ? [whens] : []);
    const line = pm?.LineString?.coordinates || pm?.Track?.coord || pm?.gx_Track?.coord;
    if (line) {
      if (typeof line === 'string') {
        const coords = line.trim().split(/\s+/).map((triplet) => {
          const [lon, lat] = triplet.split(',').map(Number);
          return [lon, lat];
        }).filter((xy) => Number.isFinite(xy[0]) && Number.isFinite(xy[1]));
        if (coords.length > 1) {
          lineFeatures.push({ ...coordsToLineString(coords), properties: { __kind: 'track' } });
          // Only add KML markers if we have corresponding timestamps
          if (whenArr && whenArr.length) {
            coords.forEach((c, idx) => {
              if (idx % markerEvery === 0) {
                const iso = whenArr[idx] || null;
                if (iso) {
                  const formatted = formatISODate(iso);
                  const label = formatted || iso;
                  markerFeatures.push({ type: 'Feature', properties: { __kind: 'marker', seq: idx, time: iso, label }, geometry: { type: 'Point', coordinates: c } });
                }
              }
            });
          }
        }
      } else if (Array.isArray(line)) {
        const coords = line.map((c) => {
          const parts = (typeof c === 'string' ? c : (c['#text'] || '')).split(',').map(Number);
          return [parts[0], parts[1]];
        }).filter((xy) => Number.isFinite(xy[0]) && Number.isFinite(xy[1]));
        if (coords.length > 1) {
          lineFeatures.push({ ...coordsToLineString(coords), properties: { __kind: 'track' } });
          // Only add KML markers if we have corresponding timestamps
          if (whenArr && whenArr.length) {
            coords.forEach((c, idx) => {
              if (idx % markerEvery === 0) {
                const iso = whenArr[idx] || null;
                if (iso) {
                  const formatted = formatISODate(iso);
                  const label = formatted || iso;
                  markerFeatures.push({ type: 'Feature', properties: { __kind: 'marker', seq: idx, time: iso, label }, geometry: { type: 'Point', coordinates: c } });
                }
              }
            });
          }
        }
      }
    }
  }
  return { type: 'FeatureCollection', features: [...lineFeatures, ...markerFeatures] };
}

function mergeCollections(collections) {
  const features = [];
  for (const fc of collections) {
    if (fc && fc.features) features.push(...fc.features);
  }
  return { type: 'FeatureCollection', features };
}

function computeBounds(fc) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of fc.features || []) {
    const coords = f.geometry?.coordinates || [];
    for (const [x, y] of coords) {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return [[minY, minX], [maxY, maxX]]; // Leaflet uses [lat,lon]
}

async function injectMapIntoExisting(geojsonRelPath) {
  const pageDir = path.join(OUT_DIR, 'current-location');
  const pagePath = path.join(pageDir, 'index.html');
  let html = null;
  if (await fs.pathExists(pagePath)) {
    html = await fs.readFile(pagePath, 'utf-8');
  }
  if (!html) {
    // Fallback to blank shell if page missing
    await fs.ensureDir(pageDir);
    html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Travel Log</title></head><body><div id="SITE_PAGES"></div></body></html>';
  }
  const $ = cheerio.load(html, { decodeEntities: false });

  // Remove any existing embedded map iframes to avoid overlap
  $('iframe[src*="google.com/maps"], iframe[src*="mapbox"], iframe[src*="maps."], iframe[src*="spotwalla"]').each((_i, el) => {
    const $el = $(el);
    const parent = $el.parent();
    $el.remove();
    if (parent && parent.children().length === 0) parent.remove();
  });

  // Ensure Leaflet assets in head
  const leafletCss = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">';
  if ($('head link[href*="leaflet"]').length === 0) $('head').append(leafletCss);

  const styleTag = `<style id="qr-map-style">
    #qr-map { width: 100%; height: 100%; border-radius: 6px; box-shadow: 0 2px 12px rgba(0,0,0,0.15); }
  </style>`;
  if ($('#qr-map-style').length === 0) $('head').append(styleTag);

  // Create map mount that fills its container
  const mapDiv = '<div id="qr-map" role="region" aria-label="Travel map" style="width:100%;height:100%;"></div>';

  // Prefer replacing the original embed container to preserve layout
  let host = $('#comp-j8dunfe7');
  if (!host.length) host = $('wix-iframe').has('iframe').first();
  if (!host.length) {
    const iframe = $('iframe[src*="spotwalla"], iframe[src*="google.com/maps"], iframe[src*="mapbox"], iframe[src*="maps."]').first();
    if (iframe.length) host = iframe.parent();
  }
  if (host.length) {
    host.empty().append(mapDiv);
  } else {
    // Fallback to a high-level content container
    let container = $('#SITE_PAGES');
    if (!container.length) container = $('#PAGES_CONTAINER');
    if (!container.length) container = $('main#PAGES_CONTAINER');
    if (!container.length) container = $('body');
    container.prepend(mapDiv);
  }

  // Ensure Leaflet JS before closing body
  const leafletJs = '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>';
  if ($('script[src*="leaflet"]').length === 0) $('body').append(leafletJs);

  // Remove any previous inline init if present
  $('#qr-map-init').remove();

  // Write external map init script to avoid inline quoting issues
  const initSource = `
(function(){
  var MARKER_LABEL_MODE = '${markerLabels}';
  function fmtFriendly(iso){
    try{
      var d = new Date(iso);
      var local = new Intl.DateTimeFormat(undefined, { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false, timeZoneName:'short' }).format(d);
      var utc = new Intl.DateTimeFormat('en-GB', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'UTC', timeZoneName:'short' }).format(d);
      return { local: local, utc: utc };
    }catch(e){ return { local: String(iso), utc: '' }; }
  }
  function init(){
    if (!window.L || !document.getElementById('qr-map')) { return setTimeout(init, 50); }
    try{
      var map = L.map('qr-map');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'}).addTo(map);
      fetch('${geojsonRelPath}').then(function(r){return r.json()}).then(function(fc){
        var tracks = L.geoJSON(fc, {
          filter: function(f){ return f.properties && f.properties.__kind === 'track'; },
          style:{color:'#e74c3c', weight:3}
        }).addTo(map);
        var markers = L.geoJSON(fc, {
          filter: function(f){ return f.properties && f.properties.__kind === 'marker'; },
          pointToLayer: function(feature, latlng){ return L.circleMarker(latlng, { radius:6, color:'#2c3e50', weight:1, fillColor:'#3498db', fillOpacity:0.95 }); },
          onEachFeature: function(feature, layer){
            var props = (feature && feature.properties) || {};
            var label = props.time || props.label || '';
            
            // Bind tooltip only for 'always' or 'hover' modes
            try {
              if (label && MARKER_LABEL_MODE === 'always') {
                layer.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -8], opacity: 0.95 });
              } else if (label && MARKER_LABEL_MODE === 'hover') {
                layer.bindTooltip(label, { permanent: false, direction: 'top', offset: [0, -8], opacity: 0.95 });
              }
            } catch(e) {}
            // Always attach a popup; prefer timestamp when available
            try {
              var html;
              if (props.time){
                var t = fmtFriendly(props.time);
                html = '<div style=\"font-family:system-ui,sans-serif;font-size:12px;line-height:1.35;\">'
                    + '<div><strong>' + t.local + '</strong></div>'
                    + (props.seq != null ? '<div style=\"opacity:.6\">Point #' + props.seq + '</div>' : '')
                    + '</div>';
              } else {
                html = '<div style=\"font-family:system-ui,sans-serif;font-size:12px;\"><strong>' + String(label) + '</strong></div>';
              }
              layer.bindPopup(html, { autoPan: true, closeButton: true });
            } catch(e) {}
            try {
              layer.on('click', function(ev){
                ev.originalEvent && ev.originalEvent.stopPropagation && ev.originalEvent.stopPropagation();
                
                try { layer.openPopup(); } catch(e) {}
              });
            } catch(e) {}
          }
        }).addTo(map);
        try{ var b1 = tracks.getBounds(); if (b1.isValid()) map.fitBounds(b1.pad(0.1)); else map.setView([0,0],2);}catch(e){ map.setView([0,0],2); }
      }).catch(function(){ map.setView([0,0],2); });
    }catch(e){ console.error('Map init failed', e); }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
`;
  await fs.ensureDir(OUT_GPS_DIR);
  const initPath = path.join(OUT_GPS_DIR, 'map-init.js');
  await fs.writeFile(initPath, initSource, 'utf-8');

  // Inject external script tag
  if ($('script#qr-map-external').length) $('script#qr-map-external').remove();
  $('body').append('<script id="qr-map-external" src="/assets/gps/map-init.js"></script>');

  await fs.ensureDir(pageDir);
  await fs.writeFile(pagePath, $.html(), 'utf-8');
}

async function main() {
  const exists = await fs.pathExists(GPS_DIR);
  if (!exists) {
    logger.warn('gps/ folder not found. Skipping GPS map build.');
    return;
  }
  const files = (await fs.readdir(GPS_DIR)).filter(f => /\.(geojson|json|gpx|kml)$/i.test(f));
  if (!files.length) {
    logger.warn('No GPS files found in gps/. Supported: .geojson, .gpx, .kml');
    return;
  }
  const collections = [];
  for (const f of files) {
    const full = path.join(GPS_DIR, f);
    if (/\.(geojson|json)$/i.test(f)) {
      const fc = await loadGeoJSON(full);
      if (fc) collections.push(fc);
    } else if (/\.gpx$/i.test(f)) {
      const fc = await loadGPX(full);
      if (fc) collections.push(fc);
    } else if (/\.kml$/i.test(f)) {
      const fc = await loadKML(full);
      if (fc) collections.push(fc);
    }
  }
  const merged = mergeCollections(collections);
  if (!merged.features.length) {
    logger.warn('No track features parsed from gps/.');
  }
  await fs.ensureDir(OUT_GPS_DIR);
  const outGeo = path.join(OUT_GPS_DIR, 'tracks.geojson');
  await fs.writeJson(outGeo, merged, { spaces: 0 });
  logger.success('Wrote', path.relative(process.cwd(), outGeo));

  await injectMapIntoExisting('/assets/gps/tracks.geojson');
  logger.success('Updated', path.relative(process.cwd(), path.join(OUT_DIR, 'current-location/index.html')), 'with embedded map');
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('GPS build failed', err);
    process.exitCode = 1;
  });
}

module.exports = { main };
