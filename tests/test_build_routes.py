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
            from_js = json.loads(js.split("=", 1)[1].split(";\nwindow.", 1)[0])
            self.assertEqual(registry, from_js)
            self.assertIn("ultravasan90-pre2023", registry["routes"])
            self.assertIn("ultravasan90-post2023", registry["routes"])
            self.assertIn("ultravasan45-current", registry["routes"])
            self.assertTrue(any(rule.get("race_key_prefix") == "ultravasan45-" for rule in registry["route_for_race"]))
            uv45 = registry["routes"]["ultravasan45-current"]
            self.assertEqual("data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx", uv45["source_file"])
            self.assertEqual(45.0, uv45["official_distance_km"])
            self.assertEqual(2367, uv45["source_point_count"])
            self.assertGreater(len(uv45["points"]), 400)
            self.assertEqual(
                ["start", "lillsjon", "oxberg", "hokberg", "eldris", "mora_warning", "finish"],
                [checkpoint["key"] for checkpoint in uv45["checkpoints"]],
            )
            old = registry["routes"]["ultravasan90-pre2023"]
            current = registry["routes"]["ultravasan90-post2023"]
            self.assertEqual("data/routes/Ultravasan 90 2022.gpx", old["source_file"])
            self.assertEqual("data/routes/vasaloppet-ultravasan-2024-ultravasan-90.gpx", current["source_file"])
            self.assertEqual(2499, old["source_point_count"])
            self.assertEqual(3906, current["source_point_count"])
            for route, minimum, maximum, distance_range in (
                (old, 150, 550, (89.5, 90.5)),
                (current, 150, 560, (91.0, 92.5)),
                (uv45, 150, 320, (43.0, 45.0)),
            ):
                self.assertEqual("verified-gpx", route["source_type"])
                self.assertTrue(route["elevation_available"])
                self.assertEqual(100, route["source_quality"]["elevation_coverage_pct"])
                self.assertGreater(len(route["elevation_profile"]), 100)
                self.assertEqual(0, route["elevation_profile"][0][0])
                self.assertAlmostEqual(route["official_distance_km"], route["elevation_profile"][-1][0], places=3)
                self.assertGreaterEqual(route["min_elevation_m"], minimum)
                self.assertLessEqual(route["max_elevation_m"], maximum)
                self.assertGreaterEqual(route["total_distance_km"], distance_range[0])
                self.assertLessEqual(route["total_distance_km"], distance_range[1])
                self.assertGreater(route["total_ascent_m"], 400)
                self.assertGreater(route["total_descent_m"], 400)
                self.assertLess(route["point_count"], route["source_point_count"])
                self.assertLessEqual(route["processing"]["max_geometry_deviation_m"], 4.01)
                distances = [point[2] for point in route["points"]]
                ascents = [point[5] for point in route["points"]]
                descents = [point[6] for point in route["points"]]
                self.assertTrue(all(a <= b for a, b in zip(distances, distances[1:])))
                self.assertTrue(all(a <= b for a, b in zip(ascents, ascents[1:])))
                self.assertTrue(all(a <= b for a, b in zip(descents, descents[1:])))
                self.assertTrue(all(point[3] is not None for point in route["points"]))
                self.assertTrue(all(point[4] is None or abs(point[4]) <= 35 for point in route["points"]))
                checkpoint_distances = [checkpoint["distance_km"] for checkpoint in route["checkpoints"]]
                self.assertTrue(all(a < b for a, b in zip(checkpoint_distances, checkpoint_distances[1:])))
                self.assertTrue(all(len(checkpoint["coord"]) == 2 for checkpoint in route["checkpoints"]))
            warning = next(checkpoint for checkpoint in uv45["checkpoints"] if checkpoint["key"] == "mora_warning")
            finish = next(checkpoint for checkpoint in uv45["checkpoints"] if checkpoint["key"] == "finish")
            self.assertLess(warning["distance_km"], finish["distance_km"])
            self.assertNotEqual(warning["coord"], finish["coord"])

            second_json = Path(temp) / "routes-second.json"
            second_js = Path(temp) / "routes-second.js"
            subprocess.run([
                sys.executable, str(ROOT / "tools" / "build_routes.py"),
                "--out-json", str(second_json), "--out-js", str(second_js),
            ], cwd=ROOT, check=True)
            self.assertEqual(out_json.read_bytes(), second_json.read_bytes())
            self.assertEqual(out_js.read_bytes(), second_js.read_bytes())


if __name__ == "__main__":
    unittest.main()
