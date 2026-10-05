// =====================================================================================
// CLIMATOLOGY SCREEN: storms and extreme-weather events
//
// Data:   data/events.json (one object per event, see CLAUDE.md "Structure of data/events.json")
// Shows:  - a timeline: events above a time track (with the same year handle as the other screens)
//         - a list of the events
//         - for the selected event: six anomaly charts with one shared date axis, and a
//           dotted comparison line that follows the mouse and shows every chart's value at that day
//
// This file only defines functions. app.js starts it (setupClimatology) and uses these helpers
// from app.js: $, color, isNumber, knownValues, formatLike, NO_DATA, setYear, YEAR_MIN, YEAR_MAX.
// =====================================================================================

// ---------- config: labels, units and colors (no data here) ----------

// The six charts, top to bottom. "id" is the field name in events.json.
const CLIMATE_VARS = [
  { id: 'airTemperature', label: 'Mean air temperature', unit: '°C', colorVar: '--color-data-climate-air-temperature' },
  { id: 'windSpeed', label: '10 m wind speed', unit: 'm/s', colorVar: '--color-data-climate-wind-speed' },
  { id: 'waveHeight', label: 'Max wave height', unit: 'm', colorVar: '--color-data-climate-wave-height' },
  { id: 'precipitation', label: 'Precipitation', unit: 'mm/day', colorVar: '--color-data-climate-precipitation' },
  { id: 'salinity', label: 'Surface salinity', unit: 'PSU', colorVar: '--color-data-climate-salinity' },
  { id: 'seaSurfaceTemperature', label: 'Sea surface temperature', unit: '°C', colorVar: '--color-data-climate-sea-surface-temperature' }
];

// Where a variable's data comes from: the three cells on the Climatology map.
const SOURCES = {
  'era5-land': { label: 'ERA5-Land land cell', colorVar: '--color-data-source-era5-land' },
  'era5-sea': { label: 'ERA5 sea cell', colorVar: '--color-data-source-era5-sea' },
  'hycom': { label: 'HYCOM cell', colorVar: '--color-data-source-hycom' }
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ANOMALY_TEXT = 'Anomaly: difference from the 30-year mean for the same calendar day';

// Size of one chart in SVG units (the same as the Figma anomaly-plot component).
// The plot area runs from x 38 to 549 and from y 6 to 122; tick values sit left of x 38.
const PLOT = { width: 549, height: 128, left: 38, right: 549, top: 6, bottom: 122, labelRoom: 16 };
const DAY_MARGIN = 2;          // empty days drawn before the first and after the last day of data

// Timeline layout (px inside #timeline, see style.css): event lane and track.
const TIMELINE = { inset: 8, laneY: 50, lift: 28, trackTop: 76, markerSize: 22 };

// ---------- state ----------

let events = [];               // contents of data/events.json
let selectedEventId = null;    // no event selected at the start
let chartScales = [];          // per chart: how to turn a value into a y position (used by the comparison line)

// ---------- loading ----------

async function loadEvents() {
  try {
    const response = await fetch('data/events.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    events = await response.json();
  } catch (err) {
    $('events-status').textContent = 'Could not load event data: ' + err.message;
    console.error(err);
  }
  renderEventList();
  renderTimeline();
  renderEventCharts();
}

function setupClimatology() {
  const slider = $('timeline-slider');
  slider.min = YEAR_MIN;
  slider.max = YEAR_MAX;
  // the handle only moves through time; it never selects an event
  slider.addEventListener('input', () => setYear(parseInt(slider.value, 10)));
  // marker positions depend on the width of the timeline
  window.addEventListener('resize', renderTimeline);
  setupComparisonLine();
  loadEvents();
}

// ---------- small helpers ----------

function getSelectedEvent() {
  return events.find((e) => e.id === selectedEventId) || null;
}

// "1995-09" -> { year: 1995, month: 9 }, or null when the text is not a valid month
function parseMonth(text) {
  const match = /^(\d{4})-(\d{2})$/.exec(text || '');
  if (!match) return null;
  const month = parseInt(match[2], 10);
  return month >= 1 && month <= 12 ? { year: parseInt(match[1], 10), month: month } : null;
}

// "Sep 1995", or "No data" when the month is missing
function monthLabel(ev) {
  const m = parseMonth(ev.month);
  return m ? MONTHS[m.month - 1] + ' ' + m.year : NO_DATA;
}

// A value with its sign ("+10.88", "−2.16"), with as many decimals as the data uses.
function signedValue(value, series) {
  if (!isNumber(value)) return NO_DATA;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return sign + formatLike(Math.abs(value), series);
}

function seriesOf(ev, v) {
  return Array.isArray(ev[v.id]) ? ev[v.id] : [];
}

// ---------- selecting an event ----------

// Click a marker or a row to select that event; click the selected one again to deselect it.
function selectEvent(id) {
  selectedEventId = selectedEventId === id ? null : id;
  renderEventList();
  renderTimelineSelection();
  renderEventCharts();
}

// ---------- event list ----------

function renderEventList() {
  const list = $('event-list');
  list.innerHTML = '';
  events.forEach((ev) => {
    const row = document.createElement('button');
    row.className = 'event-row' + (ev.id === selectedEventId ? ' selected' : '');
    row.setAttribute('aria-pressed', ev.id === selectedEventId);
    row.innerHTML =
      '<span class="event-row-dot"></span>' +
      '<span class="event-row-text"><span class="event-row-name"></span><span class="event-row-date"></span></span>' +
      '<span class="event-type"></span>';
    row.querySelector('.event-row-name').textContent = ev.name || NO_DATA;
    row.querySelector('.event-row-date').textContent = monthLabel(ev);
    row.querySelector('.event-type').textContent = ev.type || NO_DATA;
    row.addEventListener('click', () => selectEvent(ev.id));
    list.appendChild(row);
  });
}

// ---------- timeline ----------

// Horizontal position (px) of a moment in time (a year with decimals) on the timeline.
function timelineX(yearValue, width) {
  const share = (yearValue - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
  return TIMELINE.inset + Math.min(1, Math.max(0, share)) * (width - 2 * TIMELINE.inset);
}

function renderTimeline() {
  const box = $('timeline');
  const width = box.clientWidth || 683;           // when the card is hidden, use its normal width
  const layer = $('timeline-events');
  layer.innerHTML = '';
  const years = $('timeline-years');
  years.innerHTML = '';

  // year labels every 5 years
  for (let y = Math.ceil(YEAR_MIN / 5) * 5; y <= YEAR_MAX; y += 5) {
    const x = timelineX(y, width);
    years.insertAdjacentHTML('beforeend',
      '<span class="timeline-tick" style="left:' + x.toFixed(1) + 'px"></span>' +
      '<span class="timeline-year-label" style="left:' + x.toFixed(1) + 'px">' + y + '</span>');
  }

  // events, placed at the middle of their month. Events closer together than one marker are
  // stacked in one column (each one a level higher), so every marker stays visible and clickable.
  const placed = events
    .map((ev) => ({ ev: ev, m: parseMonth(ev.month) }))
    .filter((p) => p.m)
    .map((p) => ({ ev: p.ev, x: timelineX(p.m.year + (p.m.month - 0.5) / 12, width) }))
    .sort((a, b) => a.x - b.x);
  const columns = [];
  placed.forEach((p) => {
    const column = columns.find((c) => Math.abs(c.x - p.x) < TIMELINE.markerSize + 4);
    if (column) column.events.push(p.ev);
    else columns.push({ x: p.x, events: [p.ev] });
  });

  columns.forEach((column) => {
    const topY = TIMELINE.laneY - (column.events.length - 1) * TIMELINE.lift;
    // stem from the highest marker down to the track, and a small tick at the date
    layer.insertAdjacentHTML('beforeend',
      '<span class="timeline-stem" style="left:' + column.x.toFixed(1) + 'px; top:' + topY + 'px; height:' + (TIMELINE.trackTop - topY) + 'px"></span>' +
      '<span class="event-date-tick" style="left:' + column.x.toFixed(1) + 'px"></span>');
    column.events.forEach((ev, level) => {
      const marker = document.createElement('button');
      marker.className = 'event-marker';
      marker.dataset.id = ev.id;
      marker.style.left = column.x.toFixed(1) + 'px';
      marker.style.top = (TIMELINE.laneY - level * TIMELINE.lift) + 'px';
      marker.setAttribute('aria-label', (ev.name || NO_DATA) + ', ' + monthLabel(ev));
      marker.innerHTML = '<span class="event-tooltip"><span class="name"></span><span class="date"></span></span>';
      marker.querySelector('.name').textContent = ev.name || NO_DATA;
      marker.querySelector('.date').textContent = monthLabel(ev);
      marker.addEventListener('click', () => selectEvent(ev.id));
      layer.appendChild(marker);
    });
  });

  renderTimelineSelection();
  updateTimelineYear(currentYear());
}

// Highlights the selected event on the timeline and names it in the top-right corner.
function renderTimelineSelection() {
  document.querySelectorAll('.event-marker').forEach((m) => {
    const selected = m.dataset.id === selectedEventId;
    m.classList.toggle('selected', selected);
    m.setAttribute('aria-pressed', selected);
  });
  const ev = getSelectedEvent();
  $('timeline-selected').hidden = !ev;
  if (ev) {
    $('timeline-selected-name').textContent = ev.name || NO_DATA;
    $('timeline-selected-date').textContent = monthLabel(ev);
  }
}

// Called by app.js whenever the shared year changes (the year slider on the other screens and
// this timeline handle always show the same year).
function updateTimelineYear(year) {
  const slider = $('timeline-slider');
  if (!slider) return;
  slider.value = year;
  $('timeline-year').textContent = year;
  const share = (year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
  // the filled part of the track ends under the middle of the handle
  const width = $('timeline').clientWidth || 683;
  $('timeline-fill').style.width = (share * (width - 2 * TIMELINE.inset)).toFixed(1) + 'px';
}

// ---------- the six anomaly charts ----------

// A "nice" step between tick values: 1, 2 or 5 times a power of ten.
function niceStep(raw) {
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
}

// Tick values for one chart: always include 0; add an outer tick only when the data reaches
// clearly past the last inner tick (more than 80% of a step).
function ticksFor(min, max) {
  const lo = Math.min(min, 0), hi = Math.max(max, 0);
  const step = niceStep((hi - lo) / 5 || 1);
  let first = Math.ceil(lo / step) * step;
  if (lo < first - 0.8 * step) first -= step;
  let last = Math.floor(hi / step) * step;
  if (hi > last + 0.8 * step) last += step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks = [];
  for (let t = first; t <= last + step / 1000; t += step) ticks.push(Math.round(t / step) * step);
  return { ticks: ticks, decimals: decimals };
}

// x position (SVG units) of day number i, for an event with n days of data
function chartX(i, n) {
  return PLOT.left + (i + DAY_MARGIN) / (n - 1 + 2 * DAY_MARGIN) * (PLOT.right - PLOT.left);
}

// Weekly gridlines: the days that fall on a Saturday (the same days as in the Figma design).
function weeklyDays(dates) {
  return dates.map((d, i) => ({ d: d, i: i })).filter((p) => new Date(p.d + 'T00:00:00Z').getUTCDay() === 6);
}

function renderEventCharts() {
  const ev = getSelectedEvent();
  $('event-charts-empty').hidden = !!ev;
  $('event-charts-content').hidden = !ev;
  chartScales = [];
  hideComparisonLine();
  if (!ev) return;

  $('event-title').textContent = (ev.name || NO_DATA) + ' (' + monthLabel(ev) + ')';
  $('event-subtitle').textContent = ANOMALY_TEXT + ' (' + (ev.baseline || NO_DATA) + ')';

  const dates = Array.isArray(ev.dates) ? ev.dates : [];
  const n = dates.length;
  const weeks = weeklyDays(dates);
  const box = $('event-charts');
  box.innerHTML = '';

  CLIMATE_VARS.forEach((v) => {
    const series = seriesOf(ev, v);
    const source = SOURCES[(ev.sources || {})[v.id]];
    const row = document.createElement('div');
    row.className = 'anomaly-chart';
    row.innerHTML =
      '<div class="anomaly-label"><span class="anomaly-name"></span><span class="anomaly-unit"></span></div>' +
      '<div class="anomaly-plot">' + chartSvg(series, n, weeks, v) + '</div>' +
      '<span class="source-tag"><span class="source-square"></span><span class="source-name"></span></span>';
    row.querySelector('.anomaly-name').textContent = v.label;
    row.querySelector('.anomaly-unit').textContent = '(' + v.unit + ')';
    row.querySelector('.source-square').style.background = source ? color(source.colorVar) : color('--color-text-faint');
    row.querySelector('.source-name').textContent = source ? source.label : NO_DATA;
    box.appendChild(row);
  });

  // one shared date axis under all charts, with a label every week
  if (n) {
    const axis = document.createElement('div');
    axis.className = 'date-axis';
    let svg = '<svg viewBox="0 0 ' + PLOT.width + ' 22" aria-hidden="true">' +
      '<rect class="plot-axis" x="' + PLOT.left + '" y="0" width="' + (PLOT.right - PLOT.left) + '" height="1"></rect>';
    weeks.forEach((w) => {
      const x = chartX(w.i, n);
      svg += '<rect class="plot-axis" x="' + (x - 0.5).toFixed(1) + '" y="0" width="1" height="4"></rect>' +
        '<text class="plot-tick-label" x="' + x.toFixed(1) + '" y="17" text-anchor="middle">' + w.d + '</text>';
    });
    axis.innerHTML = '<div></div>' + svg + '</svg><div class="date-axis-title">Date</div>';
    box.appendChild(axis);
  }

  // the comparison line and its labels are drawn on top of the charts
  box.insertAdjacentHTML('beforeend', '<div id="comparison" hidden></div>');
}

// Draws one chart as SVG text. Also stores how values map to y positions in chartScales.
function chartSvg(series, n, weeks, v) {
  const known = knownValues(series);
  const head = '<svg viewBox="0 0 ' + PLOT.width + ' ' + PLOT.height + '" role="img" aria-label="' + v.label + ' anomaly">';
  // vertical gridlines are drawn even without data, so the charts stay aligned
  const grid = weeks.map((w) => '<rect class="plot-grid" x="' + Math.round(chartX(w.i, n)) + '" y="' + PLOT.top + '" width="1" height="' + (PLOT.bottom - PLOT.top) + '"></rect>').join('');
  if (!n || !known.length) {
    chartScales.push(null);
    return head + grid + '<rect class="plot-axis" x="' + PLOT.left + '" y="' + PLOT.top + '" width="1" height="' + (PLOT.bottom - PLOT.top) + '"></rect>' +
      '<text class="plot-nodata" x="' + ((PLOT.left + PLOT.right) / 2) + '" y="' + ((PLOT.top + PLOT.bottom) / 2 + 4) + '" text-anchor="middle">' + NO_DATA + '</text></svg>';
  }

  // y scale: room for the ticks and the data, plus space for the label at the most extreme value
  const min = Math.min(...known), max = Math.max(...known);
  const t = ticksFor(min, max);
  let extremeIndex = 0;
  series.forEach((val, i) => { if (isNumber(val) && Math.abs(val) > Math.abs(series[extremeIndex] || 0)) extremeIndex = i; });
  const extreme = series[extremeIndex];
  const atTop = extreme >= 0;
  const lo = Math.min(min, t.ticks[0]), hi = Math.max(max, t.ticks[t.ticks.length - 1]);
  const span = PLOT.bottom - PLOT.top;
  const perUnit = (span - PLOT.labelRoom - 4) / ((hi - lo) || 1);
  const yMax = hi + (atTop ? PLOT.labelRoom : 4) / perUnit;
  const yMin = lo - (atTop ? 4 : PLOT.labelRoom) / perUnit;
  const yOf = (val) => PLOT.top + (yMax - val) / (yMax - yMin) * span;
  chartScales.push({ yOf: yOf, series: series, v: v });

  const lineColor = color(v.colorVar);
  let svg = head + grid;
  // horizontal gridlines, tick marks and tick values
  t.ticks.forEach((tick) => {
    const y = Math.round(yOf(tick));
    if (tick !== 0) svg += '<rect class="plot-grid" x="' + PLOT.left + '" y="' + y + '" width="' + (PLOT.right - PLOT.left) + '" height="1"></rect>';
    svg += '<rect class="plot-axis" x="' + (PLOT.left - 4) + '" y="' + y + '" width="4" height="1"></rect>' +
      '<text class="plot-tick-label" x="32" y="' + (y + 4) + '" text-anchor="end">' + (tick < 0 ? '−' : '') + Math.abs(tick).toFixed(t.decimals) + '</text>';
  });
  svg += '<rect class="plot-axis" x="' + PLOT.left + '" y="' + PLOT.top + '" width="1" height="' + span + '"></rect>';

  // the data, split where values are missing (gaps are not drawn)
  const zero = yOf(0);
  segmentsOf(series).forEach((seg) => {
    // add the exact points where the line crosses zero, so both fills meet the zero line cleanly
    const pts = [];
    seg.forEach((p, k) => {
      pts.push([chartX(p.i, n), p.val]);
      const next = seg[k + 1];
      if (next && ((p.val > 0 && next.val < 0) || (p.val < 0 && next.val > 0))) {
        const share = p.val / (p.val - next.val);
        pts.push([chartX(p.i, n) + (chartX(next.i, n) - chartX(p.i, n)) * share, 0]);
      }
    });
    const area = (clamp) => 'M ' + pts[0][0].toFixed(1) + ' ' + zero.toFixed(1) + ' ' +
      pts.map((p) => 'L ' + p[0].toFixed(1) + ' ' + yOf(clamp(p[1])).toFixed(1)).join(' ') +
      ' L ' + pts[pts.length - 1][0].toFixed(1) + ' ' + zero.toFixed(1) + ' Z';
    // above zero at full strength, below zero at 35%
    svg += '<path d="' + area((x) => Math.max(x, 0)) + '" fill="' + lineColor + '"></path>' +
      '<path d="' + area((x) => Math.min(x, 0)) + '" fill="' + lineColor + '" fill-opacity="0.35"></path>';
    if (pts.length === 1) svg += '<circle cx="' + pts[0][0].toFixed(1) + '" cy="' + yOf(pts[0][1]).toFixed(1) + '" r="2.5" fill="' + lineColor + '"></circle>';
    else svg += '<polyline points="' + pts.map((p) => p[0].toFixed(1) + ',' + yOf(p[1]).toFixed(1)).join(' ') + '" fill="none" stroke="' + lineColor + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></polyline>';
  });
  svg += '<rect class="plot-axis" x="' + PLOT.left + '" y="' + Math.round(zero) + '" width="' + (PLOT.right - PLOT.left) + '" height="1"></rect>';

  // label at the most extreme value, with its sign
  const ex = Math.min(PLOT.right - 30, Math.max(PLOT.left + 30, chartX(extremeIndex, n)));
  const ey = atTop ? yOf(extreme) - 4 : yOf(extreme) + 13;
  svg += '<text class="plot-extreme" x="' + ex.toFixed(1) + '" y="' + ey.toFixed(1) + '" text-anchor="middle">' + signedValue(extreme, series) + '</text>';
  return svg + '</svg>';
}

// Splits a series into runs of consecutive known values: [[{i, val}, ...], ...]
function segmentsOf(series) {
  const segments = [];
  let current = [];
  series.forEach((val, i) => {
    if (isNumber(val)) current.push({ i: i, val: val });
    else if (current.length) { segments.push(current); current = []; }
  });
  if (current.length) segments.push(current);
  return segments;
}

// ---------- comparison line (follows the mouse across all six charts) ----------

function setupComparisonLine() {
  const box = $('event-charts');
  box.addEventListener('mousemove', (e) => showComparisonLine(e.clientX));
  box.addEventListener('mouseleave', hideComparisonLine);
}

function hideComparisonLine() {
  const layer = $('comparison');
  if (layer) layer.hidden = true;
}

function showComparisonLine(clientX) {
  const ev = getSelectedEvent();
  const layer = $('comparison');
  const dates = ev && Array.isArray(ev.dates) ? ev.dates : [];
  const n = dates.length;
  if (!ev || !n || !layer) return;
  const box = $('event-charts');
  const plots = box.querySelectorAll('.anomaly-plot svg');
  const axis = box.querySelector('.date-axis svg');
  const boxRect = box.getBoundingClientRect();
  const first = plots[0].getBoundingClientRect();
  const scale = first.width / PLOT.width;                 // the SVGs scale with the card width

  // the day under the mouse (only days inside the data range)
  const plotX = (clientX - first.left) / scale;
  const day = Math.round((plotX - PLOT.left) / (PLOT.right - PLOT.left) * (n - 1 + 2 * DAY_MARGIN) - DAY_MARGIN);
  if (plotX < PLOT.left || day < 0 || day > n - 1) { hideComparisonLine(); return; }

  const x = first.left - boxRect.left + chartX(day, n) * scale;
  const top = first.top - boxRect.top + PLOT.top * scale;
  const axisTop = axis.getBoundingClientRect().top - boxRect.top + 4 * scale;
  const flip = x > boxRect.width * 0.7;                   // near the right edge, values go on the left side

  let html = '<div class="guide-line" style="left:' + x.toFixed(1) + 'px; top:' + top.toFixed(1) + 'px; height:' + (axisTop - top).toFixed(1) + 'px"></div>' +
    '<div class="guide-date" style="left:' + x.toFixed(1) + 'px; top:' + axisTop.toFixed(1) + 'px">' + dates[day] + '</div>';
  plots.forEach((svg, k) => {
    const sc = chartScales[k];
    const v = CLIMATE_VARS[k];
    const r = svg.getBoundingClientRect();
    const value = sc ? sc.series[day] : null;
    // a dot on the curve with the value; a missing value is shown as "No data" in the middle of the chart
    const y = isNumber(value) ? r.top - boxRect.top + sc.yOf(value) * scale : r.top - boxRect.top + r.height / 2;
    const text = isNumber(value) ? signedValue(value, sc.series) + ' ' + v.unit : NO_DATA;
    html += '<div class="hover-value' + (flip ? ' flip' : '') + '" style="left:' + x.toFixed(1) + 'px; top:' + y.toFixed(1) + 'px">' +
      (isNumber(value) ? '<span class="hover-dot" style="border-color:' + color(v.colorVar) + '"></span>' : '<span class="hover-dot" style="visibility:hidden"></span>') +
      '<span class="hover-chip">' + text + '</span></div>';
  });
  layer.innerHTML = html;
  layer.hidden = false;
}
