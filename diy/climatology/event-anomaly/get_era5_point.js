// get_era5_point.js - optional helper: daily ERA5-Land values for one place, ready for event_anomaly.py.
//
// WHAT IT DOES
//   Reads daily ERA5-Land (land surface reanalysis of ECMWF, 1950 to now) at one point and exports a CSV
//   file to your Google Drive: one "date" column and one column per variable, the input format of
//   event_anomaly.py. Use it when you have no data of your own.
//
// HOW TO USE
//   1. Sign up for Google Earth Engine (free for research and education): https://earthengine.google.com
//   2. Open the Code Editor (https://code.earthengine.google.com), make a new script and paste this file.
//   3. Change the SETTINGS below and press Run.
//   4. Open the "Tasks" tab (top right), press RUN next to the export, then wait until the file is in your
//      Google Drive (a long period can take several minutes).
//
// GOOD TO KNOW
//   - ERA5-Land is a land model on a 9 km grid. A point over the sea has no values (empty columns): use a
//     point on land, or the nearest land cell. The values are those of the grid cell that contains the point.
//   - Days are UTC days. Units are converted here: degrees Celsius, millimetres, metres per second.
//   - Sea variables (waves, sea surface temperature) are NOT in ERA5-Land. Get them from the ERA5 hourly
//     data of the Copernicus Climate Data Store (https://cds.climate.copernicus.eu) and add them to the CSV
//     as extra columns with the same dates.
//   - Written for the Sisal Mangrove Monitor (TU Delft and UNAM). This script has not been run in Earth
//     Engine yet. If a band name is rejected, check the dataset page "ECMWF/ERA5_LAND/DAILY_AGGR".

// ================================ SETTINGS - change these ================================

var LATITUDE = 21.165;          // decimal degrees, north is positive
var LONGITUDE = -90.03;         // decimal degrees, east is positive (west is negative)
var START_DATE = '1950-01-02';  // first day (ERA5-Land starts on 1950-01-02)
var END_DATE = '2025-12-31';    // last day, included
var FILE_NAME = 'era5land_daily';   // name of the CSV file in your Google Drive

// ==========================================================================================

var point = ee.Geometry.Point([LONGITUDE, LATITUDE]);

// daily ERA5-Land; the end date is "exclusive" in Earth Engine, so one day is added
var daily = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR')
  .filterDate(START_DATE, ee.Date(END_DATE).advance(1, 'day'));

// One image (= one day) becomes one table row, with the values of the grid cell at the point.
function toRow(image) {
  var values = image.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: point,
    scale: 11132                  // the size of an ERA5-Land cell in metres
  });
  var u = ee.Number(values.get('u_component_of_wind_10m'));
  var v = ee.Number(values.get('v_component_of_wind_10m'));
  var windSpeed = u.pow(2).add(v.pow(2)).sqrt();       // wind speed from the two wind components
  return ee.Feature(null, {
    date: image.date().format('YYYY-MM-dd'),
    air_temperature_c: ee.Number(values.get('temperature_2m')).subtract(273.15),
    air_temperature_min_c: ee.Number(values.get('temperature_2m_min')).subtract(273.15),
    air_temperature_max_c: ee.Number(values.get('temperature_2m_max')).subtract(273.15),
    precipitation_mm: ee.Number(values.get('total_precipitation_sum')).multiply(1000),
    wind_speed_ms: windSpeed
  });
}

var table = ee.FeatureCollection(daily.map(toRow));

// a quick look: the first rows in the Console
print('First rows', table.limit(5));

Export.table.toDrive({
  collection: table,
  description: FILE_NAME,
  fileFormat: 'CSV',
  selectors: ['date', 'air_temperature_c', 'air_temperature_min_c', 'air_temperature_max_c',
              'precipitation_mm', 'wind_speed_ms']   // this order = the column order of the CSV
});
