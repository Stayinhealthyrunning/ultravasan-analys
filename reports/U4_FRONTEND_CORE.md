# U4 gemensam frontendkärna – kontrakt och verifiering

## Mål

U4 ska minska dubblerad frontendlogik mellan huvudanalysen, RunnerReplay och
kartduellen utan att ändra data, analysmatematik, resultat, historik eller
användarflöden.

Refaktorn är därför uppdelad i små, testbara moduler. Varje modul har ett tydligt
ansvar och laddas före de ytor som använder den.

## U4.1 DataAdapter

`docs/assets/data-adapter.js` är den gemensamma hydreringen för browserdata.

Den ansvarar för:

- normalisering av races, results, checkpoints och splits,
- numeriska fält,
- checkpointmetadata på splits,
- gemensamt `splitsByResult`-index,
- split evidence,
- cache av total- och klassplaceringar vid passage,
- idempotent hydrering.

`app.js` och `map.js` får inte återinföra egna motsvarande hydreringar.

## U4.2 RaceUI

`docs/assets/race-ui.js` centraliserar presentationsregler som tidigare låg
spridda mellan huvudappen och kartduellen:

- race family,
- familjeetikett,
- startnamn,
- hero/title/alt,
- editionrubrik,
- rubrik för ett eller flera valda loppår.

Presentation härleds alltid från `RaceContracts`.

## U4.3 AppState

`docs/assets/app-state.js` skapar separata state-instanser för huvudapp och
kartapp.

Kontraktet ger:

- gemensamma defaults,
- inga delade muterbara arrayer mellan instanser,
- separat `createMain()` och `createMap()`,
- snapshot-stöd för test/debug.

Den befintliga mutationsmodellen behålls; U4 ändrar inte appens state-semantik.

## U4.4 Charts

`docs/assets/charts.js` äger gemensam deterministisk diagrammatematik:

- median,
- kvantil,
- fasta sluttidsintervall,
- tidsetikett för histogram,
- stapelgeometri.

Saknade värden filtreras innan numerisk konvertering, så exempelvis `null`
aldrig kan bli ett falskt nollvärde.

## U4.5 MapEngine – geometri

`docs/assets/map-engine.js` är gemensam geometri för kartduell och Replay:

- koordinatvalidering,
- punkt längs rutt från distans,
- ruttutdrag mellan två distanser,
- terränginterpolation,
- höjdinterpolation.

RunnerReplay och kartduellen använder samma implementation. Lokala kopior av
`pointAtDistance`/`routePosition` får inte återinföras.

## U4.6 Playback

`docs/assets/playback.js` centraliserar tidskontraktet för animerad uppspelning.

Tillåtna hel-loppstider är:

- 30 s,
- 60 s,
- 120 s,
- 180 s.

Standard är 120 s. Samma modul används av AppState, RunnerReplay och kartduellen
för normalisering, rate och distanssteg.

## U4.7 vendrad Leaflet 1.9.4

Kartmotorn är inte längre beroende av att hämta Leaflet-kod från en extern CDN
vid runtime.

Exakt Leaflet 1.9.4 finns lokalt i:

`docs/vendor/leaflet-1.9.4/`

Vendringen innehåller:

- `leaflet.js`,
- `leaflet.css`,
- Leaflets image-assets,
- BSD-2-Clause-licensen,
- `VENDOR_INFO.txt` med låst version och källa.

CI verifierar officiella SHA-256/SRI-värden för JavaScript och CSS. Runtime-kod
får inte referera till `unpkg.com/leaflet`.

OpenStreetMap-kartplattor är fortfarande nätverksresurs; vendringen gäller
själva Leaflet-biblioteket och dess lokala assets.

## U4.8 MapEngine – Leaflet-bootstrap

MapEngine äger även Leaflet-bootstrap:

- återanvänder redan laddad `window.L`,
- injicerar lokal Leaflet CSS/JS när biblioteket saknas,
- använder lokal vendor-root,
- returnerar kontrollerat `false` utan DOM,
- lämnar kartduellens befintliga förenklade banvy som fallback.

Browserns runtime-root binds explicit in i factoryn. Detta verifieras både i
Node och i verklig Chromium eftersom en tidigare testvariant med explicit fake
root inte täckte browservägen.

## U4.9 RaceMedia

`docs/assets/race-media.js` är det kanoniska media-API:t.

Det ansvarar för:

- race family → musik,
- `mediaForRace()`,
- `applyAudioSource()`,
- befintlig social footer-installation.

Huvudappen och kartduellen använder `RaceMedia`. Aliaset
`RACE_MEDIA_CONFIG` exponeras endast för bakåtkompatibilitet.

## Browser- och regressionsgrind

Ordinarie CI verifierar efter U4 fortfarande U0/U2 golden master,
RaceEdition/CourseVersion-kontrakt och U3-modulär dataparitet innan frontendtest.

JavaScript-grinden verifierar därefter modulkontrakt och förbjuder bland annat
att ansvar flyttas tillbaka till `app.js`, `map.js` eller RunnerReplay.

Chromium-smoketestet verifierar fortsatt:

- active → core → full för UV90,
- samma fasordning vid byte till UV45,
- huvudvyn och resultatsökning,
- individuell Replay för finisher, DNF och partiella splits,
- direkt UV90-kartlänk,
- direkt UV45-kartlänk,
- flerårsduell,
- rätt RaceEdition/CourseVersion,
- rätt RaceMedia,
- fungerande kartboot med lokal Leaflet,
- noll console- och networkfel i de verifierade appflödena.

## Cachepolicy

När ett redan publicerat U4-asset ändras måste dess query-version i HTML bumpas.
Detta förhindrar att en återkommande besökare kombinerar ny `app.js`/`map.js`
med äldre `MapEngine` eller `RaceMedia`.

U4.8/U4.9 använder cache-nyckeln `20260923-u4b` för de ändrade runtime-assets.

## U4-status

Efter U4.1–U4.9 finns en gemensam frontendkärna för datahydrering,
lopppresentation, state-defaults, diagrammatematik, kartgeometri,
uppspelningstiming, Leaflet-bootstrap och race-media.

U4 ändrar inte den verifierade U2-databasen eller U3:s fysiska datalager.
Frontendrefaktorn kan därför granskas och återställas oberoende av data- och
identitetsmigreringarna.
