'use strict';
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.UltravasanDataLoader=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  const editionPromises=new Map();
  let corePromise=null;
  let dataset=null;

  const isFileProtocol=()=>typeof location!=='undefined'&&location.protocol==='file:';
  const loadScript=(src,timeout=90000)=>new Promise((resolve,reject)=>{
    if(typeof document==='undefined')return reject(new Error('Document saknas'));
    const el=document.createElement('script');
    let done=false;
    const finish=err=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve()};
    el.src=src;el.async=true;el.onload=()=>finish();el.onerror=()=>finish(new Error(`Kunde inte läsa ${src}`));
    document.head.appendChild(el);
    const timer=setTimeout(()=>finish(new Error(`Tidsgränsen överskreds för ${src}`)),timeout);
  });
  async function readJsonOrScript(jsonPath,scriptPath,globalName){
    if(root&&root[globalName])return root[globalName];
    if(!isFileProtocol()&&typeof fetch==='function'){
      try{
        const response=await fetch(jsonPath,{cache:'no-store'});
        if(response.ok)return await response.json();
      }catch(error){
        console.warn('JSON-laddning misslyckades, provar scriptfallback',jsonPath,error);
      }
    }
    await loadScript(scriptPath);
    if(!root?.[globalName])throw new Error(`Datamodulen ${globalName} laddades inte`);
    return root[globalName];
  }
  function raceEntry(raceId){
    const id=Number(raceId);
    return dataset?.meta?.modular_data?.editions?.[String(id)]||null;
  }
  function editionGlobal(entry){
    return entry?.global||(`ULTRAVASAN_EDITION_${String(entry?.race_id??'').replace(/\D/g,'_')}`);
  }
  function makeDataset(bootstrap,history){
    const data={
      meta:bootstrap.meta||{},
      races:bootstrap.races||[],
      checkpoints:bootstrap.checkpoints||[],
      stats:bootstrap.stats||{},
      sources:bootstrap.sources||[],
      results:history.results||[],
      splits:[],
    };
    Object.defineProperty(data,'loadedRaceIds',{value:new Set(),enumerable:false,writable:false});
    Object.defineProperty(data,'loadingMode',{value:'modular',enumerable:false,writable:false});
    return data;
  }
  async function loadCore(){
    if(dataset)return dataset;
    if(corePromise)return corePromise;
    corePromise=(async()=>{
      if(root?.ULTRAVASAN_DATA){
        dataset=root.ULTRAVASAN_DATA;
        if(!(dataset.loadedRaceIds instanceof Set)){
          Object.defineProperty(dataset,'loadedRaceIds',{value:new Set((dataset.races||[]).map(r=>r.id)),enumerable:false});
        }
        return dataset;
      }
      try{
        const bootstrap=await readJsonOrScript('data/bootstrap.json','data/bootstrap.js','ULTRAVASAN_BOOTSTRAP');
        const history=await readJsonOrScript('data/history-index.json','data/history-index.js','ULTRAVASAN_HISTORY_INDEX');
        dataset=makeDataset(bootstrap,history);
        return dataset;
      }catch(modularError){
        console.warn('Modulär U3-data kunde inte laddas; använder testad monolitfallback.',modularError);
        if(!root?.ULTRAVASAN_DATA)await loadScript('data/ultravasan-data.js');
        if(!root?.ULTRAVASAN_DATA)throw modularError;
        dataset=root.ULTRAVASAN_DATA;
        if(!(dataset.loadedRaceIds instanceof Set)){
          Object.defineProperty(dataset,'loadedRaceIds',{value:new Set((dataset.races||[]).map(r=>r.id)),enumerable:false});
        }
        return dataset;
      }
    })();
    return corePromise;
  }
  async function ensureEdition(raceId){
    const data=await loadCore();
    const id=Number(raceId);
    if(!Number.isFinite(id))throw new Error(`Ogiltigt raceId: ${raceId}`);
    if(data.loadedRaceIds?.has(id))return data;
    if(editionPromises.has(id))return editionPromises.get(id);
    const promise=(async()=>{
      const entry=raceEntry(id);
      if(!entry)throw new Error(`Modulär data saknas för raceId ${id}`);
      const globalName=editionGlobal(entry);
      const bundle=await readJsonOrScript(entry.json,entry.js,globalName);
      if(Number(bundle.race_id)!==id)throw new Error(`Fel edition bundle: väntade ${id}, fick ${bundle.race_id}`);
      root.UltravasanDataIndex?.appendSplits?.(data,bundle.splits||[]);
      data.loadedRaceIds.add(id);
      if(root&&typeof root.dispatchEvent==='function'){
        root.dispatchEvent(new CustomEvent('ultravasan:edition-loaded',{detail:{raceId:id,splitCount:(bundle.splits||[]).length}}));
      }
      return data;
    })().finally(()=>editionPromises.delete(id));
    editionPromises.set(id,promise);
    return promise;
  }
  async function ensureEditions(raceIds){
    const ids=[...new Set((raceIds||[]).map(Number).filter(Number.isFinite))];
    await Promise.all(ids.map(ensureEdition));
    return dataset;
  }
  async function ensureFamily(familyKey,contracts=root?.RaceContracts){
    const data=await loadCore();
    const ids=(data.races||[])
      .filter(race=>contracts?.familyForRace?.(race)===familyKey)
      .map(race=>race.id);
    return ensureEditions(ids);
  }
  async function ensureResults(resultIds){
    const data=await loadCore();
    const wanted=new Set((resultIds||[]).map(Number));
    const raceIds=[...new Set((data.results||[]).filter(r=>wanted.has(Number(r.id))).map(r=>r.race_id))];
    return ensureEditions(raceIds);
  }
  function status(){
    return {
      mode:dataset?.loadingMode|| (root?.ULTRAVASAN_DATA?'monolith':'unloaded'),
      loadedRaceIds:[...(dataset?.loadedRaceIds||[])],
      totalRaces:dataset?.races?.length||0,
    };
  }
  return {loadCore,ensureEdition,ensureEditions,ensureFamily,ensureResults,status,loadScript};
});
