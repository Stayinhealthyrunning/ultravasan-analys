#!/usr/bin/env python3
"""Build explicit event/family/course contracts without rewriting result data."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = "config/course_version_lock.json"
JSON_PATH = "docs/data/race-catalog.json"
JS_PATH = "docs/data/race-catalog.js"


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def digest(value):
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def gpx_geometry_digest(path):
    """Ignore metadata/whitespace, retain track segmentation and every point."""
    root = ET.parse(path).getroot()
    segments = []
    for segment in root.findall(".//{*}trkseg") + root.findall(".//{*}rte"):
        points = []
        for point in list(segment):
            if point.tag.rsplit("}", 1)[-1] not in ("trkpt", "rtept"):
                continue
            lat, lon = float(point.attrib["lat"]), float(point.attrib["lon"])
            elevation = point.find("{*}ele")
            ele = float(elevation.text) if elevation is not None else None
            require(math.isfinite(lat) and -90 <= lat <= 90 and math.isfinite(lon) and -180 <= lon <= 180,
                    f"Invalid GPX coordinate: {path}")
            require(ele is None or math.isfinite(ele), f"Invalid elevation: {path}")
            points.append([lat, lon, ele])
        if points:
            segments.append(points)
    require(sum(map(len, segments)) >= 2, f"No usable geometry: {path}")
    return digest(segments)


def expected_segments(checkpoints):
    return [
        {"from": a["checkpoint_key"], "to": b["checkpoint_key"],
         "distance_km": round(b["distance_km"] - a["distance_km"], 6)
         if a["distance_km"] is not None and b["distance_km"] is not None else None}
        for a, b in zip(checkpoints, checkpoints[1:])
    ]


def course_material(course_id, definition, registry, root=ROOT):
    route = registry["routes"].get(definition["display_route_id"])
    require(route is not None, f"{course_id}: missing display route")
    require(route["source_file"] == definition["geometry_source"]["path"], f"{course_id}: source mismatch")
    require(route["source_year"] == definition["geometry_source"]["year"], f"{course_id}: source year mismatch")
    require(route["race_family"] == definition["race_family"], f"{course_id}: route family mismatch")
    require(route["checkpoints"] == definition["display_anchors"], f"{course_id}: display anchors mismatch")
    cps = definition["checkpoint_catalog"]
    require(len(cps) >= 2 and len({cp["checkpoint_key"] for cp in cps}) == len(cps), f"{course_id}: duplicate/empty controls")
    require([cp["sequence_no"] for cp in cps] == list(range(len(cps))), f"{course_id}: invalid checkpoint order")
    known = [cp["distance_km"] for cp in cps if cp["distance_km"] is not None]
    require(bool(known) and cps[0]["distance_km"] == 0 and cps[-1]["distance_km"] is not None
            and all(math.isfinite(d) for d in known)
            and all(b > a for a, b in zip(known, known[1:])), f"{course_id}: invalid distances")
    require(definition["segments"] == expected_segments(cps), f"{course_id}: inconsistent segments")
    return {
        **definition,
        "course_version_id": course_id,
        "geometry_sha256": gpx_geometry_digest(root / definition["geometry_source"]["path"]),
        "display_geometry_sha256": digest({key: route[key] for key in
            ("points", "point_schema", "elevation_profile", "elevation_profile_schema", "official_distance_km")}),
    }


def verify_append_only(previous, current):
    for key, fingerprint in previous.items():
        require(current.get(key) == fingerprint,
                f"Published CourseVersion {key} changed or was removed; create a new ID")


def read_previous_lock(ref, root=ROOT):
    if not ref or set(ref) == {"0"}:
        return {}
    subprocess.run(["git", "cat-file", "-e", f"{ref}^{{commit}}"], cwd=root, check=True, capture_output=True)
    exists = subprocess.run(["git", "ls-tree", "--name-only", ref, "--", LOCK_PATH],
                            cwd=root, check=True, capture_output=True, text=True)
    if not exists.stdout.strip():
        return {}  # First introduction of this contract on the base revision.
    content = subprocess.run(["git", "show", f"{ref}:{LOCK_PATH}"], cwd=root, check=True,
                             capture_output=True, text=True)
    return json.loads(content.stdout)["courses"]


def observed_editions(root=ROOT):
    with sqlite3.connect((root / "data/ultravasan.sqlite").as_uri() + "?mode=ro", uri=True) as conn:
        conn.row_factory = sqlite3.Row
        return [{**dict(race), "checkpoints": [dict(cp) for cp in conn.execute(
            "SELECT checkpoint_key,name,sequence_no,distance_km,elevation_m FROM checkpoints "
            "WHERE race_id=? ORDER BY sequence_no,checkpoint_key", (race["id"],))]}
            for race in conn.execute("SELECT id,race_key FROM races ORDER BY race_key")]


def build_catalog(config, definitions, lock, registry, observed, root=ROOT):
    require(definitions["schema_version"] == 1 and lock["schema_version"] == 1, "Unsupported schema")
    event = config["event"]
    event_key = event["event_key"]
    require(bool(event_key), "Empty event key")
    families = config["race_families"]
    for key, family in families.items():
        require(family["event_key"] == event_key, f"{key}: wrong event")
    courses = {}
    require(set(lock["courses"]) == set(definitions["courses"]), "Course lock IDs differ from definitions")
    for key, definition in definitions["courses"].items():
        require(definition["event_key"] == event_key, f"{key}: wrong event")
        require(definition["race_family"] in families, f"{key}: unknown family")
        material = course_material(key, definition, registry, root)
        fingerprint = digest(material)
        require(lock["courses"][key] == fingerprint, f"{key}: fingerprint changed; create a new CourseVersion ID")
        courses[key] = {**material, "fingerprint": fingerprint}
    editions = {}
    for race in config["races"]:
        key = race["race_key"]
        require(key and key not in editions, f"Duplicate/empty edition: {key}")
        course = courses.get(race["course_version_id"])
        require(course is not None, f"{key}: unknown course")
        require(race["event_key"] == event_key and course["race_family"] == race["race_family"],
                f"{key}: family/event mismatch")
        require(race["medal_profile"] in (None, "pre2023", "post2023"), f"{key}: unknown medal profile")
        require(race["medal_profile"] is None or race["race_family"] == "uv90", f"{key}: invalid medal family")
        editions[key] = {field: race[field] for field in
                        ("race_key", "event_key", "race_family", "course_version_id", "medal_profile")}
    observed_keys = {race["race_key"] for race in observed}
    require(observed_keys <= set(editions), "Observed edition missing from contracts")
    for race in observed:
        course = courses[editions[race["race_key"]]["course_version_id"]]
        require(race["checkpoints"] == course["checkpoint_catalog"], f"{race['race_key']}: observed controls differ from course")
    return {"schema_version": 1, "event": event,
            "families": {key: {field: family[field] for field in
                ("event_key", "label", "start_name", "presentation", "music")} for key, family in families.items()},
            "courses": courses, "editions": editions}


def serialized_catalog(catalog):
    return {
        JSON_PATH: json.dumps(catalog, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        JS_PATH: "window.RACE_CATALOG=" + json.dumps(catalog, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + ";\n",
    }


def verify_route_export(registry, root=ROOT):
    """The browser must receive the same display geometry that was hashed."""
    script = (root / "docs/data/ultravasan-routes.js").read_text(encoding="utf-8").strip()
    prefix = "window.ULTRAVASAN_ROUTES = "
    require(script.startswith(prefix) and script.endswith(";"), "Invalid browser route export")
    payload, end = json.JSONDecoder().raw_decode(script[len(prefix):])
    suffix = ";\nwindow.ULTRAVASAN_ROUTE = window.ULTRAVASAN_ROUTES.routes[window.ULTRAVASAN_ROUTES.default_route_id];"
    require(script[len(prefix) + end:] == suffix, "Unexpected browser route assignment")
    require(payload == registry, "Browser routes differ from fingerprinted registry")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check generated files without writing")
    parser.add_argument("--base-ref", help="Git revision whose published IDs must remain immutable")
    args = parser.parse_args()
    try:
        lock = read_json(ROOT / LOCK_PATH)
        if args.base_ref:
            verify_append_only(read_previous_lock(args.base_ref), lock["courses"])
        registry = read_json(ROOT / "data/routes/ultravasan90-routes.json")
        verify_route_export(registry)
        catalog = build_catalog(read_json(ROOT / "config/races.json"),
                                read_json(ROOT / "config/course_versions.json"), lock,
                                registry, observed_editions())
        for path, content in serialized_catalog(catalog).items():
            target = ROOT / path
            if args.check:
                require(target.exists() and target.read_text(encoding="utf-8") == content,
                        f"Stale catalog: {path}; run python tools/race_contracts.py")
            else:
                target.write_text(content, encoding="utf-8")
        print(f"OK: {len(catalog['editions'])} explicit editions, {len(catalog['courses'])} locked CourseVersions")
        return 0
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f"Contract check failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
