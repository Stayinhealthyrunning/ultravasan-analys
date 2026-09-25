import json, sqlite3
from pathlib import Path

DB=Path(__file__).resolve().parents[1]/"data"/"ultravasan.sqlite"

def test_sprint_warning_by_year_diagnostic():
    con=sqlite3.connect(DB)
    con.row_factory=sqlite3.Row
    rows=con.execute("""
      SELECT ra.race_key,ra.year,ra.distance_km,
             cp.checkpoint_key,cp.name checkpoint_name,cp.distance_km warning_distance,
             COUNT(s.id) total,
             SUM(CASE WHEN COALESCE(s.is_estimated,0)=0 AND s.elapsed_seconds IS NOT NULL THEN 1 ELSE 0 END) exact_count,
             SUM(CASE WHEN COALESCE(s.is_estimated,0)=0 AND s.elapsed_seconds IS NOT NULL
                       AND re.status='FINISHED' AND re.finish_seconds>s.elapsed_seconds THEN 1 ELSE 0 END) eligible,
             SUM(CASE WHEN COALESCE(s.is_estimated,0)=0 AND s.elapsed_seconds IS NOT NULL
                       AND re.status='FINISHED' AND re.finish_seconds>s.elapsed_seconds
                       AND upper(COALESCE(re.sex,'')) IN ('F','W','K','D') THEN 1 ELSE 0 END) female,
             SUM(CASE WHEN COALESCE(s.is_estimated,0)=0 AND s.elapsed_seconds IS NOT NULL
                       AND re.status='FINISHED' AND re.finish_seconds>s.elapsed_seconds
                       AND upper(COALESCE(re.sex,'')) IN ('M','H') THEN 1 ELSE 0 END) male
      FROM races ra
      JOIN checkpoints cp ON cp.race_id=ra.id
      LEFT JOIN splits s ON s.checkpoint_id=cp.id
      LEFT JOIN results re ON re.id=s.result_id
      WHERE cp.checkpoint_key='mora_warning'
         OR lower(cp.name) LIKE '%förvar%'
         OR lower(cp.name) LIKE '%forvar%'
      GROUP BY ra.id,cp.id
      ORDER BY ra.year,ra.race_key
    """).fetchall()
    classes=con.execute("""
      SELECT ra.race_key,re.sex,re.age_class,COUNT(*) n
      FROM races ra
      JOIN results re ON re.race_id=ra.id
      JOIN splits s ON s.result_id=re.id
      JOIN checkpoints cp ON cp.id=s.checkpoint_id
      WHERE cp.checkpoint_key='mora_warning'
        AND COALESCE(s.is_estimated,0)=0
        AND s.elapsed_seconds IS NOT NULL
        AND re.status='FINISHED'
        AND re.finish_seconds>s.elapsed_seconds
      GROUP BY ra.race_key,re.sex,re.age_class
      ORDER BY ra.year,ra.race_key,re.sex,re.age_class
    """).fetchall()
    con.close()
    out={"warnings":[dict(r) for r in rows],"classes":[dict(r) for r in classes]}
    raise AssertionError("SPRINT_YEAR_DIAGNOSTIC="+json.dumps(out,ensure_ascii=False,sort_keys=True))
