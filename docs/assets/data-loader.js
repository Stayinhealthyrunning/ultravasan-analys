'use strict';
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.UltravasanDataLoader=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  const scriptPromises=new Map();
  const loadedRaceIds=new Set();
  let data=null,mode='uninitialized',historyPromise=null;

  function loadScript(src,timeout=90000){
    if(scriptPromises.has(src))return scriptPromises.get(src);
    if(typeof document==='undefined')return Promise.reject(new Error('Script loading requires a browser document'));
    const promise=new Promise((resolve,reject)=>{
      const el=document.createElement('script');
      let done=false;
      const finish=err=>{
        if(done)return;done=true;clearTimeout(timer);
        err?reject(err):resolve();
      };
      el.src=src;el.async=true;
      el.onload=()=>finish();
      el.onerror=()=>finish(new Error(`Kunde inte läsa ${src}`));
      (document.head||document.documentElement).appendChild(el);
      const timer=setTimeout(()=>finish(new Error(`Tidsgränsen överskreds för ${src}`)),timeout);
    });
    scriptPromises.set(src,promise);
    return promise;
  }

  function uniqueResults(rows){
    const byId=new Map();
    for(const row of rows||[])if(row&&row.id!=null)byId.set(Number(row.id),row);
    return [...byId.values()];
  }
  function splitKey(row){return `${Number(row?.result_id)}|${row?.checkpoint_key??''}`}
  function uniqueSplits(rows){
    const byKey=new Map();
    for(const row of rows||[])if(row&&row.result_id!=null)byKey.set(splitKey(row),row);
    return [...byKey.values()];
  }
  function mergeRows(target,field,rows,keyFn){
    const current=Array.isArray(target[field])?target[field]:[];
    const seen=new Set(current.map(keyFn));
    let added=0;
    for(const row of rows||[]){
      const key=keyFn(row);
      if(seen.has(key))continue;
      current.push(row);seen.add(key);added++;
    }
    target[field]=current;
    return added;
  }
  function dispatch(kind,detail={}){
    if(typeof root?.dispatchEvent!=='function'||typeof root?.CustomEvent!=='function')return;
    root.dispatchEvent(new root.CustomEvent('ultravasan:data-expanded',{detail:{kind,...detail}}));
  }
  function normalizeBootstrap(bootstrap){
    const u3=bootstrap?.u3||{};
    const dataset={
      meta:{...(bootstrap?.meta||{})},
      races:[...(bootstrap?.races||[])],
      checkpoints:[...(bootstrap?.checkpoints||[])],
      results:uniqueResults(bootstrap?.results||[]),
      splits:uniqueSplits(bootstrap?.splits||[]),
      stats:bootstrap?.stats||{},
      sources:[...(bootstrap?.sources||[])],
    };
    Object.defineProperty(dataset,'u3',{value:u3,enumerable:false,writable:false});
    Object.defineProperty(dataset,'resultLocator',{value:u3.result_locator||{},enumerable:false,writable:false});
    loadedRaceIds.clear();
    if(u3.initial_race_id!=null)loadedRaceIds.add(Number(u3.initial_race_id));
    return dataset;
  }
  function setData(dataset,newMode){
    data=dataset;mode=newMode;
    if(root)root.ULTRAVASAN_DATA=dataset;
    return dataset;
  }
  async function legacyFallback(){
    if(root?.ULTRAVASAN_DATA&&Array.isArray(root.ULTRAVASAN_DATA.results)){
      return setData(root.ULTRAVASAN_DATA,'legacy');
    }
    await loadScript('data/ultravasan-data.js');
    if(!root?.ULTRAVASAN_DATA)throw new Error('Legacydatabasen laddades inte.');
    return setData(root.ULTRAVASAN_DATA,'legacy');
  }
  async function loadInitial(){
    if(data)return data;
    if(root?.ULTRAVASAN_U3_BOOTSTRAP?.meta?.data_contract==='u3-modular-v1'){
      return setData(normalizeBootstrap(root.ULTRAVASAN_U3_BOOTSTRAP),'modular');
    }
    if(root?.ULTRAVASAN_U3_AVAILABLE===false)return legacyFallback();
    try{
      if(!root?.ULTRAVASAN_U3_BOOTSTRAP)await loadScript('data/u3/bootstrap.js');
      if(root?.ULTRAVASAN_U3_BOOTSTRAP?.meta?.data_contract==='u3-modular-v1'){
        return setData(normalizeBootstrap(root.ULTRAVASAN_U3_BOOTSTRAP),'modular');
      }
    }catch(error){
      console.warn('U3 bootstrap saknas; använder legacy fallback.',error);
    }
    return legacyFallback();
  }
  function raceDescriptor(raceId){
    const map=data?.u3?.race_chunks||{};
    return map[String(Number(raceId))]||null;
  }
  async function ensureRace(raceId){
    await loadInitial();
    raceId=Number(raceId);
    if(mode!=='modular'||loadedRaceIds.has(raceId))return data;
    const descriptor=raceDescriptor(raceId);
    if(!descriptor)throw new Error(`U3 RaceEdition-bundle saknas för race_id=${raceId}`);
    await loadScript(`data/u3/${descriptor.path}`);
    const chunk=root?.ULTRAVASAN_U3_RACES?.[descriptor.race_key];
    if(!chunk)throw new Error(`U3 RaceEdition-bundle laddades inte: ${descriptor.race_key}`);
    const resultAdded=mergeRows(data,'results',chunk.results,row=>Number(row.id));
    const splitAdded=mergeRows(data,'splits',chunk.splits,splitKey);
    loadedRaceIds.add(raceId);
    dispatch('race',{raceId,raceKey:descriptor.race_key,resultAdded,splitAdded});
    return data;
  }
  async function ensureHistory(){
    await loadInitial();
    if(mode!=='modular')return data;
    if(historyPromise)return historyPromise;
    historyPromise=(async()=>{
      const path=data?.u3?.history_path||'history-index.js';
      await loadScript(`data/u3/${path}`);
      const history=root?.ULTRAVASAN_U3_HISTORY;
      if(!history?.results)throw new Error('U3 historikindex laddades inte.');
      const resultAdded=mergeRows(data,'results',history.results,row=>Number(row.id));
      dispatch('history',{resultAdded});
      return data;
    })();
    return historyPromise;
  }
  function locateRaceIds(resultIds){
    const locator=data?.resultLocator||data?.u3?.result_locator||{};
    return [...new Set((resultIds||[]).map(id=>Number(locator[String(Number(id))])).filter(Number.isFinite))];
  }
  async function ensureResults(resultIds){
    await loadInitial();
    if(mode!=='modular')return data;
    const races=locateRaceIds(resultIds);
    await Promise.all(races.map(ensureRace));
    return data;
  }
  async function ensureFamily(family){
    await loadInitial();
    if(mode!=='modular')return data;
    const chunks=Object.entries(data?.u3?.race_chunks||{})
      .filter(([,descriptor])=>descriptor.race_family===family)
      .map(([raceId])=>Number(raceId));
    for(const raceId of chunks)await ensureRace(raceId);
    dispatch('family',{family});
    return data;
  }
  function status(){
    return {
      mode,
      loadedRaceIds:[...loadedRaceIds].sort((a,b)=>a-b),
      historyLoaded:Boolean(root?.ULTRAVASAN_U3_HISTORY),
      loadedResults:data?.results?.length||0,
      loadedSplits:data?.splits?.length||0,
      totalResults:Number(data?.meta?.total_results)||data?.results?.length||0,
      totalSplits:Number(data?.meta?.total_splits)||data?.splits?.length||0,
    };
  }

  return {
    loadInitial,ensureRace,ensureHistory,ensureResults,ensureFamily,status,
    loadScript,uniqueResults,uniqueSplits,mergeRows,splitKey,
    get data(){return data},
    get mode(){return mode},
  };
});
