import json
import sqlite3
from pathlib import Path

DB=Path(__file__).resolve().parents[1]/"data"/"ultravasan.sqlite"

def test_diagnose_2026_sprint_source():
    con=sqlite3.connect(DB)
    con.row_factory=sqlite3.Row
    races=con.execute("""
        SELECT id,race_key,name,year,distance_km
        FROM races WHERE year=2026 ORDER BY race_key
    """).fetchall()
    out={"races":[]}
    for race in races:
        cps=con.execute("""
            SELECT c.id,c.checkpoint_key,c.name,c.sequence_no,c.distance_km,
                   COUNT(s.id) AS split_count,
                   SUM(CASE WHEN COALESCE(s.is_estimated,0)=0 AND s.elapsed_seconds IS NOT NULL THEN 1 ELSE 0 END) AS exact_count
            FROM checkpoints c
            LEFT JOIN splits s ON s.checkpoint_id=c.id
            WHERE c.race_id=?
            GROUP BY c.id
            ORDER BY c.sequence_no
        """,(race["id"],)).fetchall()
        sex_counts=con.execute("""
            SELECT c.checkpoint_key,c.name,r.sex,COUNT(*) AS n,
                   SUM(CASE WHEN COALESCE(s.is_estimated,0)=0 AND s.elapsed_seconds IS NOT NULL THEN 1 ELSE 0 END) AS exact_n
            FROM splits s
            JOIN checkpoints c ON c.id=s.checkpoint_id
            JOIN results r ON r.id=s.result_id
            WHERE r.race_id=? AND (
              lower(c.checkpoint_key) LIKE '%mora%' OR
              lower(c.name) LIKE '%mora%' OR
              lower(c.name) LIKE '%förvar%' OR
              lower(c.name) LIKE '%forvar%'
            )
            GROUP BY c.checkpoint_key,c.name,r.sex
            ORDER BY c.sequence_no,r.sex
        """,(race["id"],)).fetchall()
        classes=con.execute("""
            SELECT sex,age_class,COUNT(*) AS n
            FROM results
            WHERE race_id=? AND status='FINISHED'
            GROUP BY sex,age_class
            ORDER BY sex,age_class
        """,(race["id"],)).fetchall()
        out["races"].append({
            "race":dict(race),
            "checkpoints":[dict(x) for x in cps],
            "mora_sex_counts":[dict(x) for x in sex_counts],
            "classes":[dict(x) for x in classes],
        })
    con.close()
    raise AssertionError("SPRINT_DB_DIAGNOSTIC="+json.dumps(out,ensure_ascii=False,sort_keys=True))
