// vegetation.js: the Vegetation page ("Vegetation data"): Mangrove maps and Tipping points.
//   Section 1: a zoomable map (Leaflet) with the layers Condition | Change | Disturbance & recovery, an opacity
//   slider, a legend that switches per layer, "About this layer" and "Where the data comes from".
//   Section 2: key numbers, the points map (dots colored by scenario), the scenario matrix (click a quadrant to
//   filter), the selected point (NDVI series, breakpoint, early warning signals) and the example points.
// Reads: data/vegetation/layers.json and points.json (what is shown); content/vegetation.json (texts, scenario
//   names, layer switch). Nothing is typed in this file: every number is counted from the data.
// Uses: helpers.js, content.js (CONTENT, t), climatology-storms.js (events, selectEvent, strengthText) and Leaflet (CDN).
// Used by: main.js (setupVegetation).

// ---------- state ----------

let vegLayers = null;          // contents of data/vegetation/layers.json
let vegPoints = [];            // the points of data/vegetation/points.json
let vegLayerId = null;         // the layer shown in the map of section 1
let vegOverlay = null;         // the Leaflet image of that layer
let vegSelectedId = null;      // the selected point
let vegVariableId = null;      // the variable shown in the Point card (a chip)
let vegMaps = {};              // the two Leaflet maps: { layers, points }
let vegMarkers = {};           // point id -> its dot on the points map
let vegRing = null;            // the ring around the selected point
let vegCanvas = null;          // one drawing area for the 1138 dots (much faster than one element per dot)

// A text from content/vegetation.json "texts", e.g. vt('pointsMapSubtitle', { shown: 5, total: 10 }).
function vt(key, values) {
  let text = CONTENT.vegetation.texts[key];
  if (typeof text !== 'string') {
    console.warn('content/vegetation.json has no text "' + key + '"');
    return '[' + key + ']';
  }
  Object.entries(values || {}).forEach(([k, v]) => { text = text.split('{' + k + '}').join(v); });
  return text;
}

function vegColor(name) { return color(colorVarOf(name)); }
function vegScenario(id) { return CONTENT.vegetation.scenarios[id] || null; }
function vegPointColor(p) { const s = vegScenario(p.scenario); return s ? vegColor(s.color) : color('--color-text-faint'); }
function vegScenarioLabel(p) { const s = vegScenario(p.scenario); return s ? s.label : NO_DATA; }
function vegPointById(id) { return vegPoints.find((p) => p.id === id) || null; }
function setText(id, text) { $(id).textContent = text; }

// ---------- loading ----------

async function loadVegetationFile(path) {
  let response;
  try { response = await fetch(path); } catch (err) { throw new Error(path + ' (' + err.message + ')'); }
  if (!response.ok) throw new Error(path + ' (HTTP ' + response.status + ')');
  try { return await response.json(); } catch (err) { throw new Error(path + ' is not valid JSON (' + err.message + ')'); }
}

async function setupVegetation() {
  const files = CONTENT.vegetation.files;
  try {
    vegLayers = await loadVegetationFile(files.layers);
    vegPoints = (await loadVegetationFile(files.points)).points;
  } catch (err) {
    // name the file instead of a blank card
    const message = t('messages.couldNotLoadVegetation', { file: err.message });
    setText('veg-map-status', message);
    setText('veg-points-status', message);
    console.error(err);
    return;
  }
  vegLayerId = vegLayers.layers[0].id;
  const first = vegPoints.find((p) => p.isExample);   // the first example point is selected at the start
  vegSelectedId = first ? first.id : null;

  renderStaticTexts();
  renderLayerSwitch();
  setupOpacity();
  renderSource();
  renderLayer();
  renderSelectedPoint();
  setupMaps();
  window.addEventListener('hashchange', () => { if (location.hash.slice(1).split('/')[0] === 'satellite') renderAbout(); });
}

// The texts that do not depend on the data: titles, links, hints.
function renderStaticTexts() {
  const tx = CONTENT.vegetation.texts;
  setText('veg-about-title', tx.aboutTitle);
  setText('veg-source-title', tx.sourceTitle);
  setText('veg-points-title', tx.pointsMapTitle);
  setText('veg-points-note', tx.pointsMapNote);
  setText('veg-nodetail-title', tx.noDetailTitle);
  setText('veg-nodetail-text', tx.noDetailText);
  setText('veg-opacity-label', tx.opacity);
  setText('veg-map-zoom-in', tx.zoomIn);
  setText('veg-map-zoom-out', tx.zoomOut);
  setText('veg-points-zoom-in', tx.zoomIn);
  setText('veg-points-zoom-out', tx.zoomOut);
  [['veg-maps-link', tx.mapsLink, tx.mapsLinkTarget], ['veg-points-link', tx.pointsLink, tx.pointsLinkTarget], ['veg-selected-link', tx.pointsLink, tx.pointsLinkTarget], ['veg-ews-link', tx.pointsLink, tx.pointsLinkTarget]].forEach(([id, label, target]) => {
    const link = $(id);
    link.href = target;
    link.innerHTML = '<span></span><svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    link.firstChild.textContent = label;
  });
  // the page intro and the intro of "Tipping points" have the number of points in them (content/pages.json): counted here
  ['intro-page-satellite', 'intro-tipping'].forEach((id) => {
    const intro = $(id);
    if (intro && intro.dataset.template) intro.textContent = intro.dataset.template.split('{total}').join(vegPoints.length);
  });
  $('veg-download').addEventListener('click', downloadSeries);
  $('veg-download').title = tx.download;
}

// ---------- maps (Leaflet) ----------
// The two maps show the same base map (img/site-map2.png) over the same extent. The picture has no map
// projection, so the map is flat (CRS.Simple): a point is placed at its [latitude, longitude].

function baseBounds() {
  const b = vegLayers.bounds;
  return L.latLngBounds([b.south, b.west], [b.north, b.east]);
}

function createMap(elementId, zoomInId, zoomOutId) {
  const bounds = baseBounds();
  const map = L.map(elementId, { crs: L.CRS.Simple, zoomControl: false, attributionControl: false, zoomSnap: 0, scrollWheelZoom: false });
  L.imageOverlay(CONTENT.vegetation.baseMap.image, bounds).addTo(map);
  $(zoomInId).addEventListener('click', () => map.zoomIn());
  $(zoomOutId).addEventListener('click', () => map.zoomOut());
  // the map can only be measured when its card is on screen: (re)fit the extent whenever its size changes
  let fitted = false;
  new ResizeObserver(() => {
    const box = $(elementId);
    if (!box.clientWidth) return;
    map.invalidateSize();
    map.setMinZoom(-20);
    map.fitBounds(bounds, { animate: false });
    map.setMinZoom(map.getZoom());
    map.setMaxZoom(map.getZoom() + 4);
    map.setMaxBounds(bounds.pad(0.05));
    if (!fitted) {
      fitted = true;
      renderAbout();   // related storms need the storm list, which has loaded by now
    }
  }).observe($(elementId));
  return map;
}

function setupMaps() {
  vegMaps.layers = createMap('veg-map', 'veg-map-zoom-in', 'veg-map-zoom-out');
  vegMaps.points = createMap('veg-points-map', 'veg-points-zoom-in', 'veg-points-zoom-out');
  renderLayerOverlay();
  setupPointDots();
}

// ---------- section 1: the layers ----------

function currentLayer() { return vegLayers.layers.find((l) => l.id === vegLayerId); }

function renderLayerSwitch() {
  const box = $('veg-layer-switch');
  box.innerHTML = '';
  CONTENT.vegetation.layerSwitch.forEach((item) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'layer-chip' + (item.id === vegLayerId ? ' on' : '');
    chip.textContent = item.label;
    chip.setAttribute('aria-pressed', item.id === vegLayerId);
    chip.addEventListener('click', () => {
      vegLayerId = item.id;
      renderLayerSwitch();
      renderLayer();
      renderLayerOverlay();
    });
    box.appendChild(chip);
  });
}

function setupOpacity() {
  const slider = $('veg-opacity');
  slider.value = CONTENT.vegetation.defaultOpacity;
  const apply = () => {
    setText('veg-opacity-value', slider.value + ' %');
    if (vegOverlay) vegOverlay.setOpacity(slider.value / 100);
  };
  slider.addEventListener('input', apply);
  apply();
}

// The layer image on the map, or the calm message when the layer has no image yet.
function renderLayerOverlay() {
  const layer = currentLayer();
  if (!vegMaps.layers) return;
  if (vegOverlay) { vegMaps.layers.removeLayer(vegOverlay); vegOverlay = null; }
  const message = $('veg-map-message');
  message.hidden = !!layer.image;
  message.innerHTML = '<span></span>';
  message.firstChild.textContent = vt('mapNotAvailable');
  if (!layer.image) return;
  const b = layer.bounds || vegLayers.bounds;
  vegOverlay = L.imageOverlay(layer.image, L.latLngBounds([b.south, b.west], [b.north, b.east]), { opacity: $('veg-opacity').value / 100 }).addTo(vegMaps.layers);
  // an image that cannot be loaded shows the same message
  vegOverlay.on('error', () => { message.hidden = false; });
}

// Title, legend strip and "About this layer" of the current layer.
function renderLayer() {
  const layer = currentLayer();
  setText('veg-map-title', layer.title);
  showPlaceholderTag($('veg-map-title').parentElement, layer.placeholder);
  renderLegend(layer.legend);
  renderAbout();
}

function renderLegend(legend) {
  const box = $('veg-legend');
  box.innerHTML = '';
  const title = document.createElement('span');
  title.className = 'legend-title';
  title.textContent = legend.title;
  box.appendChild(title);
  if (legend.type === 'gradient') {
    // low label, a bar from the first to the last color, high label
    const low = document.createElement('span');
    low.className = 'lg';
    low.textContent = legend.low;
    const bar = document.createElement('span');
    bar.className = 'gradient-bar';
    bar.style.background = 'linear-gradient(to right, ' + legend.colors.map(vegColor).join(', ') + ')';
    const high = document.createElement('span');
    high.className = 'lg';
    high.textContent = legend.high;
    box.append(low, bar, high);
  } else {
    legend.items.forEach((item) => box.appendChild(legendItem(item.label, vegColor(item.color))));
  }
}

// One legend entry: a color block and a label (same look as the other legends).
function legendItem(label, colorValue) {
  const item = document.createElement('span');
  item.className = 'lg';
  const swatch = document.createElement('span');
  swatch.className = 'lg-swatch';
  swatch.style.background = colorValue;
  const text = document.createElement('span');
  text.textContent = label;
  item.append(swatch, text);
  return item;
}

function aboutBlock(label, bodyElement) {
  const block = document.createElement('div');
  block.className = 'about-block';
  const heading = document.createElement('div');
  heading.className = 'about-label';
  heading.textContent = label;
  block.append(heading, bodyElement);
  return block;
}

function aboutText(text) {
  const p = document.createElement('p');
  p.className = 'about-text';
  p.textContent = isFilled(text) ? text : t('messages.notYetAvailable');
  return p;
}

function renderAbout() {
  const layer = currentLayer();
  const body = $('veg-about-body');
  body.innerHTML = '';
  showPlaceholderTag($('veg-about-title').parentElement, layer.placeholder);

  body.appendChild(aboutBlock(vt('aboutShows'), aboutText(layer.about.shows)));
  body.appendChild(aboutBlock(vt('aboutComputed'), aboutText(layer.about.computed)));

  // how to read the colors: one color block per class
  const colors = document.createElement('div');
  colors.className = 'about-legend';
  layer.classes.forEach((c) => colors.appendChild(legendItem(c.label, vegColor(c.color))));
  body.appendChild(aboutBlock(vt('aboutColors'), colors));

  // share of area per class: the value as stored, or "No data"
  const shares = document.createElement('div');
  layer.classes.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'value-row';
    row.innerHTML = '<span class="name"><span class="lg-dot"></span><span class="class-name"></span></span><span class="val"></span>';
    row.querySelector('.lg-dot').style.background = vegColor(c.color);
    row.querySelector('.class-name').textContent = c.label;
    row.querySelector('.val').textContent = isNumber(c.share) ? c.share + ' %' : NO_DATA;
    shares.appendChild(row);
  });
  body.appendChild(aboutBlock(vt('aboutShares'), shares));

  // related storms (Disturbance & recovery): only when the list is not empty
  const storms = (layer.relatedStorms || []).map((id) => (typeof events !== 'undefined' ? events : []).find((e) => e.id === id)).filter(Boolean);
  if (storms.length) {
    const list = document.createElement('div');
    list.className = 'storm-link-list';
    storms.forEach((ev) => list.appendChild(stormRow(ev)));
    const block = aboutBlock(vt('relatedStorms'), list);
    const link = document.createElement('a');
    link.className = 'veg-link';
    link.href = '#climatology';
    link.innerHTML = '<span></span><svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    link.firstChild.textContent = vt('relatedStormsLink');
    block.appendChild(link);
    body.appendChild(block);
  }
}

// A storm as a row like the storm list of the Climatology page; clicking it selects that storm there.
function stormRow(ev) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'event-row';
  row.innerHTML =
    '<span class="event-row-dot"></span>' +
    '<span class="event-row-text"><span class="event-row-name"></span><span class="event-row-date"></span></span>' +
    '<span class="event-type"><span class="event-type-near"></span></span>';
  row.querySelector('.event-row-name').textContent = ev.name || NO_DATA;
  row.querySelector('.event-row-date').textContent = monthLabel(ev);
  row.querySelector('.event-type-near').textContent = strengthText(ev.strengthNear, 'near');
  row.addEventListener('click', () => {
    if (selectedEventId !== ev.id) selectEvent(ev.id);   // selectEvent switches a storm off when it is clicked twice
    location.hash = 'climatology';
  });
  return row;
}

function renderSource() {
  const s = vegLayers.source;
  const box = $('veg-source-body');
  box.innerHTML = '';
  showPlaceholderTag($('veg-source-title').parentElement, s.placeholder);
  [[vt('sourceSatellite'), s.satellite], [vt('sourcePeriod'), s.period], [vt('sourceArea'), s.studyArea]].forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'info-row';
    row.innerHTML = '<span></span><span class="val"></span>';
    row.firstChild.textContent = label;
    row.querySelector('.val').textContent = isFilled(value) ? value : NO_DATA;
    box.appendChild(row);
  });
}

const anyPlaceholder = (list) => list.some((x) => x.placeholder);

// ---------- section 2: the points map ----------

function setupPointDots() {
  vegCanvas = L.canvas({ padding: 0.5 });
  // ordinary points first, example points (the ones with detail) larger and on top of them
  [false, true].forEach((examples) => {
    vegPoints.filter((p) => !!p.isExample === examples).forEach((p) => {
      const dot = L.circleMarker([p.lat, p.lon], {
        renderer: vegCanvas,
        radius: examples ? 6 : 3.5,
        fillColor: vegPointColor(p),
        fillOpacity: 0.9,
        color: color('--color-surface'),
        weight: examples ? 1.5 : 0
      });
      dot.on('click', () => selectVegPoint(p.id));
      dot.addTo(vegMaps.points);
      vegMarkers[p.id] = dot;
    });
  });
  // the ring around the selected point
  vegRing = L.circleMarker([0, 0], { renderer: vegCanvas, radius: 11, fill: false, color: color('--color-text'), weight: 2, interactive: false });
  const legend = $('veg-points-legend');
  const title = document.createElement('span');
  title.className = 'legend-title';
  title.textContent = vt('scenarioLegend');
  legend.appendChild(title);
  Object.values(CONTENT.vegetation.scenarios).forEach((s) => legend.appendChild(legendItem(s.label, vegColor(s.color))));
  legend.appendChild(legendItem(vt('noScenario'), color('--color-text-faint')));
  showPlaceholderTag($('veg-points-title').parentElement, anyPlaceholder(vegPoints));
  setText('veg-points-subtitle', vt('pointsMapSubtitle', { shown: vegPoints.length, total: vegPoints.length }));
  moveRing();
}

function moveRing() {
  const p = vegPointById(vegSelectedId);
  if (!vegRing || !vegMaps.points) return;
  if (!p) { vegMaps.points.removeLayer(vegRing); return; }
  vegRing.setLatLng([p.lat, p.lon]);
  if (!vegMaps.points.hasLayer(vegRing)) vegRing.addTo(vegMaps.points);
  vegRing.bringToFront();
}

// A dot is clicked: the ring, the Point card and the Early warning signals follow.
function selectVegPoint(id) {
  if (!vegPointById(id)) return;
  vegSelectedId = id;
  moveRing();
  renderSelectedPoint();
}

// ---------- section 2: the Point card ----------

// The variables of the chips (content/vegetation.json "variables"). A point has data for a variable when
// p.series[id] exists with values; otherwise its chip is disabled (not hidden).
const hasSeries = (p, id) => !!(p && p.series && p.series[id] && Array.isArray(p.series[id].values) && knownValues(p.series[id].values).length);

function renderSelectedPoint() {
  const p = vegPointById(vegSelectedId);
  const detail = !!(p && p.isExample && p.dates);
  const vars = CONTENT.vegetation.variables;
  // the chosen variable stays while the next point has data for it, else the first one it has
  if (!vars.some((v) => v.id === vegVariableId && hasSeries(p, v.id))) {
    const first = vars.find((v) => hasSeries(p, v.id));
    vegVariableId = first ? first.id : vars[0].id;
  }
  const v = vars.find((x) => x.id === vegVariableId);
  const series = detail && hasSeries(p, v.id) ? p.series[v.id] : null;

  setText('veg-selected-title', p ? vt('pointTitle', { id: p.id }) : NO_DATA);
  setText('veg-selected-class', p && CLASSES[p.changeClass] ? CLASSES[p.changeClass].label : (p ? NO_DATA : ''));
  showPlaceholderTag($('veg-selected-title').parentElement, p && (p.placeholder || (series && series.placeholder)));
  renderVegChips(p, detail);

  $('veg-selected-nodetail').hidden = detail;
  $('veg-selected-chart').hidden = !detail;
  $('veg-selected-chart').innerHTML = '';
  if (detail) $('veg-selected-chart').appendChild(valueChart(p, v, series));
  setText('veg-selected-summary', series ? vt('summary', { count: knownValues(series.values).length, first: p.dates[0], last: p.dates[p.dates.length - 1] }) : '');
  setText('veg-selected-breakpoint', detail ? (p.breakpoint ? vt('breakpoint', { date: p.breakpoint.date }) : vt('noBreakpoint')) : '');
  $('veg-download').disabled = !series;
  renderEws(p, detail);
}

// One chip per variable: the chosen one is marked, one without data for this point is disabled.
function renderVegChips(p, detail) {
  const box = $('veg-chips');
  box.innerHTML = '';
  CONTENT.vegetation.variables.forEach((v) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'var-chip' + (v.id === vegVariableId ? ' on' : '');
    chip.disabled = !(detail && hasSeries(p, v.id));
    chip.setAttribute('aria-pressed', v.id === vegVariableId);
    chip.innerHTML = '<span class="chip-dot"></span><span class="chip-label"></span>';
    chip.querySelector('.chip-dot').style.background = vegColor(v.color);
    chip.querySelector('.chip-label').textContent = v.label;
    chip.addEventListener('click', () => { vegVariableId = v.id; renderSelectedPoint(); });
    box.appendChild(chip);
  });
}

// ---------- charts (parts from charts.js: chartHead, chartScale, chartYAxis, segmentsOf, sharedAxis) ----------

// x position (SVG units) of month i of n
const vegX = (i, n) => PLOT.left + (i / (n - 1)) * (PLOT.right - PLOT.left);

// One chart: the grid, y axis and line of a series over p.dates (gaps where a month has no value), clipped to the plot.
// band = the breakpoint (a shaded 12-month window and a dashed line) or null. Returns the SVG text.
function vegLineSvg(label, values, n, colorValue, size, band, clipId) {
  const known = knownValues(values);
  const head = chartHead({ label: label }, [], 'chart', size);
  if (!known.length) return chartNoData(head, NO_DATA, '', size);
  const scale = chartScale(known, false, 0, size);
  let svg = head + chartYAxis(scale.t, scale.yOf, true, size);
  svg += '<defs><clipPath id="' + clipId + '"><rect x="' + size.left + '" y="' + size.top + '" width="' + (size.right - size.left) + '" height="' + (size.bottom - size.top) + '"></rect></clipPath></defs><g clip-path="url(#' + clipId + ')">';
  if (band) {
    const x0 = vegX(Math.max(0, band.index - 6), n), x1 = vegX(Math.min(n - 1, band.index + 6), n);
    svg += '<rect class="veg-bp-window ' + band.type + '" x="' + x0.toFixed(1) + '" y="' + size.top + '" width="' + (x1 - x0).toFixed(1) + '" height="' + (size.bottom - size.top) + '"></rect>';
    svg += '<line class="veg-bp-line ' + band.type + '" x1="' + vegX(band.index, n).toFixed(1) + '" x2="' + vegX(band.index, n).toFixed(1) + '" y1="' + size.top + '" y2="' + size.bottom + '" stroke-dasharray="4,4"></line>';
  }
  segmentsOf(values).forEach((seg) => {
    if (seg.length === 1) svg += '<circle cx="' + vegX(seg[0].i, n).toFixed(1) + '" cy="' + scale.yOf(seg[0].val).toFixed(1) + '" r="1.8" fill="' + colorValue + '"></circle>';
    else svg += '<polyline points="' + seg.map((pt) => vegX(pt.i, n).toFixed(1) + ',' + scale.yOf(pt.val).toFixed(1)).join(' ') + '" fill="none" stroke="' + colorValue + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></polyline>';
  });
  return svg + '</g></svg>';
}

// Ticks of the shared year axis: a label every few years (content/vegetation.json "axisTickEveryYears").
function vegYearTicks(dates) {
  const step = CONTENT.vegetation.axisTickEveryYears;
  const first = Number(dates[0].slice(0, 4)), last = Number(dates[dates.length - 1].slice(0, 4));
  const ticks = [];
  for (let yr = Math.ceil(first / step) * step; yr <= last; yr += step) {
    const i = dates.findIndex((d) => d.startsWith(yr + '-'));
    if (i >= 0) ticks.push({ x: vegX(i, dates.length), text: String(yr) });
  }
  return ticks;
}

// A chart row like the Climatology charts: the name on the left and the plot.
function vegChartRow(label, unit, svg) {
  const row = document.createElement('div');
  row.className = 'anomaly-chart';
  row.innerHTML = '<div class="anomaly-label"><span class="anomaly-name"></span><span class="anomaly-unit"></span></div><div class="anomaly-plot">' + svg + '</div>';
  row.querySelector('.anomaly-name').textContent = label;
  row.querySelector('.anomaly-unit').textContent = unit ? '(' + unit + ')' : '';
  return row;
}

// The chart of the Point card: the chosen variable with the breakpoint band, and the year axis under it.
function valueChart(p, v, series) {
  const n = p.dates.length;
  const band = p.breakpoint && p.dates.indexOf(p.breakpoint.date) >= 0 ? { index: p.dates.indexOf(p.breakpoint.date), type: p.breakpoint.type } : null;
  const box = document.createElement('div');
  box.className = 'chart-stack';
  const svg = series ? vegLineSvg(v.label, series.values, n, vegColor(v.color), POINT_PLOT, band, 'veg-clip-point')
    : chartNoData(chartHead({ label: v.label }, [], 'chart', POINT_PLOT), vt('chartNoSeries'), '', POINT_PLOT);
  box.appendChild(vegChartRow(v.label, v.unit, svg));
  box.appendChild(sharedAxis(vegYearTicks(p.dates), ''));
  return box;
}

// ---------- section 2: Early warning signals before the breakpoint ----------
// Three stacked charts (residual, AR1, SD) with Kendall's tau and p of AR1 and SD between them, one shared year axis.

function renderEws(p, detail) {
  const box = $('veg-ews-charts');
  box.innerHTML = '';
  setText('veg-ews-title', vt('ewsTitle'));
  setText('veg-ews-subtitle', vt('ewsSubtitle'));
  const ews = detail ? p.ews : null;
  showPlaceholderTag($('veg-ews-title').parentElement, ews && ews.placeholder);
  const num = (val) => (isNumber(val) ? formatLike(val, [val]) : NO_DATA);
  CONTENT.vegetation.ewsCharts.forEach((c) => {
    const data = ews && ews[c.id];
    // Kendall's tau and p as a line of text above the chart (the residual has none)
    if (data && 'tau' in data) {
      const text = document.createElement('div');
      text.className = 'ews-tau';
      text.textContent = vt('ewsTau', { label: c.label, tau: num(data.tau), p: num(data.p) });
      box.appendChild(text);
    }
    const svg = data ? vegLineSvg(c.label, data.values, p.dates.length, vegColor(c.color), PLOT, null, 'veg-clip-' + c.id)
      : chartNoData(chartHead({ label: c.label }, [], 'chart'), vt('ewsNoData'));
    box.appendChild(vegChartRow(c.label, '', svg));
  });
  if (detail) box.appendChild(sharedAxis(vegYearTicks(p.dates), ''));
}

// The shown series as a CSV file (the download icon of the Point card).
function downloadSeries() {
  const p = vegPointById(vegSelectedId);
  const v = CONTENT.vegetation.variables.find((x) => x.id === vegVariableId);
  if (!hasSeries(p, v.id)) return;
  const rows = ['date,' + v.id].concat(p.dates.map((d, i) => d + ',' + (isNumber(p.series[v.id].values[i]) ? p.series[v.id].values[i] : '')));
  download(p.id + '-' + v.id + '.csv', 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n')));
}
