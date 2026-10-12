#!/usr/bin/env python3
"""Withhold possible minors from canonical and modular public Ultravasan data."""
import argparse,json,sys
from pathlib import Path
from minor_privacy import protect_payload,may_include_minor
import uvtool

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"docs/data"
CANON=DATA/"ultravasan.json"

def check():
    payload=json.loads(CANON.read_text(encoding="utf-8"))
    vulnerable=[row for row in payload.get("results",[]) if may_include_minor(row)]
    pseudonyms=[row for row in payload.get("results",[])
                if str(row.get("name_as_published") or row.get("canonical_name") or "").strip().casefold()=="anonym löpare"]
    if vulnerable:raise RuntimeError(f"Youth/mixed-17 rows remain in public canonical data: {len(vulnerable)}")
    if pseudonyms:raise RuntimeError(f"Pseudonymous individual rows remain public: {len(pseudonyms)}")
    return len(vulnerable)

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--check",action="store_true")
    args=ap.parse_args()
    if args.check:
        print(json.dumps({"status":"PASS","public_youth_or_mixed_17_rows":check()}))
        return
    payload=json.loads(CANON.read_text(encoding="utf-8"))
    total=protect_payload(payload)
    compact=json.dumps(payload,ensure_ascii=False,separators=(",",":"))
    CANON.write_text(compact,encoding="utf-8")
    (DATA/"ultravasan-data.js").write_text("window.ULTRAVASAN_DATA="+compact+";\n",encoding="utf-8")
    manifest={"generated_at":payload.get("meta",{}).get("generated_at"),
              "races":len(payload.get("races",[])),
              "results":len(payload.get("results",[])),
              "splits":len(payload.get("splits",[])),
              "bytes":CANON.stat().st_size}
    (DATA/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    uvtool.write_modular_web_data(payload,DATA,uvtool.load_config(ROOT/"config/races.json"))
    print(json.dumps({"withheld_youth_or_mixed_17_rows":total,
                      "note":"Mixed 17+ age class may include adults; all withheld by conservative policy"}))
    check()

if __name__=="__main__":main()
