import json
from pathlib import Path
import requests
from bs4 import BeautifulSoup
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import mika_import
import uvtool

def test_uv90_2025_official_detail_checkpoint_diagnostic():
    list_url="https://results.vasaloppet.se/2026/?page=1&event=UL90_HCH8NDMR2501&num_results=10&pid=search"
    session=uvtool.create_session()
    response=session.get(list_url,timeout=75)
    response.raise_for_status()
    entries=mika_import.extract_entries(response.text,list_url)
    assert entries, f"no entries from {list_url} status={response.status_code}"
    probes=[]
    for entry in entries[:5]:
        idp=entry["idp"]
        detail_url=f"https://results.vasaloppet.se/2026/?content=detail&fpid=search&pid=search&idp={idp}&lang=SE&event=UL90_HCH8NDMR2501"
        detail=session.get(detail_url,timeout=75)
        detail.raise_for_status()
        soup=BeautifulSoup(detail.text,"lxml")
        labels=[]
        rows=[]
        for row in soup.select("tr.split"):
            desc=uvtool._class_text(row,["desc","name","split-name"])
            labels.append(desc)
            rows.append(uvtool.clean_text(row.get_text(" ",strip=True)))
        probes.append({"idp":idp,"name":entry.get("name"),"labels":labels,"rows":rows,"url":detail_url})
    raise AssertionError("UV90_2025_OFFICIAL_DETAIL_DIAGNOSTIC="+json.dumps(probes,ensure_ascii=False))
