from tools import u20_route_audit


def test_route_audit_covers_all_editions_and_separates_evidence_from_comparability():
    report = u20_route_audit.build_report()
    assert report["edition_count"] == 22
    assert report["exact_edition_routes_found"] == 4
    by_key = {row["race_key"]: row for row in report["routes"]}

    assert by_key["ultravasan90-2022"]["exact_edition_route_found"]
    assert by_key["ultravasan90-2024"]["exact_edition_route_found"]
    assert by_key["ultravasan90-2026"]["exact_edition_route_found"]
    assert by_key["ultravasan45-2026"]["exact_edition_route_found"]
    assert by_key["ultravasan90-2023"]["route_usage"] == "reference-only"

    assert by_key["ultravasan90-2022"]["evidence_status"] == "local-exact-source-year"
    assert by_key["ultravasan90-2025"]["evidence_status"] == "external-year-specific"
    assert any(item["evidence_type"] == "official-route-change-notice"
               for item in by_key["ultravasan90-2017"]["external_route_evidence"])
    assert any("rerouting" in item["note"]
               for item in by_key["ultravasan90-2024"]["external_route_evidence"])

    assert all(row["whole_course_comparison_group_recommended"] is None for row in report["routes"])
    assert report["whole_course_groups"] == []
    assert report["rejected_or_pending_groups"][0]["group"] == "ultravasan90-post2023"
    assert report["rejected_or_pending_groups"][0]["status"] == "not verified"
    assert report["geometry_comparisons"][0]["result"]["symmetric_nearest_max_m"] > 0
    assert "cannot" in report["geometry_comparisons"][0]["decision"]
