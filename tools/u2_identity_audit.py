#!/usr/bin/env python3
"""Read-only audit of legacy athlete links before the U2 identity migration.

The audit never mutates SQLite. It classifies which legacy athlete groups are
already supported by provider person evidence, which cross-source appearances
can be tied deterministically to the same race performance, and which links
must remain edition-local or enter manual review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "ultravasan.sqlite"
DEFAULT_REPORT = ROOT / "reports" / "U2_LEGACY_IDENTITY_AUDIT.json"

EXPECTED_U0 = {
    "results": 24422,
    "athletes": 16594,
    "external_ids": 20805,
    "multi_edition_athletes": 4536,
    "multi_year_athletes": 4511,
    "cross_source_athletes": 1938,
    "unverified_multi_edition_athletes": 1054,
    "results_without_exact_external_link": 0,
    "source_results": {"vasanerd": 13188, "vasaloppet_mika": 11234},
    "source_external_ids": {"vasanerd": 9571, "vasaloppet_mika": 11234},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def same_performance(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Mirror U2's deterministic cross-source same-performance rule."""
    fields = ("bib", "age_class", "status", "finish_seconds")
    for field in fields:
        a, b = left.get(field), right.get(field)
        if a not in (None, "") and b not in (None, "") and str(a) != str(b):
            return False
    bib_match = left.get("bib") not in (None, "") and str(left.get("bib")) == str(right.get("bib"))
    finish_match = left.get("finish_seconds") is not None and left.get("finish_seconds") == right.get("finish_seconds")
    class_match = left.get("age_class") not in (None, "") and left.get("age_class") == right.get("age_class")
    status_match = left.get("status") not in (None, "", "UNKNOWN") and left.get("status") == right.get("status")
    return (bib_match and (finish_match or class_match or status_match)) or (finish_match and class_match)


def compact_result(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["result_id"],
        "athlete_id": row["athlete_id"],
        "race_id": row["race_id"],
        "race_key": row["race_key"],
        "year": row["year"],
        "source_code": row["source_code"],
        "source_result_id": row["source_result_id"],
        "bib": row["bib"],
        "age_class": row["age_class"],
        "status": row["status"],
        "finish_seconds": row["finish_seconds"],
        "name": row["name_as_published"],
    }


def fetch_results(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT res.id result_id,res.athlete_id,res.race_id,res.source_result_id,res.bib,
               res.age_class,res.status,res.finish_seconds,res.name_as_published,
               race.race_key,race.year,src.code source_code,
               athlete.athlete_match_status
        FROM results res
        JOIN races race ON race.id=res.race_id
        JOIN sources src ON src.id=res.source_id
        JOIN athletes athlete ON athlete.id=res.athlete_id
        ORDER BY res.athlete_id,race.year,res.race_id,res.id
        """
    ).fetchall()
    return [dict(row) for row in rows]


def exact_external_link_misses(conn: sqlite3.Connection) -> int:
    return conn.execute(
        """
        SELECT COUNT(*)
        FROM results res
        LEFT JOIN athlete_external_ids ext
          ON ext.athlete_id=res.athlete_id
         AND ext.source_id=res.source_id
         AND ext.external_id=res.source_result_id
        WHERE ext.id IS NULL
        """
    ).fetchone()[0]


def classify_cross_source_race_group(rows: list[dict[str, Any]]) -> dict[str, Any]:
    vasa = [row for row in rows if row["source_code"] == "vasanerd"]
    mika = [row for row in rows if row["source_code"] == "vasaloppet_mika"]
    pairs: list[tuple[int, int]] = []
    for left in vasa:
        for right in mika:
            if same_performance(left, right):
                pairs.append((left["result_id"], right["result_id"]))
    vasa_hits = Counter(a for a, _ in pairs)
    mika_hits = Counter(b for _, b in pairs)
    unique_pairs = [
        pair for pair in pairs
        if vasa_hits[pair[0]] == 1 and mika_hits[pair[1]] == 1
    ]
    matched_vasa = {a for a, _ in unique_pairs}
    matched_mika = {b for _, b in unique_pairs}
    unresolved = [
        row["result_id"] for row in rows
        if row["source_code"] in {"vasanerd", "vasaloppet_mika"}
        and row["result_id"] not in matched_vasa
        and row["result_id"] not in matched_mika
    ]
    if not vasa or not mika:
        state = "not-cross-source"
    elif not unresolved and len(unique_pairs) == len(vasa) == len(mika):
        state = "deterministic"
    elif unique_pairs:
        state = "partial"
    else:
        state = "unresolved"
    return {
        "state": state,
        "vasanerd_rows": len(vasa),
        "mika_rows": len(mika),
        "deterministic_pairs": len(unique_pairs),
        "unresolved_result_ids": unresolved,
        "pairs": [{"vasanerd_result_id": a, "mika_result_id": b} for a, b in unique_pairs],
    }


def audit(conn: sqlite3.Connection, db_path: Path) -> dict[str, Any]:
    results = fetch_results(conn)
    by_athlete: dict[int, list[dict[str, Any]]] = defaultdict(list)
    by_athlete_race: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for row in results:
        by_athlete[row["athlete_id"]].append(row)
        by_athlete_race[(row["athlete_id"], row["race_id"])].append(row)

    external = conn.execute(
        """
        SELECT ext.athlete_id,src.code source_code,ext.external_id
        FROM athlete_external_ids ext JOIN sources src ON src.id=ext.source_id
        ORDER BY ext.athlete_id,src.code,ext.external_id
        """
    ).fetchall()
    ext_by_athlete: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in external:
        ext_by_athlete[row["athlete_id"]].append(dict(row))

    source_results = Counter(row["source_code"] for row in results)
    source_external_ids = Counter(row["source_code"] for row in external)

    multi_edition = 0
    multi_year = 0
    cross_source = 0
    unverified_multi_edition = 0
    vasanerd_person_athletes = 0
    no_person_evidence_multi_edition = 0
    fully_supported_person_athletes = 0
    partially_supported_person_athletes = 0
    partially_supported_unsupported_rows = 0
    partial_unsupported_by_race_family: Counter[str] = Counter()
    partial_unsupported_by_race: Counter[str] = Counter()
    review_result_rows = 0
    classification_counts: Counter[str] = Counter()
    review_by_race_family: Counter[str] = Counter()
    review_groups: list[dict[str, Any]] = []

    deterministic_mika_results: set[int] = set()
    cross_source_race_counts: Counter[str] = Counter()
    cross_source_by_race: Counter[str] = Counter()
    cross_source_details: list[dict[str, Any]] = []

    for (athlete_id, race_id), group in by_athlete_race.items():
        sources = {row["source_code"] for row in group}
        if "vasanerd" in sources and "vasaloppet_mika" in sources:
            classified = classify_cross_source_race_group(group)
            cross_source_race_counts[classified["state"]] += 1
            cross_source_by_race[f"{group[0]['race_key']}:{classified['state']}"] += 1
            for pair in classified["pairs"]:
                deterministic_mika_results.add(pair["mika_result_id"])
            if classified["state"] != "deterministic":
                cross_source_details.append({
                    "athlete_id": athlete_id,
                    "race_id": race_id,
                    "race_key": group[0]["race_key"],
                    "year": group[0]["year"],
                    **classified,
                    "results": [compact_result_row(row) for row in group],
                })

    for athlete_id, group in by_athlete.items():
        race_ids = {row["race_id"] for row in group}
        years = {row["year"] for row in group}
        sources = {row["source_code"] for row in group}
        status = group[0]["athlete_match_status"]
        if len(race_ids) > 1:
            multi_edition += 1
        if len(years) > 1:
            multi_year += 1
        if len(sources) > 1:
            cross_source += 1
        if status == "unverified" and len(race_ids) > 1:
            unverified_multi_edition += 1

        vasa_ext = [row for row in ext_by_athlete.get(athlete_id, []) if row["source_code"] == "vasanerd"]
        has_person_evidence = len(vasa_ext) == 1
        if vasa_ext:
            vasanerd_person_athletes += 1

        supported_result_ids = {
            row["result_id"] for row in group if row["source_code"] == "vasanerd"
        } | deterministic_mika_results
        unsupported = [row for row in group if row["result_id"] not in supported_result_ids]

        if has_person_evidence and not unsupported:
            classification = "fully-person-supported"
            fully_supported_person_athletes += 1
        elif has_person_evidence:
            classification = "partially-person-supported"
            partially_supported_person_athletes += 1
            partially_supported_unsupported_rows += len(unsupported)
            for row in unsupported:
                family = "uv45" if row["race_key"].startswith("ultravasan45-") else "uv90" if row["race_key"].startswith("ultravasan90-") else "other"
                partial_unsupported_by_race_family[family] += 1
                partial_unsupported_by_race[row["race_key"]] += 1
        elif len(race_ids) > 1:
            classification = "review-multiedition-no-person-evidence"
            no_person_evidence_multi_edition += 1
            review_result_rows += len(group)
            if len(review_groups) < 200:
                review_groups.append({
                    "athlete_id": athlete_id,
                    "athlete_match_status": status,
                    "race_editions": len(race_ids),
                    "years": sorted(years),
                    "sources": sorted(sources),
                    "results": [compact_result_row(row) for row in group],
                })
            for row in group:
                family = "uv45" if row["race_key"].startswith("ultravasan45-") else "uv90" if row["race_key"].startswith("ultravasan90-") else "other"
                review_by_race_family[family] += 1
        else:
            classification = "edition-local-no-person-evidence"
        classification_counts[classification] += 1

    report = {
        "database": {
            "path": str(db_path),
            "sha256": sha256(db_path),
        },
        "totals": {
            "results": len(results),
            "athletes": conn.execute("SELECT COUNT(*) FROM athletes").fetchone()[0],
            "external_ids": len(external),
            "multi_edition_athletes": multi_edition,
            "multi_year_athletes": multi_year,
            "cross_source_athletes": cross_source,
            "unverified_multi_edition_athletes": unverified_multi_edition,
            "results_without_exact_external_link": exact_external_link_misses(conn),
        },
        "source_results": dict(sorted(source_results.items())),
        "source_external_ids": dict(sorted(source_external_ids.items())),
        "identity_classifications": dict(sorted(classification_counts.items())),
        "vasanerd_person_athletes": vasanerd_person_athletes,
        "fully_supported_person_athletes": fully_supported_person_athletes,
        "partially_supported_person_athletes": partially_supported_person_athletes,
        "partially_supported_unsupported_results": {
            "result_rows": partially_supported_unsupported_rows,
            "result_rows_by_race_family": dict(sorted(partial_unsupported_by_race_family.items())),
            "result_rows_by_race": dict(sorted(partial_unsupported_by_race.items())),
        },
        "review_multiedition_no_person_evidence": {
            "athletes": no_person_evidence_multi_edition,
            "result_rows": review_result_rows,
            "result_rows_by_race_family": dict(sorted(review_by_race_family.items())),
            "sample_groups": review_groups,
        },
        "cross_source_same_race": {
            "groups_by_state": dict(sorted(cross_source_race_counts.items())),
            "groups_by_race_and_state": dict(sorted(cross_source_by_race.items())),
            "deterministically_supported_mika_results": len(deterministic_mika_results),
            "non_deterministic_groups": cross_source_details[:200],
        },
    }
    return report


def compact_result_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["result_id"],
        "race_key": row["race_key"],
        "year": row["year"],
        "source": row["source_code"],
        "source_result_id": row["source_result_id"],
        "bib": row["bib"],
        "age_class": row["age_class"],
        "status": row["status"],
        "finish_seconds": row["finish_seconds"],
        "name": row["name_as_published"],
    }


def check_expected(report: dict[str, Any]) -> list[str]:
    mismatches: list[str] = []
    for key, expected in EXPECTED_U0.items():
        if key in {"source_results", "source_external_ids"}:
            actual = report[key]
        else:
            actual = report["totals"].get(key)
        if actual != expected:
            mismatches.append(f"{key}: expected {expected!r}, got {actual!r}")
    return mismatches


def summary(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "database_sha256": report["database"]["sha256"],
        "totals": report["totals"],
        "source_results": report["source_results"],
        "source_external_ids": report["source_external_ids"],
        "identity_classifications": report["identity_classifications"],
        "vasanerd_person_athletes": report["vasanerd_person_athletes"],
        "fully_supported_person_athletes": report["fully_supported_person_athletes"],
        "partially_supported_person_athletes": report["partially_supported_person_athletes"],
        "partially_supported_unsupported_results": report["partially_supported_unsupported_results"],
        "review_multiedition_no_person_evidence": {
            key: value
            for key, value in report["review_multiedition_no_person_evidence"].items()
            if key != "sample_groups"
        },
        "cross_source_same_race": {
            key: value
            for key, value in report["cross_source_same_race"].items()
            if key != "non_deterministic_groups"
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--expect-u0-audit", action="store_true")
    args = parser.parse_args()

    db = args.db.resolve()
    uri = f"file:{db.as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        report = audit(conn, db)
    finally:
        conn.close()

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary(report), ensure_ascii=False, indent=2))

    if args.expect_u0_audit:
        mismatches = check_expected(report)
        if mismatches:
            raise SystemExit("U2 legacy identity baseline mismatch:\n- " + "\n- ".join(mismatches))


if __name__ == "__main__":
    main()
