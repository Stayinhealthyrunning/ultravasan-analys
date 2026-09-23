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
  assert.ok(html.includes('assets/app-state.js'),'båda applikationsytorna ska ladda U4 AppState');
  assert.ok(html.includes('assets/charts.js'),'båda applikationsytorna ska ladda U4 Charts');
  assert.ok(html.includes('assets/data-loader.js'),'båda applikationsytorna ska ladda U3 DataLoader');
  assert.ok(html.includes('data/ultravasan-data-catalog.js'),'båda applikationsytorna ska ladda datakatalogen');
}
assert.ok(indexHtml.indexOf('data/ultravasan-data-catalog.js')<indexHtml.indexOf('assets/data-loader.js'),'katalogen ska laddas före DataLoader');
assert.ok(indexHtml.indexOf('assets/data-loader.js')<indexHtml.indexOf('assets/app.js'),'DataLoader ska laddas före appen');
assert.ok(indexHtml.indexOf('assets/data-index.js')<indexHtml.indexOf('assets/data-adapter.js'),'indexmodulen ska laddas före DataAdapter');
assert.ok(indexHtml.indexOf('assets/race-contracts.js')<indexHtml.indexOf('assets/race-ui.js'),'loppkontrakten ska laddas före RaceUI');
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
assert.ok(mapSource.includes('UltravasanAppState.createMap'),'kartappen ska initiera state via samma U4 AppState');
assert.ok(appStateSource.includes('createMain')&&appStateSource.includes('createMap'),'AppState ska exponera båda ytkontrakten');


const chartsSource=fs.readFileSync(path.join(root,'docs/assets/charts.js'),'utf8');
assert.ok(appSource.includes('window.UltravasanCharts.median')&&appSource.includes('window.UltravasanCharts.quantile'),'huvudappen ska använda U4 Charts');
assert.ok(mapSource.includes('window.UltravasanCharts.median'),'kartappen ska använda samma Charts-kärna');
assert.ok(chartsSource.includes('fixedFinishTimeBins')&&chartsSource.includes('barGeometry'),'Charts ska äga gemensam statistik och histogramgeometri');
