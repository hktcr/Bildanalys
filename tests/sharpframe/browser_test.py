#!/usr/bin/env python3
"""Portable SharpFrame Chromium regression runner. This file is NOT a test result.
Generate fixtures with make_fixture.py first. Dependencies: Python, Pillow,
Playwright, installed Chromium (or Playwright's Chromium). No external requests
are allowed by the harness. Use only in an environment permitted to run a browser.
"""
import argparse, asyncio, base64, hashlib, io, json, os, shutil, sys, time
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('index', type=Path, help='Path to SharpFrame index.html, with core.js and app.js beside it')
parser.add_argument('--fixtures', type=Path, default=Path(__file__).resolve().parent)
parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parent/'browser-results')
parser.add_argument('--chromium', default=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'))
parser.add_argument('--headed', action='store_true')
parser.add_argument('--no-sandbox', action='store_true', help='Opt in only for a permitted isolated container that requires it')
parser.add_argument('--dry-run', action='store_true', help='Write NOT_RUN manifest without importing/starting a browser')
args = parser.parse_args()
source, fixture_dir, output = args.index.resolve(), args.fixtures.resolve(), args.output_dir.resolve()
output.mkdir(parents=True, exist_ok=True)
results = {
    'browser_status':'NOT_RUN', 'source':str(source),
    'source_sha256':{name:hashlib.sha256((source.parent/name).read_bytes()).hexdigest()
                     for name in ['index.html','core.js','app.js'] if (source.parent/name).is_file()},
    'scope':'Synthetic Chromium QA only. Not Safari/iOS/HEVC/VFR/HDR or photographic-quality validation.',
    'fixture':'640x360 H.264 CFR 10fps; six binary frame-ID blocks; separate 80ms clip and invalid file',
    'planned_checks':['keyboard upload','load','PNG frame IDs','download','sort/modal keyboard',
                      '390px viewport','repeat URL cleanup','cancel preserves results','invalid file cleanup',
                      'recovery','80ms clip','sampling cap','JavaScript errors','external requests'],
    'checks':[], 'errors':[], 'requests':[],
}
report = output/'results.json'
def save(): report.write_text(json.dumps(results, indent=2, ensure_ascii=False))
def check(name, value, passed):
    results['checks'].append({'name':name,'passed':passed,'value':value})
    save(); print(name, json.dumps(value, ensure_ascii=False), flush=True)

async def main():
    from PIL import Image
    from playwright.async_api import async_playwright
    for name in ['timing_6s_10fps.mp4','short_80ms.mp4','invalid.mp4']:
        if not (fixture_dir/name).is_file(): raise FileNotFoundError(f'Run make_fixture.py first: missing {fixture_dir/name}')
    async with async_playwright() as p:
        launch={'headless':not args.headed,'chromium_sandbox':not args.no_sandbox,'args':['--disable-dev-shm-usage']}
        if args.chromium: launch['executable_path']=args.chromium
        if args.no_sandbox: launch['args'].append('--no-sandbox')
        browser=await p.chromium.launch(**launch)
        results['browser_version']=browser.version; results['browser_status']='RUNNING'; save()
        page=await browser.new_page(viewport={'width':1280,'height':1000},accept_downloads=True)
        page.on('pageerror',lambda error:results['errors'].append(str(error)))
        page.on('request',lambda request:results['requests'].append({'url':request.url,'method':request.method}))
        async def local_only(route):
            if route.request.url.startswith(('http://','https://')): await route.abort()
            else: await route.continue_()
        await page.route('**/*',local_only)
        await page.add_init_script('''window.__urls={created:[],revoked:[],active:[]};
            const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
            URL.createObjectURL=blob=>{const url=create(blob);__urls.created.push({url,size:blob.size,type:blob.type});__urls.active.push(url);return url;};
            URL.revokeObjectURL=url=>{__urls.revoked.push(url);__urls.active=__urls.active.filter(x=>x!==url);return revoke(url);};''')
        await page.goto(source.as_uri())
        async def load(name):
            await page.locator('#file-input').set_input_files(str(fixture_dir/name))
            await page.locator('#settings-section').wait_for(state='visible',timeout=20000)
        async def analyze(interval='.5',top='6',gap='.5'):
            await page.locator('#sample-interval').fill(interval)
            await page.locator('#top-n').fill(top)
            await page.locator('#min-gap').fill(gap)
            started=time.perf_counter(); await page.locator('#analyze-btn').click()
            await page.wait_for_function('activeRun === null',timeout=120000)
            return time.perf_counter()-started
        await page.locator('#choose-file').focus()
        async with page.expect_file_chooser() as chooser:
            await page.locator('#choose-file').press('Enter')
        await (await chooser.value).set_files(str(fixture_dir/'timing_6s_10fps.mp4'))
        await page.locator('#settings-section').wait_for(state='visible',timeout=20000)
        check('keyboard_upload',await page.locator('#info-filename').inner_text(),True)
        state=await page.evaluate('({duration:videoDuration,width:videoPlayer.videoWidth,height:videoPlayer.videoHeight})')
        check('load_valid',state,state['width']==640 and state['height']==360)
        elapsed=await analyze()
        rows=await page.evaluate('currentResults && currentResults.map(({dataUrl,thumbUrl,...r})=>r)')
        captures=await page.evaluate('''async()=>Promise.all((currentResults||[]).map(async r=>{
            const blob=await(await fetch(r.dataUrl)).blob(),bytes=new Uint8Array(await blob.arrayBuffer());
            let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return {time:r.time,b64:btoa(text)};}))''')
        decoded=[]
        for i,capture in enumerate(captures):
            data=base64.b64decode(capture['b64']); image=Image.open(io.BytesIO(data)).convert('RGB')
            frame=sum(1<<bit for bit in range(6) if sum(image.getpixel((25+40*bit,25)))/3>128)
            decoded.append({'seek_time':capture['time'],'frame_id':frame,'expected_frame_position':capture['time']*10,
                            'size':image.size,'bytes':len(data),'within_one_frame':abs(frame-capture['time']*10)<=1})
            if i==0:(output/'first.png').write_bytes(data)
        check('analysis_and_frame_timing',{'elapsed_seconds':elapsed,'results':rows,'decoded_pngs':decoded,
              'summary':await page.locator('#results-summary').inner_text()},bool(rows) and all(x['within_one_frame'] and x['size']==(640,360) for x in decoded))
        await page.screenshot(path=str(output/'desktop-results.png'),full_page=True)
        async with page.expect_download() as downloaded: await page.locator('.download-btn').first.click()
        download=await downloaded.value; await download.save_as(output/'download.png')
        dimensions=Image.open(output/'download.png').size
        check('download',{'filename':download.suggested_filename,'size':dimensions},dimensions==(640,360))
        await page.locator('[data-sort="time"]').focus(); await page.locator('[data-sort="time"]').press('Enter')
        await page.locator('.result-thumb').first.focus(); await page.locator('.result-thumb').first.press('Enter')
        modal=await page.evaluate('({open:document.getElementById("lightbox").open,first:displayedResults[0].dataUrl,shown:document.getElementById("lightbox-img").src,focus:document.activeElement.id})')
        await page.keyboard.press('ArrowRight')
        next_frame=await page.evaluate('document.getElementById("lightbox-img").src===displayedResults[1%displayedResults.length].dataUrl')
        await page.keyboard.press('Escape')
        closed=await page.evaluate('!document.getElementById("lightbox").open')
        returned=await page.evaluate('document.activeElement===document.querySelector(".result-thumb")')
        check('keyboard_sorted_modal',{'opened':modal,'next_matches_display_order':next_frame,'closed_with_escape':closed,'focus_returned':returned},modal['open'] and modal['first']==modal['shown'] and next_frame and closed and returned)
        await page.set_viewport_size({'width':390,'height':844})
        mobile=await page.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})')
        await page.screenshot(path=str(output/'mobile-390px.png'),full_page=True)
        check('390px_viewport_no_horizontal_overflow',mobile,mobile['scrollWidth']<=mobile['width']+1)
        await page.set_viewport_size({'width':1280,'height':1000})
        elapsed=await analyze('.5','3','.5')
        repeat=await page.evaluate('({active:__urls.active.length,results:currentResults.length,created:__urls.created.length,revoked:__urls.revoked.length})')
        check('repeat_releases_result_urls',repeat,repeat['active']==1+repeat['results']*2)
        previous=await page.evaluate('({count:currentResults.length,active:__urls.active.length,urls:currentResults.map(r=>r.dataUrl)})')
        await page.locator('#sample-interval').fill('.1'); await page.locator('#analyze-btn').click()
        await page.wait_for_function('activeRun !== null',timeout=2000); await page.locator('#cancel-btn').click()
        await page.wait_for_function('activeRun === null',timeout=10000)
        cancelled=await page.evaluate('({message:document.getElementById("progress-message").textContent,urls:currentResults.map(r=>r.dataUrl),activeUrls:__urls.active.length,disabled:document.getElementById("analyze-btn").disabled,canvas:[canvas.width,canvas.height]})')
        check('cancel_preserves_prior_results',cancelled,not cancelled['disabled'] and cancelled['urls']==previous['urls'] and cancelled['activeUrls']==previous['active'] and cancelled['canvas']==[1,1])
        await page.locator('#file-input').set_input_files(str(fixture_dir/'invalid.mp4'))
        await page.wait_for_function('document.getElementById("upload-error").textContent.includes("avkodas")',timeout=20000)
        invalid=await page.evaluate('({error:document.getElementById("upload-error").textContent,settingsHidden:document.getElementById("settings-section").classList.contains("hidden"),file:videoFile,url:videoUrl,activeUrls:__urls.active.length})')
        check('invalid_file_cleanup',invalid,invalid['file'] is None and invalid['url'] is None and invalid['settingsHidden'] and invalid['activeUrls']==0)
        await load('timing_6s_10fps.mp4')
        check('recover_after_invalid',await page.locator('#info-filename').inner_text(),True)
        await load('short_80ms.mp4')
        short=await page.evaluate('({duration:videoDuration,start:document.getElementById("start-range").value,end:document.getElementById("end-range").value,step:document.getElementById("end-range").step})')
        await analyze('.1','2','0')
        short['error']=await page.locator('#upload-error').text_content(); short['results']=await page.evaluate('currentResults?.length || 0')
        check('sub_100ms_clip',short,short['results']>0 and float(short['end'])>0)
        cap=await page.evaluate('({count:SharpFrameCore.samplingTimes(0,600,.1).length,second:SharpFrameCore.samplingTimes(0,600,.1)[1]})')
        check('sample_cap',cap,cap=={'count':600,'second':1})
        check('uncaught_js_errors',results['errors'],not results['errors'])
        external=[r for r in results['requests'] if r['url'].startswith(('http://','https://'))]
        check('no_external_requests',external,not external)
        results['browser_status']='PASSED' if all(c['passed'] for c in results['checks']) else 'FAILED'
        await browser.close()

save()
if args.dry_run:
    print(f'NOT_RUN: {report}'); sys.exit(0)
try:
    asyncio.run(main())
except Exception as error:
    results['browser_status']='BLOCKED_OR_FAILED';results['harness_error']=str(error);save();raise
finally: save()
if results['browser_status']!='PASSED':sys.exit(1)
