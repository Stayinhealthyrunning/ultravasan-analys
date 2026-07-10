# CSV-import utan lokal installation

Lägg en officiell CSV-fil i en undermapp med loppets `race_key`, exempelvis:

```text
imports/ultravasan90-2025/resultat.csv
```

Gå därefter till **Actions → Uppdatera resultatdatabasen → Run workflow** och välj
`uploaded_csv`. GitHub kör importen, uppdaterar SQLite-databasen och publicerar
webbplatsen. CSV-filen kan tas bort efter en lyckad import eftersom informationen
då finns i databasen.
