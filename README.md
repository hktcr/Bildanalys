# Bildanalys

Webbaserat verktyg för lokal analys av stillbilder direkt i webbläsaren.

## Funktioner

- Histogram för Y prime och RGB
- Analys av hela bilden i originalupplösning
- Rektangulärt urval
- Frihandsurval
- Histogram för endast markerat område
- Normaliserad jämförelse mellan hela bilden och markerat område
- Medelvärde, median och standardavvikelse för Y prime
- RGB medelvärden
- Kanalvis clipping för Y prime, R, G och B
- P1, P50 och P99 för Y prime
- Pixelprov med RGB, Y prime och originalkoordinater
- Visuell clipping markering
- Filinformation, dimensioner och dekoderinformation
- Explicit sRGB analyscanvas efter webbläsarens profilhantering
- Lokal bearbetning i webbläsaren
- RAW filer försöks lokalt via LibRaw WebAssembly
- Inbyggd deterministisk självtestsvit för histogrammotorn

Den publika statiska appen ligger i `docs/index.html` och är avsedd att publiceras med GitHub Pages.

## Vetenskaplig tolkning

Y prime beräknas direkt från kodade sRGB värden med koefficienterna 0,2126 R + 0,7152 G + 0,0722 B. Detta är en luma liknande signal och ska inte beskrivas som fysikalisk relativ luminans.

För vanliga bildformat låter verktyget webbläsaren hantera eventuell inbäddad färgprofil och begär därefter en sRGB canvas för analys. Histogrammen beskriver alltså den dekodade sRGB representationen, inte ursprungliga sensorvärden eller en linjär scenrepresentation.

Histogram och statistik beräknas från originalbildens pixelupplösning. Själva visningen på skärmen får vara nedskalad utan att histogrammotorn därför behöver använda det nedskalade visningsrastret.

RAW filer demosaiceras via LibRaw innan samma visningsorienterade analys görs. Appens RAW kontroll verifierar dimensioner, datalängd och att ett användbart tonomfång finns. Den kontrollen är inte samma sak som extern numerisk korsvalidering mot exempelvis Lightroom eller en separat LibRaw referenskörning.

## Självtest

Den inbyggda testsviten använder samma ackumulator och normalisering som den riktiga histogrammotorn. Den kontrollerar bland annat svart och vitt 50/50, rena R G B fält, Y prime bins, pixelantal, RGB medelvärden, histogramnormalisering och clippingtrösklar. Resultatet visas som PASS eller FAIL direkt i appen.

## Integritet

Bilder analyseras lokalt i webbläsaren. Verktyget har ingen uppladdningsserver för bildfiler.
