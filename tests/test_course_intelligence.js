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
assert.ok(first.field.timing_sample_n>=20,'verkligt 2016-segment ska ha underlag för yttre kvantiler');
assert.strictEqual(first.field.outer_quantile_min_sample,20);
assert.strictEqual(first.field.outer_quantiles_available,true);
assert.ok(Number.isFinite(first.field.q10_pace_seconds_per_km));
assert.ok(Number.isFinite(first.field.q25_pace_seconds_per_km));
assert.ok(Number.isFinite(first.field.q75_pace_seconds_per_km));
assert.ok(Number.isFinite(first.field.q90_pace_seconds_per_km));
assert.ok(first.field.q10_pace_seconds_per_km<=first.field.q25_pace_seconds_per_km);
assert.ok(first.field.q25_pace_seconds_per_km<=first.field.median_pace_seconds_per_km);
assert.ok(first.field.median_pace_seconds_per_km<=first.field.q75_pace_seconds_per_km);
assert.ok(first.field.q75_pace_seconds_per_km<=first.field.q90_pace_seconds_per_km);

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
assert.strictEqual(course2026.checkpoint_catalog.find(row=>row.checkpoint_key==='mora_warning').distance_km,null);
assert.strictEqual(intelligence.displayAnchorForCheckpoint(course2026,'mora_warning'),null,'okänd 2026-distans får inte interpoleras eller gissas');
const segments2026=intelligence.segmentContracts(course2026);
const highPoint2026=segments2026.find(segment=>segment.to_key==='high_point');
const warning2026=segments2026.find(segment=>segment.to_key==='mora_warning');
assert.strictEqual(highPoint2026.distance_km,null);
assert.strictEqual(highPoint2026.distance_source,'unavailable');
assert.strictEqual(highPoint2026.display_to_km,null);
assert.strictEqual(warning2026.distance_km,null);
assert.strictEqual(warning2026.distance_source,'unavailable');
assert.strictEqual(warning2026.display_to_km,null);

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
assert.strictEqual(firstStats.outer_quantile_min_sample,20);
assert.strictEqual(firstStats.outer_quantiles_available,false);
assert.ok(Number.isFinite(firstStats.q25_pace_seconds_per_km),'n=5 ska räcka för Q25');
assert.ok(Number.isFinite(firstStats.q75_pace_seconds_per_km),'n=5 ska räcka för Q75');
assert.strictEqual(firstStats.q10_pace_seconds_per_km,null,'Q10 kräver n≥20');
assert.strictEqual(firstStats.q90_pace_seconds_per_km,null,'Q90 kräver n≥20');
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
assert.strictEqual(tooSmall.q10_pace_seconds_per_km,null);
assert.strictEqual(tooSmall.q90_pace_seconds_per_km,null);

assert.strictEqual(intelligence.applyDifficultyIndex,undefined,'Course Difficulty får inte skapa en syntetisk sammanvägd poäng eller ranking');
assert.strictEqual(intelligence.percentileRank,undefined,'Course Difficulty ska inte exponera rankinghjälpare');
assert.ok(model.segments.every(segment=>!Object.hasOwn(segment,'difficulty')),'Course Intelligence ska lämna separata empiriska dimensioner utan totalscore');
assert.ok(model.segments.some(segment=>segment.terrain?.ascent_m_per_km!=null),'verklig UV90 2016 ska behålla empiriskt terrängunderlag');
assert.ok(model.segments.some(segment=>segment.field?.median_pacing_loss_seconds_per_km!=null),'verklig UV90 2016 ska behålla empirisk pacing loss');
assert.ok(model.segments.some(segment=>segment.field?.pace_iqr_seconds_per_km!=null),'verklig UV90 2016 ska behålla empirisk fartspridning');
assert.ok(model.segments.some(segment=>segment.field?.dnf_exit_rate_pct!=null),'verklig UV90 2016 ska behålla empirisk DNF-exit');

assert.throws(
  ()=>intelligence.segmentContracts({...post2023,segments:[{from:'start',to:'not-a-checkpoint',distance_km:1}]}),
  /saknar explicit checkpoint/,
  'segmentendpoints får inte gissas från namn eller distans'
);

const historicalPlan=intelligence.buildRacePlan(data,race2016,36000);
assert.strictEqual(historicalPlan.complete,true,'verifierad pre-2023 CourseVersion ska kunna ge komplett historisk loppplan');
assert.strictEqual(historicalPlan.course_version_id,'uv90-pre2023-v1');
assert.ok(historicalPlan.cohort_finishers>100);
assert.ok(historicalPlan.historical_segments>=7);
assert.ok(Math.abs(historicalPlan.rows.at(-1).target_cumulative_seconds-36000)<1);
assert.ok(Math.abs(historicalPlan.rows.reduce((sum,row)=>sum+row.target_segment_seconds,0)-36000)<1);
assert.ok(historicalPlan.rows.every(row=>row.source==='historical-course-version'||row.source==='distance-fallback'));

const fallbackPlan=intelligence.buildRacePlan({races:[race2016],results:[],splits:[]},race2016,36000);
assert.strictEqual(fallbackPlan.complete,true);
assert.strictEqual(fallbackPlan.historical_segments,0);
assert.strictEqual(fallbackPlan.fallback_segments,8);
assert.ok(fallbackPlan.rows.every(row=>row.source==='distance-fallback'));
assert.ok(Math.abs(fallbackPlan.rows.at(-1).target_cumulative_seconds-36000)<1);

const race2026=data.races.find(race=>race.race_key==='ultravasan90-2026')||{id:999,race_key:'ultravasan90-2026',year:2026};
const incomplete2026=intelligence.buildRacePlan({races:[race2026],results:[],splits:[]},race2026,36000);
assert.strictEqual(incomplete2026.complete,false,'okända 2026-segment får inte fyllas med gissad måltempoandel');
assert.ok(incomplete2026.unavailable_segments>=4);
assert.strictEqual(incomplete2026.allocated_seconds,0);
assert.strictEqual(incomplete2026.unallocated_seconds,36000);
assert.ok(incomplete2026.rows.some(row=>row.source==='unavailable'));

assert.throws(()=>intelligence.buildRacePlan(data,race2016,0),/Måltiden/);

console.log('OK: U6 Course Intelligence separerar tävlings-/GPX-axel och bygger konservativa segmentmått');
