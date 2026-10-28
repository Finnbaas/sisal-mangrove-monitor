// landing.js: builds the landing page (#home) from content/landing.json.
//   Hero (image band with two buttons), the four page cards, the study area (map with its outline) and the About card.
//   The page cards take the colors of their own page: a card has data-section="<page id>", so the theme colors of
//   that page (css/base.css) apply inside the card. The Ecosystem card and the study-area map use
//   data/vegetation/layers.json (bounds of the images, outline of the study area).
// Reads: content/landing.json (through content.js), data/vegetation/layers.json.
// Uses: content.js (CONTENT, t). Used by: main.js (buildLanding).

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

  // ----- the four page cards
  const pages = landingEl('div', 'landing-section');
  pages.appendChild(landingEl('h2', 'landing-title', c.pagesTitle));
  const cards = landingEl('div', 'landing-cards');
  const ecosystemThumbs = [];   // thumbnails that need the bounds of data/vegetation/layers.json
  const wideCards = [];          // cards with "wide": true
  c.cards.forEach((card) => {
    const a = landingEl('a', 'landing-card');
    a.href = '#' + card.page;
    a.dataset.section = card.page;     // the theme colors of that page apply inside the card
    const thumb = landingEl('div', 'landing-thumb');
    if (typeof card.image === 'string') {
      const img = landingEl('img');
      img.src = card.image;
      img.alt = '';
      thumb.appendChild(img);
    } else if (card.image && card.image.base) {
      // the change layer on the base map, placed with the bounds of layers.json
      const stage = landingEl('div', 'landing-stage');
      const base = landingEl('img');
      base.src = card.image.base;
      base.alt = '';
      const layer = landingEl('img', 'landing-layer');
      layer.src = card.image.layer;
      layer.alt = '';
      stage.appendChild(base);
      stage.appendChild(layer);
      thumb.appendChild(stage);
      ecosystemThumbs.push(layer);
    }
    a.appendChild(thumb);
    const body = landingEl('div', 'landing-card-body');
    body.appendChild(landingEl('div', 'landing-card-name', card.name));
    body.appendChild(landingEl('div', 'landing-card-question', card.question));
    body.appendChild(landingEl('div', 'landing-card-open', c.openLabel));
    a.appendChild(body);
    // a "wide" card (content/landing.json) is a long block under the other cards
    if (card.wide) {
      a.classList.add('landing-card-wide');
      wideCards.push(a);
    } else {
      cards.appendChild(a);
    }
  });
  pages.appendChild(cards);
  wideCards.forEach((a) => pages.appendChild(a));
  section.appendChild(pages);

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
  placeLandingLayers(map, ecosystemThumbs);
}

// The outline of the study area on the map and the place of the change layer on the base map: both come
// from data/vegetation/layers.json (basemapBounds, layerBounds, basemap.aoi). Numbers are only used to place things.
async function placeLandingLayers(map, layerImages) {
  try {
    const response = await fetch('data/vegetation/layers.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const layers = await response.json();
    const b = layers.basemapBounds, l = layers.layerBounds;
    const width = b.east - b.west, height = b.north - b.south;
    // the change layer: its bounds as a share of the base map (the same as on the Ecosystem page)
    layerImages.forEach((img) => {
      img.style.left = ((l.west - b.west) / width * 100) + '%';
      img.style.top = ((b.north - l.north) / height * 100) + '%';
      img.style.width = ((l.east - l.west) / width * 100) + '%';
      img.style.height = ((l.north - l.south) / height * 100) + '%';
    });
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
