from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))

import u3_baseline

U3=u3_baseline.DEFAULT_BASELINE


@unittest.skipUnless(U3.exists(),"U3 production data not activated yet")
class U3BaselineTests(unittest.TestCase):
    def test_checked_in_u3_data_matches_golden_master(self) -> None:
        expected=json.loads(U3.read_text(encoding="utf-8"))
        actual=u3_baseline.build_snapshot()
        self.assertEqual([],u3_baseline.validate(actual))
        self.assertEqual(expected,actual)


if __name__=="__main__":
    unittest.main()
