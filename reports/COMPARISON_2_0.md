# Loppanalys Comparison 2.0

## Status

Ultravasan is the reference implementation for **Comparison 2.0**, the two-result comparison surface used by Loppanalys. Engine 1.0 remains the shared semantic foundation; Comparison 2.0 defines the comparison contract and interaction model, not a requirement that every event share one physical JavaScript runtime.

The direct comparison is deliberately distinct from Kartduell:

- **Direktjämförelse / Comparison 2.0:** exactly two published results, analytical depth first.
- **Kartduell:** one to five results, replay and visual race development first.

## Product goal

A comparison should answer three questions in one continuous interaction:

1. **Who was ahead, and when did the observed lead change?**
2. **Where did each participant gain or lose time?**
3. **How did those differences relate to the course, elevation and the strength of each edition's field?**

The UI therefore links observed checkpoint gaps, official placement, segment performance, course context, elevation and reconstructed replay. Selecting a checkpoint or segment should change the relevant visual context instead of presenting unrelated static panels.

## Evidence rules

Comparison 2.0 inherits the Engine 1.0 evidence rules and adds no synthetic result observations.

### Whole-course comparison

A finish ranking or finish gap is enabled only when the selected RaceEditions are explicitly whole-course comparable according to the history/course contract.

### Checkpoint comparison

Observed checkpoint gaps and official placement movement require:

- the same CourseVersion,
- a checkpoint present in both journeys,
- an exact, non-estimated published passage for both participants.

No missing passage is filled to create a checkpoint gap.

### Segment comparison

A segment is directly compared only when the course contract explicitly allows that segment between the two CourseVersions and both participants have exact segment evidence.

### Field normalization

`performance_vs_field_percent` is calculated independently for each participant's own RaceEdition:

`edition segment median pace / participant segment pace - 1`

Positive values mean faster than the participant's own edition median. The reference requires at least five FINISHED participants with exact, non-estimated positive segment pace observations. Below that threshold the value is unavailable.

This makes cross-year performance context possible without pretending that weather, field strength or other edition effects are identical.

## Interactive course comparison

A shared animated map is enabled only when the selected results have the same CourseVersion and a verified route can be resolved.

The two markers use:

- the participant's own exact timing anchors,
- the shared verified course geometry,
- linear time/distance reconstruction between timing anchors.

The markers are **not individual GPS tracks**. A DNF or otherwise incomplete result stops at its last source-supported anchor.

The shared clock, map and elevation profile are synchronized. The interaction model supports:

- play/pause,
- race-clock scrubbing,
- selecting an observed checkpoint from the gap chart,
- selecting a segment,
- seeking from the elevation profile,
- whole-course, both-runners and leader-follow camera modes,
- transfer to the separate Kartduell.

If shared geometry is not allowed, analytical dimensions whose contracts remain valid can still be shown, while the combined animated course view is blocked.

## Signed values

For participants A and B:

- checkpoint pair gap = `B elapsed - A elapsed`; positive means A was ahead.
- segment pair delta = `B segment - A segment`; positive means A won time on the segment.

UI copy should normally express these as human-readable leader/winner statements rather than expose sign conventions.

## Comparison 2.0 capabilities

Future event adapters should be able to determine these independently:

- `finish_comparison`
- `checkpoint_gap`
- `placement_journey`
- `segment_comparison`
- `edition_field_normalization`
- `shared_course_context`
- `animated_two_result_comparison`
- `shareable_comparison_state`

Unavailable capabilities must degrade independently. An edition with sparse timing may still support finish comparison; an edition with timing but no verified geometry may support checkpoint/segment analysis without an animated map.

## Interaction principles

The reference implementation follows these rules:

1. A tap/click is sufficient for every primary interaction; hover is supplementary.
2. Real source observations remain visually and methodologically distinguishable from reconstructed motion.
3. Selecting a segment persists until another segment is selected.
4. Chart, segment, course and elevation selections should refer to the same analytical position whenever the evidence permits.
5. The comparison has a shareable URL containing race family and the two result IDs.
6. Reduced-motion users retain the complete static analysis and manual scrubbing.
7. Small screens reflow the analysis rather than hiding analytical content.

## External product inspiration

The interaction pattern was informed by public product behavior in established race/activity tools, particularly:

- Strava Effort Comparison: linked comparison chart, course position and virtual-race playback.
- Strava Flyby: time scrubbing and multi-athlete replay.
- UTMB Live: reliving a race and following course/ranking development.
- RACEMAP: participant selection, replay, linked elevation/course context and shareable replay state.

These products were used as product-design references only. No external implementation code is copied into Loppanalys.

## Sister-system adoption

After the Ultravasan reference is release-tested, sister systems should converge on the same semantic and UX contract without discarding event-specific strengths.

- **Gotaleden:** retain its strong head-to-head analytics; add the shared-clock interactive course layer and align naming/capabilities.
- **ÖST:** retain its sparse-data fallback and capability-driven coverage; adopt the common interaction where route/timing evidence supports it.
- **Sätila:** retain its advanced interactive map/replay behavior; align analytical KPI, signed-gap, field context and methodology with Comparison 2.0.

A future fifth event should implement the Engine 1.0 event adapter and expose Comparison 2.0 capabilities rather than invent a new direct-comparison design.
