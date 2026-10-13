"""Prevent publishing jobs from silently losing the private GDPR gate."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"
SECRET = "LOPPANALYS_PRIVACY_REGISTRY_B64"
REQUIRE = 'LOPPANALYS_REQUIRE_PRIVATE_REGISTRY: "1"'


class GDPRWorkflowContractTests(unittest.TestCase):
    def test_automatic_official_import_requires_private_registry(self):
        workflow = (WORKFLOWS / "importera-ultravasan-2026.yml").read_text(encoding="utf-8")
        self.assertIn(SECRET, workflow)
        self.assertIn(REQUIRE, workflow)
        self.assertIn("python tools/automatic_2026_import.py apply", workflow)

    def test_manual_zip_update_disallows_changes_to_sensitive_sources(self):
        workflow = (WORKFLOWS / "installera-uppdatering.yml").read_text(encoding="utf-8")
        self.assertIn(SECRET, workflow)
        self.assertIn(REQUIRE, workflow)
        self.assertIn("load_rules(Path(\"config/privacy-suppressions.json\"), require_private=True)", workflow)
        self.assertIn('protected_roots = (".github", "config", "data", "raw", "tools", "tests")', workflow)
        self.assertIn('canonical.startswith("docs/data/")', workflow)
        self.assertIn("python tools/protect_public_minors.py --check", workflow)
        self.assertLess(workflow.index("Skyddad kod/data"), workflow.index("git push origin"))


if __name__ == "__main__":
    unittest.main()
