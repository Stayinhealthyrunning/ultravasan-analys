'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const storage=new Map();
global.localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))};
const units=require(path.join(root,'docs/assets/speed-units.js'));

assert.strictEqual(units.DEFAULT_UNIT,'pace');
assert.strictEqual(units.get(),'pace','min/km ska vara standard utan sparad inställning');
assert.strictEqual(units.formatPaceSeconds(347),'5:47 /km');
assert.strictEqual(units.formatSpeedKmh(10.428),'10,4 km/h');
assert.strictEqual(units.formatSpeed(3600/347,'pace'),'5:47 /km');
assert.strictEqual(units.formatPace(347,'speed'),'10,4 km/h');
units.set('speed');assert.strictEqual(units.get(),'speed','giltigt val ska sparas');
storage.set(units.STORAGE_KEY,'yards');assert.strictEqual(units.get(),'pace','ogiltigt sparat val ska falla tillbaka till min/km');

const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'docs/assets/styles.css'),'utf8');
const audience=fs.readFileSync(path.join(root,'docs/assets/audience-analytics.js'),'utf8');
const app=fs.readFileSync(path.join(root,'docs/assets/app.js'),'utf8');

assert.ok(html.includes('id="speedUnitFilter"')&&html.includes('<option value="pace">min/km</option>'));
assert.ok(html.indexOf('assets/speed-units.js')<html.indexOf('assets/runner-replay.js'),'enhetsmodulen ska laddas före replay och app');
assert.ok(app.includes("ultravasan:speed-unit-change")&&app.includes("renderAll()"),'enhetsbyte ska rita om vyn utan omladdning');

for(const cls of ['history-card','segment-card','dnf-card','position-card'])assert.ok(html.includes(cls));
assert.ok(css.includes('.insight-grid>.history-card{order:3;grid-column:1/-1!important}'));
assert.ok(css.includes('.insight-grid>.segment-card{order:4;grid-column:1/-1!important}'));
assert.ok(css.includes('.insight-grid>.dnf-card{order:5;grid-column:span 6!important}'));
assert.ok(css.includes('.insight-grid>.position-card{order:6;grid-column:span 6!important}'));

assert.ok(audience.includes('class-duel-point')&&audience.includes('tabindex="0"'));
assert.ok(audience.includes('interactive-chart-tooltip')&&audience.includes('wireChartTooltips(el)'));
assert.ok(!audience.includes('<text x="${x(valid.at(-1)?.i||0)+5}"'),'klippta slutetiketter ska vara borttagna');
assert.ok(audience.includes('class-history-bar starters')&&audience.includes('class-history-bar dnf'));
assert.ok(audience.includes('median ${fmtTime(d.med)}')&&!audience.includes('median ${fmtTime(d.med)} · DNF'),'linjens tooltip ska inte innehålla DNF');
assert.ok(html.includes('Median, startande och DNF över åren'));

for(const selector of ['#classCompareChart','#classHistoryChart','#segmentRanking','#fieldFlow','#hallOfFame','#raceFingerprint'])assert.ok(app.includes(`['${selector}'`),`förklarande infotext saknas för ${selector}`);

console.log('OK: global fartenhet, analyslayout, interaktiv klassduell, klasshistorik och infotexter');
