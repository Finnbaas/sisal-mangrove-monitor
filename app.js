const YEAR_MIN = 1984;
const YEAR_MAX = 2026;
const CIRCUMFERENCE = 2 * Math.PI * 44;

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
  { id: 'ndvi', label: 'NDVI', unit: 'index, 0–1', color: '#1C3B2E', min: 0.3, max: 0.8, digits: 3 },
  { id: 'temperature', label: 'Temp', unit: '°C', color: '#C1652F', min: 24, max: 32, digits: 1 },
  { id: 'salinity', label: 'Salinity', unit: 'PSU', color: '#3A6EA5', min: 15, max: 36, digits: 1 },
  { id: 'precipitation', label: 'Precip', unit: 'mm/mo', color: '#7B5EA7', min: 0, max: 220, digits: 0 },
  { id: 'evapo', label: 'Evap./ET', unit: 'mm/day', color: '#5C7A3A', min: 2, max: 7, digits: 1 }
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

const $ = (id) => document.getElementById(id);

// ---------- data loading ----------

async function loadPoints() {
  const statusEl = $('status');
  try {
    const response = await fetch('data/points.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    allPoints = await response.json();

    selectedId = allPoints[0].id;
    $('map-note').textContent = '6 of 50 points shown · illustrative marker placement, not pixel-matched to exact coordinates';
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
    btn.style.background = CLASSES[p.changeClass].color;
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

function seriesFor(point, v) {
  return point[v.id];
}

function renderAll() {
  const point = getSelectedPoint();
  const cls = CLASSES[point.changeClass];
  const scen = SCENARIOS[point.scenario];
  const year = currentYear();
  const idx = nearestIndexForYear(point.years, year);

  // map selection ring
  const ring = $('map-ring');
  ring.hidden = false;
  ring.style.left = point.leftPct + '%';
  ring.style.top = point.topPct + '%';
  ring.style.boxShadow = '0 0 0 2px ' + cls.color;

  // top bar + slider
  $('coords').textContent = Math.abs(point.lon).toFixed(2) + '° W, ' + point.lat.toFixed(2) + '° N';
  $('year-big').textContent = year;

  // status ring
  const ndviTau = parseFloat(point.metricTaus.ndvi) || 0;
  const sdTau = parseFloat(point.metricTaus.stdDev) || 0;
  const strength = Math.min(1, (Math.abs(ndviTau) + Math.abs(sdTau)) / 2 / 0.6);
  const percent = Math.round(strength * 100);
  const arc = $('ring-arc');
  arc.setAttribute('stroke', scen.color);
  arc.setAttribute('stroke-dasharray', (CIRCUMFERENCE * percent / 100).toFixed(1) + ' ' + CIRCUMFERENCE.toFixed(1));
  $('ring-text').textContent = percent + '%';
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
    '</span></div><div class="mono value-num">' + seriesFor(point, v)[idx].toFixed(v.digits) + ' ' + v.unit + '</div></div>'
  ).join('');

  // point info
  $('info-class').textContent = cls.label;
  $('info-lon').textContent = Math.abs(point.lon).toFixed(2) + '° W';
  $('info-lat').textContent = point.lat.toFixed(2) + '° N';

  // trend signals
  $('metrics').innerHTML = METRICS.map((m) =>
    '<div class="trend-row"><div>' + m[0] + '</div><div class="mono r">' + (m[1] ? point.metricVals[m[1]] : '—') +
    '</div><div class="mono r tau">' + point.metricTaus[m[2]] + '</div></div>'
  ).join('');
}

// ---------- chart ----------

function polyline(values, min, max) {
  const n = values.length;
  return values.map((val, i) => {
    const x = 20 + i * (560 / (n - 1));
    const c = Math.max(min, Math.min(max, val));
    const y = 150 - ((c - min) / (max - min)) * 130;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
}

function renderChart(point, idx) {
  const n = point.years.length;
  const active = VARS.filter((v) => checked[v.id]);

  $('lines').innerHTML = active.map((v) =>
    '<polyline points="' + polyline(seriesFor(point, v), v.min, v.max) + '" fill="none" stroke="' + v.color + '" stroke-width="2.5"></polyline>'
  ).join('');

  const primary = active[0];
  $('chart-max').textContent = primary ? primary.max : '';
  $('chart-min').textContent = primary ? primary.min : '';
  $('chart-summary').textContent = active.length
    ? active.map((v) => v.label + ' (' + v.unit + ')').join(' · ')
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

function setupSlider() {
  const slider = $('year-slider');
  slider.addEventListener('input', () => setYear(parseInt(slider.value, 10)));
  $('year-back').addEventListener('click', () => setYear(currentYear() - 1));
  $('year-forward').addEventListener('click', () => setYear(currentYear() + 1));
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
    const rows = p.years.map((y, i) => [y].concat(VARS.map((v) => seriesFor(p, v)[i])).join(','));
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
