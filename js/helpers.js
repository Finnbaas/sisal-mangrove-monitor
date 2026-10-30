// helpers.js: small tools used by every screen.
//   - $ (find an element by id), color() and colorVarOf() (colors from the css), formatLike()
//     (a number with as many decimals as the data has), escapeHtml(), textOrPlaceholder(), download()
//   - the values every screen shares: the year range, the change classes and the "No data" text,
//     filled from content/variables.json and texts.json by readSharedContent()
// Uses: content.js (CONTENT, t) once the content is loaded.
// Used by: every other js file. Loaded first.

let YEAR_MIN, YEAR_MAX;   // the year range (variables.json "yearRange"); no screen uses it at the moment
                          // (the point slider takes its years from data/points.json, points.js)
let CLASSES = {};         // change classes of the points (variables.json "changeClasses")

let NO_DATA = 'No data';  // text shown wherever a value is missing (texts.json "messages.noData")
let UNKNOWN = { label: NO_DATA, colorVar: '--color-text-faint', desc: '' };   // a missing class or scenario

const $ = (id) => document.getElementById(id);

// Reads a color from the variables at the top of css/base.css, e.g. color('--color-data-ndvi') gives '#1C3B2E'.
// A color name that does not exist (a typo in content/variables.json) shows as grey.
const warnedColors = new Set();
function color(varName) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (value) return value;
  if (!warnedColors.has(varName)) { warnedColors.add(varName); console.warn('Unknown color ' + varName + ' (check "color" in content/variables.json)'); }
  return getComputedStyle(document.documentElement).getPropertyValue('--color-text-faint').trim();
}

// Turns a color name from content/variables.json (e.g. "data-ndvi") into a CSS variable name.
function colorVarOf(name) {
  return '--color-' + (name || 'text-faint');
}

function isNumber(value) {
  return typeof value === 'number' && isFinite(value);
}

// Only the real numbers of a series (missing values are left out).
function knownValues(series) {
  return series.filter(isNumber);
}

// Counts how many decimals the data itself uses (the most found in the list of numbers),
// so values are shown exactly as precisely as they are stored, never rounded or padded further.
function decimalsIn(numbers) {
  return Math.max(0, ...knownValues(numbers).map((n) => {
    const parts = String(n).split('.');
    return parts[1] ? parts[1].length : 0;
  }));
}

// Formats a value with the same number of decimals as the series it belongs to,
// or with a fixed number of decimals when "decimals" is given (e.g. from content/variables.json).
function formatLike(value, series, decimals) {
  if (!isNumber(value)) return NO_DATA;
  return value.toFixed(isNumber(decimals) ? decimals : decimalsIn(series));
}

// The p-value of an early warning signal (Ecosystem EWS card), from the "ews" of a point in data/points.json.
// p = share of the AR(1) surrogates with a tau at least as high as the observed one. p = 0 means that no surrogate
// reached it: then the p is below pMin (1 / number of surrogates), shown as "p < 0.002" instead of "p = 0".
// Returns { below: true/false, text }.
function ewsP(p, pMin) {
  if (!isNumber(p)) return { below: false, text: NO_DATA };
  if (p === 0 && isNumber(pMin)) return { below: true, text: formatLike(pMin, [pMin]) };
  return { below: false, text: formatLike(p, [p]) };
}

function download(filename, href) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

// A text made safe to put inside HTML (so a < or & in a content file shows as itself).
function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Does a content field have a value? (not empty, not only spaces)
function isFilled(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

// A text with {name} placeholders filled in: fillPlaceholders('{a} and {b}', { a: 1, b: 2 }) gives "1 and 2".
function fillPlaceholders(text, values) {
  Object.entries(values).forEach(([k, v]) => { text = text.split('{' + k + '}').join(v); });
  return text;
}

// A text from a content file as HTML, or "Not yet available" (or placeholderText) in a lighter
// color when it is empty. cssClass is the class of that lighter text (per screen, see css/).
function textOrPlaceholder(cssClass, value, placeholderText) {
  if (isFilled(value)) return escapeHtml(value);
  return '<span class="' + cssClass + '">' + escapeHtml(placeholderText || t('messages.notYetAvailable')) + '</span>';
}

// Shows or hides the small "Placeholder" label (<span class="placeholder-tag"> in the title row of a card or in a
// row) of an element. flag = the "placeholder" field of the data; it disappears when the real data has no such field.
function showPlaceholderTag(el, flag) {
  const tag = el && el.querySelector(".placeholder-tag");
  if (tag) tag.hidden = !flag;
}

// Fills the values every screen shares from content/ (called by main.js before the screens start).
function readSharedContent() {
  const v = CONTENT.variables;
  YEAR_MIN = v.yearRange.first;
  YEAR_MAX = v.yearRange.last;
  NO_DATA = t('messages.noData');
  UNKNOWN = { label: NO_DATA, colorVar: '--color-text-faint', desc: '' };
  CLASSES = {};
  Object.entries(v.changeClasses).forEach(([id, c]) => { CLASSES[id] = { label: c.label, colorVar: colorVarOf(c.color) }; });
}
