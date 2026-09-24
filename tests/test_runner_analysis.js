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
  {id:1,race_key:'ultravasan90-2024',year:2024,whole_course_comparison_group:'ultravasan90-post2023'},
  {id:2,race_key:'ultravasan90-2025',year:2025,whole_course_comparison_group:'ultravasan90-post2023'},
  {id:3,race_key:'ultravasan90-2019',year:2019},
  {id:4,race_key:'ultravasan45-2025',year:2025},
];
const checkpoints=[
  {race_id:1,checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},
  {race_id:1,checkpoint_key:'smagan',name:'Smågan',sequence_no:1,distance_km:10},
  {race_id:1,checkpoint_key:'mangsbodarna',name:'Mångsbodarna',sequence_no:2,distance_km:25},
  {race_id:1,checkpoint_key:'mora',name:'Mora',sequence_no:3,distance_km:92},
  {race_id:2,checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},
  {race_id:2,checkpoint_key:'smagan',name:'Smågan',sequence_no:1,distance_km:10},
  {race_id:2,checkpoint_key:'mangsbodarna',name:'Mångsbodarna',sequence_no:2,distance_km:25},
  {race_id:2,checkpoint_key:'mora',name:'Mora',sequence_no:3,distance_km:92},
  {race_id:3,checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},
  {race_id:3,checkpoint_key:'smagan',name:'Smågan',sequence_no:1,distance_km:8.8},
  {race_id:3,checkpoint_key:'mangsbodarna',name:'Mångsbodarna',sequence_no:2,distance_km:23.3},
  {race_id:3,checkpoint_key:'mora',name:'Mora',sequence_no:3,distance_km:90},
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
  {id:107,race_id:1,person_key:'p5',status:'DNF',finish_seconds:38000,name_as_published:'Contradictory DNF'},
];
const splits=[
  {result_id:101,checkpoint_key:'smagan',elapsed_seconds:3600,segment_seconds:3600,pace_seconds_per_km:360},
  {result_id:101,checkpoint_key:'mangsbodarna',elapsed_seconds:9000,segment_seconds:5400,pace_seconds_per_km:360},
  {result_id:101,checkpoint_key:'mora',elapsed_seconds:36000,segment_seconds:27000,pace_seconds_per_km:403},
  {result_id:102,checkpoint_key:'smagan',elapsed_seconds:3500,segment_seconds:3500,pace_seconds_per_km:350,place_overall:50,place_class:10},
  {result_id:102,checkpoint_key:'mangsbodarna',elapsed_seconds:8800,segment_seconds:5300,pace_seconds_per_km:353,place_overall:40,place_class:8},
  {result_id:102,checkpoint_key:'mora',elapsed_seconds:35400,segment_seconds:26600,pace_seconds_per_km:397,place_overall:30,place_class:6},
  {result_id:103,checkpoint_key:'smagan',elapsed_seconds:3550,segment_seconds:3550,pace_seconds_per_km:355,place_overall:60,place_class:12},
  {result_id:103,checkpoint_key:'mangsbodarna',elapsed_seconds:8900,segment_seconds:5350,pace_seconds_per_km:357,place_overall:45,place_class:9},
  {result_id:103,checkpoint_key:'mora',elapsed_seconds:36600,segment_seconds:27700,pace_seconds_per_km:413,place_overall:35,place_class:7},
  {result_id:104,checkpoint_key:'smagan',elapsed_seconds:3400,segment_seconds:3400,pace_seconds_per_km:386},
  {result_id:104,checkpoint_key:'mangsbodarna',elapsed_seconds:8600,segment_seconds:5200,pace_seconds_per_km:359},
  {result_id:104,checkpoint_key:'mora',elapsed_seconds:35000,segment_seconds:26400,pace_seconds_per_km:396},
  {result_id:105,checkpoint_key:'mora',elapsed_seconds:18000,segment_seconds:18000,pace_seconds_per_km:400},
];
const dataset={races,checkpoints,results,splits};

const history=analysis.historyForResult(dataset,101);
assert.strictEqual(history.verified_person,true);
assert.deepStrictEqual(history.rows.map(row=>row.id),[101,102],'verifierad identitet ska skapa flerårshistorik');
const unverified=analysis.historyForResult(dataset,106);
assert.strictEqual(unverified.verified_person,false);
assert.deepStrictEqual(unverified.rows.map(row=>row.id),[106],'namn utan identitet får inte länkas');

const contradictory=analysis.journeyForResult(dataset,107);
assert.strictEqual(contradictory.status.dnf,true);
assert.strictEqual(contradictory.rows.at(-1).source,'missing','motsägelsefull DNF-sluttid får inte skapas som exakt målpassage');

const realDns=real.results.find(row=>String(row.status||'').toUpperCase()==='DNS');
assert.ok(realDns,'dataset ska innehålla ett verkligt DNS-resultat för copy-regressionen');
const realDnsProfile=analysis.profileForResult(real,realDns.id);
assert.strictEqual(realDnsProfile.journey.rows[0].source,'start','banreferensen kan finnas även om DNS saknar start');
assert.strictEqual(realDnsProfile.journey.status.dns,true);
assert.strictEqual(analysis.journeyStartDescription(realDnsProfile),'Ingen start registrerad');
assert.strictEqual(analysis.journeyStartDescription(analysis.profileForResult(dataset,101)),'Loppet börjar här');

const sameCourse=analysis.headToHead(dataset,[102,103]);
assert.strictEqual(sameCourse.available,true);
assert.strictEqual(sameCourse.same_course_version,true);
assert.strictEqual(sameCourse.whole_course_comparable,true);
assert.deepStrictEqual(sameCourse.finish_ranking.map(row=>[row.result_id,row.gap_seconds]),[[102,0],[103,1200]]);
const cpSmagan=sameCourse.checkpoints.find(row=>row.checkpoint_key==='smagan');
const cpMangs=sameCourse.checkpoints.find(row=>row.checkpoint_key==='mangsbodarna');
assert.strictEqual(cpSmagan.comparable,true,'samma CourseVersion ska tillåta checkpointgap');
assert.deepStrictEqual(cpSmagan.entries.map(row=>[row.result_id,row.gap_seconds,row.place_overall]),[[102,0,50],[103,50,60]]);
assert.deepStrictEqual(cpMangs.entries.map(row=>[row.result_id,row.gap_seconds,row.placement_change]),[[102,0,10],[103,100,15]],'checkpoint-H2H ska visa kumulativt gap och officiell placeringsrörelse');
const sharedSegment=sameCourse.segments.find(segment=>segment.from==='smagan'&&segment.to==='mangsbodarna');
assert.ok(sharedSegment?.comparable,'explicit CourseVersion-segment ska vara jämförbart');
assert.strictEqual(sharedSegment.entries.find(row=>row.result_id===103).gap_seconds,50);
assert.strictEqual(sameCourse.segments.find(segment=>segment.from==='start'&&segment.to==='smagan')?.comparable,false,'icke-kontrakterad genväg får inte jämföras');

const changedCourse=analysis.headToHead(dataset,[101,104]);
assert.strictEqual(changedCourse.available,true);
assert.strictEqual(changedCourse.same_course_version,false);
assert.strictEqual(changedCourse.whole_course_comparable,false,'olika CourseVersion får inte få sluttidsgap');
assert.deepStrictEqual(changedCourse.finish_ranking,[]);
assert.ok(changedCourse.checkpoints.every(row=>row.comparable===false&&row.entries.every(entry=>entry.gap_seconds===null)),'checkpointgap får inte jämföras över olika CourseVersions');
assert.ok(changedCourse.segments.every(segment=>segment.comparable===false));

const mixed=analysis.headToHead(dataset,[102,105]);
assert.strictEqual(mixed.available,false);
assert.strictEqual(mixed.reason,'mixed-race-family');

const race2024=real.races.find(race=>race.race_key==='ultravasan90-2024');
const race2025=real.races.find(race=>race.race_key==='ultravasan90-2025');
const finisher2024=real.results.find(result=>result.race_id===race2024?.id&&result.status==='FINISHED');
const finisher2025=real.results.find(result=>result.race_id===race2025?.id&&result.status==='FINISHED');
const evidencedWholeCourse=analysis.headToHead(real,[finisher2024?.id,finisher2025?.id]);
assert.strictEqual(evidencedWholeCourse.whole_course_comparable,true,'2024 och 2025 ska få sluttidsgap när organiseraren verifierar oförändrad bana');
assert.strictEqual(evidencedWholeCourse.same_course_version,true);
assert.strictEqual(evidencedWholeCourse.finish_ranking.length,2,'verifierad helbaneserie ska öppna finish-gap mellan 2024 och 2025');
assert.ok(evidencedWholeCourse.finish_ranking.every(row=>Number.isFinite(row.gap_seconds)));

console.log('OK: U5 RunnerAnalysis bygger Journey, verifierad profilhistorik och CourseVersion-säker head-to-head');
