#!/usr/bin/env python3
"""Cache DEM elevations for official route points not covered by same-year donor geometry.

This tool is intentionally self-contained so it can run before production route
builder changes are activated. Geometry remains the official Vasaloppet KMZ.
A donor match requires <=50 m spatial distance plus a normalized along-route
progress guard. Only unmatched official points are queried from Open-Meteo's
Elevation API (Copernicus DEM 2021 GLO-90, 90 m).
"""
from __future__ import annotations

import argparse
import json
import math
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
API = "https://api.open-meteo.com/v1/elevation"
MAX_MATCH_M = 50.0
SPECS = {
    "uv45-2026": {
        "route": ROOT / "source/UV45_20260610.kmz",
        "donor": ROOT / "source/routes/ultravasan45-2026-itra-328149.gpx",
        "output": ROOT / "source/routes/ultravasan45-2026-dem.json",
    },
    "uv90-2026": {
        "route": ROOT / "source/UV-90_20260610.kmz",
        "donor": ROOT / "source/routes/ultravasan90-2026-itra-328148.gpx",
        "output": ROOT / "source/routes/ultravasan90-2026-dem.json",
    },
}


def read_kmz(path: Path):
    with zipfile.ZipFile(path) as archive:
        name = next(name for name in archive.namelist() if name.lower().endswith(".kml"))
        root = ET.fromstring(archive.read(name))
    sequences = []
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1].lower() != "coordinates" or not element.text:
            continue
        coords = []
        for value in element.text.split():
            parts = value.split(",")
            if len(parts) >= 2:
                coords.append([float(parts[1]), float(parts[0]), None])
        if len(coords) >= 2:
            sequences.append(coords)
    if not sequences:
        raise ValueError(f"{path.name}: no coordinate sequence")
    return max(sequences, key=len)


def read_gpx(path: Path):
    root = ET.parse(path).getroot()
    points = []
    for node in root.iter():
        if node.tag.rsplit("}", 1)[-1] != "trkpt":
            continue
        ele = next((child for child in node if child.tag.rsplit("}", 1)[-1] == "ele"), None)
        points.append([float(node.attrib["lat"]), float(node.attrib["lon"]), float(ele.text) if ele is not None else None])
    return points


def hav(a, b):
    r = 6371.0088
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    q = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 2*r*math.asin(math.sqrt(q))


def cumulative_m(points):
    out = [0.0]
    for a, b in zip(points, points[1:]):
        out.append(out[-1] + hav(a, b) * 1000)
    return out


def unmatched_indices(target, donor):
    donor_present = sum(point[2] is not None for point in donor)
    if donor_present / len(donor) < .95:
        raise ValueError("donor elevation coverage below 95%")
    ref_lat = sum(p[0] for p in target + donor) / (len(target) + len(donor))
    sx = 111_320.0 * math.cos(math.radians(ref_lat)); sy = 110_540.0
    xy = lambda p: (p[1] * sx, p[0] * sy)
    tx = [xy(p) for p in target]; dx = [xy(p) for p in donor]
    tp = cumulative_m(target); dp = cumulative_m(donor)
    cell = MAX_MATCH_M
    grid = {}
    for i, (a, b) in enumerate(zip(dx, dx[1:])):
        if donor[i][2] is None or donor[i+1][2] is None:
            continue
        x0 = math.floor((min(a[0],b[0])-MAX_MATCH_M)/cell); x1 = math.floor((max(a[0],b[0])+MAX_MATCH_M)/cell)
        y0 = math.floor((min(a[1],b[1])-MAX_MATCH_M)/cell); y1 = math.floor((max(a[1],b[1])+MAX_MATCH_M)/cell)
        for x in range(x0, x1+1):
            for y in range(y0, y1+1):
                grid.setdefault((x,y), []).append(i)
    guard = max(500.0, min(1500.0, dp[-1] * .03))
    missing = []
    matched = 0
    for j, (qx,qy) in enumerate(tx):
        expected = tp[j] / tp[-1] * dp[-1]
        ok = False
        for i in grid.get((math.floor(qx/cell), math.floor(qy/cell)), ()):
            ax,ay = dx[i]; bx,by = dx[i+1]; vx,vy = bx-ax,by-ay; l2=vx*vx+vy*vy
            ratio = 0.0 if l2 <= 0 else ((qx-ax)*vx+(qy-ay)*vy)/l2
            ratio = max(0.0, min(1.0, ratio))
            px,py = ax+ratio*vx, ay+ratio*vy
            if math.hypot(qx-px,qy-py) > MAX_MATCH_M:
                continue
            progress = dp[i] + ratio * math.sqrt(l2)
            if abs(progress-expected) <= guard:
                ok = True; break
        if ok: matched += 1
        else: missing.append(j)
    return missing, 100 * matched / len(target)


def fetch_elevations(points):
    result = []
    for start in range(0, len(points), 100):
        batch = points[start:start+100]
        params = urlencode({
            "latitude": ",".join(f"{p[0]:.8f}" for p in batch),
            "longitude": ",".join(f"{p[1]:.8f}" for p in batch),
        }, safe=",")
        req = Request(f"{API}?{params}", headers={"User-Agent":"UltravasanRouteAudit/1.0"})
        with urlopen(req, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
        values = payload.get("elevation")
        if not isinstance(values, list) or len(values) != len(batch):
            raise RuntimeError("Open-Meteo response point count mismatch")
        result.extend(float(v) for v in values)
        time.sleep(.15)
    return result


def build(name, do_fetch):
    spec = SPECS[name]
    target = read_kmz(spec["route"]); donor = read_gpx(spec["donor"])
    missing, coverage = unmatched_indices(target, donor)
    print(f"{name}: donor matches {coverage:.3f}% of official points; DEM needed for {len(missing)} points")
    if not do_fetch:
        return
    points = [target[i] for i in missing]
    elevations = fetch_elevations(points)
    rows = [
        {"index": i, "lat": round(target[i][0],8), "lon": round(target[i][1],8), "elevation_m": round(e,1)}
        for i,e in zip(missing,elevations)
    ]
    payload = {
        "schema_version": 1,
        "provider": "Open-Meteo Elevation API",
        "dataset": "Copernicus DEM 2021 GLO-90",
        "resolution_m": 90,
        "source_url": "https://open-meteo.com/en/docs/elevation-api",
        "fetched_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "route_source": spec["route"].relative_to(ROOT).as_posix(),
        "donor_file": spec["donor"].relative_to(ROOT).as_posix(),
        "donor_max_match_distance_m": MAX_MATCH_M,
        "donor_geometry_match_pct": round(coverage,3),
        "points": rows,
    }
    spec["output"].write_text(json.dumps(payload, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(f"{name}: wrote {spec['output'].relative_to(ROOT)}")


def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--fetch",action="store_true"); parser.add_argument("--route",choices=["all",*SPECS],default="all")
    args=parser.parse_args(); names=list(SPECS) if args.route=="all" else [args.route]
    for name in names: build(name,args.fetch)
    return 0

if __name__ == "__main__": raise SystemExit(main())
