# U3 – modulär och lazy webbdata

## Mål

U3 minskar startkostnaden för Ultravasan Analys utan att ändra datainnehåll,
analyslogik, offline-stöd eller möjligheten att öppna gamla delade länkar.

Den tidigare webbexporten består av en komplett `ultravasan.json`/
`ultravasan-data.js` på cirka 42,7 MB. Den filen behålls som fallback och
återställningsartefakt, men ska efter aktivering inte längre laddas synkront från
`index.html`.

## U3-datakontrakt

Exportmotorn skriver efter U3:

- `data/bootstrap.json/js`
  - metadata,
  - samtliga 22 RaceEditions,
  - checkpoints,
  - aggregerad statistik,
  - källmetadata,
  - manifest över edition bundles.
- `data/history-index.json/js`
  - samtliga 24 422 kompakta resultatrader,
  - verifierade `person_key` från U2.
- `data/editions/<race_key>.json/js`
  - splits för exakt en RaceEdition.
- `data/ultravasan.json/js`
  - oförändrat komplett fallbackformat för återställning och bakåtkompatibilitet.

Alla JSON-filer har JavaScript-motsvarighet så `file://` fortsatt fungerar utan
lokal webbserver.

## Laddningsmodell

1. Browsern läser bootstrap + history index.
2. Senast valda loppfamilj väljs.
3. Splits för den aktiva RaceEdition laddas innan analysen visas.
4. Övriga editioner i samma loppfamilj fylls på i bakgrunden.
5. Byte mellan UV90 och UV45 laddar den nya familjen först när den behövs.
6. Löparprofil säkrar sin egen edition innan replay/splitanalys renderas.
7. Kartduell säkrar exakt de editioner som de valda löparna kräver.
8. Fristående delade kartlänkar laddar bara de editioner som finns i URL:en.
9. Om modulära filer av någon anledning saknas kan loadern falla tillbaka till
   den fullständiga monoliten.

## Verifierad storlek

Provexport från den migrerade U2-produktionsdatabasen:

| Del | Storlek |
| --- | ---: |
| Tidigare monolit | 42 693 197 byte |
| Bootstrap | 38 575 byte |
| History index | 11 525 312 byte |
| Senaste UV90-edition | 4 005 974 byte |
| Senaste UV45-edition | 933 558 byte |
| Initial UV90-data | 15 569 861 byte |
| Initial UV45-data | 12 497 445 byte |

Det motsvarar:

- UV90: **63,5 % mindre initial datamängd**
- UV45: **70,7 % mindre initial datamängd**

Detta är före normal HTTP-komprimering; både gammalt och nytt format kan dessutom
komprimeras av webbservern.

## Dataparitet

`tools/u3_modular_check.py` verifierar att:

- 22 RaceEditions finns,
- history index innehåller exakt 24 422 resultat,
- edition bundles innehåller tillsammans exakt 139 910 splits,
- varje split ligger i rätt RaceEdition,
- varje `(result_id, checkpoint_key)` har exakt samma payload som i monoliten,
- races, checkpoints, stats och sources är identiska med fallbackmonoliten,
- U2:s identity contract finns kvar,
- initial modulär laddning är mindre än monoliten.

Filordning mellan edition bundles är inte semantik och ingår därför inte i
paritetskravet.

## Browserkontrakt

`UltravasanDataLoader` ansvarar för:

- `loadCore()`,
- `ensureEdition(raceId)`,
- `ensureEditions(raceIds)`,
- `ensureFamily(family)`,
- `ensureResults(resultIds)`.

`UltravasanDataIndex` kan efter U3 lägga till splits inkrementellt utan att
skanna om hela datamängden.

Den fulla Chromium-smoketesten regenererar modulär data i CI, tar bort monolitens
synkrona script-tag och kör därefter verkliga flöden för resultatsökning,
löparprofil, replay, olika år, båda loppfamiljerna och fristående kartlänkar.

## Golden master

Efter produktionsaktivering skapas `reports/U3_BASELINE.json`.

U3-baslinjen verifierar:

- databasen och U2-identitetsläget,
- exakt antal resultat/splits/personnycklar,
- alla modulära filer och deras hash,
- 22 edition bundles,
- data-kontraktet `u3-modular-v1`,
- första laddningens storleksreduktion,
- SQLite-integritet och foreign keys.

U0- och U2-baslinjerna lämnas kvar oförändrade som historiska revisionspunkter.

## Produktionsaktivering

Vanlig merge av U3-koden ändrar inte den publicerade resultatdatan.

Efter merge körs manuellt:

**Actions → Aktivera U3 modulär webbdata**

med bekräftelsetext:

`ACTIVATE-U3-MODULAR-DATA`

Workflowen:

1. kräver grön U2-baseline,
2. skapar backup-tag,
3. regenererar all webbdata,
4. verifierar modulär paritet,
5. tar bort endast den synkrona monolit-taggen från startsidan,
6. skapar och verifierar U3 golden master,
7. kör Python-, JavaScript- och Chromium-tester,
8. kontrollerar strikt vilka filer som får ändras,
9. committar först om allt är grönt.

SQLite-databasen ändras inte av U3-aktiveringen.
