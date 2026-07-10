'use strict';
/* Advanced cross-year analytics. Works entirely in the browser on exported data. */
const nerd={ready:false,hall:'veterans',historyResultIds:[]};
const n$=s=>document.querySelector(s), n$$=s=>[...document.querySelectorAll(s)];
const nEsc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const nMedian=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2};
const nQuantile=(a,q)=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),p=(b.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return b[l]+(b[h]-b[l])*(p-l)};
const nTime=s=>typeof fmtTime==='function'?fmtTime(s):(s==null?'–':new Date(s*1000).toISOString().slice(11,19));
const activeRace=()=>state.data.races.find(r=>r.id===state.raceId);
const splitMap=id=>new Map(state.data.splits.filter(s=>s.result_id===id).map(s=>[s.sequence_no,s]));
const resultNameKey=r=>String(r.canonical_name||r.name_as_published||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();

function initNerdLab(){
  if(nerd.ready||!window.ULTRAVASAN_DATA||typeof state==='undefined'||!state.data)return;
  nerd.ready=true;
  const selects=['segmentFrom','segmentTo','segmentMetric'];selects.forEach(id=>n$('#'+id)?.addEventListener('change',renderSegmentLab));
  n$('#historySearch')?.addEventListener('input',renderHistorySuggestions);
  document.addEventListener('click',e=>{if(!e.target.closest('.history-lab')){const b=n$('#historySuggestions');if(b)b.hidden=true}});
  n$$('#hallTabs button').forEach(b=>b.onclick=()=>{nerd.hall=b.dataset.hall;n$$('#hallTabs button').forEach(x=>x.classList.toggle('active',x===b));renderHall()});
  populateSegmentSelectors();renderNerdLab();
}

function populateSegmentSelectors(){
  const cps=state.data.checkpoints.filter(c=>c.race_id===state.raceId).sort((a,b)=>a.sequence_no-b.sequence_no);
  const from=n$('#segmentFrom'),to=n$('#segmentTo');if(!from||!to)return;
  from.innerHTML=cps.slice(0,-1).map(c=>`<option value="${c.sequence_no}">${nEsc(c.name)}</option>`).join('');
  to.innerHTML=cps.slice(1).map(c=>`<option value="${c.sequence_no}">${nEsc(c.name)}</option>`).join('');
  from.value=String(cps.find(c=>c.checkpoint_key==='evertsberg')?.sequence_no??0);to.value=String(cps.at(-1)?.sequence_no??1);
}

function renderNerdLab(){
  if(!nerd.ready)return;populateSegmentSelectorsPreserve();renderCoverage();renderStories();renderSegmentLab();renderPercentiles();renderFieldFlow();renderHall();renderFingerprint();
}
function populateSegmentSelectorsPreserve(){
  const from=n$('#segmentFrom'),to=n$('#segmentTo');if(!from||!to)return;const old=[from.value,to.value],oldRace=from.dataset.race;
  if(oldRace===String(state.raceId))return;populateSegmentSelectors();from.dataset.race=String(state.raceId);
}
function renderCoverage(){
  const years=new Set(state.data.races.filter(r=>state.data.results.some(x=>x.race_id===r.id)).map(r=>r.year));
  const resultIds=new Set(state.data.splits.map(s=>s.result_id)),coverage=state.data.results.length?resultIds.size/state.data.results.length:0;
  const el=n$('#intelligenceCoverage');if(el)el.textContent=`${years.size} loppår · ${state.data.results.length.toLocaleString('sv-SE')} resultat · ${Math.round(coverage*100)} % med passager`;
}
function renderStories(){
  const el=n$('#raceStories');if(!el)return;const rows=state.filtered.filter(r=>r.finish_seconds).sort((a,b)=>a.finish_seconds-b.finish_seconds),splits=activeSplits();
  if(!rows.length){el.innerHTML='<div class="empty">Inget underlag för berättelser</div>';return}
  const winner=rows[0],last=rows.at(-1),med=nMedian(rows.map(r=>r.finish_seconds));
  const byResult=new Map();splits.filter(s=>s.place_overall).forEach(s=>{if(!byResult.has(s.result_id))byResult.set(s.result_id,[]);byResult.get(s.result_id).push(s)});
  let charger=null;byResult.forEach((a,id)=>{a.sort((x,y)=>x.sequence_no-y.sequence_no);if(a.length<2)return;const gain=a[0].place_overall-a.at(-1).place_overall;if(!charger||gain>charger.gain)charger={gain,r:state.data.results.find(x=>x.id===id)}});
  const paceGroups=new Map();splits.filter(s=>s.pace_seconds_per_km).forEach(s=>{if(!paceGroups.has(s.sequence_no))paceGroups.set(s.sequence_no,{name:s.checkpoint_name,v:[]});paceGroups.get(s.sequence_no).v.push(s.pace_seconds_per_km)});
  const tough=[...paceGroups.values()].map(g=>({...g,med:nMedian(g.v)})).sort((a,b)=>b.med-a.med)[0];
  const items=[
    ['🏆','Segrare',winner.name_as_published,`${nTime(winner.finish_seconds)} · plats ${winner.overall_place??1}`],
    ['⏱️','Fältets mitt',nTime(med),`${rows.length} fullföljande i urvalet`],
    ['🚀','Dagens avancemang',charger?.r?.name_as_published||'Inväntar placeringar',charger?`+${charger.gain} platser`:'Mellantider krävs'],
    ['🔥','Tuffaste segment',tough?.name?.replace('Mora mål','Mora')||'Inväntar mellantider',tough?`${Math.floor(tough.med/60)}:${String(Math.round(tough.med%60)).padStart(2,'0')} min/km median`:''],
    ['🌙','Längsta resa',last.name_as_published,nTime(last.finish_seconds)]
  ];
  el.innerHTML=items.map(([icon,label,title,sub])=>`<article class="story-card"><span>${icon}</span><div><small>${nEsc(label)}</small><strong>${nEsc(title)}</strong><em>${nEsc(sub)}</em></div></article>`).join('');
}
function segmentRows(){
  const from=Number(n$('#segmentFrom')?.value),to=Number(n$('#segmentTo')?.value);if(!(to>from))return [];
  return state.filtered.map(r=>{const m=splitMap(r.id),a=from===0?{elapsed_seconds:0,place_overall:null,distance_km:0}:m.get(from),b=m.get(to);if(!a||!b||!Number.isFinite(a.elapsed_seconds)||!Number.isFinite(b.elapsed_seconds))return null;const seconds=b.elapsed_seconds-a.elapsed_seconds,km=(b.distance_km??0)-(a.distance_km??0),gain=(a.place_overall&&b.place_overall)?a.place_overall-b.place_overall:null;return{r,seconds,km,speed:km>0?km/(seconds/3600):null,gain,from:a,to:b}}).filter(Boolean);
}
function renderSegmentLab(){
  const podium=n$('#segmentPodium'),list=n$('#segmentRanking');if(!podium||!list)return;const metric=n$('#segmentMetric')?.value||'time',rows=segmentRows();
  rows.sort((a,b)=>metric==='gain'?(b.gain??-9999)-(a.gain??-9999):metric==='speed'?(b.speed??-1)-(a.speed??-1):a.seconds-b.seconds);
  if(!rows.length){podium.innerHTML='';list.innerHTML='<div class="empty">Välj två kontroller med tillgängliga passager.</div>';return}
  const val=x=>metric==='gain'?(x.gain==null?'–':`${x.gain>0?'+':''}${x.gain} pl`):metric==='speed'?(x.speed?`${x.speed.toFixed(1)} km/h`:'–'):nTime(x.seconds);
  const top=rows.slice(0,3),order=[top[1],top[0],top[2]].filter(Boolean);podium.innerHTML=order.map((x,i)=>`<div class="podium-place p${i===1?1:i===0?2:3}"><b>${i===1?'1':i===0?'2':'3'}</b><span>${nEsc(x.r.name_as_published)}</span><strong>${val(x)}</strong></div>`).join('');
  list.innerHTML=rows.slice(0,12).map((x,i)=>`<button class="segment-row" data-id="${x.r.id}"><b>${i+1}</b><span><strong>${nEsc(x.r.name_as_published)}</strong><small>${nEsc(x.r.age_class||'')} ${x.r.club?'· '+nEsc(x.r.club):''}</small></span><em>${val(x)}</em></button>`).join('');
  n$$('.segment-row').forEach(b=>b.onclick=()=>openRunner(Number(b.dataset.id)));
}
function renderPercentiles(){
  const el=n$('#percentileLadder');if(!el)return;const times=state.filtered.map(r=>r.finish_seconds).filter(Number.isFinite);if(times.length<2){el.innerHTML='<div class="empty">Fler sluttider krävs</div>';return}
  const levels=[[1,.01,'Elit'],[5,.05,'Topp 5 %'],[10,.10,'Topp 10 %'],[25,.25,'Övre kvartilen'],[50,.50,'Median'],[75,.75,'Tre fjärdedelar']];
  el.innerHTML=levels.map(([p,q,label],i)=>`<div class="percentile-step" style="--w:${100-p*.72}%"><span>${label}</span><strong>${nTime(nQuantile(times,q))}</strong><em>${Math.max(1,Math.round(times.length*q))} av ${times.length}</em></div>`).join('');
}
function renderFieldFlow(){
  const el=n$('#fieldFlow');if(!el)return;const rows=state.filtered,ids=new Set(rows.map(r=>r.id)),cps=state.data.checkpoints.filter(c=>c.race_id===state.raceId).sort((a,b)=>a.sequence_no-b.sequence_no),by=new Map();
  state.data.splits.filter(s=>ids.has(s.result_id)).forEach(s=>{if(!by.has(s.sequence_no))by.set(s.sequence_no,new Set());by.get(s.sequence_no).add(s.result_id)});
  const coverage=new Set(state.data.splits.filter(s=>ids.has(s.result_id)).map(s=>s.result_id)).size/(rows.length||1);if(coverage<.3){el.innerHTML='<div class="empty">Flödet tänds när historiska mellantider är importerade.</div>';return}
  const stages=cps.map((c,i)=>({name:i===0?'Start':c.name.replace('Mora mål','Mål'),n:i===0?rows.length:(by.get(c.sequence_no)?.size||0)})),max=rows.length||1;
  el.innerHTML=stages.map((s,i)=>{const prev=i?stages[i-1].n:s.n,loss=Math.max(0,prev-s.n);return `<div class="flow-stage"><div class="flow-node" style="--size:${Math.max(14,Math.sqrt(s.n/max)*100)}%"><strong>${s.n}</strong><span>${nEsc(s.name)}</span></div>${i<stages.length-1?`<i></i>`:''}${loss?`<em>−${loss}</em>`:''}</div>`}).join('');
}
function allHistories(){
  const groups=new Map();state.data.results.forEach(r=>{const k=resultNameKey(r);if(!k)return;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)});return [...groups.entries()].map(([key,rows])=>({key,rows:rows.sort((a,b)=>(state.data.races.find(x=>x.id===a.race_id)?.year||0)-(state.data.races.find(x=>x.id===b.race_id)?.year||0))}));
}
function renderHall(){
  const el=n$('#hallOfFame');if(!el)return;const histories=allHistories();let rows=[];
  if(nerd.hall==='veterans')rows=histories.filter(x=>x.rows.length>1).map(x=>({...x,score:x.rows.length,label:`${x.rows.length} lopp`})).sort((a,b)=>b.score-a.score);
  if(nerd.hall==='improved')rows=histories.filter(x=>x.rows.filter(r=>r.finish_seconds).length>1).map(x=>{const f=x.rows.filter(r=>r.finish_seconds),delta=f[0].finish_seconds-f.at(-1).finish_seconds;return{...x,score:delta,label:delta>0?`${Math.round(delta/60)} min snabbare`:`${Math.round(-delta/60)} min långsammare`}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(nerd.hall==='consistent')rows=histories.filter(x=>x.rows.filter(r=>r.finish_seconds).length>2).map(x=>{const t=x.rows.filter(r=>r.finish_seconds).map(r=>r.finish_seconds),range=Math.max(...t)-Math.min(...t);return{...x,score:-range,label:`spridning ${Math.round(range/60)} min`}}).sort((a,b)=>b.score-a.score);
  if(nerd.hall==='chargers'){const ids=new Set(state.data.results.map(r=>r.id));rows=state.data.results.map(r=>{const a=[...splitMap(r.id).values()].filter(s=>s.place_overall).sort((x,y)=>x.sequence_no-y.sequence_no);return a.length>1?{rows:[r],score:a[0].place_overall-a.at(-1).place_overall,label:`+${a[0].place_overall-a.at(-1).place_overall} platser`}:null}).filter(x=>x&&x.score>0).sort((a,b)=>b.score-a.score)}
  el.innerHTML=rows.length?rows.slice(0,10).map((x,i)=>{const r=x.rows.at(-1),years=x.rows.map(a=>state.data.races.find(q=>q.id===a.race_id)?.year).filter(Boolean);return `<button class="hall-row" data-id="${r.id}"><b>${i+1}</b><span><strong>${nEsc(r.name_as_published)}</strong><small>${years.length>1?`${Math.min(...years)}–${Math.max(...years)}`:years[0]||''}</small></span><em>${nEsc(x.label)}</em></button>`}).join(''):'<div class="empty">Den här utmärkelsen kräver fler år eller mellantider.</div>';
  n$$('.hall-row').forEach(b=>b.onclick=()=>openRunner(Number(b.dataset.id)));
}
function renderFingerprint(){
  const el=n$('#raceFingerprint');if(!el)return;const race=activeRace(),current=state.filtered.filter(r=>r.finish_seconds),all=state.data.results.filter(r=>r.finish_seconds),raceMed=nMedian(current.map(r=>r.finish_seconds)),histMed=nMedian(all.map(r=>r.finish_seconds));
  if(!raceMed||!histMed){el.innerHTML='<div class="empty">Historik behövs för index</div>';return}
  const splitIds=new Set(current.map(r=>r.id)),pace=state.data.splits.filter(s=>splitIds.has(s.result_id)&&s.pace_seconds_per_km).map(s=>s.pace_seconds_per_km),allPace=state.data.splits.filter(s=>s.pace_seconds_per_km).map(s=>s.pace_seconds_per_km);
  const dnf=(state.filtered.length-current.length)/(state.filtered.length||1),allDnf=(state.data.results.length-all.length)/(state.data.results.length||1),women=state.filtered.filter(r=>r.sex==='F').length/(state.filtered.length||1),allWomen=state.data.results.filter(r=>r.sex==='F').length/(state.data.results.length||1);
  const metrics=[['Svårighetsgrad',raceMed/histMed*100],['Fartnivå',allPace.length&&pace.length?nMedian(allPace)/nMedian(pace)*100:100],['DNF-belastning',allDnf?dnf/allDnf*100:100],['Kvinnorepresentation',allWomen?women/allWomen*100:100],['Fältstorlek',state.filtered.length/(state.data.results.length/state.data.races.length||1)*100]];
  el.innerHTML=metrics.map(([name,v])=>`<div class="finger-row"><span>${nEsc(name)}</span><div><i style="width:${Math.max(4,Math.min(100,v/1.6))}%"></i><b style="left:${Math.max(4,Math.min(96,v/1.6))}%"></b></div><strong>${Math.round(v)}</strong></div>`).join('')+`<p class="microcopy">${race.year}: över 100 betyder mer av egenskapen än genomsnittet i importerad historik.</p>`;
}
function renderHistorySuggestions(){
  const input=n$('#historySearch'),box=n$('#historySuggestions');if(!input||!box)return;const q=input.value.trim().toLowerCase();if(q.length<2){box.hidden=true;return}
  const groups=allHistories().filter(g=>{const r=g.rows[0];return `${r.name_as_published} ${g.rows.map(x=>x.bib||'').join(' ')}`.toLowerCase().includes(q)}).sort((a,b)=>b.rows.length-a.rows.length).slice(0,10);
  box.innerHTML=groups.length?groups.map((g,i)=>{const r=g.rows.at(-1),years=g.rows.map(x=>state.data.races.find(y=>y.id===x.race_id)?.year).filter(Boolean);return `<button data-key="${nEsc(g.key)}"><strong>${nEsc(r.name_as_published)}</strong><small>${g.rows.length} lopp · ${years.join(', ')}</small></button>`}).join(''):'<div class="empty">Ingen löpare hittades</div>';box.hidden=false;
  n$$('#historySuggestions button').forEach(b=>b.onclick=()=>{const g=allHistories().find(x=>x.key===b.dataset.key);if(g){input.value=g.rows.at(-1).name_as_published;box.hidden=true;renderRunnerHistory(g)}});
}
function renderRunnerHistory(g){
  const el=n$('#runnerHistory');if(!el)return;const rows=g.rows,finish=rows.filter(r=>r.finish_seconds),best=finish.slice().sort((a,b)=>a.finish_seconds-b.finish_seconds)[0];
  const timeline=rows.map(r=>{const race=state.data.races.find(x=>x.id===r.race_id);return `<button class="history-year ${r.id===best?.id?'best':''}" data-id="${r.id}"><b>${race?.year||'–'}</b><strong>${nTime(r.finish_seconds)}</strong><span>plats ${r.overall_place??'–'} · ${nEsc(r.age_class||'')}</span></button>`}).join('');
  const improvement=finish.length>1?finish[0].finish_seconds-finish.at(-1).finish_seconds:null;
  el.innerHTML=`<div class="history-head"><div><span>${rows.length} starter</span><strong>${nEsc(rows.at(-1).name_as_published)}</strong></div><div><span>Bästa tid</span><strong>${nTime(best?.finish_seconds)}</strong></div><div><span>Utveckling</span><strong>${improvement==null?'–':`${improvement>=0?'−':'+'}${Math.abs(Math.round(improvement/60))} min`}</strong></div></div><div class="history-timeline">${timeline}</div><button id="historyMap" class="compare-map-button">Spela upp åren på karta →</button>`;
  n$$('.history-year').forEach(b=>b.onclick=()=>openRunner(Number(b.dataset.id)));n$('#historyMap').onclick=()=>window.openUltravasanMap?window.openUltravasanMap(rows.slice(-5)):window.open(`karta.html?runners=${rows.slice(-5).map(r=>r.id).join(',')}`,'_blank');
}

const nerdTimer=setInterval(()=>{try{initNerdLab();if(nerd.ready)clearInterval(nerdTimer)}catch(e){console.error('NerdLab',e);clearInterval(nerdTimer)}},60);
