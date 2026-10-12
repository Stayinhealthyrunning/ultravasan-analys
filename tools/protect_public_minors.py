#!/usr/bin/env python3
"""Protect minors in canonical and modular public Ultravasan data."""
import argparse,json,sys
from pathlib import Path
from minor_privacy import protect_payload,may_include_minor,ANON
import uvtool

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"docs/data"
CANON=DATA/"ultravasan.json"

def check():
    payload=json.loads(CANON.read_text(encoding="utf-8"))
    vulnerable=[row for row in payload.get("results",[]) if may_include_minor(row)
      and (row.get("name_as_published")!=ANON or row.get("canonical_name")!=ANON
        or row.get("bib") not in (None,"") or row.get("athlete_id") is not None)]
    if vulnerable:raise RuntimeError(f"Unprotected youth/mixed-17 rows in public canonical data: {len(vulnerable)}")
    count=sum(may_include_minor(row) for row in payload.get("results",[]))
    return count

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--check",action="store_true")
    args=ap.parse_args()
    if args.check:
        print(json.dumps({"status":"PASS","masked_youth_category_rows":check()}))
        return
    payload=json.loads(CANON.read_text(encoding="utf-8"))
    total=protect_payload(payload)
    compact=json.dumps(payload,ensure_ascii=False,separators=(",",":"))
    CANON.write_text(compact,encoding="utf-8")
    (DATA/"ultravasan-data.js").write_text("window.ULTRAVASAN_DATA="+compact+";\n",encoding="utf-8")
    uvtool.write_modular_web_data(payload,DATA,uvtool.load_config(ROOT/"config/races.json"))
    print(json.dumps({"masked_or_remasked_youth_category_rows":total,
                      "note":"Mixed 17+ age class may include adults; all protected by conservative policy"}))
    check()

if __name__=="__main__":main()
