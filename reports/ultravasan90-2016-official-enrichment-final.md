# UV90 2016 – officiell splitberikning, slutrapport

## Beslut

**PRODUKTIONSBERIKNING GENOMFÖRD OCH VERIFIERAD.** Ingen publicering, commit, push, PR, merge eller stash-operation gjordes.

## Omfattning

- Race-key: `ultravasan90-2016`
- Race-id: `9`
- Officiellt event: `UL90_9999991678885A00000004CC`
- Resultatsökväg: `2017`
- Officiella listposter / unika idp / detaljsidor: `986 / 986 / 986`
- HTTP-fel / parserfel: `0 / 0`
- Säkra unika matcher: `985`, samtliga nivå 1
- Tvetydiga / motstridiga / omatchade: `0 / 1 / 0`
- Befintliga resultat utan säker officiell match: `1`

Den enda konflikten var `9999991678885A000026D718`, officiellt namn `Guldstrand Frosth, Tommy` och befintligt namn `Guldstrand, Tommy`. Posten hoppades över och fick inga splits.

## Apply och idempotens

- Första atomiska körningen: `6190` inserts, `0` updates, `0` no-op
- Andra atomiska körningen: `0` inserts, `0` updates, `6190` no-op
- Splits för race-id 9 före / efter: `0 / 6190`
- Nya officiella källposter: `998` (`12` listsidor och `986` detaljsidor)
- Results-delta / athletes-delta / personkopplingsdelta: `0 / 0 / 0`
- Resultat, athletes, personkopplingar, lopp, checkpoints och sources är radidentiska med backupen.
- Splits för UV45 och alla andra UV90-år är radidentiska med backupen.

## Checkpointtäckning

- Smågan: `798`
- Mångsbodarna: `804`
- Risberg: `801`
- Evertsberg: `787`
- Oxberg: `765`
- Hökberg: `747`
- Eldris: `744`
- Mora: `744`
- Fullföljare med komplett officiell serie före konfliktskip: `738`
- Berikade fullföljare med komplett serie: `737`
- Officiella DNF med minst en passage: `58`
- Två officiella `Startat`-poster hade fem verkliga passager; uppskattade framtida rader ignorerades och deras befintliga DNF-status ändrades inte.

## Datakvalitet och avgränsade källproblem

Inga blockerande datakvalitetsproblem återstår i produktionsdatabasen. Det finns inga dubbletter, uppskattade splits, negativa/noll tider, icke stigande passager, passager efter mål, Mora/sluttidsavvikelser, orimliga farter, uppfunna total-/klassplaceringar eller segmenttider över en saknad kontroll.

Dokumenterade källavvikelser:

- Patrik Brants och Emmanuel Gault: uppskattade framtida källrader ignorerades.
- Jörg Hans, Jim Lagerqvist, Benni Olsson, Henrik Pihl, Amanda Ranch och Bo Wahlund: fullföljare med ofullständig officiell serie och saknad segmentgrund.
- Henrik Söderholm: uppskattad Hökberg-rad ignorerades; officiellt Eldris-råvärde bevarades, men ingen segmenttid över kontrollgapet lagrades.
- Tommy Guldstrand/Guldstrand Frosth: namnkonflikt, helt överhoppad.

## Källspårning

- Befintliga slutresultat har fortsatt `vasanerd` som källa.
- Varje införd split har rå officiell splitdata och referens till `vasaloppet_mika`-källpost.
- Officiellt event, idp, URL, HTTP-status, hämtningstid, SHA-256, relativ cachefil och import-run kan följas utan schemaändring.
- `986` deltagardetaljer och `12` listsidor finns som källposter; inga personliga absoluta cachesökvägar lagrades.

## Representativa löpare

Jarle Risa, Sarah Bard, Andreas Hermansson, Evald Ammerlind, Åsa Bergqvist, Annika Askengren Berg, Karin Artursson, Magnus Backlund och Ingemar Andersén har åtta splits. Moa Alpsten har DNF och fem verkliga passager.

Andreas Hermansson är oförändrad som result-id `11545`, startnummer `1025`, klass `M21`, sluttid `07:18:00`, totalplacering `22`, könsplacering `20` och klassplacering `11`. Hans åtta officiella passager börjar med Smågan `00:41:16` och slutar med Mora `07:18:00`.

## Verifiering

- Python: `59 passed`, dessutom `29 subtests passed`
- JavaScript: samtliga `8` testfiler passerade
- `uvtool validate`: `0 problem`
- SQLite `integrity_check`: `ok`
- SQLite foreign-key check: inga problem
- `git diff --check`: godkänd
- Lokal headless Chrome: Andreas, DNF, partiell serie, UV90 2015/2017 och UV45 2016 verifierade med sökning, karta, segment, jämförelser och replay; inga konsolfel eller HTTP-fel.
- Löparsökningens årlista byggs nu om korrekt vid växling mellan UV90 och UV45; `app.js` har en cacheversion i `index.html` och ett regressionsskydd i JavaScript-sviten.

## SHA-256

Före import / i backup:

- SQLite: `D8AF1E7F9B75AC7652989FE1C56E45424DE20B151C7A6CD548DA850B8873B596`
- JSON: `40917A0E90CBCCC15B5482E95B1D81C7D99B9471283C469C130DF8C67C2C152B`
- JavaScript-export: `BF688459AB29E3531E57374F82FDB8FD1D38EB930709D0E9903E80F2542F9D47`

Efter import och export:

- SQLite: `1977BDC8156802BB96D663750E0B3AC407F44128CDA78AB85F6C3AC1EB9BEEEA`
- JSON: `BA9469ED97E41C995FDB9797921684C22DDBD640DBEDB1C0777B8C65146603C7`
- JavaScript-export: `00E1674C2E26BE840C5E2252BB66150FB5CF020C2C04C9FDFCF7C3C26DD65D34`

Backup: `tmp/backups/uv90-2016-official-apply-20260717T131643Z/`.
