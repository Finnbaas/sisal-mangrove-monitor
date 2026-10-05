# Editing the content of the site

Everything the site **says and shows** is set in this folder. You can change it without
touching the code (`app.js`, `climatology.js`, `content.js`).

## The rule: `data/` versus `content/`

| Folder | What is in it | Who changes it |
|---|---|---|
| `data/` | Results: `points.json`, `events.json` | **Only the Python pipeline.** Never edit these files by hand. |
| `content/` | Everything the team writes: which pages show what, variables, labels, units, sources, texts, the Method page | **The team, by hand.** |

## The files

| File | What it decides |
|---|---|
| `pages.json` | Which pages (sections) exist and which cards each page shows, in which order |
| `variables.json` | Which variables are shown (point charts and storm charts), their labels, units and colors; trend metrics; change classes; scenarios; data sources; the year range |
| `texts.json` | Short texts: card titles, labels, messages, footer |
| `method.md` | The whole Method page (Markdown) |
| `gee-starter-script.txt` | The Earth Engine script shown on the Method page |

Images go in `img/` (outside this folder) and are referred to as `img/name.png`.

## Editing JSON files safely

JSON is strict. Most mistakes are one of these:
- Every text needs **double quotes**: `"label": "NDVI"` (not single quotes).
- Items in a list or object are separated by **commas**, but there is **no comma after the last one**.
- Numbers and `true` / `false` / `null` have **no quotes**.

If a file has a mistake, the site shows a red message naming the file (and, where possible, the
line) instead of a blank page. Undo your last change or fix that spot.
Tip: paste the file into https://jsonlint.com to find the mistake.

## pages.json: what each page shows

```json
{ "id": "overview", "label": "Overview",
  "columns": [
    ["point-map", "year-slider", "tipping-status"],
    ["point-chart", "point-values", ["point-info", "trend-signals"]]
  ] }
```

- `id`: the page address (`#overview`). Lowercase, no spaces.
- `label`: the name in the menu under the top bar.
- `columns`: a left and a right column, each a list of cards from top to bottom.
  A list inside a list (`["point-info", "trend-signals"]`) puts two cards next to each other.

**A new page**: add a section with a new `id` and `label`. It gets the Overview colors.
A page with `"columns": []` (or no cards) shows "This page has no content yet."

### Ready-made cards (write the name in quotes)

| Name | What it shows |
|---|---|
| `point-map` | Site map with the sample points (click to select a point) |
| `year-slider` | Year slider (shared by all pages) |
| `tipping-status` | Tipping-point scenario of the selected point |
| `point-chart` | Time-series chart of the selected point, one chip per point variable |
| `point-values` | Values of the selected point for the chosen year |
| `point-info` | Change class and coordinates of the selected point |
| `trend-signals` | EWS metrics and Kendall's tau of the selected point |
| `event-timeline` | Timeline of storms and extreme events |
| `event-list` | List of storms and extreme events |
| `event-charts` | The anomaly charts of the selected event, one per event variable |

### Simple cards (write them as an object)

```json
{ "type": "image", "title": "Site map", "src": "img/climatology-data-cells.png", "alt": "Description for screen readers" }
{ "type": "placeholder" }
{ "type": "placeholder", "title": "Factors", "message": "Not yet available" }
{ "type": "text", "title": "About", "text": "A short paragraph." }
```

- `image`: `title` is optional. Optional `height` (in pixels) crops the image to that height;
  `keepVisible` (`"left"`, `"right"`, `"top"`, `"bottom"`) says which side stays visible when cropping.
  Always write an `alt` text: it describes the image for people who cannot see it.
- `placeholder`: a card whose content is not decided yet. Shows "Not yet available" or your `message`.
- `text`: a card with a title and a paragraph.

## variables.json: what is measured

**Add a variable to the point charts**: add a line to `pointVariables`:

```json
{ "id": "ndvi", "label": "NDVI", "unit": "index, 0–1", "color": "data-ndvi", "shownAtStart": true }
```

- `id` must be the **exact field name** in `data/points.json`. If the data has no such field,
  the site shows "No data" for it.
- `shownAtStart`: whether its line is switched on when the page opens.
- `color`: the name of a color from the design (Figma variables / top of `style.css`), without
  `--color-`. A **new** color is a design change: ask the designer to add it in Figma and
  `style.css` first. A color name that does not exist shows as grey.

`eventVariables` works the same way for the storm charts (`id` = field name in `data/events.json`).
Each one becomes one chart; any number is possible. `sources` names the data sources that
`data/events.json` refers to.

`trendMetrics`: `value` and `tau` are field names in `metricVals` and `metricTaus` of
`data/points.json` (`null` = no value, shown as "—").

`scenarios`: the scenario labels are **pending a team decision**; change them only when the team
has decided (see CLAUDE.md).

## texts.json: short texts

Change the text between the quotes. Words in curly brackets, like `{year}` or `{count}`, are
filled in by the site; keep them.

## method.md: the Method page

Written in Markdown:
- `# Title` and the paragraph under it form the first card.
- Every `## Heading` starts a new card.
- `![Description](img/workflow.png)` shows an image.
- A numbered list with a **bold** title per step becomes the numbered steps:
  `1. **Open the Code Editor** Go to code.earthengine.google.com …`
- A line starting with `>` becomes the grey note box at the bottom.
- `{{scenario-table}}` inserts the colored scenario table (made from `scenarios` in `variables.json`).
- `{{gee-starter-script}}` inserts the script from `gee-starter-script.txt`.

## Placeholder states on the site

| What you see | Meaning |
|---|---|
| "This page has no content yet." | The page has no cards in `pages.json` |
| "Not yet available" | A `placeholder` card: the content is not decided yet |
| "No data" | The content is defined, but the data is missing from `data/` |
