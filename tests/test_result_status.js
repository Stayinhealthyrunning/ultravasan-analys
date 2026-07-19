'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const status=require(path.join(root,'docs/assets/result-status.js'));
const data=JSON.parse(fs.readFileSync(path.join(root,'docs/data/ultravasan.json'),'utf8'));
const bundleText=fs.readFileSync(path.join(root,'docs/data/ultravasan-data.js'),'utf8').trim();
const bundleData=JSON.parse(bundleText.replace(/^window\.ULTRAVASAN_DATA=/,'').replace(/;$/,''));

const classify=(result,hasSplit=false)=>status.classify(result,{hasSplit});
assert.strictEqual(classify({status:'DNS'}).started,false,'DNS får inte räknas som startande');
assert.strictEqual(classify({status:'  startade inte  '}).dns,true,'Svensk ej-start-status ska klassas som DNS');
assert.strictEqual(classify({status:'FINISHED',finish_seconds:12345}).finished,true,'Finishstatus och giltig sluttid ska ge fullföljande');
assert.strictEqual(classify({status:'FINISHED'}).dnf,true,'Finishstatus utan sluttid ska bli ett härlett, startat bortfall');
assert.strictEqual(classify({status:'DNF'}).dnf,true,'Explicit DNF ska räknas som startad men inte fullföljande');
assert.strictEqual(classify({status:'STARTAT'},false).dnf,true,'Startstatus utan sluttid ska bli härledd DNF');
assert.strictEqual(classify({status:''},true).dnf,true,'Mellantid utan sluttid ska bli härledd DNF även när status saknas');
assert.strictEqual(classify({status:''},false).unknown,true,'Tom status utan startbevis ska hanteras deterministiskt som okänd');
assert.strictEqual(classify({status:'UNKNOWN'},false).started,false,'Okänd status utan startbevis får inte räknas som startande');
assert.strictEqual(classify({status:'DSQ'}).started,true,'DSQ ska ingå bland startande');
assert.strictEqual(classify({status:'DSQ'}).dnf,false,'DSQ ska redovisas separat från DNF');
assert.strictEqual(classify({status:'DNF',finish_seconds:9999}).finished,false,'Måltid får inte ensam göra en DNF-post fullföljande');

const fixture=[
  {id:1,status:'FINISHED',finish_seconds:100},
  {id:2,status:'DNF'},
  {id:3,status:'DNS'},
  {id:4,status:'DSQ'},
  {id:5,status:''},
  {id:6,status:'UNKNOWN'}
];
const fixtureSummary=status.summarize(fixture,{splitEvidence:new Set([6])});
assert.deepStrictEqual(
  {starters:fixtureSummary.starters,finishers:fixtureSummary.finishers,dnf:fixtureSummary.dnf,dns:fixtureSummary.dns,dsq:fixtureSummary.dsq,unknown:fixtureSummary.unknown,rate:fixtureSummary.rate},
  {starters:4,finishers:1,dnf:2,dns:1,dsq:1,unknown:1,rate:25}
);
assert.strictEqual(fixtureSummary.starters,fixtureSummary.finishers+fixtureSummary.dnf+fixtureSummary.dsq,'Startande, fullföljande och bortfall ska vara matematiskt förenliga');

function raceSummary(raceKey,sex,dataset=data){
  const race=dataset.races.find(r=>r.race_key===raceKey);
  assert.ok(race,`Loppet ${raceKey} saknas`);
  return status.summarize(dataset.results.filter(r=>r.race_id===race.id&&r.sex===sex),{splitEvidence:status.buildSplitEvidence(dataset.splits)});
}

assert.deepStrictEqual(
  (({starters,finishers,dnf,dns,dsq,rate})=>({starters,finishers,dnf,dns,dsq,rate}))(raceSummary('ultravasan45-2025','M')),
  {starters:372,finishers:368,dnf:4,dns:69,dsq:0,rate:98.9},
  'Kontrollfallet 441 poster ska delas i 368 fullföljande, 4 DNF och 69 ej start'
);
assert.deepStrictEqual(
  (({starters,finishers,dnf,dns,dsq,rate})=>({starters,finishers,dnf,dns,dsq,rate}))(raceSummary('ultravasan45-2025','M',bundleData)),
  {starters:372,finishers:368,dnf:4,dns:69,dsq:0,rate:98.9},
  'Webbens JavaScript-bundle ska ge samma verifierade kontrolltal som diagrammet'
);
assert.deepStrictEqual(
  (({starters,finishers,dnf,dns,dsq,rate})=>({starters,finishers,dnf,dns,dsq,rate}))(raceSummary('ultravasan45-2025','F')),
  {starters:386,finishers:381,dnf:5,dns:44,dsq:0,rate:98.7}
);
assert.deepStrictEqual(
  (({starters,finishers,dnf,dns,dsq,rate})=>({starters,finishers,dnf,dns,dsq,rate}))(raceSummary('ultravasan90-2025','M')),
  {starters:1191,finishers:1080,dnf:111,dns:180,dsq:0,rate:90.7}
);
assert.deepStrictEqual(
  (({starters,finishers,dnf,dns,dsq,rate})=>({starters,finishers,dnf,dns,dsq,rate}))(raceSummary('ultravasan90-2024','F')),
  {starters:425,finishers:394,dnf:31,dns:47,dsq:0,rate:92.7}
);

for(const [label,dataset] of [['JSON',data],['JavaScript-bundle',bundleData]]){
  for(const race of dataset.races){
    for(const sex of ['M','F']){
      const summary=raceSummary(race.race_key,sex,dataset);
      assert.strictEqual(summary.starters,summary.finishers+summary.dnf+summary.dsq,`${label} ${race.race_key} ${sex}: statusidentiteten ska hålla`);
    }
  }
}

console.log('OK: central statusklassning och verifierade UV90/UV45-kontrolltal');
