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
let vegFilter = null;          // the scenario shown in the points map (set by clicking the matrix), or null for all
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
  renderKeyNumbers();
  renderMatrix();
  renderExampleList();
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
  setText('veg-numbers-title', tx.keyNumbersTitle);
  setText('veg-points-title', tx.pointsMapTitle);
  setText('veg-points-note', tx.pointsMapNote);
  setText('veg-matrix-title', tx.matrixTitle);
  setText('veg-matrix-hint', tx.matrixHint);
  setText('veg-nodetail-title', tx.noDetailTitle);
  setText('veg-nodetail-text', tx.noDetailText);
  setText('veg-ews-title', tx.ewsTitle);
  setText('veg-ews-h1', tx.ewsMetric);
  setText('veg-ews-h2', tx.ewsValue);
  setText('veg-ews-h3', tx.ewsTau);
  setText('veg-examples-title', tx.examplesTitle);
  setText('veg-opacity-label', tx.opacity);
  setText('veg-map-zoom-in', tx.zoomIn);
  setText('veg-map-zoom-out', tx.zoomOut);
  setText('veg-points-zoom-in', tx.zoomIn);
  setText('veg-points-zoom-out', tx.zoomOut);
  [['veg-maps-link', tx.mapsLink, tx.mapsLinkTarget], ['veg-points-link', tx.pointsLink, tx.pointsLinkTarget]].forEach(([id, label, target]) => {
    const link = $(id);
    link.href = target;
    link.innerHTML = '<span></span><svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    link.firstChild.textContent = label;
  });
  // the intro of the section "Tipping points" has the number of points in it (content/pages.json)
  const intro = $('intro-tipping');
  if (intro && intro.dataset.template) intro.textContent = intro.dataset.template.split('{total}').join(vegPoints.length);
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
  const map = L.map(elementId, { crs: L.CRS.Simple, zoomControl: false, attributionControl: false, zoomSnap: 0.25, scrollWheelZoom: false });
  L.imageOverlay(CONTENT.vegetation.baseMap.image, bounds).addTo(map);
  $(zoomInId).addEventListener('click', () => map.zoomIn());
  $(zoomOutId).addEventListener('click', () => map.zoomOut());
  // the map can only be measured when its card is on screen: fit the extent the first time it has a size
  let fitted = false;
  new ResizeObserver(() => {
    const box = $(elementId);
    if (!box.clientWidth) return;
    map.invalidateSize();
    if (!fitted) {
      fitted = true;
      map.fitBounds(bounds, { animate: false });
      map.setMinZoom(map.getZoom());
      map.setMaxZoom(map.getZoom() + 4);
      map.setMaxBounds(bounds.pad(0.05));
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
    link.className = 'diy-link';
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

// ---------- section 2: key numbers and the scenario matrix ----------

const anyPlaceholder = (list) => list.some((x) => x.placeholder);

// Counted from the points, never typed in.
function keyNumber(item) {
  if (item.type === 'total') return vegPoints.length;
  if (item.type === 'hasBreakpoint') return vegPoints.filter((p) => p.hasBreakpoint === true).length;
  if (item.type === 'scenario') return vegPoints.filter((p) => p.scenario === item.scenario).length;
  if (item.type === 'examples') return vegPoints.filter((p) => p.isExample).length;
  console.warn('content/vegetation.json: unknown key number type "' + item.type + '"');
  return null;
}

function renderKeyNumbers() {
  const strip = $('veg-numbers-strip');
  strip.innerHTML = '';
  showPlaceholderTag($('veg-numbers-title').parentElement, anyPlaceholder(vegPoints));
  CONTENT.vegetation.keyNumbers.forEach((item) => {
    const n = keyNumber(item);
    const box = document.createElement('div');
    box.className = 'number-item';
    box.innerHTML = '<span class="number-value"></span><span class="number-label"></span>';
    box.querySelector('.number-value').textContent = isNumber(n) ? n : NO_DATA;
    box.querySelector('.number-label').textContent = item.label;
    strip.appendChild(box);
  });
}

// 2x2: columns = SD tau, rows = NDVI tau. A click filters the map; a second click clears the filter.
function renderMatrix() {
  const m = CONTENT.vegetation.matrix;
  const grid = $('veg-matrix-grid');
  grid.innerHTML = '';
  showPlaceholderTag($('veg-matrix-title').parentElement, anyPlaceholder(vegPoints));
  const axis = (text, extra) => {
    const el = document.createElement('div');
    el.className = 'matrix-axis' + (extra ? ' ' + extra : '');
    el.textContent = text;
    return el;
  };
  grid.appendChild(axis(''));
  m.columns.forEach((c) => grid.appendChild(axis(m.xAxis + ' ' + c)));
  m.rows.forEach((row) => {
    grid.appendChild(axis(m.yAxis + ' ' + row));
    m.columns.forEach((col) => {
      const id = Object.keys(CONTENT.vegetation.scenarios).find((k) => {
        const s = CONTENT.vegetation.scenarios[k];
        return s.ndviTau === row && s.sdTau === col;
      });
      const scenario = vegScenario(id);
      const q = document.createElement('button');
      q.type = 'button';
      q.className = 'matrix-quadrant' + (vegFilter === id ? ' active' : '');
      q.setAttribute('aria-pressed', vegFilter === id);
      q.innerHTML = '<span class="matrix-name"><span class="lg-dot"></span><span class="matrix-label"></span></span><span class="matrix-count"></span>';
      q.querySelector('.lg-dot').style.background = scenario ? vegColor(scenario.color) : color('--color-text-faint');
      q.querySelector('.matrix-label').textContent = scenario ? scenario.label : NO_DATA;
      q.querySelector('.matrix-count').textContent = vegPoints.filter((p) => p.scenario === id).length;
      q.addEventListener('click', () => {
        vegFilter = vegFilter === id ? null : id;
        renderMatrix();
        applyFilter();
      });
      grid.appendChild(q);
    });
  });
}

// ---------- section 2: the points map ----------

function setupPointDots() {
  const map = vegMaps.points;
  vegCanvas = L.canvas({ padding: 0.5 });
  // ordinary points first, example points on top of them
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
      vegMarkers[p.id] = dot;
    });
  });
  vegRing = L.circleMarker([0, 0], { renderer: vegCanvas, radius: 11, fill: false, color: color('--color-text'), weight: 2, interactive: false });
  const legend = $('veg-points-legend');
  const title = document.createElement('span');
  title.className = 'legend-title';
  title.textContent = vt('scenarioLegend');
  legend.appendChild(title);
  Object.values(CONTENT.vegetation.scenarios).forEach((s) => legend.appendChild(legendItem(s.label, vegColor(s.color))));
  legend.appendChild(legendItem(vt('noScenario'), color('--color-text-faint')));
  showPlaceholderTag($('veg-points-title').parentElement, anyPlaceholder(vegPoints));
  applyFilter();
  moveRing();
}

// Only the points of the chosen scenario are on the map (all of them without a filter).
function applyFilter() {
  const map = vegMaps.points;
  let shown = 0;
  Object.entries(vegMarkers).forEach(([id, dot]) => {
    const p = vegPointById(id);
    const visible = vegFilter === null || p.scenario === vegFilter;
    if (visible) { shown++; if (!map.hasLayer(dot)) dot.addTo(map); } else if (map.hasLayer(dot)) map.removeLayer(dot);
  });
  setText('veg-points-subtitle', vt('pointsMapSubtitle', { shown: shown, total: vegPoints.length }));
  if (vegRing) vegRing.bringToFront();
}

function moveRing() {
  const p = vegPointById(vegSelectedId);
  if (!vegRing) return;
  if (!p) { vegMaps.points.removeLayer(vegRing); return; }
  vegRing.setLatLng([p.lat, p.lon]);
  if (!vegMaps.points.hasLayer(vegRing)) vegRing.addTo(vegMaps.points);
  vegRing.bringToFront();
}

// A point is selected on the map or in the example list: the map ring, the card and the list follow.
function selectVegPoint(id) {
  const p = vegPointById(id);
  if (!p) return;
  vegSelectedId = id;
  // a point that is hidden by the matrix filter would have no dot to select: clear the filter then
  if (vegFilter !== null && p.scenario !== vegFilter) { vegFilter = null; renderMatrix(); applyFilter(); }
  const map = vegMaps.points;
  if (map && !map.getBounds().contains([p.lat, p.lon])) map.panTo([p.lat, p.lon]);
  moveRing();
  renderSelectedPoint();
  renderExampleList();
}

// ---------- section 2: the selected point ----------

function renderSelectedPoint() {
  const p = vegPointById(vegSelectedId);
  const hasDetail = !!(p && p.isExample && p.ndvi);
  setText('veg-selected-title', p ? vt('selectedPoint', { id: p.id }) : NO_DATA);
  setText('veg-selected-scenario', p ? vegScenarioLabel(p) : '');
  showPlaceholderTag($('veg-selected-title').parentElement, p && (p.placeholder || (p.ews && p.ews.placeholder)));
  $('veg-selected-nodetail').hidden = hasDetail;
  $('veg-selected-chart').hidden = !hasDetail;
  $('veg-selected-chart').innerHTML = hasDetail ? ndviChartSvg(p) : '';
  setText('veg-selected-summary', hasDetail ? ndviSummary(p) : '');
  setText('veg-selected-breakpoint', hasDetail ? (p.breakpoint ? vt('breakpoint', { date: p.breakpoint.date }) : vt('noBreakpoint')) : '');
  renderEws(p, hasDetail);
}

function ndviSummary(p) {
  const d = p.ndvi.dates;
  return vt('summary', { count: knownValues(p.ndvi.values).length, first: d[0], last: d[d.length - 1] });
}

// The NDVI line of the point with its breakpoint (the 12-month window shaded, a line at the breakpoint).
// The y axis is the fixed range of content/variables.json when it has one, else the range of the data.
const VEG_PLOT = { width: 600, height: 190, left: 40, right: 592, top: 8, bottom: 162 };

function ndviChartSvg(p) {
  const { dates, values } = p.ndvi;
  const v = CONTENT.variables.pointVariables.find((x) => x.id === 'ndvi');
  const known = knownValues(values);
  const lo = v && v.axisRange ? v.axisRange[0] : Math.min(...known);
  const hi = v && v.axisRange ? v.axisRange[1] : Math.max(...known);
  const P = VEG_PLOT;
  const x = (i) => P.left + (i / (dates.length - 1)) * (P.right - P.left);
  const y = (val) => P.bottom - ((val - lo) / (hi - lo)) * (P.bottom - P.top);
  let svg = '<svg viewBox="0 0 ' + P.width + ' ' + P.height + '" role="img">';

  // breakpoint window (12 months) and line, under the NDVI line
  if (p.breakpoint) {
    const i = dates.indexOf(p.breakpoint.date);
    if (i >= 0) {
      const x0 = x(Math.max(0, i - 6)), x1 = x(Math.min(dates.length - 1, i + 6));
      svg += '<rect class="veg-bp-window ' + p.breakpoint.type + '" x="' + x0.toFixed(1) + '" y="' + P.top + '" width="' + (x1 - x0).toFixed(1) + '" height="' + (P.bottom - P.top) + '"></rect>';
      svg += '<line class="veg-bp-line ' + p.breakpoint.type + '" x1="' + x(i).toFixed(1) + '" x2="' + x(i).toFixed(1) + '" y1="' + P.top + '" y2="' + P.bottom + '" stroke-dasharray="4,4"></line>';
    }
  }
  // the NDVI line, broken where a month has no value
  let path = '';
  let pen = false;
  values.forEach((val, i) => {
    if (!isNumber(val)) { pen = false; return; }
    path += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(val).toFixed(1);
    pen = true;
  });
  svg += '<path class="veg-ndvi-line" d="' + path + '"></path>';
  svg += '<rect class="veg-plot-box" x="' + P.left + '" y="' + P.top + '" width="' + (P.right - P.left) + '" height="' + (P.bottom - P.top) + '"></rect>';
  // y axis: the lowest, zero (if inside) and highest value; x axis: a label every 5 years
  [lo, 0, hi].filter((val, k, a) => val >= lo && val <= hi && a.indexOf(val) === k).forEach((val) => {
    svg += '<text class="veg-axis-text" x="' + (P.left - 6) + '" y="' + (y(val) + 4).toFixed(1) + '" text-anchor="end">' + val + '</text>';
  });
  const firstYear = Number(dates[0].slice(0, 4)), lastYear = Number(dates[dates.length - 1].slice(0, 4));
  for (let yr = Math.ceil(firstYear / 5) * 5; yr <= lastYear; yr += 5) {
    const i = dates.findIndex((d) => d.startsWith(yr + '-'));
    if (i >= 0) svg += '<text class="veg-axis-text" x="' + x(i).toFixed(1) + '" y="' + (P.bottom + 18) + '" text-anchor="middle">' + yr + '</text>';
  }
  return svg + '</svg>';
}

// The early warning signals of the selected point: value and Kendall's tau per metric, as stored.
function renderEws(p, hasDetail) {
  const rows = $('veg-ews-rows');
  rows.innerHTML = '';
  const ews = hasDetail ? p.ews : null;
  showPlaceholderTag($('veg-ews-title').parentElement, ews && ews.placeholder);
  const num = (val) => (isNumber(val) ? formatLike(val, [val]) : NO_DATA);
  const entries = [{ label: vt('ewsNdviTau'), value: null, tau: ews ? ews.ndviTau : null }]
    .concat(CONTENT.vegetation.ewsMetrics.map((m) => ({ label: m.label, value: ews && ews[m.id] ? ews[m.id].value : null, tau: ews && ews[m.id] ? ews[m.id].tau : null })));
  entries.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'trend-row';
    row.innerHTML = '<div></div><div class="r"></div><div class="r tau"></div>';
    row.children[0].textContent = e.label;
    row.children[1].textContent = num(e.value);
    row.children[2].textContent = num(e.tau);
    rows.appendChild(row);
  });
}

// ---------- section 2: the example points ----------

function renderExampleList() {
  const list = $('veg-examples-list');
  const examples = vegPoints.filter((p) => p.isExample);
  list.innerHTML = '';
  showPlaceholderTag($('veg-examples-title').parentElement, anyPlaceholder(examples));
  setText('veg-examples-note', vt('examplesNote', { count: examples.length }));
  examples.forEach((p) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'event-row' + (p.id === vegSelectedId ? ' selected' : '');
    row.setAttribute('aria-pressed', p.id === vegSelectedId);
    row.innerHTML =
      '<span class="event-row-dot"></span>' +
      '<span class="event-row-text"><span class="event-row-name"></span><span class="event-row-date"></span></span>' +
      '<span class="event-type"><span class="lg-dot"></span><span class="event-type-near"></span></span>';
    row.querySelector('.event-row-name').textContent = vt('selectedPoint', { id: p.id });
    row.querySelector('.event-row-date').textContent = p.breakpoint ? vt('breakpoint', { date: p.breakpoint.date }) : vt('noBreakpoint');
    row.querySelector('.lg-dot').style.background = vegPointColor(p);
    row.querySelector('.event-type-near').textContent = vegScenarioLabel(p);
    row.addEventListener('click', () => selectVegPoint(p.id));
    list.appendChild(row);
    // keep the selected row in view inside the list (the page itself does not scroll)
    if (p.id === vegSelectedId) list.scrollTop = Math.max(0, row.offsetTop - list.offsetTop - list.clientHeight / 2);
  });
}
