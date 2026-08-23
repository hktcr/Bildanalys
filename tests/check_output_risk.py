from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
js=(root/'docs/v3/output-risk.js').read_text(encoding='utf-8')
clip=(root/'docs/v3/clip-analyzer.js').read_text(encoding='utf-8')
checks=[]
def check(name,ok): checks.append((name,bool(ok)))
check('Utmatningsrisk laddas','import(\'./output-risk.js\')' in clip)
check('Utmatningsrisk knapp finns','Utmatningsrisk' in js and "btn.dataset.mode='outputrisk'" in js)
check('Skärm sRGB mål finns','Skärm, sRGB' in js)
check('Egna trösklar finns','Egna trösklar' in js and 'outputShadow' in js and 'outputHighlight' in js)
check('Klusterfilter finns','outputClusterMin' in js and 'clusters(' in js)
check('8 och 4 grannar finns','8 grannar' in js and '4 grannar' in js)
check('Bakgrundslägen finns',all(x in js for x in ['Bild</option>','Dämpad bild','Döljd, neutralgrå']))
check('Risk skiljs från clipping','inte samma sak som sensorclipping' in js)
check('Print påstås inte vara verifierad','inte en printerspecifik soft proof' in js and 'ICC-profil' in js)
check('Kluster rapporteras','Betydande skuggkluster' in js and 'Största högdagerkluster' in js)
check('Inga typografiska tankstreck',all(ch not in js for ch in '–—'))
failed=[n for n,ok in checks if not ok]
for n,ok in checks: print(('PASS' if ok else 'FAIL')+': '+n)
print(f'\n{len(checks)-len(failed)}/{len(checks)} PASS')
sys.exit(1 if failed else 0)
