#!/usr/bin/env python3
"""
Screenshot the film, frame by frame.

The page renders any frame deterministically from its number, so this is just
a loop: set the frame, capture it. That also means the render is restartable —
frames already on disk are skipped — which matters when a 900-frame pass takes
a few minutes and a mistake should not cost the whole thing.

Usage:  render.py            all 900 frames
        render.py 0 60 119   just those frames, into /tmp/vid/test
"""
import pathlib, sys
from playwright.sync_api import sync_playwright

W, H = 1920, 1080
TOTAL = 900
args = [int(a) for a in sys.argv[1:]]
TEST = bool(args)
OUT = pathlib.Path('/tmp/vid/test' if TEST else '/tmp/vid/frames')
OUT.mkdir(exist_ok=True, parents=True)
frames = args if TEST else list(range(TOTAL))

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome',
        args=['--no-sandbox', '--force-device-scale-factor=1',
              '--font-render-hinting=none', '--disable-lcd-text'])
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
    pg.goto('http://localhost:8799/film.html')
    pg.wait_for_function('window.DATA_READY === true', timeout=30000)
    # Let the webfonts settle before the first capture, or the first few frames
    # come out in a fallback face.
    pg.wait_for_timeout(600)

    done = 0
    for n in frames:
        path = OUT / f'{n:04d}.png'
        if path.exists() and not TEST:
            continue
        pg.evaluate('(n) => window.renderFrame(n)', n)
        pg.screenshot(path=str(path), type='png')
        done += 1
        if done % 60 == 0:
            print(f'  {done} frames', flush=True)
    if errs:
        print('ERRORS:', errs[:5])
    b.close()
print('rendered', done, 'into', OUT)
