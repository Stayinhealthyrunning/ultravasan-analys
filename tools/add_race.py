#!/usr/bin/env python3
"""Register one explicit, planned RaceEdition without inventing source data.

Activation is deliberately separate: an edition remains ``planned`` until its
provider-specific SourceBinding has been reviewed and added to races.json.
"""
from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import date
from pathlib import Path

try:
    from . import source_bindings
except ImportError:
    import source_bindings


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config" / "races.json"
DEFAULT_COURSES = ROOT / "config" / "course_versions.json"


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Registrera en planerad, explicit RaceEdition")
    p.add_argument("--race-key", required=True)
    p.add_argument("--family", required=True)
    p.add_argument("--year", type=int, required=True)
    p.add_argument("--race-date", required=True, help="YYYY-MM-DD")
    p.add_argument("--name", required=True)
    p.add_argument("--course-version-id", required=True)
    p.add_argument("--competition-profile", required=True)
    p.add_argument("--medal-profile")
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    p.add_argument("--course-config", type=Path, default=DEFAULT_COURSES)
    p.add_argument("--replace", action="store_true")
    return p


def planned_edition(args: argparse.Namespace, config: dict, courses: dict) -> dict:
    try:
        race_date = date.fromisoformat(args.race_date)
    except ValueError as error:
        raise source_bindings.SourceBindingError("race-date must use YYYY-MM-DD") from error
    if race_date.year != args.year:
        raise source_bindings.SourceBindingError("race-date year must match edition year")
    if args.family not in config.get("race_families", {}):
        raise source_bindings.SourceBindingError(f"Unknown race family {args.family!r}")
    course = courses.get("courses", {}).get(args.course_version_id)
    if not course:
        raise source_bindings.SourceBindingError(f"Unknown CourseVersion {args.course_version_id!r}")
    if course.get("event_key") != config.get("event", {}).get("event_key"):
        raise source_bindings.SourceBindingError("CourseVersion belongs to another event")
    if course.get("race_family") != args.family:
        raise source_bindings.SourceBindingError("CourseVersion belongs to another race family")
    checkpoints = deepcopy(course.get("checkpoint_catalog") or [])
    if not checkpoints or checkpoints[0].get("distance_km") != 0:
        raise source_bindings.SourceBindingError("CourseVersion has no complete checkpoint catalog")
    return {
        "race_key": args.race_key,
        "event_key": config["event"]["event_key"],
        "race_family": args.family,
        "name": args.name,
        "year": args.year,
        "race_date": args.race_date,
        "data_status": "planned",
        "competition_profile": args.competition_profile,
        "distance_km": checkpoints[-1]["distance_km"],
        "course_version": args.course_version_id,
        "course_version_id": args.course_version_id,
        "medal_profile": args.medal_profile,
        "source_bindings": [],
        "checkpoints": checkpoints,
    }


def main() -> None:
    args = parser().parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    courses = json.loads(args.course_config.read_text(encoding="utf-8"))
    source_bindings.validate_config(config)
    races = config["races"]
    existing = next((race for race in races if race.get("race_key") == args.race_key), None)
    if existing and not args.replace:
        raise SystemExit(f"{args.race_key} already exists; use --replace only for a planned edition")
    if existing and existing.get("data_status") != "planned":
        raise SystemExit(f"Refusing to replace available RaceEdition {args.race_key}")
    edition = planned_edition(args, config, courses)
    if existing:
        races[races.index(existing)] = edition
    else:
        races.append(edition)
    source_bindings.validate_config(config)
    args.config.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Registered planned RaceEdition {args.race_key}; add and review SourceBinding before activation")


if __name__ == "__main__":
    main()
