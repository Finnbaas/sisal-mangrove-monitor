// landing.js: builds the landing page (#home) from content/landing.json and content/triangulation.json.
//   Hero (image band with two buttons), "Three sources, one picture" (the triangle of js/triangle.js with the text),
//   "One event, three views" (three cards with a link per source), the study area (map with its outline) and the About card.
//   A link has data-section="<page id>", so it takes the color of that page (css/base.css). The study-area map uses
//   data/vegetation/layers.json (bounds of the image, outline of the study area).
// Reads: content/landing.json and content/triangulation.json (through content.js), data/vegetation/layers.json.
// Uses: content.js (CONTENT, t), triangle.js (buildTriangle, pageLabelOf). Used by: main.js (buildLanding), navigation.js (scrollToLandingTarget).

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

  // ----- three sources, one picture: the triangle with the text next to it (js/triangle.js, content/triangulation.json)
  section.appendChild(buildTriangleSection());

  // ----- one event, three views: three cards with a link per source
  section.appendChild(buildEventSection());

  // ----- study area: the map with the outline, and the text
  const study = landingEl('div', 'landing-study');
  const map = landingEl('div', 'landing-map');
  const mapImg = landingEl('img');
  mapImg.src = c.studyArea.image;
  mapImg.alt = '';
  map.appendChild(mapImg);
  study.appendChild(map);
  const text = landingEl('div', 'landing-study-text');
  text.appendChild(landingEl('h2', 'landing-title', c.studyArea.title));
  c.studyArea.sentences.forEach((s) => text.appendChild(landingEl('p', c.studyArea.draft ? 'is-draft' : '', s)));
  study.appendChild(text);
  section.appendChild(study);

  // ----- About: three columns
  const about = landingEl('div', 'card landing-about');
  c.about.columns.forEach((col) => {
    const el = landingEl('div', 'landing-about-col');
    el.appendChild(landingEl('div', 'about-label', col.label));
    el.appendChild(landingEl('p', '', col.text));
    about.appendChild(el);
  });
  section.appendChild(about);

  $('card-library').parentNode.insertBefore(section, $('card-library'));
  placeLandingOutline(map);
}

// "Three sources, one picture": the title and, in one card, the triangle with the text and the page links next to it.
// The text starts at the top of the triangle. The block has data-landing="triangle", so #home/triangle scrolls to it
// (the small triangle on the research pages links there).
function buildTriangleSection() {
  const c = CONTENT.triangulation;
  const part = landingEl('div', 'landing-section');
  part.dataset.landing = 'triangle';
  part.appendChild(landingEl('h2', 'landing-title', c.landing.title));
  const card = landingEl('div', 'card landing-triangle');
  card.appendChild(buildTriangle());
  const text = landingEl('div', 'landing-triangle-text');
  text.appendChild(landingEl('p', '', c.landing.text));
  const links = landingEl('div', 'landing-triangle-links');
  c.landing.exploreLinks.forEach((l) => {
    const a = landingEl('a', 'landing-link', l.label);
    a.href = '#' + l.page;
    a.dataset.section = l.page;   // the link has the color of its page
    links.appendChild(a);
  });
  text.appendChild(links);
  card.appendChild(text);
  part.appendChild(card);
  return part;
}

// "One event, three views": one card per event (content/triangulation.json "events"): how the sources agree, the name, one
// sentence and a link per source. A source without anything on the event is shown in grey with the reason instead of a link.
function buildEventSection() {
  const c = CONTENT.triangulation.events;
  const part = landingEl('div', 'landing-section');
  part.appendChild(landingEl('h2', 'landing-title', c.title));
  const cards = landingEl('div', 'landing-events');
  c.cards.forEach((card) => {
    const el = landingEl('div', 'card landing-event');
    el.appendChild(landingEl('div', 'landing-event-kind', card.kind));
    el.appendChild(landingEl('div', 'landing-event-name', card.name));
    el.appendChild(landingEl('p', 'landing-event-text', card.text));
    const links = landingEl('div', 'landing-event-links');
    card.links.forEach((l) => {
      const name = pageLabelOf(l.page);
      if (l.href) {
        const a = landingEl('a', 'landing-link', name + ' →');
        a.href = l.href;
        a.dataset.section = l.page;
        links.appendChild(a);
      } else {
        links.appendChild(landingEl('span', 'landing-event-grey', name + ' · ' + l.grey));
      }
    });
    el.appendChild(links);
    cards.appendChild(el);
  });
  part.appendChild(cards);
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

// The outline of the study area on the map: it comes from data/vegetation/layers.json (basemapBounds, basemap.aoi).
// Numbers are only used to place things.
async function placeLandingOutline(map) {
  try {
    const response = await fetch('data/vegetation/layers.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const layers = await response.json();
    const b = layers.basemapBounds;
    const width = b.east - b.west, height = b.north - b.south;
    // the outline: [longitude, latitude] pairs as a line over the map (a 0-1 box that stretches with the map)
    const points = layers.basemap.aoi.map(([lon, lat]) => ((lon - b.west) / width).toFixed(5) + ',' + ((b.north - lat) / height).toFixed(5));
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'landing-outline');
    svg.setAttribute('viewBox', '0 0 1 1');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const polygon = document.createElementNS(ns, 'polygon');
    polygon.setAttribute('points', points.join(' '));
    svg.appendChild(polygon);
    map.appendChild(svg);
  } catch (err) {
    console.error(err);
    map.appendChild(landingEl('div', 'landing-map-message', t('messages.couldNotLoadEcosystem', { file: 'data/vegetation/layers.json' })));
  }
}
