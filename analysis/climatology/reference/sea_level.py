"""Sea level: extract two cells from the altimetry files, annual means, trends.
READ ONLY: copied as-is from analysis/climatology/Clima_Baseline.ipynb (not meant to run).
The website numbers come from this code (see export_typical_year.py).
"""

# --- notebook cell 18: find the files
import glob
import xarray as xr

SL_DIR = '/Users/sophiethomas/Desktop/MDP/Climatology/Baseline/sealevel/'
files = sorted(glob.glob(SL_DIR + '**/*.nc', recursive=True))
print(len(files), 'files')
print('first:', files[0])
print('last: ', files[-1])

# --- notebook cell 19: extract coast/offshore cells to CSV
CELLS = {'coast': (21.125, -90.125), 'offshore': (21.375, -90.125)}

rows = []
for f in files:
    with xr.open_dataset(f) as d:
        r = {'date': pd.Timestamp(d['time'].values[0])}
        for k, (la, lo_) in CELLS.items():
            r[k] = float(d['sla'].sel(latitude=la, longitude=lo_, method='nearest').squeeze())
        rows.append(r)

sl = pd.DataFrame(rows).set_index('date') * 1000          # m -> mm
sl.to_csv(SL_DIR + '../sealevel_sisal_monthly.csv')

print(sl.describe().round(1))
print('\nmissing months:', sl.isna().sum().to_dict())

t = ((sl.index - sl.index[0]).days / 365.25).values
for k in CELLS:
    a = sl[k] - sl[k].groupby(sl.index.month).transform('mean')   # remove seasonal cycle
    ok = a.notna().values
    print(f'{k}: trend {np.polyfit(t[ok], a.values[ok], 1)[0]:.2f} mm/yr (1993-2025)')
print('correlation coast vs offshore:', round(sl['coast'].corr(sl['offshore']), 3))

# --- notebook cell 23: annual means (complete years) and trend()
sea = pd.read_csv(SL_DIR + '../sealevel_sisal_monthly.csv', parse_dates=['date'], index_col='date')['coast']
anom = sea - sea.groupby(sea.index.month).transform('mean')        # seasonal cycle removed
g = sea.resample('YE')
ann = g.mean()[g.count() == 12]; ann.index = ann.index.year         # complete years only

def trend(y0, y1):
    x = ann.loc[y0:y1]
    r = stats.linregress(x.index, x.values)
    return r.slope, 1.96 * r.stderr, r.intercept
