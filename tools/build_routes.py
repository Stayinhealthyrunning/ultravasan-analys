#!/usr/bin/env python3
"""Build the browser route registry for both Ultravasan 90 course eras.

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
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.etree.ElementTree import Element, SubElement, ElementTree

ROOT = Path(__file__).resolve().parents[1]
CURRENT_JS = ROOT / "docs/data/ultravasan-route.js"
OUT_JS = ROOT / "docs/data/ultravasan-routes.js"
OUT_JSON = ROOT / "data/routes/ultravasan90-routes.json"
EXACT_OLD_GPX = ROOT / "source/Ultravasan90-2014-2022.gpx"
REFERENCE_OLD_GPX = ROOT / "source/Ultravasan90-2014-2022-reference.gpx"
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
    """Read trkpt/rtept coordinates from a GPX file, namespace agnostic."""
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
        coords.append([float(lat), float(lon)])
    if len(coords) < 2:
        raise ValueError(f"{path.name} innehåller färre än två GPX-punkter")
    return coords


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
    args = parser.parse_args()

    text = CURRENT_JS.read_text(encoding="utf-8")
    current = json.loads(text.split("=", 1)[1].strip().rstrip(";"))

    if EXACT_OLD_GPX.exists():
        coords = orient_like_current(read_gpx(EXACT_OLD_GPX), current["points"])
        old_points, raw_total = cumulative(coords)
        old_points = normalize_distance(old_points, OLD_TOTAL)
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
        "style": {"color": "#176d53", "dashArray": None, "label": "2023–"},
        "historical_note": "Från 2023 lades en längre inledande sträckning och loppet blev cirka 92 km.",
    }
    registry = {
        "default_route_id": post["id"],
        "route_for_year": [
            {"from": 2014, "to": 2022, "route_id": old["id"]},
            {"from": 2023, "to": 2099, "route_id": post["id"]},
        ],
        "routes": {old["id"]: old, post["id"]: post},
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_JS.write_text(
        "window.ULTRAVASAN_ROUTES = "
        + json.dumps(registry, ensure_ascii=False, separators=(",", ":"))
        + ";\nwindow.ULTRAVASAN_ROUTE = window.ULTRAVASAN_ROUTES.routes[window.ULTRAVASAN_ROUTES.default_route_id];\n",
        encoding="utf-8",
    )
    print(f"Skrev {OUT_JSON.relative_to(ROOT)} och {OUT_JS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
