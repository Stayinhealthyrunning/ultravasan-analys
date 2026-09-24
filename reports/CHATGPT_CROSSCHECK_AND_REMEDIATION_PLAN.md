# ChatGPT cross-check av Codex oberoende audit – Ultravasan Analys 2.0

## Auditerad bas

- Releasekandidat: `7811973bcaebfb7834fe2014c7bfb9df52ebc843`
- Codex auditcommit: `e651fe34c266ef9eb4e14c9b46c3cebc60a584a7`
- Gotaleden-referens: `7ee0b1c4af306796754c2a1c1e9989e247ee383b`

Denna cross-check granskar Codexfynden mot faktisk releasekod. Den ändrar ingen produktkod.

## Sammanfattning

Codex huvudslutsats bekräftas: **Ultravasan Analys 2.0 är inte redo för freeze**.

Den tidigare gröna U9-grinden visar att data, huvudkontrakt, modulär laddning och stora delar av UI-regressionen är stabila. Den bevisar däremot inte att hela den ursprungliga produkt- och red-team-specifikationen är uppfylld.

### Bekräftade blockerande kod-/produktfel

1. **F01 / J3 – P1 DOM-injektion: BEKRÄFTAD**
   - `docs/assets/app.js::renderTable()`
   - CSS-klasstoken byggs direkt från `String(r.status).toLowerCase()` inne i `innerHTML`.
   - Synlig status-text escapear korrekt, men attributdelen gör det inte.
   - Detta är ett verkligt injektionssink och ska rättas före all annan freeze.

2. **F02 / H6 – P2 klubbmedian korsar CourseVersion: BEKRÄFTAD**
   - `docs/assets/audience-analytics.js::renderClubHistory()`
   - `familyRaces()` används över hela familjen och SVG-path byggs utan comparison key.
   - Deltagandestaplar får fortsätta över banbyte; medianprestationslinjen får det inte.

3. **F03 / H7 – P2 “Mest förbättrad” klubb/ort korsar CourseVersion: BEKRÄFTAD**
   - `clubHistoryImprovement()` jämför första/sista års SM-index utan CourseVersion-scope.
   - Måttet är ett flerårigt prestationspåstående och måste delas per explicit jämförbar serie.

4. **F04 / G3 – P2 Q10/Q90 saknas i Course Intelligence: BEKRÄFTAD**
   - `fieldStatsForSegment()` publicerar Q25/Q75/IQR men inga Q10/Q90.
   - UI och test saknar dem också.

5. **F05 / I1 – P2 beslutad finish progression saknas: BEKRÄFTAD**
   - `renderPercentiles()` visar 1/5/10/25/50/75-percentiler per kön.
   - Detta är inte samma produkt som beslutade 10/25/50/75/90 % i mål bland aktiv FINISHED-kohort.
   - Gotaleden har den avsedda modellen i `GCharts.finishProgression()`.

6. **F06 / J2 – P2 Back/Forward återställer inte state: BEKRÄFTAD**
   - `syncUrl()` använder `replaceState`.
   - `restoreUrl()` används vid initiering.
   - Ingen `popstate`-hantering finns.
   - Codex har dessutom reproducerat faktisk URL/UI-divergens i Chromium.

7. **F07 / F11 – P2 Direktjämförelse är ofullständig mot beslutad komponentlista: BEKRÄFTAD**
   - Aktiv `RunnerAnalysis.headToHead()` innehåller finish ranking + segmenttid/pace/gap.
   - Aktiv `renderHeadToHead()` renderar samma ytor.
   - Den innehåller inte checkpointvis totalgap, placeringsrörelse, höjdprofil eller karta som en sammanhållen H2H-produkt.
   - Separat Kartduell är inte samma sak.

8. **F08 / F7/F9 – P2 Löparens “Loppets utveckling” är endast delvis uppfylld: BEKRÄFTAD SOM PARTIAL**
   - Replay innehåller mycket av underlaget: fält/kön/klassreferenser, total-/klassplacering, segmentfart relativt egen fart och seek.
   - Det saknas den beslutade sammanhållna checkpoint-för-checkpoint-vyn där dessa dimensioner läses tillsammans.
   - Detta är främst en produkt-/presentationsefterlevnad, inte ett matematikfel.

9. **F10 / I5 – P2 metodhjälp är ojämn: BEKRÄFTAD**
   - Många hjälptexter är bra, men flera centrala ytor har kort generisk hjälp och saknar kohort, CourseVersion-gräns eller full metod.
   - Klubbhistorikens nuvarande hjälp beskriver inte att prestationslinjen måste brytas vid CourseVersion.

10. **F11 / J9 – P2 full Playwright / likvärdig E2E är inte uppfyllt: BEKRÄFTAD**
    - Ultravasan har en egen CDP-baserad Chromium-smoke.
    - Den är värdefull men missade både XSS och Back/Forward-felet.
    - Ursprungskravet “full Playwright” är därför inte bevisat likvärdigt.
    - Viktigare än bibliotekets namn är att de saknade adversariella browserfallen automatiseras.

### Metodbeslut, inte ett verifierat kodfel

11. **F09 / G6 – fyrkomponents Svårighetsindex: BESLUT KRÄVS**
    - Formeln är implementerad korrekt och tydligt relativt valt lopp/CourseVersion.
    - Problemet är metodologiskt: lika vikter är normativa, pacing loss och IQR kan samvariera, och DNF påverkas av observationstäckning.
    - Rekommendation inför freeze: behåll de fyra rådimensionerna oavsett. Antingen:
      1. ta bort totalscore/rank och följ Gotaledens mer försvarbara multidimensionella modell, eller
      2. behåll indexet endast efter en dokumenterad känslighets-/korrelationsanalys och mycket tydlig copy.
    - För högsta metoddisciplin rekommenderas alternativ 1 om inget starkt produktbehov finns för en totalsiffra.

### Hardening som ska genomföras före slutlig freeze men inte är bevisade nuvarande dataproblem

12. **F12 – automatisk import: PARTIAL**
    - Befintlig fail-closed-logik är stark men bör få fixture-baserade negativa end-to-end-fall för ofullständig pagination, historikmutation och identitetskollision.

13. **F13 – sent rå-DNF/DNS-fall: PARTIAL**
    - Nuvarande canonical data innehåller inget verkligt sent Mora-fall motsvarande Gotaleden.
    - `renderFieldFlow()` använder högsta split-sequence och är därför inte tillräckligt status-/evidensmedveten för ett sådant framtida fall.
    - Lägg syntetiskt negativtest och gör flödet beroende av sista analytiskt säkra passage om testet reproducerar avvikelse.

### P3 som ska rättas i samma kvalitetsrunda om ytan ändå ändras

- DNS-Journey-copy: “Loppet börjar här” bör bli “Ingen start registrerad”.
- “Difficulty” i svensk UI-copy bör bli “Svårighetsindex” eller motsvarande.
- Windows-determinism i route-export.
- Dubblerad/skuggad H2H-kod i `app.js` bör tas bort efter att aktiv implementation är täckt av test.

## Korrigeringsordning

### R1 – säkerhet och regressionsgrind
1. F01 XSS.
2. Browserbaserade injektionsmutationer för status, namn, klubb, klass, checkpoint och configcopy.
3. Lägg adversariella browserfallen i permanent E2E.

### R2 – CourseVersion-säker historik
4. F02 klubbmedian-paths delas per whole-course comparison key.
5. F03 “Mest förbättrad” beräknas per jämförbar serie.
6. UV90 och UV45 regressionstest över verklig/syntetisk versiongräns.
7. Uppdatera metodhjälp.

### R3 – beslutade saknade analysfunktioner
8. F04 Q10/Q90 i Course Intelligence modell/UI/hjälp/test.
9. F05 finish progression 10/25/50/75/90 % i mål på aktiv FINISHED-kohort.
10. Oberoende golden values för UV90 och UV45.

### R4 – URL/state
11. Definiera pushState vs replaceState.
12. `popstate` återställer race/year/sex/class/club/status utan history-loop.
13. Direktlänk/reload/Back/Forward/invalid-param E2E.

### R5 – Löparanalys och H2H
14. Fullfölj den beslutade checkpointbaserade “Loppets utveckling”.
15. H2H kompletteras med checkpointgap, placeringsresa, höjd och karta, CourseVersion-säkert.
16. Ta bort död/skuggad äldre H2H-implementation när paritet är testad.

### R6 – metodik och hjälp
17. Besluta Svårighetsindex. Rekommenderat: separata dimensioner utan sammanvägd rank om inget tydligt behov motiverar score.
18. Full metodhjälp-coverage-matris och browserassertions.
19. Svensk terminologi.

### R7 – hardening och final QA
20. Automatisk import negativ fixturekedja.
21. Sent rå-DNF/DNS-fixture.
22. Riktig Playwright-suite eller uttryckligt dokumenterad E2E-standard med minst samma adversariella täckning.
23. Windows/Linux determinism.
24. Full Python/JS/browser/E2E.
25. Ny oberoende matematisk audit.
26. Merge #35→#36→#37→#38 först efter alla blockerare är gröna och retargetade.
27. Slutlig full kontroll på faktisk `main`.

## Freezebeslut

**FREEZE: NO.**

Nästa arbete ska ske på en ny korrigeringsbranch från exakt `7811973b...`, inte på auditbranchen.
