from __future__ import annotations

import shutil
import sqlite3
import sys
import tempfile

import pytest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import u2_identity_migration
import uvtool

U2_BASELINE = ROOT / "reports" / "U2_BASELINE.json"


@pytest.mark.skipif(U2_BASELINE.exists(), reason="Production identity migration is already applied")
def test_production_migration_plan_is_non_destructive_and_complete() -> None:
    conn = uvtool.connect(ROOT / "data" / "ultravasan.sqlite")
    before = u2_identity_migration.protected_state(conn)
    plan = u2_identity_migration.migration_plan(conn)
    after = u2_identity_migration.protected_state(conn)
    conn.close()

    assert before == after
    assert plan["retained_vasanerd_person_athletes"] == 9571
    assert plan["actions_by_reason"]["legacy-multiedition-link-without-person-evidence"] == 1555
    assert plan["actions_by_reason"]["legacy-cross-source-without-deterministic-same-performance-evidence"] == 2656
    assert len(plan["actions"]) == 4211


@pytest.mark.skipif(U2_BASELINE.exists(), reason="Legacy migration fixture is no longer the checked-in database")
def test_full_migration_on_copy_preserves_payload_and_is_idempotent() -> None:
    with tempfile.TemporaryDirectory() as temp:
        target = Path(temp) / "u2.sqlite"
        shutil.copy2(ROOT / "data" / "ultravasan.sqlite", target)
        conn = uvtool.connect(target)
        before = u2_identity_migration.protected_state(conn)
        first = u2_identity_migration.execute(conn, apply=True)
        after = u2_identity_migration.protected_state(conn)

        assert first["protected_state_unchanged"] is True
        assert before == after
        assert first["athletes_created"] == first["plan"]["actions"]
        assert first["migrated_state"]["athletes"] == 20805
        assert first["migrated_state"]["cross_source_athletes"] == 0
        assert first["migrated_state"]["multi_edition_without_vasanerd_person_evidence"] == 0
        assert first["migrated_state"]["person_keys"] == 9571
        assert first["migrated_state"]["identity_evidence"] == 20805
        assert first["migrated_state"]["review_candidates"] == first["plan"]["actions"]

        second_plan = u2_identity_migration.migration_plan(conn)
        assert second_plan["actions"] == []
        second = u2_identity_migration.execute(conn, apply=True)
        assert second["athletes_created"] == 0
        assert second["migrated_state"] == first["migrated_state"]
        conn.close()


@pytest.mark.skipif(not U2_BASELINE.exists(), reason="Production U2 baseline is not applied yet")
def test_checked_in_database_is_already_migrated_and_idempotent() -> None:
    conn = uvtool.connect(ROOT / "data" / "ultravasan.sqlite")
    try:
        state = u2_identity_migration.migrated_state(conn)
        plan = u2_identity_migration.migration_plan(conn)
        protected_before = u2_identity_migration.protected_state(conn)
        result = u2_identity_migration.execute(conn, apply=True)
        protected_after = u2_identity_migration.protected_state(conn)
    finally:
        conn.close()
    assert plan["actions"] == []
    assert protected_before == protected_after
    assert result["athletes_created"] == 0
    assert state["athletes"] == 20805
    assert state["person_keys"] == 9571
    assert state["identity_evidence"] == 20805
    assert state["cross_source_athletes"] == 0
    assert state["multi_edition_without_vasanerd_person_evidence"] == 0
