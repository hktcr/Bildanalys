# SharpFrame

**Extrahera de skarpaste bildrutorna ur en videofil — med visuellt webbgränssnitt.**

SharpFrame analyserar din video och identifierar automatiskt de bästa stillbilderna baserat på tre kvalitetsdimensioner: skärpa, exponering och kontrast. Nyckelbilder (I-frames) prioriteras för maximal dataintegritet.

---

## Snabbstart

```bash
cd GAIA-Tools/SharpFrame
python3 app.py
```

Webbgränssnittet öppnas automatiskt i din webbläsare på `http://localhost:5555`.

---

## Användning

1. **Dra in eller välj en videofil** → videons metadata visas
2. **Ställ in tidsintervall** med start/slut-reglagen
3. **Klicka "Analysera"** → progressbar → resultatgalleri
4. **Ladda ner** enskilda bilder som fullupplösta PNG-filer

---

## Hur algoritmen fungerar

### Steg 1: Kandidatidentifiering
FFprobe identifierar alla nyckelbilder (I-frames) i videon. Dessa har per definition maximal dataintegritet i videoströmmen — de är inte rekonstruerade från differensdata.

### Steg 2: Composite scoring
Varje kandidat värderas på tre dimensioner:

| Dimension | Vikt | Metod |
|-----------|------|-------|
| **Skärpa** | 50% | Laplacian-variance (Var(∇²f)) — hög varians = skarpa kanter |
| **Exponering** | 25% | Histogram-centrering — straffar under/överexponering |
| **Kontrast** | 25% | Luminans-standardavvikelse — högt värde = bra dynamiskt omfång |

### Steg 3: Selektion
- Bildrutor sorteras efter composite score
- `min-gap` förhindrar nära-identiska bilder från samma moment
- Duplikatfilter (normaliserad korrelation) fångar visuellt identiska bilder
- Topp-N sparas som förlustfria PNG-filer

---

## Beroenden

```bash
pip3 install opencv-python flask
```

Kräver även `ffprobe` (ingår i FFmpeg, installeras via `brew install ffmpeg`).

---

*SharpFrame — Ett GAIA-Tools-projekt 🌲*
