# Anomaly chart around an event

Run the anomaly chart of the Sisal Mangrove Monitor on your own data, for any place, data source and event.

## What the analysis shows

For each variable (air temperature, wind, rainfall, sea level, river level, ...) the chart shows how much
the daily values differed from normal in the days around one event, for example a storm or a heat wave.
Above zero is higher than normal, below zero is lower. The event period is a red box and the peak day a
dashed red line. One panel per variable, on the same dates.

## What is in this folder

| File | What it is |
|---|---|
| `event_anomaly.py` | The script. Settings at the top, no other changes needed. |
| `get_era5_point.js` | Optional: Google Earth Engine script that exports daily ERA5-Land data for any point. |
| `requirements.txt` | The Python packages you need (pandas, numpy, matplotlib). |
| `example_data/sisal_milton_2024.csv` | Our Sisal data (1950 to 2025). The settings in the script run Hurricane Milton on it. |

## Input format

One CSV file with a `date` column (YYYY-MM-DD) and one numeric column per variable. Any column names, any
number of columns. Days may be missing, and variables may start and end in different years.

| date | air_temperature_c | wind_speed_ms | precipitation_mm |
|---|---|---|---|
| 2024-10-07 | 26.9 | 11.6 | 5.8 |
| 2024-10-08 | 26.6 | 15.9 | 41.9 |
| 2024-10-09 | 27.8 | 10.2 | 0.6 |

At least about 10 years of daily data per variable is needed for reliable normal values.

## Steps

1. Install Python 3.9 or newer. In this folder, make a virtual environment and install the packages:
   `python -m venv venv`, activate it, then `pip install -r requirements.txt`.
2. Put your data in a CSV file in the format above (or make one with `get_era5_point.js`: paste it in the
   Earth Engine Code Editor, set your coordinates and dates, run it and start the export in the Tasks tab).
3. Open `event_anomaly.py` and change the SETTINGS: the CSV path, the event name and dates (start, end,
   optional peak), the days before and after, and the baseline.
4. Run `python event_anomaly.py` and read the data checks it prints.
5. Open the chart and the CSV in the `output` folder. Check the warnings before you use the result.

## What the warnings mean

| Message | What it means and what to do |
|---|---|
| The baseline has only X years of data | The normal values come from fewer than 10 years, so they are uncertain, and so are the anomalies. Use a longer record, or treat the result as a rough picture. |
| N missing days (longest gap X days) | Days without a value in the record. They are not filled in or guessed: the normal values use the days that exist, and the chart shows a gap. A long gap makes the normal of those calendar days less certain. |
| N of 51 days of the chart have no data | Part of the chart window has no values (a gap or the edge of the record). These days are left empty in the chart. |
| No data in the days of the chart | The variable has no values around the event. Its panel shows "No data". |
| N values are not numbers | Text in a numeric column. These values are treated as missing. |
| Dates occur more than once | Only the first row of each date is used. |
| EVENT_PEAK is outside the event period | Check the dates. The chart is centred on the peak. |

The script stops (with a message) when the date column is missing, a listed column is not in the CSV, the
event is outside the data, or the event does not fit in the chart (raise DAYS_BEFORE or DAYS_AFTER).

## How the method works

For every calendar day the script calculates a normal value: the mean of all baseline values in an
11-day window around that day, over all years, smoothed over 31 days (29 February shares the day of 28
February). The anomaly of a day is its value minus the normal value of that calendar day. By default the
baseline is the whole record of each variable, as on the website; you can choose a range of years instead
(for example 1991 to 2020), which is better when the record has a strong trend, or when the event itself
should not be part of the normal.

## Notes

- The event itself is part of the baseline unless you choose a range of years that leaves it out.
- With the default settings the anomalies are the same as on the website, up to rounding (the website shows two decimals).
- `get_era5_point.js` gives land variables (ERA5-Land). Sea variables such as waves and sea surface
  temperature are not in ERA5-Land; get them from the Copernicus Climate Data Store and add them as columns.

Data of the example: ERA5-Land and ERA5 (Copernicus Climate Change Service / ECMWF), grid cells near Sisal, Yucatán, Mexico.
