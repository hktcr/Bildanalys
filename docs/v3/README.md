# Bildanalys v3, urvalsrum och flerbildsanalys

## Status

Utvecklingskandidat på `feature/selection-room-v3`. Den ersätter inte `docs/index.html` och är inte produktionsverifierad.

## Kärnarkitektur

Varje bild behandlas som ett källobjekt med tre separata representationsnivåer:

1. `thumbnail`, högst 480 px, skapas sekventiellt och lazy när kortet närmar sig viewporten.
2. `preview`, högst 1800 px, skapas först när fullskärm eller jämförelse behöver bilden.
3. `original`, avkodas först för full analys och hålls inte som gridresurs.

Urvalsstatus, jämförelseval, mätområden och analysresultat hör till Bildanalys sessionen. Originalfiler ändras inte när en bild väljs bort eller tas bort ur sessionen.

## Urvalsrum

Stöder multifilimport, grid, ogranskad, behåll och bortvald status, lokal ångra historik, filter, filnamn, metadata, fullskärm med svep och tangentbord, samt val av upp till fyra bilder för jämförelse.

## Jämförelse

V3 innehåller två och fyra bilder samtidigt, delad A/B vy och överlagring. Zoom och panorering använder ett gemensamt normaliserat vytillstånd.

## Analys

Full histogram och områdesstatistik beräknas från originalets pixelupplösning. Visuella kartor beräknas på visningsrastret.

Lokal detaljsignal är gradientbaserad och får inte beskrivas som bevis för fokus eller skärpa. Pixelprovens Lab värden beräknas från den sRGB representation som webbläsaren eller RAW kedjan levererar, med D65 som vitpunkt. ΔE76 mellan sparade prov är därför en jämförelse inom denna analysrepresentation, inte en profiloberoende laboratoriemätning.

Sparade mätområden innehåller normaliserad geometri så att själva urvalet, inte bara resultatet, kan exporteras. JSON export kan beräkna SHA-256 för källfilen på begäran.

## Serieanalys

Serieanalys använder en nedskalad preview och ger endast snabba urvalsmått: medel Y prime, median, ljus clipping och lokal detaljsignal. Dessa värden får inte blandas ihop med full originalanalys.

## Lightroom

Direkt Lightroom Cloud är en separat källadapter och är inte aktiverad. Adobe kräver en registrerad och berättigad Lightroom partnerintegration samt användarautentisering och uttryckligt samtycke. När detta finns ska Lightroom renditions användas som naturlig pyramid: liten rendition för grid, större rendition för jämförelse, och original eller berättigad fullsize endast när analysen kräver det.

Tills dess är stödd väg att multiexportera bilder från Lightroom Mobile och öppna dem tillsammans i Bildanalys.

## Verifieringsgrind före merge

Kandidaten får inte ersätta `docs/index.html` förrän:

1. JavaScript syntaxkontroll passerar.
2. `tests/check_v3.py` passerar samtliga kontroller.
3. Grid med många stora JPEG filer provas utan orimlig minnesökning.
4. Fullskärm, svep, urvalsstatus och ångra provas på fysisk iPhone eller iPad.
5. Två och fyra bilders jämförelse provas med synkron zoom och panorering.
6. Rektangel, frihand, pixelprov, sparade områden och export provas mot kända syntetiska testbilder.
7. RAW fortsätter beskrivas som experimentellt tills relevanta verkliga RAF fall är verifierade.
8. Två oberoende slutgranskningar ger PASS på samma commit.
