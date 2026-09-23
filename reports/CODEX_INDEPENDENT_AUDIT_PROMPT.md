# Codex – Independent Ultravasan Analys 2.0 acceptance audit

## Mission

Perform an **independent, adversarial release audit** of Ultravasan Analys 2.0.

Do **not** implement fixes in this task.
Do **not** refactor product code.
Do **not** weaken, delete or rewrite tests to make anything pass.
Do **not** change canonical data, SQLite, generated web data, CourseVersions, identity mappings or the Gotaleden repository.

Your job is to determine whether the release candidate actually satisfies the agreed product and quality target.

## Repositories and frozen revisions

Ultravasan release candidate:

- repository: `Stayinhealthyrunning/ultravasan-analys`
- frozen release commit: `7811973bcaebfb7834fe2014c7bfb9df52ebc843`
- audit branch: `audit/ultravasan-2-master-acceptance`

Frozen Gotaleden reference:

- repository: `Stayinhealthyrunning/gotaleden-splits`
- reference commit: `7ee0b1c4af306796754c2a1c1e9989e247ee383b`

Do not modify Gotaleden.

## Primary requirement inventory

Read:

`reports/ULTRAVASAN_2_MASTER_ACCEPTANCE_AUDIT.md`

Treat the rows and requirements as the audit inventory, but **do not trust its preliminary statuses**.
Re-derive PASS/PARTIAL/FAIL independently from code, data, tests and real browser behavior.

Also read the complete U0–U9 reports and Gotaleden's:

`reports/gotaleden-final-red-team-e4.md`

The historical requirement hierarchy is:

1. explicit Ultravasan 2.0 master requirements,
2. later explicit project decisions,
3. actual release-candidate behavior/code/data,
4. U0–U9 implementation reports,
5. Gotaleden as frozen technical/methodological reference, not as a requirement for identical UI.

A report saying a feature exists is not proof that it works.

## Audit method

For every acceptance-matrix row:

1. Locate the actual implementation.
2. Locate relevant tests.
3. Run the test(s).
4. When user-visible, verify actual browser behavior.
5. When mathematical/statistical, independently calculate at least one real-data example from SQLite/raw/public web data instead of merely calling the same production function.
6. When historical, verify the CourseVersion/comparability boundary explicitly.
7. When identity-related, verify the actual evidence/scope path and negative cases.
8. Record exact evidence: file, function, test, command and result.
9. Assign one status:
   - PASS
   - PARTIAL
   - FAIL
   - NOT APPLICABLE
10. Assign severity to non-PASS findings:
   - P0 release/data integrity blocker
   - P1 serious correctness/security blocker
   - P2 material product/method defect
   - P3 minor/non-blocking
   - P4 documentation/cosmetic only

Do not give PASS merely because a symbol/string/file exists.

## Mandatory adversarial checks

### 1. Data and immutable baseline

Independently verify:

- 22 RaceEditions,
- 24,422 result appearances,
- 139,910 split observations,
- protected hashes/integrity,
- modular export parity with canonical data,
- no U1–U9 UI work altered protected source/history data.

Check both UV90 and UV45.

### 2. Race / Course / Source contracts

Search the whole repository for remaining heuristics that infer:

- RaceFamily from race key, name or distance,
- CourseVersion from year or place,
- competition/entity type from name,
- pre/post-2023 course behavior outside explicit contract lookup.

Any remaining legacy logic must be classified as:
- harmless display compatibility,
- dead code,
- or a real contract violation.

Verify CourseVersion fingerprint/immutability and whole-course vs segment comparability.

### 3. Identity

Red-team canonical identity.

Create/read negative cases for:

- same name, different people,
- same bib across years,
- legacy athlete_id,
- ambiguous VasaNerd/provider evidence,
- conflicting external IDs/scopes.

Names or demographics alone must never create cross-year identity.

### 4. DNF / DNS / partial observations

Use real examples from canonical data.

Trace at least one FINISHED, one DNF, one DNS and one incomplete/partial-split appearance through:

source/canonical data → adapter → RunnerAnalysis/Replay → browser UI.

Verify:
- raw observations remain preserved,
- DNS is not treated as started,
- DNF gets no synthetic finish,
- late/raw observations do not create false progression,
- estimated/interpolated positions are labelled and never become exact placement evidence.

### 5. Independent mathematical spot checks

Do not reuse production helper functions for the reference calculation.

Using SQL/plain Python/standalone arithmetic, independently calculate real examples for:

- finish median,
- Q25/Q50/Q75 and, if required by the agreed feature, Q10/Q90,
- segment pace,
- pacing retention/loss,
- placement movement,
- target-time allocation,
- one Year Fingerprint metric,
- one Hall of Fame metric,
- one Course Intelligence Difficulty result/component.

Compare exact/rounded values with the production model/UI and document the cohort used.

Pay particular attention to stable complete FINISHED cohorts and filter scope.

### 6. Runner Analysis 2.0

Verify the agreed “Loppets utveckling” experience, not just that Journey exists.

Check actual UI for:
- field reference/gap,
- sex reference/gap,
- class reference/gap,
- overall placement,
- class placement,
- pacing profile,
- segment performance relative to own whole-race pace,
- click/seek to Replay,
- missing observation behavior.

Verify that a click intended only to seek Replay does not silently start playback/audio unless explicitly designed.

### 7. Head-to-head / Direktjämförelse

Verify actual UI/model contains the agreed comparison dimensions:

- actual checkpoint gaps,
- segment times/pacing,
- placement movement,
- elevation,
- map,
- CourseVersion-safe cross-year behavior.

Determine whether the 2–5 selection behavior is a safe intentional extension of the original “two runners” requirement or causes ambiguous output.

### 8. Course Intelligence

Audit every requested segment dimension:

- distance,
- ascent,
- descent,
- median pace,
- Q25–Q75,
- Q10–Q90 when sample size is sufficient,
- placement movement,
- pacing loss/retention,
- DNF signal.

Independently verify whether Q10/Q90 exists in model + UI + method help + tests.

Audit the synthetic four-component Difficulty index:
- climb load,
- pacing loss,
- pace dispersion,
- DNF exit rate,
- equal weighting,
- complete-evidence population,
- n threshold,
- percentile/ranking behavior.

Compare this with Gotaleden's deliberate “separate dimensions, no synthetic total score” rule.
Do not decide based on preference. Report methodological risks, information loss, double-counting/correlation risks and whether the Ultravasan copy clearly prevents absolute/causal interpretation.

### 9. Target pace / race plan

Independently calculate at least one target-time plan.

Verify:
- same CourseVersion only for empirical historical weights,
- minimum sample behavior,
- explicit distance fallback,
- weights normalize to target time,
- unknown segment distance/history remains unallocated,
- no guessed remainder.

### 10. History 2.0

Verify:
- person history,
- class evolution/history,
- Hall of Fame,
- Year Fingerprint,
- club/location analysis/history,
- Club DNA,
- historical map duel,
- medal references.

For every historical performance line or “improvement” metric, test a real CourseVersion boundary.

Specifically audit `renderClubHistory()` and `clubHistoryImprovement()`.
Do not assume the preliminary audit finding is correct; reproduce independently.

Participation may cross CourseVersion boundaries.
Performance must not unless explicitly comparable.

### 11. Finish progression / retention / spread

Compare directly with frozen Gotaleden behavior.

Verify whether Ultravasan actually implements primary finish progression as:

- 10 % i mål
- 25 % i mål
- 50 % i mål · median
- 75 % i mål
- 90 % i mål

and whether it is mathematically Q10/Q25/Q50/Q75/Q90 among FINISHED in the active group/filter.

Do not accept “startande/fullföljande over years” as equivalent unless the original requirement explicitly allows it.

Verify speed/pace retention baseline 100 and median + Q25–Q75 cohort behavior.

### 12. Method help coverage

Inventory every important visible analytical component.

For each one, verify an accessible method explanation covers, where materially relevant:

- what is shown,
- exact method/calculation,
- data source,
- cohort/filter,
- interpretation,
- limitations,
- official observation vs derived statistic vs interpolation/model.

Compare coverage depth with Gotaleden's central analysis-help model.

List components with missing or materially incomplete help.

### 13. XSS / DOM injection

Perform explicit mutation/red-team tests like Gotaleden E4.

Inject harmless markers such as:

`<img src=x onerror="window.__AUDIT_XSS=1">`

into synthetic copies of config/source/data strings that reach visible UI:
- runner name,
- club/location,
- class,
- checkpoint,
- race/event label,
- method/source label where applicable.

Never alter canonical committed data.

Verify whether DOM elements/event handlers can be created through `innerHTML` paths.
Search all relevant `innerHTML`, template-string and attribute interpolation paths.
Any executable injection is at least P1.

### 14. URL, deep links and browser history

Verify:
- direct URL load for UV90 and UV45,
- year,
- sex,
- class,
- club/location,
- status,
- share URL,
- reload preservation,
- invalid params fail safely,
- browser Back,
- browser Forward.

Do not treat `replaceState` alone as proof.
Determine whether lack of `popstate` handling causes real user-visible failure.

### 15. Browser / responsive / accessibility

Run real Chromium at minimum:
- 390×844,
- 900×900,
- 1536×1024.

Verify major workflows, not just document overflow:
- race switching,
- filters,
- runner opening,
- Replay,
- favorites,
- H2H,
- Course Intelligence,
- target plan,
- history,
- club/location,
- map duel.

Check keyboard flow, focus visibility, Escape/dialog behavior, reduced motion and no console/network errors.

### 16. Playwright versus custom Chromium

The agreed U9 plan said “full Playwright”.
Ultravasan currently has a custom CDP/Chromium smoke rather than a Playwright suite.

Compare actual coverage with Gotaleden's Playwright E2E.
Report one of:
- EQUIVALENT COVERAGE, with detailed proof,
- PARTIAL, with missing behaviors,
- FAIL REQUIREMENT, if Playwright itself or materially broader E2E was explicitly required.

Do not install/migrate to Playwright in this audit task.

### 17. Gotaleden side-by-side product audit

For the same user tasks, compare frozen Gotaleden and Ultravasan:

- race/source/course correctness,
- identity/history,
- profile/Journey,
- Replay,
- H2H,
- maps/elevation,
- course analysis,
- target pace,
- finish progression,
- method help,
- filters/state/deep links,
- accessibility/mobile,
- test/red-team evidence.

Ultravasan is allowed to differ where its multi-year data requires a different product.
Flag only:
- accidental regression,
- missing promised capability,
- weaker methodology/guardrail without documented reason,
- misleading UX.

## Commands / evidence

Run the repository's full existing CI-equivalent suite locally where feasible.
Do not stop after the first failure.

Record:
- exact commands,
- pass/fail counts,
- any skipped tests,
- browser version/runtime,
- generated temporary audit artifacts.

Temporary local scripts may be used for independent calculations, but do not commit them unless they are solely audit evidence and do not alter product behavior.

## Deliverable

Create exactly one committed audit result file:

`reports/CODEX_INDEPENDENT_AUDIT_RESULTS.md`

Do not commit any other changes.

The report must contain:

1. Executive verdict:
   - READY FOR MERGE
   - READY WITH NON-BLOCKING FINDINGS
   - NOT READY FOR MERGE

2. Exact audited SHAs.

3. Full test/browser command log summary.

4. Acceptance matrix with every ID from
   `ULTRAVASAN_2_MASTER_ACCEPTANCE_AUDIT.md` and your independently determined status.

5. Findings ordered P0 → P4.

For every finding include:
- requirement ID,
- severity,
- reproduction,
- actual behavior,
- expected behavior,
- exact source file/function/line,
- affected UV90/UV45/years,
- whether canonical data is affected,
- recommended minimal correction,
- required regression test.

6. Independent mathematical spot-check table with raw inputs, formula and production comparison.

7. Gotaleden side-by-side table.

8. Explicit answers to these known hypotheses, independently verified:
- Does club/location median history cross CourseVersion boundaries?
- Does “Mest förbättrad” club/location cross CourseVersion boundaries?
- Is Course Intelligence Q10–Q90 missing?
- Is the agreed 10/25/50/75/90 % finish progression missing or mislabeled?
- Does browser Back/Forward correctly restore application state?
- Is there an XSS-capable `innerHTML` path?
- Is custom Chromium coverage materially equivalent to the promised full Playwright E2E?
- Does the four-component Difficulty index remain methodologically defensible and clearly scoped?

9. Final blocker list.

10. Explicit freeze recommendation.

## Independence rule

The preliminary ChatGPT audit has already found possible issues. **Do not simply confirm them.**
Try to falsify each one.

If a preliminary FAIL is actually wrong, mark it PASS and provide the evidence.
If you find new defects not present in the matrix, add them.

The goal is not agreement with ChatGPT.
The goal is the most defensible statement possible about whether Ultravasan Analys 2.0 is actually finished.
