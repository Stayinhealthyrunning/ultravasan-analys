from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import uvtool
import import_sprint_auxiliary

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


def test_last_pre_finish_control_is_positional_not_name_based():
    html="""<!doctype html><html><body><table>
    <tr class="split"><td class="desc">Eldris</td><td class="time">8:30:00</td></tr>
    <tr class="split"><td class="desc">Hemliga sista kontrollen</td><td class="time">9:15:20</td><td class="daytime">14:15:20</td></tr>
    <tr class="f-time_finish_brutto"><td class="desc">Mora mål</td><td class="time">9:20:00</td></tr>
    </table></body></html>"""
    control=import_sprint_auxiliary.extract_last_pre_finish_control(html)
    assert control is not None
    assert control["checkpoint_key"]=="mora_warning"
    assert control["source_label"]=="Hemliga sista kontrollen"
    assert control["elapsed_seconds"]==9*3600+15*60+20


def test_last_pre_finish_control_uses_last_exact_row_and_skips_estimate():
    html="""<!doctype html><html><body><table>
    <tr class="split"><td class="desc">Eldris</td><td class="time">8:30:00</td></tr>
    <tr class="split"><td class="desc">Kontroll A</td><td class="time">9:10:00</td></tr>
    <tr class="split"><td class="desc">Kontroll B</td><td class="time">9:14:00</td></tr>
    <tr class="split estimated"><td class="desc">Prognoskontroll</td><td class="time"><strong>9:16:00 *</strong></td></tr>
    <tr class="f-time_finish_brutto"><td class="desc">Mora mål</td><td class="time">9:20:00</td></tr>
    </table></body></html>"""
    control=import_sprint_auxiliary.extract_last_pre_finish_control(html)
    assert control["source_label"]=="Kontroll B"
    assert control["elapsed_seconds"]==9*3600+14*60


def test_last_pre_finish_control_absent_when_eldris_goes_directly_to_finish():
    html="""<!doctype html><html><body><table>
    <tr class="split"><td class="desc">Hökberg</td><td class="time">7:40:00</td></tr>
    <tr class="split"><td class="desc">Eldris</td><td class="time">8:30:00</td></tr>
    <tr class="f-time_finish_brutto"><td class="desc">Mora mål</td><td class="time">9:20:00</td></tr>
    </table></body></html>"""
    assert import_sprint_auxiliary.extract_last_pre_finish_control(html) is None

if __name__=="__main__":
    test_detail_parser()
    print("OK: Mika detail parser")
