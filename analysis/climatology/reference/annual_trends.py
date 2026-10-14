"""Annual means (years at least 90% complete) and trends, Kendall tau and linear fit.
READ ONLY: copied as-is from analysis/climatology/Clima_Baseline.ipynb (not meant to run).
The website numbers come from this code (see export_typical_year.py).
"""

# --- notebook cell 22: annual means
def annual(s):
    g = s.resample('YE')
    a = g.mean()[g.count() >= 329]            # years at least 90% complete
    a.index = a.index.year
    return a

# --- notebook cell 2: trend with uncertainty, on annual means
g   = s.resample('YE')
ann = g.mean()[g.count() >= 329]
if len(ann) >= 3:
    res = stats.linregress(ann.index.year, ann.values)
    print(f'annual-fit trend: {res.slope*10:.3f} '
          f'± {res.stderr*10*1.96:.3f} {UNIT} per decade (95%)')
    print('Mann-Kendall:', stats.kendalltau(ann.index.year, ann.values))
else:
    res = None
    print('Too few complete years for an annual trend.')
