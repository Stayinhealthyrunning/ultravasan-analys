# Oberoende återrevision – Ultravasan Analys 2.0

## 1. Scope

Återrevisionen granskar remediation-HEAD:

`f3c1811daed7d0433db1155bb1ce3432ea93353f`

mot den tidigare auditerade releasekandidaten:

`7811973bcaebfb7834fe2014c7bfb9df52ebc843`

och mot den ursprungliga 91-punktsmatrisen samt fynden i:

- `reports/CODEX_INDEPENDENT_AUDIT_RESULTS.md`
- `reports/CHATGPT_CROSSCHECK_AND_REMEDIATION_PLAN.md`

Kanonisk data, identitetsdata och CourseVersion-kontrakt är oförändrade i diffen mellan releasekandidaten och remediation-HEAD.

GitHub Actions run `35980141949` är grön på exakt `f3c1811...`:

- test: PASS
- browser-smoke: PASS
- Python: PASS
- JavaScript: PASS
- U2/U3/U9-kontrakt: PASS
- custom Chromium: PASS
- oberoende Playwright E2E: PASS

## 2. Tidigare blockerare

### F01 / J3 – DOM-injektion
**PASS.**

Statusklass använder strikt allowlist. Browsermutationer provar status, namn, ort, klubb, klass och checkpoint. Ingen exekvering, inget injicerat markup och fientlig råtext förblir text.

### F02 / H6 – klubbmedian över CourseVersion
**PASS.**

Klubbens prestationslinje delas per explicit history/comparison key. Deltagandestaplar kan fortsätta över versionsgräns.

### F03 / H7 – “Mest förbättrad” över CourseVersion
**PASS.**

`clubHistoryImprovement()` begränsas till aktiv RaceEditions uttryckligt jämförbara history key och kräver minst två användbara år.

### F04 / G3 – Q10/Q90
**PASS.**

Course Intelligence publicerar Q10/Q90 när n≥20 och Q25/Q75 från n≥5. UI/metodhjälp/tester skiljer central 50 % och central 80 %.

### F05 / I1 – finish progression
**PASS.**

Primär vy är 10/25/50/75/90 % i mål för aktiv FINISHED-kohort med Q50 markerad som median.

### F06 / J2 – Back/Forward
**PASS.**

History använder push/replace med popstate-restaurering. Både custom Chromium och Playwright testar URL + DOM/state.

### F07/F08 – H2H och Loppets utveckling
**PASS.**

Loppets utveckling visar checkpoint, tid, gap mot fält/kön/klass, total-/klassplacering och segment relativt egen helfart. Klick seekar Replay utan autoplay.

H2H innehåller finish/segment, checkpointgap, placeringsresa, karta och höjd när samma CourseVersion tillåter det; inkompatibla dimensioner blockeras.

### F09 / G6 – syntetiskt Course Difficulty-score
**PASS genom metodbeslut.**

Den sammanvägda totalscoren/rankingen är borttagen. Stigning/km, pacing loss, fartspridning och DNF-exit redovisas separat med explicit metodcopy.

### F10 / I5 – metodhjälp
**PASS.**

Nya coverage-tester kräver specifik metodhjälp för de centrala analysytorna och förbjuder generisk fallback för dessa kontrakt.

### F11 / J9 – full Playwright
**PASS.**

`tools/verify_playwright_e2e.py` använder Playwright API direkt, inte CDP-wrapper. CI kör både gamla Chromium-smoken och den nya Playwright-grinden.

Playwright täcker bland annat deep link/reload, invalid URL, Back/Forward, XSS, CourseVersion-klubbhistorik, finish progression, Runner Development, H2H, FINISHED/DNF/DNS samt 390/900/1536 px.

### F12 / A5 – fail-closed import
**PASS för publiceringskontraktet.**

Negativa fixtures täcker ofullständig pagination, skyddad historikmutation, identity collision, strict parser/okänd checkpoint samt ändrade inputs efter READY dry-run.

Produktionsdatabasen förblir byteidentisk i de negativa pre-apply-fallen. Workflowet kan inte commit/pusha eller deploya om apply-steget fallerar.

Not: `command_apply()` är inte en enda flerfils-filesystemtransaktion lokalt, men den faktiska GitHub-publiceringskedjan är fail-closed eftersom commit/push/deploy endast sker efter lyckad apply.

### F13 / A6/C10 – sen råpassage
**PASS.**

`fieldFlowProgression()` kräver en sammanhängande följd av exakta, ej estimerade passager. En sen Mora-observation fyller inte saknade kontroller. DNS räknas inte som starter. Rådata ändras inte.

### F14 / C8 – DNS-copy
**PASS.**

DNS visar “Ingen start registrerad” i Journey utan att ändra banans startreferens eller starterstatistik.

### F15 / I8 – svensk Difficulty-term
**PASS.**

Synlig syntetisk Difficulty-copy är borttagen tillsammans med totalscoren.

### F16 – Windows-determinism
**PASS.**

Route-export skriver explicit LF och test verifierar deterministiska bytes.

## 3. Nytt fynd i återrevisionen

### R01 – P2 – Hall of Fame-kartan laddar fortfarande Leaflet från extern CDN

**FAIL-CONFIRMED.**

`docs/assets/nerdlab.js::ensureHallLeaflet()` innehåller fortfarande:

- `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`
- `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`

Detta är en aktiv kodväg: `openHallMap()` anropar `ensureHallLeaflet()`, och huvudsidan `docs/index.html` laddar inte Leaflet själv. Därför används CDN-vägen när Hall of Fame-kartan öppnas.

Det strider mot det ursprungliga arkitekturkravet att ersätta Leaflet-CDN och mot den gemensamma MapEngine/vendrad-Leaflet-riktningen.

Projektet har redan verifierad lokal Leaflet 1.9.4 i:

`docs/vendor/leaflet-1.9.4`

och MapEngine har lokal bootstrap. `tests/test_vendor_leaflet.js` kontrollerar MapEngine/kartappen men täcker inte `nerdlab.js`, vilket är varför avvikelsen kunnat överleva.

Konsekvensen är inte datafel och Hall-kartan har SVG-fallback om Leaflet inte kan laddas, men 2.0-arkitekturen är fortfarande provider-/nätverksberoende i denna vy.

### Minsta korrigering

- ta bort all extern Leaflet JS/CSS-bootstrap ur `nerdlab.js`;
- återanvänd lokal vendrad Leaflet via gemensam MapEngine/ensureLeaflet eller motsvarande lokal bootstrap;
- behåll OSM-tilelayer som separat nätverkskälla om det är avsiktligt; om tiles saknas ska befintlig verklig GPS/SVG-fallback fungera;
- utöka `test_vendor_leaflet.js` så att hela runtimekoden inte får innehålla `unpkg.com/leaflet`;
- browsertest ska öppna Hall of Fame-kartan och verifiera att ingen Leaflet-CDN-request görs.

## 4. Verdict

Tidigare auditblockerare är stängda och remediation-branchen är tekniskt stabil.

Det finns ett enda nytt P2-arkitekturfynd kvar: **Hall of Fame-kartan använder fortfarande extern Leaflet-CDN**.

**READY FOR MERGE: NO**

**READY FOR FINAL RE-AUDIT AFTER R01: YES**

När R01 är stängd och hela CI + Playwright är grön behövs endast en kort verifieringsrevision av denna sista punkt; ingen ny full 91-punktsaudit behövs om diffen hålls strikt avgränsad.
