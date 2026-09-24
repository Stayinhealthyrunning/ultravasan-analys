# Ultravasan route and GPX audit

Inventoried 22 imported editions; exact source-year route files found: 4.

CourseVersion is not treated as whole-course comparability. Reference tracks are not proof of exact annual geometry.

| RaceEdition | Exact edition route | Route source/year | Distance (official/GPS km) | Geometry SHA-256 | Whole-course decision |
|---|---:|---|---:|---|---|
| ultravasan90-2026 | Yes | UV-90_20260610.kmz · unknown | 92.0 / 91.74 | deafae9e8ee4ef3ab42f061bfd3751d5a127788be44642607cb07d379aff11a0 | ultravasan90-post2023 |

## Geometry review

The 2024 GPS reference and 2026-derived route receive a coarse symmetric nearest-sample comparison (0.5 km spacing). Combined with the V3 2023+ route-era contract, this supports a provisional whole-course comparison group; it does not establish segment equivalence. Groups are not assigned to pre-2023 UV90 or UV45 editions where exact route evidence is absent.

```json
[
  {
    "left": "Ultravasan 90 2024 GPX reference",
    "right": "Ultravasan 90 2026 derived KMZ route",
    "result": {
      "sample_interval_km": 0.5,
      "sample_points_a": 163,
      "sample_points_b": 171,
      "symmetric_nearest_median_m": 68.4,
      "symmetric_nearest_p95_m": 245.9,
      "symmetric_nearest_max_m": 762.8,
      "limitation": "coarse nearest-point geometry diagnostic; not a surveyed equivalence proof"
    }
  }
]
```

## Limitations

- The repository has no edition-specific GPS tracks for every RaceEdition; reference geometry is not treated as exact route evidence.
- The sampled nearest-track distance is a diagnostic and cannot establish course identity on its own.
- No whole-course comparison group is assigned without edition-specific evidence; checkpoint contracts remain separate from route identity.
