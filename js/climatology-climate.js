// climatology-climate.js: "Climate at Sisal" on the Climatology page.
//   "A typical year": one chart per climate variable with a shared month axis and the comparison line,
//   drawn with the same parts as the storm charts (charts.js). "Change since 1950": annual means with
//   the trend line, the trend value and its badge. "In detail": one tab per variable with its trend.
//   This file only draws: the numbers are calculated in Python (analysis/climatology/export_typical_year.py).
// Reads: data/climate/typical-year.json, data/climate/change.json, data/climate/detail/<id>.json (per tab) and
//   content/climate.json (the badges); which charts, in which order and with
//   which label: content/variables.json "climateVariables".
// Uses: helpers.js, content.js, charts.js. Used by: main.js (setupClimate).

const TYPICAL_YEAR_FILE = 'data/climate/typical-year.json';

let CLIMATE_PANELS = [];        // one chart per entry, top to bottom (variables.json "climateVariables")
let typicalYear = null;         // contents of data/climate/typical-year.json
let typicalYearCharts = null;   // the charts, as a set for the comparison line (see charts.js)

// The panels of "A typical year" and "Change since 1950": the same list as CLIMATE_PANELS, except that a variable
// with named series (air temperature: max and min) gets one panel per series, so each trend is easy to see.
// A panel of one series has `only` = the series id.
function overviewPanels() {
  const list = [];
  CLIMATE_PANELS.forEach((p) => {
    const ids = Object.keys(p.seriesLabels);
    if (ids.length < 2) { list.push(p); return; }
    ids.forEach((id) => list.push(Object.assign({}, p, { label: p.label + ' (' + p.seriesLabels[id] + ')', only: id, seriesLabels: {} })));
  });
  return list;
}

// The data of a panel: only its own series when it shows one series of a variable.
function panelData(p, data) {
  if (!data || !p.only || !Array.isArray(data.series)) return data;
  return Object.assign({}, data, { series: data.series.filter((s) => s.id === p.only) });
}

function setupClimate() {
  CLIMATE_PANELS = (CONTENT.variables.climateVariables || []).map((x) => ({
    id: x.id, label: x.label, colorVar: colorVarOf(x.color), seriesLabels: x.seriesLabels || {}
  }));
  attachComparisonLine($('typical-year-charts'), () => typicalYearCharts);
  attachComparisonLine($('climate-change-charts'), () => climateChangeCharts);
  // the description of the data source map, for people who cannot see it
  const map = document.querySelector('.climate-sources-card img');
  if (map) {
    map.alt = t('labels.dataSourcesAlt');
    setupEnlargeableImage(map);
  }
  loadTypicalYear();
}

// Pressing the image (or Enter on it) shows it big over the page; a click anywhere, the close button or Escape closes it.
function setupEnlargeableImage(img) {
  img.classList.add('enlargeable');
  img.tabIndex = 0;
  img.setAttribute('role', 'button');
  img.title = t('labels.clickToEnlarge');

  const open = () => {
    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.innerHTML = '<img alt=""><button type="button" class="image-overlay-close"></button>';
    overlay.querySelector('img').src = img.src;
    overlay.querySelector('img').alt = img.alt;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const button = overlay.querySelector('button');
    button.textContent = '\u00D7';
    button.setAttribute('aria-label', t('labels.close'));
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    button.focus();
  };
  img.addEventListener('click', open);
  img.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
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
  renderEventCharts();        // climatology-storms.js: the reason for "No data" uses the record period of this file
  loadClimateChange();
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

  const panels = overviewPanels().map((p) => {
    const data = panelData(p, variables[p.id]);
    const unit = data ? data.unit + (data.note ? ', ' + data.note : '') : NO_DATA;
    const drawn = monthChartSvg(p, data);
    box.appendChild(chartRow({ label: p.label, unit: unit, onOpen: () => openClimateDetail(p.id, p.only) }, data ? sources[data.source] : null, drawn.svg));
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
  const t = ticksFor(Math.min(...known), Math.max(...known), withZero, true);
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
// Card "climate-change": the same panels as "A typical year", on a shared year axis. Per panel the
// annual means as a line with small markers and the trend as a dashed grey line. The trend value and
// badge are shown in "In detail". The numbers come from data/climate/change.json (Python);
// the badge (the team's verdict) comes from content/climate.json.
// =============================================================================================

const CLIMATE_CONTENT_FILE = 'content/climate.json';
const CLIMATE_CHANGE_FILE = 'data/climate/change.json';

let climateChange = null;         // contents of data/climate/change.json
let climateChangeCharts = null;   // the charts, as a set for the comparison line (see charts.js)

async function loadClimateChange() {
  let content = null;
  try {
    const response = await fetch(CLIMATE_CONTENT_FILE);
    if (!response.ok) throw new Error('the file could not be loaded (HTTP ' + response.status + ')');
    content = parseJsonFile(await response.text(), CLIMATE_CONTENT_FILE);
  } catch (err) {
    console.error(err);
  }
  climateChange = null;
  try {
    const response = await fetch(CLIMATE_CHANGE_FILE);
    if (!response.ok) throw new Error('the file could not be loaded (HTTP ' + response.status + ')');
    const data = parseJsonFile(await response.text(), CLIMATE_CHANGE_FILE);
    if (!data || typeof data.variables !== 'object') throw new Error('"variables" is missing');
    climateChange = data;
  } catch (err) {
    // a problem with this file only affects these charts: the message names the file
    $('climate-change-status').textContent = t('messages.couldNotLoadClimateData', { error: CLIMATE_CHANGE_FILE + ': ' + err.message });
    console.error(err);
  }
  renderClimateChange(content);
  renderClimateDetail(content);
}

// the trend of one series as text, for example "+0.09 ± 0.04 °C/decade" (decimals follow the ± value)
function trendText(s, trendUnit) {
  const decimals = s.ci95 > 0 ? Math.max(0, 1 - Math.floor(Math.log10(s.ci95))) : 2;
  return (s.slope < 0 ? '−' : '+') + Math.abs(s.slope).toFixed(decimals) + ' ± ' + Math.abs(s.ci95).toFixed(decimals) + ' ' + trendUnit;
}

// the trend lines of one variable ("Max +0.09 ± 0.04 °C/decade"); a series with a name in
// content/variables.json "seriesLabels" starts with that name
function trendLines(p) {
  const data = climateChange && climateChange.variables[p.id];
  if (!data || !Array.isArray(data.series)) return [];
  return data.series.filter((s) => isNumber(s.slope) && isNumber(s.ci95)).map((s) => {
    const name = p.seriesLabels[s.id];
    return (name ? name.charAt(0).toUpperCase() + name.slice(1) + ' ' : '') + trendText(s, data.trendUnit);
  });
}

function renderClimateChange(content) {
  const box = $('climate-change-charts');
  box.innerHTML = '';
  climateChangeCharts = null;
  if (!CLIMATE_PANELS.length) {
    box.innerHTML = '<p class="placeholder-text"></p>';
    box.firstChild.textContent = t('messages.notYetAvailable');
    return;
  }
  const years = (content && content.years) || { first: 1950, last: 2025 };
  const count = years.last - years.first + 1;
  // x position (SVG units) of a year, with half a year of room at both ends
  const yearX = (y) => PLOT.left + (y - years.first + 0.5) / count * (PLOT.right - PLOT.left);
  const decades = [];
  for (let y = Math.ceil(years.first / 10) * 10; y <= years.last; y += 10) decades.push(y);
  const variables = (climateChange && climateChange.variables) || {};

  const panels = overviewPanels().map((p) => {
    const data = panelData(p, variables[p.id]);
    const unit = data ? data.unit + (data.note ? ', ' + data.note : '') : NO_DATA;
    const drawn = yearChartSvg(p, data, years, yearX, decades);
    const row = chartRow({ label: p.label, unit: unit, onOpen: () => openClimateDetail(p.id, p.only) }, null, drawn.svg);
    // the source tag is replaced by the trend (value and p-value) in the top right; the badge is shown in "In detail"
    row.querySelector('.source-tag').remove();
    const lines = data && Array.isArray(data.series) ? data.series.map((s) => trendTagText(s, p.seriesLabels[s.id], data.trendUnit)).filter(Boolean) : [];
    if (lines.length) {
      const tag = document.createElement('div');
      tag.className = 'trend-tag';
      lines.forEach((text) => { const line = document.createElement('span'); line.className = 'trend-tag-value'; line.textContent = text; tag.appendChild(line); });
      row.style.setProperty('--tag-lines', lines.length);
      row.appendChild(tag);
    }
    box.appendChild(row);
    return drawn.panel;
  });
  // one shared year axis under all charts
  box.appendChild(sharedAxis(decades.map((y) => ({ x: yearX(y), text: String(y) })), t('labels.year')));
  box.insertAdjacentHTML('beforeend', '<div class="comparison" hidden></div>');

  // the comparison line snaps to years
  climateChangeCharts = {
    count: count, xOf: (i) => yearX(years.first + i), label: (i) => String(years.first + i), panels: panels,
    indexAt: (plotX) => (plotX < PLOT.left ? -1 : Math.min(count - 1, Math.max(0, Math.floor((plotX - PLOT.left) / ((PLOT.right - PLOT.left) / count)))))
  };
}

// One chart: for every series the annual means as a line with small markers (from the first year with
// data, so a series that starts later starts at its real year) and the trend as a dashed grey line.
// Returns the SVG text and what the comparison line needs ({ yOf, points }).
function yearChartSvg(p, data, years, yearX, decades) {
  const head = chartHead(p, decades.map(yearX), 'change since ' + years.first);
  const series = data && Array.isArray(data.series) ? data.series : [];
  const known = [];
  series.forEach((s) => ['means', 'fit'].forEach((k) => (k === 'fit' && !(s.p < TREND_P_LIMIT) ? [] : (s[k] || [])).forEach((v) => { if (isNumber(v)) known.push(v); })));
  if (!known.length) return { svg: chartNoData(head), panel: null };

  const t = ticksFor(Math.min(...known), Math.max(...known), false, true);
  const lo = Math.min(Math.min(...known), t.ticks[0]), hi = Math.max(Math.max(...known), t.ticks[t.ticks.length - 1]);
  const span = PLOT.bottom - PLOT.top;
  const pad = 4 * ((hi - lo) || 1) / (span - 8);                // 4 SVG units of room above and below
  const yOf = (val) => PLOT.top + (hi + pad - val) / ((hi - lo) + 2 * pad) * span;
  const c = color(p.colorVar);

  let svg = head + chartYAxis(t, yOf);
  const byYear = [];   // per series: the annual means with one place per year of the axis (null = no value)
  series.forEach((s, k) => {
    const row = new Array(years.last - years.first + 1).fill(null);
    (s.years || []).forEach((y, i) => { if (y >= years.first && y <= years.last && isNumber(s.means[i])) row[y - years.first] = s.means[i]; });
    byYear.push(row);
    // the trend: a dashed grey line from the first to the last year of the series, only when it is significant
    if (s.p < TREND_P_LIMIT && s.fit && s.years && s.years.length) {
      svg += '<line x1="' + yearX(s.years[0]).toFixed(1) + '" y1="' + yOf(s.fit[0]).toFixed(1) + '" x2="' + yearX(s.years[s.years.length - 1]).toFixed(1) +
        '" y2="' + yOf(s.fit[1]).toFixed(1) + '" stroke="' + color('--color-text-faint') + '" stroke-width="1" stroke-dasharray="4 3"></line>';
    }
    // the annual means as a line with small markers; a second series (daily min) is dashed
    segmentsOf(row).forEach((seg) => {
      if (seg.length > 1) svg += '<polyline points="' + seg.map((pt) => yearX(years.first + pt.i).toFixed(1) + ',' + yOf(pt.val).toFixed(1)).join(' ') + '" fill="none" stroke="' + c +
        '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"' + (k > 0 ? ' stroke-dasharray="4 3"' : '') + '></polyline>';
      seg.forEach((pt) => { svg += '<circle cx="' + yearX(years.first + pt.i).toFixed(1) + '" cy="' + yOf(pt.val).toFixed(1) + '" r="1.8" fill="' + c + '"></circle>'; });
    });
  });

  // what the comparison line shows at year i: the annual mean of every series
  const points = (i) => series.map((s, k) => {
    const v = byYear[k][i];
    const name = p.seriesLabels[s.id];
    return { value: v, color: c, text: (name ? name + ' ' : '') + formatLike(v, s.means) + ' ' + data.unit };
  });
  return { svg: svg + '</svg>', panel: { yOf: yOf, points: points } };
}

// =============================================================================================
// Card "climate-detail" ("In detail"): one tab per variable (air temperature: daily max and daily min).
// The selected tab shows the variable's name, unit, source and record period, chart (a) with the daily
// values (or, for sea level, the monthly anomaly) and chart (b) with the annual means and the trend,
// on one shared year axis. The file of a variable (data/climate/detail/<id>.json) is loaded when its tab
// is opened. The annual means and trends are the ones of change.json.
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

// Opens the tab of a variable in "In detail" (id = the id from climateVariables, the same one the panel
// labels use; series = the series id when the panel shows one series, e.g. "max") and scrolls smoothly to that card.
// Used by the variable names in the chart panels.
async function openClimateDetail(id, series) {
  const i = detailTabs.findIndex((tab) => tab.panel.id === id && (!series || tab.series === series));
  if (i < 0) return;
  detailSelected = i;
  // scroll only when the charts are drawn: the card is the last on the page, so with only a short
  // "Loading..." text the page could not scroll far enough
  await renderClimateDetailTab();
  document.querySelector('[data-card="climate-detail"]').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// The tab's file is loaded only when the tab is opened, and kept for the next time.
const CLIMATE_DETAIL_FOLDER = 'data/climate/detail/';
const detailFiles = {};     // variable id -> the promise of its file

function loadDetailFile(id) {
  const path = CLIMATE_DETAIL_FOLDER + id + '.json';
  if (!detailFiles[id]) {
    detailFiles[id] = fetch(path)
      .then((response) => {
        if (!response.ok) throw new Error('the file could not be loaded (HTTP ' + response.status + ')');
        return response.text();
      })
      .then((text) => {
        const data = parseJsonFile(text, path);
        if (!data || !Array.isArray(data.series)) throw new Error('"series" is missing');
        return data;
      })
      .catch((err) => { delete detailFiles[id]; err.message = path + ': ' + err.message; throw err; });
  }
  return detailFiles[id];
}

async function renderClimateDetailTab() {
  const tabs = [...$('climate-detail-tabs').children];
  tabs.forEach((b, i) => { b.classList.toggle('selected', i === detailSelected); b.setAttribute('aria-pressed', i === detailSelected); });
  const tab = detailTabs[detailSelected];
  const box = $('climate-detail-body');
  box.innerHTML = '';
  if (!tab) return;
  box.innerHTML = '<p class="placeholder-text"></p>';
  box.firstChild.textContent = t('messages.loading');
  try {
    const file = await loadDetailFile(tab.panel.id);
    if (tab !== detailTabs[detailSelected]) return;      // another tab was opened meanwhile
    box.innerHTML = '';
    drawClimateDetail(tab, file, box);
  } catch (err) {
    if (tab !== detailTabs[detailSelected]) return;
    // a problem with this file only affects this tab: the message names the file
    box.innerHTML = '<p class="fine"></p>';
    box.firstChild.textContent = t('messages.couldNotLoadClimateData', { error: err.message });
    console.error(err);
  }
}

// ---------- the tab: header line, chart (a) daily values, chart (b) annual means, shared year axis ----------

// "YYYY-MM" to a point in time in years (the middle of that month), for example 1950-07 gives 1950.54
function monthTime(label) {
  return Number(label.slice(0, 4)) + (Number(label.slice(5, 7)) - 0.5) / 12;
}

// A trend is drawn (dashed line) and given as a number only when it is significant: p below this limit.
const TREND_P_LIMIT = 0.05;

// The trend of one series for the top right of a "Change since 1950" chart: "+0.09 ± 0.04 °C/decade, p < 0.001",
// or "no significant trend (p = 0.24)". A named series (air temperature) starts with its name, e.g. "Max".
function trendTagText(s, name, trendUnit) {
  if (!isNumber(s.p)) return null;
  const prefix = name ? name.charAt(0).toUpperCase() + name.slice(1) + ' ' : '';
  if (s.p >= TREND_P_LIMIT || !isNumber(s.slope) || !isNumber(s.ci95)) return prefix + t('labels.noSignificantTrend', { p: pValueText(s.p) });
  return prefix + trendText(s, trendUnit) + ', ' + pValueText(s.p);
}

// the p-value as text: "p < 0.001", "p = 0.012", "p = 0.24"
function pValueText(p) {
  if (!isNumber(p)) return '';
  return p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(p < 0.01 ? 3 : 2);
}

// The styles of the trend lines in (b): the whole record first, then (sea level) the two periods.
const TREND_LINE_STYLES = [
  { colorVar: '--color-text-faint', dash: '4 3' },
  { colorVar: '--color-text-body', dash: '2 2' },
  { colorVar: '--color-text-body', dash: '7 3' }
];

function drawClimateDetail(tab, file, box) {
  const p = tab.panel;
  const sources = CONTENT.variables.sources || {};
  const typical = ((typicalYear && typicalYear.variables) || {})[p.id];
  const change = ((climateChange && climateChange.variables) || {})[p.id];
  const line = file.series.find((s) => s.id === tab.series) || file.series[0];       // the line of this tab
  const annual = change && Array.isArray(change.series) ? (change.series.find((s) => s.id === tab.series) || change.series[0]) : null;
  const sea = file.kind === 'monthly-anomaly';
  const c = color(p.colorVar);
  const grey = color('--color-text-faint');
  const unit = file.unit;

  // header line: name · unit · source · record period
  const facts = [unit, typical && sources[typical.source] ? sources[typical.source].label : NO_DATA,
    file.record ? file.record.start.slice(0, 4) + '–' + file.record.end.slice(0, 4) : NO_DATA];
  const head = document.createElement('div');
  head.className = 'detail-header';
  head.innerHTML = '<span class="detail-name"></span><span class="detail-facts"></span>';
  head.firstChild.textContent = tab.label;
  head.lastChild.textContent = '· ' + facts.join(' · ');
  box.appendChild(head);

  // the shared time axis: from the first to the last year of this variable's record, months and years on it
  const months = line.months || [];
  const years = annual && annual.years ? annual.years : [];
  const first = Math.min(Number(months[0].slice(0, 4)), years.length ? years[0] : Infinity);
  const last = Math.max(Number(months[months.length - 1].slice(0, 4)), years.length ? years[years.length - 1] : -Infinity);
  const timeX = (time) => PLOT.left + (time - first) / (last + 1 - first) * (PLOT.right - PLOT.left);
  const step = last - first > 40 ? 10 : 5;
  const ticks = [];
  for (let y = Math.ceil(first / step) * step; y <= last; y += step) ticks.push(y);

  // ----- (a): the daily range per month as a light band with the running mean, or the monthly anomaly -----
  const head1 = chartHead(p, ticks.map(timeX), 'daily values');
  const upper = sea ? line.anomaly : line.max, lower = sea ? line.anomaly : line.min;
  const known = [];
  [upper, lower, line.running].forEach((list) => (list || []).forEach((v) => { if (isNumber(v)) known.push(v); }));
  let svgA, panelA = null;
  const monthIndexTime = months.map(monthTime);
  if (!known.length) svgA = chartNoData(head1);
  else {
    const scale = chartScale(known, sea);
    let svg = head1 + chartYAxis(scale.t, scale.yOf);
    const xy = (i, v) => timeX(monthIndexTime[i]).toFixed(1) + ',' + scale.yOf(v).toFixed(1);
    if (sea) {
      // the monthly anomaly as a thin grey line, the 12-month running mean in the color of the variable
      svg += '<rect class="plot-axis" x="' + PLOT.left + '" y="' + Math.round(scale.yOf(0)) + '" width="' + (PLOT.right - PLOT.left) + '" height="1"></rect>';
      segmentsOf(line.anomaly).forEach((seg) => { if (seg.length > 1) svg += '<polyline points="' + seg.map((pt) => xy(pt.i, pt.val)).join(' ') + '" fill="none" stroke="' + grey + '" stroke-width="0.8" stroke-linejoin="round"></polyline>'; });
    } else {
      // the band from the lowest to the highest day of each month, in runs of months that have both
      const both = months.map((m, i) => (isNumber(line.max[i]) && isNumber(line.min[i]) ? line.max[i] : null));
      segmentsOf(both).forEach((seg) => {
        if (seg.length < 2) return;
        const top = seg.map((pt) => xy(pt.i, line.max[pt.i]));
        const bottom = seg.map((pt) => xy(pt.i, line.min[pt.i])).reverse();
        svg += '<polygon points="' + top.concat(bottom).join(' ') + '" fill="' + grey + '" fill-opacity="0.35"></polygon>';
      });
    }
    segmentsOf(line.running).forEach((seg) => { if (seg.length > 1) svg += '<polyline points="' + seg.map((pt) => xy(pt.i, pt.val)).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"></polyline>'; });
    svgA = svg + '</svg>';
    // what the comparison line shows at month i
    const fmt = (v, list) => formatLike(v, list) + ' ' + unit;
    panelA = {
      yOf: scale.yOf,
      points: (i) => (sea
        ? [{ value: line.anomaly[i], color: grey, text: t('labels.detailAnomaly') + ' ' + fmt(line.anomaly[i], line.anomaly) },
           { value: line.running[i], color: c, text: t('labels.detailRunning12') + ' ' + fmt(line.running[i], line.running) }]
        : [{ value: line.max[i], color: grey, text: t('labels.detailHighest') + ' ' + fmt(line.max[i], line.max) },
           { value: line.running[i], color: c, text: t('labels.detailRunning365') + ' ' + fmt(line.running[i], line.running) },
           { value: line.min[i], color: grey, text: t('labels.detailLowest') + ' ' + fmt(line.min[i], line.min) }])
    };
  }

  // ----- (b): the annual means with the trend line(s); the numbers are the ones of change.json -----
  const head2 = chartHead(p, ticks.map(timeX), 'annual means');
  const trends = [];       // [{ label, s: { slope, ci95, p, fit }, from, to }] shown as lines and in the corner text
  if (annual && isNumber(annual.slope)) {
    trends.push({ label: sea && years.length ? years[0] + '–' + years[years.length - 1] : '', s: annual, from: years[0], to: years[years.length - 1] });
    if (sea) (change.periods || []).forEach((q) => trends.push({ label: q.start + '–' + q.end, s: q, from: q.start, to: q.end }));
  }
  const yearTime = (y) => y + 0.5;
  const known2 = [];
  if (annual) (annual.means || []).forEach((v) => { if (isNumber(v)) known2.push(v); });
  trends.forEach((tr) => (tr.s.fit || []).forEach((v) => { if (isNumber(v)) known2.push(v); }));
  let svgB, panelB = null;
  const meanOf = {};      // year -> annual mean
  if (annual) (annual.years || []).forEach((y, i) => { if (isNumber(annual.means[i])) meanOf[y] = annual.means[i]; });
  if (!known2.length) svgB = chartNoData(head2);
  else {
    const scale = chartScale(known2, false);
    let svg = head2 + chartYAxis(scale.t, scale.yOf);
    trends.forEach((tr, k) => {
      const style = TREND_LINE_STYLES[k % TREND_LINE_STYLES.length];
      if (tr.s.fit) svg += '<line x1="' + timeX(yearTime(tr.from)).toFixed(1) + '" y1="' + scale.yOf(tr.s.fit[0]).toFixed(1) + '" x2="' + timeX(yearTime(tr.to)).toFixed(1) +
        '" y2="' + scale.yOf(tr.s.fit[1]).toFixed(1) + '" stroke="' + color(style.colorVar) + '" stroke-width="1.2" stroke-dasharray="' + style.dash + '"></line>';
    });
    const row = (annual.years || []).map((y, i) => ({ y: y, v: annual.means[i] })).filter((d) => isNumber(d.v));
    const at = (d) => timeX(yearTime(d.y)).toFixed(1) + ',' + scale.yOf(d.v).toFixed(1);
    // runs of consecutive years
    let run = [];
    const flush = () => { if (run.length > 1) svg += '<polyline points="' + run.map(at).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></polyline>'; run = []; };
    row.forEach((d) => { if (run.length && d.y !== run[run.length - 1].y + 1) flush(); run.push(d); });
    flush();
    row.forEach((d) => { svg += '<circle cx="' + timeX(yearTime(d.y)).toFixed(1) + '" cy="' + scale.yOf(d.v).toFixed(1) + '" r="1.8" fill="' + c + '"></circle>'; });
    svgB = svg + '</svg>';
    // at month i the annual mean of that year; its dot sits at the middle of the year
    panelB = {
      yOf: scale.yOf,
      xAt: (i) => timeX(yearTime(Math.floor(monthIndexTime[i]))),
      points: (i) => {
        const y = Math.floor(monthIndexTime[i]);
        return [{ value: meanOf[y], color: c, text: y + ': ' + formatLike(meanOf[y], annual.means) + ' ' + unit }];
      }
    };
  }

  // ----- the two rows, the axis, the trend box next to (b) and the comparison line -----
  const stack = document.createElement('div');
  stack.className = 'chart-stack detail-stack';
  const rowA = chartRow({ label: t(sea ? 'labels.detailMonthly' : 'labels.detailDaily'), unit: unit }, null, svgA);
  rowA.querySelector('.source-tag').remove();
  const rowB = chartRow({ label: t('labels.detailAnnual'), unit: unit }, null, svgB);
  rowB.querySelector('.source-tag').remove();

  // the trend box: value, ± 95%, p-value and badge (the numbers are the ones of change.json)
  const summary = document.createElement('div');
  summary.className = 'detail-trend';
  summary.innerHTML = '<div class="method-label"></div>';
  summary.firstChild.textContent = t('labels.colTrend');
  trends.forEach((tr, k) => {
    const v = document.createElement('div');
    v.className = 'trend-tag-value';
    const style = TREND_LINE_STYLES[k % TREND_LINE_STYLES.length];
    // with more than one trend (sea level) each has a small line sample as a legend
    if (trends.length > 1) v.insertAdjacentHTML('beforeend', '<svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke="' + color(style.colorVar) +
      '" stroke-width="1.5" stroke-dasharray="' + style.dash + '"></line></svg> ');
    v.appendChild(document.createTextNode((tr.label ? tr.label + ' ' : '') + trendText(tr.s, change.trendUnit) + ' · ' + pValueText(tr.s.p)));
    summary.appendChild(v);
  });
  const trend = ((detailContent && detailContent.trends) || {})[p.id];
  const badges = (detailContent && detailContent.badges) || {};
  if (trend && badges[trend.badge]) {
    const b = document.createElement('span');
    b.className = 'trend-badge badge-' + trend.badge;
    b.textContent = badges[trend.badge];
    summary.appendChild(b);
  }
  if (!trends.length) summary.insertAdjacentHTML('beforeend', '<div class="placeholder-text">' + NO_DATA + '</div>');

  stack.appendChild(rowA);
  stack.appendChild(rowB);
  stack.appendChild(summary);
  stack.appendChild(sharedAxis(ticks.map((y) => ({ x: timeX(y), text: String(y) })), t('labels.year')));
  stack.insertAdjacentHTML('beforeend', '<div class="comparison" hidden></div>');
  box.appendChild(stack);
  const note = document.createElement('p');
  note.className = 'fine detail-note';
  note.textContent = t(sea ? 'labels.detailNoteSea' : 'labels.detailNoteDaily');
  box.appendChild(note);

  // the comparison line snaps to months in (a) and to years in (b)
  const monthNames = t('labels.monthsLong').split(',');
  const start = monthIndexTime[0] - 0.5 / 12;
  const charts = {
    count: months.length, panels: [panelA, panelB],
    xOf: (i) => timeX(monthIndexTime[i]),
    indexAt: (plotX) => (plotX < PLOT.left ? -1 : Math.min(months.length - 1, Math.max(0, Math.floor((first + (plotX - PLOT.left) / (PLOT.right - PLOT.left) * (last + 1 - first) - start) * 12)))),
    label: (i) => (monthNames[Number(months[i].slice(5, 7)) - 1] || months[i].slice(5, 7)) + ' ' + months[i].slice(0, 4)
  };
  attachComparisonLine(stack, () => charts);
}
