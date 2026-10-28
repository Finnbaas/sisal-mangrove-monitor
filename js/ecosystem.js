// ecosystem.js: the Ecosystem page ("Ecosystem data"): Mangrove maps and Tipping points.
//   Section 1: a zoomable map (Leaflet) chosen with the Maps menu (card "Maps": Extent | Condition | Disturbance & recovery, with variants), an opacity
//   slider, a legend that switches per layer, "About this layer" and "Where the data comes from".
//   Section 2: the card "Early warning signals before the breakpoint": the verdict of the EWS notebook with its reason,
//   a metrics table (expected and found direction, tau, p) and the charts (residual, AR1, SD), only for points with a
//   loss breakpoint and enough data before it; other points get a short message.
//   The points map and the Point card of this section are the original cards of points.js (data/points.json).
// Reads: data/vegetation/layers.json (the map layers); the early warning signals come from the "ews" of the points in
//   data/points.json (loaded by points.js);
//   content/ecosystem.json (texts, layer switch, chart names). Nothing is typed in this file: every number comes from the data.
// Uses: helpers.js, content.js (CONTENT, t), points.js (getSelectedPoint, pointXScale, allPoints), charts.js,
//   climatology-storms.js (events, selectEvent, strengthText) and Leaflet (CDN).
// Used by: main.js (setupEcosystem); points.js calls renderEcosystemEws() whenever the selected point changes;
//   stakeholders.js reuses createMap, setupBasemapButton, setText and ecoLayersLoaded for its maps.

// ---------- state ----------

let ecoLayers = null;          // contents of data/vegetation/layers.json
let ecoLayersLoaded = null;    // the promise of that file: stakeholders.js waits for it to draw the same base map
let ecoBarSet = null;          // the bar chart of the per-period view as a set for the comparison line (see charts.js)
let ecoBarMode = 'total';      // 'perYear' or 'total' (content/ecosystem.json "chartModes")
let ecoEwsSet = null;          // the EWS charts as a set for the comparison line (see charts.js)
let ecoLoaded = false;         // true when layers.json has loaded
let ecoLayerId = null;         // the layer shown in the map of section 1
let ecoVariantIds = {};        // the chosen variant per view ("layer/view"): Simplified | Detailed, a year, a period or a storm (see variantsOf)
let ecoViewIds = {};           // the chosen view per layer id (layers with "views", e.g. Change: classes | per-period)
let ecoOverlay = null;         // the Leaflet image of that layer
let ecoMaps = {};              // the Leaflet map of the layers: { layers }
const MAP_WHEEL_SCROLL = 1 / 150;   // zoom levels per pixel of mouse wheel / two-finger scroll (a swipe of 80 px = about half a level)
const MAP_WHEEL_PINCH = 1 / 40;     // zoom levels per pixel of a trackpad pinch (a pinch arrives as a wheel event with ctrlKey)
const START_PADDING = 40;      // px of base map around the outline in the start view of the maps

// A text from content/ecosystem.json "texts", e.g. vt('pointsMapSubtitle', { shown: 5, total: 10 }).
function vt(key, values) {
  let text = CONTENT.ecosystem.texts[key];
  if (typeof text !== 'string') {
    console.warn('content/ecosystem.json has no text "' + key + '"');
    return '[' + key + ']';
  }
  Object.entries(values || {}).forEach(([k, v]) => { text = text.split('{' + k + '}').join(v); });
  return text;
}

// A color from a name in css/base.css ("class-loss") or, for map classes, a hex color as in the image ("#d7191c").
function ecoColor(name) { return String(name).startsWith('#') ? name : color(colorVarOf(name)); }
function setText(id, text) { $(id).textContent = text; }

// ---------- loading ----------

async function loadEcosystemFile(path) {
  let response;
  try { response = await fetch(path); } catch (err) { throw new Error(path + ' (' + err.message + ')'); }
  if (!response.ok) throw new Error(path + ' (HTTP ' + response.status + ')');
  try { return await response.json(); } catch (err) { throw new Error(path + ' is not valid JSON (' + err.message + ')'); }
}

async function setupEcosystem() {
  const files = CONTENT.ecosystem.files;
  try {
    ecoLayersLoaded = loadEcosystemFile(files.layers);
    ecoLayers = await ecoLayersLoaded;
  } catch (err) {
    // name the file instead of a blank card
    const message = t('messages.couldNotLoadEcosystem', { file: err.message });
    setText('eco-map-status', message);
    setText('eco-ews-status', message);
    console.error(err);
    return;
  }
  // the first map of the menu is the start map; an address like #satellite/maps/status-2025 chooses another one
  const firstGroup = CONTENT.ecosystem.mapMenu.groups[0];
  ecoLayerId = firstGroup.id;
  ecoViewIds[firstGroup.id] = firstGroup.items[0].view;
  selectFromSlug(mapSlugInAddress());

  renderStaticTexts();
  renderMapMenu();
  setupOpacity();
  setupBasemapButton('eco-basemap-button', 'eco-map', true);   // the Mangrove maps map starts black and white
  setupBasemapSwitch('map-basemap-switch', 'map', false);      // the points map starts in colour
  renderSource();
  renderLayer();
  setupMaps();
  setupPointsMapBackground();
  ecoLoaded = true;
  // the comparison line on the EWS charts (mouse and arrow keys), the same as on the other charts, see js/charts.js
  attachComparisonLine($('ews-plots-charts'), () => ecoEwsSet);
  attachComparisonLine($('eco-chart-body'), () => ecoBarSet);
  if (allPoints.length) { renderMap(); renderAll(); }   // points.js: the dots, now on the new base map
  renderEcosystemEws(getSelectedPoint());   // points.js: the selected point (the start point of featured-points.json)
  window.addEventListener('hashchange', () => {
    if (location.hash.slice(1).split('/')[0] !== 'satellite') return;
    if (selectFromSlug(mapSlugInAddress())) { renderMapMenu(); renderLayer(); renderLayerOverlay(); }   // a link or the back button
    renderAbout();
  });
}

// The texts that do not depend on the data: titles, links, hints.
function renderStaticTexts() {
  const tx = CONTENT.ecosystem.texts;
  setText('eco-about-title', tx.aboutTitle);
  setText('eco-source-title', tx.sourceTitle);
  setText('eco-opacity-label', tx.opacity);
  setText('eco-map-zoom-in', tx.zoomIn);
  setText('eco-map-zoom-out', tx.zoomOut);
  setText('eco-map-reset', tx.reset);
  $('eco-map-reset').title = tx.resetTitle;
  [['eco-maps-link', tx.mapsLink, tx.mapsLinkTarget], ['eco-ews-link', tx.pointsLink, tx.pointsLinkTarget]].forEach(([id, label, target]) => {
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
  const b = ecoLayers.basemapBounds;
  return L.latLngBounds([b.south, b.west], [b.north, b.east]);
}

// The AOI outline as Leaflet latitude/longitude pairs (layers.json stores [longitude, latitude]).
function aoiLatLngs() { return ecoLayers.basemap.aoi.map(([lon, lat]) => [lat, lon]); }

// The Mangrove maps map calls this with four ids. The Stakeholder maps (stakeholders.js) also pass "options":
//   startBounds: the start view (default: the study area outline)
//   afterFit(map, first): called after every (re)fit of the start view; first is true the first time
//   fillMap: true = the smallest zoom is the one at which the base map fills the whole map frame (no empty bands at the sides
//     of a map that is wider than the base map), instead of the one at which the whole base map is in view
//   alignTop: true = when the start view is cut off at the top, it is moved down so that the top of the start bounds is
//     START_PADDING from the top of the map (the bottom is cut off instead)
//   The map gets flyToStart(): flies to the start view (the same view as the Reset button).
function createMap(elementId, zoomInId, zoomOutId, resetId, options) {
  const bounds = baseBounds();                  // the whole base map: the map cannot be panned outside it
  const aoi = L.latLngBounds(aoiLatLngs());     // the study area outline: the start view
  const start = options && options.startBounds ? options.startBounds : aoi;
  const map = L.map(elementId, { zoomControl: false, attributionControl: false, zoomSnap: 0, scrollWheelZoom: false, maxBoundsViscosity: 1 });
  // zoom with the mouse wheel, two-finger scroll and pinch on a trackpad, around the pointer. Own handler instead of Leaflet's
  // scrollWheelZoom, which is too weak for the many small steps of a trackpad.
  map.getContainer().addEventListener('wheel', (e) => {
    e.preventDefault();
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);   // a mouse wheel may report lines or pages
    const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() - pixels * (e.ctrlKey ? MAP_WHEEL_PINCH : MAP_WHEEL_SCROLL)));
    if (zoom !== map.getZoom()) map.setZoomAround(map.mouseEventToContainerPoint(e), zoom, { animate: Math.abs(pixels) >= 50 });   // a notch of a mouse wheel is animated
  }, { passive: false });
  // the start view: the outline with 40 px of base map on every side (the legend strip, if the map has one, lies over the bottom of the map)
  const legendHeight = () => {
    const strip = $(elementId).parentElement.querySelector('.legend-strip');
    return strip ? strip.offsetHeight : 0;
  };
  const showStart = () => {
    map.fitBounds(start, { paddingTopLeft: [START_PADDING, START_PADDING], paddingBottomRight: [START_PADDING, START_PADDING + legendHeight()], animate: false });
    if (options && options.alignTop) {
      const top = map.latLngToContainerPoint(start.getNorthWest()).y;
      if (top < START_PADDING) map.panBy([0, top - START_PADDING], { animate: false });   // (the base map's edge limits how far)
    }
  };
  // flying back to the start view: find where it is (the map is put back where it was), then fly there
  map.flyToStart = () => {
    const centre = map.getCenter(), zoom = map.getZoom();
    showStart();
    const target = { centre: map.getCenter(), zoom: map.getZoom() };
    map.setView(centre, zoom, { animate: false });
    map.flyTo(target.centre, target.zoom, { duration: 0.8 });
  };
  // the attribution sits top left: the legend strip covers the bottom of the map
  L.control.attribution({ position: 'topleft', prefix: false }).addTo(map);
  L.imageOverlay(ecoLayers.basemap.image, bounds, { attribution: ecoLayers.basemap.attribution, className: 'eco-basemap' }).addTo(map);
  L.polygon(aoiLatLngs(), { color: ecoColor('surface'), weight: 1.5, opacity: 0.9, fill: false, interactive: false }).addTo(map);
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
    map.setMinZoom(map.getBoundsZoom(bounds, !!(options && options.fillMap)));   // the level at which the whole base map just fits (or fills the frame)
    map.setMaxBounds(bounds);
    map.setMaxZoom(map.getBoundsZoom(aoi, false, L.point(2 * START_PADDING, 2 * START_PADDING + legendHeight())) + 4);
    showStart();
    const first = !fitted;
    fitted = true;
    if (options) {
      if (options.afterFit) options.afterFit(map, first);
    } else if (first) {
      renderAbout();   // related storms need the storm list, which has loaded by now
    }
  }).observe($(elementId));
  return map;
}

function setupMaps() {
  ecoMaps.layers = createMap('eco-map', 'eco-map-zoom-in', 'eco-map-zoom-out', 'eco-map-reset');
  renderLayerOverlay();
}

// The points map (points.js) is a flat picture (the base map) with dots placed in percent of the picture.
// #map is the whole picture, #map-view the window on it: layoutPointsMap() sizes and moves the picture so the AOI outline
// fills the window with START_PADDING px around it (the same start view as the Leaflet map). The outline is an SVG line.
// The picture is in the Mercator projection, so a latitude is first converted with mercatorY().
function mercatorY(latitude) { return Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)); }

// A longitude/latitude as percent of the base map picture: { left, top }.
function basemapPercent(lon, lat) {
  const b = ecoLayers.basemapBounds;
  const top = mercatorY(b.north);
  return {
    left: (lon - b.west) / (b.east - b.west) * 100,
    top: (top - mercatorY(lat)) / (top - mercatorY(b.south)) * 100
  };
}

// Where a point of points.js lies on the points map (percent of the picture).
function pointMapPosition(p) {
  if (!ecoLayers) return { left: p.leftPct, top: p.topPct };   // layers.json is still loading: drawn again when it is there
  return basemapPercent(p.lon, p.lat);
}

// Size and place the picture in its window: the outline fits with START_PADDING px on every side (never smaller than the window).
function layoutPointsMap() {
  const view = $('map-view');
  const w = view.clientWidth;
  const h = view.clientHeight;
  if (!w || !h) return;
  const b = ecoLayers.basemapBounds;
  const ratio = (mercatorY(b.north) - mercatorY(b.south)) / ((b.east - b.west) * Math.PI / 180);   // picture height / width
  const corners = ecoLayers.basemap.aoi.map(([lon, lat]) => basemapPercent(lon, lat));
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
  $('map-image').src = ecoLayers.basemap.image;
  const points = ecoLayers.basemap.aoi.map(([lon, lat]) => {
    const p = basemapPercent(lon, lat);
    return p.left.toFixed(3) + ',' + p.top.toFixed(3);
  }).join(' ');
  const svg = '<svg id="map-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<polygon points="' + points + '" fill="none" stroke="' + ecoColor('surface') + '" stroke-width="1.5" stroke-opacity="0.9" vector-effect="non-scaling-stroke"></polygon></svg>';
  map.insertAdjacentHTML('beforeend', svg);
  const credit = document.createElement('span');
  credit.id = 'map-attribution';
  credit.textContent = ecoLayers.basemap.attribution;
  $('map-view').appendChild(credit);
  // the window can only be measured when its card is on screen: place the picture whenever its size changes
  new ResizeObserver(layoutPointsMap).observe($('map-view'));
}

// ---------- section 1: the layers ----------

// The layer shown. A layer with "views" (layers.json) gets the fields of the chosen view (image, legend, about, ...) on top.
function currentLayer() {
  const layer = ecoLayers.layers.find((l) => l.id === ecoLayerId);
  if (!layer.views) return layer;
  const view = layer.views.find((v) => v.id === ecoViewIds[layer.id]) || layer.views[0];
  const merged = Object.assign({}, layer, view, { id: layer.id });
  // the chosen variant of the view (own image, legend, classes, ...; its "about" texts replace the same texts of the view)
  const variants = variantsOf(view);
  if (variants) {
    const { id, label, ...fields } = variants.find((v) => v.id === chosenVariantId(layer, view)) || variants[0];
    Object.assign(merged, fields, { about: Object.assign({}, view.about, fields.about) });
  }
  return merged;
}

// The variants of a view, or null: "variants" in layers.json (a year, a period), or Simplified | Detailed for a view
// with a "detailed" part (Change > Classes). A variant has an id, a label and the fields it replaces.
function variantsOf(view) {
  if (Array.isArray(view.variants)) return view.variants;
  if (!view.detailed) return null;
  return CONTENT.ecosystem.detailSwitch.map((item) => (item.id === 'detailed' ? Object.assign({}, view.detailed, item) : item));
}

// The key of the chosen variant: per view, or shared by the views with the same "variantGroup" (the storm of Disturbance & recovery).
function variantKey(layer, view) { return layer.id + '/' + (view.variantGroup || view.id); }

function chosenVariantId(layer, view) {
  const variants = variantsOf(view);
  return ecoVariantIds[variantKey(layer, view)] || view.defaultVariant || variants[0].id;
}

// Why a view cannot be shown for the chosen variant (e.g. no acute wetness for Opal): the text from layers.json "unavailable", or ''.
function viewUnavailable(layer, view) {
  const variants = variantsOf(view);
  const chosen = variants && variants.find((v) => v.id === chosenVariantId(layer, view));
  return (chosen && chosen.unavailable) || '';
}

// ---------- the Maps menu (card "Maps") ----------
// One tab per theme (content/ecosystem.json "mapMenu" groups) and under it one radio row per map of the active theme only.
// The rows name a layer (group id) and a view of it (layers.json). The variants of a view (year, period, Simplified |
// Detailed) are a small segmented control on the line of the selected row; the storm of Disturbance & recovery is one line
// under the tabs (it applies to its four maps). A tab selects the map last used in that theme (ecoViewIds). The chosen map is kept in ecoLayerId, ecoViewIds and ecoVariantIds, and in the address (#satellite/maps/<slug>).

function menuLayer(groupId) { return ecoLayers.layers.find((l) => l.id === groupId); }
function menuView(group, item) { return menuLayer(group.id).views.find((v) => v.id === item.view); }
function menuGroups() { return CONTENT.ecosystem.mapMenu.groups; }

// The group, layer, view and row of the map that is shown.
function currentMap() {
  const group = menuGroups().find((g) => g.id === ecoLayerId);
  const layer = menuLayer(group.id);
  const view = layer.views.find((v) => v.id === (ecoViewIds[layer.id] || layer.views[0].id));
  return { group: group, layer: layer, view: view, item: group.items.find((i) => i.view === view.id) };
}

// The title of the map card: "Change classes · Simplified", "Status · 2025", "Isidore 2002 · Damage classes".
function mapTitle() {
  const { group, layer, view, item } = currentMap();
  const variants = variantsOf(view);
  const chosen = variants && variants.find((v) => v.id === chosenVariantId(layer, view));
  if (!chosen) return item.label;
  return group.storm ? chosen.label + ' · ' + item.label : item.label + ' · ' + chosen.label;
}

// The address part of the map shown: "status-2025", "isidore-damage", "change-classes-detailed"
function mapSlug() {
  const { group, layer, view, item } = currentMap();
  if (group.storm) return chosenVariantId(layer, view) + '-' + item.slug;
  return item.slug + (variantsOf(view) ? '-' + chosenVariantId(layer, view) : '');
}

// The map named in the address (#satellite/maps/<slug>), or ''.
function mapSlugInAddress() { return location.hash.slice(1).split('/')[2] || ''; }

// Choose the map of an address part. Returns true when it was found (and is available); the caller draws.
function selectFromSlug(slug) {
  if (!slug) return false;
  for (const group of menuGroups()) {
    const layer = menuLayer(group.id);
    for (const item of group.items) {
      const view = menuView(group, item);
      const variants = variantsOf(view);
      let variantId = null;
      if (group.storm) {
        const storm = variants && variants.find((v) => slug === v.id + '-' + item.slug);
        if (!storm) continue;
        variantId = storm.id;
      } else if (slug !== item.slug) {
        const rest = slug.startsWith(item.slug + '-') ? slug.slice(item.slug.length + 1) : null;
        if (!rest || !variants || !variants.some((v) => v.id === rest)) continue;
        variantId = rest;
      }
      const key = variantKey(layer, view);
      const before = ecoVariantIds[key];
      if (variantId) ecoVariantIds[key] = variantId;
      if (viewUnavailable(layer, view)) { ecoVariantIds[key] = before; return false; }
      ecoLayerId = layer.id;
      ecoViewIds[layer.id] = view.id;
      return true;
    }
  }
  return false;
}

// Draw everything that depends on the chosen map, and put it in the address (replaceState: no hashchange, the page stays where it is).
// focus = the data-focus of the control that keeps the keyboard focus (the menu is drawn again).
function refreshMap(focus) {
  renderMapMenu(focus);
  renderLayer();
  renderLayerOverlay();
  history.replaceState(null, '', '#satellite/maps/' + mapSlug());
}

function selectMap(groupId, viewId, focus) {
  ecoLayerId = groupId;
  ecoViewIds[groupId] = viewId;
  refreshMap(focus);
}

// A small segmented control: an optional label and buttons with aria-pressed. items = [{ id, label }].
function menuSegment(label, items, activeId, focusKey, onPick) {
  const seg = document.createElement('div');
  seg.className = 'menu-seg';
  seg.setAttribute('role', 'group');
  if (label) {
    const name = document.createElement('span');
    name.className = 'menu-seg-label';
    name.textContent = label;
    seg.appendChild(name);
    seg.setAttribute('aria-label', label);
  }
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-seg-btn';
    button.textContent = item.label;
    button.dataset.focus = focusKey + '-' + item.id;
    button.setAttribute('aria-pressed', item.id === activeId);
    button.addEventListener('click', () => onPick(item.id, button.dataset.focus));
    seg.appendChild(button);
  });
  return seg;
}

// The theme tabs at the top of a map card (the Maps menu here, the theme tabs of the Stakeholder page): one button per item { id, label },
// the active one marked. onPick(id, focus) is called when a tab is clicked or reached with the arrow keys; focus = the
// data-focus of the tab, which keeps the keyboard focus when the menu is drawn again. Styles: .menu-tabs, .menu-tab (ecosystem.css).
function buildMenuTabs(items, activeId, onPick, ariaLabel) {
  const tabs = document.createElement('div');
  tabs.className = 'menu-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', ariaLabel);
  items.forEach((item, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'menu-tab';
    tab.textContent = item.label;
    tab.dataset.focus = 'tab-' + item.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', item.id === activeId);
    tab.tabIndex = item.id === activeId ? 0 : -1;   // one tab stop; the arrow keys move between the tabs
    tab.addEventListener('click', () => onPick(item.id, tab.dataset.focus));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      tabs.children[(i + step + items.length) % items.length].click();   // arrow keys switch the tab
    });
    tabs.appendChild(tab);
  });
  return tabs;
}

// The menu at the top of the map card. Row 1: the theme tabs. Row 2: the maps of the active theme as small tabs, with at the end
// the variant switch of the selected map (for Disturbance & recovery the storm choice, which applies to all maps of the theme).
// focus = the data-focus of the control that keeps the keyboard focus after the menu is drawn again.
function renderMapMenu(focus) {
  const box = $('eco-map-menu');
  box.innerHTML = '';
  const groups = menuGroups();
  const group = groups.find((g) => g.id === ecoLayerId);
  const layer = menuLayer(group.id);

  // row 1, the tabs: one per theme; a tab shows the map last used in that theme (the first one the first time)
  box.appendChild(buildMenuTabs(groups, group.id, (id, focus) => selectMap(id, ecoViewIds[id] || groups.find((g) => g.id === id).items[0].view, focus), CONTENT.ecosystem.texts.menuTitle));

  // row 2: the maps of the theme: one radio group
  const maps = document.createElement('div');
  maps.className = 'menu-maps';
  const list = document.createElement('div');
  list.className = 'menu-map-list';
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', group.label);
  const rows = [];   // for the arrow keys
  const currentViewId = ecoViewIds[layer.id] || layer.views[0].id;
  let selectedView = null;
  group.items.forEach((item) => {
    const view = menuView(group, item);
    const selected = view.id === currentViewId;
    if (selected) selectedView = view;
    const unavailable = viewUnavailable(layer, view);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'menu-map' + (selected ? ' selected' : '');
    row.textContent = item.label;
    row.dataset.focus = 'row-' + group.id + '-' + item.view;
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', selected);
    row.tabIndex = selected ? 0 : -1;   // one tab stop for the group; the arrow keys move inside it
    if (unavailable) { row.disabled = true; row.title = unavailable; }   // greyed out with the reason as tooltip
    row.addEventListener('click', () => selectMap(group.id, item.view, row.dataset.focus));
    row.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const enabled = rows.filter((r) => !r.disabled);
      enabled[(enabled.indexOf(row) + step + enabled.length) % enabled.length].click();   // arrow keys select, like a native radio group
    });
    rows.push(row);
    list.appendChild(row);
  });
  maps.appendChild(list);

  // at the end of row 2: the storm choice (whole theme), or the variants of the selected map
  if (group.storm) {
    const stormView = layer.views.find((v) => v.id === group.storm.view);
    maps.appendChild(menuSegment(group.storm.label + ':', variantsOf(stormView), chosenVariantId(layer, stormView), 'storm', (id, key) => {
      ecoVariantIds[variantKey(layer, stormView)] = id;
      // a map that does not exist for this storm (Acute wetness for Opal): back to the first map of the theme
      const current = layer.views.find((v) => v.id === (ecoViewIds[layer.id] || layer.views[0].id));
      if (viewUnavailable(layer, current)) ecoViewIds[layer.id] = layer.views[0].id;
      refreshMap(key);
    }));
  } else {
    const variants = selectedView && variantsOf(selectedView);
    if (variants) {
      maps.appendChild(menuSegment('', variants, chosenVariantId(layer, selectedView), 'variant', (id, key) => {
        ecoVariantIds[variantKey(layer, selectedView)] = id;
        refreshMap(key);
      }));
    }
  }
  box.appendChild(maps);

  if (focus) {
    const target = [...box.querySelectorAll('[data-focus]')].find((el) => el.dataset.focus === focus);
    if (target) target.focus();
  }
}

// Two chips (Black and white | Colour) under a map: the visitor chooses how the base map looks. The class
// "basemap-bw" on the map element turns its base map black and white (css/ecosystem.css).
function setupBasemapSwitch(boxId, mapId, blackAndWhite) {
  const box = $(boxId);
  const map = $(mapId);
  if (!box || !map) return;
  const tx = CONTENT.ecosystem.texts;
  const draw = () => {
    map.classList.toggle('basemap-bw', blackAndWhite);
    box.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'label-xs';
    label.textContent = tx.basemap;
    box.appendChild(label);
    [[true, tx.basemapBw], [false, tx.basemapColour]].forEach(([bw, text]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'layer-chip' + (bw === blackAndWhite ? ' on' : '');
      chip.textContent = text;
      chip.setAttribute('aria-pressed', bw === blackAndWhite);
      chip.addEventListener('click', () => { blackAndWhite = bw; draw(); });
      box.appendChild(chip);
    });
  };
  draw();
}

// One button next to the zoom buttons of the Mangrove maps map: pressed = the base map is black and white.
function setupBasemapButton(buttonId, mapId, blackAndWhite) {
  const button = $(buttonId);
  const map = $(mapId);
  if (!button || !map) return;
  button.textContent = CONTENT.ecosystem.texts.basemapBw;
  const draw = () => {
    map.classList.toggle('basemap-bw', blackAndWhite);
    button.classList.toggle('on', blackAndWhite);
    button.setAttribute('aria-pressed', blackAndWhite);
  };
  button.addEventListener('click', () => { blackAndWhite = !blackAndWhite; draw(); });
  draw();
}

function setupOpacity() {
  const slider = $('eco-opacity');
  slider.value = CONTENT.ecosystem.defaultOpacity;
  const apply = () => {
    setText('eco-opacity-value', slider.value + ' %');
    if (ecoOverlay) ecoOverlay.setOpacity(slider.value / 100);
  };
  slider.addEventListener('input', apply);
  apply();
}

// The layer image on the map, or the calm message when the layer has no image yet.
function renderLayerOverlay() {
  const layer = currentLayer();
  if (!ecoMaps.layers) return;
  if (ecoOverlay) { ecoMaps.layers.removeLayer(ecoOverlay); ecoOverlay = null; }
  const message = $('eco-map-message');
  message.hidden = !!layer.image;
  message.innerHTML = '<span></span>';
  message.firstChild.textContent = vt('mapNotAvailable');
  if (!layer.image) return;
  const b = layer.bounds || ecoLayers.layerBounds;
  ecoOverlay = L.imageOverlay(layer.image, L.latLngBounds([b.south, b.west], [b.north, b.east]), { opacity: $('eco-opacity').value / 100, className: 'pixel-layer' }).addTo(ecoMaps.layers);   // pixel-layer: sharp blocks, see ecosystem.css
  // an image that cannot be loaded shows the same message
  ecoOverlay.on('error', () => { message.hidden = false; });
}

// Title, legend strip and "About this layer" of the current layer.
function renderLayer() {
  const layer = currentLayer();
  setText('eco-map-title', mapTitle());
  setText('eco-map-label', layer.mapLabel || '');
  $('eco-map-label').hidden = !layer.mapLabel;
  showPlaceholderTag($('eco-map-title').parentElement, layer.placeholder);
  renderLegend(layer.legend);
  renderAbout();
}

function renderLegend(legend) {
  const box = $('eco-legend');
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
    grid.style.gridTemplateColumns = 'auto repeat(' + legend.steps.length + ', 62px)';
    box.appendChild(grid);
    if (isFilled(legend.note)) {
      const note = document.createElement('span');
      note.className = 'legend-note';
      note.textContent = legend.note;
      box.appendChild(note);
    }
  } else if (legend.type === 'gradient' && isFinite(legend.min)) {
    box.appendChild(gradientLegend(legend));
  } else if (legend.type === 'gradient') {
    // low label, a bar from the first to the last color, high label
    const low = document.createElement('span');
    low.className = 'lg';
    low.textContent = legend.low;
    const bar = document.createElement('span');
    bar.className = 'gradient-bar';
    bar.style.background = 'linear-gradient(to right, ' + legend.colors.map(ecoColor).join(', ') + ')';
    const high = document.createElement('span');
    high.className = 'lg';
    high.textContent = legend.high;
    box.append(low, bar, high);
  } else {
    legend.items.forEach((item) => box.appendChild(legendItem(item.label, ecoColor(item.color))));
  }
}

// A bar from the first to the last color with three labels under it: left, middle and right (with the values at the ends).
// Used in the legend strip and in "How to read the colors" of About this layer.
function gradientLegend(legend) {
  // a + sign only for a scale that has negative values (dNDVI, trend), not for NDVI itself
  const signed = (v) => (legend.min < 0 ? (v > 0 ? '+' : v < 0 ? '−' : '') : '') + Math.abs(v);
  const wrap = document.createElement('span');
  wrap.className = 'gradient-wrap';
  const bar = document.createElement('span');
  bar.className = 'gradient-bar';
  bar.style.background = 'linear-gradient(to right, ' + legend.colors.map(ecoColor).join(', ') + ')';
  const labels = document.createElement('span');
  labels.className = 'gradient-labels';
  [signed(legend.min) + ' ' + legend.low, legend.mid, legend.high + ' ' + signed(legend.max)].filter(isFilled).forEach((text) => {
    const label = document.createElement('span');
    label.textContent = text;
    labels.appendChild(label);
  });
  wrap.append(bar, labels);
  return wrap;
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
  const body = $('eco-about-body');
  body.innerHTML = '';
  showPlaceholderTag($('eco-about-title').parentElement, layer.placeholder);

  body.appendChild(aboutBlock(vt('aboutShows'), aboutText(layer.about.shows)));
  body.appendChild(aboutBlock(vt('aboutComputed'), aboutText(layer.about.computed)));

  // how to read the colors: one color block per class (the per-period view lists its periods instead)
  const colors = document.createElement('div');
  colors.className = 'about-legend';
  if (layer.legend.type !== 'gradient') layer.classes.forEach((c) => colors.appendChild(legendItem(c.label, ecoColor(c.color))));
  if (layer.legend.type === 'gradient' && isFinite(layer.legend.min)) colors.appendChild(gradientLegend(layer.legend));
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
  if (isFilled(layer.about.note)) {                                                       // a note that is always visible (Condition > Status)
    const note = aboutText(layer.about.note);
    note.classList.add('about-note');
    colors.appendChild(note);
  }
  if (isFilled(layer.about.stats)) {                                                      // a short line with numbers (Condition > Canopy density)
    const stats = aboutText(layer.about.stats);
    stats.classList.add('about-note');
    colors.appendChild(stats);
  }
  body.appendChild(aboutBlock(vt('aboutColors'), colors));

  renderChartCard(layer);

  // share of area per class: the hectares as stored and their share of the total (one decimal), or "No data"
  if (layer.classes.length) {
  const shares = document.createElement('div');
  // "totalHa" (layers.json): the same total for the simplified and the detailed version, so the shares can be compared
  const totalHa = isNumber(layer.totalHa) ? layer.totalHa : layer.classes.reduce((sum, c) => sum + (isNumber(c.ha) ? c.ha : 0), 0);
  layer.classes.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'value-row';
    row.innerHTML = '<span class="name"><span class="lg-dot"></span><span class="class-name"></span></span><span class="val"></span>';
    row.querySelector('.lg-dot').style.background = ecoColor(c.color);
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
    link.className = 'eco-link';
    link.href = '#climatology';
    link.innerHTML = '<span></span><svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    link.firstChild.textContent = vt('relatedStormsLink');
    block.appendChild(link);
    body.appendChild(block);
  }
}

// The separate card under "About this layer": grouped bars of confirmed loss and gain per period (per-period view),
// with a small toggle per year | total. Hidden when the view has no chart. Drawn with the parts of charts.js; the hover
// values come from the comparison line. The bar colors are the darkest colors of the legend rows.
function renderChartCard(layer) {
  const card = document.querySelector('[data-card="eco-chart"]');
  const chart = layer.about.chart;
  card.hidden = !chart;
  if (!chart) return;
  setText('eco-chart-title', chart.title);
  showPlaceholderTag($('eco-chart-title').parentElement, chart.placeholder);
  $('eco-chart-toggle').hidden = chart.type === 'line';   // the per year | total toggle belongs to the bar chart
  if (chart.type === 'line') { renderLineChart(chart); return; }

  const modes = CONTENT.ecosystem.chartModes;
  const mode = modes.find((m) => m.id === ecoBarMode) || modes[0];
  const toggle = $('eco-chart-toggle');
  toggle.innerHTML = '';
  modes.forEach((m) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'layer-chip' + (m.id === mode.id ? ' on' : '');
    chip.textContent = m.label;
    chip.setAttribute('aria-pressed', m.id === mode.id);
    chip.addEventListener('click', () => { ecoBarMode = m.id; renderChartCard(currentLayer()); });
    toggle.appendChild(chip);
  });

  // two series: loss and gain (the darkest color of each legend row)
  const periods = chart.periods || [];
  const keys = mode.id === 'perYear' ? ['lossHaPerYr', 'gainHaPerYr'] : ['lossHa', 'gainHa'];
  // the bars use the darkest color of the last confirmed period (the provisional period has its own, lighter color below)
  const steps = layer.legend.steps;
  const confirmedAt = steps.reduce((last, st, n) => (st.provisional ? last : n), 0);
  const series = layer.legend.rows.map((row, k) => ({ label: row.label, color: row.colors[confirmedAt], values: periods.map((p) => p[keys[k]]) }));
  // the totals are stacked bars (loss, gain, then the provisional loss and gain of the last period in a lighter color of
  // the same row); "per year" stays two bars side by side, as the provisional values have no rate
  const stacked = mode.id === 'total';
  if (stacked && periods.some((p) => isNumber(p.lossProvHa) || isNumber(p.gainProvHa))) {
    layer.legend.rows.forEach((row, k) => series.push({
      label: row.label + ' (' + CONTENT.ecosystem.texts.provisional + ')', color: row.colors[1],
      values: periods.map((p) => p[['lossProvHa', 'gainProvHa'][k]]) }));
  }
  // the top of each segment of a stacked bar: the sum of its own value and all the segments under it
  const tops = series.map((s, k) => s.values.map((val, i) => (isNumber(val)
    ? series.slice(0, k + 1).reduce((sum, o) => sum + (isNumber(o.values[i]) ? o.values[i] : 0), 0) : null)));
  const known = knownValues([].concat(...(stacked ? tops : series.map((s) => s.values))));
  const body = $('eco-chart-body');
  body.innerHTML = '';
  ecoBarSet = null;
  if (!known.length) {
    body.appendChild(ecoChartRow(mode.unit, chartNoData(chartHead({ label: chart.title }, [], 'chart'))));
  } else {
    const n = periods.length;
    const x = pointXScale(n);   // one group of bars per period, evenly spaced
    const scale = chartScale(known, true);
    const barWidth = (PLOT.right - PLOT.left) / n * (stacked ? 0.55 : 0.28);
    let svg = chartHead({ label: chart.title }, [], 'chart') + chartYAxis(scale.t, scale.yOf, true);
    const zeroY = scale.yOf(0);
    // stacked: one bar per period, every segment on top of the one before; side by side: loss left, gain right
    if (stacked) series.forEach((s, k) => s.values.forEach((val, i) => {
      if (!isNumber(val) || val <= 0) return;
      const top = scale.yOf(tops[k][i]);
      svg += '<rect x="' + (x.xOf(i) - barWidth / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + (scale.yOf(tops[k][i] - val) - top).toFixed(1) + '" fill="' + ecoColor(s.color) + '"></rect>';
    }));
    else series.forEach((s, k) => s.values.forEach((val, i) => {
      if (!isNumber(val)) return;
      const left = x.xOf(i) + (k === 0 ? -barWidth - 1 : 1);
      const top = Math.min(zeroY, scale.yOf(val));
      svg += '<rect x="' + left.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + Math.abs(zeroY - scale.yOf(val)).toFixed(1) + '" fill="' + ecoColor(s.color) + '"></rect>';
    }));
    body.appendChild(ecoChartRow(mode.unit, svg + '</svg>'));
    body.appendChild(sharedAxis(periods.map((p, i) => ({ x: x.xOf(i), text: p.label })), ''));
    body.insertAdjacentHTML('beforeend', '<div class="comparison" hidden></div>');
    // the comparison line snaps to periods and shows loss and gain
    ecoBarSet = {
      count: n, xOf: x.xOf, indexAt: x.indexAt, label: (i) => periods[i].label + ' (' + periods[i].range + ')',
      panels: [{ yOf: scale.yOf, points: (i) => series.map((s, k) => ({ value: stacked ? tops[k][i] : s.values[i], color: ecoColor(s.color), text: s.label + ' ' + formatLike(s.values[i], s.values) + ' ' + mode.unit })) }]
    };
  }

  const legend = $('eco-chart-legend');
  legend.innerHTML = '';
  series.forEach((s) => legend.appendChild(legendItem(s.label, ecoColor(s.color))));

  renderChartNote(chart);
}

// The note under the chart; a word in it (e.g. "Isidore") can link to that storm on the Climatology page.
function renderChartNote(chart) {
  const note = $('eco-chart-note');
  note.textContent = '';
  const link = chart.noteLink;
  const storm = link && (typeof events !== 'undefined' ? events : []).find((e) => e.id === link.storm);
  const at = link ? chart.note.indexOf(link.text) : -1;
  if (storm && at >= 0) {
    const a = document.createElement('a');
    a.className = 'eco-link-inline';
    a.href = '#climatology';
    a.textContent = link.text;
    a.addEventListener('click', () => { if (selectedEventId !== storm.id) selectEvent(storm.id); });
    note.append(chart.note.slice(0, at), a, chart.note.slice(at + link.text.length));
  } else {
    note.textContent = chart.note;
  }
}

// A line chart of the card (Disturbance & recovery > Isidore): one line per series, one value per year, evenly spaced,
// with a dashed vertical line at chart.marker.year. All numbers come from layers.json ("about.chart"). The hover values
// come from the comparison line, as for the bar chart.
function renderLineChart(chart) {
  const years = chart.years;
  const body = $('eco-chart-body');
  body.innerHTML = '';
  ecoBarSet = null;
  const known = knownValues([].concat(...chart.series.map((s) => s.values)));
  if (!known.length) {
    body.appendChild(ecoChartRow(chart.unit, chartNoData(chartHead({ label: chart.title }, [], 'chart'))));
  } else {
    const x = pointXScale(years.length);
    const scale = chartScale(known, false);
    const gridX = years.map((y, i) => x.xOf(i));
    let svg = chartHead({ label: chart.title }, gridX, 'chart') + chartYAxis(scale.t, scale.yOf, true);
    chart.series.forEach((s) => {
      segmentsOf(s.values).forEach((seg) => {
        if (seg.length === 1) svg += '<circle cx="' + x.xOf(seg[0].i).toFixed(1) + '" cy="' + scale.yOf(seg[0].val).toFixed(1) + '" r="2" fill="' + ecoColor(s.color) + '"></circle>';
        else svg += '<polyline points="' + seg.map((pt) => x.xOf(pt.i).toFixed(1) + ',' + scale.yOf(pt.val).toFixed(1)).join(' ') + '" fill="none" stroke="' + ecoColor(s.color) + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></polyline>';
      });
    });
    // the dashed line at the storm year, with its name at the top
    const at = years.indexOf(chart.marker.year);
    if (at >= 0) {
      const mx = x.xOf(at).toFixed(1);
      svg += '<line x1="' + mx + '" y1="' + PLOT.top + '" x2="' + mx + '" y2="' + PLOT.bottom + '" stroke="' + color('--color-breakpoint') + '" stroke-width="1.5" stroke-dasharray="4,4"></line>' +
        '<text class="plot-tick-label" x="' + (Number(mx) + 4) + '" y="' + (PLOT.top + 10) + '">' + escapeHtml(chart.marker.label) + '</text>';
    }
    body.appendChild(ecoChartRow(chart.unit, svg + '</svg>'));
    body.appendChild(sharedAxis(years.map((y, i) => ({ x: x.xOf(i), text: String(y) })), t('labels.year')));
    body.insertAdjacentHTML('beforeend', '<div class="comparison" hidden></div>');
    ecoBarSet = {
      count: years.length, xOf: x.xOf, indexAt: x.indexAt, label: (i) => String(years[i]),
      panels: [{ yOf: scale.yOf, points: (i) => chart.series.map((s) => ({ value: s.values[i], color: ecoColor(s.color), text: s.label + ' ' + formatLike(s.values[i], s.values) })) }]
    };
  }
  const legend = $('eco-chart-legend');
  legend.innerHTML = '';
  chart.series.forEach((s) => legend.appendChild(legendItem(s.label, ecoColor(s.color))));
  renderChartNote(chart);
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
  const s = ecoLayers.source;
  const box = $('eco-source-body');
  box.innerHTML = '';
  showPlaceholderTag($('eco-source-title').parentElement, s.placeholder);
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
// renderEcosystemEws(point). The charts are drawn like the NDVI chart of points.js: same x scale (pointXScale),
// same year ticks, same grid and axis parts of charts.js.


// The intros with {total} and {featured} (content/pages.json) get the number of points of data/points.json and the
// number of clickable points of content/featured-points.json (both loaded by points.js).
function fillEcosystemIntros() {
  const total = typeof allPoints !== 'undefined' ? allPoints.length : 0;
  if (!total) return;
  const featured = typeof FEATURED !== 'undefined' ? Object.keys(FEATURED).length : 0;
  ['intro-page-satellite', 'intro-ndvi', 'intro-tipping'].forEach((id) => {
    const intro = $(id);
    if (intro && intro.dataset.template) intro.textContent = intro.dataset.template.split('{total}').join(total).split('{featured}').join(featured);
  });
}

// One chart like the NDVI chart: grid with the year ticks, y axis, and the line (broken where a month has no value).
// Returns the SVG text and what the comparison line needs ({ yOf, points }, null without values).
function ecoEwsChartSvg(label, values, colorValue, gridX, x, clipId) {
  const head = chartHead({ label: label }, gridX, 'chart');
  const known = knownValues(values);
  if (!known.length) return { svg: chartNoData(head), panel: null };
  const scale = chartScale(known, false);
  let svg = head + chartYAxis(scale.t, scale.yOf, true);
  svg += '<defs><clipPath id="' + clipId + '"><rect x="' + PLOT.left + '" y="' + PLOT.top + '" width="' + (PLOT.right - PLOT.left) + '" height="' + (PLOT.bottom - PLOT.top) + '"></rect></clipPath></defs><g clip-path="url(#' + clipId + ')">';
  segmentsOf(values).forEach((seg) => {
    if (seg.length === 1) svg += '<circle cx="' + x.xOf(seg[0].i).toFixed(1) + '" cy="' + scale.yOf(seg[0].val).toFixed(1) + '" r="1.8" fill="' + colorValue + '"></circle>';
    else svg += '<polyline points="' + seg.map((pt) => x.xOf(pt.i).toFixed(1) + ',' + scale.yOf(pt.val).toFixed(1)).join(' ') + '" fill="none" stroke="' + colorValue + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></polyline>';
  });
  // what the comparison line shows at month i: "AR1 0.42"
  const points = (i) => [{ value: values[i], color: colorValue, text: label + ' ' + formatLike(values[i], values) }];
  return { svg: svg + '</g></svg>', panel: { yOf: scale.yOf, points: points } };
}

// A chart row like the others: the name on the left, the plot.
function ecoChartRow(label, svg) {
  const row = document.createElement('div');
  row.className = 'anomaly-chart';
  row.innerHTML = '<div class="anomaly-label"><span class="anomaly-name"></span></div><div class="anomaly-plot">' + svg + '</div>';
  row.querySelector('.anomaly-name').textContent = label;
  return row;
}

// The early warning signals of a point: its "ews" in data/points.json (loaded by points.js), or null.
// Used by the Early warning signals cards (ecosystem.js).
function ewsEntryFor(point) {
  return point && point.ews ? point.ews : null;
}

// The message of a point without EWS charts (content/texts.json), by its "ews.status" in data/points.json:
// noBreakpoint (a control), tooShort, tooInterpolated or notAnalysed. A point that is missing from the file, or a file
// without "status" (not exported yet by export_points.py), gets "not available yet".
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
function renderEcosystemEws(point) {
  if (!ecoLoaded) return;   // the data of these cards is still loading: setupEcosystem draws them once it is there
  fillEcosystemIntros();
  const verdictBox = $('ews-verdict-body');
  const box = $('ews-plots-charts');
  verdictBox.innerHTML = '';
  box.innerHTML = '';
  ecoEwsSet = null;
  const entry = ewsEntryFor(point);
  renderEwsGuide(entry);   // "How to read this": for every point, also without a selected point
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

  const panels = [];
  CONTENT.ecosystem.ewsCharts.forEach((c) => {
    const data = entry && entry.metrics ? entry.metrics[c.id] : null;
    const drawn = data ? ecoEwsChartSvg(c.label, onTimeline(data.values), ecoColor(c.color), gridX, x, 'eco-clip-' + c.id)
      : { svg: chartNoData(chartHead({ label: c.label }, gridX, 'chart')), panel: null };
    box.appendChild(ecoChartRow(c.label, data ? drawn.svg.replace('</svg>', lossLine + '</svg>') : drawn.svg));
    panels.push(drawn.panel);
  });
  if (dates.length) {
    box.appendChild(sharedAxis(ticks, t('labels.year')));
    box.insertAdjacentHTML('beforeend', '<div class="comparison" hidden></div>');
    // the comparison line snaps to months, as on the point chart
    ecoEwsSet = { count: dates.length, xOf: x.xOf, indexAt: x.indexAt, label: (i) => pointMonthLabel(dates[i]), panels: panels };
  }
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

// The metrics of the table (content/ecosystem.json "ewsMetrics") with their data
function ewsMetricRows(entry) {
  return (CONTENT.ecosystem.ewsMetrics || []).map((m) => ({ m: m, data: entry.metrics ? entry.metrics[m.id] : null }));
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
  block.innerHTML = '<div class="ews-verdict ' + verdict + '"></div><div class="ews-reason"></div><div class="ews-rule"></div><div class="ews-basis"></div>';
  block.querySelector('.ews-verdict').textContent = t(verdict === 'ews' ? 'messages.ewsVerdictYes' : 'messages.ewsVerdictNo');
  block.querySelector('.ews-reason').textContent = reason ? reason.charAt(0).toUpperCase() + reason.slice(1) + '.' : '';
  block.querySelector('.ews-rule').textContent = t('messages.ewsRule', { metrics: names(inVerdict), alpha: alpha });
  // the scientific basis of the rule, with links to the papers (content/texts.json "references")
  fillWithReferences(block.querySelector('.ews-basis'), t('messages.ewsBasis'));

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

// ---------- "How to read this" (card ews-guide) ----------
// General explanation from content/texts.json "ewsGuide": groups with a title and a list of items (or one text),
// each group a <details> that is closed at the start. It is built once, so a group the visitor opened stays open
// when another point is selected; only the window size is updated: {window} becomes the rolling window of the
// selected point ("windowMonths" in its "ews", set by the EWS notebook), or a general text without one.
function renderEwsGuide(entry) {
  const body = $('ews-guide-body');
  const guide = CONTENT.texts.ewsGuide || {};
  if (!body.children.length) {
    (guide.groups || []).forEach((g) => {
      const group = document.createElement('details');
      group.className = 'ews-guide-group';
      const summary = document.createElement('summary');
      summary.textContent = g.title;
      group.appendChild(summary);
      // a text with {window} gets a <span> for the window size, so that only that span changes later
      const withWindow = (text, el) => {
        const [before, after] = String(text).split('{window}');
        el.appendChild(document.createTextNode(before));
        if (after !== undefined) {
          const span = document.createElement('span');
          span.className = 'ews-guide-window';
          el.appendChild(span);
          el.appendChild(document.createTextNode(after));
        }
      };
      if (Array.isArray(g.items)) {
        const list = document.createElement('ul');
        g.items.forEach((item) => { const li = document.createElement('li'); withWindow(item, li); list.appendChild(li); });
        group.appendChild(list);
      }
      if (g.text) { const p = document.createElement('p'); withWindow(g.text, p); group.appendChild(p); }
      // "Sources": the full references (content/texts.json "references"), each with its DOI link
      if (Array.isArray(g.sources) && g.sources.length) {
        const sources = document.createElement('div');
        sources.className = 'ews-guide-sources';
        const label = document.createElement('div');
        label.className = 'ews-guide-sources-label';
        label.textContent = guide.sourcesLabel || '';
        sources.appendChild(label);
        g.sources.forEach((key) => {
          const ref = (CONTENT.texts.references || {})[key];
          if (!ref) return;
          const line = document.createElement('p');
          line.appendChild(document.createTextNode(ref.full + ' '));
          if (ref.doi) line.appendChild(referenceLink(ref, 'https://doi.org/' + ref.doi));
          sources.appendChild(line);
        });
        group.appendChild(sources);
      }
      body.appendChild(group);
    });
  }
  const months = entry && isNumber(entry.windowMonths) ? entry.windowMonths : null;
  const windowText = months !== null ? t('ewsGuide.windowMonths', { months: months }) : t('ewsGuide.windowGeneral');
  body.querySelectorAll('.ews-guide-window').forEach((span) => { span.textContent = windowText; });
}

// ---------- references (content/texts.json "references") ----------

// A link to a paper that opens in a new tab; the text is "text", or the DOI link itself.
function referenceLink(ref, text) {
  const a = document.createElement('a');
  a.href = 'https://doi.org/' + ref.doi;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  return a;
}

// Fills an element with a text in which {key} stands for a reference: "Based on {dakos2012} and {martinez2024}."
// Each {key} becomes the short name of that reference, as a link to its DOI (or plain text when it has no DOI).
function fillWithReferences(el, text) {
  const refs = CONTENT.texts.references || {};
  el.textContent = '';
  String(text).split(/(\{[a-zA-Z0-9]+\})/).forEach((piece) => {
    const ref = piece.startsWith('{') ? refs[piece.slice(1, -1)] : null;
    if (!ref) el.appendChild(document.createTextNode(piece));
    else if (ref.doi) el.appendChild(referenceLink(ref, ref.short));
    else el.appendChild(document.createTextNode(ref.short));
  });
}
