# Bildanalys

Webbaserat verktyg för lokal analys av stillbilder direkt i webbläsaren.

## Funktioner

- Histogram för luminans och RGB
- Analys av hela bilden
- Rektangulärt urval
- Frihandsurval
- Histogram för endast markerat område
- Jämförelse mellan hela bildens histogram och markerat område
- Medelluminans, median och standardavvikelse
- RGB-medelvärden
- Skugg- och högdagerclipping
- P1, P50 och P99 för luminans
- Pixelprov med RGB-värden
- Visuell clipping-markering
- Filinformation och dimensioner
- Lokal bearbetning i webbläsaren
- RAW-filer försöks lokalt via LibRaw WebAssembly

Den publika statiska appen ligger i `docs/index.html` och är avsedd att publiceras med GitHub Pages.

## Vetenskaplig tolkning

Histogram och luminansvärden för vanliga bildformat beräknas från den dekodade sRGB-bilden. Luminansapproximationen använder Rec.709-koefficienterna 0,2126 R + 0,7152 G + 0,0722 B. Detta ska inte tolkas som linjär sensorluminans.

RAW-filer demosaiceras innan samma visningsanalys görs. Verktyget skiljer därför uttryckligen mellan analys av den framkallade visningsbilden och analys av odemosaicerade sensordata.

## Integritet

Bilder analyseras lokalt i webbläsaren. Verktyget har ingen uppladdningsserver för bildfiler.
