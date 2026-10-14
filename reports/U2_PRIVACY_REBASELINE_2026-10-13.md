# U2 privacy rebaseline review — 2026-10-13

## Decision

The U2 golden master may be rebaselined to commit `a62b48d` because the
reviewed public result payload is unchanged from its parent. The rebaseline
records the already-reviewed GDPR-safe export; it does not relax a privacy
rule or accept a changed result set.

## Reviewed comparison

`docs/data/ultravasan.json` at `a62b48d^` was parsed and compared with the
checked-in file at `a62b48d`.

- Public results: 24,318 before and 24,318 after; all result objects equal.
- Public splits: 140,693 before and 140,693 after; all split objects equal.
- Races, checkpoints, and sources: equal.
- Added result identifiers: 0.
- Removed result identifiers: 0.
- Changed retained result objects: 0.
- Added, removed, or orphaned split objects: 0.
- Changed top-level key: `meta` only.
- Changed metadata field: `generated_at` only.

The private source database hash is unchanged. The validated source totals
remain 24,422 results and 141,429 splits. The public export therefore still
withholds 104 results and 736 splits. The U2 identity checks still report
9,571 verified source person keys, while the public bundle contains 9,534
distinct publishable person keys across 13,147 rows.

## Baseline files

`reports/U2_BASELINE.json` records LF-normalized identities for JSON and
JavaScript files so that checkout line endings do not create false failures.
The updated normalized identities are:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `docs/data/ultravasan.json` | 42,596,797 | `3c78fe554a9b4565d70b06a080fd76c97b9c2a43a74bffa99231f3dbf1ecbb02` |
| `docs/data/ultravasan-data.js` | 42,596,822 | `8730af6c39b229f43e901e1f31df9536b98ba3437fa491682c1f87ced5e081a8` |
| `docs/data/manifest.json` | 125 | `05bd4a9fb0f7959ecc14ebf8b8500633d6032dcf86f8bff6cea53f1da355fcb3` |

The source database remains 76,169,216 bytes with SHA-256
`8f2b89a2ec28c855ebe1b32056f230a3988ffbe7d1fd1673cb5f75dbed718269`.

## Required verification

The rebaseline is acceptable only while all of the following remain true:

1. `tools/u2_baseline.py --check` passes without changing expected counts.
2. `tests/test_u2_baseline.py` passes.
3. The repository's full CI and GDPR publication gate pass.
4. No protected registry entry or verified minor is present in the public
   result bundles.

This review does not approve keeping the raw SQLite source public. Its
separate migration to access-controlled storage remains required.
