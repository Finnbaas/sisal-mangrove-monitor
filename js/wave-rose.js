// wave-rose.js: the "Wave direction" card on the Climatology page: a wave rose drawn as SVG. Around a circle,
//   N at the top and clockwise, each of the 8 directions has a wide pale wedge (all days) and a narrower wedge in the
//   full colour (rough-sea days); the length is the share of days that the waves come from that direction.
//   Hover a sector for its numbers. Nothing is calculated here.
// Reads: data/climate/wave-direction.json (made by analysis/climatology/export_typical_year.py), the texts in
//   content/texts.json ("waveRose") and the colour of "waveHeight" in content/variables.json.
// Uses: helpers.js, content.js, charts.js (niceStep). Used by: main.js (setupWaveRose). Styles: css/climatology.css.

const ROSE = { size: 320, center: 160, radius: 112, labelRadius: 130, allWidth: 36, stormWidth: 18 };   // SVG units and wedge widths in degrees

let waveRose = null;      // contents of data/climate/wave-direction.json

async function setupWaveRose() {
  try {
    const response = await fetch('data/climate/wave-direction.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    waveRose = await response.json();
    drawWaveRose();
  } catch (err) {
    $('wave-rose-status').textContent = t('messages.couldNotLoadWaveRose', { error: err.message });
    console.error(err);
  }
}

// The colour of the wave height charts (content/variables.json), so the rose has the same colour as those.
function waveRoseColor() {
  const variable = CONTENT.variables.eventVariables.find((v) => v.id === 'waveHeight');
  return color(colorVarOf(variable && variable.color));
}

// Point at an angle (degrees clockwise from north) and a distance from the centre.
function rosePoint(angle, r) {
  const a = angle * Math.PI / 180;
  return [ROSE.center + r * Math.sin(a), ROSE.center - r * Math.cos(a)];
}

// A wedge from the centre: centred on `angle`, `width` degrees wide, `r` long.
function roseWedge(angle, width, r) {
  const [x1, y1] = rosePoint(angle - width / 2, r), [x2, y2] = rosePoint(angle + width / 2, r);
  return 'M ' + ROSE.center + ' ' + ROSE.center + ' L ' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
    ' A ' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z';
}

function drawWaveRose() {
  const sectors = Array.isArray(waveRose.sectors) ? waveRose.sectors : [];
  const rose = $('wave-rose');
  const tip = $('wave-rose-tip');
  const fill = waveRoseColor();
  const max = Math.max(...sectors.map((s) => Math.max(s.all || 0, s.storm || 0)), 1);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step - 1e-9) * step;          // the outer ring
  const lengthOf = (pct) => (isNumber(pct) ? pct / top * ROSE.radius : 0);

  let svg = '<svg viewBox="0 0 ' + ROSE.size + ' ' + ROSE.size + '" role="img" aria-label="' + t('cardTitles.wave-direction') + '">';
  // light rings with their percentages, in the empty south-west
  for (let pct = step; pct <= top + step / 1000; pct += step) {
    const r = lengthOf(pct), [lx, ly] = rosePoint(225, r);
    svg += '<circle class="rose-ring" cx="' + ROSE.center + '" cy="' + ROSE.center + '" r="' + r.toFixed(1) + '"></circle>' +
      '<text class="plot-tick-label" x="' + (lx + 3).toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '">' + Math.round(pct * 10) / 10 + '%</text>';
  }
  // the wedges: pale for all days, narrower and full colour for rough-sea days
  sectors.forEach((s, i) => {
    const angle = i * 45;
    svg += '<path d="' + roseWedge(angle, ROSE.allWidth, lengthOf(s.all)) + '" fill="' + fill + '" fill-opacity="0.3"></path>' +
      '<path d="' + roseWedge(angle, ROSE.stormWidth, lengthOf(s.storm)) + '" fill="' + fill + '"></path>';
  });
  // the direction labels, and one invisible 45 degree wedge per sector for the hover (highlighted by css)
  sectors.forEach((s, i) => {
    const [x, y] = rosePoint(i * 45, ROSE.labelRadius);
    svg += '<text class="rose-label" x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="middle">' + roseText(s.id, 'short') + '</text>' +
      '<path class="rose-hit" data-index="' + i + '" d="' + roseWedge(i * 45, 45, ROSE.radius) + '" fill="' + fill + '"></path>';
  });
  rose.innerHTML = svg + '</svg>';
  rose.appendChild(tip);

  // hover: the label with the numbers of the sector
  rose.querySelectorAll('.rose-hit').forEach((hit) => {
    const s = sectors[hit.dataset.index];
    const show = (e) => {
      const box = rose.getBoundingClientRect();
      tip.textContent = t('waveRose.hover', { name: roseText(s.id, 'name'), all: pctText(s.all), storm: pctText(s.storm) });
      tip.hidden = false;
      tip.style.left = Math.min(e.clientX - box.left + 14, box.width - tip.offsetWidth - 4) + 'px';
      tip.style.top = Math.max(0, e.clientY - box.top - 34) + 'px';
    };
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('mousemove', show);
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });
  });

  // legend and the note under the rose
  const legend = $('wave-rose-legend');
  legend.innerHTML = '';
  [['0.3', t('waveRose.allDays')], ['1', t('waveRose.stormDays', { threshold: waveRose.threshold })]].forEach(([opacity, text]) => {
    const item = document.createElement('span');
    item.className = 'lg';
    item.innerHTML = '<span class="lg-swatch"></span><span></span>';
    item.firstChild.style.background = fill;
    item.firstChild.style.opacity = opacity;
    item.lastChild.textContent = text;
    legend.appendChild(item);
  });
  const record = waveRose.record || {};
  const days = waveRose.days || {};   // number of days: all days and rough-sea days
  $('wave-rose-note').textContent = t('waveRose.note', { start: (record.start || '').slice(0, 4), end: (record.end || '').slice(0, 4),
    storm: isNumber(days.storm) ? days.storm : NO_DATA, all: isNumber(days.all) ? days.all : NO_DATA });
}

// "East" or "E" for a direction id, from content/texts.json
function roseText(id, kind) {
  return t('waveRose.directions.' + id + '.' + kind);
}

function pctText(value) {
  return isNumber(value) ? value : NO_DATA;
}
