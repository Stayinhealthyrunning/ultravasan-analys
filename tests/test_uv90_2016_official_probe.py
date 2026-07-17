from pathlib import Path
import sqlite3
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import mika_import
import uvtool


CHECKPOINTS = [
    {"checkpoint_key": "start", "name": "Start", "sequence_no": 0, "distance_km": 0.0},
    {"checkpoint_key": "smagan", "name": "Smågan", "sequence_no": 1, "distance_km": 8.83},
    {"checkpoint_key": "mangsbodarna", "name": "Mångsbodarna", "sequence_no": 2, "distance_km": 23.27},
    {"checkpoint_key": "risberg", "name": "Risberg", "sequence_no": 3, "distance_km": 33.96},
    {"checkpoint_key": "evertsberg", "name": "Evertsberg", "sequence_no": 4, "distance_km": 46.15},
    {"checkpoint_key": "oxberg", "name": "Oxberg", "sequence_no": 5, "distance_km": 60.73},
    {"checkpoint_key": "hokberg", "name": "Hökberg", "sequence_no": 6, "distance_km": 69.72},
    {"checkpoint_key": "eldris", "name": "Eldris", "sequence_no": 7, "distance_km": 79.61},
    {"checkpoint_key": "mora", "name": "Mora mål", "sequence_no": 8, "distance_km": 90.0},
]


def parsed_hermansson():
    html = (ROOT / "tests/fixtures/mika-uv90-2016-detail.html").read_text(encoding="utf-8")
    return uvtool.parse_detail_html(html, "EVENT:IDP", "https://example.test/detail", CHECKPOINTS)


def result_conn(rows):
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


def test_observed_2016_detail_to_splits():
    parsed = parsed_hermansson()
    assert parsed.name == "Hermansson, Andreas"
    assert parsed.nationality == "SWE"
    assert parsed.bib == "1025"
    assert parsed.age_class == "M21"
    assert parsed.status == "FINISHED"
    assert parsed.finish_seconds == 7 * 3600 + 18 * 60
    assert (parsed.overall_place, parsed.gender_place, parsed.class_place) == (22, 20, 11)
    assert len(parsed.splits) == 8
    assert parsed.splits[0]["time_of_day"] == "05:41:16"
    assert parsed.splits[0]["elapsed_seconds"] == 41 * 60 + 16
    assert parsed.splits[0]["segment_seconds"] == 41 * 60 + 16
    assert parsed.splits[0]["place_gender"] == 34
    assert parsed.splits[-1]["elapsed_seconds"] == parsed.finish_seconds
    assert mika_import.validate_split_sequence(parsed, CHECKPOINTS) == []


def test_list_entry_extracts_official_idp():
    html = '<tr><td><a href="/?content=detail&idp=9999991678885A000026F3E4&event=EVENT">Hermansson, Andreas</a></td></tr>'
    entries = mika_import.extract_entries(html, "https://results.vasaloppet.se/2017/")
    assert entries[0]["idp"] == "9999991678885A000026F3E4"


def test_catalogue_uses_optgroup_year_not_opaque_event_suffix():
    html = '<select><optgroup label="Ultravasan 2016"><option value="UL90_9999991678885A00000004CC">Ultravasan 90</option></optgroup></select>'
    candidates = mika_import.extract_event_candidates(html, 2026)
    assert candidates == [{
        "year": 2016,
        "event_code": "UL90_9999991678885A00000004CC",
        "label": "Ultravasan 90",
        "catalogue_group": "Ultravasan 2016",
    }]


def test_dnf_detail_has_partial_increasing_splits():
    html = """<table>
      <tr><th>Status</th><td>DNF</td></tr><tr><th>Namn</th><td>Test, Dnf</td></tr>
      <tr class='split'><th class='desc'>Smågan</th><td class='time_day'>06:01:00</td><td class='time'>01:01:00</td><td class='diff'>01:01:00</td></tr>
      <tr class='split'><th class='desc'>Mångsbodarna</th><td class='time_day'>07:35:00</td><td class='time'>02:35:00</td><td class='diff'>01:34:00</td></tr>
    </table>"""
    parsed = uvtool.parse_detail_html(html, "EVENT:DNF", "https://example.test/dnf", CHECKPOINTS)
    assert parsed.status == "DNF"
    assert parsed.finish_seconds is None
    assert len(parsed.splits) == 2
    assert mika_import.validate_split_sequence(parsed, CHECKPOINTS) == []


def test_unique_exact_bib_match():
    parsed = parsed_hermansson()
    conn = result_conn([(11545, 9, "1025", parsed.name, parsed.finish_seconds, 22, "M21", "SWE", "Perbellum SS", None, "M", 20, 11, "FINISHED")])
    match = mika_import.match_existing_result(conn, 9, parsed)
    assert match["status"] == "matched"
    assert match["method"] == "exact-bib"
    assert match["level"] == 1
    assert match["result_id"] == 11545


def test_ambiguous_bib_is_skipped():
    parsed = parsed_hermansson()
    rows = [
        (1, 9, "1025", parsed.name, parsed.finish_seconds, 22, "M21", "SWE", "Perbellum SS", None, "M", 20, 11, "FINISHED"),
        (2, 9, "1025", parsed.name, parsed.finish_seconds, 22, "M21", "SWE", "Perbellum SS", None, "M", 20, 11, "FINISHED"),
    ]
    conn = result_conn(rows)
    match = mika_import.match_existing_result(conn, 9, parsed)
    assert match["status"] == "ambiguous"
    assert match["result_id"] is None


def test_probe_database_must_be_separate(tmp_path):
    mika_import.require_separate_probe_db(tmp_path / "probe.sqlite", ROOT / "data/ultravasan.sqlite")
    with pytest.raises(ValueError):
        mika_import.require_separate_probe_db(ROOT / "data/ultravasan.sqlite", ROOT / "data/ultravasan.sqlite")
