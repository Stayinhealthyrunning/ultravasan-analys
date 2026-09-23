'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const intelligence=require('../docs/assets/course-intelligence.js');
const contracts=require('../docs/assets/race-contracts.js');

const root=path.resolve(__dirname,'..');

function loadBrowserGlobal(file,name){
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  return context.window[name];
}

const data=loadBrowserGlobal('docs/data/ultravasan-data.js','ULTRAVASAN_DATA');
const routes=loadBrowserGlobal('docs/data/ultravasan-routes.js','ULTRAVASAN_ROUTES');

const race2016=data.races.find(race=>race.race_key==='ultravasan90-2016');
assert.ok(race2016,'verklig UV90 2016 RaceEdition ska finnas');

const model=intelligence.buildCourseModel(data,race2016,routes);
assert.strictEqual(model.course_version_id,'uv90-pre2023-v1');
assert.strictEqual(model.display_route_id,'ultravasan90-pre2023');
assert.strictEqual(model.route_available,true);
assert.strictEqual(model.segments.length,8);
assert.strictEqual(model.course_distance_km,90);

const first=model.segments[0];
assert.strictEqual(first.key,'start→smagan');
assert.strictEqual(first.distance_km,8.83,'tävlings-/tempodistansen ska komma från CourseVersion-segmentet');
assert.strictEqual(first.display_from_km,0);
assert.strictEqual(first.display_to_km,7.373,'terrängaxeln ska använda explicit display-ankare, inte tävlingsdistansen');
assert.strictEqual(first.display_to_source,'explicit-anchor');
assert.strictEqual(first.terrain.available,true);
assert.ok(first.terrain.ascent_m>0);
assert.ok(first.terrain.max_elevation_m>=first.terrain.min_elevation_m);
assert.ok(first.field.timing_sample_n>=5);
assert.strictEqual(first.field.sufficient_sample,true);
assert.ok(Number.isFinite(first.field.median_pace_seconds_per_km));
assert.ok(Number.isFinite(first.field.median_pace_index));

const last=model.segments.at(-1);
assert.strictEqual(last.to_key,'mora');
assert.strictEqual(last.display_to_source,'terminal-finish-anchor');
assert.strictEqual(last.display_to_km,90.173,'Mora ska strukturellt mappas till explicit finish-ankare');
assert.strictEqual(last.terrain.available,true);

const post2023=contracts.catalog.courses['uv90-2023-2025-v1'];
const highPoint=intelligence.displayAnchorForCheckpoint(post2023,'high_point');
assert.strictEqual(highPoint.source,'interpolated-between-course-anchors');
assert.deepStrictEqual([...highPoint.between],['start','smagan']);
assert.ok(highPoint.distance_km>0&&highPoint.distance_km<9.2);
assert.ok(Math.abs(highPoint.distance_km-(3.3/10.84*9.2))<1e-9);

const postFinish=intelligence.displayAnchorForCheckpoint(post2023,'mora');
assert.strictEqual(postFinish.source,'terminal-finish-anchor');
assert.strictEqual(postFinish.distance_km,92);

const course2026=contracts.catalog.courses['uv90-2026-v1'];
const warning=intelligence.displayAnchorForCheckpoint(course2026,'mora_warning');
assert.strictEqual(warning.source,'interpolated-between-course-anchors');
assert.deepStrictEqual([...warning.between],['eldris','mora']);

const syntheticRace={id:900,race_key:'ultravasan90-2016',year:2016,distance_km:90};
const syntheticResults=[
  {id:1,race_id:900,status:'FINISHED',finish_seconds:32400},
  {id:2,race_id:900,status:'FINISHED',finish_seconds:34200},
  {id:3,race_id:900,status:'FINISHED',finish_seconds:36000},
  {id:4,race_id:900,status:'FINISHED',finish_seconds:37800},
  {id:5,race_id:900,status:'FINISHED',finish_seconds:39600},
  {id:6,race_id:900,status:'DNF'},
  {id:7,race_id:900,status:'DNF'},
];
const split=(result_id,key,sequence,elapsed,place)=>({
  result_id,checkpoint_key:key,sequence_no:sequence,elapsed_seconds:elapsed,
  place_overall:place,is_estimated:false
});
const syntheticSplits=[];
for(let id=1;id<=5;id++){
  const smagan=3300+id*60;
  const mangs=8400+id*120;
  syntheticSplits.push(
    split(id,'smagan',1,smagan,100+id),
    split(id,'mangsbodarna',2,mangs,95+id)
  );
}
// DNF 6 can be located to the segment after Smågan. DNF 7 has no observed split
// and is intentionally not guessed into a course segment.
syntheticSplits.push(split(6,'smagan',1,3900,220));
const synthetic={races:[syntheticRace],results:syntheticResults,splits:syntheticSplits,checkpoints:[]};

const segments=intelligence.segmentContracts(contracts.courseForRace(syntheticRace));
const firstStats=intelligence.fieldStatsForSegment(synthetic,syntheticRace,segments[0]);
assert.strictEqual(firstStats.timing_sample_n,5);
assert.strictEqual(firstStats.sufficient_sample,true);
assert.ok(Number.isFinite(firstStats.median_pacing_loss_seconds));
assert.ok(Number.isFinite(firstStats.median_pacing_loss_seconds_per_km));
assert.strictEqual(firstStats.located_dnf_n,1);
assert.strictEqual(firstStats.dnf_dropouts_n,0,'DNF efter Smågan får inte belasta start→Smågan');

const secondStats=intelligence.fieldStatsForSegment(synthetic,syntheticRace,segments[1]);
assert.strictEqual(secondStats.timing_sample_n,5);
assert.strictEqual(secondStats.dnf_dropouts_n,1);
assert.strictEqual(secondStats.dnf_concentration_pct,100);
assert.ok(secondStats.segment_entrants_n>=6);
assert.ok(secondStats.dnf_exit_rate_pct>0);

const tooSmall=intelligence.fieldStatsForSegment(
  {...synthetic,results:syntheticResults.slice(0,4),splits:syntheticSplits.filter(row=>row.result_id<=4)},
  syntheticRace,
  segments[0]
);
assert.strictEqual(tooSmall.timing_sample_n,4);
assert.strictEqual(tooSmall.sufficient_sample,false);
assert.strictEqual(tooSmall.median_pace_seconds_per_km,null,'n<5 får inte publicera fältmedian');

assert.throws(
  ()=>intelligence.segmentContracts({...post2023,segments:[{from:'start',to:'not-a-checkpoint',distance_km:1}]}),
  /saknar explicit checkpoint/,
  'segmentendpoints får inte gissas från namn eller distans'
);

console.log('OK: U6 Course Intelligence separerar tävlings-/GPX-axel och bygger konservativa segmentmått');
