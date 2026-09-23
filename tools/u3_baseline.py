#!/usr/bin/env python3
"""Create or verify the U3 modular web-data golden master."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path
from difflib import unified_diff
from typing import Any

import u2_identity_migration
import u3_modular_check

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "ultravasan.sqlite"
DEFAULT_DATA = ROOT / "docs" / "data"
DEFAULT_BASELINE = ROOT / "reports" / "U3_BASELINE.json"


def sha256(path: Path) -> str:
    digest=hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_info(path: Path) -> dict[str, Any]:
    return {"path":path.relative_to(ROOT).as_posix(),"bytes":path.stat().st_size,"sha256":sha256(path)}


def build_snapshot() -> dict[str, Any]:
    modular=u3_modular_check.validate(DEFAULT_DATA)
    manifest=json.loads((DEFAULT_DATA/"manifest.json").read_text(encoding="utf-8"))
    bootstrap=json.loads((DEFAULT_DATA/"bootstrap.json").read_text(encoding="utf-8"))
    history=json.loads((DEFAULT_DATA/"history-index.json").read_text(encoding="utf-8"))
    conn=sqlite3.connect(DEFAULT_DB)
    conn.row_factory=sqlite3.Row
    try:
        identity=u2_identity_migration.migrated_state(conn)
        db_integrity=conn.execute("PRAGMA integrity_check").fetchone()[0]
        foreign_keys=len(conn.execute("PRAGMA foreign_key_check").fetchall())
    finally:
        conn.close()
    editions={}
    for key,entry in sorted(manifest.get("editions",{}).items(),key=lambda item:int(item[0])):
        path=ROOT/"docs"/entry["json"]
        editions[key]=file_info(path)
    return {
        "schema_version":1,
        "phase":"U3",
        "data_contract":"u3-modular-v1",
        "identity_contract":"u2-person-key-v1",
        "database":file_info(DEFAULT_DB),
        "files":{
            "bootstrap":file_info(DEFAULT_DATA/"bootstrap.json"),
            "bootstrap_js":file_info(DEFAULT_DATA/"bootstrap.js"),
            "history_index":file_info(DEFAULT_DATA/"history-index.json"),
            "history_index_js":file_info(DEFAULT_DATA/"history-index.js"),
            "fallback_monolith":file_info(DEFAULT_DATA/"ultravasan.json"),
            "fallback_monolith_js":file_info(DEFAULT_DATA/"ultravasan-data.js"),
            "manifest":file_info(DEFAULT_DATA/"manifest.json"),
            "editions":editions,
        },
        "counts":{
            "races":modular["races"],
            "results":modular["results"],
            "splits":modular["splits"],
            "person_key_rows":sum(1 for row in history["results"] if row.get("person_key")),
            "distinct_person_keys":len({row["person_key"] for row in history["results"] if row.get("person_key")}),
        },
        "loading":{
            "monolith_bytes":modular["monolith_bytes"],
            "bootstrap_bytes":modular["bootstrap_bytes"],
            "history_index_bytes":modular["history_index_bytes"],
            "first_paint_bytes":modular["first_paint_bytes"],
            "first_paint_reduction":modular["first_paint_reduction"],
        },
        "identity_state":identity,
        "checks":{
            "modular_ok":modular["ok"],
            "modular_issues":modular["issues"],
            "db_integrity":db_integrity,
            "foreign_key_violations":foreign_keys,
            "bootstrap_contract":bootstrap.get("meta",{}).get("data_contract"),
            "manifest_contract":manifest.get("data_contract"),
        },
    }


def validate(snapshot: dict[str, Any]) -> list[str]:
    issues=[]
    if snapshot["counts"]!={"races":22,"results":24422,"splits":139910,"person_key_rows":13188,"distinct_person_keys":9571}:
        issues.append(f"unexpected counts: {snapshot['counts']}")
    checks=snapshot["checks"]
    if not checks["modular_ok"]:issues.extend(checks["modular_issues"])
    if checks["db_integrity"]!="ok":issues.append(f"db_integrity={checks['db_integrity']}")
    if checks["foreign_key_violations"]!=0:issues.append(f"foreign_key_violations={checks['foreign_key_violations']}")
    if checks["bootstrap_contract"]!="u3-modular-v1" or checks["manifest_contract"]!="u3-modular-v1":
        issues.append("U3 data contract missing")
    state=snapshot["identity_state"]
    if state["person_keys"]!=9571 or state["identity_evidence"]!=20805 or state["cross_source_athletes"]!=0:
        issues.append(f"identity state regressed: {state}")
    for family,reduction in snapshot["loading"]["first_paint_reduction"].items():
        if reduction<=0:
            issues.append(f"{family} first paint is not smaller than monolith")
    return issues


def verify(path: Path) -> int:
    expected=json.loads(path.read_text(encoding="utf-8"))
    actual=build_snapshot()
    issues=validate(actual)
    if issues:
        print("U3-baslinjen är ogiltig:",file=sys.stderr)
        for issue in issues:print("-",issue,file=sys.stderr)
        return 2
    if actual==expected:
        print(
            "U3-baseline verifierad:",
            actual["counts"]["results"],"resultat,",
            actual["counts"]["splits"],"mellantider,",
            len(actual["files"]["editions"]),"edition bundles."
        )
        return 0
    left=json.dumps(expected,ensure_ascii=False,indent=2,sort_keys=True).splitlines()
    right=json.dumps(actual,ensure_ascii=False,indent=2,sort_keys=True).splitlines()
    print("U3-baseline avviker.",file=sys.stderr)
    for line in list(unified_diff(left,right,fromfile="expected",tofile="actual",lineterm=""))[:400]:
        print(line,file=sys.stderr)
    return 1


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write",action="store_true")
    mode.add_argument("--check",action="store_true")
    parser.add_argument("--output",type=Path,default=DEFAULT_BASELINE)
    args=parser.parse_args()
    if args.check:raise SystemExit(verify(args.output))
    snapshot=build_snapshot()
    issues=validate(snapshot)
    if issues:raise SystemExit("Cannot write invalid U3 baseline:\n- "+"\n- ".join(issues))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("U3-baseline written:",args.output)


if __name__=="__main__":
    main()
