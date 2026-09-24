from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import u20_identity_review as review  # noqa: E402


def fixture_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript((ROOT / "tools/schema.sql").read_text(encoding="utf-8"))
    conn.execute("INSERT INTO sources(code,name,source_type) VALUES('vasanerd','VasaNerd','test')")
    for race_id, year in enumerate((2019, 2022, 2025, 2026), 1):
        conn.execute("INSERT INTO races(id,race_key,name,year,distance_km) VALUES(?,?,?,?,90)",
                     (race_id, f"ultravasan90-{year}", "Ultravasan 90", year))
    conn.executemany("""INSERT INTO athletes(id,canonical_name,normalized_name,sex,athlete_match_status)
        VALUES(?,?,?,?,?)""", [(1, "Therese Fredriksson", "therese fredriksson", "F", "unverified"),
                                (2, "Therese Fredriksson", "therese fredriksson", "F", "unverified")])
    for result_id, race_id, athlete_id, age_class in ((1, 1, 1, "W21"), (2, 2, 1, "W35"),
                                                      (3, 3, 1, "W35"), (4, 4, 2, "W40")):
        conn.execute("""INSERT INTO results(id,race_id,athlete_id,source_id,source_result_id,name_as_published,
            sex,age_class,status) VALUES(?,?,?,?,?,?,?,?,?)""",
            (result_id, race_id, athlete_id, 1, f"r{result_id}", "Therese Fredriksson", "F", age_class, "FINISHED"))
    review.ensure_review_tables(conn)
    return conn


def test_candidate_queue_never_auto_merges_therese():
    conn = fixture_db()
    before = conn.execute("SELECT id,athlete_id FROM results ORDER BY id").fetchall()
    report = review.build_candidate_report(conn)
    therese = [candidate for candidate in report["candidates"] if candidate["normalized_name"] == "therese fredriksson"]
    assert len(therese) == 1
    assert therese[0]["result_id"] == 4
    assert therese[0]["candidate_athlete_id"] == 1
    assert therese[0]["hard_conflict"] is True  # W35 -> W40 after one year is incompatible.
    assert therese[0]["decision"] == "pending-review"
    assert therese[0]["auto_merge"] is False
    assert conn.execute("SELECT id,athlete_id FROM results ORDER BY id").fetchall() == before
    assert conn.execute("SELECT COUNT(*) FROM identity_evidence").fetchone()[0] == 0


def test_manual_approval_requires_explicit_review_and_records_evidence():
    conn = fixture_db()
    report = review.build_candidate_report(conn)
    review.record_pending(conn, report)
    candidate = next(item for item in report["candidates"] if item["result_id"] == 4)
    import pytest
    with pytest.raises(ValueError):
        review.approve_candidate(conn, result_id=4, candidate_athlete_id=1,
                                 reviewer="", person_ref="case-therese", evidence_note="approved")
    assert conn.execute("SELECT athlete_id FROM results WHERE id=4").fetchone()[0] == 2
    key = review.approve_candidate(conn, result_id=4, candidate_athlete_id=1,
                                   reviewer="human reviewer", person_ref="case-therese",
                                   evidence_note="manual source review approved")
    assert key.startswith("uvp_")
    assert conn.execute("SELECT athlete_id FROM results WHERE id=4").fetchone()[0] == 1
    evidence = conn.execute("SELECT provider,scope,decision,details_json FROM identity_evidence").fetchone()
    assert evidence[0:3] == ("manual_identity_review", "person", "verified")
    assert json.loads(evidence[3])["reviewer"] == "human reviewer"
    assert conn.execute("SELECT decision FROM athlete_match_candidates WHERE result_id=4").fetchone()[0] == "accepted-manual"


def test_same_edition_same_name_is_a_hard_collision_not_a_candidate():
    conn = fixture_db()
    conn.execute("INSERT INTO athletes(id,canonical_name,normalized_name,sex) VALUES(3,'Therese Fredriksson','therese fredriksson','F')")
    conn.execute("""INSERT INTO results(id,race_id,athlete_id,source_id,source_result_id,name_as_published,sex,status)
        VALUES(9,4,3,1,'duplicate','Therese Fredriksson','F','FINISHED')""")
    report = review.build_candidate_report(conn)
    assert report["candidate_count"] == 0
    assert report["collision_count"] == 1
    assert report["same_edition_collisions"][0]["race_keys"] == ["ultravasan90-2026"]
