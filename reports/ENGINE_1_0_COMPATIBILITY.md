# Ultravasan → Loppanalys Engine 1.0 compatibility

Ultravasan is not being rewritten to the Gotaleden runtime. Its role in Engine 1.0 is to provide the proven contracts for modular loading, route evidence, identity/history and the later analysis modules.

## Already semantically compatible

- Event → RaceFamily → RaceEdition → CourseVersion is explicit.
- Course geometry and checkpoint contracts are versioned and fingerprinted.
- Cross-year person history is evidence-gated.
- Comparison logic does not treat family membership as proof of identical geometry.
- Source splits remain distinct from display/auxiliary points.
- Progressive loading preserves parity with the complete dataset.

## Adapter boundary

Ultravasan's current production export predates Gotaleden's explicit `participant`, `competition` and per-edition `capabilities` objects. Engine 1.0 therefore treats these as an adapter concern, not as a reason to mutate the frozen production data.

For Ultravasan today:

- participant entity is `person`,
- competition format is `individual`,
- team structure is `none`,
- feature availability is derived from the explicit family/course/data contracts and actual source coverage.

A future shared adapter may materialize these fields, but ÖST integration does not depend on such a migration.

## Reusable modules

The following modules contain reusable semantics, even when their current namespace/API remains Ultravasan-specific:

- `data-loader.js`: progressive hydration and edition/family routing,
- `data-index.js`: indexed result/split access,
- `history-engine.js`: evidence-gated identity and comparability,
- `runner-analysis.js`: individual multi-edition analysis,
- `course-intelligence.js`: course/pacing analysis,
- `history-intelligence.js`: multi-year aggregate analysis,
- `map-engine.js` + `playback.js`: route/replay primitives.

The contract is intentionally semantic: ÖST may reuse algorithms through an adapter without copying product-specific DOM, labels or storage keys.

## UX sync rule

Recent Ultravasan UX changes are not automatically copied to Gotaleden. They should be synchronized only where the same concept exists. In particular, an insight must describe the selected runner/team's performance; a fixed geographic course fact is course information, not a personal insight.
