#!/usr/bin/env python3
"""Build U3 modular/lazy web-data bundles from the compact public JSON export."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "docs" / "data" / "ultravasan.json"
DEFAULT_CONFIG = ROOT / "config" / "races.json"
DEFAULT_OUTPUT = ROOT / "docs" / "data" / "u3"


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def write_js(path: Path, assignment: str, value: Any) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = assignment + compact_json(value) + ";\n"
    path.write_text(text, encoding="utf-8")
    return path.stat().st_size


def edition_contracts(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        row["race_key"]: row
        for row in config.get("races", [])
        if row.get("data_status") == "available"
    }


def build_modular_payload(payload: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    editions = edition_contracts(config)
    races = list(payload.get("races", []))
    results = list(payload.get("results", []))
    splits = list(payload.get("splits", []))

    unknown = sorted({race["race_key"] for race in races} - set(editions))
    if unknown:
        raise RuntimeError(f"RaceEdition saknas i config: {unknown}")

    family_by_race_id = {
        race["id"]: editions[race["race_key"]]["race_family"]
        for race in races
    }
    uv90 = [race for race in races if family_by_race_id[race["id"]] == "uv90"]
    if not uv90:
        raise RuntimeError("U3 bootstrap kräver minst en UV90-utgåva")
    initial_race = max(uv90, key=lambda race: (int(race["year"]), int(race["id"])))

    results_by_race: dict[int, list[dict[str, Any]]] = {race["id"]: [] for race in races}
    for row in results:
        results_by_race.setdefault(int(row["race_id"]), []).append(row)

    race_for_result = {int(row["id"]): int(row["race_id"]) for row in results}
    splits_by_race: dict[int, list[dict[str, Any]]] = {race["id"]: [] for race in races}
    for split in splits:
        race_id = race_for_result.get(int(split["result_id"]))
        if race_id is None:
            raise RuntimeError(f"Split saknar publikt resultat: {split['result_id']}")
        splits_by_race.setdefault(race_id, []).append(split)

    race_chunks: dict[str, dict[str, Any]] = {}
    chunks: dict[str, dict[str, Any]] = {}
    for race in races:
        key = race["race_key"]
        race_chunks[str(race["id"])] = {
            "race_key": key,
            "race_family": family_by_race_id[race["id"]],
            "path": f"races/{key}.js",
            "results": len(results_by_race.get(race["id"], [])),
            "splits": len(splits_by_race.get(race["id"], [])),
        }
        chunks[key] = {
            "race_id": race["id"],
            "race_key": key,
            "results": results_by_race.get(race["id"], []),
            "splits": splits_by_race.get(race["id"], []),
        }

    result_locator = {
        str(row["id"]): int(row["race_id"])
        for row in results
    }
    bootstrap = {
        "meta": {
            **payload.get("meta", {}),
            "data_contract": "u3-modular-v1",
            "total_results": len(results),
            "total_splits": len(splits),
        },
        "races": races,
        "checkpoints": list(payload.get("checkpoints", [])),
        "stats": payload.get("stats", {}),
        "sources": list(payload.get("sources", [])),
        "results": results_by_race.get(initial_race["id"], []),
        "splits": splits_by_race.get(initial_race["id"], []),
        "u3": {
            "schema_version": 1,
            "initial_race_id": initial_race["id"],
            "initial_race_key": initial_race["race_key"],
            "initial_race_family": family_by_race_id[initial_race["id"]],
            "history_path": "history-index.js",
            "race_chunks": race_chunks,
            "result_locator": result_locator,
            "race_family_by_id": {
                str(race_id): family
                for race_id, family in family_by_race_id.items()
            },
        },
    }
    history = {
        "schema_version": 1,
        "results": results,
    }
    return {
        "bootstrap": bootstrap,
        "history": history,
        "chunks": chunks,
        "initial_race": initial_race,
    }


def export_modular(payload: dict[str, Any], config: dict[str, Any], output: Path) -> dict[str, Any]:
    built = build_modular_payload(payload, config)
    output.mkdir(parents=True, exist_ok=True)
    races_dir = output / "races"
    races_dir.mkdir(parents=True, exist_ok=True)

    sizes: dict[str, int] = {}
    sizes["bootstrap.js"] = write_js(
        output / "bootstrap.js",
        "window.ULTRAVASAN_U3_BOOTSTRAP=",
        built["bootstrap"],
    )
    sizes["history-index.js"] = write_js(
        output / "history-index.js",
        "window.ULTRAVASAN_U3_HISTORY=",
        built["history"],
    )
    for race_key, chunk in built["chunks"].items():
        target = races_dir / f"{race_key}.js"
        target.parent.mkdir(parents=True, exist_ok=True)
        text = (
            "window.ULTRAVASAN_U3_RACES=window.ULTRAVASAN_U3_RACES||{};"
            f"window.ULTRAVASAN_U3_RACES[{json.dumps(race_key)}]="
            + compact_json(chunk)
            + ";\n"
        )
        target.write_text(text, encoding="utf-8")
        sizes[f"races/{race_key}.js"] = target.stat().st_size

    legacy_bytes = len(compact_json(payload).encode("utf-8"))
    manifest = {
        "schema_version": 1,
        "data_contract": "u3-modular-v1",
        "generated_at": payload.get("meta", {}).get("generated_at"),
        "initial_race_id": built["initial_race"]["id"],
        "initial_race_key": built["initial_race"]["race_key"],
        "races": len(payload.get("races", [])),
        "results": len(payload.get("results", [])),
        "splits": len(payload.get("splits", [])),
        "legacy_compact_bytes": legacy_bytes,
        "bootstrap_bytes": sizes["bootstrap.js"],
        "history_index_bytes": sizes["history-index.js"],
        "race_chunk_bytes": sum(
            value for key, value in sizes.items() if key.startswith("races/")
        ),
        "largest_race_chunk_bytes": max(
            (value for key, value in sizes.items() if key.startswith("races/")),
            default=0,
        ),
        "files": sizes,
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    config = json.loads(args.config.read_text(encoding="utf-8"))
    manifest = export_modular(payload, config, args.output)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
