from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import u2_identity_audit


def test_same_performance_requires_non_conflicting_race_specific_evidence() -> None:
    base = {
        "bib": "123",
        "age_class": "M45",
        "status": "FINISHED",
        "finish_seconds": 36000,
    }
    assert u2_identity_audit.same_performance(base, dict(base))
    assert not u2_identity_audit.same_performance(base, {**base, "bib": "124"})
    assert not u2_identity_audit.same_performance(base, {**base, "finish_seconds": 36001})
    assert u2_identity_audit.same_performance(
        {"bib": "123", "age_class": None, "status": "FINISHED", "finish_seconds": None},
        {"bib": "123", "age_class": "M45", "status": "FINISHED", "finish_seconds": 36000},
    )


def test_cross_source_group_requires_one_to_one_deterministic_pairs() -> None:
    rows = [
        {
            "result_id": 1, "source_code": "vasanerd", "bib": "123",
            "age_class": "M45", "status": "FINISHED", "finish_seconds": 36000,
        },
        {
            "result_id": 2, "source_code": "vasaloppet_mika", "bib": "123",
            "age_class": "M45", "status": "FINISHED", "finish_seconds": 36000,
        },
    ]
    classified = u2_identity_audit.classify_cross_source_race_group(rows)
    assert classified["state"] == "deterministic"
    assert classified["pairs"] == [{"vasanerd_result_id": 1, "mika_result_id": 2}]

    rows[1] = {**rows[1], "finish_seconds": 36001}
    classified = u2_identity_audit.classify_cross_source_race_group(rows)
    assert classified["state"] == "unresolved"
    assert classified["unresolved_result_ids"] == [1, 2]


def test_production_u0_legacy_identity_baseline_is_stable() -> None:
    db = ROOT / "data" / "ultravasan.sqlite"
    conn = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        report = u2_identity_audit.audit(conn, db)
    finally:
        conn.close()
    assert u2_identity_audit.check_expected(report) == []
    assert report["cross_source_same_race"]["deterministically_supported_mika_results"] <= 11234
    assert report["review_multiedition_no_person_evidence"]["athletes"] >= 1054
