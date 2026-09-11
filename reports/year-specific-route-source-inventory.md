# Year-specific Ultravasan route source inventory

Audit date: **2026-09-11**

## Purpose

This inventory prepares a move from the current era-based route model to race-year-specific geometry and elevation. It does **not** change production routing yet. A route is only allowed to become `exact_for_race_year` when the underlying geometry can be tied to the actual edition by an official organiser file, an official/ITRA route publication, an organiser-derived file, or a race-day participant recording that has been validated against known checkpoints and course-change evidence.

Geometry and elevation provenance are tracked separately. A participant recording may be a strong barometric elevation source without replacing an organiser route as geometry authority.

## Current repository baseline

The current route builder uses three primary GPX sources:

- UV90 pre-2023: `data/routes/Ultravasan 90 2022.gpx` for all 2014–2022 editions.
- UV90 post-2023: `data/routes/vasaloppet-ultravasan-2024-ultravasan-90.gpx` for all 2023+ editions.
- UV45: `data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx` for all years.

This is suitable as an era-level fallback but is not sufficiently exact for historical course analysis. Known organiser statements prove that several course changes occurred inside those broad eras.

## Provenance priority

1. Vasaloppet organiser GPX/KMZ for the exact edition.
2. Trace de Trail / ITRA route explicitly tied to the exact edition.
3. A route explicitly derived from the organiser's edition-specific KMZ.
4. A race-day GPX from a participant, preferably with dense points and barometric elevation.
5. A documented same-course reuse from an adjacent edition when the organiser explicitly states that no course changes occurred.
6. Era-level representative route only as a clearly labelled fallback.

No historical route should be called official unless the source supports that claim.

## Ultravasan 90

| Year | Exact-source status | Best source/candidate identified | Course evidence / action |
| --- | --- | --- | --- |
| 2014 | Acquisition needed | Participant traces / ITRA edition records | Premiere edition. Find race-day GPX before declaring exact geometry. |
| 2015 | Strong participant candidate | Plotaroute route `2311120` (`Ultravasan90-2015-JB`), plus Jonas Buud race recording referenced by contemporary runners | Acquire and validate endpoints/checkpoints. |
| 2016 | Acquisition needed | Participant GPX referenced in contemporary comparison material | Acquire race-day trace and validate. |
| 2017 | Acquisition needed | Participant race traces exist | Organiser documents a new ~3 km section between Krångåsen and Eldris. Must not reuse 2014–2016 blindly. |
| 2018 | Strong route source | Trace de Trail / ITRA `51602`, 90.5 km | Organiser explicitly states no course changes in 2018, so geometry should correspond to 2017 course family. Acquire GPX and validate. |
| 2019 | Strong participant/edition candidates | Plotaroute `2311126`; participant race recordings; ITRA edition | Organiser documents a new ~3 km forest/marsh section just before Mångsbodarna. Must be a distinct course version from 2018. |
| 2020 | No normal race | Hemmavasan | Do not create a normal Sälen–Mora RaceEdition route. |
| 2021 | Acquisition needed | Elite-only Ultravasan 90 race-day participant source required | Vasaloppet confirms a real elite-only edition. It should be represented separately if/when results are imported. |
| 2022 | **Already present, strong** | `data/routes/Ultravasan 90 2022.gpx`, Plotaroute `1942022` | Source page says it is based on organiser KMZ supplied 2022-06-16. Keep as exact-year candidate, not generic 2014–2022 truth. |
| 2023 | Strong candidate | Plotaroute `2311089` / `2356968`, ITRA edition | Major organiser-confirmed start reroute; course becomes ~92 km and climbs the classic first hill/highest point. Must be its own version. |
| 2024 | **Already present, strong** | `data/routes/vasaloppet-ultravasan-2024-ultravasan-90.gpx`; Trace de Trail / ITRA `267129`; Plotaroute `2710347` | Organiser documents two changes vs 2023: ~1 km continuation after highest point and temporary Björnarvet detour instead of Axi kvarn. Plotaroute says organiser KMZ and race-day trace correction. |
| 2025 | Documented same-course candidate | 2024 exact route + 2025 race-day participant GPX candidate | Organiser explicitly states no course changes for 2025. Reuse of 2024 geometry is defensible, but a race-day GPX should still be acquired as verification/elevation source. |
| 2026 | **Official geometry already present; barometric elevation supplied** | `source/UV-90_20260610.kmz` + user-supplied Suunto race-day GPX | Organiser GPS file updated 2026-06-10. Organiser also confirms return to Axi kvarn/Björnarvet regular trail after temporary roadworks detour. User GPX: 32,175 points, complete elevation, dense race-day recording. Use official KMZ for geometry and the participant file as barometric elevation reference after alignment/map-matching. |

## Ultravasan 45

| Year | Exact-source status | Best source/candidate identified | Course evidence / action |
| --- | --- | --- | --- |
| 2014 | Acquisition needed | ITRA/participant archive search | Find exact Oxberg–Mora race-day route. |
| 2015 | Acquisition needed | ITRA/participant archive search | Find exact race-day route. |
| 2016 | Acquisition needed | ITRA/participant archive search | Find exact race-day route. |
| 2017 | Acquisition needed | Participant/ITRA route search | Final shared UV90 section is affected by the organiser's Krångåsen–Eldris change. |
| 2018 | Strong route source | Trace de Trail / ITRA `51603`, 44.2 km | GPX is exposed by Trace de Trail. Start-place label on the page is inconsistent and must be endpoint-validated before import. |
| 2019 | Strong route source | Trace de Trail / ITRA `75784`, 44.3 km | Acquire GPX and validate against Oxberg/Vasslan/Mora course. |
| 2020 | No normal race | Hemmavasan | Do not create a normal race route. |
| 2021 | Acquisition needed | Elite-only race-day participant source required | Vasaloppet confirms elite-only Ultravasan 45. |
| 2022 | Acquisition needed | ITRA/participant archive search | Current 2026 route must not be assumed exact for 2022. |
| 2023 | Acquisition needed | ITRA/participant archive search | Acquire exact route; shared late-course geometry must be checked independently. |
| 2024 | Strong route source | Trace de Trail / ITRA `267130`, 44.1 km | Organiser says temporary Björnarvet detour also affected Ultravasan 45. Acquire GPX. |
| 2025 | Documented same-course candidate | 2024 exact route | Organiser explicitly states no course changes in 2025. |
| 2026 | **Official geometry already present** | `source/UV45_20260610.kmz` / `data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx` | Organiser confirms return to regular route via Axi kvarn after the temporary detour. Keep as 2026 exact route, not as the geometry for every historical year. |

## Key web sources found

- Current official UV90: `https://vasaloppet.se/lopning/ultravasan-90/`
- Current official UV45: `https://vasaloppet.se/lopning/ultravasan-45/`
- 2017 course change: `https://www.mynewsdesk.com/se/vasaloppet/pressreleases/facts-statistics-and-trivia-for-ultravasan-2017-2110641`
- 2018 no-change statement: `https://www.mynewsdesk.com/se/vasaloppet/pressreleases/pressinformation-infoer-ultravasan-90-ultravasan-45-vasastafetten-och-vasakvartetten-2018-2637084`
- 2019 course change: `https://www.mynewsdesk.com/se/vasaloppet/pressreleases/infoer-ultravasan-vasastafetten-och-vasakvartetten-2019-2906012`
- 2024 course changes: `https://www.mynewsdesk.com/se/vasaloppet/pressreleases/infoer-ultravasan-trailvasan-funkisvasan-och-vasastafetten-2024-3337188`
- 2025 no-change statement: `https://www.vasaloppet.se/nyheter/infor-ultravasan-trailvasan-funkisvasan-och-vasastafetten-2025`
- 2026 return via Axi kvarn: `https://vasaloppet.se/nyheter/infor-ultravasan-trailvasan-funkisvasan-och-vasastafetten-2026-rekordmanga-lopare-anmalda/`
- 2018 UV90 ITRA/Trace: `https://tracedetrail.fr/en/trace/51602`
- 2018 UV45 ITRA/Trace: `https://tracedetrail.fr/en/trace/51603`
- 2019 UV45 ITRA/Trace: `https://tracedetrail.fr/en/trace/75784`
- 2024 UV90 ITRA/Trace: `https://tracedetrail.fr/fr/trace/267129`
- 2024 UV45 ITRA/Trace: `https://tracedetrail.fr/fr/trace/267130`
- 2022 organiser-derived Plotaroute: `https://www.plotaroute.com/route/1942022`
- 2024 organiser-derived/race-day-corrected Plotaroute: `https://www.plotaroute.com/mobile/route/2710347`

## User-supplied 2026 barometric source

The supplied Suunto GPX was inspected without publishing personal metadata:

- SHA-256: `636036befdbed9b91635ae38fb4815f0223d459c455d15fa9db0392235f9d11f`
- Points: 32,175
- Elevation coverage: 100 %
- Elevation range: 168.4–525.8 m
- Recorded polyline length: ~93.643 km
- Maximum adjacent GPS gap: ~10.9 m
- Start coordinate: 61.109970, 13.296137
- Finish coordinate: 61.007013, 14.542668

The recorded polyline is longer than the official 92 km because a dense wearable recording contains ordinary GPS wander. Therefore it should **not replace the organiser KMZ as course geometry**. Its value is the continuous barometric elevation series. The final route build should align this elevation series to the official 2026 geometry rather than summing raw GPS-point ascent.

## Required implementation before production switch

1. Replace the broad `pre2023`, `post2023` and single-UV45 assumptions with a route manifest keyed by race edition or explicit shared CourseVersion.
2. Preserve raw source provenance and SHA-256 for every acquired file.
3. Validate start/finish, checkpoint order, geographic jumps and distance against each RaceEdition.
4. Compare candidate routes geometrically and only merge years into one CourseVersion when organiser evidence or measured geometry supports it.
5. Keep geometry source and elevation source separate.
6. Rebuild browser route registry and add regression tests proving that each race selects the intended route.
7. Only after those checks should year-specific routes be used by Replay, Kartduell, elevation profiles and course-comparability logic.
