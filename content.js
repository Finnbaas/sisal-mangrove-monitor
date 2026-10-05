// =====================================================================================
// CONTENT: everything the team writes lives in the content/ folder (see content/README.md).
//
// This file
//   - loads content/pages.json, variables.json, texts.json, method.md and gee-starter-script.txt
//   - checks them, and shows a clear message naming the file when one cannot be read
//   - fills every text on the page that has data-text="..." (from texts.json)
//   - builds the sub-navigation, the research sections and the simple cards from pages.json
//   - shows a placeholder when a page or card has no content yet
//   - builds the Method page from method.md (with the "marked" Markdown library)
//
// app.js calls loadContent() first and only starts the rest when the content is ready.
// =====================================================================================

let CONTENT = null;   // { pages, variables, texts, method, script } once loaded

// The ready-made cards that exist in index.html (data-card="..."). pages.json may use these names.
function readyCardNames() {
  return [...document.querySelectorAll('#card-library [data-card]')].map((c) => c.dataset.card);
}

// ---------- loading and checking ----------

// An error in one content file; the message is shown on the page.
class ContentError extends Error {
  constructor(file, problem) {
    super(file + ': ' + problem);
    this.file = file;
    this.problem = problem;
  }
}

const CONTENT_FILES = [
  { key: 'pages', path: 'content/pages.json', json: true },
  { key: 'variables', path: 'content/variables.json', json: true },
  { key: 'texts', path: 'content/texts.json', json: true },
  { key: 'method', path: 'content/method.md', json: false },
  { key: 'script', path: 'content/gee-starter-script.txt', json: false }
];

async function loadContent() {
  const loaded = {};
  for (const f of CONTENT_FILES) {
    let response;
    try {
      response = await fetch(f.path);
    } catch (err) {
      throw new ContentError(f.path, 'the file could not be loaded (' + err.message + ').');
    }
    if (!response.ok) throw new ContentError(f.path, 'the file could not be loaded (HTTP ' + response.status + ').');
    const text = await response.text();
    loaded[f.key] = f.json ? parseJsonFile(text, f.path) : text;
  }
  checkContent(loaded);
  CONTENT = loaded;
}

// JSON.parse, but with a message that names the file and the line of the mistake.
function parseJsonFile(text, path) {
  try {
    return JSON.parse(text);
  } catch (err) {
    let where = '';
    const pos = /position (\d+)/.exec(err.message);
    const lineCol = /line (\d+) column (\d+)/.exec(err.message);
    if (lineCol) where = 'line ' + lineCol[1] + ', column ' + lineCol[2];
    else if (pos) {
      const before = text.slice(0, Number(pos[1])).split('\n');
      where = 'line ' + before.length + ', column ' + (before[before.length - 1].length + 1);
    }
    throw new ContentError(path, 'the file is not valid JSON' + (where ? ' (near ' + where + ')' : '') +
      '. Check for a missing comma, a comma after the last item, or a missing double quote.');
  }
}

// Checks that the files have the parts the site needs. Problems stop the site with a clear message.
function checkContent(c) {
  const pagesFile = 'content/pages.json', varsFile = 'content/variables.json';
  if (!c.pages || !Array.isArray(c.pages.sections)) throw new ContentError(pagesFile, 'it needs a list called "sections".');
  const ids = new Set();
  c.pages.sections.forEach((s, i) => {
    const n = 'section ' + (i + 1);
    if (!s || typeof s.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) throw new ContentError(pagesFile, n + ' needs an "id" with only lowercase letters, numbers and dashes.');
    if (s.id === 'method') throw new ContentError(pagesFile, n + ': the id "method" is reserved for the Method page.');
    if (ids.has(s.id)) throw new ContentError(pagesFile, 'the id "' + s.id + '" is used twice.');
    ids.add(s.id);
    if (typeof s.label !== 'string') throw new ContentError(pagesFile, n + ' ("' + s.id + '") needs a "label".');
    if (s.columns !== undefined && !Array.isArray(s.columns)) throw new ContentError(pagesFile, n + ' ("' + s.id + '"): "columns" must be a list.');
  });
  if (!c.pages.sections.length) throw new ContentError(pagesFile, 'the list "sections" is empty: the site needs at least one page.');
  const v = c.variables || {};
  if (!v.yearRange || typeof v.yearRange.first !== 'number' || typeof v.yearRange.last !== 'number') throw new ContentError(varsFile, '"yearRange" needs a "first" and a "last" year (numbers).');
  ['pointVariables', 'eventVariables', 'trendMetrics'].forEach((k) => {
    if (!Array.isArray(v[k])) throw new ContentError(varsFile, '"' + k + '" must be a list (it may be empty: []).');
  });
  ['pointVariables', 'eventVariables'].forEach((k) => v[k].forEach((x, i) => {
    if (!x || typeof x.id !== 'string' || typeof x.label !== 'string') throw new ContentError(varsFile, k + ' item ' + (i + 1) + ' needs an "id" and a "label".');
  }));
  ['changeClasses', 'scenarios', 'sources'].forEach((k) => {
    if (!v[k] || typeof v[k] !== 'object' || Array.isArray(v[k])) throw new ContentError(varsFile, '"' + k + '" must be an object ({ ... }).');
  });
  if (!c.texts || typeof c.texts !== 'object') throw new ContentError('content/texts.json', 'the file must contain an object ({ ... }).');
}

// Shown instead of the site when a content file cannot be used.
function showContentError(err) {
  const box = document.createElement('div');
  box.className = 'content-error';
  box.setAttribute('role', 'alert');
  const title = document.createElement('strong');
  const detail = document.createElement('p');
  if (err instanceof ContentError) {
    title.textContent = 'The site could not start because of a problem in ' + err.file;
    detail.textContent = err.problem;
  } else {
    title.textContent = 'The site could not start.';
    detail.textContent = err.message;
  }
  box.appendChild(title);
  box.appendChild(detail);
  document.querySelectorAll('#subnav, #card-library, [data-screen]').forEach((el) => { el.hidden = true; });
  $('page').insertBefore(box, $('subnav'));
  console.error(err);
}

// ---------- texts ----------

// A text from texts.json by its path, e.g. t('labels.valuesFor', { year: 2026 }) gives "Values for 2026".
// A missing text shows its path in brackets, so the team can see what to add.
function t(path, values) {
  let text = path.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), CONTENT && CONTENT.texts);
  if (typeof text !== 'string') {
    console.warn('content/texts.json has no text "' + path + '"');
    return '[' + path + ']';
  }
  Object.entries(values || {}).forEach(([k, v]) => { text = text.split('{' + k + '}').join(v); });
  return text;
}

// Fills every element with data-text="..." with that text.
function fillTexts() {
  document.querySelectorAll('[data-text]').forEach((el) => { el.textContent = t(el.dataset.text); });
  document.title = t('siteName');
}

// ---------- pages, sections and simple cards ----------

function pageSections() {
  return CONTENT.pages.sections;
}

// All card names used on one page (ready-made cards only), e.g. ['point-map', 'year-slider', ...]
function cardsOnPage(id) {
  const section = pageSections().find((s) => s.id === id);
  const names = [];
  const walk = (item) => {
    if (typeof item === 'string') names.push(item);
    else if (Array.isArray(item)) item.forEach(walk);
  };
  if (section) (section.columns || []).forEach(walk);
  return names;
}

// Builds the sub-navigation and one <section> per page from pages.json.
function buildPages() {
  const nav = $('subnav');
  nav.innerHTML = '';
  pageSections().forEach((s) => {
    const link = document.createElement('a');
    link.className = 'subtab';
    link.href = '#' + s.id;
    const span = document.createElement('span');
    span.textContent = s.label;
    link.appendChild(span);
    nav.appendChild(link);
  });

  const ready = readyCardNames();
  const library = $('card-library');
  pageSections().forEach((s) => {
    const section = document.createElement('section');
    section.className = 'research-grid';
    section.dataset.screen = s.id;
    section.hidden = true;
    const columns = (s.columns || []).filter((col) => Array.isArray(col) && col.length);
    if (!columns.length) {
      // the page has no cards: one wide placeholder card
      section.appendChild(placeholderCard({ message: t('messages.pageNotYetAvailable') }, 'page-placeholder'));
    } else {
      columns.forEach((col) => {
        const colEl = document.createElement('div');
        colEl.className = 'col';
        col.forEach((item) => colEl.appendChild(buildItem(item, ready, s.id)));
        section.appendChild(colEl);
      });
    }
    library.parentNode.insertBefore(section, library);
  });
}

// One item of a column: a ready-made card name, a pair of cards side by side, or a simple card.
function buildItem(item, ready, pageId) {
  if (typeof item === 'string') {
    if (!ready.includes(item)) return unknownCard('card name "' + item + '"', pageId);
    const slot = document.createElement('div');
    slot.dataset.slot = item;
    return slot;
  }
  if (Array.isArray(item)) {
    const row = document.createElement('div');
    row.className = 'small-row';
    item.forEach((sub) => row.appendChild(buildItem(sub, ready, pageId)));
    return row;
  }
  if (item && item.type === 'image') return imageCard(item);
  if (item && item.type === 'placeholder') return placeholderCard(item);
  if (item && item.type === 'text') return textCard(item);
  return unknownCard('card type "' + (item && item.type) + '"', pageId);
}

// A card with an optional title row (title + the round expand button, as on the other cards).
function simpleCard(className, title) {
  const card = document.createElement('div');
  card.className = 'card ' + className;
  if (title) {
    const row = document.createElement('div');
    row.className = 'card-title-row';
    const titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    titleEl.textContent = title;
    const expand = document.createElement('div');
    expand.className = 'expand';
    expand.textContent = '↗';
    row.appendChild(titleEl);
    row.appendChild(expand);
    card.appendChild(row);
  }
  return card;
}

// { "type": "image", "title": ..., "src": ..., "alt": ..., "height": 380, "keepVisible": "left" }
function imageCard(item) {
  const card = simpleCard('image-card', item.title);
  const img = document.createElement('img');
  img.src = item.src || '';
  img.alt = item.alt || '';
  if (item.height) {
    // cropped to a fixed height; keepVisible says which side stays in view
    const frame = document.createElement('div');
    frame.className = 'image-frame';
    frame.style.height = item.height + 'px';
    const side = { left: 'left center', right: 'right center', top: 'center top', bottom: 'center bottom' }[item.keepVisible] || 'center';
    img.style.objectPosition = side;
    frame.appendChild(img);
    card.appendChild(frame);
  } else {
    card.appendChild(img);
  }
  return card;
}

// { "type": "placeholder", "title": ..., "message": ... }: content not decided yet
function placeholderCard(item, extraClass) {
  const card = document.createElement('div');
  card.className = 'card placeholder-card' + (extraClass ? ' ' + extraClass : '');
  if (item.title) {
    const title = document.createElement('div');
    title.className = 'card-title placeholder-title';
    title.textContent = item.title;
    card.appendChild(title);
  }
  const p = document.createElement('p');
  p.className = 'placeholder-text';
  p.textContent = item.message || t('messages.notYetAvailable');
  card.appendChild(p);
  return card;
}

// { "type": "text", "title": ..., "text": ... }
function textCard(item) {
  const card = simpleCard('text-card', item.title);
  const p = document.createElement('p');
  p.textContent = item.text || '';
  card.appendChild(p);
  return card;
}

// A card name or type that does not exist: a visible placeholder, so the team notices the typo.
function unknownCard(what, pageId) {
  console.warn('content/pages.json, page "' + pageId + '": unknown ' + what);
  return placeholderCard({ message: t('messages.notYetAvailable') + ' (content/pages.json: unknown ' + what + ')' });
}

// ---------- Method page (content/method.md) ----------

// Turns method.md into cards: "# " and every "## " start a card; a "> " line becomes the note box;
// a numbered list becomes the numbered steps; {{scenario-table}} and {{gee-starter-script}} are filled in.
function buildMethodPage() {
  const section = $('method');
  section.innerHTML = '';
  if (!window.marked) {
    section.appendChild(placeholderCard({ message: t('messages.notYetAvailable') + ' (the Markdown library could not be loaded)' }));
    return;
  }
  const holder = document.createElement('div');
  holder.innerHTML = window.marked.parse(CONTENT.method);
  let card = null;
  const newCard = () => {
    card = document.createElement('div');
    card.className = 'card m-card';
    section.appendChild(card);
    return card;
  };
  [...holder.children].forEach((el) => {
    const text = el.textContent.trim();
    if (el.tagName === 'H1' || el.tagName === 'H2') {
      newCard().appendChild(el);
    } else if (el.tagName === 'BLOCKQUOTE') {
      const note = document.createElement('div');
      note.id = 'disclaimer';
      note.textContent = text;
      section.appendChild(note);
      card = null;
    } else {
      if (!card) newCard();
      if (el.tagName === 'P' && text === '{{scenario-table}}') card.appendChild(scenarioTable());
      else if (el.tagName === 'P' && text === '{{gee-starter-script}}') {
        const pre = document.createElement('pre');
        pre.id = 'gee-script';
        pre.textContent = CONTENT.script.replace(/\r/g, '').trim();
        card.appendChild(pre);
      } else if (el.tagName === 'OL') card.appendChild(numberedSteps(el));
      else {
        // the paragraph right under the page title is the intro ("lead")
        if (el.tagName === 'P' && card.lastElementChild && card.lastElementChild.tagName === 'H1') el.className = 'lead';
        card.appendChild(el);
      }
    }
  });
}

// A numbered Markdown list ("1. **Title** text") as the numbered steps of the Method page.
function numberedSteps(list) {
  const box = document.createElement('div');
  box.className = 'gee-steps';
  [...list.children].forEach((li, i) => {
    const strong = li.querySelector('strong');
    const title = strong ? strong.textContent.trim() : '';
    const desc = li.textContent.replace(title, '').trim();
    const step = document.createElement('div');
    step.className = 'gee-step';
    step.innerHTML = '<div class="gee-n"></div><div class="gee-body"><div class="gee-title"></div><div class="gee-desc"></div></div>';
    step.querySelector('.gee-n').textContent = i + 1;
    step.querySelector('.gee-title').textContent = title;
    step.querySelector('.gee-desc').textContent = desc;
    box.appendChild(step);
  });
  return box;
}

// The colored scenario table: rows are the NDVI trend, columns the standard deviation trend
// (the scenario definitions in CLAUDE.md). Labels and colors come from variables.json.
function scenarioTable() {
  const sc = CONTENT.variables.scenarios;
  const table = document.createElement('div');
  table.id = 'scenario-table';
  const cell = (cls, text, scenario) => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    if (scenario) {
      d.style.background = 'var(--color-' + scenario.color + '-bg)';
      d.style.color = 'var(--color-' + scenario.color + ')';
    }
    table.appendChild(d);
  };
  const scenarioCell = (n) => {
    const s = sc[n];
    cell('sc', s ? t('labels.scenario') + ' ' + n + ' — ' + s.label : t('messages.noData'), s);
  };
  cell('sc-h', '');
  cell('sc-h', t('labels.scenarioTableSdUp'));
  cell('sc-h', t('labels.scenarioTableSdDown'));
  cell('sc-r', t('labels.scenarioTableNdviDown'));
  scenarioCell('1');
  scenarioCell('2');
  cell('sc-r', t('labels.scenarioTableNdviUp'));
  scenarioCell('3');
  scenarioCell('4');
  return table;
}
