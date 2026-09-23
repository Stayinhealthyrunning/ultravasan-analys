'use strict';
(function(root,factory){
  const contracts=typeof module==='object'&&module.exports?require('./race-contracts.js'):root.RaceContracts;
  const api=factory(contracts);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RaceUI=api;
})(typeof window!=='undefined'?window:globalThis,function(contracts){
  if(!contracts)throw new Error('RaceUI kräver RaceContracts.');

  const families=contracts.catalog.families;
  const presentations=Object.freeze(Object.fromEntries(
    Object.entries(families).map(([key,family])=>[
      key,
      Object.freeze({...family.presentation})
    ])
  ));

  function familyKey(value){
    if(typeof value==='string'&&contracts.family(value))return value;
    return contracts.familyForRace(value);
  }

  function family(value){
    const key=familyKey(value);
    return key?contracts.family(key):null;
  }

  function presentation(value){
    const key=familyKey(value);
    return key?presentations[key]||null:null;
  }

  function labelFor(value){
    return family(value)?.label||contracts.catalog.event.name;
  }

  function startNameFor(value){
    return family(value)?.start_name||'Start';
  }

  function titleFor(value){
    return presentation(value)?.title||contracts.catalog.event.product_title||contracts.catalog.event.name;
  }

  function heroFor(value){
    return presentation(value)?.hero||null;
  }

  function altFor(value){
    return presentation(value)?.alt||labelFor(value);
  }

  function editionTitle(race){
    const year=Number(race?.year);
    return Number.isFinite(year)?`${labelFor(race)} ${year}`:labelFor(race);
  }

  function selectionTitle(races){
    const list=(races||[]).filter(Boolean);
    if(!list.length)return contracts.catalog.event.name;
    const keys=[...new Set(list.map(familyKey).filter(Boolean))];
    const years=[...new Set(list.map(r=>Number(r.year)).filter(Number.isFinite))].sort((a,b)=>a-b);
    const label=keys.length===1?labelFor(keys[0]):contracts.catalog.event.name;
    return years.length===1?`${label} ${years[0]}`:years.length?`${label} · ${years.join(', ')}`:label;
  }

  return Object.freeze({
    presentations,
    familyKey,
    family,
    presentation,
    labelFor,
    startNameFor,
    titleFor,
    heroFor,
    altFor,
    editionTitle,
    selectionTitle,
  });
});
