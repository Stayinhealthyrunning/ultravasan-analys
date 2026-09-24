'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const indexApi=require(path.join(root,'docs/assets/data-index.js'));
const replay=require(path.join(root,'docs/assets/runner-replay.js'));
const routes=require(path.join(root,'data/routes/ultravasan90-routes.json'));
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'docs/data/ultravasan-data.js'),'utf8'),context);
const data=context.window.ULTRAVASAN_DATA;

const index=indexApi.ensureSplitsByResult(data);
assert.strictEqual(indexApi.ensureSplitsByResult(data),index,'indexet ska byggas exakt en gång per dataset');
assert.strictEqual(data.splitsByResult,index,'datasetet ska dela samma index med alla moduler');
assert.strictEqual(Object.prototype.propertyIsEnumerable.call(data,'splitsByResult'),false,'indexet ska inte serialiseras eller ändra exportformatet');

const cases=[
  ['UV90 2025',1376],
  ['UV90 2016 Andreas Hermansson',11545],
  ['UV45 2025 fullföljare',13799],
  ['UV45 2025 DNF/partiell serie',13771],
];

function replaySnapshot(result,splits){
  const race=data.races.find(item=>item.id===result.race_id);
  const route=replay.routeForRace(routes,race);
  const raceCheckpoints=data.checkpoints.filter(item=>item.race_id===race.id);
  const model=replay.createModel({race,result,route,raceCheckpoints,splits});
  return {
    checkpoints:model.checkpoints.map(item=>item.key),
    anchors:model.anchors.map(item=>[item.key,item.time,item.distance,item.exact]),
    segments:model.segments.map(item=>[item.from.key,item.to.key,item.seconds,item.pace,item.passed]),
    finished:model.finished,
    endTime:model.endTime,
  };
}

for(const [label,resultId] of cases){
  const result=data.results.find(item=>item.id===resultId);
  assert.ok(result,`${label}: result saknas`);
  const filtered=data.splits.filter(item=>item.result_id===resultId);
  const indexed=indexApi.splitsForResult(data,resultId);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(indexed)),JSON.parse(JSON.stringify(filtered)),`${label}: antal, ordning eller splitvärden skiljer sig`);
  assert.ok(Object.isFrozen(indexed),`${label}: indexraden ska vara read-only i praktiken`);
  assert.deepStrictEqual(replaySnapshot(result,indexed),replaySnapshot(result,filtered),`${label}: replayresultatet ändrades`);
}

const andreas=indexApi.splitsForResult(data,11545);
assert.strictEqual(andreas.length,8);
assert.strictEqual(andreas[0].elapsed_seconds,2476);
assert.strictEqual(andreas.at(-1).elapsed_seconds,26280);

const uv90Race=data.races.find(item=>item.race_key==='ultravasan90-2025');
const uv90Rows=data.results.filter(item=>item.race_id===uv90Race.id);
const filteredSelection=data.splits.filter(item=>uv90Rows.some(result=>result.id===item.result_id));
const indexedSelection=indexApi.splitsForResults(data,uv90Rows);
assert.deepStrictEqual(JSON.parse(JSON.stringify(indexedSelection)),JSON.parse(JSON.stringify(filteredSelection)),'urvalsuppslag ska bevara exportens globala splitordning');

function median(values){const sorted=values.slice().sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2}
function aggregates(splits){
  const groups=new Map();
  for(const split of splits){
    if(!(Number(split.pace_seconds_per_km)>0))continue;
    const key=`${split.sequence_no}|${data.results.find(result=>result.id===split.result_id)?.sex||''}|${data.results.find(result=>result.id===split.result_id)?.age_class||''}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(Number(split.pace_seconds_per_km));
  }
  return [...groups].map(([key,values])=>[key,median(values)]);
}
assert.deepStrictEqual(aggregates(indexedSelection),aggregates(filteredSelection),'medianer, fartkarta samt klass- och könsgrupper ska vara identiska');

const indexHtml=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
const mapHtml=fs.readFileSync(path.join(root,'docs/karta.html'),'utf8');
for(const html of [indexHtml,mapHtml]){
  assert.ok(html.includes('assets/data-index.js'),'båda applikationsytorna ska ladda samma indexmodul');
  assert.ok(html.includes('assets/data-adapter.js'),'båda applikationsytorna ska ladda U4 DataAdapter');
  assert.ok(html.includes('assets/race-ui.js'),'båda applikationsytorna ska ladda U4 RaceUI');
  assert.ok(html.includes('assets/map-engine.js'),'båda applikationsytorna ska ladda U4 MapEngine');
  assert.ok(html.includes('assets/playback.js'),'båda applikationsytorna ska ladda U4 Playback');
  assert.ok(html.includes('assets/app-state.js'),'båda applikationsytorna ska ladda U4 AppState');
  assert.ok(html.includes('assets/charts.js'),'båda applikationsytorna ska ladda U4 Charts');
  assert.ok(html.includes('assets/data-loader.js'),'båda applikationsytorna ska ladda U3 DataLoader');
  assert.ok(html.includes('data/ultravasan-data-catalog.js'),'båda applikationsytorna ska ladda datakatalogen');
}
assert.ok(indexHtml.indexOf('data/ultravasan-data-catalog.js')<indexHtml.indexOf('assets/data-loader.js'),'katalogen ska laddas före DataLoader');
assert.ok(indexHtml.indexOf('assets/data-loader.js')<indexHtml.indexOf('assets/app.js'),'DataLoader ska laddas före appen');
assert.ok(indexHtml.indexOf('assets/data-index.js')<indexHtml.indexOf('assets/data-adapter.js'),'indexmodulen ska laddas före DataAdapter');
assert.ok(indexHtml.indexOf('assets/race-contracts.js')<indexHtml.indexOf('assets/race-ui.js'),'loppkontrakten ska laddas före RaceUI');
assert.ok(indexHtml.indexOf('assets/race-ui.js')<indexHtml.indexOf('assets/map-engine.js'),'RaceUI ska laddas före MapEngine');
assert.ok(indexHtml.indexOf('assets/map-engine.js')<indexHtml.indexOf('assets/playback.js'),'MapEngine ska laddas före Playback');
assert.ok(indexHtml.indexOf('assets/playback.js')<indexHtml.indexOf('assets/runner-replay.js'),'Playback ska laddas före Replay');
assert.ok(indexHtml.indexOf('assets/playback.js')<indexHtml.indexOf('assets/app-state.js'),'Playback ska laddas före AppState');
assert.ok(indexHtml.indexOf('assets/map-engine.js')<indexHtml.indexOf('assets/runner-replay.js'),'MapEngine ska laddas före Replay');
assert.ok(indexHtml.indexOf('assets/race-ui.js')<indexHtml.indexOf('assets/app.js'),'RaceUI ska laddas före huvudappen');
assert.ok(indexHtml.indexOf('assets/race-contracts.js')<indexHtml.indexOf('assets/data-adapter.js'),'loppkontrakten ska laddas före DataAdapter');
assert.ok(indexHtml.indexOf('assets/data-adapter.js')<indexHtml.indexOf('assets/app-state.js'),'DataAdapter ska laddas före AppState');
assert.ok(indexHtml.indexOf('assets/app-state.js')<indexHtml.indexOf('assets/charts.js'),'AppState ska laddas före Charts');
assert.ok(indexHtml.indexOf('assets/charts.js')<indexHtml.indexOf('assets/app.js'),'Charts ska laddas före appen');
assert.ok(indexHtml.indexOf('assets/app-state.js')<indexHtml.indexOf('assets/app.js'),'AppState ska laddas före appen');
assert.ok(indexHtml.indexOf('assets/data-adapter.js')<indexHtml.indexOf('assets/app.js'),'DataAdapter ska laddas före appen');
assert.ok(mapHtml.indexOf('data/ultravasan-data-catalog.js')<mapHtml.indexOf('assets/data-loader.js'),'kartvyn ska läsa katalogen före DataLoader');
assert.ok(mapHtml.indexOf('assets/data-loader.js')<mapHtml.indexOf('assets/map.js'),'kartvyn ska läsa DataLoader före kartduellen');
assert.ok(mapHtml.indexOf('assets/data-index.js')<mapHtml.indexOf('assets/data-adapter.js'),'kartans indexmodul ska laddas före DataAdapter');
assert.ok(mapHtml.indexOf('assets/race-contracts.js')<mapHtml.indexOf('assets/race-ui.js'),'kartans loppkontrakt ska laddas före RaceUI');
assert.ok(mapHtml.indexOf('assets/race-ui.js')<mapHtml.indexOf('assets/map-engine.js'),'Kartans RaceUI ska laddas före MapEngine');
assert.ok(mapHtml.indexOf('assets/map-engine.js')<mapHtml.indexOf('assets/playback.js'),'Kartans MapEngine ska laddas före Playback');
assert.ok(mapHtml.indexOf('assets/playback.js')<mapHtml.indexOf('assets/app-state.js'),'Kartans Playback ska laddas före AppState');
assert.ok(mapHtml.indexOf('assets/playback.js')<mapHtml.indexOf('assets/map.js'),'Playback ska laddas före kartduellen');
assert.ok(mapHtml.indexOf('assets/map-engine.js')<mapHtml.indexOf('assets/map.js'),'MapEngine ska laddas före kartduellen');
assert.ok(mapHtml.indexOf('assets/race-ui.js')<mapHtml.indexOf('assets/map.js'),'RaceUI ska laddas före kartduellen');
assert.ok(mapHtml.indexOf('assets/race-contracts.js')<mapHtml.indexOf('assets/data-adapter.js'),'kartans loppkontrakt ska laddas före DataAdapter');
assert.ok(mapHtml.indexOf('assets/data-adapter.js')<mapHtml.indexOf('assets/app-state.js'),'Kartans DataAdapter ska laddas före AppState');
assert.ok(mapHtml.indexOf('assets/app-state.js')<mapHtml.indexOf('assets/charts.js'),'Kartans AppState ska laddas före Charts');
assert.ok(mapHtml.indexOf('assets/charts.js')<mapHtml.indexOf('assets/map.js'),'Charts ska laddas före kartduellen');
assert.ok(mapHtml.indexOf('assets/app-state.js')<mapHtml.indexOf('assets/map.js'),'AppState ska laddas före kartduellen');
assert.ok(mapHtml.indexOf('assets/data-adapter.js')<mapHtml.indexOf('assets/map.js'),'DataAdapter ska laddas före kartduellen');

for(const file of ['app.js','audience-analytics.js','nerdlab.js','map.js']){
  const source=fs.readFileSync(path.join(root,'docs/assets',file),'utf8');
  assert.ok(source.includes('splitsByResult')||source.includes('UltravasanDataIndex'),`${file} ska använda det gemensamma indexet`);
}

console.log('OK: gemensamt splitsByResult-index bevarar splits, replay och aggregat exakt');


const appSource=fs.readFileSync(path.join(root,'docs/assets/app.js'),'utf8');
const mapSource=fs.readFileSync(path.join(root,'docs/assets/map.js'),'utf8');
assert.ok(appSource.includes('UltravasanDataAdapter.hydrate'),'huvudappen ska hydrera genom gemensam DataAdapter');
assert.ok(mapSource.includes("require('./data-adapter.js')")&&mapSource.includes('mapDataAdapter.hydrate'),'kartappen ska hydrera genom samma DataAdapter');
assert.ok(!appSource.includes('const rr=new Map(d.results.map'),'huvudappen får inte återinföra egen split/checkpoint-hydrering');
assert.ok(!mapSource.includes('const rr=new Map(d.results.map'),'kartappen får inte återinföra egen split/checkpoint-hydrering');


const raceUiSource=fs.readFileSync(path.join(root,'docs/assets/race-ui.js'),'utf8');
assert.ok(appSource.includes('window.RaceUI.familyKey')&&appSource.includes('window.RaceUI.presentations'),'huvudappen ska använda delad RaceUI');
assert.ok(mapSource.includes("require('./race-ui.js')")&&mapSource.includes('mapRaceUi.selectionTitle'),'kartappen ska använda samma RaceUI');
assert.ok(!mapSource.includes('mapContracts.family(families[0])'),'kartappen får inte återinföra egen familjerubrik');
assert.ok(raceUiSource.includes('selectionTitle')&&raceUiSource.includes('startNameFor'),'RaceUI ska äga gemensamma presentationsregler');


const appStateSource=fs.readFileSync(path.join(root,'docs/assets/app-state.js'),'utf8');
assert.ok(appSource.includes('UltravasanAppState.createMain'),'huvudappen ska initiera state via U4 AppState');
assert.ok(mapSource.includes("require('./app-state.js')")&&mapSource.includes('mapStateApi.createMap'),'kartappen ska initiera state via samma U4 AppState, även i CommonJS');
assert.ok(appStateSource.includes('createMain')&&appStateSource.includes('createMap'),'AppState ska exponera båda ytkontrakten');


const chartsSource=fs.readFileSync(path.join(root,'docs/assets/charts.js'),'utf8');
assert.ok(appSource.includes('window.UltravasanCharts.median')&&appSource.includes('window.UltravasanCharts.quantile'),'huvudappen ska använda U4 Charts');
assert.ok(mapSource.includes("require('./charts.js')")&&mapSource.includes('mapCharts.median'),'kartappen ska använda samma Charts-kärna, även i CommonJS');
assert.ok(chartsSource.includes('fixedFinishTimeBins')&&chartsSource.includes('barGeometry'),'Charts ska äga gemensam statistik och histogramgeometri');


const replaySourceU4=fs.readFileSync(path.join(root,'docs/assets/runner-replay.js'),'utf8');
const mapEngineSource=fs.readFileSync(path.join(root,'docs/assets/map-engine.js'),'utf8');
assert.ok(replaySourceU4.includes("require('./map-engine.js')")&&replaySourceU4.includes('mapEngine.pointAtDistance'),'Replay ska använda U4 MapEngine');
assert.ok(mapSource.includes("require('./map-engine.js')")&&mapSource.includes('mapEngine.routePosition'),'kartduellen ska använda samma U4 MapEngine');
assert.ok(!mapSource.includes('function routePosition(route,distance)'),'kartduellen får inte återinföra lokal routePosition');
assert.ok(!replaySourceU4.includes('function pointAtDistance(points,distance)'),'Replay får inte återinföra lokal pointAtDistance');
assert.ok(mapEngineSource.includes('terrainAtDistance')&&mapEngineSource.includes('routeSlice'),'MapEngine ska äga rutt- och terränggeometri');


const playbackSourceU4=fs.readFileSync(path.join(root,'docs/assets/playback.js'),'utf8');
assert.ok(mapSource.includes("require('./playback.js')")&&mapSource.includes('mapPlayback.rateFor'),'kartduellen ska använda U4 Playback');
assert.ok(replaySourceU4.includes("require('./playback.js')")&&replaySourceU4.includes('playback.distanceStep'),'Replay ska använda samma U4 Playback');
assert.ok(playbackSourceU4.includes('DURATIONS')&&playbackSourceU4.includes('DEFAULT_DURATION=120'),'Playback ska äga tillåtna tidslägen och standard');


const raceMediaSourceU4=fs.readFileSync(path.join(root,'docs/assets/race-media.js'),'utf8');
assert.ok(appSource.includes('window.RaceMedia'),'huvudappen ska använda kanoniska U4 RaceMedia');
assert.ok(mapSource.includes("require('./race-media.js')")&&mapSource.includes('mapRaceMedia.applyAudioSource'),'kartduellen ska använda samma U4 RaceMedia');
assert.ok(!appSource.includes('window.RACE_MEDIA_CONFIG'),'huvudappen får inte återgå till legacy-aliaset');
assert.ok(raceMediaSourceU4.includes('root.RaceMedia=api;root.RACE_MEDIA_CONFIG=api'),'legacy media-alias ska endast exponeras från RaceMedia för bakåtkompatibilitet');
assert.ok(indexHtml.includes('assets/race-media.js?v=20260923-u4b')&&/(?:assets\/app\.js\?v=20260923-(?:u4b|u5[a-z]*|u8[a-z]*)|assets\/app\.js\?v=20260924-r3)/.test(indexHtml),'huvudytan ska behålla RaceMedia-cachekey och cache-busta aktuell app-version');
assert.ok(mapHtml.includes('assets/map-engine.js?v=20260923-u4b')&&mapHtml.includes('assets/race-media.js?v=20260923-u4b')&&mapHtml.includes('assets/map.js?v=20260923-u4b'),'kartytan ska cache-busta ändrade U4.8/U4.9-assets');


const runnerAnalysisSource=fs.readFileSync(path.join(root,'docs/assets/runner-analysis.js'),'utf8');
assert.ok(indexHtml.includes('assets/runner-analysis.js?v=20260923-u5'),'huvudytan ska ladda U5 RunnerAnalysis');
assert.ok(indexHtml.indexOf('assets/history-engine.js')<indexHtml.indexOf('assets/runner-analysis.js'),'HistoryEngine ska laddas före RunnerAnalysis');
assert.ok(indexHtml.indexOf('assets/data-index.js')<indexHtml.indexOf('assets/runner-analysis.js'),'DataIndex ska laddas före RunnerAnalysis');
assert.ok(indexHtml.indexOf('assets/runner-analysis.js')<indexHtml.indexOf('assets/app.js'),'RunnerAnalysis ska laddas före huvudappen');
assert.ok(runnerAnalysisSource.includes("require('./history-engine.js')")&&runnerAnalysisSource.includes("require('./data-index.js')"),'RunnerAnalysis ska återanvända U2 HistoryEngine och U4 DataIndex');

const stylesSourceU5=fs.readFileSync(path.join(root,'docs/assets/styles.css'),'utf8');
assert.ok(appSource.includes('window.RunnerAnalysis?.profileForResult(state.data,id)'),'löparens dialog ska byggas från U5 RunnerAnalysis-profilen');
assert.ok(appSource.includes('renderRunnerJourney(profile)')&&appSource.includes('renderRunnerJourneyTable(profile)'),'dialogen ska återanvända samma Journey-modell för översikt och tabell');
assert.ok(appSource.includes('renderRunnerVerifiedHistory(profile)'),'dialogen ska exponera verifierad historik utan namnmatchning');
assert.ok(!appSource.includes('splits.map(s=>'),'den detaljerade mellantidstabellen får inte återgå till egen ad hoc-splitrendering');
assert.ok(stylesSourceU5.includes('U5 Runner Analysis 2.0: Journey')&&stylesSourceU5.includes('.runner-journey-track'),'Journey ska ha egen responsiv layout');
assert.ok(/(?:assets\/styles\.css\?v=20260923-(?:u6[a-z]*|u7[a-z]*|u8[a-z]*)|assets\/styles\.css\?v=20260924-r3)/.test(indexHtml)&&/(?:assets\/app\.js\?v=20260923-(?:u5c|u8[a-z]*)|assets\/app\.js\?v=20260924-r3)/.test(indexHtml),'senare UI-etapper får föra gemensam CSS-generation framåt utan att ändra U5-appens JavaScript-generation');

assert.ok(indexHtml.includes('id="compareH2HButton"')&&indexHtml.includes('id="headToHeadDialog"'),'U5 ska exponera Head-to-head från befintligt löparurval');
assert.ok(appSource.includes('window.RunnerAnalysis?.headToHead(state.data,ids)'),'Head-to-head UI ska använda RunnerAnalysis-modellen');
assert.strictEqual((appSource.match(/function renderHeadToHead\(/g)||[]).length,1,'endast en aktiv renderHeadToHead-implementation får finnas');
assert.strictEqual((appSource.match(/async function openHeadToHead\(/g)||[]).length,1,'endast en aktiv openHeadToHead-implementation får finnas');
assert.ok(appSource.includes('function renderHeadToHead(model)')&&appSource.includes('whole_course_comparable'),'UI ska respektera CourseVersion-jämförbarhet');
assert.ok(appSource.includes("$$('.runner-chip').forEach"),'alla valda löparchips ska ha fungerande borttagning');
assert.ok(stylesSourceU5.includes('U5 Runner Analysis 2.0: Head-to-head'),'Head-to-head ska ha responsiv U5-layout');

assert.ok(appSource.includes("h2hClose.onclick=()=>h2hDialog.close()"),'Head-to-head-dialogen ska ha fungerande stängknapp');

const runnerFavoritesSource=fs.readFileSync(path.join(root,'docs/assets/runner-favorites.js'),'utf8');
assert.ok(indexHtml.includes('id="runnerFavoritesList"')&&indexHtml.includes('id="runnerFavoritesCount"'),'individuell sökning ska exponera lokal favoritlista');
assert.ok(indexHtml.includes('assets/runner-favorites.js?v=20260923-u5'),'huvudytan ska ladda U5 RunnerFavorites');
assert.ok(indexHtml.indexOf('assets/runner-analysis.js')<indexHtml.indexOf('assets/runner-favorites.js')&&indexHtml.indexOf('assets/runner-favorites.js')<indexHtml.indexOf('assets/app.js'),'RunnerFavorites ska laddas före huvudappen');
assert.ok(appSource.includes('window.RunnerFavorites?.referenceFor')&&appSource.includes('window.RunnerFavorites.toggle'),'profilen ska använda RunnerFavorites för referens och toggle');
assert.ok(appSource.includes('function openRunnerFavorite(key)')&&appSource.includes('ensureActiveFamilyCore(ref.family,false)'),'favoritöppning ska kunna lazy-ladda historiskt resultat');
assert.ok(runnerFavoritesSource.includes("STORAGE_KEY='ultravasan-runner-favorites-v1'")&&runnerFavoritesSource.includes('MAX_ITEMS=40'),'favoritlagret ska vara lokalt, versionsstyrt och begränsat');
assert.ok(!runnerFavoritesSource.includes('person_key')&&!runnerFavoritesSource.includes('identityKey'),'favoriter får inte skapa eget personidentitetsantagande');
assert.ok(stylesSourceU5.includes('U5 Runner Analysis 2.0: local favorites'),'favorit-UI ska ha egen responsiv U5-layout');
assert.ok(/(?:assets\/styles\.css\?v=20260923-(?:u5c|u6[a-z]*|u7[a-z]*|u8[a-z]*)|assets\/styles\.css\?v=20260924-r3)/.test(indexHtml)&&/(?:assets\/app\.js\?v=20260923-(?:u5c|u8[a-z]*)|assets\/app\.js\?v=20260924-r3)/.test(indexHtml),'favoriternas appgeneration ska bevaras och aktuell UI-CSS ska vara cache-bustad');

const courseIntelligenceSource=fs.readFileSync(path.join(root,'docs/assets/course-intelligence.js'),'utf8');
const nerdSource=fs.readFileSync(path.join(root,'docs/assets/nerdlab.js'),'utf8');
assert.ok((indexHtml.includes('assets/course-intelligence.js?v=20260923-u6')||indexHtml.includes('assets/course-intelligence.js?v=20260924-r3')),'huvudytan ska ladda U6 Course Intelligence');
assert.ok(indexHtml.indexOf('assets/map-engine.js')<indexHtml.indexOf('assets/course-intelligence.js'),'MapEngine ska laddas före Course Intelligence');
assert.ok(indexHtml.indexOf('assets/charts.js')<indexHtml.indexOf('assets/course-intelligence.js'),'Charts ska laddas före Course Intelligence');
assert.ok(indexHtml.indexOf('assets/course-intelligence.js')<indexHtml.indexOf('assets/nerdlab.js'),'Course Intelligence ska laddas före NerdLab');
assert.ok(indexHtml.includes('id="courseIntelligenceRows"')&&indexHtml.includes('id="courseSegmentNarrative"'),'Race Intelligence Lab ska innehålla U6 segmenttabell och berättelse');
assert.ok(nerdSource.includes('renderCourseIntelligence()')&&nerdSource.includes('selectCourseSegment'),'NerdLab ska drivas av gemensam Course Intelligence-segmentstate');
assert.ok(nerdSource.includes('syncLegacySegmentLab(segment)'),'U6-segmentval ska synka befintligt Delsträckelabb');
assert.ok(!courseIntelligenceSource.includes('applyDifficultyIndex')&&!courseIntelligenceSource.includes('completeEvidence=segment=>')&&!courseIntelligenceSource.includes('equal-four-components'),'Course Difficulty får inte återinföra syntetisk sammanvägd poäng eller ranking');

assert.ok(nerdSource.includes('renderCourseRouteView(model,selected)')&&nerdSource.includes('renderCourseElevationView(model,selected)')&&nerdSource.includes('renderCoursePaceView(model,selected)'),'U6 ska rendera karta, höjd och fart från samma valda segment');
assert.ok(nerdSource.includes("querySelectorAll?.('[data-course-segment]')")&&nerdSource.includes('selectCourseSegment(node.dataset.courseSegment)'),'alla Course Intelligence-vyer ska använda samma segment-eventkontrakt');
assert.ok(stylesSourceU5.includes('.course-route-segment.selected')&&stylesSourceU5.includes('.course-elevation-hit.selected')&&stylesSourceU5.includes('.course-pace-row.selected'),'valt U6-segment ska ha synkad visuell state i alla vyer');

assert.ok(indexHtml.includes('id="courseTargetTime"')&&indexHtml.includes('id="coursePlanRows"'),'U6 ska exponera redigerbar måltid och loppplan');
assert.ok(nerdSource.includes('buildRacePlan(state.data,race,target,{minSample:5})'),'måltempo ska byggas via Course Intelligence, inte egen UI-matematik');
assert.ok(nerdSource.includes('Ingen resttid fördelas genom gissning'),'ofullständig CourseVersion ska ge explicit stopp, inte dold interpolering');
assert.ok(courseIntelligenceSource.includes("source:historicalShare!==null?'historical-course-version':fallbackShare!==null?'distance-fallback':'unavailable'"),'loppplanen ska märka historik, fallback och saknat underlag per segment');
assert.ok(stylesSourceU5.includes('.course-plan-source.distance-fallback')&&stylesSourceU5.includes('.course-plan-source.unavailable'),'loppplanens evidenskälla ska vara visuellt synlig');
assert.ok(nerdSource.includes('COURSE_INTELLIGENCE_METHOD_HELP')&&nerdSource.includes('separata empiriska dimensioner')&&nerdSource.includes('inte ihop till en totalscore eller ranking')&&nerdSource.includes('Display-rutten kan vara en verifierad GPX från ett referensår'),'U6:s (i)-förklaring ska beskriva separata mått och display-ruttens begränsning');
for(const dimension of ['Mest stigning/km','Störst pacing loss','Störst fartspridning','Högst DNF-exit'])assert.ok(nerdSource.includes(dimension),`Course Difficulty ska visa dimensionen separat: ${dimension}`);
assert.ok(nerdSource.includes('COURSE_PLAN_METHOD_HELP')&&nerdSource.includes('bara historiska fullföljare från exakt samma CourseVersion')&&nerdSource.includes('ingen resttid fördelas genom gissning'),'U6:s loppplan ska ha en utförlig metodförklaring och explicit anti-gissningsregel');

const historyIntelligenceSource=fs.readFileSync(path.join(root,'docs/assets/history-intelligence.js'),'utf8');
const classEvolutionSourceU7=fs.readFileSync(path.join(root,'docs/assets/class-evolution.js'),'utf8');
const audienceSourceU7=fs.readFileSync(path.join(root,'docs/assets/audience-analytics.js'),'utf8');
assert.ok(indexHtml.includes('assets/history-intelligence.js?v=20260923-u7'),'huvudytan ska ladda U7 History Intelligence');
assert.ok(indexHtml.indexOf('assets/history-engine.js')<indexHtml.indexOf('assets/history-intelligence.js')&&indexHtml.indexOf('assets/history-intelligence.js')<indexHtml.indexOf('assets/nerdlab.js'),'U7 History Intelligence ska ligga ovanpå U2 och före historik-UI');
assert.ok(historyIntelligenceSource.includes('history.groupHistories')&&historyIntelligenceSource.includes('history.comparableSeries'),'U7 ska återanvända U2:s identitets- och jämförbarhetsmotor');
assert.ok(historyIntelligenceSource.includes("scope:'whole-course-comparable-race-medians'")&&historyIntelligenceSource.includes('performanceYears.length>=minReferenceYears'),'fingeravtryckets prestationsreferens ska byggas av jämförbara loppårsnormaler');
assert.ok(historyIntelligenceSource.includes("group.verified_person===true")&&historyIntelligenceSource.includes("mode==='improved'")&&historyIntelligenceSource.includes("mode==='consistent'"),'flerårig Hall of Fame ska kräva verifierad personidentitet');
assert.ok(nerdSource.includes('nHistoryIntelligence?.hallOfFame')&&nerdSource.includes('nHistoryIntelligence?.fingerprint')&&nerdSource.includes('nHistoryIntelligence?.personHistory'),'U7-UI ska använda gemensam History Intelligence i alla tre Race Intelligence-historikytor');
assert.ok(nerdSource.includes('HISTORY_ARCHIVE_METHOD_HELP')&&nerdSource.includes('HISTORY_HALL_METHOD_HELP')&&nerdSource.includes('HISTORY_FINGERPRINT_METHOD_HELP')&&nerdSource.includes('CLASS_HISTORY_METHOD_HELP'),'alla U7-historikytor ska ha utförlig metodförklaring');
assert.ok(classEvolutionSourceU7.includes('comparisonBreaks')&&classEvolutionSourceU7.includes('class-evolution-course-break')&&classEvolutionSourceU7.includes('from.comparisonKey!==to.comparisonKey'),'Klassutveckling ska bryta farttrend och animation vid CourseVersion-gräns');
assert.ok(audienceSourceU7.includes('comparisonKeyForRace:historyComparisonKey')&&audienceSourceU7.includes('comparableHistoryRuns(valid,years)'),'klassvyerna ska använda samma U7-jämförbarhetsnyckel');
assert.ok(stylesSourceU5.includes('U7 Historik 2.0')&&stylesSourceU5.includes('.history-series')&&stylesSourceU5.includes('.class-evolution-course-break'),'U7:s jämförbarhetsgränser ska vara synliga i UI');
assert.ok(/(?:assets\/nerdlab\.js\?v=20260923-(?:u7|u8[a-z]*)|assets\/nerdlab\.js\?v=20260924-r[34])/.test(indexHtml)&&indexHtml.includes('assets/class-evolution.js?v=20260923-u7')&&/(?:assets\/audience-analytics\.js\?v=20260923-(?:u7|u8[a-z]*)|assets\/audience-analytics\.js\?v=20260924-r3)/.test(indexHtml),'U7:s historik-UI-assets ska cache-bustas tillsammans');
