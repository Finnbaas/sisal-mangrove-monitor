"""Storm selection: HURDAT2 tracks within 100 km of Sisal, strength category, counts.
READ ONLY: copied as-is from analysis/climatology/Clima_Baseline.ipynb (not meant to run).
The website numbers come from this code (see export_typical_year.py).
"""

# --- notebook cell 13: storm selection
HURDAT = '/Users/sophiethomas/Desktop/MDP/Climatology/hurdat2_atlantic.txt'
SITE = (21.165, -90.03)     # Sisal
RADIUS_KM = 100
YEAR0, YEAR1 = 1950, 2025   # same period as the ERA5-Land baseline

# --- read HURDAT2: one row per 6-hourly track point -------------------------
rows, sid, name = [], None, None
with open(HURDAT) as f:
    for line in f:
        p = [x.strip() for x in line.split(',')]
        if p[0].startswith('AL'):
            sid, name = p[0], p[1]
            continue
        lat = float(p[4][:-1]) * (1 if p[4][-1] == 'N' else -1)
        lon = float(p[5][:-1]) * (-1 if p[5][-1] == 'W' else 1)
        rows.append((sid, name, pd.Timestamp(p[0] + p[1]), p[3], lat, lon, int(p[6])))
trk = pd.DataFrame(rows, columns=['id', 'name', 'time', 'status', 'lat', 'lon', 'wind_kt'])
trk = trk[trk['time'].dt.year.between(YEAR0, YEAR1)]

# --- interpolate to hourly: a fast storm can cross the circle between 6-hourly points
def hourly(g):
    g = g.drop_duplicates('time').set_index('time')
    idx = pd.date_range(g.index[0], g.index[-1], freq='h')
    num = g[['lat', 'lon', 'wind_kt']].reindex(g.index.union(idx)).interpolate('time').reindex(idx)
    num['status'] = g['status'].reindex(idx, method='ffill')
    num['name'] = g['name'].iloc[0]
    return num
h = pd.concat({k: hourly(g) for k, g in trk.groupby('id')}, names=['id', 'time']).reset_index()

# --- distance to Sisal ------------------------------------------------------
la1, lo1 = np.radians(SITE)
la2, lo2 = np.radians(h['lat']), np.radians(h['lon'])
h['km'] = 6371 * 2 * np.arcsin(np.sqrt(np.sin((la2 - la1) / 2)**2
                                       + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2)**2))

# --- tropical/subtropical systems of at least tropical-storm strength (34 kt)
near = h[(h['km'] <= RADIUS_KM) & h['status'].isin(['TS', 'HU', 'SS']) & (h['wind_kt'] >= 34)]

def category(kt):
    for lim, c in [(137, 'Cat 5'), (113, 'Cat 4'), (96, 'Cat 3'), (83, 'Cat 2'), (64, 'Cat 1')]:
        if kt >= lim:
            return c
    return 'TS'

storms = (near.sort_values('km').groupby('id')
              .agg(name=('name', 'first'), date=('time', 'first'),
                   closest_km=('km', 'min'), max_wind_kt=('wind_kt', 'max'))
              .sort_values('date'))
storms['date'] = storms['date'].dt.date
storms[['closest_km', 'max_wind_kt']] = storms[['closest_km', 'max_wind_kt']].round(0)
storms['category'] = storms['max_wind_kt'].apply(category)   # strongest WITHIN the circle, not at Sisal
print(f'Storms within {RADIUS_KM} km of Sisal, {YEAR0}-{YEAR1}: {len(storms)}')
print(storms.to_string())

# --- counts per year and per decade -----------------------------------------
yrs = pd.to_datetime(storms['date']).dt.year
is_hu = storms['category'] != 'TS'
per_year = pd.DataFrame({'all': yrs.value_counts(), 'hurricanes': yrs[is_hu].value_counts()}
                        ).reindex(range(YEAR0, YEAR1 + 1)).fillna(0).astype(int)
dec = (per_year.index // 10) * 10
print('\nstorms per year, by decade:')
print((per_year.groupby(dec).sum() / per_year.groupby(dec).size().values[:, None]).round(2).to_string())
print('\nmean per year, all:', round(per_year['all'].mean(), 2),
      '  hurricanes:', round(per_year['hurricanes'].mean(), 2))
print('trend, all storms:', stats.kendalltau(per_year.index, per_year['all']))
print('trend, hurricanes:', stats.kendalltau(per_year.index, per_year['hurricanes']))
