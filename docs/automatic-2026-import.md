# Automatisk import av Ultravasan 2026

Workflowen **Import official Ultravasan 2026 results** körs högst en gång per dag. Schemakörningar före 2026-08-16 och efter 2026-09-15 avslutas utan import. Den kan även startas manuellt från Actions med `check-2026` eller med den helt ofarliga `simulate-2025`.

## Källa och kvalitetsgrindar

Endast `https://results.vasaloppet.se/` används. Eventkoder för UV90 och UV45 upptäcks från den officiella Mika-katalogen och måste ange rätt lopp och år. Gamla eventkoder återanvänds inte.

Innan produktionsfiler ändras krävs en komplett import i en temporär SQLite-kopia. Grinden kontrollerar bland annat rimlig fältstorlek, statusar, checkpointtäckning, okända och uppskattade passager, stigande tider, Mora mot sluttid, dubbletter, same-race-identitetskollisioner, SQLite-integritet och foreign keys. Historiska resultat och splits, inklusive UV90 2016 och all tidigare UV45-historik, jämförs semantiskt före och efter.

Importen körs en andra gång från cache. Antal resultat/splits och en stabil digest av all 2026-data måste vara identiska. Om den officiella datan är identisk med den redan publicerade versionen skapas varken commit eller deployment.

## Publicering

Efter godkänd dry-run promoveras exakt den verifierade databaskopian, webbexporterna byggs och alla Python- och JavaScript-tester samt datagrindar körs. Workflowen committar endast de uttryckliga data-, konfigurations- och manifestfilerna. Därefter publiceras `docs/` explicit med GitHub Pages Actions. Sista jobbet jämför den publika JSON-filens SHA-256 med committen. Först därefter avslutas en verklig publiceringskörning som `SUCCESS`.

## Manuell körning och avstängning

1. Öppna **Actions → Import official Ultravasan 2026 results → Run workflow**.
2. Välj `simulate-2025` för en representativ källa-till-export-kontroll som aldrig skriver produktionsdata.
3. Välj `check-2026` för samma konservativa kontroll som schemat använder. Datumgrinden gäller även manuellt.

Automation stängs av genom att inaktivera workflowen i GitHub Actions eller ta bort/kommentera dess `schedule`-trigger. Vid fel: öppna körningens steglogg och den uppladdade rapportartefakten `official-2026-import-*`. Parser-, kvalitets- eller Pages-fel ger `FAILURE`; vänteläge redovisas uttryckligen som **Ingen publicering**.

Ingen SMTP- eller egen e-postkod används. GitHubs vanliga Actions-notifieringar är notifieringssignalen. Användaren måste själv aktivera Actions-mejl i GitHub och se till att notifieringarna inte är begränsade till enbart misslyckade körningar om även lyckad publicering ska skickas via e-post.
