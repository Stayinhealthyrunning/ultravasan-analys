#!/usr/bin/env python3
"""Build one browser route registry for configured Ultravasan 90/45 races.

The indented JSON file is the canonical generated registry. The JavaScript
file is a browser wrapper containing the same parsed payload.

Verified GPX sources
--------------------
The three GPX files in ``data/routes`` are primary reproducible source-year
geometries: UV90 has verified 2022 and 2024 tracks and UV45 has a verified 2026
track. Other RaceEditions may use these as display references only; display
geometry never establishes whole-course performance comparability.

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
COURSE_CONFIG = ROOT / "config/course_versions.json"
EDITION_ROUTE_CONFIG = ROOT / "config/edition_routes.json"
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



def _percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(float(value) for value in values)
    index = min(len(ordered) - 1, max(0, math.ceil(len(ordered) * fraction) - 1))
    return ordered[index]


def _cumulative_metres(coords):
    distances = [0.0]
    for previous, current in zip(coords, coords[1:]):
        distances.append(distances[-1] + hav(previous, current) * 1000)
    return distances


def _transfer_missing_elevation(target_coords, donor_coords, max_distance_m=50.0):
    """Fill missing elevations from a nearby donor route, never replacing observed values.

    A spatial match must be within the configured distance and near the same
    normalized along-route progress. The donor is accepted only when it
    reproduces the target's already observed elevations with strong accuracy.
    """
    if max_distance_m <= 0:
        raise ValueError("Elevation donor match distance must be positive")
    donor_present = [point[2] for point in donor_coords if len(point) > 2 and point[2] is not None]
    if len(donor_present) / len(donor_coords) < 0.95:
        raise ValueError("Elevation donor has less than 95% elevation coverage")
    if donor_present and (min(donor_present) < -50 or max(donor_present) > 1000):
        raise ValueError("Elevation donor contains implausible elevations")

    reference_lat = sum(point[0] for point in target_coords + donor_coords) / (len(target_coords) + len(donor_coords))
    scale_x = 111_320.0 * math.cos(math.radians(reference_lat))
    scale_y = 110_540.0

    def xy(point):
        return point[1] * scale_x, point[0] * scale_y

    target_xy = [xy(point) for point in target_coords]
    donor_xy = [xy(point) for point in donor_coords]
    target_progress = _cumulative_metres(target_coords)
    donor_progress = _cumulative_metres(donor_coords)
    target_total = target_progress[-1]
    donor_total = donor_progress[-1]
    if target_total <= 0 or donor_total <= 0:
        raise ValueError("Elevation target/donor route has zero length")

    cell_m = max(25.0, float(max_distance_m))
    grid = {}
    for index, (a, b) in enumerate(zip(donor_xy, donor_xy[1:])):
        if donor_coords[index][2] is None or donor_coords[index + 1][2] is None:
            continue
        min_x = math.floor((min(a[0], b[0]) - max_distance_m) / cell_m)
        max_x = math.floor((max(a[0], b[0]) + max_distance_m) / cell_m)
        min_y = math.floor((min(a[1], b[1]) - max_distance_m) / cell_m)
        max_y = math.floor((max(a[1], b[1]) + max_distance_m) / cell_m)
        for cell_x in range(min_x, max_x + 1):
            for cell_y in range(min_y, max_y + 1):
                grid.setdefault((cell_x, cell_y), []).append(index)

    progress_guard_m = max(500.0, min(1500.0, donor_total * 0.03))

    def match(index):
        qx, qy = target_xy[index]
        expected_progress = target_progress[index] / target_total * donor_total
        candidates = grid.get((math.floor(qx / cell_m), math.floor(qy / cell_m)), ())
        best = None
        for segment_index in candidates:
            ax, ay = donor_xy[segment_index]
            bx, by = donor_xy[segment_index + 1]
            vx, vy = bx - ax, by - ay
            length_sq = vx * vx + vy * vy
            ratio = 0.0 if length_sq <= 0 else ((qx - ax) * vx + (qy - ay) * vy) / length_sq
            ratio = max(0.0, min(1.0, ratio))
            px, py = ax + ratio * vx, ay + ratio * vy
            distance_m = math.hypot(qx - px, qy - py)
            if distance_m > max_distance_m:
                continue
            segment_length = math.sqrt(length_sq)
            matched_progress = donor_progress[segment_index] + ratio * segment_length
            if abs(matched_progress - expected_progress) > progress_guard_m:
                continue
            left = float(donor_coords[segment_index][2])
            right = float(donor_coords[segment_index + 1][2])
            elevation = left + ratio * (right - left)
            if best is None or distance_m < best["distance_m"]:
                best = {
                    "distance_m": distance_m,
                    "elevation_m": elevation,
                    "donor_progress_m": matched_progress,
                }
        return best

    matches = [match(index) for index in range(len(target_coords))]
    observed_indices = [index for index, point in enumerate(target_coords) if point[2] is not None]
    observed_matches = [(index, matches[index]) for index in observed_indices if matches[index] is not None]
    if len(observed_indices) < 20:
        raise ValueError("Elevation transfer needs at least 20 observed target elevations for validation")
    observed_match_pct = 100 * len(observed_matches) / len(observed_indices)
    errors = [
        abs(float(target_coords[index][2]) - matched["elevation_m"])
        for index, matched in observed_matches
    ]
    median_error = _percentile(errors, 0.5)
    p95_error = _percentile(errors, 0.95)
    if observed_match_pct < 90 or median_error is None or p95_error is None or median_error > 5 or p95_error > 10:
        raise ValueError(
            "Elevation donor validation failed: "
            f"{observed_match_pct:.1f}% matched, median error {median_error}, p95 error {p95_error}"
        )

    augmented = [list(point) for point in target_coords]
    transferred = 0
    transfer_distances = []
    missing_before = sum(point[2] is None for point in target_coords)
    for index, point in enumerate(augmented):
        if point[2] is not None or matches[index] is None:
            continue
        point[2] = matches[index]["elevation_m"]
        transferred += 1
        transfer_distances.append(matches[index]["distance_m"])

    return augmented, {
        "method": "spatial-nearest-segment-with-progress-guard",
        "max_match_distance_m": float(max_distance_m),
        "progress_guard_m": round(progress_guard_m, 1),
        "observed_target_points": len(observed_indices),
        "observed_validation_matches": len(observed_matches),
        "observed_validation_match_pct": round(observed_match_pct, 3),
        "validation_median_abs_error_m": round(median_error, 3),
        "validation_p95_abs_error_m": round(p95_error, 3),
        "missing_before_transfer": missing_before,
        "transferred_points": transferred,
        "transferred_missing_pct": round(100 * transferred / missing_before, 3) if missing_before else 100.0,
        "median_transfer_distance_m": round(_percentile(transfer_distances, 0.5) or 0.0, 3),
        "p95_transfer_distance_m": round(_percentile(transfer_distances, 0.95) or 0.0, 3),
        "unmatched_after_transfer": missing_before - transferred,
    }


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


def build_gpx_route_data(
    path, official_distance, expected_start, expected_finish,
    elevation_donor_path=None, elevation_max_match_distance_m=50.0,
):
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

    original_elevations = [point[2] for point in coords if len(point) > 2 and point[2] is not None]
    original_coverage_pct = 100 * len(original_elevations) / len(coords)
    if original_elevations and (min(original_elevations) < -50 or max(original_elevations) > 1000):
        raise ValueError(f"{path.name} innehåller orimliga höjder")

    elevation_transfer = None
    if elevation_donor_path is not None:
        donor_coords = read_gpx(elevation_donor_path)
        coords, elevation_transfer = _transfer_missing_elevation(
            coords, donor_coords, max_distance_m=elevation_max_match_distance_m,
        )

    elevations = _fill_small_elevation_gaps(coords)
    smoothed = _median_smooth(elevations)
    final_coverage_pct = 100 * sum(value is not None for value in smoothed) / len(smoothed)
    if final_coverage_pct < 95:
        raise ValueError(f"{path.name} saknar tillräckligt säker höjd efter donoröverföring/interpolation")
    raw_elevations = [value for value in elevations if value is not None]
    raw_deltas = [
        current - previous
        for previous, current in zip(elevations, elevations[1:])
        if previous is not None and current is not None
    ]
    if max((abs(value) for value in raw_deltas), default=0) > 80:
        raise ValueError(f"{path.name} innehåller en orimlig höjdspik")
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
        "elevation_coverage_pct": final_coverage_pct,
        "elevation_original_coverage_pct": original_coverage_pct,
        "elevation_transfer": elevation_transfer,
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
    elevation_donor_path=None, elevation_donor_year=None, elevation_donor_provider=None,
    elevation_max_match_distance_m=50.0,
):
    data = build_gpx_route_data(
        source_path, official_distance, expected_start, expected_finish,
        elevation_donor_path=elevation_donor_path,
        elevation_max_match_distance_m=elevation_max_match_distance_m,
    )
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
        "elevation_note": (
            "Höjdprofil från årsspårets observerade höjd kompletterad geografiskt från verifierat donorspår; "
            "endast matchningar inom angiven radie och samma ungefärliga banprogress accepteras."
            if data.get("elevation_transfer")
            else "Höjdprofil från verifierad GPX; korta luckor interpoleras och en fempunkts median används mot enstaka spikar."
        ),
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
            "missing_elevation": (
                "spatial-donor-transfer-then-linear-only-for-bounded-gaps-up-to-8-points-and-0.5-km"
                if data.get("elevation_transfer")
                else "linear-only-for-bounded-gaps-up-to-8-points-and-0.5-km"
            ),
            "grade_min_span_m": int(MIN_GRADE_SPAN_KM * 1000),
            "grade_clip_percent": MAX_GRADE_PERCENT,
            "grade_clipped_points": data["clipped_grade_points"],
            "geometry_simplification": "ramer-douglas-peucker-equirectangular",
            "geometry_tolerance_m": GEOMETRY_TOLERANCE_M,
            "max_geometry_deviation_m": round(data["max_deviation_m"], 2),
        },
        "source_quality": {
            "elevation_coverage_pct": round(data["elevation_coverage_pct"], 3),
            "elevation_original_coverage_pct": round(data["elevation_original_coverage_pct"], 3),
            "max_geometry_gap_m": round(data["max_geometry_gap_m"], 1),
            "max_elevation_jump_m": round(data["max_elevation_jump_m"], 1),
            "warnings": data["warnings"],
        },
        "elevation_provenance": (
            {
                **data["elevation_transfer"],
                "donor_file": elevation_donor_path.relative_to(ROOT).as_posix(),
                "donor_year": int(elevation_donor_year) if elevation_donor_year is not None else None,
                "donor_provider": elevation_donor_provider,
            }
            if data.get("elevation_transfer") else None
        ),
        "style": style,
        "bounds": bounds(data["points"]),
        "checkpoints": project_checkpoints(checkpoints, data["points"]),
        "points": data["points"],
    }
    return route


def build_uv45_route(course_config):
    route_id = "ultravasan45-current"
    model_id = course_config.get("route_build_models", {}).get(route_id)
    model = course_config.get("courses", {}).get(model_id)
    if not model:
        return None
    if model.get("race_family") != "uv45" or model.get("display_route_id") != route_id:
        raise ValueError(f"Invalid explicit route build model {model_id!r} for {route_id}")
    checkpoints = model.get("checkpoint_catalog") or []
    if not checkpoints:
        raise ValueError(f"Route build model {model_id!r} has no checkpoint catalog")
    if UV45_PRIMARY_GPX.exists():
        try:
            route = verified_route(
                route_id=route_id,
                name="Ultravasan 45 – referensgeometri 2026",
                years={"from": 2014, "to": 2099},
                official_distance=float(checkpoints[-1]["distance_km"]),
                source_path=UV45_PRIMARY_GPX,
                source_year=2026,
                race_family="uv45",
                style={"color": "#d28b22", "dashArray": None, "label": "Referens 2026"},
                checkpoints=checkpoints,
                expected_start=[61.1263, 14.17957],
                expected_finish=[61.006997, 14.542826],
            )
            route["geometry_note"] = "Verifierad GPX-geometri för loppåret 2026. När denna geometri visas för tidigare loppår är den endast en kartografisk referens och utgör inte bevis för exakt årssträckning eller whole-course-jämförbarhet."
            route["historical_note"] = "Källåret är 2026. Bindningar till tidigare Ultravasan 45-år används endast som visningsreferens tills årsvis geometri har verifierats."
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
        "name": "Ultravasan 45 – referensgeometri 2026",
        "years": {"from": min(r["year"] for r in uv45_races), "to": 2099},
        "official_distance_km": official_distance,
        "total_distance_km": round(raw_total, 3),
        "gps_distance_km": round(raw_total, 3),
        "point_count": len(points),
        "source_file": UV45_KMZ.name,
        "source_type": "fallback-kmz",
        "source_year": 2026,
        "geometry_quality": "uploaded-gps",
        "geometry_note": "GPS-geometri för källåret 2026. När den visas för tidigare loppår är den endast en kartografisk referens.",
        "elevation_available": bool(elevation_profile),
        "elevation_note": (
            "Höjddata extraherad reproducerbart från UV45-KMZ-filen."
            if elevation_profile
            else "KMZ-filens höjdkolumn är ofullständig och innehåller orimliga värden. Höjddata används därför inte."
        ),
        "elevation_profile": elevation_profile,
        "style": {"color": "#d28b22", "dashArray": None, "label": "Referens 2026"},
        "bounds": bounds(points),
        "checkpoints": checkpoints,
        "points": points,
    }


def build_edition_routes(config, course_config, routes):
    """Build explicitly sourced annual display routes without changing CourseVersions."""
    route_config = json.loads(EDITION_ROUTE_CONFIG.read_text(encoding="utf-8"))
    if route_config.get("schema_version") != 1:
        raise ValueError("Unsupported config/edition_routes.json schema")
    races = {race["race_key"]: race for race in config.get("races", [])}
    courses = course_config.get("courses", {})
    overrides = route_config.get("editions", {})
    unknown = set(overrides) - set(races)
    if unknown:
        raise ValueError(f"Unknown RaceEdition route overrides: {sorted(unknown)}")
    for race_key, spec in overrides.items():
        race = races[race_key]
        year, family = int(race["year"]), race["race_family"]
        route_id = spec.get("display_route_id")
        if not route_id or int(spec.get("source_year", -1)) != year:
            raise ValueError(f"{race_key}: an annual route override must declare its exact source year")
        if "prebuilt_route_file" in spec:
            route_path = ROOT / spec["prebuilt_route_file"]
            route = json.loads(route_path.read_text(encoding="utf-8"))
            if route.get("source_year") != year or not route.get("points") or len(route["points"]) < 2:
                raise ValueError(f"{race_key}: prebuilt route year/geometry does not match the RaceEdition")
            route = dict(route)
            route["id"] = route_id
            route["route_version"] = route_id
            route["race_family"] = family
            route["years"] = {"from": year, "to": year}
            route["source_file"] = spec["source_file"]
            route["source_type"] = "official-organizer-gps"
            route["source_provider"] = spec.get("source_provider")
            route["source_url"] = spec.get("source_url")
            route["geometry_quality"] = "official-organizer-gps"
            route["source_point_count"] = int(route.get("point_count", len(route["points"])))
            route["point_schema"] = ["lat", "lon", "distance_km"]
            route["elevation_available"] = False
            route["elevation_note"] = "The source KMZ-derived route contains no per-point elevation values; no profile is inferred."
            route["style"] = {"color": "#176d53", "dashArray": None, "label": f"Officiell GPS {year}"}
            route.setdefault("geometry_note", f"Officiell årsspecifik GPS-geometri från {spec.get('source_provider', 'källan')}.")
        else:
            source_path = ROOT / spec["source_file"]
            if not source_path.is_file():
                raise ValueError(f"{race_key}: annual route source is missing: {spec['source_file']}")
            reference_id = courses[race["course_version_id"]]["display_route_id"]
            reference = routes.get(reference_id)
            if not reference or reference.get("race_family") != family:
                raise ValueError(f"{race_key}: no same-family reference geometry for endpoint checks")
            color = "#8056a8" if family == "uv90" else "#d28b22"
            elevation_transfer = spec.get("elevation_transfer") or {}
            donor_file = elevation_transfer.get("donor_file")
            donor_path = ROOT / donor_file if donor_file else None
            if donor_path is not None and not donor_path.is_file():
                raise ValueError(f"{race_key}: elevation donor is missing: {donor_file}")
            route = verified_route(
                route_id=route_id,
                name=f"{race['name']} – verifierad geometri {year}",
                years={"from": year, "to": year},
                official_distance=float(race["distance_km"]),
                source_path=source_path,
                source_year=year,
                race_family=family,
                style={"color": color, "dashArray": None, "label": f"GPS {year}"},
                checkpoints=race.get("checkpoints", []),
                expected_start=reference["points"][0],
                expected_finish=reference["points"][-1],
                elevation_donor_path=donor_path,
                elevation_donor_year=elevation_transfer.get("donor_year"),
                elevation_donor_provider=elevation_transfer.get("donor_provider"),
                elevation_max_match_distance_m=float(elevation_transfer.get("max_match_distance_m", 50.0)),
            )
            route["source_provider"] = spec.get("source_provider")
            route["source_url"] = spec.get("source_url")
            route["external_id"] = spec.get("external_id")
            for field in ("source_http_status", "source_content_type", "source_fetched_at_utc",
                          "source_page_sha256", "candidate_gpx_sha256"):
                if spec.get(field) is not None:
                    route[field] = spec[field]
            route["geometry_note"] = (
                f"Årsspecifik {spec.get('source_provider', 'GPX')}-geometri för {year}. "
                "Visningsrutt endast; den fastställer inte whole-course-jämförbarhet. "
                f"Källa: {spec.get('source_url', 'lokal GPX')}"
            )
            route["historical_note"] = "Exakt geometri för angivet RaceEdition-år; andra år använder sina egna tilldelningar eller referensgeometri."
        if route.get("id") != route_id or route.get("race_family") != family or route.get("source_year") != year:
            raise ValueError(f"{race_key}: generated route does not preserve its declared identity")
        routes[route_id] = route
    return overrides


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
    parser.add_argument("--course-config", type=Path, default=COURSE_CONFIG)
    parser.add_argument("--out-json", type=Path, default=OUT_JSON)
    parser.add_argument("--out-js", type=Path, default=OUT_JS)
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    course_config = json.loads(args.course_config.read_text(encoding="utf-8"))

    current = json.loads(CURRENT_ROUTE_JSON.read_text(encoding="utf-8"))
    old = None
    if OLD_PRIMARY_GPX.exists():
        try:
            old = verified_route(
                route_id="ultravasan90-pre2023",
                name="Ultravasan 90 – referensgeometri 2022",
                years={"from": 2014, "to": 2022},
                official_distance=OLD_TOTAL,
                source_path=OLD_PRIMARY_GPX,
                source_year=2022,
                race_family="uv90",
                style={"color": "#7c3aed", "dashArray": "10 8", "label": "Referens 2022"},
                checkpoints=make_old_checkpoints(current, current["points"]),
                expected_start=current["points"][0],
                expected_finish=current["points"][-1],
            )
            old["source_reference"] = OLD_SOURCE
            old["source_note"] = "Verifierad Ultravasan 90-rutt för 2022."
            old["geometry_note"] = "Verifierad GPX-geometri för loppåret 2022. När denna geometri visas för andra loppår är den endast en kartografisk referens och utgör inte bevis för exakt årssträckning eller whole-course-jämförbarhet."
            old["historical_note"] = "Källåret är 2022. Bindningar till 2014–2019 används endast som visningsreferens tills årsvis geometri har verifierats."
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
            "name": "Ultravasan 90 – referensgeometri 2022", "years": {"from": 2014, "to": 2022},
            "official_distance_km": OLD_TOTAL, "total_distance_km": round(raw_total, 3), "gps_distance_km": round(raw_total, 3),
            "point_count": len(old_points), "source_file": source_file, "source_type": "fallback",
            "source_year": 2022, "geometry_quality": geometry_quality, "geometry_note": geometry_note,
            "elevation_available": bool(old_elevation_profile), "elevation_profile": old_elevation_profile,
            "style": {"color": "#7c3aed", "dashArray": "10 8", "label": "Referens 2022"},
            "bounds": bounds(old_points), "checkpoints": make_old_checkpoints(current, old_points), "points": old_points,
        }

    post = None
    if CURRENT_PRIMARY_GPX.exists():
        try:
            post = verified_route(
                route_id="ultravasan90-post2023",
                name="Ultravasan 90 – referensgeometri 2024",
                years={"from": 2023, "to": 2099},
                official_distance=float(current["official_distance_km"]),
                source_path=CURRENT_PRIMARY_GPX,
                source_year=2024,
                race_family="uv90",
                style={"color": "#176d53", "dashArray": None, "label": "Referens 2024"},
                checkpoints=current["checkpoints"],
                expected_start=current["points"][0],
                expected_finish=current["points"][-1],
            )
            post["geometry_note"] = "Verifierad GPX-geometri för loppåret 2024. När denna geometri visas för 2023, 2025 eller 2026 är den endast en kartografisk referens och utgör inte bevis för exakt årssträckning eller whole-course-jämförbarhet."
            post["historical_note"] = "Källåret är 2024. Extern evidens dokumenterar dessutom en tillfällig omläggning 2024; bindningar till andra år är därför uttryckligen reference-only tills årsvis geometri har verifierats."
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
            "style": {"color": "#176d53", "dashArray": None, "label": "Referens 2026"},
        }
    uv45 = build_uv45_route(course_config)
    routes = {old["id"]: old, post["id"]: post}
    if uv45:
        routes[uv45["id"]] = uv45
    annual_overrides = build_edition_routes(config, course_config, routes)
    courses = course_config.get("courses", {})
    route_for_edition = {}
    edition_route_contracts = {}
    for race in config.get("races", []):
        race_key = race.get("race_key")
        course_id = race.get("course_version_id")
        course = courses.get(course_id)
        if not race_key or not course:
            raise ValueError(f"RaceEdition {race_key!r} has unknown CourseVersion {course_id!r}")
        route_override = annual_overrides.get(race_key, {})
        route_id = route_override.get("display_route_id", course.get("display_route_id"))
        if route_id not in routes:
            raise ValueError(f"RaceEdition {race_key!r} has unknown display route {route_id!r}")
        display_route = routes[route_id]
        if display_route.get("race_family") != race.get("race_family"):
            raise ValueError(f"RaceEdition {race_key!r} route family mismatch for {route_id!r}")
        route_for_edition[race_key] = route_id
        source_year = display_route.get("source_year")
        exact_display_geometry = source_year is not None and int(source_year) == int(race.get("year"))
        edition_route_contracts[race_key] = {
            "display_route_id": route_id,
            "display_geometry_usage": "exact-source-year" if exact_display_geometry else "reference-only",
            "display_geometry_source_year": source_year,
            "course_version_id": course_id,
            "whole_course_comparison_group": race.get("whole_course_comparison_group"),
        }
    registry = {
        "route_for_edition": route_for_edition,
        "edition_route_contracts": edition_route_contracts,
        "routes": routes,
    }

    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_js.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    args.out_js.write_text(
        "window.ULTRAVASAN_ROUTES = "
        + json.dumps(registry, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"Skrev {args.out_json} och {args.out_js}: {', '.join(routes)}")


if __name__ == "__main__":
    main()
