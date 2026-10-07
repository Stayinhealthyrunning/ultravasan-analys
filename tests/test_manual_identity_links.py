from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "manual_identity_links.json"
DB = ROOT / "data" / "ultravasan.sqlite"


def test_therese_admin_verified_identity_link_matches_exact_source_rows():
    registry = json.loads(CONFIG.read_text(encoding="utf-8"))
    link = next(item for item in registry["links"] if item["link_id"] == "therese-fredriksson-ultravasan")
    assert link["decision"] == "admin-verified"
    assert link["person_key"] == "uvp_f913aed6732c797a9c9ce924"
    assert len(link["members"]) == 4

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = []
    for member in link["members"]:
        found = conn.execute(
            """
            SELECT r.id result_id,e.race_key,e.year,r.source_result_id,r.status,r.finish_seconds,
                   r.bib,r.name_as_published,r.athlete_id,a.person_key,a.athlete_match_status
            FROM results r
            JOIN races e ON e.id=r.race_id
            JOIN athletes a ON a.id=r.athlete_id
            WHERE e.race_key=? AND r.source_result_id=?
            """,
            (member["race_key"], member["source_result_id"]),
        ).fetchall()
        assert len(found) == 1, member
        rows.append(dict(found[0]))
    conn.close()

    assert [row["year"] for row in rows] == [2019, 2022, 2025, 2026]
    assert [row["status"] for row in rows] == ["FINISHED", "FINISHED", "DNS", "FINISHED"]
    assert all(row["name_as_published"] == "Fredriksson, Therese" for row in rows)
    existing_keys = {row["person_key"] for row in rows if row["person_key"]}
    assert existing_keys == {link["person_key"]}
    assert rows[-1]["person_key"] is None
    assert rows[-1]["athlete_match_status"] == "unverified"
