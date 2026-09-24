'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');

const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'docs/assets/app.js'),'utf8');
const audience=fs.readFileSync(path.join(root,'docs/assets/audience-analytics.js'),'utf8');
const css=fs.readFileSync(path.join(root,'docs/assets/styles.css'),'utf8');

assert.ok(html.includes('<a class="skip-link" href="#mainContent">Hoppa till analysinnehållet</a>'),'sidan ska ha en synlig skip-länk vid tangentbordsfokus');
assert.strictEqual((html.match(/<h1\b/g)||[]).length,1,'huvudsidan ska ha exakt en H1');
assert.ok(html.includes('<main id="mainContent" tabindex="-1">'),'skip-länken ska landa på fokuserbart huvudinnehåll');
assert.ok(html.includes('class="visually-hidden">Ultravasan 90 och 45'),'H1 får vara visuellt dold men inte saknas semantiskt');

assert.ok(html.includes('class="race-switch" role="group" aria-label="Välj lopp"'),'loppväxlaren ska vara en knappgrupp, inte ett falskt tab-gränssnitt');
assert.ok(html.includes('id="raceSwitch90"')&&html.includes('aria-pressed="true"')&&html.includes('id="raceSwitch45"'),'loppknappar ska uttrycka valt tillstånd med aria-pressed');
assert.ok(!html.includes('role="tab"')&&!html.includes('role="tablist"'),'loppväxlaren får inte annonsera tab-semantik utan tabpaneler');
assert.ok(!app.includes("setAttribute('aria-selected'"),'JavaScript ska uppdatera aria-pressed, inte aria-selected');

for(const id of ['analysisGuideTitle','analysisGuideContext','analysisGuideDataStatus','analysisGuideDetails','analysisGuideFilterStatus']){
  assert.ok(html.includes('id="'+id+'"'),'metodguiden saknar '+id);
}
for(const label of ['Källvärde','Beräknat','Jämförbart','Aktuellt urval'])assert.ok(html.includes(label),'metodguiden ska förklara '+label);
assert.ok(app.includes('function updateAnalysisGuide()')&&app.includes("phaseCopy={")&&app.includes("Visar '+shown.toLocaleString('sv-SE')+' av '"),'metodguiden ska visa faktisk dataladdningsfas och filteromfattning');
assert.ok(app.includes("updateAnalysisGuide();renderHistogram"),'metodstatus ska uppdateras varje gång fälturvalet renderas');

assert.ok(app.includes('tabindex="0" role="button" aria-label="Öppna loppanalys för'),'resultatrader ska vara tangentbordsfokuserbara');
assert.ok(app.includes("event.key==='Enter'||event.key===' '"),'resultatrader ska kunna öppnas med Enter och blanksteg');
assert.ok(app.includes("$('#resultsBody tr[data-id]').forEach"),'tangentbordsbindningen ska iterera över alla resultatrader, inte anropa forEach på querySelector');
assert.ok(css.includes('#resultsBody tr[role="button"]:focus-visible'),'tangentbordsfokus på resultatrader ska vara visuellt tydligt');

assert.ok(app.includes("popupId='info-popup-'")&&app.includes("setAttribute('aria-controls',popupId)")&&app.includes("setAttribute('aria-describedby',popupId)"),'informationsknappar ska vara explicit kopplade till sin tooltip');
assert.ok(css.includes('button:focus-visible,a:focus-visible,summary:focus-visible,[role="button"]:focus-visible'),'interaktiva element ska ha gemensam synlig fokusmarkering');

assert.ok(html.includes('aria-current="location">Översikt</button>'),'aktiv analyssektion ska vara semantiskt markerad från start');
assert.ok(audience.includes("x.setAttribute('aria-current','location')")&&audience.includes("x.removeAttribute('aria-current')"),'analysnavigeringen ska flytta aria-current med aktiv sektion');
assert.ok(audience.includes("matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'"),'programmatisk scroll ska respektera reduced motion');
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)')&&css.includes('.skip-link{transition:none}'),'U8-rörelser ska respektera reduced motion');

assert.ok(css.includes('.analysis-guide-grid{display:grid;grid-template-columns:repeat(4,1fr)')&&css.includes('@media(max-width:620px)')&&css.includes('.analysis-guide-grid{grid-template-columns:1fr}'),'metodguiden ska vara responsiv');

assert.ok(html.includes('id="genderHistoryChart"')&&html.includes('Deltagande och fullföljande över åren'),'U8 ska behålla könsuppdelad deltagandehistorik som separat årsvy');
assert.ok(audience.includes('function renderGenderHistory()')&&audience.includes('stapel = startande · streckad linje = fullföljandegrad'),'deltagandehistoriken ska visa både startande och fullföljandegrad');
assert.ok(html.includes('MÅLGÅNGSPROGRESSION')&&html.includes('När hade fältet gått i mål?'),'primär finish progression ska ha begriplig målgångssemantik');
for(const label of ['10 % i mål','25 % i mål','50 % i mål · median','75 % i mål','90 % i mål'])assert.ok(audience.includes(label),'finish progression saknar '+label);
assert.ok(app.includes("['#percentileLadder'")&&app.includes('Q10, Q25, Q50, Q75 och Q90'),'finish progression ska ha full metodhjälp');
assert.ok(html.includes('id="genderRetentionChart"')&&html.includes('100 = snittfarten i loppet'),'U8 ska behålla fartretention med index 100 som referens');
assert.ok(audience.includes("renderSexPaceChart(document.querySelector('#genderRetentionChart'),rows,false,true,'genderRetention')")&&audience.includes('Fart kvar i avslutningen'),'fartretention ska drivas av relativ fart och avslutningsinsikt');
assert.ok(html.includes('Q25–Q75')&&app.includes('p25:quantile(g.vals,.25)')&&app.includes('p75:quantile(g.vals,.75)'),'U8 ska exponera och beräkna Q25–Q75 för delsträckors spridning');
assert.ok(html.includes('id="classCompareChart"')&&html.includes('id="clubCompareChart"'),'U8 ska behålla gruppvyer för både klass och klubb/ort');
assert.ok(audience.includes('function renderClassCompare(stats)')&&audience.includes('function renderClubCompare(stats)'),'klass- och klubbgruppvyerna ska ha egna jämförelserenderare');
assert.ok(app.includes("['#genderRetentionChart'")&&app.includes("['#classCompareChart'")&&app.includes("['#clubCompareChart'"),'U8:s grupp- och retentionvyer ska ha metodhjälp');
assert.ok(html.includes('assets/styles.css?v=20260923-u8')&&html.includes('assets/app.js?v=20260924-r4')&&html.includes('assets/audience-analytics.js?v=20260924-r4'),'ändrade runtime-assets ska ha explicita cacheversioner');

console.log('OK: U8 UX/metodik låser målgångsprogression, fartretention, Q25–Q75, gruppvyer, metodhjälp och tillgänglighet');
