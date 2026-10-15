// storm-map.js: the map "Tropical cyclones near Sisal" on the Climatology page: the tracks of the storms,
//   coloured by strength, Sisal with the dashed 100 km circle, a label when you hover a track, and zoom.
//   Clicking a track selects that storm with selectEvent() (climatology-storms.js), the same as clicking it in
//   the event list, so the map, the list and the anomaly charts always show the same storm.
// Reads: data/storms/storm-tracks.json (HURDAT2 tracks), data/storms/storm-basemap.json (land and borders),
//   data/events.json (through the "events" list of climatology-storms.js; tracks match events by "hurdatId").
// Map drawing and interaction are adapted from design/storm-map-reference.html (canvas, projection, hit test).
// Uses: helpers.js, content.js, climatology-storms.js. Used by: main.js (setupStormMap). Styles: css/climatology.css.

const STORM_MAP_FILES = { tracks: 'data/storms/storm-tracks.json', basemap: 'data/storms/storm-basemap.json' };

// The five strength steps of a track, light (weak) to dark (strong): from this wind speed (kt) on, the CSS variable
// of the colour (base.css) and the key of the legend text (content/texts.json "stormMap.steps").
const STORM_STEPS = [
  { minKt: 0, colorVar: '--color-storm-1', textKey: 'depression' },
  { minKt: 34, colorVar: '--color-storm-2', textKey: 'storm' },
  { minKt: 64, colorVar: '--color-storm-3', textKey: 'cat12' },
  { minKt: 96, colorVar: '--color-storm-4', textKey: 'cat34' },
  { minKt: 137, colorVar: '--color-storm-5', textKey: 'cat5' }
];
const TROPICAL_STATUS = 'HSDsd';       // HURDAT2 status codes drawn as tropical (the rest is thin, grey and dashed)
const SISAL_RADIUS_KM = 100;
const MAP_ZOOM_STEP = 1.6, MAP_ZOOM_MAX = 12;
const HOME_SPAN_DEG = 8;        // the start view and Reset: this many degrees of latitude from top to bottom, Sisal in the middle

// ---------- state ----------

let stormTracks = [];          // from storm-tracks.json, with the projected points added (see prepareTracks)
let stormBasemap = null;       // from storm-basemap.json
let stormSite = { lon: -90.03, lat: 21.165 };
const stormMap = { home: true, hoverId: null, scale: 1, tx: 0, ty: 0, cw: 0, ch: 0, dpr: 1, fit: 1, ox: 0, oy: 0, colors: {} };

// ---------- projection (from the reference): longitude is squeezed with the cosine of 24 °N ----------

const MAP_K = Math.cos(24 * Math.PI / 180);
const mapX = (lon) => (lon + 99) * MAP_K;
const mapY = (lat) => 31.5 - lat;

// colour of a track step from its wind speed
function stepOf(kt) {
  let step = 0;
  STORM_STEPS.forEach((s, i) => { if (kt >= s.minKt) step = i; });
  return step;
}

// ---------- loading ----------

async function setupStormMap() {
  const status = $('storm-map-status');
  try {
    const [tracks, basemap] = await Promise.all(Object.values(STORM_MAP_FILES).map(async (file) => {
      const response = await fetch(file);
      if (!response.ok) throw new Error(file + ': HTTP ' + response.status);
      return response.json();
    }));
    stormBasemap = basemap;
    if (tracks.site) stormSite = tracks.site;
    prepareTracks(tracks.storms || []);
  } catch (err) {
    status.textContent = t('messages.couldNotLoadStormMap', { error: err.message });
    console.error(err);
    return;
  }
  buildStormMapLegend();
  setupStormMapControls();
  new ResizeObserver(resizeStormMap).observe($('storm-map'));   // also draws when the card becomes visible
  renderStormMap();
  reportUnmatchedStorms();
}

// Adds the projected points to every track and the box that holds all tracks and Sisal (the start view).
let stormBounds = null;
function prepareTracks(storms) {
  stormTracks = storms.map((s) => ({ id: s.id, name: s.name, year: s.year, points: s.track, px: s.track.map((p) => mapX(p.lon)), py: s.track.map((p) => mapY(p.lat)) }));
  const xs = [mapX(stormSite.lon)], ys = [mapY(stormSite.lat)];
  stormTracks.forEach((s) => { xs.push(...s.px); ys.push(...s.py); });
  stormBounds = { x0: Math.min(...xs) - 0.6, x1: Math.max(...xs) + 0.6, y0: Math.min(...ys) - 0.6, y1: Math.max(...ys) + 0.6 };
}

// The legend in the strip under the map: the five steps, "not tropical" and the circle around Sisal.
function buildStormMapLegend() {
  const box = $('storm-map-legend');
  box.innerHTML = '';
  const add = (swatchClass, swatchStyle, text) => {
    const item = document.createElement('span');
    item.className = 'lg';
    item.innerHTML = '<span class="' + swatchClass + '" style="' + swatchStyle + '"></span><span></span>';
    item.lastChild.textContent = text;
    box.appendChild(item);
  };
  STORM_STEPS.forEach((s) => add('lg-line', 'background:var(' + s.colorVar + ')', t('stormMap.steps.' + s.textKey)));
  add('lg-line dashed', 'border-color:var(--color-storm-nontropical)', t('stormMap.notTropical'));
  add('lg-circle', '', t('stormMap.circle', { km: SISAL_RADIUS_KM }));
}

function setupStormMapControls() {
  const zoom = (factor) => zoomStormMap(stormMap.cw / 2, stormMap.ch / 2, factor);
  const buttons = { 'storm-map-zoom-in': ['stormMap.zoomIn', () => zoom(MAP_ZOOM_STEP)], 'storm-map-zoom-out': ['stormMap.zoomOut', () => zoom(1 / MAP_ZOOM_STEP)],
    'storm-map-reset': ['stormMap.reset', () => { stormMap.home = true; setHomeView(); renderStormMap(); }] };
  Object.entries(buttons).forEach(([id, [textPath, action]]) => {
    $(id).setAttribute('aria-label', t(textPath));
    $(id).addEventListener('click', action);
  });

  // mouse: hover a track, drag to move the map, click a track (or empty map) to select (or deselect) a storm
  const canvas = $('storm-map-canvas');
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.offsetX, y: e.offsetY, tx: stormMap.tx, ty: stormMap.ty, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        stormMap.home = false;
        stormMap.tx = drag.tx + dx;
        stormMap.ty = drag.ty + dy;
        hideStormTip();
        renderStormMap();
        return;
      }
    }
    const hit = stormTrackAt(e.offsetX, e.offsetY);
    const id = hit ? hit.id : null;
    if (id !== stormMap.hoverId) { stormMap.hoverId = id; renderStormMap(); }
    canvas.classList.toggle('over-track', !!hit);
    if (hit) showStormTip(hit, e.offsetX, e.offsetY); else hideStormTip();
  });
  canvas.addEventListener('pointerup', (e) => {
    const wasClick = drag && !drag.moved;
    drag = null;
    if (!wasClick) return;
    const hit = stormTrackAt(e.offsetX, e.offsetY);
    if (hit) {
      const ev = eventOfTrack(hit);
      if (ev) selectEvent(ev.id);                                // the same function as the event list uses
    } else if (selectedEventId) {
      selectEvent(selectedEventId);                              // empty map: selecting the selected storm again deselects it
    }
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => { drag = null; stormMap.hoverId = null; hideStormTip(); renderStormMap(); });
}

// ---------- tracks and events ----------

// The event (data/events.json) that belongs to a track: matched by the HURDAT2 id, not by name.
function eventOfTrack(track) {
  return events.find((e) => e.hurdatId === track.id) || null;
}

// The id of the HURDAT2 track of the selected storm, or null.
function selectedTrackId() {
  const ev = getSelectedEvent();
  return ev ? ev.hurdatId : null;
}

// Tracks without an event in events.json (or the other way round) are named in the console, and in the status line.
function reportUnmatchedStorms() {
  if (!stormTracks.length || !events.length) return;           // wait until both files are loaded
  const unmatched = stormTracks.filter((s) => !eventOfTrack(s)).map((s) => s.id);
  const missing = events.filter((e) => !stormTracks.some((s) => s.id === e.hurdatId)).map((e) => e.hurdatId || e.id);
  const all = unmatched.concat(missing);
  if (all.length) console.warn('Storm map: no match between storm-tracks.json and events.json for: ' + all.join(', '));
  $('storm-map-status').textContent = all.length ? t('messages.stormMapUnmatched', { ids: all.join(', ') }) : '';
}

// ---------- drawing ----------

// Called when the map has to be drawn again: after loading, a new selection, zoom or resize.
function renderStormMap() {
  if (!stormBasemap || !stormMap.cw) return;
  const canvas = $('storm-map-canvas'), ctx = canvas.getContext('2d');
  const c = stormMap.colors = readStormMapColors();
  const { cw, ch, dpr } = stormMap;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = c.sea;
  ctx.fillRect(0, 0, cw, ch);

  // land, borders (dashed) and the outline of Yucatán
  const pathOf = (rings) => rings.forEach((ring) => { ring.forEach(([lon, lat], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, sx(mapX(lon)), sy(mapY(lat)))); ctx.closePath(); });
  const polygons = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  ctx.beginPath();
  polygons(stormBasemap.land).forEach(pathOf);
  ctx.fillStyle = c.land; ctx.fill();
  ctx.strokeStyle = c.coast; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.beginPath();
  (stormBasemap.borders.type === 'LineString' ? [stormBasemap.borders.coordinates] : stormBasemap.borders.coordinates)
    .forEach((line) => line.forEach(([lon, lat], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, sx(mapX(lon)), sy(mapY(lat)))));
  ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath();
  polygons(stormBasemap.yuc).forEach(pathOf);
  ctx.strokeStyle = c.outline; ctx.lineWidth = 1; ctx.stroke();

  // latitude labels on the left edge
  ctx.fillStyle = c.muted; ctx.font = '500 11px ' + c.font;
  for (let lat = 15; lat <= 35; lat += 5) ctx.fillText(lat + '°N', 4, sy(mapY(lat)) - 3);

  // tracks: the selected storm on top, the others dimmed while a storm is selected
  const selectedId = selectedTrackId(), lineWidth = Math.max(1.2, Math.min(2.4, 1.5 * Math.sqrt(stormMap.scale)));
  const dim = selectedId ? 0.28 : 1;
  stormTracks.forEach((s) => { if (s.id !== selectedId && s.id !== stormMap.hoverId) drawStormTrack(ctx, s, dim, lineWidth); });
  [selectedId, stormMap.hoverId].forEach((id) => {
    const s = stormTracks.find((x) => x.id === id);
    if (s) drawStormTrack(ctx, s, 1, lineWidth * 1.8, true);
  });

  // Sisal with the dashed circle
  const scx = sx(mapX(stormSite.lon)), scy = sy(mapY(stormSite.lat));
  ctx.beginPath(); ctx.arc(scx, scy, Math.max(2, SISAL_RADIUS_KM * stormMap.fit * stormMap.scale / 111.2), 0, Math.PI * 2);
  ctx.strokeStyle = c.circle; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = c.text; ctx.beginPath(); ctx.arc(scx, scy, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.font = '600 12px ' + c.font; ctx.fillText(stormSite.name || t('stormMap.sisal'), scx + 7, scy - 7);

  // name of the selected storm at its strongest point in view
  const sel = stormTracks.find((s) => s.id === selectedId);
  if (sel) {
    let best = -1;
    sel.points.forEach((p, i) => {
      const x = sx(sel.px[i]), y = sy(sel.py[i]);
      if (x > 0 && x < cw && y > 0 && y < ch && (best < 0 || p.wind_kt > sel.points[best].wind_kt)) best = i;
    });
    if (best >= 0) { ctx.fillStyle = c.text; ctx.font = '600 12px ' + c.font; ctx.fillText(sel.name + ' ' + sel.year, sx(sel.px[best]) + 8, sy(sel.py[best]) - 8); }
  }
}

// map units -> screen pixels (with zoom and move)
const sx = (x) => stormMap.ox + x * stormMap.fit * stormMap.scale + stormMap.tx;
const sy = (y) => stormMap.oy + y * stormMap.fit * stormMap.scale + stormMap.ty;

// One track, drawn per 6-hourly step: coloured by the wind at its start, or thin, grey and dashed when not tropical.
// highlight = a light halo under the track (hovered or selected storm).
function drawStormTrack(ctx, s, alpha, width, highlight) {
  const c = stormMap.colors;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (highlight) {
    ctx.globalAlpha = 0.45; ctx.strokeStyle = c.accent; ctx.lineWidth = width + 4;
    ctx.beginPath();
    s.px.forEach((x, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, sx(x), sy(s.py[i])));
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  for (let i = 0; i < s.points.length - 1; i++) {
    const p = s.points[i], tropical = TROPICAL_STATUS.includes(p.status);
    ctx.strokeStyle = tropical ? c.steps[stepOf(p.wind_kt)] : c.nonTropical;
    ctx.lineWidth = tropical ? width : Math.max(0.8, width * 0.5);
    ctx.setLineDash(tropical ? [] : [2, 3]);
    ctx.beginPath(); ctx.moveTo(sx(s.px[i]), sy(s.py[i])); ctx.lineTo(sx(s.px[i + 1]), sy(s.py[i + 1])); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
}

// The colours come from the CSS variables (base.css), so the map follows the site's colours and font.
function readStormMapColors() {
  const style = getComputedStyle(document.documentElement);
  const get = (name) => style.getPropertyValue(name).trim();
  return {
    sea: get('--color-storm-sea'), land: get('--color-storm-land'), coast: get('--color-storm-land-edge'), outline: get('--color-storm-outline'),
    muted: get('--color-text-muted'), text: get('--color-text'), circle: get('--color-storm-circle'), accent: get('--color-storm-selected'),
    nonTropical: get('--color-storm-nontropical'), steps: STORM_STEPS.map((s) => get(s.colorVar)),
    font: getComputedStyle(document.body).fontFamily
  };
}

// ---------- size, zoom, hover ----------

// Fits the box with all tracks and Sisal into the canvas (zoom 1, the most zoomed-out view).
function resizeStormMap() {
  const wrap = $('storm-map'), canvas = $('storm-map-canvas'), m = stormMap;
  m.cw = wrap.clientWidth; m.ch = wrap.clientHeight; m.dpr = window.devicePixelRatio || 1;
  if (!m.cw || !stormBounds) return;
  canvas.width = m.cw * m.dpr; canvas.height = m.ch * m.dpr;
  const w = stormBounds.x1 - stormBounds.x0, h = stormBounds.y1 - stormBounds.y0;
  m.fit = Math.min(m.cw / w, m.ch / h);
  m.ox = (m.cw - w * m.fit) / 2 - stormBounds.x0 * m.fit;
  m.oy = (m.ch - h * m.fit) / 2 - stormBounds.y0 * m.fit;
  if (m.home) setHomeView();
  renderStormMap();
}

// The start view and Reset: zoomed in on Sisal, which sits in the middle of the map.
function setHomeView() {
  const m = stormMap;
  m.scale = Math.max(1, Math.min(MAP_ZOOM_MAX, m.ch / HOME_SPAN_DEG / m.fit));
  m.tx = m.cw / 2 - m.ox - mapX(stormSite.lon) * m.fit * m.scale;
  m.ty = m.ch / 2 - m.oy - mapY(stormSite.lat) * m.fit * m.scale;
}

function zoomStormMap(px, py, factor) {
  const m = stormMap, scale = Math.max(1, Math.min(MAP_ZOOM_MAX, m.scale * factor));
  m.home = false;
  factor = scale / m.scale;
  m.tx = px - (px - m.tx - m.ox) * factor - m.ox;
  m.ty = py - (py - m.ty - m.oy) * factor - m.oy;
  m.scale = scale;
  if (scale === 1) { m.tx = 0; m.ty = 0; }
  renderStormMap();
}

// The track under the mouse (within 9 px), or null (from the reference).
function stormTrackAt(mx, my) {
  const m = stormMap, unit = m.fit * m.scale;
  const bx = (mx - m.ox - m.tx) / unit, by = (my - m.oy - m.ty) / unit, reach = 9 / unit;
  let best = null, bestDist = reach * reach;
  stormTracks.forEach((s) => {
    for (let i = 0; i < s.px.length - 1; i++) {
      const x1 = s.px[i], y1 = s.py[i], dx = s.px[i + 1] - x1, dy = s.py[i + 1] - y1, len = dx * dx + dy * dy;
      const along = len ? Math.max(0, Math.min(1, ((bx - x1) * dx + (by - y1) * dy) / len)) : 0;
      const ex = x1 + along * dx - bx, ey = y1 + along * dy - by;
      if (ex * ex + ey * ey < bestDist) { bestDist = ex * ex + ey * ey; best = s; }
    }
  });
  return best;
}

// The label at the mouse: "Opal 1995 · Tropical storm near Sisal".
function showStormTip(track, x, y) {
  const tip = $('storm-map-tip'), ev = eventOfTrack(track);
  tip.textContent = track.name + ' ' + track.year + (ev ? ' · ' + strengthText(ev.strengthNear, 'near') : '');
  tip.hidden = false;
  tip.style.left = Math.min(x + 14, stormMap.cw - tip.offsetWidth - 6) + 'px';
  tip.style.top = Math.min(y + 14, stormMap.ch - tip.offsetHeight - 6) + 'px';
}

function hideStormTip() {
  $('storm-map-tip').hidden = true;
}
