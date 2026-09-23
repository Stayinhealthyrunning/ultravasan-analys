# Codex – kort startinstruktion för oberoende Ultravasan 2.0-audit

Detta är endast startinstruktionen. Den **auktoritativa och fullständiga** Codex-instruktionen finns i:

`reports/CODEX_INDEPENDENT_AUDIT_PROMPT.md`

Arbeta på:

- repo: `Stayinhealthyrunning/ultravasan-analys`
- branch: `audit/ultravasan-2-master-acceptance`
- releasekandidat som ska auditeras: `7811973bcaebfb7834fe2014c7bfb9df52ebc843`
- fryst Gotaleden-referens: `Stayinhealthyrunning/gotaleden-splits@7ee0b1c4af306796754c2a1c1e9989e247ee383b`

Läs först:

1. `reports/CODEX_INDEPENDENT_AUDIT_PROMPT.md`
2. `reports/ULTRAVASAN_2_MASTER_ACCEPTANCE_AUDIT.md`

Följ sedan den fullständiga prompten exakt.

Hårda regler:

- ändra inte produktkod, data, config, tester eller workflows,
- ändra inte Gotaleden,
- försök falsifiera både gröna CI-resultat och preliminära ChatGPT-fynd,
- enda tracked fil du får skapa/ändra är:
  `reports/CODEX_INDEPENDENT_AUDIT_RESULTS.md`,
- ingen merge och ingen produktfix i audit-uppdraget.

Om något inte kan bevisas ska det bli PARTIAL/UNKNOWN, inte antaget PASS.
