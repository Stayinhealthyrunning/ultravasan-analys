from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import configure_discovered_event  # noqa: E402
import mika_import  # noqa: E402
import uvtool  # noqa: E402


UV45 = next(
    race for race in uvtool.load_config(ROOT / "config" / "races.json")["races"]
    if race["race_key"] == "ultravasan45-2025"
)
CHECKPOINTS = UV45["checkpoints"]


def detail_html(
    *,
    name: str,
    age_class: str,
    club_city: str,
    status: str,
    total_time: str | None,
    splits: list[tuple[str, str]],
) -> str:
    total_row = (
        f"<tr class='f-time_finish_brutto'><th class='desc'>Totaltid</th>"
        f"<td class='f-time_finish_brutto'>{total_time}</td></tr>"
        if total_time else ""
    )
    split_rows = []
    for label, elapsed in splits:
        finish_class = "f-time_finish_netto" if label == "Mål" else "split"
        split_rows.append(
            f"<tr class='{finish_class}'><th class='desc'>{label}</th>"
            f"<td class='time'>{elapsed}</td><td class='diff'>00:01</td></tr>"
        )
    return f"""
    <html><body>
      <table>
        <tr><th class='desc'>Namn</th><td class='f-__fullname'>{name}</td></tr>
        <tr><th class='desc'>Klubb/Stad</th><td class='f-club'>{club_city}</td></tr>
        <tr><th class='desc'>Klass</th><td>{age_class}</td></tr>
        {total_row}
        <tr><th class='desc'>Status</th><td>{status}</td></tr>
      </table>
      <table>
        <tr><th>Mellantid</th><th>Tid</th></tr>
        {''.join(split_rows)}
      </table>
    </body></html>
    """


class UV45ParserRegressionTests(unittest.TestCase):
    def parse(self, html: str, suffix: str) -> uvtool.ParsedResult:
        return uvtool.parse_detail_html(
            html,
            f"UL45_HCH8NDMR2501:{suffix}",
            "https://results.vasaloppet.se/2026/",
            CHECKPOINTS,
        )

    def test_yavar_biranvand_real_finish_and_identity(self) -> None:
        parsed = self.parse(detail_html(
            name="Biranvand, Yavar (SWE)", age_class="M35",
            club_city="Västerås FK", status="I mål", total_time="03:09:10",
            splits=[
                ("Lillsjön", "00:09:15"), ("Oxberg", "01:06:53"),
                ("Hökberg", "01:47:20"), ("Eldris", "02:31:20"),
                ("Mora Förvarning", "03:07:19"), ("Mål", "03:09:10"),
            ],
        ), "HCH8NDMRA385E1")
        self.assertEqual(3 * 3600 + 9 * 60 + 10, parsed.finish_seconds)
        self.assertNotEqual(3 * 3600 + 7 * 60 + 19, parsed.finish_seconds)
        self.assertEqual("Biranvand, Yavar", parsed.name)
        self.assertEqual("SWE", parsed.nationality)
        self.assertEqual("M", parsed.sex)
        self.assertEqual("Västerås FK", parsed.club)
        self.assertIsNone(parsed.city)
        self.assertEqual("FINISHED", parsed.status)
        split_map = {split["checkpoint_key"]: split for split in parsed.splits or []}
        self.assertEqual(3 * 3600 + 7 * 60 + 19, split_map["mora_warning"]["elapsed_seconds"])
        self.assertEqual(parsed.finish_seconds, split_map["mora"]["elapsed_seconds"])

    def test_erik_andersson_real_finish(self) -> None:
        parsed = self.parse(detail_html(
            name="Andersson, Erik (SWE)", age_class="M50",
            club_city="MANTORP", status="I MÅL", total_time="06:07:24",
            splits=[
                ("Lillsjön", "00:12:00"), ("Oxberg", "02:11:20"),
                ("Hökberg", "03:28:52"), ("Eldris", "04:58:38"),
                ("Mora Förvarning", "06:04:30"), ("Mål", "06:07:24"),
            ],
        ), "HCH8NDMRA3DF7D")
        self.assertEqual(6 * 3600 + 7 * 60 + 24, parsed.finish_seconds)
        self.assertEqual("M", parsed.sex)
        self.assertEqual("SWE", parsed.nationality)
        self.assertIsNone(parsed.club)
        self.assertEqual("MANTORP", parsed.city)

    def test_urban_boberg_dnf_through_hokberg(self) -> None:
        parsed = self.parse(detail_html(
            name="Boberg, Urban (SWE)", age_class="M75",
            club_city="VISBY", status="Brutit", total_time=None,
            splits=[
                ("Lillsjön", "00:15:00"), ("Oxberg", "02:13:36"),
                ("Hökberg", "03:58:40"),
            ],
        ), "HCH8NDMRA3F31A")
        self.assertEqual("DNF", parsed.status)
        self.assertIsNone(parsed.finish_seconds)
        self.assertEqual("M", parsed.sex)
        self.assertEqual("SWE", parsed.nationality)
        self.assertIsNone(parsed.club)
        self.assertEqual("VISBY", parsed.city)
        self.assertEqual(["lillsjon", "oxberg", "hokberg"], [s["checkpoint_key"] for s in parsed.splits or []])

    def test_status_normalization_case_and_whitespace(self) -> None:
        cases = {
            "  brutit  ": "DNF", "BRUTIT": "DNF", "dnf": "DNF",
            " Ej start ": "DNS", "EJ START": "DNS", "dns": "DNS",
            " diskvalificerad ": "DSQ", "DISKVALIFICERAD": "DSQ", "dsq": "DSQ",
            "did not finish": "DNF", "Did Not Start": "DNS", "Disqualified": "DSQ",
        }
        for source, expected in cases.items():
            with self.subTest(source=source):
                self.assertEqual(expected, uvtool.normalize_result_status(source))

    def test_female_classes_and_ambiguous_club_city(self) -> None:
        for age_class in ("K35", "F40", "W50"):
            self.assertEqual("F", uvtool.sex_code(None, age_class))
        club, city, classification = uvtool.classify_club_city("Springarna")
        self.assertEqual("Springarna", club)
        self.assertIsNone(city)
        self.assertEqual("ambiguous-kept-as-club", classification)

    def test_uv45_checkpoint_order_and_mora_distance(self) -> None:
        sequences = [item["sequence_no"] for item in CHECKPOINTS]
        distances = [item["distance_km"] for item in CHECKPOINTS]
        self.assertTrue(all(a < b for a, b in zip(sequences, sequences[1:])))
        self.assertTrue(all(a < b for a, b in zip(distances, distances[1:])))
        self.assertEqual("lillsjon", CHECKPOINTS[1]["checkpoint_key"])
        self.assertEqual("mora_warning", CHECKPOINTS[-2]["checkpoint_key"])
        self.assertEqual(("mora", 45.0), (CHECKPOINTS[-1]["checkpoint_key"], CHECKPOINTS[-1]["distance_km"]))


class UV45SafetyTests(unittest.TestCase):
    def test_relative_and_absolute_raw_paths(self) -> None:
        original = Path.cwd()
        with tempfile.TemporaryDirectory() as temp:
            try:
                os.chdir(temp)
                self.assertEqual(Path(temp, "raw-cache").resolve(), mika_import.resolve_raw_path(Path("raw-cache")))
                absolute = Path(temp, "absolute-cache").resolve()
                self.assertEqual(absolute, mika_import.resolve_raw_path(absolute))
            finally:
                os.chdir(original)

    def test_verified_main_event_wins_generic_and_elite_candidates(self) -> None:
        race = {"race_key": "ultravasan45-2025", "name": "Ultravasan 45", "year": 2025}
        candidates = [
            {"year": 2025, "event_code": "UL45_9999991678885A000000043D", "label": "Ultravasan 45", "result_year_path": 2026},
            {"year": 2025, "event_code": "UL4E_9999991678887600000007BZ", "label": "Ultravasan 45 Elit", "result_year_path": 2026},
            {"year": 2025, "event_code": "UL45_HCH8NDMR2501", "label": "Ultravasan 45", "result_year_path": 2025},
        ]
        selected = configure_discovered_event.select_discovered_event("ultravasan45-2025", race, candidates)
        self.assertEqual("UL45_HCH8NDMR2501", selected["event_code"])

    def test_workflow_requires_explicit_full_import_confirmation(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "importera-aktuella-resultat.yml").read_text(encoding="utf-8")
        self.assertIn("full_import_confirmed:", workflow)
        full_input = workflow.index("full_import_confirmed:")
        self.assertIn("default: false", workflow[full_input:full_input + 250])
        probe = workflow.index("- name: Testa importen på tio löpare")
        validation = workflow.index("- name: Validera probe och parserkvalitet")
        scrape = workflow.index("- name: Importera hela loppet")
        self.assertLess(probe, validation)
        self.assertLess(validation, scrape)
        scrape_block = workflow[scrape:scrape + 500]
        self.assertIn("inputs.full_import_confirmed == true", scrape_block)
        self.assertIn("tools/validate_mika_probe.py", workflow)

    def test_workflow_installs_playwright_before_chromium(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "importera-aktuella-resultat.yml").read_text(encoding="utf-8")
        requirements = (ROOT / "requirements-browser.txt").read_text(encoding="utf-8")
        package_install = workflow.index("python -m pip install -r requirements-browser.txt")
        browser_install = workflow.index("python -m playwright install --with-deps chromium")
        self.assertLess(package_install, browser_install)
        self.assertIn("-r requirements.txt", requirements)
        self.assertIn("playwright", requirements)


if __name__ == "__main__":
    unittest.main()
