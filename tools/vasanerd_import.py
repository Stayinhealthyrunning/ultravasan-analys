#!/usr/bin/env python3
"""Import public Ultravasan result JSON used by vasanerd.se.

The VasaNerd app publishes one compact JSON file per race year and a key map
that translates short field names to Swedish data field names. This importer:

* downloads those public JSON files directly (no browser automation required),
* stores the raw source files with provenance,
* decodes all result rows,
* imports finish data, status, placements and checkpoint splits,
* links the same runner across years with VasaNerd's stable person id (idpe),
* writes the shared SQLite database used by the static web app.

Use with attribution and in accordance with the source site's terms.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from uvtool import (  # noqa: E402
    ParsedResult,
    clean_text,
    connect,
    init_db,
    parse_float,
    parse_int,
    parse_pace,
    parse_time,
    save_result,
    utc_now,
)

BASE_URL = "https://vasanerd.se/data/ultravasan"
DEFAULT_RAW = ROOT / "raw" / "vasanerd"
DEFAULT_DB = ROOT / "data" / "ultravasan.sqlite"
DEFAULT_CONFIG = ROOT / "config" / "races.json"
DEFAULT_REPORT = ROOT / "reports" / "vasanerd-import-report.json"

# Direct public files used by the application.
STATIC_FILES = ("_keymap.json", "year_stats.json", "persons.json")

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
    "finish_time": ("finish_time", "finish", "time", "result_time", "total_time", "sluttid", "bruttotid", "mal_tid", "mål_tid"),
    "overall_place": ("overall_place", "overall_rank", "placering_totalt", "totalplacering", "place", "placement", "rank"),
    "gender_place": ("gender_place", "sex_place", "gender_rank", "placering"),
    "class_place": ("class_place", "age_group_place", "class_rank", "placering_klass"),
    # idpe is a stable person identifier across years; idp identifies one result.
    "external_id": ("idpe", "participant_id", "racer_id", "id", "result_id", "idp"),
    "result_id": ("idp", "result_id"),
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

CP_FIELDS: list[tuple[str, str, str]] = [
    ("hogsta_punkten", "high_point", "Högsta punkten"),
    ("smagan", "smagan", "Smågan"),
    ("mangsbodarna", "mangsbodarna", "Mångsbodarna"),
    ("risberg", "risberg", "Risberg"),
    ("evertsberg", "evertsberg", "Evertsberg"),
    ("oxberg", "oxberg", "Oxberg"),
    ("hokberg", "hokberg", "Hökberg"),
    ("eldris", "eldris", "Eldris"),
    ("mal", "mora", "Mora mål"),
]


def norm(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def normalized_map(d: dict[str, Any]) -> dict[str, Any]:
    return {norm(k): v for k, v in d.items()}


def scalar(d: dict[str, Any], names: Iterable[str]) -> Any:
    values = normalized_map(d)
    for name in names:
        value = values.get(norm(name))
        if value is not None and not isinstance(value, (dict, list)):
            return value
    return None


def field(d: dict[str, Any], key: str) -> Any:
    values = normalized_map(d)
    for name in ALIASES[key]:
        nk = norm(name)
        if nk in values:
            value = values[nk]
            if key == "splits" or not isinstance(value, (dict, list)):
                return value
    return None


def parse_seconds(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        n = float(value)
        if n > 1_000_000:
            n /= 1000
        return round(n) if 0 <= n < 48 * 3600 else None
    text = clean_text(value)
    if not text:
        return None
    m = re.search(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", text, re.I)
    if m:
        return int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)
    return parse_time(text)


def parse_name_country(value: Any) -> tuple[str | None, str | None]:
    text = clean_text(value)
    if not text:
        return None, None
    m = re.match(r"^(.*?)\s*\(([A-Z]{3})\)\s*$", text)
    if m:
        return clean_text(m.group(1)), m.group(2)
    return text, None


def infer_sex(age_class: str | None, explicit: str | None = None) -> str | None:
    e = norm(explicit)
    if e in {"m", "male", "man", "herr", "herrar"}:
        return "M"
    if e in {"f", "w", "female", "woman", "dam", "damer", "kvinna"}:
        return "F"
    c = (clean_text(age_class) or "").upper()
    if c.startswith(("M", "H")):
        return "M"
    if c.startswith(("W", "D", "K", "F")):
        return "F"
    return None


def parse_status(value: Any, finish: int | None, has_splits: bool = False) -> str:
    n = norm(value)
    if finish is not None or n in {"i_mal", "finished", "finish"}:
        return "FINISHED"
    if "startade_inte" in n or "dns" in n or "not_start" in n:
        return "DNS"
    if "disk" in n or "dsq" in n or "disqual" in n:
        return "DSQ"
    if "brutit" in n or "dnf" in n or "not_finish" in n or n == "startat" or has_splits:
        return "DNF"
    return clean_text(value).upper() if clean_text(value) else "UNKNOWN"


def is_keymap(payload: Any) -> bool:
    return isinstance(payload, dict) and payload.get("Z") == "namn" and payload.get("b") == "bruttotid" and payload.get("I") == "idp"


def decode_record(record: dict[str, Any], keymap: dict[str, str] | None) -> dict[str, Any]:
    if not keymap:
        return record
    # Decode only compact records. Generic imported JSON with semantic keys is left untouched.
    if not any(k in keymap for k in record):
        return record
    return {keymap.get(k, k): v for k, v in record.items()}


def decode_payload(payload: Any, keymap: dict[str, str] | None) -> Any:
    if isinstance(payload, list):
        return [decode_record(x, keymap) if isinstance(x, dict) else x for x in payload]
    return payload


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
    for row in rows:
        if field(row, "name") is not None:
            hits += 3
        if field(row, "finish_time") is not None:
            hits += 2
        if field(row, "bib") is not None:
            hits += 1
        if field(row, "year") is not None:
            hits += 1
        if field(row, "overall_place") is not None:
            hits += 1
        if field(row, "splits") is not None:
            hits += 2
    return hits / len(rows)


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
    """Convert row-per-checkpoint exports to one record per race performance."""
    checkpoint_rows = sum(1 for r in rows[:200] if field(r, "checkpoint") is not None)
    if not rows or checkpoint_rows < max(2, min(10, len(rows)) // 3):
        return rows
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        year = parse_int(field(row, "year")) or 0
        ext = clean_text(field(row, "external_id"))
        name = clean_text(field(row, "name")) or ""
        bib = clean_text(field(row, "bib")) or ""
        key = f"{year}|{ext or (norm(name) + '|' + bib)}"
        grouped.setdefault(key, []).append(row)
    out: list[dict[str, Any]] = []
    for items in grouped.values():
        def is_finish(row: dict[str, Any]) -> bool:
            cp = norm(clean_text(field(row, "checkpoint")))
            return cp in {"mora", "mal", "finish"}
        base = dict(next((r for r in items if is_finish(r)), items[0]))
        splits = []
        for row in items:
            cp_name = clean_text(field(row, "checkpoint"))
            if not cp_name:
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
            base["overall_place"] = field(finish_row, "overall_place")
        out.append(base)
    return out


def generic_checkpoint_key(value: Any) -> str | None:
    n = norm(value)
    mapping = {
        "start": "start", "salen": "start",
        "hogsta_punkten": "high_point", "high_point": "high_point",
        "smagan": "smagan", "mangsbodarna": "mangsbodarna",
        "risberg": "risberg", "evertsberg": "evertsberg", "oxberg": "oxberg",
        "hokberg": "hokberg", "eldris": "eldris",
        "mora": "mora", "mal": "mora", "finish": "mora",
    }
    for alias, key in mapping.items():
        if alias in n:
            return key
    return None


def split_rows(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract both generic nested splits and VasaNerd's wide checkpoint fields."""
    out: list[dict[str, Any]] = []
    candidate = field(record, "splits")
    if isinstance(candidate, dict):
        candidate = [{"checkpoint": k, **(v if isinstance(v, dict) else {"time": v})} for k, v in candidate.items()]
    if isinstance(candidate, list):
        for item in candidate:
            if not isinstance(item, dict):
                continue
            key = generic_checkpoint_key(scalar(item, SPLIT_ALIASES["name"]))
            if not key:
                continue
            elapsed = parse_seconds(scalar(item, SPLIT_ALIASES["elapsed"]))
            if elapsed is None and key != "start":
                continue
            out.append({
                "checkpoint_key": key,
                "elapsed_seconds": elapsed or 0,
                "segment_seconds": parse_seconds(scalar(item, SPLIT_ALIASES["segment"])),
                "place_overall": parse_int(scalar(item, SPLIT_ALIASES["place"])),
                "reported_pace_seconds_per_km": parse_pace(scalar(item, SPLIT_ALIASES["pace"])),
                "speed_kmh": parse_float(scalar(item, SPLIT_ALIASES["speed"])),
                "raw": item,
            })

    # VasaNerd stores checkpoints as columns such as evertsberg_tid.
    values = normalized_map(record)
    if not out and any(f"{prefix}_tid" in values for prefix, _, _ in CP_FIELDS):
        for prefix, key, _ in CP_FIELDS:
            elapsed = parse_seconds(values.get(f"{prefix}_tid"))
            if elapsed is None:
                continue
            out.append({
                "checkpoint_key": key,
                "elapsed_seconds": elapsed,
                "segment_seconds": parse_seconds(values.get(f"{prefix}_stracktid")),
                "place_overall": parse_int(values.get(f"{prefix}_placering")),
                "reported_pace_seconds_per_km": parse_pace(values.get(f"{prefix}_min_per_km")),
                "speed_kmh": parse_float(values.get(f"{prefix}_km_per_h")),
                "time_of_day": clean_text(values.get(f"{prefix}_klocktid")),
                "raw": {k: v for k, v in record.items() if norm(k).startswith(prefix + "_")},
            })
    return out


def parse_record(record: dict[str, Any], fallback_year: int | None, source_url: str, index: int) -> tuple[int, ParsedResult] | None:
    year = parse_int(field(record, "year")) or fallback_year
    published_name, name_country = parse_name_country(field(record, "name"))
    finish = parse_seconds(field(record, "finish_time"))
    if not year or year < 2014 or year > datetime.now().year + 1 or not published_name:
        return None
    bib = clean_text(field(record, "bib"))
    stable_person_id = clean_text(field(record, "external_id"))
    result_id = clean_text(field(record, "result_id"))
    external = stable_person_id or result_id or hashlib.sha1(
        f"{year}|{published_name}|{bib}|{finish}|{index}".encode("utf-8")
    ).hexdigest()[:20]
    splits = split_rows(record)
    if finish is None:
        mora = next((s for s in splits if s["checkpoint_key"] == "mora"), None)
        finish = mora and mora.get("elapsed_seconds")
    age_class = clean_text(field(record, "age_class"))
    nationality = clean_text(field(record, "nationality")) or name_country
    status = parse_status(field(record, "status"), finish, bool(splits))
    net = parse_seconds(scalar(record, ("mal_tid", "mål_tid", "net_time")))
    parsed = ParsedResult(
        source_result_id=external,
        source_url=source_url,
        bib=bib,
        name=published_name,
        sex=infer_sex(age_class, clean_text(field(record, "sex"))),
        age_class=age_class,
        nationality=nationality,
        club=clean_text(field(record, "club")),
        city=clean_text(field(record, "city")),
        start_group=clean_text(field(record, "start_group")),
        status=status,
        finish_seconds=finish,
        gun_seconds=finish,
        net_seconds=net or finish,
        overall_place=parse_int(field(record, "overall_place")),
        gender_place=parse_int(field(record, "gender_place")),
        class_place=parse_int(field(record, "class_place")),
        splits=splits,
        raw={"vasanerd_record": record, "idp": result_id, "idpe": stable_person_id},
    )
    return year, parsed


def checkpoint_template(year: int) -> tuple[float, str, list[dict[str, Any]]]:
    """Checkpoint distances derived from the source segment times/paces and GPS total."""
    if year >= 2023:
        distance, version = 92.0, "post2023"
        values = [
            ("start", "Start Sälen", 0.0),
            ("high_point", "Högsta punkten", 3.30),
            ("smagan", "Smågan", 10.84),
            ("mangsbodarna", "Mångsbodarna", 25.34),
            ("risberg", "Risberg", 36.40),
            ("evertsberg", "Evertsberg", 48.73),
            ("oxberg", "Oxberg", 63.50),
            ("hokberg", "Hökberg", 72.67),
            ("eldris", "Eldris", 82.81),
            ("mora", "Mora mål", 92.0),
        ]
    else:
        distance, version = 90.0, "pre2023"
        values = [
            ("start", "Start Sälen", 0.0),
            ("smagan", "Smågan", 8.83),
            ("mangsbodarna", "Mångsbodarna", 23.27),
            ("risberg", "Risberg", 33.96),
            ("evertsberg", "Evertsberg", 46.15),
            ("oxberg", "Oxberg", 60.73),
            ("hokberg", "Hökberg", 69.72),
            ("eldris", "Eldris", 79.61),
            ("mora", "Mora mål", 90.0),
        ]
    cps = [
        {"checkpoint_key": key, "name": name, "sequence_no": i, "distance_km": km}
        for i, (key, name, km) in enumerate(values)
    ]
    return distance, version, cps


def ensure_race(conn: sqlite3.Connection, year: int) -> tuple[sqlite3.Row, list[dict[str, Any]]]:
    distance, version, cps = checkpoint_template(year)
    key = f"ultravasan90-{year}"
    conn.execute(
        """
        INSERT INTO races(race_key,name,year,distance_km,course_version,official_url,notes)
        VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(race_key) DO UPDATE SET distance_km=excluded.distance_km,
        course_version=excluded.course_version,updated_at=CURRENT_TIMESTAMP
        """,
        (
            key,
            "Ultravasan 90",
            year,
            distance,
            version,
            "https://results.vasaloppet.se/",
            "Historik importerad från VasaNerds publika resultatfiler med källspårning.",
        ),
    )
    race_id = conn.execute("SELECT id FROM races WHERE race_key=?", (key,)).fetchone()[0]
    # Move existing sequence numbers temporarily so a changed checkpoint layout
    # (for example the post-2023 High Point split) cannot violate the unique
    # sequence constraint while rows are updated one by one.
    conn.execute("UPDATE checkpoints SET sequence_no=sequence_no+1000 WHERE race_id=?", (race_id,))
    for cp in cps:
        conn.execute(
            """
            INSERT INTO checkpoints(race_id,checkpoint_key,name,sequence_no,distance_km)
            VALUES(?,?,?,?,?)
            ON CONFLICT(race_id,checkpoint_key) DO UPDATE SET name=excluded.name,
            sequence_no=excluded.sequence_no,distance_km=excluded.distance_km
            """,
            (race_id, cp["checkpoint_key"], cp["name"], cp["sequence_no"], cp["distance_km"]),
        )
    desired = [cp["checkpoint_key"] for cp in cps]
    placeholders = ",".join("?" for _ in desired)
    conn.execute(f"DELETE FROM checkpoints WHERE race_id=? AND checkpoint_key NOT IN ({placeholders})", (race_id, *desired))
    id_rows = {row["checkpoint_key"]: row for row in conn.execute("SELECT id,checkpoint_key,distance_km FROM checkpoints WHERE race_id=?", (race_id,))}
    hydrated = [{**cp, "id": id_rows[cp["checkpoint_key"]]["id"]} for cp in cps]
    return conn.execute("SELECT * FROM races WHERE id=?", (race_id,)).fetchone(), hydrated


def cache_buster() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


def download_json(session: requests.Session, url: str, destination: Path) -> dict[str, Any] | list[Any]:
    response = session.get(url, timeout=90, headers={"Accept": "application/json"})
    response.raise_for_status()
    destination.write_bytes(response.content)
    return response.json()


def discover_years(year_stats: Any) -> list[int]:
    years: list[int] = []
    if isinstance(year_stats, list):
        for row in year_stats:
            if isinstance(row, dict):
                year = parse_int(row.get("year") or row.get("ar") or row.get("år"))
                if year:
                    years.append(year)
    return sorted({y for y in years if 2014 <= y <= datetime.now().year + 1})


def download_direct(raw_dir: Path, years: list[int] | None = None) -> dict[str, Any]:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = raw_dir / stamp
    run_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({
        "User-Agent": "UltravasanRaceIntelligence/1.0 (+https://github.com/Stayinhealthyrunning/ultravasan-analys)",
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.7",
    })
    version = cache_buster()
    responses: list[dict[str, Any]] = []

    def fetch(name: str) -> Any:
        url = f"{BASE_URL}/{name}?v={version}"
        target = run_dir / name.replace("/", "-")
        payload = download_json(session, url, target)
        responses.append({
            "url": url,
            "status": 200,
            "content_type": "application/json",
            "resource_type": "direct",
            "file": target.name,
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "bytes": target.stat().st_size,
        })
        return payload

    fetch("_keymap.json")
    year_stats = fetch("year_stats.json")
    fetch("persons.json")
    selected = sorted(set(years or discover_years(year_stats)))
    if not selected:
        selected = [2014, 2015, 2016, 2017, 2018, 2019, 2022, 2023, 2024, 2025]
    for year in selected:
        fetch(f"{year}.json")

    report = {
        "captured_at": utc_now(),
        "method": "direct-public-json",
        "base_url": BASE_URL,
        "directory": str(run_dir),
        "years": selected,
        "responses": responses,
    }
    (run_dir / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def load_payloads(path: Path) -> list[tuple[Path, Any, str]]:
    files = [path] if path.is_file() else sorted([*path.rglob("*.json"), *path.rglob("*.js"), *path.rglob("*.txt")])
    manifests: dict[str, str] = {}
    if path.is_dir():
        for mf in path.rglob("manifest.json"):
            try:
                for row in json.loads(mf.read_text(encoding="utf-8")).get("responses", []):
                    manifests[row.get("file", "")] = row.get("url", "")
            except Exception:
                pass

    raw_payloads: list[tuple[Path, Any, str]] = []
    keymap: dict[str, str] | None = None
    for file in files:
        if file.name in {"manifest.json", "resources.json"}:
            continue
        try:
            text = file.read_text(encoding="utf-8-sig")
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                starts = [i for i in (text.find("{"), text.find("[")) if i >= 0]
                if not starts:
                    continue
                start = min(starts)
                closer = "}" if text[start] == "{" else "]"
                end = text.rfind(closer)
                if end <= start:
                    continue
                payload = json.loads(text[start : end + 1])
            if is_keymap(payload):
                keymap = payload
            raw_payloads.append((file, payload, manifests.get(file.name, file.as_uri())))
        except Exception:
            continue

    out: list[tuple[Path, Any, str]] = []
    for file, payload, source_url in raw_payloads:
        out.append((file, decode_payload(payload, keymap), source_url))
    return out


def import_payloads(
    path: Path,
    db: Path,
    config: Path,
    report_path: Path,
    fallback_year: int | None = None,
    replace_years: bool = True,
) -> dict[str, Any]:
    init_db(db, config)
    conn = connect(db)
    conn.execute(
        """
        INSERT INTO sources(code,name,base_url,source_type,terms_note)
        VALUES('vasanerd','VasaNerd','https://vasanerd.se/','json',
        'Publik sammanställd resultatdata. Ange VasaNerd som källa och följ källans villkor.')
        ON CONFLICT(code) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,terms_note=excluded.terms_note
        """
    )
    source_id = conn.execute("SELECT id FROM sources WHERE code='vasanerd'").fetchone()[0]
    payloads = load_payloads(path)
    candidates: list[tuple[float, int, Path, str, str, list[dict[str, Any]]]] = []
    for file, payload, source_url in payloads:
        for json_path, rows, score in discover_collections(payload):
            prepared = prepare_records(rows)
            candidates.append((score, len(prepared), file, source_url, json_path, prepared))

    candidate_years: set[int] = set()
    for _, _, _, _, _, rows in candidates:
        for record in rows[:]:
            year = parse_int(field(record, "year")) or fallback_year
            if year:
                candidate_years.add(year)

    if replace_years and candidate_years:
        placeholders = ",".join("?" for _ in candidate_years)
        conn.execute(
            f"""
            DELETE FROM results
            WHERE source_id=? AND race_id IN (
              SELECT id FROM races WHERE year IN ({placeholders})
            )
            """,
            (source_id, *sorted(candidate_years)),
        )
        conn.commit()

    seen: set[str] = set()
    inserted = updated = skipped = warnings = 0
    years_counter: Counter[int] = Counter()
    diagnostics: list[dict[str, Any]] = []
    run_id = conn.execute(
        "INSERT INTO import_runs(source_id,status,message) VALUES(?, 'running', ?)",
        (source_id, f"VasaNerd import från {path}"),
    ).lastrowid

    for file, payload, source_url in payloads:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        try:
            cache_path = str(file.relative_to(ROOT))
        except ValueError:
            cache_path = str(file)
        conn.execute(
            """
            INSERT OR IGNORE INTO source_records(import_run_id,source_id,record_type,external_id,url,http_status,content_sha256,cache_path)
            VALUES(?,?,'source_payload',?,?,200,?,?)
            """,
            (run_id, source_id, file.name, source_url, sha, cache_path),
        )

    race_cache: dict[int, tuple[sqlite3.Row, list[dict[str, Any]]]] = {}
    for score, count, file, source_url, json_path, rows in sorted(candidates, reverse=True, key=lambda x: (x[0], x[1])):
        accepted = 0
        for idx, record in enumerate(rows):
            parsed_pair = parse_record(record, fallback_year, source_url, idx)
            if not parsed_pair:
                skipped += 1
                continue
            year, parsed = parsed_pair
            fingerprint = hashlib.sha1(f"{year}|{parsed.source_result_id}".encode()).hexdigest()
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            try:
                if year not in race_cache:
                    race_cache[year] = ensure_race(conn, year)
                race, cps = race_cache[year]
                _, is_new = save_result(conn, race["id"], source_id, race["distance_km"], cps, parsed, store_raw=False)
                inserted += int(is_new)
                updated += int(not is_new)
                accepted += 1
                years_counter[year] += 1
            except Exception as exc:
                warnings += 1
                diagnostics.append({"file": str(file), "path": json_path, "record": idx, "error": str(exc)})
        diagnostics.append({
            "file": str(file), "path": json_path, "score": round(score, 2),
            "rows": count, "accepted": accepted,
        })

    status = "complete" if inserted + updated else "no_records"
    conn.execute(
        """
        UPDATE import_runs SET finished_at=?,status=?,records_seen=?,records_inserted=?,records_updated=?,warnings=?,message=?
        WHERE id=?
        """,
        (utc_now(), status, len(seen) + skipped, inserted, updated, warnings, f"År: {dict(years_counter)}", run_id),
    )
    conn.commit()

    result_counts = {
        row["year"]: row["count"]
        for row in conn.execute(
            """
            SELECT ra.year,COUNT(*) count FROM results r
            JOIN races ra ON ra.id=r.race_id
            WHERE r.source_id=? GROUP BY ra.year ORDER BY ra.year
            """,
            (source_id,),
        )
    }
    split_counts = {
        row["year"]: row["count"]
        for row in conn.execute(
            """
            SELECT ra.year,COUNT(*) count FROM splits sp
            JOIN results r ON r.id=sp.result_id
            JOIN races ra ON ra.id=r.race_id
            WHERE r.source_id=? GROUP BY ra.year ORDER BY ra.year
            """,
            (source_id,),
        )
    }
    status_counts = {
        f"{row['year']}:{row['status']}": row["count"]
        for row in conn.execute(
            """
            SELECT ra.year,r.status,COUNT(*) count FROM results r
            JOIN races ra ON ra.id=r.race_id
            WHERE r.source_id=? GROUP BY ra.year,r.status ORDER BY ra.year,r.status
            """,
            (source_id,),
        )
    }
    conn.close()

    report = {
        "generated_at": utc_now(),
        "input": str(path),
        "payload_files": len(payloads),
        "collections": len(candidates),
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "warnings": warnings,
        "years": dict(sorted(years_counter.items())),
        "database_results_by_year": result_counts,
        "database_splits_by_year": split_counts,
        "database_statuses": status_counts,
        "diagnostics": diagnostics[:500],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Hämta och importera Ultravasan-data från VasaNerds publika JSON-filer")
    sub = parser.add_subparsers(dest="command", required=True)

    d = sub.add_parser("download", help="Hämta offentliga JSON-filer direkt")
    d.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    d.add_argument("--years", nargs="*", type=int)

    i = sub.add_parser("import", help="Importera en redan hämtad katalog eller JSON-fil")
    i.add_argument("path", type=Path)
    i.add_argument("--db", type=Path, default=DEFAULT_DB)
    i.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    i.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    i.add_argument("--fallback-year", type=int)
    i.add_argument("--keep-existing", action="store_true")

    s = sub.add_parser("sync", help="Hämta, importera och skapa rapport")
    s.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    s.add_argument("--db", type=Path, default=DEFAULT_DB)
    s.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    s.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    s.add_argument("--years", nargs="*", type=int)

    # Backwards compatibility with the first test workflow.
    a = sub.add_parser("all", help="Alias för sync")
    a.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    a.add_argument("--db", type=Path, default=DEFAULT_DB)
    a.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    a.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    a.add_argument("--years", nargs="*", type=int)
    a.add_argument("--wait", type=float, default=0.0)
    a.add_argument("--url")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "download":
        print(json.dumps(download_direct(args.raw, args.years), ensure_ascii=False, indent=2))
        return
    if args.command == "import":
        print(json.dumps(
            import_payloads(args.path, args.db, args.config, args.report, args.fallback_year, not args.keep_existing),
            ensure_ascii=False, indent=2,
        ))
        return
    capture = download_direct(args.raw, args.years)
    report = import_payloads(Path(capture["directory"]), args.db, args.config, args.report)
    report["capture"] = capture
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
