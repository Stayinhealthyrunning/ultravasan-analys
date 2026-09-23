'use strict';
(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.UltravasanDataLoader=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  const familyCache=new Map();
  const editionCache=new Map();
  let legacyPromise=null;

  const normalizeFamily=value=>value==='uv45'?'uv45':'uv90';
  const catalog=()=>root.ULTRAVASAN_DATA_CATALOG||{
    schema_version:1,
    mode:'legacy',
    legacy:{json:'data/ultravasan.json',js:'data/ultravasan-data.js'}
  };

  function loadScript(src,timeout=90000){
    if(typeof document==='undefined')return Promise.reject(new Error('Script loading requires a browser document.'));
    return new Promise((resolve,reject)=>{
      const el=document.createElement('script');let settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve()};
      el.src=src;el.async=true;el.onload=()=>finish();el.onerror=()=>finish(new Error(`Kunde inte läsa ${src}`));
      document.head.appendChild(el);
      const timer=setTimeout(()=>finish(new Error(`Tidsgränsen överskreds för ${src}`)),timeout);
    });
  }

  async function fetchJson(src){
    if(typeof fetch!=='function')throw new Error('fetch saknas');
    const response=await fetch(src,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status} för ${src}`);
    return response.json();
  }

  async function loadLegacy(){
    if(root.ULTRAVASAN_DATA)return root.ULTRAVASAN_DATA;
    if(legacyPromise)return legacyPromise;
    const spec=catalog().legacy||{};
    legacyPromise=(async()=>{
      const canFetch=typeof location==='undefined'||location.protocol!=='file:';
      if(canFetch&&spec.json){
        try{
          const data=await fetchJson(spec.json);
          root.ULTRAVASAN_DATA=data;
          return data;
        }catch(error){
          if(!spec.js)throw error;
          console.warn?.('JSON-laddning misslyckades; använder offline-JavaScript.',error);
        }
      }
      if(!spec.js)throw new Error('Legacydatakälla saknas.');
      await loadScript(spec.js);
      if(!root.ULTRAVASAN_DATA)throw new Error('Legacydatabasen laddades men exponerade ingen data.');
      return root.ULTRAVASAN_DATA;
    })();
    try{return await legacyPromise}catch(error){legacyPromise=null;throw error}
  }

  function editionForResultId(resultId,sourceCatalog=catalog()){
    const value=sourceCatalog?.result_edition?.[String(resultId)];
    return value!==null&&value!==undefined&&value!==''?String(value):null;
  }

  function familyForResultId(resultId,sourceCatalog=catalog()){
    const direct=sourceCatalog?.result_family?.[String(resultId)];
    if(direct==='uv90'||direct==='uv45')return direct;
    const editionKey=editionForResultId(resultId,sourceCatalog);
    const derived=editionKey?sourceCatalog?.editions?.[editionKey]?.race_family:null;
    return derived==='uv90'||derived==='uv45'?derived:null;
  }

  function familySpec(family){
    const spec=catalog()?.families?.[normalizeFamily(family)];
    if(!spec)throw new Error(`Datakatalogen saknar familjen ${family}.`);
    return spec;
  }

  async function loadModularFamily(family){
    family=normalizeFamily(family);
    if(familyCache.has(family))return familyCache.get(family);
    const globals=root.ULTRAVASAN_DATA_FAMILIES||(root.ULTRAVASAN_DATA_FAMILIES={});
    if(globals[family]){
      familyCache.set(family,Promise.resolve(globals[family]));
      return globals[family];
    }
    const spec=familySpec(family);
    const promise=(async()=>{
      const canFetch=typeof location==='undefined'||location.protocol!=='file:';
      if(canFetch&&spec.json){
        try{
          const data=await fetchJson(spec.json);
          globals[family]=data;
          return data;
        }catch(error){
          if(!spec.js)throw error;
          console.warn?.(`JSON för ${family} kunde inte läsas; använder offline-JavaScript.`,error);
        }
      }
      if(!spec.js)throw new Error(`Ingen datamodul angiven för ${family}.`);
      await loadScript(spec.js);
      if(!globals[family])throw new Error(`Datamodulen för ${family} laddades utan payload.`);
      return globals[family];
    })();
    familyCache.set(family,promise);
    try{return await promise}catch(error){familyCache.delete(family);throw error}
  }

  function editionSpec(editionKey){
    const spec=catalog()?.editions?.[editionKey];
    if(!spec)throw new Error(`Datakatalogen saknar utgåvan ${editionKey}.`);
    return spec;
  }

  async function loadModularEdition(editionKey){
    if(editionCache.has(editionKey))return editionCache.get(editionKey);
    const globals=root.ULTRAVASAN_DATA_EDITIONS||(root.ULTRAVASAN_DATA_EDITIONS={});
    if(globals[editionKey]){
      editionCache.set(editionKey,Promise.resolve(globals[editionKey]));
      return globals[editionKey];
    }
    const spec=editionSpec(editionKey);
    const promise=(async()=>{
      const canFetch=typeof location==='undefined'||location.protocol!=='file:';
      if(canFetch&&spec.json){
        try{
          const data=await fetchJson(spec.json);
          globals[editionKey]=data;
          return data;
        }catch(error){
          if(!spec.js)throw error;
          console.warn?.(`JSON för ${editionKey} kunde inte läsas; använder offline-JavaScript.`,error);
        }
      }
      if(!spec.js)throw new Error(`Ingen datamodul angiven för ${editionKey}.`);
      await loadScript(spec.js);
      if(!globals[editionKey])throw new Error(`Datamodulen för ${editionKey} laddades utan payload.`);
      return globals[editionKey];
    })();
    editionCache.set(editionKey,promise);
    try{return await promise}catch(error){editionCache.delete(editionKey);throw error}
  }

  async function loadFamily(family){
    if(catalog().mode!=='modular')return loadLegacy();
    return loadModularFamily(family);
  }

  function mergeDatasets(datasets){
    const list=(datasets||[]).filter(Boolean);
    if(!list.length)return {meta:{},races:[],checkpoints:[],results:[],splits:[],stats:{},sources:[]};
    if(list.length===1)return list[0];
    const unique=(rows,keyFn)=>{
      const map=new Map();
      for(const row of rows)map.set(keyFn(row),row);
      return [...map.values()];
    };
    const races=unique(list.flatMap(d=>d.races||[]),r=>r.id);
    const checkpoints=unique(list.flatMap(d=>d.checkpoints||[]),c=>`${c.race_id}|${c.checkpoint_key}`);
    const results=unique(list.flatMap(d=>d.results||[]),r=>r.id);
    const splits=unique(list.flatMap(d=>d.splits||[]),s=>`${s.result_id}|${s.checkpoint_key}`);
    const sources=unique(list.flatMap(d=>d.sources||[]),s=>s.code||s.name);
    const stats=Object.assign({},...list.map(d=>d.stats||{}));
    const scopes=list.map(d=>d?.meta?.data_scope?.kind).filter(Boolean);
    const mergedKind=scopes.length&&scopes.every(kind=>kind==='race-edition')?'merged-editions':'merged-modules';
    return {
      meta:{...(list[0].meta||{}),data_scope:{kind:mergedKind}},
      races,checkpoints,results,splits,stats,sources
    };
  }

  async function loadForResultIds(resultIds,preferredFamily=null){
    const ids=[...new Set((resultIds||[]).map(Number).filter(Number.isFinite))];
    const current=catalog();
    if(current.mode!=='modular')return loadLegacy();

    const editionKeys=ids.map(id=>editionForResultId(id,current));
    const canFetchEditions=typeof location==='undefined'||location.protocol!=='file:';
    if(ids.length&&editionKeys.every(Boolean)&&current.editions&&canFetchEditions){
      const uniqueEditions=[...new Set(editionKeys)];
      try{
        return mergeDatasets(await Promise.all(uniqueEditions.map(loadModularEdition)));
      }catch(error){
        console.warn?.('Edition-laddning misslyckades; faller tillbaka till race family.',error);
      }
    }

    const families=[...new Set(ids.map(id=>familyForResultId(id,current)).filter(Boolean))];
    if(!families.length){
      if(preferredFamily)return loadModularFamily(preferredFamily);
      const known=Object.keys(current.families||{});
      return mergeDatasets(await Promise.all(known.map(loadModularFamily)));
    }
    return mergeDatasets(await Promise.all(families.map(loadModularFamily)));
  }

  function totals(){
    return catalog().totals||null;
  }

  function mode(){
    return catalog().mode||'legacy';
  }

  function clearCaches(){
    familyCache.clear();editionCache.clear();legacyPromise=null;
  }

  return {normalizeFamily,catalog,mode,totals,editionForResultId,familyForResultId,mergeDatasets,loadFamily,loadForResultIds,clearCaches};
});
