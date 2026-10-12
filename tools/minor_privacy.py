#!/usr/bin/env python3
"""Protect entrants who might be 17 in Ultravasan age-category result data.

W17/M17/H17/D17 age classes are mixed '17+' classes, NOT reliable proof of
an individual's age. For caution, suppress identifying data for the ENTIRE
mixed class, including any adults in it. Ordinary older classes remain intact.
"""
from __future__ import annotations
import re

ANON="Anonym löpare"
AGE_START_17=re.compile(r"^(?:W|M|H|D|K|F)17$",re.I)
YOUTH_CLASS=re.compile(r"^(?:U\s*1[0-8]|(?:W|M|H|D|K|F)\s*(?:[0-9]|1[0-7]))$",re.I)
IDENTITY=("name_as_published","canonical_name","name","club","city","nationality",
          "bib","athlete_id","source_result_id","person_key","first_name","last_name")

def may_include_minor(r):
    age=r.get("age")
    if type(age) is int and 0<=age<18:return True
    cls=str(r.get("age_class") or "").strip()
    return bool(AGE_START_17.fullmatch(cls) or YOUTH_CLASS.fullmatch(cls))

def protect_payload(payload):
    protected=0
    for record in payload.get("results",[]):
        if not may_include_minor(record):continue
        # Stable numeric result ID is used by observed split foreign keys and
        # remains internal to the published performance relationship.
        for key in IDENTITY:
            if key in record:record[key]=ANON if key in ("name_as_published","canonical_name","name") else None
        if "athlete_match_status" in record:record["athlete_match_status"]="source_local"
        protected+=1
    return protected
