'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RunnerFavorites=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const STORAGE_KEY='ultravasan-runner-favorites-v1';
  const MAX_ITEMS=40;
  const validFamily=value=>value==='uv90'||value==='uv45';
  const text=value=>String(value??'').trim();

  function referenceKey(value){
    const resultId=Number(value?.result_id);
    const family=text(value?.family);
    return Number.isFinite(resultId)&&resultId>0&&validFamily(family)?`${family}:${resultId}`:null;
  }

  function normalizeReference(value){
    const key=referenceKey(value);
    if(!key)return null;
    const year=Number(value?.year);
    const raceKey=text(value?.race_key);
    const name=text(value?.name);
    if(!raceKey||!name||!Number.isFinite(year)||year<2010||year>2200)return null;
    return Object.freeze({
      key,
      result_id:Number(value.result_id),
      family:text(value.family),
      race_key:raceKey,
      year,
      name,
      bib:text(value.bib)||null,
      added_at:text(value.added_at)||null,
    });
  }

  function normalizeList(values){
    const seen=new Set(),out=[];
    for(const value of Array.isArray(values)?values:[]){
      const ref=normalizeReference(value);
      if(!ref||seen.has(ref.key))continue;
      seen.add(ref.key);
      out.push(ref);
      if(out.length>=MAX_ITEMS)break;
    }
    return out;
  }

  function read(storage){
    if(!storage||typeof storage.getItem!=='function')return[];
    try{
      const raw=storage.getItem(STORAGE_KEY);
      if(!raw)return[];
      return normalizeList(JSON.parse(raw));
    }catch{return[]}
  }

  function write(storage,values){
    const items=normalizeList(values);
    if(!storage||typeof storage.setItem!=='function')return{persisted:false,items};
    try{
      storage.setItem(STORAGE_KEY,JSON.stringify(items));
      return{persisted:true,items};
    }catch{return{persisted:false,items}}
  }

  function list(storage,family=null){
    const items=read(storage);
    return validFamily(family)?items.filter(item=>item.family===family):items;
  }

  function has(storage,reference){
    const key=typeof reference==='string'?reference:referenceKey(reference);
    return Boolean(key&&read(storage).some(item=>item.key===key));
  }

  function toggle(storage,reference){
    const ref=normalizeReference(reference);
    if(!ref)return{active:false,persisted:false,items:read(storage)};
    const items=read(storage),exists=items.some(item=>item.key===ref.key);
    const next=exists?items.filter(item=>item.key!==ref.key):[{...ref,added_at:ref.added_at||new Date().toISOString()},...items];
    const saved=write(storage,next);
    return{active:!exists,persisted:saved.persisted,items:saved.items};
  }

  function remove(storage,reference){
    const key=typeof reference==='string'?reference:referenceKey(reference);
    if(!key)return{removed:false,persisted:false,items:read(storage)};
    const items=read(storage),next=items.filter(item=>item.key!==key),removed=next.length!==items.length,saved=write(storage,next);
    return{removed,persisted:saved.persisted,items:saved.items};
  }

  function referenceFor(result,race,contracts){
    const family=contracts?.familyForRace?.(race)||null;
    return normalizeReference({
      result_id:result?.id,
      family,
      race_key:race?.race_key,
      year:race?.year,
      name:result?.name_as_published,
      bib:result?.bib,
    });
  }

  return Object.freeze({
    STORAGE_KEY,
    MAX_ITEMS,
    referenceKey,
    normalizeReference,
    normalizeList,
    read,
    write,
    list,
    has,
    toggle,
    remove,
    referenceFor,
  });
});
