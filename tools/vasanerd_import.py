#!/usr/bin/env python3
"""Discover and import public Ultravasan data loaded by vasanerd.se.

The site is a JavaScript application, so filenames and JSON schemas may change.
This tool deliberately avoids hard-coding private endpoints. It opens the public
Ultravasan views in Chromium, records JSON/XHR responses, stores every raw file
with provenance, then looks for result-shaped records using an alias-driven
normalizer. Unrecognised payloads are preserved and reported, never discarded.

Use only in accordance with the source site's terms and with appropriate
attribution. The preferred production route is permission or an export from the
site owner; this adapter is also useful for importing such an export locally.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import sqlite3
import sys
import unicodedata
from collections import Counter
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from uvtool import (  # noqa: E402
    ParsedResult, checkpoint_key, clean_text, connect, init_db, load_config,
    parse_float, parse_int, parse_pace, parse_time, save_result, sex_code, utc_now,
)

DEFAULT_URL = "https://vasanerd.se/#ultravasan/results"
DEFAULT_RAW = ROOT / "raw" / "vasanerd"
DEFAULT_DB = ROOT / "data" / "ultravasan.sqlite"
DEFAULT_CONFIG = ROOT / "config" / "races.json"
DEFAULT_REPORT = ROOT / "reports" / "vasanerd-import-report.json"

ALIASES: dict[str, tuple[str, ...]] = {
    "year": ("year", "race_year", "event_year", "ar", "år"),
    "name": ("name", "full_name", "fullname", "participant", "racer_name", "namn"),
    "bib": ("bib", "startnr", "start_no", "start_number", "number", "startnummer"),
    "sex": ("sex", "gender", "kon", "kön"),
    "age_class": ("class", "age_class", "age_group", "category", "klass", "aldersklass", "åldersklass"),
    "club": ("club", "team", "association", "klubb", "forening", "förening"),
    "nationality": ("country", "nation", "nationality", "land", "nationalitet"),
    "city": ("city", "residence", "ort", "stad"),
    "start_group": ("start_group", "startgroup", "wave", "seed_group", "startled", "startgrupp"),
    "status": ("status", "result_status"),
    "finish_time": ("finish_time", "finish", "time", "result_time", "total_time", "sluttid"),
    "overall_place": ("place", "placement", "rank", "overall_place", "overall_rank", "placering"),
    "gender_place": ("gender_place", "sex_place", "gender_rank"),
    "class_place": ("class_place", "age_group_place", "class_rank"),
    "external_id": ("id", "result_id", "participant_id", "racer_id", "idp"),
    "splits": ("splits", "checkpoints", "controls", "passages", "mellantider"),
    "checkpoint": ("checkpoint", "control", "station", "split", "kontroll", "passage"),
}
SPLIT_ALIASES: dict[str, tuple[str, ...]] = {
    "name": ("checkpoint", "control", "name", "station", "split", "kontroll"),
    "elapsed": ("elapsed", "elapsed_time", "time", "duration", "race_time", "mellantid"),
    "segment": ("segment_time", "split_time", "duration_segment", "d_duration", "delstracka", "delsträcka"),
    "place": ("place", "placement", "rank", "overall_place", "placering"),
    "pace": ("pace", "min_km", "min_per_km", "avg_pace", "tempo"),
    "speed": ("speed", "kmh", "km_h", "avg_speed", "speed_kmh"),
    "distance": ("distance", "distance_km", "km", "distans"),
}


def norm(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def scalar(d: dict[str, Any], names: Iterable[str]) -> Any:
    normalized = {norm(k): v for k, v in d.items()}
    for name in names:
        if norm(name) in normalized and not isinstance(normalized[norm(name)], (dict, list)):
            return normalized[norm(name)]
    return None


def field(d: dict[str, Any], key: str) -> Any:
    normalized = {norm(k): v for k, v in d.items()}
    for name in ALIASES[key]:
        nk = norm(name)
        if nk in normalized:
            value = normalized[nk]
            if key == "splits" or not isinstance(value, (dict, list)):
                return value
    return None


def walk(value: Any, path: str = "$") -> Iterable[tuple[str, Any]]:
    yield path, value
    if isinstance(value, dict):
        for k, v in value.items():
            yield from walk(v, f"{path}.{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from walk(v, f"{path}[{i}]")


def list_score(items: list[Any]) -> float:
    rows = [x for x in items[:100] if isinstance(x, dict)]
    if not rows:
        return 0.0
    hits = 0
    split_hits = 0
    for row in rows:
        if field(row, "name") is not None: hits += 3
        if field(row, "finish_time") is not None: hits += 2
        if field(row, "bib") is not None: hits += 1
        if field(row, "year") is not None: hits += 1
        if field(row, "overall_place") is not None: hits += 1
        if field(row, "splits") is not None: split_hits += 2
    return (hits + split_hits) / len(rows)


def discover_collections(payload: Any) -> list[tuple[str, list[dict[str, Any]], float]]:
    found: list[tuple[str, list[dict[str, Any]], float]] = []
    for path, value in walk(payload):
        if isinstance(value, list):
            score = list_score(value)
            if score >= 3.0:
                rows = [x for x in value if isinstance(x, dict)]
                if rows:
                    found.append((path, rows, score))
    found.sort(key=lambda x: (x[2], len(x[1])), reverse=True)
    return found



def prepare_records(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert row-per-checkpoint exports to one record per race performance.

    VasaData-style datasets repeat the runner on one row per control. This
    grouping also makes the adapter tolerant if VasaNerd uses a flat table.
    """
    checkpoint_rows = sum(1 for r in rows[:200] if field(r, "checkpoint") is not None)
    if not rows or checkpoint_rows < max(2, min(10, len(rows)) // 3):
        return rows
    grouped: dict[str, list[dict[str, Any]]] = {}
    for i, row in enumerate(rows):
        year = parse_int(field(row, "year")) or 0
        ext = clean_text(field(row, "external_id"))
        name = clean_text(field(row, "name")) or ""
        bib = clean_text(field(row, "bib")) or ""
        key = f"{year}|{ext or (norm(name)+'|'+bib)}"
        grouped.setdefault(key, []).append(row)
    out: list[dict[str, Any]] = []
    for items in grouped.values():
        # Prefer finish row as base because it usually has final placement/status.
        def is_finish(row: dict[str, Any]) -> bool:
            return checkpoint_key(clean_text(field(row, "checkpoint"))) == "mora"
        base = dict(next((r for r in items if is_finish(r)), items[0]))
        splits = []
        for row in items:
            cp_name = clean_text(field(row, "checkpoint"))
            if not checkpoint_key(cp_name):
                continue
            splits.append({
                "checkpoint": cp_name,
                "elapsed_time": field(row, "finish_time"),
                "place": field(row, "overall_place"),
                "pace": scalar(row, SPLIT_ALIASES["pace"]),
                "speed": scalar(row, SPLIT_ALIASES["speed"]),
                "distance": scalar(row, SPLIT_ALIASES["distance"]),
                "raw": row,
            })
        base["splits"] = splits
        finish_row = next((r for r in items if is_finish(r)), None)
        if finish_row is not None:
            base["finish_time"] = field(finish_row, "finish_time")
            if field(finish_row, "overall_place") is not None:
                base["overall_place"] = field(finish_row, "overall_place")
        else:
            # Prevent an intermediate checkpoint time from becoming the finish.
            for key in list(base):
                if norm(key) in {norm(x) for x in ALIASES["finish_time"]}:
                    base.pop(key, None)
        out.append(base)
    return out

def parse_seconds(value: Any) -> int | None:
    if value is None: return None
    if isinstance(value, (int, float)):
        n = float(value)
        # Milliseconds are common in front-end datasets.
        if n > 1000000: n /= 1000
        return round(n) if 0 <= n < 48 * 3600 else None
    text = clean_text(value)
    if not text: return None
    # ISO-ish durations and ordinary H:MM:SS / MM:SS.
    m = re.search(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", text, re.I)
    if m: return int(m.group(1) or 0)*3600 + int(m.group(2) or 0)*60 + int(m.group(3) or 0)
    return parse_time(text)


def parse_status(value: Any, finish: int | None) -> str:
    n = norm(value)
    if finish is not None: return "FINISHED"
    if "dns" in n or "not_start" in n: return "DNS"
    if "dsq" in n or "disqual" in n: return "DSQ"
    if "dnf" in n or "not_finish" in n or "brutit" in n: return "DNF"
    return clean_text(value).upper() if clean_text(value) else "UNKNOWN"


def split_rows(record: dict[str, Any]) -> list[dict[str, Any]]:
    candidate = field(record, "splits")
    if isinstance(candidate, dict):
        # Some exports use {"Evertsberg": {time: ...}, ...}.
        candidate = [{"checkpoint": k, **(v if isinstance(v, dict) else {"time": v})} for k, v in candidate.items()]
    if not isinstance(candidate, list):
        # Wide records: columns such as evertsberg_time / evertsberg_place.
        candidate = []
        for cp in ("smagan", "mangsbodarna", "risberg", "evertsberg", "oxberg", "hokberg", "eldris", "mora", "finish"):
            elapsed = next((v for k, v in record.items() if cp in norm(k) and any(t in norm(k) for t in ("time", "elapsed", "tid"))), None)
            if elapsed is not None: candidate.append({"checkpoint": cp, "time": elapsed})
    out: list[dict[str, Any]] = []
    for item in candidate:
        if not isinstance(item, dict): continue
        name = scalar(item, SPLIT_ALIASES["name"])
        key = checkpoint_key(clean_text(name))
        if not key: continue
        elapsed = parse_seconds(scalar(item, SPLIT_ALIASES["elapsed"]))
        if elapsed is None and key != "start": continue
        pace_raw = scalar(item, SPLIT_ALIASES["pace"])
        speed_raw = scalar(item, SPLIT_ALIASES["speed"])
        out.append({
            "checkpoint_key": key,
            "elapsed_seconds": elapsed or 0,
            "segment_seconds": parse_seconds(scalar(item, SPLIT_ALIASES["segment"])),
            "place_overall": parse_int(scalar(item, SPLIT_ALIASES["place"])),
            "reported_pace_seconds_per_km": parse_pace(pace_raw),
            "speed_kmh": parse_float(speed_raw),
            "raw": item,
        })
    return out


def parse_record(record: dict[str, Any], fallback_year: int | None, source_url: str, index: int) -> tuple[int, ParsedResult] | None:
    year = parse_int(field(record, "year")) or fallback_year
    name = clean_text(field(record, "name"))
    finish = parse_seconds(field(record, "finish_time"))
    if not year or year < 2014 or year > datetime.now().year + 1 or not name:
        return None
    bib = clean_text(field(record, "bib"))
    external = clean_text(field(record, "external_id")) or hashlib.sha1(
        f"{year}|{name}|{bib}|{finish}|{index}".encode("utf-8")
    ).hexdigest()[:20]
    splits = split_rows(record)
    if finish is None:
        mora = next((s for s in splits if s["checkpoint_key"] == "mora"), None)
        finish = mora and mora.get("elapsed_seconds")
    parsed = ParsedResult(
        source_result_id=f"ultravasan:{year}:{external}", source_url=source_url,
        bib=bib, name=name, sex=sex_code(clean_text(field(record, "sex")), clean_text(field(record, "age_class"))),
        age_class=clean_text(field(record, "age_class")), nationality=clean_text(field(record, "nationality")),
        club=clean_text(field(record, "club")), city=clean_text(field(record, "city")),
        start_group=clean_text(field(record, "start_group")), status=parse_status(field(record, "status"), finish),
        finish_seconds=finish, overall_place=parse_int(field(record, "overall_place")),
        gender_place=parse_int(field(record, "gender_place")), class_place=parse_int(field(record, "class_place")),
        splits=splits, raw={"vasanerd_record": record},
    )
    return year, parsed


def checkpoint_template(year: int) -> tuple[float, str, list[dict[str, Any]]]:
    if year >= 2023:
        distance, version = 92.0, "post2023"
        kms = [0, 9.2, 23.7, 35.0, 47.1, 62.2, 71.4, 82.8, 92.0]
    else:
        distance, version = 90.0, "pre2023"
        kms = [0, 9.0, 24.0, 35.0, 47.0, 62.0, 71.0, 81.0, 90.0]
    keys = ["start", "smagan", "mangsbodarna", "risberg", "evertsberg", "oxberg", "hokberg", "eldris", "mora"]
    names = ["Start Sälen", "Smågan", "Mångsbodarna", "Risberg", "Evertsberg", "Oxberg", "Hökberg", "Eldris", "Mora mål"]
    return distance, version, [{"checkpoint_key": k, "name": n, "sequence_no": i, "distance_km": kms[i]} for i,(k,n) in enumerate(zip(keys,names))]


def ensure_race(conn: sqlite3.Connection, year: int) -> tuple[sqlite3.Row, list[dict[str, Any]]]:
    distance, version, cps = checkpoint_template(year)
    key = f"ultravasan90-{year}"
    conn.execute("""
      INSERT INTO races(race_key,name,year,distance_km,course_version,official_url,notes)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(race_key) DO UPDATE SET distance_km=excluded.distance_km,
      course_version=excluded.course_version,updated_at=CURRENT_TIMESTAMP
    """, (key, "Ultravasan 90", year, distance, version, f"https://results.vasaloppet.se/", "Historik importerad med källspårning från VasaNerd/offentliga resultat."))
    race_id = conn.execute("SELECT id FROM races WHERE race_key=?", (key,)).fetchone()[0]
    for cp in cps:
        conn.execute("""INSERT INTO checkpoints(race_id,checkpoint_key,name,sequence_no,distance_km)
          VALUES(?,?,?,?,?) ON CONFLICT(race_id,checkpoint_key) DO UPDATE SET name=excluded.name,
          sequence_no=excluded.sequence_no,distance_km=excluded.distance_km""",
          (race_id, cp["checkpoint_key"], cp["name"], cp["sequence_no"], cp["distance_km"]))
    conn.commit()
    return conn.execute("SELECT * FROM races WHERE id=?", (race_id,)).fetchone(), cps


async def capture(url: str, raw_dir: Path, wait_seconds: float, headed: bool) -> dict[str, Any]:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise SystemExit("Playwright saknas. Installera requirements-browser.txt och kör playwright install chromium.") from exc
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = raw_dir / stamp
    run_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    lock = asyncio.Lock()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not headed)
        page = await browser.new_page(viewport={"width": 1500, "height": 1000}, locale="sv-SE")

        async def on_response(response):
            req = response.request
            ct = (response.headers.get("content-type") or "").lower()
            dataish = "/data/" in response.url.lower() or "ultravasan" in response.url.lower()
            if req.resource_type not in {"xhr", "fetch"} and "json" not in ct and not response.url.lower().endswith((".json", ".json.gz")) and not (req.resource_type == "script" and dataish):
                return
            try:
                body = await response.body()
            except Exception:
                return
            digest = hashlib.sha256(body).hexdigest()
            async with lock:
                if digest in seen_hashes: return
                seen_hashes.add(digest)
            low_url = response.url.lower()
            suffix = ".json" if ("json" in ct or low_url.endswith((".json", ".json.gz"))) else (".js" if req.resource_type == "script" else ".bin")
            name = f"{len(manifest)+1:03d}-{digest[:12]}{suffix}"
            (run_dir / name).write_bytes(body)
            manifest.append({"url": response.url, "status": response.status, "content_type": ct, "resource_type": req.resource_type, "file": name, "sha256": digest, "bytes": len(body)})

        page.on("response", on_response)
        await page.goto(url, wait_until="domcontentloaded", timeout=120000)
        await page.wait_for_timeout(5000)
        # Visit data-heavy Ultravasan routes. Hash navigation does not reload the page,
        # but it triggers the SPA's fetches and keeps discovery independent of labels.
        for route in ("overview", "results", "compare", "dnf", "dynamics", "years", "age-groups", "pacing"):
            await page.evaluate("r => { location.hash = '#ultravasan/' + r; }", route)
            await page.wait_for_timeout(max(1800, int(wait_seconds * 1000)))
        # Scroll to trigger any lazy-loaded tables.
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(2500)
        resources = await page.evaluate("performance.getEntriesByType('resource').map(x => x.name)")
        (run_dir / "resources.json").write_text(json.dumps(resources, ensure_ascii=False, indent=2), encoding="utf-8")
        await browser.close()

    report = {"captured_at": utc_now(), "start_url": url, "directory": str(run_dir), "responses": manifest}
    (run_dir / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def load_payloads(path: Path) -> list[tuple[Path, Any, str]]:
    files = [path] if path.is_file() else sorted([*path.rglob("*.json"), *path.rglob("*.js"), *path.rglob("*.txt")])
    out = []
    manifests: dict[str, str] = {}
    for mf in path.rglob("manifest.json") if path.is_dir() else []:
        try:
            for r in json.loads(mf.read_text(encoding="utf-8")).get("responses", []): manifests[r.get("file","")] = r.get("url","")
        except Exception: pass
    for f in files:
        if f.name in {"manifest.json", "resources.json"}: continue
        try:
            text = f.read_text(encoding="utf-8-sig")
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                # Tolerate static JS data bundles: window.X = {...}; or const X=[...].
                starts = [i for i in (text.find("{"), text.find("[")) if i >= 0]
                if not starts: continue
                start = min(starts); opener = text[start]; closer = "}" if opener == "{" else "]"
                end = text.rfind(closer)
                if end <= start: continue
                payload = json.loads(text[start:end+1])
            out.append((f, payload, manifests.get(f.name, f.as_uri())))
        except Exception:
            continue
    return out


def import_payloads(path: Path, db: Path, config: Path, report_path: Path, fallback_year: int | None = None) -> dict[str, Any]:
    init_db(db, config)
    conn = connect(db)
    conn.execute("""INSERT INTO sources(code,name,base_url,source_type,terms_note)
      VALUES('vasanerd','VasaNerd','https://vasanerd.se/','json','Sammanställd publik resultatdata. Säkerställ tillstånd/attribution före publicering av full kopia.')
      ON CONFLICT(code) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,terms_note=excluded.terms_note""")
    source_id = conn.execute("SELECT id FROM sources WHERE code='vasanerd'").fetchone()[0]
    payloads = load_payloads(path)
    candidates = []
    for file, payload, source_url in payloads:
        for json_path, rows, score in discover_collections(payload):
            prepared = prepare_records(rows)
            candidates.append((score, len(prepared), file, source_url, json_path, prepared))
    # De-duplicate records across summary/detail payloads by source ID and core values.
    seen: set[str] = set(); inserted = updated = skipped = warnings = 0; years = Counter(); diagnostics = []
    run_id = conn.execute("INSERT INTO import_runs(source_id,status,message) VALUES(?, 'running', ?)", (source_id, f"VasaNerd import från {path}")).lastrowid
    for file, payload, source_url in payloads:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        try:
            cache_path = str(file.relative_to(ROOT))
        except ValueError:
            cache_path = str(file)
        conn.execute("""INSERT OR IGNORE INTO source_records(import_run_id,source_id,record_type,external_id,url,http_status,content_sha256,cache_path,payload_text)
          VALUES(?,?,'source_payload',?,?,200,?,?,?)""",
          (run_id, source_id, file.name, source_url, sha, cache_path, raw))
    for score, count, file, source_url, json_path, rows in sorted(candidates, reverse=True, key=lambda x:(x[0],x[1])):
        accepted = 0
        for idx, record in enumerate(rows):
            parsed_pair = parse_record(record, fallback_year, source_url, idx)
            if not parsed_pair:
                skipped += 1; continue
            year, parsed = parsed_pair
            fingerprint = hashlib.sha1(f"{year}|{parsed.source_result_id}|{parsed.name}|{parsed.finish_seconds}".encode()).hexdigest()
            if fingerprint in seen: continue
            seen.add(fingerprint)
            try:
                race, cps = ensure_race(conn, year)
                _, is_new = save_result(conn, race["id"], source_id, race["distance_km"], cps, parsed)
                inserted += int(is_new); updated += int(not is_new); accepted += 1; years[year] += 1
            except Exception as exc:
                warnings += 1
                diagnostics.append({"file": str(file), "path": json_path, "record": idx, "error": str(exc)})
        diagnostics.append({"file": str(file), "path": json_path, "score": round(score,2), "rows": count, "accepted": accepted})
    status = "complete" if inserted + updated else "no_records"
    conn.execute("UPDATE import_runs SET finished_at=?,status=?,records_seen=?,records_inserted=?,records_updated=?,warnings=?,message=? WHERE id=?",
                 (utc_now(), status, len(seen)+skipped, inserted, updated, warnings, f"År: {dict(years)}", run_id))
    conn.commit(); conn.close()
    report = {"generated_at": utc_now(), "input": str(path), "payload_files": len(payloads), "collections": len(candidates), "inserted": inserted, "updated": updated, "skipped": skipped, "warnings": warnings, "years": dict(sorted(years.items())), "diagnostics": diagnostics[:500]}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Upptäck/importera Ultravasan-data från VasaNerds publika webbapp")
    sub = p.add_subparsers(dest="command", required=True)
    d = sub.add_parser("discover", help="Öppna webbappen och spara alla JSON/XHR-responser")
    d.add_argument("--url", default=DEFAULT_URL); d.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    d.add_argument("--wait", type=float, default=3.0); d.add_argument("--headed", action="store_true")
    i = sub.add_parser("import", help="Importera tidigare upptäckta JSON-filer")
    i.add_argument("path", type=Path); i.add_argument("--db", type=Path, default=DEFAULT_DB); i.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    i.add_argument("--report", type=Path, default=DEFAULT_REPORT); i.add_argument("--fallback-year", type=int)
    a = sub.add_parser("all", help="Upptäck, importera och skapa rapport")
    a.add_argument("--url", default=DEFAULT_URL); a.add_argument("--raw", type=Path, default=DEFAULT_RAW); a.add_argument("--wait", type=float, default=3.0)
    a.add_argument("--db", type=Path, default=DEFAULT_DB); a.add_argument("--config", type=Path, default=DEFAULT_CONFIG); a.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    return p


def main() -> None:
    args = parser().parse_args()
    if args.command == "discover":
        print(json.dumps(asyncio.run(capture(args.url, args.raw, args.wait, args.headed)), ensure_ascii=False, indent=2))
    elif args.command == "import":
        print(json.dumps(import_payloads(args.path, args.db, args.config, args.report, args.fallback_year), ensure_ascii=False, indent=2))
    else:
        cap = asyncio.run(capture(args.url, args.raw, args.wait, False))
        run_dir = Path(cap["directory"])
        report = import_payloads(run_dir, args.db, args.config, args.report)
        report["capture"] = cap
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__": main()
