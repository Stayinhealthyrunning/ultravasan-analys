# Ultravasan cleanup risk classification — 2026-10

Baseline: clean `origin/main` at `84555dc3f20107fdc381aa98983230818e6cc4a3`.

| candidate group | class | evidence | action |
|---|---|---|---|
| `docs/`, curated data bundles and race contracts | D | Pages runtime and release tests consume them | retain |
| `data/ultravasan.sqlite`, source restore paths and privacy registry | B/D | protected baseline/private-source boundary; local U9 hash mismatch is not permission to rewrite | retain; verify only in existing CI |
| `tools/` import, privacy and contract checks | B/D | fail-closed publication and data integrity gates | retain |
| `.github/workflows/test.yml`, `privacy-registry.yml`, `protect-minors.yml`, `guard-public-raw-sources.yml` | B/D | active release/privacy gates | retain |
| historical import/migration workflows (`importera-*`, `migrera-*`, `testa-historikimport.yml`) | D/E | historical editions and migration evidence; no proven deadness | retain pending owner review |
| `reports/U2_LEGACY_IDENTITY_MIGRATION.md` | E | historical GDPR/identity evidence; filename age is not archival authorization | retain |

No tracked class-A file or class-C consolidation is proven safe. The U9 local
audit remains blocked by protected baseline-file differences; approved hashes
and totals must not be changed to make local QA green. No deletion, source
copy, secret change, data rewrite or UI change was made.
