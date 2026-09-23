'use strict';
(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.UltravasanDataLoader=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  const familyCache=new Map();
  const familyCoreCache=new Map();
  const familySplitCache=new Map();
  const familyShellCache=new Map();
  const editionCoreCache=new Map();
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

  async function loadOldModularFamily(family){
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

  async function loadFamilyPart(family,partKey,cache,globalName,label){
    family=normalizeFamily(family);
    if(cache.has(family))return cache.get(family);
    const spec=familySpec(family)?.[partKey];
    if(!spec)throw new Error(`Datakatalogen saknar ${label} för ${family}.`);
    const globals=root[globalName]||(root[globalName]={});
    if(globals[family]){
      cache.set(family,Promise.resolve(globals[family]));
      return globals[family];
    }
    const promise=(async()=>{
      const canFetch=typeof location==='undefined'||location.protocol!=='file:';
      if(canFetch&&spec.json){
        try{
          const data=await fetchJson(spec.json);
          globals[family]=data;
          return data;
        }catch(error){
          if(!spec.js)throw error;
          console.warn?.(`JSON för ${family} ${label} kunde inte läsas; använder offline-JavaScript.`,error);
        }
      }
      if(!spec.js)throw new Error(`Ingen ${label}-modul angiven för ${family}.`);
      await loadScript(spec.js);
      if(!globals[family])throw new Error(`${label}-modulen för ${family} laddades utan payload.`);
      return globals[family];
    })();
    cache.set(family,promise);
    try{return await promise}catch(error){cache.delete(family);throw error}
  }

  async function loadJsonOnlyModule(spec,cache,key,globalName,label){
    if(cache.has(key))return cache.get(key);
    const globals=root[globalName]||(root[globalName]={});
    if(globals[key]){
      cache.set(key,Promise.resolve(globals[key]));
      return globals[key];
    }
    if(typeof location!=='undefined'&&location.protocol==='file:'){
      throw new Error(`${label} kräver HTTP/HTTPS.`);
    }
    if(!spec?.json)throw new Error(`Datakatalogen saknar JSON för ${label}.`);
    const promise=fetchJson(spec.json).then(data=>{
      globals[key]=data;
      return data;
    });
    cache.set(key,promise);
    try{return await promise}catch(error){cache.delete(key);throw error}
  }

  async function loadModularFamilyShell(family){
    family=normalizeFamily(family);
    const spec=familySpec(family)?.shell;
    return loadJsonOnlyModule(spec,familyShellCache,family,'ULTRAVASAN_DATA_FAMILY_SHELLS',`family-shell ${family}`);
  }

  async function loadModularEditionCore(editionKey){
    editionKey=String(editionKey);
    const spec=editionSpec(editionKey)?.core;
    return loadJsonOnlyModule(spec,editionCoreCache,editionKey,'ULTRAVASAN_DATA_EDITION_CORES',`edition-core ${editionKey}`);
  }

  async function loadModularFamilyCore(family){
    const spec=familySpec(family);
    if(!spec.core)return loadOldModularFamily(family);
    return loadFamilyPart(family,'core',familyCoreCache,'ULTRAVASAN_DATA_FAMILY_CORES','coredata');
  }

  async function loadModularFamilySplits(family){
    const spec=familySpec(family);
    if(!spec.split_data)return loadOldModularFamily(family);
    return loadFamilyPart(family,'split_data',familySplitCache,'ULTRAVASAN_DATA_FAMILY_SPLITS','splitdata');
  }

  async function loadModularFamily(family){
    family=normalizeFamily(family);
    const spec=familySpec(family);
    if(!spec.core||!spec.split_data)return loadOldModularFamily(family);
    if(familyCache.has(family))return familyCache.get(family);
    const promise=(async()=>{
      const [core,splitData]=await Promise.all([
        loadModularFamilyCore(family),
        loadModularFamilySplits(family),
      ]);
      const merged=mergeDatasets([core,splitData]);
      merged.meta={...(core.meta||{}),data_scope:{kind:'race-family',race_family:family,data_parts:['core','splits']}};
      return merged;
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

  async function loadInitialFamily(family,editionKey=null){
    family=normalizeFamily(family);
    if(catalog().mode!=='modular')return loadLegacy();
    const spec=familySpec(family);
    const canFetch=typeof location==='undefined'||location.protocol!=='file:';
    const key=String(editionKey??spec.default_race_id??'');
    if(!canFetch||!spec.shell||!key||!catalog()?.editions?.[key]?.core){
      return loadModularFamilyCore(family);
    }
    try{
      const [shell,editionCore]=await Promise.all([
        loadModularFamilyShell(family),
        loadModularEditionCore(key),
      ]);
      const merged=mergeDatasets([shell,editionCore]);
      const edition=catalog().editions[key];
      merged.meta={
        ...(shell.meta||{}),
        data_scope:{
          kind:'race-family-active-core',
          race_family:family,
          race_id:Number(key),
          race_key:edition?.race_key||null,
          data_parts:['shell','edition-core']
        }
      };
      return merged;
    }catch(error){
      console.warn?.(`Aktivt loppår för ${family} kunde inte laddas; använder family core.`,error);
      return loadModularFamilyCore(family);
    }
  }

  async function loadFamilyCore(family){
    if(catalog().mode!=='modular')return loadLegacy();
    return loadModularFamilyCore(family);
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
    familyCache.clear();familyCoreCache.clear();familySplitCache.clear();familyShellCache.clear();editionCoreCache.clear();editionCache.clear();legacyPromise=null;
  }

  return {normalizeFamily,catalog,mode,totals,editionForResultId,familyForResultId,mergeDatasets,loadInitialFamily,loadFamilyCore,loadFamily,loadForResultIds,clearCaches};
});
