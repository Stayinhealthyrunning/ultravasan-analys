'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.UltravasanDataIndex=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const EMPTY_SPLITS=Object.freeze([]);

  function buildSplitsByResult(splits){
    const index=new Map();
    (Array.isArray(splits)?splits:[]).forEach(split=>{
      let rows=index.get(split.result_id);
      if(!rows){rows=[];index.set(split.result_id,rows)}
      rows.push(split);
    });
    index.forEach(rows=>Object.freeze(rows));
    return index;
  }

  function ensureSplitsByResult(dataset){
    if(!dataset||typeof dataset!=='object')return new Map();
    if(dataset.splitsByResult instanceof Map)return dataset.splitsByResult;
    const index=buildSplitsByResult(dataset.splits);
    Object.defineProperty(dataset,'splitsByResult',{value:index,enumerable:false,writable:false,configurable:false});
    return index;
  }

  function splitsForResult(dataset,resultId){
    const index=ensureSplitsByResult(dataset);
    return index.get(resultId)||index.get(Number(resultId))||EMPTY_SPLITS;
  }

  function splitsForResults(dataset,results){
    const index=ensureSplitsByResult(dataset),out=[],ids=new Set();
    for(const result of results||[]){
      const id=typeof result==='object'?result?.id:result;
      ids.add(id);
      ids.add(Number(id));
    }
    // Mapens insättningsordning följer exportens result-/checkpointordning. Därmed
    // bevaras ordningen utan att samtliga 116 000 splits skannas eller sorteras om.
    index.forEach((rows,resultId)=>{if(ids.has(resultId))out.push(...rows)});
    return out;
  }

  return {buildSplitsByResult,ensureSplitsByResult,splitsForResult,splitsForResults,EMPTY_SPLITS};
});
