'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const storage=new Map();
global.localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))};
const units=require(path.join(root,'docs/assets/speed-units.js'));
const analytics=require(path.join(root,'docs/assets/audience-analytics.js'));

assert.strictEqual(units.DEFAULT_UNIT,'pace');
assert.strictEqual(units.get(),'pace','min/km ska vara standard utan sparad inställning');
assert.strictEqual(units.formatPaceSeconds(347),'5:47 /km');
assert.strictEqual(units.formatSpeedKmh(10.428),'10,4 km/h');
assert.strictEqual(units.formatSpeed(3600/347,'pace'),'5:47 /km');
assert.strictEqual(units.formatPace(347,'speed'),'10,4 km/h');
assert.strictEqual(analytics.relativeToplistWidth(49.5,49.5),100);
assert.ok(Math.abs(analytics.relativeToplistWidth(46.6,49.5)-94.14)<.01);
assert.ok(Math.abs(analytics.relativeToplistWidth(44.3,49.5)-89.49)<.01);
assert.ok(Math.abs(analytics.relativeToplistWidth(32.6,49.5)-65.86)<.01);
assert.ok(analytics.relativeToplistWidth(60,49.5)<=100,'indexstapeln får aldrig överstiga 100 procent');
assert.strictEqual(analytics.visibleCountBarHeight(0,100,300),0);
assert.strictEqual(analytics.visibleCountBarHeight(1,1000,300),2,'positiv DNF ska alltid få en synlig stapel');
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
assert.ok(audience.includes('relativeToplistWidth(classIndexMetric(x),maxBarValue)'),'topplistans staplar ska normaliseras mot listans maxvärde');
assert.ok(audience.includes('Median sluttid')&&audience.includes('Antal personer'),'klasshistoriken ska ha separata y-axlar');
assert.ok(audience.includes('visibleCountBarHeight(d.dnf,maxN,plotHeight)'),'DNF-staplar ska behålla synlig minimihöjd');
assert.ok(html.includes('Median, startande och DNF över åren'));
assert.ok(css.includes('.percentile-card .panel-head h3{white-space:nowrap}'),'Percentiltrappan ska hållas på en rad');
assert.ok(css.includes('.sex-segment-cell>div strong{display:inline-block;white-space:nowrap'),'fart och /km ska hållas på samma rad');
assert.ok(html.includes('club-chart-card club-compare-card')&&html.includes('club-chart-card club-history-card'));
assert.ok(audience.includes('club-compare-point')&&audience.includes('club-history-point'),'klubbdiagrammen ska ha interaktiva datapunkter');
assert.ok(audience.includes('club-history-bar starters')&&audience.includes('club-history-bar finishers'),'klubbhistoriken ska ha interaktiva staplar');
assert.ok(audience.includes('data-chart-tip')&&audience.includes('registrerade löpare'),'klubbjämförelsens tooltip ska redovisa underlaget');
assert.ok(audience.includes("'Antal personer'")&&audience.includes("'Median sluttid'"),'klubbhistoriken ska ha två namngivna y-axlar');
assert.ok(audience.includes('renderClubHistory(stats)'),'historiken ska följa samtliga valda klubbar och orter');
assert.ok(css.includes('.club-chart{position:relative;height:390px!important'),'klubbdiagrammen ska använda kortens yta');

for(const selector of ['#classCompareChart','#classHistoryChart','#segmentRanking','#fieldFlow','#hallOfFame','#raceFingerprint'])assert.ok(app.includes(`['${selector}'`),`förklarande infotext saknas för ${selector}`);

console.log('OK: global fartenhet, analyslayout, interaktiv klassduell, klasshistorik och infotexter');
