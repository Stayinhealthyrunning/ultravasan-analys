'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const audience=require(path.join(root,'docs/assets/audience-analytics.js'));
const nerd=require(path.join(root,'docs/assets/nerdlab.js'));
const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'docs/assets/styles.css'),'utf8');
const audienceSource=fs.readFileSync(path.join(root,'docs/assets/audience-analytics.js'),'utf8');
const appSource=fs.readFileSync(path.join(root,'docs/assets/app.js'),'utf8');

// Faktisk gruppfart viktas som total verifierad distans / total verifierad tid.
const aggregate=audience.aggregateSpeedKmh([
  {distanceKm:90,seconds:9*3600},
  {distanceKm:90,seconds:10*3600}
]);
assert.ok(Math.abs(aggregate-(180/19))<1e-9,'Gruppens loppfart ska använda total distans dividerad med total tid');
assert.strictEqual(audience.speedIndex(aggregate*1.08,aggregate),108,'Index över 100 ska betyda snabbare än gruppens loppfart');
assert.ok(Math.abs(audience.speedIndex(aggregate*.92,aggregate)-92)<1e-9,'Index under 100 ska betyda långsammare än gruppens loppfart');
assert.strictEqual(audience.aggregateSpeedKmh([{distanceKm:90,seconds:9*3600}]),null,'Ett ensamt resultat ska ge reservläge');
assert.strictEqual(audience.aggregateSpeedKmh([{distanceKm:90,seconds:9*3600},{distanceKm:0,seconds:0}]),null,'Ogiltiga eller saknade tider får inte fylla minimiunderlaget');
assert.ok(audienceSource.includes('eligible=relative?rows.filter(isFinished):rows'),'Pacingreferensen ska endast använda fullföljande');
assert.ok(audienceSource.includes('distanceKm:Number(race?.distance_km),seconds:Number(r.finish_seconds)'),'Referensen ska byggas av loppdistans och sluttid');
assert.ok(audienceSource.includes('Minst två fullföljande med giltiga tider behövs per grupp.'),'Små urval ska få ett tydligt reservläge');

// Klassfiltret ska vara dynamiskt, stabilt sorterat och kunna samverka med övriga filter.
const classRows=[{age_class:'M100'},{age_class:'M21'},{age_class:'W40'},{age_class:'W21'},{age_class:'M35'},{age_class:'M21'},{age_class:''},{age_class:null}];
assert.deepStrictEqual(nerd.segmentClassOptions(classRows),['W21','W40','M21','M35','M100']);
assert.deepStrictEqual(nerd.segmentClassOptions([{age_class:'H50'},{age_class:'D35'},{age_class:'H21'}]),['D35','H21','H50'],'Äldre D/H-klasser ska använda samma logiska klassordning');
assert.strictEqual(nerd.filterRowsBySegmentClass(classRows,'M21').length,2);
assert.strictEqual(nerd.filterRowsBySegmentClass(classRows,'').length,classRows.length);
assert.ok(html.includes('<select id="segmentClass"><option value="">Alla klasser</option></select>'));

// Sektioner och analysblock ska ligga exakt i den nya ordningen utan dubbletter.
const intelligence=html.indexOf('RACE INTELLIGENCE LAB'),club=html.indexOf('KLUBB/ORT-ANALYS'),results=html.indexOf('RESULTATDATABAS');
assert.ok(intelligence<club&&club<results,'Klubb/ort-analys ska ligga direkt efter Intelligence Lab och före Resultatdatabas');
for(const id of ['klubbar','segmentClass','runnerHistory','raceFingerprint','fieldFlow','hallOfFame'])assert.strictEqual((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`${id} får bara finnas en gång`);
const history=html.indexOf('En person genom åren',intelligence),fingerprint=html.indexOf('Så skiljer sig loppet från andra år',intelligence),flow=html.indexOf('Från start till Mora',intelligence),hall=html.indexOf('HALL OF FAME',intelligence);
assert.ok(history<fingerprint&&fingerprint<flow&&flow<hall,'De fyra större analysblocken har fel ordning');
assert.ok(css.includes('.intelligence-grid>.history-lab,.intelligence-grid>.fingerprint-card{grid-column:span 6}'));
assert.ok(css.includes('.intelligence-grid>.field-flow-card,.intelligence-grid>.hall-card{grid-column:1/-1}'));

// De mest utsatta textkomponenterna ska radbryta i stället för att kapas.
for(const selector of ['.segment-cell span','.story-card strong,.story-card em','.podium-place span','.segment-row span strong','.flow-node span','.hall-segment-item strong'])assert.ok(css.includes(selector),`Textskydd saknas för ${selector}`);
assert.ok(css.includes('.pace-segment-label')&&css.includes('#genderRetentionChart{height:330px!important'),'Pacinggrafen ska reservera höjd för läsbara etiketter');

// Simulator, percentiler, DNF-fördelning och könshistorik ska använda korrekt underlag och yta.
assert.ok(appSource.includes('targetSimulatorSelections=new Map()'),'Simulatorn ska minnas aktiva val separat per lopp och år');
assert.ok(appSource.includes('isFinishedResult(r)&&r.overall_place'),'Simulatorns snitt får endast använda centralt klassificerade fullföljande resultat');
assert.ok(appSource.includes('rows.reduce((sum,row)=>sum+Number(row.finish_seconds),0)/rows.length'),'Simulatorns default ska bygga på fullföljarnas medeltid');
assert.ok(appSource.includes('Math.round(mean/120)*120'),'Simulatorns default ska avrundas till ett giltigt tvåminuterssteg med 00 sekunder');
assert.ok(css.includes('.segment-lab{grid-column:span 7}.percentile-card{grid-column:span 5}'),'Percentiltrappan ska få större bredd på desktop');
assert.ok(audienceSource.includes('dnf-bar-track')&&audienceSource.includes('dnf-bar-fill'),'Repet dras ska ha ett fullt spår med proportionell DNF-fyllnad');
assert.ok(audienceSource.includes('rate:summary.rate'),'Fullföljandegrad ska beräknas per år och kön av den centrala statusklassningen');
assert.ok(audienceSource.includes('gender-history-rate-line')&&audienceSource.includes('gender-history-point'),'Historikens streckade serier ska ha interaktiva årspunkter');
for(const value of ['${d.starters} startande','${d.finishers} fullföljande','${d.dnf} DNF','${d.dsq} DSQ','${d.dns} DNS/ej start','% fullföljandegrad'])assert.ok(audienceSource.includes(value),`Historikens tooltip saknar ${value}`);
assert.ok(html.includes('assets/result-status.js?v=20260714-status1'),'Den centrala statusklassningen ska laddas före analyserna');
assert.ok(audienceSource.includes('window.ResultStatus.classify')&&appSource.includes('window.ResultStatus.classify'),'Översikt och fördjupade analyser ska dela statusklassning');

console.log('OK: pacingreferens, klassfilter, analyslayout, simulator, DNF och könshistorik');
