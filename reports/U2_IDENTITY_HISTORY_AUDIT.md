# U2-förberedelse: identitet och historik

## Baslinje

Denna audit är read-only och utgår från U0-databasen på U1-basen `80d6a16`.
Databasens SHA-256 är
`fff9367a432186f2cab5de2a9263d67fa4dcf981a8144c1337d0948177734f8c`.
Ingen personkoppling eller resultatrad ändras i U1.

| Mått | Antal |
| --- | ---: |
| Resultat | 24 422 |
| Athlete-rader | 16 594 |
| Externa ID-rader | 20 805 |
| Athlete med fler än en utgåva | 4 536 |
| Athlete med fler än ett kalenderår | 4 511 |
| Athlete med resultat från båda källorna | 1 938 |
| Athlete med både UV90 och UV45 | 1 519 |
| Normaliserade namn som pekar på flera athlete-rader | 355 |
| Athlete-rader inom dessa namnkonflikter | 1 299 |
| Flera resultat i samma utgåva på samma athlete | 0 |
| Resultat utan exakt extern-ID-länk | 0 |

Källfördelningen är 13 188 VasaNerd-resultat på 9 571 personer och 11 234
Mika-resultat på 8 961 personer. Alla 9 571 VasaNerd-ID:n och alla 11 234
Mika-ID:n har i dag `confidence=1.0`, trots att ID-typerna inte har samma scope.

## Konstaterade risker

- `athlete_external_ids` har global unikhet per källa men saknar explicit
  namespace, scope, evidenstyp och granskningsbeslut. Mika-ID:t identifierar ett
  resultatframträdande medan VasaNerd `idpe` är avsett som stabil personidentitet.
  Dessa får inte uttrycka samma semantik.
- 9 602 athlete-rader har status `source-id`; 6 992 är `unverified`. Av de
  overifierade raderna binder 1 054 flera utgåvor och 1 051 flera kalenderår.
  `find_or_create_athlete` kan skapa dessa länkar genom ett ensamt normaliserat
  namn med kompatibla attribut. Det strider mot målkontraktet för U2.
- 1 938 athlete-rader förenar Mika och VasaNerd utan en separat evidenstabell.
  Kopplingarna kan vara riktiga, men dagens datamodell kan inte visa varför de
  skapades eller om de är granskade.
- Vanliga namn är genuint tvetydiga. Exempelvis finns 20 athlete-rader för
  normalformen `larsson daniel` och 16 för `andersson johan`. Namn och demografi
  får därför aldrig automatiskt konsolidera personer.
- Frontendens flerårshistorik bygger på nuvarande `athlete_id`. Den kan därmed
  presentera overifierade, namnmatchade länkar som personhistorik.
- Alla CourseVersion har ännu `whole_course_comparison_group=null`. Delad
  RaceFamily räcker inte för helbanetid eller segmentjämförelse.

## Föreslagen migrationsordning för U2

1. Lägg till stabil, event-scope:ad `person_key` samt en additiv evidensmodell
   med provider, namespace, scope (`person`, `appearance`, `result`), confidence,
   källvärde och beslut. Behåll råa provider-ID:n oförändrade.
2. Klassificera VasaNerd `idpe` som verifierad person-evidence. Klassificera
   Mika `event_code:idp` som result/appearance-evidence, inte automatiskt som
   person-evidence.
3. Gör varje resultat edition-lokalt när stabil person-evidence saknas. De 1 054
   overifierade flerutgåvelänkarna ska delas eller läggas i granskningskö; de får
   inte godkännas genom namnlikhet.
4. Migrera de 1 938 källöverskridande länkarna till explicit evidence eller
   kandidater. Automatisk sammanslagning kräver deterministisk provideridentitet
   eller manuellt beslut, aldrig enbart namn, kön, klass eller ort.
5. Inför en `HistoryEngine` som endast visar säker flerårshistorik för verifierad
   `person_key`, men fortfarande kan visa ett enskilt resultat lokalt.
6. Lägg explicit jämförbarhet på CourseVersion-nivå för deltagande, helbana och
   namngivna segment innan HistoryEngine räknar utveckling mellan utgåvor.

## U2:s första acceptansgrind

- U0-resultat, splits och rå publicerad evidence förblir oförändrade.
- Noll automatgenererade personkopplingar får ha endast namn/demografi som stöd.
- Varje extern identitet har provider, namespace, scope, confidence och evidence.
- VasaNerd `idpe` överlever migrationen byteexakt som verifierad evidence.
- Oklar identitet blir edition-lokal och ger ingen falsk flerårshistorik.
- Samma loppfamilj aktiverar inte helbane- eller segmentjämförelse utan ett
  explicit CourseVersion-kontrakt.
