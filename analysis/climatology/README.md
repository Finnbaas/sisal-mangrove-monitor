# Climatology analysis

This folder holds the climatology analysis of the Sisal study and the script that makes the
"A typical year" charts for the Climatology page of the website.

## What is in this folder

| File | What it is |
|---|---|
| `Clima_Baseline.ipynb` | The climatology notebook of the team (all analyses and report figures). |
| `export_typical_year.py` | Makes the seven "A typical year" charts for the website, as SVG files. |
| `sealevel_sisal_monthly.csv` | Monthly sea level near Sisal (satellite altimetry), 1993 to 2025. |
| `Sisal_ERA5Land_daily_all.csv` | Daily ERA5-Land values (air temperature, rainfall), from 1950. **Not on GitHub.** |
| `Sisal_ERA5_daily_all.csv` | Daily ERA5 values (wind, waves, sea surface temperature), from 1979. **Not on GitHub.** |
| `Sisal_HYCOM_daily_all.csv` | Daily HYCOM values (salinity), from 1992. **Not on GitHub.** |

The three large data files are not stored on GitHub (they are listed in `.gitignore`), because
only the finished charts need to be published. Get them from a team member and put them in this
folder before you run the script.

## What the script does

`export_typical_year.py` draws, for every climate variable, the mean seasonal cycle: the mean of
each calendar month, with a shaded band from the 10th to the 90th percentile of the daily values.
It uses the same calculations as the notebook (the functions `load_series()` and `monthly_band()`
are copied from it), so the website and the report show the same numbers.

It saves one SVG file per row of the climate table in `data/charts/`:

| File | Chart |
|---|---|
| `typical-year-air-temperature.svg` | Daily maximum and daily minimum air temperature, each with its band |
| `typical-year-rainfall.svg` | Rainfall, bars, mm per month |
| `typical-year-sst.svg` | Sea surface temperature |
| `typical-year-wind-speed.svg` | Wind speed |
| `typical-year-wave-height.svg` | Mean wave height |
| `typical-year-sea-level.svg` | Sea level: monthly cycle relative to the annual mean (no band) |
| `typical-year-salinity.svg` | Salinity (HYCOM, 1993 to 2012) |

The website places these files into the "A typical year" column of the climate table. Which file
goes into which row is listed in `content/climate.json`.

## How to run it

You need Python with pandas, numpy and matplotlib. Install them once:

    pip install pandas numpy matplotlib

Then, from the project folder, run:

    python analysis/climatology/export_typical_year.py

The script prints the record period it used for each chart. Check these against the notes in the
climate table on the website ("Record from 1950" and so on).

## Changing how the charts look

The settings are at the top of `export_typical_year.py`: the input and output folder, the font,
the size of the charts and the colors. The colors are the same as the Figma variables
`data/climate/...` and the top of `style.css`; if a color changes there, change it here too and
run the script again.

Do not change the calculations in the script only. If the analysis changes, change the notebook
first and copy the function to the script, so both keep showing the same numbers.
