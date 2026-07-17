#!/usr/bin/env python3
"""Safely enrich existing results with official Mika checkpoint passages.

``full-dry-run`` copies the source database and writes only to that copy.
``apply`` is deliberately guarded by both ``--apply`` and a literal
confirmation token.  Matching never creates results, athletes or person links.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from bs4 import BeautifulSoup

import mika_import
import uvtool

APPLY_CONFIRMATION = "APPLY-OFFICIAL-SPLITS-TO-EXISTING-RESULTS"
PRODUCTION_CONFIRMATION = "CONFIRM-PRODUCTION-ENRICHMENT-UV90-2016"
EXACT_RACE_KEY = "ultravasan90-2016"
EXACT_RACE_ID = 9
EXACT_EVENT_CODE = "UL90_9999991678885A00000004CC"
READY_DECISION = "REDO FÖR EXPLICIT APPLY-IMPORT"
EXPECTED_SPLITS = ["smagan", "mangsbodarna", "risberg", "evertsberg", "oxberg", "hokberg", "eldris", "mora"]
EXPECTED_DRY_RUN = {
    "unique_idp": 986,
    "detail_pages_parsed": 986,
    "http_errors": 0,
    "parser_errors": 0,
    "intended_splits": 6190,
    "second_pass_noop": 6190,
    "blocking_quality_issues": 0,
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_safe_database_target(target: Path, production: Path, apply: bool = False, confirmation: str | None = None) -> None:
    same = target.expanduser().resolve() == production.expanduser().resolve()
    if not apply and same:
        raise ValueError("Dry-run database must be separate from the production database")
    if apply and confirmation != APPLY_CONFIRMATION:
        raise ValueError(f"Apply requires --confirmation {APPLY_CONFIRMATION}")


def prepare_work_database(source: Path, work: Path, expected_sha256: str | None = None) -> str:
    require_safe_database_target(work, source, apply=False)
    if not source.is_file():
        raise FileNotFoundError(source)
    actual = sha256_file(source)
    if expected_sha256 and actual.lower() != expected_sha256.lower():
        raise ValueError(f"Source database SHA-256 mismatch: {actual}")
    if work.exists():
        raise FileExistsError(f"Work database already exists: {work}")
    work.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, work)
    if sha256_file(work) != actual:
        raise RuntimeError("Work database copy is not byte-identical to source")
    return actual


def _file_timestamp(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).replace(microsecond=0).isoformat()


class RawArchive:
    """HTTP-first cache with a persistent source manifest and fallback caches."""

    def __init__(self, root: Path, fallback_roots: list[Path], delay: float):
        self.root = root.expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.fallback_roots = [path.expanduser().resolve() for path in fallback_roots]
        self.manifest_path = self.root / "manifest.json"
        self.manifest: dict[str, Any] = {
            "created_at": uvtool.utc_now(), "updated_at": uvtool.utc_now(),
            "resources": [], "errors": [],
        }
        self.fetcher = mika_import.Fetcher(delay=delay, browser_fallback=False, force=False)

    def close(self) -> None:
        self.fetcher.close()
        self.flush()

    def flush(self) -> None:
        self.manifest["updated_at"] = uvtool.utc_now()
        self.manifest_path.write_text(json.dumps(self.manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    def add_error(self, record_type: str, external_id: str, url: str, error: Exception) -> None:
        self.manifest["errors"].append({
            "record_type": record_type, "external_id": external_id,
            "url": url, "error": str(error), "recorded_at": uvtool.utc_now(),
        })
        self.flush()

    def fetch(
        self, url: str, relative_path: Path, record_type: str, external_id: str,
        fallback_relatives: list[Path] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        primary = self.root / relative_path
        candidates = [primary]
        fallback_names = fallback_relatives or [relative_path]
        for fallback_root in self.fallback_roots:
            candidates.extend(fallback_root / relative for relative in fallback_names)
        selected = next((path for path in candidates if path.is_file()), None)
        if selected:
            html = selected.read_text(encoding="utf-8", errors="replace")
            metadata = {
                "request_url": url, "final_url": url, "http_status": 200,
                "content_type": "text/html; charset=utf-8",
                "fetched_at": _file_timestamp(selected), "cache_path": str(selected),
                "cache_hit": True, "fetch_mode": "cache" if selected == primary else "fallback-cache",
            }
        else:
            html, status, cached, mode = self.fetcher.get(url, primary)
            raw_meta = self.fetcher.last_metadata
            metadata = {
                "request_url": url, "final_url": raw_meta.get("final_url", url),
                "http_status": status, "content_type": raw_meta.get("content_type"),
                "fetched_at": raw_meta.get("fetched_at", uvtool.utc_now()),
                "cache_path": str(primary), "cache_hit": cached, "fetch_mode": mode,
            }
        metadata.update({
            "record_type": record_type, "external_id": external_id,
            "content_sha256": hashlib.sha256(html.encode("utf-8", errors="replace")).hexdigest(),
            "bytes_utf8": len(html.encode("utf-8")),
        })
        self.manifest["resources"].append(metadata)
        if len(self.manifest["resources"]) % 25 == 0:
            self.flush()
        return html, metadata


def paginate_entries(
    race: dict[str, Any], page_fetch: Callable[[int, str], tuple[str, dict[str, Any]]],
    max_pages: int = 200, empty_pages_to_stop: int = 2,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Collect unique idp values and stop after consecutive pages add none."""
    all_entries: dict[str, dict[str, Any]] = {}
    pages: list[dict[str, Any]] = []
    empty = 0
    template = race.get("page_url_templates", [race["page_url_template"]])[0]
    for page in range(1, max_pages + 1):
        url = template.format(page=page)
        html, resource = page_fetch(page, url)
        entries = mika_import.extract_entries(html, url)
        new = 0
        duplicate_ids: list[str] = []
        for entry in entries:
            if entry["idp"] in all_entries:
                duplicate_ids.append(entry["idp"])
                continue
            entry["list_page"] = page
            all_entries[entry["idp"]] = entry
            new += 1
        pages.append({
            "page": page, "url": url, "entries": len(entries), "new_idp": new,
            "duplicate_idp": duplicate_ids, "unique_total": len(all_entries),
            "resource": resource,
        })
        print(f"List page {page}: {len(entries)} rows, {new} new idp, {len(all_entries)} unique", flush=True)
        empty = empty + 1 if new == 0 else 0
        if empty >= empty_pages_to_stop:
            break
    return list(all_entries.values()), pages


def _issue(code: str, message: str, severity: str = "error", checkpoint: str | None = None) -> dict[str, Any]:
    result = {"code": code, "severity": severity, "message": message}
    if checkpoint:
        result["checkpoint_key"] = checkpoint
    return result


def validate_detail(parsed: uvtool.ParsedResult, html: str, checkpoints: list[dict[str, Any]]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    cp_map = {cp["checkpoint_key"]: cp for cp in checkpoints}
    soup = BeautifulSoup(html, "lxml")
    estimated_rows = soup.select("tr.estimated")
    if estimated_rows:
        issues.append(_issue(
            "estimated-source-rows-ignored",
            f"Ignored {len(estimated_rows)} explicitly estimated source rows",
            severity="warning",
        ))
    for row in soup.select("tr.split"):
        desc = uvtool._class_text(row, ["desc", "name", "split-name"])
        key = uvtool.checkpoint_key(desc)
        if not key or key not in cp_map:
            issues.append(_issue("unknown-checkpoint", f"Unknown official checkpoint: {desc!r}"))

    official_splits = [split for split in parsed.splits or [] if not split.get("is_synthetic") and not split.get("is_estimated")]
    if len(official_splits) != len(parsed.splits or []):
        issues.append(_issue("synthetic-split-rejected", "Parser fallback split was rejected from official enrichment"))
    parsed.splits = official_splits
    order = {cp["checkpoint_key"]: cp["sequence_no"] for cp in checkpoints}
    splits = sorted(official_splits, key=lambda split: order.get(split.get("checkpoint_key"), 10**9))
    keys = [split.get("checkpoint_key") for split in splits]
    duplicates = [key for key, count in Counter(keys).items() if count > 1]
    for key in duplicates:
        issues.append(_issue("duplicate-checkpoint", "Checkpoint occurs more than once", checkpoint=key))

    previous = 0
    previous_sequence = 0
    time_offsets: list[int] = []
    for split in splits:
        key = split.get("checkpoint_key")
        elapsed = split.get("elapsed_seconds")
        segment = split.get("segment_seconds")
        if not isinstance(elapsed, int) or elapsed <= 0:
            issues.append(_issue("non-positive-time", f"Invalid elapsed time: {elapsed!r}", checkpoint=key))
            continue
        if elapsed >= 86_400:
            issues.append(_issue("elapsed-out-of-range", f"Elapsed time may be milliseconds or otherwise invalid: {elapsed}", checkpoint=key))
        if elapsed <= previous:
            issues.append(_issue("non-increasing-time", f"Elapsed {elapsed} is not greater than {previous}", checkpoint=key))
        expected_segment = elapsed - previous
        if segment is None:
            issues.append(_issue(
                "missing-segment-time", "Official segment time is missing",
                severity="warning", checkpoint=key,
            ))
        elif segment != expected_segment:
            sequence = order.get(key, 10**9)
            if sequence != previous_sequence + 1:
                issues.append(_issue(
                    "segment-basis-missing-checkpoint",
                    f"Reported {segment}; cannot compare with elapsed delta {expected_segment} across a missing checkpoint",
                    severity="warning", checkpoint=key,
                ))
            else:
                issues.append(_issue("segment-mismatch", f"Reported {segment}, expected {expected_segment}", checkpoint=key))
        if parsed.finish_seconds is not None and key != "mora" and elapsed > parsed.finish_seconds:
            issues.append(_issue("split-after-finish", f"Elapsed {elapsed} exceeds finish {parsed.finish_seconds}", checkpoint=key))
        pace = split.get("reported_pace_seconds_per_km")
        if pace is not None and not 120 <= pace <= 1800:
            issues.append(_issue("pace-out-of-range", f"Reported pace is {pace} seconds/km", checkpoint=key))
        speed = split.get("speed_kmh")
        if speed is not None and not 1 <= speed <= 40:
            issues.append(_issue("speed-out-of-range", f"Reported speed is {speed} km/h", checkpoint=key))
        tod = uvtool.parse_time(split.get("time_of_day"))
        if tod is not None:
            time_offsets.append((tod - elapsed) % 86_400)
        previous = elapsed
        previous_sequence = order.get(key, previous_sequence)

    if len(set(time_offsets)) > 1:
        issues.append(_issue("time-of-day-mismatch", "Time-of-day offsets are inconsistent with elapsed times"))
    if parsed.finish_seconds is not None and not 0 < parsed.finish_seconds < 86_400:
        issues.append(_issue("finish-out-of-range", f"Finish time is invalid: {parsed.finish_seconds}"))
    mora = next((split for split in splits if split.get("checkpoint_key") == "mora"), None)
    if parsed.status == "FINISHED":
        if keys != EXPECTED_SPLITS:
            issues.append(_issue(
                "incomplete-finisher-series", f"Observed checkpoint series: {keys}",
                severity="warning",
            ))
        if parsed.finish_seconds is None:
            issues.append(_issue("finisher-without-finish", "FINISHED result has no finish time"))
        elif mora is None or mora.get("elapsed_seconds") != parsed.finish_seconds:
            issues.append(_issue("mora-finish-mismatch", "Mora is missing or differs from finish time"))
    elif parsed.status == "DNF" and mora is not None:
        issues.append(_issue("dnf-has-mora", "DNF has an official Mora passage"))
    return issues


def database_counts(conn: sqlite3.Connection, race_id: int) -> dict[str, int]:
    scalar = lambda sql, params=(): conn.execute(sql, params).fetchone()[0]
    return {
        "results_all": scalar("SELECT COUNT(*) FROM results"),
        "results_race": scalar("SELECT COUNT(*) FROM results WHERE race_id=?", (race_id,)),
        "athletes": scalar("SELECT COUNT(*) FROM athletes"),
        "athlete_external_ids": scalar("SELECT COUNT(*) FROM athlete_external_ids"),
        "splits_all": scalar("SELECT COUNT(*) FROM splits"),
        "splits_race": scalar("SELECT COUNT(*) FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id=?", (race_id,)),
        "source_records": scalar("SELECT COUNT(*) FROM source_records"),
        "import_runs": scalar("SELECT COUNT(*) FROM import_runs"),
    }


def record_source_resource(
    conn: sqlite3.Connection, run_id: int, source_id: int, race_id: int,
    metadata: dict[str, Any], html: str,
) -> int:
    uvtool.record_source_page(
        conn, run_id, source_id, race_id, metadata["record_type"], metadata["external_id"],
        metadata["request_url"], metadata["http_status"], Path(metadata["cache_path"]), html,
    )
    row = conn.execute(
        """SELECT id FROM source_records WHERE source_id=? AND race_id=? AND record_type=?
             AND external_id=? AND content_sha256=?""",
        (source_id, race_id, metadata["record_type"], metadata["external_id"], metadata["content_sha256"]),
    ).fetchone()
    if not row:
        raise RuntimeError("Could not resolve stored source record")
    return row[0]


def _stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def enrich_pass(
    conn: sqlite3.Connection, race: sqlite3.Row, source: sqlite3.Row,
    checkpoints: list[sqlite3.Row], participants: list[dict[str, Any]], pass_no: int,
    *, commit: bool = True, message: str | None = None,
) -> dict[str, Any]:
    before = database_counts(conn, race["id"])
    run_id = conn.execute(
        "INSERT INTO import_runs(source_id,race_id,message) VALUES(?,?,?)",
        (source["id"], race["id"], message or f"Official split enrichment dry-run pass {pass_no}"),
    ).lastrowid
    cp_map = {row["checkpoint_key"]: row for row in checkpoints}
    inserted = updated = noop = skipped = 0
    actions: dict[str, dict[str, int]] = {}
    for participant in participants:
        match = participant["match"]
        blocking_issues = [issue for issue in participant["issues"] if issue["severity"] == "error"]
        if match["status"] != "matched" or blocking_issues:
            skipped += 1
            actions[participant["official_idp"]] = {"inserted": 0, "updated": 0, "noop": 0, "skipped": 1}
            continue
        previous_distance = 0.0
        previous_sequence = 0
        item_action = {"inserted": 0, "updated": 0, "noop": 0, "skipped": 0}
        for split in participant["parsed"].splits or []:
            checkpoint = cp_map.get(split["checkpoint_key"])
            if not checkpoint:
                continue
            distance = checkpoint["distance_km"]
            official_segment = split.get("segment_seconds")
            is_contiguous = checkpoint["sequence_no"] == previous_sequence + 1
            segment = official_segment if is_contiguous else None
            segment_distance = distance - previous_distance if is_contiguous and distance is not None else None
            computed_pace = segment / segment_distance if segment is not None and segment_distance and segment_distance > 0 else None
            provenance = {
                "source_code": "vasaloppet_mika",
                "source_record_id": participant["source_record_id"],
                "official_event": participant["event_code"],
                "official_idp": participant["official_idp"],
                "detail_url": participant["detail_url"],
                "http_status": participant["http_status"],
                "fetched_at": participant["fetched_at"],
                "content_sha256": participant["content_sha256"],
                "cache_path": participant["cache_path"],
            }
            raw_json = _stable_json({"official_split": split, "official_source": provenance})
            values = {
                "elapsed_seconds": split.get("elapsed_seconds"),
                "segment_seconds": segment,
                "place_overall": None,
                "place_gender": split.get("place_gender"),
                "place_class": None,
                "pace_seconds_per_km": computed_pace,
                "reported_pace_seconds_per_km": split.get("reported_pace_seconds_per_km"),
                "speed_kmh": split.get("speed_kmh"),
                "time_of_day": split.get("time_of_day"),
                "diff_seconds": split.get("diff_seconds"),
                "status": split.get("status"),
                "is_estimated": 0,
                "raw_json": raw_json,
            }
            existing = conn.execute(
                "SELECT * FROM splits WHERE result_id=? AND checkpoint_id=?",
                (match["result_id"], checkpoint["id"]),
            ).fetchone()
            columns = list(values)
            if existing is None:
                conn.execute(
                    f"INSERT INTO splits(result_id,checkpoint_id,{','.join(columns)}) VALUES(?,?,{','.join('?' for _ in columns)})",
                    (match["result_id"], checkpoint["id"], *(values[column] for column in columns)),
                )
                inserted += 1; item_action["inserted"] += 1
            elif all(existing[column] == values[column] for column in columns):
                noop += 1; item_action["noop"] += 1
            else:
                conn.execute(
                    f"UPDATE splits SET {','.join(f'{column}=?' for column in columns)} WHERE id=?",
                    (*(values[column] for column in columns), existing["id"]),
                )
                updated += 1; item_action["updated"] += 1
            if distance is not None:
                previous_distance = distance
            previous_sequence = checkpoint["sequence_no"]
        actions[participant["official_idp"]] = item_action
    conn.execute(
        """UPDATE import_runs SET finished_at=?,status=?,records_seen=?,
             records_inserted=?,records_updated=?,warnings=? WHERE id=?""",
        (uvtool.utc_now(), "complete" if not commit else "dry-run-complete", len(participants), inserted, updated, skipped, run_id),
    )
    if commit:
        conn.commit()
    after = database_counts(conn, race["id"])
    for key in ("results_all", "results_race", "athletes", "athlete_external_ids"):
        if after[key] != before[key]:
            raise RuntimeError(f"Forbidden database count changed: {key} {before[key]} -> {after[key]}")
    return {
        "pass": pass_no, "import_run_id": run_id, "inserted": inserted,
        "updated": updated, "noop": noop, "skipped_participants": skipped,
        "counts_before": before, "counts_after": after, "participant_actions": actions,
    }


def database_quality(conn: sqlite3.Connection, race_id: int) -> dict[str, Any]:
    queries = {
        "duplicate_result_checkpoint": """SELECT result_id,checkpoint_id,COUNT(*) n FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id=? GROUP BY result_id,checkpoint_id HAVING n>1""",
        "negative_or_zero_times": """SELECT s.id,result_id,elapsed_seconds FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id=? AND (elapsed_seconds IS NULL OR elapsed_seconds<=0)""",
        "estimated_splits": """SELECT s.id,result_id FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id=? AND is_estimated<>0""",
    }
    result: dict[str, Any] = {}
    for name, sql in queries.items():
        rows = conn.execute(sql, (race_id,)).fetchall()
        result[name] = [dict(row) for row in rows]
    result["integrity_check"] = conn.execute("PRAGMA integrity_check").fetchone()[0]
    result["duplicate_checkpoints"] = [dict(row) for row in conn.execute(
        "SELECT checkpoint_key,COUNT(*) n FROM checkpoints WHERE race_id=? GROUP BY checkpoint_key HAVING n>1", (race_id,)
    ).fetchall()]
    return result


def participant_report(item: dict[str, Any], actions: list[dict[str, int]]) -> dict[str, Any]:
    parsed: uvtool.ParsedResult = item["parsed"]
    return {
        "official_idp": item["official_idp"], "event_code": item["event_code"],
        "detail_url": item["detail_url"], "http_status": item["http_status"],
        "content_type": item["content_type"], "fetched_at": item["fetched_at"],
        "content_sha256": item["content_sha256"], "cache_path": item["cache_path"],
        "fetch_mode": item["fetch_mode"], "source_record_id": item["source_record_id"],
        "name": parsed.name, "bib": parsed.bib, "sex": parsed.sex,
        "age_class": parsed.age_class, "club": parsed.club, "city": parsed.city,
        "nationality": parsed.nationality, "status": parsed.status,
        "finish_seconds": parsed.finish_seconds, "overall_place": parsed.overall_place,
        "gender_place": parsed.gender_place, "class_place": parsed.class_place,
        "split_count": len(parsed.splits or []), "match": item["match"],
        "issues": item["issues"], "actions": actions,
        "splits": parsed.splits or [],
    }


def write_markdown(report: dict[str, Any], path: Path) -> None:
    summary = report["summary"]
    matching = summary["matching"]
    lines = [
        "# UV90 2016 official full dry-run", "",
        f"Decision: **{report['decision']}**", "",
        f"- Unique official idp: {summary['unique_idp']}",
        f"- Detail pages parsed: {summary['detail_pages_parsed']}",
        f"- Safe matches: {matching['safe_unique']}",
        f"- Ambiguous / conflicts / unmatched: {matching['ambiguous']} / {matching['conflicts']} / {matching['unmatched']}",
        f"- Intended official splits: {summary['intended_splits']}",
        f"- Official / enriched complete finishers: {summary['complete_finishers_official']} / {summary['complete_finishers_enriched']}",
        f"- Official / enriched DNF with passages: {summary['dnf_with_passages_official']} / {summary['dnf_with_passages_enriched']}",
        f"- Second-pass no-op splits: {summary['second_pass_noop']}",
        f"- SQLite integrity: {report['database_quality']['integrity_check']}", "",
        "## Match levels", "",
    ]
    for level, count in sorted(matching["per_level"].items()):
        lines.append(f"- Level {level}: {count}")
    lines.extend(["", "## Problem cases", ""])
    if report["problem_cases"]:
        for problem in report["problem_cases"]:
            lines.append(f"- `{problem['official_idp']}` {problem.get('name')}: {problem['reason']}")
    else:
        lines.append("No problem cases.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _table_digest(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> str:
    rows = [dict(row) for row in conn.execute(sql, params).fetchall()]
    return hashlib.sha256(_stable_json(rows).encode("utf-8")).hexdigest()


def protected_database_state(conn: sqlite3.Connection, race_id: int) -> dict[str, Any]:
    """Fingerprint every table that an enrichment is forbidden to alter."""
    state = {
        table: _table_digest(conn, f"SELECT * FROM {table} ORDER BY id")
        for table in ("results", "athletes", "athlete_external_ids", "races", "checkpoints", "sources")
    }
    state["splits_other_races"] = _table_digest(
        conn,
        """SELECT s.* FROM splits s JOIN results r ON r.id=s.result_id
             WHERE r.race_id<>? ORDER BY s.id""",
        (race_id,),
    )
    return state


def validate_apply_report(report: dict[str, Any]) -> None:
    if report.get("mode") != "full-dry-run" or report.get("decision") != READY_DECISION:
        raise ValueError("Apply requires a READY full-dry-run report")
    if (report.get("race_key"), report.get("race_id"), report.get("event_code")) != (
        EXACT_RACE_KEY, EXACT_RACE_ID, EXACT_EVENT_CODE,
    ):
        raise ValueError("Dry-run report race/event identity does not match UV90 2016")
    summary = report.get("summary") or {}
    for field, expected in EXPECTED_DRY_RUN.items():
        if summary.get(field) != expected:
            raise ValueError(f"Dry-run report {field} must be {expected}, got {summary.get(field)!r}")
    matching = summary.get("matching") or {}
    expected_matching = {
        "safe_unique": 985, "ambiguous": 0, "conflicts": 1, "unmatched": 0,
    }
    for field, expected in expected_matching.items():
        if matching.get(field) != expected:
            raise ValueError(f"Dry-run matching {field} must be {expected}, got {matching.get(field)!r}")
    if matching.get("per_level") != {"1": 985}:
        raise ValueError("Dry-run report must contain exactly 985 level-1 matches")
    passes = report.get("passes") or []
    if len(passes) != 2 or passes[0].get("inserted") != 6190:
        raise ValueError("Dry-run first pass must insert exactly 6190 splits")
    if any(passes[1].get(key) != expected for key, expected in (("inserted", 0), ("updated", 0), ("noop", 6190))):
        raise ValueError("Dry-run second pass must be an exact 6190-split no-op")
    participants = report.get("participants") or []
    if len(participants) != 986:
        raise ValueError("Dry-run report must contain 986 participant records")
    conflicts = [item for item in participants if item.get("match", {}).get("status") == "conflict"]
    if len(conflicts) != 1 or conflicts[0].get("official_idp") != "9999991678885A000026D718":
        raise ValueError("Dry-run report does not contain the one reviewed Tommy Guldstrand conflict")


def _allowed_cache_file(cache_value: str, raw_root: Path) -> Path:
    candidate = Path(cache_value)
    if not candidate.is_absolute():
        candidate = uvtool.ROOT / candidate
    candidate = candidate.expanduser().resolve()
    allowed = (uvtool.ROOT / "raw").resolve()
    try:
        candidate.relative_to(allowed)
    except ValueError as exc:
        raise ValueError(f"Cache file is outside the repository raw directory: {candidate}") from exc
    if not candidate.is_file():
        # Full-field details have a deterministic location even if a report was moved.
        fallback = (raw_root / "details" / candidate.name).expanduser().resolve()
        try:
            fallback.relative_to(allowed)
        except ValueError as exc:
            raise ValueError(f"Fallback cache file is outside raw: {fallback}") from exc
        candidate = fallback
    if not candidate.is_file():
        raise FileNotFoundError(candidate)
    return candidate


def _parsed_from_report(item: dict[str, Any]) -> uvtool.ParsedResult:
    return uvtool.ParsedResult(
        source_result_id=f"{item['event_code']}:{item['official_idp']}",
        source_url=item["detail_url"], bib=item.get("bib"), name=item.get("name"),
        sex=item.get("sex"), age_class=item.get("age_class"), nationality=item.get("nationality"),
        club=item.get("club"), city=item.get("city"), status=item.get("status") or "UNKNOWN",
        finish_seconds=item.get("finish_seconds"), overall_place=item.get("overall_place"),
        gender_place=item.get("gender_place"), class_place=item.get("class_place"),
        splits=item.get("splits") or [],
    )


def _store_source_metadata(conn: sqlite3.Connection, source_record_id: int, metadata: dict[str, Any]) -> None:
    payload = {
        "official_event": EXACT_EVENT_CODE,
        "record_type": metadata["record_type"],
        "external_id": metadata["external_id"],
        "content_type": metadata.get("content_type"),
        "fetch_mode": metadata.get("fetch_mode"),
    }
    conn.execute(
        "UPDATE source_records SET fetched_at=?,payload_text=? WHERE id=?",
        (metadata.get("fetched_at") or uvtool.utc_now(), _stable_json(payload), source_record_id),
    )


def apply_from_report(args: argparse.Namespace) -> dict[str, Any]:
    """Apply one atomic, report-gated enrichment pass to the exact production DB."""
    production = args.production_db.expanduser().resolve()
    target = args.target_db.expanduser().resolve()
    require_safe_database_target(target, production, apply=True, confirmation=args.confirmation)
    if target != production:
        raise ValueError("Explicit apply is restricted to the configured production database")
    if not args.apply or args.confirm_production_enrichment != PRODUCTION_CONFIRMATION:
        raise ValueError(f"Apply additionally requires --confirm-production-enrichment {PRODUCTION_CONFIRMATION}")
    if args.race != EXACT_RACE_KEY:
        raise ValueError(f"Apply is restricted to --race {EXACT_RACE_KEY}")
    actual_sha = sha256_file(target)
    if not args.expected_db_sha256 or actual_sha.lower() != args.expected_db_sha256.lower():
        raise ValueError(f"Target database SHA-256 mismatch: {actual_sha}")
    report = json.loads(args.dry_run_report.read_text(encoding="utf-8"))
    validate_apply_report(report)

    config = uvtool.load_config(args.config)
    race_cfg = uvtool.get_race_config(config, EXACT_RACE_KEY)
    if race_cfg.get("event_code") != EXACT_EVENT_CODE or int(race_cfg.get("result_year_path")) != 2017:
        raise ValueError("Configured UV90 2016 event/path does not match the reviewed source")

    conn = uvtool.connect(target)
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        race = conn.execute("SELECT * FROM races WHERE race_key=?", (EXACT_RACE_KEY,)).fetchone()
        source = conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
        # The pre-existing race row predates event discovery and may have a
        # NULL event_code.  Event identity is therefore gated by the reviewed
        # config and dry-run report above; production race identity is gated by
        # its immutable id/key/year without changing race metadata.
        if not race or race["id"] != EXACT_RACE_ID or race["year"] != 2016 or not source:
            raise RuntimeError("Production race/source identity guard failed")
        checkpoints = conn.execute("SELECT * FROM checkpoints WHERE race_id=? ORDER BY sequence_no", (race["id"],)).fetchall()
        if [row["checkpoint_key"] for row in checkpoints if row["checkpoint_key"] != "start"] != EXPECTED_SPLITS:
            raise RuntimeError("Production checkpoint structure differs from the reviewed UV90 2016 structure")

        conn.execute("BEGIN IMMEDIATE")
        protected_before = protected_database_state(conn, race["id"])
        counts_before = database_counts(conn, race["id"])
        source_before = counts_before["source_records"]
        source_run_id = conn.execute(
            "INSERT INTO import_runs(source_id,race_id,message) VALUES(?,?,?)",
            (source["id"], race["id"], "Atomic UV90 2016 official source registration"),
        ).lastrowid

        for page in report["pages"]:
            metadata = dict(page["resource"])
            cache_file = _allowed_cache_file(metadata["cache_path"], args.raw)
            html = cache_file.read_text(encoding="utf-8", errors="replace")
            if hashlib.sha256(html.encode("utf-8", errors="replace")).hexdigest() != metadata["content_sha256"]:
                raise RuntimeError(f"List cache SHA-256 mismatch for page {page['page']}")
            metadata["cache_path"] = str(cache_file)
            record_id = record_source_resource(conn, source_run_id, source["id"], race["id"], metadata, html)
            _store_source_metadata(conn, record_id, metadata)

        participants: list[dict[str, Any]] = []
        for item in report["participants"]:
            metadata = {
                "record_type": "participant_detail", "external_id": item["official_idp"],
                "request_url": item["detail_url"], "http_status": item["http_status"],
                "content_type": item.get("content_type"), "fetched_at": item["fetched_at"],
                "content_sha256": item["content_sha256"], "cache_path": item["cache_path"],
                "fetch_mode": item.get("fetch_mode"),
            }
            cache_file = _allowed_cache_file(metadata["cache_path"], args.raw)
            html = cache_file.read_text(encoding="utf-8", errors="replace")
            if hashlib.sha256(html.encode("utf-8", errors="replace")).hexdigest() != metadata["content_sha256"]:
                raise RuntimeError(f"Detail cache SHA-256 mismatch for {item['official_idp']}")
            metadata["cache_path"] = str(cache_file)
            source_record_id = record_source_resource(conn, source_run_id, source["id"], race["id"], metadata, html)
            _store_source_metadata(conn, source_record_id, metadata)
            parsed = _parsed_from_report(item)
            issues = validate_detail(parsed, html, race_cfg["checkpoints"])
            if any(issue["severity"] == "error" for issue in issues):
                raise RuntimeError(f"Blocking parser issue appeared for {item['official_idp']}")
            match = mika_import.match_existing_result(conn, race["id"], parsed)
            reviewed = item["match"]
            for field in ("status", "result_id", "level"):
                if match.get(field) != reviewed.get(field):
                    raise RuntimeError(f"Live match differs from dry-run for {item['official_idp']}: {field}")
            participants.append({
                "official_idp": item["official_idp"], "event_code": EXACT_EVENT_CODE,
                "detail_url": item["detail_url"], "http_status": item["http_status"],
                "fetched_at": item["fetched_at"], "content_sha256": item["content_sha256"],
                "cache_path": str(cache_file.relative_to(uvtool.ROOT.resolve())),
                "source_record_id": source_record_id, "parsed": parsed, "issues": issues, "match": match,
            })

        pass_result = enrich_pass(
            conn, race, source, checkpoints, participants, 1, commit=False,
            message="Atomic production enrichment: UV90 2016 official splits",
        )
        if pass_result["updated"] != 0 or pass_result["inserted"] + pass_result["noop"] != 6190:
            raise RuntimeError(f"Unexpected enrichment actions: {pass_result}")
        if (pass_result["inserted"], pass_result["noop"]) not in ((6190, 0), (0, 6190)):
            raise RuntimeError("Apply must be either the first exact insert or a complete idempotent no-op")
        conn.execute(
            """UPDATE import_runs SET finished_at=?,status='complete',records_seen=?,records_inserted=?,warnings=0
                 WHERE id=?""",
            (uvtool.utc_now(), 998, database_counts(conn, race["id"])["source_records"] - source_before, source_run_id),
        )
        quality = database_quality(conn, race["id"])
        if quality["integrity_check"] != "ok" or any(quality[key] for key in ("duplicate_result_checkpoint", "negative_or_zero_times", "estimated_splits", "duplicate_checkpoints")):
            raise RuntimeError(f"Database quality gate failed: {quality}")
        if conn.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("Foreign-key check failed")
        protected_after = protected_database_state(conn, race["id"])
        if protected_after != protected_before:
            raise RuntimeError("A protected core table or another race changed during enrichment")
        counts_after = database_counts(conn, race["id"])
        if counts_after["splits_race"] - counts_before["splits_race"] != pass_result["inserted"]:
            raise RuntimeError("Race split count change does not equal the reviewed insert count")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    output = {
        "generated_at": uvtool.utc_now(), "mode": "atomic-production-enrichment",
        "decision": "APPLY COMPLETE", "race_key": EXACT_RACE_KEY, "race_id": EXACT_RACE_ID,
        "event_code": EXACT_EVENT_CODE, "database_sha256_before": actual_sha,
        "database_sha256_after": sha256_file(target),
        "summary": {
            "participants_reviewed": 986, "safe_matches": 985, "conflicts_skipped": 1,
            "inserted": pass_result["inserted"], "updated": pass_result["updated"],
            "noop": pass_result["noop"], "splits_after": counts_after["splits_race"],
            "source_records_created": counts_after["source_records"] - source_before,
            "results_delta": counts_after["results_all"] - counts_before["results_all"],
            "athletes_delta": counts_after["athletes"] - counts_before["athletes"],
            "person_links_delta": counts_after["athlete_external_ids"] - counts_before["athlete_external_ids"],
        },
        "database_quality": quality,
    }
    args.report_json.parent.mkdir(parents=True, exist_ok=True)
    args.report_json.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    args.report_md.write_text(
        "# UV90 2016 atomic production enrichment\n\n"
        f"- Inserted / updated / no-op: {pass_result['inserted']} / {pass_result['updated']} / {pass_result['noop']}\n"
        f"- Source records created: {output['summary']['source_records_created']}\n"
        "- Protected core tables: unchanged\n- SQLite integrity: ok\n",
        encoding="utf-8",
    )
    return output


def execute(args: argparse.Namespace, apply: bool = False) -> dict[str, Any]:
    production = args.production_db.expanduser().resolve()
    if apply:
        target = args.target_db.expanduser().resolve()
        require_safe_database_target(target, production, apply=True, confirmation=args.confirmation)
        if not args.apply:
            raise ValueError("Apply subcommand additionally requires --apply")
        database_path = target
        source_sha = sha256_file(target)
        if args.expected_db_sha256 and source_sha.lower() != args.expected_db_sha256.lower():
            raise ValueError(f"Target database SHA-256 mismatch: {source_sha}")
    else:
        database_path = args.work_db.expanduser().resolve()
        source_sha = prepare_work_database(production, database_path, args.expected_db_sha256)

    config = uvtool.load_config(args.config)
    race_cfg = uvtool.get_race_config(config, args.race)
    conn = uvtool.connect(database_path)
    race = conn.execute("SELECT * FROM races WHERE race_key=?", (args.race,)).fetchone()
    source = conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
    if not race or not source:
        raise RuntimeError("Race or vasaloppet_mika source missing from database")
    checkpoints = conn.execute("SELECT * FROM checkpoints WHERE race_id=? ORDER BY sequence_no", (race["id"],)).fetchall()
    raw = RawArchive(args.raw, args.cache_read_root, args.delay)
    fetch_run_id = conn.execute(
        "INSERT INTO import_runs(source_id,race_id,message) VALUES(?,?,?)",
        (source["id"], race["id"], "Official full-field source acquisition"),
    ).lastrowid
    conn.commit()
    participants: list[dict[str, Any]] = []
    http_errors: list[dict[str, Any]] = []
    parser_errors: list[dict[str, Any]] = []
    try:
        def fetch_page(page: int, url: str) -> tuple[str, dict[str, Any]]:
            fallbacks = [Path("lists") / f"page-{page:03d}.html"]
            if page == 1:
                fallbacks.append(Path("lists") / "page-001-v1.html")
            html, meta = raw.fetch(url, Path("lists") / f"page-{page:03d}.html", "result_list", str(page), fallbacks)
            record_source_resource(conn, fetch_run_id, source["id"], race["id"], meta, html)
            conn.commit()
            return html, meta

        entries, pages = paginate_entries(
            race_cfg, fetch_page, max_pages=args.max_pages,
            empty_pages_to_stop=race_cfg.get("empty_pages_to_stop", 2),
        )
        for index, entry in enumerate(entries, 1):
            idp = entry["idp"]
            url = mika_import.detail_url(race_cfg, idp, entry.get("url", ""))
            try:
                html, meta = raw.fetch(
                    url, Path("details") / f"{idp}.html", "participant_detail", idp,
                    [Path("details") / f"{idp}.html"],
                )
                source_record_id = record_source_resource(conn, fetch_run_id, source["id"], race["id"], meta, html)
                parsed = mika_import.apply_fallback(
                    uvtool.parse_detail_html(html, f"{race_cfg['event_code']}:{idp}", url, race_cfg["checkpoints"]),
                    entry,
                )
                issues = validate_detail(parsed, html, race_cfg["checkpoints"])
                for split in parsed.splits or []:
                    split["official_source_record_id"] = source_record_id
                match = mika_import.match_existing_result(conn, race["id"], parsed)
                participants.append({
                    "official_idp": idp, "event_code": race_cfg["event_code"],
                    "detail_url": url, "http_status": meta["http_status"],
                    "content_type": meta["content_type"], "fetched_at": meta["fetched_at"],
                    "content_sha256": meta["content_sha256"], "cache_path": meta["cache_path"],
                    "fetch_mode": meta["fetch_mode"], "source_record_id": source_record_id,
                    "parsed": parsed, "issues": issues, "match": match,
                })
            except Exception as exc:
                error = {"official_idp": idp, "url": url, "error": str(exc)}
                if isinstance(exc, (ValueError, KeyError, TypeError)):
                    parser_errors.append(error)
                else:
                    http_errors.append(error)
                raw.add_error("participant_detail", idp, url, exc)
            if index % 25 == 0 or index == len(entries):
                print(f"Details {index}/{len(entries)}: {len(participants)} parsed, {len(http_errors)} HTTP errors, {len(parser_errors)} parser errors", flush=True)
                conn.commit()
        conn.execute(
            """UPDATE import_runs SET finished_at=?,status=?,records_seen=?,warnings=? WHERE id=?""",
            (uvtool.utc_now(), "complete" if not http_errors and not parser_errors else "complete-with-warnings",
             len(entries), len(http_errors) + len(parser_errors), fetch_run_id),
        )
        conn.commit()

        passes = [enrich_pass(conn, race, source, checkpoints, participants, number) for number in range(1, 3 if not apply else 2)]
        quality = database_quality(conn, race["id"])
        matched_ids = {item["match"]["result_id"] for item in participants if item["match"]["status"] == "matched"}
        existing_ids = {row[0] for row in conn.execute("SELECT id FROM results WHERE race_id=?", (race["id"],)).fetchall()}
        status_counts = Counter(item["parsed"].status for item in participants)
        match_counts = Counter(item["match"]["status"] for item in participants)
        level_counts = Counter(str(item["match"].get("level")) for item in participants if item["match"]["status"] == "matched")
        coverage = Counter(split["checkpoint_key"] for item in participants for split in item["parsed"].splits or [])
        eligible = [
            item for item in participants
            if item["match"]["status"] == "matched"
            and not any(issue["severity"] == "error" for issue in item["issues"])
        ]
        intended_coverage = Counter(split["checkpoint_key"] for item in eligible for split in item["parsed"].splits or [])
        complete_finishers = sum(
            1 for item in participants
            if item["parsed"].status == "FINISHED" and [split["checkpoint_key"] for split in item["parsed"].splits or []] == EXPECTED_SPLITS
        )
        enriched_complete_finishers = sum(
            1 for item in eligible
            if item["parsed"].status == "FINISHED" and [split["checkpoint_key"] for split in item["parsed"].splits or []] == EXPECTED_SPLITS
        )
        dnf_with_passages = sum(1 for item in participants if item["parsed"].status == "DNF" and item["parsed"].splits)
        enriched_dnf_with_passages = sum(1 for item in eligible if item["parsed"].status == "DNF" and item["parsed"].splits)
        unknown_with_passages = sum(1 for item in participants if item["parsed"].status == "UNKNOWN" and item["parsed"].splits)
        problem_cases = []
        for item in participants:
            reasons = []
            if item["match"]["status"] != "matched": reasons.append(f"match={item['match']['status']}")
            reasons.extend(issue["code"] for issue in item["issues"])
            if reasons:
                problem_cases.append({"official_idp": item["official_idp"], "name": item["parsed"].name, "reason": ", ".join(reasons)})
        intended_splits = sum(len(item["parsed"].splits or []) for item in eligible)
        second = passes[-1]
        blocking_issue_count = sum(
            1 for item in participants for issue in item["issues"] if issue["severity"] == "error"
        )
        summary = {
            "list_entries_seen": sum(page["entries"] for page in pages),
            "unique_idp": len(entries), "detail_pages_parsed": len(participants),
            "http_errors": len(http_errors), "parser_errors": len(parser_errors),
            "status": dict(status_counts),
            "matching": {
                "safe_unique": match_counts["matched"], "ambiguous": match_counts["ambiguous"],
                "conflicts": match_counts["conflict"], "unmatched": match_counts["unmatched"],
                "per_level": dict(level_counts),
            },
            "existing_results_without_official_match": len(existing_ids - matched_ids),
            "intended_splits": intended_splits,
            "complete_finishers_official": complete_finishers,
            "complete_finishers_enriched": enriched_complete_finishers,
            "dnf_with_passages_official": dnf_with_passages,
            "dnf_with_passages_enriched": enriched_dnf_with_passages,
            "unknown_with_passages": unknown_with_passages,
            "official_checkpoint_coverage": dict(coverage),
            "intended_checkpoint_coverage": dict(intended_coverage),
            "source_records_created": len(raw.manifest["resources"]),
            "second_pass_noop": second["noop"],
            "blocking_quality_issues": blocking_issue_count,
        }
        ready = (
            len(entries) >= 900 and len(participants) == len(entries)
            and not http_errors and not parser_errors
            and match_counts["matched"] / len(entries) >= 0.99
            and not match_counts["ambiguous"] and match_counts["conflict"] <= 5
            and match_counts["unmatched"] <= 5 and blocking_issue_count == 0
            and second["inserted"] == 0 and second["updated"] == 0 and second["noop"] == intended_splits
            and quality["integrity_check"] == "ok"
            and not quality["duplicate_result_checkpoint"] and not quality["negative_or_zero_times"]
        )
        serialized = []
        for item in participants:
            actions = [pass_result["participant_actions"][item["official_idp"]] for pass_result in passes]
            serialized.append(participant_report(item, actions))
        report = {
            "generated_at": uvtool.utc_now(), "mode": "apply" if apply else "full-dry-run",
            "decision": READY_DECISION if ready else "INTE REDO",
            "race_key": args.race, "race_id": race["id"], "event_code": race_cfg["event_code"],
            "result_year_path": race_cfg["result_year_path"],
            "production_database": str(production), "database_used": str(database_path),
            "production_sha256_before": source_sha, "pages": pages,
            "summary": summary, "http_errors": http_errors, "parser_errors": parser_errors,
            "problem_cases": problem_cases,
            "existing_results_without_official_match": sorted(existing_ids - matched_ids),
            "passes": [{key: value for key, value in result.items() if key != "participant_actions"} for result in passes],
            "database_quality": quality, "participants": serialized,
            "source_manifest": str(raw.manifest_path),
        }
        args.report_json.parent.mkdir(parents=True, exist_ok=True)
        args.report_json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        write_markdown(report, args.report_md)
        return report
    finally:
        raw.close()
        conn.close()


def add_common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--race", required=True)
    p.add_argument("--production-db", type=Path, default=uvtool.DEFAULT_DB)
    p.add_argument("--expected-db-sha256")
    p.add_argument("--config", type=Path, default=uvtool.DEFAULT_CONFIG)
    p.add_argument("--raw", type=Path, required=True)
    p.add_argument("--cache-read-root", type=Path, action="append", default=[])
    p.add_argument("--report-json", type=Path, required=True)
    p.add_argument("--report-md", type=Path, required=True)
    p.add_argument("--delay", type=float, default=1.2)
    p.add_argument("--max-pages", type=int, default=200)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    dry = sub.add_parser("full-dry-run")
    add_common(dry)
    dry.add_argument("--work-db", type=Path, required=True)
    apply_parser = sub.add_parser("apply")
    add_common(apply_parser)
    apply_parser.add_argument("--target-db", type=Path, required=True)
    apply_parser.add_argument("--apply", action="store_true")
    apply_parser.add_argument("--confirmation", required=True)
    apply_parser.add_argument("--confirm-production-enrichment", required=True)
    apply_parser.add_argument("--dry-run-report", type=Path, required=True)
    return p


def main() -> None:
    args = parser().parse_args()
    report = apply_from_report(args) if args.command == "apply" else execute(args, apply=False)
    print(json.dumps({
        "decision": report["decision"], "summary": report["summary"],
        "report_json": str(args.report_json), "report_md": str(args.report_md),
    }, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
