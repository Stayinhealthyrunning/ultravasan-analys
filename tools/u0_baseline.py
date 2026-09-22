#!/usr/bin/env python3
"""Create or verify the immutable Ultravasan 2.0 U0 data baseline.

The snapshot describes the checked-in SQLite database and its browser export.
It is intentionally stricter than the normal data validator: any data change
must either be rejected by CI or accompanied by an explicit baseline review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import subprocess
import sys
from collections import Counter
from difflib import unified_diff
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "ultravasan.sqlite"
DEFAULT_WEB_JSON = ROOT / "docs" / "data" / "ultravasan.json"
DEFAULT_WEB_JS = ROOT / "docs" / "data" / "ultravasan-data.js"
DEFAULT_MANIFEST = ROOT / "docs" / "data" / "manifest.json"
DEFAULT_BASELINE = ROOT / "reports" / "U0_BASELINE.json"
ROUTE_SOURCE_GLOBS = ("*.gpx", "*.kmz")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_identity(path: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def scalar(conn: sqlite3.Connection, sql: str, parameters: Iterable[Any] = ()) -> int:
    return int(conn.execute(sql, tuple(parameters)).fetchone()[0])


def rows_as_dicts(conn: sqlite3.Connection, sql: str, parameters: Iterable[Any] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute(sql, tuple(parameters))]


def count_by(rows: Iterable[sqlite3.Row], key: str) -> dict[str, int]:
    counts = Counter(str(row[key]) for row in rows)
    return dict(sorted(counts.items()))


def current_git_commit() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def route_sources() -> list[dict[str, Any]]:
    paths: set[Path] = set()
    for directory in (ROOT / "source", ROOT / "data" / "routes"):
        for pattern in ROUTE_SOURCE_GLOBS:
            paths.update(directory.glob(pattern))
    return [file_identity(path) for path in sorted(paths)]


def edition_snapshot(conn: sqlite3.Connection, race: sqlite3.Row) -> dict[str, Any]:
    race_id = race["id"]
    status_rows = conn.execute(
        "SELECT status FROM results WHERE race_id=? ORDER BY status", (race_id,)
    ).fetchall()
    source_rows = rows_as_dicts(
        conn,
        """
        SELECT s.code source,COUNT(*) results
        FROM results r JOIN sources s ON s.id=r.source_id
        WHERE r.race_id=? GROUP BY s.code ORDER BY s.code
        """,
        (race_id,),
    )
    split_status_rows = rows_as_dicts(
        conn,
        """
        SELECT r.status,COUNT(sp.id) splits
        FROM results r LEFT JOIN splits sp ON sp.result_id=r.id
        WHERE r.race_id=? GROUP BY r.status ORDER BY r.status
        """,
        (race_id,),
    )
    checkpoints = rows_as_dicts(
        conn,
        """
        SELECT checkpoint_key,name,sequence_no,distance_km,elevation_m
        FROM checkpoints WHERE race_id=? ORDER BY sequence_no,checkpoint_key
        """,
        (race_id,),
    )
    return {
        "race_key": race["race_key"],
        "database_id": race_id,
        "name": race["name"],
        "year": race["year"],
        "race_date": race["race_date"],
        "distance_km": race["distance_km"],
        "course_version": race["course_version"],
        "event_code": race["event_code"],
        "result_year_path": race["result_year_path"],
        "results": scalar(conn, "SELECT COUNT(*) FROM results WHERE race_id=?", (race_id,)),
        "splits": scalar(
            conn,
            "SELECT COUNT(*) FROM splits sp JOIN results r ON r.id=sp.result_id WHERE r.race_id=?",
            (race_id,),
        ),
        "unique_athletes": scalar(
            conn, "SELECT COUNT(DISTINCT athlete_id) FROM results WHERE race_id=?", (race_id,)
        ),
        "statuses": count_by(status_rows, "status"),
        "sources": source_rows,
        "splits_by_result_status": split_status_rows,
        "checkpoints": checkpoints,
    }


def database_checks(conn: sqlite3.Connection) -> dict[str, Any]:
    orphan_queries = {
        "checkpoints_without_race": """
            SELECT COUNT(*) FROM checkpoints cp LEFT JOIN races r ON r.id=cp.race_id WHERE r.id IS NULL
        """,
        "results_without_race": """
            SELECT COUNT(*) FROM results x LEFT JOIN races r ON r.id=x.race_id WHERE r.id IS NULL
        """,
        "results_without_athlete": """
            SELECT COUNT(*) FROM results x LEFT JOIN athletes a ON a.id=x.athlete_id WHERE a.id IS NULL
        """,
        "results_without_source": """
            SELECT COUNT(*) FROM results x LEFT JOIN sources s ON s.id=x.source_id WHERE s.id IS NULL
        """,
        "splits_without_result": """
            SELECT COUNT(*) FROM splits sp LEFT JOIN results r ON r.id=sp.result_id WHERE r.id IS NULL
        """,
        "splits_without_checkpoint": """
            SELECT COUNT(*) FROM splits sp LEFT JOIN checkpoints cp ON cp.id=sp.checkpoint_id WHERE cp.id IS NULL
        """,
        "external_ids_without_athlete": """
            SELECT COUNT(*) FROM athlete_external_ids x LEFT JOIN athletes a ON a.id=x.athlete_id WHERE a.id IS NULL
        """,
        "external_ids_without_source": """
            SELECT COUNT(*) FROM athlete_external_ids x LEFT JOIN sources s ON s.id=x.source_id WHERE s.id IS NULL
        """,
    }
    return {
        "integrity_check": conn.execute("PRAGMA integrity_check").fetchone()[0],
        "foreign_key_violations": len(conn.execute("PRAGMA foreign_key_check").fetchall()),
        "orphan_rows": {name: scalar(conn, sql) for name, sql in orphan_queries.items()},
        "duplicate_result_keys": scalar(
            conn,
            """
            SELECT COUNT(*) FROM (
              SELECT race_id,source_id,source_result_id FROM results
              GROUP BY race_id,source_id,source_result_id HAVING COUNT(*)>1
            )
            """,
        ),
        "duplicate_split_keys": scalar(
            conn,
            """
            SELECT COUNT(*) FROM (
              SELECT result_id,checkpoint_id FROM splits
              GROUP BY result_id,checkpoint_id HAVING COUNT(*)>1
            )
            """,
        ),
        "same_race_athlete_groups": scalar(
            conn,
            """
            SELECT COUNT(*) FROM (
              SELECT race_id,athlete_id FROM results
              GROUP BY race_id,athlete_id HAVING COUNT(*)>1
            )
            """,
        ),
        "finished_without_finish_seconds": scalar(
            conn, "SELECT COUNT(*) FROM results WHERE status='FINISHED' AND finish_seconds IS NULL"
        ),
        "non_finished_with_finish_seconds": scalar(
            conn, "SELECT COUNT(*) FROM results WHERE status<>'FINISHED' AND finish_seconds IS NOT NULL"
        ),
        "dnf_dns_with_finish_checkpoint": scalar(
            conn,
            """
            SELECT COUNT(DISTINCT r.id)
            FROM results r JOIN splits sp ON sp.result_id=r.id
            JOIN checkpoints cp ON cp.id=sp.checkpoint_id
            WHERE r.status IN ('DNF','DNS') AND cp.checkpoint_key='mora'
            """,
        ),
    }


def web_snapshot(conn: sqlite3.Connection, web: dict[str, Any], manifest: dict[str, Any], js_text: str) -> dict[str, Any]:
    web_results = web.get("results", [])
    web_splits = web.get("splits", [])
    db_result_ids = {row[0] for row in conn.execute("SELECT id FROM results")}
    web_result_ids = {row["id"] for row in web_results}
    db_split_keys = {
        (row[0], row[1])
        for row in conn.execute(
            """
            SELECT sp.result_id,cp.checkpoint_key
            FROM splits sp JOIN checkpoints cp ON cp.id=sp.checkpoint_id
            """
        )
    }
    web_split_keys = {(row["result_id"], row["checkpoint_key"]) for row in web_splits}
    expected_js = "window.ULTRAVASAN_DATA=" + json.dumps(
        web, ensure_ascii=False, separators=(",", ":")
    ) + ";\n"
    return {
        "schema_version": web.get("meta", {}).get("schema_version"),
        "generated_at": web.get("meta", {}).get("generated_at"),
        "counts": {
            "races": len(web.get("races", [])),
            "checkpoints": len(web.get("checkpoints", [])),
            "results": len(web_results),
            "splits": len(web_splits),
            "stats": len(web.get("stats", {})),
            "sources": len(web.get("sources", [])),
        },
        "manifest": manifest,
        "parity": {
            "race_ids_equal": {row[0] for row in conn.execute("SELECT id FROM races")} == {
                row["id"] for row in web.get("races", [])
            },
            "result_ids_equal": db_result_ids == web_result_ids,
            "split_keys_equal": db_split_keys == web_split_keys,
            "json_and_javascript_payload_equal": js_text == expected_js,
            "manifest_counts_equal": (
                manifest.get("races") == len(web.get("races", []))
                and manifest.get("results") == len(web_results)
                and manifest.get("splits") == len(web_splits)
                and manifest.get("bytes") == DEFAULT_WEB_JSON.stat().st_size
            ),
        },
    }


def build_snapshot(source_commit: str) -> dict[str, Any]:
    conn = sqlite3.connect(DEFAULT_DB)
    conn.row_factory = sqlite3.Row
    try:
        races = conn.execute("SELECT * FROM races ORDER BY year,race_key").fetchall()
        statuses = count_by(conn.execute("SELECT status FROM results ORDER BY status"), "status")
        identity_sources = rows_as_dicts(
            conn,
            """
            SELECT s.code source,COUNT(*) external_ids,COUNT(DISTINCT x.athlete_id) athletes
            FROM athlete_external_ids x JOIN sources s ON s.id=x.source_id
            GROUP BY s.code ORDER BY s.code
            """,
        )
        splits_by_status = rows_as_dicts(
            conn,
            """
            SELECT r.status,COUNT(sp.id) splits
            FROM results r LEFT JOIN splits sp ON sp.result_id=r.id
            GROUP BY r.status ORDER BY r.status
            """,
        )
        web = json.loads(DEFAULT_WEB_JSON.read_text(encoding="utf-8"))
        manifest = json.loads(DEFAULT_MANIFEST.read_text(encoding="utf-8"))
        js_text = DEFAULT_WEB_JS.read_text(encoding="utf-8")
        return {
            "schema_version": 1,
            "phase": "U0",
            "source": {"git_commit": source_commit, "branch": "main"},
            "files": {
                "database": file_identity(DEFAULT_DB),
                "web_json": file_identity(DEFAULT_WEB_JSON),
                "web_javascript": file_identity(DEFAULT_WEB_JS),
                "manifest": file_identity(DEFAULT_MANIFEST),
                "route_sources": route_sources(),
            },
            "totals": {
                "race_editions": scalar(conn, "SELECT COUNT(*) FROM races"),
                "checkpoints": scalar(conn, "SELECT COUNT(*) FROM checkpoints"),
                "results": scalar(conn, "SELECT COUNT(*) FROM results"),
                "splits": scalar(conn, "SELECT COUNT(*) FROM splits"),
                "athletes": scalar(conn, "SELECT COUNT(*) FROM athletes"),
                "referenced_athletes": scalar(conn, "SELECT COUNT(DISTINCT athlete_id) FROM results"),
                "external_identities": scalar(conn, "SELECT COUNT(*) FROM athlete_external_ids"),
                "sources": scalar(conn, "SELECT COUNT(*) FROM sources"),
            },
            "statuses": statuses,
            "splits_by_result_status": splits_by_status,
            "external_identities_by_source": identity_sources,
            "checks": database_checks(conn),
            "editions": [edition_snapshot(conn, race) for race in races],
            "web_export": web_snapshot(conn, web, manifest, js_text),
        }
    finally:
        conn.close()


def verify(expected_path: Path) -> int:
    expected = json.loads(expected_path.read_text(encoding="utf-8"))
    source_commit = expected.get("source", {}).get("git_commit")
    if not source_commit:
        raise SystemExit("Baseline saknar source.git_commit")
    actual = build_snapshot(source_commit)
    if actual == expected:
        print(
            "U0-baseline verifierad: "
            f"{actual['totals']['race_editions']} lopp, "
            f"{actual['totals']['results']} resultat, "
            f"{actual['totals']['splits']} mellantider."
        )
        return 0
    expected_text = json.dumps(expected, ensure_ascii=False, indent=2, sort_keys=True).splitlines()
    actual_text = json.dumps(actual, ensure_ascii=False, indent=2, sort_keys=True).splitlines()
    print("U0-baseline avviker. Uppdatera den endast efter uttrycklig data- och regressionsgranskning.", file=sys.stderr)
    for line in list(unified_diff(expected_text, actual_text, fromfile="expected", tofile="actual", lineterm=""))[:400]:
        print(line, file=sys.stderr)
    return 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--write", action="store_true", help="Skriv en ny granskad baseline")
    action.add_argument("--check", action="store_true", help="Verifiera nuvarande data mot baselinen")
    parser.add_argument("--output", type=Path, default=DEFAULT_BASELINE)
    args = parser.parse_args()

    if args.check:
        raise SystemExit(verify(args.output))

    snapshot = build_snapshot(current_git_commit())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"U0-baseline skriven: {args.output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
