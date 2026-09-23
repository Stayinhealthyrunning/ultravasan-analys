# U5 Löparanalys 2.0 – kontrakt och verifiering

## Mål

U5 ska göra den individuella löparanalysen mer sammanhållen utan att skapa en
parallell analysmotor. Befintlig RunnerReplay, U2-identitet, RaceEdition- och
CourseVersion-kontrakt samt U3:s lazy dataflöde återanvänds.

U5 ändrar inte resultatdata eller personmatchning. Den bygger en ny individuell
presentations- och jämförelsemodell ovanpå redan verifierade kontrakt.

## U5.1 RunnerAnalysis

`docs/assets/runner-analysis.js` är den gemensamma modellen för individuell
löparanalys.

Den ansvarar för:

- profil från ett explicit result-ID,
- strukturerad Journey kontroll för kontroll,
- koppling till verifierad flerårshistorik,
- projektion av RaceContracts CourseVersion till HistoryEngine,
- CourseVersion-säker head-to-head,
- konservativ hantering av motsägelsefull status/tid.

### Identitet

Flerårshistorik använder endast U2 HistoryEngine.

Det betyder att:

- `person_key` eller annan verifierad person-evidens får länka resultat,
- namn får inte användas som egen identitetsnyckel,
- gammalt `athlete_id` får inte återinföras som genväg.

En löpare utan verifierad personidentitet får fortfarande full analys av det
enskilda loppet, men ingen påstådd flerårshistorik.

### Journey

Journey byggs från loppets publicerade checkpoints och registrerade splits.

Varje kontroll märks som:

- start,
- verifierad passage,
- beräknad passage,
- verifierad måltid från resultatet,
- passage saknas.

Saknade passager fylls inte med påhittade tider.

Om en resultatrad har motsägelsefull status, exempelvis DNF samtidigt som ett
`finish_seconds` finns, får sluttiden inte automatiskt bli en verifierad
målpassage. ResultStatus avgör om målgången kan behandlas som faktisk.

## U5.2 Journey i löpardialogen

Den befintliga `openRunner()` använder från och med U5
`RunnerAnalysis.profileForResult()`.

Dialogen innehåller fortsatt:

- sluttid,
- totalplacering,
- klass och klassplacering,
- snittfart,
- befintlig RunnerReplay,
- detaljerade passager och mellantider.

U5 lägger till:

- verifierad flerårshistorik när identitet finns,
- Journey som kontrollkedja,
- explicit datakvalitet per passage,
- en detaljerad tabell byggd från samma Journey-modell.

Replay använder fortfarande sin tidigare, verifierade modell och de ursprungliga
splitraderna. U5 ersätter inte Replay-matematiken.

## U5.3 Head-to-head

Det befintliga urvalet för kartduellen återanvänds för Head-to-head. Användaren
behöver därför inte välja samma löpare i två separata system.

Head-to-head tillåter 2–5 resultat från samma loppfamilj.

### Hela loppet

Sluttider rangordnas endast när
`HistoryEngine.wholeCourseComparable()` är sant för samtliga valda resultat.

Exempel som verifieras i Chromium:

- UV90 2015 mot UV90 2017: samma `uv90-pre2023-v1` → sluttid och gap visas.
- UV90 2015 mot UV90 2024: olika CourseVersions utan explicit
  jämförelsegrupp → ingen vinnare eller artificiellt sluttidsgap visas.

### Delsträckor

Segmentgap visas endast när
`HistoryEngine.segmentComparable()` tillåter jämförelsen.

Samma checkpointnamn räcker alltså inte. Segmentet måste vara kontrakterat som
jämförbart mellan aktuella CourseVersions.

## U5.4 Lokala favoriter

`docs/assets/runner-favorites.js` lagrar favoriter lokalt i browserns
`localStorage`.

Favoritobjektet refererar till ett specifikt publicerat resultat:

- result-ID,
- loppfamilj,
- race_key,
- år,
- publicerat namn,
- startnummer när det finns.

Favoritfunktionen skapar aldrig en egen personidentitet och använder inte
`person_key`, namnmatchning eller `athlete_id` för att slå ihop lopp.

Kontrakt:

- lagring är lokal på användarens enhet,
- inga favoritdata skickas till server,
- lagringsnyckeln är versionsstyrd,
- högst 40 favoriter behålls,
- dubbletter dedupliceras,
- korrupt localStorage ger tom, säker fallback.

UI:t innehåller:

- `Spara lopp` / `Sparad` i löpardialogen,
- favoritlista vid den individuella löparsökningen,
- öppna favorit,
- ta bort favorit.

En favorit från ett historiskt år kan lazy-ladda family core när resultatet inte
finns i första U3-payloaden. En favorit från den andra loppfamiljen kan först
växla UV90/UV45 och därefter öppna resultatet.

## Browser- och regressionsgrind

Ordinarie CI verifierar fortsatt U0/U2 golden master, loppkontrakt,
U3-dataparitet, JavaScript-syntax och samtliga äldre tester.

U5:s nya testgrind verifierar dessutom:

- RunnerAnalysis på verkligt UV90-resultat,
- verifierad och icke verifierad flerårshistorik,
- motsägelsefull DNF + sluttid,
- samma CourseVersion i head-to-head,
- olika CourseVersions utan implicit jämförbarhet,
- lokala favoriter och maxgräns,
- att favoriter inte implementerar egen personidentitet,
- scriptordning och cache-busting.

Chromium verifierar:

- Journey för vanlig finisher,
- Journey med partiella splits,
- Journey för DNF,
- Journey för UV45,
- RunnerReplay samtidigt med Journey,
- Head-to-head för jämförbara UV90-år,
- Head-to-head för icke jämförbara banversioner,
- favoritflödet spara → öppna igen → ta bort,
- de tidigare U3/U4 kart-, data- och mediaflödena.

## U5-status

Efter U5.1–U5.4 finns den planerade individuella Löparanalys 2.0:

- profil,
- Journey,
- Replay,
- passager/mellantider,
- verifierad flerårshistorik,
- CourseVersion-säker head-to-head,
- lokala favoriter.

Nästa planerade utvecklingsetapp är **U6 Course Intelligence**.
