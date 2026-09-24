# U6 Course Intelligence – kontrakt, metod och verifiering

## Mål

U6 gör banan till en egen, verifierbar analysdimension utan att skapa nya
heuristiska lopp- eller banidentiteter. Analysen bygger vidare på U1:s
RaceEdition/CourseVersion-kontrakt, U3:s datalager och U4:s MapEngine.

U6 består av två sammanhängande delar:

1. **Course Intelligence** – segmentvis terräng-, pacing-, spridnings-, placerings-
   och DNF-analys med ett relativt Difficulty-index.
2. **Måltempo / loppplan** – en måltid fördelas över CourseVersion-segment med
   historiskt observerade segmentandelar när verifierat underlag finns.

Ingen av delarna får fylla saknade ban- eller passageuppgifter med tysta
antaganden.

## Två separata distansaxlar

U6 skiljer strikt mellan två typer av avstånd.

### Tävlings-/timingaxel

CourseVersion-kontraktets checkpoints och segment används för:

- segmentens ordning,
- officiell/kontrakterad segmentdistans,
- fartberäkningar,
- segmenttider,
- måltempo.

En segmentände måste finnas explicit i CourseVersion. Namn, ungefärlig distans,
årtal eller GPS-närhet används inte för att skapa en saknad checkpoint.

### Display-/terrängaxel

Den låsta display-rutten används för:

- karta,
- höjdprofil,
- stigning och nedför,
- terrängvisning.

Display-rutten kan vara en verifierad GPX från ett referensår. Den verifierar
därför inte automatiskt att geometrin var exakt identisk varje historiskt
loppår. Det är ett presentations- och terrängunderlag kopplat explicit till
CourseVersion, inte en ersättning för CourseVersion-kontraktet.

När en CourseVersion-checkpoint saknar explicit display-ankare får U6 endast
interpolera dess displayposition mellan två redan explicit mappade
CourseVersion-checkpoints om checkpointens egen kontraktsdistans är känd.
Saknas den distansen lämnas displaypositionen okänd.

## Segmenturval och evidens

Fältmåtten beräknas för det valda loppåret och det aktuella filtrerade urvalet.

En timingobservation kräver:

- resultat klassat som fullföljt av ResultStatus,
- giltig sluttid,
- exakt, ej estimerad passage vid båda segmentändarna,
- positiv segmenttid,
- känd CourseVersion-segmentdistans.

Start behandlas som tid 0. Saknade eller estimerade passager exkluderas.

Minsta underlag för publicerade segmentmedianer och Difficulty är **n = 5**.

## Segmentmått

Låt

- \(t_s\) = observerad segmenttid,
- \(d_s\) = CourseVersion-segmentets distans,
- \(t_f\) = löparens sluttid,
- \(d_f\) = CourseVersionens hela tävlingsdistans.

Då är löparens segmentfart i sekunder per kilometer

\[
p_s = t_s / d_s
\]

och hel-loppsfarten

\[
p_f = t_f / d_f.
\]

### Medianfart och spridning

U6 redovisar medianen av \(p_s\) samt Q25 och Q75. Fartspridningen som används i
Difficulty är

\[
IQR = Q75(p_s) - Q25(p_s).
\]

### Pacing index och pacing loss

Individuellt pacing index är

\[
100 \times p_f / p_s.
\]

100 betyder samma fart som löparens hel-loppssnitt. Över 100 betyder att
segmentet löptes snabbare än det egna snittet och under 100 långsammare.

Pacing loss i sekunder per kilometer är

\[
p_s - p_f.
\]

Course Intelligence använder medianen över giltiga löpare. Positivt värde
betyder att segmentet typiskt går långsammare än löparnas egen hel-loppsfart.

### Placeringsrörelse

När officiell totalplacering finns vid båda segmentändarna beräknas

\[
plats_{start} - plats_{slut}.
\]

Positivt värde betyder vunna placeringar. Medianen redovisas endast när minst
fem giltiga placeringspar finns.

### DNF-exit

En DNF placeras endast efter sin **sista exakta registrerade passage**.
Löpare utan en säker passage gissas inte in på ett segment.

För ett segment från A till B är DNF-exit-rate

\[
100 \times
\frac{DNF\ vars\ sista\ säkra\ passage\ är\ A}
     {registrerade\ segmententréer\ vid\ A}.
\]

För det första segmentet används faktiska startande som nämnare. För senare
segment krävs exakt passage vid segmentstart.

## Terrängmått

MapEngine interpolerar höjd och kumulativ stigning/nedför på den låsta
display-ruttens höjdprofil.

Per segment redovisas bland annat:

- start- och sluthöjd,
- min/max-höjd,
- nettohöjdskillnad,
- stigning,
- nedför,
- stigning per display-kilometer.

Terrängmåtten ska läsas som egenskaper hos den explicit kopplade display-rutten.

## Difficulty-index

Difficulty är **relativt inom det valda loppet/CourseVersion och aktuellt urval**.
Det är inte ett absolut banbetyg och ska inte jämföras numeriskt mellan
CourseVersions som om skalan vore fysisk.

Fyra komponenter används:

1. stigning per km,
2. median pacing loss per km,
3. fartspridning (IQR) per km,
4. DNF-exit-rate.

För varje komponent omvandlas segmentets råvärde till dess percentil bland de
segment som når evidensgränsen. Högre percentil betyder mer av den egenskap som
tolkas som belastning.

En Difficulty-poäng publiceras endast när:

- timingunderlaget är minst n=5, och
- **alla fyra komponenterna** finns.

Poängen är det oviktade medelvärdet av de fyra komponentpercentilerna:

\[
Difficulty =
(P_{stigning} + P_{pacing} + P_{spridning} + P_{DNF}) / 4.
\]

Segmenten rangordnas därefter fallande inom samma analys. Om någon komponent
saknas visas ingen sammanvägd Difficulty-poäng.

## Synkroniserade vyer

Course Intelligence använder ett gemensamt valt segment för:

- banöversikt,
- höjdprofil,
- fartfördelning,
- segmenttabell,
- segmentberättelse,
- befintligt Delsträckelabb.

Klick på ett segment i någon av de tre Course Intelligence-vyerna eller tabellen
uppdaterar samma state och synkar Delsträckelabbets från-/till-kontroller.

## Måltempo / loppplan

Loppplanen är CourseVersion-bunden.

Kohorten innehåller endast fullföljare från RaceEditions som har **exakt samma
CourseVersion-ID** som det valda loppet. År med annan CourseVersion blandas inte
in för att öka underlaget.

För varje segment och löpare med exakta passager beräknas

\[
w_{i,s} = segmenttid_{i,s} / sluttid_i.
\]

Om minst fem observationer finns används medianen av \(w_{i,s}\) som segmentets
historiska vikt.

Om historiken är otillräcklig men explicit CourseVersion-segmentdistans finns
används

\[
w_s = segmentdistans / total\ CourseVersion-distans
\]

som tydligt märkt **distansfallback**.

När alla segment har en positiv vikt normaliseras vikterna till summa 1 och
måltiden \(T\) fördelas:

\[
måltid_s = T \times w_s / \sum w.
\]

UI:t visar segmenttid, kumulativ tid, måltempo och evidenskälla per segment.

Om ett segment saknar både tillräcklig historik och explicit kontraktsdistans är
planen ofullständig. U6 lämnar då segmentet oallokerat och fördelar **inte**
resttiden genom gissning.

Detta är en historiskt kalibrerad pacingreferens, inte en individuell prognos.
Väder, dagsform, underlag, energiintag och individuell terrängstyrka modelleras
inte.

## 2026 och framtida utgåvor

U6 får inte göra en framtida eller ofullständig RaceEdition analyserbar genom att
härleda saknade checkpointdistanser från en GPX.

Tester låser därför bland annat att UV90 2026-checkpoints med okänd
CourseVersion-distans förblir okända i Course Intelligence och att loppplanen
blir ofullständig tills kontraktet har tillräckligt verifierad information.

## UI-metodik

Course Intelligence-kortet och Måltempo/loppplan har egna (i)-förklaringar som
beskriver:

- syfte,
- datakällor,
- urval/evidensgräns,
- centrala formler,
- CourseVersion-gränser,
- display-ruttens begränsning,
- hur saknad data hanteras,
- hur resultat ska tolkas.

## Test- och regressionsgrind

Node-tester verifierar bland annat:

- verklig UV90 2016 CourseVersion och display-rutt,
- separation mellan timing- och displaydistans,
- terminal finish-ankare,
- konservativ interpolation av displayposition,
- att okända 2026-distanser inte gissas,
- n=5-gränsen,
- DNF-exit från sista säkra passage,
- Difficulty med exakt fyra obligatoriska komponenter,
- full historisk loppplan,
- tydligt märkt distansfallback,
- ofullständig plan när underlag verkligen saknas.

Chromium-smoketestet verifierar dessutom i den riktiga applikationen:

1. Course Intelligence laddas med verklig data,
2. segment, karta, höjd och fart renderas,
3. metodförklaringarna finns,
4. klick på ett segment synkar tabell, karta, höjd, fart och Delsträckelabbet,
5. ändrad måltid räknar om loppplanen,
6. evidenskällor syns,
7. inga console- eller nätverksfel uppstår.

## U6-status

När denna etapp är mergead finns en CourseVersion-säker Course Intelligence-kärna
med synkroniserad bananalys och en konservativ måltempo/loppplan. U6 ändrar inte
U1–U5:s identitets-, historik-, data- eller RunnerAnalysis-kontrakt.
