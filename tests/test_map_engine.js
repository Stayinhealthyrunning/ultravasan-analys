'use strict';
const assert=require('assert');
const engine=require('../docs/assets/map-engine.js');

const route={
  official_distance_km:20,
  points:[[60,14,0],[61,15,10],[62,16,20]],
  elevation_profile:[[0,100,1,0,0],[10,200,3,150,20],[20,150,-2,220,90]],
};
assert.deepStrictEqual(engine.pointAtDistance(route.points,0),[60,14,0]);
assert.deepStrictEqual(engine.pointAtDistance(route.points,5),[60.5,14.5,5]);
assert.deepStrictEqual(engine.routePosition(route,15),[61.5,15.5]);
assert.deepStrictEqual(engine.routePosition(route,-2),[60,14]);
assert.deepStrictEqual(engine.routePosition(route,25),[62,16]);

assert.deepStrictEqual(
  engine.routeSlice(route,5,15),
  [[60.5,14.5],[61,15],[61.5,15.5]]
);
assert.deepStrictEqual(
  engine.routeSlice(route,15,5),
  [[61.5,15.5],[61,15],[60.5,14.5]]
);

const terrain=engine.terrainAtDistance(route.elevation_profile,5);
assert.deepStrictEqual(terrain,{distance:5,elevation:150,grade:2,cumulativeAscent:75,cumulativeDescent:10});
assert.strictEqual(engine.elevationAtDistance(route.elevation_profile,15),175);
assert.strictEqual(engine.elevationAtDistance([],5),null);
assert.strictEqual(engine.validLatLng([60,14]),true);
assert.strictEqual(engine.validLatLng([60]),false);
assert.strictEqual(engine.validLatLng([null,14]),false);

console.log('OK: U4 MapEngine centraliserar rutt- och terränginterpolation deterministiskt');
