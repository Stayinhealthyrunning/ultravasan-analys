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
            prefix = "window.ULTRAVASAN_ROUTES = "
            self.assertTrue(js.startswith(prefix) and js.endswith(";\n"))
            from_js = json.loads(js[len(prefix):-2])
            self.assertEqual(registry, from_js)
            self.assertNotIn("default_route_id", registry)
            self.assertNotIn("window.ULTRAVASAN_ROUTE =", js)
            self.assertIn("ultravasan90-pre2023", registry["routes"])
            self.assertIn("ultravasan90-post2023", registry["routes"])
            self.assertIn("ultravasan45-current", registry["routes"])
            race_config = json.loads((ROOT / "config" / "races.json").read_text(encoding="utf-8"))
            course_config = json.loads((ROOT / "config" / "course_versions.json").read_text(encoding="utf-8"))
            edition_routes = json.loads((ROOT / "config" / "edition_routes.json").read_text(encoding="utf-8"))["editions"]
            expected_routes = {
                race["race_key"]: edition_routes.get(race["race_key"], {}).get(
                    "display_route_id", course_config["courses"][race["course_version_id"]]["display_route_id"]
                )
                for race in race_config["races"]
            }
            self.assertEqual(expected_routes, registry["route_for_edition"])
            contracts = registry["edition_route_contracts"]
            self.assertEqual(set(expected_routes), set(contracts))
            self.assertEqual("exact-source-year", contracts["ultravasan90-2022"]["display_geometry_usage"])
            self.assertEqual("exact-source-year", contracts["ultravasan90-2018"]["display_geometry_usage"])
            self.assertEqual("exact-source-year", contracts["ultravasan90-2024"]["display_geometry_usage"])
            self.assertEqual("exact-source-year", contracts["ultravasan90-2023"]["display_geometry_usage"])
            self.assertEqual("exact-source-year", contracts["ultravasan90-2026"]["display_geometry_usage"])
            self.assertEqual("exact-source-year", contracts["ultravasan45-2018"]["display_geometry_usage"])
            self.assertEqual("exact-source-year", contracts["ultravasan45-2019"]["display_geometry_usage"])
            self.assertEqual("exact-source-year", contracts["ultravasan45-2024"]["display_geometry_usage"])
            self.assertEqual("exact-source-year", contracts["ultravasan45-2026"]["display_geometry_usage"])
            for key in ("ultravasan90-2017", "ultravasan90-2025", "ultravasan45-2017", "ultravasan45-2025"):
                self.assertEqual("verified-shared-course", contracts[key]["display_geometry_usage"])
            for key in ("ultravasan90-2014", "ultravasan90-2015", "ultravasan90-2016", "ultravasan90-2019",
                        "ultravasan45-2014", "ultravasan45-2015", "ultravasan45-2016", "ultravasan45-2022", "ultravasan45-2023"):
                self.assertEqual("reference-only", contracts[key]["display_geometry_usage"])
            self.assertEqual(2026, contracts["ultravasan90-2026"]["display_geometry_source_year"])
            self.assertIsNone(contracts["ultravasan90-2023"]["whole_course_comparison_group"])
            self.assertEqual("ultravasan90-2024-2025", contracts["ultravasan90-2024"]["whole_course_comparison_group"])
            self.assertEqual("ultravasan90-2024-2025", contracts["ultravasan90-2025"]["whole_course_comparison_group"])
            self.assertIsNone(contracts["ultravasan90-2026"]["whole_course_comparison_group"])
            self.assertTrue(all(
                item["whole_course_comparison_group"] is None
                for key, item in contracts.items()
                if key not in {"ultravasan90-2024", "ultravasan90-2025"}
            ))
            self.assertNotIn("route_for_race", registry)
            self.assertNotIn("route_for_year", registry)
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
            for key, expected_file, expected_year in (
                ("ultravasan90-2018", "source/routes/ultravasan90-2018-itra-51602.gpx", 2018),
                ("ultravasan90-2023", "source/routes/ultravasan90-2023-itra-229687.gpx", 2023),
                ("ultravasan45-2018", "source/routes/ultravasan45-2018-itra-51603.gpx", 2018),
                ("ultravasan45-2019", "source/routes/ultravasan45-2019-itra-75784.gpx", 2019),
                ("ultravasan45-2024", "source/routes/ultravasan45-2024-itra-267130.gpx", 2024),
            ):
                annual = registry["routes"][expected_routes[key]]
                self.assertEqual(expected_file, annual["source_file"])
                self.assertEqual(expected_year, annual["source_year"])
                self.assertEqual("ITRA / Trace de Trail", annual["source_provider"])
                self.assertTrue(annual["source_url"].startswith("https://tracedetrail.fr/"))
                self.assertGreater(annual["source_point_count"], 1000)
                self.assertGreaterEqual(annual["source_quality"]["elevation_coverage_pct"], 95)
            for key in ("ultravasan45-2018", "ultravasan45-2019"):
                annual = registry["routes"][expected_routes[key]]
                provenance = annual["elevation_provenance"]
                self.assertTrue(annual["elevation_available"])
                self.assertLess(annual["source_quality"]["elevation_original_coverage_pct"], 65)
                self.assertEqual("spatial-nearest-segment-with-progress-guard", provenance["method"])
                self.assertEqual(50.0, provenance["max_match_distance_m"])
                self.assertEqual(2024, provenance["donor_year"])
                self.assertEqual("source/routes/ultravasan45-2024-itra-267130.gpx", provenance["donor_file"])
                self.assertGreater(provenance["observed_validation_match_pct"], 99)
                self.assertLess(provenance["validation_p95_abs_error_m"], 3)
                self.assertGreater(provenance["transferred_missing_pct"], 99)
                self.assertLessEqual(provenance["unmatched_after_transfer"], 4)
            exact_2026 = registry["routes"][expected_routes["ultravasan90-2026"]]
            self.assertEqual("official-organizer-kmz", exact_2026["source_type"])
            self.assertEqual("source/UV-90_20260610.kmz", exact_2026["source_file"])
            self.assertTrue(exact_2026["elevation_available"])
            self.assertEqual("same-year-spatial-donor-with-dem-fallback", exact_2026["elevation_provenance"]["method"])
            self.assertEqual(50.0, exact_2026["elevation_provenance"]["max_match_distance_m"])
            self.assertEqual(52, exact_2026["elevation_provenance"]["dem_fallback_points"])
            self.assertGreater(exact_2026["elevation_provenance"]["donor_match_pct"], 98)
            exact_45_2026 = registry["routes"][expected_routes["ultravasan45-2026"]]
            self.assertEqual("official-organizer-kmz", exact_45_2026["source_type"])
            self.assertEqual("source/UV45_20260610.kmz", exact_45_2026["source_file"])
            self.assertEqual(55, exact_45_2026["elevation_provenance"]["dem_fallback_points"])
            self.assertGreater(exact_45_2026["elevation_provenance"]["donor_match_pct"], 98)
            self.assertEqual("uv90-2026-v1", contracts["ultravasan90-2026"]["course_version_id"])
            self.assertEqual(
                "ultravasan90-post2023",
                course_config["courses"]["uv90-2026-v1"]["display_route_id"],
                "RaceEdition route override must leave the published CourseVersion untouched",
            )
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
            self.assertNotIn(b"\r\n", out_json.read_bytes(), "route JSON export must use deterministic LF bytes")
            self.assertNotIn(b"\r\n", out_js.read_bytes(), "route JavaScript export must use deterministic LF bytes")
            def checkout_lf(path: Path) -> bytes:
                # Git's core.autocrlf may materialize tracked baselines as CRLF on Windows.
                return path.read_bytes().replace(b"\r\n", b"\n")

            self.assertEqual(out_json.read_bytes(), checkout_lf(ROOT / "data" / "routes" / "ultravasan90-routes.json"))
            self.assertEqual(out_js.read_bytes(), checkout_lf(ROOT / "docs" / "data" / "ultravasan-routes.js"))


if __name__ == "__main__":
    unittest.main()
