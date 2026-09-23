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
assert.ok(css.includes('#resultsBody tr[role="button"]:focus-visible'),'tangentbordsfokus på resultatrader ska vara visuellt tydligt');

assert.ok(app.includes("popupId='info-popup-'")&&app.includes("setAttribute('aria-controls',popupId)")&&app.includes("setAttribute('aria-describedby',popupId)"),'informationsknappar ska vara explicit kopplade till sin tooltip');
assert.ok(css.includes('button:focus-visible,a:focus-visible,summary:focus-visible,[role="button"]:focus-visible'),'interaktiva element ska ha gemensam synlig fokusmarkering');

assert.ok(html.includes('aria-current="location">Översikt</button>'),'aktiv analyssektion ska vara semantiskt markerad från start');
assert.ok(audience.includes("x.setAttribute('aria-current','location')")&&audience.includes("x.removeAttribute('aria-current')"),'analysnavigeringen ska flytta aria-current med aktiv sektion');
assert.ok(audience.includes("matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'"),'programmatisk scroll ska respektera reduced motion');
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)')&&css.includes('.skip-link{transition:none}'),'U8-rörelser ska respektera reduced motion');

assert.ok(css.includes('.analysis-guide-grid{display:grid;grid-template-columns:repeat(4,1fr)')&&css.includes('@media(max-width:620px)')&&css.includes('.analysis-guide-grid{grid-template-columns:1fr}'),'metodguiden ska vara responsiv');
assert.ok(html.includes('assets/styles.css?v=20260923-u8')&&html.includes('assets/app.js?v=20260923-u8')&&html.includes('assets/audience-analytics.js?v=20260923-u8'),'alla ändrade U8-assets ska cache-bustas tillsammans');

console.log('OK: U8 UX/metodik har semantisk struktur, metodguide, tangentbordsstöd och reduced-motion-kontrakt');
