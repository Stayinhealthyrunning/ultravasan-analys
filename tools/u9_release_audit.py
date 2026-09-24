#!/usr/bin/env python3
"""Deterministic final release audit for Ultravasan Analys 2.0 (U9)."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FREEZE = ROOT / "config" / "release_freeze.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path: str) -> Path:
    return ROOT / path


def audit(freeze_path: Path, modular_report_path: Path | None = None) -> dict[str, Any]:
    freeze = read_json(freeze_path)
    baseline_path = rel(freeze["baseline"])
    baseline = read_json(baseline_path)
    issues: list[str] = []
    checks: dict[str, Any] = {}

    expected = freeze["protected_totals"]
    actual_totals = baseline.get("totals", {})
    for key, value in expected.items():
        actual = actual_totals.get(key)
        if actual != value:
            issues.append(f"Baseline total {key}: expected {value}, got {actual}")
    checks["protected_totals"] = {
        "expected": expected,
        "actual": {key: actual_totals.get(key) for key in expected},
        "ok": all(actual_totals.get(key) == value for key, value in expected.items()),
    }

    file_checks = {}
    for label, spec in baseline.get("files", {}).items():
        if not isinstance(spec, dict) or "path" not in spec or "sha256" not in spec:
            continue
        path = rel(spec["path"])
        exists = path.is_file()
        actual_hash = sha256(path) if exists else None
        ok = exists and actual_hash == spec["sha256"]
        file_checks[label] = {
            "path": spec["path"],
            "exists": exists,
            "expected_sha256": spec["sha256"],
            "actual_sha256": actual_hash,
            "ok": ok,
        }
        if not ok:
            issues.append(f"Protected baseline file changed: {spec['path']}")
    checks["protected_files"] = file_checks

    baseline_checks = baseline.get("checks", {})
    required_zero = (
        "foreign_key_violations",
        "duplicate_result_keys",
        "duplicate_split_keys",
        "results_without_exact_external_link",
        "evidence_without_athlete",
        "evidence_without_source",
    )
    if baseline_checks.get("integrity_check") != "ok":
        issues.append("U2 baseline integrity_check is not ok")
    for key in required_zero:
        if baseline_checks.get(key, 0) != 0:
            issues.append(f"U2 baseline check {key} is not zero")
    checks["baseline_integrity"] = {
        "integrity_check": baseline_checks.get("integrity_check"),
        "zero_checks": {key: baseline_checks.get(key, 0) for key in required_zero},
        "ok": baseline_checks.get("integrity_check") == "ok"
        and all(baseline_checks.get(key, 0) == 0 for key in required_zero),
    }

    required_paths = [*freeze.get("required_reports", []), *freeze.get("required_frontend_modules", [])]
    missing = [path for path in required_paths if not rel(path).is_file() or rel(path).stat().st_size == 0]
    if missing:
        issues.extend(f"Required release artifact missing: {path}" for path in missing)
    checks["required_artifacts"] = {
        "count": len(required_paths),
        "missing": missing,
        "ok": not missing,
    }

    index = rel("docs/index.html").read_text(encoding="utf-8")
    index_checks = {
        "catalog_before_loader": index.find("ultravasan-data-catalog.js") < index.find("assets/data-loader.js"),
        "no_legacy_monolith_script": 'src="data/ultravasan-data.js' not in index,
        "race_contracts_loaded": "assets/race-contracts.js" in index,
        "history_engine_loaded": "assets/history-engine.js" in index,
        "runner_analysis_loaded": "assets/runner-analysis.js" in index,
        "course_intelligence_loaded": "assets/course-intelligence.js" in index,
        "history_intelligence_loaded": "assets/history-intelligence.js" in index,
        "remediation_cache_generation": all(asset in index for asset in (
            "assets/styles.css?v=20260924-r3",
            "assets/course-intelligence.js?v=20260924-r3",
            "assets/app.js?v=20260924-r3",
            "assets/nerdlab.js?v=20260924-r4",
            "assets/audience-analytics.js?v=20260924-r3",
        )),
    }
    if not all(index_checks.values()):
        issues.append("Frontend release wiring failed one or more U9 checks")
    checks["frontend_wiring"] = {**index_checks, "ok": all(index_checks.values())}

    workflow = rel(".github/workflows/test.yml").read_text(encoding="utf-8")
    workflow_checks = {
        "golden_master": "Verifiera aktiv golden master" in workflow,
        "race_contracts": "Verifiera loppkontrakt och publicerade banversioner" in workflow,
        "modular_data": "Verifiera U3 modulär webbdata mot monoliten" in workflow,
        "javascript_tests": "Kör JavaScript-tester" in workflow,
        "chromium": "Kör verkligt browserflöde" in workflow,
        "u9_release_audit": "tools/u9_release_audit.py" in workflow,
    }
    if not all(workflow_checks.values()):
        issues.append("CI release gate is incomplete")
    checks["ci_gate"] = {**workflow_checks, "ok": all(workflow_checks.values())}

    if modular_report_path is not None:
        modular = read_json(modular_report_path)
        budgets = freeze["performance_budgets"]
        performance = {
            "largest_default_first_paint_bytes": modular.get("largest_default_first_paint_bytes"),
            "largest_default_first_paint_with_catalog_bytes": modular.get("largest_default_first_paint_with_catalog_bytes"),
            "largest_family_core_reduction_pct": modular.get("largest_family_core_reduction_pct"),
            "largest_active_edition_core_reduction_pct": modular.get("largest_active_edition_core_reduction_pct"),
            "largest_edition_reduction_pct": modular.get("largest_edition_reduction_pct"),
        }
        perf_ok = True
        upper = (
            ("largest_default_first_paint_bytes", "largest_default_first_paint_bytes_max"),
            ("largest_default_first_paint_with_catalog_bytes", "largest_default_first_paint_with_catalog_bytes_max"),
        )
        lower = (
            ("largest_family_core_reduction_pct", "largest_family_core_reduction_pct_min"),
            ("largest_active_edition_core_reduction_pct", "largest_active_edition_core_reduction_pct_min"),
            ("largest_edition_reduction_pct", "largest_edition_reduction_pct_min"),
        )
        for metric, budget in upper:
            value = performance.get(metric)
            if value is None or value > budgets[budget]:
                perf_ok = False
                issues.append(f"Performance budget exceeded: {metric}={value}, max={budgets[budget]}")
        for metric, budget in lower:
            value = performance.get(metric)
            if value is None or value < budgets[budget]:
                perf_ok = False
                issues.append(f"Performance reduction regressed: {metric}={value}, min={budgets[budget]}")
        modular_totals_ok = (
            modular.get("races") == expected["race_editions"]
            and modular.get("results") == expected["results"]
            and modular.get("splits") == expected["splits"]
            and modular.get("editions", {}).get("count") == expected["race_editions"]
        )
        if not modular_totals_ok:
            issues.append("Modular export totals differ from frozen release totals")
        checks["modular_performance"] = {
            "values": performance,
            "budgets": budgets,
            "totals_ok": modular_totals_ok,
            "ok": perf_ok and modular_totals_ok,
        }
    else:
        checks["modular_performance"] = {
            "ok": None,
            "note": "No modular report supplied; deterministic file/invariant checks still ran.",
        }

    result = {
        "schema_version": 1,
        "release": freeze["release"],
        "phase": freeze["phase"],
        "ok": not issues,
        "issues": issues,
        "checks": checks,
        "viewport_contracts": freeze.get("viewport_contracts", []),
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--freeze", type=Path, default=DEFAULT_FREEZE)
    parser.add_argument("--modular-report", type=Path)
    parser.add_argument("--json-output", type=Path)
    args = parser.parse_args()

    result = audit(args.freeze, args.modular_report)
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    print(rendered)
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(rendered + "\n", encoding="utf-8")
    if not result["ok"]:
        raise SystemExit("U9 release audit failed:\n- " + "\n- ".join(result["issues"]))


if __name__ == "__main__":
    main()
