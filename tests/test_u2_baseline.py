from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))

import u2_baseline
import u2_identity_migration
import uvtool

U3_BASELINE = ROOT / "reports" / "U3_BASELINE.json"


@unittest.skipUnless(u2_baseline.DEFAULT_BASELINE.exists(), "U2 production baseline not applied yet")
@unittest.skipIf(U3_BASELINE.exists(), "U2 exact web-data baseline is historical after U3 activation")
class U2BaselineTests(unittest.TestCase):
    def test_checked_in_u2_data_matches_baseline(self) -> None:
        expected = json.loads(u2_baseline.DEFAULT_BASELINE.read_text(encoding="utf-8"))
        actual = u2_baseline.build_snapshot()
        self.assertEqual([], u2_baseline.validate_snapshot(actual))
        self.assertEqual(u2_baseline.comparable_snapshot(expected), u2_baseline.comparable_snapshot(actual))


class U2BaselineBuilderTests(unittest.TestCase):
    def test_migrated_copy_satisfies_u2_identity_counts_before_web_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "u2.sqlite"
            shutil.copy2(ROOT / "data" / "ultravasan.sqlite", target)
            conn = uvtool.connect(target)
            try:
                report = u2_identity_migration.execute(conn, apply=True)
            finally:
                conn.close()
            self.assertEqual(20805, report["migrated_state"]["athletes"])
            self.assertEqual(9571, report["migrated_state"]["person_keys"])
            self.assertEqual(20805, report["migrated_state"]["identity_evidence"])
            self.assertEqual(0, report["migrated_state"]["cross_source_athletes"])


if __name__ == "__main__":
    unittest.main()
