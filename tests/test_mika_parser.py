from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import uvtool

CHECKPOINTS = [
    {"checkpoint_key":"start","name":"Start","sequence_no":0,"distance_km":0},
    {"checkpoint_key":"smagan","name":"Smågan","sequence_no":1,"distance_km":9.2},
    {"checkpoint_key":"evertsberg","name":"Evertsberg","sequence_no":4,"distance_km":47.1},
    {"checkpoint_key":"mora","name":"Mora mål","sequence_no":8,"distance_km":92},
]

def test_detail_parser():
    html=(ROOT/"tests/fixtures/mika-detail.html").read_text(encoding="utf-8")
    r=uvtool.parse_detail_html(html,"EVENT:IDP","https://example.test",CHECKPOINTS)
    assert r.name=="Test Löpare"
    assert r.bib=="471"
    assert r.start_group=="2"
    assert r.age_class=="M55"
    assert r.finish_seconds==10*3600+12*60+34
    assert len(r.splits)==3
    smagan=r.splits[0]
    assert smagan["checkpoint_key"]=="smagan"
    assert smagan["elapsed_seconds"]==3724
    assert smagan["reported_pace_seconds_per_km"]==405
    assert abs(smagan["speed_kmh"]-8.89)<0.001
    assert smagan["place_gender"]==180

if __name__=="__main__":
    test_detail_parser()
    print("OK: Mika detail parser")
