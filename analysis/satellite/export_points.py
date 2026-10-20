# export_points.py: turns the monthly Landsat NDVI per point, the shape classes and the breakpoints
#   into data/points.json, the file the Overview and Satellite screens read.
#   Every point gets its class and map position (drawn as a small dot). Only the featured points
#   (content/featured-points.json, the ones you can click) also get the lines of their NDVI plot:
#   the monthly NDVI, the STL trend (deseasonalised) and the breakpoints. Those are not calculated here:
#   they are copied from the two CSVs that the analysis notebook writes (see step 2b).
#   It also copies the early warning signals (EWS) of the featured points, written by the export cell of
#   ews/ews_monthly_new.ipynb (step 9), into data/vegetation/points.json (see step 5). Nothing is calculated here.
# Reads (in analysis/satellite/): the three monthly max-NDVI CSVs, shape_classes_points(n=1138).csv,
#   featured_plot_lines.csv, featured_plot_breakpoints.csv, and ews/featured_ews_stats.csv and ews/featured_ews_series.csv;
#   plus content/featured-points.json.
# Writes: data/points.json and data/vegetation/points.json (never edit those files by hand; run this script again instead).
# Used by: js/points.js and js/vegetation.js read the output.
#
# Run from the WEBTOOL_MDP folder:   python analysis/satellite/export_points.py

import json
from pathlib import Path

import pandas as pd

# ---------- settings ----------

HERE = Path(__file__).resolve().parent          # analysis/satellite/
ROOT = HERE.parent.parent                       # WEBTOOL_MDP/
OUTPUT = ROOT / "data" / "points.json"
FEATURED_JSON = ROOT / "content" / "featured-points.json"
EWS_OUTPUT = ROOT / "data" / "vegetation" / "points.json"

# The three monthly NDVI files. The key is the prefix of the point ids in the class file
# (base_0, more_c3_004, new_886, ...).
NDVI_CSVS = {
    "base": "monthly_max_NDVI_per_point.csv",
    "more": "monthly_max_NDVI_per_point_morepoints.csv",
    "new": "N700_monthly_max_NDVI_per_point.csv",
}
CLASSES_CSV = "shape_classes_points(n=1138).csv"
# The lines and breakpoints of the NDVI plots of the featured points, written by the export cell of the
# analysis notebook (analysis/satellite/ndvi_monthly_classification.ipynb, after "4. Plot per point").
PLOT_LINES_CSV = "featured_plot_lines.csv"
PLOT_BREAKPOINTS_CSV = "featured_plot_breakpoints.csv"
# The early warning signals of the featured points, written by the export cell of ews/ews_monthly_new.ipynb (step 9)
# into the ews/ folder (the EWS notebook has its own folder, like its use case on the Method page).
EWS_DIR = HERE / "ews"
EWS_STATS_CSV = "featured_ews_stats.csv"
EWS_SERIES_CSV = "featured_ews_series.csv"
# notebook column name -> name in data/vegetation/points.json (the ids of "ewsCharts" in content/vegetation.json)
EWS_KEYS = {"resid": "residual", "ar1": "ar1", "sd": "sd", "skew": "skewness", "kurtosis": "kurtosis"}

# Edges of the map image (bounding box of the GEE AOI). The map image must cover exactly these edges,
# otherwise the markers end up in the wrong place.
MAP_WEST, MAP_EAST = -90.12053053107839, -89.93925611701589
MAP_SOUTH, MAP_NORTH = 21.07849757664358, 21.21314383673432

# NDVI values are written unrounded (project rule). If the file turns out too slow to load,
# the team can decide to set this to e.g. 4.
ROUND_DECIMALS = None


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

# ---------- 2. classes ----------

classes = pd.read_csv(HERE / CLASSES_CSV)

# check that the ids of the class file match the ids made from the NDVI files
missing = sorted(set(classes["point_id"]) - set(table.columns))
if missing:
    print(f"WARNING: {len(missing)} points in {CLASSES_CSV} have no NDVI data, e.g. {missing[:5]}")
    print(f"         NDVI ids look like: {list(table.columns[:5])}")
if len(missing) == len(classes):
    raise SystemExit("No point ids match. The id prefixes need fixing; nothing was written.")

# the featured points: only these get their full NDVI data
featured_ids = [p["id"] for p in json.loads(FEATURED_JSON.read_text())["points"]]
unknown = [pid for pid in featured_ids if pid not in set(classes["point_id"])]
if unknown:
    print(f"WARNING: featured points not found in {CLASSES_CSV}: {unknown}")

# ---------- 2b. the lines of the NDVI plot of each featured point (from the notebook) ----------
# The notebook writes exactly the data of its plots (img/satellite/point_*.png):
#   featured_plot_lines.csv:       point_id, date ("1993-01"), ndvi (the grey "raw NDVI" line, gaps filled as
#                                  in the notebook), trend (the "STL trend (deseasonalised)" line; empty in the
#                                  months STL cuts off)
#   featured_plot_breakpoints.csv: point_id, traj, type ("drop"/"rise"), breakpoint_date, window_start,
#                                  window_end (the 12-month window), magnitude
plot_lines_csv = pd.read_csv(HERE / PLOT_LINES_CSV, dtype={"date": str})
plot_breaks_csv = pd.read_csv(HERE / PLOT_BREAKPOINTS_CSV, dtype=str)


def month_index(date):
    """Position of a month ("2001-08", or a date "2001-08-01") in DATES."""
    month = str(date)[:7]
    if month not in DATES:
        raise SystemExit(f"Month {month} in {PLOT_BREAKPOINTS_CSV} is outside the months of the site. Nothing was written.")
    return DATES.index(month)


plot_lines = {}   # point id -> { ndvi, ndviTrend, breakpoints }
for pid in featured_ids:
    rows = plot_lines_csv[plot_lines_csv["point_id"] == pid].set_index("date")
    if rows.empty:
        print(f"WARNING: featured point {pid} is not in {PLOT_LINES_CSV} (run the export cell of the notebook again); "
              "it gets no NDVI lines.")
        continue
    outside = sorted(set(rows.index) - set(DATES))
    if outside:
        raise SystemExit(f"{PLOT_LINES_CSV} has months for {pid} outside the months of the site, e.g. {outside[:3]}. Nothing was written.")
    rows = rows.reindex(DATES)       # one value per month of the site; a month the notebook does not have stays null
    breakpoints = []
    for _, bp in plot_breaks_csv[plot_breaks_csv["point_id"] == pid].sort_values("breakpoint_date").iterrows():
        breakpoints.append({
            "type": bp["type"],                               # "drop" or "rise"
            "index": month_index(bp["breakpoint_date"]),      # position in dates
            "label": str(bp["breakpoint_date"])[:7],          # "2001-08"
            "windowStart": month_index(bp["window_start"]),   # the 12-month window (positions in dates)
            "windowEnd": month_index(bp["window_end"]),
            "magnitude": clean(float(bp["magnitude"])),       # trend at window end minus at window start
        })
    plot_lines[pid] = {
        "ndvi": [clean(v) for v in rows["ndvi"]],
        "ndviTrend": [clean(v) for v in rows["trend"]],
        "breakpoints": breakpoints,
    }

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

    point = {
        "id": pid,
        "name": pid,
        "changeClass": row["shape_class"],
        "lat": float(row["lat"]),
        "lon": float(row["lon"]),
        "leftPct": round(left, 3),     # marker position only, not research data
        "topPct": round(top, 3),
    }
    if pid in featured_ids:
        lines = plot_lines.get(pid, {"ndvi": [None] * len(DATES), "ndviTrend": [None] * len(DATES), "breakpoints": []})
        point.update({
            "scenario": None,          # no tipping-point scenario per point yet: shown as "No data"
            "dates": DATES,
            # years: the year of each month, used by the year slider in points.js
            "years": [int(d[:4]) for d in DATES],
            # ndvi: the grey "raw NDVI" line of the plot (monthly max NDVI, gaps filled as in the notebook)
            "ndvi": lines["ndvi"],
            # ndviTrend: the "STL trend (deseasonalised)" line of the plot
            "ndviTrend": lines["ndviTrend"],
            # breakpoints: all breakpoints of the plot, in time order (empty list = none)
            "breakpoints": lines["breakpoints"],
        })
    points.append(point)

# ---------- 4. write and report ----------

OUTPUT.write_text(json.dumps(points, allow_nan=False, separators=(",", ":")))

print(f"Wrote {len(points)} points, {len(DATES)} months ({DATES[0]} to {DATES[-1]}) to {OUTPUT}")
print(f"File size: {OUTPUT.stat().st_size / 1e6:.1f} MB")
featured = [p for p in points if "ndvi" in p]
print(f"Featured points with NDVI data: {len(featured)}, of which with a breakpoint: {sum(bool(p['breakpoints']) for p in featured)}")
print("Classes of the featured points:", sorted({p['changeClass'] for p in featured}))
if outside_map:
    print(f"WARNING: {outside_map} points fall outside the map edges.")
print("Classes (for changeClasses in content/variables.json):")
print(classes["shape_class"].value_counts().to_string())

# ---------- 5. early warning signals of the featured points (from the EWS notebook) ----------
# featured_ews_stats.csv:  one row per featured point: point_id, status, loss_start, n_months, filled_frac,
#                          window_months, n_surrogates, tau_<indicator>, p_<indicator>
#                          status: ok | noBreakpoint (no loss: a control) | tooShort (< 5 years before the loss)
#                                  | tooInterpolated (> 25% interpolated months) | notAnalysed (too few months with data)
# featured_ews_series.csv: the pre-loss segment of the "ok" points: point_id, date, deseason, resid, ar1, sd, skew, kurtosis
# p is the share of AR(1) surrogates with a tau at least as high as the observed one (one-sided, as in the notebook).

if not (EWS_DIR / EWS_STATS_CSV).exists() or not (EWS_DIR / EWS_SERIES_CSV).exists():
    print(f"WARNING: {EWS_STATS_CSV} or {EWS_SERIES_CSV} not found (run step 9 of ews/ews_monthly_new.ipynb); "
          f"{EWS_OUTPUT} was not changed.")
else:
    ews_stats = pd.read_csv(EWS_DIR / EWS_STATS_CSV, dtype={"loss_start": str}).set_index("point_id")
    ews_series = pd.read_csv(EWS_DIR / EWS_SERIES_CSV, dtype={"date": str})
    ews_points = []
    for pid in featured_ids:
        if pid not in ews_stats.index:
            print(f"WARNING: featured point {pid} is not in {EWS_STATS_CSV} (run step 9 of the EWS notebook again); "
                  "it is shown as not analysed.")
            ews_points.append({"id": pid, "status": "notAnalysed"})
            continue
        st = ews_stats.loc[pid]
        entry = {
            "id": pid,
            "status": st["status"],
            "lossStart": None if pd.isna(st["loss_start"]) else st["loss_start"],   # "2001-02": start of the loss window
            "nSurrogates": int(st["n_surrogates"]),
            # the smallest p the test can show: with p = 0 (no surrogate reached the observed tau) the site shows "p < pMin"
            "pMin": 1 / int(st["n_surrogates"]),
        }
        if st["status"] == "ok":
            rows = ews_series[ews_series["point_id"] == pid].sort_values("date")
            entry["dates"] = rows["date"].tolist()                 # the months before the loss only
            entry["nMonths"] = int(st["n_months"])
            entry["windowMonths"] = int(st["window_months"])     # length of the rolling window
            entry["ews"] = {}
            for column, key in EWS_KEYS.items():
                series = {"values": [clean(v) for v in rows[column]]}
                if column != "resid":                            # the residual itself has no tau or p
                    series["tau"] = clean(st[f"tau_{column}"])
                    series["p"] = clean(st[f"p_{column}"])
                entry["ews"][key] = series
        ews_points.append(entry)

    EWS_OUTPUT.write_text(json.dumps({
        "_about": "Early warning signals of the clickable points (content/featured-points.json) for the card "
                  "\"Early warning signals\" of the Vegetation page. Written by analysis/satellite/export_points.py from "
                  "the export of analysis/satellite/ews/ews_monthly_new.ipynb; never edit by hand. Only points with a loss breakpoint and enough "
                  "data before it (status \"ok\") have series; those run over \"dates\" (the months before lossStart). "
                  "p = share of the nSurrogates AR(1) surrogates with a tau at least as high as the observed one.",
        "points": ews_points,
    }, allow_nan=False, indent=1))
    statuses = pd.Series([p["status"] for p in ews_points]).value_counts()
    print(f"Wrote the early warning signals of {len(ews_points)} featured points to {EWS_OUTPUT}:")
    print(statuses.to_string())
