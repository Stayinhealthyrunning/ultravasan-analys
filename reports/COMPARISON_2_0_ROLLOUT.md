# Comparison 2.0 cross-repo rollout

## Purpose

This document coordinates adoption of `loppanalys-comparison-2.0` across the
four current Loppanalys event systems.

The canonical machine-readable contract is
`config/comparison-contract-v2.json`.

## Order

1. **Ultravasan** — freeze reference contract; no feature migration in this phase.
2. **Sätila** — first adoption target because it already has strong two-runner
   map/elevation interaction but lacks several standard analytical layers.
3. **ÖST** — second adoption target; use it to prove sparse timing and team/Duo
   behavior remain first-class.
4. **Gotaleden** — final adoption target; use it to prove person/team semantics
   and future RaceEdition readiness without weakening Engine 1.0.

Do not implement all three sister repos in parallel. Finish and validate one
before using lessons learned in the next.

## Per-repo workflow

For each target:

1. Read the canonical contract.
2. Read the repo-local `config/comparison-compatibility-v2.json`.
3. Read the repo-local `reports/COMPARISON_2_0_MIGRATION.md`.
4. Inventory the current implementation before editing.
5. Implement only capabilities supported by that repo's actual evidence.
6. Preserve listed event extensions and must-preserve constraints.
7. Extend unit/browser tests before declaring parity.
8. Run the repository's complete release/browser QA.
9. Review visually at desktop and mobile widths.
10. Merge only when source integrity and browser gates are green.

## Cross-repo invariants

All adopted implementations must agree on:

- Direct Comparison selects exactly two entities.
- Kartduell selects 2–5 entities.
- A/B sign semantics.
- observed versus reconstructed data language.
- no fabrication of checkpoint/segment observations.
- capability-driven omission/fallback.
- shared section order where capabilities exist.
- signed gap and field-reference chart semantics.
- 120 second replay default with 30/60/120/180 second choices.
- 30% neutral soundtrack volume when audio exists.
- in-page modal/dialog presentation.
- click/tap-first interaction and reduced-motion support.

They do **not** need identical DOM, CSS or JavaScript modules.

## Event-specific proof cases

### Sätila

- rich Trail43 edition;
- a distance-gated segment where pace must remain hidden;
- route-unavailable/incomplete case;
- 2–5 Kartduell still works.

### ÖST

- rich Ultra 60 edition;
- sparse one-intermediate-checkpoint edition;
- short course without intermediate splits;
- Duo/team comparison;
- route-unavailable case.

### Gotaleden

- Individual 75 comparison;
- Relay 75 team comparison;
- auxiliary/replay point cannot become analytical segment boundary;
- future-edition test proving RaceFamily alone does not imply comparability.

## Final parity review

After all three migrations, compare the four systems by capability rather than
raw screenshot equality. A capability that exists in two systems should use the
same meaning and interaction language. A capability that is unsupported by an
edition should be absent or replaced by the explicit fallback defined in the
contract.

The final cross-repo audit should update compatibility descriptors from
`migration_planned` to `compatible` only after browser/release evidence is
green.
