'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'docs/assets/app.js'),'utf8');
const nerd=fs.readFileSync(path.join(root,'docs/assets/nerdlab.js'),'utf8');
function specificHelp(selector,required){
  const line=app.split(/\r?\n/).find(value=>value.includes(`['${selector}','`));
  assert.ok(line,`specifik metodhjälp saknas för ${selector}`);
  const normalized=line.toLocaleLowerCase('sv-SE');
  const missing=required.filter(term=>!normalized.includes(term.toLocaleLowerCase('sv-SE')));
  assert.ok(!missing.length,`${selector} saknar metodkontraktstermer: ${missing.join(', ')}`);
  assert.ok(!normalized.includes('visar aktuellt urval för den här delen'),`${selector} får inte falla tillbaka till generisk urvalstext`);
}

specificHelp('#histogram',['FINISHED-resultat','15-minutersintervall','Q25–Q75','DNF och DNS']);
specificHelp('#paceChart',['uttryckligt definierad delsträcka','exakta segmenttider','estimerade mellantider','separat för varje segment','olika bansträckningar']);
specificHelp('#fieldFlow',['sammanhängande följd','estimerad passage bryter','råobservation fyller inte luckan','DNS räknas inte']);
specificHelp('#placementScatter',['Varje punkt är en löpare','slutplacering','män och kvinnor']);
specificHelp('#classHistoryChart',['median sluttid','efterföljande tävlingsår','kalenderluckor','DNS räknas inte']);
specificHelp('#clubHistoryChart',['medianlinjen binds samman','kalenderluckor','tidslinjen beskrivande']);
specificHelp('#percentileLadder',['FINISHED','linjära kvantilmetod','DNS och DNF']);
specificHelp('.runner-development',['faktiskt registrerad checkpoint','kompletta finished-kohort','olika bansträckningar','startar inte uppspelning eller musik']);
assert.ok(app.includes('class="h2h-method"')&&app.includes('samma uttryckligen verifierade bansträckningsserie')&&app.includes('banversionsbrott blockerar checkpoint-, placerings-, kart- och höjddimensionerna'),'H2H ska visa synlig metodtext för kohort och bansträckningsblockering');
for(const [symbol,terms] of [
  ['COURSE_INTELLIGENCE_METHOD_HELP',['exakta, ej estimerade passager','n≥20','separata empiriska dimensioner','bansträckning']],
  ['COURSE_PLAN_METHOD_HELP',['historiska fullföljare','exakt samma bansträckning','minst n=5','ingen resttid fördelas genom gissning']],
  ['HISTORY_FINGERPRINT_METHOD_HELP',['medianen av loppårsmedianerna','minst två tidigare referensår','bansträckningsfamilj']],
  ['HISTORY_HALL_METHOD_HELP',['verifierad personidentitet','bansträckningsserie','Mest förbättrad']],
]){
  const line=nerd.split(/\r?\n/).find(value=>value.startsWith(`const ${symbol}=`));
  assert.ok(line&&terms.every(term=>line.includes(term)),`${symbol} ska behålla sin specifika metodbegränsning`);
}
for(const [selector,symbol] of [
  ["n$('#courseIntelligenceCard')",'COURSE_INTELLIGENCE_METHOD_HELP'],
  ["n$('#courseRacePlan')",'COURSE_PLAN_METHOD_HELP'],
  ["n$('.fingerprint-card')",'HISTORY_FINGERPRINT_METHOD_HELP'],
  ["n$('.hall-card')",'HISTORY_HALL_METHOD_HELP'],
])assert.ok(nerd.includes(selector)&&nerd.includes(symbol),`${symbol} måste kopplas till en synlig metodhjälp`);
assert.ok(app.includes("['#raceFingerprint',")&&app.includes("['#hallOfFame',"),'Year Fingerprint och Hall of Fame ska ha öppningsbar infohjälp');

console.log('OK: centrala analysytor har specifik metodhjälp och kontraktsbaserad täckning');
