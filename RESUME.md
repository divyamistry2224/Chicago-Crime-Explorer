# Chicago Crime Explorer — Data Engineering, Interactive Analytics & ML Evaluation

Live demo: https://divyamistry2224.github.io/Chicago-Crime-Explorer/

## Data engineering
- Built a reproducible Python/SQL workflow with date and category normalization, geographic validation, duplicate handling, quarantine rules, checksums, and SQLite reporting views; audited a 10,000-record public-data sample.
- Reconciled monthly, temporal and daily aggregates covering 497,909 Chicago incident records and exposed a read-only SQL sandbox for inspecting metric definitions.

## Analytics / BI
- Developed linked community maps, Plotly time series, offense views, month/category/location filters and CSV exports, enabling reproducible exploration across 77 Chicago communities.
- Documented source lineage, missing-data behavior, denominator limitations and arrest-proportion uncertainty alongside interactive reports.

## Data science / ML
- Engineered lagged, shifted rolling and calendar features and evaluated weekly-naive, ridge and gradient-boosting models using four chronological quarterly folds.
- Measured retrospective 2025 MAE of 39.95 incidents/day for ridge versus 59.99 for the weekly baseline; published residual diagnostics, model assumptions and reporting-delay limitations.

## Analytics application / AI-adjacent interface
- Implemented a deterministic natural-language analytics interface that routes supported questions to reproducible calculations with visible filters, calculation traces and source citations.
- Added local CSV validation and transparent result export without sending user files to an external AI API.
