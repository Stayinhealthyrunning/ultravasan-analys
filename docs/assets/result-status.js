'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.ResultStatus=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const FINISHED=new Set(['FINISHED','FINISH','OK','GODKÄND','GODKAND']);
  const DNF=new Set(['DNF','BRUTIT','DID NOT FINISH']);
  const DNS=new Set(['DNS','EJ START','EJ STARTAT','STARTADE INTE','DID NOT START']);
  const DSQ=new Set(['DSQ','DISQUALIFIED','DISKVALIFICERAD']);
  const STARTED=new Set(['STARTED','STARTAT']);

  const normalizeStatus=value=>String(value??'').trim().toUpperCase().replace(/\s+/g,' ');
  const hasValidFinishTime=result=>Number.isFinite(Number(result?.finish_seconds))&&Number(result.finish_seconds)>0;
  const buildSplitEvidence=splits=>{
    const ids=new Set();
    (splits||[]).forEach(split=>{
      if(split?.result_id==null)return;
      if(Number(split.elapsed_seconds)>0||Number(split.segment_seconds)>0)ids.add(split.result_id);
    });
    return ids;
  };

  function classify(result,{hasSplit=false}={}){
    const status=normalizeStatus(result?.status),hasFinishTime=hasValidFinishTime(result),finishStatus=FINISHED.has(status),explicitDnf=DNF.has(status),dns=DNS.has(status),dsq=DSQ.has(status),startedStatus=STARTED.has(status);
    const contradictoryFinish=hasFinishTime&&!finishStatus;
    const contradictoryDnsEvidence=dns&&(hasFinishTime||hasSplit);
    if(dns)return{category:'dns',status,started:false,finished:false,dnf:false,dns:true,dsq:false,unknown:false,derived:false,hasFinishTime,hasSplit,contradictoryFinish,contradictoryDnsEvidence};
    if(dsq)return{category:'dsq',status,started:true,finished:false,dnf:false,dns:false,dsq:true,unknown:false,derived:false,hasFinishTime,hasSplit,contradictoryFinish,contradictoryDnsEvidence};
    if(finishStatus&&hasFinishTime)return{category:'finished',status,started:true,finished:true,dnf:false,dns:false,dsq:false,unknown:false,derived:false,hasFinishTime,hasSplit,contradictoryFinish:false,contradictoryDnsEvidence};
    if(explicitDnf)return{category:'dnf',status,started:true,finished:false,dnf:true,dns:false,dsq:false,unknown:false,derived:false,hasFinishTime,hasSplit,contradictoryFinish,contradictoryDnsEvidence};
    if(startedStatus||hasSplit||hasFinishTime||finishStatus)return{category:'dnf',status,started:true,finished:false,dnf:true,dns:false,dsq:false,unknown:false,derived:true,hasFinishTime,hasSplit,contradictoryFinish,contradictoryDnsEvidence};
    return{category:'unknown',status,started:false,finished:false,dnf:false,dns:false,dsq:false,unknown:true,derived:false,hasFinishTime,hasSplit,contradictoryFinish,contradictoryDnsEvidence};
  }

  function summarize(results,{splitEvidence=new Set()}={}){
    const summary={total:0,starters:0,finishers:0,dnf:0,dns:0,dsq:0,unknown:0,derivedDnf:0,contradictions:0,rate:null};
    (results||[]).forEach(result=>{
      const c=classify(result,{hasSplit:splitEvidence.has(result?.id)});summary.total++;
      if(c.started)summary.starters++;
      if(c.finished)summary.finishers++;
      if(c.dnf)summary.dnf++;
      if(c.dns)summary.dns++;
      if(c.dsq)summary.dsq++;
      if(c.unknown)summary.unknown++;
      if(c.dnf&&c.derived)summary.derivedDnf++;
      if(c.contradictoryFinish||c.contradictoryDnsEvidence)summary.contradictions++;
    });
    summary.rate=summary.starters?Math.round(summary.finishers/summary.starters*1000)/10:null;
    return summary;
  }

  return{normalizeStatus,hasValidFinishTime,buildSplitEvidence,classify,summarize};
});
