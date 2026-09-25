import json
import sys
from pathlib import Path

from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import mika_import
import uvtool

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

def _clean(text):
    return uvtool.clean_text(text or "")

def _norm(text):
    return uvtool.normalize(text or "")

def test_historical_uv90_sprint_controls_diagnostic():
    session=uvtool.create_session()
    catalogue_url="https://results.vasaloppet.se/2025/?pid=list"
    catalogue=session.get(catalogue_url,timeout=60)
    catalogue.raise_for_status()
    catalogue_soup=BeautifulSoup(catalogue.text,"lxml")

    out=[]
    for expected_year,event,path_year in CANDIDATES:
        rec={"expected_year":expected_year,"event_code":event,"path_year":path_year}

        option=None
        for node in catalogue_soup.select("option[value],a[href*='event=']"):
            value=node.get("value") or node.get("href") or ""
            if event in value:
                option=node
                break
        if option is not None:
            group=option.find_parent("optgroup")
            rec["catalogue_label"]=_clean(option.get_text(" ",strip=True))
            rec["catalogue_group"]=_clean(group.get("label")) if group else None

        list_url=f"https://results.vasaloppet.se/{path_year}/?page=1&event={event}&num_results=25&pid=search"
        try:
            response=session.get(list_url,timeout=60)
            rec["list_status"]=response.status_code
            response.raise_for_status()
            entries=mika_import.extract_entries(response.text,list_url)
            rec["entries"]=len(entries)
            rec["list_title"]=_clean(BeautifulSoup(response.text,"lxml").title.get_text(" ",strip=True) if BeautifulSoup(response.text,"lxml").title else "")
            if not entries:
                out.append(rec)
                continue

            checked=[]
            found_control=None
            for entry in entries[:5]:
                idp=entry["idp"]
                detail_url=f"https://results.vasaloppet.se/{path_year}/?content=detail&fpid=search&pid=search&idp={idp}&lang=SE&event={event}"
                detail=session.get(detail_url,timeout=60)
                detail.raise_for_status()
                soup=BeautifulSoup(detail.text,"lxml")
                rows=[]
                seen_eldris=False
                candidates=[]
                for row in soup.select("tr"):
                    classes=list(row.get("class",[]))
                    desc=uvtool._class_text(row,["desc","name","split-name"])
                    elapsed=uvtool._class_text(row,["time","elapsed","time_total"])
                    text=_clean(row.get_text(" ",strip=True))
                    key=uvtool.checkpoint_key(desc)
                    if key=="eldris" or ("eldris" in _norm(text) and not seen_eldris):
                        seen_eldris=True
                        rows.append({"desc":desc,"key":key,"elapsed":elapsed,"classes":classes,"text":text})
                        continue
                    if not seen_eldris:
                        continue
                    is_finish=("finish" in " ".join(classes).lower()) or key=="mora" or ("mål" in _norm(desc))
                    rows.append({"desc":desc,"key":key,"elapsed":elapsed,"classes":classes,"text":text,"is_finish":is_finish})
                    if is_finish:
                        break
                    parsed_elapsed=uvtool.parse_time(elapsed)
                    if parsed_elapsed is not None and "estimated" not in classes:
                        candidates.append({"desc":desc,"key":key,"elapsed":elapsed,"seconds":parsed_elapsed,"classes":classes})
                checked.append({"idp":idp,"name":entry.get("name"),"rows_after_eldris":rows})
                if candidates:
                    found_control=candidates[-1]
                    break

            rec["sample_details"]=checked
            rec["last_control_after_eldris"]=found_control
            rec["has_separate_control"]=bool(found_control)
        except Exception as exc:
            rec["error"]=type(exc).__name__+": "+str(exc)
        out.append(rec)

    raise AssertionError("UV90_HISTORICAL_SPRINT_AUDIT="+json.dumps(out,ensure_ascii=False,sort_keys=True))
