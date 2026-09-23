# Codex – oberoende slutrevision av Ultravasan Analys 2.0

## Roll

Du är **oberoende revisor**, inte implementatör. Utgå från att den gröna CI:n kan
missa kravfel. Försök aktivt falsifiera att releasekandidaten är färdig.

## Fasta revisionsobjekt

Ultravasan releasekandidat:

- repo: `Stayinhealthyrunning/ultravasan-analys`
- commit: `7811973bcaebfb7834fe2014c7bfb9df52ebc843`

Revisionsmatris:

- branch: `audit/ultravasan-2-master-acceptance`
- fil: `reports/ULTRAVASAN_2_MASTER_ACCEPTANCE_AUDIT.md`

Fryst Gotaleden-referens:

- repo: `Stayinhealthyrunning/gotaleden-splits`
- commit: `7ee0b1c4af306796754c2a1c1e9989e247ee383b`
- särskilt: `reports/gotaleden-final-red-team-e4.md`

## Hårda regler

1. Ändra inte produktkod, data, config, tester eller workflows.
2. Ändra inte Gotaleden.
3. Lita inte på U1–U9-rapporter som bevis. Verifiera faktisk kod, verklig data och
   browserbeteende.
4. Lita inte på mastermatrisens PASS/FAIL. Försök reproducera eller motbevisa dem.
5. Tillfälliga skript/testdata får skapas utanför tracked produktfiler.
6. Enda tracked fil du får skapa/ändra är
   `reports/CODEX_INDEPENDENT_ACCEPTANCE_AUDIT.md`.
7. Ingen merge och ingen produktfix i detta uppdrag.
8. Om något inte kan bevisas: PARTIAL/UNKNOWN, aldrig antaget PASS.

## Obligatorisk audit

### 1. Repo- och dataintegritet

Verifiera releasecommit, totalsiffror, U0/U2-hashar, source provenance,
RaceEditions, statusfördelningar, result/split-paritet och att inga äldre
editioner ändrats oavsiktligt.

### 2. Race-/course-/source-kontrakt

Sök efter all kvarvarande implicit routing från race_key, distans, år, ort eller
namn. Verifiera Event/RaceFamily/RaceEdition/CourseVersion/SourceBinding,
fingerprint/immutability, capabilities och participation/whole-course/segment
comparability.

### 3. Identitet och historik

Försök hitta vägar där namn, bib, demografi eller legacy athlete_id kan skapa
cross-year-person. Testa konflikter, samma namn inom samma lopp, saknade år och
att identity match inte automatiskt ger performance comparability.

### 4. DNF/DNS/partial data

Välj verkliga DNF-, DNS- och partiella resultat från databasen. Följ dem genom
rådata → adapter → Journey → Replay → H2H/historik. Ingen falsk målgång,
framtida passage eller fabricerad checkpoint får uppstå.

### 5. Oberoende matematiska stickprov

Räkna själv från SQLite/rå webbdata, utan att återanvända produktens
beräkningsfunktioner. Minimikrav:

- minst två UV90-finishers och två UV45-finishers,
- minst en topp- och en mittfältslöpare,
- minst ett DNF-fall,
- segmenttid och s/km,
- placering/gap där officiell passage finns,
- minst en faktisk segmentmedian,
- Q25/Q75 och, om kravbilden säger det, Q10/Q90,
- minst ett pacing-/retentionmått,
- minst ett H2H-gap,
- en måltempo/loppplan och att segmentallokering summerar exakt,
- ett Year Fingerprint-mått,
- ett Hall of Fame-/historikmått.

Redovisa råvärden, formel, oberoende resultat och produktens resultat sida vid
sida.

### 6. Gotaleden sida-mot-sida

Jämför samma användaruppgift, inte filnamn. Bedöm minst:

- profile/Journey,
- Replay,
- H2H,
- karta/höjd/synk,
- Course analysis,
- måltempo,
- finish progression,
- fartretention,
- Q25–Q75/Q10–Q90,
- gruppvyer,
- metodhjälp,
- favorites,
- historik,
- URL/deep links,
- accessibility/mobile,
- E2E/red-team.

Ultravasan får vara annorlunda där flerårsdatan motiverar det, men oavsiktlig
funktions- eller metodregression mot Gotaleden ska rapporteras.

### 7. Reproducera redan identifierade fynd

Kontrollera särskilt och säg uttryckligen CONFIRMED eller NOT CONFIRMED:

- klubb-/orthistorikens medianlinje går över CourseVersion-gräns,
- `clubHistoryImprovement()` saknar CourseVersion-comparability,
- Course Intelligence saknar Q10/Q90,
- beslutade finish-progression-nivåer
  “10/25/50/75/90 % i mål” saknas eller har misstolkats,
- ingen popstate/back-forward-implementation finns,
- ingen explicit XSS-red-team-regression finns,
- ingen Gotaleden-lik oberoende matematiksektion finns i U9,
- Ultravasan saknar riktig Playwright-svit.

### 8. Svårighetsindex

Jämför Gotaledens policy “ingen sammanslagen svårighetspoäng” med Ultravasans
fyrkomponentsindex. Kontrollera:

- exakt formel,
- referenspopulation,
- ties/percentil,
- minsta n,
- saknad komponent,
- DNF-exit-definition,
- känslighet för ett extremt segment och små n,
- om UI/copy kan feltolkas som absolut/kausalt banbetyg.

Detta är i första hand ett metodbeslut, inte automatiskt ett kodfel.

### 9. H2H

Verifiera hela beslutade komponentlistan: faktiska checkpoint-gap, segment,
pacing, placering, höjd och karta. Kontrollera cross-year. Bedöm dessutom om
2–5 deltagare i “Direktjämförelse” är en rimlig avsiktlig utvidgning eller
kravglidning från “två löpare”.

### 10. Löparprofilens “Loppets utveckling”

Verifiera i faktisk UI:

- gap mot hela fältet,
- gap mot kön,
- gap mot egen klass,
- totalplacering,
- klassplacering,
- pacingprofil,
- segment relativt egen hel-loppsfart,
- klick från analys till rätt Replay-position utan oavsiktlig autoplay/musik.

### 11. Metodhjälpstäckning

Inventera varje användarsynlig analytisk komponent. För varje komponent ska
(i)-hjälpen täcka:

- vad som visas,
- exakt metod/formel,
- datakälla,
- kohort/urval,
- tolkning,
- materiella begränsningar,
- observation vs härledning/interpolation.

Rapportera alla komponenter som saknar eller har tunn hjälp.

### 12. XSS

Gör Gotaleden-E4-lik mutation i temporär testmiljö med fientliga värden såsom
`<img src=x onerror=...>` i namn, klubb, checkpoint och relevant config/source
copy. Verifiera att markup/event inte exekveras eller skapar DOM där text
förväntas. Sök särskilt alla `innerHTML`-vägar.

### 13. URL/history

Verifiera:

- direktlänk med race/year/filter,
- reload,
- delningslänk,
- racefamiljbyte,
- browser Back,
- browser Forward,
- ogiltiga queryvärden,
- URL-state efter filterändring.

### 14. Browser/E2E

Kör befintlig full CI och browsergrind. Kör dessutom mobil/tablet/desktop och
kritiska användarresor. Bedöm uttryckligen om custom CDP-smoke är likvärdig med
det beslutade “full Playwright”-kravet. Om inte: PARTIAL/FAIL, men implementera
inte Playwright i detta uppdrag.

## Rapportformat

Skapa endast `reports/CODEX_INDEPENDENT_ACCEPTANCE_AUDIT.md`.

Rapporten ska innehålla:

1. Exakta commits som auditerats.
2. Körda kommandon och testresultat.
3. Executive summary.
4. Tabell för varje ID A1–J11 i mastermatrisen:
   - PASS / PARTIAL / FAIL / UNKNOWN,
   - bevis med fil:rad/funktion/test,
   - kort motivering.
5. Separat Gotaleden-paritetsmatris.
6. Oberoende matematiska stickprov med råvärden/formler.
7. Red-team-fynd klassade P0/P1/P2/P3.
8. Bekräftelse/avfärdande av de redan identifierade fynden.
9. Kända begränsningar.
10. En slutsektion med exakt en av:
    - `FREEZE RECOMMENDATION: YES`
    - `FREEZE RECOMMENDATION: NO`

Ett YES är endast tillåtet om inga P0/P1/P2 eller materiella FAIL/PARTIAL återstår
utan uttryckligt accepterat produktbeslut.

## Slutregel

Försök inte vara snäll mot tidigare arbete. Målet är att hitta sådant som våra
egna tester och rapporter missat. En röd audit är mer värdefull än en falskt
grön release.
