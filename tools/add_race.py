#!/usr/bin/env python3
"""Add or update one Ultravasan year in config/races.json.

Designed for GitHub Actions so a new race can be registered from a web form
without editing JSON or running anything locally.
"""
from __future__ import annotations

import argparse
import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config" / "races.json"


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Lägg till en Ultravasan-upplaga")
    p.add_argument("--year", type=int, required=True)
    p.add_argument("--race-date", required=True, help="YYYY-MM-DD")
    p.add_argument("--event-code", required=True)
    p.add_argument("--result-year-path", type=int, required=True, help="Årtalet i results.vasaloppet.se/ÅR/")
    p.add_argument("--distance-km", type=float, default=92.0)
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    p.add_argument("--replace", action="store_true")
    return p


def main() -> None:
    args = parser().parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    races = config.setdefault("races", [])
    race_key = f"ultravasan90-{args.year}"
    existing = next((r for r in races if r.get("race_key") == race_key), None)
    if existing and not args.replace:
        raise SystemExit(f"{race_key} finns redan. Välj ersätt i arbetsflödet för att uppdatera posten.")

    if races:
        checkpoints = deepcopy(sorted(races, key=lambda r: r.get("year", 0))[-1].get("checkpoints", []))
    else:
        checkpoints = [
            {"checkpoint_key": "start", "name": "Start Sälen", "sequence_no": 0, "distance_km": 0.0},
            {"checkpoint_key": "smagan", "name": "Smågan", "sequence_no": 1, "distance_km": 9.2},
            {"checkpoint_key": "mangsbodarna", "name": "Mångsbodarna", "sequence_no": 2, "distance_km": 23.7},
            {"checkpoint_key": "risberg", "name": "Risberg", "sequence_no": 3, "distance_km": 35.0},
            {"checkpoint_key": "evertsberg", "name": "Evertsberg", "sequence_no": 4, "distance_km": 47.1},
            {"checkpoint_key": "oxberg", "name": "Oxberg", "sequence_no": 5, "distance_km": 62.2},
            {"checkpoint_key": "hokberg", "name": "Hökberg", "sequence_no": 6, "distance_km": 71.4},
            {"checkpoint_key": "eldris", "name": "Eldris", "sequence_no": 7, "distance_km": 82.8},
            {"checkpoint_key": "mora", "name": "Mora mål", "sequence_no": 8, "distance_km": args.distance_km},
        ]
    for cp in checkpoints:
        if cp.get("checkpoint_key") == "mora":
            cp["distance_km"] = args.distance_km

    base = f"https://results.vasaloppet.se/{args.result_year_path}/"
    event = args.event_code.strip()
    race = {
        "race_key": race_key,
        "name": "Ultravasan 90",
        "year": args.year,
        "race_date": args.race_date,
        "distance_km": args.distance_km,
        "event_code": event,
        "result_year_path": args.result_year_path,
        "official_url": f"{base}?pid=search&event={event}",
        "page_url_template": f"{base}?page={{page}}&event={event}&num_results=100&pid=search",
        "page_url_templates": [
            f"{base}?page={{page}}&event={event}&num_results=100&pid=search",
            f"{base}?page={{page}}&event={event}&num_results=100&pid=list",
        ],
        "detail_url_template": f"{base}?content=detail&fpid=search&pid=search&idp={{idp}}&lang=SE&event={event}",
        "max_pages": 250,
        "empty_pages_to_stop": 2,
        "course_version": "post2023" if args.year >= 2023 else "pre2023",
        "checkpoints": checkpoints,
    }

    if existing:
        races[races.index(existing)] = race
    else:
        races.append(race)
    races.sort(key=lambda r: r.get("year", 0))
    args.config.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Sparade {race_key} i {args.config}")


if __name__ == "__main__":
    main()
