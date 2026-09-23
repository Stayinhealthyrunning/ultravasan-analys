#!/usr/bin/env python3
"""Reversible U2 migration of legacy athlete links.

The migration preserves every result id, split row and raw provider id. It only:
- adds the U2 identity schema,
- detaches legacy result rows whose cross-edition identity lacks person evidence,
- moves each result's exact external-id link with it,
- records the former legacy link as a pending review candidate,
- backfills typed identity_evidence,
- assigns person_key only to VasaNerd idpe-backed people.

Production apply is deliberately gated. CI applies the migration only to a copy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import identity_contracts
import u2_identity_audit
import uvtool

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "ultravasan.sqlite"
DEFAULT_REPORT = ROOT / "reports" / "U2_IDENTITY_MIGRATION_DRY_RUN.json"
CONFIRMATION = "MIGRATE-U2-IDENTITY"
PRODUCTION_CONFIRMATION = "MIGRATE-CHECKED-IN-PRODUCTION-U2"


def row_digest(conn: sqlite3.Connection, query: str, params: tuple[Any, ...] = ()) -> str:
    digest = hashlib.sha256()
    for row in conn.execute(query, params):
        digest.update(json.dumps(list(row), ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def protected_state(conn: sqlite3.Connection) -> dict[str, Any]:
    """State that the identity migration must not alter."""
    return {
        "results_count": conn.execute("SELECT COUNT(*) FROM results").fetchone()[0],
        "splits_count": conn.execute("SELECT COUNT(*) FROM splits").fetchone()[0],
        "external_ids_count": conn.execute("SELECT COUNT(*) FROM athlete_external_ids").fetchone()[0],
        "result_payload_digest": row_digest(
            conn,
            """
            SELECT id,race_id,source_id,source_result_id,source_url,bib,name_as_published,sex,age,birth_year,
                   age_class,nationality,club,city,county,start_group,status,finish_seconds,gun_seconds,net_seconds,
                   overall_place,gender_place,class_place,pace_seconds_per_km,imported_at,raw_json
            FROM results ORDER BY id
            """,
        ),
        "split_digest": row_digest(conn, "SELECT * FROM splits ORDER BY id"),
        "external_id_values_digest": row_digest(
            conn,
            """
            SELECT source_id,external_id,profile_url,confidence
            FROM athlete_external_ids ORDER BY source_id,external_id
            """,
        ),
        "source_records_digest": row_digest(conn, "SELECT * FROM source_records ORDER BY id"),
    }


def result_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in conn.execute(
            """
            SELECT res.*,race.race_key,race.year,src.code source_code,
                   athlete.athlete_match_status,athlete.country
            FROM results res
            JOIN races race ON race.id=res.race_id
            JOIN sources src ON src.id=res.source_id
            JOIN athletes athlete ON athlete.id=res.athlete_id
            ORDER BY res.athlete_id,race.year,res.race_id,res.id
            """
        )
    ]


def vasanerd_external_ids(conn: sqlite3.Connection) -> dict[int, list[str]]:
    rows = conn.execute(
        """
        SELECT ext.athlete_id,ext.external_id
        FROM athlete_external_ids ext
        JOIN sources src ON src.id=ext.source_id
        WHERE src.code='vasanerd'
        ORDER BY ext.athlete_id,ext.external_id
        """
    ).fetchall()
    grouped: dict[int, list[str]] = defaultdict(list)
    for row in rows:
        grouped[row["athlete_id"]].append(row["external_id"])
    return grouped


def migration_plan(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = result_rows(conn)
    by_athlete: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_athlete[row["athlete_id"]].append(row)
    vasa_ext = vasanerd_external_ids(conn)

    actions: list[dict[str, Any]] = []
    retained_person_athletes = 0
    for athlete_id, group in by_athlete.items():
        person_ids = vasa_ext.get(athlete_id, [])
        if len(person_ids) > 1:
            raise RuntimeError(
                f"Legacy athlete {athlete_id} has {len(person_ids)} VasaNerd person ids; manual review required"
            )
        if person_ids:
            retained_person_athletes += 1
            # VasaNerd idpe is person-scoped. Every non-VasaNerd result that was
            # historically placed on the same athlete lacks deterministic
            # cross-source evidence in the U2 audit and is detached.
            for row in group:
                if row["source_code"] != "vasanerd":
                    actions.append({
                        "result_id": row["id"],
                        "old_athlete_id": athlete_id,
                        "race_id": row["race_id"],
                        "race_key": row["race_key"],
                        "year": row["year"],
                        "source_id": row["source_id"],
                        "source_code": row["source_code"],
                        "source_result_id": row["source_result_id"],
                        "reason": "legacy-cross-source-without-deterministic-same-performance-evidence",
                        "candidate_person_external_id": person_ids[0],
                    })
            continue

        race_ids = {row["race_id"] for row in group}
        if len(race_ids) <= 1:
            continue
        # No person-scoped provider evidence exists. Keep one local appearance on
        # the original athlete only to avoid needless id churn; every other race
        # edition becomes a distinct local identity.
        keeper = min(group, key=lambda row: (row["year"], row["race_id"], row["id"]))
        for row in group:
            if row["id"] == keeper["id"]:
                continue
            actions.append({
                "result_id": row["id"],
                "old_athlete_id": athlete_id,
                "race_id": row["race_id"],
                "race_key": row["race_key"],
                "year": row["year"],
                "source_id": row["source_id"],
                "source_code": row["source_code"],
                "source_result_id": row["source_result_id"],
                "reason": "legacy-multiedition-link-without-person-evidence",
                "keeper_result_id": keeper["id"],
            })

    actions.sort(key=lambda item: (item["old_athlete_id"], item["year"], item["race_id"], item["result_id"]))
    return {
        "actions": actions,
        "actions_by_reason": dict(sorted(Counter(item["reason"] for item in actions).items())),
        "retained_vasanerd_person_athletes": retained_person_athletes,
    }


def create_local_athlete(conn: sqlite3.Connection, row: sqlite3.Row) -> int:
    original = conn.execute("SELECT * FROM athletes WHERE id=?", (row["athlete_id"],)).fetchone()
    if original is None:
        raise RuntimeError(f"Missing original athlete {row['athlete_id']}")
    cursor = conn.execute(
        """
        INSERT INTO athletes(
          canonical_name,normalized_name,sex,birth_year,nationality,city,country,
          athlete_match_status,person_key
        ) VALUES(?,?,?,?,?,?,?,?,NULL)
        """,
        (
            row["name_as_published"] or original["canonical_name"],
            uvtool.normalize(row["name_as_published"] or original["canonical_name"]),
            row["sex"] or original["sex"],
            row["birth_year"] or original["birth_year"],
            row["nationality"] or original["nationality"],
            row["city"] or original["city"],
            original["country"],
            "unverified",
        ),
    )
    return cursor.lastrowid


def detach_result(conn: sqlite3.Connection, action: dict[str, Any]) -> int:
    row = conn.execute(
        """
        SELECT res.*,src.code source_code
        FROM results res JOIN sources src ON src.id=res.source_id
        WHERE res.id=?
        """,
        (action["result_id"],),
    ).fetchone()
    if row is None:
        raise RuntimeError(f"Missing result {action['result_id']}")
    if row["athlete_id"] != action["old_athlete_id"]:
        raise RuntimeError(
            f"Result {row['id']} moved since plan: expected athlete {action['old_athlete_id']}, got {row['athlete_id']}"
        )
    link = conn.execute(
        """
        SELECT id FROM athlete_external_ids
        WHERE athlete_id=? AND source_id=? AND external_id=?
        """,
        (row["athlete_id"], row["source_id"], row["source_result_id"]),
    ).fetchone()
    if link is None:
        raise RuntimeError(f"Exact external-id link missing for result {row['id']}")

    new_athlete_id = create_local_athlete(conn, row)
    conn.execute("UPDATE results SET athlete_id=? WHERE id=?", (new_athlete_id, row["id"]))
    moved = conn.execute(
        """
        UPDATE athlete_external_ids SET athlete_id=?
        WHERE id=? AND athlete_id=? AND source_id=? AND external_id=?
        """,
        (
            new_athlete_id,
            link["id"],
            action["old_athlete_id"],
            row["source_id"],
            row["source_result_id"],
        ),
    ).rowcount
    if moved != 1:
        raise RuntimeError(f"Could not move exact external-id link for result {row['id']}")

    conn.execute(
        """
        INSERT INTO athlete_match_candidates(result_id,candidate_athlete_id,score,reasons,decision)
        VALUES(?,?,?,?,?)
        ON CONFLICT(result_id,candidate_athlete_id) DO UPDATE SET
          score=excluded.score,reasons=excluded.reasons,decision=excluded.decision
        """,
        (
            row["id"],
            action["old_athlete_id"],
            0.0,
            json.dumps(
                {
                    "u2_migration": True,
                    "reason": action["reason"],
                    "legacy_athlete_id": action["old_athlete_id"],
                    "source_code": row["source_code"],
                    "source_result_id": row["source_result_id"],
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
            "pending-review",
        ),
    )
    return new_athlete_id


def backfill_evidence(conn: sqlite3.Connection) -> dict[str, int]:
    identity_contracts.ensure_identity_schema(conn)
    rows = conn.execute(
        """
        SELECT ext.athlete_id,ext.source_id,ext.external_id,ext.profile_url,src.code source_code
        FROM athlete_external_ids ext JOIN sources src ON src.id=ext.source_id
        ORDER BY ext.id
        """
    ).fetchall()
    counts: Counter[str] = Counter()
    for ext in rows:
        result = conn.execute(
            """
            SELECT id,race_id FROM results
            WHERE athlete_id=? AND source_id=? AND source_result_id=?
            ORDER BY id
            """,
            (ext["athlete_id"], ext["source_id"], ext["external_id"]),
        ).fetchall()
        if ext["source_code"] == "vasanerd":
            if not result:
                raise RuntimeError(
                    f"VasaNerd idpe {ext['external_id']} has no result on athlete {ext['athlete_id']}"
                )
            result_id = None
            race_id = None
        else:
            if len(result) != 1:
                raise RuntimeError(
                    f"{ext['source_code']} id {ext['external_id']} resolves to {len(result)} results; expected exactly one"
                )
            result_id = result[0]["id"]
            race_id = result[0]["race_id"]
        contract = identity_contracts.record_external_identity(
            conn,
            athlete_id=ext["athlete_id"],
            source_id=ext["source_id"],
            external_id=ext["external_id"],
            profile_url=ext["profile_url"],
            race_id=race_id,
            result_id=result_id,
        )
        counts[f"{contract['provider']}:{contract['scope']}:{contract['decision']}"] += 1
    return dict(sorted(counts.items()))


def migrated_state(conn: sqlite3.Connection) -> dict[str, Any]:
    results = result_rows(conn)
    by_athlete: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in results:
        by_athlete[row["athlete_id"]].append(row)
    cross_source = 0
    no_person_multiedition = 0
    for athlete_id, group in by_athlete.items():
        sources = {row["source_code"] for row in group}
        races = {row["race_id"] for row in group}
        if len(sources) > 1:
            cross_source += 1
        if len(races) > 1 and not any(row["source_code"] == "vasanerd" for row in group):
            no_person_multiedition += 1
    athlete_columns = {row[1] for row in conn.execute("PRAGMA table_info(athletes)")}
    evidence_exists = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='identity_evidence'"
    ).fetchone()[0] == 1
    return {
        "athletes": conn.execute("SELECT COUNT(*) FROM athletes").fetchone()[0],
        "cross_source_athletes": cross_source,
        "multi_edition_without_vasanerd_person_evidence": no_person_multiedition,
        "person_keys": conn.execute("SELECT COUNT(*) FROM athletes WHERE person_key IS NOT NULL").fetchone()[0]
        if "person_key" in athlete_columns else 0,
        "identity_evidence": conn.execute("SELECT COUNT(*) FROM identity_evidence").fetchone()[0]
        if evidence_exists else 0,
        "review_candidates": conn.execute(
            "SELECT COUNT(*) FROM athlete_match_candidates WHERE decision='pending-review'"
        ).fetchone()[0],
    }


def execute(conn: sqlite3.Connection, *, apply: bool) -> dict[str, Any]:
    before_protected = protected_state(conn)
    before_audit = u2_identity_audit.audit(conn, Path(":memory:")) if False else None
    plan = migration_plan(conn)

    if apply:
        identity_contracts.ensure_identity_schema(conn)
        with conn:
            created = []
            for action in plan["actions"]:
                created.append(detach_result(conn, action))
            evidence = backfill_evidence(conn)
    else:
        created = []
        evidence = {
            "planned:vasanerd-person-evidence": conn.execute(
                """
                SELECT COUNT(*) FROM athlete_external_ids ext
                JOIN sources src ON src.id=ext.source_id WHERE src.code='vasanerd'
                """
            ).fetchone()[0],
            "planned:mika-result-evidence": conn.execute(
                """
                SELECT COUNT(*) FROM athlete_external_ids ext
                JOIN sources src ON src.id=ext.source_id WHERE src.code='vasaloppet_mika'
                """
            ).fetchone()[0],
        }

    after_protected = protected_state(conn)
    state = migrated_state(conn) if apply else None
    protected_equal = before_protected == after_protected
    if apply and not protected_equal:
        changed = {
            key: {"before": before_protected[key], "after": after_protected[key]}
            for key in before_protected
            if before_protected[key] != after_protected[key]
        }
        raise RuntimeError(f"Protected result/split/source payload changed: {changed}")

    if apply:
        if state["cross_source_athletes"] != 0:
            raise RuntimeError(f"Migration left {state['cross_source_athletes']} cross-source athlete groups")
        if state["multi_edition_without_vasanerd_person_evidence"] != 0:
            raise RuntimeError(
                "Migration left multi-edition athlete groups without provider person evidence: "
                f"{state['multi_edition_without_vasanerd_person_evidence']}"
            )
        if state["person_keys"] != 9571:
            raise RuntimeError(f"Expected 9571 VasaNerd-backed person keys, got {state['person_keys']}")
        if state["identity_evidence"] != 20805:
            raise RuntimeError(f"Expected 20805 typed identity evidence rows, got {state['identity_evidence']}")

    return {
        "applied": apply,
        "plan": {
            "actions": len(plan["actions"]),
            "actions_by_reason": plan["actions_by_reason"],
            "retained_vasanerd_person_athletes": plan["retained_vasanerd_person_athletes"],
            "sample_actions": plan["actions"][:200],
        },
        "athletes_created": len(created),
        "evidence": evidence,
        "protected_state_unchanged": protected_equal,
        "migrated_state": state,
    }


def ensure_safe_target(db: Path, apply: bool, confirmation: str | None, production_confirmation: str | None) -> None:
    if not apply:
        return
    if confirmation != CONFIRMATION:
        raise SystemExit(f"--apply requires --confirm {CONFIRMATION}")
    if db.resolve() == DEFAULT_DB.resolve() and production_confirmation != PRODUCTION_CONFIRMATION:
        raise SystemExit(
            "Checked-in production database apply additionally requires "
            f"--confirm-production {PRODUCTION_CONFIRMATION}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm")
    parser.add_argument("--confirm-production")
    parser.add_argument(
        "--copy-from",
        type=Path,
        help="Create --db as a byte-identical copy of this database before migration",
    )
    args = parser.parse_args()

    if args.copy_from:
        source = args.copy_from.resolve()
        target = args.db.resolve()
        if target == source:
            raise SystemExit("--copy-from and --db must be different files")
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            raise SystemExit(f"Target already exists: {target}")
        shutil.copy2(source, target)

    db = args.db.resolve()
    ensure_safe_target(db, args.apply, args.confirm, args.confirm_production)
    conn = uvtool.connect(db)
    try:
        report = execute(conn, apply=args.apply)
    finally:
        conn.close()

    report["database"] = str(db)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in (
        "applied", "plan", "athletes_created", "evidence",
        "protected_state_unchanged", "migrated_state",
    )}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
