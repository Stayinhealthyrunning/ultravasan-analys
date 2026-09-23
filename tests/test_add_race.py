from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from tools import source_bindings


ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "add_race.py"
COURSES = ROOT / "config" / "course_versions.json"


def command(config: Path, course_version_id: str = "uv45-2025-2026-v1") -> list[str]:
    return [
        sys.executable, str(TOOL),
        "--race-key", "opaque-2027-short",
        "--family", "uv45",
        "--year", "2027",
        "--race-date", "2027-08-21",
        "--name", "Ultravasan 45",
        "--course-version-id", course_version_id,
        "--competition-profile", "solo",
        "--config", str(config),
        "--course-config", str(COURSES),
    ]


def test_add_race_registers_only_an_explicit_planned_edition(tmp_path: Path) -> None:
    target = tmp_path / "races.json"
    target.write_bytes((ROOT / "config" / "races.json").read_bytes())
    subprocess.run(command(target), cwd=ROOT, check=True, capture_output=True, text=True)
    config = json.loads(target.read_text(encoding="utf-8"))
    source_bindings.validate_config(config)
    race = next(item for item in config["races"] if item["race_key"] == "opaque-2027-short")
    assert race["data_status"] == "planned"
    assert race["source_bindings"] == []
    assert race["race_family"] == "uv45"
    assert race["course_version_id"] == "uv45-2025-2026-v1"
    assert race["checkpoints"][-1]["distance_km"] == 45.0
    assert "event_code" not in race


def test_add_race_rejects_mismatched_course_selection(tmp_path: Path) -> None:
    target = tmp_path / "races.json"
    original = (ROOT / "config" / "races.json").read_bytes()
    target.write_bytes(original)
    result = subprocess.run(
        command(target, "uv90-2026-v1"), cwd=ROOT, capture_output=True, text=True,
    )
    assert result.returncode != 0
    assert "another race family" in result.stderr
    assert target.read_bytes() == original
