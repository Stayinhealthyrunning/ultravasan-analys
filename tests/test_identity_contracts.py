from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import identity_contracts
import uvtool


def fixture() -> tuple[sqlite3.Connection, int, int, int, int]:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript((TOOLS / "schema.sql").read_text(encoding="utf-8"))
    mika = conn.execute(
        "INSERT INTO sources(code,name,source_type) VALUES('vasaloppet_mika','Mika','official')"
    ).lastrowid
    vasanerd = conn.execute(
        "INSERT INTO sources(code,name,source_type) VALUES('vasanerd','VasaNerd','aggregator')"
    ).lastrowid
    race1 = conn.execute(
        "INSERT INTO races(race_key,name,year,distance_km) VALUES('u2-2024','U2',2024,90)"
    ).lastrowid
    race2 = conn.execute(
        "INSERT INTO races(race_key,name,year,distance_km) VALUES('u2-2025','U2',2025,90)"
    ).lastrowid
    return conn, race1, race2, mika, vasanerd


def parsed(external_id: str, name: str = "Same, Runner") -> uvtool.ParsedResult:
    return uvtool.ParsedResult(
        source_result_id=external_id,
        name=name,
        sex="M",
        age_class="M40",
        status="FINISHED",
        finish_seconds=36_000,
        splits=[],
    )


def test_mika_appearance_ids_never_merge_people_by_name_or_demography() -> None:
    conn, race1, race2, mika, _ = fixture()
    uvtool.save_result(conn, race1, mika, 90.0, [], parsed("E2024:IDP-1"))
    uvtool.save_result(conn, race2, mika, 90.0, [], parsed("E2025:IDP-2"))
    rows = conn.execute("SELECT athlete_id FROM results ORDER BY race_id").fetchall()
    assert rows[0]["athlete_id"] != rows[1]["athlete_id"]
    assert conn.execute("SELECT COUNT(*) FROM athletes WHERE person_key IS NOT NULL").fetchone()[0] == 0
    evidence = conn.execute(
        "SELECT scope,decision,provider FROM identity_evidence ORDER BY id"
    ).fetchall()
    assert [(r["scope"], r["decision"], r["provider"]) for r in evidence] == [
        ("result", "observed", "vasaloppet_mika"),
        ("result", "observed", "vasaloppet_mika"),
    ]
    conn.close()


def test_vasanerd_idpe_is_verified_person_evidence_across_editions() -> None:
    conn, race1, race2, _, vasanerd = fixture()
    uvtool.save_result(conn, race1, vasanerd, 90.0, [], parsed("IDPE-77"))
    uvtool.save_result(conn, race2, vasanerd, 90.0, [], parsed("IDPE-77"))
    rows = conn.execute(
        "SELECT r.athlete_id,a.person_key FROM results r JOIN athletes a ON a.id=r.athlete_id ORDER BY r.race_id"
    ).fetchall()
    assert rows[0]["athlete_id"] == rows[1]["athlete_id"]
    assert rows[0]["person_key"] == rows[1]["person_key"]
    assert rows[0]["person_key"].startswith("uvp_")
    assert "IDPE-77" not in rows[0]["person_key"]
    evidence = conn.execute(
        "SELECT scope,decision,namespace,COUNT(*) n FROM identity_evidence GROUP BY 1,2,3"
    ).fetchone()
    assert (evidence["scope"], evidence["decision"], evidence["namespace"], evidence["n"]) == (
        "person", "verified", "idpe", 1
    )
    conn.close()


def test_person_key_is_event_scoped_deterministic_and_opaque() -> None:
    first = identity_contracts.stable_person_key("vasanerd", "idpe", "12345")
    second = identity_contracts.stable_person_key("vasanerd", "idpe", "12345")
    other = identity_contracts.stable_person_key("vasanerd", "idpe", "12346")
    assert first == second
    assert first != other
    assert "12345" not in first
