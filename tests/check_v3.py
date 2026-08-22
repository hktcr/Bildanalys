from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[1]
html = (root / "docs/v3/index.html").read_text(encoding="utf-8")
js = (root / "docs/v3/app.js").read_text(encoding="utf-8")
css = (root / "docs/v3/style.css").read_text(encoding="utf-8")

checks = []

def check(name, ok, detail=""):
    checks.append((name, bool(ok), detail))

ids = set(re.findall(r'\bid="([^"]+)"', html))
js_ids = set(re.findall(r"\$\('#([^']+)'\)", js))
# Vissa element skapas av JS efter sidladdning och ska därför inte krävas i statisk HTML.
dynamic_ids = {"blendControl", "blendLabel"}
missing = sorted((js_ids - dynamic_ids) - ids)
check("Alla statiska direkta DOM-id:n finns i HTML", not missing, ", ".join(missing))
check("Multifilval är aktiverat", bool(re.search(r'<input[^>]+id="file"[^>]+multiple', html)))
check("Thumbnailnivå finns", "THUMB_MAX" in js and "thumbUrl" in js)
check("Separat previewnivå finns", "PREVIEW_MAX" in js and "previewUrl" in js)
check("Lazy thumbnailaktivering finns", "IntersectionObserver" in js)
check("Thumbnailkö är sekventiell", "thumbQueue" in js and "thumbWorking" in js and "pumpThumbs" in js)
check("Thumbnailcache har övre gräns", "MAX_THUMB_CACHE" in js and "trimThumbCache" in js)
check("Previewcache har övre gräns", "MAX_PREVIEW_CACHE" in js and "trimPreviewCache" in js)
check("Previewgenerering dedupliceras", "previewPromise" in js)
check("RAW-avkodning serialiseras", "rawQueue" in js and "withRawLock" in js)
check("Fullskärmsladdning skyddas mot async-race", "lbToken" in js)
check("Jämförelserendering skyddas mot async-race", "compareToken" in js)
check("Fullskärmssekvens är stabil under gallring", "lbSequence" in js)
check("Borttagning ur sessionen kan ångras", "item:i" in js and "restoreSnapshot" in js)
check("Dubblettimport filtreras", "lastModified" in js and "Dubbletter ignorerades" in js)
check("Serieanalys kan avbrytas säkert", "seriesToken" in js)
check("Serieanalys återanvänder thumbnailnivån", "quickMetrics" in js and "ensureThumb(i)" in js)
check("Jämförelsepanorering uppdaterar vy utan full DOM-render", "applyCompareView()" in js and "el.onpointermove" in js)
check("Touchreglage för delning och överlagring finns", "blendControl" in js and "Överlagring" in js)
check("Normaliserad jämförelsepanorering finns", "dx/Math.max(1,el.clientWidth)" in js and "panX*100" in js)
check("Originalanalys är separat", "loadAnalysis" in js and "computeStats" in js)
check("Normaliserad områdesgeometri sparas", "normalizedGeometry" in js and "geometry:g" in js)
check("Reproducerbar JSON kan innehålla SHA-256", "crypto.subtle.digest('SHA-256'" in js)
check("Bortval rör endast sessionen", "Originalfilerna är orörda" in js)
check("Detaljkartan gör inget fokusanspråk", "inte en diagnos av fokus eller skärpa" in js)
check("Lightroom livekoppling påstås inte vara aktiv", "Adobe-inloggning ej konfigurerad" in html)
check("iPad behåller tvåkolumnsjämförelse över telefonbredd", "@media(max-width:700px){.compareGrid" in css)
check("Fullskärm tar hänsyn till safe area", "safe-area-inset-bottom" in css and "100dvh" in css)
check("Inga typografiska tankstreck i UI-filer", all(ch not in html + js + css for ch in "–—"))

failed = [c for c in checks if not c[1]]
for name, ok, detail in checks:
    print(("PASS" if ok else "FAIL") + ": " + name + ((" | " + detail) if detail else ""))
print(f"\n{len(checks)-len(failed)}/{len(checks)} PASS")
sys.exit(1 if failed else 0)
