#!/usr/bin/env python3
import json, sys
from pathlib import Path
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import mika_import, uvtool

CANDIDATES=[
 (2014,"UL90_000017167888590000000399",2015),
 (2015,"UL90_9999991678885A00000003FE",2016),
 (2016,"UL90_9999991678885A00000004CC",2017),
 (2017,"UL90_9999991678885A0000000621",2018),
 (2018,"UL90_9999991678885B00000006D4",2019),
 (2019,"UL90_9999991678885C000000070B",2020),
 (2022,"UL90_HCH8NDMR2201",2023),
 (2023,"UL90_HCH8NDMR2301",2024),
 (2024,"UL90_HCH8NDMR2401",2025),
 (2025,"UL90_HCH8NDMR2501",2026),
 (2026,"UL90_HCH8NDMR2601",2027),
]

def clean(x): return uvtool.clean_text(x or "")
def norm(x): return uvtool.normalize(x or "")

session=uvtool.create_session()
cat=session.get("https://results.vasaloppet.se/2025/?pid=list",timeout=45)
cat.raise_for_status()
cat_soup=BeautifulSoup(cat.text,"lxml")
out=[]
for year,event,path_year in CANDIDATES:
    rec={"year":year,"event_code":event,"path_year":path_year}
    for node in cat_soup.select("option[value],a[href*='event=']"):
        value=node.get("value") or node.get("href") or ""
        if event in value:
            group=node.find_parent("optgroup")
            rec["catalogue_label"]=clean(node.get_text(" ",strip=True))
            rec["catalogue_group"]=clean(group.get("label")) if group else None
            break
    try:
        list_url=f"https://results.vasaloppet.se/{path_year}/?page=1&event={event}&num_results=25&pid=search"
        response=session.get(list_url,timeout=45); response.raise_for_status()
        entries=mika_import.extract_entries(response.text,list_url)
        rec["entries"]=len(entries)
        if not entries:
            out.append(rec); continue
        entry=entries[0]
        rec["sample_name"]=entry.get("name")
        idp=entry["idp"]
        detail_url=f"https://results.vasaloppet.se/{path_year}/?content=detail&fpid=search&pid=search&idp={idp}&lang=SE&event={event}"
        detail=session.get(detail_url,timeout=45); detail.raise_for_status()
        soup=BeautifulSoup(detail.text,"lxml")
        seen_eldris=False
        rows=[]
        between=[]
        for row in soup.select("tr"):
            classes=list(row.get("class",[]))
            desc=uvtool._class_text(row,["desc","name","split-name"])
            elapsed=uvtool._class_text(row,["time","elapsed","time_total"])
            text=clean(row.get_text(" ",strip=True))
            key=uvtool.checkpoint_key(desc)
            if key=="eldris" or ("eldris" in norm(text) and not seen_eldris):
                seen_eldris=True
                rows.append({"desc":desc,"key":key,"elapsed":elapsed})
                continue
            if not seen_eldris: continue
            is_finish=("finish" in " ".join(classes).lower()) or key=="mora" or ("mål" in norm(desc))
            rows.append({"desc":desc,"key":key,"elapsed":elapsed,"is_finish":is_finish})
            if is_finish: break
            seconds=uvtool.parse_time(elapsed)
            if seconds is not None and "estimated" not in classes:
                between.append({"desc":desc,"key":key,"elapsed":elapsed,"seconds":seconds})
        rec["rows_after_eldris"]=rows
        rec["controls_between_eldris_finish"]=between
        rec["has_control"]=bool(between)
        rec["last_control"]=between[-1] if between else None
    except Exception as exc:
        rec["error"]=type(exc).__name__+": "+str(exc)
    out.append(rec)
print("UV90_AUDIT_JSON="+json.dumps(out,ensure_ascii=False,sort_keys=True))
