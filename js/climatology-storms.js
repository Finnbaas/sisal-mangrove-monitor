// climatology-storms.js: "Storms at Sisal" on the Climatology page.
//   The list of storms and extreme events, and for the selected storm one anomaly chart per variable
//   (content/variables.json "eventVariables"), a shared date axis and the comparison line.
// Reads: data/events.json (see CLAUDE.md "Structure of data/events.json").
// Uses: helpers.js, content.js, charts.js. Used by: main.js (setupStorms).

// ---------- content (set from content/variables.json and content/texts.json, see readStormContent) ----------

let EVENT_VARS = [];   // one chart per entry, top to bottom (variables.json "eventVariables"; "id" = field in events.json)
let SOURCES = {};        // where a variable's data comes from (variables.json "sources")
let MONTHS = [];         // month names for the date labels (texts.json "months")

function readStormContent() {
  const v = CONTENT.variables;
  EVENT_VARS = v.eventVariables.map((x) => ({ id: x.id, label: x.label, unit: x.unit || '', colorVar: colorVarOf(x.color) }));
  SOURCES = {};
  Object.entries(v.sources).forEach(([id, s]) => { SOURCES[id] = { label: s.label, colorVar: colorVarOf(s.color) }; });
  MONTHS = Array.isArray(CONTENT.texts.months) && CONTENT.texts.months.length === 12 ? CONTENT.texts.months : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
}

const DAY_MARGIN = 2;          // empty days drawn before the first and after the last day of data

// ---------- state ----------

let events = [];               // contents of data/events.json
let selectedEventId = null;    // the selected event; at the start the one named in content/texts.json "defaultStorm"
let chartScales = [];          // per chart: how to turn a value into a y position (used by the comparison line)

// ---------- loading ----------

async function loadEvents() {
  try {
    const response = await fetch('data/events.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    events = await response.json();
    // select the default storm at the start, so the anomaly charts are not empty
    if (events.some((e) => e.id === CONTENT.texts.defaultStorm)) selectedEventId = CONTENT.texts.defaultStorm;
  } catch (err) {
    $('events-status').textContent = t('messages.couldNotLoadEvents', { error: err.message });
    console.error(err);
  }
  renderEventList();
  renderEventCharts();
  renderStormMap();           // storm-map.js: the map shows the selected storm
  renderStormCounts();        // storm-counts.js: footnote about studied storms that are not counted
  reportUnmatchedStorms();
}

function setupStorms() {
  readStormContent();
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

// Click a row to select that event; click the selected one again to deselect it.
function selectEvent(id) {
  selectedEventId = selectedEventId === id ? null : id;
  renderEventList();
  renderEventCharts();
  renderStormMap();           // storm-map.js: highlight the track, dim the others
  renderStormCounts();        // storm-counts.js: outline the selected storm in the bar charts
}

// ---------- event list ----------

// "Tropical storm near Sisal" (where = 'near') or "cat. 5 at peak" (where = 'peak'), from content/texts.json "strengths".
// A storm that was never within 100 km at tropical-depression strength or more has no strength near Sisal: "No data".
function strengthText(code, where) {
  return code ? t(where === 'near' ? 'labels.strengthNear' : 'labels.strengthPeak', { strength: t('strengths.' + code + '.' + where) }) : NO_DATA;
}

// The list shows every event, in the order of data/events.json (newest first).
function renderEventList() {
  const list = $('event-list');
  list.innerHTML = '';

  // under the list: the number of events since the first one
  const years = events.map((e) => parseMonth(e.month)).filter(Boolean).map((m) => m.year);
  $('event-list-note').textContent = years.length ? t('labels.eventListNote', { count: events.length, year: Math.min(...years) }) : '';

  events.forEach((ev) => {
    const row = document.createElement('button');
    row.className = 'event-row' + (ev.id === selectedEventId ? ' selected' : '');
    row.setAttribute('aria-pressed', ev.id === selectedEventId);
    row.innerHTML =
      '<span class="event-row-dot"></span>' +
      '<span class="event-row-text"><span class="event-row-name"></span><span class="event-row-date"></span></span>' +
      '<span class="event-type"><span class="event-type-near"></span><span class="event-type-peak"></span></span>';
    row.querySelector('.event-row-name').textContent = ev.name || NO_DATA;
    row.querySelector('.event-row-date').textContent = monthLabel(ev);
    row.querySelector('.event-type-near').textContent = strengthText(ev.strengthNear, 'near');
    // second line only when the storm was stronger elsewhere on its track than near Sisal
    row.querySelector('.event-type-peak').textContent = ev.strengthPeak && ev.strengthPeak !== ev.strengthNear ? strengthText(ev.strengthPeak, 'peak') : '';
    row.addEventListener('click', () => selectEvent(ev.id));
    list.appendChild(row);
  });
}

// ---------- the six anomaly charts ----------

// x position (SVG units) of day number i, for an event with n days of data
function chartX(i, n) {
  return PLOT.left + (i + DAY_MARGIN) / (n - 1 + 2 * DAY_MARGIN) * (PLOT.right - PLOT.left);
}

// Weekly gridlines: the days that fall on a Saturday (the same days as in the Figma design).
function weeklyDays(dates) {
  return dates.map((d, i) => ({ d: d, i: i })).filter((p) => new Date(p.d + 'T00:00:00Z').getUTCDay() === 6);
}

// "2024-09-14" -> "14 Sep"
function shortDate(text) {
  const parts = String(text).split('-');
  const month = parseInt(parts[1], 10);
  return month >= 1 && month <= 12 ? parseInt(parts[2], 10) + ' ' + MONTHS[month - 1] : String(text);
}

function renderEventCharts() {
  const ev = getSelectedEvent();
  $('event-charts-empty').hidden = !!ev;
  $('event-charts-content').hidden = !ev;
  chartScales = [];
  stormCharts = null;
  hideComparisonLine();
  if (!ev) return;

  $('event-title').textContent = (ev.name || NO_DATA) + ' (' + monthLabel(ev) + ')';
  renderStormLegend(ev);
  // one line; the baseline of each dataset is in the hover text
  $('event-subtitle').textContent = t('labels.anomalyExplanation');
  $('event-subtitle').title = t('labels.baselineLabel') + ' ' + (ev.baseline || NO_DATA);

  const dates = Array.isArray(ev.dates) ? ev.dates : [];
  const n = dates.length;
  const weeks = weeklyDays(dates).filter((w, k) => k % 2 === 0);      // every second week: fewer ticks
  const box = $('event-charts');
  box.innerHTML = '';

  // no event variables listed in content/variables.json yet: say so instead of drawing empty charts
  if (!EVENT_VARS.length) {
    box.innerHTML = '<p class="placeholder-text"></p>';
    box.firstChild.textContent = t('messages.notYetAvailable');
    return;
  }

  EVENT_VARS.forEach((v) => {
    const series = seriesOf(ev, v);
    const source = SOURCES[(ev.sources || {})[v.id]];
    box.appendChild(chartRow(v, source, chartSvg(series, n, weeks, v, noDataReason(ev, v, source))));
  });

  // one shared date axis under all charts, with a label every week
  if (n) box.appendChild(sharedAxis(weeks.map((w) => ({ x: chartX(w.i, n), text: shortDate(w.d) })), t('labels.date')));

  // the storm period and peak: one box and one line over all charts
  stormOverlay(box, ev, dates);

  // the comparison line and its labels are drawn on top of the charts
  box.insertAdjacentHTML('beforeend', '<div id="comparison" class="comparison" hidden></div>');

  // what the comparison line needs to know about these charts (see showComparisonLine)
  const scales = chartScales;
  stormCharts = {
    count: n,
    xOf: (i) => chartX(i, n),
    // the day under the mouse (only days inside the data range)
    indexAt: (plotX) => {
      const day = Math.round((plotX - PLOT.left) / (PLOT.right - PLOT.left) * (n - 1 + 2 * DAY_MARGIN) - DAY_MARGIN);
      return plotX < PLOT.left || day < 0 || day > n - 1 ? -1 : day;
    },
    label: (i) => dates[i],
    panels: EVENT_VARS.map((v, k) => ({
      yOf: scales[k] ? scales[k].yOf : null,
      points: (i) => {
        const sc = scales[k];
        const value = sc ? sc.series[i] : null;
        return [{ value: value, color: color(v.colorVar), text: isNumber(value) ? signedValue(value, sc.series) + ' ' + v.unit : NO_DATA }];
      }
    }))
  };
}

// Draws one storm anomaly chart as SVG text. Also stores how values map to y positions in chartScales.
// Why a chart has no data: the storm lies outside the record period of the variable (typical-year.json "record"),
// for example "Record covers 1993 to 2012 (HYCOM cell)". Empty when the storm lies inside the record or the period is unknown.
function noDataReason(ev, v, source) {
  const record = typicalYear && typicalYear.variables && typicalYear.variables[v.id] && typicalYear.variables[v.id].record;
  const dates = Array.isArray(ev.dates) ? ev.dates : [];
  if (!record || !record.start || !record.end || !dates.length) return '';
  if (dates[dates.length - 1] >= record.start && dates[0] <= record.end) return '';
  return t('labels.noDataRecord', { start: record.start.slice(0, 4), end: record.end.slice(0, 4), source: source ? source.label : '' });
}

function chartSvg(series, n, weeks, v, reason) {
  const known = knownValues(series);
  // vertical gridlines are drawn even without data, so the charts stay aligned
  const head = chartHead(v, weeks.map((w) => chartX(w.i, n)), 'anomaly');
  if (!n || !known.length) {
    chartScales.push(null);
    return chartNoData(head, NO_DATA, reason);
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
  // horizontal gridlines, tick marks and tick values
  let svg = head + chartYAxis(t, yOf);

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

// The storm period as ONE red box over all charts, and the peak as one dashed red line (the same as in the team's
// figures). Both come from "stormPeriod" in data/events.json; no peak date: only the box. The overlay is placed in
// percent of the chart width (the charts are drawn on a 0 to PLOT.width grid), from the first to the last chart.
function stormOverlay(box, ev, dates) {
  const period = ev.stormPeriod || {};
  const n = dates.length;
  const rows = box.querySelectorAll('.anomaly-chart');
  if (!rows.length) return;
  const top = rows[0].offsetTop, bottom = rows[rows.length - 1].offsetTop + rows[rows.length - 1].offsetHeight;
  // x of day i as a CSS length: the 40 px label column, then a share of the rest
  const left = (i) => 'calc(40px + (100% - 40px) * ' + (chartX(i, n) / PLOT.width).toFixed(5) + ')';
  const first = dates.indexOf(period.start), last = dates.indexOf(period.end);
  const add = (className, style) => {
    const el = document.createElement('div');
    el.className = className;
    el.style.top = top + 'px';
    el.style.height = (bottom - top) + 'px';
    Object.assign(el.style, style);
    box.appendChild(el);
  };
  if (first >= 0 && last >= first) add('storm-box', { left: left(first), width: 'calc(' + left(last) + ' - ' + left(first) + ')' });
  const peak = period.peak ? dates.indexOf(period.peak) : -1;
  if (peak >= 0) add('storm-peak', { left: left(peak) });
}

// The small legend above the charts: "Storm period" and, when the storm has a peak date, "Peak".
function renderStormLegend(ev) {
  const period = ev.stormPeriod || {};
  const legend = $('event-legend');
  legend.innerHTML = '';
  const item = (swatchClass, text) => {
    const el = document.createElement('span');
    el.className = 'storm-legend-item';
    el.innerHTML = '<span class="' + swatchClass + '"></span><span></span>';
    el.lastChild.textContent = text;
    legend.appendChild(el);
  };
  if (period.start && period.end) item('storm-legend-box', t('labels.stormPeriod'));
  if (period.peak) item('storm-legend-peak', t('labels.stormPeak'));
}

let stormCharts = null;   // the storm anomaly charts, as such a set (made in renderEventCharts)

function setupComparisonLine() {
  attachComparisonLine($('event-charts'), () => stormCharts);
}
