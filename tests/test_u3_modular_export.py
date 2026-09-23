from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import u3_modularize
import uvtool


def tiny_payload() -> dict:
    return {
        "meta": {
            "schema_version": 1,
            "generated_at": "2026-09-23T00:00:00+00:00",
            "identity_contract": "u2-person-key-v1",
        },
        "races": [
            {"id": 1, "race_key": "uv90-a", "year": 2025},
            {"id": 2, "race_key": "uv45-a", "year": 2025},
        ],
        "checkpoints": [
            {"race_id": 1, "checkpoint_key": "mora", "sequence_no": 1},
            {"race_id": 2, "checkpoint_key": "mora", "sequence_no": 1},
        ],
        "results": [
            {"id": 10, "race_id": 1, "name_as_published": "A"},
            {"id": 20, "race_id": 2, "name_as_published": "B"},
        ],
        "splits": [
            {"result_id": 10, "checkpoint_key": "mora", "elapsed_seconds": 100},
            {"result_id": 20, "checkpoint_key": "mora", "elapsed_seconds": 200},
        ],
        "stats": {"1": {"count": 1}, "2": {"count": 1}},
        "sources": [{"code": "test"}],
    }


def tiny_config() -> dict:
    return {
        "races": [
            {"race_key": "uv90-a", "race_family": "uv90"},
            {"race_key": "uv45-a", "race_family": "uv45"},
        ]
    }


def test_modular_export_round_trips_exact_public_rows(tmp_path: Path) -> None:
    payload = tiny_payload()
    config = tiny_config()
    stale_json = tmp_path / "ultravasan-edition-obsolete.json"
    stale_js = tmp_path / "ultravasan-edition-obsolete.js"
    stale_current_js = tmp_path / "ultravasan-edition-uv90-a.js"
    stale_json.write_text("{}", encoding="utf-8")
    stale_js.write_text("window.obsolete=true;", encoding="utf-8")
    stale_current_js.write_text("window.obsolete=true;", encoding="utf-8")
    stale_family_json = tmp_path / "ultravasan-uv90.json"
    stale_family_js = tmp_path / "ultravasan-uv90.js"
    stale_family_json.write_text("{}", encoding="utf-8")
    stale_family_js.write_text("window.obsolete=true;", encoding="utf-8")
    catalog = uvtool.write_modular_web_data(payload, tmp_path, config)
    assert not stale_json.exists()
    assert not stale_js.exists()
    assert not stale_current_js.exists()
    assert not stale_family_json.exists()
    assert not stale_family_js.exists()
    assert catalog["mode"] == "modular"
    assert "result_family" not in catalog
    assert catalog["result_edition"] == {"10": 1, "20": 2}
    assert catalog["families"]["uv90"]["results"] == 1
    assert catalog["families"]["uv90"]["default_race_id"] == 1
    assert catalog["families"]["uv90"]["shell"]["json"].endswith("ultravasan-uv90-shell.json")
    assert catalog["families"]["uv45"]["splits"] == 1
    assert catalog["editions"]["1"]["race_key"] == "uv90-a"
    assert catalog["editions"]["1"]["results"] == 1
    assert catalog["editions"]["1"]["core"]["json"].endswith("ultravasan-race-core-uv90-a.json")
    assert catalog["editions"]["2"]["race_key"] == "uv45-a"
    assert catalog["editions"]["2"]["splits"] == 1

    summary = u3_modularize.validate(payload, tmp_path, config)
    assert summary["results"] == 2
    assert summary["splits"] == 2
    assert summary["families"]["uv90"]["default_race_id"] == 1
    assert summary["families"]["uv90"]["default_first_paint_json_bytes"] > 0
    assert summary["largest_default_first_paint_with_catalog_bytes"] > summary["largest_default_first_paint_bytes"]

    uv90_shell = json.loads((tmp_path / "ultravasan-uv90-shell.json").read_text(encoding="utf-8"))
    uv90_core = json.loads((tmp_path / "ultravasan-uv90-core.json").read_text(encoding="utf-8"))
    uv90_splits = json.loads((tmp_path / "ultravasan-uv90-splits.json").read_text(encoding="utf-8"))
    uv45_core = json.loads((tmp_path / "ultravasan-uv45-core.json").read_text(encoding="utf-8"))
    uv45_splits = json.loads((tmp_path / "ultravasan-uv45-splits.json").read_text(encoding="utf-8"))
    edition_core90 = json.loads((tmp_path / "ultravasan-race-core-uv90-a.json").read_text(encoding="utf-8"))
    edition_core45 = json.loads((tmp_path / "ultravasan-race-core-uv45-a.json").read_text(encoding="utf-8"))
    edition90 = json.loads((tmp_path / "ultravasan-edition-uv90-a.json").read_text(encoding="utf-8"))
    edition45 = json.loads((tmp_path / "ultravasan-edition-uv45-a.json").read_text(encoding="utf-8"))
    assert uv90_shell["results"] == []
    assert uv90_shell["splits"] == []
    assert uv90_shell["races"] == [payload["races"][0]]
    assert uv90_core["results"] == [payload["results"][0]]
    assert uv90_core["splits"] == []
    assert uv90_splits["results"] == []
    assert uv90_splits["splits"] == [payload["splits"][0]]
    assert uv45_core["results"] == [payload["results"][1]]
    assert uv45_splits["splits"] == [payload["splits"][1]]
    assert edition_core90["results"] == [payload["results"][0]]
    assert edition_core90["splits"] == []
    assert edition_core90["meta"]["data_scope"]["kind"] == "race-edition-core"
    assert edition_core45["results"] == [payload["results"][1]]
    assert edition_core45["splits"] == []
    assert edition90["results"] == [payload["results"][0]]
    assert edition90["splits"] == [payload["splits"][0]]
    assert edition90["meta"]["data_scope"]["kind"] == "race-edition"
    assert edition45["results"] == [payload["results"][1]]
    assert edition45["splits"] == [payload["splits"][1]]
    assert not (tmp_path / "ultravasan-race-core-uv90-a.js").exists()
    assert not (tmp_path / "ultravasan-race-core-uv45-a.js").exists()
    assert not (tmp_path / "ultravasan-edition-uv90-a.js").exists()
    assert not (tmp_path / "ultravasan-edition-uv45-a.js").exists()
    assert (tmp_path / "ultravasan-uv90-core.js").exists()
    assert (tmp_path / "ultravasan-uv90-splits.js").exists()


def test_export_auto_detects_activated_modular_catalog(tmp_path: Path) -> None:
    output = tmp_path / "ultravasan.json"
    assert uvtool.resolve_modular_output_dir(output, None) is None

    (tmp_path / "ultravasan-data-catalog.json").write_text(
        json.dumps({"schema_version": 1, "mode": "legacy"}),
        encoding="utf-8",
    )
    assert uvtool.resolve_modular_output_dir(output, None) is None

    (tmp_path / "ultravasan-data-catalog.json").write_text(
        json.dumps({"schema_version": 1, "mode": "modular"}),
        encoding="utf-8",
    )
    assert uvtool.resolve_modular_output_dir(output, None) == tmp_path

    explicit = tmp_path / "other"
    assert uvtool.resolve_modular_output_dir(output, explicit) == explicit
