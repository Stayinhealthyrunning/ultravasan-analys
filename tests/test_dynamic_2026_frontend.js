'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const audience=require(path.join(root,'docs/assets/audience-analytics.js'));
const evolution=require(path.join(root,'docs/assets/class-evolution.js'));
const replay=require(path.join(root,'docs/assets/runner-replay.js'));
const routes=require(path.join(root,'data/routes/ultravasan90-routes.json'));

const races=[
  {id:90,race_key:'ultravasan90-2025',name:'Ultravasan 90',year:2025,distance_km:92,course_version:'post2023'},
  {id:91,race_key:'ultravasan90-2026',name:'Ultravasan 90',year:2026,distance_km:92,course_version:'post2023'},
  {id:45,race_key:'ultravasan45-2025',name:'Ultravasan 45',year:2025,distance_km:45,course_version:'uv45-current'},
  {id:46,race_key:'ultravasan45-2026',name:'Ultravasan 45',year:2026,distance_km:45,course_version:'uv45-current'},
];
const results=races.map((race,index)=>({id:index+1,race_id:race.id,age_class:index%2?'W40':'M40',sex:index%2?'F':'M',status:'FINISHED',finish_seconds:(race.distance_km===45?5:9)*3600}));
const isStarter=result=>result.status!=='DNS';
const isFinished=result=>result.status==='FINISHED';

assert.strictEqual(audience.selectAudienceRace(races,'uv90',2026).race_key,'ultravasan90-2026');
assert.strictEqual(audience.selectAudienceRace(races,'uv45',2026).race_key,'ultravasan45-2026');
assert.strictEqual(audience.selectAudienceRace(races,'uv90').year,2026,'senaste exporterade år ska väljas utan maxår');
assert.strictEqual(audience.selectAudienceRace(races,'uv45').year,2026,'UV45 ska upptäcka 2026 separat');

for(const family of ['uv90','uv45']){
  const familyRaces=races.filter(race=>audience.audienceRaceFamily(race)===family);
  const ids=new Set(familyRaces.map(race=>race.id));
  const model=evolution.aggregateClassHistory({races:familyRaces,results:results.filter(result=>ids.has(result.race_id)),isStarter,isFinished});
  assert.deepStrictEqual(model.years,[2025,2026],`${family}: Gapminder ska inkludera exporterade 2026`);
}
assert.strictEqual(replay.routeForRace(routes,races[1]).id,'ultravasan90-post2023');
assert.strictEqual(replay.routeForRace(routes,races[3]).id,'ultravasan45-current');
const replayCheckpoints=[
  {checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},
  {checkpoint_key:'high_point',name:'Högsta punkten',sequence_no:1,distance_km:null},
  {checkpoint_key:'smagan',name:'Smågan',sequence_no:2,distance_km:9.2},
  {checkpoint_key:'mora',name:'Mora',sequence_no:3,distance_km:92},
];
const replayModel=replay.createModel({race:races[1],result:results[1],route:replay.routeForRace(routes,races[1]),raceCheckpoints:replayCheckpoints,splits:[
  {checkpoint_key:'high_point',sequence_no:1,elapsed_seconds:1800},
  {checkpoint_key:'smagan',sequence_no:2,elapsed_seconds:3600},
  {checkpoint_key:'mora',sequence_no:3,elapsed_seconds:results[1].finish_seconds},
]});
assert.deepStrictEqual(replayModel.checkpoints.map(checkpoint=>checkpoint.key),['start','smagan','mora'],'replay ska ignorera officiell kontroll utan publicerad distans, inte placera den vid start');
assert.strictEqual(replayModel.finished,true,'UV90 2026-replay ska fortfarande nå Mora');

const app=fs.readFileSync(path.join(root,'docs/assets/app.js'),'utf8');
const analytics=fs.readFileSync(path.join(root,'docs/assets/audience-analytics.js'),'utf8');
const nerdlab=fs.readFileSync(path.join(root,'docs/assets/nerdlab.js'),'utf8');
const map=fs.readFileSync(path.join(root,'docs/assets/map.js'),'utf8');
for(const source of [app,analytics,nerdlab,map]){
  assert.ok(!/[<>]=?\s*2025/.test(source),'frontend får inte begränsa framtida lopp med maxåret 2025');
}
for(const token of ['populateRaceYears','mainSearchYear','renderPlacementScatter','openRunner'])assert.ok(app.includes(token),`appflöde saknas: ${token}`);
for(const token of ['renderClassHeatmap','renderClassHistory','renderSexPaceChart','familyRaces().slice().sort'])assert.ok(analytics.includes(token),`analysflöde saknas: ${token}`);
for(const token of ['renderCoverage','renderFingerprint','familyRaces()'])assert.ok(nerdlab.includes(token),`Klasslabbet/Nerdlab-flöde saknas: ${token}`);
assert.ok(map.includes("sort((a,b)=>b.year-a.year)[0]"),'kart/replay-fallback ska välja senaste exporterade år dynamiskt');

console.log('OK: UV90 och UV45 år 2026 upptäcks dynamiskt av väljare, historik, analyser, sökning och replay');
