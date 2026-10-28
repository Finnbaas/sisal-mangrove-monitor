// stakeholders.js: the Stakeholder screen.
//   Three themes (Extent, Condition, Disturbance & recovery). Per theme: a map with the areas where stakeholders saw
//   change (rotated ellipses with a number marker, on the same black and white base map as the Mangrove maps), and a
//   list of those areas that opens one area at a time (zone, change, period, cause, and what stakeholders said).
//   Clicking an area on the map or in the list opens it and flies the map to it; clicking the open one closes it again.
//   Address of an area: #stakeholders/<theme>/<number>, e.g. #stakeholders/extent/5a.
// Reads: content/stakeholders.json (themes and areas, written by the team); the base map comes from data/vegetation/layers.json
//   (loaded by ecosystem.js). Nothing is typed in this file: every text, number and color comes from content/.
// Uses: helpers.js, content.js, ecosystem.js (createMap, setupBasemapButton, ecoLayersLoaded) and Leaflet (CDN).
// Used by: main.js (setupStakeholders).

const STAKEHOLDER_FILE = 'content/stakeholders.json';
const SH_ELLIPSE_STEPS = 72;       // corners of the polygon that draws one ellipse
const SH_FLY_SECONDS = 0.8;        // duration of the flight to an area and back
const SH_MIN_VIEW_METERS = 1600;   // flying to an area: the view is at least this wide, so a small area shows its surroundings
const SH_VIEW_PADDING = 0.6;       // ... and the area itself gets this much extra space around it (share of its size)

let stakeholders = null;     // contents of content/stakeholders.json, or null if it could not be loaded
const shThemes = {};         // per theme id: { theme, areas: { number: item }, order, map, ready, open, start }
let shHover = null;          // { themeId, number } of the area under the mouse, or null

// ---------- loading and checking ----------

async function loadStakeholderFile() {
  let response;
  try {
    response = await fetch(STAKEHOLDER_FILE);
  } catch (err) {
    throw new ContentError(STAKEHOLDER_FILE, 'the file could not be loaded (' + err.message + ').');
  }
  if (!response.ok) throw new ContentError(STAKEHOLDER_FILE, 'the file could not be loaded (HTTP ' + response.status + ').');
  return parseJsonFile(await response.text(), STAKEHOLDER_FILE);
}

// Checks that the file has the parts this screen needs. Areas that cannot be shown are left out (with a warning in
// the browser console), so one wrong area does not hide the rest. Returns how many were left out.
function checkStakeholders(content) {
  const fail = (problem) => { throw new ContentError(STAKEHOLDER_FILE, problem); };
  if (!content || !Array.isArray(content.themes) || !content.themes.length) fail('"themes" must be a list with at least one theme.');
  if (!Array.isArray(content.areas)) fail('"areas" must be a list.');
  content.themes.forEach((th, i) => {
    const n = 'theme ' + (i + 1);
    if (!th || typeof th.id !== 'string') fail(n + ' needs an "id".');
    if (!Array.isArray(th.legend) || !th.legend.length) fail(n + ' ("' + th.id + '") needs a list "legend".');
    if (!Array.isArray(th.fields)) fail(n + ' ("' + th.id + '") needs a list "fields".');
  });
  let skipped = 0;
  const numbers = new Set();
  content.areas = content.areas.filter((a) => {
    const theme = a && content.themes.find((th) => th.id === a.theme);
    const ellipseOk = (e) => e && ['lat', 'lon', 'radiusXM', 'radiusYM', 'rotationDeg'].every((k) => isNumber(e[k]));
    const ok = theme && a.number !== undefined && theme.legend.some((l) => l.id === a.class) &&
      Array.isArray(a.ellipses) && a.ellipses.length > 0 && a.ellipses.every(ellipseOk) && !numbers.has(a.theme + '/' + a.number);
    if (!ok) {
      skipped++;
      console.warn(STAKEHOLDER_FILE + ': an area without a "number", a known "theme" and "class", a complete "ellipses" list, or with a number that is used twice, is not shown (area ' + (a && a.number) + ').');
    } else {
      a.number = String(a.number);
      numbers.add(a.theme + '/' + a.number);
    }
    return ok;
  });
  return skipped;
}

// A message on each theme's map card (the details are in the browser console).
function showStakeholderMessage(text) {
  document.querySelectorAll('.sh-status').forEach((el) => { el.textContent = text; });
}

async function setupStakeholders() {
  let skipped = 0;
  try {
    const content = await loadStakeholderFile();
    skipped = checkStakeholders(content);
    await ecoLayersLoaded;   // the base map (ecosystem.js); it names its own file if it could not be loaded
    if (!ecoLayers) throw new ContentError(CONTENT.ecosystem.files.layers, 'the base map could not be loaded.');
    if (typeof L === 'undefined') throw new ContentError('the map library (Leaflet)', 'it could not be loaded.');
    stakeholders = content;
  } catch (err) {
    // a problem in this file only affects the Stakeholder page: the message names the file
    showStakeholderMessage(t('messages.couldNotLoadStakeholders', { error: err.message }));
    console.error(err);
    return;
  }
  if (skipped > 0) showStakeholderMessage(t('messages.stakeholderEntriesSkipped', { count: skipped }));

  stakeholders.themes.forEach(setupStakeholderTheme);
  applyStakeholderAddress();
  window.addEventListener('hashchange', applyStakeholderAddress);
}

// ---------- small helpers ----------

// The color of an area (its legend class) and the fill of its number marker (Condition: natural or anthropogenic cause).
function areaColor(theme, area) {
  const entry = theme.legend.find((l) => l.id === area.class);
  return entry ? color(colorVarOf(entry.color)) : color('--color-text-faint');
}

function markerFill(theme, area) {
  const entry = (theme.markerLegend || []).find((m) => m.id === area.causeType);
  return color(colorVarOf(entry ? entry.fill : 'surface'));
}

// White text on a dark marker, dark text on a light one (the fill is a "#rrggbb" color from css/base.css).
function textColorOn(fill) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fill);
  if (!m) return color('--color-text');
  const luminance = (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
  return color(luminance < 0.6 ? '--color-surface' : '--color-text');
}

// The corners of one ellipse as latitude/longitude pairs. The ellipse is drawn in the Web Mercator projection (the one of the
// base map), so it has exactly the shape and rotation it has in Figma. The radii in the file are metres on the ground at the
// centre; rotationDeg is clockwise as seen on the map.
function ellipseLatLngs(e) {
  const projection = L.Projection.SphericalMercator;
  const centre = projection.project(L.latLng(e.lat, e.lon));
  const stretch = 1 / Math.cos(e.lat * Math.PI / 180);   // ground metres -> Mercator metres
  const a = e.radiusXM * stretch, b = e.radiusYM * stretch;
  const turn = -e.rotationDeg * Math.PI / 180;           // clockwise on screen = counter-clockwise with north up
  const points = [];
  for (let i = 0; i < SH_ELLIPSE_STEPS; i++) {
    const angle = i / SH_ELLIPSE_STEPS * 2 * Math.PI;
    const x = a * Math.cos(angle), y = b * Math.sin(angle);
    points.push(projection.unproject(L.point(
      centre.x + x * Math.cos(turn) - y * Math.sin(turn),
      centre.y + x * Math.sin(turn) + y * Math.cos(turn))));
  }
  return points;
}

// Style of an area on the map: class color at 25 %, thin dashed outline; hovered: a bit stronger; open: solid, thicker outline.
function areaStyle(c, state) {
  return { color: c, weight: state === 'open' ? 3.5 : state === 'hover' ? 2.5 : 1.5, dashArray: state === 'open' ? null : '6 5', opacity: 1, fillColor: c, fillOpacity: state ? 0.4 : 0.25 };
}

// ---------- one theme: heading, map, legend and list ----------

function setupStakeholderTheme(theme) {
  if (!$('sh-' + theme.id + '-list')) {
    console.warn(STAKEHOLDER_FILE + ': the theme "' + theme.id + '" has no cards in index.html (data-card="sh-' + theme.id + '-map" and "-list") and is not shown.');
    return;
  }
  const areas = stakeholders.areas.filter((a) => a.theme === theme.id);
  const state = { theme, areas: {}, order: areas.map((a) => a.number), map: null, ready: false, open: null, start: null };
  shThemes[theme.id] = state;

  // heading of the part: the theme's title and subtitle (the section navigation keeps the short name from pages.json)
  const part = $('stakeholders-' + theme.id);
  if (part) {
    const header = part.querySelector('.part-header');
    header.querySelector('h2').textContent = theme.title;
    let subtitle = header.querySelector('p');
    if (!subtitle) { subtitle = document.createElement('p'); header.appendChild(subtitle); }
    subtitle.textContent = theme.subtitle || '';
  }

  renderStakeholderLegend(theme);
  renderStakeholderNote(theme);
  const list = $('sh-' + theme.id + '-list');
  list.innerHTML = '';
  areas.forEach((area) => {
    const item = { area, polygons: [], marker: null, bounds: null, el: null, row: null, details: null };
    state.areas[area.number] = item;
    item.el = buildAreaItem(theme, area);
    item.row = item.el.querySelector('.sh-row');
    item.details = item.el.querySelector('.sh-details');
    list.appendChild(item.el);
    // clicking the row opens or closes the area; hovering it highlights the area on the map
    item.row.addEventListener('click', () => selectStakeholderArea(theme.id, area.number));
    item.el.addEventListener('mouseenter', () => setStakeholderHover(theme.id, area.number));
    item.el.addEventListener('mouseleave', () => setStakeholderHover(null));
  });
  createStakeholderMap(state);
}

// The legend under the map: one swatch per class, and for Condition the two markers (natural / anthropogenic cause).
function renderStakeholderLegend(theme) {
  const swatches = theme.legend.map((l) => '<span class="sh-legend-item" style="--c: var(' + colorVarOf(l.color) + ')"><span class="sh-swatch"></span>' + escapeHtml(l.label) + '</span>');
  const markers = (theme.markerLegend || []).map((m) => '<span class="sh-legend-item"><span class="sh-badge sh-badge-small" style="--c: var(--color-text-muted); --fill: var(' + colorVarOf(m.fill) + ')"></span>' + escapeHtml(m.label) + '</span>');
  $('sh-' + theme.id + '-legend').innerHTML = swatches.concat(markers).join('');
}

// Condition: the observations that belong to no area on the map (the number on the map is "-" in the interview table).
function renderStakeholderNote(theme) {
  const box = $('sh-' + theme.id + '-note');
  const notes = theme.notes || [];
  box.hidden = notes.length === 0;
  // short: the zone and the fields of the one-line summary; the other fields and the quotes are behind "More details"
  const isShort = (f) => f.key === 'zone' || theme.summary.includes(f.key);
  box.innerHTML = notes.map((note) =>
    '<div class="sh-note"><div class="sh-note-label">' + escapeHtml(t('stakeholders.noteLabel')) + '</div>' +
    '<div class="sh-fields">' + theme.fields.filter(isShort).map((f) => shFieldHtml(theme, note, f)).join('') + '</div>' +
    '<details class="sh-note-more"><summary>' + escapeHtml(t('stakeholders.noteMore')) + '</summary>' +
    shDetailsHtml(Object.assign({}, theme, { fields: theme.fields.filter((f) => !isShort(f)) }), note) + '</details></div>').join('');
}

// ---------- the list ----------

// One field as small label + value. A field that is not in the data does not apply and is left out; an empty one shows "No data".
function shFieldHtml(theme, item, field) {
  if (!(field.key in item)) return '';
  let value = item[field.key];
  if (field.values && isFilled(value)) {
    const entry = (theme[field.values] || []).find((x) => x.id === value);
    if (entry) value = entry.label;
  }
  return '<div class="sh-field"><div class="sh-field-label">' + escapeHtml(field.label) + '</div><div class="sh-field-value">' + textOrPlaceholder('sh-placeholder', value, NO_DATA) + '</div></div>';
}

// All details of an area (or note): the fields, then "In their words (paraphrase)" with every quote as code + type + text.
function shDetailsHtml(theme, item) {
  const quotes = (item.quotes || []).map((q) =>
    '<div class="sh-quote"><div class="sh-quote-head"><b>' + escapeHtml(q.code) + '</b> <span>' + textOrPlaceholder('sh-placeholder', q.type, NO_DATA) + '</span></div>' +
    '<div class="sh-quote-text">' + textOrPlaceholder('sh-placeholder', q.text, NO_DATA) + '</div></div>').join('');
  return '<div class="sh-fields">' + theme.fields.map((f) => shFieldHtml(theme, item, f)).join('') + '</div>' +
    '<div class="sh-quotes"><div class="sh-field-label">' + escapeHtml(stakeholders.quotesLabel) + '</div>' + (quotes || '<div class="sh-quote-text">' + textOrPlaceholder('sh-placeholder', '', NO_DATA) + '</div>') + '</div>';
}

// The number marker, in the list and on the map: class color outline, white fill (Condition: grey when the cause is natural).
function shBadgeHtml(theme, area) {
  const fill = markerFill(theme, area);
  return '<span class="sh-badge" style="--c: ' + areaColor(theme, area) + '; --fill: ' + fill + '; --ink: ' + textColorOn(fill) + '">' + escapeHtml(area.number) + '</span>';
}

function buildAreaItem(theme, area) {
  const id = 'sh-' + theme.id + '-' + area.number + '-details';
  const summary = theme.summary.map((k) => area[k]).filter(isFilled).join(' · ');
  const el = document.createElement('div');
  el.className = 'sh-item';
  el.dataset.number = area.number;
  el.dataset.address = area.number;   // the page scrolls to this row for #stakeholders/<theme>/<number> (navigation.js)
  el.style.setProperty('--c', areaColor(theme, area));
  el.innerHTML =
    '<button type="button" class="sh-row" aria-expanded="false" aria-controls="' + id + '" aria-label="' + escapeHtml(t('stakeholders.areaLabel', { number: area.number }) + ', ' + (area.zone || '')) + '">' +
      shBadgeHtml(theme, area) +
      '<span class="sh-row-text"><span class="sh-zone">' + textOrPlaceholder('sh-placeholder', area.zone, NO_DATA) + '</span>' +
      '<span class="sh-summary" title="' + escapeHtml(summary) + '">' + textOrPlaceholder('sh-placeholder', summary, NO_DATA) + '</span></span>' +
      '<span class="sh-chevron" aria-hidden="true"></span>' +
    '</button>' +
    '<div class="sh-details" id="' + id + '" hidden>' + shDetailsHtml(theme, area) + '</div>';
  return el;
}

// ---------- the map ----------

function createStakeholderMap(state) {
  const theme = state.theme;
  const items = state.order.map((n) => state.areas[n]);
  // the polygons of every area; the start view is the bounds of all of them
  items.forEach((item) => {
    const c = areaColor(theme, item.area);
    const rings = item.area.ellipses.map(ellipseLatLngs);
    item.polygons = rings.map((ring) => L.polygon(ring, areaStyle(c, '')));
    item.bounds = L.latLngBounds(rings.flat());
    item.polygons.forEach((poly) => {
      poly.on('click', () => selectStakeholderArea(theme.id, item.area.number, true));
      poly.on('mouseover', () => setStakeholderHover(theme.id, item.area.number));
      poly.on('mouseout', () => setStakeholderHover(null));
    });
    // the number marker in the middle of the area (the middle of its ellipse centres)
    const lat = item.area.ellipses.reduce((s, e) => s + e.lat, 0) / item.area.ellipses.length;
    const lon = item.area.ellipses.reduce((s, e) => s + e.lon, 0) / item.area.ellipses.length;
    item.marker = L.marker([lat, lon], {
      icon: L.divIcon({ className: 'sh-marker', html: shBadgeHtml(theme, item.area), iconSize: [28, 28], iconAnchor: [14, 14] }),
      title: t('stakeholders.areaLabel', { number: item.area.number }), riseOnHover: true
    });
    item.marker.on('click', () => selectStakeholderArea(theme.id, item.area.number, true));
    item.marker.on('mouseover', () => setStakeholderHover(theme.id, item.area.number));
    item.marker.on('mouseout', () => setStakeholderHover(null));
  });
  state.start = items.length ? L.latLngBounds(items.map((i) => i.bounds.getSouthWest()).concat(items.map((i) => i.bounds.getNorthEast()))) : undefined;

  const id = 'sh-' + theme.id;
  const map = createMap(id + '-map', id + '-zoom-in', id + '-zoom-out', id + '-reset', {
    startBounds: state.start || undefined,
    // the map can only be measured when its card is on screen: after every fit of the start view, an open area is shown again
    afterFit: (m, first) => {
      state.ready = true;
      if (state.open !== null) showStakeholderArea(state, state.open, true);
      if (first) refreshStakeholderAreas(state);
    }
  });
  state.map = map;
  // big areas first, so the small ones lie on top and stay clickable
  const bigFirst = items.slice().sort((a, b) => b.bounds.getSouthWest().distanceTo(b.bounds.getNorthEast()) - a.bounds.getSouthWest().distanceTo(a.bounds.getNorthEast()));
  bigFirst.forEach((item) => item.polygons.forEach((poly) => poly.addTo(map)));
  items.forEach((item) => item.marker.addTo(map));

  // the same buttons as the Mangrove maps map
  const tx = CONTENT.ecosystem.texts;
  setText(id + '-zoom-in', tx.zoomIn);
  setText(id + '-zoom-out', tx.zoomOut);
  setText(id + '-reset', tx.reset);
  $(id + '-reset').title = tx.resetTitle;
  setupBasemapButton(id + '-basemap', id + '-map', true);   // starts black and white
}

// Where the map goes for an area: the area plus some surroundings, never closer than SH_MIN_VIEW_METERS wide.
function stakeholderAreaView(state, number) {
  const map = state.map;
  let view = state.areas[number].bounds.pad(SH_VIEW_PADDING);
  const centre = view.getCenter();
  const halfLat = SH_MIN_VIEW_METERS / 2 / 111320;
  const halfLon = halfLat / Math.cos(centre.lat * Math.PI / 180);
  view = view.extend([centre.lat - halfLat, centre.lng - halfLon]).extend([centre.lat + halfLat, centre.lng + halfLon]);
  const zoom = Math.max(map.getMinZoom(), Math.min(map.getBoundsZoom(view, false, L.point(40, 40)), map.getMaxZoom()));
  return { centre: view.getCenter(), zoom };
}

// Moves the map to an area: flying, or at once (instant) when the map was just (re)fitted.
function showStakeholderArea(state, number, instant) {
  if (!state.ready) return;   // the map is not on screen yet: afterFit shows the open area when it is
  const v = stakeholderAreaView(state, number);
  if (instant) state.map.setView(v.centre, v.zoom, { animate: false });
  else state.map.flyTo(v.centre, v.zoom, { duration: SH_FLY_SECONDS });
}

function showStakeholderStart(state) {
  if (!state.ready || !state.start) return;
  state.map.flyToBounds(state.start, { paddingTopLeft: [START_PADDING, START_PADDING], paddingBottomRight: [START_PADDING, START_PADDING], duration: SH_FLY_SECONDS });
}

// ---------- selecting and highlighting ----------

// Opens an area (and closes the one that was open); selecting the open area closes it and returns to the start view.
// fromMap: the click was on the map, so the list scrolls to the row if it is out of view. forceOpen: do not toggle (an address).
function selectStakeholderArea(themeId, number, fromMap, forceOpen) {
  const state = shThemes[themeId];
  if (!state || !state.areas[number]) return;
  const previous = state.open;
  if (previous === number && !forceOpen) {
    state.open = null;
    refreshStakeholderAreas(state);
    showStakeholderStart(state);
    setStakeholderAddress(themeId, null);
    return;
  }
  state.open = number;
  refreshStakeholderAreas(state);
  if (previous !== number) showStakeholderArea(state, number, false);
  setStakeholderAddress(themeId, number);
  if (fromMap) state.areas[number].el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setStakeholderHover(themeId, number) {
  const before = shHover;
  shHover = themeId ? { themeId, number } : null;
  [before, shHover].forEach((h) => { if (h && shThemes[h.themeId]) refreshStakeholderAreas(shThemes[h.themeId]); });
}

// Draws the state of every area of a theme: open (solid outline, details shown), hovered, or normal; on the map and in the list.
function refreshStakeholderAreas(state) {
  state.order.forEach((number) => {
    const item = state.areas[number];
    const open = state.open === number;
    const hover = !!shHover && shHover.themeId === state.theme.id && shHover.number === number;
    const mode = open ? 'open' : hover ? 'hover' : '';
    const c = areaColor(state.theme, item.area);
    item.polygons.forEach((poly) => {
      poly.setStyle(areaStyle(c, mode));
      if (mode && state.ready) poly.bringToFront();   // (only once the map has its view: before that the polygon has no drawing yet)
    });
    const marker = item.marker.getElement();
    if (marker) {
      marker.classList.toggle('is-open', open);
      marker.classList.toggle('is-hover', hover);
    }
    item.el.classList.toggle('open', open);
    item.el.classList.toggle('hover', hover);
    item.row.setAttribute('aria-expanded', open);
    item.details.hidden = !open;
  });
}

// ---------- the address ----------

// #stakeholders/<theme>/<number> opens that area (navigation.js has already scrolled to the theme's part).
function applyStakeholderAddress() {
  const [screen, themeId, number] = location.hash.slice(1).split('/');
  if (screen !== 'stakeholders' || !themeId || !number) return;
  const state = shThemes[themeId];
  const key = state && state.order.find((n) => n.toLowerCase() === decodeURIComponent(number).toLowerCase());
  if (key !== undefined) selectStakeholderArea(themeId, key, false, true);
}

// The address follows the open area, without a new step in the browser history and without scrolling.
function setStakeholderAddress(themeId, number) {
  history.replaceState(null, '', '#stakeholders/' + themeId + (number === null ? '' : '/' + number));
}
