'use strict';
(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('./runner-replay.js'):root.RunnerReplay,
    typeof module==='object'&&module.exports?require('./map-engine.js'):root.UltravasanMapEngine,
    typeof module==='object'&&module.exports?require('./playback.js'):root.UltravasanPlayback,
    typeof module==='object'&&module.exports?require('./race-media.js'):root.RaceMedia
  );
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.UltravasanComparison2=api;
})(typeof window!=='undefined'?window:globalThis,function(replay,mapEngine,playback,media){
  const COLORS=Object.freeze(['#0b6671','#b85b24']);
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function duration(value){
    if(!finite(value))return '–';
    const seconds=Math.max(0,Math.round(Math.abs(Number(value))));
    const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
    return h?String(h)+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'):String(m)+':'+String(s).padStart(2,'0');
  }
  function signedDuration(value){
    if(!finite(value))return '–';
    const n=Number(value);
    if(Math.abs(n)<1)return '0:00';
    return (n>0?'+':'−')+duration(n);
  }
  function pace(value){
    if(!finite(value)||Number(value)<=0)return '–';
    const seconds=Math.round(Number(value));
    return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' /km';
  }
  function percent(value){return finite(value)?(Number(value)>0?'+':'')+Number(value).toLocaleString('sv-SE',{maximumFractionDigits:1})+' %':'–'}
  const DEFAULT_VOLUME=finite(replay?.DEFAULT_VOLUME)?Number(replay.DEFAULT_VOLUME):.35;
  const DEFAULT_PLAYBACK_SECONDS=finite(playback?.DEFAULT_DURATION)?Number(playback.DEFAULT_DURATION):120;
  function playbackLabel(seconds){
    const value=Number(seconds);
    return value===60?'Hela loppet på 1 minut':value%60===0?'Hela loppet på '+(value/60)+' minuter':'Hela loppet på '+value+' sekunder';
  }
  function playbackOptions(){
    const values=Array.isArray(playback?.DURATIONS)&&playback.DURATIONS.length?playback.DURATIONS:[30,60,120,180];
    return values.map(value=>'<option value="'+value+'s" '+(Number(value)===DEFAULT_PLAYBACK_SECONDS?'selected':'')+'>'+esc(playbackLabel(value))+'</option>').join('');
  }
  function resultName(participant,index){return participant?.name||participant?.label||('Löpare '+(index+1))}
  function resultLabel(participants,index){
    const participant=participants?.[index]||{},name=resultName(participant,index),duplicate=(participants||[]).some((other,otherIndex)=>otherIndex!==index&&resultName(other,otherIndex)===name);
    return duplicate&&participant?.year?name+' · '+participant.year:name;
  }
  function checkpointName(model,key){
    const cp=(model?.checkpoints||[]).find(row=>String(row.checkpoint_key)===String(key));
    if(cp?.checkpoint_name)return cp.checkpoint_name;
    const replayCp=(model?._replayModels?.[0]?.checkpoints||[]).find(row=>String(row.key)===String(key));
    return replayCp?.name||String(key||'');
  }
  function segmentName(model,segment){return checkpointName(model,segment.from)+' → '+checkpointName(model,segment.to)}
  function createViewModel(model,participants=[]){
    if(!model?.available||model.results?.length!==2)return{available:false,reason:model?.reason||'need-exactly-two-runners'};
    const insights=model.pairwise_insights||{},a=participants[0]||{},b=participants[1]||{};
    const final=finite(insights.final_gap_seconds)
      ?(Number(insights.final_gap_seconds)===0?'Samma sluttid':(Number(insights.final_gap_seconds)>0?resultLabel(participants,0):resultLabel(participants,1))+' före med '+duration(insights.final_gap_seconds))
      :'Ej helbanejämförbart';
    return{
      available:true,
      final,
      leaders:insights.leaders||{a:0,b:0,equal:0},
      leadChanges:Number(insights.lead_changes||0),
      nearest:insights.nearest||null,
      largestGap:insights.largest_gap||null,
      mostA:insights.most_time_won_a||null,
      mostB:insights.most_time_won_b||null,
    };
  }
  function gapChart(model,participants){
    const rows=(model.checkpoints||[]).filter(row=>row.comparable&&finite(row.pair_gap_seconds)&&finite(row.entries?.[0]?.distance_km));
    if(!rows.length)return'<div class="c2-empty">Gemensamma exakta passager saknas för en tidsluckegraf.</div>';
    const W=920,H=320,p={l:88,r:28,t:48,b:82};
    const distances=rows.map(row=>Number(row.entries[0].distance_km)),values=rows.map(row=>Number(row.pair_gap_seconds)),maxX=Math.max(...distances,1),maxAbs=Math.max(60,...values.map(Math.abs));
    const x=value=>p.l+Number(value)/maxX*(W-p.l-p.r),y=value=>p.t+(maxAbs-Number(value))/(maxAbs*2)*(H-p.t-p.b);
    let marks='<rect class="c2-gap-zone c2-gap-zone-a" x="'+p.l+'" y="'+p.t+'" width="'+(W-p.l-p.r)+'" height="'+(y(0)-p.t)+'"/><rect class="c2-gap-zone c2-gap-zone-b" x="'+p.l+'" y="'+y(0)+'" width="'+(W-p.l-p.r)+'" height="'+(H-p.b-y(0))+'"/>';
    for(let i=0;i<=4;i++){
      const value=maxAbs-(maxAbs*2*i/4),yy=y(value);
      marks+='<line class="c2-grid" x1="'+p.l+'" x2="'+(W-p.r)+'" y1="'+yy+'" y2="'+yy+'"/><text class="c2-axis-label" x="'+(p.l-10)+'" y="'+(yy+5)+'" text-anchor="end">'+signedDuration(value)+'</text>';
    }
    for(let i=0;i<=4;i++){
      const value=maxX*i/4,xx=x(value);
      marks+='<line class="c2-grid c2-grid-vertical" x1="'+xx+'" x2="'+xx+'" y1="'+p.t+'" y2="'+(H-p.b)+'"/><text class="c2-axis-label" x="'+xx+'" y="'+(H-48)+'" text-anchor="middle">'+value.toLocaleString('sv-SE',{maximumFractionDigits:1})+' km</text>';
    }
    const path=rows.map((row,index)=>(index?'L':'M')+x(row.entries[0].distance_km).toFixed(1)+' '+y(row.pair_gap_seconds).toFixed(1)).join(' ');
    const dots=rows.map((row,index)=>{
      const title=row.checkpoint_name+' · '+(Number(row.pair_gap_seconds)>0?resultLabel(participants,0):Number(row.pair_gap_seconds)<0?resultLabel(participants,1):'Lika')+(Number(row.pair_gap_seconds)===0?'':(' före '+duration(row.pair_gap_seconds)));
      return'<circle class="c2-gap-point" data-c2-checkpoint="'+esc(row.checkpoint_key)+'" data-c2-time="'+esc(row.action_time_seconds??'')+'" cx="'+x(row.entries[0].distance_km).toFixed(1)+'" cy="'+y(row.pair_gap_seconds).toFixed(1)+'" r="6" tabindex="0" role="button" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title></circle>';
    }).join('');
    const labels=rows.map((row,index)=>'<text class="c2-x-label c2-checkpoint-label" x="'+x(row.entries[0].distance_km).toFixed(1)+'" y="'+(H-18-(index%2)*13)+'" text-anchor="'+(index===rows.length-1?'end':index===0?'start':'middle')+'">'+esc(row.checkpoint_name)+'</text>').join('');
    const axisTitles='<text class="c2-axis-title" x="'+((p.l+W-p.r)/2)+'" y="'+(H-2)+'" text-anchor="middle">Distans</text><text class="c2-axis-title" x="20" y="'+((p.t+H-p.b)/2)+'" text-anchor="middle" transform="rotate(-90 20 '+((p.t+H-p.b)/2)+')">Tidslucka</text>';
    const key='<div class="c2-chart-key"><span style="--runner:'+COLORS[0]+'"><i></i>Över 0 = '+esc(resultLabel(participants,0))+' före</span><span class="c2-zero-key">Streckad linje = lika</span><span style="--runner:'+COLORS[1]+'"><i></i>Under 0 = '+esc(resultLabel(participants,1))+' före</span></div>';
    return key+'<svg class="c2-gap-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Observerad tidslucka mellan de två löparna">'+marks+'<line class="c2-zero" x1="'+p.l+'" x2="'+(W-p.r)+'" y1="'+y(0)+'" y2="'+y(0)+'"/><text class="c2-zero-label" x="'+(W-p.r-4)+'" y="'+(y(0)-7)+'" text-anchor="end">0 = lika</text><path class="c2-gap-line" d="'+path+'"/>'+dots+labels+axisTitles+'</svg>';
  }
  function placementChart(model,participants){
    const rows=(model.checkpoints||[]).filter(row=>row.comparable);
    const series=[0,1].map(index=>rows.map(row=>row.entries?.[index]?.exact&&finite(row.entries[index].place_overall)?Number(row.entries[index].place_overall):null));
    const values=series.flat().filter(finite);
    if(values.length<4)return'<div class="c2-empty">För få publicerade placeringsobservationer för placeringsresan.</div>';
    const W=920,H=260,p={l:58,r:24,t:24,b:64},maxPlace=Math.max(...values,2),x=index=>p.l+index*(W-p.l-p.r)/Math.max(1,rows.length-1),y=value=>p.t+(Number(value)-1)/(maxPlace-1)*(H-p.t-p.b);
    let marks='';
    for(let tick=0;tick<=4;tick++){const place=Math.max(1,Math.round(1+(maxPlace-1)*tick/4)),yy=y(place);marks+='<line class="c2-grid" x1="'+p.l+'" x2="'+(W-p.r)+'" y1="'+yy+'" y2="'+yy+'"/><text class="c2-axis-label" x="'+(p.l-8)+'" y="'+(yy+4)+'" text-anchor="end">'+place+'</text>'}
    series.forEach((items,runnerIndex)=>{
      let path='',open=false;
      items.forEach((value,index)=>{if(!finite(value)){open=false;return}path+=(open?'L':'M')+x(index).toFixed(1)+' '+y(value).toFixed(1)+' ';open=true;marks+='<circle class="c2-placement-point" cx="'+x(index).toFixed(1)+'" cy="'+y(value).toFixed(1)+'" r="5" style="--runner:'+COLORS[runnerIndex]+'"><title>'+esc(resultLabel(participants,runnerIndex)+' · '+rows[index].checkpoint_name+' · plats '+value)+'</title></circle>'});
      marks+='<path class="c2-placement-line" d="'+path+'" style="--runner:'+COLORS[runnerIndex]+'"/>';
    });
    const labels=rows.map((row,index)=>'<text class="c2-x-label" x="'+x(index).toFixed(1)+'" y="'+(H-19-(index%2)*13)+'" text-anchor="'+(index===rows.length-1?'end':index===0?'start':'middle')+'">'+esc(row.checkpoint_name)+'</text>').join('');
    return'<svg class="c2-placement-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Officiell totalplacering genom loppet">'+marks+labels+'</svg>';
  }
  function fieldChart(model,participants){
    const segments=(model.segments||[]).filter(segment=>segment.comparable);
    if(!segments.length)return'<div class="c2-empty">Jämförbara segment saknas.</div>';
    const W=920,H=320,p={l:88,r:24,t:42,b:80},values=segments.flatMap(segment=>segment.entries.map(entry=>entry.performance_vs_field_percent)).filter(finite).map(Number);
    if(values.length<2)return'<div class="c2-empty">För få segment har minst fem säkra referenser i respektive loppår.</div>';
    const minValue=Math.min(...values),maxValue=Math.max(...values),span=Math.max(5,maxValue-minValue),padValue=Math.max(2.5,span*.12);
    let lo=Math.min(0,Math.floor((minValue-padValue)/5)*5),hi=Math.max(5,Math.ceil((maxValue+padValue)/5)*5);
    if(hi-lo<10)hi=lo+10;
    const x=index=>p.l+(index+.5)*(W-p.l-p.r)/segments.length,y=value=>p.t+(hi-Number(value))*(H-p.t-p.b)/(hi-lo||1);
    let body='';
    for(let tick=0;tick<=5;tick++){
      const value=hi-(hi-lo)*tick/5,yy=y(value);
      body+='<line class="c2-grid" x1="'+p.l+'" x2="'+(W-p.r)+'" y1="'+yy+'" y2="'+yy+'"/><text class="c2-axis-label" x="'+(p.l-10)+'" y="'+(yy+5)+'" text-anchor="end">'+percent(value)+'</text>';
    }
    body+='<line class="c2-zero" x1="'+p.l+'" x2="'+(W-p.r)+'" y1="'+y(0)+'" y2="'+y(0)+'"/><text class="c2-zero-label" x="'+(W-p.r-4)+'" y="'+(y(0)-7)+'" text-anchor="end">0 % = fältmedian</text>';
    for(let runnerIndex=0;runnerIndex<2;runnerIndex++){
      let path='',open=false;
      segments.forEach((segment,index)=>{
        const entry=segment.entries[runnerIndex],value=entry?.performance_vs_field_percent;
        if(!finite(value)){open=false;return}
        path+=(open?'L':'M')+x(index).toFixed(1)+' '+y(value).toFixed(1)+' ';open=true;
        const title=segmentName(model,segment)+' · '+resultLabel(participants,runnerIndex)+' '+percent(value)+' mot '+(participants[runnerIndex]?.year||'eget år')+'-fältets median · n='+entry.field_reference_n;
        body+='<circle class="c2-field-point" cx="'+x(index).toFixed(1)+'" cy="'+y(value).toFixed(1)+'" r="5" style="--runner:'+COLORS[runnerIndex]+'"><title>'+esc(title)+'</title></circle>';
      });
      body+='<path class="c2-field-line" d="'+path+'" style="--runner:'+COLORS[runnerIndex]+'"/>';
    }
    body+=segments.map((segment,index)=>'<text class="c2-field-label" x="'+x(index).toFixed(1)+'" y="'+(H-26-(index%2)*14)+'" text-anchor="middle">'+esc(checkpointName(model,segment.to))+'</text>').join('');
    body+='<text class="c2-axis-title" x="'+((p.l+W-p.r)/2)+'" y="'+(H-2)+'" text-anchor="middle">Delsträcka</text><text class="c2-axis-title" x="20" y="'+((p.t+H-p.b)/2)+'" text-anchor="middle" transform="rotate(-90 20 '+((p.t+H-p.b)/2)+')">Skillnad mot median (%)</text>';
    const sameYear=participants?.[0]?.year&&participants?.[0]?.year===participants?.[1]?.year;
    const referenceText=sameYear?'Båda linjerna jämförs mot samma '+esc(participants[0].year)+'-median.':'Varje linje jämförs mot medianen i löparens eget loppår.';
    const key='<div class="c2-chart-key c2-field-key"><span style="--runner:'+COLORS[0]+'"><i></i>'+esc(resultLabel(participants,0))+'</span><span style="--runner:'+COLORS[1]+'"><i></i>'+esc(resultLabel(participants,1))+'</span><span class="c2-zero-key">0 % = respektive års fältmedian</span><small>'+referenceText+'</small></div>';
    return key+'<svg class="c2-field-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Pacing relativt respektive loppårs fältmedian">'+body+'</svg>';
  }
  function elevationChart(model,participants){
    const replayModels=model._replayModels||[],first=replayModels[0],profile=first?.elevationProfile||[];
    if(!profile.length)return'<div class="c2-empty">Verifierad höjdprofil saknas för den gemensamma banreferensen.</div>';
    const projection=replay.elevationProjection(first,920),path=profile.map((point,index)=>(index?'L':'M')+projection.x(point[0]).toFixed(1)+' '+projection.y(point[1]).toFixed(1)).join(' '),base=projection.height-projection.pad.b;
    const area=path+' L'+projection.x(profile.at(-1)[0]).toFixed(1)+' '+base+' L'+projection.x(profile[0][0]).toFixed(1)+' '+base+' Z';
    const segment=(model.segments||[])[0],from=segment?first.checkpoints.find(cp=>String(cp.key)===String(segment.from))?.distance:0,to=segment?first.checkpoints.find(cp=>String(cp.key)===String(segment.to))?.distance:0;
    return'<svg class="c2-elevation" viewBox="0 0 '+projection.width+' '+projection.height+'" role="img" aria-label="Synkroniserad höjdprofil"><path class="c2-elev-area" d="'+area+'"/><path class="c2-elev-line" d="'+path+'"/><rect data-c2-elev-segment class="c2-elev-segment" x="'+projection.x(from||0)+'" y="'+projection.pad.t+'" width="'+Math.max(0,projection.x(to||0)-projection.x(from||0))+'" height="'+(base-projection.pad.t)+'"/>'+replayModels.map((runner,index)=>'<line data-c2-elev-marker="'+index+'" class="c2-elev-marker" style="--runner:'+COLORS[index]+'" x1="'+projection.x(0)+'" x2="'+projection.x(0)+'" y1="'+projection.pad.t+'" y2="'+base+'"/><circle data-c2-elev-dot="'+index+'" class="c2-elev-dot" style="--runner:'+COLORS[index]+'" cx="'+projection.x(0)+'" cy="'+projection.y(profile[0][1])+'" r="7"><title>'+esc(resultLabel(participants,index))+'</title></circle>').join('')+'<rect class="c2-elev-hit" data-c2-elev-hit x="'+projection.pad.l+'" y="'+projection.pad.t+'" width="'+(projection.width-projection.pad.l-projection.pad.r)+'" height="'+(base-projection.pad.t)+'" tabindex="0" role="slider" aria-label="Sök i jämförelsen via höjdprofilen"/></svg>';
  }
  function latestAnchor(model,time){
    return (model?.anchors||[]).filter(anchor=>Number(anchor.time)<=Number(time)+.5).at(-1)||model?.anchors?.[0]||null;
  }
  function render(root,options){
    const sourceModel=options.model,participants=options.participants||[],model=sourceModel?{...sourceModel,_replayModels:options.replayModels||[]}:sourceModel,view=createViewModel(model,participants);
    if(!view.available){
      const reason=view.reason==='need-exactly-two-runners'?'Direktjämförelse kräver exakt två löpare.':'Jämförelsen saknar tillräckligt verifierat underlag.';
      root.innerHTML='<div class="c2-shell"><header class="c2-hero"><p class="eyebrow">DIREKTJÄMFÖRELSE 2.0</p><h2>Jämförelsen kan inte visas</h2><p>'+esc(reason)+'</p></header></div>';
      return null;
    }
    const p0=participants[0]||{},p1=participants[1]||{},insights=model.pairwise_insights||{},segmentButtons=(model.segments||[]).map((segment,index)=>{
      const a=segment.entries?.[0],b=segment.entries?.[1],delta=segment.pair_delta_seconds;
      return'<button type="button" class="c2-segment" data-c2-segment="'+index+'" aria-pressed="'+String(index===0)+'"><span class="c2-segment-name"><b>'+(index+1)+'</b><strong>'+esc(segmentName(model,segment))+'</strong></span><span style="--runner:'+COLORS[0]+'"><small>'+esc(resultLabel(participants,0))+'</small><strong>'+duration(a?.segment_seconds)+'</strong><em>'+pace(a?.pace_seconds_per_km)+'</em></span><span style="--runner:'+COLORS[1]+'"><small>'+esc(resultLabel(participants,1))+'</small><strong>'+duration(b?.segment_seconds)+'</strong><em>'+pace(b?.pace_seconds_per_km)+'</em></span><span class="c2-segment-verdict"><strong>'+(!segment.comparable?'Ej jämförbart':!finite(delta)?'Säker tid saknas':Number(delta)===0?'Lika':esc((Number(delta)>0?resultLabel(participants,0):resultLabel(participants,1))+' vann '+duration(delta)))+'</strong><small>'+(segment.comparable?'fältindex '+percent(a?.performance_vs_field_percent)+' / '+percent(b?.performance_vs_field_percent):'banversionskontraktet blockerar direkt gap')+'</small></span></button>';
    }).join('');
    const kpi=(label,value,copy)=>'<article><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(copy||'')+'</small></article>';
    const gapWords=row=>row&&finite(row.pair_gap_seconds)?(Number(row.pair_gap_seconds)===0?'Lika':(Number(row.pair_gap_seconds)>0?resultLabel(participants,0):resultLabel(participants,1))+' före '+duration(row.pair_gap_seconds)):'Underlag saknas';
    root.innerHTML='<div class="c2-shell"><header class="c2-hero"><div><p class="eyebrow">DIREKTJÄMFÖRELSE 2.0</p><h2>Två lopp. Ett gemensamt analysflöde.</h2><p>Officiella passager är fasta observationer. Rörelse mellan dem är en tydligt märkt rekonstruktion längs verifierad banreferens.</p></div><span class="pill">'+esc(model.same_course_version?'Samma CourseVersion':'Begränsad geometri')+'</span></header>'+
      '<section class="c2-people">'+[p0,p1].map((p,index)=>'<article style="--runner:'+COLORS[index]+'"><span>'+(index?'B':'A')+'</span><div><p>'+esc((p.year||'–')+(p.bib?' · #'+p.bib:''))+'</p><h3>'+esc(resultName(p,index))+'</h3><small>'+esc(p.className||p.status||'')+'</small></div><strong>'+duration(p.finishSeconds)+'</strong></article>').join('')+'</section>'+
      '<div class="c2-actions"><button type="button" class="secondary" data-c2-share>↗ Dela jämförelsen</button><button type="button" data-c2-map-duel>Öppna i Kartduell</button><span data-c2-feedback aria-live="polite"></span></div>'+
      '<section class="c2-kpis">'+kpi('SLUTLIG SKILLNAD',view.final,model.whole_course_comparable?'Verifierad helbaneserie':'Ingen direkt helbaneranking')+kpi('PASSAGER FÖRE','A: '+view.leaders.a+' · B: '+view.leaders.b+' · lika: '+view.leaders.equal,'Endast gemensamma exakta passager')+kpi('LEDNINGSVÄXLINGAR',String(view.leadChanges),'Observerade skiften mellan passager')+kpi('NÄRMAST',gapWords(view.nearest),view.nearest?.checkpoint_name||'–')+kpi('STÖRSTA LUCKA',gapWords(view.largestGap),view.largestGap?.checkpoint_name||'–')+kpi('A VANN MEST TID',view.mostA?duration(view.mostA.pair_delta_seconds):'–',view.mostA?segmentName(model,view.mostA):resultLabel(participants,0))+kpi('B VANN MEST TID',view.mostB?duration(view.mostB.pair_delta_seconds):'–',view.mostB?segmentName(model,view.mostB):resultLabel(participants,1))+'</section>'+
      '<section class="c2-grid-two"><article class="c2-panel"><h3>Tidslucka genom loppet</h3><p>Y-axeln visar tidsluckan vid verkliga officiella passager. Över 0 betyder att A ligger före, under 0 att B ligger före och den streckade 0-linjen betyder lika. Klicka en punkt för att flytta tävlingsklockan dit.</p>'+gapChart(model,participants)+'</article><article class="c2-panel"><h3>Officiell placeringsresa</h3><p>Publicerad totalplacering vid gemensamma exakta passager.</p>'+placementChart(model,participants)+'</article></section>'+
      '<section class="c2-panel"><h3>Segmentduellen</h3><p>Välj en delsträcka. Valet synkas med bana och höjdprofil där gemensam geometri är verifierad.</p><div class="c2-segments">'+segmentButtons+'</div></section>'+
      '<section class="c2-panel"><h3>Fart per delsträcka mot respektive års fältmedian</h3><p>Varje linje visar hur mycket snabbare eller långsammare löparen sprang än medianfarten i sitt eget loppår. Den streckade 0 %-linjen är alltså fältets median – inte någon av löparnas fart. Referens kräver minst fem säkra fullföljare.</p>'+fieldChart(model,participants)+'</section>'+
      '<section class="c2-panel c2-course"><div class="c2-course-head"><div><h3>Interaktiv kartjämförelse</h3><p>Gemensam tävlingsklocka, två rekonstruerade positioner och synkad höjdprofil.</p></div><span>'+esc(options.courseLabel||'')+'</span></div>'+
      (model.same_course_version&&model._replayModels.length===2?'<div class="c2-live"><div class="c2-map" data-c2-map><div class="c2-map-fallback">Förbereder interaktiv karta…</div></div><div class="c2-live-side"><div class="c2-clock"><span>TÄVLINGSKLOCKA</span><strong data-c2-clock>0:00</strong><small data-c2-clock-max></small></div><div class="c2-live-cards" data-c2-live-cards></div></div></div><div class="c2-playback"><button type="button" data-c2-play>▶ <span>Spela</span></button><button type="button" class="secondary" data-c2-reset>↺ Börja om</button><label>Hastighet<select data-c2-duration>'+playbackOptions()+'</select></label><label>Kamera<select data-c2-camera><option value="course">Hela banan</option><option value="both" selected>Följ båda</option><option value="leader">Följ ledaren</option></select></label><button type="button" class="secondary c2-mute" data-c2-mute aria-label="Slå av eller på musik" aria-pressed="true">♫</button><label class="c2-volume">Volym<input data-c2-volume type="range" min="0" max="1" step="0.05" value="'+DEFAULT_VOLUME+'" aria-label="Musikvolym"></label><label class="c2-timeline">Tid<input data-c2-time type="range" min="0" max="1" value="0" step="1" aria-label="Gemensam tävlingsklocka"></label></div><div class="c2-audio-note" data-c2-audio-note hidden></div><audio data-c2-audio preload="metadata" loop></audio><div class="c2-elevation-wrap">'+elevationChart(model,participants)+'</div><p class="c2-readout" data-c2-readout></p>':'<div class="c2-geometry-warning"><strong>Gemensam animerad karta visas inte.</strong><span>De valda resultaten saknar samma CourseVersion eller verifierad gemensam banreferens. Segment och sluttid följer fortfarande sina egna jämförbarhetskontrakt.</span></div>')+
      '</section><details class="c2-method"><summary>Metod och datakvalitet</summary><p>Tidsluckor och placeringsskiften bygger endast på verkliga, ej estimerade passager. Segmenttider kräver verifierat segmentkontrakt. Pacing mot fältet använder respektive upplagas egen FINISHED-kohort och minst fem säkra segmentobservationer. Kartpositioner mellan passager är linjärt rekonstruerade längs banreferensen och är inte individuell GPS.</p></details></div>';
    return bind(root,{...options,model});
  }
  function bind(root,options){
    const model=options.model,participants=options.participants||[],models=options.replayModels||[];
    let selectedSegment=0,time=0,playing=false,frame=null,lastFrame=0,lastCamera=0,map=null,markers=[],highlight=null,destroyed=false;
    const maxTime=Math.max(1,...models.map(item=>Number(item.maxTime)||0)),slider=root.querySelector('[data-c2-time]'),clock=root.querySelector('[data-c2-clock]'),clockMax=root.querySelector('[data-c2-clock-max]'),play=root.querySelector('[data-c2-play]'),durationSelect=root.querySelector('[data-c2-duration]'),camera=root.querySelector('[data-c2-camera]'),audio=root.querySelector('[data-c2-audio]'),mute=root.querySelector('[data-c2-mute]'),volumeSlider=root.querySelector('[data-c2-volume]'),audioNote=root.querySelector('[data-c2-audio-note]');
    let musicEnabled=true,audioVolume=DEFAULT_VOLUME,lastAudibleVolume=DEFAULT_VOLUME;
    if(slider){slider.max=String(Math.ceil(maxTime));clockMax.textContent='av '+duration(maxTime)}
    try{
      const storedVolume=Number(localStorage.getItem('ultravasan-music-volume'));
      if(finite(storedVolume)&&storedVolume>=0)audioVolume=clamp(storedVolume,0,1);
      musicEnabled=localStorage.getItem('ultravasan-music-enabled')!=='false';
    }catch{}
    lastAudibleVolume=audioVolume>0?audioVolume:DEFAULT_VOLUME;
    if(volumeSlider)volumeSlider.value=String(audioVolume);
    if(audio){
      const source=media?.musicForRace?.(models[0]?.race)||null;
      if(source)audio.src=source;
      else if(audioNote){audioNote.hidden=false;audioNote.textContent='Musik saknas för loppet. Kartjämförelsen fungerar utan ljud.'}
      audio.volume=audioVolume;
      audio.addEventListener('error',()=>{if(audioNote){audioNote.hidden=false;audioNote.textContent='Musiken kunde inte laddas. Kartjämförelsen fungerar ändå.'}});
    }
    function updateMuteButton(){
      if(!mute)return;
      mute.setAttribute('aria-pressed',String(musicEnabled));
      mute.textContent=musicEnabled?'♫':'♪';
      mute.title=musicEnabled?'Stäng av musik':'Slå på musik';
    }
    function setVolume(value){
      audioVolume=clamp(value,0,1);
      if(audioVolume>0)lastAudibleVolume=audioVolume;
      if(audio)audio.volume=audioVolume;
      if(volumeSlider)volumeSlider.value=String(audioVolume);
      try{localStorage.setItem('ultravasan-music-volume',String(audioVolume))}catch{}
    }
    function playAudio(){
      if(!audio||!audio.src||!musicEnabled)return;
      audio.volume=audioVolume;
      audio.play().catch(()=>{if(audioNote){audioNote.hidden=false;audioNote.textContent='Webbläsaren väntar med musiken. Tryck på Spela igen.'}});
    }
    function pauseAudio(reset=false){
      if(!audio)return;
      audio.pause();
      if(reset)try{audio.currentTime=0}catch{}
    }
    function toggleMute(){
      musicEnabled=!musicEnabled;
      if(musicEnabled&&audioVolume<=0)setVolume(lastAudibleVolume||DEFAULT_VOLUME);
      try{localStorage.setItem('ultravasan-music-enabled',String(musicEnabled))}catch{}
      updateMuteButton();
      if(musicEnabled&&playing)playAudio();else pauseAudio(false);
    }
    updateMuteButton();
    const stateAtTime=(runner,t)=>{
      const distance=replay.distanceAtTime(runner,t),state=replay.stateAt(runner,distance);
      return{distance,state};
    };
    const segmentDistances=index=>{
      const segment=model.segments?.[index],first=models[0];
      if(!segment||!first)return null;
      const from=first.checkpoints.find(cp=>String(cp.key)===String(segment.from)),to=first.checkpoints.find(cp=>String(cp.key)===String(segment.to));
      return from&&to?{from:Number(from.distance),to:Number(to.distance)}:null;
    };
    function updateSegment(index,seek=true){
      const segment=model.segments?.[Number(index)];if(!segment)return;
      selectedSegment=Number(index);root.querySelectorAll('[data-c2-segment]').forEach(node=>node.setAttribute('aria-pressed',String(Number(node.dataset.c2Segment)===selectedSegment)));
      const distances=segmentDistances(selectedSegment),rect=root.querySelector('[data-c2-elev-segment]');
      if(distances&&rect&&models[0]?.elevationProfile?.length){
        const p=replay.elevationProjection(models[0],920);rect.setAttribute('x',p.x(distances.from));rect.setAttribute('width',Math.max(0,p.x(distances.to)-p.x(distances.from)));
      }
      if(map&&distances){
        if(highlight){highlight.remove();highlight=null}
        const points=mapEngine.routeSlice(models[0].route,distances.from,distances.to);
        if(points.length>1)highlight=window.L.polyline(points,{weight:7,opacity:.72}).addTo(map);
      }
      if(seek){
        const checkpoint=model.checkpoints.find(row=>String(row.checkpoint_key)===String(segment.to));
        if(finite(checkpoint?.action_time_seconds))setTime(checkpoint.action_time_seconds,true);
      }
    }
    function updateElevation(states){
      if(!models[0]?.elevationProfile?.length)return;
      const p=replay.elevationProjection(models[0],920);
      states.forEach((item,index)=>{
        const line=root.querySelector('[data-c2-elev-marker="'+index+'"]'),dot=root.querySelector('[data-c2-elev-dot="'+index+'"]'),elevation=replay.elevationAtDistance(models[0].elevationProfile,item.distance);
        if(line){line.setAttribute('x1',p.x(item.distance));line.setAttribute('x2',p.x(item.distance))}
        if(dot){dot.setAttribute('cx',p.x(item.distance));dot.setAttribute('cy',p.y(finite(elevation)?Number(elevation):models[0].elevationProfile[0][1]))}
      });
    }
    function updateCamera(states){
      if(!map||!window.L)return;
      if(camera?.value==='course')return;
      if(camera?.value==='leader'){
        const leader=states.slice().sort((a,b)=>b.distance-a.distance)[0];if(leader?.state.coordinate)map.panTo(leader.state.coordinate,{animate:false});
      }else{
        const coords=states.map(item=>item.state.coordinate).filter(Boolean);if(coords.length>1)map.fitBounds(window.L.latLngBounds(coords).pad(.8),{animate:false,maxZoom:14});
      }
    }
    function setTime(value,forceCamera=false){
      time=clamp(value,0,maxTime);if(slider)slider.value=String(Math.round(time));if(clock)clock.textContent=duration(time);
      const states=models.map((runner,index)=>({...stateAtTime(runner,time),index}));
      markers.forEach((marker,index)=>{const coord=states[index]?.state.coordinate;if(coord)marker.setLatLng(coord)});
      updateElevation(states);
      const now=typeof performance!=='undefined'?performance.now():Date.now();
      if(forceCamera||(playing&&camera?.value!=='course'&&now-lastCamera>650)){lastCamera=now;updateCamera(states)}
      const sorted=states.slice().sort((a,b)=>b.distance-a.distance),leader=sorted[0],gap=states[0]&&states[1]?states[0].distance-states[1].distance:0;
      const cards=root.querySelector('[data-c2-live-cards]');
      if(cards)cards.innerHTML=states.map((item,index)=>{const last=latestAnchor(models[index],time),status=item.state.finished?'Mål':last?.name||'Start';return'<article style="--runner:'+COLORS[index]+'"><i></i><span><strong>'+esc(resultLabel(participants,index))+'</strong><small>'+esc(status)+'</small></span><b>'+item.distance.toLocaleString('sv-SE',{maximumFractionDigits:1})+' km</b></article>'}).join('');
      const readout=root.querySelector('[data-c2-readout]');
      if(readout)readout.innerHTML='<strong>'+duration(time)+'</strong> · '+esc(resultLabel(participants,0))+' '+states[0].distance.toLocaleString('sv-SE',{maximumFractionDigits:1})+' km · '+esc(resultLabel(participants,1))+' '+states[1].distance.toLocaleString('sv-SE',{maximumFractionDigits:1})+' km · positionsskillnad '+(gap>=0?'+':'')+gap.toLocaleString('sv-SE',{maximumFractionDigits:1})+' km. <span>Mellan officiella passager är positionerna rekonstruerade.</span>';
    }
    function stop(pauseMusic=true){playing=false;if(frame)cancelAnimationFrame(frame);frame=null;if(play)play.innerHTML=time>=maxTime?'▶ <span>Spela igen</span>':'▶ <span>Spela</span>';if(pauseMusic)pauseAudio(false)}
    function tick(now){
      if(!playing||destroyed)return;
      const delta=Math.min(.12,(now-lastFrame)/1000);lastFrame=now;
      const rate=playback?.rateFor?playback.rateFor(maxTime,durationSelect?.value||playback.DEFAULT_MODE):maxTime/DEFAULT_PLAYBACK_SECONDS,next=time+rate*delta;
      setTime(Math.min(maxTime,next),false);
      if(time>=maxTime)stop();else frame=requestAnimationFrame(tick);
    }
    function toggle(){
      if(playing){stop();return}
      if(time>=maxTime-.5)setTime(0,true);
      playing=true;if(play)play.innerHTML='❚❚ <span>Pausa</span>';playAudio();lastFrame=performance.now();frame=requestAnimationFrame(tick);
    }
    async function mountMap(){
      const host=root.querySelector('[data-c2-map]');if(!host||!models[0]?.route?.points?.length)return;
      const ok=await mapEngine.ensureLeaflet({onStatus:text=>{const fallback=host.querySelector('.c2-map-fallback');if(fallback)fallback.textContent=text}});
      if(destroyed||!ok||!window.L)return;
      host.innerHTML='';map=window.L.map(host,{zoomControl:true,attributionControl:true,preferCanvas:true});
      map.attributionControl?.setPrefix(false);
      const route=models[0].route.points.map(point=>[Number(point[0]),Number(point[1])]);
      try{window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map)}catch{}
      window.L.polyline(route,{weight:5,opacity:.72}).addTo(map);map.fitBounds(window.L.latLngBounds(route).pad(.08));
      markers=models.map((runner,index)=>window.L.circleMarker(route[0],{radius:9,weight:3,fillOpacity:.95,color:'#fff',fillColor:COLORS[index]}).bindTooltip(resultLabel(participants,index),{permanent:false}).addTo(map));
      updateSegment(selectedSegment,false);setTime(time,false);
    }
    root.querySelectorAll('[data-c2-segment]').forEach(node=>node.addEventListener('click',()=>updateSegment(node.dataset.c2Segment,true)));
    root.querySelectorAll('[data-c2-checkpoint]').forEach(node=>{
      const activate=()=>{if(finite(node.dataset.c2Time))setTime(node.dataset.c2Time,true)};
      node.addEventListener('click',activate);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate()}});
    });
    if(slider)slider.addEventListener('input',event=>{stop();setTime(event.target.value,true)});
    if(play)play.addEventListener('click',toggle);
    mute?.addEventListener('click',toggleMute);
    volumeSlider?.addEventListener('input',event=>setVolume(event.target.value));
    root.querySelector('[data-c2-reset]')?.addEventListener('click',()=>{stop();if(durationSelect)durationSelect.value=(playback?.DEFAULT_MODE||DEFAULT_PLAYBACK_SECONDS+'s');if(camera)camera.value='both';setVolume(DEFAULT_VOLUME);pauseAudio(true);setTime(0,true)});
    camera?.addEventListener('change',()=>{const states=models.map((runner,index)=>({...stateAtTime(runner,time),index}));if(camera.value==='course'&&map)map.fitBounds(window.L.latLngBounds(models[0].route.points.map(point=>[point[0],point[1]])).pad(.08));else updateCamera(states)});
    const elevationHit=root.querySelector('[data-c2-elev-hit]');
    if(elevationHit&&models[0]?.elevationProfile?.length){
      const seek=event=>{const svg=elevationHit.ownerSVGElement,rect=svg.getBoundingClientRect(),p=replay.elevationProjection(models[0],920),logicalX=(event.clientX-rect.left)*p.width/(rect.width||1),distance=clamp((logicalX-p.pad.l)/(p.width-p.pad.l-p.pad.r)*models[0].totalDistance,0,models[0].maxDistance);stop();setTime(replay.timeAtDistance(models[0],distance),true)};
      elevationHit.addEventListener('pointerdown',seek);
      elevationHit.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const step=maxTime/40,next=event.key==='Home'?0:event.key==='End'?maxTime:time+(event.key==='ArrowRight'?step:-step);stop();setTime(next,true)});
    }
    root.querySelector('[data-c2-map-duel]')?.addEventListener('click',()=>options.onOpenMapDuel?.());
    root.querySelector('[data-c2-share]')?.addEventListener('click',async()=>{
      const feedback=root.querySelector('[data-c2-feedback]'),url=options.shareUrl?.()||location.href;
      try{await navigator.clipboard.writeText(url);if(feedback)feedback.textContent='Länk kopierad'}catch{if(feedback)feedback.textContent='Kopiera adressen i webbläsaren för att dela jämförelsen.'}
    });
    if(models.length===2){setTime(0,false);updateSegment(0,false);mountMap()}
    return{destroy(){destroyed=true;stop();pauseAudio(true);if(highlight)highlight.remove();if(map)map.remove();map=null;markers=[]},setTime,selectSegment:updateSegment,getTime:()=>time,getSelectedSegment:()=>selectedSegment};
  }
  function mount(root,options){
    if(!root)return null;
    return render(root,options||{});
  }
  return Object.freeze({COLORS,duration,signedDuration,pace,percent,createViewModel,mount});
});