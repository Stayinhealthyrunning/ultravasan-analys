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
    family_core_sizes: dict[str, int] = {}
    family_split_sizes: dict[str, int] = {}
    edition_sizes: dict[str, int] = {}

    for family, spec in catalog["families"].items():
        if any(key in spec for key in ("json", "js", "json_bytes", "js_bytes")):
            raise RuntimeError(f"Legacy full-family transport still present for {family}")
        core_spec = spec.get("core") or {}
        split_spec = spec.get("split_data") or {}
        core_path = output_dir / Path(core_spec["json"]).name
        core_js_path = output_dir / Path(core_spec["js"]).name
        split_path = output_dir / Path(split_spec["json"]).name
        split_js_path = output_dir / Path(split_spec["js"]).name
        if not all(path.exists() for path in (core_path, core_js_path, split_path, split_js_path)):
            raise RuntimeError(f"Missing progressive family chunk files for {family}")

        core = load_json(core_path)
        split_data = load_json(split_path)
        if core.get("meta", {}).get("data_scope", {}) != {
            "kind": "race-family-core",
            "race_family": family,
        }:
            raise RuntimeError(f"Wrong core data scope for {family}")
        if split_data.get("meta", {}).get("data_scope", {}) != {
            "kind": "race-family-splits",
            "race_family": family,
        }:
            raise RuntimeError(f"Wrong split data scope for {family}")
        if core.get("splits") != []:
            raise RuntimeError(f"Family core unexpectedly contains splits for {family}")
        if any(split_data.get(key) for key in ("races", "checkpoints", "results", "sources")):
            raise RuntimeError(f"Family split module contains duplicated core rows for {family}")
        if split_data.get("stats") != {}:
            raise RuntimeError(f"Family split module contains duplicated stats for {family}")

        for race in core["races"]:
            expected = race_family_by_key.get(race["race_key"])
            if expected != family:
                raise RuntimeError(
                    f"{race['race_key']} belongs to {expected!r}, not family {family!r}"
                )
        for result in core["results"]:
            race = source_races.get(int(result["race_id"]))
            if not race or race_family_by_key.get(race["race_key"]) != family:
                raise RuntimeError(f"Result {result['id']} is routed to wrong family")

        merged_races.update(keyed(core["races"], lambda row: int(row["id"])))
        merged_checkpoints.update(
            keyed(core["checkpoints"], lambda row: (int(row["race_id"]), row["checkpoint_key"]))
        )
        merged_results.update(keyed(core["results"], lambda row: int(row["id"])))
        merged_splits.update(
            keyed(split_data["splits"], lambda row: (int(row["result_id"]), row["checkpoint_key"]))
        )

        expected_core_js = (
            "window.ULTRAVASAN_DATA_FAMILY_CORES=window.ULTRAVASAN_DATA_FAMILY_CORES||{};"
            f"window.ULTRAVASAN_DATA_FAMILY_CORES[{json.dumps(family)}]="
            + json.dumps(core, ensure_ascii=False, separators=(",", ":"))
            + ";\n"
        )
        expected_split_js = (
            "window.ULTRAVASAN_DATA_FAMILY_SPLITS=window.ULTRAVASAN_DATA_FAMILY_SPLITS||{};"
            f"window.ULTRAVASAN_DATA_FAMILY_SPLITS[{json.dumps(family)}]="
            + json.dumps(split_data, ensure_ascii=False, separators=(",", ":"))
            + ";\n"
        )
        if core_js_path.read_text(encoding="utf-8") != expected_core_js:
            raise RuntimeError(f"Core JSON/JavaScript payload mismatch for {family}")
        if split_js_path.read_text(encoding="utf-8") != expected_split_js:
            raise RuntimeError(f"Split JSON/JavaScript payload mismatch for {family}")

        if spec["results"] != len(core["results"]) or spec["splits"] != len(split_data["splits"]):
            raise RuntimeError(f"Catalog count mismatch for {family}")
        family_core_sizes[family] = core_path.stat().st_size
        family_split_sizes[family] = split_path.stat().st_size

    if set(catalog.get("editions", {})) != {
        str(int(race["id"])) for race in source["races"]
    }:
        raise RuntimeError("Catalog edition set differs from monolith")

    expected_edition_json = {
        f"ultravasan-edition-{race['race_key']}.json" for race in source["races"]
    }
    actual_edition_json = {path.name for path in output_dir.glob("ultravasan-edition-*.json")}
    actual_edition_js = {path.name for path in output_dir.glob("ultravasan-edition-*.js")}
    if actual_edition_json != expected_edition_json or actual_edition_js:
        raise RuntimeError(
            "Edition file set differs from catalog: "
            f"json_extra={sorted(actual_edition_json-expected_edition_json)}, "
            f"json_missing={sorted(expected_edition_json-actual_edition_json)}, "
            f"unexpected_js={sorted(actual_edition_js)}"
        )

    edition_races: dict[int, dict[str, Any]] = {}
    edition_checkpoints: dict[tuple[int, str], dict[str, Any]] = {}
    edition_results: dict[int, dict[str, Any]] = {}
    edition_splits: dict[tuple[int, str], dict[str, Any]] = {}

    for race in source["races"]:
        race_key = race["race_key"]
        edition_key = str(int(race["id"]))
        spec = catalog["editions"][edition_key]
        chunk_path = output_dir / Path(spec["json"]).name
        if "js" in spec:
            raise RuntimeError(f"Edition {race_key} must be JSON-only")
        if not chunk_path.exists():
            raise RuntimeError(f"Missing edition JSON chunk for {race_key}")
        chunk = load_json(chunk_path)
        family = race_family_by_key[race_key]
        expected_scope = {
            "kind": "race-edition",
            "race_family": family,
            "race_key": race_key,
            "race_id": int(race["id"]),
        }
        if chunk.get("meta", {}).get("data_scope", {}) != expected_scope:
            raise RuntimeError(f"Wrong data scope for {race_key}")

        if chunk["races"] != [race]:
            raise RuntimeError(f"Edition {race_key} must contain exactly its race row")
        if any(int(result["race_id"]) != int(race["id"]) for result in chunk["results"]):
            raise RuntimeError(f"Edition {race_key} contains a result from another race")
        if any(int(checkpoint["race_id"]) != int(race["id"]) for checkpoint in chunk["checkpoints"]):
            raise RuntimeError(f"Edition {race_key} contains a checkpoint from another race")

        edition_races.update(keyed(chunk["races"], lambda row: int(row["id"])))
        edition_checkpoints.update(
            keyed(chunk["checkpoints"], lambda row: (int(row["race_id"]), row["checkpoint_key"]))
        )
        edition_results.update(keyed(chunk["results"], lambda row: int(row["id"])))
        edition_splits.update(
            keyed(chunk["splits"], lambda row: (int(row["result_id"]), row["checkpoint_key"]))
        )

        if spec["race_id"] != int(race["id"]):
            raise RuntimeError(f"Catalog race_id mismatch for {race_key}")
        if spec["race_key"] != race_key:
            raise RuntimeError(f"Catalog race_key mismatch for {race_key}")
        if spec["race_family"] != family:
            raise RuntimeError(f"Catalog race_family mismatch for {race_key}")
        if spec["results"] != len(chunk["results"]) or spec["splits"] != len(chunk["splits"]):
            raise RuntimeError(f"Catalog count mismatch for edition {race_key}")
        edition_sizes[race_key] = chunk_path.stat().st_size

    if edition_races != source_races:
        raise RuntimeError("Edition race payload differs from monolith")
    if edition_checkpoints != source_checkpoints:
        raise RuntimeError("Edition checkpoint payload differs from monolith")
    if edition_results != source_results:
        raise RuntimeError("Edition result payload differs from monolith")
    if edition_splits != source_splits:
        raise RuntimeError("Edition split payload differs from monolith")

    if merged_races != source_races:
        raise RuntimeError("Modular race payload differs from monolith")
    if merged_checkpoints != source_checkpoints:
        raise RuntimeError("Modular checkpoint payload differs from monolith")
    if merged_results != source_results:
        raise RuntimeError("Modular result payload differs from monolith")
    if merged_splits != source_splits:
        raise RuntimeError("Modular split payload differs from monolith")

    expected_result_edition = {
        str(result_id): int(result["race_id"])
        for result_id, result in source_results.items()
    }
    if "result_family" in catalog:
        raise RuntimeError("result_family is redundant once result_edition is available")
    if catalog.get("result_edition") != expected_result_edition:
        raise RuntimeError("result_edition routing index differs from race rows")

    totals = catalog.get("totals", {})
    expected_totals = {
        "races": len(source["races"]),
        "results": len(source["results"]),
        "splits": len(source["splits"]),
    }
    if totals != expected_totals:
        raise RuntimeError(f"Catalog totals differ: {totals!r} != {expected_totals!r}")

    return {
        "races": len(source_races),
        "results": len(source_results),
        "splits": len(source_splits),
        "families": {
            family: {
                "results": catalog["families"][family]["results"],
                "splits": catalog["families"][family]["splits"],
                "core_json_bytes": family_core_sizes[family],
                "split_json_bytes": family_split_sizes[family],
            }
            for family in ("uv90", "uv45")
        },
        "editions": {
            "count": len(edition_sizes),
            "largest_json_bytes": max(edition_sizes.values()),
            "smallest_json_bytes": min(edition_sizes.values()),
            "total_json_bytes": sum(edition_sizes.values()),
        },
        "catalog_bytes": catalog_path.stat().st_size,
        "largest_family_core_bytes": max(family_core_sizes.values()),
        "largest_family_split_bytes": max(family_split_sizes.values()),
        "largest_edition_bytes": max(edition_sizes.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--report", type=Path)
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
        if summary["largest_family_core_bytes"] >= source_bytes:
            raise SystemExit(
                "Progressive family core does not reduce the initial payload"
            )
        summary["largest_family_core_reduction_pct"] = round(
            100 * (1 - summary["largest_family_core_bytes"] / source_bytes), 1
        )
        summary["largest_edition_reduction_pct"] = round(
            100 * (1 - summary["largest_edition_bytes"] / source_bytes), 1
        )
        rendered = json.dumps(summary, ensure_ascii=False, indent=2)
        print(rendered)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(rendered + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
