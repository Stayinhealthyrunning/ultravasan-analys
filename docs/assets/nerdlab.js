'use strict';
/* Advanced cross-year analytics. Works entirely in the browser on exported data. */
const nerd={ready:false,hall:'veterans',historyResultIds:[],hallMap:null,hallTile:null};
const n$=s=>document.querySelector(s), n$$=s=>[...document.querySelectorAll(s)];
const nEsc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const nMedian=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2};
const nQuantile=(a,q)=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),p=(b.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return b[l]+(b[h]-b[l])*(p-l)};
const nTime=s=>typeof fmtTime==='function'?fmtTime(s):(s==null?'–':new Date(s*1000).toISOString().slice(11,19));
const nSpeed=s=>globalThis.SpeedUnits?.formatSpeed?.(s,globalThis.SpeedUnits.get())??(Number.isFinite(Number(s))?`${Number(s).toFixed(1)} km/h`:'–');
const nClassInfo=v=>{let s=String(v||'').trim().toUpperCase().replace(/\s+/g,'');if(/^H\d/.test(s))s='M'+s.slice(1);if(/^D\d/.test(s)||/^K\d/.test(s))s='W'+s.slice(1);const sex=s.startsWith('W')?0:s.startsWith('M')?1:2,m=s.match(/(\d{1,3})/),age=m?Number(m[1]):999,tail=s.replace(/^[A-Z]?\d{1,3}/,'');return{s,sex,age,tail}};
const nCompareClasses=(a,b)=>{const A=nClassInfo(a),B=nClassInfo(b);return A.sex-B.sex||A.age-B.age||A.tail.localeCompare(B.tail,'sv')||A.s.localeCompare(B.s,'sv')};
function segmentClassOptions(rows){return [...new Set((rows||[]).map(r=>String(r?.age_class||'').trim()).filter(Boolean))].sort(nCompareClasses)}
function filterRowsBySegmentClass(rows,selectedClass){const selected=String(selectedClass||'').trim();return selected?(rows||[]).filter(r=>String(r?.age_class||'')===selected):[...(rows||[])]}
const activeRace=()=>state.data.races.find(r=>r.id===state.raceId);
const splitMap=id=>new Map(state.data.splits.filter(s=>s.result_id===id).map(s=>[s.sequence_no,s]));
const nSex=r=>{const x=String(r?.sex||'').toUpperCase();return ['F','W','K','D'].includes(x)?'F':['M','H'].includes(x)?'M':'U'};
const nResultStatus=r=>globalThis.ResultStatus.classify(r,{hasSplit:state.data?.splitEvidence?.has(r?.id)});
const nIsStarter=r=>nResultStatus(r).started;
const nIsFinished=r=>nResultStatus(r).finished;
const nIsDnf=r=>nResultStatus(r).dnf;
const nIsDns=r=>nResultStatus(r).dns;

function athleteIdentityKey(r){
  for(const [field,prefix] of [['athlete_id','athlete'],['person_id','person'],['canonical_athlete_key','canonical']]){
    const value=r?.[field];if(value!==null&&value!==undefined&&String(value).trim()!=='')return `${prefix}:${value}`;
  }
  // Never infer identity from a name. Without a stable person key, keep results separate.
  if(r?.id!==null&&r?.id!==undefined)return `result:${r.id}`;
  if(r?.source_result_id)return `result:${r.race_id??'race'}:${r.source_code??'source'}:${r.source_result_id}`;
  if(r?.bib)return `result:${r.race_id??'race'}:bib:${r.bib}`;
  return null;
}
function groupAthleteHistories(results,races=[]){
  const years=new Map((races||[]).map(r=>[r.id,Number(r.year)||0])),groups=new Map();
  (results||[]).forEach((r,index)=>{const key=athleteIdentityKey(r)||`result-index:${index}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)});
  return [...groups.entries()].map(([key,rows])=>({key,rows:rows.sort((a,b)=>(years.get(a.race_id)||0)-(years.get(b.race_id)||0)||(Number(a.id)||0)-(Number(b.id)||0))}));
}

function initNerdLab(){
  if(nerd.ready||!window.ULTRAVASAN_DATA||typeof state==='undefined'||!state.data)return;
  nerd.ready=true;
  const selects=['segmentFrom','segmentTo','segmentClass','segmentMetric'];selects.forEach(id=>n$('#'+id)?.addEventListener('change',renderSegmentLab));
  n$('#historySearch')?.addEventListener('input',renderHistorySuggestions);
  document.addEventListener('click',e=>{if(!e.target.closest('.history-lab')){const b=n$('#historySuggestions');if(b)b.hidden=true}});
  n$$('#hallTabs button').forEach(b=>b.onclick=()=>{nerd.hall=b.dataset.hall;n$$('#hallTabs button').forEach(x=>x.classList.toggle('active',x===b));renderHall()});
  const hallDialog=n$('#hallMapDialog');hallDialog?.querySelector('.dialog-close')?.addEventListener('click',()=>hallDialog.close());
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
  if(!nerd.ready)return;populateSegmentSelectorsPreserve();populateSegmentClassFilter();renderCoverage();renderStories();renderSegmentLab();renderPercentiles();renderFieldFlow();renderHall();renderFingerprint();
}
function populateSegmentSelectorsPreserve(){
  const from=n$('#segmentFrom'),to=n$('#segmentTo');if(!from||!to)return;const old=[from.value,to.value],oldRace=from.dataset.race;
  if(oldRace===String(state.raceId))return;populateSegmentSelectors();from.dataset.race=String(state.raceId);
}
function populateSegmentClassFilter(){
  const select=n$('#segmentClass');if(!select)return;const old=select.value,classes=segmentClassOptions(state.filtered);select.innerHTML='<option value="">Alla klasser</option>'+classes.map(cls=>`<option value="${nEsc(cls)}">${nEsc(cls)}</option>`).join('');select.value=classes.includes(old)?old:'';
}
function renderCoverage(){
  const fr=familyRaces(),results=familyResults(),years=new Set(fr.filter(r=>results.some(x=>x.race_id===r.id)).map(r=>r.year));
  const ids=new Set(results.map(r=>r.id)),resultIds=new Set(state.data.splits.filter(s=>ids.has(s.result_id)).map(s=>s.result_id)),coverage=results.length?resultIds.size/results.length:0;
  const el=n$('#intelligenceCoverage');if(el)el.textContent=`${years.size} loppår · ${results.length.toLocaleString('sv-SE')} resultat · ${Math.round(coverage*100)} % med passager`;
}
function renderStories(){
  const el=n$('#raceStories');if(!el)return;const rows=state.filtered.filter(nIsFinished).sort((a,b)=>a.finish_seconds-b.finish_seconds),splits=activeSplits();
  if(!rows.length){el.innerHTML='<div class="empty">Inget underlag för berättelser</div>';return}
  const winner=rows[0],last=rows.at(-1),med=nMedian(rows.map(r=>r.finish_seconds));
  const byResult=new Map();splits.filter(s=>s.place_overall).forEach(s=>{if(!byResult.has(s.result_id))byResult.set(s.result_id,[]);byResult.get(s.result_id).push(s)});
  let charger=null;byResult.forEach((a,id)=>{a.sort((x,y)=>x.sequence_no-y.sequence_no);if(a.length<2)return;const gain=a[0].place_overall-a.at(-1).place_overall;if(!charger||gain>charger.gain)charger={gain,r:state.data.results.find(x=>x.id===id)}});
  const paceGroups=new Map();splits.filter(s=>s.pace_seconds_per_km).forEach(s=>{if(!paceGroups.has(s.sequence_no))paceGroups.set(s.sequence_no,{name:s.checkpoint_name,v:[]});paceGroups.get(s.sequence_no).v.push(s.pace_seconds_per_km)});
  const tough=[...paceGroups.values()].map(g=>({...g,med:nMedian(g.v)})).sort((a,b)=>b.med-a.med)[0];
  const items=[
    ['🏆','Segrare',winner.name_as_published,`${nTime(winner.finish_seconds)} · plats ${winner.overall_place??1}`],
    ['⏱️','Fältets mitt',nTime(med),`${rows.length} fullföljande i urvalet`],
    ['🚀','Dagens avancemang',charger?.r?.name_as_published||'Placeringar saknas',charger?`+${charger.gain} platser`:'Saknas i underlaget'],
    ['🔥','Tuffaste segment',tough?.name?.replace('Mora mål','Mora')||'Mellantider saknas',tough?(globalThis.SpeedUnits?.formatPace?.(tough.med,globalThis.SpeedUnits.get())||`${Math.floor(tough.med/60)}:${String(Math.round(tough.med%60)).padStart(2,'0')} min/km`)+' median':''],
    ['🌙','Längsta resa',last.name_as_published,nTime(last.finish_seconds)]
  ];
  el.innerHTML=items.map(([icon,label,title,sub])=>`<article class="story-card"><span>${icon}</span><div><small>${nEsc(label)}</small><strong>${nEsc(title)}</strong><em>${nEsc(sub)}</em></div></article>`).join('');
}
function segmentRows(){
  const from=Number(n$('#segmentFrom')?.value),to=Number(n$('#segmentTo')?.value),selectedClass=n$('#segmentClass')?.value||'';if(!(to>from))return [];
  return filterRowsBySegmentClass(state.filtered,selectedClass).map(r=>{const m=splitMap(r.id),a=from===0?{elapsed_seconds:0,place_overall:null,distance_km:0}:m.get(from),b=m.get(to);if(!a||!b||!Number.isFinite(a.elapsed_seconds)||!Number.isFinite(b.elapsed_seconds))return null;const seconds=b.elapsed_seconds-a.elapsed_seconds,km=(b.distance_km??0)-(a.distance_km??0),gain=(a.place_overall&&b.place_overall)?a.place_overall-b.place_overall:null;return{r,seconds,km,speed:km>0?km/(seconds/3600):null,gain,from:a,to:b}}).filter(Boolean);
}
function renderSegmentLab(){
  const podium=n$('#segmentPodium'),list=n$('#segmentRanking');if(!podium||!list)return;const metric=n$('#segmentMetric')?.value||'time',rows=segmentRows();
  rows.sort((a,b)=>metric==='gain'?(b.gain??-9999)-(a.gain??-9999):metric==='speed'?(b.speed??-1)-(a.speed??-1):a.seconds-b.seconds);
  if(!rows.length){podium.innerHTML='';list.innerHTML='<div class="empty">Välj två kontroller med tillgängliga passager.</div>';return}
  const val=x=>metric==='gain'?(x.gain==null?'–':`${x.gain>0?'+':''}${x.gain} pl`):metric==='speed'?nSpeed(x.speed):nTime(x.seconds);
  const top=rows.slice(0,3),order=[top[1],top[0],top[2]].filter(Boolean);podium.innerHTML=order.map((x,i)=>`<div class="podium-place p${i===1?1:i===0?2:3}"><b>${i===1?'1':i===0?'2':'3'}</b><span>${nEsc(x.r.name_as_published)}</span><strong>${val(x)}</strong></div>`).join('');
  list.innerHTML=rows.slice(0,12).map((x,i)=>`<button class="segment-row" data-id="${x.r.id}"><b>${i+1}</b><span><strong>${nEsc(x.r.name_as_published)}</strong><small>${nEsc(x.r.age_class||'')} ${x.r.club?'· '+nEsc(x.r.club):''}</small></span><em>${val(x)}</em></button>`).join('');
  n$$('.segment-row').forEach(b=>b.onclick=()=>openRunner(Number(b.dataset.id)));
}
function renderPercentiles(){
  const el=n$('#percentileLadder');if(!el)return;const rows=state.filtered.filter(nIsFinished),men=rows.filter(r=>nSex(r)==='M').map(r=>Number(r.finish_seconds)),women=rows.filter(r=>nSex(r)==='F').map(r=>Number(r.finish_seconds));
  if(men.length<2&&women.length<2){el.innerHTML='<div class="empty">Fler sluttider krävs</div>';return}
  const levels=[[.01,'Topp 1 %'],[.05,'Topp 5 %'],[.10,'Topp 10 %'],[.25,'Topp 25 %'],[.50,'Median'],[.75,'75-percentilen']];
  el.innerHTML=`<div class="percentile-overview"><div><strong>${rows.length.toLocaleString('sv-SE')}</strong><span>fullföljande i urvalet</span></div><p>Tiden visar gränsen för respektive nivå. Lägre tid är bättre.</p></div><div class="percentile-grid">${levels.map(([q,label])=>`<article class="percentile-tile"><span>${label}</span><div class="percentile-sex-values"><div class="male"><small>Män</small><strong>${nTime(nQuantile(men,q))}</strong></div><div class="female"><small>Kvinnor</small><strong>${nTime(nQuantile(women,q))}</strong></div></div></article>`).join('')}</div>`;
}

function renderFieldFlow(){
  const el=n$('#fieldFlow');if(!el)return;
  const rows=state.filtered,dns=rows.filter(nIsDns),starters=rows.filter(nIsStarter);
  if(!starters.length){el.innerHTML='<div class="empty">Inga registrerade startande i urvalet.</div>';return}
  const starterIds=new Set(starters.map(r=>r.id)),cps=state.data.checkpoints.filter(c=>c.race_id===state.raceId).sort((a,b)=>a.sequence_no-b.sequence_no),lastSeq=cps.at(-1)?.sequence_no??0;
  const maxSeq=new Map();
  state.data.splits.filter(s=>starterIds.has(s.result_id)&&Number.isFinite(Number(s.sequence_no))).forEach(s=>maxSeq.set(s.result_id,Math.max(maxSeq.get(s.result_id)??-1,Number(s.sequence_no))));
  starters.filter(nIsFinished).forEach(r=>maxSeq.set(r.id,lastSeq));
  const dnf=starters.filter(nIsDnf);
  const locatedDnf=dnf.filter(r=>maxSeq.has(r.id)).length;
  if(dnf.length&&locatedDnf/dnf.length<.25){
    el.innerHTML=`<div class="flow-data-note"><strong>Avhoppen kan inte placeras längs banan för detta år</strong><span>${dnf.length.toLocaleString('sv-SE')} DNF är registrerade, men kontrollpassager saknas för de flesta. ${dns.length.toLocaleString('sv-SE')} DNS räknas inte som startande.</span></div>`;return;
  }
  const stages=[{name:'Start',n:starters.length,seq:0},...cps.filter(c=>c.sequence_no>0).map(c=>({name:c.name.replace('Mora mål','Mora'),seq:c.sequence_no,n:starters.filter(r=>(maxSeq.get(r.id)??-1)>=c.sequence_no).length}))];
  const max=starters.length||1;
  el.innerHTML=`<div class="flow-summary"><strong>${starters.length.toLocaleString('sv-SE')} faktiska startande</strong><span>${dns.length.toLocaleString('sv-SE')} DNS är borttagna ur flödet. En senare passage innebär att löparen även räknas som passerad vid tidigare kontroller.</span></div><div class="flow-track">${stages.map((stage,i)=>{
    const next=stages[i+1],loss=next?Math.max(0,stage.n-next.n):0;
    return `<div class="flow-stage"><div class="flow-node" style="--size:${Math.max(14,Math.sqrt(stage.n/max)*100)}%"><strong>${stage.n}</strong><span>${nEsc(stage.name)}</span></div>${next?`<div class="flow-link"><i></i>${loss?`<em>${loss} bröt före ${nEsc(next.name)}</em>`:'<em class="flow-zero">0 avhopp</em>'}</div>`:''}</div>`;
  }).join('')}</div>`;
}
function allHistories(){
  return groupAthleteHistories(familyResults(),state.data.races);
}
function renderHall(){
  const el=n$('#hallOfFame'),explain=n$('#hallExplanation');if(!el)return;
  const histories=allHistories(),copy={
    veterans:'Flest fullföljda Ultravasan. DNS och DNF räknas inte som genomförda lopp.',
    improved:'Störst förbättring mellan löparens första och senaste fullföljda Ultravasan.',
    consistent:'Minst tidsspridning mellan snabbaste och långsammaste lopp för löpare med minst tre målgångar.',
    chargers:'Flest vunna totalplaceringar från Evertsberg till Mora i ett och samma lopp.'
  };
  if(explain)explain.textContent=copy[nerd.hall]+' Fem kvinnor och fem män visas när underlaget räcker.';
  let rows=[];
  if(nerd.hall==='veterans')rows=histories.map(x=>({...x,completed:x.rows.filter(nIsFinished)})).filter(x=>x.completed.length>1).map(x=>{const years=x.completed.map(r=>state.data.races.find(q=>q.id===r.race_id)?.year).filter(Boolean);return{...x,rows:x.completed,score:x.completed.length,label:`${x.completed.length} fullföljda lopp`,detail:`${Math.min(...years)}–${Math.max(...years)}`,reason:`Har fullföljt ${x.completed.length} Ultravasan under ${years.length} registrerade loppår.`}}).sort((a,b)=>b.score-a.score);
  if(nerd.hall==='improved')rows=histories.filter(x=>x.rows.filter(nIsFinished).length>1).map(x=>{const f=x.rows.filter(nIsFinished),first=f[0],last=f.at(-1),delta=first.finish_seconds-last.finish_seconds,fy=state.data.races.find(q=>q.id===first.race_id)?.year,ly=state.data.races.find(q=>q.id===last.race_id)?.year;return{...x,rows:f,score:delta,label:delta>0?`${Math.round(delta/60)} min snabbare`:`${Math.round(-delta/60)} min långsammare`,detail:`${fy} → ${ly}`,reason:`Förbättrade sluttiden från ${nTime(first.finish_seconds)} till ${nTime(last.finish_seconds)}.`}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(nerd.hall==='consistent')rows=histories.filter(x=>x.rows.filter(nIsFinished).length>2).map(x=>{const f=x.rows.filter(nIsFinished),t=f.map(r=>r.finish_seconds),range=Math.max(...t)-Math.min(...t);return{...x,rows:f,score:-range,label:`${Math.round(range/60)} min spridning`,detail:`${f.length} målgångar`,reason:`Skillnaden mellan snabbaste och långsammaste lopp är bara ${Math.round(range/60)} minuter över ${f.length} målgångar.`}}).sort((a,b)=>b.score-a.score);
  if(nerd.hall==='chargers')rows=familyResults().map(r=>{const a=[...splitMap(r.id).values()].filter(s=>s.place_overall).sort((x,y)=>x.sequence_no-y.sequence_no),mid=a.find(s=>String(s.checkpoint_key||'').toLowerCase()==='evertsberg'||/evertsberg/i.test(s.checkpoint_name||'')),finish=a.find(s=>String(s.checkpoint_key||'').toLowerCase()==='mora'||/mora/i.test(s.checkpoint_name||''))||a.at(-1);if(!mid||!finish||finish.sequence_no<=mid.sequence_no)return null;const gain=Number(mid.place_overall)-Number(finish.place_overall);return gain>0?{rows:[r],score:gain,label:`+${gain} platser`,detail:`${mid.place_overall} → ${finish.place_overall}`,reason:`Avancerade från plats ${mid.place_overall} i Evertsberg till plats ${finish.place_overall} i Mora.`}:null}).filter(Boolean).sort((a,b)=>b.score-a.score);
  const renderGroup=(sex,title)=>{const list=rows.filter(x=>nSex(x.rows.at(-1))===sex).slice(0,5);return `<section class="hall-sex-group ${sex==='F'?'women':'men'}"><h4>${title}</h4>${list.length?list.map((x,i)=>{const r=x.rows.at(-1);return `<button class="hall-row" data-id="${r.id}"><b>${i+1}</b><span><strong>${nEsc(r.name_as_published)}</strong><small>${nEsc(x.detail||'')}</small><em>${nEsc(x.reason||x.label)}</em></span><i>${nEsc(x.label)}</i><u aria-hidden="true">Karta ↗</u></button>`}).join(''):'<div class="empty compact-empty">Underlaget räcker inte till fem placeringar.</div>'}</section>`};
  el.innerHTML=`<div class="hall-columns">${renderGroup('F','Kvinnor')}${renderGroup('M','Män')}</div>`;
  n$$('.hall-row').forEach(b=>b.onclick=()=>openHallMap(Number(b.dataset.id)));
}


const HALL_SEGMENT_COLORS=['#0d4c3a','#1b7659','#3a9b73','#d69b2d','#e86f3b','#7c3aed','#2878b5','#a63d68','#203d62'];
function hallRouteForYear(year){
  const reg=window.ULTRAVASAN_ROUTES;if(!reg)return null;
  const rule=(reg.route_for_year||[]).find(x=>year>=x.from&&year<=x.to);
  return reg.routes?.[rule?.route_id||reg.default_route_id]||null;
}
function ensureHallLeaflet(){
  if(window.L)return Promise.resolve(true);
  return new Promise(resolve=>{
    if(!document.querySelector('link[data-hall-leaflet]')){const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';css.dataset.hallLeaflet='1';document.head.appendChild(css)}
    const existing=document.querySelector('script[data-hall-leaflet]');if(existing){const timer=setInterval(()=>{if(window.L){clearInterval(timer);resolve(true)}},80);setTimeout(()=>{clearInterval(timer);resolve(Boolean(window.L))},3500);return}
    const js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.dataset.hallLeaflet='1';js.onload=()=>resolve(true);js.onerror=()=>resolve(false);document.head.appendChild(js);setTimeout(()=>resolve(Boolean(window.L)),4500);
  });
}
function routeSegmentPoints(route,a,b){return (route.points||[]).filter(p=>Number(p[2])>=a-.03&&Number(p[2])<=b+.03).map(p=>[Number(p[0]),Number(p[1])]);}
function renderHallFallback(route){
  const el=n$('#hallMapCanvas'),pts=route.points||[];if(!el||pts.length<2)return;
  const lat=pts.map(p=>p[0]),lon=pts.map(p=>p[1]),minLat=Math.min(...lat),maxLat=Math.max(...lat),minLon=Math.min(...lon),maxLon=Math.max(...lon),W=900,H=480,pad=35,x=v=>pad+(v-minLon)*(W-pad*2)/(maxLon-minLon||1),y=v=>H-pad-(v-minLat)*(H-pad*2)/(maxLat-minLat||1);
  const cps=route.checkpoints||[];let content='<rect width="900" height="480" fill="#e7eee6"/><path d="M0 380 Q210 300 410 360 T900 300 V480 H0Z" fill="#c8dbc8" opacity=".8"/>';
  for(let i=1;i<cps.length;i++){const seg=routeSegmentPoints(route,cps[i-1].distance_km,cps[i].distance_km),d=seg.map((q,j)=>`${j?'L':'M'}${x(q[1]).toFixed(1)} ${y(q[0]).toFixed(1)}`).join(' ');content+=`<path d="${d}" fill="none" stroke="${HALL_SEGMENT_COLORS[(i-1)%HALL_SEGMENT_COLORS.length]}" stroke-width="7" stroke-linecap="round"/>`}
  cps.forEach((c,i)=>{content+=`<circle cx="${x(c.coord[1])}" cy="${y(c.coord[0])}" r="7" fill="#fff" stroke="#0d4c3a" stroke-width="3"/><text x="${x(c.coord[1])+9}" y="${y(c.coord[0])-9}" font-size="12" font-weight="800" fill="#10241d">${nEsc(c.short||c.name)}</text>`});
  el.innerHTML=`<svg class="hall-fallback-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bana med delsträckor">${content}</svg><div class="hall-map-fallback-note">Kartbakgrunden kunde inte laddas. Den verkliga GPS-rutten visas ändå.</div>`;
}
async function openHallMap(resultId){
  const r=state.data.results.find(x=>x.id===resultId),race=r&&state.data.races.find(x=>x.id===r.race_id),route=race&&runnerRouteForRace(race),dialog=n$('#hallMapDialog');if(!r||!race||!route||!dialog)return;
  const splits=state.data.splits.filter(s=>s.result_id===r.id).sort((a,b)=>a.sequence_no-b.sequence_no),splitKey=k=>k==='finish'?'mora':k,byKey=new Map(splits.map(s=>[String(s.checkpoint_key||'').toLowerCase(),s])),cps=route.checkpoints||[];
  n$('#hallMapTitle').textContent=`${r.name_as_published} · Ultravasan ${race.year}`;
  n$('#hallMapSubtitle').textContent=`${nTime(r.finish_seconds)} · plats ${r.overall_place??'–'} · ${r.age_class||'klass saknas'}`;
  n$('#hallSegmentLegend').innerHTML=cps.slice(1).map((c,i)=>{const prev=cps[i],a=i===0?null:byKey.get(splitKey(prev.key)),b=byKey.get(splitKey(c.key)),seconds=b?.elapsed_seconds!=null?Number(b.elapsed_seconds)-Number(a?.elapsed_seconds||0):null,gain=a?.place_overall&&b?.place_overall?Number(a.place_overall)-Number(b.place_overall):null;return `<div class="hall-segment-item"><i style="background:${HALL_SEGMENT_COLORS[i%HALL_SEGMENT_COLORS.length]}"></i><span><strong>${nEsc(prev.short||prev.name)} → ${nEsc(c.short||c.name)}</strong><small>${nTime(seconds)}${gain!=null?` · ${gain>0?'+':''}${gain} platser`:''}</small></span></div>`}).join('');
  dialog.showModal();
  const canvas=n$('#hallMapCanvas');canvas.innerHTML='<div class="hall-map-loading">Läser karta och GPS-rutt…</div>';
  const ok=await ensureHallLeaflet();
  if(!ok||!window.L){renderHallFallback(route);return}
  canvas.innerHTML='';
  if(nerd.hallMap){nerd.hallMap.remove();nerd.hallMap=null}
  nerd.hallMap=L.map(canvas,{zoomControl:true,scrollWheelZoom:true});
  nerd.hallTile=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap-bidragsgivare'}).addTo(nerd.hallMap);
  for(let i=1;i<cps.length;i++){
    const seg=routeSegmentPoints(route,cps[i-1].distance_km,cps[i].distance_km);if(seg.length>1)L.polyline(seg,{color:HALL_SEGMENT_COLORS[(i-1)%HALL_SEGMENT_COLORS.length],weight:7,opacity:.92,lineCap:'round'}).addTo(nerd.hallMap).bindTooltip(`${cps[i-1].short||cps[i-1].name} → ${cps[i].short||cps[i].name}`);
  }
  cps.forEach((c,i)=>L.circleMarker(c.coord,{radius:i===0||i===cps.length-1?8:6,color:'#0d4c3a',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(nerd.hallMap).bindTooltip(`<strong>${nEsc(c.short||c.name)}</strong><br>${Number(c.distance_km).toFixed(1)} km`,{permanent:true,direction:i%2?'bottom':'top',className:'hall-checkpoint-label'}));
  nerd.hallMap.fitBounds(route.bounds||L.latLngBounds((route.points||[]).map(p=>[p[0],p[1]])),{padding:[28,28]});
  setTimeout(()=>nerd.hallMap?.invalidateSize(),100);
}

function renderFingerprint(){
  const el=n$('#raceFingerprint');if(!el)return;const race=activeRace(),current=state.filtered.filter(nIsFinished),all=familyResults().filter(nIsFinished),raceMed=nMedian(current.map(r=>r.finish_seconds)),histMed=nMedian(all.map(r=>r.finish_seconds));
  if(!raceMed||!histMed){el.innerHTML='<div class="empty">Historik behövs för index</div>';return}
  const splitIds=new Set(current.map(r=>r.id)),pace=state.data.splits.filter(s=>splitIds.has(s.result_id)&&s.pace_seconds_per_km).map(s=>s.pace_seconds_per_km),familyIds=new Set(familyResults().map(r=>r.id)),allPace=state.data.splits.filter(s=>familyIds.has(s.result_id)&&s.pace_seconds_per_km).map(s=>s.pace_seconds_per_km);
  const starters=state.filtered.filter(nIsStarter),dnf=starters.filter(nIsDnf).length/(starters.length||1),allResults=familyResults(),allStarters=allResults.filter(nIsStarter),allDnf=allStarters.filter(nIsDnf).length/(allStarters.length||1),women=starters.filter(r=>r.sex==='F').length/(starters.length||1),allWomen=allStarters.filter(r=>r.sex==='F').length/(allStarters.length||1);
  const metrics=[['Svårighetsgrad',raceMed/histMed*100],['Fartnivå',allPace.length&&pace.length?nMedian(allPace)/nMedian(pace)*100:100],['DNF-belastning',allDnf?dnf/allDnf*100:100],['Kvinnorepresentation',allWomen?women/allWomen*100:100],['Fältstorlek',state.filtered.length/(allResults.length/(familyRaces().length||1)||1)*100]];
  el.innerHTML=metrics.map(([name,v])=>`<div class="finger-row"><span>${nEsc(name)}</span><div><i style="width:${Math.max(4,Math.min(100,v/1.6))}%"></i><b style="left:${Math.max(4,Math.min(96,v/1.6))}%"></b></div><strong>${Math.round(v)}</strong></div>`).join('')+`<p class="microcopy">${race.year}: över 100 betyder mer av egenskapen än genomsnittet i importerad historik.</p>`;
}
function renderHistorySuggestions(){
  const input=n$('#historySearch'),box=n$('#historySuggestions');if(!input||!box)return;const q=input.value.trim().toLowerCase();if(q.length<2){box.hidden=true;return}
  const groups=allHistories().filter(g=>{const r=g.rows[0];return `${r.name_as_published} ${g.rows.map(x=>x.bib||'').join(' ')}`.toLowerCase().includes(q)}).sort((a,b)=>b.rows.length-a.rows.length).slice(0,10);
  box.innerHTML=groups.length?groups.map(g=>{const r=g.rows.at(-1),years=g.rows.map(x=>state.data.races.find(y=>y.id===x.race_id)?.year).filter(Boolean),identity=[r.bib?'#'+r.bib:'',r.age_class||'',r.club||r.city||''].filter(Boolean).join(' · ');return `<button data-key="${nEsc(g.key)}"><strong>${nEsc(r.name_as_published)}</strong><small>${g.rows.length} lopp · ${years.join(', ')}${identity?' · '+nEsc(identity):''}</small></button>`}).join(''):'<div class="empty">Ingen löpare hittades</div>';box.hidden=false;
  n$$('#historySuggestions button').forEach(b=>b.onclick=()=>{const g=allHistories().find(x=>x.key===b.dataset.key);if(g){input.value=g.rows.at(-1).name_as_published;box.hidden=true;renderRunnerHistory(g)}});
}
function renderRunnerHistory(g){
  const el=n$('#runnerHistory');if(!el)return;const rows=g.rows,finish=rows.filter(nIsFinished),best=finish.slice().sort((a,b)=>a.finish_seconds-b.finish_seconds)[0];
  const timeline=rows.map(r=>{const race=state.data.races.find(x=>x.id===r.race_id);return `<button class="history-year ${r.id===best?.id?'best':''}" data-id="${r.id}"><b>${race?.year||'–'}</b><strong>${nTime(r.finish_seconds)}</strong><span>plats ${r.overall_place??'–'} · ${nEsc(r.age_class||'')}</span></button>`}).join('');
  const improvement=finish.length>1?finish[0].finish_seconds-finish.at(-1).finish_seconds:null;
  el.innerHTML=`<div class="history-head"><div><span>${rows.length} starter</span><strong>${nEsc(rows.at(-1).name_as_published)}</strong></div><div><span>Bästa tid</span><strong>${nTime(best?.finish_seconds)}</strong></div><div><span>Utveckling</span><strong>${improvement==null?'–':`${improvement>=0?'−':'+'}${Math.abs(Math.round(improvement/60))} min`}</strong></div></div><div class="history-timeline">${timeline}</div><button id="historyMap" class="compare-map-button">Spela upp åren på karta →</button>`;
  n$$('.history-year').forEach(b=>b.onclick=()=>openRunner(Number(b.dataset.id)));n$('#historyMap').onclick=()=>window.openUltravasanMap?window.openUltravasanMap(rows.slice(-5)):window.open(`karta.html?runners=${rows.slice(-5).map(r=>r.id).join(',')}`,'_blank');
}

if(typeof module!=='undefined'&&module.exports)module.exports={athleteIdentityKey,groupAthleteHistories,segmentClassOptions,filterRowsBySegmentClass,nCompareClasses};
if(typeof window!=='undefined'&&typeof document!=='undefined'){
  const nerdTimer=setInterval(()=>{try{initNerdLab();if(nerd.ready)clearInterval(nerdTimer)}catch(e){console.error('NerdLab',e);clearInterval(nerdTimer)}},60);
}
