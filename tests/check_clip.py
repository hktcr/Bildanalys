from pathlib import Path
import sys

root=Path(__file__).resolve().parents[1]
html=(root/'docs/v3/index.html').read_text(encoding='utf-8')
js=(root/'docs/v3/clip-analyzer.js').read_text(encoding='utf-8')
css=(root/'docs/v3/clip-analyzer.css').read_text(encoding='utf-8')
checks=[]
def check(name,ok): checks.append((name,bool(ok)))
check('Clippingpanel finns','id="clipPanel"' in html)
check('Snabbkontroll finns','value="quick"' in html)
check('Högdagrar kanalvis finns','value="high"' in html)
check('Skuggor kanalvis finns','value="shadow"' in html)
check('Alla tre kanaler finns','value="full"' in html)
check('Strikt tröskel finns','value="strict"' in html and 'Exakt 0 / 255' in html)
check('Varningszon finns','value="near"' in html and '≥254' in html)
check('Kanalblandningar definieras',all(x in js for x in ['1:[255,55,55]','3:[255,220,35]','5:[245,65,235]','6:[45,220,235]','7:[255,255,255]']))
check('Separata high och low masker finns','hiMask' in js and 'loMask' in js)
check('Strikt tröskel är 0 och 255',"{lo:0,hi:255" in js)
check('Nära tröskel är 1 och 254',"{lo:1,hi:254" in js)
check('RAW begränsning förklaras','bevisar inte sensorclipping' in html.lower() and 'bevisar inte sensorclipping' in js.lower())
check('Overlay har eget lager','#clipCanvas' in css and "clipCanvas.id='clipCanvas'" in js)
check('Inga typografiska tankstreck',all(ch not in html+js+css for ch in '–—'))
failed=[n for n,ok in checks if not ok]
for n,ok in checks: print(('PASS' if ok else 'FAIL')+': '+n)
print(f'\n{len(checks)-len(failed)}/{len(checks)} PASS')
sys.exit(1 if failed else 0)
