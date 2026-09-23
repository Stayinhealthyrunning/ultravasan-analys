# Rapporter, metodspecifikationer och validering

Den här katalogen innehåller två typer av underlag.

## Versions- och metodrapporter

`U0_*` till `U9_*` dokumenterar kontrakt, beslut, baslinjer och
releasegrindar för Ultravasan Analys 2.0. De är versionsstyrd
projektdokumentation och ska granskas tillsammans med motsvarande tester och
kod.

Den slutliga releasegrinden beskrivs i
[`U9_RELEASE_FREEZE.md`](U9_RELEASE_FREEZE.md).

## Import- och valideringsrapporter

Övriga rapportfiler skapas eller uppdateras av import- och
valideringsarbetsflöden, bland annat när `probe_official`,
`scrape_official` eller `discover_events` körs. De visar testade adresser,
HTTP-läge, antal deltagare, parserutfall och eventuella varningar.

Genererade import-/probe-rapporter är evidens för en viss körning och ersätter
inte U0–U9:s explicita kontrakt eller releasekrav.
