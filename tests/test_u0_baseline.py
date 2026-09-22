#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import u0_baseline  # noqa: E402


class U0BaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.expected = json.loads(u0_baseline.DEFAULT_BASELINE.read_text(encoding="utf-8"))
        cls.actual = u0_baseline.build_snapshot(cls.expected["source"]["git_commit"])

    def test_checked_in_data_matches_golden_master(self) -> None:
        self.assertEqual(self.expected, self.actual)

    def test_all_database_editions_are_explicitly_configured(self) -> None:
        config = json.loads((ROOT / "config" / "races.json").read_text(encoding="utf-8"))
        configured = {race["race_key"]: race for race in config["races"]}
        baseline = {race["race_key"]: race for race in self.expected["editions"]}
        self.assertEqual(set(baseline), set(configured))
        self.assertEqual(22, len(configured))
        for race_key, expected in baseline.items():
            race = configured[race_key]
            self.assertIn(race["race_family"], {"uv90", "uv45"}, race_key)
            for field in ("name", "year", "distance_km", "course_version"):
                self.assertEqual(expected[field], race[field], f"{race_key}: {field}")
            self.assertTrue(race["checkpoints"], f"{race_key}: checkpoints")
            checkpoint_keys = [checkpoint["checkpoint_key"] for checkpoint in race["checkpoints"]]
            self.assertEqual(len(checkpoint_keys), len(set(checkpoint_keys)), f"{race_key}: checkpoint keys")

    def test_baseline_integrity_gates_are_clean(self) -> None:
        checks = self.actual["checks"]
        self.assertEqual("ok", checks["integrity_check"])
        self.assertEqual(0, checks["foreign_key_violations"])
        self.assertTrue(all(value == 0 for value in checks["orphan_rows"].values()))
        self.assertEqual(0, checks["duplicate_result_keys"])
        self.assertEqual(0, checks["duplicate_split_keys"])
        self.assertEqual(0, checks["same_race_athlete_groups"])
        self.assertTrue(all(self.actual["web_export"]["parity"].values()))


if __name__ == "__main__":
    unittest.main()
