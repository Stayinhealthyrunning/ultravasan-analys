'use strict';
(function(root,factory){
  const contracts=typeof module==='object'&&module.exports?require('./race-contracts.js'):root.RaceContracts;
  const dataIndex=typeof module==='object'&&module.exports?require('./data-index.js'):root.UltravasanDataIndex;
  const api=factory(contracts,dataIndex);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.UltravasanDataAdapter=api;
})(typeof window!=='undefined'?window:globalThis,function(contracts,dataIndex){
  const asArray=value=>Array.isArray(value)?value:[];
  const numberOr=value=>{
    if(value===null||value===undefined||value==='')return value;
    const number=Number(value);
    return Number.isFinite(number)?number:value;
  };
  const defineOnce=(target,key,value)=>{
    if(!target||Object.prototype.hasOwnProperty.call(target,key))return target?.[key];
    Object.defineProperty(target,key,{value,enumerable:false,writable:false,configurable:false});
    return value;
  };

  function normalizeBase(dataset){
    const data=dataset&&typeof dataset==='object'?dataset:{};
    if(data.__ultravasanHydrated)return data;

    data.races=asArray(data.races);
    data.results=asArray(data.results);
    data.checkpoints=asArray(data.checkpoints);
    data.splits=asArray(data.splits);
    data.stats=data.stats&&typeof data.stats==='object'?data.stats:{};
    data.sources=asArray(data.sources);

    contracts?.assertKnownRaces?.(data.races);

    data.races.forEach(race=>{
      race.id=numberOr(race.id);
      race.year=numberOr(race.year);
      race.distance_km=numberOr(race.distance_km);
    });
    data.results.forEach(result=>{
      result.id=numberOr(result.id);
      result.race_id=numberOr(result.race_id);
      for(const key of [
        'finish_seconds','gun_seconds','net_seconds','overall_place','gender_place',
        'class_place','pace_seconds_per_km','birth_year','age'
      ]) result[key]=numberOr(result[key]);
    });
    data.checkpoints.forEach(checkpoint=>{
      checkpoint.race_id=numberOr(checkpoint.race_id);
      checkpoint.sequence_no=numberOr(checkpoint.sequence_no);
      checkpoint.distance_km=numberOr(checkpoint.distance_km);
    });

    const raceByResult=new Map(data.results.map(result=>[result.id,result.race_id]));
    const checkpointByRaceAndKey=new Map(
      data.checkpoints.map(checkpoint=>[
        `${checkpoint.race_id}|${checkpoint.checkpoint_key}`,
        checkpoint
      ])
    );

    data.splits.forEach(split=>{
      split.result_id=numberOr(split.result_id);
      for(const key of [
        'elapsed_seconds','segment_seconds','pace_seconds_per_km',
        'place_overall','place_gender','place_class','sequence_no','distance_km'
      ]) split[key]=numberOr(split[key]);
      const checkpoint=checkpointByRaceAndKey.get(
        `${raceByResult.get(split.result_id)}|${split.checkpoint_key}`
      );
      if(checkpoint){
        split.checkpoint_name=checkpoint.name;
        split.sequence_no=checkpoint.sequence_no;
        split.distance_km=checkpoint.distance_km;
      }
      if(split.is_estimated==null)split.is_estimated=0;
      else split.is_estimated=numberOr(split.is_estimated);
    });

    dataIndex?.ensureSplitsByResult?.(data);
    defineOnce(data,'__ultravasanHydrated',true);
    return data;
  }

  function hydrate(dataset,{statusApi=null,replayApi=null}={}){
    const data=normalizeBase(dataset);

    if(statusApi?.buildSplitEvidence&&!Object.prototype.hasOwnProperty.call(data,'splitEvidence')){
      defineOnce(data,'splitEvidence',statusApi.buildSplitEvidence(data.splits));
    }
    if(replayApi?.deriveOverallPlacements&&!Object.prototype.hasOwnProperty.call(data,'overallPlacementLookup')){
      const lookup=replayApi.deriveOverallPlacements(data.results,data.splits);
      if(lookup)defineOnce(data,'overallPlacementLookup',lookup);
    }
    if(replayApi?.deriveClassPlacements&&!Object.prototype.hasOwnProperty.call(data,'classPlacementLookup')){
      const lookup=replayApi.deriveClassPlacements(data.results,data.splits);
      if(lookup)defineOnce(data,'classPlacementLookup',lookup);
    }
    return data;
  }

  return Object.freeze({hydrate,normalizeBase});
});
