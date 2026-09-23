# U8 UX, metodik och tillgänglighet

## Mål

U8 gör Ultravasan Analys 2.0 lättare att förstå och använda utan att ändra
analyskontrakten från U1–U7. Etappen fokuserar på:

- tydligare metod- och datakvalitetskommunikation,
- bättre semantik för skärmläsare,
- tangentbordsanvändning,
- synligt fokus,
- reduced-motion-stöd,
- konsekvent svensk användartext,
- testbar UX i verklig Chromium.

## U8:s analysytor som nu låses

Den ursprungliga U8-specifikationen omfattar också fyra analysytor som redan
fanns i kodbasen när denna etapp startade. U8 gör därför ingen parallell
omimplementation, utan verifierar och låser dem som del av slutkontraktet:

- **Finish progression:** könsvyn visar antal startande och fullföljandegrad per
  loppår och redovisar DNF/DNS/DSQ i tooltip.
- **Fartretention:** delsträckans gruppfart uttrycks relativt samma grupps
  genomsnittliga loppfart, där index 100 är gruppens snittfart.
- **Q25–Q75:** delsträckevyer behåller kvartilspannet runt medianen som
  spridningsmått, beräknat med gemensam quantile-funktion.
- **Gruppvyer:** klass- och klubb/ort-vyer kan jämföra flera valda grupper över
  samma segmentaxel och har egna metodförklaringar.

Dessa delar är nu explicita regressionskrav i `tests/test_u8_ux.js`.

## Metodguide nära toppen

Huvudsidan har nu en kompakt sektion **Så läser du analysen** direkt efter
analysnavigeringen.

Guiden förklarar fyra centrala nivåer:

1. **Källvärde** – officiella/publicerade resultat, passager, placeringar och status.
2. **Beräknat** – rekonstruktioner mellan kontroller och andra estimerade vyer.
3. **Jämförbart** – prestationsserier mellan år kräver samma CourseVersion eller
   explicit jämförbarhetskontrakt.
4. **Aktuellt urval** – fältfilter påverkar fältanalyser men inte individuell
   löparsökning eller kartduell.

Guiden visar dessutom dynamiskt:

- aktiv loppfamilj och loppår,
- aktuell dataladdningsfas,
- om endast aktivt lopp, historiska resultat eller full splitdata är laddad,
- aktiva köns-, klass-, klubb/ort- och statusfilter,
- antal visade resultat av det aktuella loppets totala resultat.

Detta gör att användaren kan se vilket underlag en analys faktiskt bygger på
utan att behöva känna till den progressiva U3-laddningen.

## Semantisk grundstruktur

Huvudsidan har nu:

- en riktig, semantisk H1,
- en skip-länk till huvudinnehållet,
- ett fokuserbart main-landmärke som skip-länken landar på.

Den visuella hero-bilden behålls oförändrad.

## Loppväxlaren

UV90/UV45-växlaren byter hela analyskontexten och är därför en knappgrupp, inte
ett tab-interface.

U8 ändrar semantiken från:

- `role="tablist"`,
- `role="tab"`,
- `aria-selected`

till vanliga knappar i en namngiven grupp med `aria-pressed`.

Detta motsvarar komponentens faktiska funktion och undviker att
hjälpmedel annonserar tabpaneler som inte finns.

## Tangentbordsanvändning

Resultatrader i resultatdatabasen är sedan tidigare klickbara med mus. I U8 är
de också:

- fokuserbara med Tab,
- märkta som interaktiva,
- försedda med begriplig aria-label,
- öppningsbara med Enter,
- öppningsbara med blanksteg.

Fokus på resultatraden är visuellt tydligt.

## Informationsikoner

Varje dynamiskt skapad informationsknapp kopplas nu explicit till sin tooltip
med:

- unik tooltip-ID,
- `aria-controls`,
- `aria-describedby`,
- `aria-expanded`.

Den befintliga klick-/Escape-logiken behålls.

## Analysnavigering

Aktiv analyssektion använder `aria-current="location"`. När användaren väljer
en annan sektion flyttas `aria-current` tillsammans med den visuella
active-klassen.

Programmatisk scroll respekterar
`prefers-reduced-motion: reduce` och byter då från smooth till omedelbar
scroll.

Samma reduced-motion-regel används när klubbprofiler scrollas fram.

## Fokus och motion

U8 inför gemensam `:focus-visible`-markering för:

- knappar,
- länkar,
- details/summary,
- element som exponeras som interaktiva via role=button.

Skip-länkens övergång stängs av vid reduced motion.

## Språk

Primära användartexter har gjorts mer konsekvent svenska:

- **Head-to-head** → **Direktjämförelse**,
- **Play** → **Spela**,
- **Race Intelligence Lab** → **Loppanalyslabbet**,
- **Difficulty** i tabellhuvud → **Svårighetsindex**,
- synlig `fallback`-text → svensk reserv-/reservberäkningsformulering.

Tekniska kontraktsnamn och stabila interna identifierare behålls oförändrade,
bland annat:

- `distance-fallback`,
- `fallback_segments`,
- CSS-klasser för fallback-karta,
- CourseVersion som domänterm där den behövs för att förklara jämförbarhet.

## Responsivitet

Metodguiden visas i fyra kolumner på stor skärm, två på mellanbredd och en
kolumn på mobil. Den dynamiska kontextinformationen flyttas under introduktionen
på mindre skärmar.

## Testgrind

### Statisk JavaScript-grind

`tests/test_u8_ux.js` verifierar bland annat:

- skip-länk och exakt en H1,
- fokuserbart main-landmärke,
- korrekt knappsemantik för loppväxlaren,
- samtliga delar av metodguiden,
- dynamisk fas- och filterstatus,
- tangentbordsöppning av resultatrader,
- tooltip-relationer,
- focus-visible,
- aria-current i analysnavigering,
- reduced-motion-stöd,
- responsiv metodguide,
- finish progression,
- fartretention,
- Q25–Q75-spridning,
- klass- och klubb/ort-gruppvyer,
- metodhjälp för dessa vyer,
- gemensam U8-cachegeneration.

### Chromium

Den verkliga browsergrinden verifierar bland annat att:

- metodguiden kan öppnas,
- rätt lopp och år visas,
- full datastatus visas efter full laddning,
- filterstatus innehåller faktiskt antal visade resultat,
- loppknapparnas aria-pressed-tillstånd är korrekt,
- falsk tab-semantik inte finns kvar,
- aktiv analysnavigering får aria-current,
- en informationsknapp är korrekt kopplad till sin tooltip,
- resultatrader är tangentbordsfokuserbara,
- Enter på en resultatrad öppnar löpardialogen.

## U8:s gräns

U8 ändrar inte:

- RaceEdition- eller CourseVersion-kontrakt,
- personidentitet,
- historikjämförbarhet,
- importdata,
- Course Intelligence-matematik,
- Runner Analysis-matematik,
- Hall of Fame- eller fingeravtryckslogik.

U9 är slutlig red-team-, regressions-, prestanda- och freeze-etapp.
