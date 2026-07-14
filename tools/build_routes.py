#!/usr/bin/env python3
"""Build one browser route registry for configured Ultravasan 90/45 races.

The indented JSON file is the canonical generated registry. The JavaScript
file is a browser wrapper containing the same parsed payload.

Preferred old-course source
---------------------------
If ``source/Ultravasan90-2014-2022.gpx`` exists, its track/route points are
used directly.  This lets a verified historical GPX replace the bundled
reference reconstruction without changing any code.

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
RACE_CONFIG = ROOT / "config/races.json"
OLD_TOTAL = 90.173
OLD_SOURCE = "https://www.plotaroute.com/route/1942022"


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


def build_uv45_route(config):
    uv45_races = [
        race for race in config.get("races", [])
        if str(race.get("race_key", "")).startswith("ultravasan45-")
    ]
    if not uv45_races:
        return None
    race = max(uv45_races, key=lambda item: (int(item.get("year") or 0), str(item.get("race_key") or "")))
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
        "name": "Ultravasan 45 – Oxberg till Mora",
        "years": {"from": min(r["year"] for r in uv45_races), "to": 2099},
        "official_distance_km": official_distance,
        "gps_distance_km": round(raw_total, 3),
        "point_count": len(points),
        "source_file": UV45_KMZ.name,
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
    current_elevation_profile = []
    if CURRENT_KMZ.exists():
        current_coords = orient_like_current(read_kmz(CURRENT_KMZ), current["points"])
        current_distance_points, _ = cumulative(current_coords)
        current_distance_points = normalize_distance(
            current_distance_points,
            float(current["official_distance_km"]),
        )
        current_elevation_profile = build_elevation_profile(current_coords, current_distance_points)

    if EXACT_OLD_GPX.exists():
        coords = orient_like_current(read_gpx(EXACT_OLD_GPX), current["points"])
        old_points, raw_total = cumulative(coords)
        old_points = normalize_distance(old_points, OLD_TOTAL)
        old_elevation_profile = build_elevation_profile(coords, old_points)
        geometry_quality = "verified-uploaded-gpx"
        geometry_note = (
            "GPS-geometri från den verifierade historiska filen "
            "source/Ultravasan90-2014-2022.gpx. Distansaxeln är normaliserad till 90,173 km."
        )
        source_file = EXACT_OLD_GPX.name
        print(f"Använder verifierad äldre GPX: {source_file}, {len(old_points)} punkter, rå GPS-längd {raw_total:.3f} km")
    else:
        if args.require_exact_old:
            raise SystemExit(
                "Verifierad äldre GPX saknas: source/Ultravasan90-2014-2022.gpx"
            )
        old_points, raw_total, join = build_fallback_old(current)
        old_elevation_profile = []
        geometry_quality = "reference-reconstruction"
        geometry_note = (
            "Referenslagret använder 2022-ruttens publicerade längd och den gemensamma "
            "Vasaloppsarenan. Första delen före återanslutningen är rekonstruerad eftersom "
            "originalfilens koordinater inte kunde paketeras automatiskt."
        )
        source_file = REFERENCE_OLD_GPX.name
        write_reference_gpx(old_points, geometry_note)
        print(
            f"Använder referensrekonstruktion; återanslutning vid moderna km {join[2]:.3f}, "
            f"{len(old_points)} punkter, 90.173 km"
        )

    old = {
        "id": "ultravasan90-pre2023",
        "name": "Ultravasan 90 – äldre sträckning",
        "years": {"from": 2014, "to": 2022},
        "official_distance_km": OLD_TOTAL,
        "gps_distance_km": round(raw_total, 3),
        "point_count": len(old_points),
        "source_file": source_file,
        "source_reference": OLD_SOURCE,
        "source_note": (
            "Publik 2022-rutt uppges vara skapad från arrangörens KMZ 2022-06-16 "
            "och mäter 90,173 km."
        ),
        "geometry_quality": geometry_quality,
        "geometry_note": geometry_note,
        "elevation_available": bool(old_elevation_profile),
        "elevation_note": (
            "Höjddata extraherad reproducerbart från den verifierade historiska GPX-filen."
            if old_elevation_profile
            else "Den rekonstruerade referensrutten saknar verifierad höjddata."
        ),
        "elevation_profile": old_elevation_profile,
        "style": {"color": "#7c3aed", "dashArray": "10 8", "label": "2014–2022"},
        "bounds": bounds(old_points),
        "checkpoints": make_old_checkpoints(current, old_points),
        "points": old_points,
    }
    post = {
        **current,
        "id": "ultravasan90-post2023",
        "years": {"from": 2023, "to": 2099},
        "geometry_quality": "uploaded-gps",
        "geometry_note": "GPS-geometri från den uppladdade KMZ-filen.",
        "elevation_available": bool(current_elevation_profile),
        "elevation_note": (
            "Höjddata extraherad reproducerbart från den uppladdade UV90-KMZ-filen."
            if current_elevation_profile
            else "KMZ-filens höjdkolumn är ofullständig och innehåller orimliga värden. Höjddata används därför inte."
        ),
        "elevation_profile": current_elevation_profile,
        "style": {"color": "#176d53", "dashArray": None, "label": "2023–"},
        "historical_note": "Från 2023 lades en längre inledande sträckning och loppet blev cirka 92 km.",
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
