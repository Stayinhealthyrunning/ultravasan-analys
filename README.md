# Ultravasan 90 & 45 – resultat, statistik och animerad kartduell

Detta är en fristående HTML-webbplats med lokal SQLite-databas och en importmotor som
kan köras helt online i GitHub Actions. Ingen `.bat`-fil, terminal eller lokal
Python-installation behövs för normal användning.

## Två lopp i samma analysverktyg

Startsidan har en mjuk växlare mellan **Ultravasan 90** (standard) och **Ultravasan 45**. Varje lopp har egen rubrikbild, egna loppår, egna resultatfilter, egna analyser, egen GPS-rutt och egen musik i kartduellen. Familj och kartreferens slås upp explicit per loppnyckel i `docs/data/race-catalog.json`; namn, prefix, årtal och distans avgör inte valet.

Ultravasan 45 visas med GPX-spåret `data/routes/vasaloppet-ultravasan-2026-ultravasan-45.gpx`. Äldre utgåvor behåller sin historiska kontrollmodell; kartspåret är en gemensam visningsreferens. Alla importadaptrar kräver en explicit `SourceBinding`; de härleder inte längre lopp från namn, nyckelprefix, distans eller årtal.

## Öppna verktyget

1. Packa upp ZIP-filen.
2. Dubbelklicka på `OPPNA_ANALYSSIDAN.html`.
3. En kartdemo kan öppnas med `OPPNA_KARTDEMO.html`.

Webbdata ligger både som JSON och JavaScript. JavaScriptversionen gör att sidan även
fungerar från en vanlig `file://`-adress.

## Vad som ingår

- sökbar resultatdatabas och löparprofiler,
- mellantider, delsträcksfart och placeringar,
- statistikstudio med tidsfördelning, tid–placering, måltidssimulator, DNF-tratt,
  delsträckornas fartsignatur, avancemang och år-mot-år,
- animerad kartjämförelse för 1–5 löpare,
- jämförelse mellan olika loppår och två banversioner,
- SQLite-databas med källspårning,
- GitHub Actions för import, validering, export och kostnadsfri publicering.

Den medföljande resultatdatabasen innehåller 22 loppår, 24 422 resultat och
139 910 mellantider. Den exakta U0-baslinjen inför Ultravasan Analys 2.0 finns i
`reports/U0_BASELINE.json` och verifieras automatiskt i CI.

U1:s explicita event-, utgåve-, käll-, tävlings- och bankontrakt beskrivs i
[`reports/U1_EVENT_COURSE_CONTRACTS.md`](reports/U1_EVENT_COURSE_CONTRACTS.md).
Den slutförda käll- och utgåvemodellen finns i
[`reports/U1_SOURCE_EDITION_SPEC.md`](reports/U1_SOURCE_EDITION_SPEC.md).

U2:s identitets- och historikkontrakt finns i
[`reports/U2_IDENTITY_HISTORY_SPEC.md`](reports/U2_IDENTITY_HISTORY_SPEC.md).
Flerårshistorik bygger från och med U2 på verifierad person-evidens, inte på namn
eller ett äldre `athlete_id`. Tidsutveckling mellan utgåvor kräver dessutom
explicit jämförbara CourseVersion-kontrakt.

Den verifierade legacy-auditen och den reversibla migrationsplanen finns i
[`reports/U2_LEGACY_IDENTITY_MIGRATION.md`](reports/U2_LEGACY_IDENTITY_MIGRATION.md).
Före produktionsmigrering verifierar CI den historiska U0-golden mastern och
provkör hela identitetsmigrationen på en databaskopia. När migrationen senare
appliceras via det manuellt bekräftade arbetsflödet `Migrera U2-identiteter`
skapas `reports/U2_BASELINE.json`, som därefter blir aktiv golden master medan
U0-baslinjen behålls oförändrad som historiskt bevis.

U3:s modulära datalager beskrivs i
[`reports/U3_MODULAR_DATA_SPEC.md`](reports/U3_MODULAR_DATA_SPEC.md).
Webbapplikationen läser data genom ett gemensamt DataLoader-kontrakt och känner
inte till fysisk filstruktur. På vanlig webb laddas först family-shell + senaste
RaceEdition-core: UV90 behöver 1 087 000 byte, eller 1 339 829 byte inklusive
den gemensamma katalogen, jämfört med 42 688 494 byte legacydata (**96,9 %
mindre före HTTP-komprimering**). Därefter hydreras hela familjens historiska
resultat och sist splitdata i faserna active → core → full. Direkta kartlänkar
routas till exakt de fulla RaceEdition-JSON-filer som valda result-ID:n tillhör.
file:// behåller offline-stödet via family core/split-JavaScript. CI verifierar
alla tre faserna för UV90 och UV45, exakt dataparitet, kartlänkar och verkligt
Chromium-flöde. Efter produktionsaktivering regenererar framtida exporter
automatiskt shell-, core-, split- och edition-lagren och rensar gamla artifakter.

U4:s gemensamma frontendkärna beskrivs i
[`reports/U4_FRONTEND_CORE.md`](reports/U4_FRONTEND_CORE.md). DataAdapter,
RaceUI, AppState, Charts, MapEngine, Playback och RaceMedia är nu separata,
testbara kontrakt som delas av huvudanalysen, RunnerReplay och kartduellen.
Leaflet 1.9.4 är vendrad lokalt med verifierad SRI och licens, medan kartans
förenklade banvy finns kvar som fallback.

U5:s individuella Löparanalys 2.0 beskrivs i
[`reports/U5_RUNNER_ANALYSIS.md`](reports/U5_RUNNER_ANALYSIS.md).
RunnerAnalysis bygger en verifierbar Journey ovanpå officiella checkpoints och
splits, flerårshistorik kräver U2-verifierad identitet och Head-to-head respekterar
CourseVersion-kontrakten. Favoriter sparas endast lokalt som referenser till
specifika publicerade resultat och skapar ingen egen personmatchning.

U6:s Course Intelligence beskrivs i
[`reports/U6_COURSE_INTELLIGENCE.md`](reports/U6_COURSE_INTELLIGENCE.md).
Course Intelligence skiljer tävlings-/timingdistans från display-ruttens
terrängaxel, kräver samma fyra evidenskomponenter för relativ Difficulty och
synkroniserar segmentval mellan banöversikt, höjdprofil, fartvy och
Delsträckelabbet. Måltempo/loppplan använder endast samma CourseVersion, märker
distansfallback explicit och lämnar okända segment oallokerade i stället för att
gissa.

U7:s Historik 2.0 beskrivs i
[`reports/U7_HISTORY_2.md`](reports/U7_HISTORY_2.md).
History Intelligence återanvänder U2:s verifierade personidentitet och
whole-course-jämförbarhet för Löpararkiv, Hall of Fame och Årets fingeravtryck.
Klasshistorik och Klassutveckling bryter prestationslinjer och animation vid
CourseVersion-gränser i stället för att skapa en skenbar trend över olika banor.
Fingeravtryckets prestationsnormal byggs av lika viktade, jämförbara loppår.


U8:s UX-, metodik- och tillgänglighetskontrakt beskrivs i
[`reports/U8_UX_METHODOLOGY.md`](reports/U8_UX_METHODOLOGY.md).
Huvudsidan har en gemensam metod- och datakvalitetsguide med aktuell lopp-, data-
och filterstatus, semantisk H1/skip-länk, tangentbordsöppning av resultatrader,
korrekt knappsemantik i loppväxlaren, tydliga fokusmarkeringar och reduced-motion-
stöd. Primära användartexter är konsekvent svenska utan att tekniska kontrakts-
identifierare ändras.

U9:s slutgranskning och release-freeze beskrivs i
[`reports/U9_RELEASE_FREEZE.md`](reports/U9_RELEASE_FREEZE.md).
`tools/u9_release_audit.py` fryser U2:s skyddade data, kräver U1–U8:s
obligatoriska artefakter, bevakar U3:s storleksbudgetar och ingår i CI. Den
verkliga Chromium-grinden verifierar dessutom 390×844, 900×900 och 1536×1024
utan dokumentöverflöde. U9 är en releasegrind och ska inte introducera nya
analysfunktioner.

```bash
python tools/race_contracts.py
python tools/race_contracts.py --check --base-ref origin/main
```

En publicerad banversion får inte få nytt innehåll under samma ID. Skapa ett nytt
ID och lägg till dess fingeravtryck i `config/course_version_lock.json` när
geometri, kontrollmodell, ankare eller segment ändras. Gamla versioner behålls.
Katalogen ska regenereras efter ändrad utgåvetilldelning; CI stoppar inaktuella
exporter och ändrade versionslås. Befintliga resultatfiler migreras inte av detta
kommando. Webblagret läser funktionsstöd från explicita `CompetitionCapabilities`.


## Historisk engångsimport från VasaNerd

VasaNerd visar historiska Ultravasan-resultat med sluttider, kontrollpassager,
placeringar och flerårsprofiler. Projektet innehåller därför en separat adapter i:

```text
tools/vasanerd_import.py
```

Adaptern hårdkodar inte okända interna filnamn. Den öppnar den publika
Ultravasan-vyn i Chromium, registrerar webbappens JSON/XHR-anrop, sparar alla
råfiler och deras URL/hash och analyserar sedan strukturen. Den klarar både:

- ett resultatobjekt med inbäddade mellantider,
- en platt tabell med en rad per löpare och kontroll,
- breda tabeller med separata kontrollkolumner,
- JSON-data inbäddad i en JavaScript-fil.

Alla originalfält sparas dessutom i SQLite som rå JSON även om de ännu inte har
en egen normaliserad kolumn. Importen accepterar endast redan konfigurerade
utgåvor och använder deras låsta `CourseVersion`; okända år stoppas före databasändring.

Kör helt online:

```text
Actions → Importera historik från VasaNerd → Run workflow
```

Arbetsflödet kräver att du bekräftar att du har rätt att importera och
återpublicera datan samt anger källa. Detta är viktigt eftersom VasaNerd är en
sammanställd databas även om grunduppgifterna kommer från publika resultat. Be
helst webbplatsens skapare om uttryckligt tillstånd eller en dataexport innan en
full kopia publiceras.

Efter körningen finns:

- komplett SQLite-databas i `data/ultravasan.sqlite`,
- råmanifest och resurslista i körningens artifact,
- importdiagnostik i `reports/vasanerd-import-report.json`,
- färdig webbdata i `docs/data/`.

Om sajten ändrar dataschema stannar inte processen tyst. Oigenkända samlingar och
fel redovisas i diagnostikrapporten och råfilerna finns kvar för att mappningen
ska kunna justeras utan ny hämtning.

## Race Intelligence Lab

Den nya analysdelen är inspirerad av VasaNerds djupa resultatvyer och funktioner
från moderna tjänster för race replay och aktivitetsanalys. Den innehåller:

- automatiska berättelser om vinnare, fältets mitt, starkaste avancemang och
  tuffaste segment,
- delsträckelabb mellan valfria kontroller med ranking på tid, fart eller vunna
  platser,
- percentiltrappa som visar vad som krävs för topp 1, 5, 10, 25 och 50 procent,
- fältflöde som visualiserar avhopp mellan kontrollerna,
- löpararkiv med utveckling över flera år och direkt uppspelning på kartan,
- Hall of Fame för flest lopp, störst förbättring, jämnast prestation och
  starkaste avslutning,
- årsvisa fingeravtryck för svårighetsgrad, fart, DNF, representation och
  fältstorlek,
- befintlig kartduell, måltidssimulator, pacing-DNA, DNF-tratt och årsjämförelse.

## Resultatimport från Mika/Vasaloppet

Importmotorn finns i `tools/mika_import.py`. Den arbetar i två steg:

1. resultatsidorna läses med upp till 100 träffar per sida och deltagarnas `idp`
   samlas in,
2. varje deltagares detaljsida läses för kontroll, ackumulerad tid, klockslag,
   differens, min/km, km/h och placering.

Motorn:

- provar flera kompatibla URL-varianter,
- slutar dynamiskt när inga nya deltagare hittas,
- sparar rå HTML i cache,
- kan återuppta en avbruten import,
- använder vanlig HTTP först,
- kan använda Playwright/Chromium som reserv om servern svarar 403,
- skriver en detaljerad rapport i `reports/`,
- kör ett parsertest innan full import.

### Kör online i GitHub

Öppna:

```text
Actions → Uppdatera resultatdatabasen → Run workflow
```

Välj en metod:

- `probe_official` – provar tio löpare och skapar en granskningsrapport,
- `scrape_official` – hämtar hela startfältet och alla tillgängliga mellantider;
  importen delar vid behov upp listan på herrar och damer, begär 100 träffar per
  sida och provar en alternativ URL om en sida oväntat upprepas,
- `discover_events` – söker efter historiska Ultravasan-eventkoder,
- `uploaded_csv` – importerar officiella CSV-filer som lagts i `imports/RACE_KEY/`,
- `rebuild_only` – bygger om webbdata från befintlig SQLite-databas.

Börja med `probe_official`. Kontrollera rapporten i körningens nedladdningsbara
artifact. Kör därefter `scrape_official`.

Resultattjänsten kan ändra HTML, villkor eller åtkomstregler. Använd låg
anropshastighet, återanvänd cache och be helst Vasaloppet om en officiell export innan
en fullständig offentlig spegling publiceras.

## Registrera en framtida utgåva

`tools/add_race.py` registrerar endast en explicit, planerad `RaceEdition`.
Loppnyckel, familj, datum, `CourseVersion` och tävlingsprofil måste anges; verktyget
gissar inget från år eller distans. En planerad utgåva saknar källbindning och läggs
inte i databasen. Lägg därefter till en granskad `SourceBinding` och ändra
`data_status` till `available` i en separat ändring innan import aktiveras.

## Banversioner

`docs/data/ultravasan-routes.js` innehåller två lager:

- `ultravasan90-post2023` – 92 km, från den uppladdade GPS-filen
  `source/UV-90_20260610.kmz`,
- `ultravasan90-pre2023` – 90,173 km, ett lokalt referenslager för 2014–2022.

Verifierad historisk GPX finns nu både som
`source/Ultravasan90-2014-2022.gpx` och som den reproducerbara primärkällan
`data/routes/Ultravasan 90 2022.gpx`. Den äldre
`source/Ultravasan90-2014-2022-reference.gpx` bevaras endast som dokumenterad
reserv. Alla aktuella ruttkällor och deras SHA-256-hashar ingår i
`reports/U0_BASELINE.json`.

Kartvyn väljer automatiskt rätt rutt per år. Om löpare från båda perioderna jämförs
visas båda lagren, separata linjestilar och årsmärke på varje löpare. Ställningen
jämförs då som procent av respektive banversion.

## Hur kartpositionerna beräknas

Kartfunktionen är en historisk rekonstruktion, inte individuell GPS-spårning.

- Start, kontrollpassager och sluttid är fasta hållpunkter.
- Mellan hållpunkterna används jämn fart för den delsträckan.
- Saknas mellantider används en tydligt märkt sluttidsuppskattning.
- DNF-löpare stannar vid sista registrerade passage.
- Kvalitetsmärkningen visar hur många exakta mellantider som används.

## Databas

Huvuddatabasen är:

```text
data/ultravasan.sqlite
```

Webbexporten är:

```text
docs/data/ultravasan.json
docs/data/ultravasan-data.js
```

Databasen lagrar lopp, banversion, löpare, resultat, kontrollpassager, rapporterat och
beräknat tempo, km/h, placeringar, differenser, källor, importkörningar och
personmatchning mellan år.

## Kostnadsfri publicering

1. Skapa ett publikt GitHub-repository.
2. Ladda upp hela projektmappen via GitHubs webbsida.
3. Välj `Settings → Pages → Source: GitHub Actions`.
4. Kör arbetsflödet `Publicera analyssidan`.

Samma GitHub-konto kan användas för flera statiska projekt, exempelvis:

```text
DITT-NAMN.github.io/ultravasan-analys/
DITT-NAMN.github.io/bruce-lee/
DITT-NAMN.github.io/andra-verktyg/
```

`portal-template` innehåller en enkel gemensam startsida.

## Tekniska kontroller

Lokalt i projektet finns:

```text
python -m pip install -r requirements-test.txt
python tools/u0_baseline.py --check
python -m pytest -q
python tools/uvtool.py validate
```

GitHub-arbetsflödet `Tests` kör golden master, hela Python-sviten, samtliga
JavaScript-tester och syntaxkontroll på varje push och pull request.
