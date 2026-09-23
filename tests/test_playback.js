'use strict';
const assert=require('assert');
const playback=require('../docs/assets/playback.js');

assert.deepStrictEqual([...playback.DURATIONS],[30,60,120,180]);
assert.strictEqual(playback.DEFAULT_MODE,'120s');
assert.strictEqual(playback.durationSeconds(),120);
assert.strictEqual(playback.durationSeconds('30s'),30);
assert.strictEqual(playback.durationSeconds('180s'),180);
assert.strictEqual(playback.durationSeconds('999s'),120);
assert.strictEqual(playback.normalizeMode('60s'),'60s');
assert.strictEqual(playback.normalizeMode('bad'),'120s');
assert.strictEqual(playback.rateFor(7200,'30s'),240);
assert.strictEqual(playback.rateFor(7200,'180s'),40);
assert.strictEqual(playback.rateFor(null,'30s'),0);
assert.strictEqual(playback.distanceStep(90,'120s',2),1.5);
assert.ok(Object.isFrozen(playback.DURATIONS));
console.log('OK: U4 Playback centraliserar uppspelningstider, default och hastighetsberäkning');
