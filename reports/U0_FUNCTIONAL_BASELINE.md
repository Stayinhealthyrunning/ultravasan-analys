# Ultravasan Analys 2.0 – U0 functional baseline

This baseline freezes the observable product and test surface before the U1
data-contract migration. It belongs to commit
`f9d889ccb3fbb35ffa55e6fe10d3a2ad7b0ab766` on `main`.

The machine-readable data baseline is `reports/U0_BASELINE.json`. Verify it
with:

```bash
python tools/u0_baseline.py --check
```

## Frozen data surface

- 22 RaceEditions: UV90 and UV45 for the years represented in the database.
- 24,422 result appearances and 139,910 split observations.
- 16,594 athlete rows and 20,805 source-scoped external identities.
- SQLite, browser JSON, browser JavaScript and route-source SHA-256 hashes.
- Per-edition result, split, status, source, checkpoint and CourseVersion data.
- Database integrity, foreign keys, orphan rows, duplicate keys and web-export parity.

Known source-state exceptions are frozen, not silently repaired in U0:

- two UV45 appearances have status `UNKNOWN`;
- 113 UV45 2025 appearances have the source status `STARTADE INTE`;
- seven splits belong to DNS appearances and remain raw observations;
- no DNF/DNS appearance has a finish time or a Mora finish checkpoint.

## Product surface to preserve through U1

| Surface | Current implementation | Regression coverage |
|---|---|---|
| Result search and race switching | `docs/assets/app.js` | `test_race_selection.js`, `test_dynamic_2026_frontend.js` |
| Runner profile | `docs/assets/app.js` | browser smoke script plus replay tests |
| Runner Replay | `docs/assets/runner-replay.js` | `test_runner_replay*.js` |
| Map duel and historical routes | `docs/assets/map.js` | `test_race_selection.js`, `test_runner_replay.js` |
| Result status / DNF / DNS | `docs/assets/result-status.js` | `test_result_status.js`, replay tests |
| Race Intelligence Lab | `docs/assets/nerdlab.js` | `test_analysis_improvements.js` |
| Hall of Fame and identity grouping | `docs/assets/nerdlab.js` | `test_hall_of_fame_identity.js` |
| Class evolution | `docs/assets/class-evolution.js` | `test_class_evolution.js` |
| Shared split index | `docs/assets/data-index.js` | `test_shared_splits_index.js` |
| Race-specific media | `docs/assets/race-media.js` | `test_runner_replay.js` |
| Speed units and class charts | several frontend modules | `test_speed_units_and_class_charts.js` |
| Import, catalogue and export | `tools/*.py` | Python test suite and golden master |

## U1 acceptance rule

U1 contract work may change configuration and internal routing, but it must not
change the frozen data files or the counts, statuses, checkpoints, source
provenance, identities or browser-export parity recorded in
`U0_BASELINE.json`. Any intentional data correction requires separate review
and an explicit baseline update.
