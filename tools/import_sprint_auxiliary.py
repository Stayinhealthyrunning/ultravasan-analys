#!/usr/bin/env python3
"""Import the last official timing passage after Eldris for Spurtvinnaren.

This tool deliberately does NOT update results, athletes, finish times, placements,
classes or ordinary checkpoints/splits. The service point remains auxiliary-only.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sqlite3
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import threading
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import mika_import
import source_bindings
import uvtool

WARNING_KEY="mora_warning"


def extract_last_pre_finish_control(html: str) -> dict | None:
    """Return the last exact official timing row after Eldris and before finish.

    The source label is deliberately not part of the contract. Vasaloppet may
    call this control 'Mora Förvarning' in one year and something else in
    another. Spurtvinnaren is defined by control position: last official split
    after Eldris, before Mora mål.
    """
    soup=uvtool.BeautifulSoup(html,"lxml")
    after_eldris=False
    candidates=[]
    for row in soup.select("tr.split"):
        row_classes=set(row.get("class",[]))
        row_text=row.get_text(" ",strip=True)
        if "estimated" in row_classes or (row.select_one("strong") and "*" in row_text):
            continue
        label=uvtool._class_text(row,["desc","name","split-name"])
        key=uvtool.checkpoint_key(label)
        if key=="eldris":
            after_eldris=True
            continue
        if key=="mora":
            break
        if not after_eldris:
            continue
        elapsed=uvtool.parse_time(uvtool._class_text(row,["time","elapsed","time_total"]))
        if elapsed is None:
            continue
        candidates.append({
            "checkpoint_key":WARNING_KEY,
            "source_label":label,
            "elapsed_seconds":elapsed,
            "time_of_day":uvtool._class_text(row,["daytime","time_of_day","time-day"]),
            "is_estimated":False,
        })
    return candidates[-1] if candidates else None

def ensure_checkpoint_order(conn: sqlite3.Connection, race_id: int, warning_cfg: dict, finish_cfg: dict) -> tuple[int,int]:
    rows={row["checkpoint_key"]:row for row in conn.execute(
        "SELECT * FROM checkpoints WHERE race_id=?",(race_id,)
    ).fetchall()}
    mora=rows.get("mora")
    if not mora:
        raise RuntimeError("Mora mål saknas i databasen")
    warning=rows.get(WARNING_KEY)
    occupied=conn.execute(
        "SELECT checkpoint_key,sequence_no FROM checkpoints WHERE race_id=? AND checkpoint_key NOT IN (?,?)",
        (race_id,WARNING_KEY,"mora")
    ).fetchall()
    desired={int(warning_cfg["sequence_no"]),int(finish_cfg["sequence_no"])}
    conflicts=[dict(row) for row in occupied if int(row["sequence_no"]) in desired]
    if conflicts:
        raise RuntimeError(f"Kan inte reservera auxiliary-sekvenser: {conflicts}")
    conn.execute("UPDATE checkpoints SET sequence_no=-900001 WHERE id=?",(mora["id"],))
    if warning:
        conn.execute("UPDATE checkpoints SET sequence_no=-900002 WHERE id=?",(warning["id"],))
        warning_id=warning["id"]
    else:
        cur=conn.execute(
            "INSERT INTO checkpoints(race_id,checkpoint_key,name,sequence_no,distance_km,elevation_m) VALUES(?,?,?,?,?,?)",
            (race_id,WARNING_KEY,warning_cfg["name"],-900002,warning_cfg.get("distance_km"),warning_cfg.get("elevation_m"))
        )
        warning_id=cur.lastrowid
    conn.execute(
        "UPDATE checkpoints SET name=?,sequence_no=?,distance_km=?,elevation_m=? WHERE id=?",
        (warning_cfg["name"],warning_cfg["sequence_no"],warning_cfg.get("distance_km"),warning_cfg.get("elevation_m"),warning_id)
    )
    conn.execute(
        "UPDATE checkpoints SET name=?,sequence_no=?,distance_km=?,elevation_m=? WHERE id=?",
        (finish_cfg["name"],finish_cfg["sequence_no"],finish_cfg.get("distance_km"),finish_cfg.get("elevation_m"),mora["id"])
    )
    return warning_id,mora["id"]

def load_target_rows(conn: sqlite3.Connection, race_id: int, mika_source_id: int):
    rows=conn.execute("""
      SELECT r.*,s.code source_code
      FROM results r JOIN sources s ON s.id=r.source_id
      WHERE r.race_id=?
    """,(race_id,)).fetchall()
    by_external={}
    by_name_finish=defaultdict(list)
    by_bib_name=defaultdict(list)
    for row in rows:
        if row["source_id"]==mika_source_id and row["source_result_id"]:
            by_external[str(row["source_result_id"])]=row
        name=uvtool.normalize(row["name_as_published"])
        if name and row["finish_seconds"] is not None:
            by_name_finish[(name,int(row["finish_seconds"]))].append(row)
        bib=uvtool.clean_text(row["bib"])
        if bib and name:
            by_bib_name[(bib,name)].append(row)
    return by_external,by_name_finish,by_bib_name

def compatible(parsed, row) -> bool:
    checks=[
        (parsed.sex,row["sex"],True),
        (parsed.age_class,row["age_class"],True),
        (parsed.overall_place,row["overall_place"],False),
    ]
    for official,existing,text in checks:
        if official is None or existing is None:
            continue
        if text:
            if uvtool.normalize(official)!=uvtool.normalize(existing):
                return False
        elif int(official)!=int(existing):
            return False
    return True

def choose_target(parsed,event_code,idp,indexes):
    by_external,by_name_finish,by_bib_name=indexes
    external=f"{event_code}:{idp}"
    direct=by_external.get(external)
    if direct:
        return direct,"existing-mika"
    name=uvtool.normalize(parsed.name)
    if name and parsed.finish_seconds is not None:
        candidates=[r for r in by_name_finish.get((name,int(parsed.finish_seconds)),[]) if compatible(parsed,r)]
        preferred=[r for r in candidates if r["source_code"]=="vasanerd"] or candidates
        if len(preferred)==1:
            return preferred[0],"exact-name-finish"
    bib=uvtool.clean_text(parsed.bib)
    if bib and name:
        candidates=[r for r in by_bib_name.get((bib,name),[]) if compatible(parsed,r)]
        preferred=[r for r in candidates if r["source_code"]=="vasanerd"] or candidates
        if len(preferred)==1:
            return preferred[0],"exact-bib-name"
    return None,"unmatched"

def list_entries(fetcher,race_cfg,raw_root):
    found={}
    partitions=["M","W"] if race_cfg.get("partition_by_sex") else [None]
    for sex in partitions:
        label=sex or "ALL"
        empty=0
        for page in range(1,int(race_cfg.get("max_pages",200))+1):
            best=[]
            for variant,url in enumerate(mika_import.list_url_candidates(race_cfg,page,sex),1):
                cache=raw_root/"lists"/label/f"page-{page:03d}-v{variant}.html"
                try:
                    html,_,_,_=fetcher.get(url,cache)
                    entries=mika_import.extract_entries(html,url)
                except Exception:
                    continue
                new=[entry for entry in entries if entry["idp"] not in found]
                if len(new)>len(best):
                    best=new
                if new:
                    break
            if not best:
                empty+=1
                if empty>=int(race_cfg.get("empty_pages_to_stop",2)):
                    break
                continue
            empty=0
            for entry in best:
                found[entry["idp"]]=entry
    return found

def run(args):
    config=uvtool.load_config(args.config)
    race_cfg=source_bindings.provider_race_config(config,args.race,"mika")
    warning_cfg=next((c for c in race_cfg.get("checkpoints",[]) if c["checkpoint_key"]==WARNING_KEY),None)
    finish_cfg=next((c for c in race_cfg.get("checkpoints",[]) if c["checkpoint_key"]=="mora"),None)
    if not warning_cfg or not finish_cfg:
        raise SystemExit("Konfigurationen saknar intern spurtkontroll eller Mora mål")
    shutil.copy2(args.db,args.output_db)
    conn=uvtool.connect(args.output_db)
    try:
        race=conn.execute("SELECT * FROM races WHERE race_key=?",(args.race,)).fetchone()
        source=conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
        if not race or not source:
            raise RuntimeError("Lopp eller Mika-källa saknas")
        before_non_aux=conn.execute("""
          SELECT COUNT(*) FROM splits sp JOIN checkpoints cp ON cp.id=sp.checkpoint_id
          JOIN results r ON r.id=sp.result_id
          WHERE r.race_id=? AND cp.checkpoint_key<>?
        """,(race["id"],WARNING_KEY)).fetchone()[0]
        warning_id,_=ensure_checkpoint_order(conn,race["id"],warning_cfg,finish_cfg)
        conn.commit()
        indexes=load_target_rows(conn,race["id"],source["id"])
        fetcher=mika_import.Fetcher(args.delay,args.browser_fallback,args.force)
        raw_root=args.raw/args.race
        report={"race_key":args.race,"event_code":race_cfg["event_code"],"auxiliary_only":True,"details":[]}
        try:
            entries=list_entries(fetcher,race_cfg,raw_root)
            report["list_entries"]=len(entries)
            methods=defaultdict(int); inserted=0; no_warning=0; unmatched=0; errors=0
            thread_state=threading.local()
            failed_fetches=[]

            def fetch_detail(item,worker=None):
                idx,entry=item
                idp=entry["idp"]
                url=mika_import.detail_url(race_cfg,idp,entry.get("url",""))
                cache=raw_root/"details"/f"{re.sub(r'[^A-Za-z0-9_.-]','_',idp)}.html"
                if worker is None:
                    worker=getattr(thread_state,"fetcher",None)
                    if worker is None:
                        # One HTTP session per worker thread; no database access happens here.
                        worker=mika_import.Fetcher(args.delay,False,args.force)
                        thread_state.fetcher=worker
                try:
                    html,_,_,mode=worker.get(url,cache)
                    parsed=mika_import.apply_fallback(
                        uvtool.parse_detail_html(html,f"{race_cfg['event_code']}:{idp}",url,race_cfg["checkpoints"]),
                        entry
                    )
                    warning=extract_last_pre_finish_control(html)
                    return idx,entry,idp,parsed,warning,None
                except Exception as exc:
                    return idx,entry,idp,None,None,str(exc)

            def apply_detail(idx,entry,idp,parsed,warning):
                nonlocal inserted,no_warning,unmatched,errors
                if not warning or not warning.get("elapsed_seconds"):
                    no_warning+=1
                    return
                target,method=choose_target(parsed,race_cfg["event_code"],idp,indexes)
                methods[method]+=1
                if not target:
                    unmatched+=1
                    return
                elapsed=int(warning["elapsed_seconds"])
                if target["finish_seconds"] is not None and elapsed>=int(target["finish_seconds"]):
                    errors+=1
                    if len(report["details"])<50:
                        report["details"].append({"idp":idp,"error":"auxiliary elapsed time is not before finish"})
                    return
                raw=json.dumps({"auxiliary_only":True,"source":"vasaloppet_mika","source_result_id":f"{race_cfg['event_code']}:{idp}","source_label":warning.get("source_label")},ensure_ascii=False)
                conn.execute("""
                  INSERT INTO splits(result_id,checkpoint_id,elapsed_seconds,segment_seconds,place_overall,place_gender,place_class,
                    pace_seconds_per_km,reported_pace_seconds_per_km,speed_kmh,time_of_day,diff_seconds,status,is_estimated,raw_json)
                  VALUES(?,?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL,NULL,0,?)
                  ON CONFLICT(result_id,checkpoint_id) DO UPDATE SET
                    elapsed_seconds=excluded.elapsed_seconds,segment_seconds=NULL,place_overall=NULL,place_gender=NULL,place_class=NULL,
                    pace_seconds_per_km=NULL,reported_pace_seconds_per_km=NULL,speed_kmh=NULL,time_of_day=excluded.time_of_day,
                    diff_seconds=NULL,status=NULL,is_estimated=0,raw_json=excluded.raw_json
                """,(target["id"],warning_id,elapsed,warning.get("time_of_day"),raw))
                inserted+=1
                if idx%100==0:
                    conn.commit()

            items=list(enumerate(entries.values(),1))
            with ThreadPoolExecutor(max_workers=max(1,args.workers)) as pool:
                for result in pool.map(fetch_detail,items):
                    idx,entry,idp,parsed,warning,fetch_error=result
                    if fetch_error is not None:
                        failed_fetches.append((idx,entry,idp,fetch_error))
                        continue
                    apply_detail(idx,entry,idp,parsed,warning)

            # Mika can temporarily return HTTP 403 when several detail pages are
            # fetched concurrently.  Do not accept an incomplete enrichment.
            # Cool down, then retry only those failed pages serially with the
            # already warmed list-page session.  Final errors are counted only
            # after this recovery pass.
            report["parallel_fetch_failures"]=len(failed_fetches)
            report["serial_retry_recovered"]=0
            if failed_fetches:
                time.sleep(args.retry_cooldown)
                for idx,entry,idp,first_error in failed_fetches:
                    result=fetch_detail((idx,entry),worker=fetcher)
                    _,_,_,parsed,warning,retry_error=result
                    if retry_error is not None:
                        errors+=1
                        if len(report["details"])<50:
                            report["details"].append({
                                "idp":idp,
                                "error":retry_error,
                                "initial_error":first_error,
                            })
                        continue
                    report["serial_retry_recovered"]+=1
                    apply_detail(idx,entry,idp,parsed,warning)
            conn.commit()
        finally:
            fetcher.close()
        after_non_aux=conn.execute("""
          SELECT COUNT(*) FROM splits sp JOIN checkpoints cp ON cp.id=sp.checkpoint_id
          JOIN results r ON r.id=sp.result_id
          WHERE r.race_id=? AND cp.checkpoint_key<>?
        """,(race["id"],WARNING_KEY)).fetchone()[0]
        exact=conn.execute("""
          SELECT COUNT(*) FROM splits sp JOIN results r ON r.id=sp.result_id
          WHERE r.race_id=? AND sp.checkpoint_id=? AND COALESCE(sp.is_estimated,0)=0
            AND sp.elapsed_seconds IS NOT NULL AND r.status='FINISHED' AND r.finish_seconds>sp.elapsed_seconds
        """,(race["id"],warning_id)).fetchone()[0]
        sex=conn.execute("""
          SELECT r.sex,COUNT(*) n FROM splits sp JOIN results r ON r.id=sp.result_id
          WHERE r.race_id=? AND sp.checkpoint_id=? AND COALESCE(sp.is_estimated,0)=0
            AND sp.elapsed_seconds IS NOT NULL AND r.status='FINISHED' AND r.finish_seconds>sp.elapsed_seconds
          GROUP BY r.sex
        """,(race["id"],warning_id)).fetchall()
        report.update({
          "inserted_or_updated":inserted,"exact_finished":exact,"no_warning":no_warning,"unmatched":unmatched,
          "errors":errors,"match_methods":dict(methods),"sex_counts":{str(r["sex"]):r["n"] for r in sex},
          "non_aux_splits_before":before_non_aux,"non_aux_splits_after":after_non_aux
        })
        if before_non_aux!=after_non_aux:
            raise RuntimeError("Ordinarie splitdata ändrades; enrichment stoppas")
        if exact<args.min_exact:
            raise RuntimeError(f"För få verifierade slutkontrollstider: {exact} < {args.min_exact}")
        if not any(str(k).upper() in {"F","W","K","D"} and v>0 for k,v in report["sex_counts"].items()):
            raise RuntimeError("Inga kvinnliga slutkontrollstider efter enrichment")
        if not any(str(k).upper() in {"M","H"} and v>0 for k,v in report["sex_counts"].items()):
            raise RuntimeError("Inga manliga slutkontrollstider efter enrichment")
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
        print(json.dumps(report,ensure_ascii=False,indent=2))
    finally:
        conn.close()

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--race",default="ultravasan90-2025")
    p.add_argument("--db",type=Path,default=ROOT/"data"/"ultravasan.sqlite")
    p.add_argument("--output-db",type=Path,required=True)
    p.add_argument("--config",type=Path,default=ROOT/"config"/"races.json")
    p.add_argument("--raw",type=Path,required=True)
    p.add_argument("--report",type=Path,required=True)
    p.add_argument("--delay",type=float,default=0.5)
    p.add_argument("--workers",type=int,default=1,help="Parallel detail-page HTTP workers; database writes remain serial")
    p.add_argument("--retry-cooldown",type=float,default=45.0,help="Seconds to cool down before serial retry of transient detail fetch failures")
    p.add_argument("--min-exact",type=int,default=1000)
    p.add_argument("--force",action="store_true")
    p.add_argument("--browser-fallback",action="store_true")
    run(p.parse_args())
if __name__=="__main__":
    main()
