'use strict';
const assert=require('assert');
const ui=require('../docs/assets/race-ui.js');

assert.strictEqual(ui.familyKey('uv90'),'uv90');
assert.strictEqual(ui.familyKey({race_key:'ultravasan90-2025'}),'uv90');
assert.strictEqual(ui.familyKey({race_key:'ultravasan45-2025'}),'uv45');
assert.strictEqual(ui.labelFor('uv90'),'Ultravasan 90');
assert.strictEqual(ui.startNameFor('uv90'),'Start Sälen');
assert.strictEqual(ui.startNameFor('uv45'),'Start Oxberg');
assert.strictEqual(ui.titleFor('uv90'),'Sälen-Mora splits');
assert.ok(ui.heroFor('uv45').includes('oxberg-mora-header'));
assert.ok(ui.altFor('uv90').includes('Ultravasan 90'));
assert.strictEqual(ui.editionTitle({race_key:'ultravasan45-2025',year:2025}),'Ultravasan 45 2025');
assert.strictEqual(
  ui.selectionTitle([
    {race_key:'ultravasan90-2015',year:2015},
    {race_key:'ultravasan90-2017',year:2017},
  ]),
  'Ultravasan 90 · 2015, 2017'
);
assert.strictEqual(
  ui.selectionTitle([
    {race_key:'ultravasan90-2025',year:2025},
    {race_key:'ultravasan45-2025',year:2025},
  ]),
  'Ultravasan 2025'
);
assert.ok(Object.isFrozen(ui.presentations));
console.log('OK: U4 RaceUI centraliserar familjepresentation och rubriker');
