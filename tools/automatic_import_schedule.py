#!/usr/bin/env python3
"""Decide whether the daily official-results workflow may use the network.

This module intentionally uses only the standard library so the date gate can
run before dependency installation. It never imports, writes, or publishes.
"""
from __future__ import annotations

import argparse
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

FIRST_AUTOMATIC_YEAR = 2026
MIN_RESULTS = {"uv90": 1200, "uv45": 500}


def publication_date(year: int) -> date:
    # 2026 was approved for the earlier launch; later editions use Aug 22.
    return date(year, 8, 16) if year == 2026 else date(year, 8, 22)


def year_is_complete(db_path: Path, year: int) -> bool:
    if not db_path.exists():
        return False
    with sqlite3.connect(db_path) as conn:
        for family, minimum in MIN_RESULTS.items():
            race_key = f"ultravasan{family[-2:]}-{year}"
            count = conn.execute(
                """SELECT COUNT(*) FROM results res
                   JOIN races race ON race.id=res.race_id
                   JOIN sources source ON source.id=res.source_id
                   WHERE race.race_key=? AND source.code='vasaloppet_mika'""",
                (race_key,),
            ).fetchone()[0]
            if count < minimum:
                return False
    return True


def schedule_decision(today: date, db_path: Path) -> dict[str, object]:
    candidate = today.year if today >= publication_date(today.year) else today.year - 1
    if candidate < FIRST_AUTOMATIC_YEAR:
        return {"active": False, "state": "before-window", "target_year": candidate,
                "reason": "The annual official-results window has not opened yet."}
    if year_is_complete(db_path, candidate):
        return {"active": False, "state": "already-complete", "target_year": candidate,
                "reason": f"Official Ultravasan {candidate} results already passed the published-data gate; no network request is needed."}
    if today < publication_date(candidate):
        return {"active": False, "state": "before-window", "target_year": candidate,
                "reason": f"Before {publication_date(candidate).isoformat()}: no official import or publication is allowed."}
    return {"active": True, "state": "active", "target_year": candidate,
            "reason": f"Official Ultravasan {candidate} availability may be checked."}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--today")
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args()
    today = date.fromisoformat(args.today) if args.today else datetime.now(timezone.utc).date()
    decision = {"date_utc": today.isoformat(), **schedule_decision(today, args.db)}
    for key, value in decision.items():
        print(f"{key}={str(value).lower() if isinstance(value, bool) else value}")
    if args.github_output:
        args.github_output.parent.mkdir(parents=True, exist_ok=True)
        with args.github_output.open("a", encoding="utf-8") as handle:
            for key, value in decision.items():
                handle.write(f"{key}={str(value).lower() if isinstance(value, bool) else value}\n")


if __name__ == "__main__":
    main()
