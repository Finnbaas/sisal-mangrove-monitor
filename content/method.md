# Method

How the findings on the Research tab were produced, and how to run the same analysis yourself in Google Earth Engine.

## 1. Site and pixel selection

Points are sampled from three change masks derived from the classified mangrove map of the Sisal AOI: a gain mask, a loss mask, and a loss-then-recovery mask, combining the Global Mangrove Watch product with ESA land cover data. Random point coordinates are fixed in a CSV so repeat runs use the same points.

## 2. Data extraction

Landsat imagery is filtered by a cloud cover threshold and the study time range. Maximum NDVI per interval is extracted for each coordinate. ERA5 climatology (temperature, precipitation, salinity, evapotranspiration) is extracted for the same coordinates.

## 3. Processing and analysis

Five metrics are computed on the NDVI series: standard deviation, AR1, return rate, kurtosis, and skewness. Kendall's tau is computed on the trend of each metric, and separately on the trend of NDVI itself. Breakpoint detection (LandTrendr) is cross-checked against visual inspection of the NDVI curve.

## 4. How we classify tipping-point status

Each point is classified by crossing the trend of NDVI itself against the trend of NDVI's standard deviation, both tested with Kendall's tau. LandTrendr's breakpoint detection and a visual check of the curve confirm or refine which scenario applies. This is independent of the gain/loss/recovery class, which instead reflects which change mask the point was originally sampled from.

{{scenario-table}}

## 5. Full workflow diagram

![Full analysis workflow diagram](img/workflow.png)

## 6. Do it yourself in Google Earth Engine

Run this same analysis on your own coordinate. The steps below match the pipeline above; the script covers steps 1–3.

1. **Open the Code Editor** Go to code.earthengine.google.com and start a new script under your Earth Engine project.
2. **Paste the starter script** Copy the script below and replace the point coordinates with the location you want to analyze.
3. **Run and export** Run the script, then open the Tasks tab and run the export to get your NDVI time series as a CSV.
4. **Compute the five metrics** Pull the CSV into Python or R and compute standard deviation, AR1, return rate, kurtosis, and skewness on rolling windows of the NDVI series.
5. **Run Kendall’s tau** Test the trend of each metric, and separately the trend of NDVI itself, with Kendall’s tau.
6. **Classify the point** Cross the NDVI trend τ against the standard deviation trend τ using the scenario table below.
7. **Confirm with breakpoint detection** Run LandTrendr and visually inspect the NDVI curve to confirm or refine the classification.

{{gee-starter-script}}

> This dashboard is a research prototype for internal testing. Data shown here is illustrative and does not represent final published results. The Landsat record is treated as starting around 1984–1985, not earlier, due to sensor limitations.
