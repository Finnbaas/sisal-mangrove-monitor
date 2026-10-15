# export_points.py: turns the monthly Landsat NDVI per point, the shape classes and the breakpoints
#   into data/points.json, the file the Overview and Satellite screens read.
# Reads (all in analysis/points/): the three monthly max-NDVI CSVs, shape_classes_points(n=1138).csv
#   and breakpoints.csv.
# Writes: data/points.json (never edit that file by hand; run this script again instead).
# Used by: js/points.js reads the output.
#
# Run from the WEBTOOL_MDP folder:   python analysis/points/export_points.py

import json
from pathlib import Path

import pandas as pd

# ---------- settings ----------

HERE = Path(__file__).resolve().parent          # analysis/points/
OUTPUT = HERE.parent.parent / "data" / "points.json"

# The three monthly NDVI files. The key is the prefix of the point ids in the class file
# (base_0, more_c3_004, new_886, ...).
NDVI_CSVS = {
    "base": "monthly_max_NDVI_per_point.csv",
    "more": "monthly_max_NDVI_per_point_morepoints.csv",
    "new": "N700_monthly_max_NDVI_per_point.csv",
}
CLASSES_CSV = "shape_classes_points(n=1138).csv"
BREAKPOINTS_CSV = "breakpoints.csv"

# Edges of the map image (bounding box of the GEE AOI). The map image must cover exactly these edges,
# otherwise the markers end up in the wrong place.
MAP_WEST, MAP_EAST = -90.12053053107839, -89.93925611701589
MAP_SOUTH, MAP_NORTH = 21.07849757664358, 21.21314383673432

# NDVI values are written unrounded (project rule). If the file turns out too slow to load,
# the team can decide to set this to e.g. 4.
ROUND_DECIMALS = 3


def clean(value):
    """A number for JSON: NaN becomes null (shown as "No data" on the site)."""
    if pd.isna(value):
        return None
    value = float(value)
    return round(value, ROUND_DECIMALS) if ROUND_DECIMALS is not None else value


# ---------- 1. monthly NDVI of all points ----------

frames = []
for prefix, filename in NDVI_CSVS.items():
    df = pd.read_csv(HERE / filename)
    df["point_id"] = prefix + "_" + df["point_id"].astype(str)
    frames.append(df[["point_id", "year", "month", "ndvi_max"]])
ndvi = pd.concat(frames, ignore_index=True)
ndvi["date"] = ndvi["year"].astype(str) + "-" + ndvi["month"].astype(int).map("{:02d}".format)

duplicates = ndvi.duplicated(["point_id", "date"]).sum()
if duplicates:
    raise SystemExit(f"{duplicates} point/month combinations appear twice in the NDVI files. Check the input.")

# One shared list of months for all points, from the first to the last month in the data.
# A month without an image stays empty (null): nothing is filled in.
all_months = pd.period_range(ndvi["date"].min(), ndvi["date"].max(), freq="M")
DATES = [str(m) for m in all_months]                 # "1993-01", "1993-02", ...
table = ndvi.pivot(index="date", columns="point_id", values="ndvi_max").reindex(DATES)

# ---------- 2. classes and breakpoints ----------

classes = pd.read_csv(HERE / CLASSES_CSV)
breaks = pd.read_csv(HERE / BREAKPOINTS_CSV)

# check that the ids of the class file match the ids made from the NDVI files
missing = sorted(set(classes["point_id"]) - set(table.columns))
if missing:
    print(f"WARNING: {len(missing)} points in {CLASSES_CSV} have no NDVI data, e.g. {missing[:5]}")
    print(f"         NDVI ids look like: {list(table.columns[:5])}")
if len(missing) == len(classes):
    raise SystemExit("No point ids match. The id prefixes need fixing; nothing was written.")

# The site shows one breakpoint per point: if a point has more, keep the first and report it.
breaks = breaks.sort_values("breakpoint_date")
several = breaks["point_id"].duplicated().sum()
if several:
    print(f"NOTE: {several} extra breakpoints skipped (points with more than one; the first is kept).")
first_break = breaks.drop_duplicates("point_id").set_index("point_id")

# ---------- 3. one object per point ----------

points = []
outside_map = 0
for _, row in classes.iterrows():
    pid = row["point_id"]
    if pid not in table.columns:
        continue

    left = (row["lon"] - MAP_WEST) / (MAP_EAST - MAP_WEST) * 100
    top = (MAP_NORTH - row["lat"]) / (MAP_NORTH - MAP_SOUTH) * 100
    if not (0 <= left <= 100 and 0 <= top <= 100):
        outside_map += 1

    breakpoint = None
    if pid in first_break.index:
        month = str(first_break.loc[pid, "breakpoint_date"])[:7]      # "2001-08"
        if month in DATES:
            breakpoint = {"index": DATES.index(month), "label": month}

    points.append({
        "id": pid,
        "name": pid,
        "changeClass": row["shape_class"],
        "scenario": None,              # no tipping-point scenario per point yet: shown as "No data"
        "lat": float(row["lat"]),
        "lon": float(row["lon"]),
        "leftPct": round(left, 3),     # marker position only, not research data
        "topPct": round(top, 3),
        "dates": DATES,
        # years: the year of each month. Only kept so the current points.js keeps working;
        # it can go once points.js reads "dates".
        "years": [int(d[:4]) for d in DATES],
        "ndvi": [clean(v) for v in table[pid]],
        "breakpoint": breakpoint,
        "metricVals": None,
        "metricTaus": None,
    })

# ---------- 4. write and report ----------

OUTPUT.write_text(json.dumps(points, allow_nan=False, separators=(",", ":")))

print(f"Wrote {len(points)} points, {len(DATES)} months ({DATES[0]} to {DATES[-1]}) to {OUTPUT}")
print(f"File size: {OUTPUT.stat().st_size / 1e6:.1f} MB")
print(f"Points with a breakpoint: {sum(p['breakpoint'] is not None for p in points)}")
if outside_map:
    print(f"WARNING: {outside_map} points fall outside the map edges.")
print("Classes (for changeClasses in content/variables.json):")
print(classes["shape_class"].value_counts().to_string())
