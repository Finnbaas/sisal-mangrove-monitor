# Editing the content of the site

Everything the site **says and shows** is set in this folder. You can change it without
touching the code (the `js/` and `css/` folders).

## The rule: `data/` versus `content/`

| Folder | What is in it | Who changes it |
|---|---|---|
| `data/` | Results: `points.json`, `events.json`, `climate/typical-year.json`, the yearly map images in `stakeholder-imagery/` | **Only the Python pipeline.** Never edit these files by hand. |
| `content/` | Everything the team writes: which pages show what, variables, labels, units, sources, texts, the Method page | **The team, by hand.** |

## The files

| File | What it decides |
|---|---|
| `pages.json` | Which pages (sections) exist and which cards each page shows, in which order |
| `variables.json` | Which variables are shown (point charts and storm charts), their labels, units and colors; trend metrics; change classes; scenarios; data sources; the year range |
| `texts.json` | Short texts: card titles, labels, messages, footer |
| `stakeholders.json` | The Stakeholder page: the areas on the map and what stakeholders said about them |
| `method.json` | The Method page: the analyses, their code files, and the "do it yourself" examples that the research cards link to |
| `climate.json` | "Climate at Sisal" on the Climatology page: the year range of "Change since 1950", the trends and their badges |

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
- `label`: the name of the page in the top bar.
- `title`, `intro` and `band` (optional): the band at the top of the page, under the top bar: the page title and a short intro in white over an image. `band` is the image (for example `img/site-map.png`); without it the band is the solid dark color of the page. An intro may contain {placeholders} that are filled in with numbers.
- `columns`: a left and a right column, each a list of cards from top to bottom.
  A list inside a list (`["point-info", "trend-signals"]`) puts two cards next to each other.
- `wide` (optional): a list of cards that span the **full page width**, placed under the two
  columns. A list inside it puts two cards next to each other, each half the width.
- `parts` (optional, instead of `columns` and `wide`): a long page in parts, like Climatology
  ("Storms at Sisal", "Climate at Sisal"). At the top of the page comes a section navigation with one
  link per part, which stays in view while scrolling. Each part has:

  ```json
  { "id": "climate", "title": "Climate at Sisal", "intro": "One sentence under the title.",
    "aside": "climate-sources", "columns": [ ... ], "wide": [ ... ] }
  ```

  `title` and `intro` are the heading of the part; `aside` (optional) is a small card shown next to
  the heading; `columns` and `wide` work as above.
  Each part has its own address, `#<page id>/<part id>` (e.g. `#satellite/ndvi`): the link in the section
  navigation changes the address and scrolls to the part, so the back button works per part. A card can
  only be used once per page. In an `intro` of the Vegetation page, `{total}` and `{featured}` become the
  number of points and of clickable points.
- `partsAsTabs` (optional, with `parts`; not used at the moment): `true` shows one part at a time, like
  tabs, instead of below each other; `#satellite` alone then opens the first part. A card can then be used
  in several parts (e.g. the point map): it moves into the part that is shown.

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
| `event-list` | List of storms and extreme events |
| `event-charts` | The anomaly charts of the selected event, one per event variable |
| `climate-sources` | Small "Where the data comes from" card with the map of the data cells (used as `aside` of "Climate at Sisal") |
| `climate-typical-year` | "A typical year": one chart per climate variable, monthly mean with 10th–90th percentile band |
| `climate-change` | "Change since 1950": one chart per climate variable, with the trend and its badge |
| `climate-detail` | "In detail": one tab per climate variable, with record period, the daily values and the annual means with the trend |
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

```json
{ "type": "planned", "title": "When storms come", "expand": false,
  "graphs": [ { "title": "Storms per year", "label": "Bar chart, 1950 to 2025", "height": 150 },
              { "title": "Storms per month", "label": "Bar chart, J to D", "height": 150, "width": 224 } ] }
{ "type": "group", "title": "Climate overview", "cards": ["climate-typical-year", "climate-change"], "note": "optional small grey line under the cards" }
```

- `planned`: a card whose graphs are designed but not built yet. Each graph is a light box with its
  `title` and a `label` saying what it will show. `height` and `width` are in pixels (optional; a graph
  without `width` shares the free width). `"expand": true` adds the expand button.
- `group`: one card with a small title that holds ready-made cards side by side, as parts of one card.
  Their rows line up (title, charts, axis).

## variables.json: what is measured

**Coordinates**: `coordinateDecimals` sets how many decimals the coordinates of the selected point are
shown with (top bar and Point info card); 5 is about 1 m. Display only: `data/points.json` keeps the full values.

**Add a variable to the point charts**: add a line to `pointVariables`:

```json
{ "id": "ndvi", "label": "NDVI", "unit": "index, −1 to 1", "decimals": 4, "axisRange": [-1, 1], "color": "data-ndvi", "shownAtStart": true }
```

- `id` must be the **exact field name** in `data/points.json`. If the data has no such field,
  the site shows "No data" for it.
- `shownAtStart`: whether its line is switched on when the page opens.
- `decimals` (optional): how many decimals to show; without it, as many as the data has.
- `axisRange` (optional): fixed lowest and highest value of the y-axis; without it, the axis follows the data.
- `trend` (optional): `{ "id", "label" }` of a trend line drawn in the same chart, as in the NDVI plots
  (`id` = field name in `data/points.json`, e.g. `ndviTrend`). The variable's own line is then grey, the
  trend has the color of the point's change class, and the breakpoints are drawn in this chart.
- `lineLabel` (optional): the name of the variable's own line next to the trend (e.g. "raw NDVI").
- `color`: the name of a color from the design (Figma variables / top of `css/base.css`), without
  `--color-`. A **new** color is a design change: ask the designer to add it in Figma and
  `css/base.css` first. A color name that does not exist shows as grey.

`eventVariables` works the same way for the storm charts (`id` = field name in `data/events.json`).
Each one becomes one chart; any number is possible. `sources` names the data sources that
`data/events.json` refers to.

`climateVariables` works the same way for "Climate at Sisal" (the cards `climate-typical-year`,
`climate-change` and `climate-detail`). `id` is the variable name in
`data/climate/typical-year.json` and in `trends` of `climate.json`; the list order is the order
of the charts and tabs. The unit and data source come from the data file. Optional
`seriesLabels` names the lines of a variable with more than one line, for example
`{ "max": "max", "min": "min" }` for air temperature; such a variable gets one "In detail" tab per line.

`trendMetrics`: the rows of the trend signals card. `ews` is the id of an early warning signal in
the "ews" of the points in `data/points.json` (`ar1`, `sd`, `skewness`, `kurtosis`); the card shows its p and Kendall's tau.
`null` = no data for this row yet (shown as "No data").

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
  `variables.json`, the same ones the Vegetation page uses).
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

## climate.json: "Climate at Sisal"

The year axis and the verdict badges of "Change since 1950" and "In detail". The trend numbers and the charts come from `data/climate/change.json`.

```json
{ "years": { "first": 1950, "last": 2025 },
  "badges": { "significant": "Significant", "borderline": "Borderline", ... },
  "trends": {
    "airTemperature": { "badge": "significant" },
    ... } }
```

- `years`: the year axis of "Change since 1950".
- `badges`: the text of each badge. The key (`significant`, `borderline`, `not-robust`,
  `no-trend`, `to-confirm`) also sets its color.
- `trends`: one entry per variable (`id` from `climateVariables`): `badge` is one key of `badges`, your verdict on the trend. The trend value itself is shown from the data. A variable without an entry shows no badge.

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
- `downloadsRepository`: the full address of the repository with the downloadable analyses. The
  GitHub button at the top of the page links to it (empty: it links to `repository`).
- `license`, `citation`, `doi`: the block at the bottom of the page.

**`sections`**: one entry per analysis. Any number is possible.

```json
{ "id": "satellite", "title": "Vegetation analysis", "description": "",
  "sources": [ { "label": "Landsat Collection 2", "url": "https://..." } ],
  "keyChoices": [ "Yearly maximum NDVI" ],
  "requirements": "", "folder": "analysis/satellite", "zip": "",
  "files": [ ... ], "useCases": [ ... ] }
```

- `id`: a short name. If it is the same as a page id in `pages.json` (`satellite`,
  `climatology`, `stakeholders`), the section gets the colors of that page.
- `description`, `requirements`: short texts. `sources`: a list of links (`url` may be empty).
  `keyChoices`: a short list. Keep it brief: the details live in the code files and their comments.
  A long choice can be split: `{ "text": "first sentence", "more": "the rest", "moreLabel": "Show thresholds" }`;
  the rest is then hidden behind a small toggle with that label (without `moreLabel`: "Show more").
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
- `path`: where the file is in the repository. **While `path` is empty, the GitHub icon of the file is
  grey and has no link (hovering says "Not yet available").** Put the file in the repository first,
  then fill in its path.
- The files of a section are only shown in the panel of an example that names them in its `files`
  (one line each: name, type tag, GitHub icon; the `description` shows on hover). An example without
  files shows "Files will be added here".
- The Method page has one tab per section. The background texts of a section (`description`, `sources`,
  `keyChoices`, `requirements`) are in the collapsed row "About this analysis".

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
  "Steps will be added here". A step can use numbers in curly brackets
  (for example `{storms.baseline}`, see below).
- `files`: the **names** of the files this example needs, from the `files` of the same section.
- `cards`: the ready-made cards (see the table under pages.json) that get the small link
  **"Do this analysis yourself"**. The link opens the Method page at this example. A card can link
  to one example only.

**Texts with numbers** (section `datasets` and `limitations`, use case `howMade`):

- `datasets`: one line per dataset (name, variables, period) and `limitations`: at most three short lines.
  A section with `datasets` shows them as a compact list above the cards instead of the row "About this analysis".
- `howMade`: at most two sentences, shown as "How this is made" at the top of the panel of a use case.
- `howWeUsed` (optional, one sentence) with `howWeUsedLink` (optional, e.g. `#climatology`): shown as "How we used it", with a link to the page that shows the result.
- `whatYouNeed` (optional, list of 1 or 2 lines): shown as "What you need".
- `infoCards` (use case or section): research cards whose small ↗ button opens that panel (a section: its tab).
- Numbers in curly brackets (also in `steps`) are filled in from the data files, so they always match the research
  page: `{storms.total}`, `{storms.start}`, `{storms.end}`, `{storms.studied}`, `{storms.notCounted}`,
  `{storms.rule}`, `{storms.baseline}`, `{storms.windowDays}`, `{record.<variable id>.start}` and `.end`
  (for example `{record.salinity.start}`), `{trend.pLimit}`, `{seaLevel.periods}`, `{wave.threshold}`,
  `{wave.all}`, `{wave.storm}`, `{wave.start}`, `{wave.end}`. A number that is missing shows "No data".

## Placeholder states on the site

| What you see | Meaning |
|---|---|
| "This page has no content yet." | The page has no cards in `pages.json` |
| "Not yet available" | A `placeholder` card: the content is not decided yet |
| "No data" | The content is defined, but the data is missing from `data/` |
| "Files will be added here" / "Steps will be added here" | A Method section or example without files or steps yet |
| A grey GitHub icon on a file line | The file is named in `method.json` but has no `path` yet |
