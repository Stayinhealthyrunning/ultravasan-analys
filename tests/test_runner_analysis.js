'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const analysis=require('../docs/assets/runner-analysis.js');

const root=path.resolve(__dirname,'..');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'docs/data/ultravasan-data.js'),'utf8'),context);
const real=context.window.ULTRAVASAN_DATA;

const andreas=analysis.profileForResult(real,11545);
assert.ok(andreas,'verklig UV90-profil ska kunna byggas');
assert.strictEqual(andreas.race.race_key,'ultravasan90-2016');
assert.strictEqual(andreas.journey.rows[0].elapsed_seconds,0);
assert.ok(andreas.journey.rows.length>=9);
assert.ok(andreas.journey.recorded_rows>=9);
assert.strictEqual(andreas.journey.rows.at(-1).elapsed_seconds,26280);

const races=[
  {id:1,race_key:'ultravasan90-2024',year:2024},
  {id:2,race_key:'ultravasan90-2025',year:2025},
  {id:3,race_key:'ultravasan90-2019',year:2019},
  {id:4,race_key:'ultravasan45-2025',year:2025},
];
const checkpoints=[
  {race_id:1,checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},
  {race_id:1,checkpoint_key:'smagan',name:'Smågan',sequence_no:1,distance_km:10},
  {race_id:1,checkpoint_key:'mora',name:'Mora',sequence_no:2,distance_km:92},
  {race_id:2,checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},
  {race_id:2,checkpoint_key:'smagan',name:'Smågan',sequence_no:1,distance_km:10},
  {race_id:2,checkpoint_key:'mora',name:'Mora',sequence_no:2,distance_km:92},
  {race_id:3,checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},
  {race_id:3,checkpoint_key:'smagan',name:'Smågan',sequence_no:1,distance_km:8.8},
  {race_id:3,checkpoint_key:'mora',name:'Mora',sequence_no:2,distance_km:90},
  {race_id:4,checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},
  {race_id:4,checkpoint_key:'mora',name:'Mora',sequence_no:1,distance_km:45},
];
const results=[
  {id:101,race_id:1,person_key:'p1',status:'FINISHED',finish_seconds:36000},
  {id:102,race_id:2,person_key:'p1',status:'FINISHED',finish_seconds:35400},
  {id:103,race_id:2,person_key:'p2',status:'FINISHED',finish_seconds:36600},
  {id:104,race_id:3,person_key:'p3',status:'FINISHED',finish_seconds:35000},
  {id:105,race_id:4,person_key:'p4',status:'FINISHED',finish_seconds:18000},
  {id:106,race_id:1,status:'FINISHED',finish_seconds:37000,name_as_published:'No Identity'},
];
const splits=[
  {result_id:101,checkpoint_key:'smagan',elapsed_seconds:3600,segment_seconds:3600,pace_seconds_per_km:360},
  {result_id:101,checkpoint_key:'mora',elapsed_seconds:36000,segment_seconds:32400,pace_seconds_per_km:395},
  {result_id:102,checkpoint_key:'smagan',elapsed_seconds:3500,segment_seconds:3500,pace_seconds_per_km:350},
  {result_id:102,checkpoint_key:'mora',elapsed_seconds:35400,segment_seconds:31900,pace_seconds_per_km:389},
  {result_id:103,checkpoint_key:'smagan',elapsed_seconds:3550,segment_seconds:3550,pace_seconds_per_km:355},
  {result_id:103,checkpoint_key:'mora',elapsed_seconds:36600,segment_seconds:33050,pace_seconds_per_km:403},
  {result_id:104,checkpoint_key:'smagan',elapsed_seconds:3400,segment_seconds:3400,pace_seconds_per_km:386},
  {result_id:104,checkpoint_key:'mora',elapsed_seconds:35000,segment_seconds:31600,pace_seconds_per_km:389},
  {result_id:105,checkpoint_key:'mora',elapsed_seconds:18000,segment_seconds:18000,pace_seconds_per_km:400},
];
const dataset={races,checkpoints,results,splits};

const history=analysis.historyForResult(dataset,101);
assert.strictEqual(history.verified_person,true);
assert.deepStrictEqual(history.rows.map(row=>row.id),[101,102],'verifierad identitet ska skapa flerårshistorik');
const unverified=analysis.historyForResult(dataset,106);
assert.strictEqual(unverified.verified_person,false);
assert.deepStrictEqual(unverified.rows.map(row=>row.id),[106],'namn utan identitet får inte länkas');

const sameCourse=analysis.headToHead(dataset,[102,103]);
assert.strictEqual(sameCourse.available,true);
assert.strictEqual(sameCourse.same_course_version,true);
assert.strictEqual(sameCourse.whole_course_comparable,true);
assert.deepStrictEqual(sameCourse.finish_ranking.map(row=>[row.result_id,row.gap_seconds]),[[102,0],[103,1200]]);
assert.ok(sameCourse.segments.every(segment=>segment.comparable));
assert.strictEqual(sameCourse.segments[0].entries.find(row=>row.result_id===103).gap_seconds,50);

const changedCourse=analysis.headToHead(dataset,[101,104]);
assert.strictEqual(changedCourse.available,true);
assert.strictEqual(changedCourse.same_course_version,false);
assert.strictEqual(changedCourse.whole_course_comparable,false,'olika CourseVersion får inte få sluttidsgap');
assert.deepStrictEqual(changedCourse.finish_ranking,[]);
assert.ok(changedCourse.segments.every(segment=>segment.comparable===false));

const mixed=analysis.headToHead(dataset,[102,105]);
assert.strictEqual(mixed.available,false);
assert.strictEqual(mixed.reason,'mixed-race-family');

console.log('OK: U5 RunnerAnalysis bygger Journey, verifierad profilhistorik och CourseVersion-säker head-to-head');
