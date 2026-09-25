#!/usr/bin/env python3
"""Evidence inventory of route files and external annual route evidence."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_CHECKED_ON = "2026-09-25"
PLOTAROUTE_CANDIDATES = [
    {"race_key": "ultravasan90-2015", "route_id": 2311120, "distance_km": 90.141},
    {"race_key": "ultravasan90-2018", "route_id": 2311944, "distance_km": 90.526},
    {"race_key": "ultravasan90-2019", "route_id": 2311126, "distance_km": 91.119},
    {"race_key": "ultravasan90-2023", "route_id": 2311089, "distance_km": 91.805},
    {"race_key": "ultravasan90-2023", "route_id": 2356968, "distance_km": 91.802, "alternate": True},
    {"race_key": "ultravasan90-2022", "route_id": 1942022, "distance_km": 90.173},
    {"race_key": "ultravasan90-2024", "route_id": 2710347, "distance_km": 91.987},
]

# Curated external evidence discovered during U20. The audit stays deterministic/offline:
# these references are evidence metadata, not network calls and not imported geometry.
EXTERNAL_ROUTE_EVIDENCE = {
    "ultravasan90-2015": [
        {
            "provider": "plotaroute.com",
            "url": "https://www.plotaroute.com/route/2311120",
            "evidence_type": "downloadable-year-labelled-route",
            "strength": "candidate",
            "note": "Year-labelled downloadable route exists, but the page does not establish organizer provenance.",
        },
    ],
    "ultravasan90-2017": [
        {
            "provider": "Vasaloppet/Mynewsdesk",
            "url": "https://www.mynewsdesk.com/se/vasaloppet/pressreleases/infoer-ultravasan-vasastafetten-och-vasakvartetten-2017-2109278",
            "evidence_type": "official-route-change-notice",
            "strength": "strong",
            "note": "Organizer states that the 2017 course routing changed, although total distance and elevation difference were unchanged.",
        },
    ],
    "ultravasan90-2018": [
        {
            "provider": "ITRA / Trace de Trail",
            "url": "https://tracedetrail.fr/en/trace/51602",
            "evidence_type": "year-specific public map geometry",
            "strength": "strong-secondary",
            "note": "ITRA-created 2018 Ultravasan 90 track; public page geometry was transformed and validated against the local route checks.",
        },
        {
            "provider": "plotaroute.com",
            "url": "https://www.plotaroute.com/route/2311944",
            "evidence_type": "downloadable-year-labelled-route",
            "strength": "candidate",
            "note": "Year-labelled downloadable route exists, but organizer provenance is not established.",
        },
    ],
    "ultravasan90-2019": [
        {
            "provider": "plotaroute.com",
            "url": "https://www.plotaroute.com/route/2311126",
            "evidence_type": "downloadable-year-labelled-route",
            "strength": "candidate",
            "note": "Year-labelled downloadable route exists, but organizer provenance is not established.",
        },
    ],
    "ultravasan90-2022": [
        {
            "provider": "plotaroute.com",
            "url": "https://www.plotaroute.com/route/1942022",
            "evidence_type": "organizer-kmz-derived-downloadable-route",
            "strength": "strong-secondary",
            "note": "Route description states it is based on a KMZ supplied by the organizer on 2022-06-16; GPX/KML downloads are offered.",
        },
    ],
    "ultravasan90-2023": [
        {
            "provider": "Vasaloppet/Mynewsdesk",
            "url": "https://vasaloppet.mynewsdesk.com/pressreleases/ny-banstraeckning-2023-cyklister-och-loepare-tar-sig-an-vasaloppets-foersta-backe-3254898",
            "evidence_type": "official-course-change-notice",
            "strength": "strong",
            "note": "Organizer documents the new 2023 start routing via the first Vasalopp hill, extending the running course to 92 km.",
        },
        {
            "provider": "ITRA / Trace de Trail",
            "url": "https://tracedetrail.fr/en/trace/229687",
            "evidence_type": "year-specific public map geometry",
            "strength": "strong-secondary",
            "note": "ITRA 2023 Ultravasan 90 track; public map geometry was transformed and validated against the local route checks.",
        },
        {
            "provider": "plotaroute.com",
            "url": "https://www.plotaroute.com/route/2311089",
            "evidence_type": "downloadable-year-labelled-route",
            "strength": "candidate",
            "note": "A 2023-labelled downloadable route exists; the page itself does not establish organizer provenance.",
        },
    ],
    "ultravasan90-2024": [
        {
            "provider": "Vasaloppet/Mynewsdesk",
            "url": "https://vasaloppet.mynewsdesk.com/pressreleases/infoer-ultravasan-trailvasan-funkisvasan-och-vasastafetten-2024-3337188",
            "evidence_type": "official-course-change-notice",
            "strength": "strong",
            "note": "Organizer states that 2024 differs from 2023 after the first hill and between Evertsberg and Oxberg, including the temporary Björnarvet rerouting caused by roadworks.",
        },
        {
            "provider": "ITRA/Trace de Trail",
            "url": "https://tracedetrail.fr/en/trace/267129",
            "evidence_type": "itra-year-specific-course-track",
            "strength": "strong",
            "note": "ITRA track created 2024-08-13 for the 2024 race; 92.15 km course metadata is exposed.",
        },
        {
            "provider": "plotaroute.com",
            "url": "https://www.plotaroute.com/route/2710347",
            "evidence_type": "organizer-kmz-derived-downloadable-route",
            "strength": "strong-secondary",
            "note": "Route description states it came from organizer KMZ dated 2024-08-16 and was updated after the race; it explicitly records a rerouting around km 57-59 due to road construction.",
        },
    ],
    "ultravasan90-2025": [
        {
            "provider": "Vasaloppet",
            "url": "https://www.vasaloppet.se/nyheter/infor-ultravasan-trailvasan-funkisvasan-och-vasastafetten-2025",
            "evidence_type": "official-no-course-change-notice",
            "strength": "strong",
            "note": "Organizer explicitly states that there are no changes to the 2025 Ultravasan 90 course, establishing continuity from the 2024 edition.",
        },
        {
            "provider": "Vasahistorier",
            "url": "https://vasahistorier.se/ask/banan/ultravasan",
            "evidence_type": "race-day-gps-track",
            "strength": "strong-secondary",
            "note": "Published course analysis states its profile is based on a GPX track recorded during Ultravasan 90 on race day 2025-08-16.",
        },
    ],
    "ultravasan90-2026": [
        {
            "provider": "Vasaloppet",
            "url": "https://vasaloppet.se/nyheter/infor-ultravasan-trailvasan-funkisvasan-och-vasastafetten-2026-rekordmanga-lopare-anmalda/",
            "evidence_type": "official-course-change-notice",
            "strength": "strong",
            "note": "Organizer states that 2026 returns to the ordinary Vasaloppsleden route between Evertsberg and Oxberg after several years of a temporary roadworks rerouting.",
        },
        {
            "provider": "Vasaloppet",
            "url": "https://vasaloppet.se/wp-content/uploads/2026/06/UV-90_20260610.kmz",
            "evidence_type": "official-organizer-kmz",
            "strength": "strong",
            "note": "Vasaloppets official Ultravasan 90 page exposes this GPS file for the 2026 course and labels it updated 2026-06-10.",
        },
        {
            "provider": "ITRA / Trace de Trail",
            "url": "https://tracedetrail.fr/en/trace/328148",
            "evidence_type": "year-labelled third-party map geometry candidate",
            "strength": "candidate",
            "note": "Not promoted; the organizer's 2026 KMZ remains the route source.",
        },
    ],
    "ultravasan45-2018": [
        {
            "provider": "ITRA / Trace de Trail",
            "url": "https://tracedetrail.fr/en/trace/51603",
            "evidence_type": "year-specific public map geometry with validated donor elevation",
            "strength": "strong-secondary",
            "note": "Exact-year 2018 geometry is promoted. Native elevation is incomplete, so only missing heights are supplemented from the complete 2024 ITRA route within 50 m after observed-point cross-validation.",
        },
    ],
    "ultravasan45-2019": [
        {
            "provider": "ITRA / Trace de Trail",
            "url": "https://tracedetrail.fr/en/trace/75784",
            "evidence_type": "year-specific public map geometry with validated donor elevation",
            "strength": "strong-secondary",
            "note": "Exact-year 2019 geometry is promoted. Native elevation is incomplete, so only missing heights are supplemented from the complete 2024 ITRA route within 50 m after observed-point cross-validation.",
        },
    ],
    "ultravasan45-2024": [
        {
            "provider": "ITRA/Trace de Trail",
            "url": "https://tracedetrail.fr/en/trace/267130",
            "evidence_type": "itra-year-specific-course-track",
            "strength": "strong",
            "note": "ITRA track created 2024-08-13 for Ultravasan 45; 44.1 km geometry and GPX download are exposed.",
        },
    ],
}


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def fingerprint(points):
    canonical = "\n".join(
        f"{float(point[0]):.6f},{float(point[1]):.6f},{float(point[2]):.3f}"
        for point in points
    )
    return hashlib.sha256(canonical.encode("ascii")).hexdigest()


def source_file_sha256(path: Path) -> str:
    """Hash textual route sources independently of checkout line-ending policy."""
    payload = path.read_bytes()
    if path.suffix.lower() in {".gpx", ".xml"}:
        payload = payload.replace(b"\r\n", b"\n")
    return hashlib.sha256(payload).hexdigest()


def haversine(a, b):
    radius = 6_371_000
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat, dlon = lat2 - lat1, math.radians(b[1] - a[1])
    x = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.asin(math.sqrt(x))


def sample(points, interval_km=0.5):
    selected = []
    next_distance = 0.0
    for point in points:
        if len(point) < 3:
            continue
        distance = float(point[2])
        if distance + 1e-9 >= next_distance:
            selected.append((float(point[0]), float(point[1])))
            next_distance = distance + interval_km
    return selected


def track_delta(left, right):
    a, b = sample(left), sample(right)
    if not a or not b:
        return None
    deviations = [min(haversine(p, q) for q in b) for p in a]
    deviations += [min(haversine(p, q) for q in a) for p in b]
    deviations.sort()
    return {
        "sample_interval_km": 0.5,
        "sample_points_a": len(a),
        "sample_points_b": len(b),
        "symmetric_nearest_median_m": round(deviations[len(deviations) // 2], 1),
        "symmetric_nearest_p95_m": round(deviations[math.ceil(len(deviations) * 0.95) - 1], 1),
        "symmetric_nearest_max_m": round(max(deviations), 1),
        "limitation": "coarse nearest-point geometry diagnostic; not a surveyed equivalence proof",
    }


def evidence_status(route_usage, external):
    strengths = {item.get("strength") for item in external}
    if route_usage == "exact-source-year":
        return "local-exact-source-year"
    if route_usage == "verified-shared-course":
        return "verified-shared-course"
    if "strong" in strengths or "strong-secondary" in strengths:
        return "external-year-specific-reference-only"
    if external:
        return "external-candidate-reference-only"
    return "reference-only-or-unknown"


def whole_course_decision(key, year, family, external):
    if family != "uv90":
        return None, "not assigned: no verified multi-year whole-course equivalence contract"
    if year in {2024, 2025}:
        return "ultravasan90-2024-2025", (
            "verified: organizer documents the 2024 course changes from 2023, explicitly reports no course changes "
            "for 2025, and states that 2026 ends the multi-year temporary Evertsberg-Oxberg rerouting"
        )
    if year == 2023:
        return None, (
            "not assigned: organizer documents additional route changes for 2024 relative to 2023, including after "
            "the first hill and between Evertsberg and Oxberg"
        )
    if year == 2026:
        return None, (
            "not assigned: organizer explicitly states that 2026 returns to the ordinary Evertsberg-Oxberg route "
            "after several years of temporary rerouting"
        )
    return None, "not assigned: available evidence does not establish a verified multi-year whole-course equivalence contract"


def build_report():
    catalog = read(ROOT / "config/races.json")
    versions = read(ROOT / "config/course_versions.json")["courses"]
    route_index = read(ROOT / "data/routes/ultravasan90-routes.json")
    routes = route_index["routes"]
    display_contracts = route_index.get("edition_route_contracts", {})
    trace_manifest = read(ROOT / "reports/trace-de-trail-route-candidates.json")
    trace_candidates = trace_manifest.get("tracks", [])
    editions = []
    for edition in sorted(catalog["races"], key=lambda row: (row["year"], row["race_family"])):
        key, year, family = edition["race_key"], int(edition["year"]), edition["race_family"]
        route_id = route_index["route_for_edition"].get(key)
        route = routes.get(route_id)
        points = route.get("points", []) if route else []
        display_contract = display_contracts.get(key) or {}
        route_usage = display_contract.get("display_geometry_usage") or (
            "exact-source-year" if route and int(route.get("source_year", -1)) == year else "reference-only"
        )
        exact_source_year = route_usage == "exact-source-year"
        provenance = ""
        provider = route.get("source_provider", "not recorded") if route else "not recorded"
        if display_contract.get("geometry_evidence_note"):
            provenance = display_contract["geometry_evidence_note"]
        elif route:
            provenance = route.get("geometry_note") or route.get("historical_note") or route.get("elevation_note") or "Route file is tagged to its source year; other edition bindings are reference-only."
        edition_version = versions.get(edition.get("course_version_id"), {})
        geometry_source = edition_version.get("geometry_source", {})
        source_path = geometry_source.get("path") if isinstance(geometry_source, dict) else None
        external = EXTERNAL_ROUTE_EVIDENCE.get(key, [])
        whole_group, whole_decision = whole_course_decision(key, year, family, external)
        editions.append({
            "race_key": key,
            "race_family": family,
            "year": year,
            "course_version_id": edition.get("course_version_id"),
            "route_id": route_id,
            "exact_edition_route_found": exact_source_year,
            "route_usage": route_usage if route else "unknown",
            "display_route_contract": display_contract,
            "evidence_status": evidence_status(route_usage, external),
            "source_provider": provider,
            "source_year": route.get("source_year") if route else None,
            "source_path": route.get("source_file") if route else source_path,
            "source_url": route.get("source_url") if route else None,
            "source_external_id": route.get("external_id") if route else None,
            "source_http_status": route.get("source_http_status") if route else None,
            "source_content_type": route.get("source_content_type") if route else None,
            "source_fetched_at_utc": route.get("source_fetched_at_utc") if route else None,
            "source_page_sha256": route.get("source_page_sha256") if route else None,
            "source_sha256": (
                source_file_sha256(ROOT / route["source_file"])
                if route and route.get("source_file") and (ROOT / route["source_file"]).exists()
                else None
            ),
            "geometry_fingerprint_sha256": fingerprint(points) if points else None,
            "official_distance_km": route.get("official_distance_km") if route else edition.get("distance_km"),
            "gps_distance_km": route.get("gps_distance_km") if route else None,
            "source_point_count": route.get("source_point_count", len(points)) if route else 0,
            "geometry_point_count": len(points),
            "provenance_and_limitations": provenance or "No edition-specific local route file or independently verifiable local source metadata is available.",
            "external_route_evidence": external,
            "whole_course_comparison_group_current": edition.get("whole_course_comparison_group"),
            "whole_course_comparison_group_recommended": whole_group,
            "whole_course_comparison_decision": whole_decision,
        })
    exact_uv90 = [
        (row["race_key"], routes[row["route_id"]]) for row in editions
        if row["race_family"] == "uv90" and row["exact_edition_route_found"] and row["route_id"] in routes
    ]
    geometry_comparisons = []
    for index, (left_key, left_route) in enumerate(exact_uv90):
        for right_key, right_route in exact_uv90[index + 1:]:
            geometry_comparisons.append({
                "left": left_key,
                "right": right_key,
                "result": track_delta(left_route.get("points", []), right_route.get("points", [])),
                "decision": (
                    "diagnostic only; geometric similarity or difference is evidence input, not by itself a "
                    "whole-course performance-equivalence contract"
                ),
            })
    external_keys = [item["race_key"] for item in editions if item["external_route_evidence"]]
    strong_external_keys = [
        item["race_key"] for item in editions
        if any(e.get("strength") in {"strong", "strong-secondary"} for e in item["external_route_evidence"])
    ]
    return {
        "title": "Ultravasan RaceEdition route/GPX audit",
        "evidence_checked_on": EVIDENCE_CHECKED_ON,
        "edition_count": len(editions),
        "exact_edition_routes_found": sum(item["route_usage"] == "exact-source-year" for item in editions),
        "verified_shared_course_editions": [item["race_key"] for item in editions if item["route_usage"] == "verified-shared-course"],
        "reference_only_editions": [item["race_key"] for item in editions if item["route_usage"] == "reference-only"],
        "external_year_specific_evidence_editions": external_keys,
        "strong_external_year_specific_evidence_editions": strong_external_keys,
        "reference_or_unknown_editions": [
            item["race_key"] for item in editions if item["route_usage"] in {"reference-only", "unknown"}
        ],
        "course_version_equals_whole_course_comparison": False,
        "display_route_contracts_complete": len(display_contracts) == len(editions),
        "routes": editions,
        "geometry_comparisons": geometry_comparisons,
        "trace_de_trail_candidates": trace_candidates,
        "plotaroute_candidates": [{
            **candidate,
            "url": f"https://www.plotaroute.com/route/{candidate['route_id']}",
            "decision": "candidate-only; GPX not retrieved or promoted in this pass",
            "page_access_note": "Public route page metadata was visible, but a stable normal GPX download was not obtained; no login/Cloudflare challenge was bypassed.",
        } for candidate in PLOTAROUTE_CANDIDATES],
        "vasahistorier_2025_candidate": {
            "url": "https://vasahistorier.se/ask/banan/ultravasan",
            "status": "candidate-only; no public GPX link found",
            "evidence": "The page states that its profile is based on an Ultravasan 90 GPX recorded on race day 2025-08-16, but it exposes no downloadable GPX URL; no geometry was promoted.",
        },
        "whole_course_groups": [{
            "group": "ultravasan90-2024-2025",
            "editions": ["ultravasan90-2024", "ultravasan90-2025"],
            "status": "verified",
            "reason": (
                "Organizer evidence establishes 2024 changes from 2023, no course changes for 2025, and a 2026 "
                "return from the multi-year temporary Evertsberg-Oxberg routing."
            ),
        }],
        "rejected_or_pending_groups": [{
            "group": "ultravasan90-post2023",
            "editions": ["ultravasan90-2023", "ultravasan90-2024", "ultravasan90-2025", "ultravasan90-2026"],
            "status": "rejected",
            "reason": (
                "Official organizer notices establish route changes between 2023 and 2024 and again between "
                "2025 and 2026; only the 2024-2025 subset is verified as unchanged."
            ),
        }],
        "method_limitations": [
            "Repository reference geometry is not treated as exact annual route evidence unless its source year matches the RaceEdition.",
            "External references are curated evidence metadata; the audit does not silently download or promote third-party geometry into the repository.",
            "A year-specific route or race-day GPS trace proves evidence for that year; cross-year equivalence additionally requires explicit continuity evidence such as an organizer no-change statement.",
            "The sampled nearest-track distance is a diagnostic and cannot establish course identity or equal performance difficulty on its own.",
            "A missing original source file is never substituted by hashing a derived repository artifact; source_sha256 remains null in that case.",
            "Display geometry, exact annual geometry evidence and whole-course performance comparability are separate contracts.",
            "CourseVersion/checkpoint equality is not sufficient evidence for whole-course comparison groups.",
        ],
    }


def main():
    report = build_report()
    json_path = ROOT / "reports/U20_ROUTE_AUDIT.json"
    md_path = ROOT / "reports/U20_ROUTE_AUDIT.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# Ultravasan route and GPX audit",
        "",
        f"Inventoried {report['edition_count']} imported editions; exact source-year routes: {report['exact_edition_routes_found']}; verified shared-course editions: {len(report['verified_shared_course_editions'])}; reference-only editions: {len(report['reference_only_editions'])}.",
        f"Curated external year-specific route evidence exists for {len(report['external_year_specific_evidence_editions'])} editions, of which {len(report['strong_external_year_specific_evidence_editions'])} have strong/strong-secondary evidence.",
        "",
        "CourseVersion is not treated as whole-course comparability. Reference tracks and year-labelled routes are evidence inputs, not automatic comparison contracts.",
        "",
        "| RaceEdition | Local exact route | Display geometry | Evidence status | Local route source/year | External annual evidence | Whole-course decision |",
        "|---|---:|---|---|---|---|---|",
    ]
    for row in report["routes"]:
        external = "; ".join(
            f"{item['provider']} ({item['evidence_type']}, {item['strength']})"
            for item in row["external_route_evidence"]
        ) or "none"
        local = f"{row['source_path'] or 'unknown'} · {row['source_year'] or 'unknown'}"
        display = row.get("display_route_contract") or {}
        display_text = (
            f"{display.get('display_geometry_usage', 'unknown')} · source {display.get('display_geometry_source_year', 'unknown')}"
        )
        lines.append(
            f"| {row['race_key']} | {'Yes' if row['exact_edition_route_found'] else 'No'} | "
            f"{display_text} | {row['evidence_status']} | {local} | {external} | "
            f"{row['whole_course_comparison_group_recommended'] or 'Not assigned'} |"
        )
    lines += [
        "",
        "## Whole-course conclusion",
        "",
        "The broad ultravasan90-post2023 group is rejected. Organizer evidence establishes route changes from 2023 to 2024, no course changes for 2025, and a return from the temporary Evertsberg–Oxberg routing in 2026. U20 therefore verifies only ultravasan90-2024-2025 as a multi-year whole-course comparison group.",
        "",
        "## Geometry review",
        "",
        "The exact-source-year UV90 geometries for 2018, 2022, 2023, 2024 and 2026 receive pairwise coarse symmetric nearest-sample comparisons (0.5 km spacing). These remain geometry diagnostics only: they can show material route differences or strong geometric similarity, but cannot by themselves establish equal whole-course performance difficulty.",
        "",
        "~~~json",
        json.dumps(report["geometry_comparisons"], ensure_ascii=False, indent=2),
        "~~~",
        "",
        "## Downloaded Trace de Trail candidates",
        "",
        "Geometry was read from each ordinary public route page's map payload and transformed from Web Mercator to WGS84. The account-gated GPX download control was not used. The manifest records page URL, response status/content type, fetch time, source SHA-256, and candidate GPX SHA-256.",
        "",
        "| RaceEdition | Track ID | HTTP | Elevation coverage | Decision |",
        "|---|---:|---:|---:|---|",
    ]
    for candidate in report["trace_de_trail_candidates"]:
        lines.append(
            f"| {candidate.get('race_key')} | {candidate.get('track_id')} | {candidate.get('http_status', 'unknown')} | "
            f"{candidate.get('elevation_coverage_pct', 'unknown')}% | "
            f"{candidate.get('promotion_decision', candidate.get('status'))} — {candidate.get('decision_reason', candidate.get('rejection_reason', ''))} |"
        )
    lines += [
        "",
        "UV45 2018/2019 keep their exact-year Trace de Trail geometry. Missing native height is filled only through validated <=50 m donor matching against the complete 2024 track. For 2026, Vasaloppet's official KMZ is authoritative geometry; same-year Trace de Trail supplies height only where it matches within 50 m, while unmatched changed sections use the checked-in Copernicus GLO-90 DEM cache. UV90 2024 remains organizer/local primary rather than promoting the secondary ITRA candidate.",
        "",
        "## Plotaroute candidates",
        "",
        "The following IDs remain candidate-only; no GPX was downloaded or promoted. Public page access was intermittent and a normal request encountered a Cloudflare challenge, which was not bypassed. Known wrong-dimension routes 2311858 and 2338828 were excluded.",
        "",
        "| RaceEdition | Plotaroute ID | Listed distance (km) | Decision |",
        "|---|---:|---:|---|",
    ]
    for candidate in report["plotaroute_candidates"]:
        lines.append(
            f"| {candidate['race_key']} | [{candidate['route_id']}]({candidate['url']}) | {candidate['distance_km']} | {candidate['decision']} |"
        )
    lines += [
        "",
        "Vasahistorier states that its 2025 profile uses race-day GPS recorded on 2025-08-16, but no public GPX download URL is exposed. The geometry is therefore not imported. Vasaloppet's explicit no-change notice instead verifies that the exact 2024 geometry is the shared 2025 course for both UV90 and UV45.",
        "",
        "## External evidence",
        "",
    ]
    for row in report["routes"]:
        for item in row["external_route_evidence"]:
            lines.append(f"- **{row['race_key']}** — {item['provider']}: {item['note']} ({item['url']})")
    lines += ["", "## Limitations", ""]
    lines += [f"- {item}" for item in report["method_limitations"]]
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({
        "json": str(json_path),
        "markdown": str(md_path),
        "editions": report["edition_count"],
        "exact_local_routes": report["exact_edition_routes_found"],
        "external_evidence_editions": len(report["external_year_specific_evidence_editions"]),
        "strong_external_evidence_editions": len(report["strong_external_year_specific_evidence_editions"]),
        "geometry_comparison": report["geometry_comparisons"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
