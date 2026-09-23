#!/usr/bin/env python3
"""Verify that discovery contains one edition's explicit Mika SourceBinding.

This command is read-only: discovery confirms an already reviewed binding and
never assigns edition identity or updates configuration.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from . import source_bindings
except ImportError:
    import source_bindings

ROOT = Path(__file__).resolve().parents[1]
def select_discovered_event(race_key: str, race: dict, discovered: list[dict]) -> dict:
    """Verify the exact configured event; discovery never assigns identity."""
    event_code = race.get("event_code")
    path_year = race.get("result_year_path")
    if not event_code or not isinstance(path_year, int):
        raise SystemExit(f"{race_key} saknar explicit Mika-bindning.")
    matches = [item for item in discovered
               if item.get("event_code") == event_code
               and item.get("result_year_path") == path_year
               and item.get("year") == race.get("year")]
    if len(matches) != 1:
        raise SystemExit(
            f"Exakt konfigurerad Mika-källa för {race_key} hittades inte entydigt."
        )
    return matches[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--race", required=True)
    parser.add_argument("--config", type=Path, default=ROOT / "config" / "races.json")
    parser.add_argument("--report", type=Path, default=ROOT / "reports" / "discovered-ultravasan-events.json")
    args = parser.parse_args()

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    try:
        race = source_bindings.provider_race_config(cfg, args.race, "mika")
    except source_bindings.SourceBindingError as error:
        raise SystemExit(str(error)) from error

    discovered = json.loads(args.report.read_text(encoding="utf-8"))
    selected = select_discovered_event(args.race, race, discovered)
    event = selected["event_code"]
    print(json.dumps({"race": args.race, "event_code": event, "label": selected.get("label"),
                      "result_year_path": race["result_year_path"], "verified": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
