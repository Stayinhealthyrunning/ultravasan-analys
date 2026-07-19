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
for(const html of [indexHtml,mapHtml])assert.ok(html.includes('assets/data-index.js'),'båda applikationsytorna ska ladda samma indexmodul');
assert.ok(indexHtml.indexOf('assets/data-index.js')<indexHtml.indexOf('assets/app.js'),'indexmodulen ska laddas före appen');
assert.ok(mapHtml.indexOf('assets/data-index.js')<mapHtml.indexOf('assets/map.js'),'indexmodulen ska laddas före kartduellen');

for(const file of ['app.js','audience-analytics.js','nerdlab.js','map.js']){
  const source=fs.readFileSync(path.join(root,'docs/assets',file),'utf8');
  assert.ok(source.includes('splitsByResult')||source.includes('UltravasanDataIndex'),`${file} ska använda det gemensamma indexet`);
}

console.log('OK: gemensamt splitsByResult-index bevarar splits, replay och aggregat exakt');
