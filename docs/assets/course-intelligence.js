'use strict';
(function(root,factory){
  const contracts=typeof module==='object'&&module.exports?require('./race-contracts.js'):root.RaceContracts;
  const dataIndex=typeof module==='object'&&module.exports?require('./data-index.js'):root.UltravasanDataIndex;
  const charts=typeof module==='object'&&module.exports?require('./charts.js'):root.UltravasanCharts;
  const statusApi=typeof module==='object'&&module.exports?require('./result-status.js'):root.ResultStatus;
  const mapEngine=typeof module==='object'&&module.exports?require('./map-engine.js'):root.UltravasanMapEngine;
  const api=factory(contracts,dataIndex,charts,statusApi,mapEngine);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CourseIntelligence=api;
})(typeof window!=='undefined'?window:globalThis,function(contracts,dataIndex,charts,statusApi,mapEngine){
  if(!contracts||!dataIndex||!charts||!statusApi||!mapEngine)throw new Error('CourseIntelligence kräver RaceContracts, DataIndex, Charts, ResultStatus och MapEngine.');

  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const numberOrNull=value=>finite(value)?Number(value):null;
  const round=(value,digits=2)=>Number.isFinite(Number(value))?Number(Number(value).toFixed(digits)):null;
  const keyOf=value=>String(value??'').trim().toLowerCase();
  const AUXILIARY_CHECKPOINT_KEYS=new Set(['high_point','mora_warning']);
  const isOfficialAnalysisCheckpoint=checkpoint=>!AUXILIARY_CHECKPOINT_KEYS.has(keyOf(checkpoint?.checkpoint_key));

  function courseVersionId(race){
    return contracts.editionForRace(race)?.course_version_id||null;
  }

  function courseForRace(race){
    return contracts.courseForRace(race)||null;
  }

  function routeForRace(routeRegistry,race){
    return contracts.routeForRace(routeRegistry,race)||null;
  }

  function checkpointCatalog(course){
    return (course?.checkpoint_catalog||[]).filter(isOfficialAnalysisCheckpoint).slice().sort((a,b)=>Number(a.sequence_no||0)-Number(b.sequence_no||0));
  }

  function checkpointForKey(course,key){
    const normalized=keyOf(key);
    return checkpointCatalog(course).find(checkpoint=>keyOf(checkpoint.checkpoint_key)===normalized)||null;
  }

  function displayAnchors(course){
    return (course?.display_anchors||[]).filter(anchor=>finite(anchor.distance_km)).slice().sort((a,b)=>Number(a.distance_km)-Number(b.distance_km));
  }

  function displayAnchorForCheckpoint(course,key){
    const normalized=keyOf(key);
    const exact=displayAnchors(course).find(anchor=>keyOf(anchor.key)===normalized);
    if(exact)return Object.freeze({
      key:normalized,
      distance_km:Number(exact.distance_km),
      source:'explicit-anchor',
      anchor_key:exact.key,
    });

    const checkpoints=checkpointCatalog(course);
    const checkpoint=checkpointForKey(course,normalized);
    if(!checkpoint||!finite(checkpoint.distance_km))return null;
    const index=checkpoints.findIndex(item=>item===checkpoint);
    const anchors=displayAnchors(course);

    if(index===checkpoints.length-1){
      const finish=anchors.find(anchor=>keyOf(anchor.key)==='finish');
      if(finish)return Object.freeze({
        key:normalized,
        distance_km:Number(finish.distance_km),
        source:'terminal-finish-anchor',
        anchor_key:finish.key,
      });
    }

    const mapped=checkpoints.map((item,position)=>{
      const exactAnchor=anchors.find(anchor=>keyOf(anchor.key)===keyOf(item.checkpoint_key));
      if(exactAnchor)return {position,course_distance:Number(item.distance_km),display_distance:Number(exactAnchor.distance_km),source:'explicit-anchor'};
      if(position===checkpoints.length-1){
        const finish=anchors.find(anchor=>keyOf(anchor.key)==='finish');
        if(finish)return {position,course_distance:Number(item.distance_km),display_distance:Number(finish.distance_km),source:'terminal-finish-anchor'};
      }
      return null;
    }).filter(Boolean);

    const before=[...mapped].reverse().find(item=>item.position<index);
    const after=mapped.find(item=>item.position>index);
    if(!before||!after)return null;
    const courseSpan=after.course_distance-before.course_distance;
    if(!(courseSpan>0))return null;
    const fraction=(Number(checkpoint.distance_km)-before.course_distance)/courseSpan;
    return Object.freeze({
      key:normalized,
      distance_km:before.display_distance+(after.display_distance-before.display_distance)*fraction,
      source:'interpolated-between-course-anchors',
      anchor_key:null,
      between:Object.freeze([checkpoints[before.position].checkpoint_key,checkpoints[after.position].checkpoint_key]),
    });
  }

  function segmentContracts(course){
    const rawCheckpoints=(course?.checkpoint_catalog||[]).slice();
    const rawKeys=new Set(rawCheckpoints.map(checkpoint=>keyOf(checkpoint.checkpoint_key)));
    for(const segment of course?.segments||[]){
      if(!rawKeys.has(keyOf(segment.from))||!rawKeys.has(keyOf(segment.to))){
        throw new Error(`Segment ${segment.from}→${segment.to} saknar explicit kontroll i bansträckningen.`);
      }
    }
    const checkpoints=checkpointCatalog(course);
    return checkpoints.slice(1).map((to,index)=>{
      const from=checkpoints[index];
      const fromCourse=numberOrNull(from.distance_km),toCourse=numberOrNull(to.distance_km);
      const checkpointDistance=fromCourse!==null&&toCourse!==null&&toCourse>fromCourse?toCourse-fromCourse:null;
      if(fromCourse!==null&&toCourse!==null&&!(toCourse>fromCourse))throw new Error(`Ogiltig checkpointordning för ${from.checkpoint_key}→${to.checkpoint_key}.`);
      const fromDisplay=displayAnchorForCheckpoint(course,from.checkpoint_key);
      const toDisplay=displayAnchorForCheckpoint(course,to.checkpoint_key);
      return Object.freeze({
        index,
        key:`${keyOf(from.checkpoint_key)}→${keyOf(to.checkpoint_key)}`,
        from_key:keyOf(from.checkpoint_key),
        to_key:keyOf(to.checkpoint_key),
        from_name:from.name||from.checkpoint_key,
        to_name:to.name||to.checkpoint_key,
        from_sequence:Number(from.sequence_no||0),
        to_sequence:Number(to.sequence_no||0),
        course_from_km:fromCourse,
        course_to_km:toCourse,
        distance_km:checkpointDistance,
        distance_source:checkpointDistance!==null?'checkpoint-delta':'unavailable',
        display_from_km:fromDisplay?.distance_km??null,
        display_to_km:toDisplay?.distance_km??null,
        display_from_source:fromDisplay?.source??null,
        display_to_source:toDisplay?.source??null,
      });
    });
  }

  function terrainForSegment(route,segment){
    if(!route?.elevation_profile||!finite(segment?.display_from_km)||!finite(segment?.display_to_km)){
      return Object.freeze({available:false});
    }
    const start=mapEngine.terrainAtDistance(route.elevation_profile,segment.display_from_km);
    const end=mapEngine.terrainAtDistance(route.elevation_profile,segment.display_to_km);
    if(!start||!end)return Object.freeze({available:false});
    const lo=Math.min(segment.display_from_km,segment.display_to_km);
    const hi=Math.max(segment.display_from_km,segment.display_to_km);
    const samples=[
      [lo,start.elevation],
      ...(route.elevation_profile||[])
        .filter(point=>Number(point[0])>lo&&Number(point[0])<hi&&finite(point[1]))
        .map(point=>[Number(point[0]),Number(point[1])]),
      [hi,end.elevation],
    ].filter(point=>finite(point[1]));
    const elevations=samples.map(point=>Number(point[1]));
    const displayDistance=Math.max(0,hi-lo);
    const ascent=finite(start.cumulativeAscent)&&finite(end.cumulativeAscent)?Math.max(0,Number(end.cumulativeAscent)-Number(start.cumulativeAscent)):null;
    const descent=finite(start.cumulativeDescent)&&finite(end.cumulativeDescent)?Math.max(0,Number(end.cumulativeDescent)-Number(start.cumulativeDescent)):null;
    const net=finite(start.elevation)&&finite(end.elevation)?Number(end.elevation)-Number(start.elevation):null;
    return Object.freeze({
      available:true,
      display_distance_km:round(displayDistance,3),
      start_elevation_m:round(start.elevation,1),
      end_elevation_m:round(end.elevation,1),
      min_elevation_m:elevations.length?round(Math.min(...elevations),1):null,
      max_elevation_m:elevations.length?round(Math.max(...elevations),1):null,
      net_elevation_m:round(net,1),
      ascent_m:round(ascent,1),
      descent_m:round(descent,1),
      ascent_m_per_km:displayDistance>0&&finite(ascent)?round(ascent/displayDistance,1):null,
      average_net_grade_pct:displayDistance>0&&finite(net)?round(net/(displayDistance*1000)*100,2):null,
      route_distance_source:'locked-display-route',
    });
  }

  function exactSplit(split){
    if(!split)return false;
    const estimated=split.is_estimated===true||Number(split.is_estimated)===1||String(split.is_estimated).toLowerCase()==='true';
    return !estimated&&finite(split.elapsed_seconds);
  }

  function splitByKey(dataset,resultId){
    return new Map(dataIndex.splitsForResult(dataset,resultId).map(split=>[keyOf(split.checkpoint_key),split]));
  }

  function classify(dataset,result){
    return statusApi.classify(result,{hasSplit:dataIndex.splitsForResult(dataset,result.id).length>0});
  }

  function wholeCourseDistance(course){
    const checkpoints=checkpointCatalog(course).filter(item=>finite(item.distance_km));
    return checkpoints.length?Number(checkpoints.at(-1).distance_km):null;
  }

  function segmentTimingSample(dataset,result,segment,courseDistance){
    if(!classify(dataset,result).finished||!finite(result.finish_seconds)||!(courseDistance>0))return null;
    const splits=splitByKey(dataset,result.id);
    const from=segment.from_key==='start'?{elapsed_seconds:0,place_overall:null,is_estimated:false}:splits.get(segment.from_key);
    const to=splits.get(segment.to_key);
    if(!exactSplit(from)||!exactSplit(to))return null;
    const seconds=Number(to.elapsed_seconds)-Number(from.elapsed_seconds);
    if(!(seconds>0)||!(segment.distance_km>0))return null;
    const pace=seconds/segment.distance_km;
    const wholePace=Number(result.finish_seconds)/courseDistance;
    const placement=finite(from.place_overall)&&finite(to.place_overall)&&Number(from.place_overall)>0&&Number(to.place_overall)>0
      ?Number(from.place_overall)-Number(to.place_overall):null;
    return Object.freeze({
      result_id:result.id,
      seconds,
      pace_seconds_per_km:pace,
      whole_pace_seconds_per_km:wholePace,
      pace_index:wholePace/pace*100,
      pacing_loss_seconds:seconds-wholePace*segment.distance_km,
      pacing_loss_seconds_per_km:pace-wholePace,
      placement_movement:placement,
    });
  }

  function locatedDnfExit(dataset,result,course){
    const classification=classify(dataset,result);
    if(!classification.dnf)return null;
    const sequenceByKey=new Map(checkpointCatalog(course).map(checkpoint=>[keyOf(checkpoint.checkpoint_key),Number(checkpoint.sequence_no||0)]));
    const observed=dataIndex.splitsForResult(dataset,result.id)
      .filter(exactSplit)
      .map(split=>({key:keyOf(split.checkpoint_key),sequence:sequenceByKey.get(keyOf(split.checkpoint_key))}))
      .filter(item=>Number.isFinite(item.sequence))
      .sort((a,b)=>a.sequence-b.sequence);
    return observed.length?observed.at(-1).key:null;
  }

  function fieldStatsForSegment(dataset,race,segment,{results=null,minSample=5}={}){
    const course=courseForRace(race);
    const courseDistance=wholeCourseDistance(course);
    const raceRows=(results||dataset?.results||[]).filter(result=>String(result.race_id)===String(race?.id));
    const timing= raceRows.map(result=>segmentTimingSample(dataset,result,segment,courseDistance)).filter(Boolean);
    const locatedDnfs=raceRows.map(result=>locatedDnfExit(dataset,result,course)).filter(Boolean);
    const dropouts=locatedDnfs.filter(key=>key===segment.from_key).length;
    const entrantCount=segment.from_key==='start'
      ?raceRows.filter(result=>classify(dataset,result).started).length
      :raceRows.filter(result=>{
          const split=splitByKey(dataset,result.id).get(segment.from_key);
          return exactSplit(split);
        }).length;
    const placements=timing.map(row=>row.placement_movement).filter(finite).map(Number);
    const enough=timing.length>=minSample;
    const outerQuantileMinSample=Math.max(Number(minSample)||0,20);
    const outerEnough=timing.length>=outerQuantileMinSample;
    const pace=timing.map(row=>row.pace_seconds_per_km);
    const pacingLoss=timing.map(row=>row.pacing_loss_seconds);
    const pacingLossPerKm=timing.map(row=>row.pacing_loss_seconds_per_km);
    const paceIndex=timing.map(row=>row.pace_index);
    return Object.freeze({
      timing_sample_n:timing.length,
      min_sample:minSample,
      sufficient_sample:enough,
      outer_quantile_min_sample:outerQuantileMinSample,
      outer_quantiles_available:outerEnough,
      median_pace_seconds_per_km:enough?round(charts.median(pace),1):null,
      q10_pace_seconds_per_km:outerEnough?round(charts.quantile(pace,.10),1):null,
      q25_pace_seconds_per_km:enough?round(charts.quantile(pace,.25),1):null,
      q75_pace_seconds_per_km:enough?round(charts.quantile(pace,.75),1):null,
      q90_pace_seconds_per_km:outerEnough?round(charts.quantile(pace,.90),1):null,
      pace_iqr_seconds_per_km:enough?round(charts.quantile(pace,.75)-charts.quantile(pace,.25),1):null,
      median_pace_index:enough?round(charts.median(paceIndex),1):null,
      median_pacing_loss_seconds:enough?round(charts.median(pacingLoss),1):null,
      median_pacing_loss_seconds_per_km:enough?round(charts.median(pacingLossPerKm),1):null,
      placement_sample_n:placements.length,
      median_placement_movement:placements.length>=minSample?round(charts.median(placements),1):null,
      located_dnf_n:locatedDnfs.length,
      dnf_dropouts_n:dropouts,
      dnf_concentration_pct:locatedDnfs.length?round(dropouts/locatedDnfs.length*100,1):null,
      segment_entrants_n:entrantCount,
      dnf_exit_rate_pct:entrantCount?round(dropouts/entrantCount*100,1):null,
    });
  }

  function comparableCourseRaces(dataset,race){
    const version=courseVersionId(race);
    return (dataset?.races||[]).filter(candidate=>courseVersionId(candidate)===version);
  }

  function segmentElapsedSeconds(dataset,result,segment){
    const splits=splitByKey(dataset,result.id);
    const from=segment.from_key==='start'?{elapsed_seconds:0,is_estimated:false}:splits.get(segment.from_key);
    const to=splits.get(segment.to_key);
    if(!exactSplit(from)||!exactSplit(to))return null;
    const seconds=Number(to.elapsed_seconds)-Number(from.elapsed_seconds);
    return seconds>0?seconds:null;
  }

  function buildRacePlan(dataset,race,targetFinishSeconds,{minSample=5}={}){
    const target=Number(targetFinishSeconds);
    if(!Number.isFinite(target)||target<=0)throw new Error('Måltiden måste vara ett positivt antal sekunder.');
    const course=courseForRace(race);
    if(!course)throw new Error('Loppplan kräver en explicit bansträckning.');
    const segments=segmentContracts(course);
    const raceIds=new Set(comparableCourseRaces(dataset,race).map(item=>String(item.id)));
    const cohort=(dataset?.results||[]).filter(result=>{
      if(!raceIds.has(String(result.race_id))||!finite(result.finish_seconds))return false;
      return classify(dataset,result).finished===true;
    });
    const raceById=new Map((dataset?.races||[]).map(item=>[String(item.id),item]));
    const years=[...new Set(cohort.map(result=>raceById.get(String(result.race_id))?.year).filter(Number.isFinite))].sort((a,b)=>a-b);
    const courseDistance=wholeCourseDistance(course);

    const provisional=segments.map(segment=>{
      const shares=cohort.map(result=>{
        const seconds=segmentElapsedSeconds(dataset,result,segment);
        return seconds===null?null:seconds/Number(result.finish_seconds);
      }).filter(finite).map(Number);
      const historicalShare=shares.length>=minSample?charts.median(shares):null;
      const fallbackShare=historicalShare===null&&finite(segment.distance_km)&&courseDistance>0
        ?Number(segment.distance_km)/courseDistance:null;
      const weight=historicalShare??fallbackShare;
      return {
        segment,
        sample_n:shares.length,
        raw_weight:weight,
        source:historicalShare!==null?'historical-course-version':fallbackShare!==null?'distance-fallback':'unavailable',
      };
    });
    const complete=provisional.every(item=>finite(item.raw_weight)&&Number(item.raw_weight)>0);
    const weightSum=provisional.filter(item=>finite(item.raw_weight)&&Number(item.raw_weight)>0).reduce((sum,item)=>sum+Number(item.raw_weight),0);
    let cumulative=0;
    const rows=provisional.map(item=>{
      const normalized=complete&&weightSum>0?Number(item.raw_weight)/weightSum:null;
      const seconds=normalized===null?null:target*normalized;
      if(seconds!==null)cumulative+=seconds;
      return Object.freeze({
        key:item.segment.key,
        from_key:item.segment.from_key,
        to_key:item.segment.to_key,
        from_name:item.segment.from_name,
        to_name:item.segment.to_name,
        distance_km:item.segment.distance_km,
        source:item.source,
        sample_n:item.sample_n,
        raw_weight:item.raw_weight===null?null:round(item.raw_weight,6),
        normalized_weight:normalized===null?null:round(normalized,6),
        target_segment_seconds:seconds===null?null:round(seconds,1),
        target_cumulative_seconds:seconds===null?null:round(cumulative,1),
        target_pace_seconds_per_km:seconds!==null&&finite(item.segment.distance_km)&&Number(item.segment.distance_km)>0
          ?round(seconds/Number(item.segment.distance_km),1):null,
      });
    });
    const allocated=rows.filter(row=>finite(row.target_segment_seconds)).reduce((sum,row)=>sum+Number(row.target_segment_seconds),0);
    return Object.freeze({
      race_family:contracts.familyForRace(race),
      course_version_id:courseVersionId(race),
      target_finish_seconds:target,
      min_sample:minSample,
      cohort_finishers:cohort.length,
      cohort_years:Object.freeze(years),
      complete,
      historical_segments:rows.filter(row=>row.source==='historical-course-version').length,
      fallback_segments:rows.filter(row=>row.source==='distance-fallback').length,
      unavailable_segments:rows.filter(row=>row.source==='unavailable').length,
      allocated_seconds:round(allocated,1),
      unallocated_seconds:complete?0:round(target-allocated,1),
      rows:Object.freeze(rows),
    });
  }

  function buildCourseModel(dataset,race,routeRegistry,{results=null,minSample=5}={}){
    if(!race)throw new Error('Course Intelligence kräver en explicit RaceEdition.');
    const edition=contracts.editionForRace(race);
    const course=courseForRace(race);
    const route=routeForRace(routeRegistry,race);
    if(!edition||!course)throw new Error(`Loppåret saknar bansträckningskontrakt: ${race.race_key||race.id}`);
    const rawSegments=segmentContracts(course).map(segment=>Object.freeze({
      ...segment,
      terrain:terrainForSegment(route,segment),
      field:fieldStatsForSegment(dataset,race,segment,{results,minSample}),
    }));
    const segments=rawSegments;
    return Object.freeze({
      race,
      race_family:edition.race_family,
      course_version_id:edition.course_version_id,
      display_route_id:route?.id||course.display_route_id,
      route_available:Boolean(route),
      route_geometry_quality:route?.geometry_quality||null,
      course_distance_km:wholeCourseDistance(course),
      sample_minimum:minSample,
      segments:Object.freeze(segments),
    });
  }

  return Object.freeze({
    courseVersionId,
    courseForRace,
    routeForRace,
    checkpointCatalog,
    checkpointForKey,
    displayAnchorForCheckpoint,
    segmentContracts,
    terrainForSegment,
    wholeCourseDistance,
    segmentTimingSample,
    locatedDnfExit,
    fieldStatsForSegment,
    comparableCourseRaces,
    segmentElapsedSeconds,
    buildRacePlan,
    buildCourseModel,
  });
});
