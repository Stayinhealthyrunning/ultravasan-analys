# U1: kompletta utgåvor och explicita källbindningar

## Utgångspunkt och omfattning

Bas: Ultravasan main efter PR #22 (`80d6a16`). Referens: Gotaleden main
`7ee0b1c`, inklusive den senaste ändringen av delningsbilder. Gotaleden ändras
inte av denna etapp. U0:s 22 utgåvor, 24 422 resultat och 139 910 mellantider
ska fortsatt vara byteidentiska i de publicerade resultatfilerna.

Den återstående U1-etappen ska slutföra RaceEdition, SourceBinding och explicit
competition/capabilities. Katalogen ska skilja planerat lopp, konfigurerad källa
och faktiskt analyserbar data. En planerad utgåva får inte skapa resultat eller
läggas till i databasens resultatkatalog vid initiering.

## Beslut

- Källbindningar är explicita referenser från utgåva till provider/source event/
  source race. UV90:s tio historiska utgåvor har VasaNerd som primär källa;
  Mika är kompletterande källa för 2016 och 2025. Övriga tolv utgåvor använder
  Mika som primär källa. Befintliga providerfält behålls som verifierade
  kompatibilitetsfält för äldre importkommandon, inte som en andra routningsregel.
- Provider-neutral kod väljer inga URL:er eller lopp utifrån namn, prefix,
  distans eller kalendergränser. Källadaptern verifierar exakt konfigurerad
  eventkod, publiceringssökväg och källår. Okänd/ambivalent källa stoppar import.
- Alla kontroller i normal importkonfiguration ska överensstämma med den
  låsta banversionen, även UV90 2025. Den publicerade databasen migreras inte.
  En separat officiell provimport får inte skriva över den historiska modellen.
- VasaNerd får inte skapa lopp eller skriva om kontrollavstånd från årtal.
  Källår slås upp i uttryckliga bindningar före databasändringar. Ersättning
  begränsas till de bundna utgåvorna, inte alla lopp under samma kalenderår.
- Automatisk import får använda en framtida utgåva först när dess familj,
  datum, bankontrakt och källa har konfigurerats. Inga kontroller, datum eller
  källkoder kopieras automatiskt från föregående år.
- Participant entity (person/team) är skild från competition format.
  Replay, kartduell och medaljfunktion använder explicita capabilities.
  Framtida team utan stafettformat testas utan att medlemskap ger etappkoppling.

## Acceptans och nästa fas

Testa exakta källval, fel event/år/provider, dubbla bindningar, framtida utgåvor,
planerade lopp, opaque keys, team utan stafett, databasinitiering/idempotens,
VasaNerd-preflight samt befintliga import- och browserflöden. Versionslåsen för
de fem befintliga banversionerna och U0 måste vara oförändrade. Full CI ska
passera innan PR:n lämnas för granskning.

U2 förbereds med en konkret identitets-/historikaudit. Befintliga personkopplingar
ändras först i den fasen, efter att denna grund är stabil och granskad enligt
projektets beslutade arbetsordning.
