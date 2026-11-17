#!/usr/bin/env python3
"""
Render the film's spacecraft plates from AURORA's own WebGL renderer.

These are not stock footage or a separate model: the same DeckRenderer the
application runs in the browser is driven frame by frame along a camera path,
so what the montage shows is the station a judge would walk through.

Rendered at 1600x900 and upscaled to 1920x1080 at composite time. The software
rasteriser's cost is linear in pixels, and a slight softness on the plates
reads as depth of field rather than as a defect — the interface, which has to
stay legible, is drawn at full resolution over the top.
"""
import math, pathlib, sys
from playwright.sync_api import sync_playwright

W, H = 1600, 900
OUT = pathlib.Path('/tmp/vid/plates')
OUT.mkdir(exist_ok=True, parents=True)

PAGE = """<!doctype html><html><body style="margin:0;background:#000"><canvas id="c"></canvas>
<script type="module">
window.mk = async (w,h) => {
  const old=document.getElementById('c'); const n=document.createElement('canvas');
  n.id='c'; n.width=w; n.height=h; old.parentNode.replaceChild(n,old);
  const gl=n.getContext('webgl2',{alpha:false,antialias:false,depth:true});
  if(!gl) return 'nogl'; window.GL=gl;
  const mod = await import('/js/render/DeckRenderer.js');
  try { window.R = new mod.DeckRenderer(n, gl); window.R.setQuality('high'); } catch(e){ return 'err:'+e.message; }
  return 'ok';
};
window.READY=true;
</script></body></html>"""
pathlib.Path('/tmp/deckbuild/plate.html').write_text(PAGE)


def ease(x):
    """Smooth in and out, so no shot starts or stops abruptly."""
    return x * x * (3 - 2 * x)


def lerp3(a, b, k):
    return [a[i] + (b[i] - a[i]) * k for i in range(3)]


def angles(eye, target):
    dx, dy, dz = target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]
    return math.atan2(-dx, -dz), math.atan2(dy, math.hypot(dx, dz) or 1e-6)


# frame0, frames, eyeA, eyeB, targetA, targetB, mode, hatches, time0, time1
SHOTS = [
    # --- the hook: the station out of darkness, then inside, then at work
    dict(f0=0,   n=48,  eyeA=(-47, 17, -52), eyeB=(-39.5, 14.6, -44),
         tgtA=(-2, 5, -6), tgtB=(-2, 5, -6), mode='exterior', t0=612, t1=616),
    dict(f0=48,  n=36,  eyeA=(0, 1.70, 22.0), eyeB=(0, 1.70, 21.15),
         tgtA=(0, 1.73, 24.6), tgtB=(0, 1.72, 24.4), mode='interior', t0=617, t1=620),
    dict(f0=84,  n=36,  eyeA=(4.8, 1.58, 8.3), eyeB=(4.25, 1.56, 8.85),
         tgtA=(7.5, 1.32, 10.8), tgtB=(7.4, 1.30, 11.0), mode='interior', t0=620, t1=623),
    # --- the payoff: back aboard, then the station whole
    dict(f0=660, n=96,  eyeA=(0, 1.67, 20.3), eyeB=(0, 1.70, 21.9),
         tgtA=(0, 1.72, 24.3), tgtB=(0, 1.73, 24.5), mode='interior', t0=636, t1=644),
    dict(f0=756, n=54,  eyeA=(-35.5, 14.8, -40), eyeB=(-30.5, 12.6, -35),
         tgtA=(-2, 5, -6), tgtB=(-2, 5, -6), mode='exterior', t0=645, t1=649),
]

want = set()
for s in SHOTS:
    for i in range(s['n']):
        want.add(s['f0'] + i)
todo = sorted(f for f in want if not (OUT / f'{f:04d}.jpg').exists())
print(f'plates needed {len(want)}, already present {len(want)-len(todo)}, to render {len(todo)}')
if not todo:
    sys.exit(0)

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome',
        args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 700, 'height': 420})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8731/plate.html')
    pg.wait_for_function('window.READY===true', timeout=40000)
    ok = pg.evaluate('async ([w,h]) => await window.mk(w,h)', [W, H])
    print('renderer:', ok)
    if ok != 'ok':
        print(errs[:3]); b.close(); sys.exit(1)

    done = 0
    for s in SHOTS:
        for i in range(s['n']):
            f = s['f0'] + i
            if (OUT / f'{f:04d}.jpg').exists():
                continue
            k = ease(i / max(1, s['n'] - 1))
            eye = lerp3(s['eyeA'], s['eyeB'], k)
            tgt = lerp3(s['tgtA'], s['tgtB'], k)
            yaw, pitch = angles(eye, tgt)
            tt = s['t0'] + (s['t1'] - s['t0']) * k
            pg.evaluate("""([e,yaw,pitch,mode,t]) => {
              window.R.render({eye:e, yaw, pitch, time:t, alert:0, mode,
                               hatches:{inner:0, outer:0}});
            }""", [eye, yaw, pitch, s['mode'], tt])
            pg.locator('#c').screenshot(path=str(OUT / f'{f:04d}.jpg'), type='jpeg', quality=92)
            done += 1
            if done % 25 == 0:
                print(f'  {done}/{len(todo)}', flush=True)
    if errs:
        print('ERRORS:', errs[:3])
    b.close()
print('plates done:', len(list(OUT.glob('*.jpg'))))
