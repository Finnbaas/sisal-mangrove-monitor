// stakeholders.js: the Stakeholder screen.
//   The areas where stakeholders saw mangrove change, on the map image of the selected year; one slider
//   that is also the time axis of the observation bars; and what stakeholders said about the selected area.
// Reads: content/stakeholders.json (written by the team) and the map images in data/stakeholder-imagery/.
// Uses: helpers.js, content.js. Used by: main.js (setupStakeholders).

const STAKEHOLDER_FILE = 'content/stakeholders.json';

let stakeholders = null;     // contents of content/stakeholders.json, or null if it could not be loaded
let shYear = null;           // the selected year; null means "All years" (the landing view)
let shArea = null;           // number of the selected area; null means no area selected
let shEntry = 0;             // which observation of the selected area the panel shows (0 = the first)
const shImageExists = {};    // remembers per year whether its map image exists (true / false)

// ---------- loading and checking ----------

async function loadStakeholders() {
  try {
    let response;
    try {
      response = await fetch(STAKEHOLDER_FILE);
    } catch (err) {
      throw new ContentError(STAKEHOLDER_FILE, 'the file could not be loaded (' + err.message + ').');
    }
    if (!response.ok) throw new ContentError(STAKEHOLDER_FILE, 'the file could not be loaded (HTTP ' + response.status + ').');
    const content = parseJsonFile(await response.text(), STAKEHOLDER_FILE);
    checkStakeholders(content);
    stakeholders = content;
  } catch (err) {
    // a problem in this file only affects the Stakeholder page: the message names the file
    $('sh-status').textContent = t('messages.couldNotLoadStakeholders', { error: err.message });
    console.error(err);
  }
  renderStakeholders();
}

// Checks that the file has the parts this screen needs. Entries that cannot be shown are left out
// (with a warning in the browser console), so one wrong entry does not hide the rest.
function checkStakeholders(content) {
  const fail = (problem) => { throw new ContentError(STAKEHOLDER_FILE, problem); };
  if (!content || !Array.isArray(content.areas)) fail('"areas" must be a list.');
  if (!Array.isArray(content.observations)) fail('"observations" must be a list.');
  let skipped = 0;
  const warn = (text) => { skipped++; console.warn(STAKEHOLDER_FILE + ': ' + text); };

  content.areas = content.areas.filter((a) => {
    const s = a && a.shape;
    const ok = a && a.number !== undefined && s && [s.leftPct, s.topPct, s.widthPct, s.heightPct].every((n) => typeof n === 'number');
    if (!ok) warn('an area without a "number" or a complete "shape" is not shown.');
    return ok;
  });
  content.observations = content.observations.filter((o) => {
    if (!o || typeof o.startYear !== 'number') { warn('an observation without a "startYear" is not shown.'); return false; }
    if (!content.areas.some((a) => a.number === o.area)) { warn('an observation refers to area ' + o.area + ', which does not exist; it is not shown.'); return false; }
    return true;
  });
  // tell the team on the page that something was left out (the details are in the browser console)
  if (skipped > 0) $('sh-status').textContent = t('messages.stakeholderEntriesSkipped', { count: skipped });
}

function setupStakeholders() {
  const slider = $('sh-slider');
  slider.min = YEAR_MIN;
  slider.max = YEAR_MAX;
  slider.value = YEAR_MAX;

  // moving the handle or using the arrows shows one year; the All years button switches back
  slider.addEventListener('input', () => setStakeholderYear(parseInt(slider.value, 10)));
  $('sh-year-back').addEventListener('click', () => setStakeholderYear(parseInt(slider.value, 10) - 1));
  $('sh-year-forward').addEventListener('click', () => setStakeholderYear(parseInt(slider.value, 10) + 1));
  $('sh-all-years').addEventListener('click', () => setStakeholderYear(shYear === null ? parseInt(slider.value, 10) : null));

  // clicking an area on the map or one of its bars selects that area (clicking it again deselects)
  const clickArea = (e) => {
    const el = e.target.closest('[data-area]');
    if (el) selectStakeholderArea(Number(el.dataset.area));
  };
  $('sh-areas').addEventListener('click', clickArea);
  $('sh-rows').addEventListener('click', clickArea);

  // the Observation 1 of 2 arrows in the panel
  $('sh-panel-content').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-entry-step]');
    if (!btn) return;
    shEntry += Number(btn.dataset.entryStep);
    renderStakeholderPanel();
  });

  renderTrackYears();
  renderCertaintyLegend();
  loadStakeholders();
}

// ---------- small helpers ----------

function areaByNumber(number) {
  return stakeholders.areas.find((a) => a.number === number);
}

// Label and colors of an area's class (the same change classes as the Vegetation page).
function areaClass(area) {
  const cls = CLASSES[area.class] || UNKNOWN;
  // "--c" is the class color and "--c-tint" its light background (see css/stakeholders.css)
  return { label: cls.label, style: '--c: var(' + cls.colorVar + '); --c-tint: var(' + cls.colorVar + '-tint, var(--color-surface-subtle));' };
}

// The observations, oldest first.
function sortedObservations() {
  return [...stakeholders.observations].sort((a, b) => a.startYear - b.startYear);
}

// The last year of an observation. An ongoing observation counts up to today (the last year of the range).
function observationEnd(o) {
  return (o.ongoing || typeof o.endYear !== 'number') ? YEAR_MAX : o.endYear;
}

// Is this observation happening in the selected year? In "All years" every observation counts.
function observationActive(o) {
  return shYear === null || (o.startYear <= shYear && shYear <= observationEnd(o));
}

// How the bar is drawn: "expected", "ongoing", "approximate" or "exact".
function observationStyle(o) {
  if (o.certainty === 'expected') return 'expected';
  if (o.ongoing) return 'ongoing';
  return o.certainty === 'approximate' ? 'approximate' : 'exact';
}

// "1988–1990", "1988" or "2005–today": made from the years, for the hover text of a bar.
function observationYears(o) {
  if (o.ongoing) return o.startYear + '–' + t('labels.today');
  const end = observationEnd(o);
  return end === o.startYear ? String(o.startYear) : o.startYear + '–' + end;
}

// Position of a year on the track and on the bars, in percent of their shared width.
function yearPct(year) {
  const pct = (year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN) * 100;
  return Math.min(100, Math.max(0, pct));
}

// ---------- changing the year and the selection ----------

function setStakeholderYear(year) {
  if (year !== null) {
    year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
    $('sh-slider').value = year;
  }
  shYear = year;
  shEntry = 0;
  // an area that has no observation in the new year is no longer on the map, so it cannot stay selected
  if (stakeholders && shArea !== null && !stakeholders.observations.some((o) => o.area === shArea && observationActive(o))) shArea = null;
  renderStakeholders();
}

function selectStakeholderArea(number) {
  shArea = shArea === number ? null : number;
  shEntry = 0;
  renderStakeholders();
}

// ---------- drawing ----------

function renderStakeholders() {
  renderStakeholderControls();
  renderStakeholderMap();
  renderStakeholderRows();
  renderStakeholderPanel();
}

// Top row of the Time card and the handle (Figma year-filter and year-handle).
function renderStakeholderControls() {
  const all = shYear === null;
  const handleYear = parseInt($('sh-slider').value, 10);
  $('sh-all-years').classList.toggle('on', all);
  $('sh-all-years').setAttribute('aria-pressed', all);
  $('sh-year-label').textContent = t(all ? 'labels.showing' : 'labels.year');
  $('sh-year-big').textContent = all ? t('labels.allYears') : shYear;
  // in All years the handle and its line are dimmed
  $('sh-time').classList.toggle('all-years', all);
  $('sh-handle-line').style.left = yearPct(handleYear) + '%';
}

// Year labels under the track, every 5 years.
function renderTrackYears() {
  let html = '';
  for (let year = Math.ceil(YEAR_MIN / 5) * 5; year <= YEAR_MAX; year += 5) {
    html += '<div class="sh-tick" style="left:' + yearPct(year) + '%"></div>' +
      '<div class="sh-year-label mono" style="left:' + yearPct(year) + '%">' + year + '</div>';
  }
  $('sh-track-years').innerHTML = html;
}

// The legend of the four bar styles (Figma certainty-legend), in a neutral grey.
function renderCertaintyLegend() {
  const styles = [['exact', 'labels.certaintyExact'], ['approximate', 'labels.certaintyApproximate'], ['ongoing', 'labels.certaintyOngoing'], ['expected', 'labels.certaintyExpected']];
  $('sh-certainty-legend').innerHTML = styles.map(([style, label]) =>
    '<div class="sh-certainty"><span class="sh-sample"><span class="sh-bar-shape ' + style + '"><i></i></span></span>' + escapeHtml(t(label)) + '</div>').join('');
}

// The map: image of the year, the areas that have an observation in that year, legend and messages.
function renderStakeholderMap() {
  showStakeholderImage();
  if (!stakeholders) {
    $('sh-areas').innerHTML = '';
    $('sh-legend').innerHTML = '';
    $('sh-map-message').hidden = true;
    return;
  }
  const visible = stakeholders.areas.filter((a) => stakeholders.observations.some((o) => o.area === a.number && observationActive(o)));
  $('sh-areas').innerHTML = visible.map((a) => {
    const s = a.shape;
    const place = 'left:' + s.leftPct + '%; top:' + s.topPct + '%; width:' + s.widthPct + '%; height:' + s.heightPct + '%;';
    const selected = a.number === shArea;
    return '<button type="button" class="sh-area' + (selected ? ' selected' : '') + '" data-area="' + escapeHtml(a.number) + '" aria-pressed="' + selected + '"' +
      ' title="' + escapeHtml(a.zone || '') + '" aria-label="' + escapeHtml(t('labels.area', { number: a.number }) + (a.zone ? ', ' + a.zone : '')) + '"' +
      ' style="' + place + areaClass(a).style + '"><span class="sh-area-number">' + escapeHtml(a.number) + '</span></button>';
  }).join('');

  // a year without observations: say so on the map
  const none = shYear !== null && visible.length === 0;
  $('sh-map-message').hidden = !none;
  if (none) $('sh-map-message').textContent = t('messages.noObservationsInYear', { year: shYear });

  // legend: the classes of the areas, each once, in the order of the areas
  const seen = [];
  stakeholders.areas.forEach((a) => { if (!seen.some((x) => x.class === a.class)) seen.push(a); });
  $('sh-legend').innerHTML = seen.map((a) => {
    const cls = areaClass(a);
    return '<div class="lg" style="' + cls.style + '"><span class="lg-dot" style="background: var(--c)"></span>' + escapeHtml(cls.label) + '</div>';
  }).join('');
}

// Shows the map image of the selected year (in All years: the most recent year). If that year has
// no image yet, the placeholder image is shown and the label on the map says so.
function showStakeholderImage() {
  const imagery = (stakeholders && stakeholders.imagery) || {};
  const year = shYear === null ? YEAR_MAX : shYear;
  const img = $('sh-map-image');
  if (!stakeholders) { img.removeAttribute('src'); $('sh-imagery-label').textContent = ''; return; }
  const show = (exists) => {
    // the year may have changed while the image was being checked
    if (year !== (shYear === null ? YEAR_MAX : shYear)) return;
    const src = exists ? imagery.folder + year + '.' + imagery.extension : (imagery.placeholder || '');
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    $('sh-imagery-label').textContent = t(exists ? 'labels.imagery' : 'labels.imageryMissing', { year: year });
  };
  if (!imagery.folder || !imagery.extension) { show(false); return; }
  if (year in shImageExists) { show(shImageExists[year]); return; }
  // try to load the image once; remember the result so each year is only checked once
  const probe = new Image();
  probe.onload = () => { shImageExists[year] = true; show(true); };
  probe.onerror = () => { shImageExists[year] = false; show(false); };
  probe.src = imagery.folder + year + '.' + imagery.extension;
}

// One row per observation: the area number on the left and the bar on the scale of the slider track.
function renderStakeholderRows() {
  if (!stakeholders) { $('sh-rows').innerHTML = ''; return; }
  const oneYear = 100 / (YEAR_MAX - YEAR_MIN);   // width of one year, in percent
  $('sh-rows').innerHTML = sortedObservations().map((o) => {
    const area = areaByNumber(o.area);
    const cls = areaClass(area);
    const end = observationEnd(o);
    // a bar runs from its start year to its end year; one single year is drawn one year wide, centered on it
    let left = yearPct(o.startYear), right = yearPct(end);
    if (end === o.startYear) { left = Math.max(0, left - oneYear / 2); right = Math.min(100, left + oneYear); }
    const state = (o.area === shArea ? ' selected' : '') + (observationActive(o) ? '' : ' dimmed');
    const tooltip = '<span class="sh-tooltip' + (left > 60 ? ' flip' : '') + '"><b>' + textOrPlaceholder('sh-placeholder', area.zone) + '</b>' +
      '<span class="sh-tooltip-years">' + escapeHtml(observationYears(o)) + '</span>' +
      '<span class="lg"><span class="lg-dot" style="background: var(--c)"></span>' + escapeHtml(cls.label) + '</span></span>';
    return '<div class="sh-row' + state + '" style="' + cls.style + '">' +
      '<div class="sh-row-number">' + escapeHtml(o.area) + '</div>' +
      '<div class="sh-row-scale"><button type="button" class="sh-bar" data-area="' + escapeHtml(o.area) + '" aria-pressed="' + (o.area === shArea) + '"' +
      ' aria-label="' + escapeHtml(t('labels.area', { number: o.area }) + ', ' + observationYears(o) + ', ' + cls.label) + '"' +
      ' style="left:' + left + '%; width:' + (right - left) + '%">' +
      '<span class="sh-bar-shape ' + observationStyle(o) + '"><i></i></span>' + tooltip + '</button></div></div>';
  }).join('');
}

// The panel on the right: what stakeholders said about the selected area.
// In All years: all its observations. In a single year: only the observations in that year.
function renderStakeholderPanel() {
  const area = stakeholders && shArea !== null ? areaByNumber(shArea) : null;
  $('sh-panel-empty').hidden = !!area;
  $('sh-panel-expand').hidden = !area;
  $('sh-panel-content').hidden = !area;
  if (!area) return;

  const all = sortedObservations().filter((o) => o.area === area.number);
  const shown = all.filter(observationActive);
  shEntry = Math.min(shown.length - 1, Math.max(0, shEntry));
  const o = shown[shEntry];
  const cls = areaClass(area);

  // "2 observations" or, in a single year, "2 observations in 1988"
  const key = 'labels.observationCount' + (shYear === null ? '' : 'Year') + (shown.length === 1 ? 'One' : '');
  const count = t(key, { count: shown.length, year: shYear });
  const others = all.length - shown.length;

  const box = (title, body) => '<div class="observation-box"><div class="observation-title">' + escapeHtml(t(title)) + '</div>' + body + '</div>';
  const textBox = (title, value) => box(title, '<div class="observation-text">' + textOrPlaceholder('sh-placeholder', value) + '</div>');
  const quotes = (o.quotes || []).map((q) =>
    '<div class="sh-quote"><div class="observation-text">“' + textOrPlaceholder('sh-placeholder', q.text) + '”</div>' +
    (q.name ? '<div class="sh-quote-name">— ' + escapeHtml(q.name) + '</div>' : '') + '</div>').join('');

  $('sh-panel-content').style.cssText = cls.style;
  $('sh-panel-content').innerHTML =
    '<div class="area-header">' +
      '<div><div class="area-number">' + escapeHtml(t('labels.area', { number: area.number })) + '</div>' +
      '<div class="area-zone">' + textOrPlaceholder('sh-placeholder', area.zone) + '</div></div>' +
      '<div class="area-meta"><span class="class-badge"><span class="lg-dot" style="background: var(--c)"></span>' + escapeHtml(cls.label) + '</span>' +
      '<span class="area-count">' + escapeHtml(count) + '</span></div>' +
    '</div>' +
    (others > 0 ? '<div class="sh-other-years">' + escapeHtml(t(others === 1 ? 'labels.otherYearsOne' : 'labels.otherYears', { count: others })) + '</div>' : '') +
    (shown.length > 1 ? '<div class="entry-switcher"><div class="entry-label">' + escapeHtml(t('labels.observationOf', { index: shEntry + 1, count: shown.length })) + '</div>' +
      '<button type="button" class="step" data-entry-step="-1" aria-label="Previous observation"' + (shEntry === 0 ? ' disabled' : '') + '>&larr;</button>' +
      '<button type="button" class="step" data-entry-step="1" aria-label="Next observation"' + (shEntry === shown.length - 1 ? ' disabled' : '') + '>&rarr;</button></div>' : '') +
    '<div class="observation">' +
      '<div class="observation-pair">' + textBox('labels.change', o.change) + textBox('labels.period', o.period) + '</div>' +
      textBox('labels.cause', o.cause) +
      box('labels.inTheirWords', quotes || '<div class="observation-text">' + textOrPlaceholder('sh-placeholder', '') + '</div>') +
      textBox('labels.stakeholderType', o.stakeholderType) +
    '</div>';
}
