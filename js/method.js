// method.js: the Method page and the "Do this analysis yourself" links on the research cards.
//   Per analysis a short description, the code files to download, and a gallery of examples ("use
//   cases") with their steps. The address #method/<use case id> opens the page at that use case.
// Reads: content/method.json (written by the team).
// Uses: helpers.js, content.js, navigation.js (lastResearchSection). Used by: main.js, navigation.js.

const METHOD_FILE = 'content/method.json';

let method = null;           // contents of content/method.json, or null if it could not be loaded
const openUseCases = {};     // per section id: the id of the use case that is open (none at the start)
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
  // clicks on the Method page: an example in a gallery opens or closes its use case
  $('method').addEventListener('click', (e) => {
    const card = e.target.closest('.example-card');
    if (!card) return;
    const sectionId = card.dataset.section;
    openUseCases[sectionId] = openUseCases[sectionId] === card.dataset.useCase ? null : card.dataset.useCase;
    methodArrival = null;   // the visitor is now browsing on their own
    renderUseCases(sectionId);
  });
  loadMethod();
}

// ---------- small helpers ----------

// Makes a text from the content file safe to place in the page.
// The address of a folder (or of the whole repository) on GitHub.
function githubAddress(folder) {
  const repo = String(method.repository || '').replace(/\/$/, '');
  return isFilled(folder) ? repo + '/tree/' + (method.branch || 'main') + '/' + folder : repo;
}

// A link to GitHub with the GitHub icon (Figma github-link): "large" is the button in the page
// header, "small" the text link inside a section.
function githubLink(size, label, folder) {
  if (!isFilled(method.repository)) return '';
  return '<a class="github-link ' + size + '" href="' + escapeHtml(githubAddress(folder)) + '" target="_blank" rel="noopener">' + METHOD_ICONS.github + '<span>' + escapeHtml(label) + '</span></a>';
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

  $('method').innerHTML = header + method.sections.map(methodSectionHtml).join('') + cite;
  method.sections.forEach((s) => renderUseCases(s.id));
}

// One analysis (Figma method-section): description on the left, "Code and files" on the right,
// and under them the gallery of things a researcher can make themselves.
function methodSectionHtml(section) {
  const block = (label, body) => '<div class="method-block"><div class="method-label">' + escapeHtml(t(label)) + '</div>' + body + '</div>';
  const placeholder = '<div class="method-text">' + textOrPlaceholder('method-placeholder', '') + '</div>';

  const sources = (section.sources || []).filter((s) => s && isFilled(s.label));
  const sourcesHtml = sources.length ? sources.map((s) =>
    isFilled(s.url) ? '<a class="method-source" href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.label) + ' &rarr;</a>'
      : '<span class="method-source">' + escapeHtml(s.label) + '</span>').join('') : placeholder;

  const choices = (section.keyChoices || []).filter(isFilled);
  const choicesHtml = choices.length ? '<ul class="method-choices">' + choices.map((c) => '<li>' + escapeHtml(c) + '</li>').join('') + '</ul>' : placeholder;

  // the theme colors of a section follow the research page with the same id (data-section, see css/base.css)
  return '<div class="card method-section" id="method-' + escapeHtml(section.id) + '" data-section="' + escapeHtml(section.id) + '">' +
    '<div class="method-columns">' +
      '<div class="method-description">' +
        '<div class="method-head"><h2>' + escapeHtml(section.title) + '</h2><p class="method-text">' + textOrPlaceholder('method-placeholder', section.description) + '</p></div>' +
        block('labels.dataSources', sourcesHtml) +
        block('labels.keyChoices', choicesHtml) +
        block('labels.requirements', '<div class="method-text">' + textOrPlaceholder('method-placeholder', section.requirements) + '</div>') +
      '</div>' +
      '<div class="method-files">' +
        '<div class="method-files-label">' + escapeHtml(t('labels.codeAndFiles')) + '</div>' +
        (section.files.length ? '<div class="download-list">' + section.files.map(downloadRow).join('') + '</div>'
          : '<div class="method-files-empty">' + escapeHtml(t('messages.filesWillBeAdded')) + '</div>') +
        '<div class="method-files-actions">' +
          githubLink('small', t(isFilled(section.folder) ? 'labels.viewFolderOnGithub' : 'labels.viewOnGithub'), section.folder) +
          (isFilled(section.zip) ? '<a class="ghost download-all" href="' + escapeHtml(section.zip) + '" download>' + escapeHtml(t('labels.downloadAll')) + '</a>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    (section.useCases.length ?
      '<div class="use-cases">' +
        '<div class="use-cases-heading">' + escapeHtml(t('labels.doItYourselfHeading')) + '</div>' +
        '<div class="use-cases-hint">' + escapeHtml(t('labels.galleryHint')) + '</div>' +
        '<div class="example-gallery" id="gallery-' + escapeHtml(section.id) + '"></div>' +
        '<div id="use-case-slot-' + escapeHtml(section.id) + '"></div>' +
      '</div>' : '') +
  '</div>';
}

// One downloadable file (Figma download-row). The whole row is the download link. A file that has
// no "path" yet is listed, greyed out, and cannot be clicked.
function downloadRow(file) {
  const available = isFilled(file.path);
  const inside =
    METHOD_ICONS.file +
    '<span class="download-body"><span class="download-name mono">' + escapeHtml(file.name) + '</span>' +
    '<span class="download-description">' + textOrPlaceholder('method-placeholder', file.description) + '</span>' +
    (available ? '' : '<span class="download-soon">' + escapeHtml(t('messages.notYetAvailable')) + '</span>') + '</span>' +
    (isFilled(file.format) ? '<span class="format-tag">' + escapeHtml(file.format) + '</span>' : '');
  if (available) return '<a class="download-row" href="' + escapeHtml(file.path) + '" download>' + inside + METHOD_ICONS.download + '</a>';
  return '<div class="download-row unavailable">' + inside + '</div>';
}

// The gallery of one section and, under it, the use case that is open (if any).
function renderUseCases(sectionId) {
  const section = sectionById(sectionId);
  const gallery = $('gallery-' + sectionId);
  if (!section || !gallery) return;
  const openId = openUseCases[sectionId] || null;

  gallery.innerHTML = section.useCases.map((u) => {
    const open = u.id === openId;
    return '<button type="button" class="example-card' + (open ? ' selected' : '') + '" data-section="' + escapeHtml(sectionId) + '" data-use-case="' + escapeHtml(u.id) + '" aria-expanded="' + open + '">' +
      '<span class="example-thumb">' + (isFilled(u.image) ? '<img src="' + escapeHtml(u.image) + '" alt="">' : '') + '</span>' +
      '<span class="example-title">' + textOrPlaceholder('method-placeholder', u.title) + '</span></button>';
  }).join('');

  const useCase = section.useCases.find((u) => u.id === openId);
  $('use-case-slot-' + sectionId).innerHTML = useCase ? useCaseHtml(section, useCase) : '';
}

// The steps and files of one example (Figma use-case). It is highlighted when the visitor arrived
// through a link to it; if they came from a research page, a bar on top offers the way back.
function useCaseHtml(section, useCase) {
  const arrived = methodArrival && methodArrival.useCase === useCase.id;
  const fromPage = arrived && methodArrival.from ? pageSections().find((p) => p.id === methodArrival.from) : null;
  const bar = fromPage ?
    '<div class="use-case-bar"><span>' + escapeHtml(t('labels.cameFrom', { page: fromPage.label })) + '</span>' +
    '<a href="#' + escapeHtml(fromPage.id) + '">&larr; ' + escapeHtml(t('labels.backTo', { page: fromPage.label })) + '</a></div>' : '';

  const steps = (useCase.steps || []).filter(isFilled);
  const stepsHtml = steps.length ? '<ol class="use-case-steps">' + steps.map((s, i) =>
    '<li><span class="use-case-number">' + (i + 1) + '</span><span>' + escapeHtml(s) + '</span></li>').join('') + '</ol>'
    : '<div class="method-text">' + textOrPlaceholder('method-placeholder', '', t('messages.stepsWillBeAdded')) + '</div>';

  // only the files this use case needs, looked up by name in the files of its section
  const files = (useCase.files || []).map((name) => section.files.find((f) => f.name === name)).filter(Boolean);
  const filesHtml = files.length ? '<div class="download-list">' + files.map(downloadRow).join('') + '</div>'
    : '<div class="method-files-empty small">' + escapeHtml(t('messages.filesWillBeAdded')) + '</div>';

  return '<div class="use-case' + (arrived ? ' highlighted' : '') + '" id="use-case-' + escapeHtml(useCase.id) + '">' + bar +
    '<div class="use-case-body">' +
      '<div class="use-case-instructions"><div><div class="use-case-title">' + textOrPlaceholder('method-placeholder', useCase.title) + '</div>' +
      '<div class="use-case-name mono">#method/' + escapeHtml(useCase.id) + '</div></div>' + stepsHtml + '</div>' +
      '<div class="use-case-files">' + filesHtml +
      '<div class="use-case-folder">' + githubLink('small', t(isFilled(section.folder) ? 'labels.viewFolderOnGithub' : 'labels.viewOnGithub'), section.folder) + '</div></div>' +
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
    if (hadArrival) method.sections.forEach((s) => renderUseCases(s.id));
    return false;
  }
  methodArrival = { useCase: found.useCase.id, from: methodCameFrom };
  methodCameFrom = null;
  openUseCases[found.section.id] = found.useCase.id;
  method.sections.forEach((s) => renderUseCases(s.id));
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
}
