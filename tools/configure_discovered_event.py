#!/usr/bin/env python3
"""Apply a discovered Mika event code to one configured Ultravasan race.

Reads reports/discovered-ultravasan-events.json, selects the best matching event
for the requested race family and race year, and updates config/races.json.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERIFIED_EVENT_CODES = {
    "ultravasan45-2025": "UL45_HCH8NDMR2501",
}


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def select_discovered_event(race_key: str, race: dict, discovered: list[dict]) -> dict:
    """Select one main-race event deterministically, preferring verified codes."""
    wanted_distance = "45" if "45" in race_key or "45" in str(race.get("name")) else "90"
    wanted_year = int(race.get("year") or 0)
    verified_code = VERIFIED_EVENT_CODES.get(race_key)
    candidates: list[tuple[tuple[int, int, str], dict]] = []
    for item in discovered:
        label = norm(str(item.get("label") or ""))
        event_code = str(item.get("event_code") or "")
        is_elite = "elit" in label or "elite" in label or event_code.startswith(("UL4E_", "UL9E_"))
        if "ultravasan" not in label or wanted_distance not in label or is_elite:
            continue
        score = 0
        if event_code == verified_code:
            score += 10_000
        if int(item.get("year") or 0) == wanted_year:
            score += 100
        if re.search(rf"\b{wanted_distance}\b", label):
            score += 50
        if str(wanted_year) in label:
            score += 25
        if re.search(rf"^UL{wanted_distance}_HCH8NDMR{wanted_year % 100:02d}\d{{2}}$", event_code):
            score += 500
        if "999999" in event_code:
            score -= 25
        path_year = int(item.get("result_year_path") or 0)
        candidates.append(((score, path_year, event_code), item))
    if not candidates:
        raise SystemExit(f"Ingen eventkod hittades för {race.get('name')} {wanted_year}.")
    return max(candidates, key=lambda candidate: candidate[0])[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--race", required=True)
    parser.add_argument("--config", type=Path, default=ROOT / "config" / "races.json")
    parser.add_argument("--report", type=Path, default=ROOT / "reports" / "discovered-ultravasan-events.json")
    args = parser.parse_args()

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    race = next((r for r in cfg.get("races", []) if r.get("race_key") == args.race), None)
    if not race:
        raise SystemExit(f"Loppet saknas i konfigurationen: {args.race}")

    discovered = json.loads(args.report.read_text(encoding="utf-8"))
    wanted_year = int(race.get("year") or 0)
    selected = select_discovered_event(args.race, race, discovered)
    event = selected["event_code"]
    selected_path_year = int(selected.get("result_year_path") or wanted_year)
    path_year = max(int(race.get("result_year_path") or 0), selected_path_year) if event == VERIFIED_EVENT_CODES.get(args.race) else selected_path_year
    base = f"https://results.vasaloppet.se/{path_year}/"
    race.update({
        "event_code": event,
        "result_year_path": path_year,
        "official_url": f"{base}?pid=search&event={event}",
        "page_url_template": f"{base}?page={{page}}&event={event}&pid=search",
        "detail_url_template": f"{base}?content=detail&fpid=search&pid=search&idp={{idp}}&lang=SE&event={event}",
        "page_url_templates": [
            f"{base}?page={{page}}&event={event}&num_results=100&pid=search",
            f"{base}?page={{page}}&event={event}&num_results=100&pid=list",
        ],
    })
    args.config.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"race": args.race, "event_code": event, "label": selected.get("label"), "result_year_path": path_year}, ensure_ascii=False))


if __name__ == "__main__":
    main()
