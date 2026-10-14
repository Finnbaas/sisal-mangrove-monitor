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

// ---------- parts shared by every set of stacked charts (storm anomalies, typical year, ...) ----------

// One chart row: the name and unit on the left, the chart, and the source tag at the top right.
// v = { label, unit }, source = { label, colorVar } or nothing (then "No data").
function chartRow(v, source, svg) {
  const row = document.createElement('div');
  row.className = 'anomaly-chart';
  row.innerHTML =
    '<div class="anomaly-label"><span class="anomaly-name"></span><span class="anomaly-unit"></span></div>' +
    '<div class="anomaly-plot">' + svg + '</div>' +
    '<span class="source-tag"><span class="source-square"></span><span class="source-name"></span></span>';
  row.querySelector('.anomaly-name').textContent = v.label;
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
//                points(i) }] } the values shown at the line: [{ value, color, text }]

// box: the element that holds the charts, the axis and the .comparison layer;
// getCharts: returns the set (or null when nothing is shown)
function attachComparisonLine(box, getCharts) {
  box.addEventListener('mousemove', (e) => showComparisonLine(box, getCharts(), e.clientX));
  box.addEventListener('mouseleave', () => hideComparisonLine(box));
}

function hideComparisonLine(box) {
  const layer = (box || $('event-charts')).querySelector('.comparison');
  if (layer) layer.hidden = true;
}

function showComparisonLine(box, charts, clientX) {
  const layer = box.querySelector('.comparison');
  if (!charts || !charts.count || !layer) return;
  const plots = box.querySelectorAll('.anomaly-plot svg');
  const axis = box.querySelector('.date-axis svg');
  const boxRect = box.getBoundingClientRect();
  const first = plots[0].getBoundingClientRect();
  const scale = first.width / PLOT.width;                 // the SVGs scale with the card width

  // the x value under the mouse
  const index = charts.indexAt((clientX - first.left) / scale);
  if (index < 0) { hideComparisonLine(box); return; }

  const x = first.left - boxRect.left + charts.xOf(index) * scale;
  const top = first.top - boxRect.top + PLOT.top * scale;
  const axisTop = axis.getBoundingClientRect().top - boxRect.top + 4 * scale;
  const flip = x > boxRect.width * 0.7;                   // near the right edge, values go on the left side

  let html = '<div class="guide-line" style="left:' + x.toFixed(1) + 'px; top:' + top.toFixed(1) + 'px; height:' + (axisTop - top).toFixed(1) + 'px"></div>' +
    '<div class="guide-date" style="left:' + x.toFixed(1) + 'px; top:' + axisTop.toFixed(1) + 'px">' + charts.label(index) + '</div>';
  plots.forEach((svg, k) => {
    const panel = charts.panels[k];
    const r = svg.getBoundingClientRect();
    (panel ? panel.points(index) : [{ value: null, text: NO_DATA }]).forEach((p) => {
      const known = isNumber(p.value) && panel.yOf;
      // a dot on the curve with the value; a missing value is shown as "No data" in the middle of the chart
      const y = known ? r.top - boxRect.top + panel.yOf(p.value) * scale : r.top - boxRect.top + r.height / 2;
      html += '<div class="hover-value' + (flip ? ' flip' : '') + '" style="left:' + x.toFixed(1) + 'px; top:' + y.toFixed(1) + 'px">' +
        (known ? '<span class="hover-dot" style="border-color:' + p.color + '"></span>' : '<span class="hover-dot" style="visibility:hidden"></span>') +
        '<span class="hover-chip">' + (known ? p.text : NO_DATA) + '</span></div>';
    });
  });
  layer.innerHTML = html;
  layer.hidden = false;
}
