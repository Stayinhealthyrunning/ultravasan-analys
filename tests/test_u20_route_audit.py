import json

from tools import u20_route_audit


def test_route_source_digest_is_stable_across_windows_and_linux_line_endings(tmp_path):
    lf = tmp_path / "source.gpx"
    crlf = tmp_path / "source-copy.gpx"
    lf.write_bytes(b"<gpx>\n<trk/>\n</gpx>\n")
    crlf.write_bytes(lf.read_bytes().replace(b"\n", b"\r\n"))
    assert u20_route_audit.source_file_sha256(lf) == u20_route_audit.source_file_sha256(crlf)


def test_route_audit_covers_all_editions_and_separates_evidence_from_comparability():
    report = u20_route_audit.build_report()
    assert report["edition_count"] == 22
    assert report["exact_edition_routes_found"] == 9
    by_key = {row["race_key"]: row for row in report["routes"]}

    assert by_key["ultravasan90-2022"]["exact_edition_route_found"]
    assert by_key["ultravasan90-2024"]["exact_edition_route_found"]
    assert by_key["ultravasan90-2026"]["exact_edition_route_found"]
    assert by_key["ultravasan45-2026"]["exact_edition_route_found"]
    assert by_key["ultravasan45-2018"]["exact_edition_route_found"]
    assert by_key["ultravasan45-2019"]["exact_edition_route_found"]
    assert by_key["ultravasan45-2018"]["evidence_status"] == "local-exact-source-year"
    assert by_key["ultravasan45-2019"]["evidence_status"] == "local-exact-source-year"
    assert by_key["ultravasan90-2023"]["route_usage"] == "exact-source-year"
    assert report["display_route_contracts_complete"]
    assert by_key["ultravasan90-2024"]["display_route_contract"]["display_geometry_usage"] == "exact-source-year"
    assert by_key["ultravasan90-2026"]["display_route_contract"]["display_geometry_usage"] == "exact-source-year"
    assert by_key["ultravasan90-2026"]["display_route_contract"]["display_geometry_source_year"] == 2026

    assert by_key["ultravasan90-2022"]["evidence_status"] == "local-exact-source-year"
    assert by_key["ultravasan90-2025"]["evidence_status"] == "external-year-specific"
    assert any(item["evidence_type"] == "official-route-change-notice"
               for item in by_key["ultravasan90-2017"]["external_route_evidence"])
    assert any("rerouting" in item["note"]
               for item in by_key["ultravasan90-2024"]["external_route_evidence"])
    assert any(item["evidence_type"] == "official-no-course-change-notice"
               for item in by_key["ultravasan90-2025"]["external_route_evidence"])
    assert any("returns to the ordinary" in item["note"]
               for item in by_key["ultravasan90-2026"]["external_route_evidence"])

    assert by_key["ultravasan90-2023"]["whole_course_comparison_group_recommended"] is None
    assert by_key["ultravasan90-2024"]["whole_course_comparison_group_recommended"] == "ultravasan90-2024-2025"
    assert by_key["ultravasan90-2025"]["whole_course_comparison_group_recommended"] == "ultravasan90-2024-2025"
    assert by_key["ultravasan90-2026"]["whole_course_comparison_group_recommended"] is None
    assert by_key["ultravasan90-2024"]["whole_course_comparison_group_current"] == "ultravasan90-2024-2025"
    assert by_key["ultravasan90-2025"]["whole_course_comparison_group_current"] == "ultravasan90-2024-2025"
    assert report["whole_course_groups"] == [{
        "group": "ultravasan90-2024-2025",
        "editions": ["ultravasan90-2024", "ultravasan90-2025"],
        "status": "verified",
        "reason": (
            "Organizer evidence establishes 2024 changes from 2023, no course changes for 2025, and a 2026 "
            "return from the multi-year temporary Evertsberg-Oxberg routing."
        ),
    }]
    assert report["rejected_or_pending_groups"][0]["group"] == "ultravasan90-post2023"
    assert report["rejected_or_pending_groups"][0]["status"] == "rejected"
    assert by_key["ultravasan90-2026"]["source_provider"] == "Vasaloppet"
    assert by_key["ultravasan90-2026"]["source_url"].endswith("UV-90_20260610.kmz")
    assert any(item["evidence_type"] == "official-organizer-kmz"
               for item in by_key["ultravasan90-2026"]["external_route_evidence"])

    assert len(report["geometry_comparisons"]) == 10
    pairs = {(item["left"], item["right"]): item for item in report["geometry_comparisons"]}
    pair_22_24 = pairs[("ultravasan90-2022", "ultravasan90-2024")]
    pair_24_26 = pairs[("ultravasan90-2024", "ultravasan90-2026")]
    assert pair_22_24["result"]["symmetric_nearest_p95_m"] > 500
    assert pair_24_26["result"]["symmetric_nearest_median_m"] < 100
    assert all("diagnostic only" in item["decision"] for item in report["geometry_comparisons"])
    assert all("not by itself" in item["decision"] for item in report["geometry_comparisons"])


def test_checked_in_route_audit_json_matches_current_builder():
    report = u20_route_audit.build_report()
    checked_in = json.loads((u20_route_audit.ROOT / "reports/U20_ROUTE_AUDIT.json").read_text(encoding="utf-8"))
    if checked_in != report:
        actual_routes = {row["race_key"]: row for row in checked_in.get("routes", [])}
        expected_routes = {row["race_key"]: row for row in report.get("routes", [])}
        route_diffs = []
        for race_key in sorted(set(actual_routes) | set(expected_routes)):
            actual = actual_routes.get(race_key, {})
            expected = expected_routes.get(race_key, {})
            for field in sorted(set(actual) | set(expected)):
                if actual.get(field) != expected.get(field):
                    route_diffs.append({
                        "race_key": race_key,
                        "field": field,
                        "checked_in": actual.get(field),
                        "builder": expected.get(field),
                    })
        top_diffs = {
            key: {"checked_in": checked_in.get(key), "builder": report.get(key)}
            for key in sorted(set(checked_in) | set(report))
            if key != "routes" and checked_in.get(key) != report.get(key)
        }
        raise AssertionError(json.dumps({"top": top_diffs, "routes": route_diffs}, ensure_ascii=False, indent=2))
