import json
from pathlib import Path
import requests
from bs4 import BeautifulSoup
import sys
from urllib.parse import urlencode

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import mika_import
import uvtool

def test_historical_mora_warning_source_coverage_diagnostic():
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
            response=session.get(list_url,timeout=45)
            item["list_status"]=response.status_code
            response.raise_for_status()
            entries=mika_import.extract_entries(response.text,list_url)
            item["entries"]=len(entries)
            if not entries:
                out.append(item);continue
            idp=entries[0]["idp"]
            detail_url=(race.get("detail_url_template") or
                f"https://results.vasaloppet.se/{year_path}/?content=detail&fpid=search&pid=search&idp={{idp}}&lang=SE&event={event}").format(idp=idp)
            detail=session.get(detail_url,timeout=45)
            item["detail_status"]=detail.status_code
            detail.raise_for_status()
            soup=BeautifulSoup(detail.text,"lxml")
            labels=[uvtool._class_text(row,["desc","name","split-name"]) for row in soup.select("tr.split")]
            item["split_labels"]=labels
            item["has_mora_warning"]=any("förvarning" in (label or "").lower() or "forvarning" in (label or "").lower() for label in labels)
            item["sample_idp"]=idp
        except Exception as exc:
            item["error"]=type(exc).__name__+": "+str(exc)
        out.append(item)
    raise AssertionError("HISTORICAL_MORA_WARNING_COVERAGE="+json.dumps(out,ensure_ascii=False,sort_keys=True))
