// stakeholders.js: the Stakeholder screen.
//   ONE map with the shapes of all three themes (Extent, Condition, Disturbance and recovery), that can be moved
//   and zoomed like the storm map, theme buttons, a timeline that is also the year filter, and a panel with what stakeholders said about the clicked spot.
// Reads: data/stakeholders/stakeholders.json (shapes and table rows, made by analysis/stakeholders/build-stakeholders.py)
//   and content/stakeholders.json (the team's years per row, theme names, colors of the three severities).
// Uses: helpers.js, content.js. Used by: main.js (setupStakeholders).

const STAKEHOLDER_DATA_FILE = 'data/stakeholders/stakeholders.json';
const STAKEHOLDER_CONTENT_FILE = 'content/stakeholders.json';
const SH_MAP_WIDTH = 1000;   // width of the map drawing; the height follows from the aspect ratio of the base map
const SH_BUBBLE = 14;        // radius of the number bubble on a shape (in map units)
const SH_ZOOM_STEP = 1.6, SH_ZOOM_MAX = 12;   // zoom buttons: the same steps as the storm map
const SH_HIT_MARGIN = 8;     // how far outside a thin shape a click or hover still counts as "on" it (in map units)

let shData = null;           // data/stakeholders/stakeholders.json, or null if it could not be loaded
let shContent = null;        // content/stakeholders.json, or null if it could not be loaded
let shRows = [];             // the table rows, each with its shapes, severity and years (see buildStakeholderRows)
let shYearMin = null;        // first year of the timeline (content/stakeholders.json "yearRange")
let shYear = null;           // the selected year; null means "All years" (the landing view)
const shThemeOn = {};        // per theme: true = its shapes and rows are shown
let shSelected = [];         // keys of the selected rows (a clicked spot can hold several)
const shView = { scale: 1, tx: 0, ty: 0 };   // zoom and move of the map (map units); scale 1 = the whole map

// ---------- loading and checking ----------

async function loadStakeholderFile(path) {
  let response;
  try {
    response = await fetch(path);
  } catch (err) {
    throw new ContentError(path, 'the file could not be loaded (' + err.message + ').');
  }
  if (!response.ok) throw new ContentError(path, 'the file could not be loaded (HTTP ' + response.status + ').');
  return parseJsonFile(await response.text(), path);
}

async function loadStakeholders() {
  try {
    const data = await loadStakeholderFile(STAKEHOLDER_DATA_FILE);
    const content = await loadStakeholderFile(STAKEHOLDER_CONTENT_FILE);
    checkStakeholders(data, content);
    shData = data;
    shContent = content;
    buildStakeholderRows();
    Object.keys(shData.themes).forEach((theme) => { shThemeOn[theme] = true; });
    shYearMin = shContent.yearRange.first;
    const slider = $('sh-slider');
    slider.min = shYearMin;
    slider.max = YEAR_MAX;
    slider.value = YEAR_MAX;
    $('sh-map').style.aspectRatio = String(shData.baseMap.aspectRatio);
    renderTrackYears();
  } catch (err) {
    // a problem in these files only affects the Stakeholder page: the message names the file
    $('sh-status').textContent = t('messages.couldNotLoadStakeholders', { error: err.message });
    console.error(err);
  }
  renderStakeholders();
}

// Checks that the files have the parts this screen needs.
function checkStakeholders(data, content) {
  const fail = (file, problem) => { throw new ContentError(file, problem); };
  if (!data || !data.themes || typeof data.themes !== 'object') fail(STAKEHOLDER_DATA_FILE, '"themes" is missing.');
  if (!Array.isArray(data.shapes)) fail(STAKEHOLDER_DATA_FILE, '"shapes" must be a list.');
  if (!Array.isArray(data.rows)) fail(STAKEHOLDER_DATA_FILE, '"rows" must be a list.');
  if (!data.baseMap || !data.baseMap.file || !isNumber(data.baseMap.aspectRatio)) fail(STAKEHOLDER_DATA_FILE, '"baseMap" needs a "file" and an "aspectRatio".');
  if (!content || !content.yearRange || !isNumber(content.yearRange.first)) fail(STAKEHOLDER_CONTENT_FILE, '"yearRange" needs a "first" year.');
  if (!content.themes || !content.severities || !content.timeline) fail(STAKEHOLDER_CONTENT_FILE, '"themes", "severities" and "timeline" are all needed.');

  // timeline entries that point to a row that does not exist (or have no start year) are ignored, with a note
  let skipped = 0;
  Object.entries(content.timeline).forEach(([theme, entries]) => {
    Object.entries(entries || {}).forEach(([id, entry]) => {
      const rowExists = data.rows.some((r) => r.theme === theme && r.id === id);
      const valid = entry === null || (entry && isNumber(entry.startYear));
      if (!rowExists || !valid) {
        skipped++;
        console.warn(STAKEHOLDER_CONTENT_FILE + ': timeline entry ' + theme + ' ' + id + ' is ignored (unknown row or no startYear).');
        entries[id] = null;
      }
    });
  });
  if (skipped > 0) $('sh-status').textContent = t('messages.stakeholderEntriesSkipped', { count: skipped });
}

// Joins every table row with its shapes on the map and its years in the timeline.
function buildStakeholderRows() {
  shRows = shData.rows.map((row) => {
    const shapes = shData.shapes.filter((s) => s.theme === row.theme && s.id === row.id);
    return Object.assign({}, row, {
      key: rowKey(row.theme, row.id),
      shapes: shapes,
      severity: shapes.length ? shapes[0].severity : null,
      natural: shapes.length > 0 && shapes[0].cause === 'natural',   // Condition: the filled number bubble
      timeline: ((shContent.timeline[row.theme] || {})[row.id]) || null
    });
  });
}

function setupStakeholders() {
  const slider = $('sh-slider');
  // moving the handle or using the arrows shows one year; the All years button switches back
  slider.addEventListener('input', () => setStakeholderYear(parseInt(slider.value, 10)));
  $('sh-year-back').addEventListener('click', () => setStakeholderYear(parseInt(slider.value, 10) - 1));
  $('sh-year-forward').addEventListener('click', () => setStakeholderYear(parseInt(slider.value, 10) + 1));
  $('sh-all-years').addEventListener('click', () => setStakeholderYear(shYear === null ? parseInt(slider.value, 10) : null));

  // theme buttons
  $('sh-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    shThemeOn[btn.dataset.theme] = !shThemeOn[btn.dataset.theme];
    dropInactiveSelection();
    renderStakeholders();
  });

  // the map, like the storm map: drag to move, + / - / Reset to zoom, hover shows the number and zone,
  // a click (without moving) lists everything at that spot
  const map = $('sh-map');
  let drag = null;
  map.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#sh-map-buttons')) return;
    map.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, tx: shView.tx, ty: shView.ty, moved: false };
  });
  map.addEventListener('pointermove', (e) => {
    if (drag) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      if (drag.moved) {
        const unit = SH_MAP_WIDTH / $('sh-svg').getBoundingClientRect().width;   // screen pixels -> map units
        shView.tx = drag.tx + (e.clientX - drag.x) * unit;
        shView.ty = drag.ty + (e.clientY - drag.y) * unit;
        applyStakeholderView();
        $('sh-hover').hidden = true;
        return;
      }
    }
    showStakeholderHover(e);
  });
  map.addEventListener('pointerup', (e) => {
    const wasClick = drag && !drag.moved;
    drag = null;
    if (!wasClick) return;
    const keys = [];
    shapesAt(mapPoint(e)).forEach((s) => { if (!keys.includes(rowKey(s.theme, s.id))) keys.push(rowKey(s.theme, s.id)); });
    shSelected = sortedKeys(keys);
    renderStakeholders();
  });
  map.addEventListener('pointercancel', () => { drag = null; });
  map.addEventListener('pointerleave', () => { drag = null; $('sh-hover').hidden = true; });

  const zoomButtons = {
    'sh-zoom-in': ['stormMap.zoomIn', () => zoomStakeholderMap(SH_MAP_WIDTH / 2, mapHeight() / 2, SH_ZOOM_STEP)],
    'sh-zoom-out': ['stormMap.zoomOut', () => zoomStakeholderMap(SH_MAP_WIDTH / 2, mapHeight() / 2, 1 / SH_ZOOM_STEP)],
    'sh-reset': ['stormMap.reset', () => { shView.scale = 1; shView.tx = 0; shView.ty = 0; renderStakeholderMap(); }]
  };
  Object.entries(zoomButtons).forEach(([id, [textPath, action]]) => {
    $(id).setAttribute('aria-label', t(textPath));
    $(id).addEventListener('click', () => { if (shData) action(); });
  });

  // clicking a bar in the timeline or a "Whole area" button selects that row (clicking it again deselects)
  const clickRow = (e) => {
    const el = e.target.closest('[data-key]');
    if (!el) return;
    const key = el.dataset.key;
    shSelected = (shSelected.length === 1 && shSelected[0] === key) ? [] : [key];
    renderStakeholders();
  };
  $('sh-rows').addEventListener('click', clickRow);
  $('sh-whole').addEventListener('click', clickRow);

  renderCertaintyLegend();
  loadStakeholders();
}

// ---------- small helpers ----------

function rowKey(theme, id) { return theme + ':' + id; }

function rowByKey(key) { return shRows.find((r) => r.key === key); }

function themeLabel(theme) { return shContent.themes[theme] ? shContent.themes[theme].label : theme; }

// "5a" sorts after "5" and before "6".
function idOrder(id) { return parseInt(id, 10) * 10 + (/[a-z]$/.test(id) ? id.charCodeAt(id.length - 1) - 96 : 0); }

// Row keys in the order of the themes, then by number.
function sortedKeys(keys) {
  const themes = Object.keys(shData.themes);
  return [...keys].sort((a, b) => {
    const ra = rowByKey(a), rb = rowByKey(b);
    return themes.indexOf(ra.theme) - themes.indexOf(rb.theme) || idOrder(ra.id) - idOrder(rb.id);
  });
}

// Label and colors of a severity: negative, at-risk or positive (content/stakeholders.json "severities").
function severityOf(severity) {
  const s = shContent.severities[severity];
  const colorVar = s ? colorVarOf(s.color) : colorVarOf(null);
  // "--c" is the severity color and "--c-tint" its light background (see css/stakeholders.css)
  return { label: s ? s.label : NO_DATA, style: '--c: var(' + colorVar + '); --c-tint: color-mix(in srgb, var(--c) 14%, var(--color-surface));' };
}

// What a severity means in one theme, e.g. "loss" for negative in Extent.
function severityMeaning(theme, severity) {
  const legend = shData.themes[theme].legend || {};
  return legend[severity === 'at-risk' ? 'atRisk' : severity] || '';
}

// The last year of a row. An ongoing row counts up to today (the last year of the range).
function rowEnd(row) {
  const tl = row.timeline;
  return (tl.ongoing || typeof tl.endYear !== 'number') ? YEAR_MAX : tl.endYear;
}

// Does this row show up now? Its theme must be on, and in a single year the row must run in that year.
// In "All years" every row of an active theme counts (also rows without years).
function rowActive(row) {
  if (!shThemeOn[row.theme]) return false;
  if (shYear === null) return true;
  return !!row.timeline && row.timeline.startYear <= shYear && shYear <= rowEnd(row);
}

// How the bar is drawn: "expected", "ongoing", "approximate" or "exact".
function barStyle(row) {
  const tl = row.timeline;
  if (tl.certainty === 'expected') return 'expected';
  if (tl.ongoing) return 'ongoing';
  return tl.certainty === 'approximate' ? 'approximate' : 'exact';
}

// "1988–1990", "1988" or "2005–today": made from the years, for the hover text of a bar.
function rowYears(row) {
  const tl = row.timeline;
  if (tl.ongoing) return tl.startYear + '–' + t('labels.today');
  const end = rowEnd(row);
  return end === tl.startYear ? String(tl.startYear) : tl.startYear + '–' + end;
}

// Position of a year on the track and on the bars, in percent of their shared width.
function yearPct(year) {
  const pct = (year - shYearMin) / (YEAR_MAX - shYearMin) * 100;
  return Math.min(100, Math.max(0, pct));
}

// A selected row that is no longer shown (theme off, other year) cannot stay selected.
function dropInactiveSelection() {
  shSelected = shSelected.filter((key) => rowActive(rowByKey(key)));
}

// ---------- the map: finding shapes at a point ----------

// The shapes that are shown now, largest first (so small shapes are drawn on top of large ones).
function visibleShapes() {
  return shData.shapes
    .filter((s) => rowActive(rowByKey(rowKey(s.theme, s.id))))
    .sort((a, b) => b.ellipse.width * b.ellipse.height - a.ellipse.width * a.ellipse.height);
}

function mapHeight() { return SH_MAP_WIDTH / shData.baseMap.aspectRatio; }

// Where the mouse is on the map, in map units (taking zoom and move into account).
function mapPoint(e) {
  const rect = $('sh-svg').getBoundingClientRect();
  const unit = SH_MAP_WIDTH / rect.width;
  return { x: ((e.clientX - rect.left) * unit - shView.tx) / shView.scale, y: ((e.clientY - rect.top) * unit - shView.ty) / shView.scale };
}

// Keeps the map covering the frame (no empty edges), then moves the drawing.
function applyStakeholderView() {
  shView.tx = Math.min(0, Math.max(SH_MAP_WIDTH * (1 - shView.scale), shView.tx));
  shView.ty = Math.min(0, Math.max(mapHeight() * (1 - shView.scale), shView.ty));
  const view = $('sh-view');
  if (view) view.setAttribute('transform', 'translate(' + shView.tx.toFixed(1) + ' ' + shView.ty.toFixed(1) + ') scale(' + shView.scale + ')');
}

// Zoom around a point of the frame (px, py in map units), like the storm map.
function zoomStakeholderMap(px, py, factor) {
  const scale = Math.max(1, Math.min(SH_ZOOM_MAX, shView.scale * factor));
  factor = scale / shView.scale;
  shView.tx = px - (px - shView.tx) * factor;
  shView.ty = py - (py - shView.ty) * factor;
  shView.scale = scale;
  renderStakeholderMap();
}

// All shown shapes that cover a point, smallest first (the one on top comes first).
function shapesAt(point) {
  if (!shData) return [];
  const hits = visibleShapes().filter((s) => {
    const e = s.ellipse;
    const dx = point.x - e.cx * SH_MAP_WIDTH, dy = point.y - e.cy * mapHeight();
    const a = e.rotation * Math.PI / 180;
    // the point in the rotated frame of the ellipse
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    // margin and bubble keep their size on screen, so in map units they shrink when zoomed in
    const margin = SH_HIT_MARGIN / shView.scale;
    const rx = e.width * SH_MAP_WIDTH / 2 + margin, ry = e.height * SH_MAP_WIDTH / 2 + margin;
    return (lx / rx) ** 2 + (ly / ry) ** 2 <= 1 || Math.hypot(dx, dy) <= (SH_BUBBLE + 2) / shView.scale;
  });
  return hits.reverse();
}

// Hover: the number and zone of the shape on top.
function showStakeholderHover(e) {
  const hover = $('sh-hover');
  if (!shData) return;
  const top = shapesAt(mapPoint(e))[0];
  if (!top) { hover.hidden = true; return; }
  const row = rowByKey(rowKey(top.theme, top.id));
  const rect = $('sh-map').getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  hover.innerHTML = '<b>' + escapeHtml(row.id) + ' · ' + textOrPlaceholder('sh-placeholder', row.zone, NO_DATA) + '</b>' +
    '<span class="sh-tooltip-years">' + escapeHtml(themeLabel(row.theme)) + '</span>';
  hover.hidden = false;
  hover.style.left = (x > rect.width * 0.6 ? x - hover.offsetWidth - 12 : x + 12) + 'px';
  hover.style.top = Math.max(0, y - hover.offsetHeight - 10) + 'px';
}

// ---------- changing the year ----------

function setStakeholderYear(year) {
  if (year !== null) {
    year = Math.min(YEAR_MAX, Math.max(shYearMin, year));
    $('sh-slider').value = year;
  }
  shYear = year;
  dropInactiveSelection();
  renderStakeholders();
}

// ---------- drawing ----------

function renderStakeholders() {
  renderStakeholderControls();
  renderThemeButtons();
  renderStakeholderMap();
  renderWholeArea();
  renderStakeholderRows();
  renderStakeholderPanel();
}

// Top row of the Time card and the handle (Figma year-filter and year-handle).
function renderStakeholderControls() {
  const all = shYear === null;
  $('sh-all-years').classList.toggle('on', all);
  $('sh-all-years').setAttribute('aria-pressed', all);
  $('sh-year-label').textContent = t(all ? 'labels.showing' : 'labels.year');
  $('sh-year-big').textContent = all ? t('labels.allYears') : shYear;
  // in All years the handle and its line are dimmed
  $('sh-time').classList.toggle('all-years', all);
  if (shYearMin !== null) $('sh-handle-line').style.left = yearPct(parseInt($('sh-slider').value, 10)) + '%';
}

// The three theme buttons: all on by default, each can be switched off.
function renderThemeButtons() {
  if (!shData) { $('sh-filters').innerHTML = ''; return; }
  $('sh-filters').innerHTML = '<span class="label-xs">' + escapeHtml(t('labels.themeFilter')) + '</span>' +
    Object.keys(shData.themes).map((theme) =>
      '<button type="button" class="sh-filter' + (shThemeOn[theme] ? ' on' : '') + '" data-theme="' + escapeHtml(theme) + '" aria-pressed="' + shThemeOn[theme] + '">' +
      escapeHtml(themeLabel(theme)) + '</button>').join('');
}

// Year labels under the track, every 5 years.
function renderTrackYears() {
  let html = '';
  for (let year = Math.ceil(shYearMin / 5) * 5; year <= YEAR_MAX; year += 5) {
    html += '<div class="sh-tick" style="left:' + yearPct(year) + '%"></div>' +
      '<div class="sh-year-label mono" style="left:' + yearPct(year) + '%">' + year + '</div>';
  }
  $('sh-track-years').innerHTML = html;
}

// The legend of the four bar styles (Figma certainty-legend), in a neutral grey.
function renderCertaintyLegend() {
  const styles = [['exact', 'labels.certaintyExact'], ['approximate', 'labels.certaintyApproximate'], ['ongoing', 'labels.certaintyOngoing'], ['expected', 'labels.certaintyExpected']];
  $('sh-certainty-legend').innerHTML = styles.map(([style, label]) =>
    '<div class="sh-certainty"><span class="sh-sample"><span class="sh-bar-shape ' + style + '"><i></i></span></span>' + escapeHtml(t(label)) + '</div>').join('');
}

// The map: the base map, all shapes of the active themes and years, the legend and messages.
function renderStakeholderMap() {
  const svg = $('sh-svg');
  if (!shData) {
    svg.innerHTML = '';
    $('sh-legend').innerHTML = '';
    $('sh-map-message').hidden = true;
    return;
  }
  const height = mapHeight();
  svg.setAttribute('viewBox', '0 0 ' + SH_MAP_WIDTH + ' ' + height);
  const shapes = visibleShapes();
  const selected = (s) => shSelected.includes(rowKey(s.theme, s.id));
  const style = (s) => severityOf(s.severity).style;

  // first all outlines (large ones underneath), then the number bubbles on top of them
  const outlines = shapes.map((s) => {
    const e = s.ellipse, cx = e.cx * SH_MAP_WIDTH, cy = e.cy * height;
    return '<ellipse class="sh-shape' + (selected(s) ? ' selected' : '') + '" style="' + style(s) + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
      '" rx="' + (e.width * SH_MAP_WIDTH / 2).toFixed(1) + '" ry="' + (e.height * SH_MAP_WIDTH / 2).toFixed(1) +
      '" transform="rotate(' + e.rotation + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')"/>';
  }).join('');
  const bubbles = shapes.map((s) => {
    const e = s.ellipse, cx = e.cx * SH_MAP_WIDTH, cy = e.cy * height;
    return '<g class="sh-bubble' + (s.cause === 'natural' ? ' natural' : '') + (selected(s) ? ' selected' : '') + '" style="' + style(s) + '">' +
      '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (SH_BUBBLE / shView.scale).toFixed(2) + '"/>' +
      '<text x="' + cx.toFixed(1) + '" y="' + cy.toFixed(1) + '" style="font-size:' + (15 / shView.scale).toFixed(2) + 'px">' + escapeHtml(s.id) + '</text></g>';
  }).join('');
  // everything that moves with the map sits in one group (see applyStakeholderView)
  svg.innerHTML = '<g id="sh-view"><image href="' + escapeHtml(shData.baseMap.file) + '" x="0" y="0" width="' + SH_MAP_WIDTH + '" height="' + height + '"/>' + outlines + bubbles + '</g>';
  applyStakeholderView();

  // nothing to show: say why on the map
  const anyTheme = Object.keys(shData.themes).some((theme) => shThemeOn[theme]);
  const none = shapes.length === 0;
  $('sh-map-message').hidden = !none;
  if (none) $('sh-map-message').textContent = !anyTheme ? t('messages.noThemeSelected') : (shYear !== null ? t('messages.noObservationsInYear', { year: shYear }) : t('messages.noThemeSelected'));

  renderStakeholderLegend();
}

// One legend: the three severities, and under each what it means per theme. Plus the cause symbols of Condition.
function renderStakeholderLegend() {
  const themes = Object.keys(shData.themes);
  const columns = Object.keys(shContent.severities).map((severity) => {
    const sev = severityOf(severity);
    return '<div class="sh-legend-col" style="' + sev.style + '">' +
      '<div class="lg"><span class="lg-dot" style="background: var(--c)"></span><b>' + escapeHtml(sev.label) + '</b></div>' +
      themes.map((theme) => '<div class="sh-legend-meaning">' + escapeHtml(themeLabel(theme)) + ': ' + escapeHtml(severityMeaning(theme, severity)) + '</div>').join('') +
      '</div>';
  }).join('');
  // the number bubble of a Condition shape: filled = natural cause, empty = anthropogenic cause
  const causes = shData.themes.condition && shData.themes.condition.causeLegend ? ['natural', 'anthropogenic'].map((cause) =>
    '<div class="lg"><span class="sh-sample-bubble' + (cause === 'natural' ? ' natural' : '') + '"></span>' +
    escapeHtml(themeLabel('condition') + ': ' + (shContent.causes && shContent.causes[cause] ? shContent.causes[cause] : cause)) + '</div>').join('') : '';
  $('sh-legend').innerHTML = columns + (causes ? '<div class="sh-legend-col sh-legend-causes">' + causes + '</div>' : '');
}

// Rows without a shape are listed here as "Whole area" and highlight nothing on the map.
function renderWholeArea() {
  const rows = shData ? shRows.filter((r) => !r.shapes.length && rowActive(r)) : [];
  $('sh-whole').hidden = rows.length === 0;
  if (rows.length === 0) return;
  $('sh-whole').innerHTML = '<div class="sh-whole-title"><b>' + escapeHtml(t('labels.wholeArea')) + '</b> ' + escapeHtml(t('labels.wholeAreaNote')) + '</div>' +
    rows.map((r) => '<button type="button" class="sh-whole-row' + (shSelected.includes(r.key) ? ' selected' : '') + '" data-key="' + escapeHtml(r.key) + '" aria-pressed="' + shSelected.includes(r.key) + '">' +
      '<span class="sh-whole-number">' + escapeHtml(r.id) + '</span>' + escapeHtml(themeLabel(r.theme)) + ': ' + textOrPlaceholder('sh-placeholder', r.zone, NO_DATA) + '</button>').join('');
}

// The timeline: per theme a heading, then one row per table row with the number on the left and the bar
// on the scale of the slider track. Themes that are switched off are left out.
function renderStakeholderRows() {
  if (!shData) { $('sh-rows').innerHTML = ''; return; }
  const oneYear = 100 / (YEAR_MAX - shYearMin);   // width of one year, in percent
  $('sh-rows').innerHTML = Object.keys(shData.themes).filter((theme) => shThemeOn[theme]).map((theme) => {
    const rows = shRows.filter((r) => r.theme === theme).sort((a, b) =>
      (a.timeline ? a.timeline.startYear : 9999) - (b.timeline ? b.timeline.startYear : 9999) || idOrder(a.id) - idOrder(b.id));
    return '<div class="sh-theme-row">' + escapeHtml(themeLabel(theme)) + '</div>' + rows.map((r) => {
      const sev = severityOf(r.severity);
      const state = (shSelected.includes(r.key) ? ' selected' : '') + (rowActive(r) ? '' : ' dimmed');
      const label = escapeHtml(t('labels.area', { number: r.id }) + ', ' + themeLabel(theme));
      if (!r.timeline) {
        // no years known: no bar, only a note (the row still shows in All years)
        return '<div class="sh-row' + state + '" style="' + sev.style + '"><div class="sh-row-number">' + escapeHtml(r.id) + '</div>' +
          '<div class="sh-row-scale"><button type="button" class="sh-nobar" data-key="' + escapeHtml(r.key) + '" aria-label="' + label + '">' + escapeHtml(t('labels.noPeriod')) + '</button></div></div>';
      }
      const end = rowEnd(r);
      // a bar runs from its start year to its end year; one single year is drawn one year wide, centered on it
      let left = yearPct(r.timeline.startYear), right = yearPct(end);
      if (end === r.timeline.startYear) { left = Math.max(0, left - oneYear / 2); right = Math.min(100, left + oneYear); }
      const tooltip = '<span class="sh-tooltip' + (left > 60 ? ' flip' : '') + '"><b>' + escapeHtml(r.id) + ' · ' + textOrPlaceholder('sh-placeholder', r.zone, NO_DATA) + '</b>' +
        '<span class="sh-tooltip-years">' + escapeHtml(rowYears(r)) + '</span>' +
        '<span class="lg"><span class="lg-dot" style="background: var(--c)"></span>' + escapeHtml(sev.label) + '</span></span>';
      return '<div class="sh-row' + state + '" style="' + sev.style + '">' +
        '<div class="sh-row-number">' + escapeHtml(r.id) + '</div>' +
        '<div class="sh-row-scale"><button type="button" class="sh-bar" data-key="' + escapeHtml(r.key) + '" aria-pressed="' + shSelected.includes(r.key) + '"' +
        ' aria-label="' + label + ', ' + escapeHtml(rowYears(r)) + '"' +
        ' style="left:' + left + '%; width:' + (right - left) + '%">' +
        '<span class="sh-bar-shape ' + barStyle(r) + '"><i></i></span>' + tooltip + '</button></div></div>';
    }).join('');
  }).join('');
}

// The panel on the right: everything at the clicked spot, grouped by theme, each row with what stakeholders said.
function renderStakeholderPanel() {
  const rows = shData ? shSelected.map(rowByKey) : [];
  $('sh-panel-empty').hidden = rows.length > 0;
  $('sh-panel-expand').hidden = rows.length === 0;
  $('sh-panel-content').hidden = rows.length === 0;
  if (rows.length === 0) return;

  const box = (title, body) => '<div class="observation-box"><div class="observation-title">' + escapeHtml(t(title)) + '</div>' + body + '</div>';
  // "-" in the table means: not applicable
  const textBox = (title, value) => box(title, '<div class="observation-text">' + textOrPlaceholder('sh-placeholder', value === '-' ? '' : value, NO_DATA) + '</div>');

  let html = rows.length > 1 ? '<div class="sh-spot-count">' + escapeHtml(t('labels.spotCount', { count: rows.length })) + '</div>' : '';
  Object.keys(shData.themes).forEach((theme) => {
    const inTheme = rows.filter((r) => r.theme === theme);
    if (inTheme.length === 0) return;
    html += '<div class="sh-theme-heading">' + escapeHtml(shData.themes[theme].title) + '</div>';
    html += inTheme.map((r) => renderRowDetail(r, box, textBox)).join('');
  });
  $('sh-panel-content').innerHTML = html;
}

// One table row: header, the columns of the table and the stakeholder entries (code and group, never names).
function renderRowDetail(r, box, textBox) {
  const sev = severityOf(r.severity);
  const whatKey = r.theme === 'condition' ? 'labels.signal' : (r.theme === 'disturbance' ? 'labels.disturbance' : 'labels.change');
  const what = r.change !== undefined ? r.change : (r.signal !== undefined ? r.signal : r.disturbance);
  const meaning = r.severity ? sev.label + ': ' + severityMeaning(r.theme, r.severity) : t('labels.wholeArea');
  const causeBadge = r.theme === 'condition' && r.shapes.length && shContent.causes
    ? '<span class="class-badge"><span class="sh-sample-bubble' + (r.natural ? ' natural' : '') + '"></span>' + escapeHtml(shContent.causes[r.natural ? 'natural' : 'anthropogenic']) + '</span>' : '';
  const entries = r.stakeholders.map((s) =>
    '<div class="sh-quote"><div class="sh-quote-name"><b>' + escapeHtml(s.code) + '</b> · ' + escapeHtml(s.group) + '</div>' +
    '<div class="observation-text">“' + escapeHtml(s.text) + '”</div></div>').join('');

  return '<div class="sh-row-detail" style="' + sev.style + '">' +
    '<div class="area-header">' +
      '<div><div class="area-number">' + escapeHtml(t('labels.area', { number: r.id })) + '</div>' +
      '<div class="area-zone">' + textOrPlaceholder('sh-placeholder', r.zone, NO_DATA) + '</div></div>' +
      '<div class="area-meta"><span class="class-badge"><span class="lg-dot" style="background: var(--c)"></span>' + escapeHtml(meaning) + '</span>' + causeBadge + '</div>' +
    '</div>' +
    '<div class="observation">' +
      '<div class="observation-pair">' + textBox(whatKey, what) + textBox('labels.period', r.period) + '</div>' +
      (r.cause !== undefined ? textBox('labels.cause', r.cause) : '') +
      (r.recovery !== undefined ? '<div class="observation-pair">' + textBox('labels.recovery', r.recovery) + textBox('labels.recoveryMode', r.recoveryMode) + '</div>' : '') +
      box('labels.stakeholders', entries || '<div class="observation-text">' + textOrPlaceholder('sh-placeholder', '', NO_DATA) + '</div>') +
    '</div></div>';
}
