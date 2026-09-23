# U3 modulär/lazy webbdata – grundkontrakt

## Mål

U3 ska minska startkostnaden för webbläsaren utan att ändra resultat, splits,
analysmatematik, personhistorik eller offline-stöd.

Den tidigare publika monoliten är 42 688 494 byte och innehåller:

- 22 lopp,
- 24 422 resultat,
- 139 910 splits.

U3 inför därför ett transportlager framför samma publicerade datapayload.

## Första steg: familjechunks

Den verifierade exporten delar monoliten i två race-family-moduler:

| Familj | Resultat | Splits | JSON |
| --- | ---: | ---: | ---: |
| UV90 | 15 521 | 108 640 | 32 062 461 byte |
| UV45 | 8 901 | 31 270 | 10 627 860 byte |

Datakatalogen är cirka 356 kB och innehåller bland annat totalsummor,
filreferenser, race-id per familj och result_id → race_family för direkta
kartlänkar.

Största första familjepayloaden är därmed 24,9 % mindre än den tidigare monoliten.
Detta är en grundnivå, inte slutmålet för U3.

## Loader-kontrakt

docs/assets/data-loader.js är den enda browserkomponent som väljer fysisk
datakälla.

Den stöder två lägen:

- legacy: dagens monolit används oförändrad,
- modular: endast begärd race family laddas och cachas.

På vanlig webb försöker loadern läsa JSON. Vid file:// används motsvarande
JavaScript-payload, vilket bevarar den befintliga offline-egenskapen.

Direkta kartlänkar använder resultatindexet för att ladda rätt familj även när
kartvyn öppnas utan session-data.

## Paritetskrav

tools/u3_modularize.py verifierar payload-paritet på radnivå mellan monoliten och
modulära filer för races, checkpoints, results, splits och result→family-routing.

JSON- och JavaScript-versionen av varje family chunk måste dessutom representera
exakt samma objekt.

Legacy-monoliten behålls tills hela U3 är färdig som golden parity source,
rollback/fallback och jämförelsegrund under övergången.

## Browsergrind

Ordinarie CI bygger modulära filer i sin temporära arbetskopia före Chromium-
smoketestet. Det verkliga browserflödet körs alltså i modular mode även innan
produktionsaktiveringen är gjord.

Smoketestet omfattar bland annat UV90 startsida, runner search, löpardialog,
Replay, historiska specialfall, byte mellan UV90 och UV45, fristående kartlänk
för båda loppfamiljerna, race/course/media-kontrakt och noll console-/networkfel.

## Produktionsaktivering

Workflow "Aktivera U3 modulär data" skapar en backup-tag och bygger family chunks
direkt från den redan verifierade docs/data/ultravasan.json.

Det får bara ändra modulär datakatalog, UV90 JSON/JS, UV45 JSON/JS och
U3-aktiveringsrapport. Databasen, U2-golden master och legacy-monoliten får inte
ändras.

## Fortsättning inom U3

Familjesplitten är medvetet första säkra steget. Den beslutade fortsättningen är
att gå från race-family-lazy till finare lazy loading för enskild RaceEdition
och direkta kartlänkar, aktivt lopp kontra historikdata, splits/Replay på
efterfrågan samt historikmoduler först när historikfunktioner faktiskt används.

Målet är att startsidan inte ska behöva bära 32 MB UV90-splits bara för att visa
den första analysvyn.
