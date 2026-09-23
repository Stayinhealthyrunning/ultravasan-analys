# U3 modulär/lazy webbdata – kontrakt

## Mål

U3 ska minska browserns datakostnad utan att ändra resultat, splits,
analysmatematik, personhistorik, kartlogik eller offline-stöd.

Den verifierade legacy-monoliten är 42 688 494 byte och innehåller:

- 22 lopp,
- 24 422 resultat,
- 139 910 splits.

Alla U3-lager genereras deterministiskt ur exakt denna publika payload och måste
kunna verifieras tillbaka mot den rad för rad.

## U3.0–U3.2: race-family-lager

Startsidan och flerårshistoriken använder två family-moduler:

| Familj | Resultat | Splits | JSON |
| --- | ---: | ---: | ---: |
| UV90 | 15 521 | 108 640 | 32 062 461 byte |
| UV45 | 8 901 | 31 270 | 10 627 860 byte |

Största initiala familjepayloaden är 24,9 % mindre än monoliten. Family-lagret
finns både som JSON för vanlig webb och JavaScript för file://-offline.

## U3.3: RaceEdition-lager för kartlänkar

Direkta kartlänkar och flerårsdueller behöver inte hela familjens historik.
Exporten skriver därför dessutom en JSON-fil per explicit RaceEdition.

Verifierad storlek:

- 22 edition-filer,
- största edition: 5 072 378 byte,
- minsta edition: 581 025 byte,
- editionsfiler tillsammans: 42 725 482 byte,
- största enskilda edition är 88,1 % mindre än legacy-monoliten.

Routingkatalogen är 250 426 byte. För varje publikt result-ID lagras endast dess
numeriska race_id. Editionsregistret översätter race_id till race_key,
race_family, år och fysisk JSON-fil. Redundant result→family-routing publiceras
inte.

Edition-lagret är medvetet JSON-only. Vid file:// används family-JavaScript som
fallback. Därmed bevaras offline-funktionen utan att ytterligare cirka 43 MB
edition-data behöver dupliceras som JavaScript i repot.

## U3.4: progressive family core + splitdata

Startsidan behöver inte alla 139 910 mellantider för att visa resultatlista,
filter, KPI:er, sluttidsfördelning och årsöversikt. Family-lagret är därför nu
delat i två transporter:

| Familj | Core JSON | Split JSON | Resultat | Splits |
| --- | ---: | ---: | ---: | ---: |
| UV90 | 7 386 601 byte | 24 676 372 byte | 15 521 | 108 640 |
| UV45 | 4 174 374 byte | 6 453 998 byte | 8 901 | 31 270 |

UV90:s första datalast minskar därmed från 42 688 494 byte legacydata till
7 386 601 byte coredata, **82,7 % mindre före HTTP-komprimering**.

Core innehåller races, checkpoints, results, stats och sources men inga splits.
Splitmodulen innehåller endast splitrader och nödvändig metadata. DataLoader kan
antingen ge endast core eller mergea core + splitdata till samma fulla
family-kontrakt som tidigare analyskod förväntar sig.

Applikationsflödet är progressivt:

1. core laddas och första analysvyn renderas,
2. splitdata laddas i bakgrunden,
3. full family-data aktiveras atomärt,
4. splitbaserade diagram och NerdLab renderas om,
5. löpardialog och Replay inväntar full family-data om användaren klickar innan
   bakgrundsladdningen är klar.

Samtidiga önskemål om full family-data dedupliceras så bara en splitladdning per
familj pågår. Browsergrinden verifierar både core- och full-fasen samt att
runner search, löpardialog, Replay, NerdLab och målgruppsanalys fungerar efter
hydrering.

## Loader-kontrakt

docs/assets/data-loader.js är den enda browserkomponent som väljer fysisk
datakälla.

Den stöder:

- legacy: verifierad monolit,
- modular family: vald UV90/UV45-familj,
- modular edition: exakt ett eller flera loppår för result-ID-baserade länkar.

Prioritet för en kartlänk på vanlig webb:

1. result-ID → race_id,
2. ladda exakt motsvarande RaceEdition-JSON,
3. mergea endast de editioner som faktiskt behövs,
4. vid editionsfel: falla tillbaka till berörd race family.

På file:// går result-ID-länkar direkt till family-fallbacken eftersom lokal
fetch av JSON normalt blockeras. Family-JavaScript gör därför offline-läget
fortsatt självförsörjande.

## Paritetskrav

tools/u3_modularize.py verifierar att både family-lagret och samtliga
RaceEdition-filer tillsammans är exakt lika med monoliten för:

- races,
- checkpoints,
- results,
- splits,
- result→race_id-routing,
- edition→race_key/family-routing.

Verifieraren kräver dessutom exakt 22 edition-JSON-filer och avvisar både
saknade, extra och gamla edition-filer. Edition-JavaScript är inte tillåtet.

Vanliga framtida uvtool-exporter känner efter produktionskatalogens mode. När
modular mode är aktiverat regenereras family- och edition-lagret automatiskt och
gamla edition-artifakter städas bort.

## Browsergrind

Ordinarie CI bygger modulära filer i sin arbetskopia före Chromium-smoketestet.
Det verkliga browserflödet körs alltså i det framtida produktionsläget även när
main ännu använder legacy-katalogen.

Smoketestet verifierar bland annat:

- UV90 startsida,
- runner search och löpardialog,
- Replay,
- historiska specialfall,
- lazy byte UV90 → UV45,
- direkt UV90-kartlänk med race-edition-scope,
- direkt UV45-kartlänk med race-edition-scope,
- flerårsduell mellan två UV90-editioner med merged-editions-scope,
- rätt CourseVersion och media,
- noll console- och networkfel.

## Produktionsaktivering

Workflow "Aktivera U3 modulär data" kräver explicit bekräftelse, verifierar U2
golden master, skapar backup-tag och bygger allt från den oförändrade
docs/data/ultravasan.json.

Aktiveringen får endast ändra:

- modulär katalog JSON/JS,
- UV90 family JSON/JS,
- UV45 family JSON/JS,
- exakt 22 RaceEdition-JSON-filer,
- U3-aktiveringsrapport.

SQLite-databasen, U2-baslinjen och legacy-monoliten får inte ändras.

## Fortsättning inom U3

U3.4 har tagit bort splitdata ur den första analysladdningen. Nästa etapp är att
separera flerårshistorik/personhistorik från den initiala family-core-payloaden
och därefter pröva ännu finare RaceEdition-core för startsidans valda loppår.

Slutmålet för U3 är att första analysvyn bara ska hämta den minsta verifierade
datamängd som krävs för just den vy användaren faktiskt öppnar.
