"""Regression tests for public Trace de Trail page-geometry provenance handling."""
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

from tools import download_trace_de_trail_routes as downloader


def test_public_geometry_extract_and_mercator_transform():
    html = 'const dataTrace={geometry:"[{\\"lon\\":0,\\"lat\\":0,\\"x\\":0,\\"y\\":123},{\\"lon\\":1,\\"lat\\":1,\\"x\\":1,\\"y\\":124}]"};'
    points = downloader.extract_geometry(html)
    assert points == [
        {"lon": 0, "lat": 0, "x": 0, "y": 123},
        {"lon": 1, "lat": 1, "x": 1, "y": 124},
    ]
    assert downloader.mercator_to_wgs84(0, 0) == pytest.approx((0, 0), abs=1e-12)
    with pytest.raises(ValueError, match="no embedded geometry"):
        downloader.extract_geometry("const page = {};")


def test_gpx_preserves_public_page_provenance_and_missing_elevation():
    points = [
        {"lon": 1_480_149.9, "lat": 8_651_042.4, "x": 0, "y": 353},
        {"lon": 1_480_130.0, "lat": 8_651_060.0, "x": 0.02},
    ]
    metadata = {
        "url": "https://tracedetrail.fr/en/trace/51602",
        "http_status": 200,
        "content_type": "text/html; charset=UTF-8",
        "fetched_at_utc": "2026-09-25T09:56:51+00:00",
        "source_sha256": "a" * 64,
    }
    payload = downloader.build_gpx(51602, "ultravasan90-2018", points, metadata)
    gpx = ET.fromstring(payload)
    ns = {"g": "http://www.topografix.com/GPX/1/1"}
    desc = gpx.findtext("g:metadata/g:desc", namespaces=ns)
    assert metadata["url"] in desc
    assert "HTTP 200" in desc and metadata["fetched_at_utc"] in desc
    assert metadata["source_sha256"] in desc
    trackpoints = gpx.findall(".//g:trkpt", ns)
    assert len(trackpoints) == 2
    assert trackpoints[0].find("g:ele", ns) is not None
    assert trackpoints[1].find("g:ele", ns) is None


def test_checked_in_candidate_manifest_records_all_ids_and_rejection_reasons():
    manifest_path = Path(__file__).resolve().parents[1] / "reports/trace-de-trail-route-candidates.json"
    rows = json.loads(manifest_path.read_text(encoding="utf-8"))["tracks"]
    by_id = {row["track_id"]: row for row in rows}
    assert set(by_id) == set(downloader.PUBLIC_TRACKS)
    for row in rows:
        assert row["http_status"] == 200
        assert row["content_type"].lower().startswith("text/html")
        assert row["source_sha256"] == hashlib.sha256(
            (manifest_path.parents[1] / row["source_page_cache"]).read_bytes()
        ).hexdigest() if (manifest_path.parents[1] / row["source_page_cache"]).exists() else len(row["source_sha256"]) == 64
    assert by_id[51602]["promotion_decision"] == "promote"
    assert by_id[229687]["promotion_decision"] == "promote"
    assert by_id[267130]["promotion_decision"] == "promote"
    assert by_id[51603]["elevation_coverage_pct"] < 95
    assert by_id[75784]["elevation_coverage_pct"] < 95
    assert "at least 95%" in by_id[51603]["decision_reason"]
    assert "at least 95%" in by_id[75784]["decision_reason"]
