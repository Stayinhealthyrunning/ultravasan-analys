'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RunnerReplay=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const SVG_W=920,SVG_H=430,MAP_PAD=42;
  const ELEV_W=920,ELEV_H=170,ELEV_PAD={l:48,r:20,t:18,b:30};
  const PACE_COLORS=['#176d53','#31906d','#d0a62d','#d97835','#8f4967'];
  const NEUTRAL_COLOR='#77847e';
  let activeController=null;

  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const cleanName=v=>String(v||'').replace('Mora mål','Mora').replace('Start Sälen','Sälen').replace('Start Oxberg','Oxberg start').trim();
  const fmtTime=s=>!finite(s)?'–':`${Math.floor(Number(s)/3600)}:${String(Math.floor((Number(s)%3600)/60)).padStart(2,'0')}:${String(Math.round(Number(s)%60)).padStart(2,'0')}`;
  const fmtPace=s=>!finite(s)?'–':`${Math.floor(Number(s)/60)}:${String(Math.round(Number(s)%60)).padStart(2,'0')}/km`;
  const fmtDistance=v=>`${Number(v||0).toLocaleString('sv-SE',{minimumFractionDigits:1,maximumFractionDigits:1})} km`;
  const median=values=>{const a=values.filter(finite).map(Number).sort((a,b)=>a-b);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2};
  const raceFamily=r=>String(r?.race_key||'').startsWith('ultravasan45-')?'uv45':'uv90';

  function routeForRace(registry,race){
    if(!registry||!race)return null;
    const specific=(registry.route_for_race||[]).find(rule=>String(race.race_key||'').startsWith(rule.race_key_prefix||'')&&(!rule.year_from||race.year>=rule.year_from)&&(!rule.year_to||race.year<=rule.year_to));
    if(specific)return registry.routes?.[specific.route_id]||null;
    const byYear=(registry.route_for_year||[]).find(rule=>race.year>=rule.from&&race.year<=rule.to);
    return registry.routes?.[byYear?.route_id||registry.default_route_id]||null;
  }

  function pointAtDistance(points,distance){
    if(!Array.isArray(points)||!points.length)return null;
    const d=clamp(distance,0,Number(points.at(-1)?.[2]||0));
    let lo=0,hi=points.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(Number(points[mid][2])<d)lo=mid+1;else hi=mid}
    const b=points[lo],a=points[Math.max(0,lo-1)],span=Number(b[2])-Number(a[2]),t=span>0?(d-Number(a[2]))/span:0;
    return [Number(a[0])+(Number(b[0])-Number(a[0]))*t,Number(a[1])+(Number(b[1])-Number(a[1]))*t,d];
  }

  function terrainAtDistance(profile,distance){
    if(!Array.isArray(profile)||!profile.length)return null;
    const d=clamp(distance,0,Number(profile.at(-1)?.[0]||0));
    let lo=0,hi=profile.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(Number(profile[mid][0])<d)lo=mid+1;else hi=mid}
    const b=profile[lo],a=profile[Math.max(0,lo-1)],span=Number(b[0])-Number(a[0]),t=span>0?(d-Number(a[0]))/span:0;
    const interpolate=index=>finite(a[index])&&finite(b[index])?Number(a[index])+(Number(b[index])-Number(a[index]))*t:(finite(a[index])?Number(a[index]):finite(b[index])?Number(b[index]):null);
    return {distance:d,elevation:interpolate(1),grade:interpolate(2),cumulativeAscent:interpolate(3),cumulativeDescent:interpolate(4)};
  }
  function elevationAtDistance(profile,distance){return terrainAtDistance(profile,distance)?.elevation??null}

  function paceColor(pace,allPaces){
    if(!finite(pace))return {color:NEUTRAL_COLOR,colorIndex:null,label:'Tid saknas',icon:'—'};
    const sorted=allPaces.filter(finite).map(Number).sort((a,b)=>a-b),value=Number(pace);
    if(sorted.length<2)return {color:PACE_COLORS[2],colorIndex:2,label:'Jämn fart',icon:'●'};
    const lower=sorted.filter(v=>v<value).length,equal=sorted.filter(v=>v===value).length,percentile=(lower+Math.max(0,equal-1)/2)/(sorted.length-1),index=clamp(Math.round(percentile*4),0,4);
    const labels=['Snabbaste fart','Stark fart','Jämn fart','Tuff fart','Långsammaste fart'];
    return {color:PACE_COLORS[index],colorIndex:index,label:labels[index],icon:index<2?'▲':index>2?'▼':'●'};
  }

  function normalizedCheckpoint(cp){return {key:String(cp.checkpoint_key||cp.key||'').toLowerCase(),name:cp.name||cp.short||cp.checkpoint_name||cp.checkpoint_key,short:cp.short||cleanName(cp.name||cp.checkpoint_name),sequence:Number(cp.sequence_no||0),distance:Number(cp.distance_km||0)}}
  function splitForCheckpoint(splits,cp){return splits.find(s=>String(s.checkpoint_key||'').toLowerCase()===cp.key)||splits.find(s=>cleanName(s.checkpoint_name).toLowerCase()===cleanName(cp.name).toLowerCase())}

  function createModel({race,result,route,raceCheckpoints=[],splits=[]}){
    const checkpoints=raceCheckpoints.map(normalizedCheckpoint).filter(cp=>finite(cp.distance)).sort((a,b)=>a.sequence-b.sequence||a.distance-b.distance);
    const totalDistance=Number(race?.distance_km||route?.official_distance_km||checkpoints.at(-1)?.distance||0);
    if(!checkpoints.length)checkpoints.push({key:'start',name:raceFamily(race)==='uv45'?'Start Oxberg':'Start Sälen',short:'Start',sequence:0,distance:0},{key:'finish',name:'Mora mål',short:'Mora',sequence:1,distance:totalDistance});
    if(checkpoints[0].distance>0)checkpoints.unshift({key:'start',name:raceFamily(race)==='uv45'?'Start Oxberg':'Start Sälen',short:'Start',sequence:-1,distance:0});
    const orderedSplits=splits.slice().sort((a,b)=>Number(a.sequence_no||0)-Number(b.sequence_no||0));
    const anchors=[{distance:0,time:0,rank:null,name:checkpoints[0].name,key:checkpoints[0].key,kind:'start'}];
    for(const cp of checkpoints.slice(1)){
      const split=splitForCheckpoint(orderedSplits,cp);
      if(split&&finite(split.elapsed_seconds))anchors.push({distance:cp.distance,time:Number(split.elapsed_seconds),rank:finite(split.place_overall)?Number(split.place_overall):null,name:cp.name,key:cp.key,kind:cp.distance>=totalDistance-.05?'finish':'checkpoint',split});
    }
    const finishCp=checkpoints.at(-1),hasFinishAnchor=anchors.some(a=>a.distance>=totalDistance-.05);
    if(!hasFinishAnchor&&finite(result?.finish_seconds)&&Number(result.finish_seconds)>0)anchors.push({distance:totalDistance,time:Number(result.finish_seconds),rank:finite(result.overall_place)?Number(result.overall_place):null,name:finishCp?.name||'Mora',key:finishCp?.key||'finish',kind:'finish'});
    anchors.sort((a,b)=>a.distance-b.distance);
    const finished=anchors.some(a=>a.kind==='finish'&&a.distance>=totalDistance-.05),maxDistance=finished?totalDistance:Number(anchors.at(-1)?.distance||0),maxTime=Number(anchors.at(-1)?.time||0);
    const rawSegments=[];
    for(let i=1;i<checkpoints.length;i++){
      const from=checkpoints[i-1],to=checkpoints[i],endSplit=splitForCheckpoint(orderedSplits,to),startSplit=splitForCheckpoint(orderedSplits,from),elapsed=finite(endSplit?.elapsed_seconds)?Number(endSplit.elapsed_seconds):null,previousElapsed=from.distance===0?0:(finite(startSplit?.elapsed_seconds)?Number(startSplit.elapsed_seconds):null),seconds=finite(endSplit?.segment_seconds)?Number(endSplit.segment_seconds):(finite(elapsed)&&finite(previousElapsed)?elapsed-previousElapsed:null),distance=Math.max(0,to.distance-from.distance),pace=finite(endSplit?.pace_seconds_per_km)?Number(endSplit.pace_seconds_per_km):(finite(seconds)&&distance>0?seconds/distance:null),rank=finite(endSplit?.place_overall)?Number(endSplit.place_overall):null,previousRank=finite(startSplit?.place_overall)?Number(startSplit.place_overall):null;
      rawSegments.push({index:i-1,from,to,distance,seconds,pace,elapsed,rank,rankChange:finite(rank)&&finite(previousRank)?previousRank-rank:null,remaining:Math.max(0,totalDistance-to.distance),passed:Boolean(endSplit&&finite(elapsed)),neutral:!endSplit||!finite(elapsed)||to.distance>maxDistance+.05});
    }
    const allPaces=rawSegments.filter(s=>!s.neutral).map(s=>s.pace).filter(finite);
    const segments=rawSegments.map(segment=>({...segment,...paceColor(segment.neutral?null:segment.pace,allPaces)}));
    const elevationProfile=Array.isArray(route?.elevation_profile)&&route.elevation_profile.length?route.elevation_profile.filter(p=>finite(p?.[0])&&finite(p?.[1])).map(p=>p.slice(0,5).map((value,index)=>index<2?Number(value):(finite(value)?Number(value):null))):[];
    const model={race,result,route,checkpoints,segments,anchors,totalDistance,maxDistance,maxTime,finished,elevationProfile,family:raceFamily(race)};
    model.insights=buildInsights(model);
    return model;
  }

  function segmentAt(model,distance){const d=clamp(distance,0,model.maxDistance);return model.segments.find(s=>d>=s.from.distance-.001&&d<=Math.min(s.to.distance,model.maxDistance)+.001)||model.segments.filter(s=>s.from.distance<=d).at(-1)||model.segments[0]||null}
  function timeAtDistance(model,distance){
    const d=clamp(distance,0,model.maxDistance),anchors=model.anchors;
    let previous=anchors[0],next=null;
    for(const anchor of anchors){if(anchor.distance<=d+.0001)previous=anchor;else{next=anchor;break}}
    if(!next||next.distance<=previous.distance)return Number(previous.time||0);
    return Number(previous.time)+(Number(next.time)-Number(previous.time))*(d-previous.distance)/(next.distance-previous.distance);
  }
  function distanceAtTime(model,time){
    const t=clamp(time,0,model.maxTime),anchors=model.anchors;
    let previous=anchors[0],next=null;
    for(const anchor of anchors){if(anchor.time<=t+.0001)previous=anchor;else{next=anchor;break}}
    if(!next||next.time<=previous.time)return clamp(previous.distance,0,model.maxDistance);
    return clamp(previous.distance+(next.distance-previous.distance)*(t-previous.time)/(next.time-previous.time),0,model.maxDistance);
  }
  function stateAt(model,distance){
    const d=clamp(distance,0,model.maxDistance),segment=segmentAt(model,d),time=timeAtDistance(model,d),coordinate=pointAtDistance(model.route?.points,d),terrain=terrainAtDistance(model.elevationProfile,d),elevation=terrain?.elevation??null;
    const passedAnchors=model.anchors.filter(a=>a.distance<=d+.0001),lastAnchor=passedAnchors.at(-1)||model.anchors[0],atOfficial=Math.abs(d-Number(lastAnchor?.distance||0))<.03;
    const previousCheckpoint=model.checkpoints.filter(cp=>cp.distance<=d+.0001).at(-1)||model.checkpoints[0],nextCheckpoint=model.checkpoints.find(cp=>cp.distance>d+.0001)||null;
    return {distance:d,time,coordinate,elevation,grade:terrain?.grade??null,cumulativeAscent:terrain?.cumulativeAscent??null,cumulativeDescent:terrain?.cumulativeDescent??null,ascentRemaining:finite(terrain?.cumulativeAscent)&&finite(model.route?.total_ascent_m)?Math.max(0,Number(model.route.total_ascent_m)-terrain.cumulativeAscent):null,descentRemaining:finite(terrain?.cumulativeDescent)&&finite(model.route?.total_descent_m)?Math.max(0,Number(model.route.total_descent_m)-terrain.cumulativeDescent):null,segment,lastKnownRank:lastAnchor?.rank??null,rankIsExact:atOfficial&&lastAnchor?.rank!=null,previousCheckpoint,nextCheckpoint,remaining:Math.max(0,model.totalDistance-d),finished:d>=model.maxDistance-.001};
  }

  function buildInsights(model){
    const completed=model.segments.filter(s=>!s.neutral&&finite(s.pace)),items=[];
    if(completed.length){
      const fastest=completed.slice().sort((a,b)=>a.pace-b.pace)[0],toughest=completed.slice().sort((a,b)=>b.pace-a.pace)[0];
      items.push({icon:'🔥',title:'Snabbaste segmentet',primary:`${cleanName(fastest.from.name)} → ${cleanName(fastest.to.name)}`,detail:fmtPace(fastest.pace),distance:(fastest.from.distance+fastest.to.distance)/2,type:'fast'});
      if(toughest!==fastest)items.push({icon:'⚠',title:'Tuffaste segmentet',primary:`${cleanName(toughest.from.name)} → ${cleanName(toughest.to.name)}`,detail:fmtPace(toughest.pace),distance:(toughest.from.distance+toughest.to.distance)/2,type:'tough'});
      const gains=completed.filter(s=>finite(s.rankChange)&&s.rankChange!==0);if(gains.length){const up=gains.slice().sort((a,b)=>b.rankChange-a.rankChange)[0],down=gains.slice().sort((a,b)=>a.rankChange-b.rankChange)[0];if(up.rankChange>0)items.push({icon:'↗',title:'Största placeringslyftet',primary:`${cleanName(up.from.name)} → ${cleanName(up.to.name)}`,detail:`+${up.rankChange} placeringar`,distance:up.to.distance,type:'gain'});if(down.rankChange<0)items.push({icon:'↘',title:'Största placeringstappet',primary:`${cleanName(down.from.name)} → ${cleanName(down.to.name)}`,detail:`${down.rankChange} placeringar`,distance:down.to.distance,type:'loss'})}
      if(completed.length>=3){const med=median(completed.map(s=>s.pace)),last=completed.at(-1);if(last.pace<med)items.push({icon:'⚡',title:'Stark avslutning',primary:`${cleanName(last.from.name)} → ${cleanName(last.to.name)}`,detail:`${fmtPace(last.pace)} · snabbare än egen segmentmedian`,distance:last.to.distance,type:'finish'});let even=null;for(let i=1;i<completed.length;i++){const delta=Math.abs(completed[i].pace-completed[i-1].pace);if(!even||delta<even.delta)even={delta,a:completed[i-1],b:completed[i]}}if(even)items.push({icon:'≈',title:'Jämnaste följden',primary:`${cleanName(even.a.from.name)} → ${cleanName(even.b.to.name)}`,detail:`${Math.round(even.delta)} sek/km skillnad`,distance:even.b.to.distance,type:'even'});let shift=null;for(let i=1;i<completed.length;i++){const delta=completed[i].pace-completed[i-1].pace;if(!shift||Math.abs(delta)>Math.abs(shift.delta))shift={delta,segment:completed[i]}}if(shift&&Math.abs(shift.delta)>=15)items.push({icon:'◇',title:'Tydlig fartförändring',primary:`Efter ${cleanName(shift.segment.from.name)}`,detail:`${shift.delta>0?'+':''}${Math.round(shift.delta)} sek/km`,distance:shift.segment.from.distance,type:'shift'})}
    }
    if(model.elevationProfile.length){const high=model.elevationProfile.slice().sort((a,b)=>b[1]-a[1])[0];items.push({icon:'⛰',title:'Högsta punkten',primary:`${fmtDistance(high[0])}`,detail:`${Math.round(high[1])} m ö.h.`,distance:high[0],type:'high'})}
    return items.slice(0,7);
  }

  function mapProjection(route){
    const points=route?.points||[],lats=points.map(p=>Number(p[0])),lons=points.map(p=>Number(p[1])),merc=lat=>Math.log(Math.tan(Math.PI/4+Number(lat)*Math.PI/360)),ys=lats.map(merc),minX=Math.min(...lons),maxX=Math.max(...lons),minY=Math.min(...ys),maxY=Math.max(...ys),sx=(SVG_W-MAP_PAD*2)/(maxX-minX||1),sy=(SVG_H-MAP_PAD*2)/(maxY-minY||1),scale=Math.min(sx,sy),ox=(SVG_W-(maxX-minX)*scale)/2,oy=(SVG_H-(maxY-minY)*scale)/2;
    const project=point=>[ox+(Number(point[1])-minX)*scale,SVG_H-(oy+(merc(point[0])-minY)*scale)];
    return {project,points:points.map(p=>{const [x,y]=project(p);return{x,y,distance:Number(p[2]),coord:p}})};
  }
  function pointsBetween(model,from,to){const points=model.route?.points||[],out=[];const first=pointAtDistance(points,from),last=pointAtDistance(points,to);if(first)out.push(first);for(const p of points)if(Number(p[2])>from&&Number(p[2])<to)out.push(p);if(last)out.push(last);return out}
  function svgPath(points,project){return points.map((point,index)=>{const [x,y]=project(point);return `${index?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`}).join(' ')}
  function segmentDetail(segment){const rank=finite(segment.rank)?`Plats ${segment.rank}`:'Placering saknas',change=finite(segment.rankChange)?` · ${segment.rankChange>0?'+':''}${segment.rankChange} placeringar`:'';return `${cleanName(segment.from.name)} → ${cleanName(segment.to.name)} · ${fmtDistance(segment.distance)} · ${fmtTime(segment.seconds)} · ${fmtPace(segment.pace)} · ${rank}${change}`}

  function renderMap(model){
    if(!model.route||!Array.isArray(model.route.points)||model.route.points.length<2)return '<div class="runner-replay-empty"><strong>Banrutten saknas för loppåret.</strong><span>Mellantider och reservtabellen visas fortfarande.</span></div>';
    const projection=mapProjection(model.route);model._mapProjection=projection;
    const whole=svgPath(model.route.points,projection.project),segments=model.segments.map(segment=>{const path=svgPath(pointsBetween(model,segment.from.distance,Math.min(segment.to.distance,model.totalDistance)),projection.project),mid=pointAtDistance(model.route.points,(segment.from.distance+segment.to.distance)/2),[mx,my]=projection.project(mid||model.route.points[0]),label=finite(segment.pace)?fmtPace(segment.pace).replace('/km',''): '–';return `<path class="runner-replay-segment ${segment.neutral?'neutral':''}" data-segment="${segment.index}" d="${path}" stroke="${segment.color}" ${segment.neutral?'stroke-dasharray="8 7"':''} tabindex="0" role="button" aria-label="${esc(segmentDetail(segment))}"><title>${esc(segmentDetail(segment))}</title></path><g class="runner-replay-segment-label ${segment.neutral?'neutral':''}" data-segment-label="${segment.index}" transform="translate(${mx.toFixed(1)} ${(my+(segment.index%2?-20:24)).toFixed(1)})"><rect x="-30" y="-10" width="60" height="20" rx="10"/><text text-anchor="middle" y="4">${esc(segment.icon)} ${esc(label)}</text></g>`}).join('');
    const checkpoints=model.checkpoints.map((cp,index)=>{const p=pointAtDistance(model.route.points,cp.distance);if(!p)return'';const [x,y]=projection.project(p),anchor=index%2?'start':'end',tx=index%2?x+9:x-9;return `<g class="runner-replay-checkpoint"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${index===0||index===model.checkpoints.length-1?7:5}"/><text x="${tx.toFixed(1)}" y="${(y-9).toFixed(1)}" text-anchor="${anchor}">${esc(cleanName(cp.name))}</text></g>`}).join('');
    const insightMarkers=model.insights.filter(i=>finite(i.distance)).map(item=>{const p=pointAtDistance(model.route.points,item.distance);if(!p)return'';const [x,y]=projection.project(p);return `<g class="runner-replay-insight-marker" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="11"/><text text-anchor="middle" y="4">${esc(item.icon)}</text><title>${esc(item.title)}: ${esc(item.primary)} · ${esc(item.detail)}</title></g>`}).join('');
    const start=projection.project(model.route.points[0]);
    return `<div class="runner-replay-map"><svg viewBox="0 0 ${SVG_W} ${SVG_H}" role="img" aria-label="Interaktiv loppkarta för ${esc(model.result?.name_as_published)}"><defs><linearGradient id="replayTerrain" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e7efe7"/><stop offset="1" stop-color="#c5dacb"/></linearGradient><pattern id="replayContours" width="70" height="42" patternUnits="userSpaceOnUse"><path d="M0 23 Q17 3 35 23 T70 23" fill="none" stroke="#789989" stroke-opacity=".22"/></pattern></defs><rect width="${SVG_W}" height="${SVG_H}" rx="18" fill="url(#replayTerrain)"/><rect width="${SVG_W}" height="${SVG_H}" rx="18" fill="url(#replayContours)"/><path class="runner-replay-route-base" d="${whole}"/>${segments}${checkpoints}${insightMarkers}<g class="runner-replay-marker" transform="translate(${start[0].toFixed(1)} ${start[1].toFixed(1)})"><circle class="pulse" r="15"/><circle r="8"/><path d="M-2-4l6 4-6 4z"/></g><path class="runner-replay-map-hit" d="${whole}" tabindex="0" role="slider" aria-label="Välj position längs kartbanan" aria-valuemin="0" aria-valuemax="${model.maxDistance.toFixed(1)}" aria-valuenow="0"/></svg></div>`;
  }

  function elevationProjection(model){
    const profile=model.elevationProfile,values=profile.map(p=>p[1]),min=Math.floor((Math.min(...values)-10)/10)*10,max=Math.ceil((Math.max(...values)+10)/10)*10,x=d=>ELEV_PAD.l+clamp(d,0,model.totalDistance)*(ELEV_W-ELEV_PAD.l-ELEV_PAD.r)/(model.totalDistance||1),y=e=>ELEV_PAD.t+(max-e)*(ELEV_H-ELEV_PAD.t-ELEV_PAD.b)/(max-min||1);return{x,y,min,max};
  }
  function renderElevation(model){
    if(!model.elevationProfile.length)return `<div class="runner-elevation-unavailable"><strong>Höjdprofil saknas för den här banversionen</strong><span>${esc(model.route?.elevation_note||'Ruttkällan innehåller ingen verifierad höjddata. Kartan och loppreplay fungerar ändå.')}</span></div>`;
    const p=elevationProjection(model);model._elevationProjection=p;const full=model.elevationProfile.map((v,i)=>`${i?'L':'M'}${p.x(v[0]).toFixed(1)} ${p.y(v[1]).toFixed(1)}`).join(' '),area=`${full} L${p.x(model.elevationProfile.at(-1)[0]).toFixed(1)} ${ELEV_H-ELEV_PAD.b} L${p.x(model.elevationProfile[0][0]).toFixed(1)} ${ELEV_H-ELEV_PAD.b} Z`;
    const colored=model.segments.map(segment=>{const pts=model.elevationProfile.filter(v=>v[0]>=segment.from.distance-.02&&v[0]<=segment.to.distance+.02);if(pts.length<2)return'';return `<path class="runner-elevation-segment" data-elevation-segment="${segment.index}" d="${pts.map((v,i)=>`${i?'L':'M'}${p.x(v[0]).toFixed(1)} ${p.y(v[1]).toFixed(1)}`).join(' ')}" stroke="${segment.color}" ${segment.neutral?'stroke-dasharray="7 6"':''}/>`}).join('');
    const cps=model.checkpoints.map((cp,index)=>{const elevation=elevationAtDistance(model.elevationProfile,cp.distance);if(!finite(elevation))return'';return `<g class="runner-elevation-checkpoint"><line x1="${p.x(cp.distance).toFixed(1)}" x2="${p.x(cp.distance).toFixed(1)}" y1="${p.y(elevation).toFixed(1)}" y2="${ELEV_H-ELEV_PAD.b}"/><circle cx="${p.x(cp.distance).toFixed(1)}" cy="${p.y(elevation).toFixed(1)}" r="3"/><title>${esc(cleanName(cp.name))} · ${fmtDistance(cp.distance)} · ${Math.round(elevation)} m</title>${index===0||index===model.checkpoints.length-1||index%2===0?`<text x="${p.x(cp.distance).toFixed(1)}" y="${ELEV_H-8}" text-anchor="middle">${esc(cleanName(cp.name))}</text>`:''}</g>`}).join('');
    const high=model.route?.high_point,highMarker=high&&finite(high.distance_km)&&finite(high.elevation_m)?`<g class="runner-elevation-high"><circle cx="${p.x(high.distance_km).toFixed(1)}" cy="${p.y(high.elevation_m).toFixed(1)}" r="6"/><text x="${p.x(high.distance_km).toFixed(1)}" y="${(p.y(high.elevation_m)-10).toFixed(1)}" text-anchor="middle">▲ ${Math.round(high.elevation_m)} m</text><title>Högsta punkten · ${fmtDistance(high.distance_km)} · ${Math.round(high.elevation_m)} m ö.h.</title></g>`:'';
    return `<div class="runner-elevation-chart"><svg viewBox="0 0 ${ELEV_W} ${ELEV_H}" role="img" aria-label="Höjdprofil med synkroniserad positionsmarkör"><path class="runner-elevation-area" d="${area}"/><path class="runner-elevation-outline" d="${full}"/>${colored}${cps}${highMarker}<text class="runner-elevation-axis" x="5" y="${(p.y(p.max)+4).toFixed(1)}">${Math.round(p.max)} m</text><text class="runner-elevation-axis" x="5" y="${(p.y(p.min)+4).toFixed(1)}">${Math.round(p.min)} m</text><line class="runner-elevation-position" x1="${p.x(0)}" x2="${p.x(0)}" y1="${ELEV_PAD.t}" y2="${ELEV_H-ELEV_PAD.b}"/><circle class="runner-elevation-dot" cx="${p.x(0)}" cy="${p.y(model.elevationProfile[0][1])}" r="6"/><rect class="runner-elevation-hit" x="${ELEV_PAD.l}" y="0" width="${ELEV_W-ELEV_PAD.l-ELEV_PAD.r}" height="${ELEV_H}" tabindex="0" role="slider" aria-label="Dra position längs höjdprofilen" aria-valuemin="0" aria-valuemax="${model.maxDistance.toFixed(1)}" aria-valuenow="0"/></svg></div>`;
  }

  function segmentCards(model){return model.segments.map(segment=>`<button type="button" class="runner-replay-segment-card ${segment.neutral?'neutral':''}" data-segment-card="${segment.index}" ${segment.from.distance>=model.maxDistance&&model.maxDistance>0?'disabled':''}><i style="--segment-color:${segment.color}"></i><span><strong>${esc(cleanName(segment.from.name))} → ${esc(cleanName(segment.to.name))}</strong><small>${fmtDistance(segment.distance)} · ${fmtTime(segment.seconds)} · ${fmtPace(segment.pace)}</small><em>${finite(segment.rank)?`Plats ${segment.rank}`:'Placering saknas'}${finite(segment.rankChange)?` · ${segment.rankChange>0?'+':''}${segment.rankChange}`:''} · ${fmtDistance(segment.remaining)} kvar</em></span><b aria-hidden="true">${esc(segment.icon)}</b></button>`).join('')}
  function insightCards(model){if(!model.insights.length)return '<div class="runner-replay-no-insights">Fler registrerade passager behövs för prestationsinsikter.</div>';return model.insights.map(item=>`<button type="button" data-insight-distance="${item.distance}"><i aria-hidden="true">${esc(item.icon)}</i><span><small>${esc(item.title)}</small><strong>${esc(item.primary)}</strong><em>${esc(item.detail)}</em></span></button>`).join('')}

  function render(model){
    const replayDisabled=model.maxDistance<=0,routeLabel=model.route?.name||'Rutt saknas';
    return `<div class="runner-replay" data-runner-replay>
      <div class="runner-replay-toolbar">
        <div><p class="eyebrow">INTERAKTIV LOPPREPLAY</p><h3>Karta, fart och passager i samma tidslinje</h3><small>${esc(routeLabel)} · ${model.finished?'Fullföljt':'Sista säkra passage '+fmtDistance(model.maxDistance)}</small></div>
        <div class="runner-replay-actions">
          <button type="button" data-replay-action="play" aria-label="Spela loppet" ${replayDisabled?'disabled':''}>▶ <span>Spela loppet</span></button>
          <button type="button" class="secondary" data-replay-action="reset" aria-label="Återställ loppreplay" ${replayDisabled?'disabled':''}>↺</button>
          <label>Hastighet<select data-replay-speed aria-label="Välj uppspelningshastighet"><option value="30s" selected>Hela loppet på 30 sek</option><option value="60">60×</option><option value="10">10×</option><option value="1">1×</option></select></label>
          <button type="button" class="secondary runner-replay-mute" data-replay-action="mute" aria-label="Slå av eller på musik" aria-pressed="true">♫</button>
          <label class="runner-replay-volume">Volym<input data-replay-volume type="range" min="0" max="1" step="0.05" value="0.65" aria-label="Musikvolym"></label>
        </div>
      </div>
      <div class="runner-replay-visual">
        ${renderMap(model)}
        <div class="runner-replay-info" aria-label="Aktuell position och loppinformation">
          <div><strong data-replay-value="distance">0,0 km</strong><span data-replay-value="place">${esc(cleanName(model.checkpoints[0]?.name||'Start'))}</span></div>
          <dl><div><dt>Beräknad loppstid</dt><dd data-replay-value="time">0:00:00</dd></div><div><dt>Höjd</dt><dd data-replay-value="elevation">–</dd></div><div><dt>Lutning</dt><dd data-replay-value="grade">–</dd></div><div><dt>Delsträcksfart</dt><dd data-replay-value="pace">–</dd></div><div><dt>Placering</dt><dd data-replay-value="rank">Placering saknas</dd></div><div><dt>Återstår</dt><dd data-replay-value="remaining">${fmtDistance(model.totalDistance)}</dd></div><div><dt>Stigning kvar</dt><dd data-replay-value="ascent-remaining">–</dd></div></dl>
          <p data-replay-value="between">${esc(cleanName(model.checkpoints[0]?.name||'Start'))} → ${esc(cleanName(model.checkpoints[1]?.name||'Nästa kontroll'))}</p>
        </div>
        <div class="runner-replay-audio-note" data-replay-audio-note hidden></div>
      </div>
      <label class="runner-replay-scrubber"><span><b data-replay-value="scrubber-distance">0,0 km</b><small data-replay-value="scrubber-time">0:00:00</small></span><input data-replay-scrubber type="range" min="0" max="${model.maxDistance}" step="0.001" value="0" aria-label="Loppets position i kilometer" ${replayDisabled?'disabled':''}></label>
      <section class="runner-elevation-section"><div class="runner-elevation-heading"><div><p class="eyebrow">HÖJDPROFIL</p><h4>Banan under fötterna</h4></div><span>${model.elevationProfile.length?'Verifierad höjddata från ruttkällan':'Replay fungerar utan höjddata'}</span></div>${renderElevation(model)}</section>
      <section class="runner-replay-insights"><div><p class="eyebrow">PRESTATIONSINSIKTER</p><h4>Det som sticker ut</h4></div><div class="runner-replay-insight-grid">${insightCards(model)}</div></section>
      <section class="runner-replay-segments"><div><p class="eyebrow">DELSTRÄCKOR</p><h4>Officiella passager</h4><span>Färgen är relativ till löparens egna registrerade segment. ▲ snabbare · ● jämn · ▼ tuffare.</span></div><div class="runner-replay-segment-grid">${segmentCards(model)}</div></section>
      <span class="sr-only" data-replay-live aria-live="polite" aria-atomic="true"></span>
      <audio data-replay-audio preload="metadata" loop></audio>
    </div>`;
  }

  class ReplayController{
    constructor(element,model,media){
      this.element=element;this.model=model;this.media=media;this.distance=0;this.playing=false;this.destroyed=false;this.frameId=null;this.lastFrame=0;this.lastTextUpdate=0;this.lastAnnouncedSegment=-1;this.audioFadeId=null;this.motionReduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.scrubber=element.querySelector('[data-replay-scrubber]');this.playButton=element.querySelector('[data-replay-action="play"]');this.audio=element.querySelector('[data-replay-audio]');this.setupAudio();this.bind();this.setDistance(0,true,true);
    }
    query(selector){return this.element.querySelector(selector)}
    all(selector){return [...this.element.querySelectorAll(selector)]}
    setupAudio(){
      const source=this.media?.musicForRace?.(this.model.race)||null;let volume=.65,enabled=true;try{const stored=Number(localStorage.getItem('ultravasan-music-volume'));if(finite(stored))volume=clamp(stored,0,1);enabled=localStorage.getItem('ultravasan-music-enabled')!=='false'}catch{}
      this.musicEnabled=enabled;this.audioVolume=volume;const slider=this.query('[data-replay-volume]');if(slider)slider.value=String(volume);if(this.audio){if(source)this.audio.src=source;else this.showAudioNote('Musik saknas för loppet. Replay fungerar utan ljud.');this.audio.volume=volume;this.audio.addEventListener('error',()=>this.showAudioNote('Musiken kunde inte laddas. Loppreplay fungerar ändå.'))}this.updateMuteButton();
    }
    showAudioNote(text){const note=this.query('[data-replay-audio-note]');if(note){note.hidden=false;note.textContent=text}}
    updateMuteButton(){const button=this.query('[data-replay-action="mute"]');if(!button)return;button.setAttribute('aria-pressed',String(this.musicEnabled));button.textContent=this.musicEnabled?'♫':'♪';button.title=this.musicEnabled?'Stäng av musik':'Slå på musik'}
    bind(){
      this.playButton?.addEventListener('click',()=>this.togglePlay(true));
      this.query('[data-replay-action="reset"]')?.addEventListener('click',()=>this.reset());
      this.query('[data-replay-action="mute"]')?.addEventListener('click',()=>this.toggleMute());
      this.query('[data-replay-volume]')?.addEventListener('input',event=>this.setVolume(Number(event.target.value)));
      this.scrubber?.addEventListener('input',event=>this.setDistance(Number(event.target.value),true,true));
      this.all('[data-segment-card],[data-segment]').forEach(node=>{const activate=()=>{const segment=this.model.segments[Number(node.dataset.segmentCard??node.dataset.segment)];if(segment)this.setDistance(Math.min(this.model.maxDistance,(segment.from.distance+Math.min(segment.to.distance,this.model.maxDistance))/2),true,true)};node.addEventListener('click',activate);node.addEventListener('focus',()=>{if(node.matches('[data-segment]'))activate()});node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate()}})});
      this.all('[data-insight-distance]').forEach(node=>node.addEventListener('click',()=>this.setDistance(Number(node.dataset.insightDistance),true,true)));
      const mapHit=this.query('.runner-replay-map-hit');mapHit?.addEventListener('click',event=>this.seekMap(event));mapHit?.addEventListener('keydown',event=>this.sliderKey(event));
      const elevationHit=this.query('.runner-elevation-hit');if(elevationHit){const seek=event=>this.seekElevation(event);elevationHit.addEventListener('pointerdown',event=>{elevationHit.setPointerCapture?.(event.pointerId);seek(event)});elevationHit.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'||elevationHit.hasPointerCapture?.(event.pointerId))seek(event)});elevationHit.addEventListener('keydown',event=>this.sliderKey(event))}
    }
    sliderKey(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?this.model.maxDistance:this.distance+(event.key==='ArrowRight'?0.25:-0.25);this.setDistance(next,true,true)}
    seekMap(event){const svg=event.currentTarget.ownerSVGElement,point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const local=point.matrixTransform(svg.getScreenCTM().inverse()),nearest=this.model._mapProjection?.points.reduce((best,p)=>{const delta=(p.x-local.x)**2+(p.y-local.y)**2;return !best||delta<best.delta?{delta,p}:best},null);if(nearest)this.setDistance(Math.min(this.model.maxDistance,nearest.p.distance),true,true)}
    seekElevation(event){const svg=event.currentTarget.ownerSVGElement,rect=svg.getBoundingClientRect(),x=(event.clientX-rect.left)*ELEV_W/(rect.width||1),distance=(x-ELEV_PAD.l)*(this.model.totalDistance)/(ELEV_W-ELEV_PAD.l-ELEV_PAD.r);this.setDistance(distance,true,true)}
    togglePlay(userGesture=false){if(this.playing){this.pause();return}if(this.distance>=this.model.maxDistance-.001)this.setDistance(0,false,true);this.playing=true;this.playButton.innerHTML='❚❚ <span>Pausa</span>';this.playButton.setAttribute('aria-label','Pausa loppet');this.lastFrame=performance.now();if(userGesture)this.playAudio();this.frameId=requestAnimationFrame(now=>this.frame(now))}
    pause(pauseAudio=true){if(!this.playing&&pauseAudio)return;this.playing=false;if(this.frameId)cancelAnimationFrame(this.frameId);this.frameId=null;if(this.playButton){this.playButton.innerHTML='▶ <span>Fortsätt</span>';this.playButton.setAttribute('aria-label','Fortsätt loppet')}if(pauseAudio)this.audio?.pause()}
    reset(){this.pause();this.setDistance(0,true,true);if(this.audio){this.audio.pause();try{this.audio.currentTime=0}catch{}}if(this.playButton)this.playButton.innerHTML='▶ <span>Spela loppet</span>'}
    frame(now){if(!this.playing||this.destroyed)return;const dt=Math.min(.12,(now-this.lastFrame)/1000);this.lastFrame=now;const mode=this.query('[data-replay-speed]')?.value||'30s';let next;if(mode==='30s')next=this.distance+this.model.maxDistance/30*dt;else{const speed=Number(mode)||60,currentTime=timeAtDistance(this.model,this.distance);next=distanceAtTime(this.model,currentTime+dt*speed)}this.setDistance(next,false,false,now);if(this.distance>=this.model.maxDistance-.001){this.setDistance(this.model.maxDistance,false,true,now);this.playing=false;this.playButton.innerHTML='▶ <span>Spela igen</span>';this.playButton.setAttribute('aria-label','Spela loppet igen');this.fadeAudio(true);this.announce(this.model.finished?'Löparen är i mål.':'Löparen har nått sin sista registrerade passage.');return}this.frameId=requestAnimationFrame(value=>this.frame(value))}
    setDistance(distance,announce=false,forceText=false,now=performance.now()){
      this.distance=clamp(distance,0,this.model.maxDistance);const state=stateAt(this.model,this.distance);if(this.scrubber){this.scrubber.value=String(this.distance);this.scrubber.setAttribute('aria-valuenow',this.distance.toFixed(1))}
      const marker=this.query('.runner-replay-marker');if(marker&&state.coordinate){const pos=this.model._mapProjection.project(state.coordinate);marker.setAttribute('transform',`translate(${pos[0].toFixed(1)} ${pos[1].toFixed(1)})`)}
      const mapSlider=this.query('.runner-replay-map-hit');mapSlider?.setAttribute('aria-valuenow',this.distance.toFixed(1));
      if(this.model._elevationProjection){const p=this.model._elevationProjection,x=p.x(this.distance),y=finite(state.elevation)?p.y(state.elevation):ELEV_H-ELEV_PAD.b;const line=this.query('.runner-elevation-position'),dot=this.query('.runner-elevation-dot'),hit=this.query('.runner-elevation-hit');if(line){line.setAttribute('x1',x);line.setAttribute('x2',x)}if(dot){dot.setAttribute('cx',x);dot.setAttribute('cy',y)}hit?.setAttribute('aria-valuenow',this.distance.toFixed(1))}
      const index=state.segment?.index??-1;this.all('[data-segment],[data-segment-card],[data-segment-label],[data-elevation-segment]').forEach(node=>{const value=Number(node.dataset.segment??node.dataset.segmentCard??node.dataset.segmentLabel??node.dataset.elevationSegment);node.classList.toggle('active',value===index)});
      if(forceText||now-this.lastTextUpdate>90){this.updateText(state);this.lastTextUpdate=now}
      if(index!==this.lastAnnouncedSegment){this.lastAnnouncedSegment=index;if(announce&&state.segment)this.announce(`${cleanName(state.segment.from.name)} till ${cleanName(state.segment.to.name)}. ${fmtPace(state.segment.pace)}.`)}else if(announce)this.announce(`${fmtDistance(state.distance)}. Beräknad loppstid ${fmtTime(state.time)}.`)
    }
    setText(name,value){const node=this.query(`[data-replay-value="${name}"]`);if(node)node.textContent=value}
    updateText(state){this.setText('distance',fmtDistance(state.distance));this.setText('place',cleanName(state.previousCheckpoint?.name||'På banan'));this.setText('time',fmtTime(state.time));this.setText('elevation',finite(state.elevation)?`${Math.round(state.elevation)} m`:'Höjd saknas');this.setText('grade',finite(state.grade)?`${state.grade>0?'+':''}${Number(state.grade).toFixed(1).replace('.',',')} %`:'Lutning saknas');this.setText('pace',fmtPace(state.segment?.pace));this.setText('rank',state.lastKnownRank!=null?`${state.rankIsExact?'Placering':'Senast registrerade placering'} ${state.lastKnownRank}`:'Placering saknas');this.setText('remaining',fmtDistance(state.remaining));this.setText('ascent-remaining',finite(state.ascentRemaining)?`${Math.round(state.ascentRemaining)} m`:'Stigning saknas');this.setText('between',`${cleanName(state.previousCheckpoint?.name||'Start')} → ${cleanName(state.nextCheckpoint?.name||'Sista säkra punkt')}`);this.setText('scrubber-distance',fmtDistance(state.distance));this.setText('scrubber-time',fmtTime(state.time))}
    announce(text){const live=this.query('[data-replay-live]');if(live){live.textContent='';setTimeout(()=>{if(!this.destroyed)live.textContent=text},20)}}
    setVolume(value){this.audioVolume=clamp(value,0,1);if(this.audio)this.audio.volume=this.audioVolume;try{localStorage.setItem('ultravasan-music-volume',String(this.audioVolume))}catch{}}
    toggleMute(){this.musicEnabled=!this.musicEnabled;try{localStorage.setItem('ultravasan-music-enabled',String(this.musicEnabled))}catch{}this.updateMuteButton();if(this.musicEnabled&&this.playing)this.playAudio();else this.audio?.pause()}
    playAudio(){if(!this.audio||!this.audio.src||!this.musicEnabled)return;this.audio.volume=this.audioVolume;this.audio.play().catch(()=>this.showAudioNote('Webbläsaren väntar med musiken. Tryck på Spela loppet igen.'))}
    fadeAudio(reset){if(!this.audio||this.audio.paused)return;const audio=this.audio,start=performance.now(),volume=audio.volume;const fade=now=>{if(this.destroyed)return;const p=clamp((now-start)/350,0,1);audio.volume=volume*(1-p);if(p<1)this.audioFadeId=requestAnimationFrame(fade);else{audio.pause();if(reset)try{audio.currentTime=0}catch{}audio.volume=this.audioVolume}};this.audioFadeId=requestAnimationFrame(fade)}
    destroy(){this.destroyed=true;this.playing=false;if(this.frameId)cancelAnimationFrame(this.frameId);if(this.audioFadeId)cancelAnimationFrame(this.audioFadeId);if(this.audio){this.audio.pause();try{this.audio.currentTime=0}catch{}}}
  }

  function mount(element,model,media){stopActive();if(!element||!model)return null;activeController=new ReplayController(element,model,media);return activeController}
  function stopActive(){if(activeController){activeController.destroy();activeController=null}}
  function motionAllowed(prefersReducedMotion){return !Boolean(prefersReducedMotion)}

  return {PACE_COLORS,NEUTRAL_COLOR,routeForRace,pointAtDistance,terrainAtDistance,elevationAtDistance,paceColor,createModel,stateAt,timeAtDistance,distanceAtTime,buildInsights,render,mount,stopActive,motionAllowed,fmtTime,fmtPace,cleanName};
});
