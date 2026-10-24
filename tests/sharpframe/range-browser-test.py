"""Real Chromium regression for fractional ranges and Swedish decimal input.
Synthetic media only. Mobile emulation is not physical Android certification.
"""
import argparse, functools, http.server, threading, json, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--fixture',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
short=a.output/'short-80ms.mp4';invalid=a.output/'invalid.mp4';invalid.write_bytes(b'not a video')
subprocess.run(['ffmpeg','-v','error','-y','-i',str(a.fixture),'-t','.08','-an','-r','25','-c:v','libx264',str(short)],check=True)
repo=Path(__file__).resolve().parents[2]
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(repo/'docs')));threading.Thread(target=server.serve_forever,daemon=True).start()
result={'status':'RUNNING','scope':'Actual Chromium desktop and Swedish mobile emulation; fractional-media-metadata simulation plus real MP4 files, not physical Android','profiles':[]}
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch()
  for mobile in [False,True]:
   ctx=browser.new_context(locale='sv-SE',is_mobile=mobile,has_touch=mobile,viewport={'width':390 if mobile else 1280,'height':844 if mobile else 900})
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/sharpframe/')
   assert not page.locator('#settings-section').is_visible();assert not page.locator('#upload-error').is_visible()
   page.locator('#file-input').set_input_files(str(a.fixture.resolve()));page.locator('#settings-section').wait_for(state='visible')
   data={'mobile':mobile,'checks':['no error or editable interval before source load'],'initial':page.evaluate('analysisSettings()')}
   assert data['initial']['start']==0 and data['initial']['end']==6 and data['initial']['interval']==.5
   # Real native range serialization reproduced the old false rejection on 6710/20008 values.
   data['range_rounding']=page.evaluate('''() => {const r=$('end-range'),old={max:r.max,value:r.value,duration:videoDuration};const failures=[];let rawOvershoots=0,seed=1;const values=[.08,.1,.3,1.1,2.4,5.966666666666667,10.233344,120.1234567];for(let i=0;i<20000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;values.push((seed%100000000)/30000);}for(const duration of values){videoDuration=duration;r.max=String(duration);r.value=String(duration);if(+r.value>duration)rawOvershoots++;try{const settings=analysisSettings();if(settings.end>duration)throw Error('outside duration');}catch(error){failures.push({duration,value:r.value,error:error.message});}}videoDuration=old.duration;r.max=old.max;r.value=old.value;return {checked:values.length,rawOvershoots,count:failures.length,examples:failures.slice(0,12)};}''')
   assert data['range_rounding']['count']==0
   assert data['range_rounding']['rawOvershoots']>0
   data['checks'].append('20008 native range endpoints accepted without extending the source duration')
   page.locator('#set-end').click();page.locator('#analyze-btn').click()
   assert 'Sluttiden måste ligga efter starttiden' in page.locator('#upload-error').inner_text()
   page.locator('#reset-range').click();assert not page.locator('#upload-error').is_visible();assert page.evaluate('analysisSettings().end')==6
   data['checks'].append('equal start/end rejected; Hela filmen resets range and clears its error')
   for selector,values,label in [('#top-n',['','0','1.5','51'],'Antal bilder'),('#min-gap',['','-1','31','x','1,2,3'],'Min. avstånd'),('#sample-interval',['','0','0,09','5.1','x','1,2,3'],'Sampla var')]:
    for value in values:
     page.locator(selector).fill(value);page.locator('#analyze-btn').click();message=page.locator('#upload-error').inner_text();assert label in message and 'start före slut' not in message,(selector,value,message)
    page.locator(selector).fill('1' if selector=='#top-n' else '0.5')
   data['checks'].append('blank, invalid, out-of-bound and fractional-count inputs get the correct field error')
   page.locator('#top-n').fill('');page.locator('#top-n').press_sequentially('1,5');assert page.locator('#top-n').input_value()=='1,5';page.locator('#analyze-btn').click();assert 'Antal bilder' in page.locator('#upload-error').inner_text();page.locator('#top-n').fill('1')
   data['checks'].append('typed fractional count 1,5 is rejected rather than silently becoming 15')
   for selector in ['#min-gap','#sample-interval']:
    page.locator(selector).fill('');page.locator(selector).press_sequentially('0,5');assert page.locator(selector).input_value()=='0,5'
   settings=page.evaluate('analysisSettings()');assert settings['gap']==.5 and settings['interval']==.5
   page.locator('#refine').uncheck();page.locator('#analyze-btn').click();page.wait_for_function('activeRun===null && currentResults && currentResults.length===1',timeout=60000);assert not page.locator('#upload-error').is_visible()
   data['checks'].append('typed decimal commas remain 0,5 and actual video analysis succeeds')
   page.locator('#set-end').click();page.locator('#analyze-btn').click();assert page.locator('#upload-error').is_visible()
   page.locator('#file-input').set_input_files(str(a.fixture.resolve()));page.locator('#settings-section').wait_for(state='visible');assert page.evaluate('analysisSettings().start===0 && analysisSettings().end===6 && analysisSettings().interval===.5');assert not page.locator('#upload-error').is_visible()
   data['checks'].append('source replacement resets the range and stale error without losing valid decimal settings')
   page.locator('#file-input').set_input_files(str(invalid.resolve()));page.wait_for_function('videoFile===null && !document.getElementById("upload-error").classList.contains("hidden")');assert not page.locator('#settings-section').is_visible();assert 'avkodas' in page.locator('#upload-error').inner_text()
   page.locator('#file-input').set_input_files(str(short.resolve()));page.locator('#settings-section').wait_for(state='visible');assert abs(page.evaluate('videoDuration')-.08)<.001
   page.locator('#analyze-btn').click();page.wait_for_function('activeRun===null && currentResults && currentResults.length>=1',timeout=60000);assert not page.locator('#upload-error').is_visible()
   data['checks'].append('invalid file clears source; a subsequent real 80ms clip loads and analyzes successfully')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
   if mobile:page.locator('#settings-section').screenshot(path=str(a.output/'range-mobile.png'))
   data['checks'].append('no script errors or horizontal overflow')
   result['profiles'].append(data);ctx.close()
  browser.close();result['status']='PASS'
except Exception as error:
 result['status']='FAIL';result['error']=str(error);raise
finally:
 server.shutdown();(a.output/'range-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
