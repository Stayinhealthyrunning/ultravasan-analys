import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "ultravasan.sqlite"
WEB = ROOT / "docs" / "data" / "ultravasan.json"


def _db_snapshot():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT r.race_key, r.year, r.distance_km,
               cp.checkpoint_key, cp.name checkpoint_name, cp.distance_km checkpoint_distance_km,
               COUNT(s.id) split_count,
               SUM(CASE WHEN s.elapsed_seconds IS NOT NULL THEN 1 ELSE 0 END) elapsed_count,
               SUM(CASE WHEN COALESCE(s.is_estimated,0)=0 THEN 1 ELSE 0 END) exact_count,
               SUM(CASE WHEN res.status='FINISHED' AND s.elapsed_seconds IS NOT NULL
                         AND COALESCE(s.is_estimated,0)=0 THEN 1 ELSE 0 END) exact_finished_count
        FROM races r
        JOIN checkpoints cp ON cp.race_id=r.id
        LEFT JOIN splits s ON s.checkpoint_id=cp.id
        LEFT JOIN results res ON res.id=s.result_id
        WHERE r.year=2026
        GROUP BY r.id,cp.id
        ORDER BY r.race_key,cp.sequence_no
    """).fetchall()
    classes = conn.execute("""
        SELECT r.race_key,res.sex,res.age_class,COUNT(*) n
        FROM races r JOIN results res ON res.race_id=r.id
        WHERE r.year=2026
        GROUP BY r.race_key,res.sex,res.age_class
        ORDER BY r.race_key,res.sex,res.age_class
    """).fetchall()
    conn.close()
    return [dict(row) for row in rows], [dict(row) for row in classes]


def _web_snapshot():
    with WEB.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    races = {row["id"]: row for row in data["races"] if int(row.get("year") or 0)==2026}
    result_race = {row["id"]: row["race_id"] for row in data["results"] if row["race_id"] in races}
    counts = {}
    for split in data["splits"]:
        race_id = result_race.get(split.get("result_id"))
        if race_id is None:
            continue
        key = str(split.get("checkpoint_key") or "")
        bucket = counts.setdefault((race_id,key), {"split_count":0,"elapsed_count":0,"exact_count":0})
        bucket["split_count"] += 1
        if split.get("elapsed_seconds") is not None:
            bucket["elapsed_count"] += 1
        if not bool(split.get("is_estimated",0)):
            bucket["exact_count"] += 1
    out=[]
    for (race_id,key),values in counts.items():
        out.append({"race_key":races[race_id]["race_key"],"checkpoint_key":key,**values})
    return sorted(out,key=lambda row:(row["race_key"],row["checkpoint_key"]))


def test_2026_mora_warning_exists_in_db_and_public_export():
    db_rows, classes = _db_snapshot()
    web_rows = _web_snapshot()
    db_warning = [row for row in db_rows if row["checkpoint_key"]=="mora_warning" or "förvarning" in str(row["checkpoint_name"]).lower() or "forvarning" in str(row["checkpoint_name"]).lower()]
    web_warning = [row for row in web_rows if row["checkpoint_key"]=="mora_warning"]
    detail = {
        "db_warning": db_warning,
        "web_warning": web_warning,
        "db_mora_related": [row for row in db_rows if "mora" in str(row["checkpoint_key"]).lower() or "mora" in str(row["checkpoint_name"]).lower()],
        "classes_2026": classes,
    }
    assert db_warning and sum(int(row["exact_finished_count"] or 0) for row in db_warning)>0, json.dumps(detail,ensure_ascii=False,indent=2)
    assert web_warning and sum(int(row["exact_count"] or 0) for row in web_warning)>0, json.dumps(detail,ensure_ascii=False,indent=2)
