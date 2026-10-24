"""Browser-level range/locale diagnostics; no private source files."""
import argparse,functools,http.server,threading,json,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--fixture',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
repo=Path(__file__).resolve().parents[2]
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(repo/'docs')));threading.Thread(target=server.serve_forever,daemon=True).start()
result={'scope':'Real Chromium desktop and Swedish mobile emulation, not physical Android','profiles':[]}
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch()
  for mobile in [False,True]:
   ctx=browser.new_context(locale='sv-SE',is_mobile=mobile,has_touch=mobile,viewport={'width':390 if mobile else 1280,'height':844 if mobile else 900})
   page=ctx.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/sharpframe/')
   assert not page.locator('#settings-section').is_visible();assert not page.locator('#upload-error').is_visible()
   page.locator('#file-input').set_input_files(str(a.fixture.resolve()));page.locator('#settings-section').wait_for(state='visible')
   data={'mobile':mobile,'initial':page.evaluate('({duration:videoDuration,start:$("start-range").value,end:$("end-range").value,gap:$("min-gap").value,sample:$("sample-interval").value,count:$("top-n").value})')}
   data['range_rounding']=page.evaluate('''() => {const r=$('end-range'),old={max:r.max,value:r.value};const failures=[];let seed=1;const values=[.08,.1,.3,1.1,2.4,5.966666666666667,10.233344,120.1234567];for(let i=0;i<20000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;values.push((seed%100000000)/30000);}for(const duration of values){r.max=String(duration);r.value=String(duration);if(+r.value>duration||+r.value<=0)failures.push({duration,value:r.value,difference:+r.value-duration});}r.max=old.max;r.value=old.value;return {checked:values.length,count:failures.length,examples:failures.slice(0,12)};}''')
   page.locator('#sample-interval').fill('');page.locator('#analyze-btn').click();data['empty_sample_error']=page.locator('#upload-error').inner_text()
   page.locator('#sample-interval').fill('0.5');page.locator('#top-n').fill('0');page.locator('#analyze-btn').click();data['invalid_count_error']=page.locator('#upload-error').inner_text()
   page.locator('#top-n').fill('3');page.locator('#sample-interval').fill('0,5') if False else None
   page.locator('#sample-interval').fill('');page.locator('#sample-interval').press_sequentially('0,5');data['typed_comma']=page.locator('#sample-interval').evaluate('(el)=>({value:el.value,number:Number.isFinite(el.valueAsNumber)?el.valueAsNumber:null,badInput:el.validity.badInput})')
   page.locator('#file-input').set_input_files(str(a.fixture.resolve()));page.locator('#settings-section').wait_for(state='visible');data['after_reload']=page.evaluate('({duration:videoDuration,start:$("start-range").value,end:$("end-range").value,sample:$("sample-interval").value,error:$("upload-error").textContent})')
   result['profiles'].append(data);ctx.close()
  browser.close()
finally:
 server.shutdown();(a.output/'range-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
