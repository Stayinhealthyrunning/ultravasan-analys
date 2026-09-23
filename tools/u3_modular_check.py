#!/usr/bin/env python3
"""Validate U3 modular web-data parity against the legacy monolith."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(root: Path) -> dict[str, Any]:
    monolith = read_json(root / "ultravasan.json")
    bootstrap = read_json(root / "bootstrap.json")
    history = read_json(root / "history-index.json")
    manifest = read_json(root / "manifest.json")

    issues: list[str] = []
    if bootstrap.get("meta", {}).get("data_contract") != "u3-modular-v1":
        issues.append("bootstrap data_contract is not u3-modular-v1")
    if monolith.get("meta", {}).get("data_contract") != "u3-modular-v1":
        issues.append("monolith data_contract is not u3-modular-v1")
    if history.get("identity_contract") != "u2-person-key-v1":
        issues.append("history identity contract changed")
    if bootstrap.get("races") != monolith.get("races"):
        issues.append("bootstrap races differ from monolith")
    if bootstrap.get("checkpoints") != monolith.get("checkpoints"):
        issues.append("bootstrap checkpoints differ from monolith")
    if bootstrap.get("stats") != monolith.get("stats"):
        issues.append("bootstrap stats differ from monolith")
    if bootstrap.get("sources") != monolith.get("sources"):
        issues.append("bootstrap sources differ from monolith")
    if history.get("results") != monolith.get("results"):
        issues.append("history index results differ from monolith")

    results = history.get("results", [])
    result_races = {row["id"]: row["race_id"] for row in results}
    edition_meta = bootstrap.get("meta", {}).get("modular_data", {}).get("editions", {})
    if len(edition_meta) != len(bootstrap.get("races", [])):
        issues.append(
            f"edition manifest has {len(edition_meta)} entries for {len(bootstrap.get('races', []))} races"
        )

    combined_splits: list[dict[str, Any]] = []
    edition_sizes: dict[str, int] = {}
    for race in bootstrap.get("races", []):
        race_id = int(race["id"])
        entry = edition_meta.get(str(race_id))
        if not entry:
            issues.append(f"missing edition manifest for race {race_id}")
            continue
        json_path = root.parent / entry["json"].removeprefix("data/")
        if not json_path.is_file():
            issues.append(f"missing edition file {json_path}")
            continue
        bundle = read_json(json_path)
        if int(bundle.get("race_id", -1)) != race_id:
            issues.append(f"edition file {json_path.name} has wrong race_id")
        if bundle.get("race_key") != race.get("race_key"):
            issues.append(f"edition file {json_path.name} has wrong race_key")
        rows = bundle.get("splits", [])
        if len(rows) != int(entry.get("splits", -1)):
            issues.append(f"edition split count mismatch for {race['race_key']}")
        bad = [
            row for row in rows
            if int(result_races.get(row.get("result_id"), -1)) != race_id
        ]
        if bad:
            issues.append(f"{race['race_key']} contains {len(bad)} splits from another edition")
        combined_splits.extend(rows)
        edition_sizes[race["race_key"]] = json_path.stat().st_size

    if combined_splits != monolith.get("splits", []):
        issues.append("concatenated edition splits differ from monolith")

    bootstrap_bytes = (root / "bootstrap.json").stat().st_size
    history_bytes = (root / "history-index.json").stat().st_size
    latest_by_family: dict[str, dict[str, Any]] = {}
    for race in bootstrap.get("races", []):
        key = "uv45" if str(race["race_key"]).startswith("ultravasan45-") else "uv90"
        if key not in latest_by_family or int(race["year"]) > int(latest_by_family[key]["year"]):
            latest_by_family[key] = race
    first_paint_bytes = {}
    for family, race in latest_by_family.items():
        entry = edition_meta[str(race["id"])]
        first_paint_bytes[family] = bootstrap_bytes + history_bytes + int(entry["bytes"])

    monolith_bytes = (root / "ultravasan.json").stat().st_size
    if any(value >= monolith_bytes for value in first_paint_bytes.values()):
        issues.append("modular first-paint payload is not smaller than monolith")
    if len(results) != 24422:
        issues.append(f"expected 24422 results, got {len(results)}")
    if len(combined_splits) != 139910:
        issues.append(f"expected 139910 splits, got {len(combined_splits)}")
    if len(bootstrap.get("races", [])) != 22:
        issues.append(f"expected 22 races, got {len(bootstrap.get('races', []))}")

    return {
        "ok": not issues,
        "issues": issues,
        "results": len(results),
        "splits": len(combined_splits),
        "races": len(bootstrap.get("races", [])),
        "monolith_bytes": monolith_bytes,
        "bootstrap_bytes": bootstrap_bytes,
        "history_index_bytes": history_bytes,
        "first_paint_bytes": first_paint_bytes,
        "first_paint_reduction": {
            family: 1 - value / monolith_bytes
            for family, value in first_paint_bytes.items()
        },
        "edition_sizes": edition_sizes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, nargs="?", default=Path("docs/data"))
    args = parser.parse_args()
    report = validate(args.root)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["ok"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
