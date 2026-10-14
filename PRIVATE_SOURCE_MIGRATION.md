# Privat källhämtning

UltraVasans identifierande SQLite-original och källfiler för banproveniens
lagras i det privata repot `Stayinhealthyrunning/loppanalys-private-data`.
De återställs endast i en tillfällig Actions-arbetsyta och verifieras mot det
privata manifestet innan test, export eller analys.

Produktionskrav för läsning:

- `LOPPANALYS_SOURCE_APP_ID`
- `LOPPANALYS_SOURCE_APP_PRIVATE_KEY`

GitHub-appen ska vara installerad endast på det privata källrepot och ha
`Contents: read`. Saknas en hemlighet, ett källobjekt eller korrekt SHA-256
stoppas jobbet innan tester eller publicering. Den privata checkouten tas bort
även när verifieringen misslyckas.

Lokalt kan en behörig privat checkout verifieras utan nätåtkomst:

```text
python tools/restore_private_sources.py --private-root ../loppanalys-private-data
```

Rådatabasen, GPX-, KMZ- och DEM-källor är ignorerade i det publika repot och
får inte stageas, visas som läsbar PR-diff eller ingå i Pages-, Actions- eller
Release-artefakter.

## Skrivande importer

Befintliga importflöden som committar `data/ultravasan.sqlite` till det publika
repot får inte användas efter migreringen. De ska ersättas av två separata
steg: en skrivbegränsad GitHub App skapar först en privat käll-PR; efter merge
hämtar den publika byggkedjan den godkända databasen med läsappen och committar
endast GDPR-filtrerade webbexporter. Skrivappen behöver separat `Contents:
write` och `Pull requests: write` endast på det privata repot. Den får inte
återanvända läsappens nyckel.

Den publika borttagnings-PR:n ska vara Draft tills läsappen är konfigurerad och
full CI har passerat från den privata kopian. Produktionsimporter får inte
aktiveras förrän även den separata privata skrivvägen är verifierad.
