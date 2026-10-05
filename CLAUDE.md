# Sisal Mangrove Monitor

## About this project
A web dashboard that shows the results of a mangrove monitoring study in Sisal, Yucatán, Mexico. It is made by a team of TU Delft students together with UNAM.

- The dashboard shows historical data and finished analyses for about 50 fixed monitoring points: NDVI time series, climatology data, early warning signal (EWS) metrics and a tipping-point scenario per point.
- All data is calculated beforehand (Google Earth Engine + Python) and stored as JSON. The website only displays it. There are no live calculations.
- Users: researchers and policymakers, on laptops. Not designed for phones.
- The team has very little web development experience. Keep the code simple, readable and well commented, so a non-developer can follow what each part does.

## Tech rules (always follow these)
- Plain HTML, CSS and JavaScript only.
- Do NOT use React, Vue, Tailwind, TypeScript, npm packages or any build step.
- Charts are hand-drawn SVG. There is no chart library.
- External libraries only through CDN script tags. Ask before adding any library.
- No backend, no database, no API keys. The site is fully static.
- The site is hosted on Netlify and deploys automatically from the main branch on GitHub.

## File structure (keep it this way)
- index.html: page structure
- style.css: all styling. Design tokens (colors, fonts, spacing) are CSS variables at the top of this file.
- app.js: shared behavior (loading point data, map, point charts, navigation between screens)
- climatology.js: the Climatology screen (storm events: timeline, event list, the anomaly charts)
- content.js: loads and checks the content/ files, builds the pages and the simple cards from content/pages.json, shows placeholder states
- data/points.json: data of the monitoring points
- data/events.json: data of the storm and extreme-weather events (Climatology screen)
- content/: everything the team writes and edits (see content/README.md):
  - content/pages.json: which pages exist and which cards each page shows
  - content/variables.json: variables (point and event), trend metrics, change classes, scenarios, data sources, year range
  - content/texts.json: short labels and texts (card titles, messages, footer)
  - content/method.md: the Method page (Markdown)
  - content/gee-starter-script.txt: the Earth Engine script on the Method page
  - content/README.md: how to edit these files

**data/ versus content/ (always follow this):** data/ is pipeline output only and is never edited by hand.
content/ is everything the team writes and edits. Research content (which variables, charts, events,
labels, units, sources and texts) belongs in content/ or data/, never in the code.
- img/: images used by the site (site map, climatology data-cells map, workflow diagram)
- design/: reference images for design work (not used by the site)
- Google Fonts are loaded from the internet with a link tag in index.html (the only external resource besides CDN libraries)

The site is one page (index.html). The Research tab has four sections, each with its own address:
#overview, #satellite, #climatology, #stakeholders, plus #method for the Method tab. Every research
card exists once in index.html (the "card library") and is moved into the slots (data-slot) of the
section that is shown. Each section has its own theme colors ([data-section] blocks in style.css);
only the theme colors differ between sections, data colors never change.

Do not create new files or folders without explaining why first. If app.js becomes very long, suggest how to split it before doing it.

## Data rules
- All data comes from data/points.json (monitoring points) and data/events.json (storm events). Results and data values must never be hardcoded in HTML or JavaScript. This includes point and event names, numbers and counts (for example the number of points).
- Labels, units, the year range, variable lists, sources and texts live in content/ (variables.json, texts.json, method.md), not in the code. Cards and charts are generic: they show whatever content/ lists, for any number of variables.
- If a JSON file in content/ or data/ cannot be read, the page shows a clear message naming the file instead of a blank page.
- Never invent, round off or "fill in" data. If data is missing, show that clearly in the UI (for example "No data").
- Do not change the structure of points.json or events.json without asking. They are produced by the team's Python pipeline, so a change there also means a change in the pipeline.
- Some variables do not apply to every point (for example salinity does not apply to land points). Show these as unavailable, do not hide the fact.

## Research content (use these terms exactly)
EWS metrics: standard deviation, AR1 (lag-1 autocorrelation), return rate, kurtosis, skewness. Trends are tested with Kendall's tau. Breakpoints are detected with LandTrendr.

Tipping-point scenarios, based on the Kendall's tau trend of NDVI and of standard deviation (SD):
- Scenario 1, Abrupt transition (potential EWS): NDVI tau < 0 and SD tau > 0
- Scenario 2, Slowly transitioning (no EWS): NDVI tau < 0 and SD tau < 0
- Scenario 3, Recovering: NDVI tau > 0 and SD tau > 0
- Scenario 4, Stable: NDVI tau > 0 and SD tau < 0

Do not rename, merge or reinterpret these scenarios in the UI. If a label or explanation seems unclear, suggest a change instead of making it.

Labels are pending a team decision. Do not change them in either direction until this line is removed.

## Working from Figma designs
- Designs are in Figma. When given a Figma link, read the frame through the Figma MCP server.
- Translate the design into the existing structure above. Ignore any React or Tailwind code that Figma suggests.
- Figma variables become CSS variables at the top of style.css. Reuse existing variables before adding new ones.
- Figma components become reusable CSS classes (and small JavaScript functions where they need behavior).
- Annotations in Figma describe behavior. Follow them.
- Design size is 1440 x 900. The layout must also work at 1366 x 768 (no sideways scrolling, nothing cut off). Pages scroll vertically: content never has to fit in one screen height, so do not ask about it.
- If the design and the existing code conflict, or something in the design is unclear, ask instead of guessing.

## Figma and code
- Figma (Screens page + variables) is the source of truth for
  how the site looks. The code is the source of truth for
  how it works.
- Never change colors, fonts, spacing or layout in the code
  without a matching change in Figma. If the user accepts a
  visual change made in code, update Figma in the same session.
- When asked to make big design changes in Figma, work on the
  Playground page as copies of the screens, never directly on
  the Screens page.
- Sync sessions: compare Figma with the code first, list all
  differences per screen, then plan before building.

## How to work
- Make one change at a time and keep existing features working.
- After each change, briefly explain what changed and in which file, in plain language.
- Do not refactor or restyle parts that were not part of the request.
- Test locally with the VS Code Live Server extension (opening index.html directly blocks the JSON from loading).
- Never push to GitHub or merge into main yourself. The team does this in GitHub Desktop.

## Structure of data/points.json
The file is one JSON array with one object per monitoring point (currently 6 points, illustrative data). Each object has:
- `id`, `name`: point code (e.g. "P08") and display name.
- `changeClass`: "loss", "gain" or "recovery" (the change mask the point was sampled from; independent of the scenario).
- `scenario`: number 1-4 (tipping-point scenario, see above).
- `lat`, `lon`: coordinates in decimal degrees.
- `leftPct`, `topPct`: marker position on the site map image, in percent.
- `years`: array of years (currently 14 survey years, 1984-2026).
- `ndvi`, `temperature` (°C), `salinity` (PSU), `precipitation` (mm/month), `evapo` (mm/day): arrays with one value per entry in `years`, in the same order.
- `breakpoint`: `{ "index": position in years, "label": "2010" }`, or `null` if no breakpoint was detected.
- `metricVals`: EWS values as strings: `stdDev`, `ar1`, `returnRate`, `kurtosis`, `skewness`.
- `metricTaus`: Kendall's tau per metric as signed strings (e.g. "+0.51"): `ndvi`, `stdDev`, `ar1`, `returnRate`, `kurtosis`, `skewness`.

## Structure of data/events.json
The file is one JSON array with one object per storm or extreme-weather event (Climatology screen). Each object has:
- `id`, `name`, `type`: event code (e.g. "opal-1995"), display name, and type (e.g. "Hurricane", "Tropical storm", "Cold front").
- `month`: "YYYY-MM", the month of the event (used for the date label, e.g. "Sep 1995", and the position on the timeline).
- `illustrative`: true when the values are placeholders and not real results (Hurricane Opal's values are digitized from design/hurricane-opal.png).
- `baseline`: text describing the baseline period of the anomalies (shown in the chart header).
- `sources`: per variable the data source: "era5-land" (ERA5-Land land cell), "era5-sea" (ERA5 sea cell) or "hycom" (HYCOM cell).
- `dates`: array of days ("YYYY-MM-DD") around the event.
- `airTemperature` (°C), `windSpeed` (m/s), `waveHeight` (m), `precipitation` (mm/day), `salinity` (PSU), `seaSurfaceTemperature` (°C): daily anomalies (difference from the 30-year mean for the same calendar day), one value per entry in `dates`, in the same order. A missing value is `null`; an event without data has empty arrays.
