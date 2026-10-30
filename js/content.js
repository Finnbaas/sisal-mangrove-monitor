// content.js: loads the team's content files and builds the pages from them.
//   - loads and checks content/pages.json, variables.json and texts.json; if one cannot be read,
//     the page shows a message naming the file instead of a blank page
//   - fills every element with data-text="..." from texts.json; t('labels.year') gives one text
//   - builds the sub-navigation, the pages, the parts with their section navigation, and the simple
//     cards (image, text, placeholder, planned, group) from pages.json
// Reads: content/pages.json, content/variables.json, content/texts.json, content/ecosystem.json, content/landing.json, content/triangulation.json (see content/README.md).
// Used by: every screen file (CONTENT, t, parseJsonFile); main.js calls loadContent() first.

let CONTENT = null;   // { pages, variables, texts, ecosystem } once loaded

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
  { key: 'ecosystem', path: 'content/ecosystem.json', json: true },
  { key: 'landing', path: 'content/landing.json', json: true },
  { key: 'triangulation', path: 'content/triangulation.json', json: true }
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
    if (s.wide !== undefined && !Array.isArray(s.wide)) throw new ContentError(pagesFile, n + ' ("' + s.id + '"): "wide" must be a list.');
    if (s.parts !== undefined) {
      if (!Array.isArray(s.parts)) throw new ContentError(pagesFile, n + ' ("' + s.id + '"): "parts" must be a list.');
      s.parts.forEach((p, j) => {
        const pn = n + ' ("' + s.id + '"), part ' + (j + 1);
        if (!p || typeof p !== 'object' || Array.isArray(p)) throw new ContentError(pagesFile, pn + ' must be an object ({ ... }).');
        if (typeof p.title !== 'string') throw new ContentError(pagesFile, pn + ' needs a "title".');
        if (p.columns !== undefined && !Array.isArray(p.columns)) throw new ContentError(pagesFile, pn + ': "columns" must be a list.');
        if (p.wide !== undefined && !Array.isArray(p.wide)) throw new ContentError(pagesFile, pn + ': "wide" must be a list.');
      });
    }
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
  const lf = 'content/landing.json', L = c.landing || {};
  if (!L.hero || typeof L.hero.title !== 'string' || !Array.isArray(L.hero.buttons)) throw new ContentError(lf, 'it needs a "hero" with a "title" and a list of "buttons".');
  if (!L.studyArea || !Array.isArray(L.studyArea.sentences)) throw new ContentError(lf, 'it needs a "studyArea" with a list of "sentences".');
  if (!L.about || !Array.isArray(L.about.columns)) throw new ContentError(lf, 'it needs an "about" with a list of "columns".');
  const tf = 'content/triangulation.json', T = c.triangulation || {};
  ['sources', 'relations'].forEach((k) => {
    if (!Array.isArray(T[k]) || T[k].length !== 3) throw new ContentError(tf, '"' + k + '" must be a list of three items.');
  });
  if (!T.texts || !T.landing || !T.events || !Array.isArray(T.events.cards) || !T.method || !T.center) throw new ContentError(tf, 'it needs "center", "texts", "landing", "events" (with "cards") and "method".');
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
  $('topbar').after(box);
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

// All card names used on one page (ready-made cards only), e.g. ['point-map', 'point-chart', ...]
function cardsOnPage(id) {
  const section = pageSections().find((s) => s.id === id);
  const names = [];
  const walk = (item) => {
    if (typeof item === 'string') names.push(item);
    else if (Array.isArray(item)) item.forEach(walk);
    else if (item && item.type === 'group') (item.cards || []).forEach(walk);
  };
  // a page with "parts" lists its cards per part
  (section ? (section.parts || [section]) : []).forEach((part) => {
    (part.columns || []).forEach(walk);
    (part.wide || []).forEach(walk);
    if (part.aside) walk(part.aside);
  });
  return names;
}

// The image band at the top of a page: the page title and an optional intro in white on a dark page-color overlay.
// "title", "intro" and "band" (the image; without it the band is the solid dark page color) come from content/pages.json.
// Returns null for a page without a title. An intro with {placeholders} is filled in later (ecosystem.js).
function buildBand(s) {
  if (!s.title) return null;
  const top = document.createElement('div');
  top.className = 'page-band page-title';
  // full address: a url() in a CSS variable is read relative to the css file
  if (s.band) top.style.setProperty('--band-image', 'url("' + new URL(s.band, location.href).href + '")');
  const h1 = document.createElement('h2');
  h1.textContent = s.title;
  top.appendChild(h1);
  if (s.intro) {
    const intro = document.createElement('p');
    intro.id = 'intro-page-' + s.id;
    if (s.intro.includes('{')) intro.dataset.template = s.intro;
    else intro.textContent = s.intro;
    top.appendChild(intro);
  }
  // the small triangle of the three sources on the right (js/triangle.js): this page's source highlighted
  const mini = buildMiniTriangle(s.id);
  if (mini) top.appendChild(mini);
  return top;
}

// The image band of a page, and under it the line "This page answers ..." (js/triangle.js).
function placeBand(section, s) {
  const band = buildBand(s);
  if (!band) return;
  section.appendChild(band);
  const answers = buildAnswersLine(s.id);
  if (answers) section.appendChild(answers);
}

// Builds the page navigation in the top bar (one link per page, a divider, "Method") and one <section> per page from pages.json.
function buildPages() {
  const nav = $('subnav');
  nav.innerHTML = '';
  pageSections().forEach((s) => {
    const link = document.createElement('a');
    link.className = 'subtab';
    link.href = '#' + s.id;
    link.textContent = s.label;
    nav.appendChild(link);
  });
  // a thin divider, then the Method page
  const divider = document.createElement('span');
  divider.className = 'nav-divider';
  divider.setAttribute('aria-hidden', 'true');
  nav.appendChild(divider);
  const methodLink = document.createElement('a');
  methodLink.className = 'subtab';
  methodLink.href = '#method';
  methodLink.textContent = t('tabs.method');
  nav.appendChild(methodLink);

  const ready = readyCardNames();
  const library = $('card-library');
  pageSections().forEach((s) => {
    const section = document.createElement('section');
    section.dataset.screen = s.id;
    section.hidden = true;
    if (Array.isArray(s.parts) && s.parts.length) {
      // a long page in parts: the section navigation, then per part a heading and its cards
      section.className = 'research-parts';
      buildParts(section, s, ready);
    } else {
      section.className = 'research-grid';
      placeBand(section, s);
      fillGrid(section, s, ready, s.id);
    }
    library.parentNode.insertBefore(section, library);
  });
}

// The two columns and the "wide" cards of a page (or of one part of a page) in a grid.
function fillGrid(grid, s, ready, pageId) {
  const columns = (s.columns || []).filter((col) => Array.isArray(col) && col.length);
  // "wide": cards that span the full page width, under the two columns (for example a wide table)
  const wide = s.wide || [];
  if (!columns.length && !wide.length) {
    // the page has no cards: one wide placeholder card
    grid.appendChild(placeholderCard({ message: t('messages.pageNotYetAvailable') }, 'page-placeholder'));
    return;
  }
  columns.forEach((col) => {
    const colEl = document.createElement('div');
    colEl.className = 'col';
    col.forEach((item) => colEl.appendChild(buildItem(item, ready, pageId)));
    grid.appendChild(colEl);
  });
  if (wide.length) {
    const wideEl = document.createElement('div');
    wideEl.className = 'col wide';
    wide.forEach((item) => wideEl.appendChild(buildItem(item, ready, pageId)));
    grid.appendChild(wideEl);
  }
}

// A page with "parts" (for example Climatology: "Storms at Sisal" and "Climate at Sisal").
// At the top a section navigation that stays in view while scrolling (Figma: section-nav); each
// part has a heading (title + intro), an optional small card next to it ("aside"), and its cards.
function buildParts(section, s, ready) {
  const nav = document.createElement('nav');
  nav.className = 'section-nav';
  nav.setAttribute('aria-label', s.label);
  // the bar stays at the top in the page background color, so cards and axis labels never show behind the navigation
  // an optional page title (and intro) in an image band above the section navigation (Figma: v3 image band). An intro with
  // {placeholders} is filled in later, when the numbers have loaded (ecosystem.js)
  placeBand(section, s);
  const bar = document.createElement('div');
  bar.className = 'section-nav-bar';
  bar.appendChild(nav);
  // the coordinates of the selected point (#coords) sit on the right of this bar, so they stay in view while
  // scrolling; they are only shown while a part with "showCoords": true is the current part (see markCurrent)
  if (s.parts.some((p) => p.showCoords) && $('coords')) bar.appendChild($('coords'));
  section.appendChild(bar);
  // Every part has its own address (#satellite/ndvi). Normally all parts are shown below each other and the address
  // scrolls to its part (navigation.js, scrollToPart). With "partsAsTabs": true in content/pages.json only one part is
  // shown at a time: the part of the address (navigation.js, showPart).
  const asTabs = !!s.partsAsTabs;
  if (asTabs) section.classList.add('parts-as-tabs');
  const partEls = [];
  s.parts.forEach((p, i) => {
    const partId = p.id || 'part-' + (i + 1);
    const part = document.createElement('div');
    part.className = 'research-part';
    part.id = s.id + '-' + partId;
    part.dataset.part = partId;

    const headerRow = document.createElement('div');
    headerRow.className = 'part-header-row';
    const header = document.createElement('div');
    header.className = 'part-header';
    const title = document.createElement('h2');
    title.textContent = p.title;
    header.appendChild(title);
    if (p.intro) {
      const intro = document.createElement('p');
      intro.id = 'intro-' + p.id;
      // an intro with {placeholders} is filled in later, when the numbers have loaded (storm-counts.js)
      if (p.intro.includes('{')) intro.dataset.template = p.intro;
      else intro.textContent = p.intro;
      header.appendChild(intro);
    }
    headerRow.appendChild(header);
    if (p.aside) headerRow.appendChild(buildItem(p.aside, ready, s.id));
    part.appendChild(headerRow);

    const grid = document.createElement('div');
    grid.className = 'research-grid';
    fillGrid(grid, p, ready, s.id);
    part.appendChild(grid);
    section.appendChild(part);
    partEls.push(part);

    // one link per part in the section navigation
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'section-nav-item';
    link.textContent = p.title;
    link.dataset.part = partId;
    // the link changes the address (#satellite/ndvi), so the back button works per part; navigation.js then shows
    // (tabs) or scrolls to the part. Clicking the link of the address you are already on scrolls to the part again.
    link.addEventListener('click', () => {
      const address = s.id + '/' + partId;
      if (!asTabs && location.hash === '#' + address) part.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else location.hash = address;
    });
    nav.appendChild(link);
  });
  if (asTabs) return;   // the current part is marked by showPart (navigation.js), not by scrolling

  // the part in view is marked in the navigation: the last part whose top has passed the navigation
  const links = [...nav.children];
  // at the start (top of the page) the first part is the one in view
  links[0].classList.add('current');
  links[0].setAttribute('aria-current', 'true');
  const markCurrent = () => {
    if (section.hidden) return;
    const line = nav.getBoundingClientRect().bottom + 40;
    let current = 0;
    partEls.forEach((el, i) => { if (el.getBoundingClientRect().top <= line) current = i; });
    // at the very bottom of the page the last part counts as the one in view
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = partEls.length - 1;
    section.classList.toggle('part-shows-coords', !!s.parts[current].showCoords);
    links.forEach((l, i) => {
      l.classList.toggle('current', i === current);
      if (i === current) l.setAttribute('aria-current', 'true');
      else l.removeAttribute('aria-current');
    });
  };
  window.addEventListener('scroll', markCurrent, { passive: true });
  window.addEventListener('resize', markCurrent);
  window.addEventListener('hashchange', () => setTimeout(markCurrent, 0));
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
  if (item && item.type === 'planned') return plannedCard(item);
  if (item && item.type === 'group') return groupCard(item, ready, pageId);
  return unknownCard('card type "' + (item && item.type) + '"', pageId);
}

// A card with an optional title row.
function simpleCard(className, title) {
  const card = document.createElement('div');
  card.className = 'card ' + className;
  if (title) {
    const row = document.createElement('div');
    row.className = 'card-title-row';
    const titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    titleEl.textContent = title;
    row.appendChild(titleEl);
    card.appendChild(row);
  }
  return card;
}

// { "type": "planned", "title": ..., "graphs": [ { "title", "label", "height", "width" } ] }
// A card whose graphs are designed but not built yet (Figma: graph-placeholder): per graph a light
// box with its title and a line saying what it will show. Graphs sit side by side; a graph with a
// "width" (px) keeps that width, the others share the rest.
function plannedCard(item) {
  const card = simpleCard('planned-card', item.title);
  const row = document.createElement('div');
  row.className = 'planned-row';
  (Array.isArray(item.graphs) ? item.graphs : []).forEach((g) => {
    const box = document.createElement('div');
    box.className = 'graph-placeholder';
    if (g.height) box.style.height = g.height + 'px';
    if (g.width) box.style.flex = '0 0 ' + g.width + 'px';
    const head = document.createElement('div');
    head.className = 'graph-placeholder-title';
    head.textContent = g.title || '';
    const label = document.createElement('div');
    label.className = 'graph-placeholder-label';
    label.textContent = g.label || t('messages.notYetAvailable');
    box.appendChild(head);
    box.appendChild(label);
    row.appendChild(box);
  });
  card.appendChild(row);
  return card;
}

// { "type": "group", "title": ..., "cards": ["card-a", "card-b"] }
// One card with a small title that holds ready-made cards side by side, each with a light border
// instead of its own shadow, so they read as parts of one card. Their rows line up (css/base.css).
function groupCard(item, ready, pageId) {
  const card = simpleCard('group-card', item.title);
  const row = document.createElement('div');
  row.className = 'group-row';
  (Array.isArray(item.cards) ? item.cards : []).forEach((name) => row.appendChild(buildItem(name, ready, pageId)));
  card.appendChild(row);
  // an optional quiet line under the cards: { "note": "..." }
  if (item.note) {
    const note = document.createElement('p');
    note.className = 'group-note';
    note.textContent = item.note;
    card.appendChild(note);
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
