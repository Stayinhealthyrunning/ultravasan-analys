"""Contract boundaries: raw-data compatibility, immutability and explicit routing."""
from copy import deepcopy

import pytest

from tools import race_contracts as contracts
from tools.uvtool import validation_rule_for_race


@pytest.fixture
def inputs():
    root = contracts.ROOT
    return dict(config=contracts.read_json(root / "config/races.json"),
                definitions=contracts.read_json(root / "config/course_versions.json"),
                lock=contracts.read_json(root / contracts.LOCK_PATH),
                registry=contracts.read_json(root / "data/routes/ultravasan90-routes.json"),
                observed=contracts.observed_editions())


def test_all_observed_editions_resolve_without_changing_raw_data(inputs):
    contracts.verify_route_export(inputs["registry"])
    catalog = contracts.build_catalog(**inputs)
    assert len(catalog["editions"]) == 22
    assert len(catalog["courses"]) == 5
    assert {e["race_family"] for e in catalog["editions"].values()} == {"uv90", "uv45"}
    for path, expected in contracts.serialized_catalog(catalog).items():
        assert (contracts.ROOT / path).read_text(encoding="utf-8") == expected
    old = catalog["editions"]["ultravasan90-2025"]["course_version_id"]
    new = catalog["editions"]["ultravasan90-2026"]["course_version_id"]
    assert old != new
    assert catalog["courses"][old]["display_route_id"] == catalog["courses"][new]["display_route_id"]
    course = catalog["courses"][new]
    assert {cp["checkpoint_key"] for cp in course["checkpoint_catalog"] if cp["distance_km"] is None} == {"high_point", "mora_warning"}
    assert [segment["distance_km"] for segment in course["segments"] if segment["from"] == "high_point"] == [None]
    legacy = catalog["courses"]["uv45-2014-2024-v1"]
    assert legacy["geometry_source"]["usage"] == "display-reference"
    assert legacy["whole_course_comparison_group"] is None
    assert legacy["checkpoint_catalog"][1]["distance_km"] == 15.5


def test_whole_course_group_fails_closed_until_edition_equivalence_is_verified(inputs):
    catalog = contracts.build_catalog(**inputs)
    for year in (2023, 2024, 2025, 2026):
        edition = catalog["editions"][f"ultravasan90-{year}"]
        assert edition["whole_course_comparison_group"] is None
    assert catalog["editions"]["ultravasan90-2022"]["whole_course_comparison_group"] is None
    assert catalog["editions"]["ultravasan45-2026"]["whole_course_comparison_group"] is None
    assert all(course["whole_course_comparison_group"] is None for course in catalog["courses"].values()), (
        "a checkpoint CourseVersion must not own a whole-course comparison decision"
    )


@pytest.mark.parametrize("change", ["missing_edition", "wrong_family", "wrong_event", "unknown_course", "duplicate", "observed_control"])
def test_invalid_assignments_fail_closed(inputs, change):
    race = inputs["config"]["races"][0]
    if change == "missing_edition":
        inputs["config"]["races"].pop(0)
    elif change == "duplicate":
        inputs["config"]["races"].append(deepcopy(race))
    elif change == "wrong_family":
        race["race_family"] = "uv45" if race["race_family"] == "uv90" else "uv90"
    elif change == "wrong_event":
        race["event_key"] = "different-event"
    elif change == "unknown_course":
        race["course_version_id"] = "missing"
    else:
        inputs["observed"][0]["checkpoints"][1]["distance_km"] += 0.1
    with pytest.raises(ValueError):
        contracts.build_catalog(**inputs)


@pytest.mark.parametrize("change", ["checkpoint", "anchor", "segment", "display_geometry", "family", "source"])
def test_material_mutations_cannot_reuse_course_id(inputs, change):
    key = "uv90-pre2023-v1"
    definition = inputs["definitions"]["courses"][key]
    route = inputs["registry"]["routes"][definition["display_route_id"]]
    if change == "checkpoint":
        definition["checkpoint_catalog"][1]["distance_km"] += .01
        definition["segments"] = contracts.expected_segments(definition["checkpoint_catalog"])
    elif change == "anchor":
        definition["display_anchors"][1]["coord"][0] += .001
        route["checkpoints"] = deepcopy(definition["display_anchors"])
    elif change == "segment":
        definition["segments"][0]["to"] = "eldris"
    elif change == "display_geometry":
        route["points"][1][0] += .001
    elif change == "family":
        definition["race_family"] = "uv45"
    else:
        definition["geometry_source"]["usage"] = "verified-historical-geometry"
    with pytest.raises(ValueError):
        contracts.build_catalog(**inputs)


def test_rehashing_existing_id_cannot_bypass_published_lock(inputs):
    key = "uv90-pre2023-v1"
    previous = deepcopy(inputs["lock"]["courses"])
    definition = inputs["definitions"]["courses"][key]
    definition["geometry_source"]["note"] = "changed material provenance"
    inputs["lock"]["courses"][key] = contracts.digest(contracts.course_material(key, definition, inputs["registry"]))
    with pytest.raises(ValueError, match="create a new ID"):
        contracts.verify_append_only(previous, inputs["lock"]["courses"])
    contracts.verify_append_only(previous, {**previous, "new-version-v2": "new-fingerprint"})
    with pytest.raises(ValueError, match="removed"):
        contracts.verify_append_only(previous, {})


def test_gpx_fingerprint_ignores_timestamps_but_keeps_points_elevation_and_segments(tmp_path):
    path = tmp_path / "geometry.gpx"
    source = '<gpx xmlns="http://www.topografix.com/GPX/1/1"><metadata><time>2024</time></metadata><trk><trkseg><trkpt lat="61" lon="13"><ele>20</ele><time>one</time></trkpt><trkpt lat="62" lon="14"><ele>30</ele></trkpt></trkseg></trk></gpx>'
    path.write_text(source)
    original = contracts.gpx_geometry_digest(path)
    path.write_text(source.replace("2024", "2026").replace("one", "two").replace("><", ">\n<").replace('lat="61"', 'lat="61.0000"'))
    assert contracts.gpx_geometry_digest(path) == original
    for mutation in [source.replace('lat="61"', 'lat="61.001"'), source.replace('<ele>20</ele>', '<ele>21</ele>'), source.replace('</trkpt><trkpt', '</trkpt></trkseg><trkseg><trkpt')]:
        path.write_text(mutation)
        assert contracts.gpx_geometry_digest(path) != original


def test_validation_uses_explicit_family_and_never_prefix(inputs):
    config = inputs["config"]
    assert validation_rule_for_race(config, {"race_key": "ultravasan45-2025"})["finish_seconds_min"] == 5400
    assert validation_rule_for_race(config, {"race_key": "ultravasan45-2099"}) == {}
    config["races"].append({"race_key": "opaque-key", "race_family": "uv90"})
    assert validation_rule_for_race(config, {"race_key": "opaque-key", "name": "45", "distance_km": 45})["finish_seconds_min"] == 14400


def test_browser_must_receive_the_fingerprinted_geometry(inputs):
    inputs["registry"]["routes"]["ultravasan90-pre2023"]["points"][1][0] += .001
    with pytest.raises(ValueError, match="Browser routes differ"):
        contracts.verify_route_export(inputs["registry"])
