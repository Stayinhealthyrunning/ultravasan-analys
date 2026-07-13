import re
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import uvtool  # noqa: E402
import validate_uv45_history  # noqa: E402


CONFIG = uvtool.load_config(ROOT / "config" / "races.json")
RACES = {race["race_key"]: race for race in CONFIG["races"]}


class HistoricalParserRegressionTests(unittest.TestCase):
    def test_historical_and_current_class_prefixes(self) -> None:
        expected = {
            "H21": "M", "H40": "M", "M35": "M", "M75": "M",
            "D21": "F", "D50": "F", "K35": "F", "F40": "F", "W50": "F",
        }
        for age_class, sex in expected.items():
            with self.subTest(age_class=age_class):
                self.assertEqual(sex, uvtool.sex_code(None, age_class))

    def test_startade_inte_is_dns_case_insensitively(self) -> None:
        for source in ("Startade inte", "STARTADE INTE", "  startade inte  "):
            with self.subTest(source=source):
                self.assertEqual("DNS", uvtool.normalize_result_status(source))

    def test_empty_club_city_never_becomes_the_label(self) -> None:
        html = """
        <table>
          <tr><th>Namn</th><td class="f-__fullname">Testlöpare (SWE)</td></tr>
          <tr class="f-club"><th>Klubb/Stad</th><td class="f-club"></td></tr>
          <tr><th>Klass</th><td>H40</td></tr>
          <tr><th>Status</th><td>Startade inte</td></tr>
        </table>
        """
        parsed = uvtool.parse_detail_html(
            html,
            "UL45_TEST:empty-club",
            "https://results.vasaloppet.se/",
            RACES["ultravasan45-2019"]["checkpoints"],
        )
        self.assertIsNone(parsed.club)
        self.assertIsNone(parsed.city)
        self.assertNotEqual("Klubb/Stad", parsed.raw["selector_values"].get("club"))
        self.assertEqual("DNS", parsed.status)


class HistoricalConfigurationTests(unittest.TestCase):
    def test_verified_event_code_for_every_import_year(self) -> None:
        self.assertEqual([], validate_uv45_history.collect_config_issues(CONFIG))
        for year, event_code in validate_uv45_history.HISTORY_EVENTS.items():
            self.assertEqual(event_code, RACES[f"ultravasan45-{year}"]["event_code"])

    def test_checkpoint_sets_a_and_b_are_separate(self) -> None:
        for year in validate_uv45_history.HISTORY_EVENTS:
            keys = [item["checkpoint_key"] for item in RACES[f"ultravasan45-{year}"]["checkpoints"]]
            self.assertEqual(validate_uv45_history.CHECKPOINT_SET_A, keys)
        current_keys = [item["checkpoint_key"] for item in RACES["ultravasan45-2025"]["checkpoints"]]
        self.assertEqual(validate_uv45_history.CHECKPOINT_SET_B, current_keys)

    def test_excluded_years_are_not_historical_races(self) -> None:
        historical_years = set(validate_uv45_history.HISTORY_EVENTS)
        self.assertTrue(historical_years.isdisjoint(validate_uv45_history.EXCLUDED_HISTORY_YEARS))
        configured = {race["year"] for race in CONFIG["races"] if race.get("race_family") == "uv45"}
        self.assertNotIn(2020, configured)
        self.assertNotIn(2021, configured)
        self.assertNotIn(2026, configured)
        self.assertIn(2025, configured)


class HistoricalImportSafetyTests(unittest.TestCase):
    def test_uv45_save_is_idempotent_and_cannot_touch_uv90(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / "probe.sqlite"
            uvtool.init_db(db, ROOT / "config" / "races.json")
            conn = uvtool.connect(db)
            race = conn.execute("SELECT * FROM races WHERE race_key='ultravasan45-2014'").fetchone()
            source = conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
            checkpoints = RACES["ultravasan45-2014"]["checkpoints"]
            before = validate_uv45_history.uv90_snapshot(conn)
            parsed = uvtool.ParsedResult(
                source_result_id="UL45_000017167888590000000399:stable-id",
                name="Historisk Testlöpare",
                sex="M",
                age_class="H40",
                nationality="SWE",
                status="FINISHED",
                finish_seconds=4 * 3600,
                splits=[
                    {"checkpoint_key": "oxberg", "elapsed_seconds": 3600},
                    {"checkpoint_key": "hokberg", "elapsed_seconds": 2 * 3600},
                    {"checkpoint_key": "eldris", "elapsed_seconds": 3 * 3600},
                    {"checkpoint_key": "mora", "elapsed_seconds": 4 * 3600},
                ],
            )
            first_id, first_new = uvtool.save_result(
                conn, race["id"], source["id"], race["distance_km"], checkpoints, parsed
            )
            second_id, second_new = uvtool.save_result(
                conn, race["id"], source["id"], race["distance_km"], checkpoints, parsed
            )
            conn.commit()

            self.assertTrue(first_new)
            self.assertFalse(second_new)
            self.assertEqual(first_id, second_id)
            self.assertEqual(1, conn.execute(
                "SELECT COUNT(*) FROM results WHERE race_id=?", (race["id"],)
            ).fetchone()[0])
            self.assertEqual(4, conn.execute(
                "SELECT COUNT(*) FROM splits WHERE result_id=?", (first_id,)
            ).fetchone()[0])
            self.assertEqual(before, validate_uv45_history.uv90_snapshot(conn))
            self.assertEqual(0, conn.execute("""
                SELECT COUNT(*) FROM splits sp
                JOIN results r ON r.id=sp.result_id
                JOIN checkpoints cp ON cp.id=sp.checkpoint_id
                WHERE r.race_id<>cp.race_id
            """).fetchone()[0])
            conn.close()

    def test_workflow_has_exact_years_and_safety_gates(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "importera-uv45-historik.yml").read_text(encoding="utf-8")
        pairs = re.findall(r"^    (\d{4})\|(ultravasan45-\d{4})\|([^\s]+)$", workflow, re.MULTILINE)
        years = [int(year) for year, _race, _event in pairs]
        events = {int(year): event for year, _race, event in pairs}
        self.assertEqual(list(validate_uv45_history.HISTORY_EVENTS), years)
        self.assertEqual(validate_uv45_history.HISTORY_EVENTS, events)
        self.assertTrue(set(years).isdisjoint({2020, 2021, 2025, 2026}))

        full_input = workflow.index("full_import_confirmed:")
        self.assertIn("default: false", workflow[full_input:full_input + 300])
        backup = workflow.index("- name: Säkerhetskopiera databasen")
        probe = workflow.index("- name: Probe och kvalitetsgrind för varje år")
        full_import = workflow.index("- name: Importera de nio historikåren")
        validation = workflow.index("- name: Validera hela databasen")
        publication = workflow.index("- name: Publicera den validerade historikimporten")
        self.assertLess(backup, probe)
        self.assertLess(probe, full_import)
        self.assertLess(full_import, validation)
        self.assertLess(validation, publication)
        self.assertIn("--limit 3", workflow[probe:full_import])
        self.assertIn("inputs.full_import_confirmed == true", workflow[full_import:publication])
        self.assertIn("--compare-uv90-snapshot", workflow)
        self.assertIn("tools/validate_uv45_history.py", workflow)


if __name__ == "__main__":
    unittest.main()
