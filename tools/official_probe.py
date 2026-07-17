#!/usr/bin/env python3
"""Run a bounded official Mika probe in a separate SQLite database."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any

import mika_import
import uvtool


def readonly_connection(path: Path) -> sqlite3.Connection:
    uri = f"file:{path.expanduser().resolve().as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only=ON")
    return conn


def split_report(split: dict[str, Any]) -> dict[str, Any]:
    return {
        "checkpoint_key": split.get("checkpoint_key"),
        "checkpoint_name": split.get("source_label"),
        "elapsed_seconds": split.get("elapsed_seconds"),
        "time_of_day": split.get("time_of_day"),
        "segment_seconds": split.get("segment_seconds"),
        "place_overall": split.get("place_overall"),
        "place_gender": split.get("place_gender"),
        "place_class": split.get("place_class"),
        "reported_pace_seconds_per_km": split.get("reported_pace_seconds_per_km"),
        "speed_kmh": split.get("speed_kmh"),
    }


def run(args: argparse.Namespace) -> dict[str, Any]:
    if not args.idp or len(args.idp) > 10:
        raise ValueError("Probe requires between 1 and 10 participant idp values")
    if len(set(args.idp)) != len(args.idp):
        raise ValueError("Probe participant idp values must be unique")
    mika_import.require_separate_probe_db(args.probe_db, args.production_db)

    config = uvtool.load_config(args.config)
    race_cfg = uvtool.get_race_config(config, args.race)
    uvtool.init_db(args.probe_db, args.config)
    probe_conn = uvtool.connect(args.probe_db)
    production_conn = readonly_connection(args.production_db)
    fetcher = mika_import.Fetcher(args.delay, args.browser_fallback, args.force)
    report: dict[str, Any] = {
        "race_key": args.race,
        "event_code": race_cfg["event_code"],
        "result_year_path": race_cfg["result_year_path"],
        "probe_database": str(args.probe_db),
        "production_database_mode": "read-only",
        "detail_page_limit": 10,
        "requested_detail_pages": len(args.idp),
        "participants": [],
    }
    try:
        probe_race = probe_conn.execute("SELECT * FROM races WHERE race_key=?", (args.race,)).fetchone()
        probe_source = probe_conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
        production_race = production_conn.execute("SELECT * FROM races WHERE race_key=?", (args.race,)).fetchone()
        if not production_race:
            raise RuntimeError(f"Production race not found: {args.race}")
        run_id = probe_conn.execute(
            "INSERT INTO import_runs(source_id,race_id,message) VALUES(?,?,?)",
            (probe_source["id"], probe_race["id"], "Bounded official Mika probe; production database opened read-only"),
        ).lastrowid
        probe_conn.commit()
        for idp in args.idp:
            url = mika_import.detail_url(race_cfg, idp, "")
            cache = args.raw / args.race / "details" / f"{idp}.html"
            html, status, cached, mode = fetcher.get(url, cache)
            content_hash = hashlib.sha256(html.encode("utf-8", errors="replace")).hexdigest()
            uvtool.record_source_page(
                probe_conn, run_id, probe_source["id"], probe_race["id"],
                "participant_detail", idp, url, status, cache, html,
            )
            source_record = probe_conn.execute(
                """SELECT * FROM source_records
                     WHERE source_id=? AND race_id=? AND record_type='participant_detail'
                       AND external_id=? AND content_sha256=?""",
                (probe_source["id"], probe_race["id"], idp, content_hash),
            ).fetchone()
            parsed = uvtool.parse_detail_html(
                html, f"{race_cfg['event_code']}:{idp}", url, race_cfg["checkpoints"]
            )
            validation_errors = mika_import.validate_split_sequence(parsed, race_cfg["checkpoints"])
            match = mika_import.match_existing_result(production_conn, production_race["id"], parsed)
            provenance = {
                "source_code": "vasaloppet_mika",
                "source_record_id": source_record["id"],
                "official_idp": idp,
                "url": url,
                "http_status": status,
                "content_sha256": content_hash,
                "fetched_at": source_record["fetched_at"],
            }
            for split in parsed.splits or []:
                split["official_source"] = provenance
            probe_result_id, _ = uvtool.save_result(
                probe_conn, probe_race["id"], probe_source["id"],
                probe_race["distance_km"], race_cfg["checkpoints"], parsed,
            )
            report["participants"].append({
                "official_idp": idp,
                "event_code": race_cfg["event_code"],
                "detail_url": url,
                "http_method": "GET",
                "http_status": status,
                "content_type": "text/html; charset=utf-8",
                "fetch_mode": mode,
                "cache_hit": cached,
                "content_sha256": content_hash,
                "source_record_id": source_record["id"],
                "probe_result_id": probe_result_id,
                "name": parsed.name,
                "bib": parsed.bib,
                "sex": parsed.sex,
                "age_class": parsed.age_class,
                "nationality": parsed.nationality,
                "club": parsed.club,
                "city": parsed.city,
                "status": parsed.status,
                "finish_seconds": parsed.finish_seconds,
                "overall_place": parsed.overall_place,
                "gender_place": parsed.gender_place,
                "class_place": parsed.class_place,
                "split_count": len(parsed.splits or []),
                "split_validation_errors": validation_errors,
                "match": match,
                "splits": [split_report(split) for split in parsed.splits or []],
            })
            probe_conn.commit()

        counts = {
            key: sum(1 for item in report["participants"] if item["match"]["status"] == status)
            for key, status in [
                ("safe_unique", "matched"), ("ambiguous", "ambiguous"),
                ("conflicts", "conflict"), ("unmatched", "unmatched"),
            ]
        }
        validation_error_count = sum(len(item["split_validation_errors"]) for item in report["participants"])
        probe_conn.execute(
            """UPDATE import_runs SET finished_at=?,status=?,records_seen=?,records_inserted=?,warnings=?
                 WHERE id=?""",
            (uvtool.utc_now(), "probe-complete", len(args.idp), len(args.idp), validation_error_count, run_id),
        )
        probe_conn.commit()
        report["matching_summary"] = counts
        report["split_validation_error_count"] = validation_error_count
        report["probe_database_counts"] = {
            "results": probe_conn.execute("SELECT COUNT(*) FROM results WHERE race_id=?", (probe_race["id"],)).fetchone()[0],
            "splits": probe_conn.execute(
                "SELECT COUNT(*) FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id=?",
                (probe_race["id"],),
            ).fetchone()[0],
            "source_records": probe_conn.execute("SELECT COUNT(*) FROM source_records WHERE import_run_id=?", (run_id,)).fetchone()[0],
        }
        report["sqlite_integrity_check"] = probe_conn.execute("PRAGMA integrity_check").fetchone()[0]
        return report
    finally:
        fetcher.close()
        production_conn.close()
        probe_conn.close()


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--race", required=True)
    p.add_argument("--idp", action="append", required=True)
    p.add_argument("--probe-db", type=Path, required=True)
    p.add_argument("--production-db", type=Path, default=uvtool.DEFAULT_DB)
    p.add_argument("--config", type=Path, default=uvtool.DEFAULT_CONFIG)
    p.add_argument("--raw", type=Path, required=True)
    p.add_argument("--report", type=Path, required=True)
    p.add_argument("--delay", type=float, default=1.2)
    p.add_argument("--force", action="store_true")
    p.add_argument("--browser-fallback", action="store_true")
    return p


def main() -> None:
    args = parser().parse_args()
    report = run(args)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "report": str(args.report),
        "participants": len(report["participants"]),
        "matching_summary": report["matching_summary"],
        "split_validation_error_count": report["split_validation_error_count"],
        "sqlite_integrity_check": report["sqlite_integrity_check"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
