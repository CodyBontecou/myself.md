# Recorded locations in ChatGPT

Discover shared location exports with `list_cloud_exports`, then call `review_recorded_locations` with `exportIds`, inclusive `start`/`end` dates and `timezone`. Select 1–32 exports from one phone/profile covering 1–31 completed local days. Upload dates alone do not establish record coverage.

The card displays source-separated coordinate points, daily observation counts and a persistent compact overview. Select a day, then a point for timestamp, coordinates, provider accuracy and export provenance. Day details paginate 25 points at a time. All navigation uses the returned structured data without further billed reads. Missing days and absent/invalid accuracy are unknown.

Only location `points` are supported, with numeric latitude/longitude from native `coords` or direct fields. Out-of-range/nonfinite coordinates and invalid timestamps are excluded. Negative/nonfinite accuracy becomes unknown. Exact repeated native records are deduplicated with contributing export IDs retained. Days use actual timezone boundaries. The plot samples at most 1,000 points, including the selected point; daily counts and detail pages retain every accepted point. Axes use latitude/longitude degrees, with no distance-preserving projection, external tiles or geocoding.

These are observations, not confirmed routes, visits, travel distances or dwell times. A day containing points may still have large gaps. Sources remain separate. Partial exports and exclusions are visible under Sources & limits. Every page uses existing cloud ownership, current selections/authorization, billing and history. Reads are capped at 200 pages; failure does not return a partial review. A failed operation may have consumed successful reads. The tool cannot capture fresh locations or grant access.

Run `npm run verify:location-review` for calculation/MCP and responsive browser checks using fictional records. `npm run location-review:build` regenerates the embedded client. The dashboard build regenerates both health and location clients. This feature has not been deployed or verified in live ChatGPT.
