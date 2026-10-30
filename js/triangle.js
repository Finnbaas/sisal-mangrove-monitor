// triangle.js: the triangle of the three sources (triangulation), the small version of it and the
//   "This page answers ..." line of the research pages.
//   - buildTriangle(): the big triangle as inline SVG (Figma Playground "Triangle A - Refined report"). Hover or keyboard
//     focus on a source highlights it and its two relations (the rest goes to 30 %); a click opens that page. Hover, focus or a
//     tap on a relation highlights it and shows its text in a tooltip. On a phone the relation names move below the triangle.
//   - buildMiniTriangle(pageId): 48 px, shapes only, with the source of that page highlighted; it links to the landing page.
//   - buildAnswersLine(pageId): the line under the intro of a research page.
// Reads: content/triangulation.json and the page labels of content/pages.json (through content.js).
// Uses: helpers.js (fillPlaceholders), content.js (CONTENT, pageSections). Used by: landing.js, method.js, content.js.
// Colors come from the css variables (css/triangle.css): every source has data-section="<page id>", so it takes the colors of its page.

const SVG_NS = 'http://www.w3.org/2000/svg';
let triangleCount = 0;   // gives every triangle on the site its own tooltip id

// ---------- the drawing (coordinates of the Figma frame; the triangle sits in a 560 x 440 box) ----------

// The three sources, in the order of "sources" in content/triangulation.json: top, bottom left, bottom right.
// d = the shape, x = the middle of the shape, nameY / questionY = the baselines of the name and the question.
const TRIANGLE_SOURCES = [
  { d: 'M275 36.66L186.93 189.21C183.597 194.983 185.263 197.87 191.93 197.87H368.07C374.737 197.87 376.403 194.983 373.07 189.21L285 36.66C281.667 30.8867 278.333 30.8867 275 36.66Z', x: 280, nameY: 150, questionY: 169 },
  { d: 'M170 218.53L81.93 371.07C78.5967 376.843 80.2633 379.73 86.93 379.73H263.07C269.737 379.73 271.403 376.843 268.07 371.07L180 218.53C176.667 212.757 173.333 212.757 170 218.53Z', x: 175, nameY: 334, questionY: 353 },
  { d: 'M380 218.53L291.93 371.07C288.597 376.843 290.263 379.73 296.93 379.73H473.07C479.737 379.73 481.403 376.843 478.07 371.07L390 218.53C386.667 212.757 383.333 212.757 380 218.53Z', x: 382, nameY: 334, questionY: 353 }
];

// The three relations, in the order of "relations": left, right, bottom. line = the arrow, hit = a wider invisible line to point at,
// x / y = where the name of the relation starts (anchor), lineHeight = space between its lines.
const TRIANGLE_RELATIONS = [
  { line: 'M200.608 133.513L128.608 258.217M201.005 141.826L200.608 133.513L193.211 137.325M136.005 254.405L128.608 258.217L128.211 249.905', hit: 'M200.608 133.513L128.608 258.217', anchor: 'end', x: 152.5, y: 199, tooltip: 'left' },
  { line: 'M359.392 133.513L431.392 258.217M366.789 137.325L359.392 133.513L358.995 141.826M431.789 249.905L431.392 258.217L423.995 254.405', hit: 'M359.392 133.513L431.392 258.217', anchor: 'start', x: 412, y: 191, tooltip: 'right' },
  { line: 'M208 395.731H352M215 391.231L208 395.731L215 400.231M345 391.231L352 395.731L345 400.231', hit: 'M208 395.731H352', anchor: 'middle', x: 280, y: 421, tooltip: 'below' }
];
const TRIANGLE_MIDDLE = 'M191.93 205.87H368.07C374.737 205.87 376.403 208.757 373.07 214.53L285 367.07C281.667 372.843 278.333 372.843 275 367.07L186.93 214.53C183.597 208.757 185.263 205.87 191.93 205.87Z';
const TRIANGLE_VIEWBOX = '0 28 640 414';         // the whole drawing, with room for the names of the relations
const TRIANGLE_VIEWBOX_COMPACT = '112 28 416 414'; // phone: just the triangle, so it can be drawn larger
const TRIANGLE_COMPACT_QUERY = '(max-width: 640px)';

// A small helper: an SVG element with attributes (and text).
function svgEl(tag, attrs, text) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
  if (text !== undefined) el.textContent = text;
  return el;
}

// A small helper: an HTML element with a class and text.
function triHtml(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// The label of a page (content/pages.json), e.g. "Ecosystem" for "satellite".
function pageLabelOf(pageId) {
  const page = pageSections().find((s) => s.id === pageId);
  return page ? page.label : pageId;
}

// A text on more lines of at most maxChars characters (whole words).
function wrapWords(text, maxChars) {
  const lines = [];
  text.split(' ').forEach((word) => {
    if (lines.length && (lines[lines.length - 1] + ' ' + word).length <= maxChars) lines[lines.length - 1] += ' ' + word;
    else lines.push(word);
  });
  return lines;
}

// Text with one <tspan> per line, centered or aligned on x, the first baseline at y.
function svgLines(className, lines, x, y, lineHeight, anchor) {
  const text = svgEl('text', { class: className, x, y, 'text-anchor': anchor || 'middle' });
  lines.forEach((line, i) => text.appendChild(svgEl('tspan', { x, y: y + i * lineHeight }, line)));
  return text;
}

// ---------- the big triangle ----------

function buildTriangle() {
  const c = CONTENT.triangulation;
  const id = 'triangle-' + (++triangleCount);
  const root = triHtml('div', 'triangle');
  root.dataset.triangle = '';

  const svg = svgEl('svg', { class: 'triangle-svg', viewBox: TRIANGLE_VIEWBOX, role: 'group', 'aria-label': c.texts.triangleAria });
  const drawing = svgEl('g', { transform: 'translate(40 0)' });
  svg.appendChild(drawing);

  // the middle: the white triangle with the logo and the name
  drawing.appendChild(svgEl('path', { class: 'triangle-middle', d: TRIANGLE_MIDDLE }));
  const center = svgEl('g', { class: 'triangle-center' });
  center.appendChild(svgEl('rect', { class: 'triangle-logo', x: 267, y: 222, width: 26, height: 26, rx: 6 }));
  center.appendChild(svgEl('text', { class: 'triangle-logo-letter', x: 280, y: 241, 'text-anchor': 'middle' }, $('brand-mark').textContent));
  center.appendChild(svgLines('triangle-center-name', wrapWords(c.center.name, 14), 280, 268, 15));
  drawing.appendChild(center);

  // the three sources: a link to their page, with the name and the question
  const sources = c.sources.map((source, i) => {
    const shape = TRIANGLE_SOURCES[i];
    const name = pageLabelOf(source.page);
    const link = svgEl('a', {
      class: 'triangle-source',
      href: '#' + source.page,
      'data-section': source.page,
      'aria-label': fillPlaceholders(c.texts.sourceAria, { name, question: source.question })
    });
    link.appendChild(svgEl('path', { class: 'triangle-shape', d: shape.d }));
    link.appendChild(svgEl('text', { class: 'triangle-name', x: shape.x, y: shape.nameY, 'text-anchor': 'middle' }, name));
    link.appendChild(svgEl('text', { class: 'triangle-question', x: shape.x, y: shape.questionY, 'text-anchor': 'middle' }, source.question));
    drawing.appendChild(link);
    return { id: source.page, el: link };
  });

  // the three relations: the arrow and its name. Focusable, so the keyboard can reach them.
  const tooltip = triHtml('div', 'triangle-tooltip');
  tooltip.id = id + '-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  const relations = c.relations.map((relation) => {
    const shape = TRIANGLE_RELATIONS[c.relations.indexOf(relation)];
    const label = relation.label.join(' ');
    const names = relation.between.map(pageLabelOf);
    const group = svgEl('g', {
      class: 'triangle-relation',
      tabindex: 0,
      role: 'button',
      'aria-label': fillPlaceholders(c.texts.relationAria, { label, from: names[0], to: names[1] }),
      'aria-describedby': tooltip.id
    });
    group.appendChild(svgEl('path', { class: 'triangle-hit', d: shape.hit }));
    group.appendChild(svgEl('path', { class: 'triangle-line', d: shape.line }));
    group.appendChild(svgLines('triangle-relation-label', relation.label, shape.x, shape.y, 16, shape.anchor));
    drawing.appendChild(group);
    return { id: relation.id, between: relation.between, text: relation.text, label, tooltip: shape.tooltip, el: group };
  });
  root.appendChild(svg);

  // phone: the names of the relations are listed under the triangle (they would be too small in the drawing)
  const legend = triHtml('div', 'triangle-legend');
  relations.forEach((relation) => {
    const button = triHtml('button', 'triangle-legend-item', relation.label);
    button.type = 'button';
    button.setAttribute('aria-describedby', tooltip.id);
    legend.appendChild(button);
    relation.legendEl = button;
  });
  root.appendChild(legend);
  root.appendChild(tooltip);

  // ----- what is highlighted: the part under the pointer or with the keyboard focus (hover), else the tapped relation (pinned)
  let hover = null;    // { type: 'source' | 'relation', id }
  let pinned = null;   // a relation id
  const relationOf = (relationId) => relations.find((r) => r.id === relationId);

  function render() {
    const state = hover || (pinned ? { type: 'relation', id: pinned } : null);
    sources.forEach((s) => {
      const related = state && (state.type === 'source' ? state.id === s.id : relationOf(state.id).between.includes(s.id));
      s.el.classList.toggle('is-hot', !!state && state.type === 'source' && state.id === s.id);
      s.el.classList.toggle('is-dim', !!state && !related);
    });
    relations.forEach((r) => {
      const on = state && (state.type === 'relation' ? state.id === r.id : r.between.includes(state.id));
      r.el.classList.toggle('is-on', !!on);
      r.el.classList.toggle('is-dim', !!state && !on);
      r.legendEl.classList.toggle('is-on', !!on);
      r.legendEl.classList.toggle('is-dim', !!state && !on);
      r.legendEl.setAttribute('aria-expanded', !!(state && state.type === 'relation' && state.id === r.id));
    });
    const shown = state && state.type === 'relation' ? relationOf(state.id) : null;
    tooltip.hidden = !shown;
    if (shown) {
      tooltip.textContent = shown.text;
      tooltip.dataset.place = shown.tooltip;
    }
  }
  const setHover = (type, partId) => { hover = { type, id: partId }; render(); };
  const clearHover = () => { hover = null; render(); };

  sources.forEach((s) => {
    ['mouseenter', 'focus'].forEach((type) => s.el.addEventListener(type, () => setHover('source', s.id)));
    ['mouseleave', 'blur'].forEach((type) => s.el.addEventListener(type, clearHover));
  });
  relations.forEach((r) => {
    [r.el, r.legendEl].forEach((el) => {
      ['mouseenter', 'focus'].forEach((type) => el.addEventListener(type, () => setHover('relation', r.id)));
      ['mouseleave', 'blur'].forEach((type) => el.addEventListener(type, clearHover));
      // a click or a tap keeps the text open (touch has no hover); another click closes it
      el.addEventListener('click', () => { pinned = pinned === r.id ? null : r.id; render(); });
    });
    // Enter and Space work like a click on the arrow (an SVG group is not a real button)
    r.el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); r.el.click(); }
    });
  });
  document.addEventListener('click', (event) => {
    if (pinned && !root.contains(event.target)) { pinned = null; render(); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (pinned || hover)) { pinned = null; hover = null; render(); }
  });

  // phone: crop the drawing to the triangle itself
  const compact = window.matchMedia(TRIANGLE_COMPACT_QUERY);
  const fit = () => svg.setAttribute('viewBox', compact.matches ? TRIANGLE_VIEWBOX_COMPACT : TRIANGLE_VIEWBOX);
  fit();
  compact.addEventListener('change', fit);

  render();
  return root;
}

// ---------- the small triangle ----------

// Shapes only (Figma "Triangle A mini"): the white middle triangle and the three sources; the one of pageId in the color of its page.
const TRIANGLE_MINI = [
  'M23 6.73L15.23 20.19C14.5633 21.3433 14.8967 21.92 16.23 21.92H31.77C33.1033 21.92 33.4367 21.3433 32.77 20.19L25 6.73C24.3333 5.57667 23.6667 5.57667 23 6.73Z',
  'M11.5 26.65L3.73 40.11C3.06333 41.2633 3.39667 41.84 4.73 41.84H20.27C21.6033 41.84 21.9367 41.2633 21.27 40.11L13.5 26.65C12.8333 25.4967 12.1667 25.4967 11.5 26.65Z',
  'M34.5 26.65L26.73 40.11C26.0633 41.2633 26.3967 41.84 27.73 41.84H43.27C44.6033 41.84 44.9367 41.2633 44.27 40.11L36.5 26.65C35.8333 25.4967 35.1667 25.4967 34.5 26.65Z'
];
const TRIANGLE_MINI_MIDDLE = 'M16.23 23.92H31.77C33.1033 23.92 33.4367 24.4967 32.77 25.65L25 39.11C24.3333 40.2633 23.6667 40.2633 23 39.11L15.23 25.65C14.5633 24.4967 14.8967 23.92 16.23 23.92Z';

// The link with the small triangle for the page pageId, or null when that page is not one of the sources.
function buildMiniTriangle(pageId) {
  const c = CONTENT.triangulation;
  const index = c.sources.findIndex((s) => s.page === pageId);
  if (index < 0) return null;
  const link = triHtml('a', 'triangle-mini');
  link.href = '#home/triangle';
  link.dataset.section = pageId;   // the highlighted shape takes the color of this page
  link.setAttribute('aria-label', fillPlaceholders(c.texts.miniAria, { name: pageLabelOf(pageId) }));
  const svg = svgEl('svg', { viewBox: '0 0 48 48', width: 48, height: 48, 'aria-hidden': 'true', focusable: 'false' });
  svg.appendChild(svgEl('path', { class: 'triangle-mini-middle', d: TRIANGLE_MINI_MIDDLE }));
  TRIANGLE_MINI.forEach((d, i) => svg.appendChild(svgEl('path', { class: i === index ? 'triangle-mini-shape is-hot' : 'triangle-mini-shape', d })));
  link.appendChild(svg);
  return link;
}

// ---------- the line under the intro of a research page ----------

// "This page answers: where and how much? For when, see Climatology → For why, see Stakeholders →"
function buildAnswersLine(pageId) {
  const c = CONTENT.triangulation;
  const own = c.sources.find((s) => s.page === pageId);
  if (!own) return null;
  const line = triHtml('p', 'triangle-answers');
  const question = own.question.charAt(0).toLowerCase() + own.question.slice(1);
  line.appendChild(document.createTextNode(c.texts.answersLead + ' ' + question + ' '));
  c.sources.filter((s) => s.page !== pageId).forEach((s) => {
    line.appendChild(document.createTextNode(fillPlaceholders(c.texts.answersSee, { short: s.short }) + ' '));
    const link = triHtml('a', 'triangle-answers-link', pageLabelOf(s.page) + ' →');
    link.href = '#' + s.page;
    link.dataset.section = s.page;   // the link has the color of the page it goes to
    line.appendChild(link);
    line.appendChild(document.createTextNode(' '));
  });
  return line;
}
