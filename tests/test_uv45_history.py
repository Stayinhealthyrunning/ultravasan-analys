import json
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


def observed_2015_detail(
    *, name: str, age_class: str, status: str, total_time: str | None,
    splits: list[tuple[str, str]],
) -> str:
    total = (
        f"<tr class='f-time_finish_brutto'><th>Totaltid (Brutto)</th>"
        f"<td class='f-time_finish_brutto'>{total_time}</td></tr>"
        if total_time else ""
    )
    split_rows = "".join(
        f"<tr class='{'f-time_finish_netto' if label == 'Mål' else 'split'}'>"
        f"<th class='desc'>{label}</th><td class='time'>{elapsed}</td></tr>"
        for label, elapsed in splits
    )
    return f"""
    <table>
      <tr><th>Namn</th><td class='f-__fullname'>{name}</td></tr>
      <tr><th>Klass</th><td class='f-age_class'>{age_class}</td></tr>
      <tr><th>Status</th><td class='f-status'>{status}</td></tr>
      {total}
    </table>
    <table><tr><th>Mellantid</th><th>Tid</th></tr>{split_rows}</table>
    """


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

    def test_startat_is_supported_unknown_status_case_insensitively(self) -> None:
        for source in ("STARTAT", "startat", "  Startat  "):
            with self.subTest(source=source):
                self.assertEqual("UNKNOWN", uvtool.normalize_result_status(source))

    def test_exact_2015_startat_record(self) -> None:
        parsed = uvtool.parse_detail_html(
            observed_2015_detail(
                name="Hårrskog, Andreas (SWE)", age_class="M45",
                status="Startat", total_time=None, splits=[],
            ),
            "UL45_9999991678885A000000043D:9999991678885A00001FFB7E",
            "https://results.vasaloppet.se/2016/",
            RACES["ultravasan45-2015"]["checkpoints"],
        )
        self.assertEqual("Hårrskog, Andreas", parsed.name)
        self.assertEqual("M45", parsed.age_class)
        self.assertEqual("M", parsed.sex)
        self.assertEqual("UNKNOWN", parsed.status)
        self.assertIsNone(parsed.finish_seconds)
        self.assertEqual([], parsed.splits)

    def test_exact_2015_gender_neutral_records_are_not_name_guessed(self) -> None:
        cases = [
            ("Irestedt Horne, Vemund (NOR)", "–", "05:18:26", "NOR"),
            ("Sardagna, Carmela (ITA)", "�", "05:19:15", "ITA"),
        ]
        for index, (name, age_class, finish, nationality) in enumerate(cases):
            with self.subTest(name=name):
                parsed = uvtool.parse_detail_html(
                    observed_2015_detail(
                        name=name, age_class=age_class, status="I mål", total_time=finish,
                        splits=[
                            ("Oxberg", "01:40:00"), ("Hökberg", "02:40:00"),
                            ("Eldris", "04:00:00"), ("Mål", finish),
                        ],
                    ),
                    f"UL45_9999991678885A000000043D:neutral-{index}",
                    "https://results.vasaloppet.se/2016/",
                    RACES["ultravasan45-2015"]["checkpoints"],
                )
                self.assertIsNone(parsed.age_class)
                self.assertIsNone(parsed.sex)
                self.assertEqual(nationality, parsed.nationality)
                self.assertEqual("FINISHED", parsed.status)

    def test_neutral_or_missing_class_never_uses_the_name(self) -> None:
        self.assertIsNone(uvtool.sex_code(None, "Motion"))
        self.assertIsNone(uvtool.sex_code(None, None))
        self.assertIsNone(uvtool.sex_code(None, "Carmela"))

    def test_exact_2024_northman_record_has_legitimately_missing_nationality(self) -> None:
        parsed = uvtool.parse_detail_html(
            observed_2015_detail(
                name="Northman, Mikael", age_class="M45", status="I mål",
                total_time="04:41:05",
                splits=[
                    ("Oxberg", "01:36:18"), ("Hökberg", "02:34:05"),
                    ("Eldris", "03:40:02"), ("Mål", "04:41:05"),
                ],
            ),
            "UL45_HCH8NDMR2401:HCH8NDMRA3894D",
            "https://results.vasaloppet.se/2025/",
            RACES["ultravasan45-2024"]["checkpoints"],
        )
        self.assertEqual("Northman, Mikael", parsed.name)
        self.assertEqual("M45", parsed.age_class)
        self.assertEqual("M", parsed.sex)
        self.assertIsNone(parsed.nationality)
        self.assertEqual("FINISHED", parsed.status)
        self.assertEqual(4 * 3600 + 41 * 60 + 5, parsed.finish_seconds)
        self.assertIsNone(uvtool.nationality_value_in_raw(parsed.raw))

    def test_explicit_nationality_field_is_still_parsed(self) -> None:
        html = observed_2015_detail(
            name="Explicit Runner", age_class="M45", status="I mål",
            total_time="04:00:00",
            splits=[("Mål", "04:00:00")],
        ).replace(
            "<tr><th>Status</th>",
            "<tr><th>Nationalitet</th><td>SWE</td></tr><tr><th>Status</th>",
        )
        parsed = uvtool.parse_detail_html(
            html, "UL45_TEST:explicit-nationality", "https://example.invalid/",
            RACES["ultravasan45-2024"]["checkpoints"],
        )
        self.assertEqual("SWE", parsed.nationality)
        self.assertEqual("SWE", uvtool.nationality_value_in_raw(parsed.raw))

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

    def test_quality_gate_accepts_missing_sex_only_for_neutral_class(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / "neutral.sqlite"
            uvtool.init_db(db, ROOT / "config" / "races.json")
            conn = uvtool.connect(db)
            race = conn.execute("SELECT * FROM races WHERE race_key='ultravasan45-2015'").fetchone()
            source = conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
            checkpoints = RACES["ultravasan45-2015"]["checkpoints"]
            neutral = uvtool.ParsedResult(
                source_result_id="UL45_9999991678885A000000043D:neutral",
                name="Neutral Test", sex=None, age_class=None, nationality="NOR",
                status="FINISHED", finish_seconds=19000,
                splits=[
                    {"checkpoint_key": "oxberg", "elapsed_seconds": 6000},
                    {"checkpoint_key": "hokberg", "elapsed_seconds": 10000},
                    {"checkpoint_key": "eldris", "elapsed_seconds": 14500},
                    {"checkpoint_key": "mora", "elapsed_seconds": 19000},
                ],
            )
            uvtool.save_result(conn, race["id"], source["id"], 45.0, checkpoints, neutral)
            conn.commit()
            issues = validate_uv45_history.collect_race_issues(
                conn, "ultravasan45-2015", "UL45_9999991678885A000000043D"
            )
            self.assertFalse(any("kön saknas" in issue for issue in issues), issues)

            conn.execute("UPDATE results SET age_class='H40',sex=NULL")
            conn.commit()
            issues = validate_uv45_history.collect_race_issues(
                conn, "ultravasan45-2015", "UL45_9999991678885A000000043D"
            )
            self.assertTrue(any("kön saknas trots könsbärande klass" in issue for issue in issues), issues)
            conn.close()

    def test_uv45_2025_and_uv90_class_rules_remain_supported(self) -> None:
        self.assertEqual("M", uvtool.sex_code(None, "M35"))
        self.assertEqual("F", uvtool.sex_code(None, "K35"))
        self.assertEqual("M", uvtool.sex_code("Man", None))
        self.assertEqual("F", uvtool.sex_code("Kvinna", None))
        self.assertEqual("mora_warning", RACES["ultravasan45-2025"]["checkpoints"][-2]["checkpoint_key"])
        self.assertEqual("smagan", RACES["ultravasan90-2025"]["checkpoints"][1]["checkpoint_key"])

    def test_nationality_gate_uses_source_evidence_not_name_or_place(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / "nationality.sqlite"
            uvtool.init_db(db, ROOT / "config" / "races.json")
            conn = uvtool.connect(db)
            race = conn.execute("SELECT * FROM races WHERE race_key='ultravasan45-2024'").fetchone()
            source = conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
            checkpoints = RACES["ultravasan45-2024"]["checkpoints"]
            missing = uvtool.ParsedResult(
                source_result_id="UL45_HCH8NDMR2401:HCH8NDMRA3894D",
                name="Northman, Mikael", sex="M", age_class="M45", nationality=None,
                club="Stockholm", city="Mora", status="FINISHED", finish_seconds=16865,
                splits=[
                    {"checkpoint_key": "oxberg", "elapsed_seconds": 5778},
                    {"checkpoint_key": "hokberg", "elapsed_seconds": 9245},
                    {"checkpoint_key": "eldris", "elapsed_seconds": 13202},
                    {"checkpoint_key": "mora", "elapsed_seconds": 16865},
                ],
                raw={
                    "selector_values": {"nationality": None},
                    "published_name_original": "Northman, Mikael",
                },
            )
            uvtool.save_result(conn, race["id"], source["id"], 45.0, checkpoints, missing)
            conn.commit()
            issues = validate_uv45_history.collect_race_issues(
                conn, "ultravasan45-2024", "UL45_HCH8NDMR2401"
            )
            self.assertFalse(any("nationalitet saknas" in issue for issue in issues), issues)

            conn.execute(
                "UPDATE results SET raw_json=? WHERE source_result_id=?",
                (json.dumps({"selector_values": {"nationality": "SWE"}}), missing.source_result_id),
            )
            conn.commit()
            issues = validate_uv45_history.collect_race_issues(
                conn, "ultravasan45-2024", "UL45_HCH8NDMR2401"
            )
            self.assertTrue(any("nationalitet saknas trots källvärdet" in issue for issue in issues), issues)
            conn.close()


if __name__ == "__main__":
    unittest.main()
