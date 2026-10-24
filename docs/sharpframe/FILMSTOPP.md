# SharpFrame: filmstopp

Version byggd 24 oktober 2026. Publiceringskandidat med separat Chromium-grind före uppdatering av webbversionen.

## Vad du kan göra

1. Välj en lokal video. Originalfilen ändras inte och laddas inte upp.
2. Kör den vanliga skärpeanalysen. Välj **Lägg till filmstopp** på de bilder där till exempel fågelns öga, vinge eller andra kännetecken syns bra. Du kan också pausa originalfilmen och välja **Lägg till bilden vid spelhuvudet**.
3. Ändra varje stopps tid i originalfilmen, inbromsning, stillbildslängd och uppstart. Tiderna för övergångarna och stillbilden avser den nya filmen.
4. Välj tempo mellan stoppen och förhandsvisa hela tidslinjen. Klicka på ett färgat tidslinjeavsnitt eller dra tidsreglaget för att granska en viss del.
5. Välj **Skapa ny film · utan ljud**. Filmen kodas bildruta för bildruta till en ny WebM-fil. Om **Spara direkt till fil** är markerat väljer du filnamn först. Annars laddar du ner den färdiga filmen efter export.

När två stopp ligger nära varandra, eller nära början/slutet, kortas övergångarna automatiskt. De faktiska tiderna visas i en varning. Stillbildens önskade längd ändras inte. Två stopp inom 0,001 sekund av varandra avvisas i stället för att slås ihop tyst.

## Viktigt innan du testar

- **Den nya filmen är utan ljud.** Originalfilens ljud finns kvar. Det är en uttrycklig begränsning i denna första version, inte ett dolt ljudbortfall.
- Exportformatet är **WebM med VP8**, inte MP4. Codec-stöd kontrolleras i webbläsaren. Aktuell Chrome/Edge på dator är avsedd testväg. Safari, iOS, HEVC, HDR och variabel bildfrekvens är inte verifierade.
- WebCodecs behöver en betrodd sidmiljö, normalt HTTPS eller localhost. Lokalt öppnad fil kan fungera beroende på webbläsare. Om exportknappen saknar stöd, använd localhost enligt nedan.
- Filmen byggs om till 25 eller 30 bilder/s, med högst 640, 1280 eller 1920 px på längsta sidan. Originalets proportioner behålls, med avrundning till jämna dimensioner för kodaren. Ingen uppskalning eller beskärning görs.
- Inga nya mellanbilder hittas på. Långsam rörelse kan därför bli ryckig om originalet har få bilder per sekund.
- Videokomprimeringen är förlustgivande. PNG-exporten är kvar oförändrad för den som vill spara stillbilden separat.
- Förhandsvisningen är en redigeringshjälp och kan hoppa över bilder på en långsam dator. Exportens tidsstämplar beror inte på hur fort datorn arbetar.
- Stillbildens längd i den kodade filmen avrundas till bildrutegränser, högst ungefär en bildruta. Filmens slut rundas upp till nästa hela bildruta.
- Vid direkt filskrivning behålls inte hela exportfilen i arbetsminnet. Utan den funktionen är gränsen 192 MiB för tidigare och ny färdig film tillsammans. Bildexportens separata PNG-budget är 256 MiB. Detta är inte ett tak för webbläsarens totala minne.
- Högst 100 stopp, 120 sekunders stillbild per stopp, 30 sekunders övergång per sida, 6 timmars källfilm och 648 000 utmatningsrutor. Praktisk exporttid och minnesanvändning för mycket långa filmer är inte uppmätta.
- WebM-filen har ingen sökindexdel. Den kan spelas i följd; vissa spelare kan söka långsamt.
- Avbrott gäller fram till slutskrivningen. Under slutskrivning spärras avbrott eftersom filcommit inte säkert kan rullas tillbaka. Om dess utfall inte kan bekräftas visas en uttrycklig varning och ny export spärras i stället för att försöka skriva igen automatiskt.
- Avbrott/fel ersätter inte en tidigare färdig film. Direkt filskrivning kan lämna en tom fil vid avbrott. Använd alltid ett nytt filnamn; appen avvisar samma namn som originalet.
- Stopplistan finns bara under den öppna sessionen. Ladda om sidan eller byt källfilm så börjar du om. Spara din färdiga film innan du stänger sidan.

## Öppna arbetsversionen

Behåll alla filer i `docs/sharpframe/` tillsammans. Öppna `index.html` i en modern skrivbordswebbläsare. För localhost, från repots rot:

    python3 -m http.server 8000 --directory docs

Öppna sedan `http://localhost:8000/sharpframe/`. Servern tar inte emot videouppladdningar. Alla videofiler hanteras fortfarande av webbläsaren på din egen dator.

## Vad som faktiskt är verifierat

- Den tidigare arbetsversionens 28 algoritm-/strukturkontroller, 15 mockade tillståndskontroller och 8 oberoende kärnkontroller passerar. Övriga Bildanalys/v3-funktioners 59 befintliga strukturella kontroller passerar.
- 28 nya tidslinje-/exportkontroller och 17 mockade gränssnittsflöden passerar. Testerna omfattar bland annat 1 200 slumpade tidslinjer, början/slut, överlappande inbromsningar, dubbletter, ogiltiga värden, tempo, bildrutetidsstämplar, minnesbudget, avbrott, upprepning och kodar-/skrivfel.
- En separat granskning har dessutom kört 6 oberoende async-/formatregressioner, inklusive de verkliga tidsgränserna 5 och 2 sekunder. Rapporterade kodfel har åtgärdats och granskats igen. Detta är inte en webbläsarattest.
- Riktig MP4/H.264 med ljud genererades, avkodades och exporterades genom den nya produktionskoden för tidslinje, renderloop och WebM-paketering. FFmpeg användes som adapter i stället för webbläsarens avkodare/kodare.
- Tre exporter på 12,2, 13,4 och 13,7 sekunder avkodades igen. Alla 1 118 utmatningsbilder fick rätt syntetiskt bild-ID. Samtliga stillperioder hade rätt bild och längd inom en bildruta. Utdata innehöll avsiktligt ett VP8-videospår utan ljud.
- Detta bevisar verkliga spelbara videofiler, tidslinjens matematik och WebM-paketering. Det är **inte** bevis för att den faktiska WebCodecs- och HTML-video-vägen fungerar i en målwebbläsare.
- Riktig Chromium/WebCodecs-körning har nu genomförts på GitHub Actions. En exporterad 11,2-sekundersfilm återavkodades: samtliga 280 bild-ID:n och båda stillperioderna stämde. Förhandsvisning, avbrott, källbyte, frånvaro av externa förfrågningar och 390 px utan horisontell overflow kontrollerades. Den första körningen fångade ett flyttalsfel vid bildrutegränser; söktider normaliseras nu konsekvent till mikrosekunder.
- Safari/iOS-, HEVC-, långfilms-/RAM-, HDR-, VFR- och representativ fågelfilmstestning återstår. Direkt filskrivningens systemdialog är mocktestad, inte automatiserad i den verkliga browserkörningen.

## Reproducerbara kontroller

Från repots rot:

    node tests/check_sharpframe.js
    node tests/sharpframe/state-checks.js
    node tests/sharpframe/independent-core-checks.js
    node tests/sharpframe/movie-tests.js
    node tests/sharpframe/movie-state-tests.js
    node tests/sharpframe/movie-independent-tests.cjs
    node tests/sharpframe/movie-real-video.js /tmp/sharpframe-real-video
    python3 tests/check_v3.py
    python3 tests/check_clip.py
    python3 tests/check_output_risk.py

Den riktiga videokontrollen kräver Node och FFmpeg/ffprobe med libx264 och libvpx. Den producerar tre WebM-filer, käll-MP4 och JSON-kvitton. De små testfilmerna kan spelas i exempelvis en webbläsare med VP8/WebM-stöd eller VLC. Testet är en adapterkontroll, inte en webbläsartestsvit.

## Teknisk grund

Inbromsningen minskar källfilmens hastighet linjärt till noll; uppstarten ökar den linjärt från noll. Källtiden följer därför en kvadratisk kurva. Stillbilden har konstant källtid. Samma tidslinje används vid förhandsvisning och export. WebCodecs skapar VP8-bilder med explicita mikrosekundtidsstämplar; en liten strömmande WebM-skrivare paketerar dem med deklarerad filmlängd.

Referenser: [W3C WebCodecs](https://www.w3.org/TR/webcodecs/), [Matroskas elementspecifikation](https://www.matroska.org/technical/elements.html).

### Riktig webbläsarkontroll i GitHub Actions

I en miljö där Chromium/Chrome och Playwright får startas:

    python3 tests/sharpframe/movie-browser-test.py --fixture /tmp/sharpframe-real-video/source-with-audio.mp4 --output /tmp/sharpframe-browser

Valfritt: `--chromium /sökväg/till/chrome`. Testet gör faktisk filinläsning, två redigerade stopp, förhandsvisning, WebCodecs-export, nedladdning, FFmpeg-avkodning och bild-ID-kontroll av varje ruta, avbrott, källbyte och kontroll av 390 px-bredd. En skärmbild sparas för mänsklig visuell bedömning. Körningsutfallet för varje commit är verifieringsunderlaget, inte att testfilen finns. [Verifierad Chromium-körning](https://github.com/hktcr/Bildanalys/actions/runs/40125316382).
