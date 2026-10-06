# Loppanalys Comparison 2.0

## Purpose

Comparison 2.0 is the reference interaction and evidence contract for comparing exactly two race results in Loppanalys.

It complements Engine 1.0. Engine 1.0 defines semantic race/course/result capabilities; Comparison 2.0 defines how two results are compared and visualised without weakening source provenance.

## Core rules

1. Direct comparison is always exactly two results. Multi-runner playback remains Kartduell (2–5).
2. Official finish times, checkpoint times and checkpoint placements are observations.
3. Missing observations are never filled for tables, rankings, gap charts or lead-change counts.
4. Interpolated route position between timing anchors is illustrative only and must be labelled as such.
5. Whole-course, checkpoint, segment and geometry comparison are separate capabilities.
6. A shared map/elevation overlay requires the same verified CourseVersion/route geometry.
7. Cross-year finish comparison requires explicit whole-course comparability.
8. Segment comparison may remain available even when whole-course comparison is blocked, but only through explicit segment comparability.
9. DNF playback stops at the last trustworthy timing anchor; it must not create a synthetic finish.

## Reference interaction

A complete Comparison 2.0 view should expose, when supported:

- A/B identity and edition context.
- Verified finish gap.
- Counts of official checkpoints led by A/B/equal.
- Observed lead changes.
- Nearest and largest observed gap.
- Segment where each runner gained the most observed time.
- Signed time-gap journey over official checkpoints.
- Official placement journey.
- Clickable segment duel.
- Normalized performance comparison against each edition's own field when comparing different years.
- Interactive route and elevation playback with a shared race clock.
- Deep link/share state for the two results and, where supported, selected time/segment.
- Expandable methodology and evidence limitations.

## Capability vocabulary

Recommended semantic capabilities:

- `finish_comparison`
- `checkpoint_gap`
- `placement_journey`
- `segment_comparison`
- `field_normalization`
- `shared_course_map`
- `animated_comparison`
- `cross_year_comparison`
- `sparse_comparison_fallback`

The UI must degrade by capability rather than fabricate data.

## Interaction principles

Comparison 2.0 should feel exploratory:

- clicking a checkpoint/gap point seeks the shared race clock;
- clicking a segment seeks/highlights the segment;
- map and elevation markers update together;
- the elevation profile can be scrubbed to seek;
- the user can continue to full Kartduell when desired.

The interaction model is inspired by established activity-comparison patterns such as Strava Flyby and Garmin Connect's dot-racer comparison, while applying stricter race-result provenance: Loppanalys does not treat interpolated route position as measured individual GPS.

## Ultravasan reference implementation

Ultravasan is the initial Comparison 2.0 reference because it exercises the hard cases:

- multiple editions;
- explicit CourseVersion changes;
- whole-course comparison groups;
- segment comparability;
- route evidence separated from timing evidence;
- variable checkpoint coverage.

Once stable, the semantics and UX should be ported to Gotaleden, ÖST and Sätila according to their capabilities rather than by copying repository-specific implementation details.
