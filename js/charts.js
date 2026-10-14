// charts.js: the stacked charts on the Climatology page, shared by the storm charts and the
// climate charts. The chart size (PLOT), tick values, one chart row (label, chart, source tag), the
// shared axis under a set of charts, and the comparison line: the dotted line that follows the mouse
// and shows every chart's value at that day or month. Charts are drawn as SVG; nothing is calculated.
// Uses: helpers.js. Used by: climatology-storms.js, climatology-climate.js. Styles: css/charts.css.

// Size of one chart in SVG units (the same as the Figma anomaly-plot component).
// The plot area runs from x 38 to 549 and from y 6 to 122; tick values sit left of x 38.
const PLOT = { width: 549, height: 128, left: 38, right: 549, top: 6, bottom: 122, labelRoom: 16 };

// A "nice" step between tick values: 1, 2 or 5 times a power of ten.
function niceStep(raw) {
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
}

// Tick values for one chart: include 0 (unless includeZero is false); add an outer tick only when
// the data reaches clearly past the last inner tick (more than 80% of a step).
function ticksFor(min, max, includeZero = true) {
  const lo = includeZero ? Math.min(min, 0) : min, hi = includeZero ? Math.max(max, 0) : max;
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

// The vertical scale of one chart: the tick values and yOf(value), the y position in SVG units.
// known = all values drawn; includeZero = the scale must show 0; topRoom = share of the chart height kept
// free at the top (for a text in the corner, 0 for none).
function chartScale(known, includeZero, topRoom = 0) {
  const t = ticksFor(Math.min(...known), Math.max(...known), includeZero);
  const lo = Math.min(Math.min(...known), t.ticks[0]);
  const dataHi = Math.max(Math.max(...known), t.ticks[t.ticks.length - 1]);
  const hi = dataHi + ((dataHi - lo) || 1) * topRoom / (1 - topRoom);
  const span = PLOT.bottom - PLOT.top;
  const pad = 4 * ((hi - lo) || 1) / (span - 8);                // 4 SVG units of room above and below
  return { t: t, yOf: (val) => PLOT.top + (hi + pad - val) / ((hi - lo) + 2 * pad) * span };
}

// ---------- parts shared by every set of stacked charts (storm anomalies, typical year, ...) ----------

// One chart row: the name and unit on the left, the chart, and the source tag at the top right.
// v = { label, unit, onOpen (optional) }, source = { label, colorVar } or nothing (then "No data").
// With onOpen the name becomes a link (a button that looks like text) that calls onOpen when clicked.
function chartRow(v, source, svg) {
  const row = document.createElement('div');
  row.className = 'anomaly-chart';
  row.innerHTML =
    '<div class="anomaly-label"><span class="anomaly-name"></span><span class="anomaly-unit"></span></div>' +
    '<div class="anomaly-plot">' + svg + '</div>' +
    '<span class="source-tag"><span class="source-square"></span><span class="source-name"></span></span>';
  const name = row.querySelector('.anomaly-name');
  name.textContent = v.label;
  if (v.onOpen) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'anomaly-name detail-link';
    link.textContent = v.label;
    link.addEventListener('click', v.onOpen);
    name.replaceWith(link);
  }
  row.querySelector('.anomaly-unit').textContent = '(' + v.unit + ')';
  row.querySelector('.source-square').style.background = source ? color(source.colorVar) : color('--color-text-faint');
  row.querySelector('.source-name').textContent = source ? source.label : NO_DATA;
  return row;
}

// The shared x-axis under a set of charts: ticks = [{ x (SVG units), text }], with a title under it.
function sharedAxis(ticks, title) {
  const axis = document.createElement('div');
  axis.className = 'date-axis';
  let svg = '<svg viewBox="0 0 ' + PLOT.width + ' 22" aria-hidden="true">' +
    '<rect class="plot-axis" x="' + PLOT.left + '" y="0" width="' + (PLOT.right - PLOT.left) + '" height="1"></rect>';
  ticks.forEach((tick) => {
    svg += '<rect class="plot-axis" x="' + (tick.x - 0.5).toFixed(1) + '" y="0" width="1" height="4"></rect>' +
      '<text class="plot-tick-label" x="' + tick.x.toFixed(1) + '" y="17" text-anchor="middle">' + tick.text + '</text>';
  });
  axis.innerHTML = '<div></div>' + svg + '</svg><div class="date-axis-title"></div>';
  axis.querySelector('.date-axis-title').textContent = title;
  return axis;
}

// The start of every chart: the SVG element and the vertical gridlines (gridX = x positions).
function chartHead(v, gridX, kind) {
  return '<svg viewBox="0 0 ' + PLOT.width + ' ' + PLOT.height + '" role="img" aria-label="' + v.label + ' ' + kind + '">' +
    gridX.map((x) => '<rect class="plot-grid" x="' + Math.round(x) + '" y="' + PLOT.top + '" width="1" height="' + (PLOT.bottom - PLOT.top) + '"></rect>').join('');
}

// A chart without data: the frame, the y-axis line and "No data" (or another text) in the middle.
function chartNoData(head, text = NO_DATA) {
  return head + '<rect class="plot-axis" x="' + PLOT.left + '" y="' + PLOT.top + '" width="1" height="' + (PLOT.bottom - PLOT.top) + '"></rect>' +
    '<text class="plot-nodata" x="' + ((PLOT.left + PLOT.right) / 2) + '" y="' + ((PLOT.top + PLOT.bottom) / 2 + 4) + '" text-anchor="middle">' + text + '</text></svg>';
}

// Horizontal gridlines (not at 0), tick marks, tick values and the y-axis line.
function chartYAxis(t, yOf, zeroGrid = false) {
  let svg = '';
  t.ticks.forEach((tick) => {
    const y = Math.round(yOf(tick));
    if (tick !== 0 || zeroGrid) svg += '<rect class="plot-grid" x="' + PLOT.left + '" y="' + y + '" width="' + (PLOT.right - PLOT.left) + '" height="1"></rect>';
    svg += '<rect class="plot-axis" x="' + (PLOT.left - 4) + '" y="' + y + '" width="4" height="1"></rect>' +
      '<text class="plot-tick-label" x="32" y="' + (y + 4) + '" text-anchor="end">' + (tick < 0 ? '−' : '') + Math.abs(tick).toFixed(t.decimals) + '</text>';
  });
  return svg + '<rect class="plot-axis" x="' + PLOT.left + '" y="' + PLOT.top + '" width="1" height="' + (PLOT.bottom - PLOT.top) + '"></rect>';
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

// ---------- comparison line (follows the mouse across a set of stacked charts) ----------
//
// Works for every set of charts made with chartRow() and sharedAxis(): the storm anomaly charts
// (days) and the typical-year charts (months). The set describes itself to the line:
//   { count,                    number of x values
//     xOf(i),                   x position (SVG units) of the i-th x value
//     indexAt(plotX),           the x value under the mouse (SVG units), or -1 (then the line hides)
//     label(i),                 the text under the axis ("1995-10-04", "September")
//     panels: [{ yOf(value),    one per chart, top to bottom (yOf null = the chart has no data)
//                points(i),        the values shown at the line: [{ value, color, text }]
//                xAt(i) }] }       optional: another x for this chart's values (a yearly chart under a monthly line)

// box: the element that holds the charts, the axis and the .comparison layer;
// getCharts: returns the set (or null when nothing is shown)
// The line also works with the keyboard: Tab to the charts, then the left and right arrow keys move it one
// spot (Home and End jump to the first and last), Escape hides it.
function attachComparisonLine(box, getCharts) {
  box.tabIndex = 0;
  box.classList.add('keyboard-charts');
  box.addEventListener('mousemove', (e) => showComparisonLine(box, getCharts(), e.clientX));
  box.addEventListener('mouseleave', () => { if (document.activeElement !== box) hideComparisonLine(box); });
  box.addEventListener('blur', () => hideComparisonLine(box));
  box.addEventListener('keydown', (e) => {
    const charts = getCharts();
    if (!charts || !charts.count) return;
    const last = charts.count - 1;
    const now = box.comparisonIndex;                       // where the line is now (set by showComparisonLine)
    let next;
    if (e.key === 'ArrowRight') next = now === undefined ? 0 : Math.min(last, now + 1);
    else if (e.key === 'ArrowLeft') next = now === undefined ? last : Math.max(0, now - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Escape') { hideComparisonLine(box); return; }
    else return;
    e.preventDefault();
    showComparisonLine(box, charts, null, next);
  });
}

function hideComparisonLine(box) {
  if (box) box.comparisonIndex = undefined;
  const layer = (box || $('event-charts')).querySelector('.comparison');
  if (layer) layer.hidden = true;
}

// the least distance (px) between the texts next to the dots, a bit more than the height of one text
const CHIP_SPACING = 22;

// clientX = the mouse; or, for the keyboard, clientX is null and forcedIndex is the x value to show
function showComparisonLine(box, charts, clientX, forcedIndex) {
  const layer = box.querySelector('.comparison');
  if (!charts || !charts.count || !layer) return;
  const plots = box.querySelectorAll('.anomaly-plot svg');
  const axis = box.querySelector('.date-axis svg');
  const boxRect = box.getBoundingClientRect();
  const first = plots[0].getBoundingClientRect();
  const scale = first.width / PLOT.width;                 // the SVGs scale with the card width

  // the x value under the mouse
  const index = forcedIndex !== undefined ? forcedIndex : charts.indexAt((clientX - first.left) / scale);
  if (index < 0) { hideComparisonLine(box); return; }
  box.comparisonIndex = index;

  const x = first.left - boxRect.left + charts.xOf(index) * scale;
  const top = first.top - boxRect.top + PLOT.top * scale;
  const axisTop = axis.getBoundingClientRect().top - boxRect.top + 4 * scale;
  const flip = x > boxRect.width * 0.7;                   // near the right edge, values go on the left side

  let html = '<div class="guide-line" style="left:' + x.toFixed(1) + 'px; top:' + top.toFixed(1) + 'px; height:' + (axisTop - top).toFixed(1) + 'px"></div>' +
    '<div class="guide-date" style="left:' + x.toFixed(1) + 'px; top:' + axisTop.toFixed(1) + 'px">' + charts.label(index) + '</div>';
  plots.forEach((svg, k) => {
    const panel = charts.panels[k];
    const r = svg.getBoundingClientRect();
    const px = panel && panel.xAt ? first.left - boxRect.left + panel.xAt(index) * scale : x;
    // the values of this chart: the dot sits on the curve, the text next to it. Texts of values that lie
    // close together are moved apart (top to bottom) so that no text covers another one.
    const items = (panel ? panel.points(index) : [{ value: null, text: NO_DATA }]).map((p) => {
      const known = isNumber(p.value) && panel.yOf;
      // a missing value is shown as "No data" in the middle of the chart
      return { p: p, known: known, y: known ? r.top - boxRect.top + panel.yOf(p.value) * scale : r.top - boxRect.top + r.height / 2 };
    });
    let lastY = -Infinity;
    [...items].sort((i, j) => i.y - j.y).forEach((item) => { item.textY = Math.max(item.y, lastY + CHIP_SPACING); lastY = item.textY; });
    items.forEach((item) => {
      const side = flip ? ' flip' : '';
      if (item.known) html += '<div class="hover-value' + side + '" style="left:' + px.toFixed(1) + 'px; top:' + item.y.toFixed(1) + 'px"><span class="hover-dot" style="border-color:' + item.p.color + '"></span></div>';
      html += '<div class="hover-value' + side + '" style="left:' + px.toFixed(1) + 'px; top:' + item.textY.toFixed(1) + 'px"><span class="hover-dot" style="visibility:hidden"></span>' +
        '<span class="hover-chip">' + (item.known ? item.p.text : NO_DATA) + '</span></div>';
    });
  });
  layer.innerHTML = html;
  layer.hidden = false;
}
