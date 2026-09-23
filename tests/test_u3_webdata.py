from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import u3_webdata


def test_u3_export_splits_public_payload_by_explicit_race_editions() -> None:
    payload = json.loads((ROOT / "docs" / "data" / "ultravasan.json").read_text(encoding="utf-8"))
    config = json.loads((ROOT / "config" / "races.json").read_text(encoding="utf-8"))
    built = u3_webdata.build_modular_payload(payload, config)

    assert built["bootstrap"]["meta"]["data_contract"] == "u3-modular-v1"
    assert built["bootstrap"]["u3"]["initial_race_key"] == "ultravasan90-2026"
    assert len(built["bootstrap"]["results"]) < len(payload["results"])
    assert len(built["bootstrap"]["splits"]) < len(payload["splits"])
    assert len(built["history"]["results"]) == len(payload["results"])
    assert len(built["chunks"]) == len(payload["races"]) == 22

    result_ids = {row["id"] for row in payload["results"]}
    locator_ids = {int(key) for key in built["bootstrap"]["u3"]["result_locator"]}
    assert locator_ids == result_ids

    chunk_results = sum(len(chunk["results"]) for chunk in built["chunks"].values())
    chunk_splits = sum(len(chunk["splits"]) for chunk in built["chunks"].values())
    assert chunk_results == len(payload["results"])
    assert chunk_splits == len(payload["splits"])


def test_u3_export_writes_offline_javascript_chunks_without_second_42mb_copy() -> None:
    payload = json.loads((ROOT / "docs" / "data" / "ultravasan.json").read_text(encoding="utf-8"))
    config = json.loads((ROOT / "config" / "races.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as temp:
        output = Path(temp) / "u3"
        manifest = u3_webdata.export_modular(payload, config, output)

        assert (output / "bootstrap.js").is_file()
        assert (output / "history-index.js").is_file()
        assert len(list((output / "races").glob("*.js"))) == 22
        assert not list(output.glob("*.json")) == []  # manifest.json only
        assert {p.name for p in output.glob("*.json")} == {"manifest.json"}
        assert manifest["bootstrap_bytes"] < manifest["legacy_compact_bytes"]
        assert manifest["largest_race_chunk_bytes"] < manifest["legacy_compact_bytes"]
        assert manifest["results"] == 24422
        assert manifest["splits"] == 139910
