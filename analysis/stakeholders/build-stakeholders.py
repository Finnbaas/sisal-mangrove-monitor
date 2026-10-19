"""
build-stakeholders.py
What it does: turns the raw Figma copy (figma-raw.json) into data/stakeholders/stakeholders.json:
  - every ellipse of the three Stakeholder maps converted to ONE shared base map (fractions),
  - every table row merged with its stakeholder entries,
  - a report of rows without a shape, shapes without a row and other oddities.
It also writes check-overlay.svg (all shapes on the base map) next to the output.
Reads: analysis/stakeholders/figma-raw.json, data/stakeholders/base-map.jpg (size only).
Used by: the Stakeholder page (js/stakeholders.js) reads only the JSON; this script is run by hand.
Run from the project root:  py analysis/stakeholders/build-stakeholders.py
"""
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "analysis" / "stakeholders" / "figma-raw.json"
OUT_DIR = ROOT / "data" / "stakeholders"

# Source typos fixed in the output only (the raw file keeps them).
TYPOS = {"Disturbancy": "Disturbance", "antrophological": "anthropogenic", "Governement": "Government"}

# Fill colour (R,G,B as read from Figma) -> severity.
SEVERITY_BY_FILL = {"255,199,194": "negative", "255,224,194": "at-risk", "205,244,211": "positive"}

raw = json.loads(RAW.read_text(encoding="utf-8"))
MAP_W = raw["mapSize"]["width"]
MAP_H = raw["mapSize"]["height"]
report = []


def fix(value):
    """Apply the typo fixes to every string in a nested structure."""
    if isinstance(value, str):
        for wrong, right in TYPOS.items():
            value = value.replace(wrong, right)
        return value
    if isinstance(value, list):
        return [fix(v) for v in value]
    if isinstance(value, dict):
        return {k: fix(v) for k, v in value.items()}
    return value


def clean(text):
    """Trim stray line breaks and spaces from a table cell."""
    return re.sub(r"\s+", " ", text).strip()


def center_of(item):
    """Centre of a Figma node in section coordinates. Figma rotates counter-clockwise (rot, degrees)
    around the top-left corner (x, y); the width and height are the unrotated size."""
    t = math.radians(item.get("rot", 0))
    cx = item["x"] + item["w"] / 2 * math.cos(t) + item["h"] / 2 * math.sin(t)
    cy = item["y"] - item["w"] / 2 * math.sin(t) + item["h"] / 2 * math.cos(t)
    return cx, cy


# ---------------------------------------------------------------- shapes
shapes = []
labels_by_theme = {}
for lab in raw["labels"]:
    labels_by_theme.setdefault(lab["theme"], []).append(lab)

for el in raw["ellipses"]:
    theme = raw["themes"][el["theme"]]
    ox, oy = theme["aoiOrigin"]  # top-left of the map image inside that Figma section
    cx, cy = center_of(el)
    cx -= ox
    cy -= oy  # now in base-map pixels (the three map images are identical and the same size)
    severity = SEVERITY_BY_FILL[el["fill"]]
    shape = {
        "id": el["id"][1:],  # the number on the map only ("4", "5a"); the theme field tells the maps apart
        "theme": el["theme"],
        "severity": severity,
        "ellipse": {
            # centre as a fraction of the map width / height
            "cx": round(cx / MAP_W, 5),
            "cy": round(cy / MAP_H, 5),
            # width and height both as a fraction of the map WIDTH, so a rotation stays a true rotation
            "width": round(el["w"] / MAP_W, 5),
            "height": round(el["h"] / MAP_W, 5),
            # degrees, clockwise (SVG convention); Figma counts counter-clockwise
            "rotation": round(-el["rot"], 2),
        },
        "figmaNode": el["node"],
    }
    # Which number bubble sits nearest? Used as a sanity check of the id read from the layout.
    ecx, ecy = center_of(el)
    best = None
    for lab in labels_by_theme[el["theme"]]:
        if "hidden" in lab.get("note", ""):
            continue
        lcx, lcy = center_of(lab)
        d = math.hypot(lcx - ecx, lcy - ecy)
        if best is None or d < best[0]:
            best = (d, lab["text"])
    shape["_nearestLabel"] = best[1]
    if best[1] != el["id"][1:]:
        report.append(f"CHECK: shape {el['id']} (node {el['node']}) has nearest number bubble '{best[1]}'")
    shapes.append(shape)

# Condition: cause from the bubble style (filled grey = natural, white = anthropogenic).
for shape in shapes:
    if shape["theme"] != "condition":
        continue
    number = shape["id"]
    bubble = [l for l in labels_by_theme["condition"] if l["text"] == number and "hidden" not in l.get("note", "")]
    shape["cause"] = ("natural" if bubble[0]["fill"] == "117,117,117" else "anthropogenic") if bubble else None

# Drop helper fields, then compute the extent of the drawing against the base map.
for shape in shapes:
    shape.pop("_nearestLabel")

# How far do the rotated ellipses reach outside the base map (0..1)?
min_x = min_y = 1e9
max_x = max_y = -1e9
for s in shapes:
    e = s["ellipse"]
    t = math.radians(e["rotation"])
    half_w, half_h = e["width"] * MAP_W / 2, e["height"] * MAP_W / 2
    ex = math.hypot(half_w * math.cos(t), half_h * math.sin(t))
    ey = math.hypot(half_w * math.sin(t), half_h * math.cos(t))
    px, py = e["cx"] * MAP_W, e["cy"] * MAP_H
    min_x, max_x = min(min_x, px - ex), max(max_x, px + ex)
    min_y, max_y = min(min_y, py - ey), max(max_y, py + ey)
report.append(
    "Shape extent in base-map fractions: x %.4f..%.4f, y %.4f..%.4f (inside the map = 0..1)"
    % (min_x / MAP_W, max_x / MAP_W, min_y / MAP_H, max_y / MAP_H)
)

# ---------------------------------------------------------------- table rows
rows = []
CODE = re.compile(r"^([A-Z]+\d+):\s*(.*)$", re.S)
for theme_key, table in raw["tables"].items():
    theme = raw["themes"][theme_key]
    cols = table["columns"]
    current = None
    for cells in table["rows"]:
        if cells[0] != "":  # a new row starts where the first column is filled
            number = cells[0]
            row_id = "1" if number == "-" else number  # the Condition "-" row is number 1
            current = {"id": row_id, "theme": theme_key, "sourceNumber": number, "zone": clean(cells[1])}
            if theme_key == "condition":
                current.update(signal=clean(cells[2]), period=clean(cells[3]), cause=clean(cells[4]))
            elif theme_key == "extent":
                current.update(change=clean(cells[2]), period=clean(cells[3]), cause=clean(cells[4]))
            else:
                current.update(disturbance=clean(cells[2]), period=clean(cells[3]), recovery=clean(cells[4]),
                               recoveryMode=clean(cells[5]))
            current["stakeholders"] = []
            rows.append(current)
        group, said = clean(cells[-2]), cells[-1]
        match = CODE.match(said.strip())
        if not match:
            report.append(f"TEXT: {current['id']} entry without a stakeholder code: {said[:40]!r}")
            continue
        current["stakeholders"].append({"code": match.group(1), "group": group, "text": clean(match.group(2))})

# An entry whose group cell is empty takes the group of the same code elsewhere (and is reported).
first_group = {}
for r in rows:
    for s in r["stakeholders"]:
        if s["group"]:
            first_group.setdefault(s["code"], s["group"])
for r in rows:
    for s in r["stakeholders"]:
        if not s["group"]:
            s["group"] = first_group[s["code"]]
            report.append(f"FILLED: group of {s['code']} in {r['id']} was empty in Figma, set to '{s['group']}'")

# Stakeholder groups per code: report codes that appear under more than one group name.
groups_by_code = {}
for r in rows:
    for s in r["stakeholders"]:
        groups_by_code.setdefault(s["code"], set()).add(fix(s["group"]))
for code, groups in sorted(groups_by_code.items()):
    if len(groups) > 1:
        report.append(f"CHECK: code {code} appears under several groups: {sorted(groups)}")

# ---------------------------------------------------------------- link rows and shapes
for r in rows:
    r["shapeCount"] = sum(1 for s in shapes if s["id"] == r["id"] and s["theme"] == r["theme"])
    r["hasShape"] = r["shapeCount"] > 0
    del r["shapeCount"]
row_keys = {(r["theme"], r["id"]) for r in rows}
for r in rows:
    if not r["hasShape"]:
        report.append(f"ROW WITHOUT SHAPE: {r['theme']} {r['id']} ({r['zone']})")
for theme, sid in sorted({(s["theme"], s["id"]) for s in shapes} - row_keys):
    report.append(f"SHAPE WITHOUT ROW: {theme} {sid}")

themes_out = {}
for key, t in raw["themes"].items():
    themes_out[key] = {"title": t["title"], "description": t["description"],
                       "legend": {k: v.lstrip("= ").strip() for k, v in t["legend"].items()}}
    if "causeLegend" in t:
        themes_out[key]["causeLegend"] = {k: v.lstrip("= ").strip() for k, v in t["causeLegend"].items()}

output = {
    "source": "Figma file OIsCHIyqMGewUMMOFlbMpr, Playground: sections 1. Extent, 2. Condition, 3. Disturbance and Recovery",
    "baseMap": {"file": "data/stakeholders/base-map.jpg", "aspectRatio": round(MAP_W / MAP_H, 4)},
    "geometryNote": ("ellipse.cx / cy are fractions of the base-map width / height (0-1). ellipse.width / height are both "
                     "fractions of the base-map WIDTH. ellipse.rotation is in degrees, clockwise, around the centre."),
    "themes": themes_out,
    "shapes": shapes,
    "rows": rows,
}
output = fix(output)
OUT_DIR.mkdir(parents=True, exist_ok=True)
(OUT_DIR / "stakeholders.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

# ---------------------------------------------------------------- check image (SVG, rendered to PNG by hand)
LETTER = {"extent": "E", "condition": "C", "disturbance": "D"}  # letters only in this check image
COLORS = {"negative": "#f24822", "at-risk": "#ff9e42", "positive": "#66d575"}
FILLS = {"negative": "#ffc7c2", "at-risk": "#ffe0c2", "positive": "#cdf4d3"}
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {MAP_W} {MAP_H:.0f}" width="1600">',
         f'<image href="base-map.jpg" x="0" y="0" width="{MAP_W}" height="{MAP_H}"/>']
for s in sorted(output["shapes"], key=lambda s: -s["ellipse"]["width"] * s["ellipse"]["height"]):
    e = s["ellipse"]
    cx, cy, w, h = e["cx"] * MAP_W, e["cy"] * MAP_H, e["width"] * MAP_W, e["height"] * MAP_W
    parts.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{w/2:.1f}" ry="{h/2:.1f}" transform="rotate({e["rotation"]} {cx:.1f} {cy:.1f})" '
                 f'fill="{FILLS[s["severity"]]}" fill-opacity="0.7" stroke="{COLORS[s["severity"]]}" stroke-width="4" stroke-dasharray="16 10"/>')
for s in output["shapes"]:
    e = s["ellipse"]
    parts.append(f'<text x="{e["cx"]*MAP_W:.1f}" y="{e["cy"]*MAP_H:.1f}" font-size="70" font-family="Arial" font-weight="bold" '
                 f'text-anchor="middle" dominant-baseline="central" stroke="#fff" stroke-width="14" paint-order="stroke" fill="#222">{LETTER[s["theme"]]}{s["id"]}</text>')
parts.append("</svg>")
(OUT_DIR / "check-overlay.svg").write_text("\n".join(parts), encoding="utf-8")

print(f"{len(shapes)} shapes, {len(rows)} rows, {sum(len(r['stakeholders']) for r in rows)} stakeholder entries")
print("\n".join(report))
