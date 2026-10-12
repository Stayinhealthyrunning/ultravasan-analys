#!/usr/bin/env python3
"""Withhold entrants who might be 17 in Ultravasan age-category result data.

W17/M17/H17/D17 age classes are mixed '17+' classes, NOT reliable proof of
an individual's age. For caution, remove the ENTIRE mixed class from public
individual-level data, including any adults in it. Ordinary older classes
remain intact.
"""
from __future__ import annotations
import re

AGE_START_17=re.compile(r"^(?:W|M|H|D|K|F)17$",re.I)
YOUTH_CLASS=re.compile(r"^(?:U\s*1[0-8]|(?:W|M|H|D|K|F)\s*(?:[0-9]|1[0-7]))$",re.I)

def may_include_minor(r):
    age=r.get("age")
    if type(age) is int and 0<=age<18:return True
    cls=str(r.get("age_class") or "").strip()
    return bool(AGE_START_17.fullmatch(cls) or YOUTH_CLASS.fullmatch(cls))

def _percentiles(values):
    if not values:
        return {"p10":None,"p25":None,"median":None,"p75":None,"p90":None}
    values=sorted(values)
    def p(q):
        idx=(len(values)-1)*q
        lo,hi=int(idx),min(int(idx)+1,len(values)-1)
        return round(values[lo]+(values[hi]-values[lo])*(idx-lo))
    return {"p10":p(.10),"p25":p(.25),"median":p(.5),"p75":p(.75),"p90":p(.90)}

def recompute_stats(payload):
    results=payload.get("results",[])
    stats={}
    for race in payload.get("races",[]):
        race_id=race.get("id")
        rows=[row for row in results if row.get("race_id")==race_id]
        times=[row["finish_seconds"] for row in rows if row.get("finish_seconds")]
        statuses={}
        for row in rows:
            status=row.get("status")
            statuses[status]=statuses.get(status,0)+1
        stats[str(race_id)]={"count":len(rows),"finishers":len(times),
                             "times":_percentiles(times),"statuses":statuses}
    payload["stats"]=stats

def protect_payload(payload):
    """Remove conservatively protected rows and their linked split records."""
    protected_ids={record.get("id") for record in payload.get("results",[])
                   if may_include_minor(record)}
    protected_ids.discard(None)
    before=len(payload.get("results",[]))
    payload["results"]=[record for record in payload.get("results",[])
                        if not may_include_minor(record)]
    payload["splits"]=[split for split in payload.get("splits",[])
                       if split.get("result_id") not in protected_ids]
    recompute_stats(payload)
    return before-len(payload["results"])
