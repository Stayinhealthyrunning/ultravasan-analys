'use strict';
/* Sälen–Mora Splits: genusperspektiv, klasser, klubbar och mobil interaktion. */
const audienceRaceFamily=r=>String(r?.race_key||'').startsWith('ultravasan45-')?'uv45':String(r?.race_key||'').startsWith('ultravasan90-')?'uv90':null;
function selectAudienceRace(races,family,year){
  const sameFamily=(races||[]).filter(r=>audienceRaceFamily(r)===family).sort((a,b)=>Number(b.year)-Number(a.year));
  if(!sameFamily.length)return null;
  const requestedYear=Number(year);
  return sameFamily.find(r=>Number(r.year)===requestedYear)||sameFamily[0];
}
function aggregateSpeedKmh(samples,minSamples=2){
  const valid=(samples||[]).map(sample=>({distanceKm:Number(sample?.distanceKm),seconds:Number(sample?.seconds)})).filter(sample=>sample.distanceKm>0&&sample.seconds>0&&sample.distanceKm/(sample.seconds/3600)<=30);
  if(valid.length<minSamples)return null;
  const distance=valid.reduce((sum,sample)=>sum+sample.distanceKm,0),seconds=valid.reduce((sum,sample)=>sum+sample.seconds,0);
  return distance>0&&seconds>0?distance/(seconds/3600):null;
}
const speedIndex=(speed,reference)=>Number.isFinite(Number(speed))&&Number(speed)>0&&Number.isFinite(Number(reference))&&Number(reference)>0?Number(speed)/Number(reference)*100:null;
const relativeToplistWidth=(value,maxValue)=>{const v=Number(value),max=Number(maxValue);return Number.isFinite(v)&&v>=0&&Number.isFinite(max)&&max>0?Math.min(100,v/max*100):0};
const visibleCountBarHeight=(value,maxValue,plotHeight)=>{const v=Number(value),max=Number(maxValue),height=Number(plotHeight);if(!Number.isFinite(v)||v<=0||!Number.isFinite(max)||max<=0||!Number.isFinite(height)||height<=0)return 0;return Math.min(height,Math.max(2,v/max*height))};
if(typeof module!=='undefined'&&module.exports)module.exports={audienceRaceFamily,selectAudienceRace,aggregateSpeedKmh,speedIndex,relativeToplistWidth,visibleCountBarHeight};

if(typeof window!=='undefined'&&typeof document!=='undefined')(() => {
  const COLORS={male:'#2563eb',female:'#db2777',unknown:'#8b9a94',green:'#167253',lime:'#d8e35d',orange:'#e86f3b',purple:'#7c3aed',gold:'#d99a24'};
  const CLASS_COLORS=['#167253','#d99a24','#7c3aed','#0f8b8d','#e86f3b','#4f46e5','#9a6b1f','#0e7490'];
  const advanced={ready:false,clubMetric:'largest',classSelection:[],clubSelection:[],clubKeyByResult:new Map(),clubDisplay:new Map(),resultById:new Map(),splitsByResult:new Map(),splitEvidence:new Set(),smIndex:new Map(),classIndexMode:'dominance',classHeatUnit:'pace',yearTimer:null,currentClubStats:[],clubSearchReady:false};
  const sexKey=r=>{const s=String(r?.sex||'').toUpperCase();return s==='F'||s==='W'||s==='K'||s==='D'?'F':s==='M'||s==='H'?'M':'U'};
  const sexLabel=s=>s==='M'?'Män':s==='F'?'Kvinnor':'Okänt';
  const resultStatus=r=>window.ResultStatus.classify(r,{hasSplit:advanced.splitEvidence.has(r?.id)});
  const isStarter=r=>resultStatus(r).started;
  const isDns=r=>resultStatus(r).dns;
  const isDnf=r=>resultStatus(r).dnf;
  const isDsq=r=>resultStatus(r).dsq;
  const isFinished=r=>resultStatus(r).finished;
  const summarizeStatus=rows=>window.ResultStatus.summarize(rows,{splitEvidence:advanced.splitEvidence});
  const normText=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/&/g,' OCH ').replace(/\bIDROTTSKLUBB\b/g,' IK ').replace(/\bIDROTTSFORENING\b/g,' IF ').replace(/\bFRIIDROTTSKLUBB\b/g,' FK ').replace(/\bAKTIEBOLAG\b|\bAB\b|\bSWEDEN\b|\bSVERIGE\b/g,' ').replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const normClass=v=>{let s=String(v||'Okänd').toUpperCase().replace(/\s+/g,'');if(/^H\d/.test(s))s='M'+s.slice(1);if(/^D\d/.test(s)||/^K\d/.test(s))s='W'+s.slice(1);return s||'Okänd'};
  const classInfo=v=>{const s=normClass(v),sex=s.startsWith('W')?0:s.startsWith('M')?1:2,m=s.match(/(\d{1,3})/),age=m?Number(m[1]):999,tail=s.replace(/^[A-Z]?\d{1,3}/,'');return {s,sex,age,tail}};
  const compareClasses=(a,b)=>{const A=classInfo(a),B=classInfo(b);return A.sex-B.sex||A.age-B.age||A.tail.localeCompare(B.tail,'sv')||A.s.localeCompare(B.s,'sv')};
  const clubKey=name=>normText(name)||'';
  const clubValue=r=>String(r?.club||r?.city||'').trim();
  const raceYear=id=>state.data.races.find(r=>r.id===id)?.year||'';
  const qValue=()=>document.querySelector('#nameFilter')?.value.trim().toLowerCase()||'';
  const filterValues=()=>({sex:document.querySelector('#sexFilter')?.value||'',cls:document.querySelector('#classFilter')?.value||'',club:document.querySelector('#clubFilter')?.value||'',status:document.querySelector('#statusFilter')?.value||'',q:''});
  const matchesFilters=(r,{ignoreYear=false,ignoreSex=false,ignoreClass=false,ignoreClub=false}={})=>{
    const f=filterValues();
    if(!ignoreYear&&r.race_id!==state.raceId)return false;
    if(!ignoreSex&&f.sex&&sexKey(r)!==f.sex)return false;
    if(!ignoreClass&&f.cls&&r.age_class!==f.cls)return false;
    if(!ignoreClub&&f.club&&advanced.clubKeyByResult.get(r.id)!==f.club)return false;
    if(f.status&&r.status!==f.status)return false;
    return true;
  };
  const filteredAcrossYears=opts=>familyResults().filter(r=>matchesFilters(r,{...opts,ignoreYear:true}));
  const filteredCurrent=opts=>state.data.results.filter(r=>matchesFilters(r,opts));
  const vals=(rows,key)=>rows.map(r=>Number(r[key])).filter(Number.isFinite);
  const pct=(n,d)=>d?Math.round(n/d*1000)/10:0;
  const safeMed=a=>a.length?median(a):null;
  const fmtHour=s=>s==null?'–':fmtTime(s).replace(/:00$/,'');
  const fmtHeatPace=speed=>{if(!Number.isFinite(speed)||speed<=0)return '–';let sec=Math.round(3600/speed),min=Math.floor(sec/60),rest=sec%60;return `${min}:${String(rest).padStart(2,'0')}`};
  const currentSpeedUnit=()=>window.SpeedUnits?.get?.()||'pace';
  const speedDisplayValue=speed=>currentSpeedUnit()==='pace'?window.SpeedUnits.paceFromSpeed(speed):speed;
  const formatSpeed=speed=>window.SpeedUnits?.formatSpeed?.(speed,currentSpeedUnit())??(Number.isFinite(speed)?`${speed.toFixed(1)} km/h`:'–');
  const formatSpeedAxis=value=>currentSpeedUnit()==='pace'?window.SpeedUnits.formatPaceSeconds(value,{suffix:false}):Number(value).toFixed(1);
  function wireChartTooltips(el){
    const tooltip=el.querySelector('.interactive-chart-tooltip');if(!tooltip)return;
    const show=mark=>{tooltip.textContent=mark.dataset.chartTip||'';tooltip.hidden=false;tooltip.style.left=`${mark.dataset.chartX||50}%`;tooltip.style.top=`${mark.dataset.chartY||50}%`},hide=()=>{tooltip.hidden=true};
    el.querySelectorAll('[data-chart-tip]').forEach(mark=>{mark.addEventListener('mouseenter',()=>show(mark));mark.addEventListener('mouseleave',hide);mark.addEventListener('focus',()=>show(mark));mark.addEventListener('blur',hide)});
  }
  const cpList=()=>state.data.checkpoints.filter(c=>c.race_id===state.raceId).sort((a,b)=>a.sequence_no-b.sequence_no);
  const cleanCp=v=>String(v||'').replace('Mora mål','Mora').replace('Start Sälen','Start').trim();
  const segmentPairs=cps=>{let previous='Start';return cps.map(c=>{const pair={checkpoint:c,from:previous,to:cleanCp(c.name),label:`${cleanCp(previous)||'Start'} – ${cleanCp(c.name)}`};previous=c.name;return pair})};
  const compactCheckpointName=value=>{
    const name=cleanCp(value)||'Start',abbreviations={
      'Högsta punkten':'HP','Mångsbodarna':'Mångs.','Evertsberg':'Evertsb.','Hökberg':'Hökb.','Mora Förvarning':'Mora förv.'
    };
    return abbreviations[name]||name;
  };
  const compactSegmentLabel=pair=>`${compactCheckpointName(pair.from)}–${compactCheckpointName(pair.to)}`;
  const segmentHeader=(from,to)=>`<span>${esc(cleanCp(from)||'Start')}</span><span>${esc(cleanCp(to))}</span>`;
  const splitRowsForResults=rows=>{const ids=new Set(rows.map(r=>r.id));return state.data.splits.filter(s=>ids.has(s.result_id))};
  const segmentSpeeds=(rows,seq)=>{const out=[];rows.forEach(r=>(advanced.splitsByResult.get(r.id)||[]).forEach(s=>{if(Number(s.sequence_no)===Number(seq)&&Number(s.pace_seconds_per_km)>0){const v=3600/Number(s.pace_seconds_per_km);if(Number.isFinite(v)&&v>0&&v<30)out.push(v)}}));return out};
  const resultSex=id=>sexKey(advanced.resultById.get(id));
  const svgText=(x,y,text,attrs='')=>`<text x="${x}" y="${y}" ${attrs}>${esc(text)}</text>`;
  const chartLegend=()=>`<span class="inline-sex-legend"><i style="background:${COLORS.male}"></i>Män <i style="background:${COLORS.female}"></i>Kvinnor</span>`;
  const SEX_CONTROL_IDS={histogram:['histogramSexM','histogramSexF'],pace:['paceSexM','paceSexF'],placement:['placementSexM','placementSexF'],dnf:['dnfSexM','dnfSexF'],segment:['segmentSexM','segmentSexF'],year:['yearSexM','yearSexF'],genderPace:['genderPaceSexM','genderPaceSexF'],genderRetention:['genderRetentionSexM','genderRetentionSexF'],genderHistory:['genderHistorySexM','genderHistorySexF'],percentile:['percentileSexM','percentileSexF']};
  const sexVisibility=key=>{const ids=SEX_CONTROL_IDS[key]||[];return{M:ids[0]?document.querySelector('#'+ids[0])?.checked!==false:true,F:ids[1]?document.querySelector('#'+ids[1])?.checked!==false:true}};
  const visibleSexes=key=>{const v=sexVisibility(key);return['M','F'].filter(s=>v[s])};
  const filterRowsForSexControl=(rows,key)=>{const v=sexVisibility(key);return rows.filter(r=>(v.M&&sexKey(r)==='M')||(v.F&&sexKey(r)==='F'))};

  function buildCaches(){
    state.data.results.forEach(r=>advanced.resultById.set(r.id,r));
    state.data.splits.forEach(s=>{if(!advanced.splitsByResult.has(s.result_id))advanced.splitsByResult.set(s.result_id,[]);advanced.splitsByResult.get(s.result_id).push(s);if(Number(s.elapsed_seconds)>0||Number(s.segment_seconds)>0)advanced.splitEvidence.add(s.result_id)});
    advanced.splitsByResult.forEach(a=>a.sort((x,y)=>(x.sequence_no??0)-(y.sequence_no??0)));
    const variants=new Map();
    state.data.results.forEach(r=>{const raw=clubValue(r),k=clubKey(raw);advanced.clubKeyByResult.set(r.id,k);if(!k)return;if(!variants.has(k))variants.set(k,new Map());const m=variants.get(k);m.set(raw,(m.get(raw)||0)+1)});
    variants.forEach((m,k)=>advanced.clubDisplay.set(k,[...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'sv'))[0][0]));
    buildSmIndex();
  }
  function buildSmIndex(){
    const groups=new Map();
    state.data.results.filter(isFinished).forEach(r=>{const k=`${r.race_id}|${sexKey(r)}|${normClass(r.age_class)}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)});
    groups.forEach(rows=>{rows.sort((a,b)=>a.finish_seconds-b.finish_seconds);rows.forEach((r,i)=>advanced.smIndex.set(r.id,rows.length===1?100:100*(rows.length-1-i)/(rows.length-1)))})
  }

  function currentClubOptions(){
    const counts=new Map();raceResults().forEach(r=>{const k=advanced.clubKeyByResult.get(r.id);if(k)counts.set(k,(counts.get(k)||0)+1)});
    return [...counts].map(([key,count])=>({key,name:advanced.clubDisplay.get(key)||key,count})).sort((a,b)=>a.name.localeCompare(b.name,'sv'));
  }
  function clubSearchMarkup(items){return items.map(x=>`<button type="button" class="club-search-option" data-key="${esc(x.key)}"><strong>${esc(x.name)}</strong><small>${x.count!=null?`${x.count} resultat`:''}</small></button>`).join('')||'<div class="club-search-empty">Ingen klubb eller ort hittades</div>'}
  function wireClubSearch(input,box,provider,onSelect,{clearAction=null}={}){
    if(!input||!box||input.dataset.clubSearchReady)return;input.dataset.clubSearchReady='1';
    const show=()=>{const q=normText(input.value);const options=provider();const matches=(q?options.filter(x=>normText(x.name).includes(q)):options).slice(0,15);box.innerHTML=clubSearchMarkup(matches);box.hidden=false};
    input.addEventListener('focus',show);input.addEventListener('input',()=>{if(!input.value.trim()&&clearAction)clearAction();show()});
    input.addEventListener('keydown',e=>{if(e.key==='Escape'){box.hidden=true;return}if(e.key==='Enter'){const first=box.querySelector('.club-search-option');if(first){e.preventDefault();first.click()}}});
    box.addEventListener('click',e=>{const b=e.target.closest('.club-search-option');if(!b)return;const item=provider().find(x=>x.key===b.dataset.key);if(item){input.value=item.name;box.hidden=true;onSelect(item)}});
  }
  function setupClubSearches(){
    if(advanced.clubSearchReady)return;advanced.clubSearchReady=true;
    const filterInput=document.querySelector('#clubFilterSearch'),filterHidden=document.querySelector('#clubFilter');
    wireClubSearch(filterInput,document.querySelector('#clubFilterSuggestions'),currentClubOptions,item=>{filterHidden.value=item.key;state.page=1;applyFilters()},{clearAction:()=>{if(filterHidden.value){filterHidden.value='';state.page=1;applyFilters()}}});
    filterInput?.addEventListener('input',()=>{if(!filterHidden.value)return;const selectedName=advanced.clubDisplay.get(filterHidden.value)||'';if(filterInput.value.trim()!==selectedName){const typed=filterInput.value;filterHidden.value='';state.page=1;applyFilters();filterInput.value=typed}});
    wireClubSearch(document.querySelector('#clubCompareSearch'),document.querySelector('#clubCompareSuggestions'),()=>advanced.currentClubStats.filter(x=>!advanced.clubSelection.includes(x.key)).map(x=>({key:x.key,name:x.name,count:x.starters})),item=>{if(!advanced.clubSelection.includes(item.key)&&advanced.clubSelection.length<4)advanced.clubSelection.push(item.key);const active=document.querySelector('#clubProfileSelect');if(active)active.value=item.key;document.querySelector('#clubCompareSearch').value='';renderClubWorld()},{clearAction:()=>{}});
    document.addEventListener('click',e=>{if(!e.target.closest('.club-search-label'))document.querySelectorAll('.club-search-suggestions').forEach(x=>x.hidden=true)});
  }
  function populateClubFilter(){
    const el=document.querySelector('#clubFilter');if(!el)return;const old=el.value,rows=currentClubOptions();
    el.innerHTML='<option value="">Alla klubbar/orter</option>'+rows.map(x=>`<option value="${esc(x.key)}">${esc(x.name)} (${x.count})</option>`).join('');
    el.value=rows.some(x=>x.key===old)?old:'';
    const input=document.querySelector('#clubFilterSearch');if(input){input.value=el.value?(rows.find(x=>x.key===el.value)?.name||''):''}
  }

  function patchFilters(){
    const legacyRefresh=refreshFilters;
    refreshFilters=function(){const oldClass=document.querySelector('#classFilter')?.value||'',oldStatus=document.querySelector('#statusFilter')?.value||'';legacyRefresh();if(oldClass&&[...document.querySelector('#classFilter').options].some(o=>o.value===oldClass))document.querySelector('#classFilter').value=oldClass;if(oldStatus&&[...document.querySelector('#statusFilter').options].some(o=>o.value===oldStatus))document.querySelector('#statusFilter').value=oldStatus;populateClubFilter()};
    applyFilters=function(){
      const f=filterValues();state.filtered=raceResults().filter(r=>(!f.sex||sexKey(r)===f.sex)&&(!f.cls||r.age_class===f.cls)&&(!f.club||advanced.clubKeyByResult.get(r.id)===f.club)&&(!f.status||r.status===f.status));
      state.sortKey='overall_place';state.sortDir=1;state.filtered.sort((a,b)=>(Number(a.overall_place)||Infinity)-(Number(b.overall_place)||Infinity)||String(a.name_as_published||'').localeCompare(String(b.name_as_published||''),'sv'));
      syncUrl();renderAll();renderAudienceWorlds();
    };
    const club=document.querySelector('#clubFilter');club?.addEventListener('change',()=>{state.page=1;applyFilters()});
    const oldReset=document.querySelector('#resetFilters').onclick;document.querySelector('#resetFilters').onclick=e=>{oldReset?.call(e.currentTarget,e);if(club)club.value='';const ci=document.querySelector('#clubFilterSearch');if(ci)ci.value='';applyFilters()};
  }

  function syncUrl(){
    const f=filterValues(),race=state.data.races.find(r=>r.id===state.raceId),u=new URL(location.href);[['race',state.raceFamily],['year',race?.year],['sex',f.sex],['class',f.cls],['club',f.club],['status',f.status]].forEach(([k,v])=>v?u.searchParams.set(k,v):u.searchParams.delete(k));history.replaceState(null,'',u);
  }
  function restoreUrl(){
    const p=new URLSearchParams(location.search),requestedFamily=['uv90','uv45'].includes(p.get('race'))?p.get('race'):state.raceFamily,race=selectAudienceRace(state.data.races,requestedFamily,p.get('year'));if(race){if(state.raceFamily!==requestedFamily)switchRaceFamily(requestedFamily,true);document.querySelector('#yearFilter').value=String(race.id);state.raceId=race.id;refreshFilters()}
    const map={sex:'sexFilter',class:'classFilter',club:'clubFilter',status:'statusFilter'};Object.entries(map).forEach(([k,id])=>{const v=p.get(k),el=document.querySelector('#'+id);if(v&&el&&([...el.options||[]].length===0||[...el.options||[]].some(o=>o.value===v)||el.tagName==='INPUT'))el.value=v});const club=document.querySelector('#clubFilter'),clubInput=document.querySelector('#clubFilterSearch');if(clubInput&&club?.value)clubInput.value=advanced.clubDisplay.get(club.value)||'';
  }

  function patchOverviewCharts(){
    renderHistogram=function(){
      const vis=sexVisibility('histogram'),rows=filterRowsForSexControl(state.filtered.filter(isFinished),'histogram'),el=document.querySelector('#histogram');
      if(!vis.M&&!vis.F){el.innerHTML='<div class="empty">Välj minst ett kön</div>';document.querySelector('#distributionLabel').textContent='';return}
      if(!rows.length){el.innerHTML='<div class="empty">Inga sluttider för valt kön i urvalet</div>';document.querySelector('#distributionLabel').textContent='';return}
      const times=rows.map(r=>r.finish_seconds),min=Math.floor(Math.min(...times)/1800)*1800,max=Math.ceil(Math.max(...times)/1800)*1800,bins=Math.max(5,Math.min(16,Math.ceil((max-min)/1800))),step=(max-min)/bins||1800;
      const counts=Array.from({length:bins},()=>({M:0,F:0}));rows.forEach(r=>counts[Math.min(bins-1,Math.floor((r.finish_seconds-min)/step))][sexKey(r)]++);
      const series=visibleSexes('histogram'),W=680,H=280,p={l:45,r:16,t:18,b:44},cw=(W-p.l-p.r)/bins,ymax=Math.max(...counts.map(c=>series.reduce((sum,s)=>sum+c[s],0)),1);let out='';
      for(let i=0;i<=4;i++){const y=p.t+(H-p.t-p.b)*i/4;out+=svg('line',{x1:p.l,y1:y,x2:W-p.r,y2:y,class:'gridline'})+svg('text',{x:6,y:y+4},String(Math.round(ymax*(1-i/4))))}
      counts.forEach((c,i)=>{const x=p.l+i*cw+2;let base=H-p.b;series.forEach(k=>{const color=k==='M'?COLORS.male:COLORS.female;if(!c[k])return;const h=(H-p.t-p.b)*c[k]/ymax;base-=h;out+=`<rect x="${x}" y="${base}" width="${Math.max(2,cw-4)}" height="${h}" rx="2" fill="${color}" class="sex-bar"><title>${sexLabel(k)}: ${c[k]} · ${fmtTime(min+i*step)}–${fmtTime(min+(i+1)*step)}</title></rect>`});if(i%Math.ceil(bins/6)===0)out+=svg('text',{x,y:H-18},`${Math.floor((min+i*step)/3600)} h`)});
      out+=svg('line',{x1:p.l,y1:H-p.b,x2:W-p.r,y2:H-p.b,class:'axis'});el.innerHTML=`<svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
      const labels=[];if(vis.M)labels.push(`Män ${fmtTime(safeMed(rows.filter(r=>sexKey(r)==='M').map(r=>r.finish_seconds)))}`);if(vis.F)labels.push(`Kvinnor ${fmtTime(safeMed(rows.filter(r=>sexKey(r)==='F').map(r=>r.finish_seconds)))}`);document.querySelector('#distributionLabel').textContent=`Median: ${labels.join(' · ')}`;
    };
    renderPaceChart=function(){renderSexPaceChart(document.querySelector('#paceChart'),state.filtered,true,false,'pace')};
    renderPlacementScatter=function(){
      const el=document.querySelector('#placementScatter'),rows=filterRowsForSexControl(state.filtered.filter(r=>r.finish_seconds&&r.overall_place),'placement');
      if(!visibleSexes('placement').length){el.innerHTML='<div class="empty">Välj minst ett kön i placeringsmotorn</div>';return}
      if(rows.length<2){el.innerHTML='<div class="empty">Minst två placerade löpare behövs</div>';return}
      const W=780,H=255,p={l:54,r:20,t:18,b:42},minT=Math.min(...rows.map(r=>r.finish_seconds)),maxT=Math.max(...rows.map(r=>r.finish_seconds)),maxP=Math.max(...rows.map(r=>r.overall_place)),x=t=>p.l+(t-minT)*(W-p.l-p.r)/(maxT-minT||1),y=v=>p.t+(v-1)*(H-p.t-p.b)/(maxP-1||1);let out='';
      for(let i=0;i<=4;i++){const yy=p.t+(H-p.t-p.b)*i/4,place=Math.round(1+(maxP-1)*i/4);out+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:7,y:yy+4},String(place))}
      for(let i=0;i<=4;i++){const tt=minT+(maxT-minT)*i/4,xx=x(tt);out+=svg('text',{x:xx,y:H-12,'text-anchor':'middle'},fmtTime(tt).slice(0,-3))}
      rows.forEach(r=>{const sx=sexKey(r),color=sx==='M'?COLORS.male:COLORS.female,cx=x(r.finish_seconds),cy=y(r.overall_place),title=`${r.name_as_published} · ${sexLabel(sx)} · ${fmtTime(r.finish_seconds)} · plats ${r.overall_place}`;out+=sx==='F'?`<path d="M${cx} ${cy-5} L${cx+5} ${cy} L${cx} ${cy+5} L${cx-5} ${cy} Z" fill="${color}" opacity=".72"><title>${esc(title)}</title></path>`:`<circle cx="${cx}" cy="${cy}" r="4.2" fill="${color}" opacity=".68"><title>${esc(title)}</title></circle>`});
      el.innerHTML=`<svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
    };
    renderDnfFunnel=renderGenderDnf;
    renderSegmentHeatmap=function(){
      const el=document.querySelector('#segmentHeatmap'),vis=sexVisibility('segment'),selected=visibleSexes('segment');if(!selected.length){el.innerHTML='<div class="empty">Välj minst ett kön</div>';return}
      const rows=filterRowsForSexControl(state.filtered,'segment'),ids=new Set(rows.map(r=>r.id)),groups=new Map();state.data.splits.filter(s=>ids.has(s.result_id)&&s.pace_seconds_per_km&&s.sequence_no>0).forEach(s=>{if(!groups.has(s.sequence_no))groups.set(s.sequence_no,{name:s.checkpoint_name,M:[],F:[]});const k=resultSex(s.result_id);if(groups.get(s.sequence_no)[k])groups.get(s.sequence_no)[k].push(Number(s.pace_seconds_per_km))});
      let previous='Start';const cells=[...groups].sort((a,b)=>a[0]-b[0]).map(([,g])=>{const label=`${cleanCp(previous)||'Start'} – ${cleanCp(g.name)}`;previous=g.name;return {...g,label}});if(!cells.length){el.innerHTML='<div class="empty">Mellantider saknas i det aktuella urvalet</div>';return}
      el.innerHTML=cells.map(c=>`<div class="segment-cell sex-segment-cell ${selected.length===1?'single-sex':''}"><span>${esc(c.label)}</span>${vis.M?`<div><b class="male">M</b><strong>${fmtPace(safeMed(c.M))}</strong></div>`:''}${vis.F?`<div><b class="female">K</b><strong>${fmtPace(safeMed(c.F))}</strong></div>`:''}<small>${selected.reduce((n,s)=>n+c[s].length,0)} registrerade tider</small></div>`).join('');
    };
    renderYearTrend=renderSexYearTrend;
  }

  function renderSexPaceChart(el,rows,includeStart=false,relative=false,controlKey='pace'){
    if(!el)return;const selected=visibleSexes(controlKey);if(!selected.length){el.innerHTML='<div class="empty">Välj minst ett kön</div>';return}
    rows=filterRowsForSexControl(rows,controlKey);const race=state.data.races.find(r=>r.id===state.raceId),eligible=relative?rows.filter(isFinished):rows,ids=new Set(eligible.map(r=>r.id)),cpBySeq=new Map(cpList().map(c=>[Number(c.sequence_no),Number(c.distance_km)])),groups=new Map();
    state.data.splits.filter(s=>ids.has(s.result_id)&&Number(s.pace_seconds_per_km)>0).forEach(s=>{const speed=3600/Number(s.pace_seconds_per_km),seq=Number(s.sequence_no),distance=Number(s.distance_km)-Number(cpBySeq.get(seq-1)??0),seconds=Number(s.segment_seconds);if(!Number.isFinite(speed)||speed<=0||speed>30)return;if(!groups.has(seq))groups.set(seq,{name:s.checkpoint_name,M:[],F:[]});const sx=resultSex(s.result_id);if(!groups.get(seq)[sx])return;groups.get(seq)[sx].push(relative?{distanceKm:distance,seconds}:speed)});
    const references={};if(relative)selected.forEach(s=>{references[s]=aggregateSpeedKmh(eligible.filter(r=>sexKey(r)===s).map(r=>({distanceKm:Number(race?.distance_km),seconds:Number(r.finish_seconds)})))});
    let previous='Start';const points=[...groups].sort((a,b)=>a[0]-b[0]).map(([seq,g])=>{const name=`${cleanCp(previous)||'Start'} – ${cleanCp(g.name)}`;previous=g.name;return{seq,name,M:relative?speedIndex(aggregateSpeedKmh(g.M),references.M):safeMed(g.M),F:relative?speedIndex(aggregateSpeedKmh(g.F),references.F):safeMed(g.F)}});if(!points.length){el.innerHTML=`<div class="empty">${relative?'Minst två fullföljande med giltiga tider behövs per grupp.':'Mellantider saknas i urvalet.'}</div>`;return}
    if(includeStart)points.unshift({seq:0,name:state.raceFamily==='uv45'?'Oxberg start':'Sälen',M:null,F:null});
    const series=selected.filter(s=>points.some(p=>Number.isFinite(p[s])));if(!series.length){el.innerHTML=`<div class="empty">${relative?'Minst två fullföljande med giltiga tider behövs per grupp.':'Mellantider saknas för valt kön.'}</div>`;return}
    const paceMode=!relative&&currentSpeedUnit()==='pace';if(!relative)points.forEach(point=>series.forEach(s=>{if(Number.isFinite(point[s]))point[s]=speedDisplayValue(point[s])}));
    const W=760,H=relative?330:300,pad={l:58,r:24,t:24,b:relative?112:82},all=points.flatMap(p=>series.map(s=>p[s]).filter(Number.isFinite)),rawMin=Math.min(...all),rawMax=Math.max(...all),max=relative?Math.max(120,Math.ceil(rawMax/10)*10):rawMax,min=relative?Math.min(70,Math.floor(rawMin/10)*10):rawMin,x=i=>pad.l+i*(W-pad.l-pad.r)/(points.length-1||1),y=v=>paceMode?pad.t+(v-min)*(H-pad.t-pad.b)/(max-min||1):pad.t+(max-v)*(H-pad.t-pad.b)/(max-min||1);let out='';
    for(let i=0;i<=4;i++){const v=paceMode?min+(max-min)*i/4:max-(max-min)*i/4,yy=y(v),label=relative?`${Math.round(v)}`:formatSpeedAxis(v);out+=svg('line',{x1:pad.l,y1:yy,x2:W-pad.r,y2:yy,class:'gridline'})+svg('text',{x:5,y:yy+4},label)}
    if(relative&&min<=100&&max>=100)out+=svg('line',{x1:pad.l,y1:y(100),x2:W-pad.r,y2:y(100),class:'pace-reference-line'})+svg('text',{x:W-pad.r,y:y(100)-6,'text-anchor':'end',class:'pace-reference-label'},'Snitt 100');
    series.forEach(s=>{const color=s==='M'?COLORS.male:COLORS.female,valid=points.map((d,i)=>({d,i})).filter(({d})=>Number.isFinite(d[s])),path=valid.map(({d,i},j)=>`${j?'L':'M'}${x(i)} ${y(d[s])}`).join(' ');out+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;valid.forEach(({d,i})=>{const title=`${sexLabel(s)} · ${d.name}: ${relative?d[s].toFixed(0)+' index':paceMode?window.SpeedUnits.formatPaceSeconds(d[s]):window.SpeedUnits.formatSpeedKmh(d[s])}`;out+=s==='F'?`<path d="M${x(i)} ${y(d[s])-5}l5 5-5 5-5-5z" fill="${color}"><title>${esc(title)}</title></path>`:`<circle cx="${x(i)}" cy="${y(d[s])}" r="5" fill="${color}" stroke="#fff" stroke-width="2"><title>${esc(title)}</title></circle>`})});
    points.forEach((d,i)=>out+=svg('text',{x:x(i),y:H-(relative?54:29),'text-anchor':'middle',transform:`rotate(-34 ${x(i)} ${H-(relative?54:29)})`,class:relative?'pace-segment-label':''},String(d.name||'').replace('Mora mål','Mora')));
    el.innerHTML=`<svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
  }

  function renderGenderDnf(){
    const el=document.querySelector('#dnfFunnel'),selected=visibleSexes('dnf');if(!el)return;if(!selected.length){el.innerHTML='<div class="empty">Välj minst ett kön</div>';return}
    const rows=filterRowsForSexControl(state.filtered,'dnf');if(!rows.length){el.innerHTML='<div class="empty">Inget underlag för valt kön</div>';return}
    const starters=rows.filter(isStarter),dnf=starters.filter(isDnf),dns=rows.filter(isDns),dsq=rows.filter(isDsq);if(!dnf.length){el.innerHTML=`<div class="dnf-summary"><strong>Inga registrerade DNF</strong><span>${starters.length.toLocaleString('sv-SE')} startande · ${dns.length.toLocaleString('sv-SE')} DNS · ${dsq.length.toLocaleString('sv-SE')} DSQ.</span></div>`;return}
    const cps=cpList(),segments=new Map();dnf.forEach(r=>{const arr=(advanced.splitsByResult.get(r.id)||[]).filter(s=>Number.isFinite(Number(s.sequence_no))).sort((a,b)=>a.sequence_no-b.sequence_no),last=arr.at(-1);let key='unknown',label='Plats saknas i källdatan',order=999;if(last){const from=cps.find(c=>c.sequence_no===last.sequence_no),next=cps.find(c=>c.sequence_no>last.sequence_no);label=`${(from?.name||last.checkpoint_name||'Senaste kontroll').replace('Mora mål','Mora')} → ${(next?.name||'Mora').replace('Mora mål','Mora')}`;key=`${last.sequence_no}-${next?.sequence_no??999}`;order=Number(last.sequence_no)}if(!segments.has(key))segments.set(key,{label,order,M:0,F:0});segments.get(key)[sexKey(r)]++});
    const data=[...segments.values()].sort((a,b)=>a.order-b.order),max=Math.max(...data.map(x=>selected.reduce((n,s)=>n+x[s],0)),1),summary=selected.map(s=>`${sexLabel(s)} ${dnf.filter(r=>sexKey(r)===s).length}`).join(' · ');
    el.innerHTML=`<div class="dnf-summary"><strong>${dnf.length.toLocaleString('sv-SE')} DNF av ${starters.length.toLocaleString('sv-SE')} startande</strong><span>${summary} · ${dns.length} DNS räknas inte som startande · ${dsq.length} DSQ redovisas separat.</span></div><div class="dnf-segments sex-dnf">${data.map(x=>{const total=selected.reduce((n,s)=>n+x[s],0),w=total/max*100;return `<div class="dnf-segment-row"><span>${esc(x.label)}</span><div class="dnf-bar-track"><div class="dnf-bar-fill" style="width:${Math.max(8,w)}%">${selected.map(s=>`<i class="${s==='M'?'male':'female'}" style="width:${total?x[s]/total*100:0}%"></i>`).join('')}</div></div><strong>${total}<span>DNF</span></strong><small>${selected.map(s=>`<b class="${s==='M'?'male-text':'female-text'}">${s==='M'?'M':'K'} ${x[s]}</b>`).join(' · ')}</small></div>`}).join('')}</div>`;
  }

  function renderSexYearTrend(){
    const el=document.querySelector('#yearTrend'),selected=visibleSexes('year');if(!el)return;if(!selected.length){el.innerHTML='<div class="empty">Välj minst ett kön</div>';return}
    const rows=filteredAcrossYears({ignoreSex:true}),years=familyRaces().slice().sort((a,b)=>a.year-b.year),data=years.map(r=>{const rr=rows.filter(x=>x.race_id===r.id&&isFinished(x));return{year:r.year,M:safeMed(rr.filter(x=>sexKey(x)==='M').map(x=>x.finish_seconds)),F:safeMed(rr.filter(x=>sexKey(x)==='F').map(x=>x.finish_seconds))}}).filter(x=>selected.some(s=>x[s]));if(!data.length){el.innerHTML='<div class="empty">Ingen årsdata finns för valt kön.</div>';return}
    const W=780,H=270,p={l:70,r:22,t:24,b:43},all=data.flatMap(d=>selected.map(s=>d[s]).filter(Number.isFinite)),lo=Math.floor(Math.min(...all)/1800)*1800,hi=Math.ceil(Math.max(...all)/1800)*1800,x=i=>data.length===1?(p.l+W-p.r)/2:p.l+i*(W-p.l-p.r)/(data.length-1),y=v=>p.t+(hi-v)*(H-p.t-p.b)/(hi-lo||1);let out='';for(let i=0;i<=4;i++){const v=hi-(hi-lo)*i/4,yy=y(v);out+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:p.l-10,y:yy+4,'text-anchor':'end'},fmtTime(v).slice(0,-3))}out+=svg('line',{x1:p.l,y1:p.t,x2:p.l,y2:H-p.b,class:'axis'})+svg('text',{x:17,y:(p.t+H-p.b)/2,'text-anchor':'middle',transform:`rotate(-90 17 ${(p.t+H-p.b)/2})`},'Median sluttid');
    selected.forEach(s=>{const c=s==='M'?COLORS.male:COLORS.female,valid=data.map((d,i)=>({...d,i})).filter(d=>d[s]);if(!valid.length)return;out+=`<path d="${valid.map((d,j)=>`${j?'L':'M'}${x(d.i)} ${y(d[s])}`).join(' ')}" fill="none" stroke="${c}" stroke-width="3.5"/>`;valid.forEach(d=>out+=`<circle cx="${x(d.i)}" cy="${y(d[s])}" r="5" fill="${c}" stroke="#fff" stroke-width="2"><title>${d.year} · ${sexLabel(s)}: ${fmtTime(d[s])}</title></circle>`)});data.forEach((d,i)=>out+=svg('text',{x:x(i),y:H-14,'text-anchor':'middle'},String(d.year)));el.innerHTML=`<svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
  }

  function patchNerdCharts(){
    renderPercentiles=function(){
      const el=document.querySelector('#percentileLadder'),selected=visibleSexes('percentile');if(!el)return;if(!selected.length){el.innerHTML='<div class="empty">Välj minst ett kön</div>';return}
      const rows=filterRowsForSexControl(state.filtered.filter(isFinished),'percentile'),m=rows.filter(r=>sexKey(r)==='M').map(r=>r.finish_seconds),f=rows.filter(r=>sexKey(r)==='F').map(r=>r.finish_seconds);if(selected.every(s=>(s==='M'?m:f).length<2)){el.innerHTML='<div class="empty">Fler sluttider krävs</div>';return}
      const levels=[[1,.01,'Topp 1 %'],[5,.05,'Topp 5 %'],[10,.10,'Topp 10 %'],[25,.25,'Topp 25 %'],[50,.50,'Median'],[75,.75,'75-percentilen']];el.innerHTML=levels.map(([,q,label])=>`<div class="percentile-sex-step"><span>${label}</span><div class="percentile-dual ${selected.length===1?'single-sex':''}">${selected.includes('M')?`<div class="male"><small>Män</small><strong>${fmtTime(quantile(m,q))}</strong></div>`:''}${selected.includes('F')?`<div class="female"><small>Kvinnor</small><strong>${fmtTime(quantile(f,q))}</strong></div>`:''}</div></div>`).join('');
    };
  }

  function setupSexDiagramControls(){
    if(document.documentElement.dataset.sexControlsReady)return;document.documentElement.dataset.sexControlsReady='1';
    const redraw={histogram:()=>renderHistogram(),pace:()=>renderPaceChart(),placement:()=>renderPlacementScatter(),dnf:()=>renderDnfFunnel(),segment:()=>renderSegmentHeatmap(),year:()=>renderYearTrend(),genderPace:()=>renderGenderWorld(),genderRetention:()=>renderGenderWorld(),genderHistory:()=>renderGenderWorld(),percentile:()=>renderPercentiles()};
    Object.entries(SEX_CONTROL_IDS).forEach(([key,ids])=>ids.forEach(id=>document.querySelector('#'+id)?.addEventListener('change',()=>redraw[key]?.())));
  }

  function renderAudienceWorlds(){renderGenderWorld();renderClassWorld();renderClubWorld();requestAnimationFrame(()=>window.refreshInfoTips?.())}

  

  function genderBase(){return filteredCurrent({ignoreSex:true})}
  function renderGenderWorld(){
    const rows=genderBase(),m=rows.filter(r=>sexKey(r)==='M'),f=rows.filter(r=>sexKey(r)==='F');document.querySelector('#genderKpis').innerHTML=[['Män',m,COLORS.male],['Kvinnor',f,COLORS.female]].map(([name,g,color])=>{const st=g.filter(isStarter),fin=g.filter(isFinished),dnf=st.filter(isDnf);return `<article style="--sex:${color}"><h3>${name}</h3><div><span>Startande<strong>${st.length.toLocaleString('sv-SE')}</strong></span><span>Fullföljande<strong>${pct(fin.length,st.length)} %</strong></span><span>Median<strong>${fmtTime(safeMed(fin.map(r=>r.finish_seconds)))}</strong></span><span>DNF<strong>${pct(dnf.length,st.length)} %</strong></span></div></article>`}).join('');
    renderSexPaceChart(document.querySelector('#genderPaceChart'),rows,true,false,'genderPace');renderSexPaceChart(document.querySelector('#genderRetentionChart'),rows,false,true,'genderRetention');renderGenderHistory();renderGenderInsights(m,f);
  }
  
  function renderGenderHistory(){
    const el=document.querySelector('#genderHistoryChart'),selected=visibleSexes('genderHistory');if(!el)return;if(!selected.length){el.innerHTML='<div class="empty">Välj minst ett kön</div>';return}
    const all=filteredAcrossYears({ignoreSex:true}),years=familyRaces().slice().sort((a,b)=>a.year-b.year),data=years.map(r=>{const rr=all.filter(x=>x.race_id===r.id),groups={};['M','F'].forEach(s=>{const summary=summarizeStatus(rr.filter(x=>sexKey(x)===s));groups[s]={starters:summary.starters,finishers:summary.finishers,dnf:summary.dnf,dns:summary.dns,dsq:summary.dsq,unknown:summary.unknown,rate:summary.rate}});return{year:r.year,...groups}}),W=840,H=330,p={l:66,r:72,t:48,b:48},plotHeight=H-p.t-p.b,maxN=Math.max(1,...data.flatMap(d=>selected.map(s=>d[s].starters))),roughStep=maxN/4,power=10**Math.floor(Math.log10(roughStep)),unit=roughStep/power,countStep=(unit<=1?1:unit<=2?2:unit<=5?5:10)*power,countMax=Math.ceil(maxN/countStep)*countStep,x=i=>p.l+i*(W-p.l-p.r)/(data.length-1||1),yN=v=>H-p.b-v/countMax*plotHeight,yP=v=>p.t+(100-v)*plotHeight/100;let axes='',bars='',lines='';
    for(let v=0;v<=countMax+.001;v+=countStep){const yy=yN(v);axes+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:p.l-10,y:yy+4,'text-anchor':'end'},String(Math.round(v)))}for(let v=0;v<=100;v+=25){const yy=yP(v);axes+=svg('text',{x:W-p.r+10,y:yy+4},`${v} %`)}axes+=svg('text',{x:16,y:(p.t+H-p.b)/2,'text-anchor':'middle',transform:`rotate(-90 16 ${(p.t+H-p.b)/2})`,class:'gender-history-axis-title'},'Antal startande')+svg('text',{x:W-13,y:(p.t+H-p.b)/2,'text-anchor':'middle',transform:`rotate(90 ${W-13} ${(p.t+H-p.b)/2})`,class:'gender-history-axis-title'},'Fullföljandegrad')+svg('line',{x1:p.l,y1:H-p.b,x2:W-p.r,y2:H-p.b,class:'axis'});
    const historyTip=(s,d)=>`${sexLabel(s)} · ${d.year} · ${d.starters} startande · ${d.finishers} fullföljande · ${d.dnf} DNF · ${d.dsq} DSQ · ${d.dns} DNS/ej start · ${d.rate==null?'saknar underlag':String(d.rate).replace('.',',')+' % fullföljandegrad'}`;
    data.forEach((d,i)=>{const bw=Math.max(9,Math.min(24,(W-p.l-p.r)/(data.length*(selected.length+1.7)))),totalWidth=bw*selected.length,start=x(i)-totalWidth/2;selected.forEach((s,si)=>{const point=d[s],color=s==='M'?COLORS.male:COLORS.female,px=start+si*bw,py=yN(point.starters),tip=historyTip(s,{...point,year:d.year});if(point.starters)bars+=`<rect class="gender-history-bar" x="${px}" y="${py}" width="${Math.max(7,bw-1.5)}" height="${H-p.b-py}" fill="${color}" tabindex="0" role="img" aria-label="${esc(tip)}" data-chart-tip="${esc(tip)}" data-chart-x="${Math.max(26,Math.min(74,(px+bw/2)/W*100)).toFixed(2)}" data-chart-y="${(py/H*100).toFixed(2)}"><title>${esc(tip)}</title></rect>`});axes+=svg('text',{x:x(i),y:H-15,'text-anchor':'middle'},String(d.year))});
    selected.forEach(s=>{const color=s==='M'?COLORS.male:COLORS.female,valid=data.map((d,i)=>({i,...d[s],year:d.year})).filter(d=>Number.isFinite(d.rate));if(!valid.length)return;lines+=`<path class="gender-history-rate-line" d="${valid.map((d,j)=>`${j?'L':'M'}${x(d.i)} ${yP(d.rate)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="7 5"/>`;valid.forEach(d=>{const px=x(d.i),py=yP(d.rate),tip=historyTip(s,d);lines+=`<circle class="interactive-chart-point gender-history-point" cx="${px}" cy="${py}" r="5" fill="${color}" tabindex="0" role="img" aria-label="${esc(tip)}" data-chart-tip="${esc(tip)}" data-chart-x="${Math.max(26,Math.min(74,px/W*100)).toFixed(2)}" data-chart-y="${(py/H*100).toFixed(2)}"><title>${esc(tip)}</title></circle>`})});
    el.innerHTML=`<div class="gender-history-legend">${selected.map(s=>`<span><i class="${s==='M'?'male':'female'}"></i>${sexLabel(s)}: stapel = startande · streckad linje = fullföljandegrad</span>`).join('')}</div><div class="interactive-chart-tooltip" role="status" hidden></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Deltagande och fullföljandegrad per år och kön">${axes}${bars}${lines}</svg>`;wireChartTooltips(el);
  }
  
  function closingRetention(rows){const finishers=rows.filter(isFinished),race=state.data.races.find(r=>r.id===state.raceId),reference=aggregateSpeedKmh(finishers.map(r=>({distanceKm:Number(race?.distance_km),seconds:Number(r.finish_seconds)})));if(!reference)return null;const ids=new Set(finishers.map(r=>r.id)),lastSeq=Math.max(...cpList().map(c=>Number(c.sequence_no))),lastDistance=Number(cpList().find(c=>Number(c.sequence_no)===lastSeq)?.distance_km),previousDistance=Number(cpList().find(c=>Number(c.sequence_no)===lastSeq-1)?.distance_km??0),samples=state.data.splits.filter(s=>ids.has(s.result_id)&&Number(s.sequence_no)===lastSeq).map(s=>({distanceKm:lastDistance-previousDistance,seconds:Number(s.segment_seconds)})),lastSpeed=aggregateSpeedKmh(samples);return speedIndex(lastSpeed,reference)}
  function renderGenderInsights(m,f){const el=document.querySelector('#genderInsights'),ms=m.filter(isFinished),fs=f.filter(isFinished),mstarters=m.filter(isStarter),fstarters=f.filter(isStarter),mm=safeMed(ms.map(r=>r.finish_seconds)),fm=safeMed(fs.map(r=>r.finish_seconds)),mrate=pct(ms.length,mstarters.length),frate=pct(fs.length,fstarters.length),mr=closingRetention(m),fr=closingRetention(f),femaleShare=pct(fstarters.length,mstarters.length+fstarters.length);const cards=[['Kvinnornas andel',`${femaleShare} %`,'av de faktiska startande'],['Skillnad i median',mm&&fm?`${Math.round(Math.abs(fm-mm)/60)} min`:'–',fm>mm?'kvinnornas median är senare':'kvinnornas median är tidigare'],['Fullföljandegrad',`${mrate} % / ${frate} %`,'män / kvinnor'],['Fart kvar i avslutningen',mr&&fr?`${mr.toFixed(0)} / ${fr.toFixed(0)}`:'–','index män / kvinnor, snittfarten = 100']];el.innerHTML=cards.map(([a,b,c])=>`<div><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('')}

  function classBase(){return filteredCurrent({ignoreClass:true})}
  function classGroups(rows=classBase()){const m=new Map();rows.forEach(r=>{const k=normClass(r.age_class);if(!m.has(k))m.set(k,[]);m.get(k).push(r)});return m}
  function renderClassWorld(){
    const groups=classGroups(),stats=[...groups].map(([key,rows])=>{const st=rows.filter(isStarter),fin=rows.filter(isFinished);return{key,rows,starters:st.length,finishers:fin.length,rate:pct(fin.length,st.length),median:safeMed(fin.map(r=>r.finish_seconds)),dnf:pct(st.filter(isDnf).length,st.length),top10:quantile(fin.map(r=>r.finish_seconds),.1)}}).sort((a,b)=>compareClasses(a.key,b.key));
    const valid=stats.map(x=>x.key);advanced.classSelection=advanced.classSelection.filter(x=>valid.includes(x)).sort(compareClasses);if(!advanced.classSelection.length)advanced.classSelection=stats.slice(0,4).map(x=>x.key).sort(compareClasses);
    document.querySelector('#classCards').innerHTML=stats.map(x=>`<button class="class-stat-card ${advanced.classSelection.includes(x.key)?'selected':''} ${x.key.startsWith('W')?'female-class':'male-class'}" data-class="${esc(x.key)}"><span>${esc(x.key)}</span><strong>${x.starters}</strong><small>startande · ${x.rate}% i mål</small><em>median ${fmtTime(x.median)}</em></button>`).join('');document.querySelectorAll('.class-stat-card').forEach(b=>b.onclick=()=>toggleClass(b.dataset.class));renderClassChips(stats);renderClassHeatmap(stats);renderClassCompare(stats);renderClassIndex();renderClassHistory();
  }
  function toggleClass(k){if(advanced.classSelection.includes(k))advanced.classSelection=advanced.classSelection.filter(x=>x!==k);else if(advanced.classSelection.length<4)advanced.classSelection.push(k);advanced.classSelection.sort(compareClasses);renderClassWorld()}
  function renderClassChips(stats){document.querySelector('#classChips').innerHTML=stats.map(x=>`<button class="selector-chip ${advanced.classSelection.includes(x.key)?'active':''}" data-class="${esc(x.key)}">${esc(x.key)} <small>${x.starters}</small></button>`).join('');document.querySelectorAll('#classChips .selector-chip').forEach(b=>b.onclick=()=>toggleClass(b.dataset.class))}
  function setupClassHeatUnitControls(){
    const pace=document.querySelector('#classHeatUnitPace'),speed=document.querySelector('#classHeatUnitSpeed');
    if(!pace||!speed)return;
    const sync=unit=>{advanced.classHeatUnit=unit;pace.checked=unit==='pace';speed.checked=unit==='speed';pace.closest('label')?.classList.toggle('active',unit==='pace');speed.closest('label')?.classList.toggle('active',unit==='speed');const label=document.querySelector('#classHeatUnitLabel');if(label)label.textContent=unit==='pace'?'median min/km':'median km/h'};
    if(pace.dataset.unitReady){sync(currentSpeedUnit());return}
    pace.dataset.unitReady='1';
    const apply=(unit,persist=true)=>{
      sync(unit);if(persist)window.SpeedUnits?.set?.(unit);
    };
    pace.addEventListener('change',()=>apply(pace.checked?'pace':'speed'));
    speed.addEventListener('change',()=>apply(speed.checked?'speed':'pace'));
    sync(currentSpeedUnit());
  }
  function renderClassHeatmap(stats){
    const el=document.querySelector('#classHeatmap'),rows=stats.slice().sort((a,b)=>compareClasses(a.key,b.key)),cps=cpList().filter(c=>c.sequence_no>0),pairs=segmentPairs(cps),values=[];
    const unit=advanced.classHeatUnit||'pace';
    rows.forEach(g=>cps.forEach(c=>{const v=segmentSpeeds(g.rows,c.sequence_no);if(v.length)values.push(safeMed(v))}));
    if(!rows.length||!cps.length){el.innerHTML='<div class="empty">Klasser eller mellantider saknas.</div>';return}
    const lo=values.length?Math.min(...values):0,hi=values.length?Math.max(...values):1;
    const display=med=>unit==='pace'?fmtHeatPace(med):med.toFixed(1);
    const suffix=unit==='pace'?' min/km':' km/h';
    let html=`<div class="class-map-scroll"><div class="class-map-grid" style="--segment-count:${cps.length}"><div class="class-map-corner">Klass</div>${pairs.map(p=>`<div class="class-map-head segment-range-head">${segmentHeader(p.from,p.to)}</div>`).join('')}`;
    rows.forEach(g=>{
      html+=`<button class="class-map-class ${g.key.startsWith('W')?'female-text':'male-text'}" data-class="${esc(g.key)}">${esc(g.key)}</button>`;
      cps.forEach((c,i)=>{
        const v=segmentSpeeds(g.rows,c.sequence_no),med=safeMed(v),t=med?(med-lo)/(hi-lo||1):0,hue=Math.round(45+105*t),light=Math.round(88-43*t),pair=pairs[i];
        html+=`<div class="class-map-cell" style="background:hsl(${hue} 55% ${light}%)" title="${esc(g.key)} · ${esc(pair?.label||c.name)}: ${med?display(med)+suffix:'saknas'}">${med?display(med):'–'}</div>`;
      });
    });
    el.innerHTML=html+'</div></div>';
    el.querySelectorAll('.class-map-class').forEach(b=>b.onclick=()=>toggleClass(b.dataset.class));
  }

  function renderClassCompare(stats){
    const rows=stats.filter(x=>advanced.classSelection.includes(x.key)),el=document.querySelector('#classCompareChart'),cps=cpList().filter(c=>c.sequence_no>0),pairs=segmentPairs(cps);if(!rows.length){el.innerHTML='<div class="empty">Välj minst en klass.</div>';return}
    const W=860,H=300,p={l:64,r:34,t:30,b:66},paceMode=currentSpeedUnit()==='pace',series=rows.map((g,gi)=>({key:g.key,color:CLASS_COLORS[gi%CLASS_COLORS.length],pts:cps.map(c=>safeMed(segmentSpeeds(g.rows,c.sequence_no)))})),displaySeries=series.map(s=>({...s,pts:s.pts.map(speed=>Number.isFinite(speed)?speedDisplayValue(speed):null),speeds:s.pts})),all=displaySeries.flatMap(s=>s.pts.filter(Number.isFinite));if(!all.length){el.innerHTML='<div class="empty">Mellantider saknas för valda klasser.</div>';return}
    const min=Math.min(...all),max=Math.max(...all),x=i=>p.l+i*(W-p.l-p.r)/(cps.length-1||1),y=v=>paceMode?p.t+(v-min)*(H-p.t-p.b)/(max-min||1):p.t+(max-v)*(H-p.t-p.b)/(max-min||1);let out='';
    for(let i=0;i<=4;i++){const v=paceMode?min+(max-min)*i/4:max-(max-min)*i/4,yy=y(v);out+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:p.l-9,y:yy+4,'text-anchor':'end'},formatSpeedAxis(v))}
    displaySeries.forEach(s=>{const valid=s.pts.map((v,i)=>({v,speed:s.speeds[i],i})).filter(point=>Number.isFinite(point.v));out+=`<path class="class-duel-line" d="${valid.map((d,j)=>`${j?'L':'M'}${x(d.i)} ${y(d.v)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="3"/>`;valid.forEach(d=>{const tip=`${s.key} · ${pairs[d.i]?.label||cps[d.i]?.name}: ${formatSpeed(d.speed)}`,px=x(d.i),py=y(d.v);out+=`<circle class="interactive-chart-point class-duel-point" cx="${px}" cy="${py}" r="5.5" fill="${s.color}" tabindex="0" role="img" aria-label="${esc(tip)}" data-chart-tip="${esc(tip)}" data-chart-x="${(px/W*100).toFixed(2)}" data-chart-y="${(py/H*100).toFixed(2)}"><title>${esc(tip)}</title></circle>`})});
    pairs.forEach((pair,i)=>{const px=x(i),py=H-22,full=pair.label,short=compactSegmentLabel(pair);out+=`<text x="${px}" y="${py}" text-anchor="${i===0?'start':i===pairs.length-1?'end':'middle'}" transform="rotate(-20 ${px} ${py})" class="class-duel-axis-label" tabindex="0" role="img" aria-label="${esc(full)}" data-chart-tip="${esc(full)}" data-chart-x="${Math.max(12,Math.min(88,px/W*100)).toFixed(2)}" data-chart-y="${(py/H*100).toFixed(2)}"><title>${esc(full)}</title>${esc(short)}</text>`});
    el.innerHTML=`<div class="class-chart-legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.key)}</span>`).join('')}<span>${esc(window.SpeedUnits.unitLabel())}</span></div><div class="interactive-chart-tooltip" role="status" hidden></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Klassduell med interaktiva medianpunkter">${out}</svg>`;wireChartTooltips(el);
  }
  function renderClassIndex(){
    const el=document.querySelector('#classIndexTable'),tabs=document.querySelector('#classIndexTabs');
    if(!el)return;
    const modes=[['dominance','Mest dominant'],['margin','Störst segermarginal'],['index','Högst klasspercentil']];
    if(tabs){
      if(!modes.some(([k])=>k===advanced.classIndexMode))advanced.classIndexMode='dominance';
      tabs.innerHTML=modes.map(([k,label])=>`<button class="${advanced.classIndexMode===k?'active':''}" data-mode="${k}">${label}</button>`).join('');
      tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{advanced.classIndexMode=b.dataset.mode;renderClassIndex()});
    }
    const finished=state.filtered.filter(isFinished);
    if(!finished.length){
      el.innerHTML='<div class="index-empty">Inga fullföljande löpare finns i urvalet.</div>';
      return;
    }
    const groups=new Map();
    finished.forEach(r=>{const key=`${r.race_id}|${sexKey(r)}|${normClass(r.age_class)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)});
    const rows=[];
    groups.forEach(group=>{
      group.sort((a,b)=>a.finish_seconds-b.finish_seconds);
      const n=group.length;
      const medianSec=safeMed(group.map(r=>r.finish_seconds));
      const best=group[0],second=group[1]||null;
      const dominance=medianSec&&best?.finish_seconds?((medianSec-best.finish_seconds)/medianSec*100):null;
      const margin=second?.finish_seconds!=null?second.finish_seconds-best.finish_seconds:null;
      const bestIndex=advanced.smIndex.get(best.id);
      const race=state.data.races.find(x=>x.id===best.race_id);
      const yr=race?.year||'';
      if(best&&Number.isFinite(dominance)){
        rows.push({
          type:'winner',modeEligible:n>=5,smallSample:n<5,r:best,n,medianSec,dominance,margin,index:bestIndex,year:yr,
          leadText:margin!=null?`${fmtTime(margin)} före tvåan`:'Ingen tvåa i klassen',
          meta:`${esc(normClass(best.age_class))} · ${fmtTime(best.finish_seconds)} · klass 1/${n}`
        });
      }
      if(advanced.classIndexMode==='index'){
        group.forEach((r,i)=>{
          const idx=advanced.smIndex.get(r.id);
          if(Number.isFinite(idx)&&n>=5){
            rows.push({
              type:'all',modeEligible:true,smallSample:false,r,n,medianSec,
              dominance:medianSec?((medianSec-r.finish_seconds)/medianSec*100):null,
              margin:i===0&&second?.finish_seconds!=null?second.finish_seconds-r.finish_seconds:null,
              index:idx,year:yr,
              leadText:i===0&&second?.finish_seconds!=null?`${fmtTime(second.finish_seconds-r.finish_seconds)} före tvåan`:`klassplats ${i+1}/${n}`,
              meta:`${esc(normClass(r.age_class))} · ${fmtTime(r.finish_seconds)} · klassplats ${i+1}/${n}`
            });
          }
        });
      }
    });
    let view=[];
    if(advanced.classIndexMode==='margin')view=rows.filter(x=>x.type==='winner'&&x.modeEligible&&Number.isFinite(x.margin)).sort((a,b)=>b.margin-a.margin||b.dominance-a.dominance).slice(0,10);
    else if(advanced.classIndexMode==='index')view=rows.filter(x=>x.type==='all'&&x.modeEligible).sort((a,b)=>b.index-a.index||b.dominance-a.dominance||a.r.finish_seconds-b.r.finish_seconds).slice(0,10);
    else view=rows.filter(x=>x.type==='winner'&&x.modeEligible).sort((a,b)=>b.dominance-a.dominance||b.margin-a.margin).slice(0,10);
    const reserve=rows.filter(x=>x.type==='winner'&&!x.modeEligible).sort((a,b)=>b.dominance-a.dominance).slice(0,3);
    if(!view.length&&reserve.length){
      const reserveMax=Math.max(...reserve.map(classIndexMetric).filter(Number.isFinite),0);
      el.innerHTML='<p class="index-explain">Huvudlistan kräver minst fem fullföljande i varje jämförelsegrupp. Nedan visas därför klassvinnare från mindre underlag. Stapellängden visar prestationen relativt den högsta prestationen i listan.</p>'+reserve.map((x,i)=>classIndexMarkup(x,i+1,true,reserveMax)).join('');
      el.querySelectorAll('button').forEach(b=>b.onclick=()=>openRunner(Number(b.dataset.id)));
      return;
    }
    if(!view.length){
      el.innerHTML='<div class="index-empty">För få fullföljande i varje klass för att bygga jämförelsen.</div>';
      return;
    }
    const explain=advanced.classIndexMode==='margin'
      ? 'Rangordnar klassvinnare efter tidsmarginalen ned till tvåan i samma loppår, kön och åldersklass. Minst fem fullföljande krävs.'
      : advanced.classIndexMode==='index'
        ? 'Visar de starkaste klassplaceringarna utifrån Sälen–Mora-index. 100 betyder bäst i klassen, 90 bättre än 90 procent av jämförelsegruppen. Endast grupper med minst fem fullföljande tas med.'
        : 'Rangordnar klassvinnare efter dominans: hur många procent snabbare vinnaren var än medianen bland fullföljande i samma loppår, kön och åldersklass. Minst fem fullföljande krävs.';
    const maxBarValue=Math.max(...view.map(classIndexMetric).filter(Number.isFinite),0);
    el.innerHTML=`<p class="index-explain">${explain} Stapellängden visar prestationen relativt den högsta prestationen i den aktuella topplistan.</p>${view.map((x,i)=>classIndexMarkup(x,i+1,false,maxBarValue)).join('')}`;
    el.querySelectorAll('button').forEach(b=>b.onclick=()=>openRunner(Number(b.dataset.id)));
  }
  function classIndexMetric(x){return advanced.classIndexMode==='margin'?x.margin:advanced.classIndexMode==='index'?x.index:x.dominance}
  function classIndexMarkup(x,rank,smallSample,maxBarValue){
    const dominance=Number.isFinite(x.dominance)?`${x.dominance>=0?'+':''}${x.dominance.toFixed(1)} %`:'–';
    const pctWidth=relativeToplistWidth(classIndexMetric(x),maxBarValue);
    const scoreMain=advanced.classIndexMode==='margin'
      ? (Number.isFinite(x.margin)?fmtTime(x.margin):'–')
      : advanced.classIndexMode==='index'
        ? `${x.index.toFixed(0)}`
        : dominance;
    const scoreSub=advanced.classIndexMode==='margin'
      ? 'före tvåan'
      : advanced.classIndexMode==='index'
        ? `dominans ${dominance}`
        : `index ${Number.isFinite(x.index)?x.index.toFixed(0):'–'} · ${x.n} i klassen`;
    const reason=advanced.classIndexMode==='margin'
      ? `${Number.isFinite(x.margin)?fmtTime(x.margin):'–'} före tvåan · ${dominance} mot medianen`
      : advanced.classIndexMode==='index'
        ? `${x.meta} · ${x.leadText}`
        : `${dominance} snabbare än klassmedianen · ${x.leadText}`;
    const yearText=x.year?` · ${x.year}`:'';
    return `<button data-id="${x.r.id}"><b>${rank}</b><span class="index-main"><strong>${esc(x.r.name_as_published)}</strong><small>${x.meta}${yearText}</small><em>${reason}</em><div class="index-bar"><i style="width:${pctWidth}%"></i></div><span class="index-note">Jämförelsen görs inom samma loppår, kön och åldersklass.${smallSample?' Litet underlag.':''}</span></span><span class="index-score"><strong>${scoreMain}</strong><span>${scoreSub}</span>${smallSample?'<em class="sample-pill">Litet underlag</em>':(x.n<8?'<em class="sample-pill">Smalt fält</em>':'')}</span></button>`;
  }
  function renderClassHistory(){
    const el=document.querySelector('#classHistoryChart'),all=filteredAcrossYears({ignoreClass:true}),years=familyRaces().slice().sort((a,b)=>a.year-b.year),classes=advanced.classSelection.slice().sort(compareClasses);if(!classes.length){el.innerHTML='<div class="empty">Välj klasser ovan.</div>';return}
    const data=classes.map((k,ki)=>({k,color:CLASS_COLORS[ki%CLASS_COLORS.length],pts:years.map(r=>{const rr=all.filter(x=>x.race_id===r.id&&normClass(x.age_class)===k),st=rr.filter(isStarter),fin=rr.filter(isFinished),dnf=st.filter(isDnf);return{year:r.year,med:safeMed(fin.map(x=>x.finish_seconds)),starters:st.length,dnf:dnf.length}})})),allT=data.flatMap(s=>s.pts.map(x=>x.med).filter(Number.isFinite));if(!allT.length){el.innerHTML='<div class="empty">Historik saknas för valda klasser.</div>';return}
    const W=940,H=430,p={l:74,r:74,t:48,b:44},plotHeight=H-p.t-p.b,lo=Math.floor(Math.min(...allT)/1800)*1800,hi=Math.ceil(Math.max(...allT)/1800)*1800,rawMax=Math.max(1,...data.flatMap(s=>s.pts.map(d=>d.starters))),roughStep=rawMax/5,power=10**Math.floor(Math.log10(roughStep)),unit=roughStep/power,countStep=(unit<=1?1:unit<=2?2:unit<=5?5:10)*power,maxN=Math.ceil(rawMax/countStep)*countStep,x=i=>p.l+i*(W-p.l-p.r)/(years.length-1||1),yT=v=>p.t+(hi-v)*plotHeight/(hi-lo||1),step=(W-p.l-p.r)/(years.length-1||1),groupWidth=Math.min(68,step*.76),barWidth=Math.max(3,Math.min(12,groupWidth/(classes.length*2+1)));let bars='',lines='',out='';
    for(let i=0;i<=4;i++){const v=hi-(hi-lo)*i/4,yy=yT(v);out+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:p.l-10,y:yy+4,'text-anchor':'end'},fmtTime(v).slice(0,-3))}
    for(let v=0;v<=maxN+.001;v+=countStep){const yy=p.t+plotHeight-v/maxN*plotHeight;out+=svg('line',{x1:W-p.r,y1:yy,x2:W-p.r+5,y2:yy,class:'axis'})+svg('text',{x:W-p.r+10,y:yy+4,class:'class-history-count-label'},String(Math.round(v)))}
    out+=svg('text',{x:16,y:(p.t+H-p.b)/2,'text-anchor':'middle',transform:`rotate(-90 16 ${(p.t+H-p.b)/2})`,class:'class-history-axis-title'},'Median sluttid')+svg('text',{x:W-13,y:(p.t+H-p.b)/2,'text-anchor':'middle',transform:`rotate(90 ${W-13} ${(p.t+H-p.b)/2})`,class:'class-history-axis-title'},'Antal personer')+svg('line',{x1:p.l,y1:H-p.b,x2:W-p.r,y2:H-p.b,class:'axis'});
    data.forEach((s,si)=>{s.pts.forEach((d,i)=>{const pairStart=x(i)-classes.length*barWidth+si*barWidth*2,startX=pairStart,dnfX=pairStart+barWidth,startHeight=visibleCountBarHeight(d.starters,maxN,plotHeight),dnfHeight=visibleCountBarHeight(d.dnf,maxN,plotHeight),startTip=`${s.k} ${d.year} · ${d.starters} startande`,dnfTip=`${s.k} ${d.year} · ${d.dnf} DNF`;if(startHeight)bars+=`<rect class="class-history-bar starters" x="${startX}" y="${H-p.b-startHeight}" width="${Math.max(1,barWidth-.9)}" height="${startHeight}" fill="${s.color}" tabindex="0" role="img" aria-label="${esc(startTip)}" data-chart-tip="${esc(startTip)}" data-chart-x="${((startX+barWidth/2)/W*100).toFixed(2)}" data-chart-y="${((H-p.b-startHeight)/H*100).toFixed(2)}"><title>${esc(startTip)}</title></rect>`;if(dnfHeight)bars+=`<rect class="class-history-bar dnf" x="${dnfX}" y="${H-p.b-dnfHeight}" width="${Math.max(1,barWidth-.9)}" height="${dnfHeight}" fill="${s.color}" tabindex="0" role="img" aria-label="${esc(dnfTip)}" data-chart-tip="${esc(dnfTip)}" data-chart-x="${((dnfX+barWidth/2)/W*100).toFixed(2)}" data-chart-y="${((H-p.b-dnfHeight)/H*100).toFixed(2)}"><title>${esc(dnfTip)}</title></rect>`});const valid=s.pts.map((d,i)=>({...d,i})).filter(d=>Number.isFinite(d.med));lines+=`<path class="class-history-line" d="${valid.map((d,j)=>`${j?'L':'M'}${x(d.i)} ${yT(d.med)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="3"/>`;valid.forEach(d=>{const tip=`${s.k} ${d.year} · median ${fmtTime(d.med)}`,px=x(d.i),py=yT(d.med);lines+=`<circle class="interactive-chart-point class-history-point" cx="${px}" cy="${py}" r="4.8" fill="${s.color}" tabindex="0" role="img" aria-label="${esc(tip)}" data-chart-tip="${esc(tip)}" data-chart-x="${(px/W*100).toFixed(2)}" data-chart-y="${(py/H*100).toFixed(2)}"><title>${esc(tip)}</title></circle>`})});
    years.forEach((r,i)=>out+=svg('text',{x:x(i),y:H-15,'text-anchor':'middle'},String(r.year)));
    el.innerHTML=`<div class="class-chart-legend">${data.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.k)}</span>`).join('')}</div><div class="class-history-key"><span><i class="median"></i>Median · vänster axel</span><span><i class="starters"></i>Startande · höger axel</span><span><i class="dnf"></i>DNF · höger axel</span></div><div class="interactive-chart-tooltip" role="status" hidden></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Klasshistorik: median sluttid på vänster axel samt startande och DNF på höger axel">${out}${bars}${lines}</svg>`;wireChartTooltips(el);
  }

  function clubBase(){return filteredCurrent({ignoreClub:true})}
  function clubStatsCurrent(){
    const map=new Map();clubBase().forEach(r=>{const k=advanced.clubKeyByResult.get(r.id);if(!k)return;if(!map.has(k))map.set(k,[]);map.get(k).push(r)});return [...map].map(([key,rows])=>makeClubStats(key,rows)).sort((a,b)=>b.starters-a.starters)
  }
  function closingGain(r){const a=advanced.splitsByResult.get(r.id)||[],ev=a.find(s=>String(s.checkpoint_key).toLowerCase()==='evertsberg'),last=[...a].reverse().find(s=>s.place_overall);return ev?.place_overall&&last?.place_overall?Number(ev.place_overall)-Number(last.place_overall):null}
  function makeClubStats(key,rows){const st=rows.filter(isStarter),fin=rows.filter(isFinished),indices=fin.map(r=>advanced.smIndex.get(r.id)).filter(Number.isFinite),gains=fin.map(closingGain).filter(Number.isFinite),classes=new Set(st.map(r=>normClass(r.age_class))),balance=st.length?100-Math.abs(st.filter(r=>sexKey(r)==='M').length-st.filter(r=>sexKey(r)==='F').length)/st.length*100:0;return{key,name:advanced.clubDisplay.get(key)||key,rows,starters:st.length,finishers:fin.length,rate:pct(fin.length,st.length),median:safeMed(fin.map(r=>r.finish_seconds)),medianIndex:safeMed(indices),breadth:safeMed(indices),closing:safeMed(gains),classes:classes.size,balance,top:fin.slice().sort((a,b)=>a.finish_seconds-b.finish_seconds).slice(0,20)}}
  function clubHistoryImprovement(key){const rows=familyResults().filter(r=>advanced.clubKeyByResult.get(r.id)===key&&isFinished(r)),byYear=new Map();rows.forEach(r=>{const y=raceYear(r.race_id);if(!byYear.has(y))byYear.set(y,[]);byYear.get(y).push(advanced.smIndex.get(r.id))});const pts=[...byYear].filter(([,v])=>v.filter(Number.isFinite).length>=3).sort((a,b)=>a[0]-b[0]).map(([y,v])=>({y,med:safeMed(v.filter(Number.isFinite))}));return pts.length>1?pts.at(-1).med-pts[0].med:null}
  function renderClubWorld(){
    const stats=clubStatsCurrent();advanced.currentClubStats=stats;
    const profile=document.querySelector('#clubProfile'),select=document.querySelector('#clubProfileSelect');
    const dna=document.querySelector('#clubDna'),history=document.querySelector('#clubHistoryChart');
    if(!stats.length){if(profile)profile.innerHTML='<div class="empty panel">Inga klubbar eller orter i urvalet.</div>';if(select)select.value='';if(dna)dna.innerHTML='<div class="empty">Ingen klubb/ort vald.</div>';if(history)history.innerHTML='<div class="empty">Ingen klubb/ort vald.</div>';return}
    const keys=stats.map(x=>x.key);
    advanced.clubSelection=advanced.clubSelection.filter(k=>keys.includes(k));
    let selectedKey=keys.includes(select?.value)&&advanced.clubSelection.includes(select.value)?select.value:'';
    if(!selectedKey&&advanced.clubSelection.length)selectedKey=advanced.clubSelection.at(-1);
    if(select)select.value=selectedKey;
    renderClubCompareChips(stats);renderClubRankingTabs();renderClubRankings(stats);renderClubCompare(stats);renderClubHistory(stats);
    if(selectedKey){const c=stats.find(x=>x.key===selectedKey);renderClubProfile(c,stats)}
    else{if(profile)profile.innerHTML='<div class="empty panel club-profile-placeholder"><strong>Sök och välj en klubb eller ort</strong><span>Den senast valda klubben eller orten visas som profil.</span></div>';if(dna)dna.innerHTML='<div class="empty">Välj en klubb/ort ovan för att visa klubbens profil.</div>';if(history)history.innerHTML='<div class="empty">Välj en klubb/ort ovan för att visa historiken.</div>'}
  }
  function renderClubCompareChips(stats){
    const el=document.querySelector('#clubCompareChips');if(!el)return;
    const active=document.querySelector('#clubProfileSelect')?.value||'';
    const selected=advanced.clubSelection.map(k=>stats.find(x=>x.key===k)).filter(Boolean);
    el.innerHTML=selected.length?selected.map(x=>`<span class="club-choice-chip ${active===x.key?'active':''}"><button type="button" class="club-choice-select" data-club="${esc(x.key)}" title="Visa profil för ${esc(x.name)}">${esc(x.name)}</button><button type="button" class="club-choice-remove" data-remove="${esc(x.key)}" aria-label="Ta bort ${esc(x.name)}">×</button></span>`).join(''):'<span class="selection-empty">Sök och lägg till upp till fyra klubbar/orter</span>';
    el.querySelectorAll('.club-choice-select').forEach(b=>b.onclick=()=>{const hidden=document.querySelector('#clubProfileSelect');if(hidden)hidden.value=b.dataset.club;renderClubWorld()});
    el.querySelectorAll('.club-choice-remove').forEach(b=>b.onclick=()=>{advanced.clubSelection=advanced.clubSelection.filter(x=>x!==b.dataset.remove);const hidden=document.querySelector('#clubProfileSelect');if(hidden?.value===b.dataset.remove)hidden.value=advanced.clubSelection.at(-1)||'';renderClubWorld()});
  }
  function renderClubProfile(c,all){const el=document.querySelector('#clubProfile'),small=c.starters<5;el.innerHTML=`<article class="club-profile-hero panel"><div><p class="eyebrow">KLUBB/ORT-PROFIL</p><h3>${esc(c.name)}</h3><p>${small?'<span class="small-sample">Litet underlag</span>':''} ${c.starters} startande · ${c.finishers} fullföljande</p></div><div class="club-profile-kpis"><span>Median<strong>${fmtTime(c.median)}</strong></span><span>I mål<strong>${c.rate} %</strong></span><span>SM-index<strong>${c.medianIndex?.toFixed(0)||'–'}</strong></span><span>Klasser<strong>${c.classes}</strong></span></div><div class="club-top-runners"><small>Snabbaste i urvalet · upp till 20</small><div class="club-top-runners-list">${c.top.map((r,i)=>`<button data-id="${r.id}"><b>${i+1}</b>${esc(r.name_as_published)} <em>${fmtTime(r.finish_seconds)}</em></button>`).join('')}</div></div></article>`;el.querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>openRunner(Number(b.dataset.id)));renderClubDna(c,all)}
  function renderClubRankingTabs(){const el=document.querySelector('#clubRankingTabs'),tabs=[['largest','Flest startande'],['finishers','Flest i mål'],['median','Snabbast median'],['breadth','Bäst bredd'],['rate','Fullföljandegrad'],['closing','Starkast avslutning'],['improved','Mest förbättrad'],['widest','Bredaste klubben']];if(!tabs.some(([k])=>k===advanced.clubMetric))advanced.clubMetric='largest';el.innerHTML=tabs.map(([k,l])=>`<button class="${advanced.clubMetric===k?'active':''}" data-metric="${k}">${l}</button>`).join('');el.querySelectorAll('button').forEach(b=>b.onclick=()=>{advanced.clubMetric=b.dataset.metric;renderClubWorld()})}
  function renderClubRankings(stats){const el=document.querySelector('#clubRankings'),metric=advanced.clubMetric,rows=stats.map(c=>({...c,improved:clubHistoryImprovement(c.key),widest:c.classes+c.balance/100}));const valid=rows.filter(c=>metric==='largest'||metric==='finishers'||metric==='widest'||(c[metric]!=null&&(metric!=='rate'&&metric!=='breadth'&&metric!=='median'||c.starters>=5)));valid.sort((a,b)=>metric==='median'?a.median-b.median:b[metric]-a[metric]);const format=c=>metric==='largest'?`${c.starters} startande`:metric==='finishers'?`${c.finishers} i mål`:metric==='median'?fmtTime(c.median):metric==='breadth'?`index ${c.medianIndex?.toFixed(0)}`:metric==='rate'?`${c.rate} %`:metric==='closing'?`${c.closing>0?'+':''}${c.closing?.toFixed(0)} platser`:metric==='improved'?`${c.improved>0?'+':''}${c.improved?.toFixed(0)} index`:`${c.classes} klasser · balans ${c.balance.toFixed(0)}`;el.innerHTML=valid.slice(0,12).map((c,i)=>`<button data-club="${esc(c.key)}"><b>${i+1}</b><span><strong>${esc(c.name)}</strong><small>${c.starters<5?'Litet underlag · ':''}${c.finishers} fullföljande</small></span><em>${format(c)}</em></button>`).join('');el.querySelectorAll('button').forEach(b=>b.onclick=()=>{const key=b.dataset.club;if(!advanced.clubSelection.includes(key)&&advanced.clubSelection.length<4)advanced.clubSelection.push(key);const active=document.querySelector('#clubProfileSelect');if(active)active.value=key;renderClubWorld();document.querySelector('#clubProfile').scrollIntoView({behavior:'smooth',block:'center'})})}
  function renderClubDna(c,all){const maxStarts=Math.max(...all.map(x=>x.starters),1),maxClosing=Math.max(...all.map(x=>Math.max(0,x.closing||0)),1),metrics=[['Fart',c.medianIndex||0],['Bredd',Math.min(100,c.finishers/20*100)],['Uthållighet',c.rate],['Avslutning',Math.max(0,c.closing||0)/maxClosing*100],['Deltagande',c.starters/maxStarts*100]];document.querySelector('#clubDna').innerHTML=metrics.map(([n,v])=>`<div><span>${n}</span><i><b style="width:${Math.max(2,Math.min(100,v))}%"></b></i><strong>${Math.round(v)}</strong></div>`).join('')}
  function renderClubCompare(stats){
    const el=document.querySelector('#clubCompareChart'),selected=stats.filter(x=>advanced.clubSelection.includes(x.key)),cps=cpList().filter(c=>c.sequence_no>0),pairs=segmentPairs(cps);if(!selected.length){el.innerHTML='<div class="empty">Sök och välj klubbar eller orter ovan.</div>';return}
    const W=920,H=390,p={l:82,r:82,t:42,b:128},paceMode=currentSpeedUnit()==='pace',series=selected.map((c,i)=>({name:c.name,color:CLASS_COLORS[i%CLASS_COLORS.length],pts:cps.map(cp=>{const samples=segmentSpeeds(c.rows,cp.sequence_no),speed=safeMed(samples);return{speed,n:samples.length,value:Number.isFinite(speed)?speedDisplayValue(speed):null}})})),all=series.flatMap(s=>s.pts.map(point=>point.value).filter(Number.isFinite));if(!all.length){el.innerHTML='<div class="empty">Mellantider saknas för valda klubbar.</div>';return}
    const lo=Math.min(...all),hi=Math.max(...all),x=i=>p.l+i*(W-p.l-p.r)/(cps.length-1||1),offset=si=>(si-(series.length-1)/2)*2.8,y=v=>paceMode?p.t+(v-lo)*(H-p.t-p.b)/(hi-lo||1):p.t+(hi-v)*(H-p.t-p.b)/(hi-lo||1);let out='';for(let i=0;i<=4;i++){const v=paceMode?lo+(hi-lo)*i/4:hi-(hi-lo)*i/4,yy=y(v);out+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:p.l-10,y:yy+4,'text-anchor':'end'},formatSpeedAxis(v))}
    series.forEach((s,si)=>{const valid=s.pts.map((point,i)=>({...point,i})).filter(point=>Number.isFinite(point.value));out+=`<path class="club-compare-line" d="${valid.map((d,j)=>`${j?'L':'M'}${x(d.i)+offset(si)} ${y(d.value)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="3"/>`;valid.forEach(d=>{const px=x(d.i)+offset(si),py=y(d.value),tip=`${s.name} · ${pairs[d.i]?.label||cps[d.i]?.name} · median ${formatSpeed(d.speed)} · ${d.n} registrerade löpare`;out+=`<circle class="interactive-chart-point club-chart-point club-compare-point" cx="${px}" cy="${py}" r="5.2" fill="${s.color}" tabindex="0" role="img" aria-label="${esc(tip)}" data-chart-tip="${esc(tip)}" data-chart-x="${(px/W*100).toFixed(2)}" data-chart-y="${(py/H*100).toFixed(2)}"><title>${esc(tip)}</title></circle>`})});
    pairs.forEach((pair,i)=>{const px=x(i),py=H-92,anchor=i===0?'start':i===pairs.length-1?'end':'end';out+=svg('text',{x:px,y:py,'text-anchor':anchor,transform:`rotate(-34 ${px} ${py})`,class:'club-segment-axis-label'},pair.label)});
    el.innerHTML=`<div class="class-chart-legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}<span>${esc(window.SpeedUnits.unitLabel())}</span></div><div class="interactive-chart-tooltip" role="status" hidden></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Medianfart per delsträcka för valda klubbar och orter">${out}</svg>`;wireChartTooltips(el)
  }
  function renderClubHistory(stats){
    const el=document.querySelector('#clubHistoryChart'),selected=stats.filter(x=>advanced.clubSelection.includes(x.key)),years=familyRaces().slice().sort((a,b)=>a.year-b.year);if(!selected.length){el.innerHTML='<div class="empty">Välj minst en klubb eller ort ovan.</div>';return}
    const family=familyResults(),series=selected.map((club,ci)=>{const rows=family.filter(r=>advanced.clubKeyByResult.get(r.id)===club.key);return{name:club.name,color:CLASS_COLORS[ci%CLASS_COLORS.length],pts:years.map(r=>{const rr=rows.filter(x=>x.race_id===r.id),starters=rr.filter(isStarter),finishers=rr.filter(isFinished);return{year:r.year,starters:starters.length,finishers:finishers.length,med:safeMed(finishers.map(x=>x.finish_seconds))}})}}),meds=series.flatMap(s=>s.pts.map(d=>d.med).filter(Number.isFinite));
    const W=940,H=390,p={l:70,r:82,t:52,b:46},plotHeight=H-p.t-p.b,rawMax=Math.max(1,...series.flatMap(s=>s.pts.map(d=>d.starters))),roughStep=rawMax/5,power=10**Math.floor(Math.log10(roughStep)),unit=roughStep/power,countStep=(unit<=1?1:unit<=2?2:unit<=5?5:10)*power,maxN=Math.ceil(rawMax/countStep)*countStep,timeLo=meds.length?Math.floor(Math.min(...meds)/1800)*1800:0,timeHiRaw=meds.length?Math.ceil(Math.max(...meds)/1800)*1800:3600,timeHi=timeHiRaw>timeLo?timeHiRaw:timeLo+1800,x=i=>p.l+i*(W-p.l-p.r)/(years.length-1||1),yCount=v=>H-p.b-v/maxN*plotHeight,yTime=v=>p.t+(timeHi-v)*plotHeight/(timeHi-timeLo),yearStep=(W-p.l-p.r)/(years.length-1||1),groupWidth=Math.min(70,yearStep*.76),barWidth=Math.max(3,Math.min(12,groupWidth/(series.length*2+1)));let axes='',bars='',lines='';
    for(let v=0;v<=maxN+.001;v+=countStep){const yy=yCount(v);axes+=svg('line',{x1:p.l,y1:yy,x2:W-p.r,y2:yy,class:'gridline'})+svg('text',{x:p.l-10,y:yy+4,'text-anchor':'end'},String(Math.round(v)))}
    for(let i=0;i<=4;i++){const v=timeHi-(timeHi-timeLo)*i/4,yy=yTime(v);axes+=svg('line',{x1:W-p.r,y1:yy,x2:W-p.r+5,y2:yy,class:'axis'})+svg('text',{x:W-p.r+10,y:yy+4,class:'club-history-time-label'},fmtHour(v))}
    axes+=svg('text',{x:15,y:(p.t+H-p.b)/2,'text-anchor':'middle',transform:`rotate(-90 15 ${(p.t+H-p.b)/2})`,class:'club-history-axis-title'},'Antal personer')+svg('text',{x:W-14,y:(p.t+H-p.b)/2,'text-anchor':'middle',transform:`rotate(90 ${W-14} ${(p.t+H-p.b)/2})`,class:'club-history-axis-title'},'Median sluttid')+svg('line',{x1:p.l,y1:H-p.b,x2:W-p.r,y2:H-p.b,class:'axis'});
    series.forEach((s,si)=>{s.pts.forEach((d,i)=>{const pairStart=x(i)-series.length*barWidth+si*barWidth*2,startX=pairStart,finishX=pairStart+barWidth,startHeight=Math.max(0,H-p.b-yCount(d.starters)),finishHeight=Math.max(0,H-p.b-yCount(d.finishers)),loss=Math.max(0,d.starters-d.finishers),rate=d.starters?pct(d.finishers,d.starters):0,tip=`${s.name} · ${d.year} · ${d.starters} startande · ${d.finishers} i mål · ${loss} bortfall · ${String(rate).replace('.',',')} % målgång · median ${fmtTime(d.med)}`;if(startHeight)bars+=`<rect class="club-history-bar starters club-chart-mark" x="${startX}" y="${H-p.b-startHeight}" width="${Math.max(1,barWidth-.8)}" height="${startHeight}" fill="${s.color}" tabindex="0" role="img" aria-label="${esc(tip)}" data-chart-tip="${esc(tip)}" data-chart-x="${((startX+barWidth/2)/W*100).toFixed(2)}" data-chart-y="${((H-p.b-startHeight)/H*100).toFixed(2)}"><title>${esc(tip)}</title></rect>`;if(finishHeight)bars+=`<rect class="club-history-bar finishers club-chart-mark" x="${finishX}" y="${H-p.b-finishHeight}" width="${Math.max(1,barWidth-.8)}" height="${finishHeight}" fill="${s.color}" tabindex="0" role="img" aria-label="${esc(tip)}" data-chart-tip="${esc(tip)}" data-chart-x="${((finishX+barWidth/2)/W*100).toFixed(2)}" data-chart-y="${((H-p.b-finishHeight)/H*100).toFixed(2)}"><title>${esc(tip)}</title></rect>`});const valid=s.pts.map((d,i)=>({...d,i})).filter(d=>Number.isFinite(d.med));if(valid.length){lines+=`<path class="club-history-line" d="${valid.map((d,j)=>`${j?'L':'M'}${x(d.i)} ${yTime(d.med)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="3"/>`;valid.forEach(d=>{const loss=Math.max(0,d.starters-d.finishers),rate=d.starters?pct(d.finishers,d.starters):0,px=x(d.i),py=yTime(d.med),tip=`${s.name} · ${d.year} · ${d.starters} startande · ${d.finishers} i mål · ${loss} bortfall · ${String(rate).replace('.',',')} % målgång · median ${fmtTime(d.med)}`;lines+=`<circle class="interactive-chart-point club-chart-point club-history-point" cx="${px}" cy="${py}" r="5" fill="${s.color}" tabindex="0" role="img" aria-label="${esc(tip)}" data-chart-tip="${esc(tip)}" data-chart-x="${(px/W*100).toFixed(2)}" data-chart-y="${(py/H*100).toFixed(2)}"><title>${esc(tip)}</title></circle>`})}});
    years.forEach((r,i)=>axes+=svg('text',{x:x(i),y:H-16,'text-anchor':'middle'},String(r.year)));
    el.innerHTML=`<div class="class-chart-legend club-series-legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div><div class="club-history-legend"><span><i class="starts"></i>Startande · vänster axel</span><span><i class="finish"></i>I mål · vänster axel</span><span><i class="median"></i>Median · höger axel</span></div><div class="interactive-chart-tooltip" role="status" hidden></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Starter, målgångar och median för valda klubbar och orter">${axes}${bars}${lines}</svg>`;wireChartTooltips(el)
  }

  function setupNavigation(){
    document.querySelectorAll('.analysis-nav-button').forEach(b=>b.onclick=()=>{document.querySelector('#'+b.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'});document.querySelectorAll('.analysis-nav-button').forEach(x=>x.classList.toggle('active',x===b))});
    document.querySelector('#shareView').onclick=async()=>{syncUrl();try{await navigator.clipboard.writeText(location.href);document.querySelector('#shareView').textContent='Länk kopierad ✓';setTimeout(()=>document.querySelector('#shareView').textContent='Dela vy',1800)}catch{prompt('Kopiera länken:',location.href)}};
    document.querySelector('#playYears').onclick=()=>{const btn=document.querySelector('#playYears'),races=familyRaces().slice().sort((a,b)=>a.year-b.year);if(advanced.yearTimer){clearInterval(advanced.yearTimer);advanced.yearTimer=null;btn.textContent='▶ Spela år';return}let i=Math.max(0,races.findIndex(r=>r.id===state.raceId));btn.textContent='■ Stoppa';advanced.yearTimer=setInterval(()=>{i=(i+1)%races.length;document.querySelector('#yearFilter').value=String(races[i].id);state.raceId=races[i].id;state.page=1;refreshFilters();applyFilters()},1400)};
  }

  function installWorldInfo(){window.refreshInfoTips?.()}

  function install(){
    if(advanced.ready||typeof state==='undefined'||!state.data)return;advanced.ready=true;buildCaches();patchFilters();patchOverviewCharts();patchNerdCharts();setupSexDiagramControls();setupClassHeatUnitControls();setupNavigation();setupClubSearches();window.addEventListener('ultravasan:speed-unit-change',event=>{advanced.classHeatUnit=event.detail?.unit==='speed'?'speed':'pace';setupClassHeatUnitControls();renderAudienceWorlds()});refreshFilters();restoreUrl();installWorldInfo();applyFilters();
  }
  const timer=setInterval(()=>{try{if(typeof state!=='undefined'&&state.data){clearInterval(timer);install()}}catch(e){console.error('Audience analytics',e);clearInterval(timer)}},80);
})();
