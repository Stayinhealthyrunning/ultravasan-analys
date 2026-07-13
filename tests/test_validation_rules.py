#!/usr/bin/env python3
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import uvtool  # noqa: E402


class RaceValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.conn = uvtool.connect(Path(":memory:"))
        self.conn.executescript((ROOT / "tools" / "schema.sql").read_text(encoding="utf-8"))
        uvtool.upsert_catalogue(self.conn, uvtool.load_config(uvtool.DEFAULT_CONFIG))
        self.source_id = self.conn.execute(
            "SELECT id FROM sources WHERE code='manual'"
        ).fetchone()[0]
        self.races = {
            row["race_key"]: row["id"]
            for row in self.conn.execute("SELECT id,race_key FROM races")
        }

    def tearDown(self) -> None:
        self.conn.close()

    def add_result(self, race_key: str, seconds: int, suffix: str) -> None:
        athlete_id = self.conn.execute("""
            INSERT INTO athletes(canonical_name,normalized_name) VALUES(?,?)
        """, (f"Runner {suffix}", f"runner {suffix}")).lastrowid
        self.conn.execute("""
            INSERT INTO results(race_id,athlete_id,source_id,source_result_id,name_as_published,status,finish_seconds)
            VALUES(?,?,?,?,?,'FINISHED',?)
        """, (self.races[race_key], athlete_id, self.source_id, suffix, f"Runner {suffix}", seconds))

    def issues(self) -> list[str]:
        return uvtool.collect_validation_issues(self.conn, uvtool.load_config(uvtool.DEFAULT_CONFIG))

    def test_fast_legitimate_uv45_time_is_allowed(self) -> None:
        self.add_result("ultravasan45-2025", 3 * 3600, "uv45-legit")
        self.assertEqual([], self.issues())

    def test_impossibly_fast_uv45_time_is_rejected(self) -> None:
        self.add_result("ultravasan45-2025", 60 * 60, "uv45-impossible")
        self.assertTrue(any("ultravasan45-2025" in issue and "orimligt låg" in issue for issue in self.issues()))

    def test_uv90_minimum_remains_four_hours(self) -> None:
        self.add_result("ultravasan90-2025", 3 * 3600, "uv90-impossible")
        self.assertTrue(any("ultravasan90-2025" in issue and "orimligt låg" in issue for issue in self.issues()))
        self.conn.execute("DELETE FROM results")
        self.add_result("ultravasan90-2025", 5 * 3600, "uv90-legit")
        self.assertEqual([], self.issues())


if __name__ == "__main__":
    unittest.main()
