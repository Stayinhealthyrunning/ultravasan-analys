from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import u9_release_audit as release_audit  # noqa: E402


def modular_report() -> dict:
    return {
        "races": 22,
        "results": 24422,
        "splits": 139910,
        "editions": {"count": 22},
        "largest_default_first_paint_bytes": 1_087_000,
        "largest_default_first_paint_with_catalog_bytes": 1_339_829,
        "largest_family_core_reduction_pct": 82.7,
        "largest_active_edition_core_reduction_pct": 97.5,
        "largest_edition_reduction_pct": 88.1,
    }


def test_release_freeze_matches_current_protected_repository(tmp_path: Path) -> None:
    report = tmp_path / "u3.json"
    report.write_text(json.dumps(modular_report()), encoding="utf-8")
    result = release_audit.audit(release_audit.DEFAULT_FREEZE, report)
    assert result["checks"]["modular_performance"]["ok"] is True, result["issues"]
    assert result["checks"]["protected_totals"]["actual"] == {
        "race_editions": 22,
        "results": 24422,
        "splits": 139910,
    }
    assert result["checks"]["frontend_wiring"]["no_legacy_monolith_script"] is True
    assert result["checks"]["ci_gate"]["u9_release_audit"] is True


def test_release_freeze_performance_budget_fails_closed(tmp_path: Path) -> None:
    report_data = modular_report()
    report_data["largest_default_first_paint_with_catalog_bytes"] = 9_000_000
    report = tmp_path / "u3-bad.json"
    report.write_text(json.dumps(report_data), encoding="utf-8")
    result = release_audit.audit(release_audit.DEFAULT_FREEZE, report)
    assert result["ok"] is False
    assert any("Performance budget exceeded" in issue for issue in result["issues"])


def test_release_freeze_has_three_responsive_viewport_contracts() -> None:
    freeze = json.loads(release_audit.DEFAULT_FREEZE.read_text(encoding="utf-8"))
    assert freeze["viewport_contracts"] == [
        {"width": 390, "height": 844, "max_document_overflow_px": 2, "guide_columns": 1},
        {"width": 900, "height": 900, "max_document_overflow_px": 2, "guide_columns": 2},
        {"width": 1536, "height": 1024, "max_document_overflow_px": 2, "guide_columns": 4},
    ]
    assert len(freeze["required_reports"]) == 8

    browser = (ROOT / "tools" / "verify_local_browser.mjs").read_text(encoding="utf-8")
    assert "const viewportSpecs=[" in browser
    assert "responsiveFreeze:u9Viewports.length===3&&u9Viewports.every(item=>item.verified)" in browser
    assert "document.scrollingElement||document.documentElement" in browser
    assert "scrolling.scrollWidth-scrolling.clientWidth" in browser
    assert "guideColumns" in browser
