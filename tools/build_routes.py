#!/usr/bin/env python3
"""Build one browser route registry for configured Ultravasan 90/45 races.

The indented JSON file is the canonical generated registry. The JavaScript
file is a browser wrapper containing the same parsed payload.

Verified GPX sources
--------------------
The three files in ``data/routes`` are the primary, reproducible geometry and
elevation sources.  UV90 uses separate pre/post-2023 versions while UV45 uses
one geometry with year-specific checkpoint models supplied by race data.

Fallback
--------
The post-2023 route comes from the user supplied KMZ-derived route file.  A
public 2022 Plotaroute route states that it was made from the organiser's KMZ
and measures 90.173 km.  Because that site's coordinate download could not be
bundled automatically, the fallback pre-2023 first section is reconstructed by
removing the added 2023 distance and reconnecting to the shared Vasaloppet
arena.  Metadata always exposes which geometry is in use.
"""
from __future__ import annotations

import argparse
import json
import math
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.etree.ElementTree import Element, SubElement, ElementTree

ROOT = Path(__file__).resolve().parents[1]
CURRENT_ROUTE_JSON = ROOT / "data/routes/ultravasan90-2026.json"
CURRENT_KMZ = ROOT / "source/UV-90_20260610.kmz"
OUT_JS = ROOT / "docs/data/ultravasan-routes.js"
OUT_JSON = ROOT / "data/routes/ultravasan90-routes.json"
EXACT_OLD_GPX = ROOT / "source/Ultravasan90-2014-2022.gpx"
REFERENCE_OLD_GPX = ROOT / "source/Ultravasan90-2014-2022-reference.gpx"
UV45_KMZ = ROOT / "source/UV45_20260610.kmz"
OLD_PRIMARY_GPX = ROOT / "data/routes/Ultravasan 90 2022.gpx"
CURRENT_PRIMARY_GPX = ROOT / "data/routes/vasaloppet-ultravasan-2024-ultravasan-90.gpx"
UV45_PRIMARY_GPX = ROOT / "data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx"
RACE_CONFIG = ROOT / "config/races.json"
OLD_TOTAL = 90.173
OLD_SOURCE = "https://www.plotaroute.com/route/1942022"
POINT_SCHEMA = [
    "lat", "lon", "distance_km", "elevation_m", "grade_percent",
    "cumulative_ascent_m", "cumulative_descent_m",
]
GEOMETRY_TOLERANCE_M = 4.0
MIN_GRADE_SPAN_KM = 0.06
MAX_GRADE_PERCENT = 35.0


def hav(a, b):
    """Haversine distance in kilometres for [lat, lon, ...] points."""
    radius = 6371.0088
    la1, lo1 = map(math.radians, a[:2])
    la2, lo2 = map(math.radians, b[:2])
    dla = la2 - la1
    dlo = lo2 - lo1
    q = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(q))


def bezier(a, b, t):
    """Gentle fallback curve approximating the old direct opening section."""
    mid = ((a[0] + b[0]) / 2 + 0.0022, (a[1] + b[1]) / 2 + 0.0008)
    u = 1 - t
    return [
        u * u * a[0] + 2 * u * t * mid[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * mid[1] + t * t * b[1],
    ]


def cumulative(coords):
    out = []
    total = 0.0
    for index, point in enumerate(coords):
        if index:
            total += hav(coords[index - 1], point)
        out.append([round(float(point[0]), 6), round(float(point[1]), 6), round(total, 3)])
    return out, total


def normalize_distance(points, official_distance):
    if not points or points[-1][2] <= 0:
        raise ValueError("Rutten saknar användbar längd")
    factor = official_distance / points[-1][2]
    normalized = [[lat, lon, round(dist * factor, 3)] for lat, lon, dist in points]
    normalized[-1][2] = official_distance
    return normalized


def build_elevation_profile(coords, points, max_samples=420):
    """Return a compact [distance_km, elevation_m] profile when the source is trustworthy."""
    if len(coords) != len(points) or len(coords) < 2:
        return []
    elevations = [float(point[2]) if len(point) > 2 and point[2] is not None else None for point in coords]
    plausible = [value for value in elevations if value is not None and -50 <= value <= 1000]
    if len(plausible) / len(elevations) < 0.95 or max(plausible, default=0) - min(plausible, default=0) < 5:
        return []
    step = max(1, math.ceil(len(points) / max_samples))
    indices = list(range(0, len(points), step))
    if indices[-1] != len(points) - 1:
        indices.append(len(points) - 1)
    return [[round(float(points[index][2]), 3), round(float(elevations[index]), 1)] for index in indices]


def _fill_small_elevation_gaps(coords, max_gap_points=8, max_gap_km=0.5):
    """Interpolate only short, bounded elevation gaps; leave uncertain gaps empty."""
    elevations = [float(point[2]) if len(point) > 2 and point[2] is not None else None for point in coords]
    index = 0
    while index < len(elevations):
        if elevations[index] is not None:
            index += 1
            continue
        start = index
        while index < len(elevations) and elevations[index] is None:
            index += 1
        end = index - 1
        left, right = start - 1, index
        if left < 0 or right >= len(elevations) or end - start + 1 > max_gap_points:
            continue
        span = sum(hav(coords[i], coords[i + 1]) for i in range(left, right))
        if span <= 0 or span > max_gap_km:
            continue
        walked = 0.0
        for current in range(start, right):
            walked += hav(coords[current - 1], coords[current])
            ratio = walked / span
            elevations[current] = elevations[left] + (elevations[right] - elevations[left]) * ratio
    return elevations


def _median_smooth(elevations, radius=2):
    """Centered five-point median; deterministic and resistant to isolated spikes."""
    smoothed = []
    for index, value in enumerate(elevations):
        if value is None:
            smoothed.append(None)
            continue
        window = [
            elevations[i] for i in range(max(0, index - radius), min(len(elevations), index + radius + 1))
            if elevations[i] is not None
        ]
        window.sort()
        middle = len(window) // 2
        smoothed.append(window[middle] if len(window) % 2 else (window[middle - 1] + window[middle]) / 2)
    return smoothed


def _perpendicular_m(point, start, end, reference_lat):
    scale_x = 111_320.0 * math.cos(math.radians(reference_lat))
    scale_y = 110_540.0
    px, py = (point[1] - start[1]) * scale_x, (point[0] - start[0]) * scale_y
    ex, ey = (end[1] - start[1]) * scale_x, (end[0] - start[0]) * scale_y
    length_sq = ex * ex + ey * ey
    if length_sq <= 0:
        return math.hypot(px, py)
    ratio = max(0.0, min(1.0, (px * ex + py * ey) / length_sq))
    return math.hypot(px - ex * ratio, py - ey * ratio)


def simplify_indices(points, tolerance_m=GEOMETRY_TOLERANCE_M):
    """Ramer-Douglas-Peucker in local metres; returns indices and measured deviation."""
    if len(points) <= 2:
        return list(range(len(points))), 0.0
    reference_lat = sum(point[0] for point in points) / len(points)
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        best_distance, best_index = 0.0, None
        for index in range(start + 1, end):
            distance = _perpendicular_m(points[index], points[start], points[end], reference_lat)
            if distance > best_distance:
                best_distance, best_index = distance, index
        if best_index is not None and best_distance > tolerance_m:
            keep.add(best_index)
            stack.extend(((start, best_index), (best_index, end)))
    indices = sorted(keep)
    measured = 0.0
    for start, end in zip(indices, indices[1:]):
        for index in range(start + 1, end):
            measured = max(measured, _perpendicular_m(points[index], points[start], points[end], reference_lat))
    return indices, measured


def build_gpx_route_data(path, official_distance, expected_start, expected_finish):
    """Validate and transform one verified GPX into the compact browser schema."""
    coords = read_gpx(path)
    if any(not (-90 <= point[0] <= 90 and -180 <= point[1] <= 180) for point in coords):
        raise ValueError(f"{path.name} innehåller ogiltiga koordinater")
    raw_distances = [0.0]
    segment_distances = []
    for previous, current in zip(coords, coords[1:]):
        distance = hav(previous, current)
        segment_distances.append(distance)
        raw_distances.append(raw_distances[-1] + distance)
    raw_total = raw_distances[-1]
    if not official_distance * 0.9 <= raw_total <= official_distance * 1.1:
        raise ValueError(f"{path.name} har orimlig distans {raw_total:.3f} km")
    if hav(coords[0], expected_start) > 2 or hav(coords[-1], expected_finish) > 2:
        raise ValueError(f"{path.name} har orimlig start- eller målpunkt")
    if max(segment_distances, default=0) > 2:
        raise ValueError(f"{path.name} innehåller ett geografiskt hopp över 2 km")

    raw_elevations = [point[2] for point in coords if len(point) > 2 and point[2] is not None]
    if len(raw_elevations) / len(coords) < 0.95:
        raise ValueError(f"{path.name} saknar höjd för mer än fem procent av punkterna")
    if raw_elevations and (min(raw_elevations) < -50 or max(raw_elevations) > 1000):
        raise ValueError(f"{path.name} innehåller orimliga höjder")
    raw_deltas = [b - a for a, b in zip(raw_elevations, raw_elevations[1:])]
    if max((abs(value) for value in raw_deltas), default=0) > 80:
        raise ValueError(f"{path.name} innehåller en orimlig höjdspik")

    elevations = _fill_small_elevation_gaps(coords)
    smoothed = _median_smooth(elevations)
    if sum(value is not None for value in smoothed) / len(smoothed) < 0.95:
        raise ValueError(f"{path.name} saknar tillräckligt säker höjd efter interpolation")
    distance_scale = float(official_distance) / raw_total
    cumulative_ascent = [0.0]
    cumulative_descent = [0.0]
    for previous, current in zip(smoothed, smoothed[1:]):
        delta = 0.0 if previous is None or current is None else current - previous
        cumulative_ascent.append(cumulative_ascent[-1] + max(0.0, delta))
        cumulative_descent.append(cumulative_descent[-1] + max(0.0, -delta))

    grades = []
    clipped_grades = 0
    for index, elevation in enumerate(smoothed):
        if elevation is None:
            grades.append(None)
            continue
        left, right = index, index
        while left > 0 and raw_distances[index] - raw_distances[left] < MIN_GRADE_SPAN_KM / 2:
            left -= 1
        while right < len(coords) - 1 and raw_distances[right] - raw_distances[index] < MIN_GRADE_SPAN_KM / 2:
            right += 1
        span = raw_distances[right] - raw_distances[left]
        if span < MIN_GRADE_SPAN_KM or smoothed[left] is None or smoothed[right] is None:
            grades.append(None)
            continue
        raw_grade = (smoothed[right] - smoothed[left]) / (span * 1000) * 100
        grade = max(-MAX_GRADE_PERCENT, min(MAX_GRADE_PERCENT, raw_grade))
        clipped_grades += int(grade != raw_grade)
        grades.append(grade)

    full_points = []
    for index, point in enumerate(coords):
        full_points.append([
            round(float(point[0]), 6),
            round(float(point[1]), 6),
            round(raw_distances[index] * distance_scale, 3),
            round(smoothed[index], 1) if smoothed[index] is not None else None,
            round(grades[index], 1) if grades[index] is not None else None,
            round(cumulative_ascent[index], 1),
            round(cumulative_descent[index], 1),
        ])
    full_points[-1][2] = float(official_distance)
    simplified_indices, measured_deviation = simplify_indices(full_points)
    high_index = max(range(len(smoothed)), key=lambda index: smoothed[index] if smoothed[index] is not None else -math.inf)
    simplified_indices = sorted(set(simplified_indices + [high_index]))
    points = [full_points[index] for index in simplified_indices]

    profile_step = max(1, math.ceil(len(full_points) / 650))
    profile_indices = sorted(set(range(0, len(full_points), profile_step)) | {len(full_points) - 1, high_index})
    elevation_profile = [
        [point[2], point[3], point[4], point[5], point[6]] for point in (full_points[index] for index in profile_indices)
    ]
    raw_ascent = sum(max(0.0, value) for value in raw_deltas)
    raw_descent = sum(max(0.0, -value) for value in raw_deltas)
    warnings = []
    max_gap_m = max(segment_distances, default=0) * 1000
    if max_gap_m > 250:
        warnings.append(f"Källspåret har ett glest intervall på {max_gap_m:.1f} m men inga orimliga ändpunkter.")
    return {
        "points": points,
        "elevation_profile": elevation_profile,
        "source_point_count": len(coords),
        "point_count": len(points),
        "raw_total_km": raw_total,
        "min_elevation_m": min(value for value in smoothed if value is not None),
        "max_elevation_m": max(value for value in smoothed if value is not None),
        "total_ascent_m": cumulative_ascent[-1],
        "total_descent_m": cumulative_descent[-1],
        "raw_ascent_m": raw_ascent,
        "raw_descent_m": raw_descent,
        "high_point": full_points[high_index],
        "max_geometry_gap_m": max_gap_m,
        "max_elevation_jump_m": max((abs(value) for value in raw_deltas), default=0),
        "elevation_coverage_pct": 100 * len(raw_elevations) / len(coords),
        "clipped_grade_points": clipped_grades,
        "max_deviation_m": measured_deviation,
        "warnings": warnings,
    }


def bounds(points):
    lats = [point[0] for point in points]
    lons = [point[1] for point in points]
    return [[min(lats), min(lons)], [max(lats), max(lons)]]


def point_at_distance(points, distance_km):
    distance_km = max(0.0, min(float(distance_km), float(points[-1][2])))
    if distance_km <= 0:
        return [points[0][0], points[0][1]]
    for previous, current in zip(points, points[1:]):
        if current[2] >= distance_km:
            span = current[2] - previous[2]
            ratio = 0.0 if span <= 0 else (distance_km - previous[2]) / span
            return [
                round(previous[0] + (current[0] - previous[0]) * ratio, 6),
                round(previous[1] + (current[1] - previous[1]) * ratio, 6),
            ]
    return [points[-1][0], points[-1][1]]


def read_gpx(path):
    """Read trkpt/rtept coordinates and optional elevation, namespace agnostic."""
    root = ET.parse(path).getroot()
    if root.tag.rsplit("}", 1)[-1].lower() != "gpx":
        raise ValueError(f"{path.name} har inte GPX som XML-rot")
    coords = []
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1].lower()
        if tag not in {"trkpt", "rtept"}:
            continue
        lat = element.attrib.get("lat")
        lon = element.attrib.get("lon")
        if lat is None or lon is None:
            continue
        elevation = next(
            (float(child.text) for child in element if child.tag.rsplit("}", 1)[-1].lower() == "ele" and child.text),
            None,
        )
        coords.append([float(lat), float(lon), elevation])
    if len(coords) < 2:
        raise ValueError(f"{path.name} innehåller färre än två GPX-punkter")
    return coords


def read_kmz(path):
    """Read the longest KML coordinate sequence and its optional altitude."""
    with zipfile.ZipFile(path) as archive:
        kml_name = next((name for name in archive.namelist() if name.lower().endswith(".kml")), None)
        if not kml_name:
            raise ValueError(f"{path.name} saknar KML-fil")
        root = ET.fromstring(archive.read(kml_name))
    sequences = []
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1].lower() != "coordinates" or not element.text:
            continue
        coords = []
        for value in element.text.split():
            parts = value.split(",")
            if len(parts) >= 2:
                altitude = float(parts[2]) if len(parts) >= 3 and parts[2] else None
                coords.append([float(parts[1]), float(parts[0]), altitude])
        if len(coords) >= 2:
            sequences.append(coords)
    if not sequences:
        raise ValueError(f"{path.name} saknar användbara koordinater")
    return max(sequences, key=len)


def project_checkpoints(checkpoints, points):
    """Project configured checkpoint distances onto the selected route geometry."""
    projected = []
    previous_distance = -math.inf
    for checkpoint in sorted(checkpoints, key=lambda item: float(item.get("distance_km") or 0)):
        distance = float(checkpoint.get("distance_km") or 0)
        if distance < previous_distance:
            raise ValueError("Kontrollernas ruttavstånd är inte stigande")
        previous_distance = distance
        key = checkpoint.get("key") or checkpoint.get("checkpoint_key")
        if key == "mora":
            key = "finish"
        name = checkpoint.get("name") or checkpoint.get("short") or key
        projected.append({
            "key": key,
            "name": name,
            "short": checkpoint.get("short") or name.replace("Start ", "").replace(" mål", ""),
            "distance_km": round(distance, 3),
            "coord": point_at_distance(points, distance),
        })
    return projected


def verified_route(
    *, route_id, name, years, official_distance, source_path, source_year,
    race_family, style, checkpoints, expected_start, expected_finish,
):
    data = build_gpx_route_data(source_path, official_distance, expected_start, expected_finish)
    high_point = data["high_point"]
    route = {
        "id": route_id,
        "route_version": route_id,
        "race_family": race_family,
        "name": name,
        "years": years,
        "official_distance_km": float(official_distance),
        "total_distance_km": round(data["raw_total_km"], 3),
        "gps_distance_km": round(data["raw_total_km"], 3),
        "source_file": source_path.relative_to(ROOT).as_posix(),
        "source_type": "verified-gpx",
        "source_year": int(source_year),
        "source_point_count": data["source_point_count"],
        "point_count": data["point_count"],
        "point_schema": POINT_SCHEMA,
        "geometry_quality": "verified-gpx",
        "geometry_note": "Verifierad GPX-geometri. Distansaxeln är normaliserad till loppets officiella distans.",
        "elevation_available": True,
        "elevation_note": "Höjdprofil från verifierad GPX; korta luckor interpoleras och en fempunkts median används mot enstaka spikar.",
        "elevation_profile_schema": [
            "distance_km", "elevation_m", "grade_percent",
            "cumulative_ascent_m", "cumulative_descent_m",
        ],
        "elevation_profile": data["elevation_profile"],
        "min_elevation_m": round(data["min_elevation_m"], 1),
        "max_elevation_m": round(data["max_elevation_m"], 1),
        "total_ascent_m": round(data["total_ascent_m"], 1),
        "total_descent_m": round(data["total_descent_m"], 1),
        "raw_ascent_m": round(data["raw_ascent_m"], 1),
        "raw_descent_m": round(data["raw_descent_m"], 1),
        "high_point": {
            "distance_km": high_point[2],
            "elevation_m": high_point[3],
            "coord": high_point[:2],
        },
        "processing": {
            "elevation_smoothing": "centered-median-5-points",
            "missing_elevation": "linear-only-for-bounded-gaps-up-to-8-points-and-0.5-km",
            "grade_min_span_m": int(MIN_GRADE_SPAN_KM * 1000),
            "grade_clip_percent": MAX_GRADE_PERCENT,
            "grade_clipped_points": data["clipped_grade_points"],
            "geometry_simplification": "ramer-douglas-peucker-equirectangular",
            "geometry_tolerance_m": GEOMETRY_TOLERANCE_M,
            "max_geometry_deviation_m": round(data["max_deviation_m"], 2),
        },
        "source_quality": {
            "elevation_coverage_pct": round(data["elevation_coverage_pct"], 3),
            "max_geometry_gap_m": round(data["max_geometry_gap_m"], 1),
            "max_elevation_jump_m": round(data["max_elevation_jump_m"], 1),
            "warnings": data["warnings"],
        },
        "style": style,
        "bounds": bounds(data["points"]),
        "checkpoints": project_checkpoints(checkpoints, data["points"]),
        "points": data["points"],
    }
    return route


def build_uv45_route(config):
    uv45_races = [
        race for race in config.get("races", [])
        if str(race.get("race_key", "")).startswith("ultravasan45-")
    ]
    if not uv45_races:
        return None
    race = max(uv45_races, key=lambda item: (int(item.get("year") or 0), str(item.get("race_key") or "")))
    if UV45_PRIMARY_GPX.exists():
        try:
            route = verified_route(
                route_id="ultravasan45-current",
                name="Ultravasan 45 – Oxberg till Mora",
                years={"from": min(r["year"] for r in uv45_races), "to": 2099},
                official_distance=float(race.get("distance_km") or 45.0),
                source_path=UV45_PRIMARY_GPX,
                source_year=2026,
                race_family="uv45",
                style={"color": "#d28b22", "dashArray": None, "label": "Ultravasan 45"},
                checkpoints=race.get("checkpoints", []),
                expected_start=[61.1263, 14.17957],
                expected_finish=[61.006997, 14.542826],
            )
            route["geometry_note"] = "Verifierad UV45-GPX 2026 används för geometri och höjd för samtliga år; kontrollmodellen kommer från respektive loppår."
            print(f"Använder {UV45_PRIMARY_GPX.name}: {route['source_point_count']} källpunkter till {route['point_count']} webbpunkter")
            return route
        except ValueError as error:
            print(f"VARNING: {error}. Befintlig UV45-rutt används som fallback.")

    if not UV45_KMZ.exists() and OUT_JSON.exists():
        existing = json.loads(OUT_JSON.read_text(encoding="utf-8")).get("routes", {}).get("ultravasan45-current")
        if existing:
            existing = dict(existing)
            existing["geometry_quality"] = "existing-registry-fallback"
            existing["geometry_note"] = "Verifierad GPX och KMZ saknas; befintligt genererat banlager behålls."
            return existing
    coords = read_kmz(UV45_KMZ)
    points, raw_total = cumulative(coords)
    official_distance = float(race.get("distance_km") or 45.0)
    points = normalize_distance(points, official_distance)
    elevation_profile = build_elevation_profile(coords, points)
    checkpoints = []
    for cp in sorted(race.get("checkpoints", []), key=lambda item: item["sequence_no"]):
        distance = float(cp.get("distance_km") or 0.0)
        key = "finish" if cp["checkpoint_key"] == "mora" else cp["checkpoint_key"]
        checkpoints.append({
            "key": key,
            "name": cp["name"],
            "short": cp["name"].replace("Start ", "").replace(" mål", ""),
            "distance_km": distance,
            "coord": point_at_distance(points, distance),
        })
    return {
        "id": "ultravasan45-current",
        "route_version": "ultravasan45-current",
        "race_family": "uv45",
        "name": "Ultravasan 45 – Oxberg till Mora",
        "years": {"from": min(r["year"] for r in uv45_races), "to": 2099},
        "official_distance_km": official_distance,
        "total_distance_km": round(raw_total, 3),
        "gps_distance_km": round(raw_total, 3),
        "point_count": len(points),
        "source_file": UV45_KMZ.name,
        "source_type": "fallback-kmz",
        "source_year": 2026,
        "geometry_quality": "uploaded-gps",
        "geometry_note": "GPS-geometri från den uppladdade UV45-KMZ-filen. Distansaxeln är normaliserad till officiell distans.",
        "elevation_available": bool(elevation_profile),
        "elevation_note": (
            "Höjddata extraherad reproducerbart från UV45-KMZ-filen."
            if elevation_profile
            else "KMZ-filens höjdkolumn är ofullständig och innehåller orimliga värden. Höjddata används därför inte."
        ),
        "elevation_profile": elevation_profile,
        "style": {"color": "#d28b22", "dashArray": None, "label": "Ultravasan 45"},
        "bounds": bounds(points),
        "checkpoints": checkpoints,
        "points": points,
    }


def orient_like_current(coords, current_points):
    """Reverse historical GPX when its endpoint is closer to Sälen than its start."""
    current_start = current_points[0]
    direct = hav(coords[0], current_start)
    reversed_distance = hav(coords[-1], current_start)
    return list(reversed(coords)) if reversed_distance < direct else coords


def make_old_checkpoints(current, old_points):
    # The published course-length difference is used for the historical
    # control-distance model. Coordinates are always projected onto the actual
    # selected old route, preventing markers from floating off the line.
    offset = float(current["official_distance_km"]) - OLD_TOTAL
    checkpoints = []
    for checkpoint in current["checkpoints"]:
        distance = 0.0 if checkpoint["distance_km"] == 0 else max(0.0, checkpoint["distance_km"] - offset)
        if checkpoint["key"] == "finish":
            distance = OLD_TOTAL
        checkpoints.append(
            {
                **checkpoint,
                "distance_km": round(distance, 3),
                "coord": point_at_distance(old_points, distance),
            }
        )
    return checkpoints


def build_fallback_old(current):
    points = current["points"]
    start = points[0]
    target_delta = float(current["official_distance_km"]) - OLD_TOTAL
    join = min(points[1:900], key=lambda point: abs((point[2] - hav(start, point)) - target_delta))
    join_index = points.index(join)
    head = [bezier(start, join, index / 80) for index in range(81)]
    tail = [[point[0], point[1]] for point in points[join_index + 1 :]]
    old_points, raw_total = cumulative(head + tail)
    old_points = normalize_distance(old_points, OLD_TOTAL)
    return old_points, raw_total, join


def write_reference_gpx(old_points, geometry_note):
    gpx = Element(
        "gpx",
        {
            "version": "1.1",
            "creator": "Ultravasan analysverktyg",
            "xmlns": "http://www.topografix.com/GPX/1/1",
        },
    )
    metadata = SubElement(gpx, "metadata")
    SubElement(metadata, "name").text = "Ultravasan 90 2014–2022 reference route"
    SubElement(metadata, "desc").text = geometry_note + " Source reference: " + OLD_SOURCE
    track = SubElement(gpx, "trk")
    SubElement(track, "name").text = "Ultravasan 90 pre-2023 reference"
    segment = SubElement(track, "trkseg")
    for lat, lon, _ in old_points:
        SubElement(segment, "trkpt", {"lat": str(lat), "lon": str(lon)})
    ElementTree(gpx).write(REFERENCE_OLD_GPX, encoding="utf-8", xml_declaration=True)


def main():
    parser = argparse.ArgumentParser(description="Bygg årskorrekta kartlager för Ultravasan 90")
    parser.add_argument(
        "--require-exact-old",
        action="store_true",
        help="Avbryt om source/Ultravasan90-2014-2022.gpx saknas",
    )
    parser.add_argument("--config", type=Path, default=RACE_CONFIG)
    parser.add_argument("--out-json", type=Path, default=OUT_JSON)
    parser.add_argument("--out-js", type=Path, default=OUT_JS)
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))

    current = json.loads(CURRENT_ROUTE_JSON.read_text(encoding="utf-8"))
    old = None
    if OLD_PRIMARY_GPX.exists():
        try:
            old = verified_route(
                route_id="ultravasan90-pre2023",
                name="Ultravasan 90 – äldre sträckning",
                years={"from": 2014, "to": 2022},
                official_distance=OLD_TOTAL,
                source_path=OLD_PRIMARY_GPX,
                source_year=2022,
                race_family="uv90",
                style={"color": "#7c3aed", "dashArray": "10 8", "label": "2014–2022"},
                checkpoints=make_old_checkpoints(current, current["points"]),
                expected_start=current["points"][0],
                expected_finish=current["points"][-1],
            )
            old["source_reference"] = OLD_SOURCE
            old["source_note"] = "Verifierad Ultravasan 90-rutt för 2022."
            print(f"Använder {OLD_PRIMARY_GPX.name}: {old['source_point_count']} källpunkter till {old['point_count']} webbpunkter")
        except ValueError as error:
            print(f"VARNING: {error}. Befintlig äldre rutt används som fallback.")
    if old is None:
        if EXACT_OLD_GPX.exists():
            coords = orient_like_current(read_gpx(EXACT_OLD_GPX), current["points"])
            old_points, raw_total = cumulative(coords)
            old_points = normalize_distance(old_points, OLD_TOTAL)
            old_elevation_profile = build_elevation_profile(coords, old_points)
            geometry_quality = "verified-uploaded-gpx"
            geometry_note = "Fallback-GPX från source-katalogen. Distansaxeln är normaliserad till 90,173 km."
            source_file = EXACT_OLD_GPX.name
        else:
            if args.require_exact_old:
                raise SystemExit("Verifierad äldre GPX saknas")
            old_points, raw_total, join = build_fallback_old(current)
            old_elevation_profile = []
            geometry_quality = "reference-reconstruction"
            geometry_note = "Rekonstruerad äldre referensrutt eftersom verifierad GPX saknas."
            source_file = REFERENCE_OLD_GPX.name
            write_reference_gpx(old_points, geometry_note)
        old = {
            "id": "ultravasan90-pre2023", "route_version": "ultravasan90-pre2023", "race_family": "uv90",
            "name": "Ultravasan 90 – äldre sträckning", "years": {"from": 2014, "to": 2022},
            "official_distance_km": OLD_TOTAL, "total_distance_km": round(raw_total, 3), "gps_distance_km": round(raw_total, 3),
            "point_count": len(old_points), "source_file": source_file, "source_type": "fallback",
            "source_year": 2022, "geometry_quality": geometry_quality, "geometry_note": geometry_note,
            "elevation_available": bool(old_elevation_profile), "elevation_profile": old_elevation_profile,
            "style": {"color": "#7c3aed", "dashArray": "10 8", "label": "2014–2022"},
            "bounds": bounds(old_points), "checkpoints": make_old_checkpoints(current, old_points), "points": old_points,
        }

    post = None
    if CURRENT_PRIMARY_GPX.exists():
        try:
            post = verified_route(
                route_id="ultravasan90-post2023",
                name="Ultravasan 90 – sträckning från 2023",
                years={"from": 2023, "to": 2099},
                official_distance=float(current["official_distance_km"]),
                source_path=CURRENT_PRIMARY_GPX,
                source_year=2024,
                race_family="uv90",
                style={"color": "#176d53", "dashArray": None, "label": "2023–"},
                checkpoints=current["checkpoints"],
                expected_start=current["points"][0],
                expected_finish=current["points"][-1],
            )
            post["historical_note"] = "Från 2023 används den längre inledande sträckningen; geometri och höjd kommer från verifierad GPX 2024."
            print(f"Använder {CURRENT_PRIMARY_GPX.name}: {post['source_point_count']} källpunkter till {post['point_count']} webbpunkter")
        except ValueError as error:
            print(f"VARNING: {error}. Befintlig post-2023-rutt används som fallback.")
    if post is None:
        current_elevation_profile = []
        if CURRENT_KMZ.exists():
            current_coords = orient_like_current(read_kmz(CURRENT_KMZ), current["points"])
            current_distance_points, _ = cumulative(current_coords)
            current_distance_points = normalize_distance(current_distance_points, float(current["official_distance_km"]))
            current_elevation_profile = build_elevation_profile(current_coords, current_distance_points)
        post = {
            **current,
            "id": "ultravasan90-post2023", "route_version": "ultravasan90-post2023", "race_family": "uv90",
            "years": {"from": 2023, "to": 2099}, "source_type": "fallback", "source_year": 2026,
            "geometry_quality": "uploaded-gps", "geometry_note": "Befintlig KMZ-baserad fallbackgeometri.",
            "elevation_available": bool(current_elevation_profile), "elevation_profile": current_elevation_profile,
            "style": {"color": "#176d53", "dashArray": None, "label": "2023–"},
        }
    uv45 = build_uv45_route(config)
    routes = {old["id"]: old, post["id"]: post}
    route_for_race = [
        {"race_key_prefix": "ultravasan90-", "year_from": 2014, "year_to": 2022, "route_id": old["id"]},
        {"race_key_prefix": "ultravasan90-", "year_from": 2023, "year_to": 2099, "route_id": post["id"]},
    ]
    if uv45:
        routes[uv45["id"]] = uv45
        route_for_race.insert(0, {"race_key_prefix": "ultravasan45-", "route_id": uv45["id"]})
    registry = {
        "default_route_id": post["id"],
        "route_for_year": [
            {"from": 2014, "to": 2022, "route_id": old["id"]},
            {"from": 2023, "to": 2099, "route_id": post["id"]},
        ],
        "route_for_race": route_for_race,
        "routes": routes,
    }

    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_js.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")
    args.out_js.write_text(
        "window.ULTRAVASAN_ROUTES = "
        + json.dumps(registry, ensure_ascii=False, separators=(",", ":"))
        + ";\nwindow.ULTRAVASAN_ROUTE = window.ULTRAVASAN_ROUTES.routes[window.ULTRAVASAN_ROUTES.default_route_id];\n",
        encoding="utf-8",
    )
    print(f"Skrev {args.out_json} och {args.out_js}: {', '.join(routes)}")


if __name__ == "__main__":
    main()
