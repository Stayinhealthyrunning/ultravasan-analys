'use strict';
/* U2 HistoryEngine: verified identity and explicit course comparability only. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.UltravasanHistoryEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const filled=v=>v!==null&&v!==undefined&&String(v).trim()!=='';

  function identityKey(row,index){
    if(filled(row?.person_key))return `person:${row.person_key}`;
    if(filled(row?.person_id))return `person:${row.person_id}`;
    // U1/U2 audit establishes VasaNerd idpe as person-scoped evidence.
    if(row?.source_code==='vasanerd'&&filled(row?.source_result_id)){
      return `legacy-person:vasanerd:idpe:${row.source_result_id}`;
    }
    if(filled(row?.id))return `result:${row.id}`;
    if(filled(row?.source_result_id))return `result:${row.race_id??'race'}:${row.source_code??'source'}:${row.source_result_id}`;
    if(filled(row?.bib))return `result:${row.race_id??'race'}:bib:${row.bib}`;
    return `result-index:${index??'unknown'}`;
  }

  function hasVerifiedPersonIdentity(row){
    return filled(row?.person_key)||filled(row?.person_id)||
      (row?.source_code==='vasanerd'&&filled(row?.source_result_id));
  }

  function groupHistories(results,races=[]){
    const years=new Map((races||[]).map(r=>[r.id,Number(r.year)||0])),groups=new Map();
    (results||[]).forEach((row,index)=>{
      const key=identityKey(row,index);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(row);
    });
    return [...groups.entries()].map(([key,rows])=>({
      key,
      verified_person:rows.some(hasVerifiedPersonIdentity),
      rows:rows.sort((a,b)=>(years.get(a.race_id)||0)-(years.get(b.race_id)||0)||(Number(a.id)||0)-(Number(b.id)||0))
    }));
  }

  function raceForResult(result,races){
    return (races||[]).find(r=>r.id===result?.race_id)||null;
  }

  function courseForRace(race,courses){
    return race&&race.course_version&&courses?courses[race.course_version]||null:null;
  }

  function wholeCourseComparisonKey(result,races=[],courses={}){
    const race=raceForResult(result,races);
    if(!race?.course_version)return null;
    const course=courseForRace(race,courses);
    if(!course)return null;
    const explicit=race.whole_course_comparison_group||course.whole_course_comparison_group;
    return filled(explicit)?`group:${explicit}`:null;
  }

  function wholeCourseComparable(left,right,races=[],courses={}){
    const a=wholeCourseComparisonKey(left,races,courses);
    const b=wholeCourseComparisonKey(right,races,courses);
    return !!a&&a===b;
  }

  function comparableSeries(rows,races=[],courses={}){
    const groups=new Map();
    (rows||[]).forEach(row=>{
      const key=wholeCourseComparisonKey(row,races,courses);
      if(!key)return;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(row);
    });
    return [...groups.entries()].map(([key,items])=>({key,rows:items}));
  }

  function segmentComparisonKey(courseVersion,from,to,courses={}){
    const course=courses?.[courseVersion];
    if(!course)return null;
    const segment=(course.segments||[]).find(s=>s.from===from&&s.to===to);
    if(!segment)return null;
    const explicit=segment.comparison_group;
    return filled(explicit)?`group:${explicit}`:`course:${courseVersion}:${from}->${to}`;
  }

  function segmentComparable(leftVersion,rightVersion,from,to,courses={}){
    const a=segmentComparisonKey(leftVersion,from,to,courses);
    const b=segmentComparisonKey(rightVersion,from,to,courses);
    return !!a&&a===b;
  }

  return {
    identityKey,
    hasVerifiedPersonIdentity,
    groupHistories,
    wholeCourseComparisonKey,
    wholeCourseComparable,
    comparableSeries,
    segmentComparisonKey,
    segmentComparable
  };
});
