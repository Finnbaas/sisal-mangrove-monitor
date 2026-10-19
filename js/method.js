// method.js: the Method page and the "Run this analysis on your own data" links on the research cards.
//   One tab per analysis (Satellite, Climatology, Stakeholders). In a tab: a gallery of examples ("use
//   cases"; clicking one opens its steps and files in a panel, one panel on the whole page) and a collapsed
//   row "About this analysis". The address #method/<use case id> opens the right tab and panel.
//   A section can have "datasets" and "limitations": a compact list above the cards (Climatology); other sections
//   have the collapsed row "About this analysis". A use case can have "howMade" (a short text at the top of its
//   panel) and "infoCards": research cards whose small ↗ button opens that panel. Numbers in these texts are
//   written as {storms.total} and filled in from the data files. A use case can also have "keyChoices" (a list under
//   "Key choices"), "howWeUsed" and "whatYouNeed". A section with "datasets" (Climatology, Satellite) shows its data
//   sources and limitations above the cards and the link to its folder on GitHub below them.
// Reads: content/method.json (written by the team) and, for the numbers in the texts, data/storms/storm-counts.json,
//   data/events.json, data/climate/typical-year.json, data/climate/change.json and data/climate/wave-direction.json.
// Uses: helpers.js, content.js, navigation.js (lastResearchSection). Used by: main.js, navigation.js.

const METHOD_FILE = 'content/method.json';

let method = null;           // contents of content/method.json, or null if it could not be loaded
let activeTab = null;        // id of the section (tab) that is shown
let openUseCase = null;      // id of the use case whose panel is open (only one on the whole page; none at the start)
let methodFacts = {};        // the numbers that the texts can use, from the data files (see loadMethodFacts)
let methodArrival = null;    // { useCase, from }: set when the visitor arrives through a link to one use case
let methodCameFrom = null;   // the research page on which a "Do this analysis yourself" link was clicked

// Small icons, drawn in the text color of the place they are used in.
const METHOD_ICONS = {
  file: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 1.75H9L12.25 5V14.25H4V1.75Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 1.75V5H12.25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  download: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2V10.5M4.5 7.25L8 10.75L11.5 7.25M3 13.5H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow: '<svg class="icon" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  github: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>'
};

// ---------- loading and checking ----------

async function loadMethod() {
  try {
    let response;
    try {
      response = await fetch(METHOD_FILE);
    } catch (err) {
      throw new ContentError(METHOD_FILE, 'the file could not be loaded (' + err.message + ').');
    }
    if (!response.ok) throw new ContentError(METHOD_FILE, 'the file could not be loaded (HTTP ' + response.status + ').');
    const content = parseJsonFile(await response.text(), METHOD_FILE);
    checkMethod(content);
    method = content;
    methodFacts = await loadMethodFacts();
  } catch (err) {
    // a problem in this file only affects the Method page: the message names the file
    $('method').innerHTML = '<div class="content-error"><strong>' + escapeHtml(t('messages.couldNotLoadMethod')) + '</strong><p>' + escapeHtml(err.message) + '</p></div>';
    console.error(err);
    return;
  }
  buildMethodPage();
  placeCardLinks();
  openMethodTarget();   // the page may have been opened with a link to one use case
}

// Checks that the file has the parts this page needs. Entries that cannot be shown are left out
// (with a warning in the browser console), so one wrong entry does not hide the rest.
function checkMethod(content) {
  if (!content || !Array.isArray(content.sections)) throw new ContentError(METHOD_FILE, '"sections" must be a list.');
  const warn = (text) => console.warn(METHOD_FILE + ': ' + text);
  const seen = [];
  content.sections = content.sections.filter((s) => {
    if (!s || !s.id || !s.title) { warn('a section without "id" or "title" is not shown.'); return false; }
    s.files = Array.isArray(s.files) ? s.files.filter((f) => f && f.name) : [];
    s.useCases = (Array.isArray(s.useCases) ? s.useCases : []).filter((u) => {
      // the id is used in the address of the page, so it must be simple and may only occur once
      if (!u || !/^[a-z0-9-]+$/.test(u.id || '')) { warn('a use case in "' + s.id + '" has no valid "id" (lowercase letters, numbers and dashes) and is not shown.'); return false; }
      if (seen.includes(u.id)) { warn('the use case id "' + u.id + '" is used twice; the second one is not shown.'); return false; }
      seen.push(u.id);
      return true;
    });
    return true;
  });
}

function setupMethod() {
  // clicks on the Method page: a tab, an example in a gallery (opens or closes its panel) or the close button of a panel
  $('method').addEventListener('click', (e) => {
    const tab = e.target.closest('.method-tab');
    if (tab) {
      if (tab.dataset.section !== activeTab) { openUseCase = null; methodArrival = null; }   // the panel belongs to the old tab
      selectMethodTab(tab.dataset.section);
      return;
    }
    const card = e.target.closest('.example-card');
    const close = e.target.closest('.use-case-close');
    if (!card && !close) return;
    openUseCase = close || openUseCase === card.dataset.useCase ? null : card.dataset.useCase;
    methodArrival = null;   // the visitor is now browsing on their own
    renderUseCases();
    const panel = openUseCase && $('use-case-' + openUseCase);
    if (panel) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  loadMethod();
}

// ---------- the numbers in the texts ----------

// Reads the data files of the Climatology page and collects the numbers that the texts use, so the Method
// page always says the same as the page itself. A file that cannot be read only leaves its numbers out ("No data").
async function loadMethodFacts() {
  const read = async (file) => {
    try {
      const response = await fetch(file);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } catch (err) {
      console.warn(file + ': ' + err.message + ' (the Method page leaves out the numbers from this file)');
      return null;
    }
  };
  const [counts, events, typical, change, wave] = await Promise.all([
    read('data/storms/storm-counts.json'), read('data/events.json'), read('data/climate/typical-year.json'),
    read('data/climate/change.json'), read('data/climate/wave-direction.json')]);
  const facts = { record: {}, storms: {}, wave: {}, trend: {}, seaLevel: {} };

  // the storms: the counting rule and numbers of "When storms come", the studied storms of events.json
  if (counts) {
    Object.assign(facts.storms, { rule: counts.rule, total: counts.summary && counts.summary.total,
      start: counts.record && counts.record.start, end: counts.record && counts.record.end });
  }
  if (Array.isArray(events) && events.length) {
    facts.storms.studied = events.length;
    facts.storms.baseline = events[0].baseline;
    if (Array.isArray(events[0].dates)) facts.storms.windowDays = (events[0].dates.length - 1) / 2;   // days before and after the peak
    if (counts && Array.isArray(counts.storms)) {
      const counted = counts.storms.map((x) => x.hurdatId);
      const names = events.filter((e) => !counted.includes(e.hurdatId)).sort((a, b) => a.stormPeriod.start.localeCompare(b.stormPeriod.start)).map((e) => e.name);
      facts.storms.notCounted = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : (names[0] || '');
      facts.storms.counted = events.length - names.length;
    }
  }
  // record periods (years) of every variable
  if (typical && typical.variables) {
    Object.entries(typical.variables).forEach(([id, v]) => {
      if (v.record) facts.record[id] = { start: String(v.record.start).slice(0, 4), end: String(v.record.end).slice(0, 4) };
    });
  }
  // the trend: the p-value limit of the page, and the periods of the sea level trend
  if (typeof TREND_P_LIMIT === 'number') facts.trend.pLimit = TREND_P_LIMIT;
  const sea = change && change.variables && change.variables.seaLevel;
  if (sea && Array.isArray(sea.periods)) facts.seaLevel.periods = sea.periods.map((p) => p.start + '–' + p.end).join(' and ');
  // wave direction
  if (wave) {
    Object.assign(facts.wave, { threshold: wave.threshold, all: wave.days && wave.days.all, storm: wave.days && wave.days.storm,
      start: wave.record && String(wave.record.start).slice(0, 4), end: wave.record && String(wave.record.end).slice(0, 4) });
  }
  return facts;
}

// A text with its {placeholders} filled in, e.g. {storms.total}; a number that is not available becomes "No data".
function fillFacts(text) {
  return String(text).replace(/\{([\w.]+)\}/g, (match, path) => {
    const value = path.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), methodFacts);
    return isFilled(value) ? value : NO_DATA;
  });
}

// ---------- small helpers ----------

// A key choice is a text, or { text, more, moreLabel }: then "text" is shown and "more" sits behind its own
// small toggle with the label "moreLabel" (e.g. "Show thresholds"): a <details>, no own JavaScript.
const choiceText = (c) => (c && typeof c === 'object' ? c.text : c);
function choiceHtml(c) {
  if (!c || typeof c !== 'object' || !isFilled(c.more)) return escapeHtml(choiceText(c));
  return '<span class="choice-text">' + escapeHtml(c.text) + ' <details class="choice-more"><summary>' +
    escapeHtml(isFilled(c.moreLabel) ? c.moreLabel : t('labels.showMore')) + '</summary><span class="choice-more-text">' + escapeHtml(c.more) + '</span></details></span>';
}

// The row under the cards of a tab: the link to the folder on GitHub and, when the section has one, the zip file.
function filesActions(section) {
  return '<div class="method-files-actions">' +
    githubLink('small', t(isFilled(section.folder) ? 'labels.viewFolderOnGithub' : 'labels.viewOnGithub'), section.folder) +
    (isFilled(section.zip) ? '<a class="ghost download-all" href="' + escapeHtml(section.zip) + '" download>' + escapeHtml(t('labels.downloadAll')) + '</a>' : '') +
    '</div>';
}

// Makes a text from the content file safe to place in the page.
// The address of a folder (or of the whole repository) on GitHub. A full address (https://...) is used as it is,
// for folders in another repository (the analyses repository).
function githubAddress(folder) {
  if (/^https?:\/\//.test(folder || '')) return folder;
  const repo = String(method.repository || '').replace(/\/$/, '');
  return isFilled(folder) ? repo + '/tree/' + (method.branch || 'main') + '/' + folder : repo;
}

// A link to GitHub with the GitHub icon (Figma github-link): "large" is the button in the page
// header, "small" the text link inside a section.
function githubLink(size, label, folder) {
  if (!isFilled(method.repository)) return '';
  return '<a class="github-link ' + size + '" href="' + escapeHtml(githubAddress(folder)) + '" target="_blank" rel="noopener">' + METHOD_ICONS.github + '<span>' + escapeHtml(label) + '</span></a>';
}

// The address of one file on GitHub. A full address (https://...) is used as it is.
function githubFileAddress(path) {
  if (/^https?:\/\//.test(path)) return path;
  return String(method.repository || '').replace(/\/$/, '') + '/blob/' + (method.branch || 'main') + '/' + path;
}

function sectionById(id) {
  return method.sections.find((s) => s.id === id);
}

// The use case with this id and the section it belongs to, or null.
function findUseCase(id) {
  for (const section of method.sections) {
    const useCase = section.useCases.find((u) => u.id === id);
    if (useCase) return { section: section, useCase: useCase };
  }
  return null;
}

// ---------- drawing the page ----------

function buildMethodPage() {
  const header =
    '<div class="card method-header">' +
      '<div class="method-title-row"><h1>' + textOrPlaceholder('method-placeholder', method.title) + '</h1>' +
      (method.exampleContent ? '<span class="content-tag">' + escapeHtml(t('labels.exampleContent')) + '</span>' : '') + '</div>' +
      (isFilled(method.intro) ? '<p class="method-intro">' + escapeHtml(method.intro) + '</p>' : '') +
      githubLink('large', t('labels.viewRepositoryOnGithub'), '') +
    '</div>';

  const cite =
    '<div class="cite-block">' +
      '<div class="cite-license"><div class="method-label">' + escapeHtml(t('labels.license')) + '</div><div class="method-text">' + textOrPlaceholder('method-placeholder', method.license) + '</div></div>' +
      '<div class="cite-citation"><div class="method-label">' + escapeHtml(t('labels.citeThisMethod')) + '</div><div class="method-text">' + textOrPlaceholder('method-placeholder', method.citation) + '</div>' +
      '<div class="cite-doi mono">' + escapeHtml(t('labels.doi')) + ' ' + textOrPlaceholder('method-placeholder', method.doi) + '</div></div>' +
    '</div>';

  // the tabs (same look as the toggle of the Climatology page); data-section gives a tab the colors of its research page
  const tabs =
    '<div class="section-nav method-tabs" role="tablist">' + method.sections.map((s) =>
      '<button type="button" class="section-nav-item method-tab" role="tab" data-section="' + escapeHtml(s.id) + '">' + escapeHtml(s.title) + '</button>').join('') +
    '</div>';

  $('method').innerHTML = header + tabs + method.sections.map(methodSectionHtml).join('') + cite;
  if (!activeTab || !sectionById(activeTab)) activeTab = method.sections.length ? method.sections[0].id : null;
  selectMethodTab(activeTab);
}

// Shows the content of one tab and hides the others.
function selectMethodTab(id) {
  activeTab = id;
  document.querySelectorAll('#method .method-tab').forEach((b) => {
    const on = b.dataset.section === id;
    b.classList.toggle('current', on);
    b.setAttribute('aria-selected', on);
  });
  document.querySelectorAll('#method .method-section').forEach((el) => { el.hidden = el.dataset.section !== id; });
  renderUseCases();
}

// The content of one tab (Figma method-section): the gallery of things a researcher can make themselves with the
// panel of the open one, and under it the background information: the summary (always shown) and "Data sources",
// "Key choices" and "Requirements", each its own toggle.
function methodSectionHtml(section) {
  const block = (label, body) => '<div class="method-block"><div class="method-label">' + escapeHtml(t(label)) + '</div>' + body + '</div>';
  const placeholder = '<div class="method-text">' + textOrPlaceholder('method-placeholder', '') + '</div>';

  const sources = (section.sources || []).filter((s) => s && isFilled(s.label));
  const sourcesHtml = sources.length ? sources.map((s) =>
    isFilled(s.url) ? '<a class="method-source" href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.label) + ' &rarr;</a>'
      : '<span class="method-source">' + escapeHtml(s.label) + '</span>').join('') : placeholder;

  const choices = (section.keyChoices || []).filter((c) => isFilled(choiceText(c)));
  const choicesHtml = choices.length ? '<ul class="method-choices">' + choices.map((c) => '<li>' + choiceHtml(c) + '</li>').join('') + '</ul>' : placeholder;

  // a section with "datasets": a compact list of the data sources and the limitations, above the cards
  const list = (label, lines) => (lines || []).filter(isFilled).length ?
    block(label, '<ul class="method-choices">' + lines.filter(isFilled).map((x) => '<li>' + escapeHtml(fillFacts(x)) + '</li>').join('') + '</ul>') : '';
  const info = Array.isArray(section.datasets) ?
    '<div class="method-info">' + list('labels.dataSources', section.datasets) + list('labels.limitations', section.limitations) + '</div>' : '';

  // A part that opens and closes (closed at the start): the small grey heading is the toggle (<summary>) with a
  // chevron, the text is under it. The browser handles click, keyboard and screen readers (<details>).
  const toggle = (label, body) => '<details class="method-toggle"><summary class="method-label">' + escapeHtml(t(label)) + '</summary>' +
    '<div class="method-toggle-body">' + body + '</div></details>';

  // the background information of the other sections: the summary (always shown), then "Data sources",
  // "Key choices" and "Requirements" (each its own toggle), then the link to the folder on GitHub and the zip file
  const about = Array.isArray(section.datasets) ? '' :
    '<div class="method-about" id="about-' + escapeHtml(section.id) + '">' +
      '<div class="method-about-body">' +
        '<p class="method-text">' + textOrPlaceholder('method-placeholder', section.description) + '</p>' +
        '<div class="method-about-blocks">' + toggle('labels.dataSources', sourcesHtml) +
          toggle('labels.keyChoices', choicesHtml) +
          toggle('labels.requirements', '<div class="method-text">' + textOrPlaceholder('method-placeholder', section.requirements) + '</div>') + '</div>' +
        filesActions(section) +
      '</div>' +
    '</div>';

  // the theme colors of a section follow the research page with the same id (data-section, see css/base.css)
  return '<div class="card method-section" id="method-' + escapeHtml(section.id) + '" data-section="' + escapeHtml(section.id) + '" role="tabpanel" aria-label="' + escapeHtml(section.title) + '" hidden>' + info +
    (section.useCases.length ?
      '<div class="use-cases">' +
        '<div class="use-cases-heading">' + escapeHtml(t('labels.doItYourselfHeading')) + '</div>' +
        '<div class="use-cases-hint">' + escapeHtml(t('labels.galleryHint')) + '</div>' +
        '<div class="example-gallery" id="gallery-' + escapeHtml(section.id) + '"></div>' +
        '<div id="use-case-slot-' + escapeHtml(section.id) + '"></div>' +
      '</div>' : '') +
    (Array.isArray(section.datasets) && isFilled(section.folder) ? filesActions(section) : '') +
    about +
  '</div>';
}

// One file in the panel of a use case, on one line: the name, a small type label and a GitHub icon that links to the
// file. The description shows when hovering over the line. A file that has no "path" yet has a grey icon and no link.
function fileRow(file) {
  const available = isFilled(file.path);
  const icon = available
    ? '<a class="file-github" href="' + escapeHtml(githubFileAddress(file.path)) + '" target="_blank" rel="noopener" aria-label="' + escapeHtml(t('labels.viewFileOnGithub') + ': ' + file.name) + '" title="' + escapeHtml(t('labels.viewFileOnGithub')) + '">' + METHOD_ICONS.github + '</a>'
    : '<span class="file-github unavailable" title="' + escapeHtml(t('messages.notYetAvailable')) + '">' + METHOD_ICONS.github + '</span>';
  return '<div class="file-row' + (available ? '' : ' unavailable') + '"' + (isFilled(file.description) ? ' title="' + escapeHtml(file.description) + '"' : '') + '>' +
    '<span class="file-name mono">' + escapeHtml(file.name) + '</span>' +
    (isFilled(file.format) ? '<span class="format-tag">' + escapeHtml(file.format) + '</span>' : '') + icon + '</div>';
}

// The galleries of all tabs and, under the gallery that holds it, the panel that is open (if any).
function renderUseCases() {
  method.sections.forEach((section) => {
    const gallery = $('gallery-' + section.id);
    if (!gallery) return;
    gallery.innerHTML = section.useCases.map((u) => {
      const open = u.id === openUseCase;
      return '<button type="button" class="example-card' + (open ? ' selected' : '') + '" data-section="' + escapeHtml(section.id) + '" data-use-case="' + escapeHtml(u.id) + '" aria-expanded="' + open + '">' +
        '<span class="example-thumb">' + (isFilled(u.image) ? '<img src="' + escapeHtml(u.image) + '" alt="">' : '') + '</span>' +
        '<span class="example-title">' + textOrPlaceholder('method-placeholder', u.title) + '</span></button>';
    }).join('');
    const useCase = section.useCases.find((u) => u.id === openUseCase);
    $('use-case-slot-' + section.id).innerHTML = useCase ? useCaseHtml(section, useCase) : '';
  });
}

// The steps and files of one example (Figma use-case). It is highlighted when the visitor arrived
// through a link to it; if they came from a research page, a bar on top offers the way back.
function useCaseHtml(section, useCase) {
  const arrived = methodArrival && methodArrival.useCase === useCase.id;
  const fromPage = arrived && methodArrival.from ? pageSections().find((p) => p.id === methodArrival.from) : null;
  const bar = fromPage ?
    '<div class="use-case-bar"><span>' + escapeHtml(t('labels.cameFrom', { page: fromPage.label })) + '</span>' +
    '<a href="#' + escapeHtml(fromPage.id) + '">&larr; ' + escapeHtml(t('labels.backTo', { page: fromPage.label })) + '</a></div>' : '';

  const madeHtml = isFilled(useCase.howMade) ?
    '<div class="use-case-made"><div class="method-label">' + escapeHtml(t('labels.howThisIsMade')) + '</div><p class="method-text">' + escapeHtml(fillFacts(useCase.howMade)) + '</p></div>' : '';

  // optional: the key choices of this card (a list; one can have its rest behind a small toggle)
  const choices = (useCase.keyChoices || []).filter((c) => isFilled(choiceText(c)));
  const choicesHtml = choices.length ?
    '<div class="use-case-made"><div class="method-label">' + escapeHtml(t('labels.keyChoices')) + '</div>' +
    '<ul class="method-choices">' + choices.map((c) => '<li>' + choiceHtml(c) + '</li>').join('') + '</ul></div>' : '';

  // optional: "How we used it" (one sentence, with a link to the page where the result is) and "What you need"
  const usedHtml = isFilled(useCase.howWeUsed) ?
    '<div class="use-case-made"><div class="method-label">' + escapeHtml(t('labels.howWeUsedIt')) + '</div><p class="method-text">' + escapeHtml(useCase.howWeUsed) +
    (isFilled(useCase.howWeUsedLink) ? ' <a href="' + escapeHtml(useCase.howWeUsedLink) + '">' + escapeHtml(t('labels.seeOnClimatologyPage')) + ' &rarr;</a>' : '') + '</p></div>' : '';
  const needs = (useCase.whatYouNeed || []).filter(isFilled);
  const needHtml = needs.length ?
    '<div class="use-case-made"><div class="method-label">' + escapeHtml(t('labels.whatYouNeed')) + '</div>' +
    needs.map((n) => '<p class="method-text">' + escapeHtml(n) + '</p>').join('') + '</div>' : '';

  const steps = (useCase.steps || []).filter(isFilled);
  const stepsHtml = steps.length ? '<ol class="use-case-steps">' + steps.map((s, i) =>
    '<li><span class="use-case-number">' + (i + 1) + '</span><span>' + escapeHtml(fillFacts(s)) + '</span></li>').join('') + '</ol>'
    : '<div class="method-text">' + textOrPlaceholder('method-placeholder', '', t('messages.stepsWillBeAdded')) + '</div>';

  // only the files this use case needs, looked up by name in the files of its section
  const files = (useCase.files || []).map((name) => section.files.find((f) => f.name === name)).filter(Boolean);
  const filesHtml = files.length ? '<div class="file-list">' + files.map(fileRow).join('') + '</div>'
    : '<div class="method-files-empty small">' + escapeHtml(t('messages.filesWillBeAdded')) + '</div>';

  return '<div class="use-case' + (arrived ? ' highlighted' : '') + '" id="use-case-' + escapeHtml(useCase.id) + '">' + bar +
    '<button type="button" class="use-case-close" aria-label="' + escapeHtml(t('labels.closePanel')) + '" title="' + escapeHtml(t('labels.closePanel')) + '">&times;</button>' +
    '<div class="use-case-body">' +
      '<div class="use-case-instructions"><div><div class="use-case-title">' + textOrPlaceholder('method-placeholder', useCase.title) + '</div>' +
      '<div class="use-case-name mono">#method/' + escapeHtml(useCase.id) + '</div></div>' + madeHtml + choicesHtml + usedHtml + needHtml + stepsHtml + '</div>' +
      '<div class="use-case-files">' + filesHtml + '</div>' +
    '</div></div>';
}

// ---------- links to one use case ----------

// The address #method/<use case id> opens the Method page at that use case: its example is
// selected, its steps are shown and highlighted, and the page scrolls to it.
// Returns true when a use case was opened (navigation.js then does not scroll to the top).
function openMethodTarget() {
  if (!method) return false;
  const parts = location.hash.slice(1).split('/');
  const found = parts[0] === 'method' && parts[1] ? findUseCase(parts[1]) : null;
  const hadArrival = methodArrival;
  if (!found) {
    // the plain Method page (or another page): nothing is highlighted any more
    methodArrival = null;
    methodCameFrom = null;
    // #method/<section id> opens that tab
    const tab = parts[0] === 'method' && parts[1] ? sectionById(parts[1]) : null;
    if (tab) { if (tab.id !== activeTab) openUseCase = null; selectMethodTab(tab.id); }
    else if (hadArrival) renderUseCases();
    return false;
  }
  methodArrival = { useCase: found.useCase.id, from: methodCameFrom };
  methodCameFrom = null;
  openUseCase = found.useCase.id;
  selectMethodTab(found.section.id);                      // shows the tab and opens the panel
  const el = $('use-case-' + found.useCase.id);
  if (el && !$('method').hidden) el.scrollIntoView({ block: 'center' });
  return true;
}

// "Do this analysis yourself" (Figma card-actions): a small link in the footer of every research
// card that a use case names in its "cards" list. It opens the Method page at that use case.
function placeCardLinks() {
  document.querySelectorAll('.diy-link').forEach((old) => old.remove());
  const used = [];
  method.sections.forEach((section) => section.useCases.forEach((useCase) => (useCase.cards || []).forEach((name) => {
    const card = document.querySelector('[data-card="' + name + '"]');
    if (!card) { console.warn(METHOD_FILE + ': use case "' + useCase.id + '" names the card "' + name + '", which does not exist.'); return; }
    if (used.includes(name)) { console.warn(METHOD_FILE + ': the card "' + name + '" is named by more than one use case; only the first link is shown.'); return; }
    used.push(name);
    // the chart card already has an actions row (with the download menu); other cards get one at the bottom
    let actions = card.querySelector('.card-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'card-actions card-actions-footer';
      card.appendChild(actions);
    }
    const link = document.createElement('a');
    link.className = 'diy-link';
    link.href = '#method/' + useCase.id;
    link.innerHTML = '<span>' + escapeHtml(t('labels.doItYourself')) + '</span>' + METHOD_ICONS.arrow;
    // remember which research page the visitor is on, for the "You came from ..." bar
    link.addEventListener('click', () => { methodCameFrom = lastResearchSection; });
    actions.appendChild(link);
  })));

  // the ↗ button in the title row of a card opens the panel of a use case (or, for a section, its tab)
  const expandLink = (name, id, title) => {
    const card = document.querySelector('[data-card="' + name + '"]');
    const old = card && card.querySelector('.expand');
    if (!old) { console.warn(METHOD_FILE + ': "' + id + '" names the card "' + name + '", which has no ↗ button.'); return; }
    const link = document.createElement('a');
    link.className = 'expand';
    link.href = '#method/' + id;
    link.title = t('labels.openTopic');
    link.setAttribute('aria-label', t('labels.openTopic') + ': ' + title);
    link.textContent = '↗';
    link.addEventListener('click', () => { methodCameFrom = lastResearchSection; });
    old.replaceWith(link);
  };
  method.sections.forEach((section) => {
    (section.infoCards || []).forEach((name) => expandLink(name, section.id, section.title));
    section.useCases.forEach((useCase) => (useCase.infoCards || []).forEach((name) => expandLink(name, useCase.id, useCase.title)));
  });
}
