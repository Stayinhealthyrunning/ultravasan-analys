from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config" / "comparison-contract-v2.json"


def load_contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def test_comparison_contract_identity_and_scope():
    c = load_contract()
    assert c["schema_version"] == 2
    assert c["contract_id"] == "loppanalys-comparison-2.0"
    assert c["scope"]["direct_comparison"]["selection"] == {"min": 2, "max": 2}
    assert c["scope"]["map_duel"]["selection"] == {"min": 2, "max": 5}


def test_comparison_contract_required_capabilities_and_evidence_rules():
    c = load_contract()
    required = {
        "finish_comparison",
        "checkpoint_gap",
        "placement_journey",
        "segment_comparison",
        "edition_field_normalization",
        "shared_course_context",
        "animated_two_result_comparison",
        "elevation_seek",
        "shareable_comparison_state",
        "cross_edition_comparison",
        "sparse_comparison_fallback",
        "team_entity",
        "audio",
    }
    assert required <= set(c["capabilities"])
    assert c["capabilities"]["edition_field_normalization"]["default_min_reference_n"] == 5
    assert "exact segment evidence" in c["evidence_rules"]["same_race_edition_segment_rule"]
    assert "explicitly permits" in c["evidence_rules"]["cross_edition_segment_rule"]
    assert c["participant_contract"]["entity_values"] == ["person", "team"]


def test_comparison_contract_replay_defaults_and_sparse_mode():
    c = load_contract()
    replay = c["replay_defaults"]
    assert replay["duration_seconds"] == 120
    assert replay["duration_options_seconds"] == [30, 60, 120, 180]
    assert replay["default_audio_volume"] == 0.30
    assert replay["default_camera_two_result"] == "follow_both"
    assert replay["race_clock_scrubbing"] is True
    assert replay["smooth_follow_camera"] is True
    sparse = c["sparse_mode"]
    assert any("Do not invent extra segments" in rule for rule in sparse["required_behavior"])


def test_comparison_contract_keeps_event_extensions():
    c = load_contract()
    ext = c["event_extensions"]
    assert {"gotaleden", "osterlen_spring_trail", "satila", "ultravasan"} <= set(ext)
    assert any("team" in item for item in ext["gotaleden"])
    assert any("sparse" in item for item in ext["osterlen_spring_trail"])
    assert any("physical pace" in item for item in ext["satila"])
    assert any("cross-edition" in item for item in ext["ultravasan"])
