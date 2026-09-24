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
    monkeypatch.setattr(mika_import, "advertised_last_page", lambda _html: 63)
    race = {"race_key": "ultravasan90-2026", "event_code": "UL90_TEST", "max_pages": 250, "empty_pages_to_stop": 2}
    entries, pages = automatic.collect_list_entries(race, tmp_path, 0)
    assert len(entries) == 6001
    assert pages[-1]["page"] == 63
    assert automatic.list_pagination_complete(pages)


def test_list_pagination_fails_closed_when_boundary_missing_or_truncated() -> None:
    assert not automatic.list_pagination_complete([])
    assert not automatic.list_pagination_complete([
        {"partition": "ALL", "page": 1, "advertised_last_page": None, "end_confirmed": False},
    ])
    assert not automatic.list_pagination_complete([
        {"partition": "M", "page": 1, "advertised_last_page": 3, "end_confirmed": False},
        {"partition": "M", "page": 2, "advertised_last_page": 3, "end_confirmed": False},
    ])
    assert automatic.list_pagination_complete([
        {"partition": "M", "page": 1, "advertised_last_page": 2, "end_confirmed": False},
        {"partition": "M", "page": 2, "advertised_last_page": 2, "end_confirmed": True},
        {"partition": "W", "page": 1, "advertised_last_page": 1, "end_confirmed": True},
    ])


def test_official_page_boundary_is_read_from_pagination_metadata() -> None:
    html = '''<ul class="pagination">
      <li><a data-silver="112,97,103,101,61,49">1</a></li>
      <li><a data-silver="112,97,103,101,61,52">4</a></li>
    </ul>'''
    assert mika_import.advertised_last_page(html) == 4
    assert mika_import.advertised_last_page('<div class="result-list">no pagination</div>') is None


def _dry_run_args(tmp_path: Path, *, pagination_complete: bool = True) -> argparse.Namespace:
    base = uvtool.load_config(uvtool.DEFAULT_CONFIG)
    generated = automatic.configured_targets(base, {family: discovered(family) for family in automatic.TARGETS})
    config_path = tmp_path / "generated-races.json"
    config_path.write_text(json.dumps(generated), encoding="utf-8")
    availability_path = tmp_path / "availability.json"
    availability_path.write_text(json.dumps({"ready": True, "races": {
        family: {"pagination_complete": pagination_complete} for family in automatic.TARGETS
    }}), encoding="utf-8")
    production = tmp_path / "production.sqlite"
    import shutil
    shutil.copy2(uvtool.DEFAULT_DB, production)
    return argparse.Namespace(
        year=2026, generated_config=config_path, availability_report=availability_path,
        work_db=tmp_path / "work.sqlite", production_db=production, raw=tmp_path / "raw",
        delay=0.0, report=tmp_path / "reports" / "dry-run.json", export_dir=tmp_path / "exports",
        github_output=None,
    )


def _safe_import_report(**overrides: object) -> dict:
    report = {"records": 0, "warnings": 0, "details": [], "pagination_complete": True}
    report.update(overrides)
    return report


def test_full_dry_run_refuses_availability_without_complete_pagination(tmp_path: Path) -> None:
    args = _dry_run_args(tmp_path, pagination_complete=False)
    before = automatic.sha256_file(args.production_db)
    with pytest.raises(RuntimeError, match="did not prove complete official pagination"):
        automatic.command_full_dry_run(args)
    assert automatic.sha256_file(args.production_db) == before
    assert not args.work_db.exists()


def test_resume_dry_run_refuses_availability_without_complete_pagination(tmp_path: Path) -> None:
    args = _dry_run_args(tmp_path, pagination_complete=False)
    import shutil
    shutil.copy2(args.production_db, args.work_db)
    resume = argparse.Namespace(year=2026, generated_config=args.generated_config,
                                availability_report=args.availability_report, work_db=args.work_db)
    with pytest.raises(RuntimeError, match="did not prove complete official pagination"):
        automatic.command_resume_full_dry_run(resume)


@pytest.mark.parametrize("failure", ["protected-history", "identity-collision", "strict-parser"])
def test_full_dry_run_fail_closed_for_negative_fixtures(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, failure: str) -> None:
    args = _dry_run_args(tmp_path)
    before = automatic.sha256_file(args.production_db)

    def fake_import(race_key, db, _config, _raw, _report, _delay, **_kwargs):
        with uvtool.connect(db) as conn:
            if failure == "protected-history":
                conn.execute("""UPDATE results SET club='AUDIT MUTATION' WHERE id=(
                  SELECT res.id FROM results res JOIN races r ON r.id=res.race_id WHERE r.year<2026 LIMIT 1)""")
                conn.commit()
        if failure == "strict-parser":
            return _safe_import_report(details=[{"idp": "synthetic", "quality_issues": [{"severity": "error", "code": "unknown-checkpoint"}]}])
        return _safe_import_report()

    monkeypatch.setattr(automatic, "import_one", fake_import)
    if failure == "identity-collision":
        def collisions(conn):
            target_ids = {row[0] for row in conn.execute("SELECT id FROM races WHERE year=2026")}
            return [{"race_id": race_id, "identity": "synthetic-collision"} for race_id in target_ids]
        monkeypatch.setattr(uvtool, "collect_same_race_identity_collisions", collisions)
    with pytest.raises(RuntimeError) as error:
        automatic.command_full_dry_run(args)
    message = str(error.value).lower()
    expected = {"protected-history": "protected pre-2026 data changed",
                "identity-collision": "strict data-quality checks failed",
                "strict-parser": "strict data-quality checks failed"}[failure]
    assert expected in message
    assert automatic.sha256_file(args.production_db) == before
    assert args.work_db.exists(), "work-db remains available for failure diagnosis"


def test_apply_refuses_inputs_changed_after_ready_dry_run(tmp_path: Path) -> None:
    args = argparse.Namespace(
        confirmation=automatic.APPLY_CONFIRMATION, dry_run_report=tmp_path / "dry.json",
        work_db=tmp_path / "work.sqlite", generated_config=tmp_path / "generated.json",
        production_db=tmp_path / "production.sqlite", config=tmp_path / "config.json",
        export_dir=tmp_path / "exports", web_dir=tmp_path / "web", report=tmp_path / "apply.json",
        github_output=None,
    )
    import shutil
    shutil.copy2(uvtool.DEFAULT_DB, args.production_db)
    shutil.copy2(uvtool.DEFAULT_DB, args.work_db)
    args.generated_config.write_text("{}", encoding="utf-8")
    args.dry_run_report.write_text(json.dumps({
        "decision": "READY", "changed": True, "work_db_sha256": automatic.sha256_file(args.work_db),
        "generated_config_sha256": automatic.sha256_file(args.generated_config),
    }), encoding="utf-8")
    before = automatic.sha256_file(args.production_db)
    with args.work_db.open("ab") as handle:
        handle.write(b"mutated-after-review")
    with pytest.raises(RuntimeError, match="inputs changed"):
        automatic.command_apply(args)
    assert automatic.sha256_file(args.production_db) == before
    assert not args.config.exists() and not args.web_dir.exists()
