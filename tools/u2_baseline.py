#!/usr/bin/env python3
"""Create or verify the exact U2 post-identity-migration baseline."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from collections import Counter
from difflib import unified_diff
from pathlib import Path
from typing import Any

import u2_identity_migration

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "ultravasan.sqlite"
DEFAULT_WEB_JSON = ROOT / "docs" / "data" / "ultravasan.json"
DEFAULT_WEB_JS = ROOT / "docs" / "data" / "ultravasan-data.js"
DEFAULT_MANIFEST = ROOT / "docs" / "data" / "manifest.json"
DEFAULT_BASELINE = ROOT / "reports" / "U2_BASELINE.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_identity(path: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def database_checks(conn: sqlite3.Connection) -> dict[str, Any]:
    return {
        "integrity_check": conn.execute("PRAGMA integrity_check").fetchone()[0],
        "foreign_key_violations": len(conn.execute("PRAGMA foreign_key_check").fetchall()),
        "duplicate_result_keys": conn.execute(
            """
            SELECT COUNT(*) FROM (
              SELECT race_id,source_id,source_result_id
              FROM results GROUP BY 1,2,3 HAVING COUNT(*)>1
            )
            """
        ).fetchone()[0],
        "duplicate_split_keys": conn.execute(
            """
            SELECT COUNT(*) FROM (
              SELECT result_id,checkpoint_id
              FROM splits GROUP BY 1,2 HAVING COUNT(*)>1
            )
            """
        ).fetchone()[0],
        "results_without_exact_external_link": conn.execute(
            """
            SELECT COUNT(*) FROM results res
            LEFT JOIN athlete_external_ids ext
              ON ext.athlete_id=res.athlete_id
             AND ext.source_id=res.source_id
             AND ext.external_id=res.source_result_id
            WHERE ext.id IS NULL
            """
        ).fetchone()[0],
        "evidence_without_athlete": conn.execute(
            """
            SELECT COUNT(*) FROM identity_evidence e
            LEFT JOIN athletes a ON a.id=e.athlete_id
            WHERE a.id IS NULL
            """
        ).fetchone()[0],
        "evidence_without_source": conn.execute(
            """
            SELECT COUNT(*) FROM identity_evidence e
            LEFT JOIN sources s ON s.id=e.source_id
            WHERE s.id IS NULL
            """
        ).fetchone()[0],
    }


def evidence_distribution(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in conn.execute(
            """
            SELECT provider,namespace,scope,decision,COUNT(*) rows
            FROM identity_evidence
            GROUP BY provider,namespace,scope,decision
            ORDER BY provider,namespace,scope,decision
            """
        )
    ]


def source_distribution(conn: sqlite3.Connection) -> dict[str, int]:
    return dict(
        sorted(
            (
                row["source_code"],
                row["rows"],
            )
            for row in conn.execute(
                """
                SELECT src.code source_code,COUNT(*) rows
                FROM results res JOIN sources src ON src.id=res.source_id
                GROUP BY src.code
                """
            )
        )
    )


def build_snapshot(
    *,
    db: Path = DEFAULT_DB,
    web_json: Path = DEFAULT_WEB_JSON,
    web_js: Path = DEFAULT_WEB_JS,
    manifest: Path = DEFAULT_MANIFEST,
) -> dict[str, Any]:
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    try:
        migrated = u2_identity_migration.migrated_state(conn)
        protected = u2_identity_migration.protected_state(conn)
        web = json.loads(web_json.read_text(encoding="utf-8"))
        web_person_keys = [
            row["person_key"] for row in web["results"] if row.get("person_key")
        ]
        return {
            "schema_version": 1,
            "phase": "U2",
            "identity_contract": "u2-person-key-v1",
            "files": {
                "database": file_identity(db),
                "web_json": file_identity(web_json),
                "web_javascript": file_identity(web_js),
                "manifest": file_identity(manifest),
            },
            "totals": {
                "race_editions": conn.execute("SELECT COUNT(*) FROM races").fetchone()[0],
                "results": conn.execute("SELECT COUNT(*) FROM results").fetchone()[0],
                "splits": conn.execute("SELECT COUNT(*) FROM splits").fetchone()[0],
                "athletes": conn.execute("SELECT COUNT(*) FROM athletes").fetchone()[0],
                "external_ids": conn.execute("SELECT COUNT(*) FROM athlete_external_ids").fetchone()[0],
                "person_keys": conn.execute("SELECT COUNT(*) FROM athletes WHERE person_key IS NOT NULL").fetchone()[0],
                "identity_evidence": conn.execute("SELECT COUNT(*) FROM identity_evidence").fetchone()[0],
                "pending_review_candidates": conn.execute(
                    "SELECT COUNT(*) FROM athlete_match_candidates WHERE decision='pending-review'"
                ).fetchone()[0],
            },
            "source_results": source_distribution(conn),
            "identity_state": migrated,
            "identity_evidence_distribution": evidence_distribution(conn),
            "protected_payload": protected,
            "checks": database_checks(conn),
            "web_export": {
                "identity_contract": web.get("meta", {}).get("identity_contract"),
                "results": len(web.get("results", [])),
                "splits": len(web.get("splits", [])),
                "person_key_rows": len(web_person_keys),
                "distinct_person_keys": len(set(web_person_keys)),
                "person_key_prefixes": dict(sorted(Counter(key[:4] for key in web_person_keys).items())),
            },
        }
    finally:
        conn.close()


def validate_snapshot(snapshot: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    totals = snapshot["totals"]
    expected = {
        "race_editions": 22,
        "results": 24422,
        "splits": 139910,
        "athletes": 20805,
        "external_ids": 20805,
        "person_keys": 9571,
        "identity_evidence": 20805,
        "pending_review_candidates": 4211,
    }
    for key, value in expected.items():
        if totals.get(key) != value:
            issues.append(f"{key}: expected {value}, got {totals.get(key)}")
    state = snapshot["identity_state"]
    if state["cross_source_athletes"] != 0:
        issues.append(f"cross_source_athletes={state['cross_source_athletes']}")
    if state["multi_edition_without_vasanerd_person_evidence"] != 0:
        issues.append(
            "multi_edition_without_vasanerd_person_evidence="
            f"{state['multi_edition_without_vasanerd_person_evidence']}"
        )
    checks = snapshot["checks"]
    if checks["integrity_check"] != "ok":
        issues.append(f"integrity_check={checks['integrity_check']}")
    for key in (
        "foreign_key_violations",
        "duplicate_result_keys",
        "duplicate_split_keys",
        "results_without_exact_external_link",
        "evidence_without_athlete",
        "evidence_without_source",
    ):
        if checks[key] != 0:
            issues.append(f"{key}={checks[key]}")
    web = snapshot["web_export"]
    if web["identity_contract"] != "u2-person-key-v1":
        issues.append(f"web identity contract={web['identity_contract']!r}")
    if web["results"] != 24422 or web["splits"] != 139910:
        issues.append(f"web parity results={web['results']} splits={web['splits']}")
    if web["person_key_rows"] != 13188 or web["distinct_person_keys"] != 9571:
        issues.append(
            f"web person keys rows={web['person_key_rows']} distinct={web['distinct_person_keys']}"
        )
    return issues


def verify(expected_path: Path) -> int:
    expected = json.loads(expected_path.read_text(encoding="utf-8"))
    actual = build_snapshot()
    issues = validate_snapshot(actual)
    if issues:
        print("U2-baslinjen har ogiltigt tillstånd:", file=sys.stderr)
        for issue in issues:
            print("-", issue, file=sys.stderr)
        return 2
    if actual == expected:
        print(
            "U2-baseline verifierad: "
            f"{actual['totals']['results']} resultat, "
            f"{actual['totals']['splits']} mellantider, "
            f"{actual['totals']['person_keys']} verifierade personnycklar."
        )
        return 0
    expected_text = json.dumps(expected, ensure_ascii=False, indent=2, sort_keys=True).splitlines()
    actual_text = json.dumps(actual, ensure_ascii=False, indent=2, sort_keys=True).splitlines()
    print("U2-baseline avviker.", file=sys.stderr)
    for line in list(unified_diff(expected_text, actual_text, fromfile="expected", tofile="actual", lineterm=""))[:400]:
        print(line, file=sys.stderr)
    return 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--write", action="store_true")
    action.add_argument("--check", action="store_true")
    parser.add_argument("--output", type=Path, default=DEFAULT_BASELINE)
    args = parser.parse_args()
    if args.check:
        raise SystemExit(verify(args.output))
    snapshot = build_snapshot()
    issues = validate_snapshot(snapshot)
    if issues:
        raise SystemExit("Cannot write invalid U2 baseline:\n- " + "\n- ".join(issues))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"U2-baseline written: {args.output}")


if __name__ == "__main__":
    main()
