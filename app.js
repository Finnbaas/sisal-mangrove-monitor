const YEAR_MIN = 1984;
const YEAR_MAX = 2026;
const SD_WINDOW = 10;

// Marker positions on the survey photo are illustrative, not georeferenced.
const MARKER_POS = {
  P08: { left: 30, top: 55 },
  P27: { left: 68, top: 62 },
  P41: { left: 82, top: 45 }
};

const SCENARIOS = {
  1: { label: 'Approaching tipping point', bg: '#F5E3D8', color: '#C1652F', desc: 'NDVI declining while its variance rises — the classic early-warning signature (Scenario 1).' },
  2: { label: 'Past tipping point', bg: '#EFE0D6', color: '#9C5B3E', desc: 'NDVI is already declining without a preceding rise in variance — no active early-warning signal (Scenario 2).' },
  3: { label: 'Recovering', bg: '#E4EAD8', color: '#5C7A3A', desc: 'NDVI is rising while its variance also rises — an unsettled recovery trend (Scenario 3).' },
  4: { label: 'Stable', bg: '#DCEBE2', color: '#2F6B4F', desc: 'NDVI is stable or rising while its variance falls — no tipping-point concern (Scenario 4).' }
};

const LAND_STATUS = {
  Anthropogenic: { label: 'Converted (land)', bg: '#E4DEC4', color: '#7A756A', desc: 'No longer under tidal or wetland influence. Treated as already converted rather than fitted to the tipping-point framework.' },
  Natural: { label: 'Reference (land)', bg: '#E4DEC4', color: '#7A756A', desc: 'A non-wetland reference location, kept outside the tipping-point framework.' }
};

// Only NDVI has data so far; the climatology series come from ERA5 later.
const CLIM_VARS = [
  { id: 'ndvi', label: 'NDVI', unit: 'index, 0–1', color: '#1F4B43', hasData: true },
  { id: 'temperature', label: 'Temperature', unit: '°C', color: '#C1652F' },
  { id: 'salinity', label: 'Salinity', unit: 'PSU', color: '#3A6EA5', waterOnly: true },
  { id: 'precipitation', label: 'Precipitation', unit: 'mm/month', color: '#7B5EA7' },
  { id: 'evapo', label: 'Evaporation', landLabel: 'Evapotranspiration', unit: 'mm/day', color: '#8A8477' }
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
let chart = null;

const $ = (id) => document.getElementById(id);

// ---------- statistics ----------

function kendallTau(values) {
  const n = values.length;
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = values[j] - values[i];
      if (d > 0) concordant++;
      else if (d < 0) discordant++;
    }
  }
  return (concordant - discordant) / (n * (n - 1) / 2);
}

function rollingSd(values, window) {
  const out = [];
  for (let i = window - 1; i < values.length; i++) {
    const slice = values.slice(i - window + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / window;
    const variance = slice.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (window - 1);
    out.push(Math.sqrt(variance));
  }
  return out;
}

function signed(x) {
  return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);
}

function analyze(point) {
  const isWater = point.locationType === 'water';
  if (!isWater) return { isWater, status: LAND_STATUS[point.classLabel] || LAND_STATUS.Natural };
  const values = point.ndvi.map((r) => r.value);
  const ndviTau = kendallTau(values);
  const sdTau = kendallTau(rollingSd(values, SD_WINDOW));
  let scenario;
  if (ndviTau < 0) scenario = sdTau > 0 ? 1 : 2;
  else scenario = sdTau > 0 ? 3 : 4;
  return { isWater, ndviTau, sdTau, status: SCENARIOS[scenario] };
}

// ---------- data loading ----------

async function loadPoints() {
  const statusEl = $('status');
  try {
    const response = await fetch('data/points.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    allPoints = await response.json();
    allPoints.forEach((p) => { p.analysis = analyze(p); });

    selectedId = allPoints[0].id;
    statusEl.textContent = '';
    $('map-note').textContent = allPoints.length + ' points shown · base image is the team’s own survey photo, marker positions here are illustrative and not pixel-matched to exact coordinates';
    renderMap();
    renderClimRows();
    renderPoint();
  } catch (err) {
    statusEl.textContent = 'Could not load point data: ' + err.message;
    console.error(err);
  }
}

function getSelectedPoint() {
  return allPoints.find((p) => p.id === selectedId) || allPoints[0];
}

// ---------- map + legend ----------

function renderLegend() {
  const defs = [
    { r: '50%', fill: 'transparent', border: '2px solid #52605B', label: 'Water-associated' },
    { r: '4px', fill: 'transparent', border: '2px solid #52605B', label: 'Land' },
    { r: '50%', fill: SCENARIOS[1].color, label: 'Approaching tipping point' },
    { r: '50%', fill: SCENARIOS[2].color, label: 'Past tipping point' },
    { r: '50%', fill: SCENARIOS[3].color, label: 'Recovering' },
    { r: '50%', fill: SCENARIOS[4].color, label: 'Stable' },
    { r: '50%', fill: LAND_STATUS.Natural.color, label: 'Converted / reference (land)' }
  ];
  $('legend').innerHTML = defs.map((d) =>
    '<div class="lg"><span class="lg-dot" style="border-radius:' + d.r + ';background:' + d.fill + ';border:' + (d.border || 'none') + '"></span>' + d.label + '</div>'
  ).join('');
}

function renderMap() {
  const map = $('map');
  map.innerHTML = '';
  allPoints.forEach((p, i) => {
    const pos = MARKER_POS[p.id] || { left: 20 + i * 15, top: 50 };
    const btn = document.createElement('button');
    btn.className = 'marker';
    btn.dataset.id = p.id;
    btn.title = p.name;
    btn.setAttribute('aria-label', p.name);
    btn.style.left = pos.left + '%';
    btn.style.top = pos.top + '%';
    btn.style.borderRadius = p.analysis.isWater ? '50%' : '4px';
    btn.style.background = p.analysis.status.color;
    btn.addEventListener('click', () => selectPoint(p.id));
    map.appendChild(btn);
  });
}

function selectPoint(id) {
  selectedId = id;
  renderPoint();
}

// ---------- climatology rows ----------

function renderClimRows() {
  const wrap = $('clim-rows');
  wrap.innerHTML = '';
  CLIM_VARS.forEach((v) => {
    const btn = document.createElement('button');
    btn.className = 'clim-row';
    btn.dataset.id = v.id;
    btn.innerHTML =
      '<span class="clim-check"></span>' +
      '<span class="clim-swatch" style="background:' + v.color + '"></span>' +
      '<span class="clim-label"><div class="clim-name"></div><div class="clim-unit">' + v.unit + '</div></span>' +
      '<span class="clim-na"></span>';
    wrap.appendChild(btn);
  });
}

function updateClimRows(point) {
  const isWater = point.analysis.isWater;
  document.querySelectorAll('.clim-row').forEach((row) => {
    const v = CLIM_VARS.find((x) => x.id === row.dataset.id);
    const applicable = !(v.waterOnly && !isWater);
    const usable = applicable && v.hasData;
    const check = row.querySelector('.clim-check');
    row.querySelector('.clim-name').textContent = (!isWater && v.landLabel) || v.label;
    row.classList.toggle('off', !usable);
    row.disabled = !usable;
    check.style.borderColor = usable ? v.color : '#D8D1BE';
    check.style.background = usable ? v.color : 'transparent';
    row.querySelector('.clim-na').textContent = !applicable ? 'n/a for Land' : (!v.hasData ? 'ERA5 data not loaded yet' : '');
  });
}

// ---------- selected point ----------

function renderPoint() {
  const point = getSelectedPoint();
  const a = point.analysis;
  const s = a.status;

  document.querySelectorAll('.marker').forEach((m) => m.classList.toggle('selected', m.dataset.id === point.id));

  $('coords').textContent = 'Lo: ' + Math.abs(point.lon).toFixed(2) + '° W, La: ' + point.lat.toFixed(2) + '° N';
  $('point-name').textContent = point.name;
  $('point-sub').textContent = point.classLabel + ' · ' + (a.isWater ? 'Water-associated' : 'Land');

  const banner = $('status-banner');
  banner.style.background = s.bg;
  banner.style.borderColor = s.color;
  $('status-dot').style.background = s.color;
  $('status-label').textContent = s.label;
  $('status-label').style.color = s.color;
  $('status-desc').textContent = s.desc;
  $('status-tau').innerHTML = a.isWater
    ? '<span>NDVI trend τ = ' + signed(a.ndviTau) + '</span><span>SD trend τ = ' + signed(a.sdTau) + '</span>'
    : '';

  updateClimRows(point);
  renderChart(point);
}

// ---------- chart + slider ----------

function nearestIndexForYear(series, year) {
  let bestIdx = 0;
  let bestDiff = Infinity;
  series.forEach((row, i) => {
    const diff = Math.abs(row.year - year);
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  });
  return bestIdx;
}

function renderChart(point) {
  const labels = point.ndvi.map((r) => r.year);
  const values = point.ndvi.map((r) => r.value);
  const idx = nearestIndexForYear(point.ndvi, parseInt($('year-slider').value, 10));

  const radii = values.map((v, i) => (i === idx ? 7 : 0));
  const colors = values.map((v, i) => (i === idx ? '#C1652F' : '#1F4B43'));

  $('chart-range').textContent = labels[0] + '–' + labels[labels.length - 1];
  $('chart-summary').textContent = 'Showing: NDVI (index, 0–1)';

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].pointRadius = radii;
    chart.data.datasets[0].pointBackgroundColor = colors;
    chart.update();
  } else {
    chart = new Chart($('ndvi-chart').getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'NDVI',
          data: values,
          borderColor: '#1F4B43',
          borderWidth: 2.5,
          pointRadius: radii,
          pointBackgroundColor: colors,
          tension: 0.15
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { min: 0, max: 1, title: { display: true, text: 'NDVI (index, 0–1)' } },
          x: { title: { display: true, text: 'Year' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  const row = point.ndvi[idx];
  $('year-readout').textContent = row.year + ': NDVI ' + row.value.toFixed(3);
}

function setYear(year) {
  const slider = $('year-slider');
  slider.value = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
  if (allPoints.length) renderChart(getSelectedPoint());
}

function setupSlider() {
  const slider = $('year-slider');
  slider.addEventListener('input', () => setYear(parseInt(slider.value, 10)));
  $('year-back').addEventListener('click', () => setYear(parseInt(slider.value, 10) - 1));
  $('year-forward').addEventListener('click', () => setYear(parseInt(slider.value, 10) + 1));
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
    if (!chart) return;
    download(getSelectedPoint().id + '_ndvi.png', chart.toBase64Image());
  });
  $('export-csv').addEventListener('click', () => {
    if (!allPoints.length) return;
    const p = getSelectedPoint();
    const csv = 'year,ndvi\n' + p.ndvi.map((r) => r.year + ',' + r.value).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    download(p.id + '_ndvi.csv', url);
    URL.revokeObjectURL(url);
  });
}

// ---------- custom point (mock) ----------

function setupCustomPoint() {
  const toggle = $('custom-toggle');
  const setState = (state) => {
    $('custom-idle').hidden = state !== 'idle';
    $('custom-pending').hidden = state !== 'pending';
    $('custom-ready').hidden = state !== 'ready';
  };
  toggle.addEventListener('click', () => {
    const open = $('custom-panel').hidden;
    $('custom-panel').hidden = !open;
    toggle.classList.toggle('on', open);
    setState('idle');
  });
  $('custom-run').addEventListener('click', () => {
    setState('pending');
    setTimeout(() => setState('ready'), 1400);
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

renderLegend();
renderGeeSteps();
setupTabs();
setupSlider();
setupExports();
setupCustomPoint();
loadPoints();
