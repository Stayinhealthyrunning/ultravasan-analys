import sqlite3
from pathlib import Path

DB=Path(__file__).resolve().parents[1]/"data"/"ultravasan.sqlite"

def test_2026_sprint_source_contract():
    con=sqlite3.connect(DB)
    con.row_factory=sqlite3.Row
    try:
        for race_key in ("ultravasan90-2026","ultravasan45-2026"):
            race=con.execute("SELECT id FROM races WHERE race_key=?",(race_key,)).fetchone()
            assert race is not None, f"{race_key} saknas"
            checkpoint=con.execute("""
                SELECT id,name,distance_km FROM checkpoints
                WHERE race_id=? AND checkpoint_key='mora_warning'
            """,(race["id"],)).fetchone()
            assert checkpoint is not None, f"{race_key} saknar mora_warning"
            assert checkpoint["name"]=="Mora Förvarning"
            counts=con.execute("""
                SELECT r.sex,COUNT(*) AS n
                FROM splits s
                JOIN results r ON r.id=s.result_id
                WHERE r.race_id=? AND s.checkpoint_id=?
                  AND COALESCE(s.is_estimated,0)=0
                  AND s.elapsed_seconds IS NOT NULL
                GROUP BY r.sex
            """,(race["id"],checkpoint["id"])).fetchall()
            by_sex={row["sex"]:row["n"] for row in counts}
            assert by_sex.get("F",0)>0, f"{race_key} saknar exakta kvinnopassager vid Mora Förvarning"
            assert by_sex.get("M",0)>0, f"{race_key} saknar exakta manspassager vid Mora Förvarning"
        uv90=con.execute("""
            SELECT c.distance_km
            FROM checkpoints c JOIN races r ON r.id=c.race_id
            WHERE r.race_key='ultravasan90-2026' AND c.checkpoint_key='mora_warning'
        """).fetchone()
        assert uv90["distance_km"] is None, "Kontraktet ska fånga att UV90 2026 saknar explicit Förvarning-avstånd"
    finally:
        con.close()
