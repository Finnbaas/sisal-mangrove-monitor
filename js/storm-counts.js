// storm-counts.js: the "When storms come" card on the Climatology page: all storms near Sisal as two stacked bar
//   charts, per month (J to D, all years together) and per year. Studied storms (the ones in events.json) are at the
//   bottom in the storm colour, the other storms on top in light grey, one block per storm. Hover a bar for the storm
//   names; click a studied storm to select it, the same as clicking it on the map. Nothing is calculated here except
//   the stacking of the bars.
// Reads: data/storms/storm-counts.json (made by analysis/climatology/export_typical_year.py), the texts in
//   content/texts.json ("stormCounts"). Needs events, selectedEventId, selectEvent, MONTHS, parseMonth (climatology-storms.js).
// Uses: helpers.js, charts.js. Used by: main.js (setupStormCounts). Styles: css/climatology.css.

const STORM_COUNTS_FILE = 'data/storms/storm-counts.json';
const COUNT_BAR_SHARE = 0.7;       // width of a bar as a share of its slot

let stormCounts = null;            // contents of data/storms/storm-counts.json

async function setupStormCounts() {
  try {
    const response = await fetch(STORM_COUNTS_FILE);
    if (!response.ok) throw new Error(STORM_COUNTS_FILE + ' (HTTP ' + response.status + ')');
    stormCounts = await response.json();
    renderStormCounts();
  } catch (err) {
    $('storm-counts-status').textContent = t('messages.couldNotLoadStormCounts', { error: err.message });
    console.error(err);
  }
}

// ---------- drawing ----------

// Called after loading, and again when events.json has loaded or another storm is selected.
function renderStormCounts() {
  if (!stormCounts || !Array.isArray(stormCounts.storms)) return;
  const storms = stormCounts.storms;
  const first = stormCounts.record.start, last = stormCounts.record.end;
  const monthNames = t('labels.monthsLong').split(',');

  // the intro of the storms section: the totals come from the JSON files (events.json = the storms studied in detail)
  const intro = $('intro-storms');
  if (intro && intro.dataset.template && Array.isArray(events) && events.length) {
    const values = { total: storms.length, start: first, end: last, studied: events.length };
    intro.textContent = Object.entries(values).reduce((text, [k, v]) => text.split('{' + k + '}').join(v), intro.dataset.template);
  }

  // legend: the two kinds of storm
  const legend = $('storm-counts-legend');
  legend.innerHTML = '';
  [['studied', 'studied'], ['other', 'other']].forEach(([cls, key]) => {
    const item = document.createElement('span');
    item.className = 'lg';
    item.innerHTML = '<span class="lg-swatch count-' + cls + '"></span><span></span>';
    item.lastChild.textContent = t('stormCounts.' + key);
    legend.appendChild(item);
  });

  // the two charts: a slot per month, and a slot per year
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const box = $('storm-counts-charts');
  const tip = $('storm-counts-tip');
  box.innerHTML = '';
  box.appendChild(countChart({
    label: t('stormCounts.chartLabel'), unit: t('stormCounts.perMonth'), slots: months,
    storms: storms, slotOf: (s) => s.month, nameOf: (s) => s.name + ' ' + s.year, titleOf: (m) => monthNames[m - 1],
    axis: months.map((m) => ({ slot: m, text: MONTHS[m - 1].charAt(0) })), axisTitle: t('stormCounts.monthAxisTitle'), tip: tip,
  }));
  box.appendChild(countChart({
    label: t('stormCounts.chartLabel'), unit: t('stormCounts.perYear'), slots: years,
    storms: storms, slotOf: (s) => s.year, nameOf: (s) => s.name, titleOf: (y) => String(y),
    axis: years.filter((y) => y % 10 === 0).map((y) => ({ slot: y, text: String(y) })), axisTitle: t('stormCounts.yearAxisTitle'), tip: tip,
  }));
  box.appendChild(tip);

  // text under the charts, from the numbers in the JSON
  const sum = stormCounts.summary || {};
  const peak = (sum.peakMonths || []).map((m) => monthNames[m - 1]).join(' ' + t('stormCounts.and') + ' ');
  $('storm-counts-text').textContent = t('stormCounts.summary', {
    total: sum.total, start: first, end: last, firstMonth: monthNames[sum.firstMonth - 1], lastMonth: monthNames[sum.lastMonth - 1], peak: peak,
  });

  // footnote: studied storms that are not in the counts (needs events.json)
  const counted = new Set(storms.map((s) => s.hurdatId));
  const missing = events.filter((e) => !counted.has(e.hurdatId)).map((e) => {
    const m = parseMonth(e.month);
    return e.name + (m ? ' ' + m.year : '');
  });
  $('storm-counts-note').textContent = missing.length ? t('stormCounts.notCounted', { storms: missing.join(', ') }) : '';
}

// One bar chart as a chart row with its own x axis under it.
// o = { label, unit, slots (the x positions, e.g. the 12 months), storms, slotOf(storm), nameOf(storm), titleOf(slot),
//       axis: [{ slot, text }], axisTitle, tip }
function countChart(o) {
  // the storms of every slot: studied first, so they are drawn at the bottom
  const bySlot = new Map(o.slots.map((s) => [s, []]));
  o.storms.forEach((s) => { if (bySlot.has(o.slotOf(s))) bySlot.get(o.slotOf(s)).push(s); });
  bySlot.forEach((list) => list.sort((a, b) => Number(b.studied) - Number(a.studied)));

  // y scale: whole numbers only
  const max = Math.max(1, ...[...bySlot.values()].map((l) => l.length));
  const step = niceStep(Math.max(1, max / 4));
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const yOf = (v) => PLOT.bottom - 1 - v / top * (PLOT.bottom - PLOT.top - 6);
  const slotW = (PLOT.right - PLOT.left) / o.slots.length;
  const xOf = (i) => PLOT.left + (i + 0.5) * slotW;          // middle of slot i

  let svg = chartHead({ label: o.label + ' ' + o.unit }, [], 'bar chart') + chartYAxis({ ticks: ticks, decimals: 0 }, yOf, true);
  const selected = getSelectedEvent();
  o.slots.forEach((slot, i) => {
    const list = bySlot.get(slot);
    const x = xOf(i) - slotW * COUNT_BAR_SHARE / 2;
    // transparent column over the whole height: hover anywhere above a bar also works
    svg += '<rect class="count-hit" data-bar="' + slot + '" x="' + (xOf(i) - slotW / 2).toFixed(1) + '" y="' + PLOT.top + '" width="' + slotW.toFixed(1) + '" height="' + (PLOT.bottom - PLOT.top) + '"></rect>';
    list.forEach((s, k) => {
      const y = yOf(k + 1);
      const isSelected = selected && selected.hurdatId === s.hurdatId;
      svg += '<rect class="count-block ' + (s.studied ? 'count-studied' : 'count-other') + (isSelected ? ' selected' : '') + '" data-bar="' + slot + '"' +
        (s.studied ? ' data-hurdat="' + s.hurdatId + '"' : '') +
        ' x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (slotW * COUNT_BAR_SHARE).toFixed(1) + '" height="' + (yOf(k) - y).toFixed(1) + '"></rect>';
    });
  });
  svg += '<rect class="plot-axis" x="' + PLOT.left + '" y="' + (PLOT.bottom - 1) + '" width="' + (PLOT.right - PLOT.left) + '" height="1"></rect></svg>';

  const wrap = document.createElement('div');
  const row = chartRow({ label: o.label, unit: o.unit }, null, svg);
  row.querySelector('.source-tag').remove();                  // the source is named in the footnote of the card
  wrap.appendChild(row);
  wrap.appendChild(sharedAxis(o.axis.map((a) => ({ x: xOf(o.slots.indexOf(a.slot)), text: a.text })), o.axisTitle));

  // hover: the storm names of the bar; click a studied storm: select it (as on the map)
  const svgEl = row.querySelector('svg');
  const container = $('storm-counts-charts');
  svgEl.addEventListener('pointermove', (e) => {
    const slot = e.target.dataset ? e.target.dataset.bar : null;
    if (slot === null || slot === undefined) return;
    const list = bySlot.get(Number(slot)) || [];
    if (!list.length) { o.tip.hidden = true; return; }
    o.tip.textContent = o.titleOf(Number(slot)) + ': ' + list.map(o.nameOf).join(', ');
    o.tip.hidden = false;
    const c = container.getBoundingClientRect();
    o.tip.style.left = Math.max(0, Math.min(e.clientX - c.left + 12, c.width - o.tip.offsetWidth - 4)) + 'px';
    o.tip.style.top = (e.clientY - c.top + 14) + 'px';
  });
  svgEl.addEventListener('pointerleave', () => { o.tip.hidden = true; });
  svgEl.addEventListener('click', (e) => {
    const id = e.target.dataset ? e.target.dataset.hurdat : null;
    const ev = id ? events.find((x) => x.hurdatId === id) : null;
    if (ev) selectEvent(ev.id);
  });
  return wrap;
}
