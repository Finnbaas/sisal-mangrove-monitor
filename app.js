// ---------- content (set from content/variables.json and content/texts.json, see readPointContent) ----------
// No research content is written in this file: variables, labels, units, classes, scenarios and
// metrics all come from the content/ folder. "colorVar" is the name of a color variable in style.css.

let YEAR_MIN, YEAR_MAX;   // the year range (variables.json "yearRange")
let CLASSES = {};         // change classes of the points (variables.json "changeClasses")
let SCENARIOS = {};       // tipping-point scenarios (variables.json "scenarios")
let VARS = [];            // variables of the point charts (variables.json "pointVariables")
let METRICS = [];         // rows of the trend signals card (variables.json "trendMetrics")
let NO_DATA = 'No data';  // text shown wherever a value is missing (texts.json "messages.noData")
let UNKNOWN = { label: NO_DATA, colorVar: '--color-text-faint', desc: '' };   // a missing class or scenario
const checked = {};       // which variables are switched on in the point chart

let allPoints = [];
let selectedId = null;

const $ = (id) => document.getElementById(id);

// Reads a color from the variables at the top of style.css, e.g. color('--color-data-ndvi') gives '#1C3B2E'.
// A color name that does not exist (a typo in content/variables.json) shows as grey.
const warnedColors = new Set();
function color(varName) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (value) return value;
  if (!warnedColors.has(varName)) { warnedColors.add(varName); console.warn('Unknown color ' + varName + ' (check "color" in content/variables.json)'); }
  return getComputedStyle(document.documentElement).getPropertyValue('--color-text-faint').trim();
}

// Turns a color name from content/variables.json (e.g. "data-ndvi") into a CSS variable name.
function colorVarOf(name) {
  return '--color-' + (name || 'text-faint');
}

// Copies the point content from content/variables.json into the lists above.
function readPointContent() {
  const v = CONTENT.variables;
  YEAR_MIN = v.yearRange.first;
  YEAR_MAX = v.yearRange.last;
  NO_DATA = t('messages.noData');
  UNKNOWN = { label: NO_DATA, colorVar: '--color-text-faint', desc: '' };
  CLASSES = {};
  Object.entries(v.changeClasses).forEach(([id, c]) => { CLASSES[id] = { label: c.label, colorVar: colorVarOf(c.color) }; });
  SCENARIOS = {};
  Object.entries(v.scenarios).forEach(([id, s]) => { SCENARIOS[id] = { label: s.label, colorVar: colorVarOf(s.color), desc: s.description || '' }; });
  VARS = v.pointVariables.map((x) => ({ id: x.id, label: x.label, unit: x.unit || '', colorVar: colorVarOf(x.color) }));
  VARS.forEach((x, i) => { checked[x.id] = !!v.pointVariables[i].shownAtStart; });
  METRICS = v.trendMetrics.map((m) => [m.label, m.value, m.tau]);

  // the year slider and its range label
  const slider = $('year-slider');
  slider.min = YEAR_MIN;
  slider.max = YEAR_MAX;
  slider.value = YEAR_MAX;
  $('year-range').textContent = YEAR_MIN + '–' + YEAR_MAX;
}

// ---------- data loading ----------

async function loadPoints() {
  const statusEl = $('status');
  try {
    const response = await fetch('data/points.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    allPoints = await response.json();

    // No point is selected at the start: the cards show "No data" until a marker is clicked.
    const count = allPoints.length;
    $('map-note').textContent = count === 1 ? t('labels.mapNoteOnePoint') : t('labels.mapNote', { count: count });
    renderMap();
    renderChips();
    renderAll();
  } catch (err) {
    statusEl.textContent = t('messages.couldNotLoadPoints', { error: err.message });
    console.error(err);
  }
}

// The selected point, or null when no point is selected.
function getSelectedPoint() {
  return allPoints.find((p) => p.id === selectedId) || null;
}

function currentYear() {
  return parseInt($('year-slider').value, 10);
}

function nearestIndexForYear(years, year) {
  let bestIdx = 0;
  let bestDiff = Infinity;
  years.forEach((y, i) => {
    const diff = Math.abs(y - year);
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  });
  return bestIdx;
}

// ---------- map ----------

function renderMap() {
  const map = $('map');
  map.querySelectorAll('.marker').forEach((m) => m.remove());
  allPoints.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'marker';
    btn.dataset.id = p.id;
    btn.title = p.name;
    btn.setAttribute('aria-label', p.name);
    btn.style.left = p.leftPct + '%';
    btn.style.top = p.topPct + '%';
    btn.style.background = color((CLASSES[p.changeClass] || UNKNOWN).colorVar);
    // click a marker to select its point; click the selected marker again to deselect it
    btn.addEventListener('click', () => {
      selectedId = selectedId === p.id ? null : p.id;
      renderAll();
    });
    map.appendChild(btn);
  });

  $('legend-items').innerHTML = Object.values(CLASSES).map((c) =>
    '<div class="lg"><span class="lg-dot" style="background:' + color(c.colorVar) + '"></span>' + c.label + '</div>'
  ).join('');
}

// ---------- chips ----------

function renderChips() {
  const wrap = $('chips');
  wrap.innerHTML = '';
  VARS.forEach((v) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.id = v.id;
    btn.innerHTML = '<span class="chip-dot" style="background:' + color(v.colorVar) + '"></span>' + v.label;
    btn.addEventListener('click', () => { checked[v.id] = !checked[v.id]; renderAll(); });
    wrap.appendChild(btn);
  });
}

// ---------- render ----------

// Returns the list of values for one variable, or an empty list if the point has none (or no point is selected).
function seriesFor(point, v) {
  return point && Array.isArray(point[v.id]) ? point[v.id] : [];
}

function isNumber(value) {
  return typeof value === 'number' && isFinite(value);
}

// Only the real numbers of a series (missing values are left out).
function knownValues(series) {
  return series.filter(isNumber);
}

// Counts how many decimals the data itself uses (the most found in the list of numbers),
// so values are shown exactly as precisely as they are stored, never rounded or padded further.
function decimalsIn(numbers) {
  return Math.max(0, ...knownValues(numbers).map((n) => {
    const parts = String(n).split('.');
    return parts[1] ? parts[1].length : 0;
  }));
}

// Formats a value with the same number of decimals as the series it belongs to.
function formatLike(value, series) {
  if (!isNumber(value)) return NO_DATA;
  return value.toFixed(decimalsIn(series));
}

// A value with its unit, or "No data" (without unit) when the value is missing.
function valueWithUnit(value, series, unit) {
  return isNumber(value) ? formatLike(value, series) + ' ' + unit : NO_DATA;
}

// Coordinates as text, or "No data" when missing (or no point is selected).
function lonText(point) {
  return point && isNumber(point.lon) ? formatLike(Math.abs(point.lon), [point.lon]) + '° W' : NO_DATA;
}

function latText(point) {
  return point && isNumber(point.lat) ? formatLike(point.lat, [point.lat]) + '° N' : NO_DATA;
}

// Fills every card with the selected point. With no point selected, the cards show "No data".
function renderAll() {
  const point = getSelectedPoint();   // null when no point is selected
  const cls = point ? (CLASSES[point.changeClass] || UNKNOWN) : UNKNOWN;
  const scen = point ? (SCENARIOS[point.scenario] || UNKNOWN) : UNKNOWN;

  // The slider can be dragged to any year, but data only exists for the survey years of the selected point.
  // So we show the nearest survey year and move the slider onto it: the year on screen is always the year of the data shown.
  // Without a selected point the year simply stays where the slider is.
  let year = currentYear();
  let idx = null;
  if (point) {
    idx = nearestIndexForYear(point.years, year);
    year = point.years[idx];
    $('year-slider').value = year;
  }

  // map: ring around the selected marker; aria-pressed tells screen readers which marker is selected
  const ring = $('map-ring');
  ring.hidden = !point;
  if (point) {
    ring.style.left = point.leftPct + '%';
    ring.style.top = point.topPct + '%';
    ring.style.boxShadow = '0 0 0 2px ' + color(cls.colorVar);
  }
  document.querySelectorAll('.marker').forEach((m) => {
    m.setAttribute('aria-pressed', point !== null && m.dataset.id === point.id);
  });

  // top bar + slider (an empty coordinates pill hides itself, see #coords:empty in style.css)
  $('coords').textContent = point ? lonText(point) + ', ' + latText(point) : '';
  $('year-big').textContent = year;

  // tipping status (scenario label and description)
  $('status-label').textContent = scen.label;
  $('status-label').style.color = color(scen.colorVar);
  $('status-desc').textContent = scen.desc;

  // chart card (exports only work with a selected point)
  $('point-name').textContent = point ? point.name : NO_DATA;
  $('point-class').textContent = cls.label;
  $('export-png').disabled = !point;
  $('export-csv').disabled = !point;
  document.querySelectorAll('.chip').forEach((c) => {
    const v = VARS.find((x) => x.id === c.dataset.id);
    const on = checked[v.id];
    c.classList.toggle('on', on);
    c.style.borderColor = on ? color(v.colorVar) : '';
  });
  renderChart(point, idx);

  // values for year
  $('values-title').textContent = t('labels.valuesFor', { year: year });
  $('values').innerHTML = VARS.map((v) =>
    '<div class="value-row"><div class="value-name"><span class="value-dot" style="background:' + color(v.colorVar) + '"></span><span>' + v.label +
    '</span></div><div class="mono value-num">' + valueWithUnit(seriesFor(point, v)[idx], seriesFor(point, v), v.unit) + '</div></div>'
  ).join('');
  // no variables listed in content/variables.json: say so instead of an empty card
  if (VARS.length === 0) $('values').innerHTML = '<p class="placeholder-text">' + t('messages.notYetAvailable') + '</p>';

  // point info
  $('info-class').textContent = cls.label;
  $('info-lon').textContent = lonText(point);
  $('info-lat').textContent = latText(point);

  // trend signals
  const vals = point ? point.metricVals : null;
  const taus = point ? point.metricTaus : null;
  $('metrics').innerHTML = METRICS.map((m) =>
    '<div class="trend-row"><div>' + m[0] + '</div><div class="mono r">' + (m[1] ? textOrNoData(vals, m[1]) : '—') +
    '</div><div class="mono r tau">' + textOrNoData(taus, m[2]) + '</div></div>'
  ).join('');

  // the Climatology timeline shows the same year (see climatology.js)
  updateTimelineYear(year);
}

// Reads one entry of metricVals / metricTaus, or "No data" when it is missing.
function textOrNoData(group, key) {
  const value = group ? group[key] : null;
  return value === null || value === undefined || value === '' ? NO_DATA : value;
}

// ---------- chart ----------

// The axis range of a series is simply its own lowest and highest value,
// so nothing is cut off or changed. A flat series gets a range of 1 to avoid dividing by zero.
// Returns null when the series has no values at all.
function axisRange(values) {
  const known = knownValues(values);
  if (!known.length) return null;
  const min = Math.min(...known);
  const max = Math.max(...known);
  return { min: min, max: max === min ? min + 1 : max };
}

// Draws one variable. Missing values are not drawn: the line stops at a gap and
// starts again after it. A single value with gaps on both sides is drawn as a dot.
function drawSeries(values, range, color) {
  const n = values.length;
  const segments = [];
  let current = [];
  values.forEach((val, i) => {
    if (isNumber(val)) {
      const x = 20 + i * (560 / (n - 1));
      const y = 150 - ((val - range.min) / (range.max - range.min)) * 130;
      current.push([x, y]);
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);

  return segments.map((seg) => {
    if (seg.length === 1) {
      return '<circle cx="' + seg[0][0].toFixed(1) + '" cy="' + seg[0][1].toFixed(1) + '" r="2.5" fill="' + color + '"></circle>';
    }
    const points = seg.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    return '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="2.5"></polyline>';
  }).join('');
}

// Draws the chart for the selected point. With no point selected (point is null) the chart stays empty.
function renderChart(point, idx) {
  const active = VARS.filter((v) => checked[v.id]);

  // every selected variable is scaled to its own data range for this point
  $('lines').innerHTML = active.map((v) => {
    const range = axisRange(seriesFor(point, v));
    return range ? drawSeries(seriesFor(point, v), range, color(v.colorVar)) : '';
  }).join('');

  // the axis labels show the range of the first selected variable
  const primary = active[0];
  const primarySeries = primary ? seriesFor(point, primary) : [];
  const primaryRange = primary ? axisRange(primarySeries) : null;
  $('chart-max').textContent = primaryRange ? formatLike(Math.max(...knownValues(primarySeries)), primarySeries) : (point && primary ? NO_DATA : '');
  $('chart-min').textContent = primaryRange ? formatLike(Math.min(...knownValues(primarySeries)), primarySeries) : '';
  $('chart-summary').textContent = active.length
    ? active.map((v) => v.label + (axisRange(seriesFor(point, v)) ? ' (' + v.unit + ')' : ' (' + NO_DATA + ')')).join(' · ')
    : (VARS.length ? t('labels.noVariablesSelected') : t('messages.notYetAvailable'));

  // dashed line at the shown year (only with a selected point)
  const marker = $('year-marker');
  marker.style.display = point ? '' : 'none';
  const n = point ? point.years.length : 0;
  if (point) {
    const mx = (20 + idx * (560 / (n - 1))).toFixed(1);
    marker.setAttribute('x1', mx);
    marker.setAttribute('x2', mx);
  }

  const bp = point ? point.breakpoint : null;
  const bpLine = $('breakpoint-line');
  if (bp) {
    const bx = (20 + bp.index * (560 / (n - 1))).toFixed(1);
    bpLine.setAttribute('x1', bx);
    bpLine.setAttribute('x2', bx);
    bpLine.style.display = '';
    $('breakpoint-note').textContent = t('labels.breakpoint', { year: bp.label });
  } else {
    bpLine.style.display = 'none';
  }
  $('breakpoint-note').hidden = !bp;
}

// ---------- slider ----------

function setYear(year) {
  $('year-slider').value = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
  if (allPoints.length) renderAll();
  else {
    $('year-big').textContent = $('year-slider').value;
    updateTimelineYear(currentYear());
  }
}

// The survey years the arrow buttons step through: those of the selected point,
// or, with no point selected, every survey year that occurs in points.json.
function surveyYears() {
  const point = getSelectedPoint();
  if (point) return point.years;
  const years = new Set();
  allPoints.forEach((p) => (p.years || []).forEach((y) => years.add(y)));
  return [...years].sort((a, b) => a - b);
}

// The arrow buttons jump to the previous / next survey year.
function stepYear(direction) {
  if (!allPoints.length) return;
  const years = surveyYears();
  const next = years[nearestIndexForYear(years, currentYear()) + direction];
  if (next !== undefined) setYear(next);
}

function setupSlider() {
  const slider = $('year-slider');
  slider.addEventListener('input', () => setYear(parseInt(slider.value, 10)));
  $('year-back').addEventListener('click', () => stepYear(-1));
  $('year-forward').addEventListener('click', () => stepYear(1));
}

// ---------- exports ----------

function download(filename, href) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

// The exported image does not use style.css. So for every part of the chart we copy
// the colors the page is showing (from style.css) onto the copy that gets exported.
function copyChartColors(original, copy) {
  const fromParts = original.querySelectorAll('*');
  const toParts = copy.querySelectorAll('*');
  fromParts.forEach((part, i) => {
    const shown = getComputedStyle(part);
    toParts[i].setAttribute('stroke', shown.stroke);
    toParts[i].setAttribute('fill', shown.fill);
  });
}

function setupExports() {
  $('export-png').addEventListener('click', () => {
    if (!getSelectedPoint()) return;
    const svg = $('chart').cloneNode(true);
    copyChartColors($('chart'), svg);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', 1200);
    svg.setAttribute('height', 340);
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 340;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color('--color-surface');
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      download(getSelectedPoint().id + '_chart.png', canvas.toDataURL('image/png'));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  });
  $('export-csv').addEventListener('click', () => {
    if (!getSelectedPoint()) return;
    const p = getSelectedPoint();
    const cols = VARS.map((v) => v.id);
    const rows = p.years.map((y, i) => [y].concat(VARS.map((v) => isNumber(seriesFor(p, v)[i]) ? seriesFor(p, v)[i] : '')).join(','));
    const csv = 'year,' + cols.join(',') + '\n' + rows.join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    download(p.id + '_data.csv', url);
    URL.revokeObjectURL(url);
  });
}

// ---------- navigation: screens and the address (#...) ----------
//
// Every page in content/pages.json has its own address (#overview, #satellite, ...), plus #method.
// Links and buttons only change the address; showScreen() then shows the matching screen.
// Because every switch changes the address, the browser's back and forward buttons work too.

let RESEARCH_SECTIONS = [];      // page ids from content/pages.json, in menu order
let DEFAULT_SECTION = null;      // the first page in content/pages.json
let lastResearchSection = null;  // where the "Research" tab takes you back to

// The Overview theme colors are the default; pages without their own theme in style.css use them.
const THEME_DEFAULT = 'overview';

// The screen named in the address, or null if the address is empty or unknown.
function screenFromAddress() {
  const name = location.hash.slice(1);
  return name === 'method' || RESEARCH_SECTIONS.includes(name) ? name : null;
}

// Every research card exists once in index.html (data-card="map", ...). A section has empty slots
// (data-slot="map", ...). This moves each card into the matching slot of the section being shown,
// so one card (with its data, selected point and year) can appear in several sections.
function placeCards(screenEl) {
  screenEl.querySelectorAll('[data-slot]').forEach((slot) => {
    const card = document.querySelector('[data-card="' + slot.dataset.slot + '"]');
    if (card && card.parentElement !== slot) slot.appendChild(card);
  });
}

function showScreen() {
  let screen = screenFromAddress();
  if (!screen) {
    // empty or unknown address: show Overview, and correct the address without adding a back-button step
    screen = DEFAULT_SECTION;
    history.replaceState(null, '', '#' + screen);
  }
  const isMethod = screen === 'method';
  if (!isMethod) lastResearchSection = screen;

  // show only the matching screen, and move the cards it needs into its slots
  document.querySelectorAll('[data-screen]').forEach((el) => {
    el.hidden = el.dataset.screen !== screen;
    if (!el.hidden) placeCards(el);
  });

  // sub-navigation: only on research sections, with the current section marked
  $('subnav').hidden = isMethod;
  document.querySelectorAll('.subtab').forEach((link) => {
    const current = link.getAttribute('href') === '#' + screen;
    link.classList.toggle('active', current);
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  // top bar tabs: Research or Method
  document.querySelectorAll('.tab').forEach((btn) => {
    const active = (btn.dataset.tab === 'method') === isMethod;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active);
  });
  // the coordinates belong to a selected point: only shown on pages with the point map
  const cards = isMethod ? [] : cardsOnPage(screen);
  $('coords').hidden = !cards.includes('point-map');

  // the timeline places its markers by its width, which is only known once it is visible
  if (cards.includes('event-timeline')) renderTimeline();

  // section colors (see the SECTION THEMES in style.css): a page without its own theme, and the
  // Method page, use the Overview colors
  document.body.dataset.section = isMethod ? THEME_DEFAULT : screen;
}

function setupNavigation() {
  // top bar tabs: "Research" goes back to the last research section you visited
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      location.hash = btn.dataset.tab === 'method' ? 'method' : lastResearchSection;
    });
  });

  // footer link "Read the method": opens the Method page at the top
  $('footer-method-link').addEventListener('click', () => {
    location.hash = 'method';
    window.scrollTo(0, 0);
  });

  // the address changed (a link, a tab, or the back/forward button): show that screen from the top
  window.addEventListener('hashchange', () => {
    showScreen();
    window.scrollTo(0, 0);
  });

  showScreen();
}

// ---------- start ----------
// First the content (content.js), then everything else. If a content file has a problem,
// the page shows a message naming the file instead of a blank page.

async function start() {
  try {
    await loadContent();
  } catch (err) {
    showContentError(err);
    return;
  }
  fillTexts();             // content.js: all data-text="..." texts
  buildPages();            // content.js: menu, pages and simple cards from content/pages.json
  buildMethodPage();       // content.js: the Method page from content/method.md
  readPointContent();
  RESEARCH_SECTIONS = pageSections().map((s) => s.id);
  DEFAULT_SECTION = RESEARCH_SECTIONS[0];
  lastResearchSection = DEFAULT_SECTION;

  setupClimatology();      // climatology.js: events, timeline and charts of the Climatology screen
  setupStakeholders();     // stakeholders.js: areas, time card and panel of the Stakeholder screen
  setupNavigation();
  setupSlider();
  setupExports();
  setYear(YEAR_MAX);
  loadPoints();
}

start();
