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
const finishBins=analytics.fixedFinishBins([10877,12000,12677,14477]);
assert.strictEqual(finishBins.start,10877,'första intervallet ska börja exakt vid första målgången');
assert.strictEqual(finishBins.step,1800,'sluttidshistogrammet ska använda fasta 30-minutersintervall');
assert.deepStrictEqual(finishBins.bins.map(bin=>bin.count),[2,1,1],'alla målgångar, även exakta intervallgränser, ska hamna i rätt halvtimme');
units.set('speed');assert.strictEqual(units.get(),'speed','giltigt val ska sparas');
storage.set(units.STORAGE_KEY,'yards');assert.strictEqual(units.get(),'pace','ogiltigt sparat val ska falla tillbaka till min/km');

const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'docs/assets/styles.css'),'utf8');
const audience=fs.readFileSync(path.join(root,'docs/assets/audience-analytics.js'),'utf8');
const app=fs.readFileSync(path.join(root,'docs/assets/app.js'),'utf8');
const nerd=fs.readFileSync(path.join(root,'docs/assets/nerdlab.js'),'utf8');

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
assert.ok(audience.includes("'Högsta punkten':'HP'")&&audience.includes("'Mångsbodarna':'Mångs.'")&&audience.includes("'Mora Förvarning':'Mora förv.'"),'Klassduell ska använda konsekventa, loppspecifika checkpointförkortningar');
assert.ok(audience.includes('compactSegmentLabel(pair)')&&audience.includes('rotate(-20'),'Klassduell ska visa kompakta etiketter med måttlig rotation');
assert.ok(audience.includes('aria-label="${esc(full)}"')&&audience.includes('data-chart-tip="${esc(full)}"'),'fullständiga delsträckenamn ska finnas för hjälptext och tangentbordsfokus');
assert.ok(!audience.includes('<text x="${x(valid.at(-1)?.i||0)+5}"'),'klippta slutetiketter ska vara borttagna');
assert.ok(audience.includes('class-history-bar starters')&&audience.includes('class-history-bar dnf'));
assert.ok(audience.includes('median ${fmtTime(d.med)}')&&!audience.includes('median ${fmtTime(d.med)} · DNF'),'linjens tooltip ska inte innehålla DNF');
assert.ok(audience.includes('relativeToplistWidth(classIndexMetric(x),maxBarValue)'),'topplistans staplar ska normaliseras mot listans maxvärde');
assert.ok(audience.includes('Median sluttid')&&audience.includes('Antal personer'),'klasshistoriken ska ha separata y-axlar');
assert.ok(audience.includes('visibleCountBarHeight(d.dnf,maxN,plotHeight)'),'DNF-staplar ska behålla synlig minimihöjd');
assert.ok(app.includes('fixedFinishTimeBins')&&audience.includes('fixedFinishBins(times)'),'båda histogramrenderarna ska använda fasta 30-minutersintervall från första målgången');
assert.ok(html.includes('Median, startande och DNF över åren'));
assert.ok(html.includes('Välj upp till fem klasser')&&audience.includes('advanced.classSelection.length<5'),'Klassduellen ska tillåta högst fem val');
assert.ok(audience.includes('classSelectionInitialized')&&audience.includes('Inga klasser valda.'),'användaren ska kunna avmarkera alla klasser utan automatisk återställning');
assert.ok(css.includes('.percentile-card .panel-head h3{white-space:nowrap}'),'Percentiltrappan ska hållas på en rad');
assert.ok(css.includes('.sex-segment-cell>div strong{display:inline-block;white-space:nowrap'),'fart och /km ska hållas på samma rad');
assert.ok(html.includes('club-chart-card club-compare-card')&&html.includes('club-chart-card club-history-card'));
assert.ok(audience.includes('club-compare-point')&&audience.includes('club-history-point'),'klubbdiagrammen ska ha interaktiva datapunkter');
assert.ok(audience.includes('club-history-bar starters')&&audience.includes('club-history-bar finishers'),'klubbhistoriken ska ha interaktiva staplar');
assert.ok(audience.includes('data-chart-tip')&&audience.includes('registrerade löpare'),'klubbjämförelsens tooltip ska redovisa underlaget');
assert.ok(audience.includes("'Antal personer'")&&audience.includes("'Median sluttid'"),'klubbhistoriken ska ha två namngivna y-axlar');
assert.ok(audience.includes('renderClubHistory(stats)'),'historiken ska följa samtliga valda klubbar och orter');
assert.ok(css.includes('.club-chart{position:relative;height:390px!important'),'klubbdiagrammen ska använda kortens yta');
assert.ok(html.includes('<h3>Övrig statistik</h3>')&&audience.includes('Kvinnornas mediantid är längre'),'automatiska insikter ska ha naturliga svenska rubriker');
assert.ok(audience.includes('Medianprestation relativt övriga fältet.')&&audience.includes('Andel faktiska startande som fullföljde.'),'Klubb/ort-DNA ska förklara varje mått synligt');
assert.ok(css.includes('.club-dna-copy>small')&&css.includes('.club-dna i{height:17px}'),'DNA-förklaringar och bredare staplar saknar layoutstöd');
assert.ok(nerd.includes('<small>bröt före ${nEsc(next.name)}</small>')&&css.includes('.flow-link>em small'),'Fältflödets avhoppskort ska använda en kompakt tvåradslayout');
assert.ok(css.includes('.segment-card .sex-segment-cell small{color:#4c645a'),'Segmentkortens underlagstext ska ha tillräcklig kontrast');
assert.ok(css.includes('.insight-grid>.dnf-card{align-self:stretch')&&css.includes('.dnf-bar-track{height:19px'),'DNF-kortet ska fylla sin rad och använda tydligare staplar');

for(const selector of ['#classCompareChart','#classHistoryChart','#segmentRanking','#fieldFlow','#hallOfFame','#raceFingerprint'])assert.ok(app.includes(`['${selector}'`),`förklarande infotext saknas för ${selector}`);

console.log('OK: global fartenhet, analyslayout, interaktiv klassduell, klasshistorik och infotexter');
