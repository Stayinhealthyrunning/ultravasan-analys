# U2 Identity + History – kontrakt och första implementation

## Syfte

U2 skiljer strikt mellan tre saker som tidigare delvis blandades ihop:

1. **resultatframträdande** – en start/resultatrad i en viss utgåva,
2. **personidentitet** – verifierad koppling av samma person mellan utgåvor,
3. **prestationsjämförbarhet** – om två tider eller segment faktiskt får jämföras.

En gemensam `athlete_id`, ett namn eller kompatibla demografiska uppgifter är inte
längre tillräckligt för flerårig personhistorik.

## Identitetskontrakt

`tools/identity_contracts.py` inför ett event-scope:at, opakt `person_key` och en
additiv tabell `identity_evidence`.

Varje evidensrad anger minst:

- provider,
- namespace,
- scope (`person`, `appearance` eller `result`),
- rått externt ID,
- evidenstyp,
- confidence,
- beslut,
- kopplad source/race/result när det är relevant.

Råa provider-ID:n ändras inte.

### Providersemantik

- **VasaNerd `idpe`** behandlas som verifierad person-evidens och får skapa ett
  stabilt `person_key`.
- **Mika/Vasaloppet `event_code:idp`** behandlas som resultat-evidens. Det får
  inte automatiskt bli en personidentitet mellan utgåvor.
- Övriga käll-ID:n är resultat-scope tills ett starkare explicit kontrakt finns.

## Ny importregel

`find_or_create_athlete()` får fortfarande återanvända en exakt redan känd
provideridentitet. Ett nytt käll-ID skapar däremot en ny lokal athlete-rad om
källkontraktet inte självt är person-scope.

Namn, kön, födelseår, klass, ort och liknande får användas i en framtida
granskningskö, men aldrig som automatisk merge-regel.

## HistoryEngine

`docs/assets/history-engine.js` är fail-closed:

- `person_key` eller annan explicit personidentitet får länka utgåvor,
- legacy-VasaNerd `idpe` får fungera som verifierad övergångsevidens,
- `athlete_id` ignoreras som flerårig personidentitet,
- saknad verifierad identitet gör resultatet editionslokalt.

Detta kan minska mängden synlig historik tills identiteter har migrerats och
granskats. Det är avsiktligt: falsk flerårshistorik är värre än utebliven historik.

## Prestationsjämförbarhet

Personidentitet öppnar inte automatiskt tidsjämförelser.

Helbanetider får jämföras när:

- resultaten använder exakt samma `CourseVersion`, eller
- båda CourseVersion har samma explicita `whole_course_comparison_group`.

Segment får jämföras över CourseVersion endast när segmenten har samma explicita
`comparison_group`. RaceFamily ensam räcker inte.

Hall of Fame-kategorierna **störst förbättring** och **jämnast prestation** använder
därför endast jämförbara serier. Antal genomförda lopp och avancemang inom ett
enskilt lopp kräver inte tidsjämförelse mellan banversioner.

## Dataparitet i denna etapp

Den incheckade produktionsdatabasen och de genererade 42 MB-webbdatafilerna
migreras inte i denna PR. U0-golden master ska därför vara byte- och
innehållsmässigt oförändrad.

Vid nästa kontrollerade dataexport kan `person_key` publiceras utan att den gamla
`athlete_id` ges identitetssemantik.

## Nästa migrationsetapp

Efter denna grund ska U2 fortsätta med en separat, reversibel migrering:

1. klassificera samtliga befintliga externa identiteter som evidence,
2. bevara VasaNerd `idpe` byteexakt,
3. gå igenom de 1 054 overifierade flerutgåvelänkarna och dela dem eller lägga dem
   i granskningskö,
4. migrera de 1 938 befintliga källöverskridande länkarna till explicit evidence
   eller kandidater,
5. först därefter regenerera webbdata med verifierade `person_key`.

Ingen av dessa länkar får godkännas enbart på namn eller demografi.
