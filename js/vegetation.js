// vegetation.js: the Vegetation page ("Vegetation data"): Mangrove maps and Tipping points.
//   Section 1: a zoomable map (Leaflet) with the layers Condition | Change | Disturbance & recovery, an opacity
//   slider, a legend that switches per layer, "About this layer" and "Where the data comes from".
//   Section 2: the card "Early warning signals before the breakpoint": the verdict of the EWS notebook with its reason,
//   a metrics table (expected and found direction, tau, p) and the charts (residual, AR1, SD), only for points with a
//   loss breakpoint and enough data before it; other points get a short message.
//   The points map and the Point card of this section are the original cards of points.js (data/points.json).
// Reads: data/vegetation/layers.json (the map layers); the early warning signals come from the "ews" of the points in
//   data/points.json (loaded by points.js);
//   content/vegetation.json (texts, layer switch, chart names). Nothing is typed in this file: every number comes from the data.
// Uses: helpers.js, content.js (CONTENT, t), points.js (getSelectedPoint, pointXScale, allPoints), charts.js,
//   climatology-storms.js (events, selectEvent, strengthText) and Leaflet (CDN).
// Used by: main.js (setupVegetation); points.js calls renderVegetationEws() whenever the selected point changes.

// ---------- state ----------

let vegLayers = null;          // contents of data/vegetation/layers.json
let vegLoaded = false;         // true when layers.json has loaded
let vegLayerId = null;         // the layer shown in the map of section 1
let vegViewIds = {};           // the chosen view per layer id (layers with "views", e.g. Change: classes | per-period)
let vegOverlay = null;         // the Leaflet image of that layer
let vegMaps = {};              // the Leaflet map of the layers: { layers }
const START_PADDING = 40;      // px of base map around the outline in the start view of the maps

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
  renderViewSwitch();
  setupOpacity();
  renderSource();
  renderLayer();
  setupMaps();
  setupPointsMapBackground();
  vegLoaded = true;
  if (allPoints.length) { renderMap(); renderAll(); }   // points.js: the dots, now on the new base map
  renderVegetationEws(getSelectedPoint());   // points.js: the selected point, none at the start
  window.addEventListener('hashchange', () => {
    if (location.hash.slice(1).split('/')[0] !== 'satellite') return;
    renderAbout();
    // the parts of this page are tabs: a Leaflet map that was hidden must measure its size again when its part shows
    setTimeout(() => { if (vegMaps.layers) vegMaps.layers.invalidateSize(); }, 0);
  });
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
  const b = vegLayers.basemapBounds;
  return L.latLngBounds([b.south, b.west], [b.north, b.east]);
}

// The AOI outline as Leaflet latitude/longitude pairs (layers.json stores [longitude, latitude]).
function aoiLatLngs() { return vegLayers.basemap.aoi.map(([lon, lat]) => [lat, lon]); }

function createMap(elementId, zoomInId, zoomOutId, resetId) {
  const bounds = baseBounds();                  // the whole base map: the map cannot be panned outside it
  const aoi = L.latLngBounds(aoiLatLngs());     // the study area outline: the start view
  const map = L.map(elementId, { zoomControl: false, attributionControl: false, zoomSnap: 0, scrollWheelZoom: false, maxBoundsViscosity: 1 });
  // the start view: the outline with 40 px of base map on every side (the legend strip lies over the bottom of the map)
  const legendHeight = () => $(elementId).parentElement.querySelector('.legend-strip').offsetHeight;
  const showStart = () => map.fitBounds(aoi, { paddingTopLeft: [START_PADDING, START_PADDING], paddingBottomRight: [START_PADDING, START_PADDING + legendHeight()], animate: false });
  // the attribution sits top left: the legend strip covers the bottom of the map
  L.control.attribution({ position: 'topleft', prefix: false }).addTo(map);
  L.imageOverlay(vegLayers.basemap.image, bounds, { attribution: vegLayers.basemap.attribution }).addTo(map);
  L.polygon(aoiLatLngs(), { color: vegColor('surface'), weight: 1.5, opacity: 0.9, fill: false, interactive: false }).addTo(map);
  $(zoomInId).addEventListener('click', () => map.zoomIn());
  $(zoomOutId).addEventListener('click', () => map.zoomOut());
  // reset: back to the start view
  $(resetId).addEventListener('click', showStart);
  // the map can only be measured when its card is on screen: (re)fit the extent whenever its size changes
  let fitted = false;
  new ResizeObserver(() => {
    const box = $(elementId);
    if (!box.clientWidth) return;
    map.invalidateSize();
    map.setMinZoom(map.getBoundsZoom(bounds));   // the level at which the whole base map just fits
    map.setMaxBounds(bounds);
    map.setMaxZoom(map.getBoundsZoom(aoi, false, L.point(2 * START_PADDING, 2 * START_PADDING + legendHeight())) + 4);
    showStart();
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

// The points map (points.js) is a flat picture (the base map) with dots placed in percent of the picture.
// #map is the whole picture, #map-view the window on it: layoutPointsMap() sizes and moves the picture so the AOI outline
// fills the window with START_PADDING px around it (the same start view as the Leaflet map). The outline is an SVG line.
// The picture is in the Mercator projection, so a latitude is first converted with mercatorY().
function mercatorY(latitude) { return Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)); }

// A longitude/latitude as percent of the base map picture: { left, top }.
function basemapPercent(lon, lat) {
  const b = vegLayers.basemapBounds;
  const top = mercatorY(b.north);
  return {
    left: (lon - b.west) / (b.east - b.west) * 100,
    top: (top - mercatorY(lat)) / (top - mercatorY(b.south)) * 100
  };
}

// Where a point of points.js lies on the points map (percent of the picture).
function pointMapPosition(p) {
  if (!vegLayers) return { left: p.leftPct, top: p.topPct };   // layers.json is still loading: drawn again when it is there
  return basemapPercent(p.lon, p.lat);
}

// Size and place the picture in its window: the outline fits with START_PADDING px on every side (never smaller than the window).
function layoutPointsMap() {
  const view = $('map-view');
  const w = view.clientWidth;
  const h = view.clientHeight;
  if (!w || !h) return;
  const b = vegLayers.basemapBounds;
  const ratio = (mercatorY(b.north) - mercatorY(b.south)) / ((b.east - b.west) * Math.PI / 180);   // picture height / width
  const corners = vegLayers.basemap.aoi.map(([lon, lat]) => basemapPercent(lon, lat));
  const left = Math.min(...corners.map((c) => c.left)) / 100, right = Math.max(...corners.map((c) => c.left)) / 100;
  const top = Math.min(...corners.map((c) => c.top)) / 100, bottom = Math.max(...corners.map((c) => c.top)) / 100;
  // picture width in px: the outline (a share of the picture) must fit in the window minus the padding
  let width = Math.min((w - 2 * START_PADDING) / (right - left), (h - 2 * START_PADDING) / ((bottom - top) * ratio));
  width = Math.max(width, w, h / ratio);
  const height = width * ratio;
  // centre the outline, but keep the picture over the whole window
  const x = Math.min(0, Math.max(w - width, w / 2 - (left + right) / 2 * width));
  const y = Math.min(0, Math.max(h - height, h / 2 - (top + bottom) / 2 * height));
  const stage = $('map');
  stage.style.width = width + 'px';
  stage.style.height = height + 'px';
  stage.style.left = x + 'px';
  stage.style.top = y + 'px';
}

function setupPointsMapBackground() {
  const map = $('map');
  $('map-image').src = vegLayers.basemap.image;
  const points = vegLayers.basemap.aoi.map(([lon, lat]) => {
    const p = basemapPercent(lon, lat);
    return p.left.toFixed(3) + ',' + p.top.toFixed(3);
  }).join(' ');
  const svg = '<svg id="map-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<polygon points="' + points + '" fill="none" stroke="' + vegColor('surface') + '" stroke-width="1.5" stroke-opacity="0.9" vector-effect="non-scaling-stroke"></polygon></svg>';
  map.insertAdjacentHTML('beforeend', svg);
  const credit = document.createElement('span');
  credit.id = 'map-attribution';
  credit.textContent = vegLayers.basemap.attribution;
  $('map-view').appendChild(credit);
  // the window can only be measured when its card is on screen: place the picture whenever its size changes
  new ResizeObserver(layoutPointsMap).observe($('map-view'));
}

// ---------- section 1: the layers ----------

// The layer shown. A layer with "views" (layers.json) gets the fields of the chosen view (image, legend, about, ...) on top.
function currentLayer() {
  const layer = vegLayers.layers.find((l) => l.id === vegLayerId);
  if (!layer.views) return layer;
  const view = layer.views.find((v) => v.id === vegViewIds[layer.id]) || layer.views[0];
  return Object.assign({}, layer, view, { id: layer.id });
}

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
      renderViewSwitch();
      renderLayer();
      renderLayerOverlay();
    });
    box.appendChild(chip);
  });
}

// The small switch under the layer chips (e.g. Change: Classes | Per period): only for layers with views.
function renderViewSwitch() {
  const box = $('veg-view-switch');
  const items = CONTENT.vegetation.viewSwitch[vegLayerId];
  box.hidden = !items;
  box.innerHTML = '';
  if (!items) return;
  const layer = vegLayers.layers.find((l) => l.id === vegLayerId);
  const activeId = (vegViewIds[vegLayerId] || layer.views[0].id);
  items.forEach((item) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'layer-chip' + (item.id === activeId ? ' on' : '');
    chip.textContent = item.label;
    chip.setAttribute('aria-pressed', item.id === activeId);
    chip.addEventListener('click', () => {
      vegViewIds[vegLayerId] = item.id;
      renderViewSwitch();
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
  const b = layer.bounds || vegLayers.layerBounds;
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
  if (legend.type === 'periods') {
    // two rows of color blocks (loss, gain), one block per period transition; the dates are in the tooltip
    const grid = document.createElement('div');
    grid.className = 'legend-periods';
    legend.rows.forEach((row) => {
      const name = document.createElement('span');
      name.className = 'period-row-label';
      name.textContent = row.label;
      grid.appendChild(name);
      row.colors.forEach((c, n) => {
        const step = legend.steps[n];
        const block = document.createElement('span');
        block.className = 'period-block' + (n >= row.colors.length / 2 ? ' dark' : '');
        block.style.background = c;
        block.textContent = step.label + (step.provisional ? '*' : '');
        block.title = step.label + ' (' + step.range + ')' + (step.provisional ? ' – ' + legend.provisionalNote : '');
        grid.appendChild(block);
      });
    });
    const note = document.createElement('span');
    note.className = 'legend-note';
    note.textContent = '* ' + legend.provisionalNote;
    box.append(grid, note);
  } else if (legend.type === 'gradient') {
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

  // how to read the colors: one color block per class (the per-period view lists its periods instead)
  const colors = document.createElement('div');
  colors.className = 'about-legend';
  layer.classes.forEach((c) => colors.appendChild(legendItem(c.label, vegColor(c.color))));
  if (layer.legend.type === 'periods') {
    const list = document.createElement('div');
    list.className = 'period-list';
    layer.legend.steps.forEach((st, n) => {
      // like the classes of the other map: color blocks (loss, gain) in front of the label
      const line = document.createElement('span');
      line.className = 'lg';
      layer.legend.rows.forEach((row) => {
        const swatch = document.createElement('span');
        swatch.className = 'lg-swatch';
        swatch.style.background = row.colors[n];
        swatch.title = row.label;
        line.appendChild(swatch);
      });
      const text = document.createElement('span');
      text.textContent = st.label + ' (' + st.range + ')' + (st.provisional ? ' – ' + layer.legend.provisionalNote : '');
      line.appendChild(text);
      list.appendChild(line);
    });
    colors.appendChild(list);
  }
  if (isFilled(layer.about.colors)) colors.appendChild(aboutText(layer.about.colors));   // a note on the colors
  body.appendChild(aboutBlock(vt('aboutColors'), colors));

  renderChartCard(layer);

  // share of area per class: the hectares as stored and their share of the total (one decimal), or "No data"
  if (layer.classes.length) {
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
  }

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

// The separate card under "About this layer" for a small chart that follows later (per-period view); hidden when the view has none.
function renderChartCard(layer) {
  const card = document.querySelector('[data-card="veg-chart"]');
  const chart = layer.about.chart;
  card.hidden = !chart;
  if (!chart) return;
  setText('veg-chart-title', chart.title);
  showPlaceholderTag($('veg-chart-title').parentElement, layer.placeholder);
  $('veg-chart-text').textContent = vt('chartPlaceholder');
  $('veg-chart-note').textContent = chart.note;
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


// The intros with {total} and {featured} (content/pages.json) get the number of points of data/points.json and the
// number of clickable points of content/featured-points.json (both loaded by points.js).
function fillVegetationIntros() {
  const total = typeof allPoints !== 'undefined' ? allPoints.length : 0;
  if (!total) return;
  const featured = typeof FEATURED !== 'undefined' ? Object.keys(FEATURED).length : 0;
  ['intro-page-satellite', 'intro-ndvi', 'intro-tipping'].forEach((id) => {
    const intro = $(id);
    if (intro && intro.dataset.template) intro.textContent = intro.dataset.template.split('{total}').join(total).split('{featured}').join(featured);
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

// The early warning signals of a point: its "ews" in data/points.json (loaded by points.js), or null.
// Also used by the trend signals card (points.js).
function ewsEntryFor(point) {
  return point && point.ews ? point.ews : null;
}

// The message of a point without EWS charts (content/texts.json), by its "ews.status" in data/points.json:
// noBreakpoint (a control), tooShort, tooInterpolated or notAnalysed. A point that is missing from the file, or a file
// without "status" (not exported yet by export_points.py), gets "not available yet". Also used by the trend signals card.
const EWS_STATUS_MESSAGES = {
  noBreakpoint: 'messages.ewsNoBreakpoint',
  tooShort: 'messages.ewsTooShort',
  tooInterpolated: 'messages.ewsTooInterpolated',
  notAnalysed: 'messages.ewsNotAnalysed'
};
function ewsStatusMessage(entry) {
  return t((entry && EWS_STATUS_MESSAGES[entry.status]) || 'messages.ewsNotAvailable');
}

// point = the selected point of points.js (or null: the charts show "No data", as the other cards do)
// Only points with status "ok" have charts. They use the same timeline as the NDVI chart; the values exist only for
// the months before the loss ("dates" of the entry), and a dashed line marks the start of the loss.
// The early warning signals are two cards: "ews-verdict" (verdict, reason, metrics table) and "ews-plots" (the charts).
function renderVegetationEws(point) {
  if (!vegLoaded) return;   // the data of these cards is still loading: setupVegetation draws them once it is there
  fillVegetationIntros();
  const verdictBox = $('ews-verdict-body');
  const box = $('ews-plots-charts');
  verdictBox.innerHTML = '';
  box.innerHTML = '';
  const entry = ewsEntryFor(point);
  // the subtitle names the start of the loss: the start of the 12-month window of the drop (lossStart), which lies
  // before the breakpoint date of the NDVI chart
  setText('ews-plots-subtitle', entry && entry.lossStart ? t('messages.ewsSubtitleWithDate', { lossStart: entry.lossStart }) : t('messages.ewsSubtitle'));

  // a short grey message in a card
  const showMessage = (target, text) => {
    const message = document.createElement('p');
    message.className = 'placeholder-text';
    message.textContent = text;
    target.appendChild(message);
  };
  // a point without EWS (no loss breakpoint, or not enough data before it): the message in both cards, no charts
  if (point && (!entry || entry.status !== 'ok')) {
    showMessage(verdictBox, ewsStatusMessage(entry));
    showMessage(box, ewsStatusMessage(entry));
    return;
  }
  // the verdict card: the verdict and the metrics table; a hint without a selected point; "not available yet" for an
  // older export without verdict (never an empty card)
  if (entry) {
    renderEwsVerdict(verdictBox, entry);
    renderEwsTable(verdictBox, entry);
  }
  if (!verdictBox.children.length) showMessage(verdictBox, point ? t('messages.ewsNotAvailable') : t('messages.ewsSelectPoint'));

  // The same timeline as the NDVI chart (points.js): all months of the point ("dates" in data/points.json), the same
  // x scale and year ticks. The EWS only exist before the loss, so the months after it stay empty.
  const dates = point && Array.isArray(point.dates) ? point.dates : [];
  const x = pointXScale(dates.length);
  const ticks = [];
  dates.forEach((d, i) => {
    const year = parseInt(d, 10);
    if (year % YEAR_TICK_STEP === 0 && (i === 0 || parseInt(dates[i - 1], 10) !== year)) ticks.push({ x: x.xOf(i), text: String(year) });
  });
  const gridX = ticks.map((tick) => tick.x);
  // place an EWS series (one value per month of entry.dates) on the months of the point; other months are null
  const ewsDates = entry && Array.isArray(entry.dates) ? entry.dates : [];
  const onTimeline = (values) => {
    const full = dates.map(() => null);
    ewsDates.forEach((d, i) => { const k = dates.indexOf(d); if (k >= 0) full[k] = values[i]; });
    return full;
  };
  // the start of the loss: a dashed line at that month, as the breakpoint lines of the NDVI chart
  const lossIndex = entry && entry.lossStart ? dates.indexOf(entry.lossStart) : -1;
  const lossX = lossIndex >= 0 ? x.xOf(lossIndex).toFixed(1) : null;
  const lossLine = lossX ? '<line x1="' + lossX + '" y1="' + PLOT.top + '" x2="' + lossX + '" y2="' + PLOT.bottom +
    '" stroke="' + color('--color-breakpoint') + '" stroke-width="1.5" stroke-dasharray="4,4"></line>' : '';

  CONTENT.vegetation.ewsCharts.forEach((c) => {
    const data = entry && entry.metrics ? entry.metrics[c.id] : null;
    const svg = data ? vegEwsChartSvg(c.label, onTimeline(data.values), vegColor(c.color), gridX, x, 'veg-clip-' + c.id).replace('</svg>', lossLine + '</svg>')
      : chartNoData(chartHead({ label: c.label }, gridX, 'chart'));
    box.appendChild(vegChartRow(c.label, svg));
  });
  if (dates.length) box.appendChild(sharedAxis(ticks, t('labels.year')));
}

// ---------- the conclusion of the EWS card: verdict, reason and metrics table ----------
// Everything comes from the "ews" of the point (data/points.json), as the EWS notebook decided it: the verdict
// ("ewsVerdict"), and per metric the expected direction ("expected": "up", or null = not part of the verdict), tau, p
// and whether it matches an early warning signal ("matches" = right direction AND p < alpha). Nothing is decided here:
// this code only picks the texts of content/texts.json that fit those values.

// "AR1 and standard deviation": names joined with the word "and" of content/texts.json
function joinNames(names) {
  if (names.length < 2) return names.join('');
  return names.slice(0, -1).join(', ') + ' ' + t('labels.and') + ' ' + names[names.length - 1];
}

// The metrics of the table (content/vegetation.json "ewsMetrics") with their data
function ewsMetricRows(entry) {
  return (CONTENT.vegetation.ewsMetrics || []).map((m) => ({ m: m, data: entry.metrics ? entry.metrics[m.id] : null }));
}

function renderEwsVerdict(box, entry) {
  const verdict = entry.ewsVerdict;
  if (verdict !== 'ews' && verdict !== 'no-ews') return;   // an older export without verdict: only the charts
  const alpha = isNumber(entry.alpha) ? formatLike(entry.alpha, [entry.alpha]) : NO_DATA;
  const rows = ewsMetricRows(entry);

  // the reason: which metrics of the verdict rose significantly, went down, or went up without being significant
  const inVerdict = rows.filter((r) => r.data && r.data.expected);
  const names = (list) => joinNames(list.map((r) => r.m.sentenceLabel || r.m.label));
  const wentDown = (r) => isNumber(r.data.tau) && r.data.tau < 0;
  const rose = inVerdict.filter((r) => r.data.matches === true);
  const fell = inVerdict.filter((r) => r.data.matches !== true && wentDown(r));
  const notSignificant = inVerdict.filter((r) => r.data.matches !== true && !wentDown(r));
  const parts = [];
  if (rose.length) parts.push(t('messages.ewsPartRose', { metrics: names(rose), alpha: alpha }));
  if (fell.length) parts.push(t('messages.ewsPartFell', { metrics: names(fell) }));
  if (notSignificant.length) parts.push(t('messages.ewsPartNotSignificant', { metrics: names(notSignificant), alpha: alpha }));
  const reason = parts.join('; ');

  const block = document.createElement('div');
  block.className = 'ews-verdict-box';
  block.innerHTML = '<div class="ews-verdict ' + verdict + '"></div><div class="ews-reason"></div><div class="ews-rule"></div>';
  block.querySelector('.ews-verdict').textContent = t(verdict === 'ews' ? 'messages.ewsVerdictYes' : 'messages.ewsVerdictNo');
  block.querySelector('.ews-reason').textContent = reason ? reason.charAt(0).toUpperCase() + reason.slice(1) + '.' : '';
  block.querySelector('.ews-rule').textContent = t('messages.ewsRule', { metrics: names(inVerdict), alpha: alpha });

  box.appendChild(block);
}

// The metrics table: metric | expected | found (direction of tau) | Kendall's tau | p | warning sign. The warning sign is
// ✓ / ✗ from "matches" (right direction AND p < alpha, as the notebook decides it); metrics that are not part of the
// verdict (skewness, kurtosis) show "not part of the verdict" instead.
function renderEwsTable(box, entry) {
  if (entry.ewsVerdict !== 'ews' && entry.ewsVerdict !== 'no-ews') return;   // an older export without verdict
  const table = document.createElement('div');
  table.className = 'ews-table';
  const cell = (text, cls) => '<div' + (cls ? ' class="' + cls + '"' : '') + '>' + escapeHtml(text) + '</div>';
  let html = '<div class="ews-table-row head">' + cell(t('labels.ewsMetric')) + cell(t('labels.ewsExpected')) + cell(t('labels.ewsFound')) +
    cell(t('labels.ewsTau')) + cell(t('labels.p')) + cell(t('labels.ewsWarning')) + '</div>';
  ewsMetricRows(entry).forEach((r) => {
    const d = r.data;
    const expected = d && d.expected === 'up' ? t('labels.ewsUp') : '—';
    const hasTau = d && isNumber(d.tau);
    const found = !hasTau ? NO_DATA : d.tau > 0 ? t('labels.ewsUp') : d.tau < 0 ? t('labels.ewsDown') : '—';
    const tau = hasTau ? formatLike(d.tau, [d.tau]) : NO_DATA;
    // p as the notebook defines it; p = 0 becomes "< pMin" (never "0")
    const p = d ? ewsP(d.p, entry.pMin) : { below: false, text: NO_DATA };
    const mark = !d || d.matches === null || d.matches === undefined ? cell(t('labels.ewsNotInVerdict'), 'ews-mark none')
      : d.matches ? cell(t('labels.ewsYes'), 'ews-mark yes') : cell(t('labels.ewsNo'), 'ews-mark no');
    html += '<div class="ews-table-row">' + cell(r.m.label) + cell(expected, 'mono') + cell(found, 'mono') + cell(tau, 'mono') +
      cell((p.below ? '< ' : '') + p.text, 'mono') + mark + '</div>';
  });
  table.innerHTML = html;
  box.appendChild(table);
}
