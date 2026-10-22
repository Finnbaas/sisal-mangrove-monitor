// navigation.js: switching between the screens.
//   Every page has its own address (#overview, #satellite, #climatology, #stakeholders, #method).
//   Links only change the address; showScreen() then shows that screen, moves the cards it needs into
//   place (placeCards) and sets the section colors. The back and forward buttons work too.
// Reads: the page list of content/pages.json (through content.js).
// Uses: helpers.js, content.js, method.js (openMethodTarget). Used by: main.js, method.js.

// ---------- navigation: screens and the address (#...) ----------
//
// Every page in content/pages.json has its own address (#overview, #satellite, ...), plus #method.
// Links and buttons only change the address; showScreen() then shows the matching screen.
// Because every switch changes the address, the browser's back and forward buttons work too.

let RESEARCH_SECTIONS = [];      // page ids from content/pages.json, in menu order
let DEFAULT_SECTION = null;      // the first page in content/pages.json
let lastResearchSection = null;  // the last research page (its id, e.g. "satellite")
let lastResearchAddress = null;  // the full address of that page, with its part (e.g. "satellite/tipping"): where the
                                 // "Research" tab and the "Back to ..." link of the Method page take you back to

// The Overview theme colors are the default; pages without their own theme in css/base.css use them.
const THEME_DEFAULT = 'overview';

// The screen named in the address, or null if the address is empty or unknown.
function screenFromAddress() {
  // the part before a slash is the screen: #method/<use case> is still the Method screen (see method.js)
  const name = location.hash.slice(1).split('/')[0];
  return name === 'method' || RESEARCH_SECTIONS.includes(name) ? name : null;
}

// A page whose parts are tabs ("partsAsTabs" in content/pages.json) shows one part at a time: the part named after
// the slash in the address (#satellite/ndvi), or the first part (#satellite). Its link in the section navigation is
// marked. Returns the part that is shown, or null for other pages.
function showPart(screenEl) {
  if (!screenEl.classList.contains('parts-as-tabs')) return null;
  const parts = [...screenEl.querySelectorAll('.research-part')];
  if (!parts.length) return null;
  const wanted = location.hash.slice(1).split('/')[1];
  const shown = parts.find((p) => p.dataset.part === wanted) || parts[0];
  parts.forEach((p) => { p.hidden = p !== shown; });
  screenEl.querySelectorAll('.section-nav-item').forEach((link) => {
    const current = link.dataset.part === shown.dataset.part;
    link.classList.toggle('current', current);
    if (current) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
  return shown;
}

// On a page with parts below each other, an address with a part (#satellite/ndvi) scrolls to that part.
// Returns true when it scrolled.
function scrollToPart() {
  const [screen, partId] = location.hash.slice(1).split('/');
  if (!partId || screen === 'method') return false;
  const screenEl = document.querySelector('[data-screen="' + screen + '"]');
  if (!screenEl || screenEl.classList.contains('parts-as-tabs')) return false;
  const part = screenEl.querySelector('.research-part[data-part="' + partId + '"]');
  if (!part) return false;
  part.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

// Opening or reloading the site on the address of a part (#satellite/tipping): at that moment the data and images
// are still loading, so the parts above it grow afterwards and push it down. So the page jumps to the part again
// every time the page changes size, until the visitor scrolls, clicks or types (or after 10 seconds).
function scrollToPartWhileLoading() {
  const [screen, partId] = location.hash.slice(1).split('/');
  const screenEl = screen && partId ? document.querySelector('[data-screen="' + screen + '"]') : null;
  if (!screenEl || screenEl.classList.contains('parts-as-tabs')) return;
  const part = screenEl.querySelector('.research-part[data-part="' + partId + '"]');
  if (!part) return;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';   // a reload does not restore the old position
  const jump = () => part.scrollIntoView({ block: 'start' });
  const observer = new ResizeObserver(jump);
  observer.observe(screenEl);
  const stop = () => {
    observer.disconnect();
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((type) => window.removeEventListener(type, stop));
  };
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((type) => window.addEventListener(type, stop, { passive: true }));
  setTimeout(stop, 10000);
  jump();
}

// Every research card exists once in index.html (data-card="map", ...). A section has empty slots
// (data-slot="map", ...). This moves each card into the matching slot of the section being shown,
// so one card (with its data, selected point and year) can appear in several sections.
function placeCards(screenEl) {
  screenEl.querySelectorAll('[data-slot]').forEach((slot) => {
    const card = document.querySelector('[data-card="' + slot.dataset.slot + '"]');
    if (card && card.parentElement !== slot) slot.appendChild(card);
  });
}

function showScreen() {
  let screen = screenFromAddress();
  if (!screen) {
    // empty or unknown address: show Overview, and correct the address without adding a back-button step
    screen = DEFAULT_SECTION;
    history.replaceState(null, '', '#' + screen);
  }
  const isMethod = screen === 'method';
  if (!isMethod) {
    lastResearchSection = screen;
    lastResearchAddress = location.hash.slice(1);
  }

  // show only the matching screen, and move the cards it needs into its slots (on a page with parts as tabs: only
  // into the part that is shown, so a card that is used in several parts moves along to the visible one)
  document.querySelectorAll('[data-screen]').forEach((el) => {
    el.hidden = el.dataset.screen !== screen;
    if (!el.hidden) placeCards(showPart(el) || el);
  });

  // page navigation in the top bar, with the current page marked (the Method page too)
  document.querySelectorAll('.subtab').forEach((link) => {
    const current = link.getAttribute('href') === '#' + screen;
    link.classList.toggle('active', current);
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  // section colors (see the section themes in css/base.css): a page without its own theme, and the
  // Method page, use the Overview colors
  document.body.dataset.section = isMethod ? THEME_DEFAULT : screen;
}

function setupNavigation() {
  // footer link "Read the method": opens the Method page at the top
  $('footer-method-link').addEventListener('click', () => {
    location.hash = 'method';
    window.scrollTo(0, 0);
  });

  // the address changed (a link, a tab, or the back/forward button): show that screen from the top
  // (a link to one use case on the Method page scrolls to that use case instead: method.js; an address with a part,
  // e.g. #satellite/ndvi, scrolls to that part)
  window.addEventListener('hashchange', () => {
    showScreen();
    if (!openMethodTarget() && !scrollToPart()) window.scrollTo(0, 0);
  });

  showScreen();
  scrollToPartWhileLoading();   // the page was opened (or reloaded) with the address of a part
}
