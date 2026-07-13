#!/usr/bin/env python3
"""Block full Mika imports unless the preceding limited probe is internally sound."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import uvtool


ROOT = Path(__file__).resolve().parents[1]


def collect_blockers(conn: sqlite3.Connection, config: dict, race_key: str, report: dict) -> list[str]:
    blockers: list[str] = []
    if report.get("status") != "probe-complete":
        blockers.append("Probe-rapporten saknar status probe-complete.")
    records = int(report.get("records") or 0)
    if not 1 <= records <= 10:
        blockers.append(f"Probe måste omfatta 1–10 löpare, inte {records}.")
    if int(report.get("warnings") or 0):
        blockers.append(f"Probe rapporterade {report.get('warnings')} varningar.")

    race = conn.execute("SELECT * FROM races WHERE race_key=?", (race_key,)).fetchone()
    race_cfg = next((item for item in config.get("races", []) if item.get("race_key") == race_key), None)
    if not race or not race_cfg:
        return blockers + [f"Loppet saknas i databas eller konfiguration: {race_key}"]

    results = conn.execute("SELECT * FROM results WHERE race_id=? ORDER BY id", (race["id"],)).fetchall()
    if len(results) != records:
        blockers.append(f"Databasen har {len(results)} probe-resultat men rapporten anger {records}.")
    expected_prefix = f"{race_cfg.get('event_code')}:"
    source_ids = [row["source_result_id"] for row in results]
    if len(source_ids) != len(set(source_ids)):
        blockers.append("Proben innehåller duplicerade deltagar-ID:n.")
    if expected_prefix != "None:" and any(not value.startswith(expected_prefix) for value in source_ids):
        blockers.append("Minst ett deltagar-ID tillhör fel eventkod.")

    canonical_statuses = {"FINISHED", "DNF", "DNS", "DSQ", "UNKNOWN"}
    for result in results:
        label = f"Resultat {result['id']} {result['name_as_published']}"
        if result["status"] not in canonical_statuses:
            blockers.append(f"{label}: status är inte normaliserad ({result['status']}).")
        if not result["sex"]:
            blockers.append(f"{label}: kön saknas.")
        if not result["nationality"]:
            blockers.append(f"{label}: nationalitet saknas.")
        splits = conn.execute("""
            SELECT cp.checkpoint_key,cp.sequence_no,cp.distance_km,sp.elapsed_seconds
            FROM splits sp JOIN checkpoints cp ON cp.id=sp.checkpoint_id
            WHERE sp.result_id=? ORDER BY cp.sequence_no
        """, (result["id"],)).fetchall()
        sequences = [row["sequence_no"] for row in splits]
        if any(current >= following for current, following in zip(sequences, sequences[1:])):
            blockers.append(f"{label}: checkpointordningen är inte strikt stigande.")
        elapsed = [row["elapsed_seconds"] for row in splits if row["elapsed_seconds"] is not None]
        if any(current >= following for current, following in zip(elapsed, elapsed[1:])):
            blockers.append(f"{label}: mellantiderna är inte strikt stigande.")
        if result["status"] == "FINISHED":
            mora = next((row for row in splits if row["checkpoint_key"] == "mora"), None)
            if not result["finish_seconds"]:
                blockers.append(f"{label}: målgångare saknar sluttid.")
            if not mora or mora["elapsed_seconds"] != result["finish_seconds"]:
                blockers.append(f"{label}: Mora-passagen motsvarar inte officiell sluttid.")
            if not mora or abs(float(mora["distance_km"] or 0) - 45.0) > 0.001:
                blockers.append(f"{label}: Mora är inte kopplad till 45 km.")

    cross_race = conn.execute("""
        SELECT COUNT(*) FROM splits sp
        JOIN results r ON r.id=sp.result_id
        JOIN checkpoints cp ON cp.id=sp.checkpoint_id
        WHERE r.race_id<>cp.race_id
    """).fetchone()[0]
    if cross_race:
        blockers.append(f"{cross_race} mellantider är kopplade till kontroller från annat lopp.")
    if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        blockers.append("SQLite integrity_check misslyckades.")
    blockers.extend(uvtool.collect_validation_issues(conn, config))
    return blockers


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--race", required=True)
    parser.add_argument("--db", type=Path, default=uvtool.DEFAULT_DB)
    parser.add_argument("--config", type=Path, default=uvtool.DEFAULT_CONFIG)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report_path = args.report or ROOT / "reports" / f"{args.race}-probe.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    conn = uvtool.connect(args.db)
    blockers = collect_blockers(conn, uvtool.load_config(args.config), args.race, report)
    conn.close()
    print(json.dumps({"race": args.race, "blocking_problems": len(blockers), "problems": blockers}, ensure_ascii=False, indent=2))
    if blockers:
        raise SystemExit("Probe-valideringen blockerar full import.")


if __name__ == "__main__":
    main()
