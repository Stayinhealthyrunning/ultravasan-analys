#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class RouteBuildTests(unittest.TestCase):
    def test_build_keeps_uv90_and_uv45_and_syncs_json_js(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out_json = Path(temp) / "routes.json"
            out_js = Path(temp) / "routes.js"
            subprocess.run([
                sys.executable, str(ROOT / "tools" / "build_routes.py"),
                "--out-json", str(out_json), "--out-js", str(out_js),
            ], cwd=ROOT, check=True)
            registry = json.loads(out_json.read_text(encoding="utf-8"))
            js = out_js.read_text(encoding="utf-8")
            from_js = json.loads(js.split("=", 1)[1].split(";", 1)[0])
            self.assertEqual(registry, from_js)
            self.assertIn("ultravasan90-pre2023", registry["routes"])
            self.assertIn("ultravasan90-post2023", registry["routes"])
            self.assertIn("ultravasan45-current", registry["routes"])
            self.assertTrue(any(rule.get("race_key_prefix") == "ultravasan45-" for rule in registry["route_for_race"]))
            uv45 = registry["routes"]["ultravasan45-current"]
            self.assertEqual("UV45_20260610.kmz", uv45["source_file"])
            self.assertEqual(45.0, uv45["official_distance_km"])
            self.assertGreater(len(uv45["points"]), 1000)
            self.assertEqual(
                ["start", "lillsjon", "oxberg", "hokberg", "eldris", "mora_warning", "finish"],
                [checkpoint["key"] for checkpoint in uv45["checkpoints"]],
            )
            old = registry["routes"]["ultravasan90-pre2023"]
            current = registry["routes"]["ultravasan90-post2023"]
            self.assertTrue(old["elevation_available"])
            self.assertGreater(len(old["elevation_profile"]), 100)
            self.assertEqual(0, old["elevation_profile"][0][0])
            self.assertAlmostEqual(old["official_distance_km"], old["elevation_profile"][-1][0], places=3)
            self.assertFalse(uv45["elevation_available"])
            self.assertEqual([], uv45["elevation_profile"])
            self.assertFalse(current["elevation_available"])
            self.assertEqual([], current["elevation_profile"])


if __name__ == "__main__":
    unittest.main()
