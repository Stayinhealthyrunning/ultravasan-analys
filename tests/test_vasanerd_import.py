import json, tempfile, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from vasanerd_import import discover_collections, parse_record
sample={"ultravasan":{"results":[{"year":2022,"name":"Test Löpare","bib":"42","gender":"M","class":"M50","finish_time":"10:01:02","place":123,"splits":[{"checkpoint":"Evertsberg","elapsed_time":"5:02:03","place":140,"speed_kmh":9.1}]}]}}
cols=discover_collections(sample)
assert cols and cols[0][1][0]["name"]=="Test Löpare"
year,result=parse_record(cols[0][1][0],None,"fixture://sample",0)
assert year==2022 and result.finish_seconds==36062 and result.overall_place==123
assert result.splits and result.splits[0]["checkpoint_key"]=="evertsberg"
print("VasaNerd-adapter: syntetiskt schema OK")
flat=[
 {"year":2021,"name":"Flat Runner","bib":"7","control":"Evertsberg","time":"05:00:00","place":200},
 {"year":2021,"name":"Flat Runner","bib":"7","control":"Mora","time":"10:30:00","place":150}
]
from vasanerd_import import prepare_records
prepared=prepare_records(flat)
assert len(prepared)==1 and len(prepared[0]["splits"])==2
_,flat_result=parse_record(prepared[0],None,"fixture://flat",0)
assert flat_result.finish_seconds==37800 and len(flat_result.splits)==2
print("VasaNerd-adapter: platt kontrolltabell OK")
