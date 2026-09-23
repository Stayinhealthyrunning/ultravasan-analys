# U3 – modulär och lazy webbdata

## Syfte

U3 ersätter den obligatoriska startladdningen av den monolitiska webbdatabasen
med ett explicit, offline-kompatibelt modulkontrakt. Den gamla monoliten behålls
under övergången som fallback och som verifierbar referens.

U3 ändrar inte resultat-, split-, identitets- eller bankontrakt. Det är ett
leverans- och laddningslager ovanpå U2:s verifierade data.

## Kontrakt: `u3-modular-v1`

`tools/u3_webdata.py` bygger följande från den normala publicerade
`docs/data/ultravasan.json`:

- `docs/data/u3/bootstrap.js`
- `docs/data/u3/history-index.js`
- `docs/data/u3/races/<RaceEdition>.js` – en fil per konfigurerad utgåva
- `docs/data/u3/manifest.json`

RaceFamily härleds aldrig från filnamn, år eller distans. Exportören använder
explicit `race_family` i `config/races.json`.

### Bootstrap

Bootstrap innehåller:

- eventets 22 RaceEdition-rader,
- checkpoints, statistik och källmetadata,
- resultat och splits för senaste UV90-utgåvan,
- explicit karta race_id → chunk,
- explicit karta result_id → race_id,
- totalantal resultat och splits.

Den initiala utgåvan är därför en explicit RaceEdition, inte ett implicit
"senaste år"-antagande i frontend.

### Historikindex

Historikindexet innehåller alla 24 422 kompakta resultatrader men inga splits.
Det gör att namn-/personhistorik, årsjämförelser och sökning kan aktiveras efter
första renderingen utan att 139 910 splitrader måste laddas.

### RaceEdition-bundles

Varje utgåva har en egen bundle med endast dess resultat och splits. Ett
historiskt loppår laddas därför först när exempelvis:

- användaren väljer året,
- en vald löparprofil behöver dess splits,
- en delad kartduell innehåller en löpare från året,
- Race Intelligence Lab behöver hela den valda RaceFamily.

## Laddningsordning

Normal startsida:

1. `bootstrap.js`
2. första renderingen
3. `history-index.js` i idle-fas
4. RaceEdition-splits vid behov

Race Intelligence Lab använder IntersectionObserver och laddar historiska
split-bundles först när sektionen närmar sig viewporten.

Kartduellen använder result_id → race_id-locatorn och laddar bara de
RaceEdition-bundles som de valda löparna behöver.

## Offline

U3 använder JavaScript-filer och dynamiska `<script>`-element, inte `fetch()`
som enda väg. Samma flöde testas därför även när `docs/index.html` öppnas via
`file://`.

Om U3-filer saknas eller ännu inte är aktiverade laddar DataLoader automatiskt
den äldre `data/ultravasan-data.js`. Det gör införandet reversibelt.

## Uppmätta storlekar

Mätning från den migrerade U2-produktionen:

| Del | Byte |
| --- | ---: |
| Legacy monolit, kompakt JSON | 42 688 494 |
| U3 bootstrap / initial UV90 2026 | 5 351 394 |
| Historikindex utan splits | 11 525 304 |
| Största RaceEdition-chunk | 5 068 806 |
| Samtliga RaceEdition-chunks tillsammans | 42 658 462 |

Initial obligatorisk dataladdning minskar alltså från cirka 42,7 MB till cirka
5,35 MB, ungefär **87,5 % mindre**. Historikindexet laddas först efter första
renderingen och historiska splits först vid faktisk användning.

## Cache- och analysintegritet

När en chunk läggs till:

- resultat och splits dedupliceras deterministiskt,
- `splitsByResult` uppdateras utan fullskanning vid varje analysanrop,
- split-evidence byggs om,
- total- och klassplaceringscache uppdateras,
- audience/club/class-cacher byggs om när datasetet expanderar.

Detta gör att äldre analyser kan fortsätta använda samma interna API trots att
data nu växer stegvis.

## Publiceringsintegritet

`uvtool export` genererar både legacyfilerna och U3-bundles från samma
in-memory payload. Befintliga import-workflows är uppdaterade så att
`docs/data/u3` publiceras tillsammans med samma validerade databasversion.

För den första aktiveringen finns det manuella arbetsflödet
`Publicera U3 modular webbdata`. Det:

1. verifierar aktiv U2 golden master,
2. skapar U3-bundles,
3. verifierar manifestets totaler,
4. kör Python- och JavaScript-tester,
5. kör verklig Chromium-smoke via HTTP och `file://`,
6. skapar backup-tag,
7. tillåter endast ändringar under `docs/data/u3`,
8. committar först efter att alla grindar passerat.

## Acceptanskriterier

U3 är redo för aktivering när CI visar:

- U2-logiska golden master-digests oförändrade,
- 24 422 resultat och 139 910 splits i modulmanifestet,
- initial data är strikt mindre än total data,
- historikindex ger samtliga resultatrader utan att ladda alla splits,
- en ny RaceEdition ökar splits selektivt,
- löparprofil och kartduell fungerar för flera historiska utgåvor,
- både HTTP- och `file://`-flöde fungerar,
- inga browser- eller nätverksfel i smoketestet.
