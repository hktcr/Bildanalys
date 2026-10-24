"""Real Chromium smoke test, to be run only in a browser-enabled environment.
Runs in the supported GitHub Actions browser environment. Requires Playwright and FFmpeg.
Uses the fixture created by movie-real-video.js, not personal footage.
"""
import argparse
import functools
import http.server
import json
import subprocess
import threading
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--fixture', type=Path, required=True)
parser.add_argument('--output', type=Path, default=Path('/tmp/sharpframe-browser'))
parser.add_argument('--chromium', help='Path to an installed Chromium/Chrome executable')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
repo = Path(__file__).resolve().parents[2]
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(repo / 'docs'))
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
requests = []
result = {'status': 'RUNNING', 'checks': [], 'scope': 'Chromium synthetic smoke test. Not Safari/iOS/HEVC/HDR/VFR or photographic quality.'}
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        options = {'headless': True}
        if args.chromium:
            options['executable_path'] = args.chromium
        browser = p.chromium.launch(**options)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        page.goto(f'http://127.0.0.1:{server.server_port}/sharpframe/')
        page.locator('#file-input').set_input_files(str(args.fixture.resolve()))
        page.locator('#movie-section').wait_for(state='visible')
        page.wait_for_function("!document.getElementById('movie-export').disabled")
        # Use memory output so this automated test doesn't bypass any save permission UI.
        page.locator('#movie-direct').uncheck()
        for time, hold in [(1.5, 1.2), (4, 2)]:
            page.evaluate("t => new Promise(resolve => { const v=document.getElementById('video-player'); v.addEventListener('seeked', resolve, {once:true}); v.currentTime=t; })", time)
            page.locator('#movie-add-current').click()
            row = page.locator('.movie-stop').last
            row.locator('input[id$="-brake"]').fill('1')
            row.locator('input[id$="-hold"]').fill(str(hold))
            row.locator('input[id$="-resume"]').fill('1')
        assert page.locator('.movie-stop').count() == 2
        page.locator('#movie-size').select_option('640')
        page.locator('#movie-play').click()
        page.wait_for_function("Number(document.getElementById('movie-scrub').value)>0.2")
        page.locator('#movie-play').click()
        result['checks'].append('two editable stops and moving preview')
        page.locator('#movie-export').click()
        page.locator('#movie-result').wait_for(state='visible', timeout=180000)
        with page.expect_download() as download:
            page.locator('#movie-download').click()
        exported = args.output / 'browser-export.webm'
        download.value.save_as(exported)
        meta = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', str(exported)]))
        assert len(meta['streams']) == 1 and meta['streams'][0]['codec_name'] == 'vp8'
        assert abs(float(meta['format']['duration']) - 11.2) < .002
        assert int(meta['streams'][0]['nb_read_frames']) == 280
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(exported), '-f', 'null', '-'], check=True)
        expected = page.evaluate('''() => {const T=SharpFrameTimeline; const p=T.build({duration:6,stops:[{time:1.5,hold:1.2,brake:1,resume:1},{time:4,hold:2,brake:1,resume:1}],fps:25}); return Array.from({length:p.frames}, (_,i)=>Math.min(59,Math.floor(T.sample(p,i/25).time*10+1e-8)));}''')
        pixels = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(exported), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', 'pipe:1'])
        frame_bytes = 320 * 180 * 3
        assert len(pixels) == 280 * frame_bytes
        mismatches = []
        for index, wanted in enumerate(expected):
            actual = 0
            for bit in range(6):
                offset = index * frame_bytes + (25 * 320 + 25 + bit * 48) * 3
                if sum(pixels[offset:offset+3]) / 3 > 120:
                    actual |= 1 << bit
            if actual != wanted:
                mismatches.append((index, actual, wanted))
        assert not mismatches, {"count": len(mismatches), "first": mismatches[:20]}
        result['checks'].append('actual WebCodecs export: all 280 decoded frame IDs including both freeze holds; 11.2 seconds, VP8 without audio')
        page.locator('#movie-output').evaluate('(video) => video.play()')
        page.wait_for_function("document.getElementById('movie-output').currentTime > .2")
        page.locator('#movie-output').evaluate('(video) => video.pause()')
        result['checks'].append('exported WebM plays in the actual browser video element')
        old_src = page.locator('#movie-output').get_attribute('src')
        page.locator('#movie-export').click()
        page.locator('#movie-cancel').click()
        page.wait_for_function("!document.getElementById('movie-export').disabled")
        assert page.locator('#movie-output').get_attribute('src') == old_src
        result['checks'].append('cancel preserves previous complete video')
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.locator('#movie-heading').scroll_into_view_if_needed()
        page.screenshot(path=str(args.output / 'editor-mobile.png'), full_page=True)
        result['checks'].append('390px layout has no horizontal overflow; screenshot for human inspection')
        page.locator('#file-input').set_input_files(str(args.fixture.resolve()))
        page.wait_for_function("document.querySelectorAll('.movie-stop').length === 0")
        assert 'hidden' in page.locator('#movie-result').get_attribute('class')
        result['checks'].append('source replacement clears old timeline and output')
        page.locator('#sample-interval').fill('1')
        page.locator('#top-n').fill('3')
        page.locator('#min-gap').fill('1')
        page.locator('#refine').uncheck()
        page.locator('#analyze-btn').click()
        page.wait_for_function('activeRun === null && currentResults && currentResults.length === 3', timeout=60000)
        chosen_time = page.evaluate('displayedResults[0].time')
        with page.expect_download() as png_download:
            page.locator('.download-btn').first.click()
        png = args.output / 'selected-candidate.png'
        png_download.value.save_as(png)
        png_pixels = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(png), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
        assert len(png_pixels) == 320 * 180 * 3
        chosen_id = sum(1 << bit for bit in range(6) if sum(png_pixels[(25*320+25+bit*48)*3:(25*320+25+bit*48)*3+3])/3 > 120)
        page.locator('.movie-candidate').first.click()
        assert abs(float(page.locator('.movie-stop input[id$="-time"]').input_value()) - chosen_time) < .000001
        row = page.locator('.movie-stop').first
        row.locator('input[id$="-hold"]').fill('0.4')
        row.locator('input[id$="-brake"]').fill('0.2')
        row.locator('input[id$="-resume"]').fill('0.2')
        page.locator('#movie-export').click()
        page.locator('#movie-result').wait_for(state='visible', timeout=180000)
        with page.expect_download() as second_download:
            page.locator('#movie-download').click()
        second = args.output / 'candidate-export.webm'
        second_download.value.save_as(second)
        second_pixels = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(second), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', 'pipe:1'])
        hold_frames = page.evaluate('''time => {const T=SharpFrameTimeline,p=T.build({duration:6,stops:[{time,hold:.4,brake:.2,resume:.2}],fps:25});return Array.from({length:p.frames},(_,i)=>i).filter(i=>T.sample(p,i/25).type==='hold');}''', chosen_time)
        assert hold_frames
        for index in hold_frames:
            actual = sum(1 << bit for bit in range(6) if sum(second_pixels[index*frame_bytes+(25*320+25+bit*48)*3:index*frame_bytes+(25*320+25+bit*48)*3+3])/3 > 120)
            assert actual == chosen_id, ('candidate freeze mismatch', index, actual, chosen_id)
        result['checks'].append('sharpness analysis, PNG download and chosen candidate keep the identical source-frame ID in exported freeze')
        page.set_viewport_size({'width': 1280, 'height': 900})
        page.locator('#movie-section').screenshot(path=str(args.output / 'editor-desktop.png'))

        assert not errors, errors
        external = [u for u in requests if not u.startswith(('http://127.0.0.1:', 'blob:', 'data:'))]
        assert not external, external
        result['checks'].append('no page errors or external requests')
        result['status'] = 'PASS'
        result['video'] = meta
        browser.close()
except Exception as error:
    result['status'] = 'FAIL_OR_BLOCKED'
    result['error'] = str(error)
    raise
finally:
    server.shutdown()
    result['page_errors'] = errors
    result['requests'] = requests
    (args.output / 'results.json').write_text(json.dumps(result, indent=2, ensure_ascii=False))
