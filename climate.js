// The climate table on the Climatology page (card "climate-table").
//
// One row per climate variable: its name, a chart of a typical year, a chart of the change over
// the years, and the trend with a badge.
//
// The charts are NOT drawn by the website. They are made in Python from the team's analysis
// (analysis/climatology/export_typical_year.py), saved as SVG files in data/charts/, and this
// file only places each SVG into its slot. The SVG is inserted into the page itself (not as an
// image), so its text is drawn in the font of the site.
//
// Which rows exist and which file goes into which slot is listed in content/climate.json.
// This file uses helpers from app.js ($, colorVarOf) and content.js (t, parseJsonFile, ContentError).

const CLIMATE_FILE = 'content/climate.json';

let climate = null;   // contents of content/climate.json, or null if it could not be loaded

// ---------- loading and checking ----------

async function loadClimate() {
  try {
    let response;
    try {
      response = await fetch(CLIMATE_FILE);
    } catch (err) {
      throw new ContentError(CLIMATE_FILE, 'the file could not be loaded (' + err.message + ').');
    }
    if (!response.ok) throw new ContentError(CLIMATE_FILE, 'the file could not be loaded (HTTP ' + response.status + ').');
    const content = parseJsonFile(await response.text(), CLIMATE_FILE);
    if (!content || !Array.isArray(content.rows)) throw new ContentError(CLIMATE_FILE, '"rows" must be a list.');
    content.rows = content.rows.filter((r) => {
      if (r && r.id && r.name) return true;
      console.warn(CLIMATE_FILE + ': a row without "id" or "name" is not shown.');
      return false;
    });
    climate = content;
  } catch (err) {
    // a problem in this file only affects the climate table: the message names the file
    $('climate-status').textContent = t('messages.couldNotLoadClimate', { error: err.message });
    console.error(err);
    return;
  }
  renderClimateTable();
}

function setupClimate() {
  loadClimate();
}

// ---------- small helpers ----------

// Makes a text from the content file safe to place in the page.
function cText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cFilled(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

// ---------- drawing ----------

function renderClimateTable() {
  $('climate-rows').innerHTML = climate.rows.map((row) => {
    const trend = (Array.isArray(row.trend) ? row.trend : [row.trend]).filter(cFilled);
    const badgeLabel = (climate.badges || {})[row.badge];
    return '<div class="climate-row">' +
      '<div class="climate-variable">' +
        '<div class="climate-name"><span class="climate-swatch" style="background: var(' + colorVarOf(row.color) + ', var(--color-text-faint))"></span><span>' + cText(row.name) + '</span></div>' +
        (cFilled(row.detail) ? '<div class="climate-note">' + cText(row.detail) + '</div>' : '') +
        (cFilled(row.note) ? '<div class="climate-note">' + cText(row.note) + '</div>' : '') +
      '</div>' +
      chartSlot(row, 'typicalYear') +
      chartSlot(row, 'change') +
      '<div class="climate-trend">' +
        (trend.length ? trend.map((line) => '<div class="climate-trend-value mono">' + cText(line) + '</div>').join('')
          : '<div class="climate-trend-value placeholder-text">' + cText(t('messages.notYetAvailable')) + '</div>') +
        (badgeLabel ? '<span class="trend-badge badge-' + cText(row.badge) + '">' + cText(badgeLabel) + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  // place the chart files into their slots
  document.querySelectorAll('#climate-rows .climate-chart[data-file]').forEach(loadChart);
}

// The box a chart goes into. Until its file is loaded (or if no file is listed) it shows a message.
function chartSlot(row, kind) {
  const file = row[kind];
  const label = t(kind === 'typicalYear' ? 'labels.colTypicalYear' : 'labels.colChange') + ': ' + row.name;
  if (!cFilled(file)) return '<div class="climate-chart empty" aria-label="' + cText(label) + '">' + cText(t('messages.notYetAvailable')) + '</div>';
  return '<div class="climate-chart empty" data-file="' + cText(file) + '" role="img" aria-label="' + cText(label) + '">' + cText(t('messages.chartNotAvailable')) + '</div>';
}

// Reads one SVG file and inserts it into its slot. If the file is missing (or is not an SVG),
// the slot keeps the text "Chart not available".
async function loadChart(slot) {
  const path = (climate.chartFolder || '') + slot.dataset.file;
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    let svg = await response.text();
    const start = svg.indexOf('<svg');
    if (start < 0) throw new Error('not an SVG file');
    // keep only the drawing itself: nothing that could run code, and no style rules (a <style> inside
    // an SVG would apply to the whole page, not only to that chart)
    svg = svg.slice(start).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    slot.innerHTML = svg;
    slot.classList.remove('empty');
  } catch (err) {
    console.warn('Chart not available: ' + path + ' (' + err.message + ')');
  }
}
