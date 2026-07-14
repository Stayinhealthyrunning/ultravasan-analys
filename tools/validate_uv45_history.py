#!/usr/bin/env python3
"""Quality gates for the bounded, official Ultravasan 45 history import."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import uvtool


HISTORY_EVENTS = {
    2014: "UL45_000017167888590000000399",
    2015: "UL45_9999991678885A000000043D",
    2016: "UL45_9999991678885A00000004CB",
    2017: "UL45_9999991678885A0000000620",
    2018: "UL45_9999991678885B00000006D3",
    2019: "UL45_9999991678885C0000000709",
    2022: "UL45_HCH8NDMR2201",
    2023: "UL45_HCH8NDMR2301",
    2024: "UL45_HCH8NDMR2401",
}
EXCLUDED_HISTORY_YEARS = {2020, 2021, 2025, 2026}
CHECKPOINT_SET_A = ["start", "oxberg", "hokberg", "eldris", "mora"]
CHECKPOINT_SET_B = ["start", "lillsjon", "oxberg", "hokberg", "eldris", "mora_warning", "mora"]
CANONICAL_STATUSES = {"FINISHED", "DNF", "DNS", "DSQ", "UNKNOWN"}


def collect_config_issues(config: dict) -> list[str]:
    issues: list[str] = []
    races = {race.get("race_key"): race for race in config.get("races", [])}
    for year, event_code in HISTORY_EVENTS.items():
        key = f"ultravasan45-{year}"
        race = races.get(key)
        if not race:
            issues.append(f"Konfigurationen saknar {key}.")
            continue
        if race.get("race_family") != "uv45":
            issues.append(f"{key} tillhör inte race_family uv45.")
        if race.get("event_code") != event_code:
            issues.append(f"{key} har fel eventkod: {race.get('event_code')!r}.")
        keys = [checkpoint.get("checkpoint_key") for checkpoint in race.get("checkpoints", [])]
        if keys != CHECKPOINT_SET_A:
            issues.append(f"{key} har fel checkpointuppsättning: {keys}.")
        if float(race.get("distance_km") or 0) != 45.0:
            issues.append(f"{key} har inte distansen 45 km.")

    current = races.get("ultravasan45-2025")
    if not current:
        issues.append("Konfigurationen saknar ultravasan45-2025.")
    elif [checkpoint.get("checkpoint_key") for checkpoint in current.get("checkpoints", [])] != CHECKPOINT_SET_B:
        issues.append("ultravasan45-2025 har inte checkpointuppsättning B.")

    configured_uv45_years = {
        int(race.get("year")) for race in races.values()
        if race.get("race_family") == "uv45" and race.get("year") is not None
    }
    forbidden = configured_uv45_years & {2020, 2021, 2026}
    if forbidden:
        issues.append(f"Förbjudna UV45-år finns i konfigurationen: {sorted(forbidden)}.")
    return issues


def uv90_snapshot(conn: sqlite3.Connection) -> dict:
    races = []
    for race in conn.execute("SELECT id,race_key,year,event_code FROM races WHERE race_key LIKE 'ultravasan90-%' ORDER BY race_key"):
        checkpoints = [dict(row) for row in conn.execute(
            "SELECT checkpoint_key,name,sequence_no,distance_km FROM checkpoints WHERE race_id=? ORDER BY sequence_no",
            (race["id"],),
        )]
        results = conn.execute("SELECT COUNT(*) FROM results WHERE race_id=?", (race["id"],)).fetchone()[0]
        splits = conn.execute(
            "SELECT COUNT(*) FROM splits s JOIN results r ON r.id=s.result_id WHERE r.race_id=?",
            (race["id"],),
        ).fetchone()[0]
        races.append({
            "race_key": race["race_key"], "year": race["year"], "event_code": race["event_code"],
            "results": results, "splits": splits, "checkpoints": checkpoints,
        })
    return {"races": races}


def collect_race_issues(conn: sqlite3.Connection, race_key: str, event_code: str) -> list[str]:
    issues: list[str] = []
    race = conn.execute("SELECT * FROM races WHERE race_key=?", (race_key,)).fetchone()
    if not race:
        return [f"Loppet saknas i databasen: {race_key}"]
    if not race_key.startswith("ultravasan45-"):
        issues.append(f"Fel loppfamilj för historikimport: {race_key}.")
    source = conn.execute("SELECT id FROM sources WHERE code='vasaloppet_mika'").fetchone()
    rows = conn.execute(
        "SELECT * FROM results WHERE race_id=? AND source_id=? ORDER BY id",
        (race["id"], source["id"] if source else -1),
    ).fetchall()
    if not rows:
        issues.append(f"Inga Mika-resultat finns för {race_key}.")
        return issues
    expected_prefix = f"{event_code}:"
    if any(not row["source_result_id"].startswith(expected_prefix) for row in rows):
        issues.append(f"{race_key} innehåller resultat från fel eventkod.")
    for row in rows:
        label = f"{race_key} resultat {row['id']} {row['name_as_published']}"
        if row["status"] not in CANONICAL_STATUSES:
            issues.append(f"{label}: status är inte normaliserad ({row['status']}).")
        expected_sex = uvtool.sex_from_age_class(row["age_class"])
        if not row["sex"] and expected_sex:
            issues.append(
                f"{label}: kön saknas trots könsbärande klass {row['age_class']!r}."
            )
        source_nationality = uvtool.nationality_value_in_raw(row["raw_json"])
        if not row["nationality"] and source_nationality:
            issues.append(
                f"{label}: nationalitet saknas trots källvärdet {source_nationality!r}."
            )
        splits = conn.execute("""
            SELECT cp.race_id,cp.checkpoint_key,cp.sequence_no,sp.elapsed_seconds
            FROM splits sp JOIN checkpoints cp ON cp.id=sp.checkpoint_id
            WHERE sp.result_id=? ORDER BY cp.sequence_no
        """, (row["id"],)).fetchall()
        if any(split["race_id"] != race["id"] for split in splits):
            issues.append(f"{label}: mellantid är kopplad till ett annat lopp.")
        keys = [split["checkpoint_key"] for split in splits]
        if any(key not in CHECKPOINT_SET_A for key in keys):
            issues.append(f"{label}: oväntad UV45-kontroll {keys}.")
        sequences = [split["sequence_no"] for split in splits]
        if any(a >= b for a, b in zip(sequences, sequences[1:])):
            issues.append(f"{label}: checkpointordningen är inte strikt stigande.")
        elapsed = [split["elapsed_seconds"] for split in splits if split["elapsed_seconds"] is not None]
        if any(a >= b for a, b in zip(elapsed, elapsed[1:])):
            issues.append(f"{label}: mellantiderna är inte strikt stigande.")
        if row["status"] == "FINISHED":
            mora = next((split for split in splits if split["checkpoint_key"] == "mora"), None)
            if not row["finish_seconds"] or not mora or mora["elapsed_seconds"] != row["finish_seconds"]:
                issues.append(f"{label}: sluttid och Mål stämmer inte överens.")
    if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        issues.append("SQLite integrity_check misslyckades.")
    return issues


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=uvtool.DEFAULT_DB)
    parser.add_argument("--config", type=Path, default=uvtool.DEFAULT_CONFIG)
    parser.add_argument("--config-only", action="store_true")
    parser.add_argument("--race")
    parser.add_argument("--event-code")
    parser.add_argument("--write-uv90-snapshot", type=Path)
    parser.add_argument("--compare-uv90-snapshot", type=Path)
    args = parser.parse_args()

    issues = collect_config_issues(uvtool.load_config(args.config))
    snapshot = None
    if not args.config_only or args.write_uv90_snapshot or args.compare_uv90_snapshot or args.race:
        conn = uvtool.connect(args.db)
        snapshot = uv90_snapshot(conn)
        if args.race:
            if not args.event_code:
                parser.error("--event-code krävs tillsammans med --race")
            issues.extend(collect_race_issues(conn, args.race, args.event_code))
        conn.close()
    if args.write_uv90_snapshot:
        args.write_uv90_snapshot.parent.mkdir(parents=True, exist_ok=True)
        args.write_uv90_snapshot.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.compare_uv90_snapshot:
        expected = json.loads(args.compare_uv90_snapshot.read_text(encoding="utf-8"))
        if snapshot != expected:
            issues.append("UV90-resultat eller UV90-kontroller har förändrats under UV45-importen.")
    print(json.dumps({"blocking_problems": len(issues), "problems": issues}, ensure_ascii=False, indent=2))
    if issues:
        raise SystemExit("UV45-historikvalideringen blockerar fortsatt import.")


if __name__ == "__main__":
    main()
