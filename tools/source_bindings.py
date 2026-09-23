"""Provider-neutral RaceEdition and SourceBinding contracts.

This module owns source routing. Importers may ask it for one explicitly bound
provider race, but must not infer a provider, event or edition from a key,
label, distance or year.
"""
from __future__ import annotations

from collections import Counter
from typing import Any
from urllib.parse import parse_qs, urlparse


class SourceBindingError(ValueError):
    pass


DATA_STATUSES = frozenset({"available", "planned"})
ROLES = frozenset({"primary", "enrichment"})
PROVIDERS = frozenset({"mika", "vasanerd"})
PARTICIPANT_ENTITIES = frozenset({"person", "team"})
TEAM_STRUCTURES = frozenset({"none", "sequential"})
MEMBER_ASSIGNMENTS = frozenset({"unknown", "explicit"})
CAPABILITIES = frozenset({
    "replay", "map_duel", "medal", "person_history", "sex_filter",
    "age_analysis", "club_analysis", "class_analysis", "segment_analysis",
    "team_members",
})
MIKA_COMPATIBILITY_FIELDS = (
    "event_code", "result_year_path", "official_url", "page_url_template",
    "detail_url_template", "page_url_templates", "max_pages",
    "empty_pages_to_stop", "partition_by_sex",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SourceBindingError(message)


def validate_mika_urls(key: str, event: dict[str, Any], source_race: dict[str, Any]) -> None:
    require(event.get("base_url") == "https://results.vasaloppet.se/",
            f"Race {key} has invalid Mika base URL")
    urls = [source_race.get(field) for field in
            ("official_url", "page_url_template", "detail_url_template")]
    urls.extend(source_race.get("page_url_templates") or [])
    require(all(isinstance(url, str) and url for url in urls),
            f"Race {key} has incomplete Mika URLs")
    for url in urls:
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        require(parsed.scheme == "https" and parsed.hostname == "results.vasaloppet.se",
                f"Race {key} has non-official Mika URL")
        require(parsed.path == f"/{source_race['result_year_path']}/",
                f"Race {key} Mika URL path differs from result_year_path")
        require(query.get("event") == [source_race["event_code"]],
                f"Race {key} Mika URL event differs from event_code")


def competition_contract(config: dict[str, Any], race: dict[str, Any]) -> dict[str, Any]:
    key = race.get("race_key") or "<missing>"
    profile_key = race.get("competition_profile")
    profile = config.get("competition_profiles", {}).get(profile_key)
    require(isinstance(profile, dict), f"Race {key} references unknown competition_profile {profile_key!r}")
    participant = profile.get("participant")
    competition = profile.get("competition")
    capabilities = profile.get("capabilities")
    require(isinstance(participant, dict) and participant.get("entity") in PARTICIPANT_ENTITIES,
            f"Race {key} has invalid participant entity")
    require(all(isinstance(participant.get(field), str) and participant[field]
                for field in ("singular", "plural")), f"Race {key} has incomplete participant labels")
    require(isinstance(competition, dict) and isinstance(competition.get("format"), str)
            and competition["format"], f"Race {key} has invalid competition format")
    structure = competition.get("team_structure")
    require(isinstance(structure, dict) and structure.get("kind") in TEAM_STRUCTURES
            and structure.get("member_assignment") in MEMBER_ASSIGNMENTS,
            f"Race {key} has invalid team structure")
    if structure["kind"] == "sequential":
        require(isinstance(structure.get("leg_count"), int) and structure["leg_count"] > 0,
                f"Race {key} sequential structure requires leg_count")
    if participant["entity"] == "person":
        require(structure["kind"] == "none", f"Race {key} person entity cannot have team legs")
    require(isinstance(capabilities, dict) and set(capabilities) == CAPABILITIES
            and all(isinstance(value, bool) for value in capabilities.values()),
            f"Race {key} must explicitly declare every capability")
    require(capabilities["team_members"] == (participant["entity"] == "team"),
            f"Race {key} team_members does not match participant entity")
    require(not capabilities["medal"] or race.get("medal_profile") is not None,
            f"Race {key} enables medals without a medal profile")
    require(capabilities["medal"] == (race.get("medal_profile") is not None),
            f"Race {key} medal profile/capability mismatch")
    return {"participant": participant, "competition": competition, "capabilities": capabilities}


def resolve_source_bindings(config: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    events = config.get("source_events")
    require(isinstance(events, dict), "source_events must be an object")
    resolved: dict[str, list[dict[str, Any]]] = {}
    used_source_races: set[tuple[str, str]] = set()
    for race in config.get("races", []):
        key = race.get("race_key") or "<missing>"
        references = race.get("source_bindings")
        require(isinstance(references, list), f"Race {key} source_bindings must be a list")
        if race.get("data_status") == "available":
            require(bool(references), f"Available race {key} has no source binding")
            require(sum(item.get("role") == "primary" for item in references if isinstance(item, dict)) == 1,
                    f"Available race {key} must have exactly one primary source")
        else:
            require(not references, f"Planned race {key} must not expose a source binding")
        seen_providers: set[str] = set()
        rows = []
        for reference in references:
            require(isinstance(reference, dict) and reference.get("role") in ROLES,
                    f"Race {key} has invalid source binding role")
            event_key, source_race_key = reference.get("source_event"), reference.get("race")
            event = events.get(event_key)
            require(isinstance(event, dict), f"Race {key} references unknown source event {event_key!r}")
            provider = event.get("provider")
            require(provider in PROVIDERS, f"Source event {event_key!r} has unsupported provider {provider!r}")
            require(provider not in seen_providers, f"Race {key} has duplicate {provider} bindings")
            seen_providers.add(provider)
            source_race = event.get("race_bindings", {}).get(source_race_key)
            require(isinstance(source_race, dict),
                    f"Race {key} references unknown source race {source_race_key!r}")
            source_identity = (event_key, source_race_key)
            require(source_identity not in used_source_races,
                    f"Source race {event_key}/{source_race_key} is bound by multiple editions")
            used_source_races.add(source_identity)
            require(source_race.get("year") == race.get("year"),
                    f"Race {key} source year does not match edition")
            if provider == "mika":
                require(bool(source_race.get("event_code")) and isinstance(source_race.get("result_year_path"), int),
                        f"Race {key} has incomplete Mika binding")
                validate_mika_urls(key, event, source_race)
                for field in MIKA_COMPATIBILITY_FIELDS:
                    if field in source_race or field in race:
                        require(race.get(field) == source_race.get(field),
                                f"Race {key} legacy field {field} differs from Mika binding")
            elif provider == "vasanerd":
                require(event.get("base_url") == "https://vasanerd.se/data/ultravasan",
                        f"Race {key} has invalid VasaNerd base URL")
                require(source_race.get("result_file") == f"{race['year']}.json",
                        f"Race {key} has invalid VasaNerd result file")
            rows.append({"race": race, "provider": provider, "source_event_key": event_key,
                         "source_event": event, "source_race_key": source_race_key,
                         "source_race": source_race, "role": reference["role"]})
        resolved[key] = rows
    configured_source_races = {
        (event_key, source_race_key)
        for event_key, event in events.items()
        if isinstance(event, dict)
        for source_race_key in event.get("race_bindings", {})
    }
    require(used_source_races == configured_source_races,
            "source_events contains unbound source races")
    return resolved


def validate_config(config: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    require(config.get("contract_schema_version") == 2, "Unsupported race contract schema")
    event = config.get("event")
    require(isinstance(event, dict) and all(event.get(field) for field in
            ("event_key", "name", "product_title", "official_site_url", "storage_namespace")),
            "Event metadata is incomplete")
    families = config.get("race_families")
    require(isinstance(families, dict) and families, "race_families must be non-empty")
    races = config.get("races")
    require(isinstance(races, list) and races, "races must be non-empty")
    keys = [race.get("race_key") for race in races if isinstance(race, dict)]
    require(len(keys) == len(races) and all(keys) and not [key for key, count in Counter(keys).items() if count > 1],
            "Race editions must have unique non-empty keys")
    for race in races:
        key = race["race_key"]
        require(race.get("event_key") == event["event_key"], f"Race {key} has wrong event")
        require(race.get("race_family") in families, f"Race {key} has unknown family")
        require(race.get("data_status") in DATA_STATUSES, f"Race {key} has invalid data_status")
        require(isinstance(race.get("year"), int) and isinstance(race.get("race_date"), str),
                f"Race {key} has incomplete edition metadata")
        competition_contract(config, race)
    return resolve_source_bindings(config)


def source_binding(config: dict[str, Any], race_key: str, provider: str) -> dict[str, Any]:
    resolved = validate_config(config)
    matches = [item for item in resolved.get(race_key, []) if item["provider"] == provider]
    require(len(matches) == 1, f"Race {race_key} has no unique {provider} source binding")
    return matches[0]


def provider_race_config(config: dict[str, Any], race_key: str, provider: str) -> dict[str, Any]:
    item = source_binding(config, race_key, provider)
    return {**item["race"], **item["source_race"]}


def races_for_provider(config: dict[str, Any], provider: str) -> dict[int, dict[str, Any]]:
    require(provider in PROVIDERS, f"Unsupported provider {provider!r}")
    result: dict[int, dict[str, Any]] = {}
    for race_key, rows in validate_config(config).items():
        for item in rows:
            if item["provider"] != provider:
                continue
            year = item["race"]["year"]
            require(year not in result, f"Provider {provider} has multiple editions for year {year}")
            result[year] = {**item, "race_key": race_key}
    return result
