"""Regression tests for explicit RaceEdition, competition and source routing."""
from copy import deepcopy
import argparse
import json
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from tools import source_bindings
from tools import mika_import
from tools import uvtool
from tools import vasanerd_import


@pytest.fixture
def config():
    return uvtool.load_config(uvtool.DEFAULT_CONFIG)


def test_real_catalog_has_explicit_competition_and_sources(config):
    resolved = source_bindings.validate_config(config)
    assert len(resolved) == 22
    assert sum(map(len, resolved.values())) == 24
    assert [(item["provider"], item["role"]) for item in resolved["ultravasan90-2016"]] == [
        ("vasanerd", "primary"), ("mika", "enrichment")
    ]
    assert source_bindings.provider_race_config(config, "ultravasan45-2014", "mika")["event_code"] == "UL45_000017167888590000000399"
    for race in config["races"]:
        contract = source_bindings.competition_contract(config, race)
        assert contract["participant"]["entity"] == "person"
        assert contract["competition"]["format"] == "solo"
        assert contract["capabilities"]["medal"] == (race["race_family"] == "uv90")


@pytest.mark.parametrize("mutation,match", [
    ("unknown-event", "unknown source event"),
    ("wrong-year", "source year"),
    ("legacy-conflict", "differs from Mika binding"),
    ("duplicate-provider", "duplicate mika"),
    ("no-primary", "exactly one primary"),
    ("unknown-profile", "unknown competition_profile"),
    ("orphan-source", "unbound source races"),
    ("foreign-url", "non-official Mika URL"),
])
def test_malformed_contracts_fail_closed(config, mutation, match):
    race = next(item for item in config["races"] if item["race_key"] == "ultravasan45-2025")
    reference = race["source_bindings"][0]
    source = config["source_events"][reference["source_event"]]["race_bindings"][reference["race"]]
    if mutation == "unknown-event":
        reference["source_event"] = "missing"
    elif mutation == "wrong-year":
        source["year"] -= 1
    elif mutation == "legacy-conflict":
        race["event_code"] = "different"
    elif mutation == "duplicate-provider":
        race["source_bindings"].append({**reference, "role": "enrichment"})
    elif mutation == "no-primary":
        reference["role"] = "enrichment"
    elif mutation == "unknown-profile":
        race["competition_profile"] = "missing"
    elif mutation == "orphan-source":
        event = next(iter(config["source_events"].values()))
        event["race_bindings"]["orphan"] = deepcopy(next(iter(event["race_bindings"].values())))
    else:
        source["official_url"] = "https://example.test/2026/?event=" + source["event_code"]
        race["official_url"] = source["official_url"]
    with pytest.raises(source_bindings.SourceBindingError, match=match):
        source_bindings.validate_config(config)


def test_opaque_planned_team_is_not_a_relay_or_database_race(config, tmp_path):
    capabilities = {key: False for key in source_bindings.CAPABILITIES}
    capabilities.update({"team_members": True, "class_analysis": True})
    config["competition_profiles"]["paired-team"] = {
        "participant": {"entity": "team", "singular": "par", "plural": "par"},
        "competition": {"format": "paired", "team_structure": {
            "kind": "none", "member_assignment": "unknown",
        }},
        "capabilities": capabilities,
    }
    template = deepcopy(config["races"][0])
    template.update({"race_key": "opaque/future", "year": 2031, "race_date": "2031-06-01",
                     "data_status": "planned", "competition_profile": "paired-team",
                     "medal_profile": None, "source_bindings": []})
    for field in source_bindings.MIKA_COMPATIBILITY_FIELDS:
        template.pop(field, None)
    config["races"].append(template)
    contract = source_bindings.competition_contract(config, template)
    assert contract["participant"]["entity"] == "team"
    assert contract["competition"]["format"] == "paired"
    assert contract["competition"]["team_structure"]["kind"] == "none"
    source_bindings.validate_config(config)
    path = tmp_path / "races.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    db = tmp_path / "catalog.sqlite"
    uvtool.init_db(db, path)
    with sqlite3.connect(db) as connection:
        assert connection.execute("SELECT COUNT(*) FROM races WHERE race_key='opaque/future'").fetchone()[0] == 0


def test_vasanerd_rejects_unbound_year_before_creating_database(config, tmp_path):
    payload = tmp_path / "unbound.json"
    payload.write_text(json.dumps({"results": [{"year": 2021, "name": "No Contract", "finish_time": "10:00:00"}]}))
    db = tmp_path / "must-not-exist.sqlite"
    with pytest.raises(source_bindings.SourceBindingError, match="unbound years"):
        vasanerd_import.import_payloads(payload, db, uvtool.DEFAULT_CONFIG, tmp_path / "report.json")
    assert not db.exists()


def test_mika_rejects_unbound_edition_before_creating_database(tmp_path):
    db = tmp_path / "must-not-exist.sqlite"
    args = argparse.Namespace(db=db, config=uvtool.DEFAULT_CONFIG, race="opaque/missing")
    with pytest.raises(SystemExit, match="source binding"):
        mika_import.execute(args, probe=True)
    assert not db.exists()
