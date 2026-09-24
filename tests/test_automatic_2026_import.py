from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import automatic_2026_import as automatic  # noqa: E402
import automatic_import_schedule as schedule  # noqa: E402
import mika_import  # noqa: E402
import uvtool  # noqa: E402


def discovered(family: str) -> dict:
    distance = "90" if family == "uv90" else "45"
    return {
        "year": 2026,
        "event_code": f"UL{distance}_HCH8NDMR2601",
        "label": f"Ultravasan {distance}",
        "result_year_path": 2027,
    }


def test_schedule_window_is_closed_on_race_day_and_after_deadline() -> None:
    assert automatic.schedule_state(date(2026, 8, 15)) == "before-window"
    assert automatic.schedule_state(date(2026, 8, 16)) == "active"
    assert automatic.schedule_state(date(2026, 9, 15)) == "active"
    assert automatic.schedule_state(date(2027, 8, 21), 2027) == "before-window"
    assert automatic.schedule_state(date(2027, 8, 22), 2027) == "active"


def test_schedule_stops_after_completed_year_and_blocks_unconfigured_next_year(tmp_path: Path) -> None:
    db = tmp_path / "schedule.sqlite"
    with sqlite3.connect(db) as conn:
        conn.executescript("""
          CREATE TABLE races(id INTEGER PRIMARY KEY, race_key TEXT);
          CREATE TABLE sources(id INTEGER PRIMARY KEY, code TEXT);
          CREATE TABLE results(race_id INTEGER, source_id INTEGER);
          INSERT INTO sources VALUES(1, 'vasaloppet_mika');
          INSERT INTO races VALUES(1, 'ultravasan90-2026');
          INSERT INTO races VALUES(2, 'ultravasan45-2026');
        """)
        conn.executemany("INSERT INTO results VALUES(?, 1)", [(1,)] * 1200 + [(2,)] * 500)
    assert schedule.schedule_decision(date(2026, 8, 24), db)["state"] == "already-complete"
    assert schedule.schedule_decision(date(2027, 8, 21), db)["state"] == "already-complete"
    next_year = schedule.schedule_decision(date(2027, 8, 22), db)
    assert next_year["active"] is False and next_year["target_year"] == 2027
    assert next_year["state"] == "not-configured"


def test_schedule_requires_explicit_mika_bindings_before_network_gate(tmp_path: Path) -> None:
    config = uvtool.load_config(uvtool.DEFAULT_CONFIG)
    for race in config["races"]:
        if race["race_family"] == "uv45" and race["year"] == 2026:
            race["source_bindings"] = []
    target = tmp_path / "races.json"
    target.write_text(json.dumps(config), encoding="utf-8")
    assert schedule.target_keys(target, 2026) == {}
    decision = schedule.schedule_decision(date(2026, 8, 22), tmp_path / "missing.sqlite", target)
    assert decision["state"] == "not-configured" and decision["active"] is False


def test_generated_2026_config_is_official_separate_and_not_visible_early() -> None:
    base = uvtool.load_config(uvtool.DEFAULT_CONFIG)
    base_before = json.loads(json.dumps(base))
    generated = automatic.configured_targets(base, {family: discovered(family) for family in automatic.TARGETS})
    assert base == base_before, "base config must remain untouched before explicit apply"
    races = [race for race in generated["races"] if race.get("year") == 2026]
    assert {race["race_key"] for race in races} == {"ultravasan90-2026", "ultravasan45-2026"}
    assert len({race["event_code"] for race in races}) == 2
    assert all(Path(automatic.urlparse(race["official_url"]).path).parts[1] == "2027" for race in races)
    assert all(automatic.urlparse(race["official_url"]).hostname == automatic.OFFICIAL_HOST for race in races)
    assert next(race for race in races if race["race_family"] == "uv90")["course_version_id"] == "uv90-2026-v1"
    assert next(race for race in races if race["race_family"] == "uv45")["course_version"] == "uv45-current"
    uv90 = next(race for race in races if race["race_family"] == "uv90")
    assert [checkpoint["checkpoint_key"] for checkpoint in uv90["checkpoints"]] == [
        "start", "high_point", "smagan", "mangsbodarna", "risberg", "evertsberg",
        "oxberg", "hokberg", "eldris", "mora_warning", "mora",
    ]
    assert next(cp for cp in uv90["checkpoints"] if cp["checkpoint_key"] == "high_point")["distance_km"] is None
    assert next(cp for cp in uv90["checkpoints"] if cp["checkpoint_key"] == "mora_warning")["distance_km"] is None


def test_event_guards_reject_wrong_year_elite_and_shared_event() -> None:
    base = uvtool.load_config(uvtool.DEFAULT_CONFIG)
    wrong = discovered("uv90")
    wrong["year"] = 2025
    with pytest.raises(ValueError, match="not 2026"):
        automatic.configured_targets(base, {"uv90": wrong, "uv45": discovered("uv45")})
    elite = discovered("uv45")
    elite["label"] = "Ultravasan 45 Elit"
    with pytest.raises(ValueError, match="label differs"):
        automatic.configured_targets(base, {"uv90": discovered("uv90"), "uv45": elite})
    shared = discovered("uv45")
    shared["event_code"] = discovered("uv90")["event_code"]
    with pytest.raises(ValueError, match="explicit binding"):
        automatic.configured_targets(base, {"uv90": discovered("uv90"), "uv45": shared})


def test_future_year_without_preconfigured_editions_is_blocked() -> None:
    base = uvtool.load_config(uvtool.DEFAULT_CONFIG)
    future = {
        family: {**discovered(family), "year": 2027,
                 "event_code": f"UL{'90' if family == 'uv90' else '45'}_HCH8NDMR2701",
                 "result_year_path": 2028}
        for family in automatic.TARGETS
    }
    with pytest.raises(ValueError, match="explicitly configured"):
        automatic.configured_targets(base, future, year=2027)


def test_availability_gate_is_conservative() -> None:
    good_probe = {"details": [{}] * 10, "blocking_issues": 0, "finished": 8, "with_splits": 9}
    assert automatic.availability_blockers("uv90", 1800, good_probe) == []
    assert automatic.availability_blockers("uv45", 800, good_probe) == []
    assert automatic.availability_blockers("uv90", 100, good_probe)
    assert automatic.availability_blockers("uv90", 2501, good_probe) == []
    assert automatic.availability_blockers("uv45", 3500, good_probe) == []
    broken = {**good_probe, "blocking_issues": 1}
    assert any("parser" in item for item in automatic.availability_blockers("uv45", 800, broken))


def test_strict_parser_rejects_unknown_and_synthetic_passages() -> None:
    html = (ROOT / "tests" / "fixtures" / "mika-detail.html").read_text(encoding="utf-8")
    checkpoints = [
        {"checkpoint_key": "start", "name": "Start", "sequence_no": 0, "distance_km": 0},
        {"checkpoint_key": "smagan", "name": "Smågan", "sequence_no": 1, "distance_km": 9.2},
        {"checkpoint_key": "evertsberg", "name": "Evertsberg", "sequence_no": 4, "distance_km": 47.1},
        {"checkpoint_key": "mora", "name": "Mora mål", "sequence_no": 8, "distance_km": 92},
    ]
    parsed = uvtool.parse_detail_html(html, "EVENT:IDP", "https://results.vasaloppet.se/", checkpoints)
    issues = mika_import.validate_official_detail(parsed, html, checkpoints)
    assert not [issue for issue in issues if issue["severity"] == "error"]
    bad_html = html.replace("Smågan", "Hemlig kontroll")
    parsed = uvtool.parse_detail_html(bad_html, "EVENT:IDP", "https://results.vasaloppet.se/", checkpoints)
    issues = mika_import.validate_official_detail(parsed, bad_html, checkpoints)
    assert any(issue["code"] == "unknown-checkpoint" for issue in issues)


def test_apply_requires_literal_confirmation_before_reading_files(tmp_path: Path) -> None:
    args = argparse.Namespace(
        confirmation="NO", dry_run_report=tmp_path / "missing.json",
        work_db=tmp_path / "work.sqlite", generated_config=tmp_path / "config.json",
        production_db=tmp_path / "production.sqlite", config=tmp_path / "target.json",
        export_dir=tmp_path / "export", web_dir=tmp_path / "web",
        report=tmp_path / "report.json", github_output=None,
    )
    with pytest.raises(ValueError, match="confirmation"):
        automatic.command_apply(args)


def test_workflow_has_daily_schedule_explicit_pages_and_no_mail_code() -> None:
    workflow = (ROOT / ".github" / "workflows" / "importera-ultravasan-2026.yml").read_text(encoding="utf-8")
    assert "cron: \"17 5 * * *\"" in workflow
    assert "workflow_dispatch:" in workflow
    assert "concurrency:" in workflow
    assert "actions/deploy-pages@v4" in workflow
    assert "pages: write" in workflow and "id-token: write" in workflow
    assert "smtp" not in workflow.lower() and "sendmail" not in workflow.lower()
    assert "automatic_import_schedule.py --db data/ultravasan.sqlite" in workflow
    assert "target_year" in workflow
    assert "Manuell simulate-2025 körs i ett separat read-only-jobb oavsett datum" in workflow
    assert "github.event_name == 'workflow_dispatch' && inputs.operation == 'simulate-2025'" in workflow
    assert "steps.availability.outputs.ready == 'true'" in workflow
    assert "needs.date-gate.outputs.active == 'true'" in workflow
    assert "automatic_2026_import.py full-dry-run" in workflow
    assert "automatic_2026_import.py apply" in workflow
    assert "APPLY-AUTOMATIC-OFFICIAL-RESULTS" in workflow


def test_manual_2025_simulation_is_date_independent_and_cannot_publish() -> None:
    workflow = (ROOT / ".github" / "workflows" / "importera-ultravasan-2026.yml").read_text(encoding="utf-8")
    date_gate = workflow[workflow.index("  date-gate:"):workflow.index("  simulate-2025:")]
    simulation = workflow[workflow.index("  simulate-2025:"):workflow.index("  import-and-package:")]
    assert "automatic_import_schedule.py" in date_gate
    assert "actions/checkout" in date_gate
    assert "contents: read" in simulation
    assert '--work-db "$RUNNER_TEMP/automatic-2025.sqlite"' in simulation
    assert "data/ultravasan.sqlite" not in simulation
    assert "deploy-pages" not in simulation
    assert "git push" not in simulation


def test_list_pagination_collects_more_than_6000_unique_results(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    class FakeFetcher:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def get(self, url, cache):
            return "unused", 200, False, "http"

        def close(self) -> None:
            pass

    def fake_entries(html, url):
        page = int(url.split("page=")[1].split("&")[0])
        size = 100 if page <= 60 else 1 if page == 61 else 0
        return [{"idp": f"idp-{page}-{index}", "url": url} for index in range(size)]

    monkeypatch.setattr(mika_import, "Fetcher", FakeFetcher)
    monkeypatch.setattr(mika_import, "extract_entries", fake_entries)
    race = {"race_key": "ultravasan90-2026", "event_code": "UL90_TEST", "max_pages": 250, "empty_pages_to_stop": 2}
    entries, pages = automatic.collect_list_entries(race, tmp_path, 0)
    assert len(entries) == 6001
    assert pages[-1]["page"] == 63
