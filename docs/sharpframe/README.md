# SharpFrame: arbetsversion 2026-10-24

**Ny funktion: filmstopp.** Se [FILMSTOPP.md](FILMSTOPP.md) för redigerbar tidslinje, bromsning/stillbild/uppstart och faktisk WebM-export. Den nya filmen är utan ljud i denna första version.

Status: algoritm- och tillståndstester samt riktig Chromium/WebCodecs-export av syntetisk H.264-video har verifierats. Bildrutetider, frysta perioder, avbrott, källbyte och 390 px-bredd ingår. Detta är inte en generell attest för Safari/iOS, HEVC/HDR, långa filmer eller fotografisk kvalitet. Tidigare förbättringar i stillbildsdelen är bevarade.

## Förbättringar

- Brusdämpad detaljsignal som standard: lätt binomialutjämning följd av Sobel-energi. Rå Laplacian och det äldre kombinationsmåttet finns kvar som jämförelser.
- Valfritt, konservativt RGB-baserat likhetsfilter. Avstängt från början eftersom små motiv- och ansiktsförändringar kan missas.
- Valfri tätare sökning runt tidsmässigt separerade kandidater, högst 80 extra söktider utöver högst 600 grundstickprov. Inte analys av varje videoruta.
- Förhandsbesked om faktiskt samplingsteg, även när långa intervall glesas ut. Korta klipp under 0,1 sekund kan väljas utan att slutreglaget rundas till noll.
- Analysyta begränsad i både bredd och höjd. Små separata förhandsbilder i stället för fullupplösta PNG i resultatgallret.
- Exportbudget 256 MiB för sparade gamla och nya PNG tillsammans, högst 36 megapixel och 16 384 px per sida. Den bild som just kodas kan tillkomma. Detta är inte ett tak för totalt RAM; videodekodning och canvas kräver ytterligare minne.
- Tidigare färdiga resultat behålls om en omkörning avbryts eller misslyckas. Rensa resultat frigör dem. Tre bildläsningsfel i följd stoppar körningen.
- Tangentbordsåtkomligt filval, kopplade reglageetiketter, tydlig fokusmarkering, modaldialog, bildbläddring och obeskurna förhandsbilder.
- Inga externa typsnitt eller andra nätverksberoenden. Videofilen bearbetas lokalt.

## Viktiga begränsningar

Poängen är relativa heuristiker på webbläsarens avkodade och nedskalade bild, inte procent bildkvalitet. Även den brusdämpade signalen kan föredra brus framför svag verklig detalj, eller en skarp bakgrund framför fotografens motiv. Testsviten bevarar dessa kända motexempel. Sökning nära redan lovande kandidater hittar inte säkert ögonblick som grundsökningen missade.

Likhet är inte identitet. Små ögon-, ansikts- eller objektskillnader kan försvinna i en 32 × 32-pixels signatur. Filtret ändrar inte originalfilen och lättas aldrig automatiskt för att fylla önskat antal.

PNG-exporten använder en ofiltrerad canvas i videons avkodade bildstorlek. Skärpemätningens utjämning och likhetsfiltret ändrar inte exportbilden. Söktider är inte verifierade frame-ID:n. HDR, RAW, alla codecs och Safari/iOS/HEVC är inte verifierade.

## Filer och lokal provning

Behåll samtliga HTML-, CSS- och JavaScript-filer i samma mapp. Öppna index.html i en modern webbläsare eller servera repots docs-mapp lokalt. Ingen uppladdningsserver ingår. Den vanliga Bildanalys-appen och docs/v3 är oförändrade.

Från repots rot:

    node --check docs/sharpframe/core.js
    node --check docs/sharpframe/app.js
    node tests/check_sharpframe.js
    node tests/sharpframe/state-checks.js
    node tests/sharpframe/independent-core-checks.js
    python3 tests/check_v3.py
    python3 tests/check_clip.py
    python3 tests/check_output_risk.py

28 författarkontroller och 8 ytterligare oberoende kontroller omfattar syntetiska bilder, urval, tidsgränser och statisk gränssnittsstruktur. Dessutom har 15 livscykelkontroller körts med mockade DOM-, video- och canvasobjekt. De är inte webbläsartester. Befintliga 59 v3-kontroller skyddar andra delar strukturellt, inte fullständigt funktionellt. Arbetsversionen får inte beskrivas som webbläsarverifierad bara för att dessa kontroller passerar.

## Före publicering

Kör riktig video-QA: filval med tangentbord, kort och normalt klipp, skarpt kontra suddigt/noisigt material, porträttformat, giltigt och ogiltigt intervall, avbryt och försök igen, upprepat filval, sortering och modalbläddring, felaktig fil samt PNG-dimensioner och synligt innehåll. Kontrollera 320/390/768 px breda vyer och avsedd målwebbläsare. Använd representativ egen film innan bildkvaliteten bedöms som förbättrad i praktiken.

Publicera först efter godkänd granskning, avhjälpt verifieringslucka och uttryckligt publiceringsmandat. Kontrollera därefter den publicerade revisionen och det befintliga målets URL.

## Separat äldre webbläsarregression

Runnern kräver Python med Pillow, NumPy och Playwright samt FFmpeg och en installerad Chromium. Kör endast i en miljö som tillåter webbläsarstart. Ingen miljöspärr ska kringgås.

    python3 tests/sharpframe/make_fixture.py
    python3 tests/sharpframe/browser_test.py docs/sharpframe/index.html

Enbart för kontroll av testplan utan webbläsarstart:

    python3 tests/sharpframe/browser_test.py docs/sharpframe/index.html --dry-run

Dry-run skriver uttryckligen NOT_RUN och är inte ett testgodkännande. Den nya filmredigeringsvägen testas separat i movie-browser-test.py och GitHub Actions. Runnern skapar syntetiskt H.264-material med avläsbara bildnummer och kontrollerar bland annat PNG-innehåll/dimensioner, tangentbordsflöde, sortering, avbrott, ogiltig fil och 80 ms-klipp. Målwebbläsare och representativ egen film måste fortfarande prövas.
