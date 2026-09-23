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

Det första säkra steget delade monoliten per loppfamilj:

| Familj | Resultat | Splits | Full family JSON |
| --- | ---: | ---: | ---: |
| UV90 | 15 521 | 108 640 | 32 062 461 byte |
| UV45 | 8 901 | 31 270 | 10 627 860 byte |

Det bevisade family-routing men UV90:s första payload var fortfarande cirka
32 MB.

## U3.3: RaceEdition-lager för kartlänkar

Direkta kartlänkar och flerårsdueller behöver inte hela familjens historik.
Exporten skriver därför en JSON-fil per explicit RaceEdition.

Verifierad storlek:

- 22 edition-filer,
- största edition: 5 072 378 byte,
- minsta edition: 581 025 byte,
- editionsfiler tillsammans: 42 725 482 byte,
- största enskilda edition är 88,1 % mindre än legacy-monoliten.

Routingkatalogen använder result-ID → race_id och editionsregistret översätter
race_id till race_key, race_family, år och fysisk JSON-fil. Edition-lagret är
JSON-only; file:// använder family-JavaScript som fallback och undviker därmed
cirka 43 MB redundant edition-JS.

## U3.4: progressiv family core + splits

Startsidan behöver resultat och metadata innan den behöver 139 910 mellantider.
Family-lagret är därför uppdelat i två moduler per familj:

| Familj | Core JSON | Split JSON | Resultat | Splits |
| --- | ---: | ---: | ---: | ---: |
| UV90 | 7 386 601 byte | 24 676 372 byte | 15 521 | 108 640 |
| UV45 | 4 174 374 byte | 6 453 998 byte | 8 901 | 31 270 |

UV90:s initiala core-payload är därmed **82,7 % mindre** än legacy-monoliten och
cirka **77 % mindre** än den tidigare fulla UV90-family-filen.

Core innehåller races, checkpoints, results, stats och sources men inga splits.
Splitmodulen innehåller endast splits. Båda finns som JSON för webb och
JavaScript för file://, så offline-läget bevaras.

Applikationsordningen är explicit:

1. ladda och aktivera family core,
2. rendera core-säkra KPI:er, sluttidsfördelning, resultatlista och sökfunktion,
3. starta splitladdning utan att blockera den första vyn,
4. aktivera full family när splitmodulen är klar,
5. bygg om splitberoende caches och rendera Pace, DNF, segment, Audience Worlds,
   NerdLab och Replay.

Löpardialog/Replay och kartduell har en full-data-grind. Om användaren hinner
klicka innan bakgrundsladdningen är klar väntar just den åtgärden på splits utan
att den övriga resultatsidan blockeras.

CI har verifierat den faktiska fasordningen: UV90 aktiveras först med 15 521
resultat och 0 splits och därefter med samma 15 521 resultat och 108 640 splits.

## U3.5: aktiv RaceEdition först

U3.4 tog bort splits från första laddningen, men family core innehöll fortfarande
alla historiska resultat i familjen. U3.5 lägger därför två HTTP-only-lager
framför family core:

- **family shell**: alla loppår, checkpoints, stats och sources men inga resultat
  eller splits,
- **RaceEdition core**: resultat för exakt ett loppår men inga splits.

Verifierad standard-start:

| Familj | Shell | Senaste RaceEdition core | Shell + edition | Inkl. katalog |
| --- | ---: | ---: | ---: | ---: |
| UV90 | 20 515 B | 1 066 485 B | 1 087 000 B | 1 339 829 B |
| UV45 | 15 223 B | 420 924 B | 436 147 B | 688 976 B |

För UV90 innebär den verkliga standard-starten inklusive den gemensamma
252 829-byte-katalogen **96,9 % mindre data än legacy-monoliten före
HTTP-komprimering**. Exklusive den delade katalogen är minskningen 97,5 %.

Browserns fasordning är nu explicit:

1. **active** – family shell + senaste RaceEdition core,
2. **core** – hela familjens historiska resultat, fortfarande utan splits,
3. **full** – family core + samtliga splits.

I CI verifierades UV90 i verklig Chromium till 2 333 resultat/0 splits i
active-fasen, 15 521 resultat/0 splits i core-fasen och 15 521 resultat/
108 640 splits i full-fasen. Årbyte, flerårssökning och kartduellsökning kräver
core-fasen; löpardialog, Replay och kartpayload kräver full-fasen.

Family shell och RaceEdition core är JSON-only. Vid file:// hoppar DataLoader
direkt till U3.4:s family-core-JavaScript, så offline-stödet kräver ingen extra
duplicering av de 22 edition-resultatfilerna.

## Loader-kontrakt

docs/assets/data-loader.js är den enda browserkomponent som väljer fysisk
datakälla.

Den stöder:

- legacy: verifierad monolit,
- modular active family: family shell + ett RaceEdition core,
- modular family core: hela familjens historiska resultat utan splits,
- modular family full: core + splitdata,
- modular edition: exakt ett eller flera kompletta loppår för result-ID-baserade kartlänkar.

Prioritet för en kartlänk på vanlig webb:

1. result-ID → race_id,
2. ladda exakt motsvarande RaceEdition-JSON,
3. mergea endast de editioner som faktiskt behövs,
4. vid editionsfel: falla tillbaka till komplett berörd race family.

På file:// används core- och split-JavaScript för komplett family-fallback.

## Paritetskrav

tools/u3_modularize.py verifierar att family shell, RaceEdition cores,
family core + splitdata och samtliga fulla RaceEdition-filer är konsistenta med
varandra och tillsammans exakt lika med monoliten för:

- races,
- checkpoints,
- results,
- splits,
- stats och sources via core,
- result→race_id-routing,
- edition→race_key/family-routing.

Verifieraren kräver dessutom exakt två family-shells, exakt 22 RaceEdition-core
JSON-filer, exakt 22 fulla edition-JSON-filer, avvisar gamla full-family-filer
och förbjuder JavaScript-dubblering för shell-/edition-lagren.

Vanliga framtida uvtool-exporter känner efter produktionskatalogens mode. När
modular mode är aktiverat regenereras core-, split- och edition-lagren
automatiskt och gamla artifakter städas bort.

## Browsergrind

Ordinarie CI bygger modulära filer i sin arbetskopia före Chromium-smoketestet.
Smoketestet verifierar bland annat:

- active → core → full-fasordning för UV90,
- samma active → core → full-fasordning vid byte till UV45,
- rätt default RaceEdition i active-fasen,
- 0 splits i active/core och full splitmängd i full-fasen,
- UV90 startsida och individuell runner search,
- löpardialog och Replay efter full-data-grind,
- NerdLab coverage, berättelsekort och segmentval,
- Audience-kort efter full hydrering,
- lazy byte UV90 → UV45,
- direkt UV90- och UV45-kartlänk med race-edition-scope,
- flerårsduell med merged-editions-scope,
- rätt CourseVersion och media,
- noll console- och networkfel.

## Produktionsaktivering

Workflow "Aktivera U3 modulär data" kräver explicit bekräftelse, verifierar U2
golden master, skapar backup-tag och bygger allt från den oförändrade
docs/data/ultravasan.json.

Aktiveringen får endast ändra:

- modulär katalog JSON/JS,
- UV90/UV45 family-shell JSON,
- UV90 core JSON/JS och split JSON/JS,
- UV45 core JSON/JS och split JSON/JS,
- exakt 22 RaceEdition-core JSON-filer,
- exakt 22 fulla RaceEdition-JSON-filer,
- U3-aktiveringsrapport.

SQLite-databasen, U2-baslinjen och legacy-monoliten får inte ändras.

## U3-status efter U3.5

U3:s beslutade huvudmål är nu uppnått: browsern har ett verifierat DataLoader-
kontrakt, lazy routing per familj och RaceEdition, progressiv active/core/full-
hydrering, offline-fallback, automatisk regenerering vid framtida exporter och
paritetsgrindar i CI. Första UV90-datapayloaden inklusive katalog har minskat
från 42,7 MB till cirka 1,34 MB utan att ta bort analyser eller rådata.

Nästa planerade utvecklingsetapp är **U4 Gemensam frontendkärna**. Eventuell
ytterligare U3-finindelning ska bara göras senare om mätning visar att den ger
större nytta än den ökade komplexiteten.
