import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import mika_import
import uvtool

def norm(text):
    return uvtool.normalize(text or "")

def test_post_eldris_timing_rows_by_year_diagnostic():
    config=json.loads((ROOT/"config"/"races.json").read_text(encoding="utf-8"))
    races=config if isinstance(config,list) else config.get("races",[])
    session=uvtool.create_session()
    out=[]
    for race in sorted(races,key=lambda r:(r.get("year",0),r.get("race_family",""))):
        if race.get("race_family") not in {"uv90","uv45"} or not race.get("event_code"):
            continue
        year_path=race.get("result_year_path") or race.get("year")
        event=race["event_code"]
        list_url=f"https://results.vasaloppet.se/{year_path}/?page=1&event={event}&num_results=10&pid=search"
        item={"race_key":race["race_key"],"year":race.get("year"),"event":event,"year_path":year_path}
        try:
            response=session.get(list_url,timeout=45); response.raise_for_status()
            entries=mika_import.extract_entries(response.text,list_url)
            item["entries"]=len(entries)
            if not entries:
                out.append(item); continue
            entry=entries[0]; idp=entry["idp"]
            detail_url=(race.get("detail_url_template") or
                f"https://results.vasaloppet.se/{year_path}/?content=detail&fpid=search&pid=search&idp={{idp}}&lang=SE&event={event}").format(idp=idp)
            detail=session.get(detail_url,timeout=45); detail.raise_for_status()
            soup=BeautifulSoup(detail.text,"lxml")
            all_rows=[]
            after_eldris=[]
            seen_eldris=False
            for idx,row in enumerate(soup.select("tr")):
                classes=list(row.get("class",[]))
                cells=[uvtool.clean_text(c.get_text(" ",strip=True)) for c in row.find_all(["th","td"],recursive=False)]
                text=uvtool.clean_text(row.get_text(" ",strip=True))
                desc=uvtool._class_text(row,["desc","name","split-name"])
                time=uvtool._class_text(row,["time","elapsed","time_total"])
                finish_cell=uvtool.first_selector_text(row,[".f-time_finish_brutto",".f-time_finish_netto",".f-time_finish","td.time"])
                rec={"idx":idx,"classes":classes,"desc":desc,"time":time,"finish_cell":finish_cell,"cells":cells,"text":text}
                if "eldris" in norm(desc) or "eldris" in norm(text):
                    seen_eldris=True
                    rec["marker"]="eldris"
                    all_rows.append(rec)
                    continue
                if seen_eldris:
                    after_eldris.append(rec)
                    all_rows.append(rec)
                    if any("finish" in c.lower() for c in classes) or ("mål" in norm(desc) and "mora" in norm(desc)):
                        break
            item["sample_idp"]=idp
            item["after_eldris_rows"]=after_eldris[:20]
            item["timing_candidates"]=[
                r for r in after_eldris
                if r["time"] or r["finish_cell"] or any((":" in (cell or "") or "min/km" in (cell or "").lower()) for cell in r["cells"])
            ][:20]
        except Exception as exc:
            item["error"]=type(exc).__name__+": "+str(exc)
        out.append(item)
    raise AssertionError("POST_ELDRIS_TIMING_DIAGNOSTIC="+json.dumps(out,ensure_ascii=False,sort_keys=True))
