// points.js: the Overview and Satellite screens (the monitoring points).
//   Site map with the points, year slider, tipping status, point chart with its chips, values for the
//   year, point info, trend signals, the NDVI plot image, and the download menu (CSV of the data, PNG of the chart).
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

const checked = {};       // which variables are switched on in the point chart

let allPoints = [];
let FEATURED = {};        // the clickable points: id -> { plot: path of the NDVI plot image } (content/featured-points.json)
let selectedId = null;

// Copies the point content from content/variables.json into the lists above.
function readPointContent() {
  const v = CONTENT.variables;
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
    if (!response.ok) throw new Error('data/points.json: HTTP ' + response.status);
    allPoints = await response.json();

    // the featured (clickable) points and their plot images
    const featuredResponse = await fetch('content/featured-points.json');
    if (!featuredResponse.ok) throw new Error('content/featured-points.json: HTTP ' + featuredResponse.status);
    FEATURED = {};
    (await featuredResponse.json()).points.forEach((f) => { FEATURED[f.id] = { plot: f.plot }; });

    // No point is selected at the start: the cards show "No data" until a marker is clicked.
    const count = allPoints.length;
    $('map-note').textContent = count === 1 ? t('labels.mapNoteOnePoint') : t('labels.mapNote', { count: count });
    // an image that cannot be found: say which file, instead of a broken picture
    $('point-plot-image').onerror = () => {
      $('point-plot-image').hidden = true;
      $('point-plot-empty').hidden = false;
      $('point-plot-empty').textContent = t('messages.couldNotLoadPlot', { file: $('point-plot-image').getAttribute('src') });
    };
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
    '</span></div><div class="mono value-num">' + valueWithUnit(seriesFor(point, v)[idx], seriesFor(point, v), v.unit) + '</div></div>'
  ).join('');
  // no variables listed in content/variables.json: say so instead of an empty card
  if (VARS.length === 0) $('values').innerHTML = '<p class="placeholder-text">' + t('messages.notYetAvailable') + '</p>';

  // NDVI plot image of the selected point (a ready-made picture in img/satellite/)
  const plot = point && FEATURED[point.id] ? FEATURED[point.id].plot : null;
  const plotImg = $('point-plot-image');
  plotImg.hidden = !plot;
  $('point-plot-empty').hidden = !!plot;
  if (!plot) $('point-plot-empty').textContent = t('messages.selectPoint');
  if (plot && plotImg.getAttribute('src') !== plot) {
    plotImg.src = plot;
    plotImg.alt = point.name;
  }

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
  else $('year-big').textContent = $('year-slider').value;
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
// the colors the page is showing (from the css files) onto the copy that gets exported.
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
