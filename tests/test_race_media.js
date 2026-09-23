'use strict';
const assert=require('assert');
const media=require('../docs/assets/race-media.js');

assert.strictEqual(media.familyForRace('uv90'),'uv90');
assert.strictEqual(media.familyForRace({race_key:'ultravasan45-2025'}),'uv45');
assert.ok(media.musicForRace('uv90').includes('Eldspar-till-Mora.mp3'));
assert.ok(media.musicForRace('uv45').includes('Ultravasan-45.mp3'));

const uv45=media.mediaForRace({race_key:'ultravasan45-2025'});
assert.deepStrictEqual(uv45,{family:'uv45',music:media.musicForRace('uv45')});
assert.ok(Object.isFrozen(uv45));

const audio={src:'',removed:null,removeAttribute(name){this.removed=name;this.src=''}};
assert.strictEqual(media.applyAudioSource(audio,{race_key:'ultravasan90-2025'}),media.musicForRace('uv90'));
assert.strictEqual(audio.src,media.musicForRace('uv90'));

const missing={src:'stale',removed:null,removeAttribute(name){this.removed=name;this.src=''}};
assert.strictEqual(media.applyAudioSource(missing,{race_key:'unknown'}),null);
assert.strictEqual(missing.removed,'src');
assert.strictEqual(missing.src,'');
assert.strictEqual(media.applyAudioSource(null,'uv90'),null);

console.log('OK: U4 RaceMedia centraliserar familjemedia och ljudkälla för Replay och kartduell');
