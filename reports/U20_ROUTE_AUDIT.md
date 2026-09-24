# Ultravasan route and GPX audit

Inventoried 22 imported editions; exact local source-year route files found: 4.
Curated external year-specific route evidence exists for 10 editions, of which 6 have strong/strong-secondary evidence.

CourseVersion is not treated as whole-course comparability. Reference tracks and year-labelled routes are evidence inputs, not automatic comparison contracts.

| RaceEdition | Local exact route | Display geometry | Evidence status | Local route source/year | External annual evidence | Whole-course decision |
|---|---:|---|---|---|---|---|
| ultravasan45-2014 | No | reference-only · source 2026 | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2014 | No | reference-only · source 2022 | reference-only-or-unknown | data/routes/Ultravasan 90 2022.gpx · 2022 | none | Not assigned |
| ultravasan45-2015 | No | reference-only · source 2026 | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2015 | No | reference-only · source 2022 | external-candidate | data/routes/Ultravasan 90 2022.gpx · 2022 | plotaroute.com (downloadable-year-labelled-route, candidate) | Not assigned |
| ultravasan45-2016 | No | reference-only · source 2026 | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2016 | No | reference-only · source 2022 | reference-only-or-unknown | data/routes/Ultravasan 90 2022.gpx · 2022 | none | Not assigned |
| ultravasan45-2017 | No | reference-only · source 2026 | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2017 | No | reference-only · source 2022 | external-year-specific | data/routes/Ultravasan 90 2022.gpx · 2022 | Vasaloppet/Mynewsdesk (official-route-change-notice, strong) | Not assigned |
| ultravasan45-2018 | No | reference-only · source 2026 | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2018 | No | reference-only · source 2022 | external-candidate | data/routes/Ultravasan 90 2022.gpx · 2022 | plotaroute.com (downloadable-year-labelled-route, candidate) | Not assigned |
| ultravasan45-2019 | No | reference-only · source 2026 | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2019 | No | reference-only · source 2022 | external-candidate | data/routes/Ultravasan 90 2022.gpx · 2022 | plotaroute.com (downloadable-year-labelled-route, candidate) | Not assigned |
| ultravasan45-2022 | No | reference-only · source 2026 | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2022 | Yes | exact-source-year · source 2022 | local-exact-source-year | data/routes/Ultravasan 90 2022.gpx · 2022 | plotaroute.com (organizer-kmz-derived-downloadable-route, strong-secondary) | Not assigned |
| ultravasan45-2023 | No | reference-only · source 2026 | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2023 | No | reference-only · source 2024 | external-candidate | data/routes/vasaloppet-ultravasan-2024-ultravasan-90.gpx · 2024 | plotaroute.com (downloadable-year-labelled-route, candidate) | Not assigned |
| ultravasan45-2024 | No | reference-only · source 2026 | external-year-specific | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | ITRA/Trace de Trail (itra-year-specific-course-track, strong) | Not assigned |
| ultravasan90-2024 | Yes | exact-source-year · source 2024 | local-exact-source-year | data/routes/vasaloppet-ultravasan-2024-ultravasan-90.gpx · 2024 | ITRA/Trace de Trail (itra-year-specific-course-track, strong); plotaroute.com (organizer-kmz-derived-downloadable-route, strong-secondary) | Not assigned |
| ultravasan45-2025 | No | reference-only · source 2026 | reference-only-or-unknown | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2025 | No | reference-only · source 2024 | external-year-specific | data/routes/vasaloppet-ultravasan-2024-ultravasan-90.gpx · 2024 | Vasahistorier (race-day-gps-track, strong-secondary) | Not assigned |
| ultravasan45-2026 | Yes | exact-source-year · source 2026 | local-exact-source-year | data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx · 2026 | none | Not assigned |
| ultravasan90-2026 | Yes | reference-only · source 2024 | local-exact-source-year | UV-90_20260610.kmz · unknown | Vasaloppet (official-organizer-kmz, strong) | Not assigned |

## Whole-course conclusion

The previously proposed ultravasan90-post2023 group is not verified. The 2024 route evidence explicitly records a rerouting around km 57-59, while the remaining annual evidence has not been pairwise established as performance-equivalent. U20 therefore recommends no multi-year whole-course group at this stage.

## Geometry review

The exact-source-year 2022, 2024 and 2026 UV90 geometries receive pairwise coarse symmetric nearest-sample comparisons (0.5 km spacing). These remain geometry diagnostics only: they can show material route differences or strong geometric similarity, but cannot by themselves establish equal whole-course performance difficulty.

~~~json
[
  {
    "left": "Ultravasan 90 2022 exact-year geometry",
    "right": "Ultravasan 90 2024 exact-year geometry",
    "result": {
      "sample_interval_km": 0.5,
      "sample_points_a": 159,
      "sample_points_b": 163,
      "symmetric_nearest_median_m": 0.2,
      "symmetric_nearest_p95_m": 973,
      "symmetric_nearest_max_m": 1743.1,
      "limitation": "coarse nearest-point geometry diagnostic; not a surveyed equivalence proof"
    },
    "decision": "diagnostic only; geometric similarity or difference is evidence input, not by itself a whole-course performance-equivalence contract"
  },
  {
    "left": "Ultravasan 90 2022 exact-year geometry",
    "right": "Ultravasan 90 2026 exact-year geometry",
    "result": {
      "sample_interval_km": 0.5,
      "sample_points_a": 159,
      "sample_points_b": 171,
      "symmetric_nearest_median_m": 101.4,
      "symmetric_nearest_p95_m": 1000.5,
      "symmetric_nearest_max_m": 1732.3,
      "limitation": "coarse nearest-point geometry diagnostic; not a surveyed equivalence proof"
    },
    "decision": "diagnostic only; geometric similarity or difference is evidence input, not by itself a whole-course performance-equivalence contract"
  },
  {
    "left": "Ultravasan 90 2024 exact-year geometry",
    "right": "Ultravasan 90 2026 exact-year geometry",
    "result": {
      "sample_interval_km": 0.5,
      "sample_points_a": 163,
      "sample_points_b": 171,
      "symmetric_nearest_median_m": 68.4,
      "symmetric_nearest_p95_m": 245.9,
      "symmetric_nearest_max_m": 762.8,
      "limitation": "coarse nearest-point geometry diagnostic; not a surveyed equivalence proof"
    },
    "decision": "diagnostic only; geometric similarity or difference is evidence input, not by itself a whole-course performance-equivalence contract"
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
- **ultravasan90-2026** — Vasaloppet: Vasaloppets official Ultravasan 90 page exposes this GPS file for the 2026 course and labels it updated 2026-06-10. (https://vasaloppet.se/wp-content/uploads/2026/06/UV-90_20260610.kmz)

## Limitations

- Repository reference geometry is not treated as exact annual route evidence unless its source year matches the RaceEdition.
- External references are curated evidence metadata; the audit does not silently download or promote third-party geometry into the repository.
- A year-specific route or race-day GPS trace proves evidence for that year, not equivalence to another year.
- The sampled nearest-track distance is a diagnostic and cannot establish course identity or equal performance difficulty on its own.
- A missing original source file is never substituted by hashing a derived repository artifact; source_sha256 remains null in that case.
- Display geometry, exact annual geometry evidence and whole-course performance comparability are separate contracts.
- CourseVersion/checkpoint equality is not sufficient evidence for whole-course comparison groups.
