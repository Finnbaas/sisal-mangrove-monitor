// landing.js: builds the landing page (#home) from content/landing.json and content/triangulation.json.
//   Hero (image band with two buttons), "How the three sources fit together" (the triangle of js/triangle.js with the text),
//   the Method card (a link to the Method page, with a picture of code), "What we found in Sisal" and the About card.
//   A link or mark has data-section="<page id>", so it takes the color of that page (css/base.css).
// Reads: content/landing.json and content/triangulation.json (through content.js).
// Uses: content.js (CONTENT), helpers.js (buildCodeImage), triangle.js (buildTriangle, pageLabelOf). Used by: main.js (buildLanding), navigation.js (scrollToLandingTarget).

// A small helper: <tag class="..."> with text.
function landingEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// The full address of an image: a url() in a CSS variable is read relative to the css file.
function landingUrl(path) {
  return new URL(path, location.href).href;
}

// Builds the landing section and puts it before the card library. Called once by main.js.
function buildLanding() {
  const c = CONTENT.landing;
  const section = landingEl('section', 'landing');
  section.dataset.screen = 'home';
  section.hidden = true;

  // ----- hero: the image band with the title, the sentence and two buttons
  const hero = landingEl('div', 'page-band landing-hero');
  if (c.hero.image) hero.style.setProperty('--band-image', 'url("' + landingUrl(c.hero.image) + '")');
  hero.appendChild(landingEl('h2', '', c.hero.title));
  hero.appendChild(landingEl('p', 'landing-hero-text', c.hero.text));
  const buttons = landingEl('div', 'landing-buttons');
  c.hero.buttons.forEach((b) => {
    const a = landingEl('a', 'button ' + (b.style === 'outline' ? 'outline' : 'filled'), b.label);
    a.href = b.href;
    buttons.appendChild(a);
  });
  hero.appendChild(buttons);
  section.appendChild(hero);

  // ----- how the three sources fit together: the triangle with the text next to it (js/triangle.js, content/triangulation.json)
  section.appendChild(buildTriangleSection());

  // ----- the Method card: a link to the Method page
  section.appendChild(buildMethodCard());

  // ----- what we found in Sisal: how the three sources relate, in pairs
  section.appendChild(buildFoundSection());

  // ----- About: four columns
  const about = landingEl('div', 'card landing-about');
  c.about.columns.forEach((col) => {
    const el = landingEl('div', 'landing-about-col');
    el.appendChild(landingEl('div', 'about-label', col.label));
    el.appendChild(landingEl('p', '', col.text));
    about.appendChild(el);
  });
  section.appendChild(about);

  $('card-library').parentNode.insertBefore(section, $('card-library'));
}

// One card: the triangle (js/triangle.js) on the left, on the right the title, two paragraphs and the page links.
// The text starts at the top of the triangle. The block has data-landing="triangle", so #home/triangle scrolls to it
// (the small triangle on the research pages links there).
function buildTriangleSection() {
  const c = CONTENT.triangulation;
  const part = landingEl('div', 'landing-section');
  part.dataset.landing = 'triangle';
  const card = landingEl('div', 'card landing-triangle');
  card.appendChild(buildTriangle());
  const text = landingEl('div', 'landing-triangle-text');
  text.appendChild(landingEl('h2', 'landing-title', c.landing.title));
  text.appendChild(landingEl('p', '', c.landing.text));
  text.appendChild(landingEl('p', '', c.landing.methodText));
  const links = landingEl('div', 'landing-triangle-links');
  c.landing.exploreLinks.forEach((l) => {
    // a small card: the image band of the page (content/pages.json "band") and the link text
    const a = landingEl('a', 'card landing-link');
    a.href = '#' + l.page;
    a.dataset.section = l.page;   // the card has the color of its page
    const band = pageSections().find((s) => s.id === l.page).band;
    const image = landingEl('span', 'landing-link-image');
    if (band) image.style.setProperty('--card-image', 'url("' + landingUrl(band) + '")');
    a.appendChild(image);
    a.appendChild(landingEl('span', 'landing-link-label', l.label));
    links.appendChild(a);
  });
  text.appendChild(links);
  card.appendChild(text);
  part.appendChild(card);
  return part;
}

// The card that opens the Method page: a picture of code (helpers.js) and next to it the title, a sentence and "Open".
function buildMethodCard() {
  const m = CONTENT.landing.method;
  const card = landingEl('a', 'card landing-method');
  card.href = m.href;
  card.appendChild(buildCodeImage());
  const body = landingEl('div', 'landing-method-body');
  body.appendChild(landingEl('div', 'landing-method-title', m.title));
  body.appendChild(landingEl('p', 'landing-method-text', m.text));
  body.appendChild(landingEl('span', 'landing-method-link', m.link));
  card.appendChild(body);
  return card;
}

// "What we found in Sisal": one row per pair of sources (the "relations" of content/triangulation.json): the two sources
// with a mark in the color of their page, the relation as a small label, and one sentence.
function buildFoundSection() {
  const c = CONTENT.triangulation;
  const part = landingEl('div', 'landing-section');
  part.appendChild(landingEl('h2', 'landing-title', c.found.title));
  part.appendChild(landingEl('p', 'landing-intro', c.found.intro));
  const card = landingEl('div', 'card landing-found');
  c.relations.forEach((relation) => {
    const row = landingEl('div', 'landing-relation');
    const sources = landingEl('div', 'landing-relation-sources');
    relation.between.forEach((pageId, i) => {
      if (i > 0) sources.appendChild(landingEl('span', 'landing-relation-and', c.found.and));
      const source = landingEl('span', 'landing-relation-source');
      source.dataset.section = pageId;   // the mark takes the color of the page
      source.appendChild(landingEl('span', 'landing-mark'));
      source.appendChild(landingEl('span', 'landing-relation-name', pageLabelOf(pageId)));
      sources.appendChild(source);
    });
    row.appendChild(sources);
    row.appendChild(landingEl('div', 'about-label', relation.label.join(' ')));
    row.appendChild(landingEl('p', '', relation.text));
    card.appendChild(row);
  });
  part.appendChild(card);
  const closing = landingEl('div', 'landing-found-closing');
  closing.appendChild(landingEl('p', 'landing-found-line', c.found.closing));
  closing.appendChild(landingEl('p', 'landing-found-source', c.found.source));
  part.appendChild(closing);
  return part;
}

// An address like #home/triangle scrolls to the block of that name on the landing page. Returns true when it did.
function scrollToLandingTarget() {
  const [screen, target] = location.hash.slice(1).split('/');
  if (screen !== HOME || !target) return false;
  const el = document.querySelector('[data-landing="' + target + '"]');
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}
