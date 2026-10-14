"""Loading the CSV files: FILES, VARIABLES and load_series().
READ ONLY: copied as-is from analysis/climatology/Clima_Baseline.ipynb (not meant to run).
The website numbers come from this code (see export_typical_year.py).
"""

# --- notebook cell 1: loading
import numpy as np
import pandas as pd

# CSV files exported from Earth Engine (same folder as this notebook)
FILES = {
    'era5land': '/Users/sophiethomas/Desktop/MDP/Climatology/Sisal_ERA5Land_daily_all.csv',
    'era5':     '/Users/sophiethomas/Desktop/MDP/Climatology/Sisal_ERA5_daily_all.csv',
    'hycom':    '/Users/sophiethomas/Desktop/MDP/Climatology/Sisal_HYCOM_daily_all.csv',
}

# kind:    'linear'   ordinary variable (averaged)
#          'flux'     daily amount, e.g. mm/day (summed to monthly totals)
#          'circular' direction in degrees (averaged as a vector)
# monthly: optional override of the monthly aggregation ('mean', 'sum', 'max')
# Units are already converted in the Earth Engine export.
VARIABLES = {
    # ERA5-Land, two inland cells (choose CELL = 'c1' or 'c2')
    't2m_c':       dict(src='era5land', label='2 m air temperature (daily mean)', unit='°C',   kind='linear'),
    't2m_min_c':   dict(src='era5land', label='2 m air temperature (daily min)',  unit='°C',   kind='linear'),
    't2m_max_c':   dict(src='era5land', label='2 m air temperature (daily max)',  unit='°C',   kind='linear'),
    'skin_t_c':    dict(src='era5land', label='Skin temperature',                  unit='°C',   kind='linear'),
    'precip_mm':   dict(src='era5land', label='Precipitation',                     unit='mm',   kind='flux'),
    'evap_mm':     dict(src='era5land', label='Actual evaporation',                unit='mm',   kind='flux'),
    'pot_evap_mm': dict(src='era5land', label='Potential evaporation',             unit='mm',   kind='flux'),
    'evap_gap_mm': dict(src='era5land', label='Evaporation gap (potential - actual)', unit='mm', kind='flux'),
    # ERA5, sea cell
    'wind_u_ms':       dict(src='era5', label='10 m wind, eastward component',  unit='m/s',  kind='linear'),
    'wind_v_ms':       dict(src='era5', label='10 m wind, northward component', unit='m/s',  kind='linear'),
    'wind_speed_ms':   dict(src='era5', label='10 m wind speed',                unit='m/s',  kind='linear'),
    'sst_c':           dict(src='era5', label='Sea surface temperature (ERA5)', unit='°C',   kind='linear'),
    'hs_mean_m':       dict(src='era5', label='Significant wave height (mean)', unit='m',    kind='linear'),
    'hs_max_m':        dict(src='era5', label='Significant wave height (max)',  unit='m',    kind='linear', monthly='max'),
    'tp_mean_s':       dict(src='era5', label='Peak wave period',               unit='s',    kind='linear'),
    'wave_dir_deg':    dict(src='era5', label='Mean wave direction (from)',     unit='°',    kind='circular'),
    'wave_power_kw_m': dict(src='era5', label='Wave power',                     unit='kW/m', kind='linear'),
    # HYCOM, one pixel
    'temp_surface_c':      dict(src='hycom', label='Sea surface temperature (HYCOM)', unit='°C',  kind='linear'),
    'temp_bottom_c':       dict(src='hycom', label='Bottom temperature',              unit='°C',  kind='linear'),
    'salinity_surface_psu':dict(src='hycom', label='Surface salinity',                unit='PSU', kind='linear'),
    'salinity_bottom_psu': dict(src='hycom', label='Bottom salinity',                 unit='PSU', kind='linear'),
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
    # if VAR.startswith('salinity'):
    #    s = s['1993':'2012']        # one HYCOM model version only

    n_years = (s.index[-1] - s.index[0]).days / 365.25
    print(f'{info["label"]} [{col}]: {s.index[0].date()} to {s.index[-1].date()}, '
          f'{n_years:.1f} years, {s.isna().sum()} missing days')
    if n_years < 20:
        print(f'WARNING: only {n_years:.0f} years of data. Trends and percentiles are '
              'not robust; use this run to test the pipeline, not to report results.')
    return s, info
