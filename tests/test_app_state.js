'use strict';
const assert=require('assert');
const stateApi=require('../docs/assets/app-state.js');

const mainA=stateApi.createMain();
const mainB=stateApi.createMain();
assert.deepStrictEqual(mainA.filtered,[]);
assert.notStrictEqual(mainA.filtered,mainB.filtered,'state-instanser får inte dela muterbara arrayer');
assert.strictEqual(mainA.page,1);
assert.strictEqual(mainA.pageSize,10);
assert.strictEqual(mainA.raceFamily,'uv90');
assert.strictEqual(mainA.dataPhase,'none');

const mapA=stateApi.createMap();
const mapB=stateApi.createMap({speed:'60s'});
assert.deepStrictEqual(mapA.models,[]);
assert.deepStrictEqual(mapA.usedRoutes,[]);
assert.notStrictEqual(mapA.models,mapB.models);
assert.strictEqual(mapA.maxTime,1);
assert.strictEqual(mapB.speed,'60s');
assert.strictEqual(mapA.musicEnabled,true);

mainA.page=4;
mainA.filtered.push({id:1});
const snap=stateApi.snapshot(mainA,['page','raceFamily','filtered']);
assert.deepStrictEqual(snap,{page:4,raceFamily:'uv90',filtered:[{id:1}]});
assert.ok(Object.isFrozen(snap));
assert.notStrictEqual(snap.filtered,mainA.filtered);

assert.ok(Object.isFrozen(stateApi.MAIN_DEFAULTS));
assert.ok(Object.isFrozen(stateApi.MAP_DEFAULTS));
console.log('OK: U4 AppState ger isolerade och testbara state-kontrakt för båda appytorna');
