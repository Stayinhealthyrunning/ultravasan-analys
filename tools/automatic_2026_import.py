#!/usr/bin/env python3
"""Conservative, atomic importer for official Ultravasan 2026 results.

The scheduled workflow first runs ``availability``. Full downloads and writes are
only attempted after both official fields pass a conservative list/detail probe.
``full-dry-run`` imports into a database copy and verifies semantic idempotency.
``apply`` is a separate, explicitly confirmed local file promotion step.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import shutil
import sqlite3
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Iterable
from urllib.parse import urlparse

import configure_discovered_event
import mika_import
import uvtool

ROOT = Path(__file__).resolve().parents[1]
OFFICIAL_HOST = "results.vasaloppet.se"
PUBLIC_URL = "https://stayinhealthyrunning.github.io/ultravasan-analys/"
START_DATE = date(2026, 8, 16)
END_DATE = date(2026, 9, 15)
APPLY_CONFIRMATION = "APPLY-AUTOMATIC-2026-RESULTS"
TARGETS = {
    "uv90": {
        "race_key": "ultravasan90-2026", "template_key": "ultravasan90-2025",
        "name": "Ultravasan 90", "min_results": 1200, "max_results": 4000,
    },
    "uv45": {
        "race_key": "ultravasan45-2026", "template_key": "ultravasan45-2025",
        "name": "Ultravasan 45", "min_results": 500, "max_results": 2500,
    },
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_digest(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def schedule_state(today: date) -> str:
    if today < START_DATE:
        return "before-window"
    if today > END_DATE:
        return "after-window"
    return "active"


def write_github_output(path: Path | None, values: dict[str, Any]) -> None:
    if not path:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={str(value).lower() if isinstance(value, bool) else value}\n")


def require_official_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != OFFICIAL_HOST:
        raise ValueError(f"Only https://{OFFICIAL_HOST}/ is allowed, not {url!r}")


def target_race(config: dict[str, Any], key: str) -> dict[str, Any]:
    race = next((item for item in config.get("races", []) if item.get("race_key") == key), None)
    if not race:
        raise KeyError(f"Race is missing from generated config: {key}")
    return race


def add_current_uv90_official_checkpoints(race: dict[str, Any]) -> None:
    """Add official timing controls present on current Mika detail pages.

    Mika does not publish distances for these two rows. Keep their official row
    order, but leave distance unknown rather than inventing a route position.
    A different 2026 label is still blocked by strict detail-page validation.
    """
    checkpoints = copy.deepcopy(race.get("checkpoints") or [])
    keys = [checkpoint.get("checkpoint_key") for checkpoint in checkpoints]
    if "high_point" not in keys:
        position = keys.index("smagan")
        checkpoints.insert(position, {
            "checkpoint_key": "high_point", "name": "Högsta punkten",
            "sequence_no": position, "distance_km": None,
        })
    keys = [checkpoint.get("checkpoint_key") for checkpoint in checkpoints]
    if "mora_warning" not in keys:
        position = keys.index("mora")
        checkpoints.insert(position, {
            "checkpoint_key": "mora_warning", "name": "Mora Förvarning",
            "sequence_no": position, "distance_km": None,
        })
    for sequence, checkpoint in enumerate(checkpoints):
        checkpoint["sequence_no"] = sequence
    race["checkpoints"] = checkpoints


def configured_targets(base_config: dict[str, Any], selected: dict[str, dict[str, Any]], year: int = 2026) -> dict[str, Any]:
    """Return a new config; never expose an empty future race in the current export."""
    config = copy.deepcopy(base_config)
    target_keys = {meta["race_key"] for meta in TARGETS.values()}
    config["races"] = [race for race in config.get("races", []) if race.get("race_key") not in target_keys]
    for family, meta in TARGETS.items():
        template = next(race for race in config["races"] if race.get("race_key") == meta["template_key"])
        event = selected[family]
        if int(event.get("year") or 0) != year:
            raise ValueError(f"Discovered {family} event belongs to {event.get('year')}, not {year}")
        label = uvtool.normalize(str(event.get("label") or ""))
        distance = "90" if family == "uv90" else "45"
        code = str(event.get("event_code") or "")
        if "ultravasan" not in label or not re.search(rf"\b{distance}\b", label):
            raise ValueError(f"Discovered event label does not identify {meta['name']}: {event!r}")
        if "elit" in label or "elite" in label or code.startswith(("UL4E_", "UL9E_")):
            raise ValueError(f"Elite event must not be imported: {event!r}")
        path_year = int(event["result_year_path"])
        base = f"https://{OFFICIAL_HOST}/{path_year}/"
        race = copy.deepcopy(template)
        race.update({
            "race_key": meta["race_key"], "race_family": family, "name": meta["name"],
            "year": year, "race_date": f"{year}-08-15", "event_code": code,
            "result_year_path": path_year,
            "official_url": f"{base}?pid=search&event={code}",
            "page_url_template": f"{base}?page={{page}}&event={code}&pid=search",
            "detail_url_template": f"{base}?content=detail&fpid=search&pid=search&idp={{idp}}&lang=SE&event={code}",
            "page_url_templates": [
                f"{base}?page={{page}}&event={code}&num_results=100&pid=search",
                f"{base}?page={{page}}&event={code}&num_results=100&pid=list",
            ],
            "notes": "Event code discovered from the official Mika catalogue; import is quality-gated.",
        })
        if family == "uv90":
            add_current_uv90_official_checkpoints(race)
        for field in ("official_url", "page_url_template", "detail_url_template"):
            require_official_url(race[field])
        config["races"].append(race)
    if target_race(config, TARGETS["uv90"]["race_key"])["event_code"] == target_race(config, TARGETS["uv45"]["race_key"])["event_code"]:
        raise ValueError("UV90 and UV45 resolved to the same event")
    return config


def discover_events(year: int, raw: Path, delay: float, force: bool = False) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    fetcher = mika_import.Fetcher(delay, browser_fallback=False, force=force)
    found: dict[tuple[int, str], dict[str, Any]] = {}
    try:
        for path_year in (year + 1, year):
            url = f"https://{OFFICIAL_HOST}/{path_year}/?pid=list"
            require_official_url(url)
            cache = raw / "catalogue" / f"events-{path_year}.html"
            html, status, cached, mode = fetcher.get(url, cache)
            for candidate in mika_import.extract_event_candidates(html, path_year):
                item = {**candidate, "result_year_path": path_year, "catalogue_url": url, "status": status, "cached": cached, "mode": mode}
                key = (int(item["year"]), str(item["event_code"]))
                current = found.get(key)
                if current is None or path_year == year + 1:
                    found[key] = item
    finally:
        fetcher.close()
    discovered = sorted(found.values(), key=lambda item: (item["year"], item["event_code"]))
    selected: dict[str, dict[str, Any]] = {}
    synthetic_config = {
        family: {"name": meta["name"], "year": year}
        for family, meta in TARGETS.items()
    }
    for family, meta in TARGETS.items():
        selected[family] = configure_discovered_event.select_discovered_event(
            meta["race_key"], synthetic_config[family], discovered,
        )
    return selected, discovered


def collect_list_entries(race: dict[str, Any], raw: Path, delay: float, force: bool = False, max_pages: int = 60) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    fetcher = mika_import.Fetcher(delay, browser_fallback=False, force=force)
    entries: dict[str, dict[str, Any]] = {}
    pages: list[dict[str, Any]] = []
    try:
        partitions = ["M", "W"] if race.get("partition_by_sex") else [None]
        for sex in partitions:
            empty = 0
            for page in range(1, min(max_pages, int(race.get("max_pages") or max_pages)) + 1):
                best: list[dict[str, Any]] = []
                used_url = None
                for variant, url in enumerate(mika_import.list_url_candidates(race, page, sex), 1):
                    require_official_url(url)
                    cache = raw / race["race_key"] / "lists" / (sex or "ALL") / f"page-{page:03d}-v{variant}.html"
                    html, status, cached, mode = fetcher.get(url, cache)
                    candidate = mika_import.extract_entries(html, url)
                    if sum(item["idp"] not in entries for item in candidate) > sum(item["idp"] not in entries for item in best):
                        best, used_url = candidate, url
                    if any(item["idp"] not in entries for item in candidate):
                        break
                new = 0
                for item in best:
                    if item["idp"] not in entries:
                        entries[item["idp"]] = item
                        new += 1
                pages.append({"partition": sex or "ALL", "page": page, "entries": len(best), "new": new, "total": len(entries), "url": used_url})
                empty = empty + 1 if new == 0 else 0
                if empty >= int(race.get("empty_pages_to_stop") or 2):
                    break
    finally:
        fetcher.close()
    return list(entries.values()), pages


def representative_sample(items: list[dict[str, Any]], size: int = 10) -> list[dict[str, Any]]:
    if len(items) <= size:
        return items
    positions = sorted({round(index * (len(items) - 1) / (size - 1)) for index in range(size)})
    return [items[position] for position in positions]


def probe_details(race: dict[str, Any], entries: list[dict[str, Any]], raw: Path, delay: float, force: bool = False) -> dict[str, Any]:
    fetcher = mika_import.Fetcher(delay, browser_fallback=False, force=force)
    details: list[dict[str, Any]] = []
    try:
        for entry in representative_sample(entries):
            idp = entry["idp"]
            url = mika_import.detail_url(race, idp, entry.get("url", ""))
            require_official_url(url)
            cache = raw / race["race_key"] / "probe" / f"{re.sub(r'[^A-Za-z0-9_.-]', '_', idp)}.html"
            html, status, cached, mode = fetcher.get(url, cache)
            parsed = mika_import.apply_fallback(
                uvtool.parse_detail_html(html, f"{race['event_code']}:{idp}", url, race["checkpoints"]),
                entry,
            )
            issues = mika_import.validate_official_detail(parsed, html, race["checkpoints"])
            details.append({
                "idp": idp, "status": parsed.status, "finish_seconds": parsed.finish_seconds,
                "splits": len(parsed.splits or []), "issues": issues, "http_status": status,
                "cached": cached, "mode": mode,
            })
    finally:
        fetcher.close()
    return {
        "details": details,
        "blocking_issues": sum(1 for detail in details for issue in detail["issues"] if issue["severity"] == "error"),
        "finished": sum(detail["status"] == "FINISHED" for detail in details),
        "with_splits": sum(detail["splits"] > 0 for detail in details),
    }


def availability_blockers(family: str, count: int, probe: dict[str, Any], *, representative: bool = False) -> list[str]:
    meta = TARGETS[family]
    lower = 5 if representative else int(meta["min_results"])
    upper = 20 if representative else int(meta["max_results"])
    blockers: list[str] = []
    if not lower <= count <= upper:
        blockers.append(f"participant-count={count}, expected {lower}..{upper}")
    if probe["blocking_issues"]:
        blockers.append(f"blocking-parser-issues={probe['blocking_issues']}")
    if not probe["finished"]:
        blockers.append("representative sample has no finisher")
    if probe["with_splits"] < max(1, len(probe["details"]) // 2):
        blockers.append("too few sampled participants have official splits")
    return blockers


def dump_rows(conn: sqlite3.Connection, sql: str, params: Iterable[Any] = ()) -> list[list[Any]]:
    return [list(row) for row in conn.execute(sql, tuple(params)).fetchall()]


def protected_history_digest(conn: sqlite3.Connection) -> str:
    payload = {
        "races": dump_rows(conn, "SELECT * FROM races WHERE year<2026 ORDER BY id"),
        "checkpoints": dump_rows(conn, "SELECT cp.* FROM checkpoints cp JOIN races r ON r.id=cp.race_id WHERE r.year<2026 ORDER BY cp.id"),
        "results": dump_rows(conn, "SELECT res.* FROM results res JOIN races r ON r.id=res.race_id WHERE r.year<2026 ORDER BY res.id"),
        "splits": dump_rows(conn, "SELECT s.* FROM splits s JOIN results res ON res.id=s.result_id JOIN races r ON r.id=res.race_id WHERE r.year<2026 ORDER BY s.id"),
    }
    return stable_digest(payload)


def target_semantic_state(conn: sqlite3.Connection, race_keys: Iterable[str]) -> dict[str, Any]:
    keys = tuple(race_keys)
    placeholders = ",".join("?" for _ in keys)
    races = dump_rows(conn, f"SELECT id,race_key,name,year,race_date,distance_km,event_code,result_year_path,official_url,course_version FROM races WHERE race_key IN ({placeholders}) ORDER BY race_key", keys)
    results = dump_rows(conn, f"SELECT res.race_id,res.source_result_id,res.bib,res.name_as_published,res.sex,res.age_class,res.nationality,res.club,res.city,res.status,res.finish_seconds,res.overall_place,res.gender_place,res.class_place FROM results res JOIN races r ON r.id=res.race_id WHERE r.race_key IN ({placeholders}) ORDER BY r.race_key,res.source_result_id", keys)
    splits = dump_rows(conn, f"SELECT r.race_key,res.source_result_id,cp.checkpoint_key,s.elapsed_seconds,s.segment_seconds,s.place_overall,s.place_gender,s.place_class,s.pace_seconds_per_km,s.reported_pace_seconds_per_km,s.speed_kmh,s.time_of_day,s.is_estimated FROM splits s JOIN results res ON res.id=s.result_id JOIN races r ON r.id=res.race_id JOIN checkpoints cp ON cp.id=s.checkpoint_id WHERE r.race_key IN ({placeholders}) ORDER BY r.race_key,res.source_result_id,cp.sequence_no", keys)
    return {"races": races, "results": results, "splits": splits}


def target_semantic_digest(conn: sqlite3.Connection, race_keys: Iterable[str]) -> str:
    return stable_digest(target_semantic_state(conn, race_keys))


def race_quality(conn: sqlite3.Connection, race_key: str, import_report: dict[str, Any], *, representative: bool = False) -> dict[str, Any]:
    race = conn.execute("SELECT * FROM races WHERE race_key=?", (race_key,)).fetchone()
    if not race:
        return {"race_key": race_key, "blockers": ["race missing"]}
    race_id = race["id"]
    results = conn.execute("SELECT * FROM results WHERE race_id=? ORDER BY id", (race_id,)).fetchall()
    status = Counter(row["status"] for row in results)
    checkpoints = conn.execute("SELECT * FROM checkpoints WHERE race_id=? ORDER BY sequence_no", (race_id,)).fetchall()
    expected = [row["checkpoint_key"] for row in checkpoints if row["checkpoint_key"] != "start"]
    split_rows = conn.execute("""
        SELECT s.*,cp.checkpoint_key,cp.sequence_no,res.finish_seconds,res.status result_status
        FROM splits s JOIN results res ON res.id=s.result_id JOIN checkpoints cp ON cp.id=s.checkpoint_id
        WHERE res.race_id=? ORDER BY s.result_id,cp.sequence_no
    """, (race_id,)).fetchall()
    by_result: dict[int, list[sqlite3.Row]] = {}
    for row in split_rows:
        by_result.setdefault(row["result_id"], []).append(row)
    finishers = [row for row in results if row["status"] == "FINISHED"]
    starters = [row for row in results if row["status"] not in {"DNS"}]
    complete = sum([split["checkpoint_key"] for split in by_result.get(row["id"], [])] == expected for row in finishers)
    non_increasing = sum(
        any(a["elapsed_seconds"] is None or b["elapsed_seconds"] is None or a["elapsed_seconds"] >= b["elapsed_seconds"] for a, b in zip(rows, rows[1:]))
        for rows in by_result.values()
    )
    after_finish = sum(
        row["finish_seconds"] is not None and row["checkpoint_key"] != "mora" and row["elapsed_seconds"] > row["finish_seconds"]
        for row in split_rows if row["elapsed_seconds"] is not None
    )
    mora_mismatch = sum(
        row["status"] == "FINISHED" and (
            not (mora := next((split for split in by_result.get(row["id"], []) if split["checkpoint_key"] == "mora"), None))
            or mora["elapsed_seconds"] != row["finish_seconds"]
        ) for row in results
    )
    duplicate_splits = conn.execute("""
        SELECT COUNT(*) FROM (SELECT s.result_id,s.checkpoint_id,COUNT(*) n FROM splits s
        JOIN results r ON r.id=s.result_id WHERE r.race_id=? GROUP BY 1,2 HAVING n>1)
    """, (race_id,)).fetchone()[0]
    estimated = conn.execute("SELECT COUNT(*) FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id=? AND s.is_estimated<>0", (race_id,)).fetchone()[0]
    wrong_sources = conn.execute("SELECT COUNT(*) FROM results r JOIN sources s ON s.id=r.source_id WHERE r.race_id=? AND s.code<>'vasaloppet_mika'", (race_id,)).fetchone()[0]
    collisions = [item for item in uvtool.collect_same_race_identity_collisions(conn) if item.get("race_id") == race_id]
    parser_warnings = int(import_report.get("warnings") or 0)
    strict_errors = sum(
        1 for detail in import_report.get("details", [])
        for issue in detail.get("quality_issues", []) if issue.get("severity") == "error"
    )
    count = len(results)
    official_records = int(import_report.get("records") or 0)
    with_splits = sum(bool(by_result.get(row["id"])) for row in starters)
    family = "uv45" if "45" in race_key else "uv90"
    lower = 5 if representative else TARGETS[family]["min_results"]
    upper = 20 if representative else TARGETS[family]["max_results"]
    blockers: list[str] = []
    checks = {
        "participant_count": count, "official_records": official_records,
        "statuses": dict(status), "splits": len(split_rows),
        "starters": len(starters), "finishers": len(finishers), "dnf": status["DNF"], "dns": status["DNS"],
        "with_splits": with_splits, "complete_finishers": complete,
        "duplicate_splits": duplicate_splits, "estimated_splits": estimated,
        "non_increasing_series": non_increasing, "splits_after_finish": after_finish,
        "mora_finish_mismatch": mora_mismatch, "wrong_sources": wrong_sources,
        "identity_collisions": len(collisions), "parser_warnings": parser_warnings,
        "strict_parser_errors": strict_errors,
        "checkpoint_coverage": dict(Counter(row["checkpoint_key"] for row in split_rows)),
    }
    if not int(lower) <= count <= int(upper): blockers.append("participant count outside gate")
    if official_records != count: blockers.append("database participant count differs from official list")
    if not finishers: blockers.append("no finishers")
    if not representative and len(finishers) < count * 0.5: blockers.append("implausibly few finishers")
    if starters and with_splits / len(starters) < (0.4 if representative else 0.70): blockers.append("official split coverage too low")
    if finishers and complete / len(finishers) < (0.4 if representative else 0.70): blockers.append("complete finisher coverage too low")
    if any((duplicate_splits, estimated, non_increasing, after_finish, mora_mismatch, wrong_sources, collisions, parser_warnings, strict_errors)):
        blockers.append("one or more strict data-quality checks failed")
    allowed_statuses = {"FINISHED", "DNF", "DNS", "DSQ", "UNKNOWN"}
    if set(status) - allowed_statuses: blockers.append("unknown status values")
    return {"race_key": race_key, **checks, "blockers": blockers}


def database_gates(conn: sqlite3.Connection) -> list[str]:
    blockers: list[str] = []
    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok": blockers.append(f"integrity_check={integrity}")
    foreign_keys = conn.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_keys: blockers.append(f"foreign_key_check={len(foreign_keys)}")
    return blockers


def import_one(race_key: str, db: Path, config: Path, raw: Path, report: Path, delay: float, limit: int = 0, probe: bool = False) -> dict[str, Any]:
    args = SimpleNamespace(
        race=race_key, db=db, config=config, raw=raw, delay=delay, force=False,
        browser_fallback=False, max_pages=250, limit=limit, strict_official=True,
        report=report,
    )
    mika_import.execute(args, probe=probe)
    return json.loads(report.read_text(encoding="utf-8"))


def export_to(db: Path, directory: Path) -> dict[str, Any]:
    directory.mkdir(parents=True, exist_ok=True)
    json_path = directory / "ultravasan.json"
    js_path = directory / "ultravasan-data.js"
    uvtool.export_web(SimpleNamespace(db=db, output=json_path, js_output=js_path))
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if len(payload["results"]) != manifest["results"] or len(payload["splits"]) != manifest["splits"]:
        raise RuntimeError("Export manifest does not match JSON payload")
    prefix, suffix = "window.ULTRAVASAN_DATA=", ";\n"
    js = js_path.read_text(encoding="utf-8")
    if not js.startswith(prefix) or not js.endswith(suffix) or json.loads(js[len(prefix):-len(suffix)]) != payload:
        raise RuntimeError("JavaScript export is not identical to JSON export")
    return {"results": len(payload["results"]), "splits": len(payload["splits"]), "manifest": manifest}


def command_window(args: argparse.Namespace) -> dict[str, Any]:
    today = date.fromisoformat(args.today) if args.today else datetime.now(timezone.utc).date()
    state = schedule_state(today)
    report = {"date_utc": today.isoformat(), "state": state, "active": state == "active"}
    write_github_output(args.github_output, report)
    return report


def command_availability(args: argparse.Namespace) -> dict[str, Any]:
    base = uvtool.load_config(args.config)
    try:
        selected, discovered = discover_events(2026, args.raw, args.delay, args.force)
    except SystemExit as exc:
        report = {
            "generated_at": utc_now(), "mode": "availability", "ready": False,
            "source_host": OFFICIAL_HOST, "discovered": [], "races": {},
            "blockers": [f"official 2026 events are not published yet: {exc}"],
        }
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        write_github_output(args.github_output, {"ready": False, "uv90_results": 0, "uv45_results": 0})
        return report
    generated = configured_targets(base, selected)
    args.generated_config.parent.mkdir(parents=True, exist_ok=True)
    args.generated_config.write_text(json.dumps(generated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    races: dict[str, Any] = {}
    all_blockers: list[str] = []
    for family, meta in TARGETS.items():
        race = target_race(generated, meta["race_key"])
        entries, pages = collect_list_entries(race, args.raw, args.delay, args.force)
        probe = probe_details(race, entries, args.raw, args.delay, args.force) if entries else {"details": [], "blocking_issues": 0, "finished": 0, "with_splits": 0}
        blockers = availability_blockers(family, len(entries), probe)
        all_blockers.extend(f"{family}: {blocker}" for blocker in blockers)
        races[family] = {"race_key": meta["race_key"], "event_code": race["event_code"], "participants": len(entries), "pages": pages, "probe": probe, "blockers": blockers}
    report = {"generated_at": utc_now(), "mode": "availability", "ready": not all_blockers, "source_host": OFFICIAL_HOST, "discovered": discovered, "races": races, "blockers": all_blockers}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_github_output(args.github_output, {"ready": report["ready"], "uv90_results": races["uv90"]["participants"], "uv45_results": races["uv45"]["participants"]})
    return report


def command_full_dry_run(args: argparse.Namespace) -> dict[str, Any]:
    availability = json.loads(args.availability_report.read_text(encoding="utf-8"))
    if not availability.get("ready"):
        raise RuntimeError("Availability report is not ready")
    if args.work_db.resolve() == args.production_db.resolve():
        raise ValueError("Work database must be separate from production")
    args.work_db.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.production_db, args.work_db)
    uvtool.init_db(args.work_db, args.generated_config)
    race_keys = [meta["race_key"] for meta in TARGETS.values()]
    with uvtool.connect(args.production_db) as production:
        before_digest = target_semantic_digest(production, race_keys)
    with uvtool.connect(args.work_db) as work:
        history_before = protected_history_digest(work)
    first_reports: dict[str, Any] = {}
    for family, meta in TARGETS.items():
        first_reports[family] = import_one(meta["race_key"], args.work_db, args.generated_config, args.raw, args.report.parent / f"{meta['race_key']}-pass1.json", args.delay)
    with uvtool.connect(args.work_db) as work:
        qualities = {family: race_quality(work, meta["race_key"], first_reports[family]) for family, meta in TARGETS.items()}
        first_digest = target_semantic_digest(work, race_keys)
        first_counts = {family: {key: qualities[family][key] for key in ("participant_count", "splits")} for family in TARGETS}
        history_after_first = protected_history_digest(work)
        global_blockers = database_gates(work)
    second_reports: dict[str, Any] = {}
    for family, meta in TARGETS.items():
        second_reports[family] = import_one(meta["race_key"], args.work_db, args.generated_config, args.raw, args.report.parent / f"{meta['race_key']}-pass2.json", 0.0)
    with uvtool.connect(args.work_db) as work:
        second_digest = target_semantic_digest(work, race_keys)
        second_qualities = {family: race_quality(work, meta["race_key"], second_reports[family]) for family, meta in TARGETS.items()}
        second_counts = {family: {key: second_qualities[family][key] for key in ("participant_count", "splits")} for family in TARGETS}
        history_after_second = protected_history_digest(work)
        global_blockers.extend(database_gates(work))
    blockers = [f"{family}: {item}" for family, quality in qualities.items() for item in quality["blockers"]]
    blockers.extend(f"second-{family}: {item}" for family, quality in second_qualities.items() for item in quality["blockers"])
    blockers.extend(global_blockers)
    if first_digest != second_digest or first_counts != second_counts:
        blockers.append("semantic idempotency failed")
    if not (history_before == history_after_first == history_after_second):
        blockers.append("protected pre-2026 data changed")
    export = export_to(args.work_db, args.export_dir)
    changed = first_digest != before_digest
    report = {
        "generated_at": utc_now(), "mode": "full-dry-run", "decision": "READY" if not blockers else "BLOCKED",
        "changed": changed, "production_target_digest_before": before_digest,
        "target_digest_after": first_digest, "second_pass_target_digest": second_digest,
        "work_db_sha256": sha256_file(args.work_db), "generated_config_sha256": sha256_file(args.generated_config),
        "protected_history_digest": history_before, "qualities": qualities,
        "second_pass_qualities": second_qualities, "first_counts": first_counts, "second_counts": second_counts,
        "export": export, "blockers": blockers,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_github_output(args.github_output, {"ready": not blockers, "changed": changed, "uv90_results": first_counts["uv90"]["participant_count"], "uv45_results": first_counts["uv45"]["participant_count"], "splits": first_counts["uv90"]["splits"] + first_counts["uv45"]["splits"]})
    if blockers:
        raise RuntimeError("Full dry-run blocked: " + "; ".join(blockers))
    return report


def atomic_copy(source: Path, target: Path) -> None:
    temp = target.with_name(target.name + ".automatic-2026.tmp")
    shutil.copy2(source, temp)
    os.replace(temp, target)


def command_apply(args: argparse.Namespace) -> dict[str, Any]:
    if args.confirmation != APPLY_CONFIRMATION:
        raise ValueError("Explicit apply confirmation is missing")
    dry = json.loads(args.dry_run_report.read_text(encoding="utf-8"))
    if dry.get("decision") != "READY":
        raise RuntimeError("Dry-run decision is not READY")
    if sha256_file(args.work_db) != dry["work_db_sha256"] or sha256_file(args.generated_config) != dry["generated_config_sha256"]:
        raise RuntimeError("Dry-run inputs changed after validation")
    if not dry.get("changed"):
        report = {"generated_at": utc_now(), "mode": "apply", "changed": False, "decision": "NO-OP"}
        write_github_output(args.github_output, report)
        return report
    atomic_copy(args.work_db, args.production_db)
    atomic_copy(args.generated_config, args.config)
    staging = args.export_dir / "apply-staging"
    export = export_to(args.production_db, staging)
    for name in ("ultravasan.json", "ultravasan-data.js", "manifest.json"):
        atomic_copy(staging / name, args.web_dir / name)
    with uvtool.connect(args.production_db) as conn:
        race_keys = [meta["race_key"] for meta in TARGETS.values()]
        digest = target_semantic_digest(conn, race_keys)
        blockers = database_gates(conn)
    if digest != dry["target_digest_after"] or blockers:
        raise RuntimeError("Applied database differs from reviewed dry-run")
    report = {"generated_at": utc_now(), "mode": "apply", "changed": True, "decision": "APPLIED", "export": export, "target_digest": digest}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_github_output(args.github_output, {"changed": True, "results": export["results"], "splits": export["splits"]})
    return report


def command_simulate_2025(args: argparse.Namespace) -> dict[str, Any]:
    base = uvtool.load_config(args.config)
    selected, _ = discover_events(2025, args.raw, args.delay, args.force)
    expected = {
        "uv90": target_race(base, "ultravasan90-2025")["event_code"],
        "uv45": target_race(base, "ultravasan45-2025")["event_code"],
    }
    if any(selected[family]["event_code"] != expected[family] for family in TARGETS):
        raise RuntimeError(f"2025 discovery differs from verified config: {selected!r}")
    simulation_config = copy.deepcopy(base)
    add_current_uv90_official_checkpoints(target_race(simulation_config, "ultravasan90-2025"))
    simulation_config_path = args.report.parent / "simulation-config.json"
    simulation_config_path.parent.mkdir(parents=True, exist_ok=True)
    simulation_config_path.write_text(json.dumps(simulation_config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.work_db.exists():
        args.work_db.unlink()
    uvtool.init_db(args.work_db, simulation_config_path)
    reports: dict[str, Any] = {}
    keys = {"uv90": "ultravasan90-2025", "uv45": "ultravasan45-2025"}
    for family, key in keys.items():
        reports[family] = import_one(key, args.work_db, simulation_config_path, args.raw, args.report.parent / f"{key}-simulation-pass1.json", args.delay, limit=10, probe=True)
    with uvtool.connect(args.work_db) as conn:
        digest1 = target_semantic_digest(conn, keys.values())
        quality1 = {family: race_quality(conn, key, reports[family], representative=True) for family, key in keys.items()}
        counts1 = {family: (quality1[family]["participant_count"], quality1[family]["splits"]) for family in keys}
    second: dict[str, Any] = {}
    for family, key in keys.items():
        second[family] = import_one(key, args.work_db, simulation_config_path, args.raw, args.report.parent / f"{key}-simulation-pass2.json", 0.0, limit=10, probe=True)
    with uvtool.connect(args.work_db) as conn:
        digest2 = target_semantic_digest(conn, keys.values())
        quality2 = {family: race_quality(conn, key, second[family], representative=True) for family, key in keys.items()}
        counts2 = {family: (quality2[family]["participant_count"], quality2[family]["splits"]) for family in keys}
        blockers = database_gates(conn)
    blockers.extend(f"{family}: {item}" for family, quality in quality1.items() for item in quality["blockers"])
    blockers.extend(f"second-{family}: {item}" for family, quality in quality2.items() for item in quality["blockers"])
    if digest1 != digest2 or counts1 != counts2:
        blockers.append("2025 semantic idempotency failed")
    export = export_to(args.work_db, args.export_dir)
    report = {"generated_at": utc_now(), "mode": "simulate-2025", "decision": "PASS" if not blockers else "BLOCKED", "qualities": quality1, "second_pass_qualities": quality2, "idempotent": digest1 == digest2 and counts1 == counts2, "export": export, "blockers": blockers}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if blockers:
        raise RuntimeError("2025 simulation blocked: " + "; ".join(blockers))
    return report


def add_network_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--delay", type=float, default=1.2)
    parser.add_argument("--force", action="store_true")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    window = sub.add_parser("window")
    window.add_argument("--today")
    window.add_argument("--github-output", type=Path)
    availability = sub.add_parser("availability")
    availability.add_argument("--config", type=Path, default=uvtool.DEFAULT_CONFIG)
    availability.add_argument("--generated-config", type=Path, required=True)
    availability.add_argument("--report", type=Path, required=True)
    availability.add_argument("--github-output", type=Path)
    add_network_options(availability)
    dry = sub.add_parser("full-dry-run")
    dry.add_argument("--production-db", type=Path, default=uvtool.DEFAULT_DB)
    dry.add_argument("--work-db", type=Path, required=True)
    dry.add_argument("--generated-config", type=Path, required=True)
    dry.add_argument("--availability-report", type=Path, required=True)
    dry.add_argument("--report", type=Path, required=True)
    dry.add_argument("--export-dir", type=Path, required=True)
    dry.add_argument("--github-output", type=Path)
    add_network_options(dry)
    apply_parser = sub.add_parser("apply")
    apply_parser.add_argument("--production-db", type=Path, default=uvtool.DEFAULT_DB)
    apply_parser.add_argument("--work-db", type=Path, required=True)
    apply_parser.add_argument("--config", type=Path, default=uvtool.DEFAULT_CONFIG)
    apply_parser.add_argument("--generated-config", type=Path, required=True)
    apply_parser.add_argument("--dry-run-report", type=Path, required=True)
    apply_parser.add_argument("--export-dir", type=Path, required=True)
    apply_parser.add_argument("--web-dir", type=Path, default=ROOT / "docs" / "data")
    apply_parser.add_argument("--report", type=Path, required=True)
    apply_parser.add_argument("--confirmation", required=True)
    apply_parser.add_argument("--github-output", type=Path)
    simulation = sub.add_parser("simulate-2025")
    simulation.add_argument("--config", type=Path, default=uvtool.DEFAULT_CONFIG)
    simulation.add_argument("--work-db", type=Path, required=True)
    simulation.add_argument("--export-dir", type=Path, required=True)
    simulation.add_argument("--report", type=Path, required=True)
    add_network_options(simulation)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    commands = {
        "window": command_window, "availability": command_availability,
        "full-dry-run": command_full_dry_run, "apply": command_apply,
        "simulate-2025": command_simulate_2025,
    }
    result = commands[args.command](args)
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
