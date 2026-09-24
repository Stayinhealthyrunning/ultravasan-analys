#!/usr/bin/env python3
"""Conservative exact-name identity candidates with explicit approval only."""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import identity_contracts  # noqa: E402


def normalized_name(value: str) -> str:
    value = unicodedata.normalize("NFD", str(value or "").casefold())
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value).split())



def collect_rows(conn):
    return [dict(row) for row in conn.execute("""
        SELECT r.id result_id,r.race_id,r.name_as_published,r.sex,r.age,r.birth_year,
               r.age_class,r.club,r.city,r.nationality,r.status,r.athlete_id,
               a.person_key,a.athlete_match_status,e.year,e.race_key,
               CASE WHEN e.name LIKE '%90%' THEN 'uv90' ELSE 'uv45' END race_family
        FROM results r JOIN races e ON e.id=r.race_id JOIN athletes a ON a.id=r.athlete_id
        ORDER BY e.year,r.id
    """)]


def build_candidate_report(conn):
    groups = defaultdict(list)
    for row in collect_rows(conn):
        row["normalized_name"] = normalized_name(row["name_as_published"])
        if row["normalized_name"]:
            groups[(row["race_family"], row["normalized_name"])].append(row)
    candidates, collisions = [], []
    for (family, name), rows in groups.items():
        sexes = {str(row["sex"] or "").upper() for row in rows if row["sex"]}
        sex = next(iter(sexes)) if len(sexes) == 1 else ""
        by_edition = defaultdict(list)
        for row in rows:
            by_edition[row["race_key"]].append(row)
        collision_keys = {key for key, entries in by_edition.items() if len(entries) > 1}
        if collision_keys or len(sexes) > 1:
            collisions.append({"race_family": family, "normalized_name": name, "sex": sex,
                               "race_keys": sorted(collision_keys),
                               "result_ids": sorted(r["result_id"] for r in rows if r["race_key"] in collision_keys),
                               "decision": "hard-conflict: same normalized name appears more than once in an edition" if collision_keys else "hard-conflict: known sex values disagree"})
            continue
        verified_keys = {row["person_key"] for row in rows if row["person_key"]}
        if len(verified_keys) > 1:
            collisions.append({"race_family": family, "normalized_name": name, "sex": sex,
                               "race_keys": sorted({r["race_key"] for r in rows}),
                               "result_ids": sorted(r["result_id"] for r in rows),
                               "decision": "hard-conflict: existing verified person keys disagree"})
            continue
        athletes = {row["athlete_id"] for row in rows}
        if len(rows) < 2 or len(athletes) < 2:
            continue
        target = sorted(rows, key=lambda row: (row["person_key"] is None, row["year"], row["result_id"]))[0]
        for row in rows:
            if row["athlete_id"] == target["athlete_id"]:
                continue
            reasons = ["exact normalized name", "same race family", "sex consistent" if sex else "sex unavailable"]
            classes_conflict = False
            class_labels = {str(r["age_class"] or "").strip() for r in rows if str(r["age_class"] or "").strip()}
            if len(class_labels) > 1:
                reasons.append("age-class labels differ; treated as categorical eligibility labels, not exact-age evidence")
            elif class_labels:
                reasons.append("age-class label consistent")
            if row["birth_year"] and target["birth_year"]:
                reasons.append("birth-year compatible" if row["birth_year"] == target["birth_year"] else "birth-year conflict")
                classes_conflict |= row["birth_year"] != target["birth_year"]
            elif row["age"] is not None and target["age"] is not None:
                age_year_delta = abs((int(row["year"]) - int(row["age"])) - (int(target["year"]) - int(target["age"])))
                reasons.append("reported age compatible" if age_year_delta <= 2 else "reported age conflict")
                classes_conflict |= age_year_delta > 2
            for field, label in (("club", "club"), ("city", "ort"), ("nationality", "nationalitet")):
                left, right = normalized_name(row.get(field) or ""), normalized_name(target.get(field) or "")
                if left and right:
                    reasons.append(f"same {label} support" if left == right else f"different {label} (not treated as identity conflict)")
            candidates.append({
                "result_id": row["result_id"], "candidate_athlete_id": target["athlete_id"],
                "current_athlete_id": row["athlete_id"], "race_key": row["race_key"],
                "race_family": family, "year": row["year"], "name": row["name_as_published"],
                "normalized_name": name, "sex": sex, "age_class": row["age_class"],
                "age": row["age"], "birth_year": row["birth_year"], "club": row["club"],
                "city": row["city"], "nationality": row["nationality"],
                "target_result_id": target["result_id"], "target_year": target["year"],
                "target_age_class": target["age_class"], "target_club": target["club"],
                "target_city": target["city"], "target_nationality": target["nationality"],
                "target_has_verified_person_key": bool(target["person_key"]), "reasons": reasons,
                "hard_conflict": classes_conflict, "decision": "pending-review",
                "auto_merge": False,
            })
    candidates.sort(key=lambda item: (item["normalized_name"], item["year"], item["result_id"]))
    return {"title": "U20 conservative identity review queue", "candidate_count": len(candidates),
            "collision_count": len(collisions), "candidates": candidates, "same_edition_collisions": collisions,
            "policy": "Exact normalized name creates review candidates only. No demographic/name-based automatic identity merge is performed."}


def ensure_review_tables(conn):
    identity_contracts.ensure_identity_schema(conn)
    conn.execute("""CREATE TABLE IF NOT EXISTS athlete_match_candidates (
        id INTEGER PRIMARY KEY,result_id INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
        candidate_athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
        score REAL NOT NULL,reasons TEXT,decision TEXT NOT NULL DEFAULT 'pending',
        UNIQUE(result_id,candidate_athlete_id))""")


def record_pending(conn, report):
    ensure_review_tables(conn)
    inserted = 0
    for candidate in report["candidates"]:
        conn.execute("""INSERT INTO athlete_match_candidates(result_id,candidate_athlete_id,score,reasons,decision)
            VALUES(?,?,?,?, 'pending-review') ON CONFLICT(result_id,candidate_athlete_id) DO NOTHING""",
            (candidate["result_id"], candidate["candidate_athlete_id"], 0.0,
             json.dumps({"u20_identity_review": True, "reasons": candidate["reasons"],
                         "hard_conflict": candidate["hard_conflict"]}, ensure_ascii=False, sort_keys=True)))
        inserted += conn.execute("SELECT changes()").fetchone()[0]
    return inserted


def approve_candidate(conn, *, result_id: int, candidate_athlete_id: int,
                      reviewer: str, person_ref: str, evidence_note: str):
    """Apply only an explicit reviewer decision; never called by report/queue modes."""
    if not reviewer.strip() or not person_ref.strip() or not evidence_note.strip():
        raise ValueError("reviewer, opaque person_ref and evidence_note are required")
    ensure_review_tables(conn)
    row = conn.execute("""SELECT r.id,r.race_id,r.athlete_id,r.name_as_published,r.sex,r.age_class,
        a.normalized_name,a.sex athlete_sex,a.person_key
        FROM results r JOIN athletes a ON a.id=r.athlete_id WHERE r.id=?""", (result_id,)).fetchone()
    candidate = conn.execute("""SELECT c.decision,t.id target_id,t.canonical_name target_name,
        t.sex target_sex,t.person_key target_person_key
        FROM athlete_match_candidates c JOIN athletes t ON t.id=c.candidate_athlete_id
        WHERE c.result_id=? AND c.candidate_athlete_id=?""", (result_id, candidate_athlete_id)).fetchone()
    if not row or not candidate or candidate["decision"] not in ("pending", "pending-review"):
        raise ValueError("candidate is absent or is not pending; no changes made")
    race = conn.execute("SELECT race_key,name FROM races WHERE id=?", (row["race_id"],)).fetchone()
    if not race or ("90" in race["name"]) != ("90" in str(race["race_key"])):
        raise ValueError("race-family contract could not be verified")
    if normalized_name(row["name_as_published"]) != normalized_name(candidate["target_name"]):
        raise ValueError("exact normalized name does not match target athlete")
    if row["sex"] and candidate["target_sex"] and str(row["sex"]).upper() != str(candidate["target_sex"]).upper():
        raise ValueError("sex conflict; no changes made")
    collision = any(normalized_name(other[0]) == normalized_name(row["name_as_published"])
                    for other in conn.execute("SELECT name_as_published FROM results WHERE race_id=? AND id<>?",
                                              (row["race_id"], result_id)))
    if collision:
        raise ValueError("same-edition name collision; explicit candidate cannot be auto-approved")
    if row["person_key"] and row["person_key"] != candidate["target_person_key"]:
        raise ValueError("current athlete has a different verified person_key")
    person_key = candidate["target_person_key"] or identity_contracts.stable_person_key(
        "manual-review", "ultravasan-person", person_ref.strip())
    existing = conn.execute("SELECT id FROM athletes WHERE person_key=? AND id<>?", (person_key, candidate_athlete_id)).fetchone()
    if existing:
        raise ValueError("person_key belongs to another athlete row")
    with conn:
        conn.execute("INSERT OR IGNORE INTO sources(code,name,source_type,terms_note) VALUES(?,?,?,?)",
                     ("manual_identity_review", "Manual identity review", "identity-review", "Reviewer-approved event-scoped person link"))
        source_id = conn.execute("SELECT id FROM sources WHERE code='manual_identity_review'").fetchone()[0]
        conn.execute("UPDATE results SET athlete_id=? WHERE id=?", (candidate_athlete_id, result_id))
        conn.execute("UPDATE athletes SET person_key=?,athlete_match_status='reviewed' WHERE id=?",
                     (person_key, candidate_athlete_id))
        details = json.dumps({"reviewer": reviewer.strip(), "evidence_note": evidence_note.strip(),
                              "result_id": result_id, "race_key": race["race_key"],
                              "event_namespace": "ultravasan"}, ensure_ascii=False, sort_keys=True)
        conn.execute("""INSERT INTO identity_evidence(athlete_id,result_id,race_id,source_id,provider,namespace,
            scope,external_id,evidence_type,confidence,decision,details_json)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,namespace,scope,external_id,athlete_id)
            DO UPDATE SET result_id=excluded.result_id,race_id=excluded.race_id,decision='verified',
            details_json=excluded.details_json""",
            (candidate_athlete_id, result_id, row["race_id"], source_id, "manual_identity_review",
             "ultravasan-person", "person", person_ref.strip(), "reviewer-approved-manual-link", 1.0,
             "verified", details))
        conn.execute("UPDATE athlete_match_candidates SET decision='accepted-manual' WHERE result_id=? AND candidate_athlete_id=?",
                     (result_id, candidate_athlete_id))
    return person_key


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / "data/ultravasan.sqlite")
    parser.add_argument("--report", type=Path, default=ROOT / "reports/U20_IDENTITY_REVIEW.json")
    parser.add_argument("--record-pending", action="store_true", help="store candidates only; does not merge identities")
    parser.add_argument("--approve-result", type=int)
    parser.add_argument("--target-athlete", type=int)
    parser.add_argument("--reviewer")
    parser.add_argument("--person-ref", help="opaque reviewer-assigned event-scoped identity reference")
    parser.add_argument("--evidence-note")
    args = parser.parse_args()
    writable = args.record_pending or args.approve_result is not None
    conn = sqlite3.connect(args.database if writable else f"file:{args.database.resolve().as_posix()}?mode=ro", uri=not writable)
    conn.row_factory = sqlite3.Row
    try:
        if args.approve_result is not None:
            if args.target_athlete is None:
                parser.error("--approve-result requires --target-athlete")
            with conn:
                person_key = approve_candidate(conn, result_id=args.approve_result,
                    candidate_athlete_id=args.target_athlete, reviewer=args.reviewer or "",
                    person_ref=args.person_ref or "", evidence_note=args.evidence_note or "")
            print(json.dumps({"status": "approved", "result_id": args.approve_result,
                              "target_athlete_id": args.target_athlete, "person_key": person_key}, indent=2))
            return
        report = build_candidate_report(conn)
        if args.record_pending:
            report["pending_rows_added"] = record_pending(conn, report)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        therm_candidates = [item for item in report["candidates"] if item["normalized_name"] == "therese fredriksson"]
        markdown = ["# U20 identity candidate review", "",
                    f"Exact-normalized-name candidates: **{report['candidate_count']:,}**; same-edition/identity conflicts: **{report['collision_count']:,}**.",
                    "", "This report is read-only by default. No candidate was automatically merged or linked to a `person_key`.",
                    "Club, city, nationality, age and class progression are shown as review evidence, not proof of identity.",
                    "", "## Required review flow", "",
                    "First register pending candidates only if a SQLite review queue is explicitly wanted: `python tools/u20_identity_review.py --record-pending`. This does not merge identities.",
                    "After a human reviews evidence, approval requires the pending result/target pair, reviewer, opaque event-scoped person reference and written evidence note:",
                    "", "```text", "python tools/u20_identity_review.py --approve-result <result_id> --target-athlete <candidate_athlete_id> --reviewer <reviewer> --person-ref <opaque_event_person_ref> --evidence-note <review_evidence>", "```",
                    "", "Approval is not run by this audit. It atomically reassigns only that result to the selected athlete, records verified `identity_evidence`, and never infers a merge from name/demographics alone.",
                    "", "## Therese Fredriksson review case", ""]
        if therm_candidates:
            for candidate in therm_candidates:
                markdown.append(f"- Result {candidate['result_id']} ({candidate['race_key']}, {candidate['age_class']}): candidate athlete {candidate['candidate_athlete_id']} from result {candidate['target_result_id']} ({candidate['target_year']}, {candidate['target_age_class']}); {'; '.join(candidate['reasons'])}; decision=`pending-review`, hard conflict={candidate['hard_conflict']}.")
        else:
            markdown.append("No unresolved exact-name candidate for this name was found in the audited export.")
        markdown += ["", "## Same-edition collisions", "", f"{report['collision_count']:,} exact-name groups were held out as hard conflicts. See the JSON report for individual result IDs."]
        md_path = args.report.with_suffix(".md")
        md_path.write_text("\n".join(markdown) + "\n", encoding="utf-8")
        print(json.dumps({"status": "candidate-report", "candidates": report["candidate_count"],
                          "same_edition_collisions": report["collision_count"],
                          "pending_rows_added": report.get("pending_rows_added", 0), "report": str(args.report), "markdown": str(md_path)},
                         ensure_ascii=False, indent=2))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
