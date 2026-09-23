# Ultravasan Analys 2.0 – Master Acceptance Audit

## Syfte

Detta dokument är **inte** en ny U-etapp och får inte användas som bevis för att releasekandidaten är godkänd.

Det är en oberoende acceptansmatris som rekonstruerar slutmålet från den ursprungliga
Ultravasan 2.0-masterinstruktionen, äldre Ultravasan-krav, U0–U9-rapporterna,
faktisk kod på releasekandidaten och den frysta Gotaleden-referensen.

Releasekandidat som ska granskas:

- repo: `Stayinhealthyrunning/ultravasan-analys`
- commit: `7811973bcaebfb7834fe2014c7bfb9df52ebc843`
- branch vid auditstart: `feature/u9-release-freeze`

Fryst referensprodukt:

- repo: `Stayinhealthyrunning/gotaleden-splits`
- main vid auditstart: `7ee0b1c4af306796754c2a1c1e9989e247ee383b`

Gotaleden får inte ändras för att passa Ultravasan.

## Källhierarki

Vid konflikt ska revisionen använda följande ordning:

1. Den ursprungliga Ultravasan Analys 2.0-masterinstruktionen från 2026-09-22.
2. Explicit beslutade krav i senare Ultravasan-chattar.
3. Faktisk kod och data på releasekandidaten.
4. U0–U9-rapporter som implementeringsdokumentation.
5. Gotaleden som teknisk/metodologisk referens, inte som krav på identisk produkt.

En U-rapport får alltså inte ensam ge PASS. PASS kräver faktisk implementation och helst
test/browserbevis.

## Statusnivåer

- **PASS-EVIDENCE** – starkt direkt bevis finns i kod + test/CI/browser.
- **VERIFY-INDEPENDENTLY** – implementation verkar finnas men oberoende kontroll saknas.
- **FAIL-CONFIRMED** – faktisk kod strider mot uttryckligt krav eller saknar beslutad funktion.
- **REVIEW-GAP** – ursprungligt red-team-/acceptanskrav saknar motsvarande slutbevis.
- **DECISION-REQUIRED** – Ultravasan avviker medvetet eller sannolikt medvetet från Gotaleden/originalmål och behöver explicit produktbeslut.

---

# A. Produktmål och databevarande

| ID | Krav | Preliminär status | Bevis / auditnotering |
|---|---|---|---|
| A1 | Ultravasan ska bli starkare än Gotaleden genom att kombinera rik historik med Gotaledens metoddisciplin, inte kopieras rakt av. | VERIFY-INDEPENDENTLY | U1–U9 följer arkitekturspåret; slutlig sida-mot-sida-produktgranskning återstår. |
| A2 | UV90 och UV45 ska finnas kvar som två RaceFamilies. | PASS-EVIDENCE | U0 baseline, race contracts, browserbyte UV90/UV45. |
| A3 | 22 RaceEditions, 24 422 resultat och 139 910 passager ska skyddas genom 2.0-arbetet. | PASS-EVIDENCE | U0/U2-baselines + U9 hash/freeze-audit. |
| A4 | Befintliga Mika/Vasaloppet/VasaNerd-importer ska bevaras. | PASS-EVIDENCE | Importverktyg och riktade Python-tester finns kvar. |
| A5 | Automatiserad 2026-import får inte kunna korrumpera äldre data eller publicera halvfärdig data utan guardrails. | VERIFY-INDEPENDENTLY | `test_automatic_2026_import.py`, workflow och rapport finns; Codex ska kontrollera fail-closed-vägen och historikskyddet. |
| A6 | Vid tveksamhet: hellre saknat än fabricerat. | PASS-EVIDENCE | U1/U2/U5/U6-kontrakt och tester för saknade passager/identitet/CourseVersion. |

# B. Race-, source- och CourseVersion-kontrakt

| ID | Krav | Preliminär status | Bevis / auditnotering |
|---|---|---|---|
| B1 | Event → RaceFamily → RaceEdition → CourseVersion ska vara explicit. | PASS-EVIDENCE | `race-contracts.js`, U1-rapporter, Python/JS-kontraktstest. |
| B2 | Provider-neutral SourceBinding ska vara explicit och inte härledas från namn/distans/år. | PASS-EVIDENCE | U1 source spec + source-binding tests. |
| B3 | Race family får inte härledas från race key/distans. | PASS-EVIDENCE | U1 kontrakt och tester. |
| B4 | CourseVersion får inte härledas från år/ortnamn. | PASS-EVIDENCE | Explicit katalog + Replay använder RaceContracts. |
| B5 | Competition/entity/capabilities ska vara explicita och team/person får inte blandas. | VERIFY-INDEPENDENTLY | Kontrakt finns; Codex ska kontrollera samtliga UI-grenar för kvarvarande heuristik. |
| B6 | CourseVersion ska vara immutable och fingerprint-skyddad. | PASS-EVIDENCE | U1 tester och freeze. |
| B7 | Participation-, whole-course performance- och segmentjämförbarhet ska vara separata beslut. | PASS-EVIDENCE | HistoryEngine/RaceContracts och riktade tester. |
| B8 | Cross-version performance får endast ske med explicit comparability. | PASS-EVIDENCE med ett känt undantag i klubbhistoriken | Person-, klass-, HOF- och fingerprint-vyer är låsta; se H5/H6 för klubbhistorik. |
| B9 | Leaflet ska vara lokalt vendrad. | PASS-EVIDENCE | U4 + `test_vendor_leaflet.js`. |
| B10 | MapEngine-geometri ska delas mellan Replay och kartduell. | PASS-EVIDENCE | U4 och browsergrind. |
| B11 | Legacy `map.js` får endast vara kompatibilitets-/standalone-yta och inte återinföra parallell geometri. | VERIFY-INDEPENDENTLY | U4 förbjuder duplicerad geometri men Codex ska söka efter kvarvarande parallell logik. |

# C. Identitet, historik och status

| ID | Krav | Preliminär status | Bevis / auditnotering |
|---|---|---|---|
| C1 | Result appearance och canonical person är olika objekt. | PASS-EVIDENCE | U2 modell. |
| C2 | Namn/demografi får aldrig ensamma auto-merga personer. | PASS-EVIDENCE | U2 migration och tester. |
| C3 | Legacy `athlete_id` får inte vara cross-year-genväg. | PASS-EVIDENCE | U2/U5/U7 tester. |
| C4 | External identity ska ha namespace/provider, scope, confidence/evidence. | PASS-EVIDENCE | U2 kontrakt. |
| C5 | Saknad stabil identitet ska vara edition-lokal. | PASS-EVIDENCE | U2. |
| C6 | Identity match innebär inte automatiskt performance-jämförbarhet. | PASS-EVIDENCE | U2/U7. |
| C7 | Saknade år får inte bli noll/syntetiska datapunkter. | PASS-EVIDENCE | HistoryEngine. |
| C8 | DNS räknas inte som start. | PASS-EVIDENCE | ResultStatus + tests. |
| C9 | DNF får inte få konstruerad målgång/progression. | PASS-EVIDENCE | Replay/Journey/status-test + Chromium DNF-fall. |
| C10 | Sena råobservationer ska kunna bevaras utan att bli analytisk progression. | VERIFY-INDEPENDENTLY | Principen finns; Codex ska välja verkliga råfall och kontrollera adapter→UI. |

# D. Webbdata och prestanda

| ID | Krav | Preliminär status | Bevis / auditnotering |
|---|---|---|---|
| D1 | Ca 42 MB monolit ska brytas i katalog/family/edition/course/lazy data. | PASS-EVIDENCE | U3 modulär export. |
| D2 | Start ska inte ladda hela historiken/splits. | PASS-EVIDENCE | U3 browserprogression active→core→full. |
| D3 | Modulär data ska vara semantiskt identisk med monoliten. | PASS-EVIDENCE | U3 paritetskontroll. |
| D4 | Offline/statisk GitHub Pages-användning ska bevaras. | PASS-EVIDENCE | Lokala dataassets + vendrad Leaflet-kod. |
| D5 | First-paint/reduktionsbudget ska faila CI vid tydlig regression. | PASS-EVIDENCE | U9 release freeze + negativt 9 MB-test. |

# E. Gemensam frontendkärna

| ID | Krav | Preliminär status | Bevis / auditnotering |
|---|---|---|---|
| E1 | DataAdapter ska vara gemensamt browserdatalager. | PASS-EVIDENCE | U4. |
| E2 | RaceUI/capabilities ska styra presentation. | PASS-EVIDENCE | U4. |
| E3 | AppState ska vara gemensam men separera main/map state. | PASS-EVIDENCE | U4. |
| E4 | Charts ska samla deterministisk median/quantile/histogrammatematik. | PASS-EVIDENCE | U4. |
| E5 | Playback ska dela tidskontrakt mellan Replay och kartduell. | PASS-EVIDENCE | U4. |
| E6 | RaceMedia ska vara gemensamt media-API. | PASS-EVIDENCE | U4. |

# F. Löparanalys 2.0

| ID | Krav | Preliminär status | Bevis / auditnotering |
|---|---|---|---|
| F1 | Profil med sammanfattning. | PASS-EVIDENCE | Runner dialog + browser. |
| F2 | Journey från verkliga checkpoints utan fabricering. | PASS-EVIDENCE | RunnerAnalysis + Chromium. |
| F3 | Runner Replay. | PASS-EVIDENCE | Replay tester + Chromium. |
| F4 | Mellantider/passager med datakvalitet. | PASS-EVIDENCE | Journey + detaljtabell. |
| F5 | Lokala favoriter utan ny personidentitet. | PASS-EVIDENCE | U5.4. |
| F6 | Säker flerårshistorik ovanpå verifierad identitet. | PASS-EVIDENCE | U5/U7. |
| F7 | Loppets utveckling ska visa gap mot hela fältet, kön och klass. | VERIFY-INDEPENDENTLY | Replay har referenserna `field/class/sex`, men Codex ska verifiera det beslutade löparflödet och faktisk UI. |
| F8 | Loppets utveckling ska visa totalplacering och klassplacering. | PASS-EVIDENCE | Replay state/UI. |
| F9 | Pacingprofil och segment relativt egen hel-loppsfart. | VERIFY-INDEPENDENTLY | Replay innehåller pacing/insights; oberoende matematisk kontroll saknas. |
| F10 | Klick i utvecklingsanalysen ska kunna söka Replay till motsvarande punkt utan att starta musik/animation. | VERIFY-INDEPENDENTLY | Måste browserverifieras uttryckligen. |
| F11 | Head-to-head ska använda verkliga checkpoint-gap/segment/pacing/placering/höjd/karta. | VERIFY-INDEPENDENTLY | U5 H2H bevisar finish+segmentcomparability; full ursprunglig komponentlista behöver UI-audit. |
| F12 | Cross-year H2H får endast jämföra tillåtna CourseVersions/segment. | PASS-EVIDENCE | Node + Chromium. |
| F13 | Head-to-head avsågs som två löpare. | DECISION-REQUIRED | U5-modellen tillåter 2–5 och återanvänder kartduellurval. Bestäm om detta är önskad utvidgning eller kravglidning. |

# G. Course Intelligence och måltempo

| ID | Krav | Preliminär status | Bevis / auditnotering |
|---|---|---|---|
| G1 | Synkad karta, höjdprofil, segmentfördelning, berättelse och tabell. | PASS-EVIDENCE | U6 + Chromium synk. |
| G2 | Segmentdistans/stigning/nedför/medianfart/Q25–Q75. | PASS-EVIDENCE | `course-intelligence.js`. |
| G3 | Q10–Q90 när underlaget räcker. | **FAIL-CONFIRMED** | Ursprungskravet anger detta. `docs/assets/course-intelligence.js::fieldStatsForSegment()` publicerar `q25_pace_seconds_per_km` och `q75_pace_seconds_per_km`/IQR men inga Q10/Q90-fält; `tests/test_course_intelligence.js` verifierar dem inte. |
| G4 | Placeringsrörelse, pacing loss/fartretention och DNF-signal. | PASS-EVIDENCE | U6. |
| G5 | Course Difficulty får inte hävda teknisk stigsvårighet eller fysisk absolut skala. | PASS-EVIDENCE | U6 metodcopy säger relativt index inom valt lopp/CourseVersion. |
| G6 | Gotaleden använder flera separata svårighetsdimensioner och förbjuder syntetiskt totalscore; Ultravasan har ett fyrkomponentsindex. | **DECISION-REQUIRED** | Ultravasan U6 skapar `Difficulty=(P_climb+P_pacing+P_IQR+P_DNF)/4`. Kräver explicit metodbeslut och oberoende känslighetsanalys. |
| G7 | Difficulty ska kräva tillräckligt underlag och inte blanda olika komponentpopulationer. | PASS-EVIDENCE | U6 kräver n≥5 + alla fyra komponenter och gemensam complete-evidence population. |
| G8 | Måltempo ska använda historiskt observerad pacingprofil inom exakt CourseVersion. | PASS-EVIDENCE | U6. |
| G9 | Distansreserv får endast användas tydligt och ingen resttid får gissas vid okänd segmentdistans. | PASS-EVIDENCE | U6, inklusive 2026-fall. |
| G10 | Väder/dagsform/energi/individuell terrängstyrka får inte presenteras som modellerade faktorer. | PASS-EVIDENCE | Metodcopy. |

# H. Historik 2.0 och bevarade Ultravasan-styrkor

| ID | Krav | Preliminär status | Bevis / auditnotering |
|---|---|---|---|
| H1 | Klassutveckling genom åren ska bevaras och moderniseras. | PASS-EVIDENCE | U7. |
| H2 | Klassens fart-/sluttidstrend ska brytas vid CourseVersion-gräns. | PASS-EVIDENCE | U7 unit + browser. |
| H3 | Personhistorik ska använda verifierad identitet och separata jämförbarhetsserier. | PASS-EVIDENCE | U7. |
| H4 | Hall of Fame och Årets fingeravtryck ska moderniseras med jämförbarhetskontrakt. | PASS-EVIDENCE | U7. |
| H5 | Klubb-/orthistorik ska bevaras och moderniseras. | PARTIAL | Vyn finns i `audience-analytics.js` och `docs/index.html`, men U7-rapport/test behandlar inte dess CourseVersion-kontrakt. |
| H6 | Klubb-/orthistorikens median sluttid får inte bindas över inkompatibla CourseVersions. | **FAIL-CONFIRMED** | `docs/assets/audience-analytics.js::renderClubHistory()` bygger `years=familyRaces()` och en enda SVG-path genom alla år med `L` mellan varje giltig median. Funktionen frågar varken `HistoryEngine`/`HistoryIntelligence` eller CourseVersion/comparison key innan punkterna binds. |
| H7 | “Mest förbättrad” klubb/ort måste ha definierad cross-year-jämförbarhet. | **REVIEW-GAP / sannolik avvikelse** | `clubHistoryImprovement()` jämför första/sista årens SM-index utan att fråga HistoryIntelligence/CourseVersion. Kräver metodbeslut och fix/test om prestationsregeln ska gälla. |
| H8 | Club DNA ska bevaras. | PASS-EVIDENCE | UI finns. Metodiken ska dock Codex-granskas. |
| H9 | Historisk kartduell ska bevaras. | PASS-EVIDENCE | U4/U5 browser map cases. |
| H10 | Prestationsmedaljtider ska bevaras. | PASS-EVIDENCE | Runner Replay medal reference kvar. |
| H11 | UV90 + UV45 historik ska fungera med samma kärna. | PASS-EVIDENCE | family/race browserfall och historiktest. |

# I. U8 UX, gruppanalys och metodik

| ID | Krav | Preliminär status | Bevis / auditnotering |
|---|---|---|---|
| I1 | Primär finish progression ska visa “10 % i mål / 25 % / 50 % · median / 75 % / 90 %” i stället för P10/P25/P50/P75/P90. | **FAIL-CONFIRMED** | `docs/assets/nerdlab.js::renderPercentiles()` visar i stället nivåerna `Topp 1 %`, `Topp 5 %`, `Topp 10 %`, `Topp 25 %`, `Median`, `75-percentilen`; 90 %-nivån saknas och primärsemantiken är inte “andel i mål”. U8-rapporten använder dessutom termen Finish progression för en annan flerårsvy. Fryst Gotaleden har `GCharts.finishProgression()` med exakt de beslutade fem etiketterna och Q10/Q25/Q50/Q75/Q90. |
| I2 | Fartretention: 100 = varje series egen hel-loppsreferens. | VERIFY-INDEPENDENTLY | U8 regressionskrav finns; Codex ska kontrollera formel + kohort mot Gotaleden. |
| I3 | Centrala pacingdiagram ska visa median + Q25–Q75. | PASS-EVIDENCE | U8 test låser kvantiler; Codex ska stickprovsräkna verklig data. |
| I4 | Gruppvyer för kön, klass och klubb/ort ska vara konsekventa. | VERIFY-INDEPENDENTLY | UI finns; full sida-mot-sida UX-audit återstår. |
| I5 | Varje viktig analys ska ha (i) med syfte, metod, datakälla, kohort, tolkning och begränsningar. | REVIEW-GAP | Många hjälptexter finns, men ingen komplett coverage-matris motsvarande Gotaledens centraliserade analysis-help har verifierats. Codex ska inventera varje synlig analyskomponent. |
| I6 | Officiell observation, härledd statistik och interpolation/modell ska skiljas tydligt. | VERIFY-INDEPENDENTLY | Metodguide + Replay/U6-copy finns; behöver UI-audit. |
| I7 | Mobil, tangentbord, focus-visible, reduced motion och semantisk struktur. | PASS-EVIDENCE | U8 + U9 viewport Chromium. |
| I8 | Svensk primärterminologi ska vara konsekvent. | VERIFY-INDEPENDENTLY | U8 språkpass; Codex ska söka kvarvarande användarsynliga engelska termer. |

# J. URL, säkerhet och release-red-team

| ID | Krav | Preliminär status | Bevis / auditnotering |
|---|---|---|---|
| J1 | URL/deep links ska återställa race/year/filter. | PASS-EVIDENCE för initial restore | `restoreUrl()` läser querystring. |
| J2 | Browser back/forward/history ska fungera och testas. | **REVIEW-GAP / sannolikt FAIL** | `docs/assets/audience-analytics.js::syncUrl()` använder `history.replaceState()` och `restoreUrl()` läser endast initial querystring; ingen `popstate`-lyssnare hittades i releasekandidaten. Gotaleden E4 testade back/forward uttryckligen. Codex ska reproducera faktisk browserpåverkan innan slutlig FAIL. |
| J3 | XSS/HTML-injektion från konfig/source/data ska red-team-testas. | **REVIEW-GAP** | Ingen explicit XSS/onerror-mutationstest hittad i Ultravasan. Gotaleden E4 hittade ett verkligt P1 på detta sätt. |
| J4 | Oberoende matematiska stickprov ska göras från rå/SQLite-data och jämföras med UI/modell. | **REVIEW-GAP** | Många unit-tester finns, men U9 innehåller ingen Gotaleden-lik oberoende tabell med verkliga hand-/SQL-beräkningar. |
| J5 | DNF/DNS red-team. | PASS-EVIDENCE men ska stickprovas oberoende | ResultStatus/Journey/Replay tester och verkliga browserfall. |
| J6 | Person identity red-team. | PASS-EVIDENCE | U2 + U9. |
| J7 | CourseVersion red-team. | PASS-EVIDENCE | U1/U6/U7. |
| J8 | Kartor/historik/mobil i verklig browser. | PASS-EVIDENCE | U9 Chromium. |
| J9 | Full Playwright E2E enligt ursprunglig U9-plan. | **REVIEW-GAP / DECISION-REQUIRED** | Ultravasan saknar `playwright.config.js`/package och använder egen CDP/Chromium-smoke. Den är omfattande men är inte “full Playwright”. Bedöm om likvärdig täckning räcker eller om Playwright ska införas före freeze. |
| J10 | Console/network errors ska vara noll i verifierade flöden. | PASS-EVIDENCE | U9 Chromium. |
| J11 | Releasegrinden ska faila vid data-/prestandaregression. | PASS-EVIDENCE | U9 audit + negativt test. |

# K. Gotaleden-sida-mot-sida – explicit auditmål

Codex ska jämföra samma användaruppgift i båda produkterna, inte bara filnamn.

| Område | Gotaleden referens | Ultravasan mål |
|---|---|---|
| Race/source/course contracts | Explicit config, immutable fingerprint | Samma metoddisciplin + flerårsstöd |
| Identity/history | Scoped identity, no name merge | Samma, men mycket större historik |
| Profile/Journey | Stable complete cohort, real checkpoints | Minst samma förklarbarhet + verifierad flerårshistorik |
| Replay | Shared MapEngine/Playback, interpolation labelled | Minst samma |
| H2H | Exakt jämförbara checkpoints/segments | Samma + säker cross-year |
| Course analysis | Separate empirical dimensions, no synthetic total | Ultravasan har eget relative Difficulty-index – kräver explicit beslut |
| Goal pace | Empirical profile + explicit fallback | Samma, CourseVersion-bundet |
| Finish progression | 10/25/50/75/90 % i mål | Ska finnas; preliminärt saknad |
| Method help | Central coverage for each analytic component | Ska nå samma innehållsdjup |
| Red-team | SQL/math, XSS, back/forward, browser, edge cases | Ska nå likvärdig bevisnivå |
| E2E | Playwright 17/17 i E4 | Nu custom Chromium; likvärdighet måste bedömas |
| Historical analysis | Begränsad p.g.a. 2026-only | Ultravasan ska klart överträffa referensen |

# L. Prioriterad revisionslista före merge

## Blockerande tills utrett

1. **Klubb-/orthistorik bryter inte medianprestation vid CourseVersion-gräns.**
2. **Q10–Q90 saknas i Course Intelligence trots explicit krav.**
3. **Beslutad finish progression med 10/25/50/75/90 % i mål verkar saknas/misstolkad i U8.**
4. **XSS-red-team saknas som explicit test/bevis.**
5. **URL back/forward/popstate saknar explicit implementation/test.**
6. **Oberoende matematiska stickprov på verkliga Ultravasan-data saknas i slutrevisionen.**
7. **“Full Playwright” är inte genomfört; custom Chromium måste antingen bevisas likvärdigt eller kompletteras.**

## Kräver explicit metod-/produktbeslut

8. Ultravasans syntetiska fyrkomponents-Svårighetsindex kontra Gotaledens uttryckliga “ingen sammanslagen svårighetspoäng”.
9. Head-to-head 2–5 resultat kontra ursprungskravets två löpare.
10. Om klubbens SM-index “Mest förbättrad” får jämföras över CourseVersion trots att övriga performance-serier inte får det.

## Måste dessutom verifieras end-to-end

11. Löparprofilens hela beslutade “Loppets utveckling”-lista: fält/kön/klass-gap, placeringsresa, pacingprofil, relativ segmentfart och klick→Replay.
12. Komplett metodhjälpstäckning för alla viktiga analyskomponenter.
13. Kvarvarande implicit race/course-routing eller event-specifik legacylogik i generiska moduler.
14. XSS-säkerhet för alla `innerHTML`-vägar med data/config/source-strängar.
15. Deep links, delning, reload och browser back/forward i UV90 och UV45.
16. Verkliga DNF/DNS/partial-split-exempel genom hela data→adapter→UI-kedjan.
17. Matematisk kontroll av medianer, quantiler, pacing, måltempo, fingerprint, Hall of Fame och Difficulty mot oberoende beräkning.

# M. Acceptanskriterium för slutlig freeze

Ultravasan Analys 2.0 får först kallas slutligt fryst när:

1. varje rad i denna matris har slutstatus,
2. alla FAIL-CONFIRMED är korrigerade eller uttryckligen omklassade genom dokumenterat produktbeslut,
3. alla REVIEW-GAP har oberoende bevis,
4. Codex har gjort en separat audit utan att ändra kod,
5. ChatGPT har cross-checkat Codex PASS/PARTIAL/FAIL mot faktisk kod,
6. Gotaleden-sida-mot-sida-granskningen inte visar oavsiktliga regressioner,
7. PR #35 → #36 → #37 → #38 har mergeats i ordning,
8. hela finala CI/E2E körs på faktisk `main`,
9. final release-audit på `main` är grön,
10. en slutrapport listar accepterade begränsningar och eventuella icke-blockerande P3/P4.

**Nuvarande preliminära rekommendation: INTE REDO FÖR MERGE.**

Skälet är inte att U1–U9 saknar kvalitet; stora delar har stark automatiserad evidens.
Skälet är att masterrevisionen redan har hittat konkreta kravavvikelser som de befintliga
gröna testerna inte fångar.
