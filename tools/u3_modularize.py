#!/usr/bin/env python3
"""Build and verify U3 modular browser data from the verified public monolith."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import uvtool

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "docs" / "data" / "ultravasan.json"
DEFAULT_CONFIG = ROOT / "config" / "races.json"
DEFAULT_OUTPUT = ROOT / "docs" / "data"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def keyed(rows: list[dict[str, Any]], key) -> dict[Any, dict[str, Any]]:
    out: dict[Any, dict[str, Any]] = {}
    for row in rows:
        k = key(row)
        if k in out:
            raise RuntimeError(f"Duplicate modular key: {k!r}")
        out[k] = row
    return out


def validate(source: dict[str, Any], output_dir: Path, config: dict[str, Any]) -> dict[str, Any]:
    catalog_path = output_dir / "ultravasan-data-catalog.json"
    if not catalog_path.exists():
        raise RuntimeError(f"Modular catalog missing: {catalog_path}")
    catalog = load_json(catalog_path)
    if catalog.get("schema_version") != 1 or catalog.get("mode") != "modular":
        raise RuntimeError("Invalid modular catalog contract")
    if set(catalog.get("families", {})) != {"uv90", "uv45"}:
        raise RuntimeError("Catalog must contain exactly uv90 and uv45")

    race_family_by_key = {
        row["race_key"]: row.get("race_family")
        for row in config.get("races", [])
    }
    source_races = keyed(source["races"], lambda row: int(row["id"]))
    source_checkpoints = keyed(
        source["checkpoints"], lambda row: (int(row["race_id"]), row["checkpoint_key"])
    )
    source_results = keyed(source["results"], lambda row: int(row["id"]))
    source_splits = keyed(
        source["splits"], lambda row: (int(row["result_id"]), row["checkpoint_key"])
    )

    merged_races: dict[int, dict[str, Any]] = {}
    merged_checkpoints: dict[tuple[int, str], dict[str, Any]] = {}
    merged_results: dict[int, dict[str, Any]] = {}
    merged_splits: dict[tuple[int, str], dict[str, Any]] = {}
    family_sizes: dict[str, int] = {}

    for family, spec in catalog["families"].items():
        chunk_path = output_dir / Path(spec["json"]).name
        js_path = output_dir / Path(spec["js"]).name
        if not chunk_path.exists() or not js_path.exists():
            raise RuntimeError(f"Missing chunk files for {family}")
        chunk = load_json(chunk_path)
        scope = chunk.get("meta", {}).get("data_scope", {})
        if scope != {"kind": "race-family", "race_family": family}:
            raise RuntimeError(f"Wrong data scope for {family}: {scope!r}")

        for race in chunk["races"]:
            expected = race_family_by_key.get(race["race_key"])
            if expected != family:
                raise RuntimeError(
                    f"{race['race_key']} belongs to {expected!r}, not chunk {family!r}"
                )
        for result in chunk["results"]:
            race = source_races.get(int(result["race_id"]))
            if not race or race_family_by_key.get(race["race_key"]) != family:
                raise RuntimeError(f"Result {result['id']} is routed to wrong family")

        merged_races.update(keyed(chunk["races"], lambda row: int(row["id"])))
        merged_checkpoints.update(
            keyed(chunk["checkpoints"], lambda row: (int(row["race_id"]), row["checkpoint_key"]))
        )
        merged_results.update(keyed(chunk["results"], lambda row: int(row["id"])))
        merged_splits.update(
            keyed(chunk["splits"], lambda row: (int(row["result_id"]), row["checkpoint_key"]))
        )

        expected_js = (
            "window.ULTRAVASAN_DATA_FAMILIES=window.ULTRAVASAN_DATA_FAMILIES||{};"
            f"window.ULTRAVASAN_DATA_FAMILIES[{json.dumps(family)}]="
            + json.dumps(chunk, ensure_ascii=False, separators=(",", ":"))
            + ";\n"
        )
        if js_path.read_text(encoding="utf-8") != expected_js:
            raise RuntimeError(f"JSON/JavaScript payload mismatch for {family}")
        family_sizes[family] = chunk_path.stat().st_size

        if spec["results"] != len(chunk["results"]) or spec["splits"] != len(chunk["splits"]):
            raise RuntimeError(f"Catalog count mismatch for {family}")

    if merged_races != source_races:
        raise RuntimeError("Modular race payload differs from monolith")
    if merged_checkpoints != source_checkpoints:
        raise RuntimeError("Modular checkpoint payload differs from monolith")
    if merged_results != source_results:
        raise RuntimeError("Modular result payload differs from monolith")
    if merged_splits != source_splits:
        raise RuntimeError("Modular split payload differs from monolith")

    expected_result_family = {}
    for result_id, result in source_results.items():
        race = source_races[int(result["race_id"])]
        expected_result_family[str(result_id)] = race_family_by_key[race["race_key"]]
    if catalog.get("result_family") != expected_result_family:
        raise RuntimeError("result_family routing index differs from race contracts")

    totals = catalog.get("totals", {})
    expected_totals = {
        "races": len(source["races"]),
        "results": len(source["results"]),
        "splits": len(source["splits"]),
    }
    if totals != expected_totals:
        raise RuntimeError(f"Catalog totals differ: {totals!r} != {expected_totals!r}")

    legacy_bytes = DEFAULT_SOURCE.stat().st_size if DEFAULT_SOURCE.exists() else 0
    if source is not load_json and legacy_bytes == 0:
        legacy_bytes = 0
    if output_dir.resolve() == DEFAULT_OUTPUT.resolve():
        legacy_bytes = DEFAULT_SOURCE.stat().st_size
    else:
        # Validation of a temporary export may point at a different source path;
        # caller can still use the sum/max family sizes for the contract.
        legacy_bytes = 0

    return {
        "races": len(source_races),
        "results": len(source_results),
        "splits": len(source_splits),
        "families": {
            family: {
                "results": catalog["families"][family]["results"],
                "splits": catalog["families"][family]["splits"],
                "json_bytes": family_sizes[family],
            }
            for family in ("uv90", "uv45")
        },
        "catalog_bytes": catalog_path.stat().st_size,
        "legacy_bytes": legacy_bytes,
        "largest_family_bytes": max(family_sizes.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.write and not args.check:
        parser.error("choose --write and/or --check")

    source = load_json(args.source)
    config = load_json(args.config)
    if args.write:
        uvtool.write_modular_web_data(source, args.output_dir, config)
    if args.check:
        summary = validate(source, args.output_dir, config)
        source_bytes = args.source.stat().st_size
        summary["legacy_bytes"] = source_bytes
        if summary["largest_family_bytes"] >= source_bytes:
            raise SystemExit(
                "Modular export does not reduce the largest initial family payload"
            )
        summary["largest_family_reduction_pct"] = round(
            100 * (1 - summary["largest_family_bytes"] / source_bytes), 1
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
