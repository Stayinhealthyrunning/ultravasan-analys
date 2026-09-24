#!/usr/bin/env python3
"""Evidence inventory of route files and external annual route evidence."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_CHECKED_ON = "2026-09-24"

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


def evidence_status(local_exact, external):
    strengths = {item.get("strength") for item in external}
    if local_exact:
        return "local-exact-source-year"
    if "strong" in strengths or "strong-secondary" in strengths:
        return "external-year-specific"
    if external:
        return "external-candidate"
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
    special_90 = read(ROOT / "data/routes/ultravasan90-2026.json")
    editions = []
    for edition in sorted(catalog["races"], key=lambda row: (row["year"], row["race_family"])):
        key, year, family = edition["race_key"], int(edition["year"]), edition["race_family"]
        route_id = route_index["route_for_edition"].get(key)
        route = routes.get(route_id)
        points = route.get("points", []) if route else []
        exact_source_year = bool(route and int(route.get("source_year", -1)) == year)
        provenance = ""
        provider = "not recorded"
        if family == "uv90" and year == 2026:
            points = special_90.get("points", [])
            route_id = "ultravasan90-2026"
            exact_source_year = True
            route = special_90
            provider = special_90.get("source_provider", "not recorded")
            provenance = special_90.get("provenance_note") or (
                "Derived 2026 geometry is tied to an annual source file, but provenance metadata is incomplete."
            )
        elif route:
            provider = "not independently verifiable from repository metadata"
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
            "route_usage": "exact-source-year" if exact_source_year else ("reference-only" if route else "unknown"),
            "display_route_contract": display_contracts.get(key),
            "evidence_status": evidence_status(exact_source_year, external),
            "source_provider": provider,
            "source_year": route.get("source_year") if route else None,
            "source_path": special_90.get("source_file") if family == "uv90" and year == 2026 else (route.get("source_file") if route else source_path),
            "source_url": special_90.get("source_url") if family == "uv90" and year == 2026 else None,
            "source_sha256": (
                hashlib.sha256((ROOT / special_90.get("source_file", "")).read_bytes()).hexdigest()
                if family == "uv90" and year == 2026 and (ROOT / special_90.get("source_file", "")).exists()
                else (
                    hashlib.sha256((ROOT / route["source_file"]).read_bytes()).hexdigest()
                    if (family != "uv90" or year != 2026)
                    and route
                    and (ROOT / route["source_file"]).exists()
                    else None
                )
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
    r22 = next((r for r in routes.values() if r.get("source_year") == 2022), None)
    r24 = next((r for r in routes.values() if r.get("source_year") == 2024), None)
    r26 = special_90
    geometry_comparisons = []
    for left_label, left_route, right_label, right_route in (
        ("Ultravasan 90 2022 exact-year geometry", r22, "Ultravasan 90 2024 exact-year geometry", r24),
        ("Ultravasan 90 2022 exact-year geometry", r22, "Ultravasan 90 2026 exact-year geometry", r26),
        ("Ultravasan 90 2024 exact-year geometry", r24, "Ultravasan 90 2026 exact-year geometry", r26),
    ):
        if not left_route or not right_route:
            continue
        geometry_comparisons.append({
            "left": left_label,
            "right": right_label,
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
        "exact_edition_routes_found": sum(item["exact_edition_route_found"] for item in editions),
        "external_year_specific_evidence_editions": external_keys,
        "strong_external_year_specific_evidence_editions": strong_external_keys,
        "reference_or_unknown_editions": [
            item["race_key"] for item in editions
            if not item["exact_edition_route_found"] and not item["external_route_evidence"]
        ],
        "course_version_equals_whole_course_comparison": False,
        "display_route_contracts_complete": len(display_contracts) == len(editions),
        "routes": editions,
        "geometry_comparisons": geometry_comparisons,
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
        f"Inventoried {report['edition_count']} imported editions; exact local source-year route files found: {report['exact_edition_routes_found']}.",
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
        "The previously proposed ultravasan90-post2023 group is not verified. The 2024 route evidence explicitly records a rerouting around km 57-59, while the remaining annual evidence has not been pairwise established as performance-equivalent. U20 therefore recommends no multi-year whole-course group at this stage.",
        "",
        "## Geometry review",
        "",
        "The exact-source-year 2022, 2024 and 2026 UV90 geometries receive pairwise coarse symmetric nearest-sample comparisons (0.5 km spacing). These remain geometry diagnostics only: they can show material route differences or strong geometric similarity, but cannot by themselves establish equal whole-course performance difficulty.",
        "",
        "~~~json",
        json.dumps(report["geometry_comparisons"], ensure_ascii=False, indent=2),
        "~~~",
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
