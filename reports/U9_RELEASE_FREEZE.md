# U9 slutgranskning och release-freeze – Ultravasan Analys 2.0

## Syfte

U9 är den sista större etappen i Ultravasan Analys 2.0. Etappen lägger inte till
nya analysfunktioner. Den fryser i stället den version som byggts i U1–U8 och
gör releasekraven maskinellt verifierbara.

Release får inte betraktas som grön om någon av följande huvudgrindar faller:

- skyddad U2-data eller dess hashvärden har ändrats,
- RaceEdition/CourseVersion-kontrakten bryts,
- verifierad personidentitet eller historikregler regresserar,
- den modulära laddningen tappar sina prestandavinster,
- JavaScript-/Python-regressionstester faller,
- verklig Chromium får console- eller nätverksfel,
- mobil-, tablet- eller desktopbredd skapar dokumentöverflöde,
- någon U1–U8-metod- eller domänmodul saknas.

## Fryst databasnivå

U9 använder U2-baslinjen som skyddad datareferens.

Frysta huvudtal:

- 22 RaceEditions,
- 24 422 resultat,
- 139 910 passager,
- U2-identitetskontrakt: `u2-person-key-v1`.

`tools/u9_release_audit.py` räknar SHA-256 på de filer som U2-baslinjen skyddar
och kräver exakt matchning. U9 får alltså inte råka förändra resultat, passager,
externa identiteter eller webbexport som en bieffekt av UI-/releasearbete.

Databasens integritetskontroll ska fortsatt vara `ok`, och skyddade
nollkontroller för bland annat foreign keys, dubbletter och frikopplad
identitetsevidens ska vara noll.

## Kända rådatatillstånd som inte "städas bort"

U9 ändrar inte historiska källobservationer för att göra datan snyggare.
U0/U2-baslinjerna och tidigare importer är fortsatt auktoritativa.

Det innebär bland annat att kända källstatusar och ofullständiga observationer
behålls som de faktiskt importerades. Analyslagret ska hantera sådana fall
konservativt via ResultStatus, identitetskontrakt och CourseVersion-regler i
stället för att skriva om rådata.

## Red-team: identitet

Följande skydd ska fortsätta gälla:

- namn får inte ensamt skapa flerårig person,
- startnummer får inte ensamt skapa flerårig person,
- legacy `athlete_id` får inte användas som genväg mellan loppår,
- samma namn inom samma lopp får inte kollapsas till samma person,
- flerårig historik kräver verifierad personidentitet,
- osäkra identiteter hålls isär hellre än slås ihop fel.

U2:s baseline och identitetstester är därför en del av U9-grinden, inte historisk
dokumentation som kan ignoreras.

## Red-team: banor och historiska jämförelser

U9 fryser följande regel:

> Prestationsmått mellan loppår får endast kopplas samman när
> whole-course-jämförbarheten är explicit tillåten.

Det innebär att CourseVersion-gränser fortsatt ska bryta:

- personens tidsutveckling,
- Klasshistorikens sluttidslinje,
- Klassutvecklingens fartlinje och animation,
- Hall of Fame-måtten Mest förbättrad och Jämnast,
- Årets fingeravtrycks prestationsreferens.

Deltagandemått som antal startande kan däremot beskrivas över banbyten.

Historisk display-geometri är inte automatiskt bevis för exakt historisk
tävlingsgeometri. U6:s metodgräns gäller även efter release.

## Red-team: DNF, DNS och saknade passager

U9 ändrar inte den konservativa statusmodellen:

- DNS räknas inte som faktisk start,
- DNF ska inte ges en konstruerad målgång,
- saknad passage fylls inte med en påhittad officiell observation,
- beräknad position mellan passager är en rekonstruktion och inte individuell GPS,
- estimerade passager får inte användas som exakta placeringspassager i
  Hall of Fame-mått som kräver exakta placeringar.

Tomt/ej jämförbart är ett giltigt och önskat resultat när evidensen saknas.

## Modulär laddning och prestandabudget

U3:s modulära arkitektur är ett releasekrav.

Senast observerade U8-nivåer i CI:

- största first paint för aktivt lopp: 1 087 000 byte,
- största first paint inklusive katalog: 1 339 829 byte,
- största familjekärnas reduktion mot legacy: 82,7 %,
- aktiv RaceEdition-kärnas reduktion mot legacy: 97,5 %,
- största kompletta RaceEdition-reduktion mot legacy: 88,1 %.

U9 fryser följande fail-closed-budgetar:

- first paint ≤ 1 150 000 byte,
- first paint inklusive katalog ≤ 1 450 000 byte,
- familjekärnans reduktion ≥ 80 %,
- aktiv RaceEdition-kärnas reduktion ≥ 95 %,
- komplett RaceEdition-reduktion ≥ 85 %.

Budgetarna ligger med avsikt något utanför dagens faktiska värden. Små legitima
ändringar kan därmed göras senare, men en tydlig återgång mot den 42 MB stora
legacy-monoliten ska stoppa CI.

Huvudsidan får inte direkt ladda `data/ultravasan-data.js`.

## Responsiv release-freeze

Den verkliga Chromium-grinden kör samma applikation vid tre explicita
viewportkontrakt:

| Viewport | Tillåten dokument-overflow | Metodguidens kolumner |
|---|---:|---:|
| 390 × 844 | ≤ 2 px | 1 |
| 900 × 900 | ≤ 2 px | 2 |
| 1536 × 1024 | ≤ 2 px | 4 |

Interna tabeller och horisontellt scrollbara komponenter får själva hantera sitt
innehåll, men hela dokumentet får inte bli bredare än viewporten.

Detta kompletterar den befintliga Chromium-grinden som redan verifierar bland
annat UV90/UV45-byte, progressiv dataladdning, löpardialog, Journey, favoriter,
Replay, Direktjämförelse, Course Intelligence, History Intelligence och kartfall.

## U8-UX som ingår i frysen

Releasegrinden ska bevara:

- semantisk H1 och skip-länk,
- korrekt `aria-pressed` för loppväxlaren,
- tangentbordsöppning av resultatrader,
- metod-/datakvalitetsguiden,
- filter- och dataladdningsstatus,
- tooltiprelationer,
- `aria-current` i analysnavigering,
- reduced-motion-stöd,
- finish progression,
- fartretention,
- Q25–Q75,
- klass- och klubb/ort-gruppvyer.

## Maskinell U9-audit

Konfigurationen ligger i `config/release_freeze.json`.

Auditen ligger i `tools/u9_release_audit.py` och kontrollerar:

1. frysta totaler,
2. SHA-256 för U2:s skyddade filer,
3. U2-integritetskontroller,
4. att U1–U8:s obligatoriska rapporter finns,
5. att centrala frontenddomänmoduler finns,
6. att huvudsidans laddningsordning är korrekt och monoliten inte laddas direkt,
7. att CI fortfarande innehåller golden master, race contracts, modulär kontroll,
   JavaScript-test och riktig Chromium,
8. U3:s storleks- och reduktionsbudgetar när modulrapporten matas in.

CI kör auditen direkt efter att U3:s modulära export verifierats.

## Fail-closed-test

`tests/test_u9_release_audit.py` innehåller både positiv och negativ kontroll.

Den negativa kontrollen matar auditen med ett artificiellt first-paint-värde på
9 MB. Auditen måste då bli röd. På så sätt testar vi inte bara att den gröna
vägen fungerar, utan även att releasebromsen faktiskt stoppar en regression.

## Vad U9 inte gör

U9:

- ändrar inte resultatdata,
- skapar inte nya identiteter,
- ändrar inte CourseVersions,
- korrigerar inte historiska källfel,
- ändrar inte analysformlerna i U5–U8,
- inför inte en ny produktfunktion.

Om U9 hittar ett fel ska felet rättas i minsta möjliga yta och hela grinden
köras om.

## Releaseordning

Arbetet är staplat för att undvika att omergeade etapper blandas ihop:

1. PR #35 – U6,
2. PR #36 – U7,
3. PR #37 – U8,
4. U9-PR – slutgrind och freeze.

U9 ska inte mergeas före de underliggande etapperna. När de har mergeats i
ordning ska U9 retargetas/renodlas mot `main`, hela CI köras igen och först
därefter kan Ultravasan Analys 2.0 betraktas som releasefryst.
