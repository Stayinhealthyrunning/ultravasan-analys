'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const contracts=require('../docs/assets/race-contracts.js');
const replay=require('../docs/assets/runner-replay.js');
const media=require('../docs/assets/race-media.js');
const audience=require('../docs/assets/audience-analytics.js');
const map=require('../docs/assets/map.js');
const registry=require('../data/routes/ultravasan90-routes.json');

for(const [key,edition] of Object.entries(contracts.catalog.editions)){
  const misleading={race_key:key,name:'45 90 another event',year:1900,distance_km:1,race_family:'wrong',course_version:'wrong'};
  assert.strictEqual(contracts.familyForRace(misleading),edition.race_family);
  assert.strictEqual(audience.audienceRaceFamily(misleading),edition.race_family);
  assert.strictEqual(map.mapRaceFamily(misleading),edition.race_family);
  assert.strictEqual(media.familyForRace(misleading),edition.race_family);
  assert.strictEqual(contracts.supports(misleading,'replay'),edition.capabilities.replay);
  assert.strictEqual(contracts.supports(misleading,'map_duel'),edition.capabilities.map_duel);
  assert.strictEqual(contracts.supports(misleading,'not-a-capability'),false);
  assert.strictEqual(replay.routeForRace(registry,misleading),registry.routes[contracts.courseForRace(key).display_route_id]);
  assert.strictEqual(replay.medalTimeForRace(misleading,'M'),edition.medal_profile==='pre2023'?34199:edition.medal_profile==='post2023'?35999:null);
}
for(const key of ['ultravasan90-2099','ultravasan45-2099','uv90','constructor','__proto__','']){
  const unknown={race_key:key,name:'Ultravasan 90',year:2025,distance_km:90};
  assert.strictEqual(contracts.familyForRace(unknown),null);
  assert.strictEqual(replay.routeForRace(registry,unknown),null);
  assert.strictEqual(replay.medalTimeForRace(unknown,'M'),null);
  assert.strictEqual(media.musicForRace(unknown),null);
  assert.throws(()=>contracts.assertKnownRaces([unknown]),/saknar kontrakt/);
}
assert.strictEqual(media.musicForRace('uv45'),contracts.family('uv45').music,'Explicit family-level media selection remains supported');
assert.ok(map.mixedRaceFamilyError([{race_id:999}],[]),'Missing race contract must stop a map duel');
assert.strictEqual(map.activeReferenceRoute([],[],registry),null,'No default UV90 route for missing selection');

// Another event and opaque edition key work without changing the resolver.
const other={schema_version:1,event:{event_key:'other'},families:{short:{event_key:'other'}},courses:{v7:{event_key:'other',race_family:'short',display_route_id:'shape-b'}},editions:{'opaque/id':{race_key:'opaque/id',event_key:'other',race_family:'short',course_version_id:'v7',medal_profile:null,capabilities:{replay:false,map_duel:false}}}};
const custom=contracts.create(other),shape={id:'shape-b'};
assert.strictEqual(custom.familyForRace({race_key:'opaque/id',name:'Ultravasan 90',year:2037,distance_km:90}),'short');
assert.strictEqual(custom.routeForRace({routes:{'shape-b':shape}},'opaque/id'),shape);
assert.strictEqual(custom.supports('opaque/id','replay'),false);
other.editions['opaque/id'].race_family='uv90';
assert.strictEqual(custom.familyForRace('opaque/id'),'short','Input mutation cannot change snapshot');
assert.throws(()=>{custom.catalog.editions['opaque/id'].race_family='uv90'},TypeError);
assert.throws(()=>contracts.create(other),/Ogiltigt loppkontrakt/);

// Same resolver and generated catalog also work through the browser globals.
const browser={window:{}};
for(const file of ['../docs/data/race-catalog.js','../docs/assets/race-contracts.js','../docs/assets/runner-replay.js','../docs/assets/race-media.js'])vm.runInNewContext(fs.readFileSync(require.resolve(file),'utf8'),browser);
assert.strictEqual(browser.window.RunnerReplay.routeForRace(registry,{race_key:'ultravasan45-2014',year:2099}).id,'ultravasan45-current');
assert.strictEqual(browser.window.RACE_MEDIA_CONFIG.familyForRace({race_key:'ultravasan90-2022',name:'45'}),'uv90');
assert.strictEqual(browser.window.RaceContracts.courseForRace('ultravasan90-2026').checkpoint_catalog.find(cp=>cp.checkpoint_key==='high_point').distance_km,null);
console.log('OK: explicit contracts across all 22 editions, unknown keys, immutable snapshots and another event');
