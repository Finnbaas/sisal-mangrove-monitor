/**********************************************************************
 * SISAL — FILE 2 (MONTHLY VERSION): MONTHLY MAX NDVI AT FIXED SAMPLE
 * POINTS, WITH THE EXACT DATE OF EACH MAX NDVI OBSERVATION
 *
 * Companion to sisal_point_selection.js. Uses a FIXED set of points (chosen once in that script, exported to CSV, uploaded here as a
 * Table asset) instead of drawing a fresh random sample every time so re-running this script never changes which points you're
 * analyzing, only which dates/data you extract for them.
 *
 * WHY MONTHLY, NOT ANNUAL: this project is shifting focus from generic
 * early-warning-signal indicators toward finding specific tipping points and relating them to specific storms/extreme weather events.
 * Storms happen on specific dates, not specific years - annual
 * compositing collapses an entire year into one number, which can hide exactly when within that year a transition happened. Monthly resolution lets you line up an NDVI drop against a specific storm
 * date directly.
 *
 * THE 'date' COLUMN: for each point and month, 'date' is the acquisition
 * date (UTC, YYYY-MM-dd) of the Landsat scene that gave that month's maximum NDVI at that point - not the first of the month. Different
 * points can have different dates in the same month.
 *
 * BEFORE RUNNING - one-time setup:
 *   1. Run sisal_point_selection.js and download Sisal_sample_points.csv
 *      from Google Drive.
 *   2. In the Earth Engine Code Editor, go to the Assets tab (left
 *      panel) -> New -> "CSV file (Table upload)" -> select that CSV.
 *   3. During upload, Earth Engine may offer to set X/Y columns to
 *      auto-generate point geometry - not required either way, since
 *      this script rebuilds point geometry from lon/lat itself.
 *   4. Once the upload finishes, find the asset in the Assets tab,
 *      copy its full asset ID, and paste it into POINTS_ASSET_ID below.
 *
 * After that one-time setup, just re-run this script whenever you want
 * fresh NDVI data - the point set stays fixed.
 *********************************************************************/

/*====================================================================
 * 0. LOAD THE FIXED POINTS
 *===================================================================*/

var POINTS_ASSET_ID = 'projects/mdp-sisal/assets/Points_2409';  // <-- UPDATE THIS if needed

var samplePointsRaw = ee.FeatureCollection(POINTS_ASSET_ID);

// Rebuild each point as a fresh Feature with explicit Point geometry from
// lon/lat, rather than relying on whatever geometry the CSV upload
// produced (which came through as MultiPoint) - keeps the geometry type
// clean and unambiguous regardless of upload quirks.
var samplePoints = samplePointsRaw.map(function (f) {
  var lon = ee.Number(f.get('lon'));
  var lat = ee.Number(f.get('lat'));
  return ee.Feature(ee.Geometry.Point([lon, lat]), {
    point_id: f.get('point_id'),
    traj: f.get('traj'),
    lon: lon,
    lat: lat
  });
});

print('Total points loaded (should be 150):', samplePoints.size());

Map.centerObject(samplePoints, 12);
Map.setOptions('SATELLITE');

var CLASS_COLORS = {
  1: '#12301f', 2: '#9fbf6a', 3: '#e31a1c', 4: '#1f78b4', 5: '#ffd92f'
};
var CLASS_LABELS = {
  1: 'Stable interior', 2: 'Stable edge', 3: 'Monotonic loss',
  4: 'Monotonic gain', 5: 'Ambiguous / high turnover'
};
[1, 2, 3, 4, 5].forEach(function (c) {
  var pts = samplePoints.filter(ee.Filter.eq('traj', c));
  Map.addLayer(pts, {color: CLASS_COLORS[c]},
    'Points - class ' + c + ' (' + CLASS_LABELS[c] + ')');
});


/*====================================================================
 * 1. MONTHLY MAX NDVI PER POINT (Landsat, full archive) -> CSV
 *===================================================================*/

// ---- CHANGE THE TIME RANGE HERE ----
// START_YEAR controls where the exported time series begins. Earlier
// years have very few Landsat images per month (often 0-1, single
// satellite only) - if you want to skip the noisiest early period,
// raise this. END_YEAR = null means "run through the present"; set a
// number to cap it (e.g. if you want to stop before the most recent,
// still-incomplete year).
var START_YEAR = 1993;
var END_YEAR = null;   // null = through today; or e.g. 2023

var GRID_SCALE = 25;  // must match the scale used when points were selected

var MS_PER_DAY = 86400000;

function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  return image.addBands(opticalBands, null, true);
}

// QA_PIXEL cloud/shadow bits are defined the same way across all
// Collection 2 Level-2 Landsat sensors.
function maskLandsatClouds(image) {
  var qa = image.select('QA_PIXEL');
  var cloudBit = 1 << 3;
  var shadowBit = 1 << 4;
  var mask = qa.bitwiseAnd(cloudBit).eq(0).and(qa.bitwiseAnd(shadowBit).eq(0));
  return image.updateMask(mask);
}

// TM (Landsat 5) and ETM+ (Landsat 7): red = SR_B3, NIR = SR_B4
function addNDVI_TM(image) {
  var ndvi = image.normalizedDifference(['SR_B4', 'SR_B3']).rename('NDVI');
  return image.addBands(ndvi);
}

// OLI (Landsat 8/9): red = SR_B4, NIR = SR_B5
function addNDVI_OLI(image) {
  var ndvi = image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
  return image.addBands(ndvi);
}

// Adds a band holding this scene's acquisition date as days since
// 1970-01-01 (UTC). It is masked wherever NDVI is masked, so cloudy
// pixels never contribute a date. qualityMosaic (below) carries this
// band along with whichever scene wins the max-NDVI comparison.
function addDateBand(image) {
  var days = ee.Number(image.date().millis()).divide(MS_PER_DAY).floor();
  var dateBand = ee.Image.constant(days).rename('date_days').toFloat()
    .updateMask(image.select('NDVI').mask());
  return image.addBands(dateBand);
}

// Filtered by the fixed points' own extent, not a separately-maintained
// AOI polygon - one less thing to keep in sync between the two scripts.
var l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2').filterBounds(samplePoints);
var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2').filterBounds(samplePoints);
var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterBounds(samplePoints);
var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filterBounds(samplePoints);

var landsatTM = l5.merge(l7)
  .map(applyScaleFactors).map(maskLandsatClouds).map(addNDVI_TM).select('NDVI')
  .map(addDateBand);
var landsatOLI = l8.merge(l9)
  .map(applyScaleFactors).map(maskLandsatClouds).map(addNDVI_OLI).select('NDVI')
  .map(addDateBand);
var landsatAll = landsatTM.merge(landsatOLI);   // bands: NDVI, date_days

print('Total Landsat images over sample points (all sensors, from ' + START_YEAR + '):',
  landsatAll.filterDate(ee.Date.fromYMD(START_YEAR, 1, 1), ee.Date(Date.now())).size());

// Build the list of month-start dates to composite, from START_YEAR
// through END_YEAR (or today if END_YEAR is null).
var startDate = ee.Date.fromYMD(START_YEAR, 1, 1);
var endDate = END_YEAR === null ? ee.Date(Date.now()) : ee.Date.fromYMD(END_YEAR + 1, 1, 1);
var nMonths = endDate.difference(startDate, 'month').floor();
var monthOffsets = ee.List.sequence(0, nMonths.subtract(1));

var monthlyMaxNDVI = ee.ImageCollection(monthOffsets.map(function (m) {
  m = ee.Number(m);
  var monthStart = startDate.advance(m, 'month');
  var monthEnd = monthStart.advance(1, 'month');
  var monthImages = landsatAll.filterDate(monthStart, monthEnd);
  var count = monthImages.size();

  // ee.ImageCollection([]).qualityMosaic() on an EMPTY collection returns
  // an image with NO BANDS at all - so a month with zero Landsat images
  // would crash the later .select() call downstream. Substitute a
  // fully-masked placeholder with the same two band names for those
  // months; reduceRegions then returns null for that point-month, which
  // the notNull() filter below already drops.
  var placeholder = ee.Image.constant([0, 0]).rename(['NDVI', 'date_days']).toFloat().selfMask();

  // qualityMosaic('NDVI') keeps, per pixel, ALL bands of the scene with the
  // highest NDVI - so NDVI is the monthly max (same value .max() would
  // give) and date_days is the date of the scene that produced it.
  var composite = ee.Image(ee.Algorithms.If(count.gt(0), monthImages.qualityMosaic('NDVI'), placeholder));

  return composite
    .set('year', monthStart.get('year'))
    .set('month', monthStart.get('month'))
    .set('image_count', count);
}));

// Extract the monthly max NDVI and its date at each point, for every month
// -> long table. With a multi-band image reduceRegions names each output
// property after its BAND, so renaming the bands here to 'ndvi_max' and
// 'date_days' is what makes those exact column names appear.
var ndviLongTable = monthlyMaxNDVI.map(function (image) {
  var year = image.get('year');
  var month = image.get('month');
  var count = image.get('image_count');
  return image.select(['NDVI', 'date_days'], ['ndvi_max', 'date_days']).reduceRegions({
    collection: samplePoints,
    reducer: ee.Reducer.mean(),
    scale: GRID_SCALE
  }).map(function (f) {
    return f.set('year', year)
            .set('month', month)
            .set('n_images_that_month', count);
  });
}).flatten();

// Drop (point, month) rows with no cloud-free Landsat coverage that month.
// Done BEFORE building the date string, so no null ever reaches ee.Date.
ndviLongTable = ndviLongTable.filter(ee.Filter.notNull(['ndvi_max', 'date_days']));

// Turn days-since-1970 back into a readable YYYY-MM-dd string.
ndviLongTable = ndviLongTable.map(function (f) {
  var d = ee.Date(ee.Number(f.get('date_days')).round().multiply(MS_PER_DAY));
  return f.set('date', d.format('YYYY-MM-dd'));
});

print('Total (point x month) rows in export:', ndviLongTable.size());
print('First row (check that ndvi_max and date exist):', ndviLongTable.first());

Export.table.toDrive({
  collection: ndviLongTable,
  description: 'Sisal_Landsat_monthly_max_NDVI_per_point',
  folder: 'GEE_exports',
  fileFormat: 'CSV',
  selectors: ['point_id', 'traj', 'lon', 'lat', 'year', 'month', 'date', 'ndvi_max', 'n_images_that_month']
});

// Resulting CSV columns:
//   point_id            - stable per-point ID
//   traj                - trajectory class (1-5) this point was drawn from
//   lon, lat            - point coordinates (WGS84 degrees)
//   year, month         - calendar year and month (1-12)
//   date                - acquisition date (YYYY-MM-dd, UTC) of the Landsat
//                         scene that gave the max NDVI that month
//   ndvi_max            - max NDVI at that point for that month
//   n_images_that_month - how many cloud-masked Landsat scenes covered the
//                         points that month (counted over all points, so
//                         it is the same for every point in a given month)