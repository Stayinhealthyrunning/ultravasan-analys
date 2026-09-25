#!/usr/bin/env python3
"""Cache public Trace de Trail route-page geometry as provenance-rich GPX candidates.

This reads only the geometry embedded in the ordinary public route page (used
by that page to render its map). It does not call the site's account-gated GPX
download endpoint or attempt to bypass access controls.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from xml.etree.ElementTree import Element, SubElement, ElementTree

ROOT = Path(__file__).resolve().parents[1]
CACHE_ROOT = ROOT / "tmp/route-candidates/tracedetrail"
MANIFEST = CACHE_ROOT / "manifest.json"
PUBLIC_TRACKS = {
    51602: ("ultravasan90-2018", "uv90", 2018),
    51603: ("ultravasan45-2018", "uv45", 2018),
    75784: ("ultravasan45-2019", "uv45", 2019),
    229687: ("ultravasan90-2023", "uv90", 2023),
    267129: ("ultravasan90-2024", "uv90", 2024),
    267130: ("ultravasan45-2024", "uv45", 2024),
    328148: ("ultravasan90-2026", "uv90", 2026),
    328149: ("ultravasan45-2026", "uv45", 2026),
}
PROMOTION_DECISIONS = {
    51602: ("promote", "Exact-year UV90 2018 candidate passed start/finish, distance and elevation validation."),
    51603: ("promote-with-elevation-transfer", "Exact-year UV45 2018 geometry is valid; incomplete native elevation is supplemented only through separately validated <=50 m spatial transfer from the complete 2024 ITRA route."),
    75784: ("promote-with-elevation-transfer", "Exact-year UV45 2019 geometry is valid; incomplete native elevation is supplemented only through separately validated <=50 m spatial transfer from the complete 2024 ITRA route."),
    229687: ("promote", "Exact-year UV90 2023 candidate passed start/finish, distance and elevation validation."),
    267129: ("candidate-not-selected", "Valid ITRA candidate is secondary to the already checked-in year-specific Vasaloppet/KMZ route."),
    267130: ("promote", "Exact-year UV45 2024 candidate passed start/finish, distance and elevation validation."),
    328148: ("candidate-not-selected", "Official Vasaloppet/KMZ 2026 geometry is primary; ITRA candidate is not used as a substitute."),
    328149: ("candidate-not-selected", "Official Vasaloppet 2026 GPX is primary; ITRA candidate is not used as a substitute."),
}
MERCATOR_RADIUS = 6_378_137.0


def mercator_to_wgs84(x: float, y: float) -> tuple[float, float]:
    lon = math.degrees(x / MERCATOR_RADIUS)
    lat = math.degrees(2 * math.atan(math.exp(y / MERCATOR_RADIUS)) - math.pi / 2)
    return lat, lon


def extract_geometry(html: str) -> list[dict]:
    marker = re.search(r"\bgeometry\s*:", html)
    if not marker:
        raise ValueError("Public route page has no embedded geometry field")
    encoded, _ = json.JSONDecoder().raw_decode(html[marker.end():].lstrip())
    if not isinstance(encoded, str):
        raise ValueError("Embedded geometry is not a JSON string")
    points = json.loads(encoded)
    if not isinstance(points, list) or len(points) < 2:
        raise ValueError("Embedded geometry has fewer than two points")
    return points


def build_gpx(track_id: int, race_key: str, points: list[dict], metadata: dict) -> bytes:
    gpx = Element("gpx", {
        "version": "1.1", "creator": "Ultravasan route source cache",
        "xmlns": "http://www.topografix.com/GPX/1/1",
    })
    meta = SubElement(gpx, "metadata")
    SubElement(meta, "name").text = f"Trace de Trail {race_key} · ITRA track {track_id}"
    SubElement(meta, "desc").text = (
        f"Coordinates transformed from the public map geometry on {metadata['url']}. "
        f"HTTP {metadata['http_status']}; content-type {metadata['content_type']}; "
        f"fetched {metadata['fetched_at_utc']}; source-page SHA-256 {metadata['source_sha256']}. "
        "Candidate geometry only; see source audit before using as an edition route."
    )
    link = SubElement(meta, "link", {"href": metadata["url"]})
    SubElement(link, "text").text = f"Trace de Trail track {track_id}"
    track = SubElement(gpx, "trk")
    SubElement(track, "name").text = f"{race_key} · Trace de Trail {track_id}"
    segment = SubElement(track, "trkseg")
    for source in points:
        if "lon" not in source or "lat" not in source:
            raise ValueError(f"Track {track_id}: geometry point has no coordinates")
        lat, lon = mercator_to_wgs84(float(source["lon"]), float(source["lat"]))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError(f"Track {track_id}: invalid transformed coordinate")
        point = SubElement(segment, "trkpt", {"lat": f"{lat:.8f}", "lon": f"{lon:.8f}"})
        elevation = source.get("y", source.get("y0"))
        if elevation is not None:
            elevation_value = float(elevation)
            if not math.isfinite(elevation_value):
                raise ValueError(f"Track {track_id}: invalid elevation")
            SubElement(point, "ele").text = f"{elevation_value:.1f}"
    import io
    output = io.BytesIO()
    ElementTree(gpx).write(output, encoding="utf-8", xml_declaration=True)
    return output.getvalue()


def fetch_page(track_id: int, page_path: Path, refresh: bool, cached_entry: dict | None) -> tuple[bytes, dict, bool]:
    if page_path.exists() and not refresh and cached_entry:
        body = page_path.read_bytes()
        return body, {key: cached_entry.get(key) for key in ("http_status", "content_type", "fetched_at_utc")}, True
    url = f"https://tracedetrail.fr/en/trace/{track_id}"
    request = Request(url, headers={"User-Agent": "Ultravasan route provenance research/1.0"})
    try:
        with urlopen(request, timeout=45) as response:
            body = response.read()
            meta = {
                "http_status": int(response.status),
                "content_type": response.headers.get("Content-Type", ""),
                "fetched_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
    except (HTTPError, URLError, TimeoutError) as error:
        raise RuntimeError(f"Track {track_id}: public page fetch failed: {error}") from error
    if meta["http_status"] != 200 or "html" not in meta["content_type"].lower():
        raise RuntimeError(f"Track {track_id}: unexpected page response HTTP {meta['http_status']}, {meta['content_type']}")
    page_path.parent.mkdir(parents=True, exist_ok=True)
    page_path.write_bytes(body)
    return body, meta, False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Fetch pages again instead of using the local cache")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between network requests")
    parser.add_argument("--cache-dir", type=Path, default=CACHE_ROOT)
    parser.add_argument("--ids", type=int, nargs="*", default=list(PUBLIC_TRACKS))
    args = parser.parse_args()
    try:
        old_rows = json.loads((args.cache_dir / "manifest.json").read_text(encoding="utf-8")).get("tracks", [])
    except (OSError, json.JSONDecodeError):
        old_rows = []
    old_by_id = {int(row["track_id"]): row for row in old_rows if row.get("track_id") is not None}
    entries = []
    for index, track_id in enumerate(args.ids):
        if track_id not in PUBLIC_TRACKS:
            parser.error(f"Unknown curated public track ID: {track_id}")
        race_key, family, year = PUBLIC_TRACKS[track_id]
        url = f"https://tracedetrail.fr/en/trace/{track_id}"
        page_path = args.cache_dir / f"{track_id}.html"
        used_cache = False
        try:
            body, response_meta, used_cache = fetch_page(track_id, page_path, args.refresh, old_by_id.get(track_id))
            html = body.decode("utf-8", errors="replace")
            title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
            title = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", title_match.group(1))).strip() if title_match else ""
            points = extract_geometry(html)
            advertised_match = re.search(r"\bdistance\s*:\s*([0-9]+(?:\.[0-9]+)?)", html)
            page_distance = float(advertised_match.group(1)) if advertised_match else None
            date_match = re.search(r"\bdateCompet\s*:\s*\"([^\"]+)", html)
            race_date = date_match.group(1) if date_match else None
            meta = {
                "url": url, **response_meta,
                "source_sha256": hashlib.sha256(body).hexdigest(),
            }
            gpx = build_gpx(track_id, race_key, points, meta)
            gpx_path = args.cache_dir / f"{race_key}-trace-{track_id}.gpx"
            gpx_path.write_bytes(gpx)
            elevations = [p.get("y", p.get("y0")) for p in points]
            present = sum(value is not None for value in elevations)
            entry = {
                **meta, "track_id": track_id, "race_key": race_key, "race_family": family,
                "race_year": year, "page_title": title, "race_date": race_date,
                "advertised_distance_km": page_distance, "source_point_count": len(points),
                "elevation_coverage_pct": round(100 * present / len(points), 3),
                "candidate_gpx": gpx_path.relative_to(ROOT).as_posix(),
                "candidate_gpx_sha256": hashlib.sha256(gpx).hexdigest(),
                "source_page_cache": page_path.relative_to(ROOT).as_posix(),
                "status": "candidate",
                "promotion_decision": PROMOTION_DECISIONS[track_id][0],
                "decision_reason": PROMOTION_DECISIONS[track_id][1],
            }
            if not title or "ultravasan" not in title.lower() or str(year) not in title and race_date is None:
                entry["status"] = "rejected"
                entry["rejection_reason"] = "Page identity does not establish the expected Ultravasan year."
            elif present / len(points) < 0.95:
                entry["status"] = "candidate-incomplete-elevation"
                entry["limitation_reason"] = (
                    "Less than 95% of public geometry points carry native elevation. "
                    "Geometry may still be promoted when a separately validated spatial elevation donor is configured."
                )
            entries.append(entry)
            print(f"{track_id}: {entry['status']} · {title} · {page_distance or '?'} km · elevation {entry['elevation_coverage_pct']}%")
        except Exception as error:  # Preserve the exact failure as an auditable candidate row.
            entries.append({"track_id": track_id, "race_key": race_key, "race_family": family,
                            "race_year": year, "url": url, "status": "fetch-or-parse-error",
                            "fetched_at_utc": None, "error": str(error)})
            print(f"{track_id}: ERROR · {error}")
        if index < len(args.ids) - 1 and args.delay > 0 and not used_cache:
            time.sleep(args.delay)
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"schema_version": 1, "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "source_note": "Public map-page geometry only; account-gated GPX download endpoints were not used.",
                "tracks": entries}
    (args.cache_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 1 if any(row["status"] == "fetch-or-parse-error" for row in entries) else 0


if __name__ == "__main__":
    raise SystemExit(main())
