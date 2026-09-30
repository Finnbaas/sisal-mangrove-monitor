const YEAR_MIN = 1984;
const YEAR_MAX = 2026;

const CLASSES = {
  loss: { label: 'Loss', color: '#D93A2B' },
  gain: { label: 'Gain', color: '#2E6FE2' },
  recovery: { label: 'Loss then recovery', color: '#F0C230' }
};

const SCENARIOS = {
  1: { label: 'Approaching tipping point', color: '#C1652F', desc: 'NDVI declining while its variance rises — the classic early-warning signature (Scenario 1).' },
  2: { label: 'Past tipping point', color: '#9C5B3E', desc: 'NDVI is already declining without a preceding rise in variance — no active early-warning signal (Scenario 2).' },
  3: { label: 'Recovering', color: '#5C7A3A', desc: 'NDVI is rising while its variance also rises — an unsettled recovery trend (Scenario 3).' },
  4: { label: 'Stable', color: '#2F6B4F', desc: 'NDVI is stable or rising while its variance falls — no tipping-point concern (Scenario 4).' }
};

const VARS = [
  { id: 'ndvi', label: 'NDVI', unit: 'index, 0–1', color: '#1C3B2E' },
  { id: 'temperature', label: 'Temp', unit: '°C', color: '#C1652F' },
  { id: 'salinity', label: 'Salinity', unit: 'PSU', color: '#3A6EA5' },
  { id: 'precipitation', label: 'Precip', unit: 'mm/mo', color: '#7B5EA7' },
  { id: 'evapo', label: 'Evap./ET', unit: 'mm/day', color: '#5C7A3A' }
];

const METRICS = [
  ['NDVI trend', null, 'ndvi'],
  ['Std. deviation', 'stdDev', 'stdDev'],
  ['AR1', 'ar1', 'ar1'],
  ['Return rate', 'returnRate', 'returnRate'],
  ['Kurtosis', 'kurtosis', 'kurtosis'],
  ['Skewness', 'skewness', 'skewness']
];

const GEE_STEPS = [
  ['Open the Code Editor', 'Go to code.earthengine.google.com and start a new script under your Earth Engine project.'],
  ['Paste the starter script', 'Copy the script below and replace the point coordinates with the location you want to analyze.'],
  ['Run and export', 'Run the script, then open the Tasks tab and run the export to get your NDVI time series as a CSV.'],
  ['Compute the five metrics', 'Pull the CSV into Python or R and compute standard deviation, AR1, return rate, kurtosis, and skewness on rolling windows of the NDVI series.'],
  ['Run Kendall’s tau', 'Test the trend of each metric, and separately the trend of NDVI itself, with Kendall’s tau.'],
  ['Classify the point', 'Cross the NDVI trend τ against the standard deviation trend τ using the scenario table below.'],
  ['Confirm with breakpoint detection', 'Run LandTrendr and visually inspect the NDVI curve to confirm or refine the classification.']
];

let allPoints = [];
let selectedId = null;
const checked = { ndvi: true, temperature: false, salinity: false, precipitation: false, evapo: false };

// Text shown wherever a value is missing (null or absent in points.json)
const NO_DATA = 'No data';
// Used for a point whose change class or scenario is missing from points.json
const UNKNOWN = { label: NO_DATA, color: '#9AA69C', desc: '' };

const $ = (id) => document.getElementById(id);

// ---------- data loading ----------

async function loadPoints() {
  const statusEl = $('status');
  try {
    const response = await fetch('data/points.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    allPoints = await response.json();

    selectedId = allPoints[0].id;
    const count = allPoints.length;
    $('map-note').textContent = count + (count === 1 ? ' point' : ' points') + ' shown · illustrative marker placement, not pixel-matched to exact coordinates';
    renderMap();
    renderChips();
    renderAll();
  } catch (err) {
    statusEl.textContent = 'Could not load point data: ' + err.message;
    console.error(err);
  }
}

function getSelectedPoint() {
  return allPoints.find((p) => p.id === selectedId) || allPoints[0];
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
    btn.style.background = (CLASSES[p.changeClass] || UNKNOWN).color;
    btn.addEventListener('click', () => { selectedId = p.id; renderAll(); });
    map.appendChild(btn);
  });

  $('legend-items').innerHTML = Object.values(CLASSES).map((c) =>
    '<div class="lg"><span class="lg-dot" style="background:' + c.color + '"></span>' + c.label + '</div>'
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
    btn.innerHTML = '<span class="chip-dot" style="background:' + v.color + '"></span>' + v.label;
    btn.addEventListener('click', () => { checked[v.id] = !checked[v.id]; renderAll(); });
    wrap.appendChild(btn);
  });
}

// ---------- render ----------

// Returns the list of values for one variable, or an empty list if the point has none.
function seriesFor(point, v) {
  return Array.isArray(point[v.id]) ? point[v.id] : [];
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

// Coordinates as text, or "No data" when missing.
function lonText(point) {
  return isNumber(point.lon) ? formatLike(Math.abs(point.lon), [point.lon]) + '° W' : NO_DATA;
}

function latText(point) {
  return isNumber(point.lat) ? formatLike(point.lat, [point.lat]) + '° N' : NO_DATA;
}

function renderAll() {
  const point = getSelectedPoint();
  const cls = CLASSES[point.changeClass] || UNKNOWN;
  const scen = SCENARIOS[point.scenario] || UNKNOWN;
  // The slider can be dragged to any year, but data only exists for the survey years of this point.
  // So we show the nearest survey year and move the slider onto it: the year on screen is always the year of the data shown.
  const idx = nearestIndexForYear(point.years, currentYear());
  const year = point.years[idx];
  $('year-slider').value = year;

  // map selection ring
  const ring = $('map-ring');
  ring.hidden = false;
  ring.style.left = point.leftPct + '%';
  ring.style.top = point.topPct + '%';
  ring.style.boxShadow = '0 0 0 2px ' + cls.color;

  // top bar + slider
  $('coords').textContent = lonText(point) + ', ' + latText(point);
  $('year-big').textContent = year;

  // tipping status (scenario label and description)
  $('status-label').textContent = scen.label;
  $('status-label').style.color = scen.color;
  $('status-desc').textContent = scen.desc;

  // chart card
  $('point-name').textContent = point.name;
  $('point-class').textContent = cls.label;
  document.querySelectorAll('.chip').forEach((c) => {
    const v = VARS.find((x) => x.id === c.dataset.id);
    const on = checked[v.id];
    c.classList.toggle('on', on);
    c.style.borderColor = on ? v.color : '';
  });
  renderChart(point, idx);

  // values for year
  $('values-title').textContent = 'Values for ' + year;
  $('values').innerHTML = VARS.map((v) =>
    '<div class="value-row"><div class="value-name"><span class="value-dot" style="background:' + v.color + '"></span><span>' + v.label +
    '</span></div><div class="mono value-num">' + valueWithUnit(seriesFor(point, v)[idx], seriesFor(point, v), v.unit) + '</div></div>'
  ).join('');

  // point info
  $('info-class').textContent = cls.label;
  $('info-lon').textContent = lonText(point);
  $('info-lat').textContent = latText(point);

  // trend signals
  $('metrics').innerHTML = METRICS.map((m) =>
    '<div class="trend-row"><div>' + m[0] + '</div><div class="mono r">' + (m[1] ? textOrNoData(point.metricVals, m[1]) : '—') +
    '</div><div class="mono r tau">' + textOrNoData(point.metricTaus, m[2]) + '</div></div>'
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

function renderChart(point, idx) {
  const n = point.years.length;
  const active = VARS.filter((v) => checked[v.id]);

  // every selected variable is scaled to its own data range for this point
  $('lines').innerHTML = active.map((v) => {
    const range = axisRange(seriesFor(point, v));
    return range ? drawSeries(seriesFor(point, v), range, v.color) : '';
  }).join('');

  // the axis labels show the range of the first selected variable
  const primary = active[0];
  const primarySeries = primary ? seriesFor(point, primary) : [];
  const primaryRange = primary ? axisRange(primarySeries) : null;
  $('chart-max').textContent = primaryRange ? formatLike(Math.max(...knownValues(primarySeries)), primarySeries) : (primary ? NO_DATA : '');
  $('chart-min').textContent = primaryRange ? formatLike(Math.min(...knownValues(primarySeries)), primarySeries) : '';
  $('chart-summary').textContent = active.length
    ? active.map((v) => v.label + (axisRange(seriesFor(point, v)) ? ' (' + v.unit + ')' : ' (' + NO_DATA + ')')).join(' · ')
    : 'no variables selected';

  const mx = (20 + idx * (560 / (n - 1))).toFixed(1);
  $('year-marker').setAttribute('x1', mx);
  $('year-marker').setAttribute('x2', mx);

  const bp = point.breakpoint;
  const bpLine = $('breakpoint-line');
  if (bp) {
    const bx = (20 + bp.index * (560 / (n - 1))).toFixed(1);
    bpLine.setAttribute('x1', bx);
    bpLine.setAttribute('x2', bx);
    bpLine.style.display = '';
    $('breakpoint-note').textContent = 'Detected breakpoint: ' + bp.label;
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

// The arrow buttons jump to the previous / next survey year of the selected point.
function stepYear(direction) {
  if (!allPoints.length) return;
  const years = getSelectedPoint().years;
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

function setupExports() {
  $('export-png').addEventListener('click', () => {
    if (!allPoints.length) return;
    const svg = $('chart').cloneNode(true);
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
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      download(getSelectedPoint().id + '_chart.png', canvas.toDataURL('image/png'));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  });
  $('export-csv').addEventListener('click', () => {
    if (!allPoints.length) return;
    const p = getSelectedPoint();
    const cols = VARS.map((v) => v.id);
    const rows = p.years.map((y, i) => [y].concat(VARS.map((v) => isNumber(seriesFor(p, v)[i]) ? seriesFor(p, v)[i] : '')).join(','));
    const csv = 'year,' + cols.join(',') + '\n' + rows.join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    download(p.id + '_data.csv', url);
    URL.revokeObjectURL(url);
  });
}

// ---------- tabs + method page ----------

function setupTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active);
      });
      $('research').hidden = tab !== 'research';
      $('method').hidden = tab !== 'method';
      $('coords').hidden = tab !== 'research';
    });
  });
}

function renderGeeSteps() {
  $('gee-steps').innerHTML = GEE_STEPS.map((s, i) =>
    '<div class="gee-step"><div class="gee-n">' + (i + 1) + '</div><div class="gee-body">' +
    '<div class="gee-title">' + s[0] + '</div><div class="gee-desc">' + s[1] + '</div></div></div>'
  ).join('');
}

renderGeeSteps();
setupTabs();
setupSlider();
setupExports();
setYear(YEAR_MAX);
loadPoints();
