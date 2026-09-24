# Ultravasan route and GPX audit

Inventoried 22 imported editions; exact local source-year route files found: 4.
Curated external year-specific route evidence exists for 9 editions, of which 5 have strong/strong-secondary evidence.

CourseVersion is not treated as whole-course comparability. Reference tracks and year-labelled routes are evidence inputs, not automatic comparison contracts.

| RaceEdition | Local exact route | Evidence status | Local route source/year | External annual evidence | Whole-course decision |
|---|---:|---|---|---|---|
| ultravasan45-2014 | No | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2014 | No | reference-only-or-unknown | data/routes/Ultravasan 90 2022.gpx · 2022 | none | Not assigned |
| ultravasan45-2015 | No | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2015 | No | external-candidate | data/routes/Ultravasan 90 2022.gpx · 2022 | plotaroute.com (downloadable-year-labelled-route, candidate) | Not assigned |
| ultravasan45-2016 | No | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2016 | No | reference-only-or-unknown | data/routes/Ultravasan 90 2022.gpx · 2022 | none | Not assigned |
| ultravasan45-2017 | No | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2017 | No | external-year-specific | data/routes/Ultravasan 90 2022.gpx · 2022 | Vasaloppet/Mynewsdesk (official-route-change-notice, strong) | Not assigned |
| ultravasan45-2018 | No | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2018 | No | external-candidate | data/routes/Ultravasan 90 2022.gpx · 2022 | plotaroute.com (downloadable-year-labelled-route, candidate) | Not assigned |
| ultravasan45-2019 | No | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2019 | No | external-candidate | data/routes/Ultravasan 90 2022.gpx · 2022 | plotaroute.com (downloadable-year-labelled-route, candidate) | Not assigned |
| ultravasan45-2022 | No | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2022 | Yes | local-exact-source-year | data/routes/Ultravasan 90 2022.gpx · 2022 | plotaroute.com (organizer-kmz-derived-downloadable-route, strong-secondary) | Not assigned |
| ultravasan45-2023 | No | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2023 | No | external-candidate | data/routes/vasaloppet-ultravasan-2024-ultravasan-90.gpx · 2024 | plotaroute.com (downloadable-year-labelled-route, candidate) | Not assigned |
| ultravasan45-2024 | No | external-year-specific | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | ITRA/Trace de Trail (itra-year-specific-course-track, strong) | Not assigned |
| ultravasan90-2024 | Yes | local-exact-source-year | data/routes/vasaloppet-ultravasan-2024-ultravasan-90.gpx · 2024 | ITRA/Trace de Trail (itra-year-specific-course-track, strong); plotaroute.com (organizer-kmz-derived-downloadable-route, strong-secondary) | Not assigned |
| ultravasan45-2025 | No | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2025 | No | external-year-specific | data/routes/vasaloppet-ultravasan-2024-ultravasan-90.gpx · 2024 | Vasahistorier (race-day-gps-track, strong-secondary) | Not assigned |
| ultravasan45-2026 | Yes | local-exact-source-year | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2026 | Yes | local-exact-source-year | UV-90_20260610.kmz · unknown | none | Not assigned |

## Whole-course conclusion

The previously proposed ultravasan90-post2023 group is not verified. The 2024 route evidence explicitly records a rerouting around km 57-59, while the remaining annual evidence has not been pairwise established as performance-equivalent. U20 therefore recommends no multi-year whole-course group at this stage.

## Geometry review

The local 2024 GPS reference and 2026-derived route receive a coarse symmetric nearest-sample comparison (0.5 km spacing). This remains useful as a geometry diagnostic, but it cannot override the documented 2024 rerouting or establish equal whole-course difficulty.

~~~json
[
  {
    "left": "Ultravasan 90 2024 local GPS reference",
    "right": "Ultravasan 90 2026 derived KMZ route",
    "result": {
      "sample_interval_km": 0.5,
      "sample_points_a": 163,
      "sample_points_b": 171,
      "symmetric_nearest_median_m": 68.4,
      "symmetric_nearest_p95_m": 245.9,
      "symmetric_nearest_max_m": 762.8,
      "limitation": "coarse nearest-point geometry diagnostic; not a surveyed equivalence proof"
    },
    "decision": "diagnostic only; the documented 2024 rerouting prevents this similarity metric from establishing multi-year whole-course equivalence"
  }
]
~~~

## External evidence

- **ultravasan90-2015** — plotaroute.com: Year-labelled downloadable route exists, but the page does not establish organizer provenance. (https://www.plotaroute.com/route/2311120)
- **ultravasan90-2017** — Vasaloppet/Mynewsdesk: Organizer states that the 2017 course routing changed, although total distance and elevation difference were unchanged. (https://www.mynewsdesk.com/se/vasaloppet/pressreleases/infoer-ultravasan-vasastafetten-och-vasakvartetten-2017-2109278)
- **ultravasan90-2018** — plotaroute.com: Year-labelled downloadable route exists, but organizer provenance is not established. (https://www.plotaroute.com/route/2311944)
- **ultravasan90-2019** — plotaroute.com: Year-labelled downloadable route exists, but organizer provenance is not established. (https://www.plotaroute.com/route/2311126)
- **ultravasan90-2022** — plotaroute.com: Route description states it is based on a KMZ supplied by the organizer on 2022-06-16; GPX/KML downloads are offered. (https://www.plotaroute.com/route/1942022)
- **ultravasan90-2023** — plotaroute.com: A 2023-labelled downloadable route exists; the page itself does not establish organizer provenance. (https://www.plotaroute.com/route/2311089)
- **ultravasan45-2024** — ITRA/Trace de Trail: ITRA track created 2024-08-13 for Ultravasan 45; 44.1 km geometry and GPX download are exposed. (https://tracedetrail.fr/en/trace/267130)
- **ultravasan90-2024** — ITRA/Trace de Trail: ITRA track created 2024-08-13 for the 2024 race; 92.15 km course metadata is exposed. (https://tracedetrail.fr/en/trace/267129)
- **ultravasan90-2024** — plotaroute.com: Route description states it came from organizer KMZ dated 2024-08-16 and was updated after the race; it explicitly records a rerouting around km 57-59 due to road construction. (https://www.plotaroute.com/route/2710347)
- **ultravasan90-2025** — Vasahistorier: Published course analysis states its profile is based on a GPX track recorded during Ultravasan 90 on race day 2025-08-16. (https://vasahistorier.se/ask/banan/ultravasan)

## Limitations

- Repository reference geometry is not treated as exact annual route evidence unless its source year matches the RaceEdition.
- External references are curated evidence metadata; the audit does not silently download or promote third-party geometry into the repository.
- A year-specific route or race-day GPS trace proves evidence for that year, not equivalence to another year.
- The sampled nearest-track distance is a diagnostic and cannot establish course identity or equal performance difficulty on its own.
- CourseVersion/checkpoint equality is not sufficient evidence for whole-course comparison groups.
