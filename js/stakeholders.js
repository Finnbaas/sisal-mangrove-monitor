// stakeholders.js: the Stakeholder screen.
//   One map (Leaflet, the same base map, start view and zoom limits as the Mangrove maps map) with a menu of three themes
//   (Extent, Condition, Disturbance & recovery). The theme chooses which areas (rotated ellipses with a number marker) are on
//   the map, the legend, the rows of the timeline and what the panel shows. The slider of the timeline is also its time axis:
//   it shows only the areas that were happening in that year. Clicking an area (map or timeline bar) shows what stakeholders
//   said about it in the panel and flies the map to it (the area plus some surroundings); clicking it again clears the panel
//   and returns to the start view. Changing the theme also returns the map to the start view.
//   Address: #stakeholders/<theme> and #stakeholders/<theme>/<number>, e.g. #stakeholders/disturbance-recovery/5.
// Reads: content/stakeholders.json (themes and areas, written by the team); the base map comes from data/vegetation/layers.json
//   (loaded by ecosystem.js). Nothing is typed in this file: every text, number and color comes from content/.
// Uses: helpers.js, content.js, ecosystem.js (createMap, buildMenuTabs, setupBasemapButton, setText, ecoLayersLoaded) and Leaflet (CDN).
// Used by: main.js (setupStakeholders).

const STAKEHOLDER_FILE = 'content/stakeholders.json';
const SH_ELLIPSE_STEPS = 72;       // corners of the polygon that draws one ellipse
const SH_CERTAINTY = ['exact', 'approximate', 'expected'];
const SH_FLY_SECONDS = 0.8;        // duration of the flight to an area and back
const SH_MIN_VIEW_METERS = 1600;   // flying to an area: the view is at least this wide, so a small area shows its surroundings
const SH_HIT_PIXELS = 10;          // width of the invisible click area around an ellipse
const SH_VIEW_PADDING = 0.6;       // ... and the area itself gets this much extra space around it (share of its size)

let stakeholders = null;     // contents of content/stakeholders.json, or null if it could not be loaded
let shTheme = null;          // id of the theme on the map
let shYear = null;           // the selected year; null means "All years" (the start view)
let shSelected = null;       // number of the selected area (of the theme on the map), or null
let shHover = null;          // number of the area under the mouse (map or timeline), or null
let shScaleStart = null;     // first year of the time scale: the earliest start year of all areas of all themes
let shMap = null;            // the Leaflet map
let shReady = false;         // true when the map has its view
const shItems = {};          // "theme/number" -> { area, polygons, marker, size, bounds } (the drawings of one area)

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
    if (!Array.isArray(th.panel)) fail(n + ' ("' + th.id + '") needs a list "panel" (rows of field keys).');
  });
  let skipped = 0;
  const numbers = new Set();
  content.areas = content.areas.filter((a) => {
    const theme = a && content.themes.find((th) => th.id === a.theme);
    const ellipseOk = (e) => e && ['lat', 'lon', 'radiusXM', 'radiusYM', 'rotationDeg'].every((k) => isNumber(e[k]));
    const yearsOk = a && isNumber(a.startYear) && typeof a.ongoing === 'boolean' && SH_CERTAINTY.includes(a.certainty) && (a.ongoing || isNumber(a.endYear));
    const ok = theme && a.number !== undefined && theme.legend.some((l) => l.id === a.class) && yearsOk &&
      Array.isArray(a.ellipses) && a.ellipses.length > 0 && a.ellipses.every(ellipseOk) && !numbers.has(a.theme + '/' + a.number);
    if (!ok) {
      skipped++;
      console.warn(STAKEHOLDER_FILE + ': an area without a "number", a known "theme" and "class", "startYear", "endYear" (or "ongoing": true), "ongoing", "certainty" ("exact", "approximate" or "expected") and a complete "ellipses" list, or with a number that is used twice, is not shown (area ' + (a && a.number) + ').');
    } else {
      a.number = String(a.number);
      numbers.add(a.theme + '/' + a.number);
    }
    return ok;
  });
  return skipped;
}

// A message on the map card (the details are in the browser console).
function showStakeholderMessage(text) {
  $('sh-status').textContent = text;
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

  // the time scale is the same for every theme: from the earliest start year of all areas to the last year of the year range
  shScaleStart = Math.min(...stakeholders.areas.map((a) => a.startYear));
  shTheme = stakeholders.themes[0].id;
  setupStakeholderMap();
  setupStakeholderTimeControls();
  renderTrackYears();
  renderStakeholderCertaintyLegend();
  applyStakeholderAddress();
  renderStakeholders();
  window.addEventListener('hashchange', () => {
    applyStakeholderAddress();
    renderStakeholders();
    if (shSelected !== null) showStakeholderArea(shSelected, false);   // a link to an area
  });
}

// ---------- small helpers ----------

function themeById(id) { return stakeholders.themes.find((th) => th.id === id); }
function areasOfTheme(id) { return stakeholders.areas.filter((a) => a.theme === id); }
function currentTheme() { return themeById(shTheme); }

// The name of a theme in the menu: the same as in the Maps menu of the Mangrove maps (content/ecosystem.json).
function themeLabel(theme) {
  const group = CONTENT.ecosystem.mapMenu.groups.find((g) => g.id === theme.menuGroup);
  return group ? group.label : theme.title;
}

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

// The last year of an area. An ongoing area counts up to today (the last year of the year range).
function areaEnd(a) { return a.ongoing || !isNumber(a.endYear) ? YEAR_MAX : a.endYear; }

// Was this area happening in the selected year? In "All years" every area counts.
function areaActive(a) { return shYear === null || (a.startYear <= shYear && shYear <= areaEnd(a)); }

// How the bar is drawn: "expected", "ongoing", "approximate" or "exact".
function areaBarStyle(a) {
  if (a.certainty === 'expected') return 'expected';
  if (a.ongoing) return 'ongoing';
  return a.certainty === 'approximate' ? 'approximate' : 'exact';
}

// Position of a year on the track and on the bars, in percent of their shared width.
function yearPct(year) {
  const pct = (year - shScaleStart) / (YEAR_MAX - shScaleStart) * 100;
  return Math.min(100, Math.max(0, pct));
}

// The value of one field of an area, as text: a missing or empty value is "No data"; a field with "values" shows the label of its id.
function shFieldText(theme, item, field) {
  let value = item[field.key];
  if (field.values && isFilled(value)) {
    const entry = (theme[field.values] || []).find((x) => x.id === value);
    if (entry) value = entry.label;
  }
  return textOrPlaceholder('sh-placeholder', value, NO_DATA);
}

// ---------- the map ----------

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

// Style of an area on the map: class color at 25 %, thin dashed outline; hovered: a bit stronger; selected: solid, thicker outline.
function areaStyle(c, state) {
  return { color: c, weight: state === 'open' ? 3.5 : state === 'hover' ? 2.5 : 1.5, dashArray: state === 'open' ? null : '6 5', opacity: 1, fillColor: c, fillOpacity: state ? 0.4 : 0.25 };
}

// The number marker, on the map and in the panel: class color outline, white fill (Condition: grey when the cause is natural).
function shBadgeHtml(theme, area) {
  const fill = markerFill(theme, area);
  return '<span class="sh-badge" style="--c: ' + areaColor(theme, area) + '; --fill: ' + fill + '; --ink: ' + textColorOn(fill) + '">' + escapeHtml(area.number) + '</span>';
}

// One map for all themes. The map is made by createMap (ecosystem.js) without a start view of its own, so it starts with
// the same view, padding and zoom limits as the Mangrove maps map; the Reset button goes back to that view.
function setupStakeholderMap() {
  stakeholders.areas.forEach((area) => {
    const theme = themeById(area.theme);
    const c = areaColor(theme, area);
    const rings = area.ellipses.map(ellipseLatLngs);
    const item = { area, polygons: rings.map((ring) => L.polygon(ring, areaStyle(c, ''))), marker: null };
    // an invisible, wider copy of each ellipse takes the clicks, so a thin ellipse is easy to hit (the whole shape and a few pixels around it)
    item.hits = rings.map((ring) => L.polygon(ring, { weight: SH_HIT_PIXELS, opacity: 0, fill: true, fillOpacity: 0 }));
    const bounds = L.latLngBounds(rings.flat());
    item.bounds = bounds;
    item.size = bounds.getSouthWest().distanceTo(bounds.getNorthEast());
    // the number marker in the middle of the area (the middle of its ellipse centres)
    const lat = area.ellipses.reduce((s, e) => s + e.lat, 0) / area.ellipses.length;
    const lon = area.ellipses.reduce((s, e) => s + e.lon, 0) / area.ellipses.length;
    item.marker = L.marker([lat, lon], {
      icon: L.divIcon({ className: 'sh-marker', html: shBadgeHtml(theme, area), iconSize: [28, 28], iconAnchor: [14, 14] }),
      title: t('stakeholders.areaLabel', { number: area.number }), riseOnHover: true
    });
    [item.marker].concat(item.polygons, item.hits).forEach((layer) => {
      layer.on('click', () => selectStakeholderArea(area.number));
      layer.on('mouseover', () => setStakeholderHover(area.number));
      layer.on('mouseout', () => setStakeholderHover(null));
    });
    shItems[area.theme + '/' + area.number] = item;
  });

  shMap = createMap('sh-map', 'sh-zoom-in', 'sh-zoom-out', 'sh-reset', {
    fillMap: true,   // the map is wider than tall: no empty bands at its sides
    alignTop: true,  // ... and the north-east of the study area (where the areas are) is not cut off
    // the map can only be measured when its card is on screen; after every (re)fit of the start view a selected area is shown again
    afterFit: () => {
      if (!shReady) { shReady = true; refreshStakeholderStyles(); }
      if (shSelected !== null) showStakeholderArea(shSelected, true);
    }
  });
  // the same buttons as the Mangrove maps map
  const tx = CONTENT.ecosystem.texts;
  setText('sh-zoom-in', tx.zoomIn);
  setText('sh-zoom-out', tx.zoomOut);
  setText('sh-reset', tx.reset);
  $('sh-reset').title = tx.resetTitle;
  setupBasemapButton('sh-basemap', 'sh-map', true);   // starts black and white
}

// Where the map goes for an area: the area plus some surroundings, never closer than SH_MIN_VIEW_METERS wide.
function stakeholderAreaView(number) {
  let view = shItems[shTheme + '/' + number].bounds.pad(SH_VIEW_PADDING);
  const centre = view.getCenter();
  const halfLat = SH_MIN_VIEW_METERS / 2 / 111320;
  const halfLon = halfLat / Math.cos(centre.lat * Math.PI / 180);
  view = view.extend([centre.lat - halfLat, centre.lng - halfLon]).extend([centre.lat + halfLat, centre.lng + halfLon]);
  const zoom = Math.max(shMap.getMinZoom(), Math.min(shMap.getBoundsZoom(view, false, L.point(40, 40)), shMap.getMaxZoom()));
  return { centre: view.getCenter(), zoom };
}

// Centres the map on an area and zooms to it: flying, or at once (instant) when the map was just (re)fitted.
function showStakeholderArea(number, instant) {
  if (!shReady) return;   // the map is not on screen yet: afterFit shows the selected area when it is
  const v = stakeholderAreaView(number);
  if (instant) shMap.setView(v.centre, v.zoom, { animate: false });
  else shMap.flyTo(v.centre, v.zoom, { duration: SH_FLY_SECONDS });
}

// Back to the start view (the same as the Reset button).
function showStakeholderStart() {
  if (shReady) shMap.flyToStart();
}

// Puts the areas of the theme that were happening in the selected year on the map (big areas first, so small ones stay clickable).
// The view of the map is not changed.
function renderStakeholderMap() {
  Object.values(shItems).forEach((item) => { item.polygons.concat(item.hits).forEach((p) => p.remove()); item.marker.remove(); });
  const visible = areasOfTheme(shTheme).filter(areaActive).map((a) => shItems[shTheme + '/' + a.number]);
  const bigFirst = visible.slice().sort((a, b) => b.size - a.size);
  bigFirst.forEach((item) => item.polygons.forEach((p) => p.addTo(shMap)));
  bigFirst.forEach((item) => item.hits.forEach((p) => p.addTo(shMap)));   // above all ellipses; small areas last, so they win where areas overlap
  visible.forEach((item) => item.marker.addTo(shMap));
  // a year without areas: say so on the map
  const none = visible.length === 0;
  $('sh-map-message').hidden = !none;
  if (none) $('sh-map-message').innerHTML = '<span>' + escapeHtml(t('stakeholders.noAreasInYear', { year: shYear })) + '</span>';
  refreshStakeholderStyles();
}

// Draws the state of every visible area: selected (solid, thicker outline), hovered, or normal; on the map and in the timeline.
function refreshStakeholderStyles() {
  const theme = currentTheme();
  areasOfTheme(shTheme).forEach((area) => {
    const item = shItems[shTheme + '/' + area.number];
    const selected = shSelected === area.number;
    const hover = shHover === area.number;
    const mode = selected ? 'open' : hover ? 'hover' : '';
    const c = areaColor(theme, area);
    item.polygons.forEach((poly) => poly.setStyle(areaStyle(c, mode)));
    const marker = item.marker.getElement();
    if (marker) {
      marker.classList.toggle('is-open', selected);
      marker.classList.toggle('is-hover', hover);
    }
  });
  document.querySelectorAll('#sh-rows .sh-row').forEach((row) => {
    row.classList.toggle('selected', row.dataset.number === shSelected);
    row.classList.toggle('hover', row.dataset.number === shHover);
  });
}

// ---------- the legend, the menu and the heading ----------

// Title and subtitle of the theme in the header of the map card.
function renderStakeholderHeading() {
  const theme = currentTheme();
  setText('sh-title', theme.title);
  setText('sh-subtitle', theme.subtitle || '');
}

// The legend under the map: one swatch per class, and for Condition the two markers (natural / anthropogenic cause).
function renderStakeholderLegend() {
  const theme = currentTheme();
  const swatches = theme.legend.map((l) => '<span class="sh-legend-item" style="--c: var(' + colorVarOf(l.color) + ')"><span class="sh-swatch"></span>' + escapeHtml(l.label) + '</span>');
  const markers = (theme.markerLegend || []).map((m) => '<span class="sh-legend-item"><span class="sh-badge sh-badge-small" style="--c: var(--color-text-muted); --fill: var(' + colorVarOf(m.fill) + ')"></span>' + escapeHtml(m.label) + '</span>');
  $('sh-legend').innerHTML = swatches.concat(markers).join('');
}

// The theme menu: the same tabs as the Maps menu of the Mangrove maps (buildMenuTabs in ecosystem.js). focus = the tab that keeps the keyboard focus.
function renderStakeholderMenu(focus) {
  const box = $('sh-menu');
  box.innerHTML = '';
  box.appendChild(buildMenuTabs(stakeholders.themes.map((th) => ({ id: th.id, label: themeLabel(th) })), shTheme, (id, key) => setStakeholderTheme(id, key), t('stakeholders.menuTitle')));
  const target = focus && box.querySelector('[data-focus="' + focus + '"]');
  if (target) target.focus();
}

// ---------- the timeline ----------

function setupStakeholderTimeControls() {
  const slider = $('sh-slider');
  slider.min = shScaleStart;
  slider.max = YEAR_MAX;
  slider.value = YEAR_MAX;
  // moving the handle or using the arrows shows one year; the All years button switches back
  slider.addEventListener('input', () => setStakeholderYear(parseInt(slider.value, 10)));
  $('sh-year-back').addEventListener('click', () => setStakeholderYear(parseInt(slider.value, 10) - 1));
  $('sh-year-forward').addEventListener('click', () => setStakeholderYear(parseInt(slider.value, 10) + 1));
  $('sh-all-years').addEventListener('click', () => setStakeholderYear(shYear === null ? parseInt(slider.value, 10) : null));
  // clicking a bar of the timeline selects that area (clicking it again clears the panel)
  $('sh-rows').addEventListener('click', (e) => {
    const bar = e.target.closest('[data-area]');
    if (bar) selectStakeholderArea(bar.dataset.area);
  });
}

// Top row of the Time card and the handle (Figma year-filter and year-handle).
function renderStakeholderControls() {
  const all = shYear === null;
  const handleYear = parseInt($('sh-slider').value, 10);
  $('sh-all-years').classList.toggle('on', all);
  $('sh-all-years').setAttribute('aria-pressed', all);
  $('sh-year-label').textContent = t(all ? 'stakeholders.showing' : 'labels.year');
  $('sh-year-big').textContent = all ? t('stakeholders.allYears') : shYear;
  // in All years the handle and its line are dimmed
  $('sh-time').classList.toggle('all-years', all);
  $('sh-handle-line').style.left = yearPct(handleYear) + '%';
}

// Year labels under the track, every 5 years.
function renderTrackYears() {
  let html = '';
  for (let year = Math.ceil(shScaleStart / 5) * 5; year <= YEAR_MAX; year += 5) {
    html += '<div class="sh-tick" style="left:' + yearPct(year) + '%"></div>' +
      '<div class="sh-year-label mono" style="left:' + yearPct(year) + '%">' + year + '</div>';
  }
  $('sh-track-years').innerHTML = html;
}

// The legend of the four bar styles (Figma certainty-legend), in a neutral grey.
function renderStakeholderCertaintyLegend() {
  const styles = [['exact', 'certaintyExact'], ['approximate', 'certaintyApproximate'], ['ongoing', 'certaintyOngoing'], ['expected', 'certaintyExpected']];
  $('sh-certainty-legend').innerHTML = styles.map(([style, key]) =>
    '<div class="sh-certainty"><span class="sh-sample"><span class="sh-bar-shape ' + style + '"><i></i></span></span>' + escapeHtml(t('stakeholders.' + key)) + '</div>').join('');
}

// One row per area of the theme: the area number on the left and the bar on the scale of the slider track.
function renderStakeholderRows() {
  const theme = currentTheme();
  const oneYear = 100 / (YEAR_MAX - shScaleStart);   // width of one year, in percent
  $('sh-rows').innerHTML = areasOfTheme(shTheme).map((a) => {
    // a bar runs from its start year to its end year; one single year is drawn one year wide, centered on it
    const end = areaEnd(a);
    let left = yearPct(a.startYear), right = yearPct(end);
    if (end === a.startYear) { left = Math.max(0, left - oneYear / 2); right = Math.min(100, left + oneYear); }
    const entry = theme.legend.find((l) => l.id === a.class);
    const tooltip = '<span class="sh-tooltip' + (left > 60 ? ' flip' : '') + '"><b>' + textOrPlaceholder('sh-placeholder', a.zone, NO_DATA) + '</b>' +
      '<span class="sh-tooltip-years">' + textOrPlaceholder('sh-placeholder', a[theme.periodKey], NO_DATA) + '</span>' +
      '<span class="lg"><span class="lg-dot" style="background: var(--c)"></span>' + escapeHtml(entry ? entry.label : '') + '</span></span>';
    return '<div class="sh-row' + (areaActive(a) ? '' : ' dimmed') + '" data-number="' + escapeHtml(a.number) + '" style="--c: ' + areaColor(theme, a) + '">' +
      '<div class="sh-row-number">' + escapeHtml(a.number) + '</div>' +
      '<div class="sh-row-scale"><button type="button" class="sh-bar" data-area="' + escapeHtml(a.number) + '" aria-pressed="' + (a.number === shSelected) + '"' +
      ' aria-label="' + escapeHtml(t('stakeholders.areaLabel', { number: a.number }) + (a.zone ? ', ' + a.zone : '')) + '"' +
      ' style="left:' + left + '%; width:' + (right - left) + '%">' +
      '<span class="sh-bar-shape ' + areaBarStyle(a) + '"><i></i></span>' + tooltip + '</button></div></div>';
  }).join('');
  // hovering a row highlights the area on the map
  $('sh-rows').querySelectorAll('.sh-row').forEach((row) => {
    row.addEventListener('mouseenter', () => setStakeholderHover(row.dataset.number));
    row.addEventListener('mouseleave', () => setStakeholderHover(null));
  });
  refreshStakeholderStyles();
}

// ---------- the panel ----------

// One box of the panel: small label + value.
function shBoxHtml(title, valueHtml) {
  return '<div class="observation-box"><div class="observation-title">' + escapeHtml(title) + '</div><div class="observation-text">' + valueHtml + '</div></div>';
}

// The quotes: every quote with its stakeholder code and type.
function shQuotesHtml(item) {
  return (item.quotes || []).map((q) =>
    '<div class="sh-quote"><div class="sh-quote-head"><b>' + escapeHtml(q.code) + '</b> <span>' + textOrPlaceholder('sh-placeholder', q.type, NO_DATA) + '</span></div>' +
    '<div class="observation-text">' + textOrPlaceholder('sh-placeholder', q.text, NO_DATA) + '</div></div>').join('');
}

function shQuotesBoxHtml(item) {
  return '<div class="observation-box"><div class="observation-title">' + escapeHtml(stakeholders.quotesLabel) + '</div>' +
    (shQuotesHtml(item) || '<div class="observation-text">' + textOrPlaceholder('sh-placeholder', '', NO_DATA) + '</div>') + '</div>';
}

// The panel: what stakeholders said about the selected area, or the empty state.
function renderStakeholderPanel() {
  const theme = currentTheme();
  const area = shSelected !== null ? shItems[shTheme + '/' + shSelected].area : null;
  $('sh-panel-empty').hidden = !!area;
  $('sh-panel-content').hidden = !area;
  if (!area) {
    setText('sh-panel-empty-text', t('stakeholders.emptyPanel'));
    renderStakeholderNote(theme);
    return;
  }
  const entry = theme.legend.find((l) => l.id === area.class);
  // the rows of boxes of this theme (content/stakeholders.json "panel"): two keys = side by side
  const rows = theme.panel.map((keys) => {
    const boxes = keys.map((key) => {
      const field = theme.fields.find((f) => f.key === key) || { key, label: key };
      return shBoxHtml(field.label, shFieldText(theme, area, field));
    }).join('');
    return keys.length > 1 ? '<div class="observation-pair">' + boxes + '</div>' : boxes;
  }).join('');
  $('sh-panel-content').style.cssText = '--c: ' + areaColor(theme, area);
  $('sh-panel-content').innerHTML =
    '<div class="area-header">' +
      '<div><div class="area-number">' + escapeHtml(t('stakeholders.areaLabel', { number: area.number })) + '</div>' +
      '<div class="area-zone">' + textOrPlaceholder('sh-placeholder', area.zone, NO_DATA) + '</div></div>' +
      '<div class="area-meta"><span class="class-badge"><span class="lg-dot" style="background: var(--c)"></span>' + escapeHtml(entry ? entry.label : '') + '</span></div>' +
    '</div>' +
    '<div class="observation">' + rows + shQuotesBoxHtml(area) + '</div>';
}

// Condition: the observation that belongs to no area on the map (the number on the map is "-" in the interview table), as a short
// note in the empty state of the panel: the zone and the first row of the panel; the rest is behind "More details".
function renderStakeholderNote(theme) {
  const box = $('sh-panel-note');
  const notes = theme.notes || [];
  box.hidden = notes.length === 0;
  const short = ['zone'].concat(theme.panel[0] || []);
  const rest = theme.fields.filter((f) => !short.includes(f.key) && f.key !== 'zone');
  box.innerHTML = notes.map((note) =>
    '<div class="sh-note"><div class="sh-note-label">' + escapeHtml(t('stakeholders.noteLabel')) + '</div>' +
    '<div class="sh-fields">' + short.map((key) => {
      const field = theme.fields.find((f) => f.key === key) || { key, label: key };
      return '<div class="sh-field"><div class="sh-field-label">' + escapeHtml(field.label) + '</div><div class="sh-field-value">' + shFieldText(theme, note, field) + '</div></div>';
    }).join('') + '</div>' +
    '<details class="sh-note-more"><summary>' + escapeHtml(t('stakeholders.noteMore')) + '</summary>' +
    '<div class="sh-fields">' + rest.filter((f) => f.key in note).map((f) =>
      '<div class="sh-field"><div class="sh-field-label">' + escapeHtml(f.label) + '</div><div class="sh-field-value">' + shFieldText(theme, note, f) + '</div></div>').join('') + '</div>' +
    '<div class="sh-quotes"><div class="sh-field-label">' + escapeHtml(stakeholders.quotesLabel) + '</div>' + shQuotesHtml(note) + '</div></details></div>').join('');
}

// ---------- changing the theme, the year and the selection ----------

function renderStakeholders(focus) {
  renderStakeholderHeading();
  renderStakeholderMenu(focus);
  renderStakeholderLegend();
  renderStakeholderControls();
  renderStakeholderMap();
  renderStakeholderRows();
  renderStakeholderPanel();
}

// Another theme: other ellipses, legend, rows and panel; a map that was zoomed in goes back to the start view.
function setStakeholderTheme(id, focus) {
  if (id === shTheme) return;
  shTheme = id;
  shSelected = null;
  shHover = null;
  showStakeholderStart();
  setStakeholderAddress();
  renderStakeholders(focus);
}

function setStakeholderYear(year) {
  if (year !== null) {
    year = Math.min(YEAR_MAX, Math.max(shScaleStart, year));
    $('sh-slider').value = year;
  }
  shYear = year;
  // an area that was not happening in the new year is no longer on the map, so it cannot stay selected
  if (shSelected !== null && !areaActive(shItems[shTheme + '/' + shSelected].area)) { shSelected = null; setStakeholderAddress(); }
  renderStakeholderControls();
  renderStakeholderMap();
  renderStakeholderRows();
  renderStakeholderPanel();
}

// Selecting an area shows it in the panel and flies the map to it; selecting the selected area again clears the panel and
// returns to the start view.
function selectStakeholderArea(number) {
  if (!shItems[shTheme + '/' + number]) return;
  shSelected = shSelected === number ? null : number;
  if (shSelected !== null) showStakeholderArea(shSelected, false);
  else showStakeholderStart();
  setStakeholderAddress();
  refreshStakeholderStyles();
  document.querySelectorAll('#sh-rows .sh-bar').forEach((bar) => bar.setAttribute('aria-pressed', bar.dataset.area === shSelected));
  renderStakeholderPanel();
}

function setStakeholderHover(number) {
  shHover = number;
  refreshStakeholderStyles();
}

// ---------- the address ----------

// #stakeholders/<theme> shows that theme, #stakeholders/<theme>/<number> also selects the area (the map does not move).
function applyStakeholderAddress() {
  const [screen, themeId, number] = location.hash.slice(1).split('/');
  if (screen !== 'stakeholders' || !themeId || !themeById(themeId)) return;
  if (themeId !== shTheme) { shTheme = themeId; shSelected = null; shHover = null; }
  if (number) {
    const key = areasOfTheme(themeId).map((a) => a.number).find((n) => n.toLowerCase() === decodeURIComponent(number).toLowerCase());
    if (key !== undefined && areaActive(shItems[themeId + '/' + key].area)) shSelected = key;
  }
}

// The address follows the theme and the selected area, without a new step in the browser history and without scrolling.
function setStakeholderAddress() {
  history.replaceState(null, '', '#stakeholders/' + shTheme + (shSelected === null ? '' : '/' + shSelected));
}
