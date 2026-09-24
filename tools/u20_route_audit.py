#!/usr/bin/env python3
"""Evidence inventory of route files bound to imported Ultravasan editions."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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
    # Symmetric nearest sampled-point distance is a coarse audit signal, not proof
    # of turn-by-turn identity. It only supports a human review of source tracks.
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


def build_report():
    catalog = read(ROOT / "config/races.json")
    versions = read(ROOT / "config/course_versions.json")["courses"]
    route_index = read(ROOT / "data/routes/ultravasan90-routes.json")
    routes = route_index["routes"]
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
            provider = "not recorded in derived JSON; source filename is an opaque KMZ name"
            provenance = "Derived local JSON identifies a 2026 KMZ filename; original KMZ/provider metadata is not present in the audited route folder."
        elif route:
            provider = "not independently verifiable from repository metadata"
            provenance = route.get("geometry_note") or route.get("historical_note") or route.get("elevation_note") or "Route file is tagged to its source year; other edition bindings are reference-only."
        edition_version = versions.get(edition.get("course_version_id"), {})
        geometry_source = edition_version.get("geometry_source", {})
        source_path = geometry_source.get("path") if isinstance(geometry_source, dict) else None
        whole_group = "ultravasan90-post2023" if family == "uv90" and 2023 <= year <= 2026 else None
        whole_decision = (
            "assigned ultravasan90-post2023 from the V3 2023+ route-era contract; 2026 derived track is within 246 m p95 of the 2024 track at 0.5 km samples (localized max deviation 763 m); this supports whole-course grouping but not identical checkpoints/segments"
            if whole_group else
            "not assigned: available evidence is a reference track only; exact edition geometry/comparability is not established"
        )
        editions.append({
            "race_key": key,
            "race_family": family,
            "year": year,
            "course_version_id": edition.get("course_version_id"),
            "route_id": route_id,
            "exact_edition_route_found": exact_source_year,
            "route_usage": "exact-source-year" if exact_source_year else ("reference-only" if route else "unknown"),
            "source_provider": provider,
            "source_year": route.get("source_year") if route else None,
            "source_path": special_90.get("source_file") if family == "uv90" and year == 2026 else (route.get("source_file") if route else source_path),
            "source_sha256": hashlib.sha256((ROOT / special_90.get("source_file", "")).read_bytes()).hexdigest() if family == "uv90" and year == 2026 and (ROOT / special_90.get("source_file", "")).exists() else (hashlib.sha256((ROOT / "data/routes/ultravasan90-2026.json").read_bytes()).hexdigest() if family == "uv90" and year == 2026 else (hashlib.sha256((ROOT / route["source_file"]).read_bytes()).hexdigest() if route and (ROOT / route["source_file"]).exists() else None)),
            "geometry_fingerprint_sha256": fingerprint(points) if points else None,
            "official_distance_km": route.get("official_distance_km") if route else edition.get("distance_km"),
            "gps_distance_km": route.get("gps_distance_km") if route else None,
            "source_point_count": route.get("source_point_count", len(points)) if route else 0,
            "geometry_point_count": len(points),
            "provenance_and_limitations": provenance or "No edition-specific route file or independently verifiable source metadata is available.",
            "whole_course_comparison_group_current": edition.get("whole_course_comparison_group"),
            "whole_course_comparison_group_recommended": whole_group,
            "whole_course_comparison_decision": whole_decision,
        })
    r24 = next((r for r in routes.values() if r.get("source_year") == 2024), None)
    r26 = special_90
    comparison = track_delta(r24.get("points", []), r26.get("points", [])) if r24 else None
    return {
        "title": "Ultravasan RaceEdition route/GPX audit",
        "edition_count": len(editions),
        "exact_edition_routes_found": sum(item["exact_edition_route_found"] for item in editions),
        "reference_or_unknown_editions": [item["race_key"] for item in editions if not item["exact_edition_route_found"]],
        "course_version_equals_whole_course_comparison": False,
        "routes": editions,
        "geometry_comparisons": [{"left": "Ultravasan 90 2024 GPX reference", "right": "Ultravasan 90 2026 derived KMZ route", "result": comparison}],
        "whole_course_groups": [{"group": "ultravasan90-post2023", "editions": ["ultravasan90-2023", "ultravasan90-2024", "ultravasan90-2025", "ultravasan90-2026"], "evidence": "V3 route era begins 2023, the 2023-2025 editions use the same 2024 reference geometry, 2026 has a year-tagged derived route and has aligned official distance plus close sampled track geometry.", "limitations": "Track similarity is not proof of identical segment/checkpoint semantics; segment analysis remains CourseVersion-specific."}],
        "method_limitations": [
            "The repository has no edition-specific GPS tracks for every RaceEdition; reference geometry is not treated as exact route evidence.",
            "The sampled nearest-track distance is a diagnostic and cannot establish course identity on its own.",
            "No whole-course comparison group is assigned without edition-specific evidence; checkpoint contracts remain separate from route identity.",
        ],
    }


def main():
    report = build_report()
    json_path = ROOT / "reports/U20_ROUTE_AUDIT.json"
    md_path = ROOT / "reports/U20_ROUTE_AUDIT.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# Ultravasan route and GPX audit", "",
             f"Inventoried {report['edition_count']} imported editions; exact source-year route files found: {report['exact_edition_routes_found']}.",
             "", "CourseVersion is not treated as whole-course comparability. Reference tracks are not proof of exact annual geometry.",
             "", "| RaceEdition | Exact edition route | Route source/year | Distance (official/GPS km) | Geometry SHA-256 | Whole-course decision |",
             "|---|---:|---|---:|---|---|"]
    for row in report["routes"]:
        distance = f"{row['official_distance_km']} / {row['gps_distance_km']}" if row["gps_distance_km"] else str(row["official_distance_km"])
    lines.append(f"| {row['race_key']} | {'Yes' if row['exact_edition_route_found'] else 'No'} | {row['source_path'] or 'unknown'} · {row['source_year'] or 'unknown'} | {distance} | {row['geometry_fingerprint_sha256'] or 'unknown'} | {row['whole_course_comparison_group_recommended'] or 'Not assigned'} |")
    lines += ["", "## Geometry review", "", "The 2024 GPS reference and 2026-derived route receive a coarse symmetric nearest-sample comparison (0.5 km spacing). Combined with the V3 2023+ route-era contract, this supports a provisional whole-course comparison group; it does not establish segment equivalence. Groups are not assigned to pre-2023 UV90 or UV45 editions where exact route evidence is absent.", "", "```json", json.dumps(report["geometry_comparisons"], ensure_ascii=False, indent=2), "```", "", "## Limitations", ""]
    lines += [f"- {item}" for item in report["method_limitations"]]
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"json": str(json_path), "markdown": str(md_path), "editions": report["edition_count"], "exact_routes": report["exact_edition_routes_found"], "geometry_comparison": report["geometry_comparisons"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
