'use strict';
const assert=require('assert');
const {selectAudienceRace}=require('../docs/assets/audience-analytics.js');
const {mixedRaceFamilyError,activeReferenceRoute,splitRouteDistance}=require('../docs/assets/map.js');

const races=[
  {id:1,race_key:'ultravasan90-2025',year:2025},
  {id:2,race_key:'ultravasan45-2025',year:2025},
  {id:3,race_key:'ultravasan45-2024',year:2024},
];

assert.strictEqual(selectAudienceRace(races,'uv45',2025).id,2,'UV45 2025 must not resolve to UV90 2025');
assert.strictEqual(selectAudienceRace(races,'uv45',2030).id,2,'Missing year must fall back inside UV45');
assert.strictEqual(selectAudienceRace(races,'uv90',2030).id,1,'Missing year must fall back inside UV90');
assert.strictEqual(selectAudienceRace(races,'unknown',2025),null,'Unknown family must not cross to another race');

const results=[{id:10,race_id:1},{id:20,race_id:2},{id:30,race_id:3}];
assert.ok(mixedRaceFamilyError([results[0],results[1]],races),'Mixed UV90/UV45 map selection must fail');
assert.strictEqual(mixedRaceFamilyError([results[1],results[2]],races),null,'Different years in the same family remain comparable');
const uv90Route={id:'uv90'},uv45Route={id:'uv45'};
assert.strictEqual(activeReferenceRoute([{route:uv45Route}],[uv45Route],{default_route_id:'uv90',routes:{uv90:uv90Route}}),uv45Route,'Fallback and strip must use the selected UV45 route');
assert.strictEqual(splitRouteDistance({distance_km:15.5},{distance_km:13.907}),15.5,'Historical UV45 must use the result year checkpoint distance, not the current route checkpoint');
assert.strictEqual(splitRouteDistance({}, {distance_km:13.907}),13.907,'Route checkpoint remains a safe fallback when result distance is missing');
console.log('OK: race URL and map-family separation');
