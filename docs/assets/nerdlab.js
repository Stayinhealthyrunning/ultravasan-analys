'use strict';
/* Advanced cross-year analytics. Works entirely in the browser on exported data. */
const nerd={ready:false,hall:'veterans',historyResultIds:[],hallMap:null,hallTile:null,courseSegmentKey:null,courseRaceId:null,coursePlanTargets:{uv90:'10:00:00',uv45:'5:00:00'}};
const nHistoryEngine=typeof module!=='undefined'&&module.exports?require('./history-engine.js'):globalThis.UltravasanHistoryEngine;
const nHistoryIntelligence=typeof module!=='undefined'&&module.exports?require('./history-intelligence.js'):globalThis.HistoryIntelligence;
const nCourseIntelligence=typeof module!=='undefined'&&module.exports?require('./course-intelligence.js'):globalThis.CourseIntelligence;
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
const nSplitsForResult=id=>state.data.splitsByResult.get(id)||window.UltravasanDataIndex.EMPTY_SPLITS;
const nSplitsForResults=rows=>window.UltravasanDataIndex.splitsForResults(state.data,rows);
const splitMap=id=>new Map(nSplitsForResult(id).map(s=>[s.sequence_no,s]));
const nSex=r=>{const x=String(r?.sex||'').toUpperCase();return ['F','W','K','D'].includes(x)?'F':['M','H'].includes(x)?'M':'U'};
const nResultStatus=r=>globalThis.ResultStatus.classify(r,{hasSplit:state.data?.splitEvidence?.has(r?.id)});
const nIsStarter=r=>nResultStatus(r).started;
const nIsFinished=r=>nResultStatus(r).finished;
const nIsDnf=r=>nResultStatus(r).dnf;
const nIsDns=r=>nResultStatus(r).dns;

const COURSE_INTELLIGENCE_METHOD_HELP='Course Intelligence analyserar endast segment som finns explicit i vald CourseVersion. Tävlingsdistans och checkpointordning kommer från CourseVersion-kontraktet, medan karta, höjd och stigning kommer från den låsta display-rutten. Display-rutten kan vara en verifierad GPX från ett referensår och är därför inte i sig bevis för exakt historisk geometri varje enskilt loppår. Fältmåtten använder aktuellt filtrerat urval. Segmenttid kräver en fullföljare och exakta, ej estimerade passager i båda segmentändarna; minst n=5 krävs för publicerade medianmått. Pacing loss är medianen av segmentets sekunder/km minus samma löpares hel-loppsfart i sekunder/km. Spridning är Q75 minus Q25 för segmentfarten. DNF-exit räknas konservativt: en DNF placeras bara efter sin sista säkra registrerade passage, och löpare utan sådan passage gissas inte in på ett segment. Difficulty är ett relativt segmentindex inom valt lopp/CourseVersion, inte ett absolut banbetyg. Fyra komponenter används med lika vikt: stigning per km, pacing loss per km, fartspridning och DNF-exit. Varje komponent omvandlas till percentil bland segmenten; alla fyra komponenterna och n≥5 krävs för en sammanvägd poäng.';
const COURSE_PLAN_METHOD_HELP='Måltempo/loppplan använder bara historiska fullföljare från exakt samma CourseVersion som det valda loppet. För varje segment beräknas medianen av segmenttid/sluttid bland löpare med exakta passager; minst n=5 krävs. Dessa segmentandelar normaliseras sedan så att de tillsammans motsvarar den angivna måltiden. Om ett segment saknar tillräcklig historik får explicit CourseVersion-distans användas som tydligt märkt distansreservberäkning. Om även segmentdistansen är okänd lämnas segmentet oallokerat och ingen resttid fördelas genom gissning. Planen är en historiskt kalibrerad pacingreferens, inte en prognos: väder, dagsform, underlag, energiintag och individuell terrängstyrka modelleras inte.';
const HISTORY_ARCHIVE_METHOD_HELP='Löpararkivet använder endast verifierad personidentitet från U2. Namn, startnummer eller legacy athlete_id får aldrig ensamma länka en person mellan år. Alla verifierat länkade resultat visas, men sluttidsutveckling och bästa tid delas upp i separata jämförbarhetsserier enligt CourseVersion/whole-course-kontraktet. Ett banbyte visas därför som en ny serie i stället för att räknas som förbättring eller försämring. DNF och DNS kan visas i personens tidslinje men ingår inte i sluttidsserier. Om personidentiteten inte är verifierad visar arkivet endast det enskilda publicerade resultatet.';
const HISTORY_HALL_METHOD_HELP='Hall of Fame använder History Intelligence i stället för namnmatchning. Flest lopp kräver verifierad personidentitet men kan räkna fullföljda starter över banversioner eftersom måttet bara är antal genomföranden. Mest förbättrad och Jämnast kräver verifierad personidentitet och räknas endast inom en uttryckligen jämförbar whole-course-serie; tider från andra CourseVersions blandas inte in. Starkast avslutning är ett enskilt-loppmått: endast exakta, ej estimerade placeringspassager används. Segmentet väljs strukturellt från CourseVersion (Evertsberg→mål när det finns, annars Eldris→mål) och placeringslyftet normaliseras mot antal faktiska startande för att minska fältstorleksbias. Kvinnor och män redovisas separat.';
const HISTORY_FINGERPRINT_METHOD_HELP='Årets fingeravtryck sätter index 100 till historisk normalnivå. Mediantidsindex, fartnivå och DNF-belastning jämför endast med andra RaceEditions som har samma whole-course-jämförbarhetsnyckel som valt lopp. Varje jämförbart loppår sammanfattas först separat och normalnivån är medianen av loppårsmedianerna, så ett stort startfält får inte automatiskt större vikt än ett litet. Minst två andra jämförbara loppår krävs. Kvinnorepresentation och fältstorlek är deltagandemått och får därför använda andra CourseVersions inom samma RaceFamily; kvinnorepresentation döljs när könsfilter är aktivt. Index beskriver observerad skillnad, inte orsak.';
const CLASS_HISTORY_METHOD_HELP='Klasshistorik och Klassutveckling visar deltagande över alla importerade år, men fart- och sluttidstrender får endast bindas samman när två år tillhör samma whole-course-jämförbarhetsserie. Vid CourseVersion-byte bryts linjen, animationen tonar ut och in i stället för att interpolera en påhittad mellanprestation och diagrammet markerar banversionsgränsen. Deltagarantal kan fortfarande jämföras över banbytet eftersom det inte är ett prestationsmått. DNS räknas inte som startande; medianfart och sluttid bygger på fullföljande med giltig sluttid.';
function replaceInfoPopup(seed,text){
  const card=seed?.matches?.('article,.panel')?seed:seed?.closest?.('article,.panel');
  if(!card)return;
  const popup=card.querySelector('.info-tip .info-popup');
  if(popup)popup.textContent=text;else globalThis.addCardInfo?.(card,text);
}
function installHistoryMethodInfo(){
  replaceInfoPopup(n$('.history-lab'),HISTORY_ARCHIVE_METHOD_HELP);
  replaceInfoPopup(n$('.hall-card'),HISTORY_HALL_METHOD_HELP);
  replaceInfoPopup(n$('.fingerprint-card'),HISTORY_FINGERPRINT_METHOD_HELP);
  replaceInfoPopup(n$('#classEvolutionChart'),CLASS_HISTORY_METHOD_HELP);
  replaceInfoPopup(n$('#classHistoryChart'),CLASS_HISTORY_METHOD_HELP);
}
function installCourseMethodInfo(){
  const card=n$('#courseIntelligenceCard');
  if(card){
    const popup=card.querySelector('.info-tip .info-popup');
    if(popup)popup.textContent=COURSE_INTELLIGENCE_METHOD_HELP;
    else globalThis.addCardInfo?.(card,COURSE_INTELLIGENCE_METHOD_HELP);
  }
  const plan=n$('#courseRacePlan');
  if(plan&&!plan.querySelector('.info-tip'))globalThis.addCardInfo?.(plan,COURSE_PLAN_METHOD_HELP);
}

function athleteIdentityKey(r){return nHistoryEngine.identityKey(r)}
function groupAthleteHistories(results,races=[]){return nHistoryEngine.groupHistories(results,races)}
const nCourses=()=>globalThis.RACE_CATALOG?.courses||{};
function nComparableFinishSeries(rows,minCount=1){
  return nHistoryEngine.comparableSeries((rows||[]).filter(nIsFinished),state.data.races,nCourses())
    .filter(series=>series.rows.length>=minCount)
    .sort((a,b)=>b.rows.length-a.rows.length||String(a.key).localeCompare(String(b.key)));
}

function initNerdLab(){
  if(nerd.ready||typeof state==='undefined'||!state.data)return;
  nerd.ready=true;
  installCourseMethodInfo();installHistoryMethodInfo();
  const selects=['segmentFrom','segmentTo','segmentClass','segmentMetric'];selects.forEach(id=>n$('#'+id)?.addEventListener('change',renderSegmentLab));
  n$('#historySearch')?.addEventListener('input',renderHistorySuggestions);
  document.addEventListener('click',e=>{if(!e.target.closest('.history-lab')){const b=n$('#historySuggestions');if(b)b.hidden=true}});
  n$$('#hallTabs button').forEach(b=>b.onclick=()=>{nerd.hall=b.dataset.hall;n$$('#hallTabs button').forEach(x=>x.classList.toggle('active',x===b));renderHall()});
  const hallDialog=n$('#hallMapDialog');hallDialog?.querySelector('.dialog-close')?.addEventListener('click',()=>hallDialog.close());
  n$('#courseTargetTime')?.addEventListener('change',event=>{
    const race=activeRace(),family=globalThis.RaceContracts?.familyForRace?.(race);
    if(family)nerd.coursePlanTargets[family]=event.target.value;
    renderCourseRacePlan(currentCourseModel());
  });
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
  if(!nerd.ready)return;populateSegmentSelectorsPreserve();populateSegmentClassFilter();renderCoverage();renderCourseIntelligence();renderStories();renderSegmentLab();renderPercentiles();renderFieldFlow();renderHall();renderFingerprint();
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
  const resultIds=results.filter(r=>nSplitsForResult(r.id).length).length,coverage=results.length?resultIds/results.length:0;
  const el=n$('#intelligenceCoverage');if(el)el.textContent=`${years.size} loppår · ${results.length.toLocaleString('sv-SE')} resultat · ${Math.round(coverage*100)} % med passager`;
}
const nPace=s=>globalThis.SpeedUnits?.formatPace?.(s,globalThis.SpeedUnits.get())??(Number.isFinite(Number(s))?`${Math.floor(Number(s)/60)}:${String(Math.round(Number(s)%60)).padStart(2,'0')} /km`:'–');
const nSigned=(value,suffix='')=>Number.isFinite(Number(value))?`${Number(value)>0?'+':''}${Number(value).toLocaleString('sv-SE',{maximumFractionDigits:1})}${suffix}`:'–';
function currentCourseModel(){
  const race=activeRace();if(!race||!nCourseIntelligence||!globalThis.ULTRAVASAN_ROUTES)return null;
  try{return nCourseIntelligence.buildCourseModel(state.data,race,globalThis.ULTRAVASAN_ROUTES,{results:state.filtered,minSample:5})}
  catch(error){console.error('Course Intelligence kunde inte byggas',error);return null}
}
function courseMax(segments,getter){
  return (segments||[]).filter(segment=>Number.isFinite(Number(getter(segment)))).sort((a,b)=>Number(getter(b))-Number(getter(a)))[0]||null;
}
function courseSegmentSelection(model){
  if(!model?.segments?.length)return null;
  if(nerd.courseRaceId!==String(model.race.id)){
    nerd.courseRaceId=String(model.race.id);nerd.courseSegmentKey=null;
  }
  let selected=model.segments.find(segment=>segment.key===nerd.courseSegmentKey);
  if(!selected)selected=model.segments.find(segment=>segment.difficulty?.rank===1)||model.segments.find(segment=>segment.distance_km!=null)||model.segments[0];
  nerd.courseSegmentKey=selected?.key||null;
  return selected;
}
function syncLegacySegmentLab(segment){
  if(!segment)return;
  const from=n$('#segmentFrom'),to=n$('#segmentTo');if(!from||!to)return;
  const fromValue=String(segment.from_sequence),toValue=String(segment.to_sequence);
  if([...from.options].some(option=>option.value===fromValue))from.value=fromValue;
  if([...to.options].some(option=>option.value===toValue))to.value=toValue;
  renderSegmentLab();
}
function selectCourseSegment(key,{sync=true}={}){
  nerd.courseSegmentKey=key;
  const model=currentCourseModel(),segment=model?.segments?.find(item=>item.key===key);
  if(sync&&segment)syncLegacySegmentLab(segment);
  renderCourseIntelligence(model);
}
function courseNarrative(segment){
  if(!segment)return'<div class="empty">Välj ett segment.</div>';
  const terrain=segment.terrain||{},field=segment.field||{},difficulty=segment.difficulty||{};
  const clauses=[];
  if(Number.isFinite(Number(difficulty.score)))clauses.push(`relativ Difficulty ${Number(difficulty.score).toLocaleString('sv-SE',{maximumFractionDigits:1})}/100, rank ${difficulty.rank} av ${difficulty.segment_count_ranked}`);
  else clauses.push('ingen Difficulty-poäng eftersom timingunderlaget inte når evidensgränsen');
  if(Number.isFinite(Number(terrain.ascent_m)))clauses.push(`${Math.round(terrain.ascent_m)} höjdmeter upp och ${Math.round(terrain.descent_m||0)} ned`);
  if(Number.isFinite(Number(field.median_pacing_loss_seconds_per_km)))clauses.push(`${nSigned(field.median_pacing_loss_seconds_per_km,' sek/km')} mot löparnas egen hel-loppsfart`);
  if(Number.isFinite(Number(field.median_placement_movement)))clauses.push(`median ${nSigned(field.median_placement_movement,' platser')}`);
  if(Number.isFinite(Number(field.dnf_exit_rate_pct)))clauses.push(`${Number(field.dnf_exit_rate_pct).toLocaleString('sv-SE',{maximumFractionDigits:1})} % DNF-exit bland registrerade segmententréer`);
  return `<div><p class="eyebrow">VALT SEGMENT</p><h4>${nEsc(segment.from_name)} → ${nEsc(segment.to_name)}</h4><p>${nEsc(clauses.join(' · '))}.</p><small>Svårighetsindex är relativt inom valt lopp/CourseVersion och är inte ett absolut banbetyg.</small></div>`;
}
function courseSvgProjector(points,width=620,height=250,padding=18){
  const valid=(points||[]).filter(point=>Number.isFinite(Number(point?.[0]))&&Number.isFinite(Number(point?.[1])));
  if(!valid.length)return null;
  const meanLat=valid.reduce((sum,point)=>sum+Number(point[0]),0)/valid.length;
  const factor=Math.cos(meanLat*Math.PI/180);
  const projected=valid.map(point=>({x:Number(point[1])*factor,y:Number(point[0])}));
  const minX=Math.min(...projected.map(point=>point.x)),maxX=Math.max(...projected.map(point=>point.x));
  const minY=Math.min(...projected.map(point=>point.y)),maxY=Math.max(...projected.map(point=>point.y));
  const spanX=Math.max(1e-9,maxX-minX),spanY=Math.max(1e-9,maxY-minY);
  return point=>{
    const x=Number(point[1])*factor,y=Number(point[0]);
    return [padding+(x-minX)/spanX*(width-padding*2),height-padding-(y-minY)/spanY*(height-padding*2)];
  };
}
function courseSvgPath(points,project){
  if(!project||!points?.length)return'';
  const step=Math.max(1,Math.ceil(points.length/650)),sample=points.filter((_,index)=>index%step===0);
  if(sample.at(-1)!==points.at(-1))sample.push(points.at(-1));
  return sample.map((point,index)=>{const [x,y]=project(point);return `${index?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`}).join(' ');
}
function bindCourseSegmentClicks(root){
  root?.querySelectorAll?.('[data-course-segment]').forEach(node=>{
    node.onclick=()=>selectCourseSegment(node.dataset.courseSegment);
    node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectCourseSegment(node.dataset.courseSegment)}};
  });
}
function renderCourseRouteView(model,selected){
  const el=n$('#courseRouteView');if(!el)return;
  const route=nCourseIntelligence.routeForRace(globalThis.ULTRAVASAN_ROUTES,model?.race);
  if(!route?.points?.length){el.innerHTML='<div class="course-view-empty">Låst display-rutt saknas för denna CourseVersion.</div>';return}
  const width=620,height=250,project=courseSvgProjector(route.points,width,height),base=courseSvgPath(route.points,project);
  const paths=model.segments.map(segment=>{
    if(!Number.isFinite(Number(segment.display_from_km))||!Number.isFinite(Number(segment.display_to_km)))return'';
    const points=globalThis.UltravasanMapEngine.routeSlice(route,segment.display_from_km,segment.display_to_km);
    const d=courseSvgPath(points,project);if(!d)return'';
    return `<path d="${d}" class="course-route-segment ${segment.key===selected?.key?'selected':''}" data-course-segment="${nEsc(segment.key)}" tabindex="0"><title>${nEsc(segment.from_name)} → ${nEsc(segment.to_name)}</title></path>`;
  }).join('');
  el.innerHTML=`<div class="course-view-head"><span>BANÖVERSIKT</span><strong>Klicka på en delsträcka</strong></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Course Intelligence banöversikt"><path d="${base}" class="course-route-base"></path>${paths}</svg>`;
  bindCourseSegmentClicks(el);
}
function renderCourseElevationView(model,selected){
  const el=n$('#courseElevationView');if(!el)return;
  const route=nCourseIntelligence.routeForRace(globalThis.ULTRAVASAN_ROUTES,model?.race),profile=route?.elevation_profile||[];
  if(!profile.length){el.innerHTML='<div class="course-view-empty">Höjdprofil saknas för denna låsta display-rutt.</div>';return}
  const width=620,height=250,padX=20,padTop=30,padBottom=28,maxDistance=Number(profile.at(-1)?.[0]||1);
  const elevations=profile.map(point=>Number(point[1])).filter(Number.isFinite),minE=Math.min(...elevations),maxE=Math.max(...elevations),span=Math.max(1,maxE-minE);
  const x=distance=>padX+Number(distance)/maxDistance*(width-padX*2),y=elevation=>height-padBottom-(Number(elevation)-minE)/span*(height-padTop-padBottom);
  const step=Math.max(1,Math.ceil(profile.length/600)),sample=profile.filter((point,index)=>index%step===0&&Number.isFinite(Number(point[1])));
  if(sample.at(-1)!==profile.at(-1)&&Number.isFinite(Number(profile.at(-1)?.[1])))sample.push(profile.at(-1));
  const path=sample.map((point,index)=>`${index?'L':'M'}${x(point[0]).toFixed(1)},${y(point[1]).toFixed(1)}`).join(' ');
  const overlays=model.segments.map(segment=>{
    if(!Number.isFinite(Number(segment.display_from_km))||!Number.isFinite(Number(segment.display_to_km)))return'';
    const x1=x(segment.display_from_km),x2=x(segment.display_to_km),left=Math.min(x1,x2),w=Math.max(2,Math.abs(x2-x1));
    return `<rect x="${left.toFixed(1)}" y="${padTop}" width="${w.toFixed(1)}" height="${height-padTop-padBottom}" class="course-elevation-hit ${segment.key===selected?.key?'selected':''}" data-course-segment="${nEsc(segment.key)}" tabindex="0"><title>${nEsc(segment.from_name)} → ${nEsc(segment.to_name)}</title></rect>`;
  }).join('');
  el.innerHTML=`<div class="course-view-head"><span>HÖJDPROFIL</span><strong>${Math.round(minE)}–${Math.round(maxE)} m</strong></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Höjdprofil med valbara Course Intelligence-segment"><path d="${path}" class="course-elevation-line"></path>${overlays}</svg>`;
  bindCourseSegmentClicks(el);
}
function renderCoursePaceView(model,selected){
  const el=n$('#coursePaceView');if(!el)return;
  const values=model.segments.map(segment=>segment.field?.median_pace_seconds_per_km).filter(value=>Number.isFinite(Number(value))).map(Number);
  if(!values.length){el.innerHTML='<div class="course-view-empty">Minst fem exakta finisherpassager krävs för fartfördelningen.</div>';return}
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min);
  const rows=model.segments.map(segment=>{
    const value=segment.field?.median_pace_seconds_per_km,width=Number.isFinite(Number(value))?20+(Number(value)-min)/span*80:0;
    const spread=segment.field?.sufficient_sample?`${nPace(segment.field.q25_pace_seconds_per_km)}–${nPace(segment.field.q75_pace_seconds_per_km)}`:'underlag saknas';
    return `<button type="button" class="course-pace-row ${segment.key===selected?.key?'selected':''}" data-course-segment="${nEsc(segment.key)}" ${width?'':'disabled'}><span>${nEsc(segment.from_name)} → ${nEsc(segment.to_name)}</span><i><b style="width:${width}%"></b></i><strong>${Number.isFinite(Number(value))?nPace(value):'–'}</strong><small>${nEsc(spread)}</small></button>`;
  }).join('');
  el.innerHTML=`<div class="course-view-head"><span>FARTFÖRDELNING</span><strong>Median · Q25–Q75</strong></div><div class="course-pace-list">${rows}</div>`;
  bindCourseSegmentClicks(el);
}

function parseCourseTargetTime(value){
  const parts=String(value||'').trim().split(':');
  if(parts.length<2||parts.length>3)return null;
  const numbers=parts.map(Number);if(numbers.some(number=>!Number.isFinite(number)||number<0))return null;
  const [hours,minutes,seconds=0]=numbers;
  if(minutes>=60||seconds>=60)return null;
  const total=hours*3600+minutes*60+seconds;
  return total>0?total:null;
}
function renderCourseRacePlan(existingModel=null){
  const input=n$('#courseTargetTime'),status=n$('#coursePlanStatus'),rowsEl=n$('#coursePlanRows');
  if(!input||!status||!rowsEl)return;
  const model=existingModel||currentCourseModel(),race=model?.race;
  if(!model||!race){status.innerHTML='<span>CourseVersion saknas.</span>';rowsEl.innerHTML='';return}
  const family=model.race_family||globalThis.RaceContracts?.familyForRace?.(race)||'uv90';
  const stored=nerd.coursePlanTargets[family]||(family==='uv45'?'5:00:00':'10:00:00');
  if(document.activeElement!==input&&input.value!==stored)input.value=stored;
  const target=parseCourseTargetTime(input.value);
  if(target===null){status.innerHTML='<strong>Ogiltig måltid</strong><span>Ange HH:MM eller HH:MM:SS.</span>';rowsEl.innerHTML='';return}
  nerd.coursePlanTargets[family]=input.value;
  let plan;
  try{plan=nCourseIntelligence.buildRacePlan(state.data,race,target,{minSample:5})}
  catch(error){console.error('Loppplan kunde inte byggas',error);status.innerHTML='<strong>Loppplan saknas</strong><span>CourseVersion-underlaget kunde inte verifieras.</span>';rowsEl.innerHTML='';return}
  const years=plan.cohort_years.length?`${plan.cohort_years[0]}${plan.cohort_years.length>1?'–'+plan.cohort_years.at(-1):''}`:'inga loppår';
  if(plan.complete){
    status.innerHTML=`<strong>${nTime(plan.target_finish_seconds)} · ${nEsc(plan.course_version_id)}</strong><span>${plan.cohort_finishers.toLocaleString('sv-SE')} fullföljande · ${nEsc(years)} · ${plan.historical_segments} historiska segment${plan.fallback_segments?' · '+plan.fallback_segments+' distansreserv':''}</span>`;
  }else{
    status.innerHTML=`<strong>Komplett loppplan kan inte beräknas</strong><span>${plan.unavailable_segments} segment saknar både tillräcklig historik och explicit distans. Ingen resttid fördelas genom gissning.</span>`;
  }
  rowsEl.innerHTML=plan.rows.map(row=>{
    const source=row.source==='historical-course-version'?`Historisk CourseVersion · n=${row.sample_n}`:row.source==='distance-fallback'?'Distansreserv':'Underlag saknas';
    return `<tr class="${row.source}"><td><strong>${nEsc(row.to_name)}</strong><small>${nEsc(row.from_name)} → ${nEsc(row.to_name)}</small></td><td>${row.target_segment_seconds==null?'–':nTime(row.target_segment_seconds)}</td><td>${row.target_cumulative_seconds==null?'–':nTime(row.target_cumulative_seconds)}</td><td>${row.target_pace_seconds_per_km==null?'–':nPace(row.target_pace_seconds_per_km)}</td><td><span class="course-plan-source ${row.source}">${nEsc(source)}</span></td></tr>`;
  }).join('');
}

function renderCourseIntelligence(existingModel=null){
  const rowsEl=n$('#courseIntelligenceRows'),summary=n$('#courseIntelligenceSummary'),version=n$('#courseIntelligenceVersion'),narrative=n$('#courseSegmentNarrative');
  if(!rowsEl||!summary||!version||!narrative)return;
  const model=existingModel||currentCourseModel();
  if(!model){rowsEl.innerHTML='<tr><td colspan="9">Course Intelligence saknar underlag.</td></tr>';summary.innerHTML='';narrative.innerHTML='';return}
  version.textContent=model.course_version_id;
  const selected=courseSegmentSelection(model);
  const hardest=model.segments.find(segment=>segment.difficulty?.rank===1)||null;
  const climb=courseMax(model.segments,segment=>segment.terrain?.ascent_m);
  const pacing=courseMax(model.segments,segment=>segment.field?.median_pacing_loss_seconds_per_km);
  const attrition=courseMax(model.segments,segment=>segment.field?.dnf_exit_rate_pct);
  const summaryItems=[
    ['Tuffast relativt',hardest?`${hardest.from_name} → ${hardest.to_name}`:'Underlag saknas',hardest?.difficulty?.score!=null?`${hardest.difficulty.score}/100`:'–'],
    ['Mest stigning',climb?`${climb.from_name} → ${climb.to_name}`:'Underlag saknas',climb?.terrain?.ascent_m!=null?`+${Math.round(climb.terrain.ascent_m)} m`:'–'],
    ['Störst pacing loss',pacing?`${pacing.from_name} → ${pacing.to_name}`:'Underlag saknas',pacing?.field?.median_pacing_loss_seconds_per_km!=null?nSigned(pacing.field.median_pacing_loss_seconds_per_km,' sek/km'):'–'],
    ['Högst DNF-exit',attrition?`${attrition.from_name} → ${attrition.to_name}`:'Underlag saknas',attrition?.field?.dnf_exit_rate_pct!=null?`${attrition.field.dnf_exit_rate_pct} %`:'–'],
  ];
  summary.innerHTML=summaryItems.map(([label,title,value])=>`<article><span>${nEsc(label)}</span><strong>${nEsc(title)}</strong><em>${nEsc(value)}</em></article>`).join('');
  rowsEl.innerHTML=model.segments.map(segment=>{
    const active=segment.key===selected?.key,field=segment.field||{},terrain=segment.terrain||{},difficulty=segment.difficulty||{};
    const range=field.sufficient_sample&&field.q25_pace_seconds_per_km!=null&&field.q75_pace_seconds_per_km!=null?`${nPace(field.q25_pace_seconds_per_km)}–${nPace(field.q75_pace_seconds_per_km)}`:'–';
    const distance=segment.distance_km==null?'underlag saknas':`${Number(segment.distance_km).toLocaleString('sv-SE',{minimumFractionDigits:1,maximumFractionDigits:2})} km`;
    return `<tr class="${active?'selected':''} ${segment.distance_km==null?'course-segment-unavailable':''}" data-course-segment="${nEsc(segment.key)}" tabindex="0" aria-selected="${active?'true':'false'}"><td><strong>${nEsc(segment.from_name)} → ${nEsc(segment.to_name)}</strong><small>n=${field.timing_sample_n||0}</small></td><td>${nEsc(distance)}</td><td>${terrain.ascent_m==null?'–':`+${Math.round(terrain.ascent_m)} m`}</td><td>${field.median_pace_seconds_per_km==null?'–':nPace(field.median_pace_seconds_per_km)}</td><td>${nEsc(range)}</td><td>${field.median_pacing_loss_seconds_per_km==null?'–':nSigned(field.median_pacing_loss_seconds_per_km,' s/km')}</td><td>${field.median_placement_movement==null?'–':nSigned(field.median_placement_movement)}</td><td>${field.dnf_exit_rate_pct==null?'–':field.dnf_exit_rate_pct+' %'}</td><td>${difficulty.score==null?'–':`<strong>${difficulty.score}</strong><small>#${difficulty.rank}/${difficulty.segment_count_ranked}</small>`}</td></tr>`;
  }).join('');
  narrative.innerHTML=courseNarrative(selected);
  renderCourseRouteView(model,selected);
  renderCourseElevationView(model,selected);
  renderCoursePaceView(model,selected);
  renderCourseRacePlan(model);
  bindCourseSegmentClicks(rowsEl);
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
  const cps=state.data.checkpoints.filter(c=>c.race_id===state.raceId).sort((a,b)=>a.sequence_no-b.sequence_no),lastSeq=cps.at(-1)?.sequence_no??0;
  const maxSeq=new Map();
  starters.forEach(r=>nSplitsForResult(r.id).filter(s=>Number.isFinite(Number(s.sequence_no))).forEach(s=>maxSeq.set(r.id,Math.max(maxSeq.get(r.id)??-1,Number(s.sequence_no)))));
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
    return `<div class="flow-stage"><div class="flow-node" style="--size:${Math.max(14,Math.sqrt(stage.n/max)*100)}%"><strong>${stage.n}</strong><span>${nEsc(stage.name)}</span></div>${next?`<div class="flow-link"><i></i>${loss?`<em><span>${loss}</span><small>bröt före ${nEsc(next.name)}</small></em>`:'<em class="flow-zero"><span>0</span><small>avhopp</small></em>'}</div>`:''}</div>`;
  }).join('')}</div>`;
}
function allHistories(){
  return groupAthleteHistories(familyResults(),state.data.races);
}
const nNormClub=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/&/g,' OCH ').replace(/\bIDROTTSKLUBB\b/g,' IK ').replace(/\bIDROTTSFORENING\b/g,' IF ').replace(/\bFRIIDROTTSKLUBB\b/g,' FK ').replace(/\bAKTIEBOLAG\b|\bAB\b|\bSWEDEN\b|\bSVERIGE\b/g,' ').replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
function historyFilteredRows(){
  const sex=n$('#sexFilter')?.value||'',cls=n$('#classFilter')?.value||'',club=n$('#clubFilter')?.value||'',status=n$('#statusFilter')?.value||'';
  return familyResults().filter(row=>(!sex||nSex(row)===sex)&&(!cls||String(row.age_class||'')===cls)&&(!club||nNormClub(row.club||row.city)===club)&&(!status||String(row.status||'')===status));
}
function renderHall(){
  const el=n$('#hallOfFame'),explain=n$('#hallExplanation');if(!el)return;
  const copy={
    veterans:'Flest fullföljda Ultravasan för verifierade personer. DNS och DNF räknas inte som genomförda lopp.',
    improved:'Störst förbättring inom samma uttryckliga whole-course-jämförbarhetsserie. Andra CourseVersions blandas inte in.',
    consistent:'Minst tidsspridning inom samma uttryckliga whole-course-jämförbarhetsserie och minst tre målgångar.',
    chargers:'Starkast avslutning i ett enskilt lopp med exakta placeringspassager; lyftet normaliseras mot startfältets storlek.'
  };
  if(explain)explain.textContent=copy[nerd.hall]+' Fem kvinnor och fem män visas när underlaget räcker.';
  const model=nHistoryIntelligence?.hallOfFame?.(state.data,state.raceFamily,nerd.hall,{minRuns:3});
  const rows=model?.rows||[];
  const renderGroup=(sex,title)=>{
    const list=rows.filter(x=>nSex(x.rows.at(-1))===sex).slice(0,5);
    return `<section class="hall-sex-group ${sex==='F'?'women':'men'}"><h4>${title}</h4>${list.length?list.map((x,i)=>{const r=x.rows.at(-1);return `<button class="hall-row" data-id="${r.id}" data-history-scope="${nEsc(x.scope||'')}"><b>${i+1}</b><span><strong>${nEsc(r.name_as_published)}</strong><small>${nEsc(x.detail||'')}</small><em>${nEsc(x.reason||x.label)}</em></span><i>${nEsc(x.label)}</i><u aria-hidden="true">Karta ↗</u></button>`}).join(''):'<div class="empty compact-empty">Underlaget räcker inte till fem placeringar.</div>'}</section>`;
  };
  el.innerHTML=`<div class="hall-columns">${renderGroup('F','Kvinnor')}${renderGroup('M','Män')}</div>`;
  n$$('.hall-row').forEach(b=>b.onclick=()=>openHallMap(Number(b.dataset.id)));
}


const HALL_SEGMENT_COLORS=['#0d4c3a','#1b7659','#3a9b73','#d69b2d','#e86f3b','#7c3aed','#2878b5','#a63d68','#203d62'];
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
  const splits=nSplitsForResult(r.id).slice().sort((a,b)=>a.sequence_no-b.sequence_no),splitKey=k=>k==='finish'?'mora':k,byKey=new Map(splits.map(s=>[String(s.checkpoint_key||'').toLowerCase(),s])),cps=route.checkpoints||[];
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
  const el=n$('#raceFingerprint'),race=activeRace();if(!el||!race)return;
  const referenceRows=historyFilteredRows(),sexFilterActive=Boolean(n$('#sexFilter')?.value);
  let model;
  try{model=nHistoryIntelligence?.fingerprint?.(state.data,race,{currentResults:state.filtered,referenceResults:referenceRows,minReferenceYears:2,sexFilterActive})}
  catch(error){console.error('Historiskt fingeravtryck kunde inte byggas',error);el.innerHTML='<div class="empty">Historiskt jämförelseunderlag kunde inte verifieras.</div>';return}
  if(!model){el.innerHTML='<div class="empty">Historik behövs för index.</div>';return}
  el.innerHTML=model.metrics.map(metric=>{
    const v=metric.index,available=metric.available&&Number.isFinite(Number(v)),width=available?Math.max(4,Math.min(100,Number(v)/1.6)):4,left=available?Math.max(4,Math.min(96,Number(v)/1.6)):50;
    const years=metric.reference_years?.length?(metric.reference_years[0]+(metric.reference_years.length>1?'–'+metric.reference_years.at(-1):'')):'saknas';
    return `<div class="finger-row ${available?'':'unavailable'}" data-history-metric="${nEsc(metric.id)}" data-history-scope="${nEsc(metric.reference_scope||'')}"><span>${nEsc(metric.label)}<small>${nEsc(years)} · ${metric.reference_n??0} referensår</small></span><div><i style="width:${width}%"></i><b style="left:${left}%"></b></div><strong>${available?Math.round(v):'–'}</strong><em>${nEsc(metric.note||'')}</em></div>`;
  }).join('')+`<p class="microcopy">${race.year}: prestationsmått använder ${model.performance_reference_years.length} whole-course-jämförbara referensår. Index 100 = medianen av loppårsnormalerna.</p>`;
}

function renderHistorySuggestions(){
  const input=n$('#historySearch'),box=n$('#historySuggestions');if(!input||!box)return;const q=input.value.trim().toLowerCase();if(q.length<2){box.hidden=true;return}
  const groups=allHistories().filter(g=>{const r=g.rows[0];return (String(r.name_as_published||'')+' '+g.rows.map(x=>x.bib||'').join(' ')).toLowerCase().includes(q)}).sort((a,b)=>b.rows.length-a.rows.length).slice(0,10);
  box.innerHTML=groups.length?groups.map(g=>{const r=g.rows.at(-1),years=g.rows.map(x=>state.data.races.find(y=>y.id===x.race_id)?.year).filter(Boolean),identity=[r.bib?'#'+r.bib:'',r.age_class||'',r.club||r.city||''].filter(Boolean).join(' · '),verified=g.verified_person?'verifierad person':'enskilt resultat';return `<button data-id="${r.id}"><strong>${nEsc(r.name_as_published)}</strong><small>${g.rows.length} lopp · ${years.join(', ')} · ${nEsc(verified)}${identity?' · '+nEsc(identity):''}</small></button>`}).join(''):'<div class="empty">Ingen löpare hittades</div>';box.hidden=false;
  n$$('#historySuggestions button').forEach(b=>b.onclick=()=>{const r=state.data.results.find(x=>String(x.id)===String(b.dataset.id));if(r){input.value=r.name_as_published;box.hidden=true;renderRunnerHistory(r.id)}});
}
function renderRunnerHistory(resultId){
  const el=n$('#runnerHistory');if(!el)return;
  const model=nHistoryIntelligence?.personHistory?.(state.data,resultId);
  if(!model){el.innerHTML='<div class="empty">Personhistoriken kunde inte byggas.</div>';return}
  const rows=model.rows,focus=model.focus_series,best=focus?.best||null,improvement=focus?.delta_seconds;
  const development=Number.isFinite(Number(improvement))?(improvement>=0?'−':'+')+Math.abs(Math.round(improvement/60))+' min':model.finished_count>1?'Ej jämförbart':'–';
  const focusIds=new Set((focus?.rows||[]).map(row=>String(row.id)));
  const timeline=rows.map(item=>{const r=item.result,comparable=focusIds.has(String(r.id)),status=item.finished?nTime(r.finish_seconds):String(r.status||'–');return `<button class="history-year ${r.id===best?.id?'best':''} ${comparable?'comparable':'separate-series'}" data-id="${r.id}" data-history-scope="${nEsc(item.comparison_key||'')}"><b>${item.year||'–'}</b><strong>${status}</strong><span>plats ${r.overall_place??'–'} · ${nEsc(r.age_class||'')} · ${nEsc(item.course_version_id||'okänd banversion')}</span></button>`}).join('');
  const series=model.comparable_series.map(series=>`<span class="history-series ${series.key===model.focus_series_key?'active':''}" data-history-scope="${nEsc(series.key)}"><strong>${series.year_from===series.year_to?series.year_from:series.year_from+'–'+series.year_to}</strong><small>${series.count} målgångar · ${nEsc(series.course_version_ids.join(', '))}</small></span>`).join('');
  const identityNote=model.verified_person
    ?`Verifierad personidentitet. ${model.incomparable_to_focus_count?model.incomparable_to_focus_count+' fullföljda lopp ligger i annan banjämförbarhetsserie och påverkar inte utvecklingen.':'Alla fullföljda lopp i den fokuserade historiken är banjämförbara.'}`
    :'Ingen verifierad flerårslänk finns. Namn och startnummer används inte för att slå ihop personer.';
  const displayName=rows.at(-1)?.result?.name_as_published||'Löpare';
  el.innerHTML=`<div class="history-head"><div><span>${rows.length} registrerade lopp</span><strong>${nEsc(displayName)}</strong></div><div><span>Bästa tid i fokuserad serie</span><strong>${nTime(best?.finish_seconds)}</strong></div><div><span>Utveckling inom serien</span><strong>${development}</strong></div></div><p class="history-identity-note ${model.verified_person?'verified':'unverified'}">${nEsc(identityNote)}</p>${series?`<div class="history-series-list" aria-label="Jämförbara banserier">${series}</div>`:''}<div class="history-timeline">${timeline}</div><button id="historyMap" class="compare-map-button" ${rows.length?'':'disabled'}>Spela upp åren på karta →</button>`;
  n$$('.history-year').forEach(b=>b.onclick=()=>openRunner(Number(b.dataset.id)));
  const mapRows=rows.map(item=>item.result).slice(-5);
  n$('#historyMap').onclick=()=>window.openUltravasanMap?window.openUltravasanMap(mapRows):window.open('karta.html?runners='+mapRows.map(r=>r.id).join(','),'_blank');
}


if(typeof module!=='undefined'&&module.exports)module.exports={athleteIdentityKey,groupAthleteHistories,segmentClassOptions,filterRowsBySegmentClass,nCompareClasses};
if(typeof window!=='undefined'&&typeof document!=='undefined'){
  const nerdTimer=setInterval(()=>{try{if(window.ULTRAVASAN_SPLITS_READY)initNerdLab();if(nerd.ready)clearInterval(nerdTimer)}catch(e){console.error('NerdLab',e);clearInterval(nerdTimer)}},60);
}
