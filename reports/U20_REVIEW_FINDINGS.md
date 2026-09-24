# U20 review findings after commit a2c9c959

These are blocking follow-up findings from independent review of commit
`a2c9c959fc99852402047e164023e6ce46fa1849`.

Do **not** merge or deploy until this addendum is closed.

## A. Identity candidate age-class logic is wrong

`tools/u20_identity_review.py` currently parses the numeric suffix of W21/W35/W40
as if it were an exact age and uses arithmetic deltas as identity-conflict evidence.

That is methodologically invalid. The class number is a category threshold/label, not
the runner's exact age. In particular, a sequence such as W21 -> W35 -> W40 can be
perfectly legitimate and must not become a hard conflict merely because 21/35/40
do not progress like exact ages.

Required fix:
- never infer exact age from an age-class label,
- use exact birth_year or explicit age when present,
- age-class progression may be used only as interval/category compatibility evidence
  when the class semantics for that edition are known,
- unknown class semantics => neutral evidence, never hard conflict,
- same-edition same-name duplicate and conflicting verified person keys remain hard conflicts,
- known sex conflict remains a hard conflict,
- update the Therese regression so 2019/2022/2025/2026 is a review candidate without a
  fabricated age-class hard conflict,
- still no automatic merge from name/demographics.

Official 2026 Vasaloppet material confirms masters classes are five-year age categories,
not exact ages:
https://vasaloppet.se/lopning/trailsm2026/
https://vasaloppet.se/en/news/ultravasan-90-awarded-swedish-championship-status-for-2026/

## B. Route audit must include external public route evidence

The current route audit is primarily a repository inventory and therefore undercounts
edition-specific tracks. The U20 requirement was to actively seek verifiable annual
external route/GPX evidence as well.

At minimum these public ITRA/Trace de Trail edition-specific tracks have now been found:

- UV90 2018, 90.5 km, ITRA, GPX downloadable:
  https://tracedetrail.fr/en/trace/51602
- UV45 2018, 44.2 km, ITRA, GPX downloadable:
  https://tracedetrail.fr/en/trace/51603
- UV45 2019, 44.3 km, ITRA, GPX downloadable:
  https://tracedetrail.fr/en/trace/75784
- UV90 2023, 92.3 km, ITRA, GPX downloadable:
  https://tracedetrail.fr/en/trace/229687
- UV90 2024, 92.15 km, ITRA:
  https://tracedetrail.fr/en/trace/267129

Vasaloppet's own history confirms the material 2023 course change: runners first followed
Västerdalälven and then climbed the first Vasaloppet hill; UV90 became 92 km:
https://vasaloppet.se/om-oss/historia/vasaloppets-sommarvecka/

Required follow-up:
- perform an actual web/source search for every imported UV90/UV45 edition,
- download/store an edition-specific GPX only when source/provenance is clear and terms allow it,
- otherwise record the external evidence URL without fabricating local geometry,
- distinguish exact edition track, edition-specific authoritative/reference track,
  and reused display-reference track,
- regenerate U20_ROUTE_AUDIT.{json,md} with repo + external evidence,
- do not claim only four exact-year sources before this external audit is complete.

## C. Whole-course group must remain conservative

The commit assigns `ultravasan90-post2023` to 2023, 2024, 2025 and 2026.

Re-evaluate this after the expanded route/source audit. Vasaloppet confirms the structural
2023 change and describes 2026 as the classic 92 km route, but checkpoint changes and a coarse
2024-vs-2026 nearest-point diagnostic are not by themselves proof of segment identity.

Whole-course grouping may be retained only with explicit documented evidence sufficient for
finish/whole-course comparison. Segment comparability remains separate.

## D. Local cleanup is authorized, narrowly

The checkout was reported clean before the U20 run and the existing stash is untouched.
Therefore generated local artifacts created by this U20 run may be discarded, but only
narrowly:

1. Save the current `git status --porcelain=v1` in the final report before cleanup.
2. Do **not** run `git reset --hard`, blanket `git clean -fd`, or touch the pre-existing stash.
3. Restore tracked generated/protected files that are not part of commit a2c9c959 from HEAD,
   including the locally modified canonical/data outputs reported by the run
   (`data/ultravasan.sqlite`, `docs/data/ultravasan-data.js`,
   `docs/data/manifest.json`) if their changes were created by the U20 commands.
4. Delete only untracked U3/generated identity-report artifacts proven to have been created
   by this run. Regenerable reports may be recreated after the fixes.
5. Re-run `git status`; the working tree must be clean before baseline tests.
6. Re-run U2/U9 baseline/hash checks. Canonical result/split totals must remain unchanged.

## E. Final exit
After A-D:
- all JS/Python tests green,
- U2/U9 baseline/hash checks green,
- Playwright/CDP/visual QA green,
- no console/HTTP errors except deliberately injected failures handled by fallback,
- working tree clean,
- no merge/deploy,
- final response: `U20 QA READY FOR HUMAN REVIEW: YES/NO`.
