#!/usr/bin/env python3
"""Explicit identity contracts for Ultravasan U2.

Person identity is evidence-based and event-scoped. Provider record identifiers
that only identify an appearance/result must never be promoted to a person by
name or demographic similarity.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from typing import Any

EVENT_NAMESPACE = "ultravasan"
PERSON_SCOPE = "person"
APPEARANCE_SCOPE = "appearance"
RESULT_SCOPE = "result"


class IdentityContractError(RuntimeError):
    """Raised when identity evidence contradicts an existing verified identity."""


def stable_person_key(provider: str, namespace: str, external_id: str) -> str:
    """Return a stable opaque event-scoped key without exposing the raw provider id."""
    value = "\0".join((EVENT_NAMESPACE, provider, namespace, str(external_id)))
    return "uvp_" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def source_identity_contract(source_code: str | None, external_id: str) -> dict[str, Any]:
    """Classify the semantic scope of one provider identifier."""
    if source_code == "vasanerd":
        return {
            "provider": "vasanerd",
            "namespace": "idpe",
            "scope": PERSON_SCOPE,
            "evidence_type": "provider-person-id",
            "decision": "verified",
            "confidence": 1.0,
            "person_key": stable_person_key("vasanerd", "idpe", external_id),
        }
    if source_code == "vasaloppet_mika":
        return {
            "provider": "vasaloppet_mika",
            "namespace": "event_code:idp",
            "scope": RESULT_SCOPE,
            "evidence_type": "provider-result-id",
            "decision": "observed",
            "confidence": 1.0,
            "person_key": None,
        }
    return {
        "provider": source_code or "unknown",
        "namespace": "source_result_id",
        "scope": RESULT_SCOPE,
        "evidence_type": "provider-record-id",
        "decision": "observed",
        "confidence": 1.0,
        "person_key": None,
    }


def ensure_identity_schema(conn: sqlite3.Connection) -> None:
    """Apply only additive U2 identity schema changes."""
    athlete_columns = {row[1] for row in conn.execute("PRAGMA table_info(athletes)")}
    if "person_key" not in athlete_columns:
        conn.execute("ALTER TABLE athletes ADD COLUMN person_key TEXT")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_athletes_person_key "
        "ON athletes(person_key) WHERE person_key IS NOT NULL"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS identity_evidence (
          id INTEGER PRIMARY KEY,
          athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
          result_id INTEGER REFERENCES results(id) ON DELETE CASCADE,
          race_id INTEGER REFERENCES races(id) ON DELETE CASCADE,
          source_id INTEGER NOT NULL REFERENCES sources(id),
          provider TEXT NOT NULL,
          namespace TEXT NOT NULL,
          scope TEXT NOT NULL,
          external_id TEXT NOT NULL,
          evidence_type TEXT NOT NULL,
          confidence REAL NOT NULL,
          decision TEXT NOT NULL,
          profile_url TEXT,
          details_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(provider, namespace, scope, external_id, athlete_id)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_identity_evidence_athlete "
        "ON identity_evidence(athlete_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_identity_evidence_result "
        "ON identity_evidence(result_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_identity_evidence_lookup "
        "ON identity_evidence(provider,namespace,scope,external_id)"
    )


def record_external_identity(
    conn: sqlite3.Connection,
    *,
    athlete_id: int,
    source_id: int,
    external_id: str,
    profile_url: str | None = None,
    race_id: int | None = None,
    result_id: int | None = None,
) -> dict[str, Any]:
    """Persist semantic evidence and attach a verified person key only when justified."""
    ensure_identity_schema(conn)
    source = conn.execute("SELECT code FROM sources WHERE id=?", (source_id,)).fetchone()
    source_code = source[0] if source else None
    contract = source_identity_contract(source_code, external_id)

    person_key = contract["person_key"]
    if person_key:
        existing = conn.execute(
            "SELECT person_key FROM athletes WHERE id=?", (athlete_id,)
        ).fetchone()
        if not existing:
            raise IdentityContractError(f"Unknown athlete_id {athlete_id}")
        if existing[0] not in (None, "", person_key):
            raise IdentityContractError(
                f"Athlete {athlete_id} already has a different verified person_key"
            )
        conn.execute(
            "UPDATE athletes SET person_key=?,athlete_match_status='source-id',updated_at=CURRENT_TIMESTAMP "
            "WHERE id=?",
            (person_key, athlete_id),
        )

    details = {
        "event_namespace": EVENT_NAMESPACE,
        "source_code": source_code,
    }
    conn.execute(
        """
        INSERT INTO identity_evidence(
          athlete_id,result_id,race_id,source_id,provider,namespace,scope,external_id,
          evidence_type,confidence,decision,profile_url,details_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(provider,namespace,scope,external_id,athlete_id) DO UPDATE SET
          result_id=COALESCE(excluded.result_id,identity_evidence.result_id),
          race_id=COALESCE(excluded.race_id,identity_evidence.race_id),
          source_id=excluded.source_id,
          evidence_type=excluded.evidence_type,
          confidence=excluded.confidence,
          decision=excluded.decision,
          profile_url=COALESCE(excluded.profile_url,identity_evidence.profile_url),
          details_json=excluded.details_json
        """,
        (
            athlete_id,
            result_id,
            race_id,
            source_id,
            contract["provider"],
            contract["namespace"],
            contract["scope"],
            external_id,
            contract["evidence_type"],
            contract["confidence"],
            contract["decision"],
            profile_url,
            json.dumps(details, ensure_ascii=False, sort_keys=True),
        ),
    )
    return contract
