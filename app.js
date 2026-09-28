let allPoints = [];
let chart = null;

async function loadPoints() {
  const statusEl = document.getElementById('status');
  try {
    const response = await fetch('data/points.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    allPoints = await response.json();

    statusEl.textContent = allPoints.length + ' points loaded';
    populatePointSelect();
    renderChartForSelectedPoint();
  } catch (err) {
    statusEl.textContent = 'Could not load point data: ' + err.message;
    console.error(err);
  }
}

function populatePointSelect() {
  const select = document.getElementById('point-select');
  select.innerHTML = '';
  for (const p of allPoints) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name + ' (' + p.classLabel + ', ' + p.locationType + ')';
    select.appendChild(opt);
  }
  select.addEventListener('change', renderChartForSelectedPoint);
}

function getSelectedPoint() {
  const id = document.getElementById('point-select').value;
  return allPoints.find((p) => p.id === id) || allPoints[0];
}

function nearestIndexForYear(series, year) {
  let bestIdx = 0;
  let bestDiff = Infinity;
  series.forEach((row, i) => {
    const diff = Math.abs(row.year - year);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  });
  return bestIdx;
}

function renderChartForSelectedPoint() {
  const point = getSelectedPoint();
  const labels = point.ndvi.map((row) => row.year);
  const values = point.ndvi.map((row) => row.value);
  const slider = document.getElementById('year-slider');
  const selectedYear = parseInt(slider.value, 10);
  const idx = nearestIndexForYear(point.ndvi, selectedYear);

  const pointRadii = values.map((v, i) => (i === idx ? 7 : 0));
  const pointColors = values.map((v, i) => (i === idx ? '#C1652F' : '#1F4B43'));

  const ctx = document.getElementById('ndvi-chart').getContext('2d');

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].pointRadius = pointRadii;
    chart.data.datasets[0].pointBackgroundColor = pointColors;
    chart.update();
  } else {
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'NDVI',
          data: values,
          borderColor: '#1F4B43',
          borderWidth: 2,
          pointRadius: pointRadii,
          pointBackgroundColor: pointColors,
          tension: 0.15
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { min: 0, max: 1, title: { display: true, text: 'NDVI (index, 0-1)' } },
          x: { title: { display: true, text: 'Year' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  updateYearReadout(point, idx);
}

function updateYearReadout(point, idx) {
  const row = point.ndvi[idx];
  const readout = document.getElementById('year-readout');
  readout.textContent = row.year + ': NDVI ' + row.value.toFixed(3);
}

function setupSlider() {
  const slider = document.getElementById('year-slider');
  const back = document.getElementById('year-back');
  const forward = document.getElementById('year-forward');

  slider.addEventListener('input', renderChartForSelectedPoint);
  back.addEventListener('click', () => {
    slider.value = Math.max(1984, parseInt(slider.value, 10) - 1);
    renderChartForSelectedPoint();
  });
  forward.addEventListener('click', () => {
    slider.value = Math.min(2026, parseInt(slider.value, 10) + 1);
    renderChartForSelectedPoint();
  });
}

setupSlider();
loadPoints();
