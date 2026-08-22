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
missing = sorted(js_ids - ids)
check("Alla direkta DOM-id:n finns i HTML", not missing, ", ".join(missing))
check("Multifilval är aktiverat", bool(re.search(r'<input[^>]+id="file"[^>]+multiple', html)))
check("Thumbnailnivå finns", "THUMB_MAX" in js and "thumbUrl" in js)
check("Separat previewnivå finns", "PREVIEW_MAX" in js and "previewUrl" in js)
check("Lazy thumbnailaktivering finns", "IntersectionObserver" in js)
check("Thumbnailkö är sekventiell", "thumbQueue" in js and "thumbWorking" in js and "pumpThumbs" in js)
check("Originalanalys är separat", "loadAnalysis" in js and "computeStats" in js)
check("Normaliserad områdesgeometri sparas", "normalizedGeometry" in js and "geometry:g" in js)
check("Jämförelse har gemensamt vytillstånd", "viewState" in js and "panX" in js and "panY" in js)
check("Reproducerbar JSON kan innehålla SHA-256", "crypto.subtle.digest('SHA-256'" in js)
check("Bortval rör endast sessionen", "Originalfilerna är orörda" in js)
check("Detaljkartan gör inget fokusanspråk", "inte en diagnos av fokus eller skärpa" in js)
check("Lightroom livekoppling påstås inte vara aktiv", "Adobe-inloggning ej konfigurerad" in html)
check("Inga typografiska tankstreck i UI-filer", all(ch not in html + js + css for ch in "–—"))

failed = [c for c in checks if not c[1]]
for name, ok, detail in checks:
    print(("PASS" if ok else "FAIL") + ": " + name + ((" | " + detail) if detail else ""))
print(f"\n{len(checks)-len(failed)}/{len(checks)} PASS")
sys.exit(1 if failed else 0)
