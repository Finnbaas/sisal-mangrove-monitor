// vegetation.js: the Vegetation page ("Vegetation data"): Mangrove maps and Tipping points.
//   Section 1: a zoomable map (Leaflet) with the layers Condition | Change | Disturbance & recovery, an opacity
//   slider, a legend that switches per layer, "About this layer" and "Where the data comes from".
//   Section 2: the card "Early warning signals before the breakpoint" (residual, AR1 and SD with Kendall's tau and p).
//   The points map and the Point card of this section are the original cards of points.js (data/points.json).
// Reads: data/vegetation/layers.json (the map layers) and points.json (the early warning signals of the clickable points);
//   content/vegetation.json (texts, layer switch, chart names). Nothing is typed in this file: every number comes from the data.
// Uses: helpers.js, content.js (CONTENT, t), points.js (getSelectedPoint, pointXScale, allPoints), charts.js,
//   climatology-storms.js (events, selectEvent, strengthText) and Leaflet (CDN).
// Used by: main.js (setupVegetation); points.js calls renderVegetationEws() whenever the selected point changes.

// ---------- state ----------

let vegLayers = null;          // contents of data/vegetation/layers.json
let vegEws = [];               // the early warning signals per point id (data/vegetation/points.json)
let vegLoaded = false;         // true when layers.json and points.json have loaded
let vegLayerId = null;         // the layer shown in the map of section 1
let vegOverlay = null;         // the Leaflet image of that layer
let vegMaps = {};              // the Leaflet map of the layers: { layers }

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

// A color from a name in css/base.css ("class-loss") or, for map classes, a hex color as in the image ("#d7191c").
function vegColor(name) { return String(name).startsWith('#') ? name : color(colorVarOf(name)); }
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
    vegEws = (await loadVegetationFile(files.points)).points;
  } catch (err) {
    // name the file instead of a blank card
    const message = t('messages.couldNotLoadVegetation', { file: err.message });
    setText('veg-map-status', message);
    setText('veg-ews-status', message);
    console.error(err);
    return;
  }
  vegLayerId = vegLayers.layers[0].id;

  renderStaticTexts();
  renderLayerSwitch();
  setupOpacity();
  renderSource();
  renderLayer();
  setupMaps();
  setupPointsMapBackground();
  vegLoaded = true;
  renderVegetationEws(getSelectedPoint());   // points.js: the selected point, none at the start
  window.addEventListener('hashchange', () => { if (location.hash.slice(1).split('/')[0] === 'satellite') renderAbout(); });
}

// The texts that do not depend on the data: titles, links, hints.
function renderStaticTexts() {
  const tx = CONTENT.vegetation.texts;
  setText('veg-about-title', tx.aboutTitle);
  setText('veg-source-title', tx.sourceTitle);
  setText('veg-opacity-label', tx.opacity);
  setText('veg-map-zoom-in', tx.zoomIn);
  setText('veg-map-zoom-out', tx.zoomOut);
  setText('veg-map-reset', tx.reset);
  $('veg-map-reset').title = tx.resetTitle;
  [['veg-maps-link', tx.mapsLink, tx.mapsLinkTarget], ['veg-ews-link', tx.pointsLink, tx.pointsLinkTarget]].forEach(([id, label, target]) => {
    const link = $(id);
    link.href = target;
    link.innerHTML = '<span></span><svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    link.firstChild.textContent = label;
  });
}

// ---------- maps (Leaflet) ----------
// Both maps show the Sentinel-2 base map (data/vegetation/basemap.png) over the same extent (layers.json "bounds").
// The picture is in the Web Mercator projection (EPSG:3857), the same as Leaflet's default, so it is placed with
// real longitude/latitude bounds. The AOI outline is a thin vector line from layers.json "basemap.aoi".

function baseBounds() {
  const b = vegLayers.bounds;
  return L.latLngBounds([b.south, b.west], [b.north, b.east]);
}

// The AOI outline as Leaflet latitude/longitude pairs (layers.json stores [longitude, latitude]).
function aoiLatLngs() { return vegLayers.basemap.aoi.map(([lon, lat]) => [lat, lon]); }

function createMap(elementId, zoomInId, zoomOutId, resetId) {
  const bounds = baseBounds();
  const map = L.map(elementId, { zoomControl: false, attributionControl: false, zoomSnap: 0, scrollWheelZoom: false });
  // the attribution sits top left: the legend strip covers the bottom of the map
  L.control.attribution({ position: 'topleft', prefix: false }).addTo(map);
  L.imageOverlay(vegLayers.basemap.image, bounds, { attribution: vegLayers.basemap.attribution }).addTo(map);
  L.polygon(aoiLatLngs(), { color: vegColor('surface'), weight: 1.5, opacity: 0.9, fill: false, interactive: false }).addTo(map);
  $(zoomInId).addEventListener('click', () => map.zoomIn());
  $(zoomOutId).addEventListener('click', () => map.zoomOut());
  // reset: back to the whole area (the extent the map starts with)
  $(resetId).addEventListener('click', () => map.fitBounds(bounds));
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
  vegMaps.layers = createMap('veg-map', 'veg-map-zoom-in', 'veg-map-zoom-out', 'veg-map-reset');
  renderLayerOverlay();
}

// The points map (points.js) is a flat picture with dots placed in percent. It gets the same base map, the AOI
// outline as an SVG line (longitude/latitude to percent in the Mercator projection of the picture) and the attribution.
function mercatorY(latitude) { return Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)); }

function setupPointsMapBackground() {
  const b = vegLayers.bounds;
  const map = $('map');
  $('map-image').src = vegLayers.basemap.image;
  const top = mercatorY(b.north);
  const height = top - mercatorY(b.south);
  const points = vegLayers.basemap.aoi.map(([lon, lat]) =>
    ((lon - b.west) / (b.east - b.west) * 100).toFixed(3) + ',' + ((top - mercatorY(lat)) / height * 100).toFixed(3)).join(' ');
  const svg = '<svg id="map-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<polygon points="' + points + '" fill="none" stroke="' + vegColor('surface') + '" stroke-width="1.5" stroke-opacity="0.9" vector-effect="non-scaling-stroke"></polygon></svg>';
  map.insertAdjacentHTML('beforeend', svg);
  const credit = document.createElement('span');
  credit.id = 'map-attribution';
  credit.textContent = vegLayers.basemap.attribution;
  map.appendChild(credit);
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
  vegOverlay = L.imageOverlay(layer.image, L.latLngBounds([b.south, b.west], [b.north, b.east]), { opacity: $('veg-opacity').value / 100, className: 'pixel-layer' }).addTo(vegMaps.layers);   // pixel-layer: sharp blocks, see vegetation.css
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
  if (isFilled(layer.about.colors)) colors.appendChild(aboutText(layer.about.colors));   // a note on the colors
  body.appendChild(aboutBlock(vt('aboutColors'), colors));

  // share of area per class: the hectares as stored and their share of the total (one decimal), or "No data"
  const shares = document.createElement('div');
  const totalHa = layer.classes.reduce((sum, c) => sum + (isNumber(c.ha) ? c.ha : 0), 0);
  layer.classes.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'value-row';
    row.innerHTML = '<span class="name"><span class="lg-dot"></span><span class="class-name"></span></span><span class="val"></span>';
    row.querySelector('.lg-dot').style.background = vegColor(c.color);
    row.querySelector('.class-name').textContent = c.label;
    row.querySelector('.val').textContent = isNumber(c.ha) && totalHa > 0
      ? vt('shareValue', { ha: c.ha.toFixed(1), percent: (c.ha / totalHa * 100).toFixed(1) })
      : isNumber(c.share) ? c.share + ' %' : NO_DATA;
    shares.appendChild(row);
  });
  if (isFilled(layer.about.sharesNote)) {
    const note = aboutText(layer.about.sharesNote);
    note.classList.add('about-note');
    shares.appendChild(note);
  }
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


// ---------- section 2: Early warning signals before the breakpoint ----------
// Three stacked charts (residual, AR1, SD) with Kendall's tau and p of AR1 and SD between them and one shared year
// axis. The card follows the point selected in the points map and the Point card (points.js): renderAll() calls
// renderVegetationEws(point). The charts are drawn like the NDVI chart of points.js: same x scale (pointXScale),
// same year ticks, same grid and axis parts of charts.js.


// The intros with {total} (content/pages.json) get the number of points of data/points.json (points.js).
function fillVegetationIntros() {
  const total = typeof allPoints !== 'undefined' ? allPoints.length : 0;
  if (!total) return;
  ['intro-page-satellite', 'intro-tipping'].forEach((id) => {
    const intro = $(id);
    if (intro && intro.dataset.template) intro.textContent = intro.dataset.template.split('{total}').join(total);
  });
}

// One chart like the NDVI chart: grid with the year ticks, y axis, and the line (broken where a month has no value).
function vegEwsChartSvg(label, values, colorValue, gridX, x, clipId) {
  const head = chartHead({ label: label }, gridX, 'chart');
  const known = knownValues(values);
  if (!known.length) return chartNoData(head);
  const scale = chartScale(known, false);
  let svg = head + chartYAxis(scale.t, scale.yOf, true);
  svg += '<defs><clipPath id="' + clipId + '"><rect x="' + PLOT.left + '" y="' + PLOT.top + '" width="' + (PLOT.right - PLOT.left) + '" height="' + (PLOT.bottom - PLOT.top) + '"></rect></clipPath></defs><g clip-path="url(#' + clipId + ')">';
  segmentsOf(values).forEach((seg) => {
    if (seg.length === 1) svg += '<circle cx="' + x.xOf(seg[0].i).toFixed(1) + '" cy="' + scale.yOf(seg[0].val).toFixed(1) + '" r="1.8" fill="' + colorValue + '"></circle>';
    else svg += '<polyline points="' + seg.map((pt) => x.xOf(pt.i).toFixed(1) + ',' + scale.yOf(pt.val).toFixed(1)).join(' ') + '" fill="none" stroke="' + colorValue + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></polyline>';
  });
  return svg + '</g></svg>';
}

// A chart row like the others: the name on the left, the plot.
function vegChartRow(label, svg) {
  const row = document.createElement('div');
  row.className = 'anomaly-chart';
  row.innerHTML = '<div class="anomaly-label"><span class="anomaly-name"></span></div><div class="anomaly-plot">' + svg + '</div>';
  row.querySelector('.anomaly-name').textContent = label;
  return row;
}

// point = the selected point of points.js (or null: the charts show "No data", as the other cards do)
function renderVegetationEws(point) {
  if (!vegLoaded) return;   // the data of this card is still loading: setupVegetation draws the card once it is there
  fillVegetationIntros();
  const box = $('veg-ews-charts');
  box.innerHTML = '';
  setText('veg-ews-title', vt('ewsTitle'));
  setText('veg-ews-subtitle', vt('ewsSubtitle'));
  const entry = point ? vegEws.find((e) => e.id === point.id) : null;
  showPlaceholderTag($('veg-ews-title').parentElement, entry && entry.placeholder);

  // the months of the point and the year ticks: the same as in the NDVI chart (points.js)
  const dates = point && Array.isArray(point.dates) ? point.dates : [];
  const x = pointXScale(dates.length);
  const ticks = [];
  dates.forEach((d, i) => {
    const year = parseInt(d, 10);
    if (year % YEAR_TICK_STEP === 0 && (i === 0 || parseInt(dates[i - 1], 10) !== year)) ticks.push({ x: x.xOf(i), text: String(year) });
  });
  const gridX = ticks.map((tick) => tick.x);

  const num = (val) => (isNumber(val) ? formatLike(val, [val]) : NO_DATA);
  CONTENT.vegetation.ewsCharts.forEach((c) => {
    const data = entry && entry.ews[c.id];
    // Kendall's tau and p as a line of text above the chart (the residual has none)
    if (data && 'tau' in data) {
      const text = document.createElement('div');
      text.className = 'ews-tau';
      text.textContent = vt('ewsTau', { label: c.label, tau: num(data.tau), p: num(data.p) });
      box.appendChild(text);
    }
    const svg = data ? vegEwsChartSvg(c.label, data.values, vegColor(c.color), gridX, x, 'veg-clip-' + c.id)
      : chartNoData(chartHead({ label: c.label }, gridX, 'chart'));
    box.appendChild(vegChartRow(c.label, svg));
  });
  if (dates.length) box.appendChild(sharedAxis(ticks, t('labels.year')));
}
