"""
Makes the "A typical year" charts for the Climatology page of the website.

For every climate variable it draws the mean seasonal cycle (monthly mean, with a shaded band
from the 10th to the 90th percentile of the daily values) and saves it as an SVG file in
data/charts/. The website places these files into the climate table; it does not draw them.

The calculations are the ones from Clima_Baseline.ipynb (the "A year at Sisal" figure).
load_series() and monthly_band() are copied from that notebook without changes, so the charts
on the website and the figures in the report show the same numbers. If you change them in the
notebook, change them here too.

Run it from the project folder:

    python analysis/climatology/export_typical_year.py

Needs: pandas, numpy, matplotlib  (pip install pandas numpy matplotlib)
"""

import logging
import re
from pathlib import Path

import matplotlib
matplotlib.use('Agg')            # draw to files, never open a window
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.ticker import MaxNLocator

# ---------------------------------------------------------------------------------------------
# SETTINGS
# ---------------------------------------------------------------------------------------------

HERE = Path(__file__).resolve().parent

# where the data files are (the same folder as this script)
INPUT_DIR = HERE

# where the charts go (data/charts/ in the project folder)
OUTPUT_DIR = HERE.parent.parent / 'data' / 'charts'

# the font of the website. The SVG only names the font; the browser draws the text with it.
FONT = 'Archivo'
FONT_SIZE = 10

# size of every chart, in pixels. All charts have the same size and the same month axis,
# so they line up in the table on the website.
WIDTH, HEIGHT = 380, 130

# colors: the Figma variables data/climate/... (the same values as in style.css)
COLORS = {
    'air_temperature_max': '#68458A',   # darker version of data/climate/air-temperature (#8A5CB8)
    'air_temperature_min': '#B394D1',   # lighter version of data/climate/air-temperature
    'rainfall':            '#E06D0A',   # data/climate/precipitation
    'sst':                 '#A0522D',   # data/climate/sea-surface-temperature
    'wind_speed':          '#1F77B4',   # data/climate/wind-speed
    'wave_height':         '#2A9A35',   # data/climate/wave-height
    'sea_level':           '#234A8C',   # data/climate/sea-level
    'salinity':            '#D62728',   # data/climate/salinity
}
TEXT_COLOR = '#6E7C71'   # Figma text-muted: numbers and month letters
AXIS_COLOR = '#9AA69C'   # Figma text-faint: the axis lines
GRID_COLOR = '#DCE6D8'   # Figma border: the light horizontal lines

# salinity: only one HYCOM model version is used (see the notebook)
SALINITY_PERIOD = ('1993', '2012')

# ---------------------------------------------------------------------------------------------
# FROM THE NOTEBOOK (Clima_Baseline.ipynb, first code cell). Only the file paths are different:
# they point to INPUT_DIR instead of another laptop. VARIABLES lists only the variables used here.
# ---------------------------------------------------------------------------------------------

FILES = {
    'era5land': INPUT_DIR / 'Sisal_ERA5Land_daily_all.csv',
    'era5':     INPUT_DIR / 'Sisal_ERA5_daily_all.csv',
    'hycom':    INPUT_DIR / 'Sisal_HYCOM_daily_all.csv',
}
SEA_LEVEL_FILE = INPUT_DIR / 'sealevel_sisal_monthly.csv'

# kind:    'linear'   ordinary variable (averaged)
#          'flux'     daily amount, e.g. mm/day (summed to monthly totals)
# Units are already converted in the Earth Engine export.
VARIABLES = {
    # ERA5-Land, two inland cells (choose CELL = 'c1' or 'c2')
    't2m_min_c':   dict(src='era5land', label='2 m air temperature (daily min)',  unit='°C',   kind='linear'),
    't2m_max_c':   dict(src='era5land', label='2 m air temperature (daily max)',  unit='°C',   kind='linear'),
    'precip_mm':   dict(src='era5land', label='Precipitation',                     unit='mm',   kind='flux'),
    # ERA5, sea cell
    'wind_speed_ms':   dict(src='era5', label='10 m wind speed',                unit='m/s',  kind='linear'),
    'sst_c':           dict(src='era5', label='Sea surface temperature (ERA5)', unit='°C',   kind='linear'),
    'hs_mean_m':       dict(src='era5', label='Significant wave height (mean)', unit='m',    kind='linear'),
    # HYCOM, one pixel
    'salinity_surface_psu':dict(src='hycom', label='Surface salinity',                unit='PSU', kind='linear'),
}


def load_series(var, cell='c1'):
    """Daily series on a complete daily index (missing days are NaN)."""
    info = VARIABLES[var]
    path = FILES[info['src']]
    df = pd.read_csv(path, parse_dates=['date'])
    col = f'{var}_{cell}' if info['src'] == 'era5land' else var
    if col not in df.columns:
        raise KeyError(f"Column '{col}' not found in {path}. Available: {list(df.columns)}")

    if info['src'] == 'hycom' and 'bottom_level_m' in df.columns:
        levels = df['bottom_level_m'].dropna().unique()
        print(f'HYCOM bottom level(s) used: {sorted(levels)} m'
              + ('  <-- should be a single value' if len(levels) > 1 else ''))

    s = df.set_index('date')[col].sort_index()
    s = s[~s.index.duplicated()]
    s = s.reindex(pd.date_range(s.index.min(), s.index.max(), freq='D'))
    if var.startswith('salinity'):
        s[s < 30] = np.nan      # HYCOM fill values (raw 0 -> 20 PSU)
    s.name = var

    n_years = (s.index[-1] - s.index[0]).days / 365.25
    print(f'{info["label"]} [{col}]: {s.index[0].date()} to {s.index[-1].date()}, '
          f'{n_years:.1f} years, {s.isna().sum()} missing days')
    if n_years < 20:
        print(f'WARNING: only {n_years:.0f} years of data. Trends and percentiles are '
              'not robust; use this run to test the pipeline, not to report results.')
    return s, info


# from the notebook cell "one colour per variable, used in every report figure"
MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
m = np.arange(1, 13)


def monthly_band(s):
    """mean, p10 and p90 of the daily values in each calendar month"""
    g = s.dropna().groupby(s.dropna().index.month)
    return g.mean(), g.quantile(0.1), g.quantile(0.9)


# ---------------------------------------------------------------------------------------------
# DRAWING (the look of the website; the numbers come from the functions above)
# ---------------------------------------------------------------------------------------------

def new_chart(unit):
    """An empty chart: always the same size and the same place for the month axis."""
    fig = plt.figure(figsize=(WIDTH / 72, HEIGHT / 72))        # 72 points per inch: 1 point = 1 pixel
    ax = fig.add_axes([40 / WIDTH, 20 / HEIGHT, (WIDTH - 48) / WIDTH, (HEIGHT - 38) / HEIGHT])
    ax.set_facecolor('none')
    ax.grid(True, axis='y', color=GRID_COLOR, lw=0.6, zorder=0)    # light horizontal lines only
    ax.set_axisbelow(True)                                         # grid behind lines and bars
    ax.spines[['top', 'right']].set_visible(False)
    ax.spines[['left', 'bottom']].set_color(AXIS_COLOR)
    ax.spines[['left', 'bottom']].set_linewidth(0.8)
    ax.tick_params(colors=TEXT_COLOR, labelsize=FONT_SIZE, length=3, width=0.8, color=AXIS_COLOR)
    ax.set_xticks(m, MONTHS)
    ax.set_xlim(0.4, 12.6)
    ax.yaxis.set_major_locator(MaxNLocator(nbins=4))
    # the unit, small, in the top left corner above the y-axis
    fig.text(4 / WIDTH, (HEIGHT - 8) / HEIGHT, unit, ha='left', va='center', fontsize=FONT_SIZE - 1, color=TEXT_COLOR)
    return fig, ax


def band(ax, s, color, label=None):
    """Monthly mean as a line with dots, and the 10th to 90th percentile as a shaded band."""
    mu, lo, hi = monthly_band(s)
    ax.fill_between(m, lo, hi, color=color, alpha=0.18, lw=0)
    ax.plot(m, mu, color=color, lw=2, marker='o', ms=3.5, label=label)


def save(fig, filename):
    """Saves the chart as a clean SVG: real text, no metadata, and no fixed size (so it scales)."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / filename
    plt.rcParams['svg.hashsalt'] = filename       # the same ids inside the file every time it is made
    fig.savefig(path, format='svg', transparent=True, metadata={'Date': None, 'Creator': None, 'Format': None, 'Type': None})
    plt.close(fig)
    svg = path.read_text(encoding='utf-8')
    svg = svg[svg.index('<svg'):]                                              # no XML header
    svg = re.sub(r'<metadata>.*?</metadata>\s*', '', svg, flags=re.S)           # no matplotlib metadata
    # matplotlib adds a style rule for line ends that would apply to the WHOLE web page once the chart
    # is placed in it. Remove it, and set the same two things on this chart only.
    svg = re.sub(r'\s*<defs>\s*<style[^>]*>.*?</style>\s*</defs>', '', svg, count=1, flags=re.S)
    svg = svg.replace('<svg ', '<svg style="stroke-linejoin: round; stroke-linecap: butt" ', 1)
    svg = re.sub(r'<g id="[^"]*">', '<g>', svg)                                  # no repeated names when several charts are on one page
    svg = re.sub(r'(<svg[^>]*?)\s+width="[^"]*"\s+height="[^"]*"', r'\1', svg, count=1)   # scales to its slot
    path.write_text(svg, encoding='utf-8', newline='\n')
    print(f'  saved {filename}')


def main():
    plt.rcParams.update({
        'svg.fonttype': 'none',                        # keep text as real text in the SVG
        'font.family': [FONT, 'sans-serif'],
        'font.size': FONT_SIZE,
    })
    # the font does not have to be installed on this computer: the browser draws the text
    logging.getLogger('matplotlib.font_manager').setLevel(logging.ERROR)

    records = []   # (chart, first date, last date) for the check at the end

    def record(name, s):
        used = s.dropna()
        records.append((name, used.index[0].date(), used.index[-1].date()))

    print('Loading the data')
    tmax, _ = load_series('t2m_max_c', 'c1')
    tmin, _ = load_series('t2m_min_c', 'c1')
    rain, _ = load_series('precip_mm', 'c1')
    sst, _ = load_series('sst_c')
    wind, _ = load_series('wind_speed_ms')
    hs, _ = load_series('hs_mean_m')
    sal, _ = load_series('salinity_surface_psu')
    sal = sal[SALINITY_PERIOD[0]:SALINITY_PERIOD[1]]            # one HYCOM model version only
    sea = pd.read_csv(SEA_LEVEL_FILE, parse_dates=['date'], index_col='date')['coast']

    print(f'\nMaking the charts in {OUTPUT_DIR}')

    # air temperature: daily max and daily min, each with its band
    fig, ax = new_chart('°C')
    band(ax, tmax, COLORS['air_temperature_max'], 'daily max')
    band(ax, tmin, COLORS['air_temperature_min'], 'daily min')
    # the legend goes above the chart, on the right, so it never covers the lines
    ax.legend(loc='lower right', bbox_to_anchor=(1, 1), ncol=2, frameon=False, fontsize=FONT_SIZE - 1,
              labelcolor=TEXT_COLOR, handlelength=1.4, columnspacing=1.2, borderaxespad=0.1, borderpad=0)
    save(fig, 'typical-year-air-temperature.svg')
    record('Air temperature (max and min)', tmax)

    # rainfall: mean total per month (mm per month)
    rain_month = rain.resample('MS').sum()
    rain_month = rain_month.groupby(rain_month.index.month).mean()          # mm per month
    fig, ax = new_chart('mm/month')
    ax.bar(m, rain_month.values, color=COLORS['rainfall'], width=0.7)
    save(fig, 'typical-year-rainfall.svg')
    record('Rainfall', rain)

    for name, s, color, unit, filename in [
        ('Sea surface temperature', sst, COLORS['sst'], '°C', 'typical-year-sst.svg'),
        ('Wind speed', wind, COLORS['wind_speed'], 'm/s', 'typical-year-wind-speed.svg'),
        ('Wave height (mean)', hs, COLORS['wave_height'], 'm', 'typical-year-wave-height.svg'),
    ]:
        fig, ax = new_chart(unit)
        band(ax, s, color)
        save(fig, filename)
        record(name, s)

    # sea level: monthly cycle relative to the annual mean, no band
    sea_cycle = sea.groupby(sea.index.month).mean()
    sea_cycle = sea_cycle - sea_cycle.mean()                                # mm relative to annual mean
    fig, ax = new_chart('mm')
    ax.axhline(0, color=AXIS_COLOR, lw=0.8)
    ax.plot(m, sea_cycle.values, color=COLORS['sea_level'], lw=2, marker='o', ms=3.5)
    save(fig, 'typical-year-sea-level.svg')
    record('Sea level', sea)

    # salinity (HYCOM, 1993 to 2012)
    fig, ax = new_chart('PSU')
    band(ax, sal, COLORS['salinity'])
    save(fig, 'typical-year-salinity.svg')
    record('Salinity', sal)

    print('\nRecord period used for each chart (check against the notes in the climate table):')
    for name, first, last in records:
        print(f'  {name:32s} {first} to {last}')


if __name__ == '__main__':
    main()
