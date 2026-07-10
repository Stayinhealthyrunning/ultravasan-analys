# Ultravasan 90 – resultat, statistik och animerad kartduell

Detta är en fristående HTML-webbplats med lokal SQLite-databas och en importmotor som
kan köras helt online i GitHub Actions. Ingen `.bat`-fil, terminal eller lokal
Python-installation behövs för normal användning.

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

Den medföljande resultatdatabasen är en tydligt märkt förhandsdatabas med 20 officiella
topplaceringar från 2025. Full import görs online enligt nedan.


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
en egen normaliserad kolumn. Importen skapar automatiskt historiska loppår och
väljer 90-kilometersbanan före 2023 och 92-kilometersbanan från 2023.

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

## Lägg till ett nytt år

Öppna:

```text
Actions → Lägg till ett nytt loppår → Run workflow
```

Ange år, datum, eventkod, resultatsidans årssökväg och officiell distans. För år från
2023 används banversionen `post2023`; äldre lopp ska anges som `pre2023` i
`config/races.json` om de läggs in manuellt.

## Banversioner

`docs/data/ultravasan-routes.js` innehåller två lager:

- `ultravasan90-post2023` – 92 km, från den uppladdade GPS-filen
  `source/UV-90_20260610.kmz`,
- `ultravasan90-pre2023` – 90,173 km, ett lokalt referenslager för 2014–2022.

Den äldre publika 2022-rutten uppges vara skapad från arrangörens KMZ från
2022-06-16 och ha längden 90,173 km. Eftersom den ursprungliga koordinatfilen inte
kunde paketeras automatiskt har projektet en tydligt märkt
`reference-reconstruction`: den gemensamma huvuddelen följer det moderna GPS-spåret,
med den äldre kortare starten rekonstruerad. När en verifierad historisk fil hittas laddas den upp i GitHub med exakt namnet
`source/Ultravasan90-2014-2022.gpx`. Arbetsflödet **Bygg om kartans banlager**
startar då automatiskt och ersätter referensgeometrin utan någon kodändring. Den
medföljande `source/Ultravasan90-2014-2022-reference.gpx` skrivs bara som reserv.

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
python tests/test_mika_parser.py
python tools/uvtool.py validate
python tools/uvtool.py export
```

GitHub-arbetsflödet kör kontrollerna online. SQLite-integritet, JavaScript-syntax, HTML-struktur, Mika-parsern och
VasaNerd-adapterns två stödda grundformat har kontrollerats i levererat paket.
