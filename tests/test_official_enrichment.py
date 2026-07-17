from pathlib import Path
import json
import sqlite3
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import mika_import
import official_enrichment
import uvtool


def result_connection(rows):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE results (
        id INTEGER PRIMARY KEY, race_id INTEGER, bib TEXT, name_as_published TEXT,
        finish_seconds INTEGER, overall_place INTEGER, age_class TEXT,
        nationality TEXT, club TEXT, city TEXT, sex TEXT, gender_place INTEGER,
        class_place INTEGER, status TEXT
    )""")
    conn.executemany("INSERT INTO results VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    return conn


def parsed_result(**changes):
    values = dict(
        source_result_id="EVENT:IDP", source_url="https://example.test/detail",
        bib="1025", name="Hermansson, Andreas", sex="M", age_class="M21",
        nationality="SWE", club="Perbellum SS", status="FINISHED",
        finish_seconds=26280, overall_place=22, gender_place=20, class_place=11,
        splits=[],
    )
    values.update(changes)
    return uvtool.ParsedResult(**values)


def db_row(id=11545, bib="1025", name="Hermansson, Andreas", finish=26280, overall=22, age_class="M21"):
    return (id, 9, bib, name, finish, overall, age_class, "SWE", "Perbellum SS", None, "M", 20, 11, "FINISHED")


def detail_fixture():
    return (ROOT / "tests/fixtures/mika-uv90-2016-detail.html").read_text(encoding="utf-8")


def race_checkpoints():
    config = uvtool.load_config(ROOT / "config/races.json")
    return uvtool.get_race_config(config, "ultravasan90-2016")["checkpoints"]


def test_full_pagination_deduplicates_idp_and_stops_dynamically():
    pages = {
        1: [("A", "Runner A"), ("B", "Runner B")],
        2: [("B", "Runner B"), ("C", "Runner C")],
        3: [("C", "Runner C")],
        4: [("C", "Runner C")],
    }
    def fetch(page, url):
        links = "".join(f'<a href="?content=detail&idp={idp}">{name}</a>' for idp, name in pages[page])
        return links, {"page": page}
    race = {"page_url_template": "https://example.test/?page={page}"}
    entries, report = official_enrichment.paginate_entries(race, fetch, empty_pages_to_stop=2)
    assert [entry["idp"] for entry in entries] == ["A", "B", "C"]
    assert len(report) == 4
    assert report[1]["duplicate_idp"] == ["B"]


def test_level_two_exact_name_and_finish_match():
    conn = result_connection([db_row()])
    match = mika_import.match_existing_result(conn, 9, parsed_result(bib=None))
    assert (match["status"], match["level"], match["result_id"]) == ("matched", 2, 11545)


def test_level_three_exact_name_overall_and_class_match():
    conn = result_connection([db_row()])
    match = mika_import.match_existing_result(conn, 9, parsed_result(bib=None, finish_seconds=None))
    assert (match["status"], match["level"], match["result_id"]) == ("matched", 3, 11545)


def test_ambiguous_exact_name_and_finish_is_skipped():
    conn = result_connection([db_row(id=1, bib=None), db_row(id=2, bib=None)])
    match = mika_import.match_existing_result(conn, 9, parsed_result(bib=None))
    assert match["status"] == "ambiguous"
    assert match["result_id"] is None


def test_conflicting_exact_bib_is_skipped():
    conn = result_connection([db_row(name="Different, Runner")])
    match = mika_import.match_existing_result(conn, 9, parsed_result())
    assert match["status"] == "conflict"
    assert match["result_id"] is None


def test_unmatched_official_result_is_skipped():
    conn = result_connection([])
    assert mika_import.match_existing_result(conn, 9, parsed_result())["status"] == "unmatched"


def test_finisher_has_eight_valid_official_passages():
    parsed = uvtool.parse_detail_html(detail_fixture(), "EVENT:IDP", "https://example.test", race_checkpoints())
    assert official_enrichment.validate_detail(parsed, detail_fixture(), race_checkpoints()) == []
    assert len(parsed.splits) == 8


def test_dnf_keeps_partial_series_without_synthetic_mora():
    html = """<table><tr><th>Status</th><td>DNF</td></tr><tr><th>Namn</th><td>Test, Dnf</td></tr>
      <tr class='split'><th class='desc'>Smågan</th><td class='time_day'>06:01:00</td><td class='time'>01:01:00</td><td class='diff'>01:01:00</td></tr>
      <tr class='split'><th class='desc'>Mångsbodarna</th><td class='time_day'>07:35:00</td><td class='time'>02:35:00</td><td class='diff'>01:34:00</td></tr></table>"""
    parsed = uvtool.parse_detail_html(html, "EVENT:DNF", "https://example.test", race_checkpoints())
    assert official_enrichment.validate_detail(parsed, html, race_checkpoints()) == []
    assert [split["checkpoint_key"] for split in parsed.splits] == ["smagan", "mangsbodarna"]


def test_estimated_future_rows_are_ignored_and_started_remains_unknown():
    html = """<table><tr><th>Status</th><td>Startat</td></tr><tr><th>Namn</th><td>Test, Started</td></tr>
      <tr class='split'><th class='desc'>Smågan</th><td class='time_day'>06:01:00</td><td class='time'>01:01:00</td><td class='diff'>01:01:00</td></tr>
      <tr class='estimated text-muted split'><th class='desc'>Mångsbodarna <strong>*</strong></th><td class='time_day'>07:35:00</td><td class='time'>02:35:00</td><td class='diff'>01:34:00</td></tr>
      <tr class='f-time_finish_brutto estimated text-muted'><th class='desc'>Mål <strong>*</strong></th><td class='time_day'>12:00:00</td><td class='time'>07:00:00</td><td class='diff'>01:00:00</td></tr>
    </table>"""
    parsed = uvtool.parse_detail_html(html, "EVENT:STARTED", "https://example.test", race_checkpoints())
    issues = official_enrichment.validate_detail(parsed, html, race_checkpoints())
    assert parsed.status == "UNKNOWN"
    assert parsed.finish_seconds is None
    assert [split["checkpoint_key"] for split in parsed.splits] == ["smagan"]
    assert [issue["code"] for issue in issues] == ["estimated-source-rows-ignored"]


def test_segment_and_time_of_day_errors_are_detected():
    html = detail_fixture().replace('<td class="diff right">41:16</td>', '<td class="diff right">40:00</td>', 1)
    parsed = uvtool.parse_detail_html(html, "EVENT:IDP", "https://example.test", race_checkpoints())
    codes = {issue["code"] for issue in official_enrichment.validate_detail(parsed, html, race_checkpoints())}
    assert "segment-mismatch" in codes


def test_segment_across_missing_checkpoint_is_warning_not_error():
    html = detail_fixture().replace(
        '<tr class="f-time_06 split"><th class="desc">Hökberg</th><td class="time_day">10:40:16</td><td class="time">05:40:16</td><td class="diff right">46:58</td><td class="min_km right">05:14</td><td class="kmh right">11.50</td><td class="place right">22</td></tr>',
        '<tr class="f-time_06 estimated text-muted split"><th class="desc">Hökberg <strong>*</strong></th><td class="time_day">10:40:16</td><td class="time">05:40:16</td><td class="diff right">46:58</td><td class="min_km right">05:14</td><td class="kmh right">11.50</td><td class="place right">22</td></tr>',
    )
    parsed = uvtool.parse_detail_html(html, "EVENT:GAP", "https://example.test", race_checkpoints())
    issues = official_enrichment.validate_detail(parsed, html, race_checkpoints())
    codes = {issue["code"]: issue["severity"] for issue in issues}
    assert codes["segment-basis-missing-checkpoint"] == "warning"
    assert "segment-mismatch" not in codes


def test_dry_run_and_apply_guards(tmp_path):
    production = tmp_path / "production.sqlite"
    production.write_bytes(b"db")
    with pytest.raises(ValueError):
        official_enrichment.require_safe_database_target(production, production)
    with pytest.raises(ValueError):
        official_enrichment.require_safe_database_target(production, production, apply=True, confirmation="wrong")
    official_enrichment.require_safe_database_target(
        production, production, apply=True, confirmation=official_enrichment.APPLY_CONFIRMATION
    )


def test_apply_report_guard_requires_exact_reviewed_counts():
    report = {
        "mode": "full-dry-run", "decision": official_enrichment.READY_DECISION,
        "race_key": official_enrichment.EXACT_RACE_KEY,
        "race_id": official_enrichment.EXACT_RACE_ID,
        "event_code": official_enrichment.EXACT_EVENT_CODE,
        "summary": {
            **official_enrichment.EXPECTED_DRY_RUN,
            "matching": {"safe_unique": 985, "ambiguous": 0, "conflicts": 1, "unmatched": 0, "per_level": {"1": 985}},
        },
        "passes": [{"inserted": 6190}, {"inserted": 0, "updated": 0, "noop": 6190}],
        "participants": [
            {"official_idp": "9999991678885A000026D718", "match": {"status": "conflict"}}
        ] + [{"official_idp": str(index), "match": {"status": "matched"}} for index in range(985)],
    }
    official_enrichment.validate_apply_report(report)
    report["summary"]["intended_splits"] = 6189
    with pytest.raises(ValueError, match="intended_splits"):
        official_enrichment.validate_apply_report(report)


def test_work_database_copy_is_byte_identical_and_not_overwritten(tmp_path):
    source = tmp_path / "production.sqlite"
    work = tmp_path / "work.sqlite"
    source.write_bytes(b"production database bytes")
    expected = official_enrichment.sha256_file(source)
    assert official_enrichment.prepare_work_database(source, work, expected) == expected
    assert work.read_bytes() == source.read_bytes()
    with pytest.raises(FileExistsError):
        official_enrichment.prepare_work_database(source, work, expected)


def test_idempotent_enrichment_creates_no_results_athletes_or_links(tmp_path):
    db = tmp_path / "dry-run.sqlite"
    uvtool.init_db(db, ROOT / "config/races.json")
    conn = uvtool.connect(db)
    race = conn.execute("SELECT * FROM races WHERE race_key='ultravasan90-2016'").fetchone()
    vasanerd = conn.execute("SELECT * FROM sources WHERE code='vasanerd'").fetchone()
    official = conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
    athlete_id = conn.execute(
        "INSERT INTO athletes(canonical_name,normalized_name,sex) VALUES(?,?,?)",
        ("Hermansson, Andreas", "hermansson andreas", "M"),
    ).lastrowid
    result_id = conn.execute(
        """INSERT INTO results(race_id,athlete_id,source_id,source_result_id,bib,name_as_published,sex,
             age_class,nationality,club,status,finish_seconds,overall_place,gender_place,class_place)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (race["id"], athlete_id, vasanerd["id"], "VASANERD", "1025", "Hermansson, Andreas", "M",
         "M21", "SWE", "Perbellum SS", "FINISHED", 26280, 22, 20, 11),
    ).lastrowid
    conn.execute(
        "INSERT INTO athlete_external_ids(athlete_id,source_id,external_id) VALUES(?,?,?)",
        (athlete_id, vasanerd["id"], "PERSON"),
    )
    conn.commit()
    parsed = uvtool.parse_detail_html(detail_fixture(), "EVENT:IDP", "https://example.test", race_checkpoints())
    participant = {
        "official_idp": "IDP", "event_code": "EVENT", "detail_url": "https://example.test",
        "http_status": 200, "fetched_at": "2026-01-01T00:00:00+00:00", "content_sha256": "abc",
        "cache_path": "raw/detail.html", "source_record_id": 1, "parsed": parsed, "issues": [],
        "match": {"status": "matched", "result_id": result_id},
    }
    checkpoints = conn.execute("SELECT * FROM checkpoints WHERE race_id=? ORDER BY sequence_no", (race["id"],)).fetchall()
    first = official_enrichment.enrich_pass(conn, race, official, checkpoints, [participant], 1)
    second = official_enrichment.enrich_pass(conn, race, official, checkpoints, [participant], 2)
    assert (first["inserted"], second["noop"], second["inserted"], second["updated"]) == (8, 8, 0, 0)
    for key in ("results_all", "results_race", "athletes", "athlete_external_ids"):
        assert first["counts_before"][key] == second["counts_after"][key]
    assert conn.execute("SELECT COUNT(*) FROM results WHERE race_id=?", (race["id"],)).fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM athletes").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM athlete_external_ids").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM splits WHERE result_id=?", (result_id,)).fetchone()[0] == 8
    conn.close()


def test_missing_checkpoint_keeps_raw_segment_but_does_not_store_it(tmp_path):
    db = tmp_path / "gap.sqlite"
    uvtool.init_db(db, ROOT / "config/races.json")
    conn = uvtool.connect(db)
    race = conn.execute("SELECT * FROM races WHERE race_key='ultravasan90-2016'").fetchone()
    vasanerd = conn.execute("SELECT * FROM sources WHERE code='vasanerd'").fetchone()
    official = conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
    athlete_id = conn.execute(
        "INSERT INTO athletes(canonical_name,normalized_name,sex) VALUES(?,?,?)",
        ("Hermansson, Andreas", "hermansson andreas", "M"),
    ).lastrowid
    result_id = conn.execute(
        """INSERT INTO results(race_id,athlete_id,source_id,source_result_id,bib,name_as_published,status)
             VALUES(?,?,?,?,?,?,?)""",
        (race["id"], athlete_id, vasanerd["id"], "VASANERD-GAP", "1025", "Hermansson, Andreas", "FINISHED"),
    ).lastrowid
    html = detail_fixture().replace(
        '<tr class="f-time_06 split"><th class="desc">Hökberg</th><td class="time_day">10:40:16</td><td class="time">05:40:16</td><td class="diff right">46:58</td><td class="min_km right">05:14</td><td class="kmh right">11.50</td><td class="place right">22</td></tr>',
        '<tr class="f-time_06 estimated text-muted split"><th class="desc">Hökberg <strong>*</strong></th><td class="time_day">10:40:16</td><td class="time">05:40:16</td><td class="diff right">46:58</td><td class="min_km right">05:14</td><td class="kmh right">11.50</td><td class="place right">22</td></tr>',
    )
    parsed = uvtool.parse_detail_html(html, "EVENT:GAP", "https://example.test", race_checkpoints())
    participant = {
        "official_idp": "GAP", "event_code": "EVENT", "detail_url": "https://example.test",
        "http_status": 200, "fetched_at": "2026-01-01T00:00:00+00:00", "content_sha256": "abc",
        "cache_path": "raw/detail.html", "source_record_id": 1, "parsed": parsed,
        "issues": official_enrichment.validate_detail(parsed, html, race_checkpoints()),
        "match": {"status": "matched", "result_id": result_id},
    }
    checkpoints = conn.execute("SELECT * FROM checkpoints WHERE race_id=? ORDER BY sequence_no", (race["id"],)).fetchall()
    official_enrichment.enrich_pass(conn, race, official, checkpoints, [participant], 1)
    eld = conn.execute(
        """SELECT s.segment_seconds,s.pace_seconds_per_km,s.raw_json FROM splits s
             JOIN checkpoints c ON c.id=s.checkpoint_id WHERE s.result_id=? AND c.checkpoint_key='eldris'""",
        (result_id,),
    ).fetchone()
    assert eld["segment_seconds"] is None
    assert eld["pace_seconds_per_km"] is None
    assert json.loads(eld["raw_json"])["official_split"]["segment_seconds"] is not None
    conn.close()
