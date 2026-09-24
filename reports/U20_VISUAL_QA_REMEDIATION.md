# U20 Visual QA + route/identity remediation

Branch: `fix/u20-visual-qa`

Public `main` is intentionally restored to stable U5. **Do not merge or deploy this branch.**

## 1. Course Intelligence – visual redesign
Fix the full section, not isolated pixels:
- remove duplicate info icon,
- consistent grid, spacing, card heights and typography,
- align summary cards, Banöversikt, Höjdprofil, Fartfördelning,
- remove large unexplained whitespace,
- fix misaligned pace-distribution bars/labels,
- polish selected-segment panel, segment table and Måltempo/Loppplan,
- keep exact table order: Segment, Distans, Stigning, Nedför, Medianfart, Q25–Q75, Q10–Q90, Pacing loss, Plats ±, DNF,
- never reintroduce synthetic Svårighetsindex,
- reproduce and fix the observed CanvasGradient/addColorStop error; find exact source before changing code,
- add tolerant Playwright geometry/no-console-error regression.

## 2. Class history / Class Evolution
Current breaks around 2022→2023 and 2025→2026 are visually confusing.

Important:
- CourseVersion != automatically whole-race incomparability.
- performance lines may only connect verified whole-course comparable editions,
- participation may span CourseVersion changes,
- if a real performance-comparability break exists, label it clearly (e.g. “Ny jämförbarhetsserie”),
- do not show generic “BANVERSION” when only checkpoint semantics changed,
- make 2020–2021 absence understandable rather than implying uninterrupted annual editions.

## 3. Historical route/GPX audit
Systematically inventory every imported UV90 and UV45 RaceEdition.

For each edition:
- exact route/GPX found yes/no,
- source/provider/year,
- distance,
- provenance/limitations,
- geometry fingerprint,
- whole-course comparison-group decision.

Rules:
- prefer official organiser source, otherwise identifiable trustworthy edition-specific source,
- never infer an edition route from race name/distance,
- exact unknown stays unknown,
- a reference route must be labelled as reference,
- do not modify canonical result/split data.

Output machine-readable + human-readable audit reports.

## 4. Whole-course comparability model
Use V3 evidence to set explicit `whole_course_comparison_group` where justified.

Keep separate:
- CourseVersion = checkpoint/segment contract,
- whole-course comparison = whether finish/whole-race performance can be compared,
- segment comparison = specific segment comparability.

Do not let a new CourseVersion alone create a false performance break.

## 5. Årets fingeravtryck
The route audit did not verify any multi-year whole-course comparison group for UV90. In particular, 2024 has documented year-specific rerouting, so CourseVersion/checkpoint similarity must not manufacture a historical performance reference.

Implemented outcome:
- use all and only explicitly verified whole-course-comparable editions,
- structural metrics may span CourseVersions,
- show actual reference years/count and explain exclusions,
- 2026 therefore has 0 whole-course performance reference years until equivalence is positively verified; the UI explains that this is an evidence limitation, not merely a checkpoint-version break.

## 6. Club/location history
Observed:
- unexplained 2022→2023 median-line break/jump,
- text/legend/axes/year labels too small,
- plot too small relative to card,
- poor distinction between bars, median lines and secondary axis.

Fix:
- same comparability semantics as Class History,
- clearly marked true comparison breaks,
- materially larger readable typography,
- larger usable plot area,
- better series/axis contrast,
- responsive/mobile verification.

## 7. Hall of Fame map
Current Leaflet background uses direct OSM tiles and visibly receives 403 Access blocked tiles.

Requirements:
- users must never see broken/403 tile images,
- do not depend on direct OSM tile servers as the only usable background,
- catch tile failure,
- preserve actual GPS route, checkpoints, segment colours and runner segment data,
- on background failure switch cleanly to a polished neutral/vector route view,
- Playwright must deliberately block/fail tiles and verify no broken tiles/error UI,
- if an edition uses a later reference route, label it explicitly; exact annual route preferred via V3.

## 8. Multi-year runner identity
Example found:
Therese Fredriksson appears in 2019, 2022, 2025 and 2026; UI verifies 2019/2022/2025 together but leaves 2026 separate although evidence strongly suggests the same person.

Do NOT revert to “same name = same person”.

Build conservative candidate reconciliation:
- verified provider person ID => automatic verified identity,
- otherwise create candidates using transparent evidence:
  - normalized exact name,
  - sex consistency,
  - age/birth-year compatibility,
  - age-class progression through time,
  - club/city/nationality as supporting evidence,
  - same-name duplicate in same edition = hard conflict,
  - incompatible age progression = strong/hard negative evidence.
- candidates are never auto-merged from name/demographics alone,
- support explicit manual review/approval to a stable event-scoped `person_key`,
- reuse existing `athlete_match_candidates` + `identity_evidence` infrastructure,
- publish only verified identities in public multi-year history,
- regression test Therese 2019/2022/2025/2026 after explicit approval plus same-name collision tests.

## 9. General visual QA
Review 1536×1024, 1366×768, 900×900, 390×844.

Inspect:
- abnormal whitespace,
- duplicate controls/icons,
- clipped text,
- tiny typography,
- alignment,
- overflow,
- scroll containers,
- broken maps,
- empty states,
- section-to-section spacing,
- readable charts.

No screenshot-perfect tests; use robust geometry/accessibility/browser assertions.

## 10. Safety
Do not change:
- canonical result/split data,
- existing verified identity evidence except explicit reviewed additions,
- unrelated U6–U9 remediation,
- Cloudflare production configuration.

No merge to main.
No deployment.
No force-push.

## Exit criteria
- all JS/Python tests green,
- existing Chromium smoke green,
- Playwright green,
- no console/page errors,
- data totals unchanged,
- route/comparability reports produced,
- identity candidates/review path covered by tests,
- manual visual QA screenshots locally reviewed,
- final report ends with `U20 QA READY FOR HUMAN REVIEW: YES/NO`.
