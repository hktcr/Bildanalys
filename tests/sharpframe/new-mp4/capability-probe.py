"""Actual H.264/AAC encoder probe for the authorized browser-enabled CI only.

Reports supported and unsupported configurations without treating lack of codec
support as a passing export test. Does not launch a browser merely on import.
"""
import argparse
import functools
import http.server
import json
import threading
from pathlib import Path

PROBE = r'''async () => {
  const results = {userAgent: navigator.userAgent, secure: isSecureContext,
    videoEncoder: typeof VideoEncoder, audioEncoder: typeof AudioEncoder,
    audioDecoder: typeof AudioDecoder, configurations: []};
  const bounded = promise => Promise.race([promise, new Promise((_, reject) =>
    setTimeout(() => reject(Error('encoder flush exceeded 15 seconds')), 15000))]);
  for (const codec of ['avc1.42001f', 'avc1.4d001f', 'avc1.640028']) {
    const config = {codec, width: 320, height: 180, framerate: 25, bitrate: 600000,
      latencyMode: 'realtime', hardwareAcceleration: 'prefer-software', avc: {format: 'avc'}};
    const item = {kind: 'video', codec, config, chunks: []};
    let encoder;
    try {
      item.supported = (await VideoEncoder.isConfigSupported(config)).supported;
      if (item.supported) {
        encoder = new VideoEncoder({output(chunk, metadata) {
          item.chunks.push({type: chunk.type, timestamp: chunk.timestamp,
            bytes: chunk.byteLength, descriptionBytes: metadata?.decoderConfig?.description?.byteLength || 0});
        }, error(error) {item.encoderError = String(error);}});
        encoder.configure(config);
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        canvas.getContext('2d').fillRect(0, 0, 320, 180);
        const frame = new VideoFrame(canvas, {timestamp: 0, duration: 40000});
        encoder.encode(frame, {keyFrame: true}); frame.close();
        await bounded(encoder.flush());
        item.actualEncode = item.chunks.length === 1 && !item.encoderError;
      }
    } catch (error) {item.error = String(error); item.actualEncode = false;}
    finally {try {encoder?.close();} catch {}}
    results.configurations.push(item);
  }
  const config = {codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000};
  const item = {kind: 'audio', codec: config.codec, config, chunks: []};
  let encoder;
  try {
    item.supported = (await AudioEncoder.isConfigSupported(config)).supported;
    if (item.supported) {
      encoder = new AudioEncoder({output(chunk, metadata) {
        item.chunks.push({type: chunk.type, timestamp: chunk.timestamp, duration: chunk.duration,
          bytes: chunk.byteLength, descriptionBytes: metadata?.decoderConfig?.description?.byteLength || 0});
      }, error(error) {item.encoderError = String(error);}});
      encoder.configure(config);
      const frames = 4800, samples = new Float32Array(frames * 2);
      for (let i = 0; i < frames; i++) {samples[i] = .2 * Math.sin(i * 440 * 2 * Math.PI / 48000);
        samples[frames + i] = .2 * Math.sin(i * 770 * 2 * Math.PI / 48000);}
      const audio = new AudioData({format: 'f32-planar', sampleRate: 48000,
        numberOfFrames: frames, numberOfChannels: 2, timestamp: 0, data: samples});
      encoder.encode(audio); audio.close(); await bounded(encoder.flush());
      item.actualEncode = item.chunks.length > 0 && !item.encoderError;
    }
  } catch (error) {item.error = String(error); item.actualEncode = false;}
  finally {try {encoder?.close();} catch {}}
  results.configurations.push(item); return results;
}'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--channel', choices=['both', 'chromium', 'chrome'], default='both')
    parser.add_argument('--chromium', help='Optional Chromium executable for the chromium probe')
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    repo = Path(__file__).resolve().parents[3]
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0),
        functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(repo / 'docs')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    result = {'scope': 'Real encoder probe only; NOT edited MP4/audio export verification.', 'browsers': {}}
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            for channel in (['chromium', 'chrome'] if args.channel == 'both' else [args.channel]):
                browser = None
                try:
                    options = {'headless': True}
                    if channel == 'chrome': options['channel'] = 'chrome'
                    elif args.chromium: options['executable_path'] = args.chromium
                    browser = p.chromium.launch(**options)
                    page = browser.new_page()
                    # A secure localhost origin is necessary for WebCodecs.
                    page.goto(f'http://127.0.0.1:{server.server_port}/sharpframe/')
                    result['browsers'][channel] = page.evaluate(PROBE)
                except Exception as error:
                    result['browsers'][channel] = {'status': 'BLOCKED_OR_UNAVAILABLE', 'error': str(error)}
                finally:
                    if browser: browser.close()
    finally:
        server.shutdown()
        args.output.write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
