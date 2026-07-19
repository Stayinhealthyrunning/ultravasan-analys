from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import tempfile
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import uvtool  # noqa: E402


def fixture_db(path: Path) -> tuple[sqlite3.Connection, int, int]:
    conn = uvtool.connect(path)
    conn.executescript((ROOT / "tools" / "schema.sql").read_text(encoding="utf-8"))
    source_id = conn.execute(
        "INSERT INTO sources(code,name,source_type) VALUES('vasaloppet_mika','Mika','official')"
    ).lastrowid
    race_id = conn.execute("""
        INSERT INTO races(race_key,name,year,distance_km)
        VALUES('ultravasan45-fixture','Ultravasan 45 fixture',2025,45.0)
    """).lastrowid
    conn.commit()
    return conn, race_id, source_id


def parsed(
    external_id: str,
    *,
    bib: str,
    age_class: str,
    status: str,
    finish_seconds: int | None,
) -> uvtool.ParsedResult:
    return uvtool.ParsedResult(
        source_result_id=external_id,
        source_url=f"https://example.test/{external_id}",
        bib=bib,
        name="Same, Runner",
        sex="F",
        age_class=age_class,
        status=status,
        finish_seconds=finish_seconds,
        overall_place=10 if finish_seconds else None,
        splits=[],
    )


def save_pair(conn: sqlite3.Connection, race_id: int, source_id: int) -> tuple[int, int]:
    first_id, _ = uvtool.save_result(
        conn,
        race_id,
        source_id,
        45.0,
        [],
        parsed("EVENT:FIRST", bib="4100", age_class="W40", status="DNF", finish_seconds=None),
    )
    second_id, _ = uvtool.save_result(
        conn,
        race_id,
        source_id,
        45.0,
        [],
        parsed("EVENT:SECOND", bib="4200", age_class="W50", status="FINISHED", finish_seconds=18000),
    )
    conn.commit()
    return first_id, second_id


def test_same_name_same_race_official_results_get_distinct_athletes() -> None:
    with tempfile.TemporaryDirectory() as temp:
        conn, race_id, source_id = fixture_db(Path(temp) / "identity.sqlite")
        first_id, second_id = save_pair(conn, race_id, source_id)
        rows = conn.execute(
            "SELECT id,athlete_id,bib,age_class,status,finish_seconds FROM results ORDER BY id"
        ).fetchall()
        links = conn.execute(
            "SELECT external_id,athlete_id FROM athlete_external_ids ORDER BY external_id"
        ).fetchall()
        conn.close()
        assert [row["id"] for row in rows] == [first_id, second_id]
        assert len({row["athlete_id"] for row in rows}) == 2
        assert [(row["bib"], row["age_class"], row["status"], row["finish_seconds"]) for row in rows] == [
            ("4100", "W40", "DNF", None),
            ("4200", "W50", "FINISHED", 18000),
        ]
        assert len({row["athlete_id"] for row in links}) == 2


def test_export_refuses_conflicting_same_source_performances() -> None:
    with tempfile.TemporaryDirectory() as temp:
        temp_path = Path(temp)
        db_path = temp_path / "collision.sqlite"
        conn, race_id, source_id = fixture_db(db_path)
        first_id, second_id = save_pair(conn, race_id, source_id)
        first_athlete = conn.execute("SELECT athlete_id FROM results WHERE id=?", (first_id,)).fetchone()[0]
        conn.execute("UPDATE results SET athlete_id=? WHERE id=?", (first_athlete, second_id))
        conn.commit()
        conn.close()

        args = argparse.Namespace(
            db=db_path,
            output=temp_path / "out.json",
            js_output=temp_path / "out.js",
        )
        with pytest.raises(uvtool.IdentityCollisionError, match="ultravasan45-fixture"):
            uvtool.export_web(args)


def test_production_database_has_no_same_race_identity_collisions() -> None:
    conn = uvtool.connect(ROOT / "data" / "ultravasan.sqlite")
    collisions = uvtool.collect_same_race_identity_collisions(conn)
    assert collisions == []
    assert conn.execute("SELECT COUNT(*) FROM results").fetchone()[0] == 21_172
    conn.close()


def test_anna_forslund_2025_and_robert_andersson_2015_are_separate_in_database() -> None:
    conn = uvtool.connect(ROOT / "data" / "ultravasan.sqlite")
    cases = {
        "ultravasan45-2025": ("Forslund, Anna", {"4168", "4336"}),
        "ultravasan45-2015": ("Andersson, Robert", {"4029", "4030"}),
    }
    for race_key, (name, bibs) in cases.items():
        rows = conn.execute("""
            SELECT res.id,res.athlete_id,res.bib,res.age_class,res.status,res.finish_seconds,
                   res.source_result_id,COUNT(sp.id) split_count
            FROM results res
            JOIN races race ON race.id=res.race_id
            LEFT JOIN splits sp ON sp.result_id=res.id
            WHERE race.race_key=? AND res.name_as_published=?
            GROUP BY res.id
            ORDER BY res.bib
        """, (race_key, name)).fetchall()
        assert len(rows) == 2
        assert {row["bib"] for row in rows} == bibs
        assert len({row["athlete_id"] for row in rows}) == 2
        assert len({row["source_result_id"] for row in rows}) == 2
    conn.close()


def test_web_export_keeps_collision_cases_and_status_evidence_separate() -> None:
    payload = json.loads((ROOT / "docs" / "data" / "ultravasan.json").read_text(encoding="utf-8"))
    races = {race["race_key"]: race["id"] for race in payload["races"]}
    assert len(payload["results"]) == 21_172

    anna = [
        row for row in payload["results"]
        if row["race_id"] == races["ultravasan45-2025"] and row["name_as_published"] == "Forslund, Anna"
    ]
    assert {(row["bib"], row["age_class"], row["status"], row.get("finish_seconds")) for row in anna} == {
        ("4168", "W40", "DNF", None),
        ("4336", "W50", "FINISHED", 30_841),
    }
    anna_splits = {
        row["id"]: [split for split in payload["splits"] if split["result_id"] == row["id"]]
        for row in anna
    }
    assert sorted(len(rows) for rows in anna_splits.values()) == [4, 6]
    assert all(split["checkpoint_key"] != "mora" for split in anna_splits[next(row["id"] for row in anna if row["status"] == "DNF")])

    robert = [
        row for row in payload["results"]
        if row["race_id"] == races["ultravasan45-2015"] and row["name_as_published"] == "Andersson, Robert"
    ]
    assert {(row["bib"], row["age_class"], row["status"], row.get("finish_seconds")) for row in robert} == {
        ("4029", "M35", "DNS", None),
        ("4030", "M21", "FINISHED", 23_183),
    }
    dns_id = next(row["id"] for row in robert if row["status"] == "DNS")
    assert not any(split["result_id"] == dns_id for split in payload["splits"])
