#!/usr/bin/env python3
"""Verify the narrowly scoped UV90 2016 official split enrichment."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import official_enrichment

RACE_ID = official_enrichment.EXACT_RACE_ID
EXPECTED_KEYS = official_enrichment.EXPECTED_SPLITS
REPRESENTATIVE_NAMES = [
    "Risa, Jarle", "Bard, Sarah", "Hermansson, Andreas", "Ammerlind, Evald",
    "Bergqvist, Åsa", "Askengren Berg, Annika", "Artursson, Karin",
    "Backlund, Magnus", "Andersén, Ingemar", "Alpsten, Moa",
]


def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rows(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def scalar(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> Any:
    return conn.execute(sql, params).fetchone()[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--backup-database", type=Path, required=True)
    parser.add_argument("--dry-run-report", type=Path)
    parser.add_argument("--apply-1-report", type=Path)
    parser.add_argument("--apply-2-report", type=Path)
    parser.add_argument(
        "--reference-verification", type=Path,
        help="Reuse the reviewed dry-run/apply summaries from a prior final verification",
    )
    parser.add_argument("--web-json", type=Path, required=True)
    parser.add_argument("--web-js", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--output-md", type=Path, required=True)
    args = parser.parse_args()

    current = connect(args.database)
    backup = connect(args.backup_database)
    if args.reference_verification:
        reference = json.loads(args.reference_verification.read_text(encoding="utf-8"))
        dry = {"summary": reference["dry_run_summary"]}
        apply_1 = {"summary": reference["apply_first"]}
        apply_2 = {"summary": reference["apply_second"]}
    elif args.dry_run_report and args.apply_1_report and args.apply_2_report:
        dry = json.loads(args.dry_run_report.read_text(encoding="utf-8"))
        apply_1 = json.loads(args.apply_1_report.read_text(encoding="utf-8"))
        apply_2 = json.loads(args.apply_2_report.read_text(encoding="utf-8"))
    else:
        parser.error("provide --reference-verification or all three dry-run/apply reports")

    core_tables = ("results", "athletes", "athlete_external_ids", "races", "checkpoints", "sources")
    core = {}
    for table in core_tables:
        before_digest = official_enrichment._table_digest(backup, f"SELECT * FROM {table} ORDER BY id")
        after_digest = official_enrichment._table_digest(current, f"SELECT * FROM {table} ORDER BY id")
        core[table] = {
            "before": scalar(backup, f"SELECT COUNT(*) FROM {table}"),
            "after": scalar(current, f"SELECT COUNT(*) FROM {table}"),
            "byte_equivalent_rows": before_digest == after_digest,
        }

    other_before = official_enrichment._table_digest(
        backup, "SELECT s.* FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id<>? ORDER BY s.id", (RACE_ID,)
    )
    other_after = official_enrichment._table_digest(
        current, "SELECT s.* FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id<>? ORDER BY s.id", (RACE_ID,)
    )
    split_rows = current.execute(
        """SELECT s.*,cp.checkpoint_key,cp.sequence_no,cp.distance_km,r.status result_status,
                  r.finish_seconds,r.name_as_published,r.bib
             FROM splits s JOIN checkpoints cp ON cp.id=s.checkpoint_id
             JOIN results r ON r.id=s.result_id WHERE r.race_id=?
             ORDER BY s.result_id,cp.sequence_no""",
        (RACE_ID,),
    ).fetchall()
    grouped: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for row in split_rows:
        grouped[row["result_id"]].append(row)

    issues: list[dict[str, Any]] = []
    coverage = Counter(row["checkpoint_key"] for row in split_rows)
    complete = 0
    dnf_with_passages = 0
    for result_id, result_splits in grouped.items():
        keys = [row["checkpoint_key"] for row in result_splits]
        if keys == EXPECTED_KEYS:
            complete += 1
        if result_splits[0]["result_status"] == "DNF":
            dnf_with_passages += 1
        previous_elapsed = 0
        previous_sequence = 0
        for row in result_splits:
            elapsed = row["elapsed_seconds"]
            if elapsed is None or elapsed <= 0:
                issues.append({"code": "non-positive-time", "split_id": row["id"]})
                continue
            if elapsed >= 86_400:
                issues.append({"code": "elapsed-out-of-range", "split_id": row["id"], "value": elapsed})
            if elapsed <= previous_elapsed:
                issues.append({"code": "non-increasing", "split_id": row["id"]})
            contiguous = row["sequence_no"] == previous_sequence + 1
            if contiguous and row["segment_seconds"] != elapsed - previous_elapsed:
                issues.append({"code": "segment-mismatch", "split_id": row["id"]})
            if not contiguous and row["segment_seconds"] is not None:
                issues.append({"code": "segment-across-gap", "split_id": row["id"]})
            if row["checkpoint_key"] != "mora" and row["finish_seconds"] and elapsed > row["finish_seconds"]:
                issues.append({"code": "split-after-finish", "split_id": row["id"]})
            if row["reported_pace_seconds_per_km"] is not None and not 120 <= row["reported_pace_seconds_per_km"] <= 1800:
                issues.append({"code": "pace-out-of-range", "split_id": row["id"]})
            if row["speed_kmh"] is not None and not 1 <= row["speed_kmh"] <= 40:
                issues.append({"code": "speed-out-of-range", "split_id": row["id"]})
            previous_elapsed = elapsed
            previous_sequence = row["sequence_no"]
        mora = next((row for row in result_splits if row["checkpoint_key"] == "mora"), None)
        if result_splits[0]["result_status"] == "FINISHED" and (not mora or mora["elapsed_seconds"] != result_splits[0]["finish_seconds"]):
            issues.append({"code": "mora-finish-mismatch", "result_id": result_id})
        if result_splits[0]["result_status"] == "DNF" and mora:
            issues.append({"code": "dnf-has-mora", "result_id": result_id})

    duplicate_splits = rows(
        current,
        """SELECT s.result_id,s.checkpoint_id,COUNT(*) count FROM splits s JOIN results r ON r.id=s.result_id
             WHERE r.race_id=? GROUP BY s.result_id,s.checkpoint_id HAVING COUNT(*)>1""",
        (RACE_ID,),
    )
    estimated = scalar(
        current,
        "SELECT COUNT(*) FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id=? AND s.is_estimated<>0",
        (RACE_ID,),
    )
    forbidden_places = scalar(
        current,
        """SELECT COUNT(*) FROM splits s JOIN results r ON r.id=s.result_id
             WHERE r.race_id=? AND (s.place_overall IS NOT NULL OR s.place_class IS NOT NULL)""",
        (RACE_ID,),
    )
    bad_provenance = 0
    referenced_sources: set[int] = set()
    for row in split_rows:
        raw = json.loads(row["raw_json"] or "{}")
        provenance = raw.get("official_source") or {}
        source_record_id = provenance.get("source_record_id")
        if provenance.get("source_code") != "vasaloppet_mika" or not source_record_id:
            bad_provenance += 1
        else:
            referenced_sources.add(int(source_record_id))

    representatives = []
    for name in REPRESENTATIVE_NAMES:
        row = current.execute(
            """SELECT r.id,r.name_as_published,r.bib,r.age_class,r.status,r.finish_seconds,
                      r.overall_place,r.gender_place,r.class_place,COUNT(s.id) split_count
                 FROM results r LEFT JOIN splits s ON s.result_id=r.id
                WHERE r.race_id=? AND r.name_as_published=? GROUP BY r.id""",
            (RACE_ID, name),
        ).fetchone()
        representatives.append(dict(row) if row else {"name_as_published": name, "missing": True})

    andreas = next(row for row in representatives if row.get("name_as_published") == "Hermansson, Andreas")
    andreas_splits = rows(
        current,
        """SELECT cp.checkpoint_key,s.elapsed_seconds FROM splits s JOIN checkpoints cp ON cp.id=s.checkpoint_id
             WHERE s.result_id=? ORDER BY cp.sequence_no""",
        (andreas["id"],),
    )
    source_records = {
        "list_pages": scalar(current, "SELECT COUNT(*) FROM source_records WHERE source_id=(SELECT id FROM sources WHERE code='vasaloppet_mika') AND race_id=? AND record_type='result_list'", (RACE_ID,)),
        "participant_details": scalar(current, "SELECT COUNT(*) FROM source_records WHERE source_id=(SELECT id FROM sources WHERE code='vasaloppet_mika') AND race_id=? AND record_type='participant_detail'", (RACE_ID,)),
        "referenced_by_splits": len(referenced_sources),
        "bad_split_provenance": bad_provenance,
        "absolute_cache_paths": scalar(current, "SELECT COUNT(*) FROM source_records WHERE race_id=? AND cache_path LIKE 'C:%'", (RACE_ID,)),
    }

    integrity = scalar(current, "PRAGMA integrity_check")
    foreign_keys = rows(current, "PRAGMA foreign_key_check")
    result = {
        "database_sha256": sha256(args.database),
        "web_json_sha256": sha256(args.web_json),
        "web_js_sha256": sha256(args.web_js),
        "dry_run_summary": dry["summary"],
        "apply_first": apply_1["summary"],
        "apply_second": apply_2["summary"],
        "core_tables": core,
        "other_races_splits_unchanged": other_before == other_after,
        "uv90_2016_splits_before": scalar(backup, "SELECT COUNT(*) FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id=?", (RACE_ID,)),
        "uv90_2016_splits_after": len(split_rows),
        "checkpoint_coverage": dict(coverage),
        "complete_checkpoint_series": complete,
        "dnf_status_with_passages": dnf_with_passages,
        "duplicates": duplicate_splits,
        "estimated_splits": estimated,
        "invented_overall_or_class_places": forbidden_places,
        "data_quality_issues": issues,
        "source_records": source_records,
        "representative_runners": representatives,
        "andreas_hermansson_splits": andreas_splits,
        "integrity_check": integrity,
        "foreign_key_issues": foreign_keys,
    }
    guards = [
        all(item["byte_equivalent_rows"] for item in core.values()),
        result["other_races_splits_unchanged"], result["uv90_2016_splits_before"] == 0,
        result["uv90_2016_splits_after"] == 6190, not duplicate_splits, estimated == 0,
        forbidden_places == 0, not issues, bad_provenance == 0,
        source_records["participant_details"] == 986, source_records["list_pages"] == 12,
        source_records["absolute_cache_paths"] == 0, integrity == "ok", not foreign_keys,
        apply_1["summary"]["inserted"] == 6190, apply_2["summary"]["noop"] == 6190,
        andreas.get("id") == 11545 and andreas.get("split_count") == 8,
    ]
    result["verified"] = all(guards)
    if not result["verified"]:
        raise RuntimeError(json.dumps(result, ensure_ascii=False, indent=2))

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# UV90 2016 official enrichment verification", "",
        f"- Verified: **{result['verified']}**",
        f"- Splits before / after: {result['uv90_2016_splits_before']} / {result['uv90_2016_splits_after']}",
        f"- Complete series: {complete}",
        f"- SQLite integrity: {integrity}",
        f"- Other races unchanged: {result['other_races_splits_unchanged']}",
        f"- First apply inserts: {apply_1['summary']['inserted']}",
        f"- Second apply no-op: {apply_2['summary']['noop']}",
        f"- Data-quality issues: {len(issues)}", "",
        "## Checkpoint coverage", "",
    ]
    lines.extend(f"- {key}: {coverage[key]}" for key in EXPECTED_KEYS)
    args.output_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"verified": True, "splits": len(split_rows), "coverage": dict(coverage), "integrity": integrity}, ensure_ascii=False, indent=2))
    current.close()
    backup.close()


if __name__ == "__main__":
    main()
