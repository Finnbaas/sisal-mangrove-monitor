# Climatology analysis

This folder holds the climatology analysis of the Sisal study and the script that makes the
numbers for the "A typical year" charts on the Climatology page of the website.

## What is in this folder

| File | What it is |
|---|---|
| `Clima_Baseline.ipynb` | The climatology notebook of the team (all analyses and report figures). |
| `export_typical_year.py` | Calculates the "A typical year" numbers for the website and saves them as one JSON file. |
| `sealevel_sisal_monthly.csv` | Monthly sea level near Sisal (satellite altimetry), 1993 to 2025. |
| `Sisal_ERA5Land_daily_all.csv` | Daily ERA5-Land values (air temperature, rainfall), from 1950. **Not on GitHub.** |
| `Sisal_ERA5_daily_all.csv` | Daily ERA5 values (wind, waves, sea surface temperature), from 1979. **Not on GitHub.** |
| `Sisal_HYCOM_daily_all.csv` | Daily HYCOM values (salinity), from 1992. **Not on GitHub.** |

The three large data files are not stored on GitHub (they are listed in `.gitignore`), because
only the finished numbers need to be published. Get them from a team member and put them in this
folder before you run the script.

## What the script does

`export_typical_year.py` calculates, for every climate variable, the mean seasonal cycle: the mean
of each calendar month, and the 10th and 90th percentile of the daily values in that month.
It uses the same calculations as the notebook (the functions `load_series()` and `monthly_band()`
are copied from it), so the website and the report show the same numbers.

It saves everything in one file: `data/climate/typical-year.json`. Per variable it holds:

| Variable | What is in the file |
|---|---|
| `airTemperature` | Daily maximum and daily minimum air temperature, each with mean and band (ERA5-Land) |
| `precipitation` | Rainfall, monthly total in mm per month, no band (drawn as bars) |
| `seaSurfaceTemperature` | Sea surface temperature, mean and band (ERA5) |
| `windSpeed` | Wind speed, mean and band (ERA5) |
| `waveHeight` | Mean wave height, mean and band (ERA5) |
| `seaLevel` | Sea level: monthly cycle relative to the annual mean, no band (satellite altimetry) |
| `salinity` | Salinity, mean and band (HYCOM, 1993 to 2012 only) |

The website (`climate.js`) draws the charts from this file, in the same style as the storm charts.
The website never calculates numbers itself. Which variables are shown, in which order and with
which label, is set in `climateVariables` in `content/variables.json`.

## How to run it

You need Python with pandas and numpy. Install them once:

    pip install pandas numpy

Then, from the project folder, run:

    python analysis/climatology/export_typical_year.py

The script prints the record period it used for each variable. The same periods are in the file
and are shown on the website in the "In detail" card.

## Changing the charts

How the charts look (colors, sizes) is set by the website (`style.css` and `climate.js`), not by
this script. The settings at the top of `export_typical_year.py` are only the input and output
files, the salinity period and the number of decimals.

Do not change the calculations in the script only. If the analysis changes, change the notebook
first and copy the function to the script, so both keep showing the same numbers.
