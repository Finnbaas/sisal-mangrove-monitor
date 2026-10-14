"""
Makes the numbers for the "A typical year" charts on the Climatology page of the website.

For every climate variable it calculates the mean seasonal cycle: the mean of each calendar month,
and the 10th and 90th percentile of the daily values in that month. It writes them to one file,
data/climate/typical-year.json. The website draws the charts from that file (the same way as the
storm charts); it never calculates numbers itself.

The calculations are the ones from Clima_Baseline.ipynb (the "A year at Sisal" figure).
load_series() and monthly_band() are copied from that notebook without changes, so the website and
the figures in the report show the same numbers. If you change them in the notebook, change them
here too.

Run it from the project folder:

    python analysis/climatology/export_typical_year.py

Needs: pandas, numpy  (pip install pandas numpy)
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------------------------
# SETTINGS
# ---------------------------------------------------------------------------------------------

HERE = Path(__file__).resolve().parent

# where the data files are (the same folder as this script)
INPUT_DIR = HERE

# where the result goes (data/climate/ in the project folder)
OUTPUT_FILE = HERE.parent.parent / 'data' / 'climate' / 'typical-year.json'

# salinity: only one HYCOM model version is used (see the notebook)
SALINITY_PERIOD = ('1993', '2012')

# number of decimals in the file
DECIMALS = 2


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
# WRITING THE FILE
# ---------------------------------------------------------------------------------------------

def numbers(values):
    """12 numbers for the file, rounded; a missing month becomes null."""
    return [None if pd.isna(v) else round(float(v), DECIMALS) for v in values.reindex(m)]


def band(s):
    """The seasonal cycle of a daily series: monthly mean, 10th and 90th percentile."""
    mu, lo, hi = monthly_band(s)
    return {'mean': numbers(mu), 'p10': numbers(lo), 'p90': numbers(hi)}


def record(s):
    """First and last day with data."""
    used = s.dropna()
    return {'start': str(used.index[0].date()), 'end': str(used.index[-1].date())}


def main():
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

    # as in the notebook
    rain_month = rain.resample('MS').sum()
    rain_month = rain_month.groupby(rain_month.index.month).mean()          # mm per month
    sea_cycle = sea.groupby(sea.index.month).mean()
    sea_cycle = sea_cycle - sea_cycle.mean()                                # mm relative to annual mean

    # One entry per variable. The ids are the same as in data/events.json and content/variables.json,
    # "source" is a key of "sources" in content/variables.json. A series without p10 and p90 has no band.
    variables = {
        'airTemperature': {'unit': '°C', 'source': 'era5-land', 'record': record(tmax), 'series': [
            dict(id='max', label='daily max', **band(tmax)),
            dict(id='min', label='daily min', **band(tmin))]},
        'precipitation': {'unit': 'mm/month', 'source': 'era5-land', 'record': record(rain), 'kind': 'bars', 'series': [
            dict(id='total', label='mean monthly total', mean=numbers(rain_month))]},
        'seaSurfaceTemperature': {'unit': '°C', 'source': 'era5-sea', 'record': record(sst), 'series': [
            dict(id='mean', **band(sst))]},
        'windSpeed': {'unit': 'm/s', 'source': 'era5-sea', 'record': record(wind), 'series': [
            dict(id='mean', **band(wind))]},
        'waveHeight': {'unit': 'm', 'source': 'era5-sea', 'record': record(hs), 'series': [
            dict(id='mean', **band(hs))]},
        'seaLevel': {'unit': 'mm', 'source': 'altimetry', 'record': record(sea), 'note': 'vs. annual mean', 'series': [
            dict(id='cycle', mean=numbers(sea_cycle))]},
        'salinity': {'unit': 'PSU', 'source': 'hycom', 'record': record(sal), 'series': [
            dict(id='mean', **band(sal))]},
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps({'months': [int(x) for x in m], 'variables': variables}, ensure_ascii=False, indent=1),
                           encoding='utf-8', newline='\n')
    print(f'\nSaved {OUTPUT_FILE}')

    print('\nRecord period of each variable (check against the notes on the website):')
    for vid, v in variables.items():
        print(f"  {vid:24s} {v['record']['start']} to {v['record']['end']}")


if __name__ == '__main__':
    main()
