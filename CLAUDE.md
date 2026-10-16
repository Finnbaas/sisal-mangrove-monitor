# Sisal Mangrove Monitor

Web dashboard with finished results of a mangrove monitoring study in Sisal, Yucatán, Mexico (TU Delft students + UNAM): NDVI time series, climatology, early warning signals (EWS) and a tipping-point scenario for ~50 monitoring points. All numbers are calculated beforehand (Google Earth Engine + Python) and stored as JSON; the site only displays them. Users: researchers and policymakers on laptops (not phones). The team has little web experience: keep code simple, readable and well commented.

Details (file structure, JSON formats, Figma workflow, research terms) are in README.md, section "Reference: details moved from CLAUDE.md". Read them only when needed.

## Tech rules (always follow)
- Plain HTML, CSS and JavaScript only. No React, Vue, Tailwind, TypeScript, npm packages or build step.
- External libraries only via CDN script tags, and ask before adding any. No backend, database or API keys. Fully static site on Netlify (deploys from main).
- Every file starts with a short comment: what it does, what it reads, who uses it.
- Names: files lowercase-with-dashes; JS camelCase; constants UPPER_CASE; CSS classes/IDs lowercase-with-dashes (do not rename existing ones without reason).
- Shared code lives in one place: helpers in js/helpers.js, chart parts in js/charts.js. Never copy a helper into a screen file.
- Do not create new files or folders without explaining why first. Suggest how to split a very long file before doing it.
- Script order in index.html matters (helpers.js first, main.js last). CSS order: base, points, charts, climatology, stakeholders, method.

## Folder roles
- data/: pipeline output only (points.json, events.json, climate/, stakeholder-imagery/). Never edited by hand. Do not change the structure of points.json or events.json without asking (the Python pipeline makes them).
- content/: everything the team writes and edits (pages, variables, texts, stakeholders, method, climate). See content/README.md.
- analysis/: Python and notebooks (pipeline). analysis/climatology/reference/ holds the notebook code the website uses, for reading.
- css/, js/: one shared file plus one per screen. img/, design/ (design/ is not used by the site).

## Data rules
- Never hardcode results, names, numbers, counts, labels, units, sources or year range in HTML/JS. They come from data/ or content/. Cards and charts are generic.
- If a JSON file cannot be read, show a clear message naming the file, not a blank page.
- Never invent, round off or fill in data. Missing data shows as "No data". Variables that do not apply to a point (e.g. salinity on land) are shown as unavailable, not hidden.

## Chart rules
- Charts are hand-drawn SVG, no chart library. Climate charts use the same chart functions as the storm charts (js/charts.js).
- Numbers are calculated in Python (analysis/climatology/) and written as JSON to data/climate/. Never calculate numbers in JavaScript and never save finished chart images in data/.

## Research terms (use exactly)
EWS metrics: standard deviation, AR1, return rate, kurtosis, skewness. Trends: Kendall's tau. Breakpoints: a change of at least 0.25 NDVI within 12 months on the STL trend, after which the new level persists for at least 2 years (a drop followed by a quick recovery is resilience, not a breakpoint). We no longer use LandTrendr.
Scenarios (NDVI tau / SD tau): 1 Abrupt transition (potential EWS) <0/>0; 2 Slowly transitioning (no EWS) <0/<0; 3 Recovering >0/>0; 4 Stable >0/<0. Do not rename, merge or reinterpret them; suggest a change instead.

Labels are pending a team decision. Do not change them in either direction until this line is removed.

## Figma vs code
- Figma (Screens page + variables) is the source of truth for how the site looks; the code for how it works. Figma variables become CSS variables at the top of css/base.css; components become CSS classes.
- Never change colors, fonts, spacing or layout in code without a matching change in Figma (update Figma in the same session if the user accepts a code change). Big design changes go on the Playground page, never on Screens.
- Design size 1440x900; must also work at 1366x768 (no sideways scroll). Map screens: slider directly under the map. Ask when design and code conflict. Ignore React/Tailwind code from Figma.
- Sync sessions: compare Figma and code, list differences per screen, plan, then build.

## How we work
- One change at a time; keep existing features working; don't refactor or restyle what wasn't asked.
- Never push to GitHub or merge into main; the team does that in GitHub Desktop. Work on a branch.
- Test with VS Code Live Server (opening index.html directly blocks the JSON).

## Saving time and credits
- Never open or print the data files in analysis/ (CSV, NetCDF) or whole JSON files in data/. Inspect them with a short script that prints only the first rows or the column names.
- Don't read whole notebooks. Read only the cells named in the request, or the reference files in analysis/climatology/reference/.
- Don't take screenshots or open the browser to check results; I check in Live Server myself.
- Don't run the export scripts unless I ask; I run them myself.
- Keep answers short: list changed files, no long explanations.
