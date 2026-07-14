#!/usr/bin/env python3
"""Ultravasan data pipeline.

Commands:
  init        Create/update the SQLite schema and race catalogue.
  scrape      Download Mika result pages and participant detail pages.
  import-csv  Import an official/media CSV export with flexible header mapping.
  export      Export a compact static JSON database for the web app.
  validate    Run consistency checks.

The scraper caches every fetched page and can resume. Run it politely and only
against public result pages. Prefer an official CSV/API export when available.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "ultravasan.sqlite"
DEFAULT_CONFIG = ROOT / "config" / "races.json"
DEFAULT_WEB_JSON = ROOT / "docs" / "data" / "ultravasan.json"
DEFAULT_RAW = ROOT / "raw"
TIME_RE = re.compile(r"(?<!\d)(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)(?!\d)")
INT_RE = re.compile(r"\d+")

FIELD_SELECTORS = {
    "name": ["td.f-__fullname", ".f-__fullname"],
    "bib": ["td.f-start_no_text", ".f-start_no_text", "td.f-start_no"],
    "net_time": ["td.f-time_finish_netto", ".f-time_finish_netto"],
    "gun_time": ["td.f-time_finish_brutto", ".f-time_finish_brutto"],
    "finish_time": ["td.f-time_finish", ".f-time_finish"],
    "overall_place": ["td.f-place_nosex", ".f-place_nosex"],
    "gender_place": ["td.f-place_all", ".f-place_all"],
    "class_place": ["td.f-place_age", ".f-place_age"],
    "sex": ["td.f-sex", ".f-sex", "td.f-gender"],
    "age_class": ["td.f-age_class", ".f-age_class", "td.f-ak"],
    "nationality": ["td.f-nation", ".f-nation", "td.f-nationality"],
    "club": ["td.f-club", ".f-club", "td.f-association"],
    "city": ["td.f-city", ".f-city", "td.f-place_of_residence"],
    "start_group": ["td.f-start_group", ".f-start_group"],
    "status": ["td.f-status", ".f-status"]
}

LABEL_MAP = {
    "startnr": "bib", "startnummer": "bib", "bib": "bib", "start no": "bib",
    "namn": "name", "name": "name",
    "kön": "sex", "kon": "sex", "gender": "sex", "sex": "sex",
    "klass": "age_class", "åldersklass": "age_class", "aldersklass": "age_class", "age group": "age_class",
    "nation": "nationality", "nationalitet": "nationality", "country": "nationality",
    "klubb": "club", "förening": "club", "forening": "club", "club": "club", "team": "club",
    "ort": "city", "stad": "city", "city": "city",
    "län": "county", "lan": "county", "county": "county",
    "status": "status",
    "sluttid": "finish_time", "tid": "finish_time", "resultat": "finish_time", "finish": "finish_time",
    "netto": "net_time", "net time": "net_time", "chip time": "net_time",
    "brutto": "gun_time", "gun time": "gun_time",
    "totalplacering": "overall_place", "placering totalt": "overall_place", "overall": "overall_place", "place overall": "overall_place",
    "könsplacering": "gender_place", "konsplacering": "gender_place", "gender place": "gender_place",
    "klassplacering": "class_place", "age group place": "class_place"
}

CHECKPOINT_ALIASES = {
    "mora forvarning": "mora_warning", "mora förvarning": "mora_warning",
    "lillsjon": "lillsjon", "lillsjön": "lillsjon",
    "start": "start", "salen": "start", "sälen": "start",
    "smagan": "smagan", "smågan": "smagan",
    "mangsbodarna": "mangsbodarna", "mångsbodarna": "mangsbodarna",
    "risberg": "risberg", "evertsberg": "evertsberg", "oxberg": "oxberg",
    "hokberg": "hokberg", "hökberg": "hokberg", "eldris": "eldris",
    "mora": "mora", "mal": "mora", "mål": "mora", "finish": "mora"
}

CLUB_MARKERS = re.compile(
    r"(?:^|\s)(?:if|fk|sk|ok|ik|aik|team|club|klubb|förening|forening)(?:\s|$)"
    r"|löparklubb|loparklubb|friidrott|runacademy|running",
    re.IGNORECASE,
)
NATIONALITY_SUFFIX_RE = re.compile(r"\s*\(([A-Za-z]{3})\)\s*$")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def normalize(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = value.lower().replace("–", "-").replace("—", "-")
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def parse_time(value: Any) -> int | None:
    text = clean_text(value)
    if not text or text in {"-", "—", "DNF", "DNS", "DSQ"}:
        return None
    m = TIME_RE.search(text)
    if not m:
        return None
    h = int(m.group(1) or 0)
    return h * 3600 + int(m.group(2)) * 60 + int(m.group(3))


def parse_pace(value: Any) -> float | None:
    """Parse Mika pace values such as 05:31 or 5.31 min/km."""
    text = clean_text(value)
    if not text or text in {"-", "—"}:
        return None
    m = re.search(r"(\d{1,2})[:.,](\d{2})", text)
    if not m:
        return None
    return int(m.group(1)) * 60 + int(m.group(2))


def parse_float(value: Any) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    m = re.search(r"-?\d+(?:[.,]\d+)?", text.replace(" ", ""))
    return float(m.group().replace(",", ".")) if m else None


def parse_diff(value: Any) -> int | None:
    text = clean_text(value)
    if not text or text in {"-", "—"}:
        return None
    seconds = parse_time(text)
    if seconds is None:
        return None
    return -seconds if text.lstrip().startswith("-") else seconds


def parse_int(value: Any) -> int | None:
    text = clean_text(value)
    if not text:
        return None
    m = INT_RE.search(text.replace(" ", ""))
    return int(m.group()) if m else None


def optional_source_value(value: str | None) -> str | None:
    """Return None for Mika's empty/missing-value placeholders."""
    text = clean_text(value)
    if not text or not any(character.isalnum() for character in text):
        return None
    if normalize(text) in {"n a", "na", "saknas", "ej angivet", "unknown"}:
        return None
    return text


def sex_from_age_class(age_class: str | None) -> str | None:
    n = normalize(optional_source_value(age_class) or "")
    compact = n.replace(" ", "")
    if n in {"m", "h", "man", "male", "men", "herr", "herrar"} or re.match(r"^[mh]\d", compact):
        return "M"
    if n in {"d", "f", "w", "k", "woman", "women", "female", "dam", "damer", "kvinna"} or re.match(r"^[dkfw]\d", compact):
        return "F"
    return None


def sex_code(value: str | None, age_class: str | None = None) -> str | None:
    explicit = optional_source_value(value)
    if explicit:
        n = normalize(explicit)
        if n in {"m", "h", "man", "male", "men", "herr", "herrar"}:
            return "M"
        if n in {"d", "f", "w", "k", "woman", "women", "female", "dam", "damer", "kvinna"}:
            return "F"
    return sex_from_age_class(age_class)


def normalize_result_status(value: str | None) -> str | None:
    """Normalize Mika's Swedish/English race statuses to stable database codes."""
    text = clean_text(value)
    if not text:
        return None
    n = normalize(text)
    if n in {"dnf", "brutit", "brot", "avbrutit"} or "did not finish" in n:
        return "DNF"
    if n in {"dns", "ej start", "ej startat", "inte startat", "startade inte"} or "did not start" in n:
        return "DNS"
    if n in {"startat", "started"}:
        # The archive uses Startat when a runner has started but has neither a
        # registered finish nor enough evidence to classify the outcome DNF.
        return "UNKNOWN"
    if n in {"dsq", "diskvalificerad"} or "disqualified" in n:
        return "DSQ"
    if n in {"finished", "finisher", "i mal", "malgang"}:
        return "FINISHED"
    return text.upper()


def clean_name_and_nationality(name: str | None, nationality: str | None = None) -> tuple[str | None, str | None]:
    """Split a trailing ISO-like country code, e.g. ``Runner (SWE)``."""
    clean_name = clean_text(name)
    clean_nationality = clean_text(nationality)
    if not clean_name:
        return clean_name, clean_nationality.upper() if clean_nationality else None
    match = NATIONALITY_SUFFIX_RE.search(clean_name)
    if match:
        clean_nationality = clean_nationality or match.group(1).upper()
        clean_name = clean_text(NATIONALITY_SUFFIX_RE.sub("", clean_name))
    return clean_name, clean_nationality.upper() if clean_nationality else None


def nationality_value_in_raw(raw: str | dict[str, Any] | None) -> str | None:
    """Return a nationality that is visibly present in stored source fields.

    A missing country is legitimate in older Mika pages.  Validators use this
    evidence to distinguish source omissions from parser regressions, without
    inferring nationality from a runner's name, club or city.
    """
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return None
    if not isinstance(raw, dict):
        return None
    for section in ("selector_values", "labeled_values"):
        values = raw.get(section)
        if isinstance(values, dict):
            explicit = optional_source_value(values.get("nationality"))
            if explicit:
                return explicit
    published_name = optional_source_value(raw.get("published_name_original"))
    match = NATIONALITY_SUFFIX_RE.search(published_name or "")
    return match.group(1).upper() if match else None


def classify_club_city(value: str | None) -> tuple[str | None, str | None, str | None]:
    """Classify Mika's combined Klubb/Stad field conservatively.

    Clear organisation markers become club.  Plain all-uppercase place-like
    values become city.  Ambiguous values stay in club for backwards
    compatibility and are also retained verbatim in raw parser metadata.
    """
    original = clean_text(value)
    if not original:
        return None, None, None
    if CLUB_MARKERS.search(normalize(original)):
        return original, None, "club"
    letters = "".join(char for char in original if char.isalpha())
    if letters and letters == letters.upper() and not any(char.isdigit() for char in original):
        return None, original, "city"
    return original, None, "ambiguous-kept-as-club"


def checkpoint_key(value: str | None) -> str | None:
    n = normalize(value)
    for alias, key in CHECKPOINT_ALIASES.items():
        normalized_alias = normalize(alias)
        if n == normalized_alias or re.search(rf"\b{re.escape(normalized_alias)}\b", n):
            return key
    return None


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def load_config(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def upsert_catalogue(conn: sqlite3.Connection, config: dict[str, Any]) -> None:
    sources = [
        ("vasaloppet_mika", "Vasaloppets officiella resultattjänst", "https://results.vasaloppet.se/", "html", "Publika resultatsidor; kontrollera publiceringsvillkor innan vidarepublicering."),
        ("vasaloppet_media", "Vasaloppets mediaexport", "https://media.vasaloppet.se/", "csv", "Officiell rapport/export."),
        ("vasaloppet_pdf", "Vasaloppets officiella historik-PDF", "https://vasaloppet.se/", "pdf", "Officiellt historiskt urval; kan vara ofullständigt."),
        ("duv", "DUV Ultra Marathon Statistics", "https://statistik.d-u-v.org/", "html", "Kompletterande historikkälla."),
        ("itra", "ITRA", "https://itra.run/", "html", "Kompletterande kontrollkälla."),
        ("manual", "Manuell import", None, "csv", "Manuellt granskad fil."),
        ("vasanerd", "VasaNerd", "https://vasanerd.se/", "json", "Sammanställd publik resultatdata; säkerställ tillstånd och attribution före full vidarepublicering.")
    ]
    # One catalogue update is one transaction. A failed race/checkpoint update
    # must never leave half-applied metadata behind.
    with conn:
        conn.executemany("""
          INSERT INTO sources(code,name,base_url,source_type,terms_note) VALUES(?,?,?,?,?)
          ON CONFLICT(code) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,source_type=excluded.source_type,terms_note=excluded.terms_note
        """, sources)
        for race in config.get("races", []):
            values = {**{"race_date": None, "distance_km": None, "event_code": None,
                         "result_year_path": None, "official_url": None,
                         "course_version": None, "notes": None}, **race}
            existing = conn.execute("SELECT * FROM races WHERE race_key=?", (race["race_key"],)).fetchone()
            if existing is None:
                conn.execute("""
                  INSERT INTO races(race_key,name,year,race_date,distance_km,event_code,result_year_path,official_url,course_version,notes)
                  VALUES(:race_key,:name,:year,:race_date,:distance_km,:event_code,:result_year_path,:official_url,:course_version,:notes)
                """, values)
            else:
                has_results = bool(conn.execute("SELECT 1 FROM results WHERE race_id=? LIMIT 1", (existing["id"],)).fetchone())
                # Imported race geometry owns distance/course metadata once the
                # race contains performances. Config may still refresh safe,
                # non-geometric catalogue fields without blanking discovered data.
                if has_results:
                    conn.execute("""
                      UPDATE races SET name=:name,year=:year,
                        race_date=COALESCE(:race_date,race_date),
                        event_code=COALESCE(:event_code,event_code),
                        result_year_path=COALESCE(:result_year_path,result_year_path),
                        official_url=COALESCE(:official_url,official_url),
                        notes=COALESCE(:notes,notes),updated_at=CURRENT_TIMESTAMP
                      WHERE race_key=:race_key
                    """, values)
                else:
                    conn.execute("""
                      UPDATE races SET name=:name,year=:year,
                        race_date=COALESCE(:race_date,race_date),
                        distance_km=COALESCE(:distance_km,distance_km),
                        event_code=COALESCE(:event_code,event_code),
                        result_year_path=COALESCE(:result_year_path,result_year_path),
                        official_url=COALESCE(:official_url,official_url),
                        course_version=COALESCE(:course_version,course_version),
                        notes=COALESCE(:notes,notes),updated_at=CURRENT_TIMESTAMP
                      WHERE race_key=:race_key
                    """, values)

            race_id = conn.execute("SELECT id FROM races WHERE race_key=?", (race["race_key"],)).fetchone()[0]
            has_results = bool(conn.execute("SELECT 1 FROM results WHERE race_id=? LIMIT 1", (race_id,)).fetchone())
            configured = race.get("checkpoints", [])
            existing_checkpoints = conn.execute(
                "SELECT * FROM checkpoints WHERE race_id=? ORDER BY sequence_no,id", (race_id,)
            ).fetchall()

            if not has_results and existing_checkpoints:
                # Reordering unused catalogue rows is safe, but it must be done
                # in two phases to avoid the UNIQUE(race_id, sequence_no) index.
                for row in existing_checkpoints:
                    conn.execute("UPDATE checkpoints SET sequence_no=? WHERE id=?", (-1000000 - row["id"], row["id"]))
                configured_keys = {cp["checkpoint_key"] for cp in configured}
                for cp in configured:
                    row = conn.execute(
                        "SELECT id FROM checkpoints WHERE race_id=? AND checkpoint_key=?",
                        (race_id, cp["checkpoint_key"]),
                    ).fetchone()
                    if row:
                        conn.execute("""
                          UPDATE checkpoints SET name=?,sequence_no=?,distance_km=?,elevation_m=? WHERE id=?
                        """, (cp["name"], cp["sequence_no"], cp.get("distance_km"), cp.get("elevation_m"), row["id"]))
                    else:
                        conn.execute("""
                          INSERT INTO checkpoints(race_id,checkpoint_key,name,sequence_no,distance_km,elevation_m)
                          VALUES(?,?,?,?,?,?)
                        """, (race_id, cp["checkpoint_key"], cp["name"], cp["sequence_no"], cp.get("distance_km"), cp.get("elevation_m")))
                next_sequence = max((cp["sequence_no"] for cp in configured), default=-1) + 1
                for row in existing_checkpoints:
                    if row["checkpoint_key"] not in configured_keys:
                        conn.execute("UPDATE checkpoints SET sequence_no=? WHERE id=?", (next_sequence, row["id"]))
                        next_sequence += 1
                continue

            occupied = {row["sequence_no"] for row in existing_checkpoints}
            existing_keys = {row["checkpoint_key"] for row in existing_checkpoints}
            next_sequence = max(occupied, default=-1) + 1
            for cp in configured:
                if cp["checkpoint_key"] in existing_keys:
                    # Checkpoint identity, order and distance belong to imported
                    # data as soon as results exist. Do not rewrite them.
                    continue
                sequence = cp["sequence_no"]
                if sequence in occupied:
                    sequence = next_sequence
                    next_sequence += 1
                conn.execute("""
                  INSERT INTO checkpoints(race_id,checkpoint_key,name,sequence_no,distance_km,elevation_m)
                  VALUES(?,?,?,?,?,?)
                """, (race_id, cp["checkpoint_key"], cp["name"], sequence, cp.get("distance_km"), cp.get("elevation_m")))
                occupied.add(sequence)


def ensure_schema_migrations(conn: sqlite3.Connection) -> None:
    """Apply additive migrations to databases created by earlier versions."""
    split_columns = {row[1] for row in conn.execute("PRAGMA table_info(splits)")}
    additions = {
        "reported_pace_seconds_per_km": "REAL",
        "speed_kmh": "REAL",
        "time_of_day": "TEXT",
        "diff_seconds": "INTEGER",
        "is_estimated": "INTEGER NOT NULL DEFAULT 0",
    }
    for name, sql_type in additions.items():
        if name not in split_columns:
            conn.execute(f"ALTER TABLE splits ADD COLUMN {name} {sql_type}")
    conn.commit()


def init_db(db_path: Path, config_path: Path) -> None:
    conn = connect(db_path)
    try:
        conn.executescript((ROOT / "tools" / "schema.sql").read_text(encoding="utf-8"))
        ensure_schema_migrations(conn)
        upsert_catalogue(conn, load_config(config_path))
    finally:
        conn.close()
    print(f"Databas klar: {db_path}")


@dataclass
class ParsedResult:
    source_result_id: str
    source_url: str | None = None
    bib: str | None = None
    name: str | None = None
    sex: str | None = None
    age: int | None = None
    birth_year: int | None = None
    age_class: str | None = None
    nationality: str | None = None
    club: str | None = None
    city: str | None = None
    county: str | None = None
    start_group: str | None = None
    status: str = "UNKNOWN"
    finish_seconds: int | None = None
    gun_seconds: int | None = None
    net_seconds: int | None = None
    overall_place: int | None = None
    gender_place: int | None = None
    class_place: int | None = None
    splits: list[dict[str, Any]] | None = None
    raw: dict[str, Any] | None = None


def first_selector_text(soup: BeautifulSoup, selectors: Iterable[str]) -> str | None:
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            # Mika often assigns the same field class to both the table row and
            # its value cell. For empty values, reading the row would otherwise
            # return the label itself, e.g. "Klubb/Stad".
            if node.name == "tr":
                cells = node.find_all(["th", "td"], recursive=False)
                value = clean_text(cells[1].get_text(" ", strip=True)) if len(cells) >= 2 else None
            else:
                value = clean_text(node.get_text(" ", strip=True))
            if value:
                return value
    return None


def extract_labeled_values(soup: BeautifulSoup) -> dict[str, str]:
    out: dict[str, str] = {}
    for row in soup.select("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if len(cells) == 2:
            label = normalize(cells[0].get_text(" ", strip=True)).rstrip(":")
            value = clean_text(cells[1].get_text(" ", strip=True))
            if value:
                for alias, field in LABEL_MAP.items():
                    if normalize(alias) == label:
                        out[field] = value
    for dt in soup.select("dt"):
        dd = dt.find_next_sibling("dd")
        if not dd:
            continue
        label = normalize(dt.get_text(" ", strip=True)).rstrip(":")
        value = clean_text(dd.get_text(" ", strip=True))
        if value:
            for alias, field in LABEL_MAP.items():
                if normalize(alias) == label:
                    out[field] = value
    return out


def extract_combined_club_city(soup: BeautifulSoup) -> str | None:
    for row in soup.select("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if len(cells) != 2:
            continue
        if normalize(cells[0].get_text(" ", strip=True)).rstrip(":") == "klubb stad":
            return clean_text(cells[1].get_text(" ", strip=True))
    return None


def _class_text(node: Any, class_names: Iterable[str]) -> str | None:
    for cls in class_names:
        child = node.select_one(f".{cls}")
        if child:
            text = clean_text(child.get_text(" ", strip=True))
            if text:
                return text
    return None


def extract_split_tables(soup: BeautifulSoup, known_checkpoints: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Extract Mika split rows, preserving reported pace/speed/difference.

    Mika result pages have historically used ``tr.split`` and cells named
    ``desc``, ``time``, ``diff``, ``min_km``, ``kmh`` and ``place``.  The
    generic table parser remains as a fallback for layout changes.
    """
    found: dict[str, dict[str, Any]] = {}

    # Primary parser based on the public Mika markup used by Vasaloppet.
    rows = list(soup.select("tr.split"))
    finish_rows = list(soup.select("tr.f-time_finish_brutto, tr.f-time_finish_netto, tr.f-time_finish, tr.finish"))
    for row in rows + finish_rows:
        desc = _class_text(row, ["desc", "name", "split-name"])
        if row in finish_rows and not desc:
            desc = "Mora mål"
        key = checkpoint_key(desc)
        if not key or key not in known_checkpoints:
            continue
        elapsed_text = _class_text(row, ["time", "elapsed", "time_total"])
        # Some finish rows put the time directly in a f-time_* cell.
        if not elapsed_text:
            elapsed_text = first_selector_text(row, [".f-time_finish_brutto", ".f-time_finish", "td.time"])
        elapsed = parse_time(elapsed_text)
        if elapsed is None and key != "start":
            continue
        item = found.setdefault(key, {"checkpoint_key": key})
        item.update({
            "source_label": desc,
            "elapsed_seconds": elapsed or 0,
            "time_of_day": _class_text(row, ["daytime", "time_of_day", "timeofday"]),
            "diff_seconds": parse_diff(_class_text(row, ["diff", "difference"])),
            "reported_pace_seconds_per_km": parse_pace(_class_text(row, ["min_km", "minkm", "pace"])),
            "speed_kmh": parse_float(_class_text(row, ["kmh", "speed"])),
            "place_overall": parse_int(_class_text(row, ["place", "rank", "placement"])),
            "raw_cells": [clean_text(c.get_text(" ", strip=True)) for c in row.find_all(["th", "td"], recursive=False)],
        })

    # Mika sometimes encodes checkpoint IDs in f-time_<checkpoint> CSS classes.
    for cell in soup.select("td[class*='f-time_'], span[class*='f-time_']"):
        classes = cell.get("class", [])
        cls = next((c for c in classes if c.startswith("f-time_") and "finish" not in c), None)
        if not cls:
            continue
        raw_key = cls.removeprefix("f-time_")
        key = checkpoint_key(raw_key)
        if key and key in known_checkpoints:
            elapsed = parse_time(cell.get_text(" ", strip=True))
            if elapsed is not None:
                found.setdefault(key, {"checkpoint_key": key})["elapsed_seconds"] = elapsed

    # Generic table parser for named controls and elapsed times.
    for table in soup.select("table"):
        rows_text: list[list[str]] = []
        for tr in table.select("tr"):
            cells = [clean_text(c.get_text(" ", strip=True)) or "" for c in tr.find_all(["th", "td"], recursive=False)]
            if cells:
                rows_text.append(cells)
        if len(rows_text) < 2:
            continue
        header = [normalize(x) for x in rows_text[0]]
        cp_col = next((i for i, h in enumerate(header) if any(w in h for w in ["kontroll", "checkpoint", "split", "station", "plats"])), 0)
        elapsed_candidates = [i for i, h in enumerate(header) if any(w in h for w in ["mellantid", "elapsed", "loptid", "race time", "time"])]
        time_col = elapsed_candidates[-1] if elapsed_candidates else None
        tod_col = next((i for i, h in enumerate(header) if "time of day" in h or "klockslag" in h), None)
        place_col = next((i for i, h in enumerate(header) if "plac" in h or "place" in h or "rank" in h), None)
        diff_col = next((i for i, h in enumerate(header) if "diff" in h or "efter" in h), None)
        pace_col = next((i for i, h in enumerate(header) if "min km" in h or "min/km" in h or "pace" in h), None)
        speed_col = next((i for i, h in enumerate(header) if "km h" in h or "km/h" in h or "speed" in h), None)
        for cells in rows_text[1:]:
            if cp_col >= len(cells):
                continue
            key = checkpoint_key(cells[cp_col])
            if not key or key not in known_checkpoints:
                continue
            elapsed = parse_time(cells[time_col]) if time_col is not None and time_col < len(cells) else None
            if elapsed is None:
                elapsed = next((parse_time(c) for c in cells[1:] if parse_time(c) is not None), None)
            if elapsed is None and key != "start":
                continue
            item = found.setdefault(key, {"checkpoint_key": key})
            item.setdefault("source_label", cells[cp_col])
            item.setdefault("elapsed_seconds", elapsed or 0)
            if place_col is not None and place_col < len(cells):
                item.setdefault("place_overall", parse_int(cells[place_col]))
            if tod_col is not None and tod_col < len(cells):
                item.setdefault("time_of_day", clean_text(cells[tod_col]))
            if diff_col is not None and diff_col < len(cells):
                item.setdefault("diff_seconds", parse_diff(cells[diff_col]))
            if pace_col is not None and pace_col < len(cells):
                item.setdefault("reported_pace_seconds_per_km", parse_pace(cells[pace_col]))
            if speed_col is not None and speed_col < len(cells):
                item.setdefault("speed_kmh", parse_float(cells[speed_col]))

    return sorted(found.values(), key=lambda x: known_checkpoints[x["checkpoint_key"]]["sequence_no"])

def parse_detail_html(html: str, source_result_id: str, source_url: str, checkpoints: list[dict[str, Any]]) -> ParsedResult:
    soup = BeautifulSoup(html, "lxml")
    labeled = extract_labeled_values(soup)
    vals: dict[str, Any] = {}
    for field, selectors in FIELD_SELECTORS.items():
        vals[field] = first_selector_text(soup, selectors) or labeled.get(field)

    title_name = clean_text((soup.select_one("h1, h2, .athlete-name, .participant-name") or soup).get_text(" ", strip=True))
    if not vals.get("name") and title_name and len(title_name) < 160:
        vals["name"] = title_name

    status = normalize_result_status(vals.get("status"))
    if not status:
        body_text = normalize(soup.get_text(" ", strip=True))
        for marker in ("did not finish", "dnf", "did not start", "dns", "disqualified", "dsq"):
            if re.search(rf"\b{re.escape(marker)}\b", body_text):
                status = normalize_result_status(marker)
                break

    net = parse_time(vals.get("net_time"))
    gun = parse_time(vals.get("gun_time"))
    finish = parse_time(vals.get("finish_time")) or net or gun
    if not status:
        status = "FINISHED" if finish is not None else "UNKNOWN"
    cp_map = {c["checkpoint_key"]: c for c in checkpoints}
    splits = extract_split_tables(soup, cp_map)
    mora_split = next((s for s in splits if s["checkpoint_key"] == "mora" and s.get("elapsed_seconds") is not None), None)
    real_finish_labels = {"mal", "mora mal", "finish"}
    mora_is_real_finish = mora_split and normalize(mora_split.get("source_label")) in real_finish_labels
    if mora_split and (finish is None or (mora_is_real_finish and abs(finish - mora_split["elapsed_seconds"]) > 60)):
        # A selector may hit the whole finish row and parse the time-of-day
        # column. Only a real finish row may correct an existing result time;
        # an advance-warning control must never replace the official finish.
        finish = mora_split["elapsed_seconds"]
        gun = finish if gun is None or abs(gun - finish) > 60 else gun
        status = "FINISHED"
    if finish is not None and "mora" in cp_map and not any(s["checkpoint_key"] == "mora" for s in splits):
        splits.append({"checkpoint_key": "mora", "elapsed_seconds": finish})

    original_name = clean_text(vals.get("name"))
    parsed_name, parsed_nationality = clean_name_and_nationality(original_name, vals.get("nationality"))
    combined_club_city = extract_combined_club_city(soup)
    club_city_classification = None
    club = clean_text(vals.get("club"))
    city = clean_text(vals.get("city"))
    if combined_club_city:
        combined_club, combined_city, club_city_classification = classify_club_city(combined_club_city)
        club = combined_club
        city = combined_city or city

    return ParsedResult(
        source_result_id=source_result_id,
        source_url=source_url,
        bib=clean_text(vals.get("bib")),
        name=parsed_name or f"Okänd löpare {source_result_id}",
        sex=sex_code(vals.get("sex"), vals.get("age_class")),
        age_class=optional_source_value(vals.get("age_class")),
        nationality=parsed_nationality,
        club=club,
        city=city,
        start_group=clean_text(vals.get("start_group")),
        status=status,
        finish_seconds=finish,
        gun_seconds=gun,
        net_seconds=net,
        overall_place=parse_int(vals.get("overall_place")),
        gender_place=parse_int(vals.get("gender_place")),
        class_place=parse_int(vals.get("class_place")),
        splits=splits,
        raw={
            "selector_values": vals,
            "labeled_values": labeled,
            "published_name_original": original_name,
            "club_city_original": combined_club_city,
            "club_city_classification": club_city_classification,
        }
    )


def extract_participant_links(html: str, base_url: str) -> list[tuple[str, str]]:
    soup = BeautifulSoup(html, "lxml")
    out: dict[str, str] = {}
    for link in soup.select("a[href*='idp=']"):
        href = urljoin(base_url, link.get("href", ""))
        idp = parse_qs(urlparse(href).query).get("idp", [None])[0]
        if idp:
            out[idp] = href
    return sorted(out.items())


def create_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36 UltravasanResearch/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.7",
        "Cache-Control": "no-cache"
    })
    return s


def fetch_cached(session: requests.Session, url: str, cache_path: Path, delay: float, force: bool = False) -> tuple[str, int, bool]:
    if cache_path.exists() and not force:
        return cache_path.read_text(encoding="utf-8", errors="replace"), 200, True
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    response = session.get(url, timeout=60)
    response.raise_for_status()
    response.encoding = response.apparent_encoding or response.encoding or "utf-8"
    cache_path.write_text(response.text, encoding="utf-8")
    time.sleep(max(0, delay))
    return response.text, response.status_code, False


def get_race_config(config: dict[str, Any], race_key: str) -> dict[str, Any]:
    try:
        return next(r for r in config["races"] if r["race_key"] == race_key)
    except StopIteration:
        raise SystemExit(f"Okänd race_key: {race_key}")


def record_source_page(conn: sqlite3.Connection, import_run_id: int, source_id: int, race_id: int, record_type: str, external_id: str, url: str, status: int, cache_path: Path, html: str) -> None:
    sha = hashlib.sha256(html.encode("utf-8", errors="replace")).hexdigest()
    resolved_cache = cache_path.expanduser().resolve()
    try:
        cache_reference = resolved_cache.relative_to(ROOT.resolve())
    except ValueError:
        cache_reference = resolved_cache
    conn.execute("""
      INSERT OR IGNORE INTO source_records(import_run_id,source_id,race_id,record_type,external_id,url,http_status,content_sha256,cache_path)
      VALUES(?,?,?,?,?,?,?,?,?)
    """, (import_run_id, source_id, race_id, record_type, external_id, url, status, sha, str(cache_reference)))


def find_or_create_athlete(conn: sqlite3.Connection, parsed: ParsedResult, source_id: int) -> int:
    ext = conn.execute("SELECT athlete_id FROM athlete_external_ids WHERE source_id=? AND external_id=?", (source_id, parsed.source_result_id)).fetchone()
    if ext:
        return ext[0]
    name = parsed.name or f"Okänd {parsed.source_result_id}"
    norm = normalize(name)
    source_code_row = conn.execute("SELECT code FROM sources WHERE id=?", (source_id,)).fetchone()
    source_code = source_code_row[0] if source_code_row else None
    # VasaNerd's idpe is a stable person identifier across race years. When it
    # is new, create a distinct athlete even if another runner has the same
    # published name. Subsequent years link through athlete_external_ids.
    if source_code == "vasanerd":
        compatible = []
    else:
        candidates = conn.execute("SELECT * FROM athletes WHERE normalized_name=?", (norm,)).fetchall()
        compatible = [c for c in candidates if (not parsed.sex or not c["sex"] or parsed.sex == c["sex"]) and (not parsed.birth_year or not c["birth_year"] or parsed.birth_year == c["birth_year"])]
    if len(compatible) == 1:
        athlete_id = compatible[0]["id"]
    else:
        cur = conn.execute("""
          INSERT INTO athletes(canonical_name,normalized_name,sex,birth_year,nationality,city,athlete_match_status)
          VALUES(?,?,?,?,?,?,?)
        """, (name, norm, parsed.sex, parsed.birth_year, parsed.nationality, parsed.city, "source-id" if source_code == "vasanerd" else "unverified"))
        athlete_id = cur.lastrowid
    conn.execute("""
      INSERT OR IGNORE INTO athlete_external_ids(athlete_id,source_id,external_id,profile_url,confidence)
      VALUES(?,?,?,?,?)
    """, (athlete_id, source_id, parsed.source_result_id, parsed.source_url, 1.0))
    return athlete_id


def save_result(conn: sqlite3.Connection, race_id: int, source_id: int, distance_km: float | None, checkpoints: list[dict[str, Any]], parsed: ParsedResult, store_raw: bool = True) -> tuple[int, bool]:
    athlete_id = find_or_create_athlete(conn, parsed, source_id)
    existing = conn.execute("SELECT id FROM results WHERE race_id=? AND source_id=? AND source_result_id=?", (race_id, source_id, parsed.source_result_id)).fetchone()
    pace = parsed.finish_seconds / distance_km if parsed.finish_seconds and distance_km else None
    data = {
        "race_id": race_id, "athlete_id": athlete_id, "source_id": source_id,
        "source_result_id": parsed.source_result_id, "source_url": parsed.source_url,
        "bib": parsed.bib, "name_as_published": parsed.name or f"Okänd {parsed.source_result_id}",
        "sex": parsed.sex, "age": parsed.age, "birth_year": parsed.birth_year, "age_class": parsed.age_class,
        "nationality": parsed.nationality, "club": parsed.club, "city": parsed.city, "county": parsed.county,
        "start_group": parsed.start_group, "status": parsed.status, "finish_seconds": parsed.finish_seconds,
        "gun_seconds": parsed.gun_seconds, "net_seconds": parsed.net_seconds, "overall_place": parsed.overall_place,
        "gender_place": parsed.gender_place, "class_place": parsed.class_place, "pace_seconds_per_km": pace,
        "raw_json": json.dumps(parsed.raw or {}, ensure_ascii=False) if store_raw else None
    }
    conn.execute("""
      INSERT INTO results(race_id,athlete_id,source_id,source_result_id,source_url,bib,name_as_published,sex,age,birth_year,
        age_class,nationality,club,city,county,start_group,status,finish_seconds,gun_seconds,net_seconds,overall_place,
        gender_place,class_place,pace_seconds_per_km,raw_json)
      VALUES(:race_id,:athlete_id,:source_id,:source_result_id,:source_url,:bib,:name_as_published,:sex,:age,:birth_year,
        :age_class,:nationality,:club,:city,:county,:start_group,:status,:finish_seconds,:gun_seconds,:net_seconds,:overall_place,
        :gender_place,:class_place,:pace_seconds_per_km,:raw_json)
      ON CONFLICT(race_id,source_id,source_result_id) DO UPDATE SET athlete_id=excluded.athlete_id,source_url=excluded.source_url,
        bib=excluded.bib,name_as_published=excluded.name_as_published,sex=excluded.sex,age=excluded.age,birth_year=excluded.birth_year,
        age_class=excluded.age_class,nationality=excluded.nationality,club=excluded.club,city=excluded.city,county=excluded.county,
        start_group=excluded.start_group,status=excluded.status,finish_seconds=excluded.finish_seconds,gun_seconds=excluded.gun_seconds,
        net_seconds=excluded.net_seconds,overall_place=excluded.overall_place,gender_place=excluded.gender_place,
        class_place=excluded.class_place,pace_seconds_per_km=excluded.pace_seconds_per_km,raw_json=excluded.raw_json,imported_at=CURRENT_TIMESTAMP
    """, data)
    result_id = conn.execute("SELECT id FROM results WHERE race_id=? AND source_id=? AND source_result_id=?", (race_id, source_id, parsed.source_result_id)).fetchone()[0]
    cp_by_key = {c["checkpoint_key"]: c for c in checkpoints}
    last_elapsed = 0
    last_distance = 0.0
    ordered_splits = sorted(
        parsed.splits or [],
        key=lambda split: cp_by_key.get(split.get("checkpoint_key"), {}).get("sequence_no", 10**9),
    )
    for split in ordered_splits:
        cp = cp_by_key.get(split["checkpoint_key"])
        if not cp:
            continue
        if cp.get("id") is not None:
            cp_row = cp
        else:
            cp_row = conn.execute("SELECT id,distance_km FROM checkpoints WHERE race_id=? AND checkpoint_key=?", (race_id, split["checkpoint_key"])).fetchone()
        elapsed = split.get("elapsed_seconds")
        segment = elapsed - last_elapsed if elapsed is not None and elapsed >= last_elapsed else None
        dist = cp_row["distance_km"]
        segment_dist = dist - last_distance if dist is not None else None
        segment_pace = segment / segment_dist if segment is not None and segment_dist and segment_dist > 0 else None
        conn.execute("""
          INSERT INTO splits(result_id,checkpoint_id,elapsed_seconds,segment_seconds,place_overall,place_gender,place_class,
            pace_seconds_per_km,reported_pace_seconds_per_km,speed_kmh,time_of_day,diff_seconds,status,is_estimated,raw_json)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(result_id,checkpoint_id) DO UPDATE SET elapsed_seconds=excluded.elapsed_seconds,segment_seconds=excluded.segment_seconds,
          place_overall=excluded.place_overall,place_gender=excluded.place_gender,place_class=excluded.place_class,
          pace_seconds_per_km=excluded.pace_seconds_per_km,reported_pace_seconds_per_km=excluded.reported_pace_seconds_per_km,
          speed_kmh=excluded.speed_kmh,time_of_day=excluded.time_of_day,diff_seconds=excluded.diff_seconds,
          status=excluded.status,is_estimated=excluded.is_estimated,raw_json=excluded.raw_json
        """, (result_id, cp_row["id"], elapsed, segment, split.get("place_overall"), split.get("place_gender"),
              split.get("place_class"), segment_pace, split.get("reported_pace_seconds_per_km"), split.get("speed_kmh"),
              split.get("time_of_day"), split.get("diff_seconds"), split.get("status"), int(bool(split.get("is_estimated", False))),
              json.dumps(split, ensure_ascii=False) if store_raw else None))
        if elapsed is not None:
            last_elapsed = elapsed
        if dist is not None:
            last_distance = dist
    return result_id, existing is None


def scrape(args: argparse.Namespace) -> None:
    init_db(args.db, args.config)
    config = load_config(args.config)
    race_cfg = get_race_config(config, args.race)
    conn = connect(args.db)
    race = conn.execute("SELECT * FROM races WHERE race_key=?", (args.race,)).fetchone()
    source = conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
    run_id = conn.execute("INSERT INTO import_runs(source_id,race_id) VALUES(?,?)", (source["id"], race["id"])).lastrowid
    conn.commit()
    session = create_session()
    race_raw = args.raw / args.race
    all_links: dict[str, str] = {}
    empty_count = 0
    try:
        for page in range(1, race_cfg.get("max_pages", 200) + 1):
            url = race_cfg["page_url_template"].format(page=page)
            cache = race_raw / "lists" / f"page-{page:03d}.html"
            html, status, _ = fetch_cached(session, url, cache, args.delay, args.force)
            record_source_page(conn, run_id, source["id"], race["id"], "result_list", str(page), url, status, cache, html)
            links = extract_participant_links(html, url)
            new_count = 0
            for idp, href in links:
                if idp not in all_links:
                    all_links[idp] = href
                    new_count += 1
            print(f"Sida {page}: {len(links)} länkar, {new_count} nya, totalt {len(all_links)}")
            if new_count == 0:
                empty_count += 1
                if empty_count >= race_cfg.get("empty_pages_to_stop", 2):
                    break
            else:
                empty_count = 0
            conn.commit()

        if not all_links:
            raise RuntimeError("Inga deltagarlänkar hittades. Kontrollera URL, åtkomst och sidans HTML. Prova officiell CSV-export med import-csv.")

        inserted = updated = warnings = 0
        checkpoints = race_cfg.get("checkpoints", [])
        for index, (idp, discovered_url) in enumerate(all_links.items(), 1):
            detail_url = race_cfg.get("detail_url_template", discovered_url).format(idp=idp)
            cache = race_raw / "details" / f"{re.sub(r'[^A-Za-z0-9_.-]', '_', idp)}.html"
            try:
                html, status, cached = fetch_cached(session, detail_url, cache, args.delay, args.force)
                record_source_page(conn, run_id, source["id"], race["id"], "participant_detail", idp, detail_url, status, cache, html)
                # Mika's idp should be namespaced by event. This prevents an
                # accidental athlete link if the service reuses an idp in another year.
                external_result_id = f"{race_cfg.get('event_code', args.race)}:{idp}"
                parsed = parse_detail_html(html, external_result_id, detail_url, checkpoints)
                _, is_new = save_result(conn, race["id"], source["id"], race["distance_km"], checkpoints, parsed)
                inserted += int(is_new)
                updated += int(not is_new)
                marker = "cache" if cached else "hämtad"
                print(f"[{index}/{len(all_links)}] {parsed.name} – {marker}")
            except Exception as exc:
                warnings += 1
                print(f"VARNING {idp}: {exc}", file=sys.stderr)
            if index % 20 == 0:
                conn.commit()
        conn.execute("UPDATE import_runs SET finished_at=?,status='complete',records_seen=?,records_inserted=?,records_updated=?,warnings=? WHERE id=?",
                     (utc_now(), len(all_links), inserted, updated, warnings, run_id))
        conn.commit()
        print(f"Import klar: {inserted} nya, {updated} uppdaterade, {warnings} varningar")
    except Exception as exc:
        conn.execute("UPDATE import_runs SET finished_at=?,status='failed',message=? WHERE id=?", (utc_now(), str(exc), run_id))
        conn.commit()
        raise
    finally:
        conn.close()


def detect_delimiter(path: Path, encoding: str) -> str:
    sample = path.read_text(encoding=encoding, errors="replace")[:8192]
    try:
        return csv.Sniffer().sniff(sample, delimiters=";,\t|").delimiter
    except csv.Error:
        return ";"


def mapped_csv_row(row: dict[str, str], mapping: dict[str, str] | None = None) -> dict[str, str]:
    out: dict[str, str] = {}
    mapping = mapping or {}
    for original, value in row.items():
        if original is None:
            continue
        # Checkpoint columns such as "Evertsberg tid" must be handled
        # before generic labels such as "tid".
        cp = checkpoint_key(original)
        if cp and parse_time(value) is not None:
            out[f"split:{cp}"] = value
            continue
        key = mapping.get(original)
        if not key:
            n = normalize(original)
            exact = {normalize(alias): field for alias, field in LABEL_MAP.items()}
            key = exact.get(n)
            if not key:
                for alias, field in LABEL_MAP.items():
                    na = normalize(alias)
                    if len(na) >= 6 and na in n:
                        key = field
                        break
        if key:
            out[key] = clean_text(value) or ""
    return out


def import_csv(args: argparse.Namespace) -> None:
    init_db(args.db, args.config)
    cfg = load_config(args.config)
    race_cfg = get_race_config(cfg, args.race)
    conn = connect(args.db)
    race = conn.execute("SELECT * FROM races WHERE race_key=?", (args.race,)).fetchone()
    source = conn.execute("SELECT * FROM sources WHERE code=?", (args.source,)).fetchone()
    if not source:
        raise SystemExit(f"Okänd källa: {args.source}")
    run_id = conn.execute("INSERT INTO import_runs(source_id,race_id) VALUES(?,?)", (source["id"], race["id"])).lastrowid
    encoding = args.encoding
    delimiter = args.delimiter or detect_delimiter(args.file, encoding)
    mapping = json.loads(args.mapping.read_text(encoding="utf-8")) if args.mapping else None
    inserted = updated = warnings = seen = 0
    with args.file.open("r", encoding=encoding, errors="replace", newline="") as fh:
        reader = csv.DictReader(fh, delimiter=delimiter)
        for row_no, row in enumerate(reader, 2):
            seen += 1
            try:
                m = mapped_csv_row(row, mapping)
                name = m.get("name")
                bib = m.get("bib")
                if not name:
                    raise ValueError("Namnkolumn kunde inte identifieras")
                base_result_id = m.get("source_result_id") or bib or hashlib.sha1(f"{name}|{row_no}".encode()).hexdigest()[:16]
                source_result_id = f"{race_cfg.get('event_code', args.race)}:{base_result_id}"
                splits = []
                for key, value in m.items():
                    if key.startswith("split:"):
                        splits.append({"checkpoint_key": key.split(":", 1)[1], "elapsed_seconds": parse_time(value)})
                finish = parse_time(m.get("finish_time")) or parse_time(m.get("net_time")) or parse_time(m.get("gun_time"))
                status_raw = normalize(m.get("status") or "")
                status = "FINISHED" if finish is not None else (status_raw.upper() if status_raw else "UNKNOWN")
                parsed = ParsedResult(
                    source_result_id=source_result_id, bib=bib, name=name,
                    sex=sex_code(m.get("sex"), m.get("age_class")), age=parse_int(m.get("age")), birth_year=parse_int(m.get("birth_year")),
                    age_class=m.get("age_class"), nationality=m.get("nationality"), club=m.get("club"), city=m.get("city"), county=m.get("county"),
                    status=status, finish_seconds=finish, net_seconds=parse_time(m.get("net_time")), gun_seconds=parse_time(m.get("gun_time")),
                    overall_place=parse_int(m.get("overall_place")), gender_place=parse_int(m.get("gender_place")), class_place=parse_int(m.get("class_place")),
                    splits=splits, raw={"csv_row": row}
                )
                _, is_new = save_result(conn, race["id"], source["id"], race["distance_km"], race_cfg.get("checkpoints", []), parsed)
                inserted += int(is_new); updated += int(not is_new)
            except Exception as exc:
                warnings += 1
                print(f"Rad {row_no}: {exc}", file=sys.stderr)
    conn.execute("UPDATE import_runs SET finished_at=?,status='complete',records_seen=?,records_inserted=?,records_updated=?,warnings=? WHERE id=?",
                 (utc_now(), seen, inserted, updated, warnings, run_id))
    conn.commit(); conn.close()
    print(f"CSV-import klar: {inserted} nya, {updated} uppdaterade, {warnings} varningar")


def percentiles(values: list[int]) -> dict[str, int | None]:
    if not values:
        return {"p10": None, "p25": None, "median": None, "p75": None, "p90": None}
    values = sorted(values)
    def p(q: float) -> int:
        idx = (len(values) - 1) * q
        lo, hi = int(idx), min(int(idx) + 1, len(values) - 1)
        return round(values[lo] + (values[hi] - values[lo]) * (idx - lo))
    return {"p10": p(.10), "p25": p(.25), "median": p(.5), "p75": p(.75), "p90": p(.90)}


def export_web(args: argparse.Namespace) -> None:
    conn = connect(args.db)
    races = [dict(r) for r in conn.execute("SELECT * FROM races ORDER BY year")]
    checkpoints = [dict(r) for r in conn.execute("SELECT * FROM checkpoints ORDER BY race_id,sequence_no")]

    # Several sources can describe the same race performance. Keep all source
    # rows locally, but publish one merged record per race + canonical athlete.
    priority = {"vasaloppet_mika": 0, "vasaloppet_media": 1, "vasanerd": 2, "vasaloppet_pdf": 3, "duv": 4, "itra": 5, "manual": 6}
    raw_results = []
    for row in conn.execute("""
      SELECT r.*, a.canonical_name, a.athlete_match_status, s.code source_code
      FROM results r JOIN athletes a ON a.id=r.athlete_id JOIN sources s ON s.id=r.source_id
      ORDER BY r.race_id, r.athlete_id
    """):
        d = dict(row)
        d.pop("raw_json", None)
        d.pop("source_url", None)
        d.pop("imported_at", None)
        raw_results.append(d)

    groups: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for r in raw_results:
        groups.setdefault((r["race_id"], r["athlete_id"]), []).append(r)
    results: list[dict[str, Any]] = []
    source_result_to_public: dict[int, int] = {}
    merge_fields = [
        "bib", "name_as_published", "sex", "age", "birth_year", "age_class", "nationality", "club", "city", "county",
        "start_group", "status", "finish_seconds", "gun_seconds", "net_seconds", "overall_place", "gender_place",
        "class_place", "pace_seconds_per_km"
    ]
    for items in groups.values():
        items.sort(key=lambda r: priority.get(r["source_code"], 99))
        merged = dict(items[0])
        merged["source_codes"] = sorted({r["source_code"] for r in items}, key=lambda c: priority.get(c, 99))
        merged["source_count"] = len(items)
        for other in items[1:]:
            for field in merge_fields:
                if merged.get(field) in (None, "", "UNKNOWN") and other.get(field) not in (None, "", "UNKNOWN"):
                    merged[field] = other[field]
        for r in items:
            source_result_to_public[r["id"]] = merged["id"]
        results.append(merged)
    results.sort(key=lambda r: (r["race_id"], r.get("overall_place") or 999999, r.get("finish_seconds") or 999999999))

    split_candidates: dict[tuple[int, str], list[dict[str, Any]]] = {}
    for row in conn.execute("""
      SELECT sp.result_id,cp.checkpoint_key,cp.name checkpoint_name,cp.sequence_no,cp.distance_km,
             sp.elapsed_seconds,sp.segment_seconds,sp.place_overall,sp.place_gender,sp.place_class,sp.pace_seconds_per_km,
             sp.reported_pace_seconds_per_km,sp.speed_kmh,sp.time_of_day,sp.diff_seconds,sp.is_estimated,
             src.code source_code
      FROM splits sp
      JOIN checkpoints cp ON cp.id=sp.checkpoint_id
      JOIN results r ON r.id=sp.result_id
      JOIN sources src ON src.id=r.source_id
      ORDER BY sp.result_id,cp.sequence_no
    """):
        d = dict(row)
        public_id = source_result_to_public.get(d["result_id"])
        if public_id is None:
            continue
        d["result_id"] = public_id
        split_candidates.setdefault((public_id, d["checkpoint_key"]), []).append(d)
    splits = []
    for candidates in split_candidates.values():
        candidates.sort(key=lambda x: priority.get(x["source_code"], 99))
        merged = dict(candidates[0])
        for other in candidates[1:]:
            for field in ["elapsed_seconds", "segment_seconds", "place_overall", "place_gender", "place_class", "pace_seconds_per_km",
                          "reported_pace_seconds_per_km", "speed_kmh", "time_of_day", "diff_seconds", "is_estimated"]:
                if merged.get(field) is None and other.get(field) is not None:
                    merged[field] = other[field]
        merged.pop("source_code", None)
        splits.append(merged)
    splits.sort(key=lambda s: (s["result_id"], s["sequence_no"]))

    stats = {}
    for race in races:
        times = [r["finish_seconds"] for r in results if r["race_id"] == race["id"] and r["finish_seconds"]]
        statuses: dict[str, int] = {}
        for r in results:
            if r["race_id"] == race["id"]:
                statuses[r["status"]] = statuses.get(r["status"], 0) + 1
        stats[str(race["id"])] = {"count": len([r for r in results if r["race_id"] == race["id"]]), "finishers": len(times), "times": percentiles(times), "statuses": statuses}
    sources = [dict(r) for r in conn.execute("SELECT code,name,base_url,source_type,terms_note FROM sources ORDER BY id")]
    latest_import = conn.execute("SELECT MAX(finished_at) FROM import_runs WHERE status='complete'").fetchone()[0]
    meta = {"schema_version": 1, "generated_at": utc_now(), "latest_import": latest_import, "data_notice": "Resultatdata ska verifieras mot officiell källa. Personmatchning mellan år är konservativ och kan kräva manuell granskning."}
    incomplete_years = [str(r["year"]) for r in races if stats.get(str(r["id"]), {}).get("count", 0) < 100]
    if incomplete_years:
        meta["coverage_note"] = "Ofullständig datatäckning för loppår: " + ", ".join(incomplete_years) + ". Kör onlineimporten eller ladda upp en officiell CSV-fil."
    # Keep the public static bundle below GitHub's 25 MiB browser-upload limit.
    # Repeated checkpoint metadata is hydrated in the browser from checkpoints.
    result_fields = {
        "id", "race_id", "athlete_id", "bib", "name_as_published", "canonical_name",
        "sex", "age_class", "nationality", "club", "city", "start_group", "status",
        "finish_seconds", "overall_place", "gender_place", "class_place",
        "pace_seconds_per_km", "source_code", "source_result_id", "athlete_match_status"
    }
    split_fields = {
        "result_id", "checkpoint_key", "elapsed_seconds", "segment_seconds",
        "place_overall", "pace_seconds_per_km", "reported_pace_seconds_per_km",
        "speed_kmh", "time_of_day", "is_estimated"
    }
    public_results = [
        {k: v for k, v in row.items() if k in result_fields and v is not None}
        for row in results
    ]
    public_splits = [
        {k: v for k, v in row.items() if k in split_fields and v is not None and not (k == "is_estimated" and not v)}
        for row in splits
    ]
    payload = {
        "meta": meta,
        "races": races, "checkpoints": checkpoints, "results": public_results, "splits": public_splits,
        "stats": stats, "sources": sources
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    compact_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    args.output.write_text(compact_json, encoding="utf-8")

    # A JavaScript bundle makes the site work when index.html is opened directly
    # from disk (file://), where browsers normally block fetch() of local JSON.
    js_output = args.js_output or args.output.with_name("ultravasan-data.js")
    js_output.parent.mkdir(parents=True, exist_ok=True)
    js_output.write_text("window.ULTRAVASAN_DATA=" + compact_json + ";\n", encoding="utf-8")

    manifest = {"generated_at": payload["meta"]["generated_at"], "races": len(races), "results": len(results), "splits": len(splits), "bytes": args.output.stat().st_size}
    (args.output.parent / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    conn.close()
    print(f"Webbdata exporterad: {args.output} och {js_output} ({len(results)} resultat, {len(splits)} mellantider)")

def validation_rule_for_race(config: dict[str, Any], race: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    """Resolve validation rules by configured race key/family, never by distance."""
    race_key = str(race["race_key"])
    configured_race = next((r for r in config.get("races", []) if r.get("race_key") == race_key), None)
    if configured_race and configured_race.get("validation"):
        return configured_race["validation"]
    family_key = configured_race.get("race_family") if configured_race else None
    families = config.get("race_families", {})
    if family_key and family_key in families:
        return families[family_key].get("validation", {})
    for family in families.values():
        if race_key.startswith(str(family.get("race_key_prefix") or "\0")):
            return family.get("validation", {})
    return {}


def collect_validation_issues(conn: sqlite3.Connection, config: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    races = {r["id"]: r for r in conn.execute("SELECT id,race_key,name,year FROM races")}
    for r in conn.execute("SELECT id,race_id,name_as_published,status,finish_seconds,overall_place FROM results"):
        if r["status"] == "FINISHED" and not r["finish_seconds"]:
            issues.append(f"Resultat {r['id']} {r['name_as_published']}: FINISHED utan sluttid")
        if r["finish_seconds"] and r["race_id"] in races:
            race = races[r["race_id"]]
            rule = validation_rule_for_race(config, race)
            minimum = rule.get("finish_seconds_min")
            maximum = rule.get("finish_seconds_max")
            if minimum is not None and r["finish_seconds"] < int(minimum):
                issues.append(f"Resultat {r['id']} {r['name_as_published']}: orimligt låg tid för {race['race_key']}")
            if maximum is not None and r["finish_seconds"] > int(maximum):
                issues.append(f"Resultat {r['id']} {r['name_as_published']}: orimligt hög tid för {race['race_key']}")
    for row in conn.execute("""
      SELECT sp.result_id,cp.sequence_no,sp.elapsed_seconds,
             LAG(sp.elapsed_seconds) OVER(PARTITION BY sp.result_id ORDER BY cp.sequence_no) prev
      FROM splits sp JOIN checkpoints cp ON cp.id=sp.checkpoint_id
    """):
        if row["prev"] is not None and row["elapsed_seconds"] is not None and row["elapsed_seconds"] < row["prev"]:
            issues.append(f"Resultat {row['result_id']}: mellantid går bakåt vid kontroll {row['sequence_no']}")
    duplicates = conn.execute("""
      SELECT race_id,source_id,source_result_id,COUNT(*) n FROM results GROUP BY 1,2,3 HAVING n>1
    """).fetchall()
    issues += [f"Duplicerat källresultat: {dict(d)}" for d in duplicates]
    cross_race_splits = conn.execute("""
      SELECT sp.result_id,r.race_id result_race_id,cp.race_id checkpoint_race_id
      FROM splits sp
      JOIN results r ON r.id=sp.result_id
      JOIN checkpoints cp ON cp.id=sp.checkpoint_id
      WHERE r.race_id<>cp.race_id
    """).fetchall()
    issues += [f"Resultat {r['result_id']}: mellantid kopplad till kontroll från annat lopp" for r in cross_race_splits]
    return issues


def validate(args: argparse.Namespace) -> None:
    conn = connect(args.db)
    issues = collect_validation_issues(conn, load_config(args.config))
    print(f"Validering: {len(issues)} problem")
    for issue in issues[:200]:
        print("-", issue)
    conn.close()
    if issues:
        raise SystemExit(2)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Ultravasan import- och exportmotor")
    p.add_argument("--db", type=Path, default=DEFAULT_DB)
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    s = sub.add_parser("scrape")
    s.add_argument("--race", default="ultravasan90-2025")
    s.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    s.add_argument("--delay", type=float, default=1.0)
    s.add_argument("--force", action="store_true")
    c = sub.add_parser("import-csv")
    c.add_argument("file", type=Path)
    c.add_argument("--race", default="ultravasan90-2025")
    c.add_argument("--source", default="vasaloppet_media")
    c.add_argument("--encoding", default="utf-8-sig")
    c.add_argument("--delimiter")
    c.add_argument("--mapping", type=Path, help="JSON-fil: originalrubrik -> databasfält")
    e = sub.add_parser("export")
    e.add_argument("--output", type=Path, default=DEFAULT_WEB_JSON)
    e.add_argument("--js-output", type=Path, help="Valfri JavaScript-version för direktöppning utan webbserver")
    sub.add_parser("validate")
    return p


def main() -> None:
    args = parser().parse_args()
    if args.command == "init": init_db(args.db, args.config)
    elif args.command == "scrape": scrape(args)
    elif args.command == "import-csv": import_csv(args)
    elif args.command == "export": export_web(args)
    elif args.command == "validate": validate(args)

if __name__ == "__main__":
    main()
