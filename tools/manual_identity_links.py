#!/usr/bin/env python3
"""Validate and publish administrator-verified cross-edition identity links."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config" / "manual_identity_links.json"
DEFAULT_DB = ROOT / "data" / "ultravasan.sqlite"
DEFAULT_JS = ROOT / "docs" / "data" / "manual-identity-links.js"


def load_registry(path: Path = DEFAULT_CONFIG) -> dict:
    registry = json.loads(path.read_text(encoding="utf-8"))
    if registry.get("schema_version") != 1:
        raise ValueError("manual identity registry must use schema_version=1")
    if not isinstance(registry.get("links"), list):
        raise ValueError("manual identity registry links must be a list")
    return registry


def render_js(registry: dict) -> str:
    return "window.ULTRAVASAN_MANUAL_IDENTITY_LINKS = " + json.dumps(
        registry, ensure_ascii=False, indent=2
    ) + ";\n"


def validate_registry(conn: sqlite3.Connection, registry: dict) -> list[dict]:
    conn.row_factory = sqlite3.Row
    seen_selectors: dict[tuple[str, str], str] = {}
    summaries: list[dict] = []
    for link in registry["links"]:
        link_id = str(link.get("link_id") or "").strip()
        person_key = str(link.get("person_key") or "").strip()
        if not link_id or not person_key:
            raise ValueError("each manual identity link requires link_id and person_key")
        members = link.get("members")
        if not isinstance(members, list) or len(members) < 2:
            raise ValueError(f"{link_id}: at least two members are required")

        rows = []
        for member in members:
            race_key = str(member.get("race_key") or "").strip()
            source_result_id = str(member.get("source_result_id") or "").strip()
            if not race_key or not source_result_id:
                raise ValueError(f"{link_id}: member requires race_key and source_result_id")
            selector = (race_key, source_result_id)
            previous = seen_selectors.get(selector)
            if previous and previous != link_id:
                raise ValueError(f"{selector}: selector appears in both {previous} and {link_id}")
            seen_selectors[selector] = link_id
            found = conn.execute(
                """
                SELECT r.id result_id,e.race_key,e.year,r.source_result_id,r.name_as_published,
                       r.sex,r.status,r.athlete_id,a.person_key,a.athlete_match_status
                FROM results r
                JOIN races e ON e.id=r.race_id
                JOIN athletes a ON a.id=r.athlete_id
                WHERE e.race_key=? AND r.source_result_id=?
                """,
                selector,
            ).fetchall()
            if len(found) != 1:
                raise ValueError(f"{link_id}: selector {selector} matched {len(found)} rows, expected 1")
            rows.append(dict(found[0]))

        existing_keys = {str(row["person_key"]).strip() for row in rows if row["person_key"]}
        if existing_keys - {person_key}:
            raise ValueError(
                f"{link_id}: existing verified person key conflicts with configured {person_key}: "
                + ", ".join(sorted(existing_keys))
            )
        if person_key not in existing_keys:
            raise ValueError(
                f"{link_id}: configured person_key is not already verified on any linked source row"
            )
        sexes = {str(row["sex"]).strip().upper() for row in rows if row["sex"]}
        if len(sexes) > 1:
            raise ValueError(f"{link_id}: linked rows have conflicting known sex values")

        summaries.append(
            {
                "link_id": link_id,
                "person_key": person_key,
                "members": len(rows),
                "years": [row["year"] for row in rows],
                "statuses": [row["status"] for row in rows],
                "previously_unlinked": sum(1 for row in rows if not row["person_key"]),
            }
        )
    return summaries


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--js-output", type=Path, default=DEFAULT_JS)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    registry = load_registry(args.config)
    conn = sqlite3.connect(args.db)
    try:
        summaries = validate_registry(conn, registry)
    finally:
        conn.close()

    expected = render_js(registry)
    if args.write:
        args.js_output.parent.mkdir(parents=True, exist_ok=True)
        args.js_output.write_text(expected, encoding="utf-8")
    if args.check:
        actual = args.js_output.read_text(encoding="utf-8") if args.js_output.exists() else ""
        if actual != expected:
            raise SystemExit(
                "docs/data/manual-identity-links.js is stale; run "
                "python tools/manual_identity_links.py --write"
            )

    print(json.dumps({"status": "ok", "links": summaries}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
