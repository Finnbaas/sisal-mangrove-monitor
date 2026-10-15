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

"Storms at Sisal" (data/events.json): for each of the 11 storms in content/storm-periods.json, the daily anomalies
of six variables around the storm (anomaly() is the notebook's calculation), the storm period and peak date from
content/storm-periods.json, and from HURDAT2 (hurdat2_atlantic.txt) the strength near Sisal, the strongest strength
over the whole life and the closest distance. The track code is the one of reference/storm_selection.py.

Run it from the project folder:

    python analysis/climatology/export_typical_year.py

Needs: pandas, numpy, scipy  (pip install pandas numpy scipy)
"""

import io
import json
from contextlib import redirect_stdout
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

# storms: the periods the team edits by hand, the HURDAT2 tracks (download: nhc.noaa.gov/data/hurdat/) and the result
STORM_PERIODS_FILE = HERE.parent.parent / 'content' / 'storm-periods.json'
HURDAT_FILE = INPUT_DIR / 'hurdat2_atlantic.txt'
EVENTS_FILE = HERE.parent.parent / 'data' / 'events.json'

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
    't2m_c':       dict(src='era5land', label='2 m air temperature (daily mean)', unit='°C',   kind='linear'),
    't2m_min_c':   dict(src='era5land', label='2 m air temperature (daily min)',  unit='°C',   kind='linear'),
    't2m_max_c':   dict(src='era5land', label='2 m air temperature (daily max)',  unit='°C',   kind='linear'),
    'precip_mm':   dict(src='era5land', label='Precipitation',                     unit='mm',   kind='flux'),
    # ERA5, sea cell
    'wind_speed_ms':   dict(src='era5', label='10 m wind speed',                unit='m/s',  kind='linear'),
    'sst_c':           dict(src='era5', label='Sea surface temperature (ERA5)', unit='°C',   kind='linear'),
    'hs_mean_m':       dict(src='era5', label='Significant wave height (mean)', unit='m',    kind='linear'),
    'hs_max_m':        dict(src='era5', label='Significant wave height (max)',  unit='m',    kind='linear'),
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

# ---------------------------------------------------------------------------------------------
# STORMS (data/events.json)
# ---------------------------------------------------------------------------------------------

SITE = (21.165, -90.03)         # Sisal (lat, lon), as in the notebook
RADIUS_KM = 100
DAYS_BEFORE, DAYS_AFTER = 25, 25   # days around the storm date in the anomaly charts (as the Beryl cell of the notebook)

# the six anomaly charts: id in events.json, notebook variable, ERA5-Land cell, source key (content/variables.json "sources")
EVENT_SERIES = [
    ('airTemperature', 't2m_c', 'c1', 'era5-land'),
    ('windSpeed', 'wind_speed_ms', 'c1', 'era5-sea'),
    ('waveHeight', 'hs_max_m', 'c1', 'era5-sea'),
    ('precipitation', 'precip_mm', 'c1', 'era5-land'),
    ('salinity', 'salinity_surface_psu', 'c1', 'hycom'),
    ('seaSurfaceTemperature', 'sst_c', 'c1', 'era5-sea'),
]

# strength classes from the wind (kt): tropical depression < 34, tropical storm 34-63, hurricane cat. 1-5 from 64
STRENGTHS = [(137, 'hurricane-5'), (113, 'hurricane-4'), (96, 'hurricane-3'), (83, 'hurricane-2'), (64, 'hurricane-1'),
             (34, 'tropical-storm'), (0, 'tropical-depression')]
STRENGTH_ABBR = {'hurricane-5': 'cat. 5', 'hurricane-4': 'cat. 4', 'hurricane-3': 'cat. 3', 'hurricane-2': 'cat. 2',
                 'hurricane-1': 'cat. 1', 'tropical-storm': 'TS', 'tropical-depression': 'TD'}


def strength(kt):
    for limit, code in STRENGTHS:
        if kt >= limit:
            return code


def doy365(idx):
    """Day of the year with leap years collapsed onto 365 days (29 Feb shares day 59). From the notebook."""
    doy = idx.dayofyear.values.copy()
    doy[idx.is_leap_year & (doy > 59)] -= 1
    return doy


def anomaly(s, window=11, smooth=31):
    """Daily anomaly: the value minus the mean of the same calendar day (11-day window, smoothed over 31 days).
    Copied from the notebook cell with the Hurricane Beryl figure (Clima_v4); the mean is over the whole record."""
    s = s.dropna()
    r = pd.Series(s.values, index=doy365(s.index))
    half = window // 2
    clim = {}
    for d in range(1, 366):
        w = [(d + k - 1) % 365 + 1 for k in range(-half, half + 1)]
        v = r[r.index.isin(w)].values
        clim[d] = np.nanmean(v) if v.size else np.nan
    clim = pd.Series(clim)
    clim = pd.concat([clim] * 3).rolling(smooth, center=True, min_periods=1).mean().iloc[365:730]
    clim.index = range(1, 366)
    return s - clim.reindex(doy365(s.index)).values


def read_hurdat():
    """HURDAT2: one row per 6-hourly track point (as in storm_selection.py)."""
    rows, sid, name = [], None, None
    with open(HURDAT_FILE) as f:
        for line in f:
            p = [x.strip() for x in line.split(',')]
            if p[0].startswith('AL'):
                sid, name = p[0], p[1]
                continue
            lat = float(p[4][:-1]) * (1 if p[4][-1] == 'N' else -1)
            lon = float(p[5][:-1]) * (-1 if p[5][-1] == 'W' else 1)
            rows.append((sid, name, pd.Timestamp(p[0] + p[1]), p[3], lat, lon, int(p[6])))
    return pd.DataFrame(rows, columns=['id', 'name', 'time', 'status', 'lat', 'lon', 'wind_kt'])


def hourly_tracks(trk, ids):
    """Hourly interpolation of the tracks of these storms, with the distance to Sisal in km (storm_selection.py)."""
    only = trk[trk['id'].isin(ids)]

    def hourly(g):          # a fast storm can cross the circle between two 6-hourly points
        g = g.drop_duplicates('time').set_index('time')
        idx = pd.date_range(g.index[0], g.index[-1], freq='h')
        num = g[['lat', 'lon', 'wind_kt']].reindex(g.index.union(idx)).interpolate('time').reindex(idx)
        return num
    h = pd.concat({k: hourly(g) for k, g in only.groupby('id')}, names=['id', 'time']).reset_index()
    la1, lo1 = np.radians(SITE)
    la2, lo2 = np.radians(h['lat']), np.radians(h['lon'])
    h['km'] = 6371 * 2 * np.arcsin(np.sqrt(np.sin((la2 - la1) / 2) ** 2
                                           + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2) ** 2))
    return h


def storm_id(trk, name, year):
    """The HURDAT2 id of a storm, e.g. AL142024 for Milton 2024."""
    ids = [i for i in trk[trk['name'] == name.upper()]['id'].unique() if i.endswith(str(year))]
    if len(ids) != 1:
        raise ValueError(f'{name} {year}: found {len(ids)} storms in HURDAT2 ({ids})')
    return ids[0]


def track_numbers(trk, h, sid):
    """Strength near Sisal (strongest within 100 km), strongest over the whole life, closest distance in km."""
    hh = h[h['id'] == sid]
    near = hh[hh['km'] <= RADIUS_KM]
    return {
        'near': strength(near['wind_kt'].max()) if len(near) else None,
        'peak': strength(trk[trk['id'] == sid]['wind_kt'].max()),
        'closestKm': round(float(hh['km'].min())),
    }


def export_storms():
    """Reads content/storm-periods.json and the HURDAT2 tracks; writes data/events.json (newest storm first)."""
    periods = json.loads(STORM_PERIODS_FILE.read_text(encoding='utf-8'))['storms']
    trk = read_hurdat()
    ids = {p['name']: storm_id(trk, p['name'], p['start'][:4]) for p in periods}
    h = hourly_tracks(trk, list(ids.values()))

    with redirect_stdout(io.StringIO()):            # load_series() prints a line per file; not needed here
        anomalies = {}
        for _, var, cell, _ in EVENT_SERIES:
            s = load_series(var, cell)[0]
            if var.startswith('salinity'):
                s = s[SALINITY_PERIOD[0]:SALINITY_PERIOD[1]]          # one HYCOM model version only
            anomalies[var] = anomaly(s)

    events, table = [], []
    for p in periods:
        start, end = pd.Timestamp(p['start']), pd.Timestamp(p['end'])
        peak = pd.Timestamp(p['peak']) if p.get('peak') else None
        month_of = peak or start                              # the label date: the peak, else the start of the period
        centre = (peak or start + (end - start) / 2).normalize()   # no peak date yet: the middle of the storm period
        dates = pd.date_range(centre - pd.Timedelta(days=DAYS_BEFORE), centre + pd.Timedelta(days=DAYS_AFTER), freq='D')
        if start < dates[0] or end > dates[-1]:
            raise ValueError(f"{p['name']}: the storm period is outside the {len(dates)} days of the charts")
        tr = track_numbers(trk, h, ids[p['name']])

        ev = {'id': f"{p['name'].lower()}-{start.year}", 'name': p['name'], 'type': tr['near'],
              'strengthNear': tr['near'], 'strengthPeak': tr['peak'], 'closestKm': tr['closestKm'],
              'month': f'{month_of.year}-{month_of.month:02d}',
              'stormPeriod': {'start': p['start'], 'end': p['end'], 'peak': p.get('peak')}, 'note': p.get('note', ''),
              'baseline': 'mean of the same calendar day over the whole record of each dataset (ERA5-Land from 1950, '
                          f'ERA5 from 1979, HYCOM {SALINITY_PERIOD[0]} to {SALINITY_PERIOD[1]})',
              'sources': {vid: src for vid, _, _, src in EVENT_SERIES},
              'dates': [str(d.date()) for d in dates]}
        counts = []
        for vid, var, _, _ in EVENT_SERIES:
            a = anomalies[var].reindex(dates)
            ev[vid] = [None if pd.isna(x) else round(float(x), DECIMALS) for x in a]
            counts.append(int(a.notna().sum()))
        events.append(ev)
        table.append((p['name'], str(month_of.date()), tr, counts))

    events.sort(key=lambda e: e['stormPeriod']['start'], reverse=True)                  # newest first
    EVENTS_FILE.write_text(json.dumps(events, ensure_ascii=False, separators=(',', ':')), encoding='utf-8', newline='\n')
    print(f'\nSaved {EVENTS_FILE} ({len(events)} storms)')

    print('\nStorm       date        near   overall  km   days with data: air wind wave rain salt  sst')
    for name, date, tr, counts in sorted(table, key=lambda r: r[1]):
        print(f"{name:11s} {date}  {STRENGTH_ABBR[tr['near']] if tr['near'] else '-':6s} {STRENGTH_ABBR[tr['peak']]:8s} "
              f"{tr['closestKm']:4d}                 " + ' '.join(f'{c:4d}' for c in counts))


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

    export_storms()


if __name__ == '__main__':
    main()
