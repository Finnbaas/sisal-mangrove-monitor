// points.js: the Overview and Satellite screens (the monitoring points).
//   Site map with the points, year slider, tipping status, point chart with its chips (drawn like the NDVI
//   plots of the analysis notebook: NDVI, STL trend and breakpoints), values for the year, point info,
//   trend signals, and the download menu (CSV of the data, PNG of the chart).
//   The map shows every point as a small dot; only the featured points (content/featured-points.json)
//   are clickable markers.
// Reads: data/points.json; content/featured-points.json; variables, scenarios and metrics from content/variables.json.
// Uses: helpers.js, content.js. Used by: main.js (readPointContent, setupSlider, setupExports,
//   setYear, loadPoints).

// ---------- content (set from content/variables.json and content/texts.json, see readPointContent) ----------
// No research content is written in this file: variables, labels, units, classes, scenarios and
// metrics all come from the content/ folder. "colorVar" is the name of a color variable in css/base.css.

let SCENARIOS = {};       // tipping-point scenarios (variables.json "scenarios")
let VARS = [];            // variables of the point charts (variables.json "pointVariables")
let METRICS = [];         // rows of the trend signals card (variables.json "trendMetrics")
let COORD_DECIMALS;       // decimals of the shown coordinates (variables.json "coordinateDecimals"); without it, all decimals of the data

const checked = {};       // which variables are switched on in the point chart

let allPoints = [];
// The year range of the point slider: the first and last year of the months ("dates") in data/points.json,
// set by setPointYearRange() once the data is loaded. (variables.json "yearRange" is for the Stakeholder screen.)
let POINT_YEAR_MIN = null, POINT_YEAR_MAX = null;
let FEATURED = {};        // the clickable points: id -> true (content/featured-points.json)
let selectedId = null;

// Copies the point content from content/variables.json into the lists above.
function readPointContent() {
  const v = CONTENT.variables;
  SCENARIOS = {};
  Object.entries(v.scenarios).forEach(([id, s]) => { SCENARIOS[id] = { label: s.label, colorVar: colorVarOf(s.color), desc: s.description || '' }; });
  // decimals (optional): how many decimals to show for this variable; without it, as many as the data has
  // axisRange (optional): fixed [lowest, highest] of the y-axis; without it, the range of the data
  // trend (optional): { id, label } of a trend line in the same chart (e.g. the STL trend of the NDVI);
  // lineLabel (optional): the name of the variable's own line next to that trend (e.g. "raw NDVI")
  VARS = v.pointVariables.map((x) => ({ id: x.id, label: x.label, lineLabel: x.lineLabel || x.label, unit: x.unit || '', decimals: x.decimals,
    axisRange: x.axisRange, colorVar: colorVarOf(x.color), trend: x.trend || null }));
  VARS.forEach((x, i) => { checked[x.id] = !!v.pointVariables[i].shownAtStart; });
  METRICS = v.trendMetrics.map((m) => [m.label, m.value, m.tau]);
  COORD_DECIMALS = v.coordinateDecimals;
}

// The slider runs from the first to the last year of the data: the earliest and latest month in the
// "dates" of all points in data/points.json ("1993-01" -> 1993). It starts at the last year.
// Without any dates (no featured points) the slider is switched off.
function setPointYearRange() {
  const slider = $('year-slider');
  const firsts = [], lasts = [];
  allPoints.forEach((p) => {
    if (Array.isArray(p.dates) && p.dates.length) {
      firsts.push(parseInt(p.dates[0], 10));
      lasts.push(parseInt(p.dates[p.dates.length - 1], 10));
    }
  });
  if (!firsts.length) {
    slider.disabled = true;
    $('year-range').textContent = NO_DATA;
    return;
  }
  POINT_YEAR_MIN = Math.min(...firsts);
  POINT_YEAR_MAX = Math.max(...lasts);
  slider.disabled = false;
  slider.min = POINT_YEAR_MIN;
  slider.max = POINT_YEAR_MAX;
  slider.value = POINT_YEAR_MAX;
  $('year-range').textContent = POINT_YEAR_MIN + '–' + POINT_YEAR_MAX;
}

// ---------- data loading ----------

async function loadPoints() {
  const statusEl = $('status');
  try {
    const response = await fetch('data/points.json');
    if (!response.ok) throw new Error('data/points.json: HTTP ' + response.status);
    allPoints = await response.json();

    // the featured (clickable) points
    const featuredResponse = await fetch('content/featured-points.json');
    if (!featuredResponse.ok) throw new Error('content/featured-points.json: HTTP ' + featuredResponse.status);
    FEATURED = {};
    (await featuredResponse.json()).points.forEach((f) => { FEATURED[f.id] = true; });

    // No point is selected at the start: the cards show "No data" until a marker is clicked.
    const count = allPoints.length;
    $('map-note').textContent = count === 1 ? t('labels.mapNoteOnePoint') : t('labels.mapNote', { count: count });
    // subtitle under the map title: total points and how many of them are clickable
    $('map-subtitle').textContent = t('labels.mapSubtitle', { count: count, featured: Object.keys(FEATURED).length });
    // the slider range comes from the data, so it is set now that the data is loaded
    setPointYearRange();
    // the comparison line on the point chart (mouse and arrow keys), see js/charts.js
    attachComparisonLine($('chart'), () => pointCharts);
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

// Every point is drawn as a small dot (not clickable). The featured points are drawn on top as
// larger, clickable markers.
function renderMap() {
  const map = $('map');
  map.querySelectorAll('.marker, .dot').forEach((m) => m.remove());
  allPoints.filter((p) => !FEATURED[p.id]).forEach((p) => {
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.left = p.leftPct + '%';
    dot.style.top = p.topPct + '%';
    dot.style.background = color((CLASSES[p.changeClass] || UNKNOWN).colorVar);
    map.appendChild(dot);
  });
  allPoints.filter((p) => FEATURED[p.id]).forEach((p) => {
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

// A value with its unit, or "No data" (without unit) when the value is missing.
function valueWithUnit(value, series, unit, decimals) {
  return isNumber(value) ? formatLike(value, series, decimals) + ' ' + unit : NO_DATA;
}

// Coordinates as text ("90.00271° W", "21.17180° N"), or "No data" when missing (or no point is selected).
// Used by the top-bar pill and the Point info card. The number of decimals is display only (COORD_DECIMALS);
// the data keeps the full values.
function lonText(point) {
  return point && isNumber(point.lon) ? formatLike(Math.abs(point.lon), [point.lon], COORD_DECIMALS) + '° W' : NO_DATA;
}

function latText(point) {
  return point && isNumber(point.lat) ? formatLike(point.lat, [point.lat], COORD_DECIMALS) + '° N' : NO_DATA;
}

// Fills every card with the selected point. With no point selected, the cards show "No data".
function renderAll() {
  const point = getSelectedPoint();   // null when no point is selected
  const cls = point ? (CLASSES[point.changeClass] || UNKNOWN) : UNKNOWN;
  const scen = point ? (SCENARIOS[point.scenario] || UNKNOWN) : UNKNOWN;

  // The slider can be dragged to any year, but data only exists for the survey years of the selected point.
  // So we show the nearest survey year and move the slider onto it: the year on screen is always the year of the data shown.
  // idx is the first month of that year in the point's dates; the chart puts the year marker at that month with
  // the same x scale as the lines (pointXScale), so slider and marker stay in sync.
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

  // top bar + slider (an empty coordinates pill hides itself, see #coords:empty in css/base.css)
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
    '</span></div><div class="mono value-num">' + valueWithUnit(seriesFor(point, v)[idx], seriesFor(point, v), v.unit, v.decimals) + '</div></div>'
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
}

// Reads one entry of metricVals / metricTaus, or "No data" when it is missing.
function textOrNoData(group, key) {
  const value = group ? group[key] : null;
  return value === null || value === undefined || value === '' ? NO_DATA : value;
}

// ---------- chart ----------
// One chart per selected variable, stacked, with one shared year axis under them and the comparison line
// that follows the mouse. All parts come from js/charts.js (the same as the climate charts). The chart size
// is POINT_PLOT (taller than the climate charts, the shape of the notebook's NDVI plots); x positions are in SVG units.

let pointCharts = null;   // the charts, as a set for the comparison line (see charts.js)
const YEAR_TICK_STEP = 4; // a year tick every 4 years (1996, 2000, ...), as on the NDVI plots of the notebook

// The one x scale of the point chart, for n months (the length of the point's "dates"). Lines, year ticks,
// breakpoints, the year marker and the comparison line all use it, so they always line up.
//   xOf(i): x position (SVG units) of the i-th month, with half a month of room at both ends
//   indexAt(plotX): the month under an x position (SVG units), or -1 left of the y-axis
// Note: all js files share one set of names, so these functions have names no other file uses
// (climatology-climate.js has its own monthX for 12 months, climatology-storms.js its own monthLabel).
function pointXScale(n) {
  const step = (POINT_PLOT.right - POINT_PLOT.left) / n;
  return {
    n: n,
    xOf: (i) => POINT_PLOT.left + (i + 0.5) * step,
    indexAt: (plotX) => (plotX < POINT_PLOT.left ? -1 : Math.min(n - 1, Math.max(0, Math.floor((plotX - POINT_PLOT.left) / step))))
  };
}

// "2001-08" -> "Aug 2001" (short month names from content/texts.json "months")
function pointMonthLabel(date) {
  const parts = String(date).split('-');
  const name = (CONTENT.texts.months || [])[parseInt(parts[1], 10) - 1];
  return name ? name + ' ' + parts[0] : String(date);
}

// The colors of the lines of one chart. A variable with a trend is drawn like the NDVI plots of the analysis
// notebook: its own line in grey, the trend in the color of the point's change class.
function lineColors(v, point) {
  return {
    line: v.trend ? color('--color-text-faint') : color(v.colorVar),
    trend: color((point ? CLASSES[point.changeClass] || UNKNOWN : UNKNOWN).colorVar)
  };
}

// The breakpoints drawn in a chart: only in a chart with a trend (they are found on the trend).
function breakpointsFor(point, v) {
  return point && v.trend && Array.isArray(point.breakpoints) ? point.breakpoints : [];
}

// One chart: the y-axis (fixed axisRange from content/variables.json, or else the range of the data),
// the shaded 12-month window and dashed line of every breakpoint, the dashed line at the shown year,
// the line (with gaps where data is missing) and, when the variable has one, the trend line on top.
// Everything is clipped to the plot area, so no line can be drawn outside it.
// x = the x scale of the chart (pointXScale). Returns the SVG text and what the comparison line needs ({ yOf, points }).
function pointChartSvg(v, point, idx, gridX, x) {
  const series = seriesFor(point, v);
  const trend = v.trend ? seriesFor(point, v.trend) : [];
  const head = chartHead(v, gridX, 'chart', POINT_PLOT);
  const known = knownValues(series.concat(trend));
  // no point selected: an empty chart; a point without values: "No data"
  if (!known.length) return { svg: chartNoData(head, point ? NO_DATA : '', POINT_PLOT), panel: null };

  const scale = chartScale(v.axisRange || known, false, 0, POINT_PLOT);
  const yOf = scale.yOf;
  const c = lineColors(v, point);
  let svg = head + chartYAxis(scale.t, yOf, true, POINT_PLOT);
  // the plot area: everything below is drawn inside this clip (one id per variable, unique on the page)
  const clipId = 'point-plot-clip-' + v.id;
  svg += '<defs><clipPath id="' + clipId + '"><rect x="' + POINT_PLOT.left + '" y="' + POINT_PLOT.top + '" width="' + (POINT_PLOT.right - POINT_PLOT.left) +
    '" height="' + (POINT_PLOT.bottom - POINT_PLOT.top) + '"></rect></clipPath></defs><g clip-path="url(#' + clipId + ')">';

  // a dashed line over the full height of the chart
  const vertical = (i, cls, width, dash) => '<line class="' + cls + '" x1="' + x.xOf(i).toFixed(1) + '" y1="' + POINT_PLOT.top + '" x2="' + x.xOf(i).toFixed(1) +
    '" y2="' + POINT_PLOT.bottom + '" stroke-width="' + width + '" stroke-dasharray="' + dash + '"></line>';
  // breakpoints: first the shaded windows, so that every line lies on top of them; type is "drop" or "rise" (colors in css/points.css)
  const breakpoints = breakpointsFor(point, v);
  breakpoints.forEach((bp) => {
    const x0 = x.xOf(bp.windowStart), x1 = x.xOf(bp.windowEnd);
    svg += '<rect class="breakpoint-window ' + bp.type + '" x="' + x0.toFixed(1) + '" y="' + POINT_PLOT.top + '" width="' + (x1 - x0).toFixed(1) + '" height="' + (POINT_PLOT.bottom - POINT_PLOT.top) + '"></rect>';
  });
  if (isNumber(idx)) svg += vertical(idx, 'year-marker', 1, '3,3');
  breakpoints.forEach((bp) => { svg += vertical(bp.index, 'breakpoint-line ' + bp.type, 1.5, '4,4'); });

  // the values: a line through consecutive months, a single month between gaps as a dot
  const line = (values, lineColor, width) => segmentsOf(values).forEach((seg) => {
    if (seg.length === 1) svg += '<circle cx="' + x.xOf(seg[0].i).toFixed(1) + '" cy="' + yOf(seg[0].val).toFixed(1) + '" r="1.8" fill="' + lineColor + '"></circle>';
    else svg += '<polyline points="' + seg.map((pt) => x.xOf(pt.i).toFixed(1) + ',' + yOf(pt.val).toFixed(1)).join(' ') +
      '" fill="none" stroke="' + lineColor + '" stroke-width="' + width + '" stroke-linejoin="round" stroke-linecap="round"></polyline>';
  });
  // with a trend: a thin grey line under a thicker trend line (as in the NDVI plots)
  line(series, c.line, v.trend ? 1.2 : 1.5);
  if (v.trend) line(trend, c.trend, 1.8);

  // what the comparison line shows at month i: "raw NDVI 0.7165" and "STL trend (deseasonalised) 0.7512"
  // (decimals from content/variables.json). The trend is left out in the months where it has no value.
  const points = (i) => {
    const shown = [{ value: series[i], color: c.line, text: v.lineLabel + ' ' + formatLike(series[i], series, v.decimals) }];
    if (v.trend && isNumber(trend[i])) shown.push({ value: trend[i], color: c.trend, text: v.trend.label + ' ' + formatLike(trend[i], trend, v.decimals) });
    return shown;
  };
  return { svg: svg + '</g></svg>', panel: { yOf: yOf, points: points } };
}

// A breakpoint as text, as in the legend of the NDVI plots: "drop 2001-08 (−0.485)" (magnitude as stored in the data)
function breakpointText(bp) {
  const m = isNumber(bp.magnitude) ? (bp.magnitude < 0 ? '−' : '+') + formatLike(Math.abs(bp.magnitude), [bp.magnitude]) : NO_DATA;
  return t('labels.breakpointItem', { type: bp.type, month: bp.label, magnitude: m });
}

// Draws the charts for the selected point. With no point selected (point is null) the charts stay empty.
function renderChart(point, idx) {
  const active = VARS.filter((v) => checked[v.id]);
  const box = $('chart');
  box.innerHTML = '';
  pointCharts = null;

  // the months of the point ("1993-01", ...) and a year tick every YEAR_TICK_STEP years, at the first month of that year
  const dates = point && Array.isArray(point.dates) ? point.dates : [];
  const n = dates.length;
  const x = pointXScale(n);   // the one x scale for the whole chart
  const ticks = [];
  dates.forEach((d, i) => {
    const year = parseInt(d, 10);
    if (year % YEAR_TICK_STEP === 0 && (i === 0 || parseInt(dates[i - 1], 10) !== year)) ticks.push({ x: x.xOf(i), text: String(year) });
  });

  const panels = active.map((v) => {
    const drawn = pointChartSvg(v, point, idx, ticks.map((tick) => tick.x), x);
    const row = chartRow({ label: v.label, unit: v.unit }, null, drawn.svg);
    // no source tag on top of the chart (the point variables have no source in content/variables.json)
    row.querySelector('.source-tag').remove();
    box.appendChild(row);
    return drawn.panel;
  });
  if (active.length) {
    box.appendChild(sharedAxis(ticks, t('labels.year')));
    box.insertAdjacentHTML('beforeend', '<div class="comparison" hidden></div>');
  }

  // the comparison line snaps to months (only with a selected point)
  if (n && active.length) {
    pointCharts = {
      count: n, xOf: x.xOf, indexAt: x.indexAt, label: (i) => pointMonthLabel(dates[i]), panels: panels
    };
  }

  // under the chart: the legend of the lines (a variable with a trend: its line and the trend, each with a
  // dot in its color), or the name and unit of the variable
  const dot = (c) => '<span class="lg-dot" style="background:' + c + '"></span> ';
  $('chart-summary').innerHTML = active.length
    ? active.map((v) => {
      if (!knownValues(seriesFor(point, v)).length) return escapeHtml(v.label) + ' (' + NO_DATA + ')';
      if (!v.trend) return escapeHtml(v.label) + ' (' + escapeHtml(v.unit) + ')';
      const c = lineColors(v, point);
      return dot(c.line) + escapeHtml(v.lineLabel) + ' · ' + dot(c.trend) + escapeHtml(v.trend.label);
    }).join(' · ')
    : escapeHtml(VARS.length ? t('labels.noVariablesSelected') : t('messages.notYetAvailable'));

  // every breakpoint of the shown charts as text, as in the legend of the NDVI plots
  const bps = active.length ? breakpointsFor(point, active.find((v) => v.trend) || {}) : [];
  if (bps.length) $('breakpoint-note').textContent = t('labels.breakpoint', { breakpoints: bps.map(breakpointText).join(', ') });
  $('breakpoint-note').hidden = !bps.length;
}

// ---------- slider ----------

// Before the data is loaded (no range yet) the slider does nothing.
function setYear(year) {
  if (POINT_YEAR_MIN === null) return;
  $('year-slider').value = Math.min(POINT_YEAR_MAX, Math.max(POINT_YEAR_MIN, year));
  renderAll();
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

// The exported image does not use the css files. So for every part of the chart we copy
// the colors and text styles the page is showing (from the css files) onto the copy that gets exported.
function copyChartColors(original, copy) {
  const fromParts = original.querySelectorAll('*');
  const toParts = copy.querySelectorAll('*');
  fromParts.forEach((part, i) => {
    const shown = getComputedStyle(part);
    toParts[i].setAttribute('stroke', shown.stroke);
    toParts[i].setAttribute('fill', shown.fill);
    toParts[i].setAttribute('font-size', shown.fontSize);
    toParts[i].setAttribute('font-family', shown.fontFamily);
  });
}

// One SVG for the PNG export: the charts and the year axis on the page are separate SVGs (with the names
// and the axis title as html), so they are put below each other in one picture, with the name and unit of
// each chart on the left and the axis title under the axis. Sizes are in SVG units (POINT_PLOT).
const EXPORT_LABEL_ROOM = 40;    // room on the left for the name and unit (as the 40 px label column on the page)
const EXPORT_AXIS_HEIGHT = 22;   // the height of the axis SVG (see sharedAxis in js/charts.js)
const EXPORT_TITLE_ROOM = 18;    // room under the axis for its title

function chartExportSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const box = $('chart');
  const rows = box.querySelectorAll('.anomaly-chart');
  const axisSvg = box.querySelector('.date-axis svg');
  const width = EXPORT_LABEL_ROOM + POINT_PLOT.width;
  const height = rows.length * POINT_PLOT.height + EXPORT_AXIS_HEIGHT + EXPORT_TITLE_ROOM;
  const out = document.createElementNS(ns, 'svg');
  out.setAttribute('xmlns', ns);
  out.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  const textStyle = getComputedStyle(box.querySelector('.anomaly-name') || box);

  // adds a copy of one SVG of the page at (x, y), with the colors of the page
  const place = (svg, y, h) => {
    const copy = svg.cloneNode(true);
    copyChartColors(svg, copy);
    copy.setAttribute('x', EXPORT_LABEL_ROOM);
    copy.setAttribute('y', y);
    copy.setAttribute('width', POINT_PLOT.width);
    copy.setAttribute('height', h);
    out.appendChild(copy);
  };
  // adds a text (turned a quarter to the left when rotate is true)
  const text = (value, x, y, rotate) => {
    const el = document.createElementNS(ns, 'text');
    el.textContent = value;
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('font-size', textStyle.fontSize);
    el.setAttribute('font-family', textStyle.fontFamily);
    el.setAttribute('fill', textStyle.color);
    if (rotate) el.setAttribute('transform', 'rotate(-90 ' + x + ' ' + y + ')');
    out.appendChild(el);
  };

  rows.forEach((row, k) => {
    const y = k * POINT_PLOT.height;
    place(row.querySelector('svg'), y, POINT_PLOT.height);
    const name = row.querySelector('.anomaly-name').textContent + ' ' + row.querySelector('.anomaly-unit').textContent;
    text(name, EXPORT_LABEL_ROOM / 2, y + POINT_PLOT.height / 2, true);
  });
  if (axisSvg) place(axisSvg, rows.length * POINT_PLOT.height, EXPORT_AXIS_HEIGHT);
  const title = box.querySelector('.date-axis-title');
  if (title) text(title.textContent, EXPORT_LABEL_ROOM + (POINT_PLOT.left + POINT_PLOT.right) / 2, height - 4, false);
  return { svg: out, width: width, height: height };
}

function setupExports() {
  // the download icon opens a small menu with the two exports; a click anywhere else closes it
  const toggle = $('download-toggle');
  const menu = $('download-menu');
  const setMenu = (open) => { menu.hidden = !open; toggle.setAttribute('aria-expanded', open); };
  toggle.setAttribute('aria-label', t('labels.downloadData'));
  toggle.title = t('labels.downloadData');
  toggle.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.hidden); });
  document.addEventListener('click', () => setMenu(false));

  $('export-png').addEventListener('click', () => {
    if (!getSelectedPoint()) return;
    const chart = chartExportSvg();
    // the picture is 1200 pixels wide; the height follows from the number of charts
    const pngWidth = 1200;
    const pngHeight = Math.round(pngWidth * chart.height / chart.width);
    chart.svg.setAttribute('width', pngWidth);
    chart.svg.setAttribute('height', pngHeight);
    const xml = new XMLSerializer().serializeToString(chart.svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = pngWidth;
      canvas.height = pngHeight;
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
    // one column per variable, plus one for its trend when it has one (e.g. ndvi, ndviTrend)
    const cols = [];
    VARS.forEach((v) => { cols.push(v); if (v.trend) cols.push(v.trend); });
    // one row per month ("1993-01"); a missing value is an empty cell
    const rows = (p.dates || p.years).map((d, i) => [d].concat(cols.map((v) => isNumber(seriesFor(p, v)[i]) ? seriesFor(p, v)[i] : '')).join(','));
    const csv = (p.dates ? 'date,' : 'year,') + cols.map((v) => v.id).join(',') + '\n' + rows.join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    download(p.id + '_data.csv', url);
    URL.revokeObjectURL(url);
  });
}
