'use strict';
(function(root,factory){
  const contracts=typeof module==='object'&&module.exports?require('./race-contracts.js'):root.RaceContracts;
  const history=typeof module==='object'&&module.exports?require('./history-engine.js'):root.UltravasanHistoryEngine;
  const dataIndex=typeof module==='object'&&module.exports?require('./data-index.js'):root.UltravasanDataIndex;
  const statusApi=typeof module==='object'&&module.exports?require('./result-status.js'):root.ResultStatus;
  const api=factory(contracts,history,dataIndex,statusApi);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RunnerAnalysis=api;
})(typeof window!=='undefined'?window:globalThis,function(contracts,history,dataIndex,statusApi){
  if(!contracts||!history||!dataIndex)throw new Error('RunnerAnalysis kräver RaceContracts, HistoryEngine och DataIndex.');

  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const numberOrNull=value=>finite(value)?Number(value):null;

  function raceForResult(dataset,result){
    return (dataset?.races||[]).find(race=>String(race.id)===String(result?.race_id))||null;
  }

  function courseVersionId(race){
    return contracts.editionForRace(race)?.course_version_id||null;
  }

  function historyRaces(dataset){
    return (dataset?.races||[]).map(race=>{
      const edition=contracts.editionForRace(race);
      return {
        ...race,
        course_version:edition?.course_version_id||null,
        whole_course_comparison_group:edition?.whole_course_comparison_group||null,
      };
    });
  }

  function splitMap(dataset,resultId){
    return new Map(
      dataIndex.splitsForResult(dataset,resultId)
        .map(split=>[String(split.checkpoint_key||'').toLowerCase(),split])
    );
  }

  function normalizedCheckpoints(dataset,race){
    return (dataset?.checkpoints||[])
      .filter(checkpoint=>String(checkpoint.race_id)===String(race?.id))
      .slice()
      .sort((a,b)=>Number(a.sequence_no||0)-Number(b.sequence_no||0)||Number(a.distance_km||0)-Number(b.distance_km||0));
  }

  function journeyForResult(dataset,resultId){
    const result=(dataset?.results||[]).find(row=>String(row.id)===String(resultId));
    if(!result)return null;
    const race=raceForResult(dataset,result);
    if(!race)return null;

    const checkpoints=normalizedCheckpoints(dataset,race);
    const byKey=splitMap(dataset,result.id);
    const ownSplits=dataIndex.splitsForResult(dataset,result.id);
    const classification=statusApi?.classify
      ?statusApi.classify(result,{hasSplit:ownSplits.length>0})
      :null;
    const rows=[];
    const start=checkpoints[0];
    if(start){
      rows.push(Object.freeze({
        checkpoint_key:String(start.checkpoint_key||'start').toLowerCase(),
        checkpoint_name:start.name||start.checkpoint_name||'Start',
        sequence_no:Number(start.sequence_no||0),
        distance_km:numberOrNull(start.distance_km)??0,
        elapsed_seconds:0,
        segment_seconds:null,
        pace_seconds_per_km:null,
        place_overall:null,
        place_class:null,
        exact:true,
        source:'start',
      }));
    }

    for(let index=1;index<checkpoints.length;index++){
      const checkpoint=checkpoints[index];
      const key=String(checkpoint.checkpoint_key||'').toLowerCase();
      const split=byKey.get(key)||null;
      const isFinish=index===checkpoints.length-1;
      const finishFallback=isFinish&&!split&&finite(result.finish_seconds)&&classification?.finished===true;
      const estimated=Boolean(split&&(split.is_estimated===true||Number(split.is_estimated)===1||String(split.is_estimated).toLowerCase()==='true'));
      rows.push(Object.freeze({
        checkpoint_key:key,
        checkpoint_name:checkpoint.name||checkpoint.checkpoint_name||key,
        sequence_no:Number(checkpoint.sequence_no||index),
        distance_km:numberOrNull(checkpoint.distance_km),
        elapsed_seconds:split?numberOrNull(split.elapsed_seconds):(finishFallback?Number(result.finish_seconds):null),
        segment_seconds:split?numberOrNull(split.segment_seconds):null,
        pace_seconds_per_km:split?numberOrNull(split.pace_seconds_per_km):null,
        place_overall:split?numberOrNull(split.place_overall):null,
        place_class:split?numberOrNull(split.place_class):null,
        exact:finishFallback?true:Boolean(split&&!estimated),
        source:finishFallback?'finish-result':split?(estimated?'estimated-split':'split'):'missing',
      }));
    }

    return Object.freeze({
      result,
      race,
      course_version_id:courseVersionId(race),
      status:classification,
      rows:Object.freeze(rows),
      recorded_rows:rows.filter(row=>row.elapsed_seconds!==null).length,
      missing_rows:rows.filter(row=>row.source==='missing').length,
    });
  }

  function historyForResult(dataset,resultId){
    const result=(dataset?.results||[]).find(row=>String(row.id)===String(resultId));
    if(!result)return null;
    const races=historyRaces(dataset);
    const key=history.identityKey(result);
    const grouped=history.groupHistories(dataset?.results||[],races);
    const group=grouped.find(item=>item.key===key)||{key,verified_person:false,rows:[result]};
    return Object.freeze({
      key:group.key,
      verified_person:Boolean(group.verified_person&&history.hasVerifiedPersonIdentity(result)),
      rows:Object.freeze(group.rows.slice()),
    });
  }

  function profileForResult(dataset,resultId){
    const journey=journeyForResult(dataset,resultId);
    if(!journey)return null;
    const personHistory=historyForResult(dataset,resultId);
    return Object.freeze({
      result:journey.result,
      race:journey.race,
      family:contracts.familyForRace(journey.race),
      course_version_id:journey.course_version_id,
      journey,
      history:personHistory,
    });
  }

  function journeyStartDescription(profile){
    return profile?.journey?.status?.dns===true?'Ingen start registrerad':'Loppet börjar här';
  }

  function pairwiseEvery(items,predicate){
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(!predicate(items[i],items[j]))return false;
    return true;
  }

  function headToHead(dataset,resultIds){
    const ids=[...new Set((resultIds||[]).map(String))].slice(0,5);
    const results=ids.map(id=>(dataset?.results||[]).find(row=>String(row.id)===id)).filter(Boolean);
    if(results.length<2)return Object.freeze({available:false,reason:'need-two-runners',results:Object.freeze(results)});

    const races=historyRaces(dataset);
    const raceById=new Map(races.map(race=>[String(race.id),race]));
    const selected=results.map(result=>({
      result,
      race:raceById.get(String(result.race_id))||null,
      journey:journeyForResult(dataset,result.id),
    }));
    if(selected.some(item=>!item.race||!item.journey)){
      return Object.freeze({available:false,reason:'missing-race-data',results:Object.freeze(results)});
    }

    const families=[...new Set(selected.map(item=>contracts.familyForRace(item.race)))];
    if(families.length!==1){
      return Object.freeze({available:false,reason:'mixed-race-family',results:Object.freeze(results)});
    }

    const versionIds=selected.map(item=>courseVersionId(item.race));
    const sameCourseVersion=versionIds.every(id=>id&&id===versionIds[0]);
    const comparableWhole=pairwiseEvery(selected,(a,b)=>history.wholeCourseComparable(a.result,b.result,races,contracts.catalog.courses));

    const finishers=selected.filter(item=>{
      if(!finite(item.result.finish_seconds))return false;
      if(!statusApi?.classify)return true;
      const hasSplit=dataIndex.splitsForResult(dataset,item.result.id).length>0;
      return statusApi.classify(item.result,{hasSplit}).finished===true;
    });
    const finishRanking=comparableWhole
      ?finishers.slice().sort((a,b)=>Number(a.result.finish_seconds)-Number(b.result.finish_seconds)).map((item,index,array)=>Object.freeze({
        result_id:item.result.id,
        finish_seconds:Number(item.result.finish_seconds),
        gap_seconds:Number(item.result.finish_seconds)-Number(array[0].result.finish_seconds),
        rank:index+1,
      }))
      :[];

    const journeyMaps=selected.map(item=>new Map(item.journey.rows.map(row=>[row.checkpoint_key,row])));
    const commonKeys=selected[0].journey.rows
      .map(row=>row.checkpoint_key)
      .filter(key=>journeyMaps.every(map=>map.has(key)));
    const checkpointRows=commonKeys.filter(key=>key!=='start').map(key=>{
      const entries=selected.map((item,itemIndex)=>{
        const row=journeyMaps[itemIndex].get(key);
        return Object.freeze({
          result_id:item.result.id,
          elapsed_seconds:row?.elapsed_seconds??null,
          distance_km:row?.distance_km??null,
          place_overall:row?.place_overall??null,
          place_class:row?.place_class??null,
          exact:Boolean(row?.exact),
        });
      });
      const exactTimes=sameCourseVersion?entries.filter(entry=>entry.exact&&finite(entry.elapsed_seconds)).map(entry=>Number(entry.elapsed_seconds)):[];
      const best=exactTimes.length?Math.min(...exactTimes):null;
      return Object.freeze({
        checkpoint_key:key,
        checkpoint_name:selected[0].journey.rows.find(row=>row.checkpoint_key===key)?.checkpoint_name||key,
        comparable:sameCourseVersion,
        entries:Object.freeze(entries.map((entry,itemIndex)=>{
          const previousKey=commonKeys[Math.max(0,commonKeys.indexOf(key)-1)],previous=journeyMaps[itemIndex].get(previousKey);
          const placement_change=entry.exact&&finite(entry.place_overall)&&previous?.exact&&finite(previous.place_overall)?Number(previous.place_overall)-Number(entry.place_overall):null;
          return Object.freeze({
            ...entry,
            gap_seconds:best===null||!entry.exact||!finite(entry.elapsed_seconds)?null:Number(entry.elapsed_seconds)-best,
            placement_change,
          });
        })),
      });
    });

    const segmentRows=[];
    for(let index=1;index<commonKeys.length;index++){
      const from=commonKeys[index-1],to=commonKeys[index];
      const comparable=pairwiseEvery(selected,(a,b)=>
        history.segmentComparable(courseVersionId(a.race),courseVersionId(b.race),from,to,contracts.catalog.courses)
      );
      const entries=selected.map(item=>{
        const row=item.journey.rows.find(value=>value.checkpoint_key===to);
        return Object.freeze({
          result_id:item.result.id,
          segment_seconds:row?.segment_seconds??null,
          pace_seconds_per_km:row?.pace_seconds_per_km??null,
          exact:Boolean(row?.exact),
        });
      });
      const valid=comparable?entries.filter(entry=>finite(entry.segment_seconds)&&entry.exact):[];
      const best=valid.length?Math.min(...valid.map(entry=>Number(entry.segment_seconds))):null;
      segmentRows.push(Object.freeze({
        from,
        to,
        comparable,
        entries:Object.freeze(entries.map(entry=>Object.freeze({
          ...entry,
          gap_seconds:best===null||!finite(entry.segment_seconds)||!entry.exact?null:Number(entry.segment_seconds)-best,
        }))),
      }));
    }

    return Object.freeze({
      available:true,
      family:families[0],
      same_course_version:sameCourseVersion,
      whole_course_comparable:comparableWhole,
      course_version_ids:Object.freeze(versionIds),
      results:Object.freeze(results),
      finish_ranking:Object.freeze(finishRanking),
      checkpoints:Object.freeze(checkpointRows),
      segments:Object.freeze(segmentRows),
    });
  }

  return Object.freeze({
    raceForResult,
    courseVersionId,
    historyRaces,
    journeyForResult,
    historyForResult,
    profileForResult,
    journeyStartDescription,
    headToHead,
  });
});
