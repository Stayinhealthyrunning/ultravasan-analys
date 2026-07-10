'use strict';
const state={data:null,filtered:[],page:1,pageSize:50,sortKey:'overall_place',sortDir:1,raceId:null};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const fmtTime=s=>{if(s==null)return '–';const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.round(s%60);return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`};
const fmtPace=s=>s==null?'–':`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')} /km`;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2};
const quantile=(a,q)=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),p=(b.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return b[l]+(b[h]-b[l])*(p-l)};
const hydrateData=d=>{const rr=new Map(d.results.map(r=>[r.id,r.race_id])),cp=new Map(d.checkpoints.map(c=>[`${c.race_id}|${c.checkpoint_key}`,c]));d.splits.forEach(s=>{const c=cp.get(`${rr.get(s.result_id)}|${s.checkpoint_key}`);if(c){s.checkpoint_name=c.name;s.sequence_no=c.sequence_no;s.distance_km=c.distance_km}if(s.is_estimated==null)s.is_estimated=0});return d};

async function load(){try{if(window.ULTRAVASAN_DATA){state.data=hydrateData(window.ULTRAVASAN_DATA);setup();return}const r=await fetch('data/ultravasan.json',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);state.data=hydrateData(await r.json());setup();}catch(e){console.error(e);$('#loading').innerHTML=`<p><strong>Databasen kunde inte läsas.</strong><br>Kontrollera att filen <code>data/ultravasan-data.js</code> finns bredvid webbplatsen.<br><small>${esc(e.message)}</small></p>`;}}
function setup(){installInfoTooltips();if(state.data.meta.coverage_note){const n=$('#dataNotice');n.hidden=false;n.textContent=state.data.meta.coverage_note}const races=state.data.races;const year=$('#yearFilter');year.innerHTML=races.slice().sort((a,b)=>b.year-a.year).map(r=>`<option value="${r.id}">${r.year}</option>`).join('');state.raceId=Number(year.value);year.onchange=()=>{state.raceId=Number(year.value);state.page=1;refreshFilters();applyFilters()};['nameFilter','sexFilter','classFilter','statusFilter'].forEach(id=>$('#'+id).addEventListener(id==='nameFilter'?'input':'change',()=>{state.page=1;applyFilters()}));$('#resetFilters').onclick=()=>{['nameFilter','sexFilter','classFilter','statusFilter'].forEach(id=>$('#'+id).value='');state.page=1;applyFilters()};$('#prevPage').onclick=()=>{if(state.page>1){state.page--;renderTable()}};$('#nextPage').onclick=()=>{if(state.page<Math.ceil(state.filtered.length/state.pageSize)){state.page++;renderTable()}};$('#downloadCsv').onclick=downloadCsv;$$('th[data-sort]').forEach(th=>th.onclick=()=>{const k=th.dataset.sort;state.sortDir=state.sortKey===k?-state.sortDir:1;state.sortKey=k;applyFilters()});$('#runnerDialog .dialog-close').onclick=()=>$('#runnerDialog').close();refreshFilters();applyFilters();setupMapCompare();setupStatsControls();$('#generatedAt').textContent=new Date(state.data.meta.generated_at).toLocaleString('sv-SE');$('#databaseSize').textContent=state.data.results.length.toLocaleString('sv-SE');$('#splitCount').textContent=state.data.splits.length.toLocaleString('sv-SE');$('#loading').classList.add('hidden')}
function raceResults(){return state.data.results.filter(r=>r.race_id===state.raceId)}
function refreshFilters(){const rr=raceResults(),classes=[...new Set(rr.map(r=>r.age_class).filter(Boolean))].sort(),statuses=[...new Set(rr.map(r=>r.status).filter(Boolean))].sort();$('#classFilter').innerHTML='<option value="">Alla klasser</option>'+classes.map(x=>`<option>${esc(x)}</option>`).join('');$('#statusFilter').innerHTML='<option value="">Alla</option>'+statuses.map(x=>`<option>${esc(x)}</option>`).join('')}
function applyFilters(){const q=$('#nameFilter').value.trim().toLowerCase(),sex=$('#sexFilter').value,cls=$('#classFilter').value,status=$('#statusFilter').value;state.filtered=raceResults().filter(r=>(!q||`${r.name_as_published} ${r.club||''} ${r.bib||''}`.toLowerCase().includes(q))&&(!sex||r.sex===sex)&&(!cls||r.age_class===cls)&&(!status||r.status===status));const key=state.sortKey,dir=state.sortDir;state.filtered.sort((a,b)=>{let av=a[key],bv=b[key];if(av==null)av=typeof bv==='string'?'\uffff':Infinity;if(bv==null)bv=typeof av==='string'?'\uffff':Infinity;return typeof av==='string'?av.localeCompare(bv,'sv')*dir:(av-bv)*dir});renderAll()}
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
  const segmentPoints=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([seq,g])=>({seq,name:g.name,value:median(g.vals)}));
  const pts=[{seq:0,name:'Sälen',value:0,isStart:true},...segmentPoints];
  const el=$('#paceChart');
  if(segmentPoints.length<1){el.innerHTML='<div class="empty">Mellantider saknas i urvalet</div>';return}
  const W=650,H=270,p={l:48,r:20,t:15,b:62};
  const max=Math.max(2,Math.ceil(Math.max(...pts.map(x=>x.value))/2)*2);
  const x=i=>p.l+i*(W-p.l-p.r)/(pts.length-1||1),y=v=>p.t+(max-v)*(H-p.t-p.b)/max;
  let out='';
  for(let i=0;i<=4;i++){
    const val=max-(max*i/4),yy=y(val);
    out+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:5,y:yy+4},val.toFixed(val%1?1:0));
  }
  const path=pts.map((d,i)=>`${i?'L':'M'}${x(i)} ${y(d.value)}`).join(' ');
  out+=`<path class="line-area" d="${path} L${x(pts.length-1)} ${H-p.b} L${x(0)} ${H-p.b} Z"/><path class="line-path" d="${path}"/>`;
  pts.forEach((d,i)=>{
    const title=d.isStart?'Sälen: startpunkt, 0 km/h':`${d.name}: median ${d.value.toFixed(1)} km/h`;
    out+=`<circle class="dot" cx="${x(i)}" cy="${y(d.value)}" r="5"><title>${title}</title></circle>`+svg('text',{x:x(i),y:H-31,'text-anchor':'middle',transform:`rotate(-30 ${x(i)} ${H-31})`},d.name.replace('Mora mål','Mora'));
  });
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
}
function renderTable(){const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));state.page=Math.min(state.page,pages);const start=(state.page-1)*state.pageSize,rows=state.filtered.slice(start,start+state.pageSize);$('#resultsBody').innerHTML=rows.length?rows.map(r=>`<tr data-id="${r.id}"><td>${r.overall_place??'–'}</td><td><div class="runner-name">${esc(r.name_as_published)}</div><div class="runner-meta">${r.bib?'#'+esc(r.bib):''}${r.city?' · '+esc(r.city):''}</div></td><td>${esc(r.sex||'–')}</td><td>${esc(r.age_class||'–')}</td><td>${esc(r.club||'–')}</td><td>${esc(r.nationality||'–')}</td><td class="time">${fmtTime(r.finish_seconds)}</td><td class="time">${fmtPace(r.pace_seconds_per_km)}</td><td><span class="status ${String(r.status).toLowerCase()}">${esc(r.status)}</span></td></tr>`).join(''):`<tr><td colspan="9" class="empty">Inga resultat matchar filtren</td></tr>`;$$('#resultsBody tr[data-id]').forEach(tr=>tr.onclick=()=>openRunner(Number(tr.dataset.id)));$('#pageLabel').textContent=`Sida ${state.page} av ${pages}`;$('#prevPage').disabled=state.page<=1;$('#nextPage').disabled=state.page>=pages;$('#resultCountLabel').textContent=`${state.filtered.length.toLocaleString('sv-SE')} resultat`}
function openRunner(id){const r=state.data.results.find(x=>x.id===id),race=state.data.races.find(x=>x.id===r.race_id),splits=state.data.splits.filter(x=>x.result_id===id).sort((a,b)=>a.sequence_no-b.sequence_no);let chart='';if(splits.length){const W=800,H=280,p={l:55,r:25,t:20,b:60},vals=splits.map(s=>s.elapsed_seconds/3600),max=Math.max(...vals),x=i=>p.l+i*(W-p.l-p.r)/(splits.length-1||1),y=v=>p.t+(max-v)*(H-p.t-p.b)/max,path=splits.map((d,i)=>`${i?'L':'M'}${x(i)} ${y(vals[i])}`).join(' ');chart=`<div class="split-chart"><svg viewBox="0 0 ${W} ${H}"><path class="line-area" d="${path} L${x(splits.length-1)} ${H-p.b} L${x(0)} ${H-p.b} Z"/><path class="line-path" d="${path}"/>${splits.map((d,i)=>`<circle class="dot" cx="${x(i)}" cy="${y(vals[i])}" r="5"><title>${d.checkpoint_name}: ${fmtTime(d.elapsed_seconds)}</title></circle><text x="${x(i)}" y="${H-28}" text-anchor="middle" transform="rotate(-25 ${x(i)} ${H-28})">${esc(d.checkpoint_name.replace('Mora mål','Mora'))}</text>`).join('')}</svg></div>`}$('#runnerDetail').innerHTML=`<div class="runner-detail"><div class="runner-title"><p class="eyebrow">${race.year} · ${esc(race.name)}</p><h2>${esc(r.name_as_published)}</h2><p>${[r.club,r.city,r.nationality].filter(Boolean).map(esc).join(' · ')||'Ingen klubbinformation'}</p></div><div class="detail-kpis"><div><span>Sluttid</span><strong>${fmtTime(r.finish_seconds)}</strong></div><div><span>Totalplats</span><strong>${r.overall_place??'–'}</strong></div><div><span>Klass</span><strong>${esc(r.age_class||'–')}</strong></div><div><span>Snittfart</span><strong>${fmtPace(r.pace_seconds_per_km)}</strong></div></div><h3>Passager och delsträckor</h3>${chart}<table class="split-table"><thead><tr><th>Kontroll</th><th>Distans</th><th>Passagetid</th><th>Delsträcka</th><th>Fart</th><th>Plats</th></tr></thead><tbody>${splits.map(s=>`<tr><td>${esc(s.checkpoint_name)}</td><td>${s.distance_km??'–'} km</td><td class="time">${fmtTime(s.elapsed_seconds)}</td><td class="time">${fmtTime(s.segment_seconds)}</td><td class="time">${fmtPace(s.pace_seconds_per_km)}</td><td>${s.place_overall??'–'}</td></tr>`).join('')||'<tr><td colspan="6">Mellantider saknas</td></tr>'}</tbody></table><p class="runner-meta">Källa: ${esc(r.source_code)} · Resultat-ID ${esc(r.source_result_id)} · Personmatchning: ${esc(r.athlete_match_status)}</p></div>`;$('#runnerDialog').showModal()}
function downloadCsv(){const cols=['overall_place','bib','name_as_published','sex','age_class','club','nationality','status','finish_seconds','pace_seconds_per_km'],header=['Placering','Startnummer','Namn','Kön','Klass','Klubb','Nation','Status','Sluttid','Snittfart'];const lines=[header,...state.filtered.map(r=>cols.map(c=>c==='finish_seconds'?fmtTime(r[c]):c==='pace_seconds_per_km'?fmtPace(r[c]):r[c]??''))].map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';'));const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ultravasan-${state.data.races.find(r=>r.id===state.raceId).year}-urval.csv`;a.click();URL.revokeObjectURL(a.href)}


function setupStatsControls(){const slider=$('#targetTimeSlider');if(slider)slider.addEventListener('input',renderTargetSimulator)}
function activeSplits(){const ids=new Set(state.filtered.map(r=>r.id));return state.data.splits.filter(s=>ids.has(s.result_id))}
function renderStatistics(){renderPlacementScatter();renderDnfFunnel();renderSegmentHeatmap();renderOvertakes();renderYearTrend();renderPacingDNA();renderTargetSimulator()}
function renderPlacementScatter(){
  const el=$('#placementScatter'),rows=state.filtered.filter(r=>r.finish_seconds&&r.overall_place);
  if(rows.length<2){el.innerHTML='<div class="empty">Minst två placerade löpare behövs</div>';return}
  const W=760,H=245,p={l:52,r:18,t:14,b:40},minT=Math.min(...rows.map(r=>r.finish_seconds)),maxT=Math.max(...rows.map(r=>r.finish_seconds)),maxP=Math.max(...rows.map(r=>r.overall_place));
  const x=t=>p.l+(t-minT)*(W-p.l-p.r)/(maxT-minT||1),y=v=>p.t+(v-1)*(H-p.t-p.b)/(maxP-1||1);let out='';
  for(let i=0;i<=4;i++){const yy=p.t+(H-p.t-p.b)*i/4,place=Math.round(1+(maxP-1)*i/4);out+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:7,y:yy+4},String(place))}
  for(let i=0;i<=4;i++){const t=minT+(maxT-minT)*i/4,xx=x(t);out+=svg('text',{x:xx,y:H-12,'text-anchor':'middle'},fmtTime(t).slice(0,-3))}
  out+=rows.map(r=>`<circle class="scatter-point" cx="${x(r.finish_seconds)}" cy="${y(r.overall_place)}" r="4.5"><title>${esc(r.name_as_published)} · ${fmtTime(r.finish_seconds)} · plats ${r.overall_place}</title></circle>`).join('');
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
}
function renderDnfFunnel(){
  const el=$('#dnfFunnel'),rows=state.filtered,splits=activeSplits(),finishers=rows.filter(r=>r.finish_seconds).length;
  if(!rows.length){el.innerHTML='<div class="empty">Inget underlag</div>';return}
  const cp=new Map();splits.forEach(s=>{if(!cp.has(s.sequence_no))cp.set(s.sequence_no,{name:s.checkpoint_name,ids:new Set()});cp.get(s.sequence_no).ids.add(s.result_id)});
  const splitCoverage=new Set(splits.map(s=>s.result_id)).size/rows.length;
  if(splitCoverage<.35){el.innerHTML=`<div class="empty">Mellantider finns ännu bara för ${Math.round(splitCoverage*100)} % av urvalet. Tratten aktiveras när full data importerats.</div>`;return}
  const stages=[{name:'Start',count:rows.length},...[...cp.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>({name:v.name.replace('Mora mål','Mål'),count:v.ids.size}))];
  if(!stages.some(x=>/mål/i.test(x.name)))stages.push({name:'Mål',count:finishers});const max=stages[0].count||1;
  el.innerHTML=stages.map(s=>`<div class="funnel-row"><span title="${esc(s.name)}">${esc(s.name)}</span><div class="funnel-bar"><i style="width:${Math.max(2,s.count/max*100)}%"></i></div><strong>${s.count}</strong></div>`).join('');
}
function renderSegmentHeatmap(){
  const el=$('#segmentHeatmap'),groups=new Map();activeSplits().filter(s=>s.pace_seconds_per_km&&s.sequence_no>0).forEach(s=>{if(!groups.has(s.sequence_no))groups.set(s.sequence_no,{name:s.checkpoint_name,vals:[]});groups.get(s.sequence_no).vals.push(s.pace_seconds_per_km)});
  const cells=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([,g])=>({name:g.name,med:median(g.vals),p25:quantile(g.vals,.25),p75:quantile(g.vals,.75),n:g.vals.length}));
  if(!cells.length){el.innerHTML='<div class="empty">Delsträcksfarter visas när mellantider importerats</div>';return}
  const lo=Math.min(...cells.map(x=>x.med)),hi=Math.max(...cells.map(x=>x.med));
  el.innerHTML=cells.map(c=>{const t=(c.med-lo)/(hi-lo||1),h=Math.round(150-110*t),l=Math.round(31+7*(1-t));return `<div class="segment-cell" style="background:hsl(${h} 55% ${l}%)"><span>${esc(c.name.replace('Mora mål','Mora'))}</span><strong>${fmtPace(c.med).replace(' /km','')}</strong><small>Hälften av löparna: ${fmtPace(c.p25).replace(' /km','')}–${fmtPace(c.p75).replace(' /km','')} · ${c.n} tider</small></div>`}).join('');
}
function renderOvertakes(){
  const el=$('#overtakeTable'),by=new Map();activeSplits().filter(s=>s.place_overall).forEach(s=>{if(!by.has(s.result_id))by.set(s.result_id,[]);by.get(s.result_id).push(s)});
  const rows=[];by.forEach((arr,id)=>{arr.sort((a,b)=>a.sequence_no-b.sequence_no);if(arr.length<2)return;const gain=arr[0].place_overall-arr[arr.length-1].place_overall,r=state.data.results.find(x=>x.id===id);if(r&&gain>0)rows.push({r,gain,from:arr[0].checkpoint_name,to:arr[arr.length-1].checkpoint_name})});rows.sort((a,b)=>b.gain-a.gain);
  el.innerHTML=rows.length?rows.slice(0,6).map((x,i)=>`<div class="rank-row"><b>${i+1}</b><span title="${esc(x.r.name_as_published)}">${esc(x.r.name_as_published)}</span><strong>+${x.gain} platser</strong></div>`).join(''):'<div class="empty">Kontrollplaceringar saknas ännu</div>';
}
function renderYearTrend(){
  const el=$('#yearTrend'),groups=new Map();state.data.races.forEach(r=>groups.set(r.id,{year:r.year,times:[]}));state.data.results.forEach(r=>{if(r.finish_seconds&&groups.has(r.race_id))groups.get(r.race_id).times.push(r.finish_seconds)});const rows=[...groups.values()].filter(g=>g.times.length).sort((a,b)=>a.year-b.year).map(g=>({year:g.year,med:median(g.times),n:g.times.length}));
  if(rows.length<2){el.innerHTML='<div class="empty">Här visas median, spridning och deltagarantal när fler loppår har importerats.</div>';return}
  const W=760,H=235,p={l:55,r:20,t:15,b:36},lo=Math.min(...rows.map(x=>x.med))*.97,hi=Math.max(...rows.map(x=>x.med))*1.03,x=i=>p.l+i*(W-p.l-p.r)/(rows.length-1),y=v=>p.t+(hi-v)*(H-p.t-p.b)/(hi-lo||1),path=rows.map((r,i)=>`${i?'L':'M'}${x(i)} ${y(r.med)}`).join(' ');let out=`<path class="trend-line" d="${path}"/>`;
  rows.forEach((r,i)=>{out+=`<circle class="trend-point" cx="${x(i)}" cy="${y(r.med)}" r="6"><title>${r.year}: median ${fmtTime(r.med)}, ${r.n} löpare</title></circle>`+svg('text',{x:x(i),y:H-12,'text-anchor':'middle'},String(r.year))});el.innerHTML=`<svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
}
function renderPacingDNA(){
  const el=$('#pacingCards'),times=state.filtered.map(r=>r.finish_seconds).filter(Boolean),men=state.filtered.filter(r=>r.sex==='M'&&r.finish_seconds).map(r=>r.finish_seconds),women=state.filtered.filter(r=>r.sex==='F'&&r.finish_seconds).map(r=>r.finish_seconds),clubs=state.filtered.filter(r=>r.club).reduce((m,r)=>(m.set(r.club,(m.get(r.club)||0)+1),m),new Map()),topClub=[...clubs.entries()].sort((a,b)=>b[1]-a[1])[0];
  const items=[['Hälften av sluttiderna',times.length?`${fmtTime(quantile(times,.25))}–${fmtTime(quantile(times,.75))}`:'–'],['Median män',fmtTime(median(men))],['Median kvinnor',fmtTime(median(women))],['Största klubb',topClub?`${topClub[0]} · ${topClub[1]}`:'–']];el.innerHTML=items.map(([a,b])=>`<div class="dna-card"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('');
}
function renderTargetSimulator(){
  const slider=$('#targetTimeSlider'),label=$('#targetTimeLabel'),out=$('#targetTimeResult');if(!slider||!label||!out)return;const rows=state.filtered.filter(r=>r.finish_seconds&&r.overall_place).sort((a,b)=>a.finish_seconds-b.finish_seconds);if(!rows.length){label.textContent='–';out.innerHTML='<div><span>Underlag</span><strong>Saknas</strong></div>';slider.disabled=true;return}slider.disabled=false;const min=rows[0].finish_seconds,max=rows[rows.length-1].finish_seconds,t=min+(max-min)*(Number(slider.value)/100),closest=rows.reduce((a,b)=>Math.abs(b.finish_seconds-t)<Math.abs(a.finish_seconds-t)?b:a),ahead=rows.filter(r=>r.finish_seconds<=t).length,pct=Math.round(ahead/rows.length*100);label.textContent=fmtTime(t);out.innerHTML=`<div><span>Ungefärlig plats</span><strong>${closest.overall_place}</strong></div><div><span>Percentil</span><strong>Topp ${Math.max(1,pct)} %</strong></div><div><span>Närmast i data</span><strong>${esc(closest.name_as_published)}</strong></div><div><span>Skillnad</span><strong>${Math.abs(closest.finish_seconds-t)<60?'under 1 min':Math.round(Math.abs(closest.finish_seconds-t)/60)+' min'}</strong></div>`;
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
function setupMapCompare(){
  const year=$('#compareYear'),races=state.data.races.slice().sort((a,b)=>b.year-a.year);
  year.innerHTML='<option value="all">Alla år</option>'+races.map(r=>`<option value="${r.id}">${r.year}</option>`).join('');
  year.value=String(state.raceId||races[0]?.id||'all');compareState.raceId=year.value==='all'?'all':Number(year.value);
  year.onchange=()=>{compareState.raceId=year.value==='all'?'all':Number(year.value);$('#compareRunnerSearch').value='';hideCompareSuggestions();renderCompareSelection()};
  const search=$('#compareRunnerSearch');search.addEventListener('input',renderCompareSuggestions);search.addEventListener('focus',renderCompareSuggestions);
  search.addEventListener('keydown',e=>{if(e.key==='Escape')hideCompareSuggestions();if(e.key==='Enter'){const first=$('.runner-suggestion');if(first){e.preventDefault();first.click()}}});
  document.addEventListener('click',e=>{if(!e.target.closest('.runner-picker'))hideCompareSuggestions()});
  $('#compareMapButton').onclick=()=>openMapWithRunners(compareState.selected);
  renderCompareSelection();
}
function compareRaceResults(){return compareState.raceId==='all'?state.data.results:state.data.results.filter(r=>r.race_id===compareState.raceId)}
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
}

const INFO_HELP=[
  ['.compare-panel','Välj en till fem löpare och öppna en separat kartvy där deras beräknade positioner spelas upp. Officiella mellantider används som fasta hållpunkter.'],
  ['.kpis article:nth-child(1)','Antalet resultat som återstår efter de filter du har valt.'],
  ['.kpis article:nth-child(2)','Medianen är den mittersta sluttiden: hälften är snabbare och hälften långsammare.'],
  ['.kpis article:nth-child(3)','Den snabbaste registrerade sluttiden i det aktuella urvalet.'],
  ['.kpis article:nth-child(4)','Andelen i urvalet som har en registrerad måltid.'],
  ['#histogram','Visar hur sluttiderna fördelar sig. Varje stapel samlar löpare inom ett tidsintervall.'],
  ['#paceChart','Visar medianhastigheten på varje delsträcka i km/h. Sälen är startpunkten och visas därför som 0 km/h.'],
  ['#placementScatter','Varje punkt är en löpare. Diagrammet visar sambandet mellan sluttid och slutplacering.'],
  ['.target-card','Dra reglaget för att se vilken ungefärlig placering en viss sluttid motsvarar i det valda urvalet.'],
  ['#dnfFunnel','Visar hur många deltagare som fortfarande har en registrerad passage vid respektive kontroll.'],
  ['#segmentHeatmap','Sammanfattar medianfart och spridning för varje delsträcka.'],
  ['#overtakeTable','Rangordnar löpare som förbättrat sin placering mest mellan registrerade kontrollpassager.'],
  ['#yearTrend','Jämför loppårens mediana sluttid och deltagarantal.'],
  ['#pacingCards','En snabb sammanfattning av det aktuella urvalets tider, kön och klubbar.'],
  ['#segmentRanking','Välj två kontroller och jämför vilka löpare som var snabbast eller avancerade mest just där.'],
  ['#percentileLadder','Visar vilken sluttid som krävdes för att tillhöra olika delar av resultatfältet.'],
  ['#runnerHistory','Sök en löpare och jämför personens genomförda lopp över flera år.'],
  ['#fieldFlow','Visar hur många registrerade deltagare som når varje kontroll från Sälen till Mora.'],
  ['#hallOfFame','Topplistor för lång erfarenhet, förbättring, jämnhet och stark avslutning.'],
  ['#raceFingerprint','Jämför det valda loppåret med den historiska normalnivån.'],
  ['.results-panel','Den sök- och sorterbara resultattabellen. Klicka på en rad för löparens kontrolltider.'],
  ['.source-panel','Information om datakälla, uppdateringstid och hur många poster databasen innehåller.']
];
function installInfoTooltips(){
  INFO_HELP.forEach(([selector,text])=>{
    const seed=document.querySelector(selector);if(!seed)return;
    const card=seed.matches('article,.panel')?seed:seed.closest('article,.panel');if(!card||card.dataset.infoInstalled)return;
    card.dataset.infoInstalled='1';
    const tip=document.createElement('span');tip.className='info-tip';tip.tabIndex=0;tip.setAttribute('role','button');tip.setAttribute('aria-label','Mer information');
    tip.innerHTML=`i<span class="info-popup">${esc(text)}</span>`;
    const head=card.querySelector('.panel-head');
    if(head){const pill=head.querySelector('.pill');pill?head.insertBefore(tip,pill):head.appendChild(tip)}else{tip.classList.add('card-info');card.appendChild(tip)}
  });
}

load();
