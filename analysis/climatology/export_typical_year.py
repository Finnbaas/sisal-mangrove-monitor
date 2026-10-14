"""
Makes the numbers for the "A typical year" and "Change since 1950" charts on the Climatology page.

For every climate variable it calculates the mean seasonal cycle: the mean of each calendar month,
and the 10th and 90th percentile of the daily values in that month. It writes them to one file,
data/climate/typical-year.json. The website draws the charts from that file (the same way as the
storm charts); it never calculates numbers itself.

The calculations are the ones from Clima_Baseline.ipynb (the "A year at Sisal" figure).
load_series() and monthly_band() are copied from that notebook without changes, so the website and
the figures in the report show the same numbers. If you change them in the notebook, change them
here too.

"Change since 1950" (data/climate/change.json): for every variable the annual means (years at least 90%
complete) and the linear trend on them (scipy linregress, with the 95% range = 1.96 x standard error and
the p-value). annual() and trend() are the notebook's calculations (see reference/annual_trends.py and
reference/sea_level.py). The verdict per variable (Significant, Borderline, ...) is NOT made here: the team
sets it in content/climate.json.

"In detail" (data/climate/detail/<variable id>.json, one file per variable, loaded by the website only when
its tab is opened): per month the lowest day, the highest day and the 365-day running mean (rolling 365,
centered, min_periods 300, as in the notebook). Sea level: the monthly anomaly (seasonal cycle removed) and
its 12-month running mean. The annual means and trends are not repeated there: they are in change.json.

Run it from the project folder:

    python analysis/climatology/export_typical_year.py

Needs: pandas, numpy, scipy  (pip install pandas numpy scipy)
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

# ---------------------------------------------------------------------------------------------
# SETTINGS
# ---------------------------------------------------------------------------------------------

HERE = Path(__file__).resolve().parent

# where the data files are (the same folder as this script)
INPUT_DIR = HERE

# where the result goes (data/climate/ in the project folder)
OUTPUT_FILE = HERE.parent.parent / 'data' / 'climate' / 'typical-year.json'
CHANGE_FILE = HERE.parent.parent / 'data' / 'climate' / 'change.json'
DETAIL_DIR = HERE.parent.parent / 'data' / 'climate' / 'detail'       # one file per variable

# number of decimals in the detail files
DETAIL_DECIMALS = 3

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


# "Change since 1950": annual means and trends

def annual(s):
    g = s.resample('YE')
    a = g.mean()[g.count() >= 329]            # years at least 90% complete
    a.index = a.index.year
    return a


def annual_sea_level(sea):
    """annual means of the sea level (complete years only), as in the notebook"""
    g = sea.resample('YE')
    ann = g.mean()[g.count() == 12]
    ann.index = ann.index.year
    return ann


def trend(ann, per=10):
    """Linear trend of annual means (stats.linregress): slope and 95% range (1.96 x stderr) per 'per'
    years, the p-value, and the trend line's value in the first and last year."""
    r = stats.linregress(ann.index, ann.values)
    y0, y1 = int(ann.index[0]), int(ann.index[-1])
    return {'slope': round(float(r.slope) * per, 4), 'ci95': round(1.96 * float(r.stderr) * per, 4),
            'p': float(f'{r.pvalue:.3g}'),
            'fit': [round(float(r.intercept + r.slope * y), 4) for y in (y0, y1)]}


def change_series(id, ann, label=None, per=10):
    """One line of a change chart: the years, the annual means and the trend."""
    out = {'id': id}
    if label:
        out['label'] = label
    out.update(years=[int(y) for y in ann.index], means=[round(float(v), 3) for v in ann.values], **trend(ann, per))
    return out


def change_record(*series):
    """First and last year with an annual mean."""
    used = [a for a in series if len(a)]
    return {'start': int(min(a.index[0] for a in used)), 'end': int(max(a.index[-1] for a in used))}


# "In detail": monthly range and running means

def month_labels(index):
    return [d.strftime('%Y-%m') for d in index]


def detail_numbers(values):
    return [None if pd.isna(v) else round(float(v), DETAIL_DECIMALS) for v in values]


def detail_daily(id, s):
    """One line of a detail chart: per month the lowest and highest day, and the 365-day running mean
    (the value on the 15th of the month)."""
    month = s.resample('MS')
    lo, hi = month.min(), month.max()
    running = s.rolling(365, center=True, min_periods=300).mean()      # as in the notebook
    mid = running.reindex(lo.index + pd.Timedelta(days=14))
    return {'id': id, 'months': month_labels(lo.index), 'min': detail_numbers(lo), 'max': detail_numbers(hi),
            'running': detail_numbers(mid)}


def detail_sea_level(sea):
    """Sea level: the monthly anomaly (seasonal cycle removed) and its 12-month running mean."""
    anom = sea - sea.groupby(sea.index.month).transform('mean')
    return {'id': 'mean', 'months': month_labels(anom.index), 'anomaly': detail_numbers(anom),
            'running': detail_numbers(anom.rolling(12, center=True).mean())}


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

    # ---- Change since 1950 (data/climate/change.json) ----
    a_tmax, a_tmin, a_rain, a_sst, a_wind, a_hs, a_sal = (annual(x) for x in (tmax, tmin, rain, sst, wind, hs, sal))
    a_sea = annual_sea_level(sea)
    sea_periods = [{'start': y0, 'end': y1, **trend(a_sea.loc[y0:y1], per=1)} for y0, y1 in [(1993, 2011), (2012, 2025)]]
    # "trendUnit" is the unit of slope and ci95; sea level is per year, the others per decade
    change = {
        'airTemperature': {'unit': '°C', 'trendUnit': '°C/decade', 'record': change_record(a_tmax, a_tmin), 'series': [
            change_series('max', a_tmax, 'daily max'), change_series('min', a_tmin, 'daily min')]},
        'precipitation': {'unit': 'mm/day', 'trendUnit': 'mm/day/decade', 'record': change_record(a_rain), 'series': [
            change_series('mean', a_rain)]},
        'seaSurfaceTemperature': {'unit': '°C', 'trendUnit': '°C/decade', 'record': change_record(a_sst), 'series': [
            change_series('mean', a_sst)]},
        'windSpeed': {'unit': 'm/s', 'trendUnit': 'm/s/decade', 'record': change_record(a_wind), 'series': [
            change_series('mean', a_wind)]},
        'waveHeight': {'unit': 'm', 'trendUnit': 'm/decade', 'record': change_record(a_hs), 'series': [
            change_series('mean', a_hs)]},
        'seaLevel': {'unit': 'mm', 'trendUnit': 'mm/yr', 'record': change_record(a_sea), 'periods': sea_periods, 'series': [
            change_series('mean', a_sea, per=1)]},
        'salinity': {'unit': 'PSU', 'trendUnit': 'PSU/decade', 'record': change_record(a_sal), 'series': [
            change_series('mean', a_sal)]},
    }
    CHANGE_FILE.write_text(json.dumps({'variables': change}, ensure_ascii=False, indent=1), encoding='utf-8', newline='\n')
    print(f'Saved {CHANGE_FILE}')

    # ---- In detail (data/climate/detail/<id>.json) ----
    detail = {      # id: (unit, the daily series it is made from, its lines)
        'airTemperature': ('°C', tmax, [detail_daily('max', tmax), detail_daily('min', tmin)]),
        'precipitation': ('mm/day', rain, [detail_daily('mean', rain)]),
        'seaSurfaceTemperature': ('°C', sst, [detail_daily('mean', sst)]),
        'windSpeed': ('m/s', wind, [detail_daily('mean', wind)]),
        'waveHeight': ('m', hs, [detail_daily('mean', hs)]),
        'seaLevel': ('mm', sea, [detail_sea_level(sea)]),
        'salinity': ('PSU', sal, [detail_daily('mean', sal)]),
    }
    DETAIL_DIR.mkdir(parents=True, exist_ok=True)
    detail_summary = []
    for vid, (unit, source, series) in detail.items():
        body = {'unit': unit, 'record': record(source), 'kind': 'monthly-anomaly' if vid == 'seaLevel' else 'daily',
                'series': series}
        path = DETAIL_DIR / (vid + '.json')
        path.write_text(json.dumps(body, ensure_ascii=False, separators=(',', ':')), encoding='utf-8', newline='\n')
        detail_summary.append((vid, body['record'], path.stat().st_size))

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps({'months': [int(x) for x in m], 'variables': variables}, ensure_ascii=False, indent=1),
                           encoding='utf-8', newline='\n')
    print(f'\nSaved {OUTPUT_FILE}')

    print('\nRecord period of each variable (check against the notes on the website):')
    for vid, v in variables.items():
        print(f"  {vid:24s} {v['record']['start']} to {v['record']['end']}")

    print('\nDetail files (data/climate/detail/):')
    for vid, rec, size in detail_summary:
        print(f"  {vid:24s} {rec['start']} to {rec['end']}   {size / 1024:6.0f} KB")


if __name__ == '__main__':
    main()
