#!/usr/bin/env python3
"""Separate conflicting same-source performances that share an athlete in one race."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any

import uvtool


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "ultravasan.sqlite"
DEFAULT_REPORT = ROOT / "reports" / "uv45-same-name-collisions-repair.json"


def table_counts(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in ("results", "athletes", "athlete_external_ids", "splits")
    }


def digest_rows(conn: sqlite3.Connection, query: str, params: tuple[Any, ...] = ()) -> str:
    digest = hashlib.sha256()
    for row in conn.execute(query, params):
        digest.update(json.dumps(list(row), ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def logical_digests(conn: sqlite3.Connection, collision_result_ids: set[int]) -> dict[str, str]:
    placeholders = ",".join("?" for _ in collision_result_ids) or "NULL"
    collision_params = tuple(sorted(collision_result_ids))
    return {
        "uv90_results": digest_rows(conn, """
            SELECT res.* FROM results res JOIN races race ON race.id=res.race_id
            WHERE race.race_key LIKE 'ultravasan90-%' ORDER BY res.id
        """),
        "uv90_splits": digest_rows(conn, """
            SELECT sp.* FROM splits sp JOIN results res ON res.id=sp.result_id
            JOIN races race ON race.id=res.race_id
            WHERE race.race_key LIKE 'ultravasan90-%' ORDER BY sp.id
        """),
        "unaffected_uv45_results": digest_rows(conn, f"""
            SELECT res.* FROM results res JOIN races race ON race.id=res.race_id
            WHERE race.race_key LIKE 'ultravasan45-%' AND res.id NOT IN ({placeholders}) ORDER BY res.id
        """, collision_params),
        "unaffected_uv45_splits": digest_rows(conn, f"""
            SELECT sp.* FROM splits sp JOIN results res ON res.id=sp.result_id
            JOIN races race ON race.id=res.race_id
            WHERE race.race_key LIKE 'ultravasan45-%' AND res.id NOT IN ({placeholders}) ORDER BY sp.id
        """, collision_params),
    }


def create_separate_athlete(
    conn: sqlite3.Connection,
    collision: dict[str, Any],
    result: dict[str, Any],
) -> int:
    original = conn.execute("SELECT * FROM athletes WHERE id=?", (collision["athlete_id"],)).fetchone()
    if original is None:
        raise RuntimeError(f"Athlete {collision['athlete_id']} saknas")
    cursor = conn.execute("""
        INSERT INTO athletes(
          canonical_name,normalized_name,sex,birth_year,nationality,city,country,athlete_match_status
        ) VALUES(?,?,?,?,?,?,?,?)
    """, (
        result["name_as_published"] or original["canonical_name"],
        uvtool.normalize(result["name_as_published"] or original["canonical_name"]),
        conn.execute("SELECT sex FROM results WHERE id=?", (result["result_id"],)).fetchone()[0] or original["sex"],
        conn.execute("SELECT birth_year FROM results WHERE id=?", (result["result_id"],)).fetchone()[0] or original["birth_year"],
        conn.execute("SELECT nationality FROM results WHERE id=?", (result["result_id"],)).fetchone()[0] or original["nationality"],
        conn.execute("SELECT city FROM results WHERE id=?", (result["result_id"],)).fetchone()[0] or original["city"],
        original["country"],
        "source-id",
    ))
    return cursor.lastrowid


def repair(conn: sqlite3.Connection, collisions: list[dict[str, Any]], apply: bool) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for collision in collisions:
        if collision["source_id"] is None:
            raise RuntimeError(
                f"{collision['race_key']} athlete_id={collision['athlete_id']} har motstridiga källor "
                f"{collision['source_codes']} och kräver manuell granskning"
            )
        ordered = sorted(
            collision["results"],
            key=lambda row: (
                row["external_link_id"] is None,
                row["external_link_id"] if row["external_link_id"] is not None else row["result_id"],
                row["result_id"],
            ),
        )
        keeper = ordered[0]
        for result in ordered[1:]:
            action = {
                "race_key": collision["race_key"],
                "year": collision["year"],
                "old_athlete_id": collision["athlete_id"],
                "keeper_result_id": keeper["result_id"],
                "moved_result_id": result["result_id"],
                "source_code": result["source_code"],
                "source_result_id": result["source_result_id"],
                "bib": result["bib"],
                "name": result["name_as_published"],
                "split_count": result["split_count"],
                "new_athlete_id": None,
            }
            if apply:
                if result["external_link_id"] is None:
                    raise RuntimeError(
                        f"Extern identitetslänk saknas för result_id={result['result_id']} "
                        f"source_result_id={result['source_result_id']}"
                    )
                new_athlete_id = create_separate_athlete(conn, collision, result)
                conn.execute("UPDATE results SET athlete_id=? WHERE id=?", (new_athlete_id, result["result_id"]))
                updated = conn.execute("""
                    UPDATE athlete_external_ids SET athlete_id=?
                    WHERE id=? AND athlete_id=? AND source_id=? AND external_id=?
                """, (
                    new_athlete_id,
                    result["external_link_id"],
                    collision["athlete_id"],
                    collision["source_id"],
                    result["source_result_id"],
                )).rowcount
                if updated != 1:
                    raise RuntimeError(f"Kunde inte flytta extern identitet för result_id={result['result_id']}")
                action["new_athlete_id"] = new_athlete_id
            actions.append(action)
    return actions


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# UV45 same-name collision repair",
        "",
        f"- Mode: {'apply' if report['applied'] else 'dry-run'}",
        f"- Collision groups before: {report['collision_groups_before']}",
        f"- Collision groups after: {report['collision_groups_after']}",
        f"- Results moved: {report['results_moved']}",
        f"- Athletes created: {report['athletes_created']}",
        f"- Splits retained on moved results: {report['splits_on_moved_results']}",
        "",
        "## Collision groups before",
        "",
    ]
    for index, collision in enumerate(report["collisions_before"], 1):
        lines.append(
            f"### {index}. {collision['year']} · {collision['race_key']} · athlete {collision['athlete_id']} · {collision['canonical_name']}"
        )
        lines.append("")
        lines.append("| result_id | bib | class | status | finish | place | source_result_id | splits |")
        lines.append("|---:|---|---|---|---:|---:|---|---:|")
        for result in collision["results"]:
            lines.append(
                f"| {result['result_id']} | {result['bib'] or '–'} | {result['age_class'] or '–'} | "
                f"{result['status']} | {result['finish_seconds'] if result['finish_seconds'] is not None else '–'} | "
                f"{result['overall_place'] if result['overall_place'] is not None else '–'} | "
                f"{result['source_result_id']} | {result['split_count']} |"
            )
        lines.append("")
    return "\n".join(lines) + "\n"


def run(args: argparse.Namespace) -> dict[str, Any]:
    conn = uvtool.connect(args.db)
    collisions = uvtool.collect_same_race_identity_collisions(conn)
    if args.expect is not None and len(collisions) != args.expect:
        conn.close()
        raise SystemExit(f"Förväntade {args.expect} kollisionsgrupper, hittade {len(collisions)}")
    collision_result_ids = {
        result["result_id"] for collision in collisions for result in collision["results"]
    }
    counts_before = table_counts(conn)
    digests_before = logical_digests(conn, collision_result_ids)
    if args.apply:
        with conn:
            actions = repair(conn, collisions, True)
            remaining = uvtool.collect_same_race_identity_collisions(conn)
            if remaining:
                raise RuntimeError(uvtool.format_identity_collision_error(remaining))
    else:
        actions = repair(conn, collisions, False)
    collisions_after = uvtool.collect_same_race_identity_collisions(conn)
    counts_after = table_counts(conn)
    digests_after = logical_digests(conn, collision_result_ids)
    resolved_db = args.db.resolve()
    try:
        database_reference = str(resolved_db.relative_to(ROOT.resolve()))
    except ValueError:
        database_reference = str(resolved_db)
    report = {
        "database": database_reference,
        "applied": bool(args.apply),
        "collision_groups_before": len(collisions),
        "collision_groups_after": len(collisions_after),
        "collisions_before": collisions,
        "actions": actions,
        "results_moved": len(actions),
        "athletes_created": counts_after["athletes"] - counts_before["athletes"],
        "splits_on_moved_results": sum(action["split_count"] for action in actions),
        "counts_before": counts_before,
        "counts_after": counts_after,
        "logical_digests_before": digests_before,
        "logical_digests_after": digests_after,
        "uv90_unchanged": digests_before["uv90_results"] == digests_after["uv90_results"]
        and digests_before["uv90_splits"] == digests_after["uv90_splits"],
        "unaffected_uv45_unchanged": digests_before["unaffected_uv45_results"]
        == digests_after["unaffected_uv45_results"]
        and digests_before["unaffected_uv45_splits"] == digests_after["unaffected_uv45_splits"],
    }
    conn.close()
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        args.report.with_suffix(".md").write_text(markdown_report(report), encoding="utf-8")
    print(json.dumps({key: report[key] for key in (
        "applied", "collision_groups_before", "collision_groups_after", "results_moved",
        "athletes_created", "splits_on_moved_results", "counts_before", "counts_after",
        "uv90_unchanged", "unaffected_uv45_unchanged",
    )}, ensure_ascii=False, indent=2))
    return report


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", type=Path, default=DEFAULT_DB)
    p.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    p.add_argument("--expect", type=int)
    p.add_argument("--apply", action="store_true")
    return p


if __name__ == "__main__":
    run(parser().parse_args())
