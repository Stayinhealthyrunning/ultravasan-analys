# U7 Historik 2.0 – kontrakt, jämförbarhet och verifiering

## Mål

U7 moderniserar de historiska analysytorna utan att skapa en parallell identitets-
eller jämförbarhetslogik. All flerårig prestationsanalys ska bygga ovanpå U2:s
`HistoryEngine` och U1:s RaceEdition/CourseVersion-kontrakt.

U7 omfattar:

- Klasshistorik och Klassutveckling,
- Löpararkivet/personhistorik,
- Hall of Fame,
- Årets fingeravtryck.

Grundprincipen är att **deltagande kan beskrivas över loppår, men
whole-course-prestationsmått får inte bindas samman mellan olika RaceEditions
utan ett explicit verifierat whole-course-jämförbarhetskontrakt**. CourseVersion
är i första hand kontraktet för checkpoints och segment och är inte i sig bevis
för att två hela loppbanor är prestationsmässigt likvärdiga.

## Gemensam History Intelligence

Ny `docs/assets/history-intelligence.js` är U7:s gemensamma domänlager. UI får
inte längre bygga egna flerårsregler för Hall of Fame, fingeravtryck eller
personhistorik.

Modulen återanvänder:

- `RaceContracts` för RaceFamily, RaceEdition och CourseVersion,
- `HistoryEngine` för verifierad personidentitet och jämförbarhetsserier,
- `DataIndex` för resultatspecifika passager,
- `ResultStatus` för start-/mål-/DNF-klassning.

## Jämförbarhetsnyckel

För whole-course-prestation används endast RaceEditionens explicita
`whole_course_comparison_group`. Om ingen sådan grupp är deklarerad skapas
ingen flerårig whole-course-jämförbarhetsserie; RaceEditionen förblir isolerad
för sluttid och helbanefart.

Två resultat inom **samma RaceEdition** är naturligtvis direkt jämförbara i
sluttid. Mellan olika RaceEditions krävs däremot en gemensam, uttryckligen
verifierad whole-course-grupp. Samma CourseVersion kan fortfarande tillåta
checkpoint- och segmentjämförelser, men får inte ensam öppna en flerårig
sluttidsjämförelse.

## Personhistorik

Flerårig personhistorik kräver U2-verifierad identitet.

Följande får inte ensamma skapa en historisk person:

- namn,
- startnummer,
- `athlete_id`,
- liknande stavning,
- samma klubb eller ort.

När identiteten är verifierad visas alla länkade lopp i tidslinjen, men
fullföljda resultat delas upp i separata whole-course-jämförbarhetsserier.

För varje serie redovisas:

- ingående år,
- whole-course-jämförbarhetsgrupp och CourseVersion som metodkontext,
- antal jämförbara målgångar,
- bästa tid,
- första och senaste jämförbara lopp,
- tidsförändring inom serien.

Det valda resultatets serie används som fokus när resultatet själv är en
fullföljd del av en serie. Andra fullföljda lopp får visas, men påverkar inte
utvecklingstalet.

Om identiteten inte är verifierad visas endast det enskilda publicerade
resultatet.

## Klasshistorik och Klassutveckling

Deltagarantal och fullföljande får följas mellan år även när banan ändras.
Medianfart och median sluttid behandlas däremot som prestationsmått.

Varje klasspunkt har därför en jämförbarhetsnyckel.

När två efterföljande observationer tillhör samma jämförbarhetsserie:

- fartdelta beräknas,
- tempoändring visas,
- spåret får bindas samman,
- animationen får interpolera mellan punkterna.

När whole-course-jämförbarhetsnyckeln ändras eller saknas:

- fartdelta sätts till saknat,
- spåret bryts,
- Klasshistorikens sluttidslinje bryts,
- animationen tonar ut den gamla punkten och in den nya i stället för att
  interpolera en mellanprestation,
- en markerad banversionsgräns visas i Klassutveckling,
- tooltip/status förklarar att farttrenden bryts.

Det förhindrar att en förändring i banlängd, årssträckning eller annan
whole-course-evidens presenteras som en fysiologisk eller prestationsmässig
utveckling. En oförändrad CourseVersion räcker inte för att överbrygga denna
gräns.

## Årets fingeravtryck

Fingeravtrycket använder index 100 som historisk normalnivå.

### Prestationsmått

Följande mått använder endast andra RaceEditions med samma whole-course-
jämförbarhetsnyckel som det valda loppet:

- Mediantidsindex,
- Fartnivå,
- DNF-belastning.

Referenspopulationen byggs i två steg:

1. varje jämförbart loppår sammanfattas separat,
2. historisk normalnivå är medianen av dessa loppårssammanfattningar.

Därmed väger varje loppår lika som historisk observation. Ett år med dubbelt så
många deltagare får inte automatiskt dubbelt inflytande över normalnivån.

Minst två andra jämförbara loppår krävs för att ett prestationsindex ska
publiceras.

Mediantidsindex över 100 betyder längre mediantid än historisk jämförbar
normalnivå. Fartnivå över 100 betyder snabbare medianfart. DNF-belastning över
100 betyder högre DNF-andel.

Indexen är deskriptiva. De förklarar inte om en skillnad beror på väder,
underlag, startfält, pacing eller andra orsaker.

### Deltagandemått

Kvinnorepresentation och fältstorlek är inte banprestationsmått och kan därför
jämföras mellan CourseVersions inom samma RaceFamily.

Kvinnorepresentation döljs när ett könsfilter är aktivt eftersom måttet då blir
cirkulärt.

Aktiva köns-, klass-, klubb/ort- och statusfilter appliceras på samma sätt på
referensåren som på det valda året.

## Hall of Fame

### Flest lopp

Kräver verifierad personidentitet. Antalet fullföljda lopp kan summeras över
CourseVersions eftersom måttet endast beskriver antal genomföranden och inte
jämför tider.

### Mest förbättrad

Kräver verifierad personidentitet och minst två fullföljda lopp inom samma
whole-course-jämförbarhetsserie. Förbättringen är skillnaden mellan seriens
första och senaste sluttid. Om en person har flera jämförbara serier behandlas
de separat.

### Jämnast

Kräver verifierad personidentitet och minst tre fullföljda lopp inom samma
whole-course-jämförbarhetsserie. Måttet är spannet mellan snabbaste och
långsammaste sluttid i serien.

### Starkast avslutning

Detta är ett enskilt-loppmått och behöver därför inte skapa en flerårsidentitet.

Segmentet väljs strukturellt från CourseVersion:

- Evertsberg → mål när Evertsberg finns,
- annars Eldris → mål,
- annars sista explicita kontrollen → mål.

Endast exakta, ej estimerade placeringspassager vid båda segmentändarna får
användas.

Rått placeringslyft redovisas för användaren, men rankningen normaliseras som:

[
100 	imes rac{vunna placeringar}{antal faktiska startande}
]

Det minskar biasen från att ett stort startfält erbjuder fler möjliga
placeringar att vinna än ett litet.

## Metodik i (i)-förklaringar

U7 ersätter de generiska hjälptexterna för de berörda ytorna med utförliga
förklaringar som anger:

- vilken identitet som krävs,
- när en explicit whole-course-jämförbarhetsnyckel krävs för prestationsmått,
- vilka resultat som exkluderas,
- hur normalnivån byggs,
- hur banbyten visas,
- hur Hall of Fame-måtten beräknas,
- vilka tolkningar som inte stöds av data.

## Testgrind

### Enhetstester

`tests/test_history_intelligence.js` verifierar bland annat att:

- RaceEditions utan gemensam verifierad whole-course-grupp får olika eller saknad jämförbarhetsnyckel,
- fingeravtryckets prestationsreferens inkluderar endast loppår i samma verifierade whole-course-grupp,
- loppår är observationsenheten i normalnivån,
- könsfiltrering stänger kvinnorepresentationsindexet,
- verifierad person delas i separata jämförbarhetsserier,
- samma namn utan verifierad identitet inte skapar flerårshistorik,
- Hall of Fame-förbättring inte korsar en whole-course-jämförbarhetsgräns,
- estimerad placeringspassage inte används i stark avslutning,
- placeringslyft normaliseras mot startfältets storlek.

`tests/test_class_evolution.js` verifierar att:

- fartdelta sätts till saknat vid banbyte,
- deltagardelta kan finnas kvar,
- animationen inte interpolerar fart över gränsen,
- whole-course-jämförbarhetsgränsen exponeras i modellen och UI-koden,
- både Klasshistorik och Klassutveckling använder samma jämförbarhetsnyckel.

### Chromium

Den utökade browsergrinden verifierar med verklig data att:

- History Intelligence är laddad,
- UV90 2025 använder endast 2024 som verifierat whole-course-referensår; ett referensår visas men räcker inte för att publicera prestationsindex,
- UV90 2023 och 2026 hålls utanför 2024–2025-serien trots att CourseVersion/checkpointkontrakt delvis kan överlappa,
- fingeravtryckets metodik och referensscope syns,
- Hall of Fame renderas från U7-modellen,
- Klassutvecklingen visar minst en banversionsgräns,
- en verifierad personhistorik renderar exakt modellens jämförbarhetsserier,
- separata serier markeras i tidslinjen,
- U7:s metodförklaringar finns,
- inga console- eller nätverksfel introduceras.

## U7:s gräns

U7 förändrar inte U1–U6:s datakontrakt, identitetsmigration, RunnerAnalysis,
Course Intelligence eller importer. U8 är nästa etapp för övergripande UX,
metodpresentation, tillgänglighet och språkgranskning.
