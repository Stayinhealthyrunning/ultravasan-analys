'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.UltravasanManualIdentityLinks=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const text=value=>String(value??'').trim();
  function buildLookup(registry){
    const lookup=new Map();
    if(!registry||Number(registry.schema_version)!==1)return lookup;
    for(const link of registry.links||[]){
      const personKey=text(link.person_key);
      if(!personKey)throw new Error('Manual identity link saknar person_key');
      for(const member of link.members||[]){
        const raceKey=text(member.race_key),sourceResultId=text(member.source_result_id);
        if(!raceKey||!sourceResultId)throw new Error('Manual identity member saknar race_key/source_result_id');
        const key=raceKey+'\u0000'+sourceResultId,existing=lookup.get(key);
        if(existing&&existing.person_key!==personKey)throw new Error('Motstridiga manuella identitetslänkar för '+raceKey+' / '+sourceResultId);
        lookup.set(key,{person_key:personKey,decision:text(link.decision)||'admin-verified',link_id:text(link.link_id)});
      }
    }
    return lookup;
  }
  function apply(dataset,registry){
    if(!dataset||!Array.isArray(dataset.races)||!Array.isArray(dataset.results))return dataset;
    const lookup=buildLookup(registry),raceById=new Map(dataset.races.map(race=>[String(race.id),text(race.race_key)]));
    if(!lookup.size)return dataset;
    for(const row of dataset.results){
      const raceKey=raceById.get(String(row.race_id))||'',sourceResultId=text(row.source_result_id);
      const link=lookup.get(raceKey+'\u0000'+sourceResultId);
      if(!link)continue;
      const existing=text(row.person_key);
      if(existing&&existing!==link.person_key)throw new Error('Manuell identitetslänk kolliderar med verifierad person för resultat '+row.id);
      row.person_key=link.person_key;
      if(!row.athlete_match_status||row.athlete_match_status==='unverified')row.athlete_match_status='manual-verified';
    }
    return dataset;
  }
  return Object.freeze({buildLookup,apply});
});
