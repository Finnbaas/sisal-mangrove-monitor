"""
event_anomaly.py - Anomaly chart around an event.

WHAT IT DOES
    Takes daily values of one or more variables (air temperature, wind, rainfall, ...), calculates the
    anomaly (the daily value minus the normal value of that calendar day) and draws the anomaly in the
    days around ONE event (a storm, a heat wave, a flood, ...). One panel per variable; the event period
    is a red box and the peak day a dashed red line.

WHAT IT READS
    A CSV file with a "date" column (YYYY-MM-DD) and one numeric column per variable (see README.md).

WHAT IT SAVES (in OUTPUT_FOLDER)
    <event>_anomalies.png   the chart
    <event>_anomalies.csv   the anomaly values behind the chart

HOW TO USE
    1. Change the SETTINGS below. 2. Run:  python event_anomaly.py
    This is the method of the storm anomaly charts of the Sisal Mangrove Monitor website.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")                       # draw to a file, no window needed
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.ticker
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle
from matplotlib.transforms import blended_transform_factory


# =============================================================================================
# SETTINGS - change these
# =============================================================================================

# --- Your data ---------------------------------------------------------------------------
# Path of the CSV file. A relative path starts from the folder of this script.
INPUT_CSV = "example_data/sisal_milton_2024.csv"

# Which columns to use, with a display name and unit for the chart:
#     "column name in your CSV": ("Display name", "unit")
# Leave the dictionary empty ({}) to use ALL numeric columns, with the column name as the name and no unit.
# A column that is not listed here is not used. Use ("Name", "") for a variable without a unit.
VARIABLES = {
    "air_temperature_c":         ("Air temperature (mean)", "°C"),
    "wind_speed_ms":             ("Wind speed", "m/s"),
    "wave_height_max_m":         ("Wave height (daily max)", "m"),
    "precipitation_mm":          ("Rainfall", "mm"),
    "sea_surface_temperature_c": ("Sea surface temperature", "°C"),
}

# --- The event ---------------------------------------------------------------------------
EVENT_NAME = "Hurricane Milton"
EVENT_START = "2024-10-05"        # first day of the event (YYYY-MM-DD)
EVENT_END = "2024-10-10"          # last day of the event
EVENT_PEAK = "2024-10-08"         # day of the peak, or None. The chart is centred on this day;
                                  # with None it is centred on the middle of the event.
DAYS_BEFORE = 25                  # days shown before the centre day
DAYS_AFTER = 25                   # days shown after the centre day

# --- The baseline ("normal" values) ------------------------------------------------------
# None = the whole record of each variable (this is what the website does).
# Or a range of years, for example (1991, 2020) = from 1 Jan 1991 to 31 Dec 2020.
BASELINE_YEARS = None
WINDOW_DAYS = 11                  # the normal of a calendar day is the mean of this many days around it, over all baseline years (odd number)
SMOOTH_DAYS = 31                  # the 365 normals are then smoothed over this many days (odd number)
MIN_BASELINE_YEARS = 10           # warn when a variable has less baseline data than this

# --- Output ------------------------------------------------------------------------------
OUTPUT_FOLDER = "output"          # relative to the folder of this script


# =============================================================================================
# Colours of the chart (the colours of the website)
# =============================================================================================

VARIABLE_COLORS = ["#8A5CB8", "#1F77B4", "#2A9A35", "#E06D0A", "#D62728", "#A0522D", "#234A8C"]
EVENT_COLOR = "#D93A2B"           # event box and peak line
TEXT_COLOR = "#3A4640"
MUTED_COLOR = "#6E7C71"
GRID_COLOR = "#DCE6D8"
AXIS_COLOR = "#9AA69C"

HERE = Path(__file__).resolve().parent
warnings_list = []                # all warnings, printed again at the end


# =============================================================================================
# Messages
# =============================================================================================

def stop(message):
    """Stops the script with a clear message (no crash with a long error text)."""
    print("\nSTOPPED: " + message)
    sys.exit(1)


def warn(message):
    """Prints a warning and remembers it for the summary at the end."""
    print("WARNING: " + message)
    warnings_list.append(message)


def full_path(text):
    """A path from the settings: relative paths start from the folder of this script."""
    path = Path(text)
    return path if path.is_absolute() else HERE / path


# =============================================================================================
# Reading and checking the data
# =============================================================================================

def read_data():
    """Reads the CSV and returns a table with a complete daily index (missing days are empty) and one
    column per variable."""
    path = full_path(INPUT_CSV)
    if not path.exists():
        stop(f"The input file does not exist: {path}\nCheck INPUT_CSV in the settings.")
    df = pd.read_csv(path)
    df.columns = [str(c).strip() for c in df.columns]

    if "date" not in df.columns:
        stop(f"The CSV has no 'date' column. Columns found: {list(df.columns)}\n"
             "Rename your date column to 'date' (format YYYY-MM-DD).")

    # dates
    dates = pd.to_datetime(df["date"], errors="coerce")
    bad = int(dates.isna().sum())
    if bad == len(df):
        stop("None of the values in the 'date' column could be read as a date. Use the format YYYY-MM-DD.")
    if bad:
        warn(f"{bad} rows have a date that could not be read; these rows are ignored.")
    df = df[dates.notna()].copy()
    df.index = dates[dates.notna()].dt.normalize()
    if df.index.has_duplicates:
        n = int(df.index.duplicated().sum())
        warn(f"{n} dates occur more than once; only the first row of each date is used.")
        df = df[~df.index.duplicated()]
    df = df.sort_index()

    # which columns are variables
    if VARIABLES:
        missing = [c for c in VARIABLES if c not in df.columns]
        if missing:
            stop(f"These columns from VARIABLES are not in the CSV: {missing}\nColumns found: {list(df.columns)}")
        columns = list(VARIABLES)
    else:
        columns = [c for c in df.columns if c != "date"]

    table = pd.DataFrame(index=pd.date_range(df.index.min(), df.index.max(), freq="D"))
    for col in columns:
        numbers = pd.to_numeric(df[col], errors="coerce")
        n_text = int((numbers.isna() & df[col].notna()).sum())
        if numbers.notna().sum() == 0:
            if VARIABLES:
                stop(f"Column '{col}' has no numeric values.")
            print(f"Column '{col}' has no numeric values and is skipped.")
            continue
        if n_text:
            warn(f"Column '{col}': {n_text} values are not numbers and are treated as missing.")
        table[col] = numbers.reindex(table.index)
    if table.shape[1] == 0:
        stop("No numeric columns found in the CSV.")
    return table


def read_event(table):
    """Checks the event settings and returns (start, end, peak, centre, chart_days)."""
    def to_date(text, what):
        try:
            return pd.Timestamp(text).normalize()
        except (ValueError, TypeError):
            stop(f"{what} ('{text}') is not a date. Use the format YYYY-MM-DD.")

    start, end = to_date(EVENT_START, "EVENT_START"), to_date(EVENT_END, "EVENT_END")
    peak = to_date(EVENT_PEAK, "EVENT_PEAK") if EVENT_PEAK else None
    if end < start:
        stop("EVENT_END is before EVENT_START.")
    first, last = table.index[0], table.index[-1]
    if end < first or start > last:
        stop(f"The event ({start.date()} to {end.date()}) is outside the data ({first.date()} to {last.date()}).")
    if peak is not None and not (start <= peak <= end):
        warn("EVENT_PEAK is outside the event period.")

    centre = peak if peak is not None else (start + (end - start) / 2).normalize()
    chart_days = pd.date_range(centre - pd.Timedelta(days=DAYS_BEFORE), centre + pd.Timedelta(days=DAYS_AFTER), freq="D")
    if start < chart_days[0] or end > chart_days[-1]:
        stop(f"The event period does not fit in the {len(chart_days)} days of the chart. "
             "Increase DAYS_BEFORE or DAYS_AFTER.")
    if chart_days[0] < first or chart_days[-1] > last:
        warn(f"The chart ({chart_days[0].date()} to {chart_days[-1].date()}) reaches outside the data "
             f"({first.date()} to {last.date()}); days without data are left empty.")
    return start, end, peak, centre, chart_days


def longest_gap(is_missing):
    """Length of the longest run of missing days."""
    longest = run = 0
    for m in is_missing:
        run = run + 1 if m else 0
        longest = max(longest, run)
    return longest


# =============================================================================================
# The method: anomaly = daily value minus the normal value of that calendar day
# =============================================================================================

def day_of_year_365(index):
    """Day of the year with leap years collapsed onto 365 days (29 February shares day 59)."""
    doy = index.dayofyear.values.copy()
    doy[index.is_leap_year & (doy > 59)] -= 1
    return doy


def normal_per_day(baseline):
    """The normal value of each of the 365 calendar days, from the baseline values:
    the mean of WINDOW_DAYS days around that day over all years, smoothed over SMOOTH_DAYS days."""
    baseline = baseline.dropna()
    doy = day_of_year_365(baseline.index)
    values = baseline.values
    half = WINDOW_DAYS // 2
    normal = np.full(365, np.nan)
    for d in range(1, 366):
        window = [(d + k - 1) % 365 + 1 for k in range(-half, half + 1)]     # wraps around the new year
        v = values[np.isin(doy, window)]
        if v.size:
            normal[d - 1] = v.mean()
    # smooth over SMOOTH_DAYS days; three copies of the year make the smoothing wrap around the new year
    smooth = pd.Series(np.tile(normal, 3)).rolling(SMOOTH_DAYS, center=True, min_periods=1).mean()
    return smooth.values[365:730]


def anomaly(series, baseline):
    """Anomaly of every day of the series: the value minus the normal of its calendar day."""
    normal = normal_per_day(baseline)
    return series - normal[day_of_year_365(series.index) - 1]


def check_variable(col, series):
    """Prints the data checks of one variable and returns its baseline (or None when it has no data)."""
    valid = series.dropna()
    if valid.empty:
        warn(f"'{col}': no values at all; this variable is skipped.")
        return None
    record = series[valid.index[0]:valid.index[-1]]
    n_missing = int(record.isna().sum())
    text = (f"{len(record)} days from {record.index[0].date()} to {record.index[-1].date()}, "
            f"{n_missing} missing days")
    if n_missing:
        text += (f" (longest gap {longest_gap(record.isna().values)} days). Missing days are not filled in: "
                 "they are left out of the normals and show as gaps in the chart")
    print(f"  {col}: {text}")

    baseline = valid
    if BASELINE_YEARS:
        y0, y1 = BASELINE_YEARS
        baseline = valid[(valid.index.year >= y0) & (valid.index.year <= y1)]
        if baseline.empty:
            stop(f"'{col}' has no values in the baseline years {y0} to {y1}.")
    years = len(baseline) / 365.25
    if years < MIN_BASELINE_YEARS:
        warn(f"'{col}': the baseline has only {years:.1f} years of data (less than {MIN_BASELINE_YEARS}). "
             "The normal values are uncertain, so the anomalies are too.")
    return baseline


# =============================================================================================
# The chart
# =============================================================================================

def draw_panel(ax, days, values, color, name, unit):
    """One panel: the anomaly as a filled line around zero (above zero full colour, below zero lighter)."""
    x = mdates.date2num(days.to_pydatetime())
    known = values[~np.isnan(values)]
    ax.axhline(0, color=AXIS_COLOR, linewidth=1, zorder=2)
    ax.set_ylabel(f"{name}\n({unit})" if unit else name, fontsize=8, color=TEXT_COLOR)

    if known.size == 0:
        ax.set_ylim(-1, 1)
        ax.set_yticks([])
        ax.text(0.5, 0.5, "No data", transform=ax.transAxes, ha="center", va="center", fontsize=10, color=MUTED_COLOR)
        return

    ax.fill_between(x, 0, values, where=values >= 0, interpolate=True, color=color, linewidth=0, zorder=3)
    ax.fill_between(x, 0, values, where=values <= 0, interpolate=True, color=color, alpha=0.35, linewidth=0, zorder=3)
    ax.plot(x, values, color=color, linewidth=1.5, solid_joinstyle="round", zorder=4)   # gaps (NaN) are not drawn

    # room above and below the data, and a label at the most extreme value
    low, high = min(0, known.min()), max(0, known.max())
    pad = ((high - low) or 1) * 0.22
    ax.set_ylim(low - pad, high + pad)
    top = int(np.nanargmax(np.abs(values)))
    sign = "+" if values[top] >= 0 else "−"
    above = values[top] >= 0
    label_x = min(max(x[top], x[0] + 2.5), x[-1] - 2.5)          # keep the label inside the chart
    ax.annotate(f"{sign}{abs(values[top]):.2f}", (label_x, values[top]), textcoords="offset points",
                xytext=(0, 3 if above else -10), ha="center", fontsize=8, color=TEXT_COLOR, zorder=5)
    ax.yaxis.set_major_locator(matplotlib.ticker.MaxNLocator(nbins=4))


def draw_chart(chart_days, anomalies, names, start, end, peak, path):
    """Draws all panels in one picture and saves it as a PNG."""
    n = len(anomalies)
    fig, axes = plt.subplots(n, 1, sharex=True, figsize=(8.5, 1.35 * n + 1.6))
    axes = np.atleast_1d(axes)
    fig.subplots_adjust(left=0.11, right=0.97, top=1 - 0.95 / (1.35 * n + 1.6), bottom=1.0 / (1.35 * n + 1.6), hspace=0.18)

    for i, (ax, col) in enumerate(zip(axes, anomalies)):
        name, unit = names[col]
        draw_panel(ax, chart_days, anomalies[col].values, VARIABLE_COLORS[i % len(VARIABLE_COLORS)], name, unit)
        ax.grid(axis="x", color=GRID_COLOR, linewidth=0.8, zorder=0)
        ax.grid(axis="y", color=GRID_COLOR, linewidth=0.8, zorder=0)
        ax.set_axisbelow(True)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            ax.spines[side].set_color(AXIS_COLOR)
        ax.tick_params(labelsize=8, colors=MUTED_COLOR, length=3)

    # shared date axis
    ticks = mdates.date2num(chart_days[::10].to_pydatetime())
    axes[-1].set_xticks(ticks)
    axes[-1].set_xticklabels([d.strftime("%d %b") for d in chart_days[::10]])
    axes[-1].set_xlim(mdates.date2num(chart_days[0].to_pydatetime()), mdates.date2num(chart_days[-1].to_pydatetime()))
    for ax in axes[:-1]:
        ax.tick_params(labelbottom=False)

    # the event period as ONE box over all panels, the peak as ONE dashed line
    over_all = blended_transform_factory(axes[0].transData, fig.transFigure)      # x in dates, y in figure share
    y_top, y_bottom = axes[0].get_position().y1, axes[-1].get_position().y0
    x0, x1 = (mdates.date2num(d.to_pydatetime()) for d in (start, end))
    fig.add_artist(Rectangle((x0, y_bottom), x1 - x0, y_top - y_bottom, transform=over_all, fill=False,
                             edgecolor=matplotlib.colors.to_rgba(EVENT_COLOR, 0.5), linewidth=2, zorder=10))
    handles, labels = [Rectangle((0, 0), 1, 1, fill=False, edgecolor=matplotlib.colors.to_rgba(EVENT_COLOR, 0.5), linewidth=2)], ["Event period"]
    if peak is not None:
        xp = mdates.date2num(peak.to_pydatetime())
        fig.add_artist(Line2D([xp, xp], [y_bottom, y_top], transform=over_all, color=EVENT_COLOR,
                              linestyle="--", linewidth=1.8, zorder=10))
        handles.append(Line2D([0], [0], color=EVENT_COLOR, linestyle="--", linewidth=1.8))
        labels.append("Peak")

    height = 1.35 * n + 1.6
    fig.text(0.11, 1 - 0.28 / height, f"{EVENT_NAME}: anomaly around the event", fontsize=12, fontweight="bold",
             color=TEXT_COLOR, va="center")
    fig.legend(handles, labels, loc="center left", bbox_to_anchor=(0.10, 1 - 0.62 / height), ncol=2,
               frameon=False, fontsize=8, handlelength=1.6)
    baseline_text = "the whole record of each variable" if not BASELINE_YEARS else f"{BASELINE_YEARS[0]} to {BASELINE_YEARS[1]}"
    fig.text(0.11, 0.3 / height,
             f"Anomaly = daily value minus the mean of the same calendar day.\n"
             f"Baseline: {baseline_text}; {WINDOW_DAYS}-day window, smoothed over {SMOOTH_DAYS} days.",
             fontsize=7, color=MUTED_COLOR, va="center")
    fig.savefig(path, dpi=150, facecolor="white")
    plt.close(fig)


# =============================================================================================
# Run
# =============================================================================================

def main():
    if WINDOW_DAYS < 1 or SMOOTH_DAYS < 1 or WINDOW_DAYS % 2 == 0 or SMOOTH_DAYS % 2 == 0:
        stop("WINDOW_DAYS and SMOOTH_DAYS must be odd numbers (for example 11 and 31).")
    if BASELINE_YEARS and (len(BASELINE_YEARS) != 2 or BASELINE_YEARS[0] > BASELINE_YEARS[1]):
        stop("BASELINE_YEARS must be None or two years like (1991, 2020).")

    table = read_data()
    print(f"Read {table.shape[1]} variable(s), {table.index[0].date()} to {table.index[-1].date()}.")
    start, end, peak, centre, chart_days = read_event(table)

    print("\nData checks:")
    anomalies, names = {}, {}
    for col in table.columns:
        baseline = check_variable(col, table[col])
        if baseline is None:
            continue
        full = anomaly(table[col], baseline)                       # anomaly of every day of the record
        window = full.reindex(chart_days)                          # only the days of the chart
        n_missing = int(window.isna().sum())
        if n_missing == len(chart_days):
            warn(f"'{col}': no data in the days of the chart; the panel shows 'No data'.")
        elif n_missing:
            warn(f"'{col}': {n_missing} of {len(chart_days)} days of the chart have no data (left empty in the chart).")
        anomalies[col] = window
        names[col] = VARIABLES.get(col, (col, ""))
    if not anomalies:
        stop("No variable has any data.")

    out = full_path(OUTPUT_FOLDER)
    out.mkdir(parents=True, exist_ok=True)
    label = "".join(c if c.isalnum() else "-" for c in EVENT_NAME.lower()).strip("-") or "event"

    result = pd.DataFrame({"date": chart_days.strftime("%Y-%m-%d")}, index=chart_days)
    result["in_event"] = ((chart_days >= start) & (chart_days <= end)).astype(int)
    for col, series in anomalies.items():
        result[f"{col}_anomaly"] = series.round(3)
    csv_path = out / f"{label}_anomalies.csv"
    result.to_csv(csv_path, index=False)

    png_path = out / f"{label}_anomalies.png"
    draw_chart(chart_days, anomalies, names, start, end, peak, png_path)

    print(f"\nSaved {png_path}\nSaved {csv_path}")
    print(f"Done with {len(warnings_list)} warning(s)." + ("" if not warnings_list else " See README.md, 'What the warnings mean'."))


if __name__ == "__main__":
    main()
