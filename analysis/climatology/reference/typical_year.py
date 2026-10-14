"""Typical year: monthly mean, p10 and p90 per calendar month, rainfall per month, sea-level cycle.
READ ONLY: copied as-is from analysis/climatology/Clima_Baseline.ipynb (not meant to run).
The website numbers come from this code (see export_typical_year.py).
"""

# --- notebook cell 21: monthly_band, rainfall per month, sea-level cycle
def monthly_band(s):
    """mean, p10 and p90 of the daily values in each calendar month"""
    g = s.dropna().groupby(s.dropna().index.month)
    return g.mean(), g.quantile(0.1), g.quantile(0.9)

rain_month = rain.resample('MS').sum()
rain_month = rain_month.groupby(rain_month.index.month).mean()          # mm per month
sea_cycle = sea.groupby(sea.index.month).mean()
sea_cycle = sea_cycle - sea_cycle.mean()                                # mm relative to annual mean
