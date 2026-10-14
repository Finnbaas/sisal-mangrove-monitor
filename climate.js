// "Climate at Sisal" on the Climatology page.
//
// Card "climate-typical-year": one chart per climate variable, stacked, with one shared month axis
// and the dotted comparison line. The charts are made exactly like the storm anomaly charts: they use
// the same drawing parts and the same comparison line from climatology.js (chartRow, chartHead,
// chartYAxis, chartNoData, sharedAxis, ticksFor, segmentsOf, attachComparisonLine).
//
// The numbers come from data/climate/typical-year.json, made by the Python script
// analysis/climatology/export_typical_year.py from the team's notebook. This file only draws them;
// it never calculates numbers.
// Which charts are shown, in which order, with which label and color, is set in
// content/variables.json ("climateVariables"), like the storm charts ("eventVariables").
//
// This file uses helpers from app.js ($, color, colorVarOf, isNumber, formatLike, NO_DATA),
// content.js (CONTENT, t, parseJsonFile) and climatology.js (PLOT and the chart parts above).

const TYPICAL_YEAR_FILE = 'data/climate/typical-year.json';

let CLIMATE_PANELS = [];        // one chart per entry, top to bottom (variables.json "climateVariables")
let typicalYear = null;         // contents of data/climate/typical-year.json
let typicalYearCharts = null;   // the charts, as a set for the comparison line (see climatology.js)

function setupClimate() {
  CLIMATE_PANELS = (CONTENT.variables.climateVariables || []).map((x) => ({
    id: x.id, label: x.label, colorVar: colorVarOf(x.color), seriesLabels: x.seriesLabels || {}
  }));
  attachComparisonLine($('typical-year-charts'), () => typicalYearCharts);
  // the description of the data source map, for people who cannot see it
  const map = document.querySelector('.climate-sources-card img');
  if (map) map.alt = t('labels.dataSourcesAlt');
  loadTypicalYear();
}

async function loadTypicalYear() {
  try {
    const response = await fetch(TYPICAL_YEAR_FILE);
    if (!response.ok) throw new Error('the file could not be loaded (HTTP ' + response.status + ')');
    const data = parseJsonFile(await response.text(), TYPICAL_YEAR_FILE);
    if (!data || typeof data.variables !== 'object') throw new Error('"variables" is missing');
    typicalYear = data;
  } catch (err) {
    // a problem with this file only affects these charts: the message names the file
    $('typical-year-status').textContent = t('messages.couldNotLoadClimateData', { error: TYPICAL_YEAR_FILE + ': ' + err.message });
    console.error(err);
  }
  renderTypicalYear();
  loadClimateChange();   // uses the units of the typical-year file
}

// ---------- the month scale ----------

// x position (SVG units) of month number i (0 = January): the middle of its twelfth of the plot
function monthX(i) {
  return PLOT.left + (i + 0.5) / 12 * (PLOT.right - PLOT.left);
}

// the month under the mouse (x in SVG units), or -1 left of the y-axis
function monthAt(plotX) {
  if (plotX < PLOT.left) return -1;
  return Math.min(11, Math.max(0, Math.floor((plotX - PLOT.left) / ((PLOT.right - PLOT.left) / 12))));
}

// ---------- drawing ----------

function renderTypicalYear() {
  const box = $('typical-year-charts');
  box.innerHTML = '';
  typicalYearCharts = null;
  if (!CLIMATE_PANELS.length) {
    box.innerHTML = '<p class="placeholder-text"></p>';
    box.firstChild.textContent = t('messages.notYetAvailable');
    return;
  }
  const variables = (typicalYear && typicalYear.variables) || {};
  const sources = {};
  Object.entries(CONTENT.variables.sources || {}).forEach(([id, s]) => { sources[id] = { label: s.label, colorVar: colorVarOf(s.color) }; });

  const panels = CLIMATE_PANELS.map((p) => {
    const data = variables[p.id];
    const unit = data ? data.unit + (data.note ? ', ' + data.note : '') : NO_DATA;
    const drawn = monthChartSvg(p, data);
    box.appendChild(chartRow({ label: p.label, unit: unit }, data ? sources[data.source] : null, drawn.svg));
    return drawn.panel;
  });

  // one shared month axis under all charts (J to D)
  const letters = (CONTENT.texts.months || []).map((m) => String(m).charAt(0));
  box.appendChild(sharedAxis(letters.map((letter, i) => ({ x: monthX(i), text: letter })), t('labels.month')));
  box.insertAdjacentHTML('beforeend', '<div class="comparison" hidden></div>');

  const monthNames = t('labels.monthsLong').split(',');
  typicalYearCharts = { count: 12, xOf: monthX, indexAt: monthAt, label: (i) => monthNames[i] || String(i + 1), panels: panels };
}

// One chart: for every series the monthly mean as a line with the 10th to 90th percentile as a light
// band, or bars (rainfall), or a line without band and with a zero line (sea level).
// Returns the SVG text and what the comparison line needs ({ yOf, points }).
function monthChartSvg(p, data) {
  const head = chartHead(p, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(monthX), 'typical year');
  const series = data && Array.isArray(data.series) ? data.series : [];
  const known = [];
  series.forEach((s) => ['mean', 'p10', 'p90'].forEach((k) => (s[k] || []).forEach((v) => { if (isNumber(v)) known.push(v); })));
  if (!known.length) return { svg: chartNoData(head), panel: null };

  const bars = data.kind === 'bars';
  const withZero = bars || series.every((s) => !s.p10);         // bars and lines without a band show 0
  const t = ticksFor(Math.min(...known), Math.max(...known), withZero);
  const lo = Math.min(Math.min(...known), t.ticks[0]), hi = Math.max(Math.max(...known), t.ticks[t.ticks.length - 1]);
  const span = PLOT.bottom - PLOT.top;
  const pad = 4 * ((hi - lo) || 1) / (span - 8);                // 4 SVG units of room above and below
  const yOf = (val) => PLOT.top + (hi + pad - val) / ((hi - lo) + 2 * pad) * span;
  const c = color(p.colorVar);

  let svg = head + chartYAxis(t, yOf);
  series.forEach((s, k) => {
    const mean = s.mean || [];
    if (bars) {
      const w = (PLOT.right - PLOT.left) / 12 * 0.6;
      mean.forEach((v, i) => {
        if (!isNumber(v)) return;
        const y0 = yOf(0), y = yOf(v);
        svg += '<rect x="' + (monthX(i) - w / 2).toFixed(1) + '" y="' + Math.min(y, y0).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.abs(y0 - y).toFixed(1) + '" fill="' + c + '"></rect>';
      });
      return;
    }
    // the band: along the 90th percentile line, and back along the 10th percentile line
    if (s.p10 && s.p90) {
      const upper = [], lower = [];
      s.p90.forEach((v, i) => {
        if (!isNumber(v) || !isNumber(s.p10[i])) return;
        upper.push(monthX(i).toFixed(1) + ',' + yOf(v).toFixed(1));
        lower.unshift(monthX(i).toFixed(1) + ',' + yOf(s.p10[i]).toFixed(1));
      });
      if (upper.length) svg += '<polygon points="' + upper.concat(lower).join(' ') + '" fill="' + c + '" fill-opacity="0.18"></polygon>';
    }
    // the mean as a line, the same weight as the storm charts; a second series (daily min) is dashed
    segmentsOf(mean).forEach((seg) => {
      if (seg.length === 1) svg += '<circle cx="' + monthX(seg[0].i).toFixed(1) + '" cy="' + yOf(seg[0].val).toFixed(1) + '" r="2.5" fill="' + c + '"></circle>';
      else svg += '<polyline points="' + seg.map((pt) => monthX(pt.i).toFixed(1) + ',' + yOf(pt.val).toFixed(1)).join(' ') + '" fill="none" stroke="' + c +
        '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"' + (k > 0 ? ' stroke-dasharray="4 3"' : '') + '></polyline>';
    });
  });
  // the zero line, where 0 is on the scale (rainfall, sea level)
  if (withZero) svg += '<rect class="plot-axis" x="' + PLOT.left + '" y="' + Math.round(yOf(0)) + '" width="' + (PLOT.right - PLOT.left) + '" height="1"></rect>';

  // what the comparison line shows at month i: the mean of every series, in the unit of the data
  const points = (i) => series.map((s) => {
    const v = (s.mean || [])[i];
    const name = p.seriesLabels[s.id];
    return { value: v, color: c, text: (name ? name + ' ' : '') + formatLike(v, s.mean) + ' ' + data.unit };
  });
  return { svg: svg + '</svg>', panel: { yOf: yOf, points: points } };
}

// =============================================================================================
// Card "climate-change": the same panels as "A typical year", on a shared year axis, with the trend
// value(s) and badge in each panel's top right corner. The trend values and badges are content
// (content/climate.json, "trends"); the charts themselves are not filled yet (empty frames).
// =============================================================================================

const CLIMATE_CONTENT_FILE = 'content/climate.json';

async function loadClimateChange() {
  let content = null;
  try {
    const response = await fetch(CLIMATE_CONTENT_FILE);
    if (!response.ok) throw new Error('the file could not be loaded (HTTP ' + response.status + ')');
    content = parseJsonFile(await response.text(), CLIMATE_CONTENT_FILE);
  } catch (err) {
    console.error(err);
  }
  renderClimateChange(content);
  renderClimateDetail(content);
}

function renderClimateChange(content) {
  const box = $('climate-change-charts');
  box.innerHTML = '';
  if (!CLIMATE_PANELS.length) {
    box.innerHTML = '<p class="placeholder-text"></p>';
    box.firstChild.textContent = t('messages.notYetAvailable');
    return;
  }
  const years = (content && content.years) || { first: 1950, last: 2025 };
  const trends = (content && content.trends) || {};
  const badges = (content && content.badges) || {};
  // x position (SVG units) of a year, with half a year of room at both ends
  const yearX = (y) => PLOT.left + (y - years.first + 0.5) / (years.last - years.first + 1) * (PLOT.right - PLOT.left);
  const decades = [];
  for (let y = Math.ceil(years.first / 10) * 10; y <= years.last; y += 10) decades.push(y);
  const variables = (typicalYear && typicalYear.variables) || {};

  CLIMATE_PANELS.forEach((p) => {
    const data = variables[p.id];
    const unit = data ? data.unit + (data.note ? ', ' + data.note : '') : NO_DATA;
    // an empty chart for now: the frame, the decade gridlines and the y-axis line
    const svg = chartNoData(chartHead(p, decades.map(yearX), 'change since ' + years.first), t('messages.notYetAvailable'));
    const row = chartRow({ label: p.label, unit: unit }, null, svg);
    // the trend in the top right corner, where the typical-year charts show their source
    const trend = trends[p.id];
    const tag = row.querySelector('.source-tag');
    tag.className = 'trend-tag';
    tag.innerHTML = '';
    if (trend) {
      (Array.isArray(trend.lines) ? trend.lines : [trend.lines]).filter(Boolean).forEach((line) => {
        const v = document.createElement('span');
        v.className = 'trend-tag-value mono';
        v.textContent = line;
        tag.appendChild(v);
      });
      if (badges[trend.badge]) {
        const b = document.createElement('span');
        b.className = 'trend-badge badge-' + trend.badge;
        b.textContent = badges[trend.badge];
        tag.appendChild(b);
      }
    } else tag.textContent = t('messages.notYetAvailable');
    box.appendChild(row);
  });
  // one shared year axis under all charts
  box.appendChild(sharedAxis(decades.map((y) => ({ x: yearX(y), text: String(y) })), t('labels.year')));
}

// =============================================================================================
// Card "climate-detail" ("In detail"): one tab per variable (air temperature: daily max and daily min).
// The selected tab shows the variable's name, unit, source and record period, two chart places
// ((a) daily values with a running mean, (b) annual means with a trend line) and, next to (b), the
// trend with its badge (the same as in "Change since 1950"). The charts are not filled yet.
// =============================================================================================

let detailTabs = [];        // [{ id, panel, series, label }]
let detailSelected = 0;
let detailContent = null;   // content/climate.json (trends and badges)

function renderClimateDetail(content) {
  detailContent = content;
  detailTabs = [];
  const variables = (typicalYear && typicalYear.variables) || {};
  CLIMATE_PANELS.forEach((p) => {
    const series = variables[p.id] && Array.isArray(variables[p.id].series) ? variables[p.id].series : [];
    // a variable with named series (air temperature: max, min) gets one tab per series
    const named = series.filter((s) => p.seriesLabels[s.id]);
    if (named.length > 1) named.forEach((s) => detailTabs.push({ panel: p, series: s.id, label: p.label + ' (' + p.seriesLabels[s.id] + ')' }));
    else detailTabs.push({ panel: p, series: null, label: p.label });
  });
  const tabs = $('climate-detail-tabs');
  tabs.innerHTML = '';
  detailTabs.forEach((tab, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'detail-tab';
    b.innerHTML = '<span class="detail-swatch"></span><span></span>';
    b.querySelector('.detail-swatch').style.background = color(tab.panel.colorVar);
    b.lastChild.textContent = tab.label;
    b.addEventListener('click', () => { detailSelected = i; renderClimateDetailTab(); });
    tabs.appendChild(b);
  });
  renderClimateDetailTab();
}

function renderClimateDetailTab() {
  const tabs = [...$('climate-detail-tabs').children];
  tabs.forEach((b, i) => { b.classList.toggle('selected', i === detailSelected); b.setAttribute('aria-pressed', i === detailSelected); });
  const tab = detailTabs[detailSelected];
  const box = $('climate-detail-body');
  box.innerHTML = '';
  if (!tab) return;
  const data = ((typicalYear && typicalYear.variables) || {})[tab.panel.id];
  const sources = CONTENT.variables.sources || {};
  // header line: name · unit · source · record period
  const facts = data ? [data.unit + (data.note ? ', ' + data.note : ''), (sources[data.source] || {}).label || NO_DATA,
    data.record ? data.record.start.slice(0, 4) + '–' + data.record.end.slice(0, 4) : NO_DATA] : [NO_DATA];
  const head = document.createElement('div');
  head.className = 'detail-header';
  head.innerHTML = '<span class="detail-name"></span><span class="detail-facts"></span>';
  head.firstChild.textContent = tab.label;
  head.lastChild.textContent = '· ' + facts.join(' · ');
  box.appendChild(head);

  // the two chart places, and the trend next to (b)
  const place = (text) => { const d = document.createElement('div'); d.className = 'detail-chart'; d.innerHTML = '<span class="detail-chart-title"></span><span class="placeholder-text"></span>';
    d.firstChild.textContent = text; d.lastChild.textContent = t('messages.notYetAvailable'); return d; };
  const monthly = tab.panel.id === 'seaLevel';
  box.appendChild(place(t(monthly ? 'labels.detailMonthly' : 'labels.detailDaily')));
  const row = document.createElement('div');
  row.className = 'detail-row';
  row.appendChild(place(t('labels.detailAnnual')));
  const trend = ((detailContent && detailContent.trends) || {})[tab.panel.id];
  const badges = (detailContent && detailContent.badges) || {};
  const summary = document.createElement('div');
  summary.className = 'detail-trend';
  summary.innerHTML = '<div class="method-label"></div>';
  summary.firstChild.textContent = t('labels.colTrend');
  if (trend) {
    // air temperature: only the line of the selected series ("Max ..." or "Min ...")
    let lines = (Array.isArray(trend.lines) ? trend.lines : [trend.lines]).filter(Boolean);
    if (tab.series) {
      const own = lines.filter((l) => l.toLowerCase().startsWith(String(tab.panel.seriesLabels[tab.series]).toLowerCase()));
      if (own.length) lines = own;
    }
    lines.forEach((l) => { const v = document.createElement('div'); v.className = 'trend-tag-value mono'; v.textContent = l; summary.appendChild(v); });
    if (badges[trend.badge]) summary.insertAdjacentHTML('beforeend', '<span class="trend-badge badge-' + trend.badge + '"></span>');
    if (badges[trend.badge]) summary.lastChild.textContent = badges[trend.badge];
  } else summary.insertAdjacentHTML('beforeend', '<div class="placeholder-text">' + t('messages.notYetAvailable') + '</div>');
  row.appendChild(summary);
  box.appendChild(row);
}
