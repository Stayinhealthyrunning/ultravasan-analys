# U2 legacy identity migration

## Verifierad legacy-baslinje

Den read-only audit som körs i GitHub Actions mot den incheckade U0-databasen
(SHA-256 `fff9367a432186f2cab5de2a9263d67fa4dcf981a8144c1337d0948177734f8c`)
bekräftar:

| Mått | Antal |
| --- | ---: |
| Resultat | 24 422 |
| Splits | 139 910 |
| Athlete-rader | 16 594 |
| Externa ID:n | 20 805 |
| VasaNerd person-ID:n (`idpe`) | 9 571 |
| Mika resultat-ID:n | 11 234 |
| Athlete med flera utgåvor | 4 536 |
| Athlete med flera kalenderår | 4 511 |
| Athlete som blandar VasaNerd och Mika | 1 938 |
| Overifierade flerutgåve-athlete utan person-evidence | 1 054 |

### Avgörande fynd

De 1 938 källöverskridande athlete-grupperna innehåller **inga** fall där
VasaNerd och Mika beskriver samma loppår/prestation inom samma athlete-grupp.
Antalet deterministiskt verifierbara VasaNerd–Mika-par är därför **0**.

Det innebär att den gamla källöverskridande kopplingen inte kan uppgraderas till
verifierad personidentitet. Samtliga sådana Mika-resultat ska göras
editionslokala tills separat evidens finns.

## Klassificering före migration

| Klass | Athlete | Resultatrader som saknar person-evidence |
| --- | ---: | ---: |
| Fullt VasaNerd-stödda personer | 7 633 | 0 |
| Delvis stödda: VasaNerd-person + legacy-Mika | 1 938 | 2 656 |
| Mika/annan källa, redan editionslokal | 5 969 | 0 |
| Overifierad flerutgåvelänk utan person-evidence | 1 054 | 2 609 |

De 2 656 osäkra resultatraderna i de delvis stödda grupperna består av:

- UV45: 1 917
- UV90: 739

De 2 609 resultatraderna i de 1 054 rena legacy-flerutgåvegrupperna består av:

- UV45: 2 450
- UV90: 159

## Migreringsplan

Migrationen gör **4 211** identitetsoperationer:

1. **2 656** Mika-resultat lossas från en VasaNerd-person eftersom samma
   prestation inte kan styrkas deterministiskt.
2. **1 555** ytterligare resultat lossas från Mika-flerutgåvegrupper utan
   person-evidence. Ett resultat per gammal grupp behålls på den ursprungliga
   lokala athlete-raden; övriga utgåvor får egna lokala athlete-rader.
3. Varje flyttat resultat behåller sitt exakta `result.id`, alla splits och sitt
   råa provider-ID.
4. Den gamla kopplingen sparas i `athlete_match_candidates` med beslut
   `pending-review`; informationen går alltså inte förlorad.
5. Alla 20 805 externa ID:n klassificeras i `identity_evidence`.
6. Endast VasaNerds 9 571 `idpe` får skapa verifierade `person_key`.

## Verifierat resultat på databaskopia

GitHub Actions har applicerat hela migrationen på en byteidentisk kopia av den
incheckade 62 MB-databasen och därefter kört regressionssviten.

Efter migrationen:

| Mått | Antal |
| --- | ---: |
| Athlete-rader | 20 805 |
| Verifierade person_key | 9 571 |
| identity_evidence | 20 805 |
| pending-review-kandidater | 4 211 |
| Kvarvarande cross-source athlete | 0 |
| Kvarvarande flerutgåve-athlete utan VasaNerd person-evidence | 0 |
| Resultat | 24 422 |
| Splits | 139 910 |

Skyddade resultatfält, samtliga splitrader, råa externa ID-värden och
`source_records` får samma logiska SHA-256 före och efter migrationen.

## Produktionsgrind

Produktionsdatabasen migreras inte av vanlig CI. Workflow
`.github/workflows/migrera-u2-identiteter.yml` kräver:

- manuell `workflow_dispatch`,
- markerad bekräftelse,
- exakt text `MIGRATE-U2-IDENTITY`,
- körning mot `main`,
- godkänd U0-golden master före förändring,
- automatisk backup-tag före skrivning,
- full migration, webbexport, U2-baseline, Python/JavaScript-tester och verkligt
  Chromium-flöde innan commit,
- en strikt whitelist över vilka filer som får ändras.

Om någon grind faller sker ingen commit till `main`.
