from tools import u20_route_audit


def test_route_audit_covers_all_editions_and_limits_groups_to_evidence():
    report = u20_route_audit.build_report()
    assert report["edition_count"] == 22
    assert report["exact_edition_routes_found"] == 4
    by_key = {row["race_key"]: row for row in report["routes"]}
    assert by_key["ultravasan90-2022"]["exact_edition_route_found"]
    assert by_key["ultravasan90-2024"]["exact_edition_route_found"]
    assert by_key["ultravasan90-2026"]["exact_edition_route_found"]
    assert by_key["ultravasan45-2026"]["exact_edition_route_found"]
    assert by_key["ultravasan90-2023"]["route_usage"] == "reference-only"
    assert by_key["ultravasan90-2023"]["whole_course_comparison_group_recommended"] == "ultravasan90-post2023"
    assert by_key["ultravasan90-2026"]["whole_course_comparison_group_recommended"] == "ultravasan90-post2023"
    assert by_key["ultravasan90-2022"]["whole_course_comparison_group_recommended"] is None
    assert by_key["ultravasan45-2026"]["whole_course_comparison_group_recommended"] is None
    assert report["geometry_comparisons"][0]["result"]["symmetric_nearest_max_m"] > 0
