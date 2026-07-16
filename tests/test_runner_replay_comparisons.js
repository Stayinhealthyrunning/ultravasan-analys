'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const replay=require('../docs/assets/runner-replay.js');
const statusApi=require('../docs/assets/result-status.js');
const registry=require('../data/routes/ultravasan90-routes.json');

const context={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../docs/data/ultravasan-data.js'),'utf8'),context);
const data=context.window.ULTRAVASAN_DATA;

function modelFor(raceKey,predicate=()=>true){
  const race=data.races.find(item=>item.race_key===raceKey),result=data.results.find(item=>item.race_id===race.id&&item.status==='FINISHED'&&predicate(item)),route=replay.routeForRace(registry,race),raceCheckpoints=data.checkpoints.filter(item=>item.race_id===race.id),splits=data.splits.filter(item=>item.result_id===result.id);
  return replay.createModel({race,result,route,raceCheckpoints,splits,dataset:data,statusApi});
}

const old90=modelFor('ultravasan90-2015'),oldFemale90=modelFor('ultravasan90-2015',result=>result.sex==='F'),new90=modelFor('ultravasan90-2025'),female90=modelFor('ultravasan90-2025',result=>result.sex==='F'),uv45=modelFor('ultravasan45-2025');
for(const model of [old90,oldFemale90,new90,female90,uv45]){
  for(const key of ['field','class','sex'])assert.ok(model.comparisons[key].available,`${model.race.race_key}: ${key} saknar profil`);
  for(const reference of Object.values(model.comparisons).filter(item=>item?.available))for(let index=1;index<reference.anchors.length;index++)assert.ok(reference.anchors[index].time>reference.anchors[index-1].time,`${model.race.race_key}: ${reference.id} har inte stigande tider`);
}

assert.strictEqual(old90.comparisons.class.details.includes(old90.result.age_class),true,'Klassmedianen ska använda exakt vald klass');
assert.strictEqual(female90.comparisons.sex.sex,'F');
assert.strictEqual(female90.comparisons.sex.icon,'♀');
assert.strictEqual(new90.comparisons.sex.sex,'M');
assert.strictEqual(new90.comparisons.sex.icon,'♂');
assert.ok(!Object.prototype.hasOwnProperty.call(uv45.comparisons,'medal'),'UV45 får aldrig skapa medaljfunktion');

assert.deepStrictEqual(replay.MEDAL_CONFIG,{pre2023:{M:{seconds:34199,sexLabel:'Herrar'},F:{seconds:39599,sexLabel:'Damer'}},post2023:{M:{seconds:35999,sexLabel:'Herrar'},F:{seconds:41759,sexLabel:'Damer'}}});
assert.strictEqual(replay.medalTimeForRace(old90.race,'M'),34199);
assert.strictEqual(replay.medalTimeForRace(oldFemale90.race,'F'),39599);
assert.strictEqual(replay.medalTimeForRace(new90.race,'M'),35999);
assert.strictEqual(replay.medalTimeForRace(female90.race,'F'),41759);
assert.strictEqual(replay.fmtTime(34199),'9:29:59');
assert.strictEqual(replay.fmtTime(39599),'10:59:59');
assert.strictEqual(replay.fmtTime(35999),'9:59:59');
assert.strictEqual(replay.fmtTime(41759),'11:35:59');
assert.strictEqual(replay.medalTimeForRace(uv45.race,'M'),null);
assert.strictEqual(replay.medalTimeForRace(new90.race,'U'),null);
assert.strictEqual(old90.comparisons.medal.anchors[0].time,0);
assert.strictEqual(old90.comparisons.medal.anchors.at(-1).time,34199);
assert.strictEqual(oldFemale90.comparisons.medal.anchors.at(-1).time,39599);
assert.strictEqual(new90.comparisons.medal.anchors.at(-1).time,35999);
assert.strictEqual(female90.comparisons.medal.anchors.at(-1).time,41759);
assert.ok(old90.comparisons.medal.candidates.every(item=>item.sex==='M'));
assert.ok(oldFemale90.comparisons.medal.candidates.every(item=>item.sex==='F'));
assert.ok(new90.comparisons.medal.candidates.every(item=>item.sex==='M'));
assert.ok(female90.comparisons.medal.candidates.every(item=>item.sex==='F'));
assert.strictEqual(replay.distanceAtTime(new90.comparisons.medal,35999),new90.totalDistance,'Medaljväggen ska nå exakt Mora vid medaljtiden');
assert.ok(new90.comparisons.medal.candidates.some(item=>item.finish<=35999)&&new90.comparisons.medal.candidates.some(item=>item.finish>35999),'Medaljkandidater ska väljas på båda sidor om gränsen');
const closest=new90.comparisons.medal.candidates.slice().sort((a,b)=>Math.abs(a.finish-35999)-Math.abs(b.finish-35999));
assert.ok(closest[0].weight>=closest.at(-1).weight,'Närmare medaljgräns ska ge högre vikt');
assert.strictEqual(replay.weightedMedian([{value:.4,weight:1},{value:.5,weight:10},{value:.9,weight:1}]),.5,'Viktad median ska vara robust mot svaga yttervärden');

const syntheticRace={id:900,race_key:'ultravasan90-2025',year:2025,distance_km:20},syntheticCheckpoints=[{checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},{checkpoint_key:'half',name:'Halvvägs',sequence_no:1,distance_km:10},{checkpoint_key:'mora',name:'Mora',sequence_no:2,distance_km:20}],syntheticResults=Array.from({length:7},(_,index)=>({id:index+1,race_id:900,status:index===6?'DNF':'FINISHED',finish_seconds:index===6?null:1200+index*10,age_class:index<5?'M40':'M50',sex:index===5?'F':'M'})),syntheticSplits=syntheticResults.flatMap((result,index)=>result.status==='FINISHED'?[{result_id:result.id,checkpoint_key:'half',elapsed_seconds:index===4?null:600+index*5},{result_id:result.id,checkpoint_key:'mora',elapsed_seconds:result.finish_seconds}]:[]),built=replay.completeProfilesForRace({race:syntheticRace,raceCheckpoints:syntheticCheckpoints,results:syntheticResults,splits:syntheticSplits,statusApi});
assert.strictEqual(built.profiles.length,5,'DNF och saknad kontrolltid ska filtreras ur den stabila kohorten');
const tooSmall=replay.medianReference({id:'class',profiles:built.profiles,checkpoints:built.checkpoints,filter:profile=>profile.result.age_class==='M50',label:'Min klass',icon:'◎',color:'#138a78'});
assert.strictEqual(tooSmall.available,false);
assert.strictEqual(tooSmall.message,'För få giltiga resultat för klassmedian');

function comparisonRace(id,year){return{id,race_key:`ultravasan90-${year}`,year,distance_km:20,name:`Test ${year}`}}
function comparisonCheckpoints(raceId){return[
  {race_id:raceId,checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},
  {race_id:raceId,checkpoint_key:'half',name:'Halvvägs',sequence_no:1,distance_km:10},
  {race_id:raceId,checkpoint_key:'mora',name:'Mora mål',sequence_no:2,distance_km:20}
]}
let comparisonResultId=10000;
function comparisonCohort(race,sex,count,limit){
  const results=[],splits=[];
  for(let index=0;index<count;index++){
    const id=comparisonResultId++,finish=limit+(index-Math.floor(count/2))*30;
    results.push({id,race_id:race.id,status:'FINISHED',finish_seconds:finish,age_class:sex==='F'?'D40':'M40',sex});
    splits.push({result_id:id,checkpoint_key:'half',elapsed_seconds:Math.round(finish*.47)},{result_id:id,checkpoint_key:'mora',elapsed_seconds:finish});
  }
  return{results,splits};
}
const fallbackRaces=[comparisonRace(1001,2025),comparisonRace(1002,2024),comparisonRace(1003,2022)],fallbackCheckpoints=fallbackRaces.flatMap(race=>comparisonCheckpoints(race.id));
const fallbackParts=[comparisonCohort(fallbackRaces[0],'F',12,41759),comparisonCohort(fallbackRaces[1],'F',12,41759),comparisonCohort(fallbackRaces[2],'F',30,39599),comparisonCohort(fallbackRaces[0],'M',30,35999),comparisonCohort(fallbackRaces[1],'M',30,35999)];
const fallbackDataset={races:fallbackRaces,checkpoints:fallbackCheckpoints,results:fallbackParts.flatMap(part=>part.results),splits:fallbackParts.flatMap(part=>part.splits)},fallbackResult=fallbackParts[0].results[0],fallbackReferences=replay.buildReferenceProfiles({race:fallbackRaces[0],result:fallbackResult,raceCheckpoints:comparisonCheckpoints(1001),dataset:fallbackDataset,statusApi});
assert.strictEqual(fallbackReferences.medal.available,true,'Samma kön från jämförbara år ska ge en reservprofil');
assert.strictEqual(fallbackReferences.medal.source,'comparable-years');
assert.strictEqual(fallbackReferences.medal.anchors.at(-1).time,41759);
assert.ok(fallbackReferences.medal.candidates.every(item=>item.sex==='F'),'Fallback får aldrig blanda kön');
assert.deepStrictEqual([...new Set(fallbackReferences.medal.candidates.map(item=>item.year))].sort(),[2024,2025],'Fallback får aldrig blanda medaljeror');
assert.ok(fallbackReferences.medal.details.includes('Damer')&&fallbackReferences.medal.details.includes('2024')&&fallbackReferences.medal.details.includes('2025'));

const unknownResult={...new90.result,sex:'U'},unknownComparisons=replay.buildReferenceProfiles({race:new90.race,result:unknownResult,raceCheckpoints:data.checkpoints.filter(item=>item.race_id===new90.race.id),dataset:data,statusApi}),unknown90={...new90,result:unknownResult,comparisons:unknownComparisons};
assert.ok(!Object.prototype.hasOwnProperty.call(unknownComparisons,'medal'),'Okänt kön får inte anta herrgräns eller skapa medaljprofil');

const playerState=replay.stateAt(new90,30),classReference=new90.comparisons.class,gap=replay.gapAtDistance(classReference,playerState.distance,playerState.time),referenceDistance=replay.distanceAtTime(classReference,playerState.time);
assert.ok(Number.isFinite(gap)&&Number.isFinite(referenceDistance),'Referensen ska interpoleras från samma gemensamma loppklocka');
assert.ok(/före|efter|i nivå/.test(replay.formatGap(gap)),'Tidsgap måste förklaras med svenska ord');
assert.ok(replay.formatGap(120,true).includes('före medaljväggen'));
assert.ok(replay.formatGap(-120,true).includes('efter medaljväggen'));
const normal=replay.routeNormalAngle(new90,30);
assert.ok(Number.isFinite(normal),'Medaljstreckets normalvinkel ska kunna beräknas längs rutten');

const rendered90=replay.render(new90),renderedFemale90=replay.render(female90),rendered45=replay.render(uv45),renderedUnknown=replay.render(unknown90),ids=[...rendered90.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
assert.strictEqual(new Set(ids).size,ids.length,'Runner replay får inte skapa dubbla HTML-ID:n');
assert.ok(rendered90.includes('aria-label="Jämför med"')&&rendered90.includes('data-comparison-toggle="field"')&&rendered90.includes('data-comparison-toggle="class"')&&rendered90.includes('data-comparison-toggle="sex"')&&rendered90.includes('data-comparison-toggle="medal"'));
assert.ok(!rendered45.includes('data-comparison-toggle="medal"')&&!rendered45.includes('data-reference-marker="medal"'),'UV45 får inte lämna kvar medaljtoggle eller markör');
assert.ok(!renderedUnknown.includes('data-comparison-toggle="medal"')&&!renderedUnknown.includes('data-reference-marker="medal"')&&!renderedUnknown.includes('data-elevation-medal'),'Okänt kön får inte lämna kvar medalj-UI');
assert.ok(rendered90.includes('Herrar · 9:59:59')&&rendered90.includes('Herrar · medaljtid 9:59:59'),'Herrarnas medalj-UI ska visa kön och exakt gräns');
assert.ok(renderedFemale90.includes('Damer · 11:35:59')&&renderedFemale90.includes('Damer · medaljtid 11:35:59'),'Damernas medalj-UI ska visa kön och exakt gräns');
assert.ok(rendered90.includes('role="tablist"')&&rendered90.includes('role="tab"')&&rendered90.includes('role="tabpanel"'),'Jämförelser och Insikter ska vara tillgängliga flikar');
assert.ok(rendered90.includes('data-reference-tooltip')&&rendered90.includes('tabindex="0" role="button"'),'Referensmarkörer ska stödja tooltip och tangentbordsfokus');
assert.ok(rendered90.includes('https://tile.openstreetmap.org/')&&rendered90.includes('https://www.openstreetmap.org/copyright')&&rendered90.includes('© OpenStreetMap contributors'),'OSM ska använda HTTPS och länkad korrekt attribution');
assert.ok(rendered90.indexOf('data-reference-marker="medal"')<rendered90.indexOf('runner-replay-marker'),'Huvudlöparen ska ligga över medaljväggen i SVG-staplingen');
assert.strictEqual((rendered90.match(/data-elevation-medal/g)||[]).length,1,'Exakt en synkroniserad medaljmarkör ska finnas i höjdprofilen');
assert.strictEqual((rendered90.match(/class="runner-elevation-chart"/g)||[]).length,1,'Höjdprofilen får inte dupliceras');
assert.ok(rendered90.includes('class="runner-elevation-dock"')&&rendered90.includes('data-elevation-action="toggle"')&&rendered90.includes('aria-expanded="false"'),'Höjdprofilen ska vara dockad och expanderbar');
assert.ok(!rendered90.includes('runner-elevation-section'),'Den gamla fristående höjdprofilen ska vara borttagen');
assert.ok(rendered90.indexOf('runner-elevation-dock')<rendered90.indexOf('runner-replay-insights'),'Den dockade höjdprofilen ska ligga i kartkortet före analyskolumnen');
assert.ok(!rendered45.includes('data-elevation-medal'),'UV45 får inte visa medaljmarkör i höjdprofilen');

const html=fs.readFileSync(require.resolve('../docs/index.html'),'utf8'),app=fs.readFileSync(require.resolve('../docs/assets/app.js'),'utf8'),css=fs.readFileSync(require.resolve('../docs/assets/runner-replay.css'),'utf8');
assert.ok(html.includes('Individuell loppanalys')&&html.includes('Analysera en löpares lopp i realtid')&&html.includes('placering mot klass samt få prestationsinsikter'));
assert.strictEqual((html.match(/runner-lookup-panel/g)||[]).length,1,'Intro och löparsökning ska vara ett enda gemensamt block');
assert.ok(html.includes('analysis-scope individual-scope runner-lookup-panel individual-runner-panel')&&html.includes('individual-runner-search"><h3>Hitta en löpare</h3>'),'Det sammanslagna blocket ska ha tydlig intro- och sökhierarki');
assert.ok(app.includes('dataset:state.data,statusApi:window.ResultStatus'),'Replay ska återanvända hydratiserad data och central statusklassning');
assert.strictEqual((app.match(/\.individual-runner-panel'/g)||[]).length,1,'Det sammanslagna blocket ska bara få en informationshjälp');
assert.strictEqual((html.match(/class-evolution\.js/g)||[]).length,1,'class-evolution.js ska laddas exakt en gång');
assert.ok(css.includes('.runner-replay-reference.medal line')&&css.includes('.runner-replay-analysis-tabs')&&css.includes('.runner-replay-comparison-controls'));
assert.ok(css.includes('grid-template-columns:minmax(175px,190px) minmax(0,1fr) minmax(250px,275px)'),'Desktoplayouten ska prioritera en större karta och smalare sidopaneler');
assert.ok(css.includes('.runner-replay-map{flex:1;height:470px;min-height:430px'),'Desktopkartan ska vara större än tidigare');
assert.ok(css.includes('.runner-replay-map-tiles{opacity:.32'),'OSM-bakgrunden ska ha exakt 0,32 i opacitet');
assert.ok(css.includes('.runner-replay-insight-grid{display:grid;grid-template-columns:1fr'),'Insikter ska visas i en kolumn');
assert.ok(css.includes('.runner-elevation-dock.expanded .runner-elevation-chart{height:235px}'),'Expanderat desktopläge för höjdprofilen ska finnas');
assert.ok(css.includes('.runner-replay-rank-card{grid-column:1/-1;text-align:center}')&&css.includes('.runner-replay-rank-card dd{display:grid;grid-template-rows:3rem 1.45em'),'Placeringskorten ska använda full bredd och fasta separata rader');
assert.ok(rendered90.includes('class="runner-replay-time-metric"')&&css.includes('.runner-replay-time-metric dt{display:flex;align-items:flex-end;min-height:2.5em}'),'Loppstid och delsträcksfart ska reservera samma etiketthöjd');
assert.ok(css.includes('overflow-wrap:normal;word-break:normal;hyphens:none'),'Live-boxen får inte bryta ord mitt i ordet');
assert.ok(css.includes('.individual-runner-panel{')&&css.includes('grid-template-columns:minmax(300px,1.05fr) minmax(440px,1fr)'),'Intro och sökning ska dela ett effektivt desktopblock');
assert.ok(css.includes('.grid.two.overview-chart-row{grid-template-columns:repeat(2,minmax(0,1fr))'),'Översiktsdiagrammen ska ha lika breda desktopkolumner');
assert.ok(css.includes('.overview-chart-row>.chart-panel{min-height:410px!important}'),'Staplande översiktsdiagram ska behålla samma visuella minsta storlek');
assert.ok(css.includes('@media(max-width:700px)')&&css.includes('.runner-replay-now{order:1}')&&css.includes('min-height:42px'),'Mobilordning och touchytor ska vara definierade');
assert.ok(app.includes('Math.floor(min/60)*60')&&app.includes('t+=60')&&app.includes('Math.round(mean/60)*60'),'Måltidssimulatorn ska skapa val för varje hel minut');
assert.ok(html.includes('id="targetMedalTimes"')&&html.includes('Herrar under 10:00:00')&&html.includes('max 09:59:59')&&html.includes('Damer under 11:36:00')&&html.includes('max 11:35:59'),'Aktuella UV90-medaljtider ska finnas kompakt i måltidssimulatorn');
assert.ok(app.includes("medal.hidden=state.raceFamily!=='uv90'"),'Medaljtidstexten ska döljas i UV45');
assert.ok(html.includes('id="placementZoomReset"')&&app.includes('placementZoomState.domain=')&&app.includes("addEventListener('pointerdown'")&&app.includes("addEventListener('dblclick',resetPlacementZoom)"),'Placeringsdiagrammet ska ha områdeszoom och tydlig återställning');
assert.ok(app.includes('class="placement-scatter-point" tabindex="0" role="img"')&&app.includes('<title>${esc(title)}</title>'),'Punkternas tooltip och tangentbordsinteraktion ska finnas kvar efter zoom');
assert.ok(css.includes('.placement-zoom-hit{')&&css.includes('touch-action:pan-y')&&css.includes('.placement-zoom-reset{min-height:42px}'),'Diagramzoomen ska ha pekstöd utan att blockera vanlig mobilscroll');

console.log('OK: köns- och erasäkra medaljprofiler, dockad höjdprofil, större karta, UI och UV45-isolering');
