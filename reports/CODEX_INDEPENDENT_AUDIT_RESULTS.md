# Oberoende slutrevision – Ultravasan Analys 2.0

## 1. Executive verdict

**NOT READY FOR MERGE.** Den frysta datan, huvudkontrakten och de flesta befintliga testerna håller, men ett exekverbart DOM-injektionsspår (P1), flera konkreta CourseVersion-/produktavvikelser (P2) och otillräcklig E2E-täckning blockerar freeze. Detta är en adversariell revision, inte en rättnings- eller produktändrings-PR. Inga fynd har åtgärdats här.

## 2. Revisioner och avgränsning

- Ultravasan: `Stayinhealthyrunning/ultravasan-analys`, branch `audit/ultravasan-2-master-acceptance`, auditunderlagets HEAD före rapportcommit `410d9467dc5e0dcbcfb8c804c9ad494b5d6de3c5`.
- **Exakt auditerad releasekandidat:** `7811973bcaebfb7834fe2014c7bfb9df52ebc843`. Den är auditbranchens merge-base; diffen till `410d946` består endast av tre auditdokument. Ingen produktkod eller data skiljer sig.
- Fryst Gotaleden-referens: `Stayinhealthyrunning/gotaleden-splits` på `7ee0b1c4af306796754c2a1c1e9989e247ee383b`, kontrollerad i separat, ignorerad detached checkout utan ändringar.
- Primärkälla för format och beslut: `reports/CODEX_INDEPENDENT_AUDIT_PROMPT.md`; krav-ID från `reports/ULTRAVASAN_2_MASTER_ACCEPTANCE_AUDIT.md`. U0–U9-rapporter och Gotaledens `reports/gotaleden-final-red-team-e4.md` lästes som bakgrund, aldrig som facit.
- Revisionen kördes på Windows, Python 3.12.14, Node 24.19.0 och Chrome/Chromium 153.0.8010.53. Tester/browser kördes i ignorerad separat RC-kopia. Kanonisk auditbranch/SQLite ändrades inte. Temporära artefakter: `tmp/audit-rc`, `tmp/audit-gotaleden-reference`, `tmp/audit-python-deps`, `tmp/audit-u3-*`, `tmp/audit-u9-report.json`, `tmp/audit-browser.mjs`, `tmp/audit-links.mjs`, `tmp/audit-math.py` och Chrome-profil.

## 3. Kommandon, test och browser

| Kontroll | Faktiskt resultat |
| --- | --- |
| `git fetch origin`; checkout auditbranch; `git diff --name-status 7811973..410d946` | RC exakt; endast tre senare auditdokument. |
| `python tools/u2_baseline.py --check` i RC-kopia | PASS: 22 lopp, 24 422 resultat, 139 910 splits, 9 571 verifierade personnycklar. |
| `python tools/race_contracts.py --check --base-ref 7811973^` | PASS: 22 explicita RaceEditions, 5 låsta CourseVersions. |
| `python tools/u3_modularize.py --source docs/data/ultravasan.json --output-dir … --write --check --report …` | PASS: semantisk paritet, UV90 15 521/108 640 och UV45 8 901/31 270 resultat/splits; aktiv UV90-first-paint 1 087 000 B, inklusive katalog 1 339 829 B. |
| `python tools/u9_release_audit.py --modular-report … --json-output …` | PASS efter att testkopians SQLite återställts till RC-hash. Skyddade SHA-256, integritet, FK, dubbletter, U3-budgetar och CI-wiring godkända. |
| `python tools/uvtool.py validate`; `python tools/validate_uv45_history.py` | PASS: 0 respektive 0 blockerande problem. |
| `python -m pytest -q tests` i ren RC-kopia | 122 PASS, 4 SKIP, 29 subtests, **1 FAIL**: `tests/test_build_routes.py:101` jämför byte från `Path.write_text()` med LF-committad routefil; Windows-genererad CRLF skiljer sig. Det är en plattformsportabilitetsbrist, inte påvisad datamismatch i Linux-CI. Det första försöket på auditbranchens arbetskopia ändrade SQLite-headern; just denna testorsakade mutation återställdes omedelbart från RC och branchens hash/status kontrollerades ren. Därefter kördes muterande tester bara i kopian. |
| Alla `tests/test_*.js` (26 filer) i ren RC-kopia; `node --check` för 23 publika JS-assets | **26/26 PASS**, syntax 23/23 PASS. En första JS-körning i Windows-checkout med `core.autocrlf=true` gav ett Leaflet-SRI-bytefel; ren clone med `core.autocrlf=false` gav 26/26 PASS. |
| `node tools/verify_local_browser.mjs` med U3-filer genererade i RC-kopian | **Alla 24 browsergrind-kontroller PASS**, inklusive aktiv→core→full för UV90/UV45, löpare, DNF, partiell serie, UV45 2016, Replay, favoriter, H2H, karta och 390×844/900×900/1536×1024. 0 baseline-konsolfel och 0 HTTP-fel. Utan genererade U3-filer går webbappen via legacy-fallback; auditens första försök på oförberedd kopia var därför inte giltig modulär verifiering och räknas inte som PASS. |
| Oberoende `tmp/audit-math.py` med SQLite-URI `mode=ro&immutable=1` och låst route-JSON | Verkliga kvantiler, segmentfart, pacing loss, placeringsrörelse, planvikt, Year Fingerprint, HoF och svårighetskomponent kontrollerade; tabell nedan. |
| Egna CDP-mutationer i `tmp/audit-browser.mjs`/`tmp/audit-links.mjs` | Back/Forward-stateavvikelse, status-attributinjektion, klubbversionslinje och 9 generiska metodhjälper reproducerade. UV90/UV45 direktlänk, reload, giltiga filter och ogiltiga parametrar provade. |
| `git diff --check`; SHA-256 för skyddad databas | PASS; `data/ultravasan.sqlite` fortfarande `837823aa7ba736a067d84a86de73d73ac421c43af150fbb0d68d7730db1f9c85`. U9 verifierar även JSON/JS/manifest mot U2-baseline. |

Begränsning: Gotaledens frysta E4-resultat (277/277 Python och 17/17 Playwright) lästes och källgranskades, men dess fulla browser-suite kördes inte om. Alla Ultravasan-browserpåståenden nedan kommer från RC-kopian, inte från Gotaledens rapport.

## 4. Oberoende acceptansmatris

`NA` används inte: varje krav är relevant. Severity anges för varje icke-PASS; fynd-ID nedan ger detaljer. PASS betyder endast att **det angivna kontraktet** fick positiv kod-, data- och/eller browserverifikation, inte att hela produkten är godkänd.

| ID | Status | Severity / egen evidens |
| --- | --- | --- |
| A1 | PARTIAL | P2 – F02–F11: metoddisciplin/utlovade ytor ännu inte komplett. |
| A2 | PASS | `race_contracts.py`, U9 och browserbyte visar två separata familjer. |
| A3 | PASS | U2/U9 SHA, SQL-integritet och U3-radparitet: 22/24 422/139 910. |
| A4 | PASS | Befintliga Mika/VasaNerd-importmoduler och riktade Python-tester ingår i 122 PASS; källrader/fingeravtryck oförändrade. |
| A5 | PARTIAL | P2 – F12: fail-closed test finns, men framtida live-workflow/atomisk publiceringsväg falsifierades inte oberoende här. |
| A6 | PARTIAL | P2 – F13: DNF-fältflöde härleder tidigare kontroll från senare observation; verkligt sent råfall saknades för full negativ bevisning. |
| B1 | PASS | 22 explicita editions och 5 låsta banversioner i kontraktstest. |
| B2 | PASS | `race-contracts.js`/`race_contracts.py` använder SourceBinding; importer fortsätter tillgängliga. |
| B3 | PASS | Runtime `RaceContracts.familyForRace`; race-key-prefix i `tools/u2_identity_audit.py:240,257` är historisk read-only diagnos, inte frontendkontrakt. |
| B4 | PASS | Browserns UV90 2025-fingeravtryck använder 2023–24, inte SQL-taggen `post2023` på 2026; explicit katalog avgör. |
| B5 | PASS | RaceContracts capabilities/entity och tester; ingen frontend-gren som auto-mergar team/person återfunnen. |
| B6 | PASS | Fingerprint/immutability-kontroll i `race_contracts.py` PASS. |
| B7 | PASS | `HistoryEngine` skiljer deltagande/helbana/segment i kod och tester. |
| B8 | FAIL | P2 – F02/F03: klubb/ort-prestation korsar faktisk banversionsgräns. |
| B9 | PASS | Vendrad Leaflet 1.9.4 och SRI-test PASS i bytekorrekt clone. |
| B10 | PASS | MapEngine används i både Replay och kartduell; riktade JS-tester/browser PASS. |
| B11 | PASS | `map.js` är kart-UI/bootstrap; geometri delegeras till MapEngine. |
| C1 | PASS | Separata `results` och `athletes`/personnycklar; U2 baseline PASS. |
| C2 | PASS | 15 resultat med exakt namnet `Larsson, Daniel` har 9 olika verifierade personnycklar; ingen namnsammanslagning. |
| C3 | PASS | HistoryEngine-test och identitetsmodell ignorerar legacy athlete-ID för flerårslänk. |
| C4 | PASS | U2 extern evidens/scope testad, databasens frikopplade evidens = 0. |
| C5 | PASS | Osäker identitet visas edition-lokalt, bl.a. UV45 2016-browserfall. |
| C6 | PASS | Personhistoria och performance-serier skiljer sig; browser UV90 2025 jämför bara 2023/24. |
| C7 | PASS | Missing-year-negativfall i HistoryEngine; ingen syntetisk nollpunkt påvisad. |
| C8 | PARTIAL | P3 – F14: DNS räknas inte som start i statistik, men Journey visar ändå “Start – Loppet börjar här”. |
| C9 | PASS | UV90 2016 DNF i browser har ingen målpassage; DNS 2025 id 1259 har 0 splits och Replay-max 0. |
| C10 | PARTIAL | P2 – F13: rå-/analysgränsen för sen observation kan inte bevisas i alla fältflöden. |
| D1 | PASS | U3-generering visar familj/core/splits/22 editions mot 42 688 494 B monolit. |
| D2 | PASS | Verklig browser visar active→core→full och 0 splits före full fas. |
| D3 | PASS | U3 `--check` gav exakt semantisk paritet, inklusive 24 422/139 910. |
| D4 | PASS | Lokala dataassets, JS fallback för `file://`, Leaflet lokalt; offline-kontraktstest PASS. |
| D5 | PASS | U9 budgeter och negativt 9 MB-test i Python-sviten. |
| E1 | PASS | `data-adapter.js` och JS-tester; full browserdata hydreras. |
| E2 | PASS | `race-ui.js` bygger presentation på RaceContracts. |
| E3 | PASS | `app-state.js` skapar åtskilda main/map-instanser; URL-historikfelet är separat J2. |
| E4 | PASS | `charts.js`-quantile jämförd mot oberoende verklig UV90/UV45-matematik. |
| E5 | PASS | Gemensamt `playback.js` används av Replay/kartduell och JS-test. |
| E6 | PASS | `race-media.js` delas; browser utan media-/nätverksfel i verifierade flöden. |
| F1 | PASS | Individuell profil visas för Andreas 2016 och UV45 2016 i Chromium. |
| F2 | PASS | DNF och partiell UV90 2016 Journey, UV45 2016 i browser; saknade passager markeras. |
| F3 | PASS | Replay fungerar med klick/seek och browserprogress. |
| F4 | PASS | Andreas: 8 exakta 2016-passager; partiellt fall lämnar osäker passagetid tom. |
| F5 | PASS | Browser spara→öppna→ta bort favorit, lagring lokal/resultatbunden. |
| F6 | PASS | Verifierad personhistoria/banversionsserier i U7-browser och SQL-negativfall. |
| F7 | PARTIAL | P2 – F08: Replay har fält/kön/klass-gap vid scrubbern, men beslutade sammanhängande “Loppets utveckling” per kontroll är inte fullt exponerad. |
| F8 | PASS | Total-/klassplacering visas i löpardialog/Replay; exakthet markeras vid checkpoint. |
| F9 | PARTIAL | P2 – F08: segmenttempo och färg relativt egen helfart finns, men ingen full per-kontroll pacingprofil/gaptabell enligt masterbeslutet. |
| F10 | PASS | Chromium: klick på insight flyttade scrubber 0→84,805 km; knappen var “Spela loppet”, ljud pausat. |
| F11 | PARTIAL | P2 – F07: faktisk H2H visar sluttid/segmenttid/tempo/gap, men inte placeringsrörelse, höjd eller karta i samma komponent. |
| F12 | PASS | Browser 2015↔2017 tillåts, 2015↔2024 blockerar sluttidsgap; segmentkontrakt i modellen. |
| F13 | PASS | U5 dokumenterar medvetet 2–5 som utvidgning; browser visar 2, maxgränsen 5 är säker i urvalet. |
| G1 | PASS | Browser synkar segment mellan tabell, karta, höjd, fart och Delsträckelabbet. |
| G2 | PASS | Distans, stigning/nedför, median/Q25/Q75 finns; UV90/UV45-segment stickprovsräknade. |
| G3 | FAIL | P2 – F04: Q10/Q90 saknas i modell, UI, hjälp och test. |
| G4 | PASS | DNF-signal, pacing loss/retention och placering finns i modell; en verklig placeringsrörelse räknad separat. |
| G5 | PASS | Synlig metodtext begränsar Difficulty till relativt valt lopp/CourseVersion. |
| G6 | PARTIAL | P2 – F09: syntetisk fyrkomponentspoäng korrekt kodad men saknar beslutad känslighets-/korrelationsmotivering jämfört med fryst metodreferens. |
| G7 | PASS | n≥5 och fyra komponenter från gemensam complete-evidence-population krävs i `applyDifficultyIndex()`. |
| G8 | PASS | 2025-planens 3 899 första segmentobservationer och CourseVersion-år 2023–25 räknade oberoende. |
| G9 | PASS | Okända segment lämnas oallokerade i kod/test; 2025 med fullt underlag summerar till måltid (0,2 s radavrundning). |
| G10 | PASS | Måltempo-hjälp säger uttryckligen att väder, dagsform, energi och terrängstyrka inte modelleras. |
| H1 | PASS | Klasshistorik/-utveckling finns och browser renderar. |
| H2 | PASS | `comparableHistoryRuns()` delar klasslinjer; browser två banversionsbrott i klassvyn. |
| H3 | PASS | Verifierad identitet och separata performance-serier i History Intelligence. |
| H4 | PASS | HoF-exempel och UV90 2025-fingeravtryck verifierade mot SQL. |
| H5 | PARTIAL | P2 – F02/F03: klubb-/orthistorik finns men prestationskontraktet brister. |
| H6 | FAIL | P2 – F02: en obruten STOCKHOLM-linje går 2022 pre2023→2023 post2023. |
| H7 | FAIL | P2 – F03: “Mest förbättrad” VÄSTERÅS +57 index jämför 2014 pre2023 med 2026 post2023. |
| H8 | PASS | Club DNA fem separata relativa dimensioner i `renderClubDna()` och browser. |
| H9 | PASS | Historisk kartduell och cross-year-beslut i browsergrinden. |
| H10 | PASS | Replay visar ban-/könsspecifik medaljreferens; separat från officiell split. |
| H11 | PASS | Båda familjerna/år i browser; olika checkpoints bevaras. |
| I1 | FAIL | P2 – F05: 10/25/50/75/90 % i mål saknas, nu 1/5/10/25/50/75-percentil per kön. |
| I2 | PASS | Retentionsbas 100 mot egen helfart; U8-test och formeln i `course-intelligence.js`. |
| I3 | PASS | Median/Q25–Q75 mot SQL för UV90 och UV45; giltiga FINISHED-observationer. |
| I4 | PASS | Kön/klass/klubb-urval i browser och respektive gruppvyer; scoped filter. |
| I5 | PARTIAL | P2 – F10: 47 hjälppopuper, men 9 generiska; flera materiella metoder/kontrakt saknas eller är gamla. |
| I6 | PASS | Metodguide/replay skiljer källvärde, beräkning och interpolerad position; ingen påhittad split påvisad i stickprov. |
| I7 | PASS | 390/900/1536 px, 0 positiv overflow, 1/2/4 guidekolumner; keyboard/fokus/reduced-motion i test/browser. |
| I8 | PARTIAL | P3 – F15: primärsvenska överlag, men synlig berättelse säger “Difficulty”. |
| J1 | PASS | Direkta UV90 2025/UV45 2016-länkar med filter och reload; ogiltiga parametrar fallback utan fel. |
| J2 | FAIL | P2 – F06: Back ändrar URL uv45→uv90 men appen stannar på uv45; Forward återställer inte semantiskt state. |
| J3 | FAIL | P1 – F01: syntetiskt `status`-värde gav exekverbar `onmouseover` via tabellens `innerHTML`. Namn/klubb/klass/checkpoint-markörer i samma begränsade test escaped; detta friar inte andra sinkar. |
| J4 | PASS | Oberoende SQL/Python-tabell nedan med verklig data och UI/modelljämförelse. |
| J5 | PASS | Verklig DNF, DNS och partiell serie i browser/SQL; begränsningen i C10 kvarstår. |
| J6 | PASS | Samma namn/nummer med skilda verifierade personnycklar samt U2-negativtester. |
| J7 | PASS | UV90 2025 referens bara 2023/24, 2026 skilt; klass/HoF/plan skyddade där testat. Klubbundantaget B8/H6/H7 kvarstår. |
| J8 | PASS | Karta/historik och tre viewportar i verklig Chromium. |
| J9 | FAIL | P2 – F11: CI installerar Playwright endast för browserbinär; ingen full Playwright-testsvit och väsentliga beteenden saknas i custom smoke. |
| J10 | PASS | 0 console/networkfel i befintlig browsergrind och egna normala länktester (inte liktydigt med säkerhet). |
| J11 | PASS | U9 hash-/budgetgrind och negativt 9 MB-test. |

## 5. Fynd i prioriteringsordning

**F01 – P1, J3, exekverbar DOM-injektion.** Reproduktion i Chromium: ersätt endast i minneskopian av ett UV45-resultat `status` med `FINISHED\" onmouseover=\"window.__audit_xss=2`, kör `renderTable()`, dispatcha `mouseover` på injicerat attribut; `window.__audit_xss` blir **2**. `docs/assets/app.js:235`, `renderTable()`, interpolerar `String(r.status).toLowerCase()` oescapat i `class="status …"` innan `innerHTML`; den synliga statusen escaped separat. Namn, klubb, klass och ett checkpointnamn med `<img onerror>` skapade inte noder i de testade sinkarna. Berör potentiellt UV90/UV45 samtliga år och framtida statusvärden; dagens kanoniska fil ändrades inte och inget skadligt statusvärde påvisades i den. Konsekvens: ett käll-/exportvärde kan bli scriptkörning i besökarens browser. Minsta korrigering: allowlista status-CSS-token/bygg DOM-attribut utan HTML-interpolation; behåll råstatus escaped som text. Regression: browser-mutation med citattecken/eventhandler för status och andra källsträngar, kräver 0 handler/noder/exekvering.

**F02 – P2, B8/H5/H6, klubbmedian korsar CourseVersion.** SQL på UV90/STOCKHOLM ger 2022 `pre2023`, n=31, median **42 766 s**; 2023 `post2023`, n=32, median **47 476 s**. Chromium visar båda, och `#clubHistoryChart .club-history-line` har **ett M och nio L** genom tio årsmedianer – alltså en enda sammanhängande prestationslinje genom gränsen. `docs/assets/audience-analytics.js:520–528`, `renderClubHistory()` använder `familyRaces()`/`valid` utan `historyComparisonKey` eller `comparableHistoryRuns`, till skillnad från klasshistoriken runt rad 454. Berör UV90 2014–26 och UV45 2014–26 vid respektive gräns; kanonisk data nej. Konsekvens: banbyte ser ut som löp-/klubbprestationsförändring. Minsta korrigering: dela median-path vid explicit whole-course-nyckel, behåll deltagandestaplar kontinuerliga. Regression: verkligt/syntetiskt 2022→2023 och UV45-versionbyte, två separata paths men oförändrade antal.

**F03 – P2, B8/H7, “Mest förbättrad” jämför oförenliga år.** Oberoende SQL/Python rankade UV90-finishers inom eget loppår/kön/klass och gav VÄSTERÅS median-SM-index **5,1714** (2014, n=6, pre2023) och **61,8357** (2026, n=23, post2023), differens **+56,6643**. Chromium-listan visar `VÄSTERÅS +57 index` först. `docs/assets/audience-analytics.js:475`, `clubHistoryImprovement()` tar första/sista år utan CourseVersion-nyckel; `renderClubRankings()` rad 510 publicerar delta. Berör UV90/UV45 flerårig klubb/ort, kanonisk data nej. Även om SM-index normaliseras inom år är själva fleråriga förbättringspåståendet ett prestationsmått utan beslutad jämförbarhetsregel. Minsta korrigering: beräkna/ranka separat per explicit jämförbar serie eller dokumentera och besluta en annan tillåten metod. Regression: VÄSTERÅS-fallet får inte använda 2014→2026 som ett enda förbättringstal.

**F04 – P2, G3, Course Intelligence saknar Q10–Q90.** `docs/assets/course-intelligence.js:220–253`, `fieldStatsForSegment()`, publicerar Q25/Q75/IQR men inte Q10/Q90; `docs/assets/nerdlab.js:282` renderar bara kvartilspannet. `tests/test_course_intelligence.js` saknar Q10/Q90-assertion. Verklig UV90 2025 första segment n=1 522 har Q25 **483,0**, median **580,5**, Q75 **633,0 s/km**; Q10/Q90 skulle vara beräkningsbara men visas inte. Berör båda familjer/alla år med n≥5; kanonisk data nej. Minsta korrigering: lägg Q10/Q90 i modell/UI/hjälp vid evidensgränsen; regression med oberoende ordnad kohort.

**F05 – P2, I1, beslutad finish progression saknas.** `docs/assets/nerdlab.js:322–328`, `renderPercentiles()`, visar `Topp 1 %`, 5 %, 10 %, 25 %, median och 75-percentilen, separat per kön. Varken 90 %-nivån eller den beslutade primärtexten “10/25/50/75/90 % i mål” finns. `renderGenderWorld()` visar ett annat flerårigt start/fullföljande-mått, inte samma slutttidskvantiler. Oberoende FINISHED UV90 2025 n=1 522 gav Q10/Q25/Q50/Q75/Q90 **34 064,6 / 38 603,25 / 43 712,5 / 49 119,75 / 53 651 s**; UV45 2025 n=749 **13 843,4 / 15 871 / 18 520 / 21 748 / 24 867 s**. Nuvarande mans-Q10 i browser (UV90 9:22:40, UV45 3:36:42) stämmer matematiskt med separat könskohort, men ersätter inte det beslutade aktiva gruppurvalet. Berör båda familjer; data nej. Minsta korrigering: primär femstegsprogression på aktiv FINISHED-kohort, valfria könsuppdelningar som sekundär vy. Regression: exakta kvantiler/etiketter, även filtrerad kohort.

**F06 – P2, J2, Back/Forward återställer inte state.** Direktladda `?race=uv90&year=2025`, skapa en same-document historikpost, växla till UV45: URL och UI blir `uv45&year=2026`. `history.back()` ger URL `uv90&year=2025`, men `state.raceFamily` och årsväljaren står kvar på **uv45/2026**. `docs/assets/audience-analytics.js:160–164`, `syncUrl()` använder `replaceState`; `restoreUrl()` kör vid `install()` men ingen `popstate`-lyssnare finns i frontend. Berör UV90/UV45 alla år/filter; data nej. Minsta korrigering: definiera när användarval ska `pushState` respektive `replaceState`, och återställ race/år/filter på `popstate` utan loop. Regression: direct load→ändra filter/race→Back→Forward med DOM- och URL-assertions.

**F07 – P2, F11, Direktjämförelsens komponentlista ofullständig.** Verklig browser visar 2-löpar-H2H med sluttid/gap och jämförbara segment. Faktisk aktiva `docs/assets/app.js:610–641`, andra `renderHeadToHead()`, renderar bara finish och segmentkort; `docs/assets/runner-analysis.js:141–225`, `headToHead()`, ger inga checkpointvisa totalgap, placeringsrörelser, höjd- eller kartkomponenter. Separat Kartduell täcker karta men är inte samma utlovade H2H-vy. Berör båda familjer/alla år, data nej. Minsta korrigering: komplettera H2H med säkra checkpointgap/placering/höjd/kartkoppling eller dokumenterat produktbeslut om separat komponent. Regression: 2 löpare samma respektive olika CourseVersion, alla dimensioner när evidens finns och tydliga tomlägen annars.

**F08 – P2, F7/F9, Löparanalysens beslutade utvecklingsvy endast delvis styrkt.** `docs/assets/runner-replay.js:232–246,276–304,335,364` ger fält-/kön-/klassreferenser, interaktivt gap, segmenttempo, färg/insikter och seek. I browser finns dessa under “Loppanalys”, men ingen sammanhängande per-kontroll “Loppets utveckling” med samtidig fält/kön/klass-gap, total-/klassplacering och egen helfartsavvikelse som den explicita mastertexten beskriver. Positivt: Andreas-insight seek flyttade scrubber **0→84,805 km**, utan att starta musik eller playback. Berör UV90/UV45 med splits; data nej. Minsta korrigering: antingen fullfölj den beslutade samlade utvecklingsvyn, eller dokumentera explicit att Replay-interaktionen ersätter den. Regression: ett känt komplett och ett partiellt resultats fem dimensioner vid samma checkpoint.

**F09 – P2, G6, syntetiskt Svårighetsindex kräver metodbeslut.** `docs/assets/course-intelligence.js:269–324`, `applyDifficultyIndex()`, gör midrank-percentiler och oviktat snitt av stigning/km, median pacing loss/km, pace-IQR och DNF-exit; n≥5 och samma kompletta segmentmängd krävs. UV90 2025 Start→Högsta punkten: **100 + 100 + 81,3 + 6,3 över 4 = 71,9**, precis modellen; rå stigning **110,233 m / 2,800738 display-km = 39,36 m/km**, SQL-pacing loss **79,09 s/km**, IQR **149,92 s/km**, DNF **0/1 681**. Modellen/UI säger tydligt *relativt valt lopp/CourseVersion*, så detta är **inte** ett påvisat räknefel eller ett falskt absolut betyg. Metodproblemet är att två tempoberoende komponenter (pacing loss och spridning) kan samvariera/dubbelräknas, DNF-exit påverkas av rapportering/täckning, och lika vikter/percentilbindningar saknar dokumenterad känslighetsanalys. Fryst Gotaleden visar dimensionerna separat och avstår totalscore. Berör båda familjer; data nej. Minsta åtgärd före freeze: explicit produkt-/metodbeslut med korrelations- och viktkänslighet per lopp/CourseVersion, alternativt endast separata dimensioner. Regression: permutera/tie/saknad komponent och lås poängens evidenspopulation och metodcopy.

**F10 – P2, I5, metodhjälp ofullständig.** I verklig browser finns 47 (i)-popuper, men **9** använder generisk “Visar … för aktuellt urval”-mall: metodguide/filter, Sluttider, Medianfart per delsträcka, Avhopp genom loppet, Placeringsexpressen, Deltagande/fullföljande över åren, Percentiltrappan och Från start till Mora. `docs/assets/app.js:735–829`, `INFO_HELP_EXTENDED`/`installInfoTooltips()`, har korta texter men saknar för flera komponenter exakt kohort, quantile/metod, källa, CourseVersion-gräns och tolkning; `#clubHistoryChart`-hjälpen nämner inte banversionsbrott och `#classHeatmap`-hjälpen säger endast Median trots Snabbaste 10 %. Gotaleden har centraliserat, testat analysis-help. Berör båda familjer/år; data nej. Minsta korrigering: coverage-matris för alla viktiga ytor och specifik metodhjälp, särskilt saknade gränser; regression mot nyckelord/öppningsbar hjälp i browser.

**F11 – P2, J9, “full Playwright” är inte uppfyllt eller bevisat likvärdigt.** `.github/workflows/test.yml:143–183` installerar Playwright-paketet enbart för Chromium-binären och kör `node tools/verify_local_browser.mjs` via egen CDP. Den grinden är bred och fick 24/24 grönt, men har inga explicita Back/Forward- eller XSS-mutationer (båda hittade faktiska fel), inga fulla URL/invalid-param/browser-history-, sen DNS- eller detaljerade H2H-komponentassertions. Frysta Gotaleden E4 har 17/17 Playwright-testfall inklusive Back/Forward och XSS-negativtest. Bedömning: **FAIL REQUIREMENT**, inte ekvivalent coverage. Berör hela webbappen, data nej. Minsta korrigering: separat beslut om testteknik är bindande; oavsett teknik måste de saknade beteendena få automatiserade fulla browserassertions innan freeze. Regression: just F01/F06 först.

**F12 – P2, A5, automatiseringssäkerhet inte fullständigt falsifierad här.** `tools/automatic_2026_import.py`, workflow och Python-tester täcker historikskydd/idempotens/atomisk kopia, men denna read-only revision körde inte ett nytt externt end-to-end-importförsök med manipulerad officiell källa och publiceringsgrind. Detta är **UNKNOWN/PARTIAL, inte påstått fel**. Berör framtida UV90/UV45-år; kanonisk data ej ändrad. Minsta auditåtgärd: reproducerbar kopie-/fixturebaserad negativ kedja som visar att ofullständig pagination, identitetskollision och historikändring blockerar publicering. Regression: explicit fail-closed workflowtest utan nät/publicering.

**F13 – P2, A6/C10, sen råobservation kontra progression inte fullt bevisad.** Verklig Ultravasan-DNF i browser hade kort serie utan mål; SQL fann 0 DNF-Mora-splits och 0 estimated bland 5 952 DNF-splits. Det friar nuvarande fall, inte framtida sen råpassage. `docs/assets/nerdlab.js:329–345`, `renderFieldFlow()`, använder högsta sequence_no i alla splitrader och räknar därefter alla tidigare kontroller passerade; ingen separat analytisk status för “sen rå men ej progression” syns här. Gotaleden E4 hade ett verkligt sent DNS/Mål-fall som krävde särskild spärr. Berör båda familjer/framtida rådata; nuvarande kanoniska data nej. Minsta korrigering om negativtest bekräftar avvikelse: basera flow på status-/evidensklassad sista säkra passage; bevara råspliten. Regression: syntetisk DNS/DNF med sen Mål-råobservation, ingen analytisk målgång eller mellanliggande progression.

**F14 – P3, C8, DNS-Journey-copy är semantiskt missvisande.** UV90 2025 DNS result-id **1259** har 0 split, ingen måltid, Replay-max 0 och räknas inte som starter; ändå visas `Start` och “Loppet börjar här” i Journey. `docs/assets/runner-analysis.js:61`, `journeyForResult()` skapar startnoden; `docs/assets/app.js:299`, Journey-renderingen väljer texten. Berör DNS i båda familjer, data nej. Minsta korrigering: statusanpassad text “Ingen start registrerad” utan att ta bort banans nollpunkt. Regression: verklig/syntetisk DNS i dialog och starter-KPI.

**F15 – P3, I8, kvarvarande synlig engelsk metodterm.** `docs/assets/nerdlab.js:145` ger segmentberättelsen texten `relativ Difficulty …/100` trots svenska tabellrubriken Svårighetsindex. Berör båda familjer, data nej. Minsta korrigering: konsekvent svensk UI-term utan ändrad formel; textregression.

**F16 – P3, testportabilitet och dubblerad H2H-kod.** `tools/build_routes.py:727–728` använder plattformsnormaliserande `Path.write_text`, medan `tests/test_build_routes.py:101` kräver byteidentitet med LF-committad JSON/JS; reproducerat 1 FAIL på Windows, Linux-CI sannolikt grön. `docs/assets/app.js:524/567` och `:610/643` definierar `renderHeadToHead`/`openHeadToHead` två gånger; den senare definitionen skuggar den förra, vilket gör första implementationen död och minskar granskningsbarheten. Berör test/review på Windows samt H2H-underhåll, kanonisk data nej. Minsta korrigering i separat uppdrag: explicit `newline='\n'`/binärt deterministisk export, och ta bort bevisat död H2H-definition utan att ändra aktivt flöde. Regression: byteidentiskt byggtest på Windows/Linux och browser-H2H.

## 6. Oberoende matematiska stickprov

Referensberäkningarna använder enbart `sqlite3` i immutable read-only-läge, `statistics.median`, egen linjär quantile (`pos=(n−1)q`) och låst route-JSON. Ingen produkthelper används för referensvärdet. SQL-kohort är uttryckligen `status='FINISHED'`, positiv sluttid; segment kräver positiva exakta (`is_estimated=0`) observationer. Modell/UI lästes därefter separat i Chromium.

| Mått / kohort | Råvärden och oberoende formel | Releasekandidat / utfall |
| --- | --- | --- |
| UV90 2025 finish, n=1 522 | Sorterade tider, Q10/25/50/75/90 = **34 064,6 / 38 603,25 / 43 712,5 / 49 119,75 / 53 651 s**. | Fingerprint-current Q50 **43 712,5** stämmer; full primär femstegs-UI saknas (F05). |
| UV45 2025 finish, n=749 | Q10/25/50/75/90 = **13 843,4 / 15 871 / 18 520 / 21 748 / 24 867 s**. | Fingerprint-current Q50 **18 520** stämmer; Q90 saknas i primärvyn. |
| Könskvantiler UV90/UV45 2025 | Män UV90 n=1 080 Q10 **33 760,4**, Q50 **42 651,5**; kvinnor n=442 Q10 **35 323,1**. UV45 män n=368 Q10 **13 002,1**; kvinnor n=381 Q10 **14 823**. | Browser `Topp 10 %` 9:22:40/9:48:43 och 3:36:42/4:07:03, korrekt avrundat för separat kön; inte beslutad primär progression. |
| UV90 2025 Start→Högsta punkten, n=1 522 | Distans 3,3 km. Median(`elapsed/3,3`) **580,4545 s/km**, Q25 **483,0303**, Q75 **632,9545**; median(`elapsed/3,3−finish/90`) **79,0888 s/km**. Exempel result 1376: 866/3,3 = **262,4242 s/km**. | CI **580,5 / 483,0 / 633,0 / 79,1**, exakt avrundning. |
| UV45 2025 Start→Lillsjön, n=749 | Distans 2,25 km. Medianfart **399,1111**, Q25 **332,4444**, Q75 **444,4444**, median pacing loss **−26,9111 s/km**. | CI **399,1 / 332,4 / 444,4 / −26,9**. |
| Placeringsrörelse UV90 2025, result 3058 | Exakta `place_overall` Högsta punkten **962**, Smågan **609**: `962−609=+353` platser. | RunnerAnalysis Journey visar 962/609 och segment **2 982 s** vid Smågan. |
| Måltempo UV90 2025, mål 36 000 s | 2023–25 samma explicita CourseVersion, n=3 899 för första segmentet. Median(`segment/finish`) **0,0415830442**; summa nio segmentmedianer **0,9951604607**; normaliserat **0,0417852656**; `36 000×andel=1 504,27 s`. | Plan: 2023/24/25, n=3 899, rå **0,041583**, norm **0,041785**, **1 504,3 s**. Total 36 000,2 s p.g.a. radavrundning. |
| Årets fingeravtryck UV90 2025 | Referensårsmedian 2023 **44 930**, 2024 **44 552**; median av årsmedianer **44 741**. `43 712,5/44 741×100=97,7`. 2026 utesluten trots liknande SQL-texttagg; explicit CourseVersion skiljer. | `finish_difficulty` **97,7**, ref 2023/24, n=2; PASS. UV45 2025 har bara en jämförbar referens och visas korrekt otillgänglig. |
| HoF “Mest förbättrad” person | Verifierad personnyckel för Lukas Brunzell, UV90 2024 **37 113 s**, 2025 **35 410 s**, samma `course:uv90-2023-2025-v1`; förbättring **1 703 s**. | `HistoryIntelligence.hallOfFame` score **1 703**, samma två år/scope. |
| Difficulty-komponent UV90 2025 första segment | Routeprofilens 2,760→2,949 display-km ger vid 2,800738 km kumulativ stigning **110,233 m**, nedför **6 m**: **39,3586 m/km**. Pace-IQR **149,9242 s/km**, pacing loss **79,0888**, DNF-exit **0/1 681**. Publicerade rank-percentiler 100/100/81,3/6,3 ger `(…)/4=71,9`. | Modell: 39,4; 149,9; 79,1; 0 %, score **71,9**, rank 3/9. Komponenternas matematika stämmer; metodbeslut F09 kvarstår. |
| UV90 2016 Andreas Hermansson | Result 11545, finish **26 280 s = 7:18:00**, åtta icke-estimerade splits; Smågan **2 476 s = 0:41:16**, Mora **26 280 s**; första två segment 2 476 och `6 504−2 476=4 028 s`. | Browsergrind hittade #1025, totalplats 22, full Journey/Replay och samma måltid. |

## 7. Fryst Gotaleden sida mot sida

| Samma uppgift | Gotaleden `7ee0b1c` / E4-kodbevis | Ultravasan `7811973` / egen kontroll | Bedömning |
| --- | --- | --- | --- |
| Race/source/course | Explicit EQ Timing-binding och låst `course-v1`; fyra tävlingsenheter inkl. Duo. | 22 editioner, två familjer, fem låsta CourseVersions, explicit source; kontraktstest PASS. | Annorlunda modell motiverad av flerårsdata; ingen regressionssignal. |
| Identitet/historik | E4 blockerar namn/bib som person; rå sena DNS-passager får inte progression. | Verifierade personnycklar och negativa verkliga namn/bib-fall; banversionsserier i person/klass/HoF. Klubbundantag F02/F03. | Svagare guardrail i klubbhistorik. |
| Profil/Journey/Replay | E4 verifierar alla fyra race och DNF/DNS/partial. | UV90 2016 finisher/DNF/partial, UV45 2016 och DNS 2025 i browser; utvecklingsvy delvis F08. | Kärnreplay god; utlovad presentation delvis. |
| H2H och kartduell | E4 har checkpointgap, placering, höjd/karta i testade flöden. | Segments-/finishgap och separat karta; F07 saknar flera H2H-dimensioner i samma komponent. | Materiell komponentregression. |
| Bananalys/måltempo | Dimensioner redovisas var för sig, ingen syntetisk totalscore; 10h-plan summerar exakt. | Course Intelligence synkar och planvikter stämmer; Q10/Q90 saknas och relativt Difficulty kräver beslut. | F04/F09. |
| Finish progression | `GCharts.finishProgression()` och test låser 10/25/50/75/90 % i mål bland FINISHED. | Percentiltrappa 1/5/10/25/50/75 %, 90 % saknas. | F05 blockerar likvärdighet. |
| Metodhjälp | Central `analysis-help.js`/content och särskilda coverage-tester. | 47 popuper men 9 generiska, några missvisande; F10. | Lägre precision. |
| Filter/state/deep links | E4:s Playwright testar Back/Forward och ogiltiga URL. | Direktlänk/reload fungerar, Back lämnar UI fel; F06. | Faktisk regression. |
| Tillgänglighet/mobil | 17/17 Playwright inklusive 390 px, keyboard/fokus. | 24/24 CDP-smoke inklusive 390/900/1536 px, keyboard/fokus; ingen full Playwright-paritet. | Layout god i testade flöden, grind otillräcklig F11. |
| Red-team XSS | E4 fann/fixade källsträngsinjektion och har negativtest. | Egen Chromium-mutation exekverar status-eventhandler; F01. | P1-regression. |

## 8. Åtta obligatoriska hypoteser – direkta svar

1. **Korsar klubb-/ortmedian CourseVersion? Ja.** STOCKHOLM 2022→2023 binds i ett enda SVG-path trots `pre2023`→`post2023` (F02).
2. **Korsar klubb-/ort “Mest förbättrad” CourseVersion? Ja.** VÄSTERÅS 2014→2026, oberoende +56,664 index, UI +57 (F03).
3. **Saknas Q10–Q90 i Course Intelligence? Ja.** Modell, UI, hjälp och test saknar båda yttre kvantiler (F04).
4. **Saknas/felrubriceras 10/25/50/75/90 % finish progression? Ja.** Percentiltrappan har andra nivåer och ingen 90 %-punkt; flerårig start/fullföljande-vy är inte substitut (F05).
5. **Återställer Back/Forward app-state? Nej.** Back URL uv90/2025 medan UI förblir uv45/2026; Forward-kedjan saknar korrekt state-kontrakt (F06).
6. **Finns XSS-kapabel `innerHTML`-väg? Ja.** Oescapat `status`-class-attribut exekverade eventhandler i riktig Chromium. Test av namn/klubb/klass/checkpoint i utvalda sinkar var negativt, inte allmänt frikännande (F01).
7. **Motsvarar custom Chromium utlovad full Playwright E2E? Nej.** Den breda smoken missade två nu reproducerade browserfel och kör inte Playwright-testfall (F11).
8. **Är fyrkomponents-Difficulty metodologiskt försvarbar och tydligt scoped? Beräkning och relativ scope är tydliga, men metodbeslut saknas.** Full evidens/n≥5 och relativ copy är bra. Dubblering/samvariation, DNF-täckning och lika vikters känslighet är inte analyserade; inte redo som oemotsagd sammansatt poäng (F09).

## 9. Slutliga blockerare och minsta nästa steg

1. **P1 F01:** stoppa HTML-attributinjektionen, lägg browserbaserat källsträngs-/status-XSS-negativtest.
2. **P2 F02/F03:** gör klubb-/ortprestationslinjer och förbättringar CourseVersion-säkra, bevara deltagandeserier.
3. **P2 F04/F05:** fullfölj Q10/Q90 och beslutade 10/25/50/75/90 %-finish progression med golden tests från verkliga UV90/UV45-kohorter.
4. **P2 F06:** reparera browserhistorik för race/år/filter och testa Back/Forward i verklig browser.
5. **P2 F07/F08:** besluta/komplettera H2H-komponentlista och den sammanhållna Löparanalys-utvecklingsvyn.
6. **P2 F09/F10/F11:** dokumentera Difficulty-metodbeslut och känslighet, täck metodhjälpen, inför fullgod E2E-grind (Playwright enligt krav eller uttryckligt beslutad likvärdig ersättning med påvisad täckning).
7. **PARTIAL F12/F13:** verifiera fail-closed importkedja och sent rå-DNS/DNF-negativfall i separat kopie-/fixturetest. Dessa får inte antas gröna.

Endast denna rapport är avsedd för commit på auditbranchen. Ingen produktkod, databas, config, test, workflow, CourseVersion, identitetsdata eller Gotaleden ändrades. Inget mergeförsök gjordes.

FREEZE RECOMMENDATION: NO
