'use strict';
const state={data:null,filtered:[],page:1,pageSize:10,sortKey:'overall_place',sortDir:1,raceId:null,raceFamily:'uv90'};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const fmtTime=s=>{if(s==null)return '–';const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.round(s%60);return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`};
const speedUnit=()=>window.SpeedUnits?.get?.()||'pace';
const fmtPace=s=>{if(window.SpeedUnits?.formatPace)return window.SpeedUnits.formatPace(s,speedUnit());if(s==null||!Number.isFinite(Number(s))||Number(s)<=0)return'–';const rounded=Math.round(Number(s));return`${Math.floor(rounded/60)}:${String(rounded%60).padStart(2,'0')} /km`};
const fmtSpeed=s=>window.SpeedUnits?.formatSpeed?.(s,speedUnit())??(Number.isFinite(Number(s))?`${Number(s).toFixed(1)} km/h`:'–');
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const normClassLabel=v=>{let s=String(v||'Okänd').toUpperCase().replace(/\s+/g,'');if(/^H\d/.test(s))s='M'+s.slice(1);if(/^D\d/.test(s)||/^K\d/.test(s))s='W'+s.slice(1);return s||'Okänd'};
const classOrderInfo=v=>{const s=normClassLabel(v),sex=s.startsWith('W')?0:s.startsWith('M')?1:2,m=s.match(/(\d{1,3})/),age=m?Number(m[1]):999,tail=s.replace(/^[A-Z]?\d{1,3}/,'');return {s,sex,age,tail}};
const compareClasses=(a,b)=>{const A=classOrderInfo(a),B=classOrderInfo(b);return A.sex-B.sex||A.age-B.age||A.tail.localeCompare(B.tail,'sv')||A.s.localeCompare(B.s,'sv')};
const cleanCheckpointName=v=>String(v||'').replace('Mora mål','Mora').replace('Start Sälen','Start').trim();
const segmentRangeLabel=(from,to)=>`${cleanCheckpointName(from)||'Start'} – ${cleanCheckpointName(to)}`;
const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2};
const quantile=(a,q)=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),p=(b.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return b[l]+(b[h]-b[l])*(p-l)};

const raceFamilyOf=r=>String(r?.race_key||'').startsWith('ultravasan45-')||/45/.test(String(r?.name||''))?'uv45':'uv90';
const familyRaces=()=>state.data.races.filter(r=>raceFamilyOf(r)===state.raceFamily);
const familyResults=()=>{const ids=new Set(familyRaces().map(r=>r.id));return state.data.results.filter(r=>ids.has(r.race_id))};
const raceUi={uv90:{hero:'assets/salen-mora-header.png?v=20260713-multirace1',alt:'Sälen-Mora Splits – analysera din resa i Ultravasan 90 från Sälen till Mora',title:'Sälen-Mora splits'},uv45:{hero:'assets/oxberg-mora-header.png?v=20260713-multirace1',alt:'Oxberg-Mora Splits – analysera din resa i Ultravasan 45 från Oxberg till Mora',title:'Oxberg-Mora splits'}};
let raceSwitchBusy=false,raceSwitchHasError=false;
function populateRaceYears(){const races=familyRaces().slice().sort((a,b)=>b.year-a.year),year=$('#yearFilter');year.innerHTML=races.map(r=>`<option value="${r.id}">${r.year}</option>`).join('');state.raceId=Number(year.value)||races[0]?.id||null}
function waitForRacePaint(){return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))}
function waitForRaceDelay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function setRaceLoading(active,error=false){const status=$('#raceLoadStatus'),sw=$('.race-switch'),main=$('main');document.body.classList.toggle('race-is-loading',active);sw?.setAttribute('aria-busy',String(active));main?.setAttribute('aria-busy',String(active));$$('.race-switch-button').forEach(b=>{b.disabled=active;b.setAttribute('aria-disabled',String(active))});if(!status)return;status.classList.toggle('is-visible',active||error);status.classList.toggle('is-error',error);status.setAttribute('aria-hidden',String(!active&&!error));$('.race-load-copy strong').textContent=error?'Det gick inte att ladda loppdata.':'Laddar data...';$('.race-load-copy small').textContent=error?'Försök igen.':'Byter lopp och uppdaterar analyser'}
function updateRaceHero(img,ui,initial){if(!img)return Promise.resolve();if(img.src&&!initial)img.classList.add('switching');return new Promise((resolve,reject)=>{let settled=false;const finish=ok=>{if(settled)return;settled=true;clearTimeout(timeout);img.removeEventListener('load',loaded);img.removeEventListener('error',failed);img.classList.remove('switching');ok?resolve():reject(new Error('Rubrikbilden kunde inte laddas.'))},loaded=()=>finish(true),failed=()=>finish(false),timeout=setTimeout(failed,8000);img.addEventListener('load',loaded,{once:true});img.addEventListener('error',failed,{once:true});setTimeout(()=>{img.src=ui.hero;img.alt=ui.alt;if(img.complete)Promise.resolve().then(()=>finish(img.naturalWidth>0))},initial?0:140)})}
async function switchRaceFamily(family,initial=false){if(!['uv90','uv45'].includes(family)||raceSwitchBusy||(!initial&&!raceSwitchHasError&&family===state.raceFamily))return false;raceSwitchBusy=true;raceSwitchHasError=false;setRaceLoading(true);const started=performance.now();try{if(!initial)await waitForRacePaint();state.raceFamily=family;document.body.classList.toggle('race-uv45',family==='uv45');const sw=$('.race-switch');if(sw)sw.dataset.active=family;$$('.race-switch-button').forEach(b=>{const active=b.dataset.raceFamily===family;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});const heroReady=updateRaceHero($('#heroHeaderImage'),raceUi[family],initial);document.title=raceUi[family].title;populateRaceYears();state.page=1;compareState.selected=[];refreshFilters();applyFilters();setupMapCompare(true);setupMainRunnerSearch(true);try{localStorage.setItem('ultravasan-race-family',family)}catch{}await heroReady;await waitForRacePaint();const remaining=360-(performance.now()-started);if(remaining>0)await waitForRaceDelay(remaining);setRaceLoading(false);return true}catch(error){console.error('Loppväxlingen misslyckades',error);raceSwitchHasError=true;setRaceLoading(false,true);return false}finally{raceSwitchBusy=false}}
function setupRaceSwitch(){const saved=new URLSearchParams(location.search).get('race')||localStorage.getItem('ultravasan-race-family')||'uv90';$$('.race-switch-button').forEach(b=>b.onclick=()=>switchRaceFamily(b.dataset.raceFamily));switchRaceFamily(saved==='uv45'?'uv45':'uv90',true)}

const hydrateData=d=>{const rr=new Map(d.results.map(r=>[r.id,r.race_id])),cp=new Map(d.checkpoints.map(c=>[`${c.race_id}|${c.checkpoint_key}`,c]));d.splits.forEach(s=>{const c=cp.get(`${rr.get(s.result_id)}|${s.checkpoint_key}`);if(c){s.checkpoint_name=c.name;s.sequence_no=c.sequence_no;s.distance_km=c.distance_km}if(s.is_estimated==null)s.is_estimated=0});const classPlacements=window.RunnerReplay?.deriveClassPlacements(d.results,d.splits);if(classPlacements)Object.defineProperty(d,'classPlacementLookup',{value:classPlacements,enumerable:false});return d};

async function load(){try{if(window.ULTRAVASAN_DATA){state.data=hydrateData(window.ULTRAVASAN_DATA);setup();return}const r=await fetch('data/ultravasan.json',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);state.data=hydrateData(await r.json());setup();}catch(e){console.error(e);$('#loading').innerHTML=`<p><strong>Databasen kunde inte läsas.</strong><br>Kontrollera att filen <code>data/ultravasan-data.js</code> finns bredvid webbplatsen.<br><small>${esc(e.message)}</small></p>`;}}
function setup(){installInfoTooltips();if(state.data.meta.coverage_note){const n=$('#dataNotice');n.hidden=false;n.textContent=state.data.meta.coverage_note}setupSpeedUnitControls();setupRaceSwitch();const year=$('#yearFilter');year.onchange=()=>{state.raceId=Number(year.value);state.page=1;refreshFilters();applyFilters()};['sexFilter','classFilter','statusFilter'].forEach(id=>$('#'+id).addEventListener('change',()=>{state.page=1;applyFilters()}));$('#resetFilters').onclick=()=>{['sexFilter','classFilter','statusFilter'].forEach(id=>$('#'+id).value='');const search=$('#nameFilter');if(search)search.value='';state.page=1;applyFilters()};$('#prevPage').onclick=()=>{if(state.page>1){state.page--;renderTable()}};$('#nextPage').onclick=()=>{if(state.page<Math.ceil(state.filtered.length/state.pageSize)){state.page++;renderTable()}};$$('th[data-sort]').forEach(th=>th.onclick=()=>{const k=th.dataset.sort;state.sortDir=state.sortKey===k?-state.sortDir:1;state.sortKey=k;applyFilters()});const runnerDialog=$('#runnerDialog');$('#runnerDialog .dialog-close').onclick=()=>runnerDialog.close();runnerDialog.addEventListener('close',()=>window.RunnerReplay?.stopActive());setupStatsControls();setupInfoInteractions();$('#generatedAt').textContent=new Date(state.data.meta.generated_at).toLocaleString('sv-SE');$('#databaseSize').textContent=state.data.results.length.toLocaleString('sv-SE');$('#splitCount').textContent=state.data.splits.length.toLocaleString('sv-SE');$('#loading').classList.add('hidden')}
let speedUnitControlsReady=false;
function syncSpeedUnitControls(unit=speedUnit()){
  const select=$('#speedUnitFilter');if(select)select.value=unit;
  $$('[data-speed-unit-label]').forEach(label=>label.textContent=window.SpeedUnits?.unitLabel?.(unit)||'min/km');
}
function setupSpeedUnitControls(){
  syncSpeedUnitControls();if(speedUnitControlsReady)return;speedUnitControlsReady=true;
  $('#speedUnitFilter')?.addEventListener('change',event=>window.SpeedUnits?.set?.(event.target.value));
  window.addEventListener('ultravasan:speed-unit-change',event=>{syncSpeedUnitControls(event.detail?.unit);if(state.data)renderAll()});
}
function raceResults(){return state.data.results.filter(r=>r.race_id===state.raceId)}
function refreshFilters(){const rr=raceResults(),classes=[...new Set(rr.map(r=>r.age_class).filter(Boolean))].sort(compareClasses),statuses=[...new Set(rr.map(r=>r.status).filter(Boolean))].sort();$('#classFilter').innerHTML='<option value="">Alla klasser</option>'+classes.map(x=>`<option>${esc(x)}</option>`).join('');$('#statusFilter').innerHTML='<option value="">Alla</option>'+statuses.map(x=>`<option>${esc(x)}</option>`).join('')}
function applyFilters(){const sex=$('#sexFilter').value,cls=$('#classFilter').value,status=$('#statusFilter').value;state.filtered=raceResults().filter(r=>(!sex||r.sex===sex)&&(!cls||r.age_class===cls)&&(!status||r.status===status));state.sortKey='overall_place';state.sortDir=1;state.filtered.sort((a,b)=>(Number(a.overall_place)||Infinity)-(Number(b.overall_place)||Infinity)||String(a.name_as_published||'').localeCompare(String(b.name_as_published||''),'sv'));renderAll()}
function renderAll(){const rr=raceResults(),times=state.filtered.map(r=>r.finish_seconds).filter(Boolean),fast=state.filtered.filter(r=>r.finish_seconds).sort((a,b)=>a.finish_seconds-b.finish_seconds)[0];$('#kpiCount').textContent=state.filtered.length.toLocaleString('sv-SE');$('#kpiTotal').textContent=`av ${rr.length.toLocaleString('sv-SE')}`;$('#kpiMedian').textContent=fmtTime(median(times));$('#kpiFastest').textContent=fast?fmtTime(fast.finish_seconds):'–';$('#kpiWinner').textContent=fast?fast.name_as_published:'–';$('#kpiFinishRate').textContent=state.filtered.length?`${Math.round(times.length/state.filtered.length*100)} %`:'–';renderHistogram(times);renderPaceChart();renderStatistics();renderTable();if(typeof renderNerdLab==='function')renderNerdLab()}
function svg(tag,attrs={},text=''){const a=Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ');return `<${tag} ${a}>${text}</${tag}>`}
function renderHistogram(times){const el=$('#histogram');if(!times.length){el.innerHTML='<div class="empty">Inga sluttider i urvalet</div>';return}const min=Math.floor(Math.min(...times)/1800)*1800,max=Math.ceil(Math.max(...times)/1800)*1800,bins=Math.max(5,Math.min(16,Math.ceil((max-min)/1800))),step=(max-min)/bins||1800,counts=Array(bins).fill(0);times.forEach(t=>counts[Math.min(bins-1,Math.floor((t-min)/step))]++);const W=650,H=270,p={l:44,r:14,t:12,b:42},cw=(W-p.l-p.r)/bins,ymax=Math.max(...counts);let s='';for(let i=0;i<=4;i++){const y=p.t+(H-p.t-p.b)*i/4;s+=svg('line',{x1:p.l,y1:y,x2:W-p.r,y2:y,class:'gridline'})+svg('text',{x:5,y:y+4},String(Math.round(ymax*(1-i/4))))}counts.forEach((c,i)=>{const h=(H-p.t-p.b)*c/ymax,x=p.l+i*cw+2,y=H-p.b-h;s+=`<rect class="bar" x="${x}" y="${y}" width="${Math.max(2,cw-4)}" height="${h}"><title>${c} löpare, ${fmtTime(min+i*step)}–${fmtTime(min+(i+1)*step)}</title></rect>`;if(i%Math.ceil(bins/6)===0)s+=svg('text',{x:x,y:H-18},`${Math.floor((min+i*step)/3600)} h`)});s+=svg('line',{x1:p.l,y1:H-p.b,x2:W-p.r,y2:H-p.b,class:'axis'});el.innerHTML=`<svg viewBox="0 0 ${W} ${H}">${s}</svg>`;$('#distributionLabel').textContent=`Hälften av löparna: ${fmtTime(quantile(times,.25))}–${fmtTime(quantile(times,.75))}`}
function renderPaceChart(){
  const resultIds=new Set(state.filtered.map(r=>r.id));
  const splits=state.data.splits.filter(s=>resultIds.has(s.result_id)&&Number(s.pace_seconds_per_km)>0);
  const groups=new Map();
  splits.forEach(s=>{
    const speed=3600/Number(s.pace_seconds_per_km);
    if(!Number.isFinite(speed)||speed<=0||speed>30)return;
    if(!groups.has(s.sequence_no))groups.set(s.sequence_no,{name:s.checkpoint_name,vals:[]});
    groups.get(s.sequence_no).vals.push(speed);
  });
  const unit=speedUnit(),rawSegments=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([seq,g])=>({seq,checkpoint:g.name,speed:median(g.vals)}));
  let previous='Start';const segmentPoints=rawSegments.map(g=>{const name=segmentRangeLabel(previous,g.checkpoint);previous=g.checkpoint;return {...g,name}});
  const startName=state.raceFamily==='uv45'?'Oxberg (start)':'Sälen (start)',display=speed=>unit==='pace'?window.SpeedUnits.paceFromSpeed(speed):speed;const pts=[{seq:0,name:startName,value:null,isStart:true},...segmentPoints.map(point=>({...point,value:display(point.speed)}))];
  const el=$('#paceChart');
  if(segmentPoints.length<1){el.innerHTML='<div class="empty">Mellantider saknas i det aktuella urvalet.</div>';return}
  const W=650,H=270,p={l:48,r:20,t:15,b:62};
  const values=pts.map(x=>x.value).filter(Number.isFinite),min=Math.min(...values),max=Math.max(...values),x=i=>p.l+i*(W-p.l-p.r)/(pts.length-1||1),y=v=>unit==='pace'?p.t+(v-min)*(H-p.t-p.b)/(max-min||1):p.t+(max-v)*(H-p.t-p.b)/(max-min||1);
  let out='';
  for(let i=0;i<=4;i++){
    const val=unit==='pace'?min+(max-min)*i/4:max-(max-min)*i/4,yy=y(val),label=unit==='pace'?window.SpeedUnits.formatPaceSeconds(val,{suffix:false}):val.toFixed(1);
    out+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:5,y:yy+4},label);
  }
  const valid=pts.map((d,i)=>({...d,i})).filter(d=>Number.isFinite(d.value)),path=valid.map((d,i)=>`${i?'L':'M'}${x(d.i)} ${y(d.value)}`).join(' ');
  out+=`<path class="line-path" d="${path}"/>`;
  pts.forEach((d,i)=>{
    const title=d.isStart?`${state.raceFamily==='uv45'?'Oxberg':'Sälen'}: startpunkt`:`${d.name}: median ${fmtSpeed(d.speed)}`;
    if(!d.isStart)out+=`<circle class="dot" cx="${x(i)}" cy="${y(d.value)}" r="5"><title>${title}</title></circle>`;
    out+=svg('text',{x:x(i),y:H-31,'text-anchor':'middle',transform:`rotate(-30 ${x(i)} ${H-31})`},d.name.replace('Mora mål','Mora'));
  });
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
}
function renderTable(){const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));state.page=Math.min(state.page,pages);const start=(state.page-1)*state.pageSize,rows=state.filtered.slice(start,start+state.pageSize);$('#resultsBody').innerHTML=rows.length?rows.map(r=>`<tr data-id="${r.id}"><td>${r.overall_place??'–'}</td><td><div class="runner-name">${esc(r.name_as_published)}</div><div class="runner-meta">${r.bib?'#'+esc(r.bib):''}${r.city?' · '+esc(r.city):''}</div></td><td>${esc(r.sex||'–')}</td><td>${esc(r.age_class||'–')}</td><td>${esc(r.club||r.city||'–')}</td><td>${esc(r.nationality||'–')}</td><td class="time">${fmtTime(r.finish_seconds)}</td><td class="time">${fmtPace(r.pace_seconds_per_km)}</td><td><span class="status ${String(r.status).toLowerCase()}">${esc(r.status)}</span></td></tr>`).join(''):`<tr><td colspan="9" class="empty">Inga resultat matchar filtren</td></tr>`;$$('#resultsBody tr[data-id]').forEach(tr=>tr.onclick=()=>openRunner(Number(tr.dataset.id)));$('#pageLabel').textContent=`Sida ${state.page} av ${pages}`;$('#prevPage').disabled=state.page<=1;$('#nextPage').disabled=state.page>=pages;$('#resultCountLabel').textContent=`${state.filtered.length.toLocaleString('sv-SE')} resultat`}
function runnerRouteForRace(race){return window.RunnerReplay?.routeForRace(window.ULTRAVASAN_ROUTES,race)||null}
function openRunner(id){
  const r=state.data.results.find(x=>x.id===id);if(!r)return;const race=state.data.races.find(x=>x.id===r.race_id),splits=state.data.splits.filter(x=>x.result_id===id).sort((a,b)=>a.sequence_no-b.sequence_no),route=runnerRouteForRace(race),raceCheckpoints=state.data.checkpoints.filter(x=>x.race_id===r.race_id).sort((a,b)=>a.sequence_no-b.sequence_no),model=window.RunnerReplay?.createModel({race,result:r,route,raceCheckpoints,splits});
  const replay=model?window.RunnerReplay.render(model):'<div class="runner-map-empty">Loppreplay kunde inte startas. Mellantiderna visas nedan.</div>',clubOrPlace=[r.club,r.city].filter(Boolean).join(' · ')||'Ingen klubb/ort angiven',classPlace=window.RunnerReplay?.formatClassPlace(r.class_place)||'Saknas',wholePace=window.RunnerReplay?.wholeRacePace(r,race);
  $('#runnerDetail').innerHTML=`<div class="runner-detail"><div class="runner-title"><p class="eyebrow">${race?.year||'–'} · ${esc(race?.name||'Ultravasan 90')}</p><h2>${esc(r.name_as_published)}</h2><p>${esc(clubOrPlace)}${r.nationality?' · '+esc(r.nationality):''}</p></div><div class="detail-kpis"><div><span>Sluttid</span><strong>${fmtTime(r.finish_seconds)}</strong></div><div><span>Totalplats</span><strong>${r.overall_place??'–'}</strong></div><div><span>Klass</span><strong>${esc(r.age_class||'–')}</strong></div><div><span>Klassplacering</span><strong>${classPlace}</strong></div><div><span>Snittfart</span><strong>${fmtPace(wholePace)}</strong></div></div><section class="runner-map-section">${replay}</section><details class="runner-split-details"><summary>Visa alla passager och mellantider</summary><div class="table-wrap"><table class="split-table"><thead><tr><th>Kontroll</th><th>Distans</th><th>Passagetid</th><th>Delsträcka</th><th>Fart</th><th>Plats</th></tr></thead><tbody>${splits.map(s=>`<tr><td>${esc(cleanCheckpointName(s.checkpoint_name))}</td><td>${s.distance_km??'–'} km</td><td class="time">${fmtTime(s.elapsed_seconds)}</td><td class="time">${fmtTime(s.segment_seconds)}</td><td class="time">${fmtPace(s.pace_seconds_per_km)}</td><td>${s.place_overall??'–'}</td></tr>`).join('')||'<tr><td colspan="6">Mellantider saknas</td></tr>'}</tbody></table></div></details></div>`;
  $('#runnerDialog').showModal();if(model)window.RunnerReplay.mount($('#runnerDetail [data-runner-replay]'),model,window.RACE_MEDIA_CONFIG);
}

function setupStatsControls(){const targetSelect=$('#targetTimeSelect');if(targetSelect)targetSelect.addEventListener('change',renderTargetSimulator);['placementSexM','placementSexF'].forEach(id=>$('#'+id)?.addEventListener('change',renderPlacementScatter))}
function activeSplits(){const ids=new Set(state.filtered.map(r=>r.id));return state.data.splits.filter(s=>ids.has(s.result_id))}
function renderStatistics(){renderPlacementScatter();renderDnfFunnel();renderSegmentHeatmap();renderOvertakes();renderYearTrend();renderPacingDNA();renderTargetSimulator()}
function renderPlacementScatter(){
  const el=$('#placementScatter');if(!el)return;
  const showM=$('#placementSexM')?.checked!==false,showF=$('#placementSexF')?.checked!==false;
  if(!showM&&!showF){el.innerHTML='<div class="empty">Välj minst män eller kvinnor</div>';return}
  const sexOf=r=>{const s=String(r?.sex||'').toUpperCase();return ['F','W','K','D'].includes(s)?'F':['M','H'].includes(s)?'M':'U'};
  const rows=state.filtered.filter(r=>r.finish_seconds&&r.overall_place).filter(r=>(showM&&sexOf(r)==='M')||(showF&&sexOf(r)==='F'));
  if(rows.length<2){el.innerHTML='<div class="empty">Minst två placerade löpare behövs för valt kön</div>';return}
  const W=760,H=245,p={l:52,r:18,t:14,b:40},minT=Math.min(...rows.map(r=>r.finish_seconds)),maxT=Math.max(...rows.map(r=>r.finish_seconds)),maxP=Math.max(...rows.map(r=>r.overall_place));
  const x=t=>p.l+(t-minT)*(W-p.l-p.r)/(maxT-minT||1),y=v=>p.t+(v-1)*(H-p.t-p.b)/(maxP-1||1);let out='';
  for(let i=0;i<=4;i++){const yy=p.t+(H-p.t-p.b)*i/4,place=Math.round(1+(maxP-1)*i/4);out+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:7,y:yy+4},String(place))}
  for(let i=0;i<=4;i++){const t=minT+(maxT-minT)*i/4,xx=x(t);out+=svg('text',{x:xx,y:H-12,'text-anchor':'middle'},fmtTime(t).slice(0,-3))}
  rows.forEach(r=>{const sex=sexOf(r),color=sex==='M'?'#2563eb':'#db2777',cx=x(r.finish_seconds),cy=y(r.overall_place),title=`${r.name_as_published} · ${sex==='M'?'Man':'Kvinna'} · ${fmtTime(r.finish_seconds)} · plats ${r.overall_place}`;out+=sex==='F'?`<path d="M${cx} ${cy-5} L${cx+5} ${cy} L${cx} ${cy+5} L${cx-5} ${cy} Z" fill="${color}" opacity=".75"><title>${esc(title)}</title></path>`:`<circle cx="${cx}" cy="${cy}" r="4.3" fill="${color}" opacity=".72"><title>${esc(title)}</title></circle>`});
  const legend=[showM?'<span class="inline-sex-legend"><i class="male"></i>Män</span>':'',showF?'<span class="inline-sex-legend"><i class="female"></i>Kvinnor</span>':''].filter(Boolean).join('');
  el.innerHTML=`<div class="chart-inline-legend">${legend}</div><svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
}
function renderDnfFunnel(){
  const el=$('#dnfFunnel'),rows=state.filtered;
  if(!rows.length){el.innerHTML='<div class="empty">Inget underlag</div>';return}
  const dns=rows.filter(r=>String(r.status||'').toUpperCase()==='DNS');
  const starters=rows.filter(r=>String(r.status||'').toUpperCase()!=='DNS');
  const dnf=starters.filter(r=>String(r.status||'').toUpperCase()==='DNF');
  if(!dnf.length){el.innerHTML=`<div class="dnf-summary"><strong>Inga registrerade DNF</strong><span>${starters.length.toLocaleString('sv-SE')} startande · ${dns.length.toLocaleString('sv-SE')} DNS räknas inte som startande.</span></div>`;return}
  const dnfIds=new Set(dnf.map(r=>r.id));
  const cps=state.data.checkpoints.filter(c=>c.race_id===state.raceId).sort((a,b)=>a.sequence_no-b.sequence_no);
  const byResult=new Map();
  state.data.splits.filter(s=>dnfIds.has(s.result_id)&&Number.isFinite(Number(s.sequence_no))).forEach(s=>{
    if(!byResult.has(s.result_id))byResult.set(s.result_id,[]);
    byResult.get(s.result_id).push(s);
  });
  const segments=new Map();
  dnf.forEach(r=>{
    const arr=(byResult.get(r.id)||[]).sort((a,b)=>a.sequence_no-b.sequence_no);
    const last=arr.at(-1);
    let key='unknown',label='Plats saknas i källdatan',order=999;
    if(last){
      const from=cps.find(c=>c.sequence_no===last.sequence_no);
      const next=cps.find(c=>c.sequence_no>last.sequence_no);
      const fromName=(from?.name||last.checkpoint_name||'Senaste kontroll').replace('Mora mål','Mora');
      const toName=(next?.name||'Mora').replace('Mora mål','Mora');
      key=`${last.sequence_no}-${next?.sequence_no??999}`;label=`${fromName} → ${toName}`;order=Number(last.sequence_no);
    }
    if(!segments.has(key))segments.set(key,{label,order,count:0});
    segments.get(key).count++;
  });
  const data=[...segments.values()].sort((a,b)=>a.order-b.order),max=Math.max(...data.map(x=>x.count),1);
  el.innerHTML=`<div class="dnf-summary"><strong>${dnf.length.toLocaleString('sv-SE')} DNF av ${starters.length.toLocaleString('sv-SE')} startande</strong><span>${dns.length.toLocaleString('sv-SE')} DNS visas separat och räknas inte som avhopp under loppet.</span></div><div class="dnf-segments">${data.map(x=>`<div class="dnf-segment-row"><span>${esc(x.label)}</span><div><i style="width:${Math.max(4,x.count/max*100)}%"></i></div><strong>${x.count}</strong><small>${Math.round(x.count/dnf.length*100)} % av DNF</small></div>`).join('')}</div>`;
}
function renderSegmentHeatmap(){
  const el=$('#segmentHeatmap'),groups=new Map();activeSplits().filter(s=>s.pace_seconds_per_km&&s.sequence_no>0).forEach(s=>{if(!groups.has(s.sequence_no))groups.set(s.sequence_no,{name:s.checkpoint_name,vals:[]});groups.get(s.sequence_no).vals.push(s.pace_seconds_per_km)});
  let previous='Start';const cells=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([,g])=>{const name=segmentRangeLabel(previous,g.name);previous=g.name;return{name,med:median(g.vals),p25:quantile(g.vals,.25),p75:quantile(g.vals,.75),n:g.vals.length}});
  if(!cells.length){el.innerHTML='<div class="empty">Mellantider saknas i det aktuella urvalet</div>';return}
  const lo=Math.min(...cells.map(x=>x.med)),hi=Math.max(...cells.map(x=>x.med));
  el.innerHTML=cells.map(c=>{const t=(c.med-lo)/(hi-lo||1),h=Math.round(150-110*t),l=Math.round(31+7*(1-t));return `<div class="segment-cell" style="background:hsl(${h} 55% ${l}%)"><span>${esc(c.name.replace('Mora mål','Mora'))}</span><strong>${fmtPace(c.med)}</strong><small>Hälften av löparna: ${fmtPace(c.p25)}–${fmtPace(c.p75)} · ${c.n} tider</small></div>`}).join('');
}
function renderOvertakes(){
  const el=$('#overtakeTable'),by=new Map();
  activeSplits().filter(s=>Number.isFinite(Number(s.place_overall))&&Number(s.place_overall)>0).forEach(s=>{
    if(!by.has(s.result_id))by.set(s.result_id,[]);
    by.get(s.result_id).push(s);
  });
  const rows=[];
  by.forEach((arr,id)=>{
    arr.sort((a,b)=>a.sequence_no-b.sequence_no);
    const clean=arr.filter((x,i)=>i===0||x.sequence_no!==arr[i-1].sequence_no);
    if(clean.length<2)return;
    const first=clean[0],last=clean.at(-1),totalGain=Number(first.place_overall)-Number(last.place_overall);
    let best=null;
    for(let i=1;i<clean.length;i++){
      const a=clean[i-1],b=clean[i],gain=Number(a.place_overall)-Number(b.place_overall);
      if(gain>0&&(!best||gain>best.gain))best={gain,from:a,to:b};
    }
    const r=state.data.results.find(x=>x.id===id);
    if(r&&totalGain>0&&best)rows.push({r,totalGain,first,last,best});
  });
  rows.sort((a,b)=>b.totalGain-a.totalGain||b.best.gain-a.best.gain);
  el.innerHTML=rows.length?rows.slice(0,7).map((x,i)=>{
    const from=(x.best.from.checkpoint_name||'Kontroll').replace('Mora mål','Mora'),to=(x.best.to.checkpoint_name||'Kontroll').replace('Mora mål','Mora');
    return `<button class="overtake-row" data-id="${x.r.id}"><b>${i+1}</b><span class="overtake-person"><strong>${esc(x.r.name_as_published)}</strong><small>Totalt: plats ${x.first.place_overall} → ${x.last.place_overall} · +${x.totalGain}</small></span><span class="overtake-burst"><small>Starkaste rycket</small><strong>${esc(from)} → ${esc(to)}</strong><em>+${x.best.gain} platser · ${x.best.from.place_overall} → ${x.best.to.place_overall}</em></span></button>`;
  }).join(''):'<div class="empty">Kontrollplaceringar saknas i det aktuella urvalet.</div>';
  $$('.overtake-row').forEach(b=>b.onclick=()=>openRunner(Number(b.dataset.id)));
}
function renderYearTrend(){
  const el=$('#yearTrend'),groups=new Map();
  familyRaces().forEach(r=>groups.set(r.id,{year:r.year,times:[]}));
  state.data.results.forEach(r=>{if(Number.isFinite(Number(r.finish_seconds))&&groups.has(r.race_id))groups.get(r.race_id).times.push(Number(r.finish_seconds))});
  const rows=[...groups.values()].filter(g=>g.times.length).sort((a,b)=>a.year-b.year).map(g=>({year:g.year,med:median(g.times),n:g.times.length,p25:quantile(g.times,.25),p75:quantile(g.times,.75)}));
  if(!rows.length){el.innerHTML='<div class="empty">Ingen årsdata finns i databasen.</div>';return}
  const W=760,H=250,p={l:72,r:22,t:18,b:42};
  let lo=Math.floor(Math.min(...rows.map(x=>x.p25)) / 1800)*1800,hi=Math.ceil(Math.max(...rows.map(x=>x.p75)) / 1800)*1800;
  if(hi<=lo)hi=lo+3600;
  const x=i=>rows.length===1?(p.l+W-p.r)/2:p.l+i*(W-p.l-p.r)/(rows.length-1),y=v=>p.t+(hi-v)*(H-p.t-p.b)/(hi-lo||1);
  let out='';
  for(let i=0;i<=4;i++){
    const v=hi-(hi-lo)*i/4,yy=y(v);
    out+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:p.l-10,y:yy+4,'text-anchor':'end'},fmtTime(v).slice(0,-3));
  }
  out+=svg('line',{x1:p.l,y1:p.t,x2:p.l,y2:H-p.b,class:'axis'})+svg('line',{x1:p.l,y1:H-p.b,x2:W-p.r,y2:H-p.b,class:'axis'});
  out+=svg('text',{x:16,y:(p.t+H-p.b)/2,'text-anchor':'middle',transform:`rotate(-90 16 ${(p.t+H-p.b)/2})`},'Median sluttid');
  if(rows.length>1){
    const path=rows.map((r,i)=>`${i?'L':'M'}${x(i)} ${y(r.med)}`).join(' ');
    out+=`<path class="trend-line" d="${path}"/>`;
  }
  rows.forEach((r,i)=>{
    out+=`<line class="trend-range" x1="${x(i)}" y1="${y(r.p25)}" x2="${x(i)}" y2="${y(r.p75)}"><title>${r.year}: hälften av sluttiderna ${fmtTime(r.p25)}–${fmtTime(r.p75)}</title></line>`;
    out+=`<circle class="trend-point" cx="${x(i)}" cy="${y(r.med)}" r="6"><title>${r.year}: median ${fmtTime(r.med)} · ${r.n} fullföljande</title></circle>`+svg('text',{x:x(i),y:H-14,'text-anchor':'middle'},String(r.year));
  });
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
}
function renderPacingDNA(){
  const el=$('#pacingCards');if(!el)return;const times=state.filtered.map(r=>r.finish_seconds).filter(Boolean),men=state.filtered.filter(r=>r.sex==='M'&&r.finish_seconds).map(r=>r.finish_seconds),women=state.filtered.filter(r=>r.sex==='F'&&r.finish_seconds).map(r=>r.finish_seconds),clubs=state.filtered.filter(r=>r.club).reduce((m,r)=>(m.set(r.club,(m.get(r.club)||0)+1),m),new Map()),topClub=[...clubs.entries()].sort((a,b)=>b[1]-a[1])[0];
  const items=[['Hälften av sluttiderna',times.length?`${fmtTime(quantile(times,.25))}–${fmtTime(quantile(times,.75))}`:'–'],['Median män',fmtTime(median(men))],['Median kvinnor',fmtTime(median(women))],['Största klubb/ort',topClub?`${topClub[0]} · ${topClub[1]}`:'–']];el.innerHTML=items.map(([a,b])=>`<div class="dna-card"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('');
}
function renderTargetSimulator(){
  const select=$('#targetTimeSelect'),label=$('#targetTimeLabel'),out=$('#targetTimeResult');
  if(!select||!label||!out)return;
  const rows=state.filtered.filter(r=>r.finish_seconds&&r.overall_place).sort((a,b)=>a.finish_seconds-b.finish_seconds);
  if(!rows.length){label.textContent='–';out.innerHTML='<div><span>Underlag</span><strong>Saknas</strong></div>';select.disabled=true;select.innerHTML='';return}
  select.disabled=false;
  const min=rows[0].finish_seconds,max=rows[rows.length-1].finish_seconds;
  const roundedMin=Math.floor(min/120)*120,roundedMax=Math.ceil(max/120)*120;
  const prev=Number(select.value)||Math.round((min+max)/2/120)*120;
  const options=[];
  for(let t=roundedMin;t<=roundedMax;t+=120)options.push(t);
  if(!options.length)options.push(Math.round(min/120)*120);
  let chosen=options.includes(prev)?prev:options.reduce((a,b)=>Math.abs(b-prev)<Math.abs(a-prev)?b:a,options[0]);
  const signature=options.join(',');
  if(select.dataset.signature!==signature){
    select.innerHTML=options.map(t=>`<option value="${t}">${fmtTime(t)}</option>`).join('');
    select.dataset.signature=signature;
  }
  select.value=String(chosen);
  const t=Number(select.value);
  const closest=rows.reduce((a,b)=>Math.abs(b.finish_seconds-t)<Math.abs(a.finish_seconds-t)?b:a);
  const ahead=rows.filter(r=>r.finish_seconds<=t).length;
  const pct=Math.round(ahead/rows.length*100);
  label.textContent=fmtTime(t);
  out.innerHTML=`<div><span>Ungefärlig plats</span><strong>${closest.overall_place}</strong></div><div><span>Percentil</span><strong>Topp ${Math.max(1,pct)} %</strong></div><div><span>Närmast i data</span><strong>${esc(closest.name_as_published)}</strong></div><div><span>Skillnad</span><strong>${Math.abs(closest.finish_seconds-t)<60?'under 1 min':Math.round(Math.abs(closest.finish_seconds-t)/60)+' min'}</strong></div>`;
}


const compareState={raceId:null,selected:[]};
const MAP_SESSION_KEY='ultravasan-map-data-v2';
const MAP_LOCAL_PREFIX='ultravasan-map-data-v3:';
function createMapPayload(selected){
  const ids=new Set(selected.map(r=>r.id)),raceIds=new Set(selected.map(r=>r.race_id));
  return {
    meta:{generated_at:state.data.meta?.generated_at||new Date().toISOString(),map_payload:true},
    races:state.data.races.filter(r=>raceIds.has(r.id)),
    results:selected,
    checkpoints:state.data.checkpoints.filter(c=>raceIds.has(c.race_id)),
    splits:state.data.splits.filter(s=>ids.has(s.result_id))
  };
}
function openMapWithRunners(selected){
  const runners=(selected||[]).filter(Boolean).slice(0,5);if(!runners.length)return;
  const ids=runners.map(r=>r.id).join(','),payload=createMapPayload(runners),token=`${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  try{
    sessionStorage.setItem(MAP_SESSION_KEY,JSON.stringify(payload));
    localStorage.setItem(MAP_LOCAL_PREFIX+token,JSON.stringify(payload));
    localStorage.setItem(MAP_LOCAL_PREFIX+token+':created',String(Date.now()));
  }catch(e){console.warn('Kunde inte spara snabb kartdata',e)}
  const url=`karta.html?runners=${ids}&payload=${encodeURIComponent(token)}`;
  const win=window.open(url,'_blank');
  if(win){try{win.opener=null}catch{}}else location.href=url;
}
window.openUltravasanMap=openMapWithRunners;
function setupMapCompare(rebuild=false){
  const year=$('#compareYear'),races=familyRaces().slice().sort((a,b)=>b.year-a.year);
  year.innerHTML='<option value="all">Alla år</option>'+races.map(r=>`<option value="${r.id}">${r.year}</option>`).join('');
  year.value=String(state.raceId||races[0]?.id||'all');compareState.raceId=year.value==='all'?'all':Number(year.value);
  year.onchange=()=>{compareState.raceId=year.value==='all'?'all':Number(year.value);$('#compareRunnerSearch').value='';hideCompareSuggestions();renderCompareSelection()};
  const search=$('#compareRunnerSearch');search.addEventListener('input',renderCompareSuggestions);search.addEventListener('focus',renderCompareSuggestions);
  search.addEventListener('keydown',e=>{if(e.key==='Escape')hideCompareSuggestions();if(e.key==='Enter'){const first=$('.runner-suggestion');if(first){e.preventDefault();first.click()}}});
  document.addEventListener('click',e=>{if(!e.target.closest('.runner-picker'))hideCompareSuggestions()});
  $('#compareMapButton').onclick=()=>openMapWithRunners(compareState.selected);
  renderCompareSelection();
}
function compareRaceResults(){return compareState.raceId==='all'?familyResults():state.data.results.filter(r=>r.race_id===compareState.raceId)}
function renderCompareSuggestions(){
  const q=$('#compareRunnerSearch').value.trim().toLowerCase(),box=$('#runnerSuggestions');
  if(!q){box.hidden=true;return}
  const selectedIds=new Set(compareState.selected.map(r=>r.id));
  const matches=compareRaceResults().filter(r=>!selectedIds.has(r.id)&&`${r.name_as_published} ${r.bib||''} ${r.club||''}`.toLowerCase().includes(q)).sort((a,b)=>(a.finish_seconds??Infinity)-(b.finish_seconds??Infinity)).slice(0,12);
  box.innerHTML=matches.length?matches.map(r=>`<button class="runner-suggestion" data-id="${r.id}"><span><strong>${esc(r.name_as_published)}</strong><small>${r.bib?'#'+esc(r.bib)+' · ':''}${state.data.races.find(x=>x.id===r.race_id)?.year||''} · ${esc(r.age_class||'Ingen klass')}${r.club?' · '+esc(r.club):''}</small></span><span class="suggestion-time">${fmtTime(r.finish_seconds)}</span></button>`).join(''):'<div class="empty" style="padding:18px">Ingen löpare hittades</div>';
  box.hidden=false;$$('.runner-suggestion').forEach(b=>b.onclick=()=>addCompareRunner(Number(b.dataset.id)));
}
function addCompareRunner(id){
  if(compareState.selected.length>=5)return;
  const r=state.data.results.find(x=>x.id===id&&(compareState.raceId==='all'||x.race_id===compareState.raceId));if(!r||compareState.selected.some(x=>x.id===id))return;
  compareState.selected.push(r);$('#compareRunnerSearch').value='';hideCompareSuggestions();renderCompareSelection();$('#compareRunnerSearch').focus();
}
function removeCompareRunner(id){compareState.selected=compareState.selected.filter(r=>r.id!==id);renderCompareSelection()}
function hideCompareSuggestions(){const box=$('#runnerSuggestions');if(box)box.hidden=true}
function renderCompareSelection(){
  const box=$('#selectedCompareRunners');box.innerHTML=compareState.selected.length?compareState.selected.map((r,i)=>`<button class="runner-chip" data-id="${r.id}" title="Ta bort ${esc(r.name_as_published)}"><span>${i+1}. ${esc(r.name_as_published)} · ${state.data.races.find(x=>x.id===r.race_id)?.year||''}${r.bib?' #'+esc(r.bib):''}</span><span>×</span></button>`).join(''):'<span class="selection-empty">Inga löpare valda ännu · välj upp till fem</span>';
  $$('.runner-chip').forEach(b=>b.onclick=()=>removeCompareRunner(Number(b.dataset.id)));$('#compareMapButton').disabled=compareState.selected.length<1;const search=$('#compareRunnerSearch');search.disabled=compareState.selected.length>=5;search.placeholder=search.disabled?'Fem löpare är valda':'Skriv namn eller startnummer';
  const years=compareState.selected.map(r=>state.data.races.find(x=>x.id===r.race_id)?.year).filter(Number.isFinite),mixed=years.some(y=>y<2023)&&years.some(y=>y>=2023),warning=$('#courseComparisonWarning');if(warning)warning.hidden=!mixed;
}

const MAIN_SEARCH_LIMIT=14;
function setupMainRunnerSearch(rebuild=false){
  const input=$('#nameFilter'),box=$('#mainRunnerSuggestions'),year=$('#mainSearchYear');
  if(!input||!box||!year||input.dataset.suggestionsReady)return;
  input.dataset.suggestionsReady='1';
  const races=familyRaces().slice().sort((a,b)=>b.year-a.year);
  year.innerHTML='<option value="all">Alla år</option>'+races.map(r=>`<option value="${r.id}">${r.year}</option>`).join('');
  year.value='all';
  const rowsForYear=()=>year.value==='all'?familyResults():state.data.results.filter(r=>r.race_id===Number(year.value));
  const show=()=>{
    const q=input.value.trim().toLowerCase();
    if(q.length<1){box.hidden=true;box.innerHTML='';return}
    const rows=rowsForYear().filter(r=>`${r.name_as_published||''} ${r.club||''} ${r.bib||''}`.toLowerCase().includes(q));
    rows.sort((a,b)=>{
      const an=String(a.name_as_published||'').toLowerCase(),bn=String(b.name_as_published||'').toLowerCase();
      const ap=an.startsWith(q)?0:1,bp=bn.startsWith(q)?0:1;
      return ap-bp||(state.data.races.find(x=>x.id===b.race_id)?.year||0)-(state.data.races.find(x=>x.id===a.race_id)?.year||0)||(a.overall_place??Infinity)-(b.overall_place??Infinity)||an.localeCompare(bn,'sv');
    });
    const seen=new Set(),matches=[];
    for(const r of rows){const key=`${r.id}`;if(seen.has(key))continue;seen.add(key);matches.push(r);if(matches.length>=MAIN_SEARCH_LIMIT)break}
    box.innerHTML=matches.length?matches.map(r=>{const race=state.data.races.find(x=>x.id===r.race_id);return `<button type="button" class="main-runner-suggestion" data-id="${r.id}"><span><strong>${esc(r.name_as_published)}</strong><small>${race?.year||'–'}${r.bib?' · #'+esc(r.bib):''} · ${esc(r.age_class||'Ingen klass')}${r.club?' · '+esc(r.club):''}</small></span><em>${r.finish_seconds?fmtTime(r.finish_seconds):esc(r.status||'–')}</em></button>`}).join(''):'<div class="search-no-hit">Ingen löpare hittades</div>';
    box.hidden=false;
  };
  input.addEventListener('input',show);input.addEventListener('focus',show);year.addEventListener('change',()=>{input.value='';box.hidden=true;input.focus()});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){box.hidden=true;return}if(e.key==='Enter'){const first=box.querySelector('.main-runner-suggestion');if(first){e.preventDefault();first.click()}}});
  box.addEventListener('click',e=>{const b=e.target.closest('.main-runner-suggestion');if(!b)return;const r=state.data.results.find(x=>x.id===Number(b.dataset.id));if(!r)return;box.hidden=true;openRunner(r.id)});
  document.addEventListener('click',e=>{if(!e.target.closest('.runner-lookup-panel'))box.hidden=true});
}

const INFO_HELP_EXTENDED=[
  ['.analysis-nav','Navigera direkt till översikt, genusperspektiv, klassanalys, statistik för klubb/ort, löparlista eller kartduell. Den aktuella vyn kan delas med länken Dela vy.'],
  ['#individual-analysis','Den individuella delen öppnar en löparprofil eller bygger en kartduell. Valen påverkar inte statistiken för hela startfältet.'],
  ['.runner-lookup-panel','Välj ett specifikt år eller Alla år och sök sedan på namn eller startnummer. Året visas i varje sökförslag.'],
  ['#overview','Filtrera lopp- och fältstatistiken efter år, kön, åldersklass, klubb/ort och status. Dessa filter påverkar alla efterföljande diagram och tabeller.'],
  ['.compare-panel','Välj en till fem löpare och öppna en separat kartvy. Officiella mellantider används som fasta hållpunkter och positionen beräknas mellan kontrollerna.'],
  ['.kpis article:nth-child(1)','Antalet resultat som återstår efter de filter du har valt.'],
  ['.kpis article:nth-child(2)','Medianen är den mittersta sluttiden: hälften är snabbare och hälften långsammare.'],
  ['.kpis article:nth-child(3)','Den snabbaste registrerade sluttiden i det aktuella urvalet.'],
  ['.kpis article:nth-child(4)','Andelen i urvalet som har en registrerad måltid. DNS och DNF saknar normalt sluttid.'],
  ['#histogram','Visar hur sluttiderna fördelar sig. Varje stapel samlar löpare inom ett tidsintervall och delas upp efter kön när båda grupperna finns i urvalet.'],
  ['#paceChart','Visar medianfarten på varje delsträcka för det filtrerade startfältet. Farten visas i den gemensamma enheten min/km eller km/h; startpunkten saknar fartvärde eftersom ingen sträcka ännu har löpts. Saknade mellantider ingår inte.'],
  ['.stats-studio .studio-head','Statistikstudion sammanfattar sambandet mellan tid, placering, avhopp, delsträckor och historisk utveckling för det aktuella urvalet.'],
  ['#placementScatter','Varje punkt är en löpare. Diagrammet visar sambandet mellan sluttid och slutplacering. Kryssa i eller ur män och kvinnor för att fokusera jämförelsen. Håll över en punkt för detaljer.'],
  ['.target-card','Välj en sluttid i jämna minuter för att se vilken ungefärlig placering och percentil den brukar motsvara i det valda urvalet.'],
  ['#dnfFunnel','Visar på vilken del av banan registrerade DNF-löpare senast hade en säker passage. DNS räknas inte som startande och tas därför inte med bland avhoppen. En saknad passage betyder att källan inte kan placera avhoppet mer exakt.'],
  ['#segmentHeatmap','Sammanfattar medianfart och den mittersta hälftens spridning på varje delsträcka. Jämför rutorna för att se var tempot typiskt förändras, men tänk på att underlaget kan skilja sig mellan segment när passager saknas.'],
  ['#overtakeTable','Visar både löparens totala placeringsförändring och den delsträcka där flest placeringar vanns. Placering jämförs bara vid officiella passager och säger inte exakt var mellan kontrollerna en omkörning skedde.'],
  ['#yearTrend','Jämför median sluttid mellan importerade loppår. Spridningen visar intervallet där den mittersta hälften av sluttiderna ligger. Skillnader kan bero på både förhållanden, startfält och banversion.'],
  
  ['#kon .world-hero','Genusperspektivet jämför deltagande, fart, fullföljande och historisk utveckling för män och kvinnor med samma övriga filter.'],
  ['#genderPaceChart','Jämför männens och kvinnornas medianfart på varje delsträcka.'],
  ['#genderRetentionChart','Jämför varje delsträckas aggregerade fart med samma grupps genomsnittliga fart över hela loppet. 100 är gruppens snittfart; över 100 är snabbare och under 100 långsammare. Endast fullföljande med giltiga tider ingår.'],
  ['#genderHistoryChart','Visar hur deltagande och fullföljande för män och kvinnor har förändrats mellan loppåren.'],
  ['#genderInsights','Automatiska textinsikter som lyfter fram skillnader och mönster i det valda urvalet.'],
  ['#klasser .world-hero','Klasslabbet jämför åldersklasser, delsträckor, historik och prestation relativt den egna klassen.'],
  ['#classCards','Klicka på en klass för att välja eller avmarkera den i Klassduellen. Korten visar klassens storlek och centrala resultatmått.'],
  ['#classHeatmap','Raderna är åldersklasser och kolumnerna delsträckor. Välj min/km eller km/h ovanför tabellen; min/km är förvalt. Varje ruta visar klassens median på delsträckan. Färgskalan är alltid fartorienterad: grönare ruta betyder snabbare delsträcka, oavsett vald enhet. Ett streck betyder att tillräckliga mellantider saknas.'],
  ['#classCompareChart','Jämför medianfarten per delsträcka för upp till fyra valda åldersklasser. Hovra eller fokusera en punkt för klass, delsträcka och exakt värde i vald fartenhet. Endast löpare med giltig mellantid på segmentet ingår.'],
  ['#classIndexTable','Klassens starkaste prestationer visar i första hand klassvinnare och rangordnar dem efter dominans: hur många procent snabbare vinnaren var än medianen bland fullföljande i samma loppår, kön och åldersklass. Minst fem fullföljande krävs för att komma med i huvudlistan. Huvudvärdet till höger är dominansen mot klassmedianen. Stapellängden är relativ: topplistans högsta prestation fyller hela spåret och övriga visas proportionellt mot den. Under namnet ser du klassplacering, antal fullföljande, tidsmarginal till tvåan och Sälen–Mora-index som ett kompletterande percentilmått där 100 betyder bäst i klassen och 90 betyder bättre än 90 procent av jämförelsegruppen. Om underlaget är litet visas det bara som reservläge.'],
  ['#classHistoryChart','Linjerna visar median sluttid för fullföljande mot vänster tidsaxel. De grupperade staplarna visar startande och DNF mot höger personaxel för varje vald klass och år. DNS räknas inte som startande, och år utan tillräckliga resultat lämnas tomma. Hovra eller fokusera en punkt eller stapel för exakt tid respektive antal.'],
  ['#klubbar .world-hero','Klubb/ort-analysen jämför deltagande, individuella prestationer, bredd, fullföljande och utveckling för registrerade klubb- och ortsnamn. Små underlag märks tydligt.'],
  ['.club-controls','Sök och välj upp till fyra klubbar eller orter. Den senast valda visas som profil, och du kan klicka på en vald bricka för att byta profil. Kryssknappen tar bort valet.'],
  ['#clubProfile','Klubb/ort-profilen visar deltagande, fullföljande, median, klassbredd och de snabbaste löparna i urvalet.'],
  ['#clubRankings','Byt mått för att rangordna klubbar efter exempelvis antal startande, snabbast median, bredd, fullföljandegrad eller stark avslutning.'],
  ['#clubDna','Fem relativa klubbmått: fart, bredd, uthållighet, avslutning och deltagande.'],
  ['#clubCompareChart','Jämför medianfarten genom loppet för upp till fyra klubbar.'],
  ['#clubHistoryChart','Visar klubbens starter, målgångar och mediantid över åren.'],
  ['.nerd-hero','Race Intelligence Lab samlar delsträckejämförelser, percentiler, flerårshistorik, fältflöde och topplistor.'],
  ['#raceStories','Automatiska berättelser som sammanfattar det valda loppårets mest framträdande resultat och mönster.'],
  ['#segmentRanking','Välj två kontroller, klass och sortering för att jämföra prestationer på just den delen av loppet. Fart följer den gemensamma fartenheten, medan placering endast jämförs där officiella passager finns. Alla övriga aktiva loppfilter respekteras.'],
  ['#percentileLadder','Visar vilken sluttid som krävdes för att tillhöra olika nivåer bland fullföljande löpare.'],
  ['#runnerHistory','Sök en löpare och jämför personens genomförda lopp, tider och utveckling över flera år.'],
  ['#fieldFlow','Visar hur många faktiska startande som har en registrerad passage vid varje kontroll. DNF lämnar flödet efter sin sista säkra passage och DNS räknas bort. Diagrammet visar registrerad datatäckning, inte löparnas exakta position mellan kontrollerna.'],
  ['#hallOfFame','Fyra topplistor byggda på stabil löparidentitet, aldrig enbart namn. Klicka på ett namn för en karta över aktuellt loppår och löparens delsträckor. Personer utan säker gemensam identitet mellan år hålls hellre isär än slås ihop felaktigt.'],
  ['#raceFingerprint','Jämför det valda loppåret med historisk normalnivå inom flera egenskaper. Index 100 motsvarar den historiska referensen; avvikelser visar skillnad men förklarar inte orsaken. Endast år med tillräckligt jämförbara data ingår.'],
  ['.results-panel','Sök, sortera och öppna enskilda resultat i det aktuella urvalet. Klicka på en rad för officiella passager, fartvärden och interaktiv replay när ruttdata finns. Saknade fält visas som okända och fylls inte med gissningar.'],
  ['.source-panel','Friskrivning från ansvar samt uppgifter om när databasen byggdes och hur många resultat och mellantider den innehåller.']
];

let infoInteractionsReady=false,infoTipsUpgraded=false;
function setupInfoInteractions(){
  if(infoInteractionsReady)return;infoInteractionsReady=true;
  document.addEventListener('click',e=>{
    const tip=e.target.closest('.info-tip');
    if(tip){
      e.preventDefault();e.stopPropagation();
      const opening=!tip.classList.contains('open');
      document.querySelectorAll('.info-tip.open').forEach(x=>{x.classList.remove('open');x.setAttribute('aria-expanded','false')});
      if(opening){tip.classList.add('open');tip.setAttribute('aria-expanded','true')}
      return;
    }
    document.querySelectorAll('.info-tip.open').forEach(x=>{x.classList.remove('open');x.setAttribute('aria-expanded','false')});
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.info-tip.open').forEach(x=>{x.classList.remove('open');x.setAttribute('aria-expanded','false')})});
}
function addCardInfo(card,text){
  if(!card||card.dataset.infoInstalled==='v4')return;
  card.dataset.infoInstalled='v4';
  card.classList.add('has-info-tip');
  const tip=document.createElement('button');
  tip.type='button';tip.className='info-tip';tip.setAttribute('aria-label','Visa förklaring');tip.setAttribute('aria-expanded','false');
  tip.innerHTML=`<svg class="info-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="#fff" stroke="#1b7659" stroke-width="1.8"/><circle cx="12" cy="7.2" r="1.25" fill="#1b7659"/><path d="M10.8 10.3h1.8v6.1h1.3" fill="none" stroke="#1b7659" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="info-popup" role="tooltip">${esc(text)}</span>`;
  const head=[...card.children].find(x=>x.classList?.contains('panel-head'));
  if(head){
    const tools=[...head.children].find(x=>x.classList?.contains('chart-head-tools'));
    (tools||head).appendChild(tip);
  }else{
    tip.classList.add('card-info');card.appendChild(tip);
  }
}
window.addCardInfo=addCardInfo;
function installInfoTooltips(){
  if(!infoTipsUpgraded){
    document.querySelectorAll('.info-tip').forEach(x=>x.remove());
    document.querySelectorAll('[data-info-installed]').forEach(x=>delete x.dataset.infoInstalled);
    infoTipsUpgraded=true;
  }
  INFO_HELP_EXTENDED.forEach(([selector,text])=>document.querySelectorAll(selector).forEach(seed=>{
    const card=seed.matches('article,.panel,.world-hero,.nerd-hero,.studio-head')?seed:seed.closest('article,.panel,.world-hero,.nerd-hero,.studio-head');
    if(card)addCardInfo(card,text);
  }));
  const generic=[...document.querySelectorAll('article.panel,section.panel,.world-hero,.nerd-hero,.studio-head,.kpis article')];
  generic.forEach(card=>{
    if(card.dataset.infoInstalled==='v4')return;
    const heading=card.querySelector('h2,h3')?.textContent?.trim()||card.getAttribute('aria-label')||'den här delen';
    addCardInfo(card,`Visar ${heading.toLowerCase()} för det aktuella urvalet. Använd filtren högst upp för att ändra vilka resultat som ingår. Tomma värden betyder att tillräcklig verifierad data saknas.`);
  });
}
window.refreshInfoTips=installInfoTooltips;


load();
