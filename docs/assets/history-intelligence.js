'use strict';
(function(root,factory){
  const contracts=typeof module==='object'&&module.exports?require('./race-contracts.js'):root.RaceContracts;
  const history=typeof module==='object'&&module.exports?require('./history-engine.js'):root.UltravasanHistoryEngine;
  const dataIndex=typeof module==='object'&&module.exports?require('./data-index.js'):root.UltravasanDataIndex;
  const statusApi=typeof module==='object'&&module.exports?require('./result-status.js'):root.ResultStatus;
  const api=factory(contracts,history,dataIndex,statusApi);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HistoryIntelligence=api;
})(typeof window!=='undefined'?window:globalThis,function(contracts,history,dataIndex,statusApi){
  if(!contracts||!history||!dataIndex||!statusApi)throw new Error('HistoryIntelligence kräver RaceContracts, HistoryEngine, DataIndex och ResultStatus.');

  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const keyOf=value=>String(value??'').trim().toLowerCase();
  const median=values=>{const rows=(values||[]).filter(finite).map(Number).sort((a,b)=>a-b);if(!rows.length)return null;const i=Math.floor(rows.length/2);return rows.length%2?rows[i]:(rows[i-1]+rows[i])/2};
  const round=(value,digits=1)=>finite(value)?Number(Number(value).toFixed(digits)):null;
  const freezeRows=rows=>Object.freeze(rows.map(row=>Object.freeze(row)));

  function raceForResult(dataset,result){
    return (dataset?.races||[]).find(race=>String(race.id)===String(result?.race_id))||null;
  }
  function courseVersionId(race){return contracts.editionForRace(race)?.course_version_id||null}
  function historyRace(race){return race?{...race,course_version:courseVersionId(race)}:null}
  function historyRaces(dataset){return (dataset?.races||[]).map(historyRace)}
  function comparisonKeyForRace(race){
    if(!race)return null;
    const version=courseVersionId(race),course=contracts.courseForRace(race);
    if(!version||!course)return null;
    const explicit=String(course.whole_course_comparison_group||'').trim();
    return explicit?'group:'+explicit:'course:'+version;
  }
  function sameWholeCourse(left,right){const a=comparisonKeyForRace(left),b=comparisonKeyForRace(right);return Boolean(a&&a===b)}
  function familyRaces(dataset,family){return (dataset?.races||[]).filter(race=>contracts.familyForRace(race)===family)}
  function familyResults(dataset,family){
    const ids=new Set(familyRaces(dataset,family).map(race=>String(race.id)));
    return (dataset?.results||[]).filter(result=>ids.has(String(result.race_id)));
  }
  function classify(dataset,result){return statusApi.classify(result,{hasSplit:dataIndex.splitsForResult(dataset,result?.id).length>0})}
  function isFinished(dataset,result){return classify(dataset,result).finished===true&&finite(result?.finish_seconds)&&Number(result.finish_seconds)>0}
  function isStarter(dataset,result){return classify(dataset,result).started===true}
  function isDnf(dataset,result){return classify(dataset,result).dnf===true}
  function exactSplit(split){
    if(!split||!finite(split.elapsed_seconds))return false;
    const estimated=split.is_estimated===true||Number(split.is_estimated)===1||String(split.is_estimated).toLowerCase()==='true';
    return !estimated;
  }
  function sexOf(result){
    const value=String(result?.sex||'').toUpperCase();
    return ['F','W','K','D'].includes(value)?'F':['M','H'].includes(value)?'M':'U';
  }

  function comparableSeriesForRows(dataset,rows,{minCount=1}={}){
    const races=historyRaces(dataset);
    return history.comparableSeries((rows||[]).filter(row=>isFinished(dataset,row)),races,contracts.catalog.courses)
      .map(series=>{
        const sorted=series.rows.slice().sort((a,b)=>{
          const ar=raceForResult(dataset,a),br=raceForResult(dataset,b);
          return Number(ar?.year||0)-Number(br?.year||0)||Number(a.id||0)-Number(b.id||0);
        });
        const first=sorted[0]||null,last=sorted.at(-1)||null,best=sorted.slice().sort((a,b)=>Number(a.finish_seconds)-Number(b.finish_seconds))[0]||null;
        const years=sorted.map(row=>Number(raceForResult(dataset,row)?.year)).filter(Number.isFinite);
        const versions=[...new Set(sorted.map(row=>courseVersionId(raceForResult(dataset,row))).filter(Boolean))];
        return Object.freeze({
          key:series.key,
          rows:Object.freeze(sorted),
          count:sorted.length,
          years:Object.freeze(years),
          year_from:years.length?Math.min(...years):null,
          year_to:years.length?Math.max(...years):null,
          course_version_ids:Object.freeze(versions),
          first,
          last,
          best,
          delta_seconds:first&&last&&sorted.length>1?Number(first.finish_seconds)-Number(last.finish_seconds):null
        });
      })
      .filter(series=>series.count>=minCount)
      .sort((a,b)=>b.count-a.count||(b.year_to||0)-(a.year_to||0)||String(a.key).localeCompare(String(b.key)));
  }

  function verifiedHistories(dataset,family){
    return history.groupHistories(familyResults(dataset,family),historyRaces(dataset)).filter(group=>group.verified_person===true);
  }

  function personHistory(dataset,resultId){
    const result=(dataset?.results||[]).find(row=>String(row.id)===String(resultId));
    if(!result)return null;
    const family=contracts.familyForRace(raceForResult(dataset,result)),identity=history.identityKey(result);
    const group=history.groupHistories(familyResults(dataset,family),historyRaces(dataset)).find(item=>item.key===identity)||{key:identity,verified_person:false,rows:[result]};
    const verified=Boolean(group.verified_person&&history.hasVerifiedPersonIdentity(result));
    const annotated=group.rows.map(row=>{
      const race=raceForResult(dataset,row);
      return {result:row,race,year:Number(race?.year)||null,course_version_id:courseVersionId(race),comparison_key:comparisonKeyForRace(race),finished:isFinished(dataset,row)};
    }).sort((a,b)=>(a.year||0)-(b.year||0)||Number(a.result.id||0)-Number(b.result.id||0));
    const series=verified?comparableSeriesForRows(dataset,group.rows,{minCount:1}):[];
    const focus=series.find(item=>item.rows.some(row=>String(row.id)===String(result.id)))||series[0]||null;
    const focusIds=new Set((focus?.rows||[]).map(row=>String(row.id)));
    const finished=group.rows.filter(row=>isFinished(dataset,row));
    return Object.freeze({
      available:true,
      identity_key:identity,
      verified_person:verified,
      family,
      selected_result_id:result.id,
      rows:freezeRows(annotated),
      comparable_series:Object.freeze(series),
      focus_series_key:focus?.key||null,
      focus_series:focus,
      finished_count:finished.length,
      incomparable_to_focus_count:focus?finished.filter(row=>!focusIds.has(String(row.id))).length:finished.length
    });
  }

  function yearSummary(dataset,race,rows){
    const raceRows=(rows||[]).filter(row=>String(row.race_id)===String(race.id));
    const starters=raceRows.filter(row=>isStarter(dataset,row)),finishers=raceRows.filter(row=>isFinished(dataset,row)),dnfs=starters.filter(row=>isDnf(dataset,row));
    const distance=Number(race.distance_km);
    const paces=finishers.map(row=>distance>0?Number(row.finish_seconds)/distance:null).filter(finite);
    const women=starters.filter(row=>sexOf(row)==='F').length,knownSex=starters.filter(row=>['F','M'].includes(sexOf(row))).length;
    return Object.freeze({
      race_id:race.id,
      year:Number(race.year)||null,
      comparison_key:comparisonKeyForRace(race),
      rows_n:raceRows.length,
      starters_n:starters.length,
      finishers_n:finishers.length,
      dnf_n:dnfs.length,
      median_finish_seconds:median(finishers.map(row=>Number(row.finish_seconds))),
      median_pace_seconds_per_km:median(paces),
      dnf_rate:starters.length?dnfs.length/starters.length:null,
      female_share:knownSex?women/knownSex:null
    });
  }

  function metric(id,label,current,reference,{direction='direct',scope,years,currentN,referenceN,note=''}={}){
    if(!finite(current)||!finite(reference)||Number(reference)===0)return Object.freeze({id,label,available:false,index:null,current:finite(current)?Number(current):null,reference:finite(reference)?Number(reference):null,reference_scope:scope||null,reference_years:Object.freeze(years||[]),current_n:currentN??null,reference_n:referenceN??null,note});
    const index=direction==='inverse'?Number(reference)/Number(current)*100:Number(current)/Number(reference)*100;
    return Object.freeze({id,label,available:true,index:round(index,1),current:Number(current),reference:Number(reference),reference_scope:scope||null,reference_years:Object.freeze(years||[]),current_n:currentN??null,reference_n:referenceN??null,note});
  }

  function fingerprint(dataset,race,{currentResults=null,referenceResults=null,minReferenceYears=2,sexFilterActive=false}={}){
    if(!race)throw new Error('Historiskt fingeravtryck kräver en explicit RaceEdition.');
    const family=contracts.familyForRace(race),allFamilyRaces=familyRaces(dataset,family).slice().sort((a,b)=>Number(a.year)-Number(b.year));
    const baseRows=referenceResults||familyResults(dataset,family),currentRows=currentResults||baseRows.filter(row=>String(row.race_id)===String(race.id));
    const current=yearSummary(dataset,race,currentRows),currentKey=comparisonKeyForRace(race);
    const performanceYears=allFamilyRaces.filter(candidate=>String(candidate.id)!==String(race.id)&&comparisonKeyForRace(candidate)===currentKey)
      .map(candidate=>yearSummary(dataset,candidate,baseRows)).filter(summary=>summary.finishers_n>0);
    const structuralYears=allFamilyRaces.filter(candidate=>String(candidate.id)!==String(race.id))
      .map(candidate=>yearSummary(dataset,candidate,baseRows)).filter(summary=>summary.starters_n>0);
    const perfYears=performanceYears.map(summary=>summary.year).filter(Number.isFinite),structYears=structuralYears.map(summary=>summary.year).filter(Number.isFinite);
    const perfEnough=performanceYears.length>=minReferenceYears,structEnough=structuralYears.length>=minReferenceYears;
    const perfFinish=perfEnough?median(performanceYears.map(summary=>summary.median_finish_seconds)):null;
    const perfPace=perfEnough?median(performanceYears.map(summary=>summary.median_pace_seconds_per_km)):null;
    const perfDnf=perfEnough?median(performanceYears.map(summary=>summary.dnf_rate)):null;
    const structFemale=structEnough&&!sexFilterActive?median(structuralYears.map(summary=>summary.female_share)):null;
    const structSize=structEnough?median(structuralYears.map(summary=>summary.starters_n)):null;
    const metrics=[
      metric('finish_difficulty','Mediantidsindex',current.median_finish_seconds,perfFinish,{scope:'whole-course-comparable-race-medians',years:perfYears,currentN:current.finishers_n,referenceN:performanceYears.length,note:'Över 100 betyder längre mediantid än den jämförbara historiska normalnivån; indexet beskriver skillnad men förklarar inte orsaken.'}),
      metric('pace_level','Fartnivå',current.median_pace_seconds_per_km,perfPace,{direction:'inverse',scope:'whole-course-comparable-race-medians',years:perfYears,currentN:current.finishers_n,referenceN:performanceYears.length,note:'Över 100 betyder snabbare medianfart än den jämförbara historiska normalnivån.'}),
      metric('dnf_load','DNF-belastning',current.dnf_rate,perfDnf,{scope:'whole-course-comparable-race-medians',years:perfYears,currentN:current.starters_n,referenceN:performanceYears.length,note:'DNF jämförs endast mot loppår med samma hela-banans jämförbarhetskontrakt.'}),
      sexFilterActive?Object.freeze({id:'female_share',label:'Kvinnorepresentation',available:false,index:null,current:null,reference:null,reference_scope:'family-race-medians',reference_years:Object.freeze(structYears),current_n:null,reference_n:structuralYears.length,note:'Döljs när könsfilter är aktivt.'})
        :metric('female_share','Kvinnorepresentation',current.female_share,structFemale,{scope:'family-race-medians',years:structYears,currentN:current.starters_n,referenceN:structuralYears.length,note:'Deltagarsammansättning är inte ett banprestationsmått och kan därför jämföras över CourseVersions.'}),
      metric('field_size','Fältstorlek',current.starters_n,structSize,{scope:'family-race-medians',years:structYears,currentN:current.starters_n,referenceN:structuralYears.length,note:'Fältstorlek jämför faktiska startande och är inte ett banprestationsmått.'})
    ];
    return Object.freeze({race,family,course_version_id:courseVersionId(race),comparison_key:currentKey,current,performance_reference_years:Object.freeze(perfYears),structural_reference_years:Object.freeze(structYears),min_reference_years:minReferenceYears,metrics:Object.freeze(metrics)});
  }

  function closingPair(race){
    const course=contracts.courseForRace(race),catalog=(course?.checkpoint_catalog||[]).slice().sort((a,b)=>Number(a.sequence_no)-Number(b.sequence_no));
    if(!catalog.length)return null;
    const finish=catalog.at(-1),preferred=['evertsberg','eldris'];
    const start=preferred.map(key=>catalog.find(cp=>keyOf(cp.checkpoint_key)===key)).find(Boolean)||catalog.at(-2);
    if(!start||!finish||Number(start.sequence_no)>=Number(finish.sequence_no))return null;
    return Object.freeze({from:keyOf(start.checkpoint_key),to:keyOf(finish.checkpoint_key),from_name:start.name||start.checkpoint_key,to_name:finish.name||finish.checkpoint_key});
  }
  function placementAtKey(dataset,result,key){
    const split=dataIndex.splitsForResult(dataset,result.id).find(item=>keyOf(item.checkpoint_key)===key);
    return exactSplit(split)&&finite(split.place_overall)&&Number(split.place_overall)>0?Number(split.place_overall):null;
  }

  function hallOfFame(dataset,family,mode,{minRuns=3}={}){
    const races=familyRaces(dataset,family),raceById=new Map(races.map(race=>[String(race.id),race])),histories=verifiedHistories(dataset,family);
    let rows=[];
    if(mode==='veterans'){
      rows=histories.map(group=>{
        const completed=group.rows.filter(row=>isFinished(dataset,row));if(completed.length<2)return null;
        const years=completed.map(row=>Number(raceById.get(String(row.race_id))?.year)).filter(Number.isFinite);
        return {identity_key:group.key,rows:completed,score:completed.length,label:completed.length+' fullföljda lopp',detail:Math.min(...years)+'–'+Math.max(...years),reason:'Verifierad personidentitet · '+completed.length+' fullföljda lopp under '+new Set(years).size+' registrerade loppår.',scope:'verified-person-count'};
      }).filter(Boolean).sort((a,b)=>b.score-a.score);
    }else if(mode==='improved'){
      rows=histories.map(group=>{
        const candidates=comparableSeriesForRows(dataset,group.rows,{minCount:2}).map(series=>{
          const delta=Number(series.first.finish_seconds)-Number(series.last.finish_seconds);
          return delta>0?{identity_key:group.key,rows:series.rows,score:delta,label:Math.round(delta/60)+' min snabbare',detail:series.year_from+' → '+series.year_to,reason:'Verifierad personidentitet · förbättring inom '+series.key+'; andra CourseVersions blandas inte in.',scope:series.key}:null;
        }).filter(Boolean).sort((a,b)=>b.score-a.score);
        return candidates[0]||null;
      }).filter(Boolean).sort((a,b)=>b.score-a.score);
    }else if(mode==='consistent'){
      rows=histories.map(group=>{
        const candidates=comparableSeriesForRows(dataset,group.rows,{minCount:minRuns}).map(series=>{
          const times=series.rows.map(row=>Number(row.finish_seconds)),range=Math.max(...times)-Math.min(...times);
          return {identity_key:group.key,rows:series.rows,score:-range,label:Math.round(range/60)+' min spridning',detail:series.count+' jämförbara målgångar',reason:'Verifierad personidentitet · spridning inom '+series.key+'; andra CourseVersions blandas inte in.',scope:series.key};
        }).sort((a,b)=>b.score-a.score);
        return candidates[0]||null;
      }).filter(Boolean).sort((a,b)=>b.score-a.score);
    }else if(mode==='chargers'){
      const all=familyResults(dataset,family);
      rows=all.map(result=>{
        if(!isFinished(dataset,result))return null;
        const race=raceById.get(String(result.race_id)),pair=closingPair(race);if(!race||!pair)return null;
        const from=placementAtKey(dataset,result,pair.from),to=placementAtKey(dataset,result,pair.to);if(!from||!to)return null;
        const gain=from-to;if(gain<=0)return null;
        const starters=all.filter(row=>String(row.race_id)===String(race.id)&&isStarter(dataset,row)).length;if(!starters)return null;
        const normalized=gain/starters*100;
        return {identity_key:history.hasVerifiedPersonIdentity(result)?history.identityKey(result):null,rows:[result],score:normalized,raw_gain:gain,label:'+'+gain+' platser',detail:pair.from_name+' → '+pair.to_name,reason:'+'+round(normalized,2)+' % av startfältets storlek · exakt placeringspassage vid båda kontrollerna.',scope:'race-edition:'+(race.race_key||race.id)};
      }).filter(Boolean).sort((a,b)=>b.score-a.score||b.raw_gain-a.raw_gain);
    }
    return Object.freeze({mode,family,rows:freezeRows(rows)});
  }

  return Object.freeze({raceForResult,courseVersionId,historyRaces,comparisonKeyForRace,sameWholeCourse,familyRaces,familyResults,classify,isFinished,isStarter,isDnf,sexOf,comparableSeriesForRows,verifiedHistories,personHistory,yearSummary,fingerprint,closingPair,hallOfFame});
});
