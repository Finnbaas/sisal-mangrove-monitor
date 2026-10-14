# Editing the content of the site

Everything the site **says and shows** is set in this folder. You can change it without
touching the code (`app.js`, `climatology.js`, `stakeholders.js`, `method.js`, `content.js`).

## The rule: `data/` versus `content/`

| Folder | What is in it | Who changes it |
|---|---|---|
| `data/` | Results: `points.json`, `events.json`, the yearly map images in `stakeholder-imagery/` | **Only the Python pipeline.** Never edit these files by hand. |
| `content/` | Everything the team writes: which pages show what, variables, labels, units, sources, texts, the Method page | **The team, by hand.** |

## The files

| File | What it decides |
|---|---|
| `pages.json` | Which pages (sections) exist and which cards each page shows, in which order |
| `variables.json` | Which variables are shown (point charts and storm charts), their labels, units and colors; trend metrics; change classes; scenarios; data sources; the year range |
| `texts.json` | Short texts: card titles, labels, messages, footer |
| `stakeholders.json` | The Stakeholder page: the areas on the map and what stakeholders said about them |
| `method.json` | The Method page: the analyses, their code files, and the "do it yourself" examples that the research cards link to |

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
- `wide` (optional): a list of cards that span the **full page width**, placed under the two
  columns. Use it for wide cards such as a table: `"wide": ["climate-table"]`.

**A new page**: add a section with a new `id` and `label`. It gets the Overview colors.
A page with `"columns": []` (or no cards) shows "This page has no content yet."

### Ready-made cards (write the name in quotes)

| Name | What it shows |
|---|---|
| `point-map` | Site map with the sample points (click to select a point) |
| `year-slider` | Year slider of the sample-point pages |
| `tipping-status` | Tipping-point scenario of the selected point |
| `point-chart` | Time-series chart of the selected point, one chip per point variable |
| `point-values` | Values of the selected point for the chosen year |
| `point-info` | Change class and coordinates of the selected point |
| `trend-signals` | EWS metrics and Kendall's tau of the selected point |
| `event-timeline` | Timeline of storms and extreme events |
| `event-list` | List of storms and extreme events |
| `event-charts` | The anomaly charts of the selected event, one per event variable |
| `stakeholder-map` | Map with the areas stakeholders pointed out (click to select an area) |
| `stakeholder-time` | Year slider that is also the time axis of the observation bars (goes directly under `stakeholder-map`) |
| `stakeholder-panel` | What stakeholders said about the selected area |

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

## stakeholders.json: the Stakeholder page

The file has three parts.

**`areas`**: the zones on the map. One entry per area:

```json
{ "number": 1, "zone": "Zone name", "class": "loss",
  "shape": { "type": "ellipse", "leftPct": 17.3, "topPct": 55.8, "widthPct": 22.0, "heightPct": 14.2 } }
```

- `number`: the number shown on the map and next to the bars. Each area has its own number.
- `zone`: the name of the zone. Leave it empty (`""`) if it is not known yet.
- `class`: `"loss"`, `"recovery"` or `"gain"` (the names and colors come from `changeClasses` in
  `variables.json`, the same ones the Satellite page uses).
- `shape`: where the area sits on the map image, in **percent of the image** (so it stays in
  place when the image changes): `leftPct` and `topPct` are the top-left corner of the ellipse,
  `widthPct` and `heightPct` its size.

**`observations`**: what stakeholders said. One entry per observation (one row of the interview table):

```json
{ "area": 1, "change": "", "period": "", "startYear": 1988, "endYear": 1990,
  "ongoing": false, "certainty": "exact", "cause": "", "stakeholderType": "",
  "quotes": [ { "text": "", "name": "" } ] }
```

- `area`: the `number` of the area it belongs to. An area can have several observations.
- `startYear`, `endYear`: numbers, no quotes. They place the bar on the timeline. For one single
  year, write the same year twice.
- `ongoing`: `true` if it is still happening; then write `"endYear": null`.
- `certainty`: `"exact"`, `"approximate"` (period estimated from vague answers) or `"expected"`
  (a change people expect but that has not happened yet).
- `change`, `period`, `cause`, `stakeholderType`: texts shown in the panel. An empty text (`""`)
  shows "Not yet available".
- `quotes`: what people said in their own words (paraphrased), each with a `name` label.
  Any number of quotes is possible.

**`imagery`**: where the yearly map images are (`folder`), their file type (`extension`) and the
image shown when a year has no image yet (`placeholder`). The images themselves are made by the
pipeline: see `data/stakeholder-imagery/README.txt`.

## texts.json: short texts

Change the text between the quotes. Words in curly brackets, like `{year}` or `{count}`, are
filled in by the site; keep them.

## method.json: the Method page

The Method page is short, like a data repository page: per analysis a brief description and the
code files to download. Everything on it comes from this file.

**At the top of the file**

- `title`, `intro`: the heading and the two sentences at the top of the page.
- `exampleContent`: `true` shows the small "Example content" tag next to the title. Set it to
  `false` when the content is final.
- `repository`, `branch`: the address of the GitHub repository and its main branch. The
  "View on GitHub" links are made from these.
- `license`, `citation`, `doi`: the block at the bottom of the page.

**`sections`**: one entry per analysis. Any number is possible.

```json
{ "id": "satellite", "title": "Satellite analysis", "description": "",
  "sources": [ { "label": "Landsat Collection 2", "url": "https://..." } ],
  "keyChoices": [ "Yearly maximum NDVI" ],
  "requirements": "", "folder": "analysis/satellite", "zip": "",
  "files": [ ... ], "useCases": [ ... ] }
```

- `id`: a short name. If it is the same as a page id in `pages.json` (`satellite`,
  `climatology`, `stakeholders`), the section gets the colors of that page.
- `description`, `requirements`: short texts. `sources`: a list of links (`url` may be empty).
  `keyChoices`: a short list. Keep it brief: the details live in the code files and their comments.
- `folder`: the folder of this analysis in the repository; the link "View this folder on GitHub"
  opens it. Leave it empty while the folder does not exist yet.
- `zip`: the path of a zip file with all files of this section. The button "Download all (.zip)"
  only appears when this is filled in.

**`files`**: the code files of a section. One entry per file; adding a file is adding one line:

```json
{ "name": "ndvi_timeseries.js", "description": "Extracts the NDVI time series for your coordinates.",
  "format": "Earth Engine", "path": "analysis/satellite/ndvi_timeseries.js" }
```

- `format`: the small tag (for example Python, Notebook, Earth Engine, CSV, PDF).
- `path`: where the file is in the repository. **While `path` is empty, the file is listed in
  grey as "Not yet available" and cannot be downloaded.** Put the file in the repository first,
  then fill in its path.
- A section without files shows "Files will be added here".

**`useCases`**: the "Do it yourself" examples of a section. Each one is a card in the gallery
(a picture of what you can make) that opens its steps and files when clicked:

```json
{ "id": "tipping-point-custom-location",
  "title": "Tipping point analysis for your own location",
  "image": "img/method/tipping-point.png",
  "steps": [ "Download the Earth Engine script ...", "Change the coordinates ..." ],
  "files": [ "ndvi_timeseries.js", "early_warning_signals.ipynb" ],
  "cards": [ "trend-signals" ] }
```

- `id`: the short name used in the link to this example: the Method page address plus
  `#method/` and the id. Lowercase letters, numbers and dashes only; each id may occur once.
- `image`: a picture of the result, in `img/method/`. Without it the card shows a grey tile.
- `steps`: three or four short instructions, one line each. Without steps the example shows
  "Steps will be added here".
- `files`: the **names** of the files this example needs, from the `files` of the same section.
- `cards`: the ready-made cards (see the table under pages.json) that get the small link
  **"Do this analysis yourself"**. The link opens the Method page at this example. A card can link
  to one example only.

## Placeholder states on the site

| What you see | Meaning |
|---|---|
| "This page has no content yet." | The page has no cards in `pages.json` |
| "Not yet available" | A `placeholder` card: the content is not decided yet |
| "No data" | The content is defined, but the data is missing from `data/` |
| "Files will be added here" / "Steps will be added here" | A Method section or example without files or steps yet |
| A file listed in grey, "Not yet available" | The file is named in `method.json` but has no `path` yet |
