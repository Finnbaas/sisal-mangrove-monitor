// main.js: starts the site: first the content (content.js), then every screen.
// Loaded last; every other js file only defines functions.

// ---------- start ----------
// First the content (content.js), then everything else. If a content file has a problem,
// the page shows a message naming the file instead of a blank page.

async function start() {
  try {
    await loadContent();
  } catch (err) {
    showContentError(err);
    return;
  }
  fillTexts();             // content.js: all data-text="..." texts
  buildPages();            // content.js: menu, pages and simple cards from content/pages.json
  readSharedContent();     // helpers.js: year range, change classes and the "No data" text
  readPointContent();
  RESEARCH_SECTIONS = pageSections().map((s) => s.id);
  DEFAULT_SECTION = RESEARCH_SECTIONS[0];
  lastResearchSection = DEFAULT_SECTION;

  setupStorms();           // climatology-storms.js: event list and storm charts of the Climatology screen
  setupStormMap();         // storm-map.js: the map of the storm tracks on the Climatology screen
  setupWaveRose();         // wave-rose.js: the wave direction rose on the Climatology screen
  setupClimate();          // climatology-climate.js: "Climate at Sisal" on the Climatology screen
  setupStakeholders();     // stakeholders.js: areas, time card and panel of the Stakeholder screen
  setupMethod();           // method.js: the Method page and the "Do this analysis yourself" links
  setupNavigation();
  setupSlider();
  setupExports();
  setYear(YEAR_MAX);
  loadPoints();
}

start();
