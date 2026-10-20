# Sisal Mangrove Monitor

A web dashboard with the results of a mangrove monitoring study in Sisal, Yucatán, Mexico, made by
a team of TU Delft students together with UNAM. It shows historical data and finished analyses:
NDVI time series and tipping-point scenarios of fixed monitoring points, storms and the climate at
Sisal, and what local stakeholders observed.

The site only **shows** results. All numbers are calculated beforehand (Google Earth Engine and
Python) and stored as JSON files. It is plain HTML, CSS and JavaScript: no frameworks, no build
step, no backend. It is hosted on Netlify, which publishes the `main` branch automatically.

The downloadable analyses (Python and Earth Engine code to run on your own data) live in a separate repository: https://github.com/Finnbaas/sisal-mangrove-analyses

## Run it on your computer

1. Open this folder in VS Code.
2. Install the extension **Live Server** (by Ritwick Dey) once.
3. Right-click `index.html` → **Open with Live Server**. The site opens at http://127.0.0.1:5500.

Opening `index.html` directly (double-click) does **not** work: the browser then blocks the JSON
files. Changes to the files show after saving; Live Server reloads the page.

## The pages

| Address | Page |
|---|---|
| `#overview` | Map with the monitoring points, year slider, tipping-point status, point chart and values |
| `#satellite` | The same cards for the vegetation analysis |
| `#climatology` | "Storms at Sisal" (event list, storm charts) and "Climate at Sisal" (a typical year, change since 1950, in detail) |
| `#stakeholders` | Areas where stakeholders saw mangrove change, with a time axis and their observations |
| `#method` | Methods and code files to download; `#method/<id>` opens one "do it yourself" example |

## Folder structure

```
index.html            the one page of the site: top bar, footer and the "card library"
css/
  base.css            colors, section themes, layout, cards, footer (loaded first)
  points.css          Overview and Vegetation
  charts.css          stacked charts, shared by storms and climate
  climatology.css     Climatology page
  stakeholders.css    Stakeholder page
  method.css          Method page
js/
  helpers.js          small tools used everywhere ($, colors, number formatting, "No data")
  content.js          loads the content/ files, fills the texts, builds the pages
  charts.js           chart parts and the comparison line (used by storms and climate)
  navigation.js       switching between pages (the #address)
  points.js           Overview and Vegetation
  climatology-storms.js   Storms at Sisal
  climatology-climate.js  Climate at Sisal
  stakeholders.js     Stakeholder page
  method.js           Method page and the "Do this analysis yourself" links
  main.js             starts everything (loaded last)
content/              everything the team writes and edits (see content/README.md)
data/                 results of the analysis scripts: never edit by hand
analysis/             the Python scripts and notebooks that make data/
img/                  images used by the site
design/               reference images for design work (not used by the site)
```

Every file starts with a short comment: what it does, what it reads, and which files use it.
The scripts share their functions through the page, so the order of the `<script>` tags at the
bottom of `index.html` matters: `helpers.js` first, `main.js` last.

## How data gets to the site

```
satellite images, ERA5, HYCOM, interviews
        │  Google Earth Engine + Python (analysis/)
        ▼
data/*.json            points.json, events.json, climate/typical-year.json, stakeholder-imagery/
        │  read by the js files
        ▼
the site               only draws; it never calculates or changes numbers
```

- `data/climate/typical-year.json` is made by `analysis/climatology/export_typical_year.py`
  (see `analysis/climatology/README.md`, including which large data files you need).
- `data/points.json` and `data/events.json` come from the team's pipeline. Their structure is
  described in `CLAUDE.md`; the current values are partly illustrative.
- Missing values are shown as "No data", never filled in.

## Changing content without touching code

Texts, labels, units, which variables and charts are shown, which cards each page has, the
stakeholder observations and the Method page are all in `content/`. **`content/README.md` explains
every file**, with examples. A mistake in a JSON file shows a red message on the site naming the
file (and the line), instead of a blank page.

## Working together: branches and pull requests

We work in GitHub Desktop. `main` is what is live on Netlify, so nobody works on `main` directly.

1. **Fetch origin** and switch to `main`, so you start from the latest version.
2. **New branch** (Branch → New branch), with a short name for the change, e.g. `stakeholder-texts`.
3. Make the change and check it in Live Server.
4. **Commit** with a short message saying what changed, and **Publish branch** / **Push origin**.
5. **Create Pull Request** (opens GitHub). Describe what changed and which pages to check.
6. The other person checks the branch locally (switch to it in GitHub Desktop, Live Server) and
   approves; then **merge** the pull request on GitHub. Netlify publishes `main` within a minute.
7. Back in GitHub Desktop: switch to `main` and **Fetch / Pull** again before the next change.

Keep one change per branch, and avoid both editing the same file at the same time.

## More

- `CLAUDE.md`: the project rules (also used by Claude Code), including the structure of the data files.
- `content/README.md`: how to edit the content files.
- `analysis/climatology/README.md`: how to run the climatology export script.
- Designs are in Figma (Screens page = how the site looks now).

## Reference: details moved from CLAUDE.md

Claude Code reads CLAUDE.md in every session, so the long descriptions live here. Ask Claude to read a section when needed.

### File structure and conventions

#### File structure (keep it this way)
- README.md: for new team members: running the site, folder structure, data flow, branches and pull requests
- index.html: page structure (top bar, footer, the card library); loads the css and js files
- css/: one shared file plus one per screen. Load order in index.html: base, points, charts, climatology, stakeholders, method.
  - css/base.css: design tokens (colors as CSS variables at the top, named like the Figma Tokens), section themes, page, top bar, navigation, cards, placeholders, research layout, card actions, footer
  - css/points.css (Overview and Vegetation), css/charts.css (stacked charts shared by storms and climate), css/climatology.css, css/stakeholders.css, css/method.css
- js/: one file per screen plus shared helpers. All files share global names, so the script order in index.html matters (helpers.js first, main.js last); only main.js runs code, the others only define functions.
  - js/helpers.js: $, colors, number formatting (formatLike), escapeHtml, textOrPlaceholder, download, and the values every screen shares (year range, change classes, NO_DATA; filled by readSharedContent)
  - js/content.js: loads and checks content/pages.json, variables.json and texts.json, fills the texts, builds the pages, parts and simple cards, shows placeholder states
  - js/charts.js: the chart parts and the comparison line, shared by the storm charts and the climate charts
  - js/navigation.js: switching screens by the address (#overview ... #method), moving cards into place
  - js/points.js: Overview and Vegetation (map, year slider, point chart, values, trend signals, downloads)
  - js/climatology-storms.js: "Storms at Sisal" (event list, storm anomaly charts)
  - js/climatology-climate.js: "Climate at Sisal" (A typical year, Change since 1950, In detail)
  - js/stakeholders.js: the Stakeholder screen (areas on the map, the Time card with the observation bars, the area panel)
  - js/method.js: the Method page and the "Do this analysis yourself" links on the research cards
  - js/main.js: starts everything
- data/points.json: data of the monitoring points
- data/events.json: data of the storm and extreme-weather events (Climatology screen)
- data/climate/typical-year.json: the mean seasonal cycle per climate variable ("A typical year"), made by analysis/climatology/export_typical_year.py
- data/stakeholder-imagery/: one satellite snapshot per year for the Stakeholder map (1984.jpg ... 2026.jpg, all with exactly the same extent and crop)
- content/: everything the team writes and edits (see content/README.md):
  - content/pages.json: which pages exist and which cards each page shows
  - content/variables.json: variables (point, event and climate), trend metrics, change classes, scenarios, data sources, year range
  - content/texts.json: short labels and texts (card titles, messages, footer)
  - content/stakeholders.json: the Stakeholder screen: areas on the map and the stakeholder observations
  - content/method.json: the Method page: analyses, code files, use cases, and which research cards link to which use case
  - content/climate.json: "Climate at Sisal": the year range of Change since 1950, the trend texts and their badges
  - content/README.md: how to edit these files

**data/ versus content/ (always follow this):** data/ is pipeline output only and is never edited by hand.
content/ is everything the team writes and edits. Research content (which variables, charts, events,
labels, units, sources and texts) belongs in content/ or data/, never in the code.
- img/: images used by the site (site map, climatology data-cells map, workflow diagram, placeholder map of the Stakeholder screen; img/method/: pictures of the examples on the Method page)
- design/: reference images for design work (not used by the site)
- Google Fonts are loaded from the internet with a link tag in index.html (the only external resource besides CDN libraries)

The site is one page (index.html). The Research tab has four sections, each with its own address:
#overview, #satellite, #climatology, #stakeholders, plus #method for the Method tab
(#method/<use case id> opens the Method page at one use case). Every research
card exists once in index.html (the "card library") and is moved into the slots (data-slot) of the
section that is shown. Each section has its own theme colors ([data-section] blocks in css/base.css);
only the theme colors differ between sections, data colors never change.

Do not create new files or folders without explaining why first. If a file becomes very long, suggest how to split it before doing it.

Code conventions (keep them):
- Every file starts with a short comment: what it does, what it reads, which files use it.
- File names: lowercase with dashes (climatology-storms.js). JS functions and variables: camelCase; settings that never change: UPPER_CASE (PLOT, EVENT_LIST_ROWS). CSS classes and IDs: lowercase with dashes, named after the Figma component where there is one; do not rename existing classes or IDs without a reason.
- Shared code lives in one place: small tools in js/helpers.js, chart parts in js/charts.js. Do not copy a helper into a screen file.
- A new screen gets its own js/ and css/ file, added to index.html in the right order.


### Research content terms

EWS metrics: standard deviation, AR1 (lag-1 autocorrelation), return rate, kurtosis, skewness. Trends are tested with Kendall's tau. Breakpoints: a change of at least 0.25 NDVI within 12 months on the STL trend, after which the new level persists for at least 2 years (a drop followed by a quick recovery is resilience, not a breakpoint). LandTrendr is no longer used.

Tipping-point scenarios, based on the Kendall's tau trend of NDVI and of standard deviation (SD):
- Scenario 1, Abrupt transition (potential EWS): NDVI tau < 0 and SD tau > 0
- Scenario 2, Slowly transitioning (no EWS): NDVI tau < 0 and SD tau < 0
- Scenario 3, Recovering: NDVI tau > 0 and SD tau > 0
- Scenario 4, Stable: NDVI tau > 0 and SD tau < 0

Do not rename, merge or reinterpret these scenarios in the UI. If a label or explanation seems unclear, suggest a change instead of making it.

Labels are pending a team decision. Do not change them in either direction until this line is removed.


### Working from Figma designs

- Designs are in Figma. When given a Figma link, read the frame through the Figma MCP server.
- Translate the design into the existing structure above. Ignore any React or Tailwind code that Figma suggests.
- Figma variables become CSS variables at the top of css/base.css. Reuse existing variables before adding new ones.
- Figma components become reusable CSS classes (and small JavaScript functions where they need behavior).
- Annotations in Figma describe behavior. Follow them.
- Design size is 1440 x 900. The layout must also work at 1366 x 768 (no sideways scrolling, nothing cut off). Pages may scroll. On screens with a map and a year slider, the slider sits directly under the map, so both are visible together at 1366 x 768.
- If the design and the existing code conflict, or something in the design is unclear, ask instead of guessing.


### Structure of the data and content files

#### Structure of data/points.json
The file is one JSON array with one object per monitoring point (1138 points), made by analysis/satellite/export_points.py (never edit it by hand). Every point has:
- `id`, `name`: point code (e.g. "base_69"); the name is the same code.
- `changeClass`: the shape class of the NDVI line: "stable", "gain", "loss", "loss + recovery", "high turnover" or "non-mangrove" (from shape_classes_points(n=1138).csv; independent of the scenario).
- `lat`, `lon`: coordinates in decimal degrees.
- `leftPct`, `topPct`: marker position on the site map image, in percent.

Only the featured points (content/featured-points.json, the clickable markers) also have:
- `scenario`: number 1-4 (tipping-point scenario, see above); `null` for now (shown as "No data").
- `dates`: the months, "1993-01" to the last month of the data; `years`: the year of each month (used by the year slider).
- `ndvi`: monthly maximum NDVI, one value per entry in `dates` (the grey "raw NDVI" line of the plots; gaps filled as in the notebook).
- `ndviTrend` (featured points): the STL trend (deseasonalised) of the NDVI, one value per entry in `dates`; `null` in the months STL cuts off. `ndvi` and `ndviTrend` are the two lines of the notebook's NDVI plots, written by the notebook to analysis/satellite/featured_plot_lines.csv and featured_plot_breakpoints.csv, and copied into points.json by analysis/satellite/export_points.py.
- `breakpoints` (featured points): list of `{ "type": "drop" or "rise", "index": position in dates, "label": "2001-08", "windowStart", "windowEnd": positions in dates of the 12-month window, "magnitude" }`; an empty list if none was detected.
- `metricVals` (`null` for now): EWS values as strings: `stdDev`, `ar1`, `returnRate`, `kurtosis`, `skewness`.
- `metricTaus` (`null` for now): Kendall's tau per metric as signed strings (e.g. "+0.51"): `ndvi`, `stdDev`, `ar1`, `returnRate`, `kurtosis`, `skewness`.

#### Structure of data/events.json
The file is one JSON array with one object per storm (Climatology screen), newest first. It is made by `export_storms()` in analysis/climatology/export_typical_year.py. Each object has:
- `id`, `hurdatId`, `name`, `type`: event code (e.g. "opal-1995"), HURDAT2 id (e.g. "AL171995"; the storm map matches tracks to events by it), display name (e.g. "Opal"), and the strength near Sisal.
- `strengthNear`, `strengthPeak`: strongest class while within 100 km of Sisal, and over the whole life of the storm (HURDAT2): "tropical-depression", "tropical-storm" or "hurricane-1" to "hurricane-5". `strengthNear` is `null` if the storm was never within 100 km. The texts shown for them are in content/texts.json ("strengths"). `closestKm`: closest distance to Sisal in km.
- `stormPeriod`: `{ "start", "end", "peak" }` (YYYY-MM-DD), copied from content/storm-periods.json (the team edits that file). `peak` is `null` when there is no peak date yet. `note`: remark from the same file.
- `month`: "YYYY-MM", the month of the peak (or of the start of the storm period when there is no peak date); used for the date label, e.g. "Sep 1995".
- `baseline`: text describing the baseline period of the anomalies (shown in the chart header).
- `sources`: per variable the data source: "era5-land" (ERA5-Land land cell), "era5-sea" (ERA5 sea cell) or "hycom" (HYCOM cell).
- `dates`: array of days ("YYYY-MM-DD") around the event.
- `airTemperature` (°C), `windSpeed` (m/s), `waveHeight` (m), `precipitation` (mm/day), `salinity` (PSU), `seaSurfaceTemperature` (°C): daily anomalies (difference from the 30-year mean for the same calendar day), one value per entry in `dates`, in the same order. A missing value is `null`; an event without data has empty arrays.

#### Structure of data/climate/typical-year.json
The file is one JSON object, made by analysis/climatology/export_typical_year.py (never edit it by hand). It has:
- `months`: [1, ..., 12].
- `variables`: one object per climate variable, keyed by the `id` from climateVariables in content/variables.json (`airTemperature`, `precipitation`, `seaSurfaceTemperature`, `windSpeed`, `waveHeight`, `seaLevel`, `salinity`). Each has:
  - `unit`, `source` (a key of sources in content/variables.json: "era5-land", "era5-sea", "hycom" or "altimetry"), optional `note` (shown after the unit, e.g. "vs. annual mean"), optional `kind` ("bars" for rainfall).
  - `record`: `{ "start", "end" }`, the dates of the data period used.
  - `series`: list of lines, each `{ "id", "label" (optional), "mean", "p10", "p90" }` with 12 values per array (January to December). `p10` and `p90` (the shaded band) are left out when there is no band (rainfall, sea level). Air temperature has two series, `max` and `min`.

#### Structure of data/climate/wave-direction.json
Made by analysis/climatology/export_typical_year.py (never edit by hand); drawn as the wave rose by js/wave-rose.js. `unit`, `threshold` (a storm-wave day has a daily maximum wave height above this), `source`, `record` (`start`, `end`), `days` (`all`, `storm`: number of days in each group) and `sectors`: the 8 directions the waves come FROM (`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`), each with `all` and `storm`, the percentage of the days of that group (each group sums to 100).

#### Structure of content/climate.json
The file is one JSON object, written by the team. It has:
- `years`: `{ "first", "last" }`, the year axis of "Change since 1950".
- `badges`: the text per badge key (`significant`, `borderline`, `not-robust`, `no-trend`, `to-confirm`); the key also sets the badge color.
- `trends`: per climate variable id `{ "badge": a badge key }`, the team's verdict. The trend numbers come from data/climate/change.json.

#### Structure of data/climate/change.json
Made by analysis/climatology/export_typical_year.py (never edit by hand). `variables`: per climate variable id: `unit`, `trendUnit` (unit of slope and ci95: per decade, sea level per year), `record` (`start`, `end` year), optional `periods` (sea level: trends of 1993-2011 and 2012-2025) and `series` (air temperature: `max` and `min`), each `{ id, label, years, means (annual means), slope, ci95 (± 95%), p (p-value), fit (trend line value in the first and last year) }`.

#### Structure of content/stakeholders.json
The file is one JSON object, written by the team (Stakeholder screen). It is loaded by stakeholders.js; an error in it shows a message on the Stakeholder page only.
- `imagery`: `folder` and `extension` of the yearly map images (data/stakeholder-imagery/, one file per year named by the year) and the `placeholder` image shown when a year has no image.
- `areas`: one object per area on the map: `number`, `zone` (name, may be empty), `class` ("loss", "recovery" or "gain", a key of changeClasses in content/variables.json) and `shape` (`type` "ellipse" with `leftPct`, `topPct`, `widthPct`, `heightPct`, in percent of the map image).
- `observations`: one object per stakeholder observation: `area` (the area number), `change`, `period`, `cause`, `stakeholderType` (texts, may be empty), `startYear`, `endYear` (`null` if ongoing), `ongoing` (true/false), `certainty` ("exact", "approximate" or "expected") and `quotes` (list of `{ "text", "name" }`).
- An area is shown in a year when that year falls within at least one of its observations. Ongoing observations count up to the last year of yearRange. An empty text shows "Not yet available".

#### Structure of content/method.json
The file is one JSON object, written by the team (Method page). It is loaded by method.js; an error in it shows a message on the Method page only.
- `title`, `intro`, `exampleContent` (true shows the "Example content" tag), `repository` and `branch` (GitHub address, for the "View on GitHub" links), `license`, `citation`, `doi`.
- `sections`: one object per analysis: `id` (a page id from content/pages.json gives the section that page's theme colors), `title`, `folder` (folder in the repository, or a full https:// address for a folder in another repository; the "View on GitHub" link under the cards), `zip` (path of a zip with all files; the button only shows when filled), `files` and `useCases`. Climatology and Satellite also have `datasets` (list of the data sources) and `limitations` (list; leave empty for none), shown above the cards, and `infoCards` (cards whose small ↗ button opens the tab). A section without `datasets` (Stakeholders, for now) has the older collapsed block instead: `description`, `sources` (list of `{ "label", "url" }`), `keyChoices` and `requirements`.
- `files`: one object per code file: `name`, `description`, `format` (tag text) and `path` (path in the repository, or a full https:// address for a file in another repository; an empty path shows the file as "Not yet available" and not downloadable).
- `useCases`: one object per "do it yourself" example: `id` (short name, lowercase letters, numbers and dashes, used in the address #method/<id>), `title`, `image`, `howMade` (short text at the top of the panel), `keyChoices` (list of texts, or `{ "text", "more", "moreLabel" }` for a long choice with its rest behind a small toggle), `howWeUsed` and `howWeUsedLink`, `whatYouNeed` (list of texts), `infoCards` (research cards whose ↗ button opens this panel), `steps` (list of one-line instructions), `files` (names of files of the same section) and `cards` (names of ready-made cards that get the "Do this analysis yourself" link to this use case). Every part except the steps and files is left out of the panel when it is empty.
- Any number of sections, files and use cases is possible. Empty texts show "Not yet available".

#### Structure of data/climate/detail/<variable id>.json
Made by analysis/climatology/export_typical_year.py (never edit by hand); loaded by the website only when the tab of that variable is opened in "In detail". `unit`, `record` (`start`, `end`), `kind` ("daily" or "monthly-anomaly" for sea level) and `series` (air temperature: `max` and `min`). A daily series has `months` ("YYYY-MM"), `min` and `max` (lowest and highest day of the month) and `running` (365-day running mean, taken on the 15th). Sea level has `months`, `anomaly` (seasonal cycle removed) and `running` (12-month running mean). The annual means and trends are in change.json.
