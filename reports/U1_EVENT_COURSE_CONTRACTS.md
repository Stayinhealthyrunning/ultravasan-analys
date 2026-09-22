# U1.2–U1.4: Event, RaceFamily och CourseVersion

## Specifikation och avgränsning

Denna etapp lägger till ett explicit Event, två RaceFamily och en tilldelning av
CourseVersion för samtliga 22 konfigurerade RaceEdition. Karta, replay,
familjeurval, presentation och medaljprofil ska slå upp exakt `race_key` i en
gemensam katalog. Okända lopp ska inte ärva UV90, en standardbana eller musik.
Årtal, namn, prefix och distans får inte avgöra familj eller bana.

Befintliga SQLite- och resultatfiler bevaras byte för byte enligt U0. Katalogen
är en separat liten export, med deterministisk JSON och JS för befintlig statisk
drift. `course_version` i äldre data är fortsatt en rå etikett; det nya
`course_version_id` identifierar det kontrollerade kontraktet.

## Fem modeller, tre kartreferenser

| CourseVersion | Utgåvor | Kartreferens |
| --- | --- | --- |
| uv90-pre2023-v1 | UV90 2014–2019, 2022 | GPX 2022 |
| uv90-2023-2025-v1 | UV90 2023–2025 | GPX 2024 |
| uv90-2026-v1 | UV90 2026 | GPX 2024 |
| uv45-2014-2024-v1 | UV45 2014–2019, 2022–2024 | GPX 2026 |
| uv45-2025-2026-v1 | UV45 2025–2026 | GPX 2026 |

En kartreferens bevisar inte att historiska banor hade identisk geometri.
Kontrollkatalogen beskriver U0-databasens observationer. Kartankare beskriver
visningslagret och har egna avstånd. De blandas inte ihop. Saknade avstånd för
Högsta punkten och Mora Förvarning 2026 förblir `null`; angränsande segment
får också okänd längd. UV90 2026 får därför ett eget kontrakt trots samma gamla
`post2023`-etikett. Ingen ny regel för jämförbarhet införs i denna etapp.

Fingeravtrycket omfattar semantisk GPX-geometri (koordinater/höjd och segment),
kontrollkatalog, kartankare, segment, familj, event och referensuppgifter.
XML-formattering och GPX-tidsstämplar påverkar inte geometrihashen. Låsfilen
verifieras mot innehållet och i CI mot basrevisionen: publicerade ID:n får inte
tas bort eller få ett nytt fingeravtryck. Materialändringar kräver ett nytt ID.

## Acceptans

- Alla 22 utgåvor har ett entydigt event, en familj och ett giltigt bankontrakt.
- Kontraktens kontroller överensstämmer exakt med U0-databasens kontroller.
- Vilseledande namn/distans/årtal kan inte ändra familj, medaljprofil eller karta.
- Okända utgåvor får ingen implicit familj, musik eller karta.
- Ändrad geometri, kontroll, ankare eller segment bryter versionslåset.
- U0, befintliga Python-/JS-tester och verkligt browserflöde förblir gröna.

## Verifiering

Lokalt: 95 Python-tester och 29 subtester passerar, alla 11 JavaScript-sviter
passerar och 23 JS/MJS-filer klarar syntaxkontroll. `uvtool.py validate` ger
0 problem. U0 golden master och den deterministiska kontraktexporten matchar.
De nya testerna täcker materialändringar, försök att byta ett publicerat
fingeravtryck, saknade kontrakt, ett annat event med opaka nycklar, missvisande
namn/årtal/distans samt att kartan får exakt den geometri som har hashats.

CI kör dessutom det verkliga löparflödet för UV90/UV45, DNF, ofullständiga
mellantider och angränsande år. Browserkontrollen verifierar alla 22 tilldelningar
och öppnar två fristående kartlänkar med rätt bana och musik. Körningens status
visas under PR:ns Checks.

## Kvar efter denna etapp

SourceBinding, importerarnas gamla routning, CompetitionCapabilities och den
fullständiga RaceEdition-migreringen återstår i U1. Importkonfigurationens
kontroller för UV90 2025 skiljer sig redan från den publicerade databasen;
den skillnaden dokumenteras och ändras inte här. Den nya katalogen utgår från
den publicerade kontrollmodellen. Den gamla ruttregistrets prefix-/årsregler
bevaras för äldre konsumenter men används inte längre av webbgränssnittet.
U2 identitet/historik, U3 dataladdning och U4 delad frontend är senare etapper.
