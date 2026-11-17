#!/usr/bin/env python3
"""
Spacecraft plates for the commercial, rendered by AURORA's own WebGL renderer.

Ten camera moves rather than the five the first cut used, and each one has a
character: a creeping push for the hook, a tracking shot down the spine, two
macro shots close enough to read an instrument, a hard push into a console for
the reveal, and two wide plates for the payoff.

Two things are done in camera rather than in post, because they are cheaper
and far more convincing there:

  * handheld — a summed-sine wobble on the eye, with the aim lagging a few
    frames behind, which is what a shoulder-mounted camera actually does;
  * speed ramps — progress along the path is eased non-linearly, so a move can
    start slow, accelerate, and settle.

Rendered at 1600x900 and finished at 1920x1080: the renderer is fill-bound so
that is most of the cost, and the slight softness is a sensible base for the
depth of field added in post.
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


def smooth(x):  return x * x * (3 - 2 * x)
def accel(x):   return x * x
def decel(x):   return 1 - (1 - x) ** 2.4
def ramp(x):    return x ** 0.55 if x < 0.5 else 1 - (1 - x) ** 2.2
def linear(x):  return x

EASE = {'smooth': smooth, 'accel': accel, 'decel': decel, 'ramp': ramp, 'linear': linear}


def lerp3(a, b, k):
    return [a[i] + (b[i] - a[i]) * k for i in range(3)]


def angles(eye, target):
    dx, dy, dz = target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]
    return math.atan2(-dx, -dz), math.atan2(dy, math.hypot(dx, dz) or 1e-6)


def handheld(i, amt):
    """Summed sines at incommensurate rates: never repeats, never periodic."""
    if amt <= 0:
        return (0.0, 0.0, 0.0)
    return (amt * (math.sin(i * 0.117) * 0.6 + math.sin(i * 0.051 + 1.3) * 0.4),
            amt * (math.sin(i * 0.093 + 2.1) * 0.5 + math.sin(i * 0.037) * 0.5),
            amt * (math.sin(i * 0.071 + 0.7) * 0.55 + math.sin(i * 0.029 + 2.9) * 0.45))


SHOTS = [
    # ---------------------------------------------------- 0:00-0:05 the hook
    # Creeping in from a long way out, barely moving: the frame is nearly black
    # and the only thing saying time is passing is the drift.
    dict(f0=0, n=50, eyeA=(-62, 23, -70), eyeB=(-52, 20, -60),
         tgtA=(-2, 5, -6), tgtB=(-2, 5, -6), mode='exterior', t0=612, t1=614, ease='accel'),
    # Closer, tracking laterally so the truss parallaxes against the limb.
    dict(f0=50, n=50, eyeA=(-42, 15, -46), eyeB=(-28, 11, -38),
         tgtA=(-4, 5, -8), tgtB=(0, 4, -4), mode='exterior', t0=615, t1=618, ease='smooth'),
    # Inside, close on the medical bay instruments. Handheld.
    dict(f0=100, n=50, eyeA=(5.9, 1.33, 9.95), eyeB=(6.35, 1.29, 10.45),
         tgtA=(6.95, 1.18, 11.05), tgtB=(7.05, 1.14, 11.1), mode='interior',
         t0=619, t1=621, ease='decel', hh=0.016),

    # ------------------------------------------------- 0:05-0:10 the problem
    # Tracking down the spine: the long axis, which is the shot that sells the
    # scale of the place.
    dict(f0=150, n=40, eyeA=(0, 1.60, -11.0), eyeB=(0, 1.62, -3.4),
         tgtA=(0, 1.52, 13.0), tgtB=(0, 1.54, 14.5), mode='interior',
         t0=621, t1=623, ease='ramp', hh=0.013),
    # Macro, oblique across the bench rather than square on, so it does not
    # repeat the push-in that follows.
    dict(f0=190, n=40, eyeA=(3.2, 1.52, 9.30), eyeB=(3.85, 1.47, 9.90),
         tgtA=(4.7, 1.40, 11.20), tgtB=(4.9, 1.39, 11.22), mode='interior',
         t0=623, t1=625, ease='decel', hh=0.009),

    # --------------------------------- 0:10 the reveal: a hard push to screen
    # Straight down the axis of the workstation display and stopping short of
    # it: push any closer and the camera is inside the console's own geometry,
    # which renders as black.
    dict(f0=300, n=30, eyeA=(4.20, 1.60, 8.60), eyeB=(5.30, 1.46, 10.05),
         tgtA=(6.20, 1.41, 11.25), tgtB=(6.20, 1.40, 11.25), mode='interior',
         t0=625, t1=626, ease='accel', hh=0.006),

    # ----------------------------------------------------- montage intercuts
    # The suits on their racks: the most arresting thing in the vessel.
    dict(f0=510, n=30, eyeA=(-4.3, 1.66, -20.9), eyeB=(-5.0, 1.60, -21.8),
         tgtA=(-7.3, 1.40, -23.6), tgtB=(-7.5, 1.34, -23.9), mode='interior',
         t0=628, t1=630, ease='smooth', hh=0.014),
    # The cupola, Earth filling it.
    dict(f0=630, n=30, eyeA=(0, 1.69, 21.9), eyeB=(0, 1.70, 21.25),
         tgtA=(0, 1.73, 24.5), tgtB=(0, 1.72, 24.4), mode='interior',
         t0=631, t1=633, ease='decel'),

    # ------------------------------------------------- 0:23-0:27 the payoff
    dict(f0=690, n=60, eyeA=(0, 1.66, 20.1), eyeB=(0, 1.70, 21.85),
         tgtA=(0, 1.72, 24.3), tgtB=(0, 1.73, 24.5), mode='interior',
         t0=636, t1=642, ease='smooth'),
    # Pulling away: the whole vessel over the limb, confident and still.
    dict(f0=750, n=60, eyeA=(-30, 12.5, -35), eyeB=(-37.5, 15.5, -42),
         tgtA=(-2, 5, -6), tgtB=(-2, 5, -6), mode='exterior',
         t0=643, t1=648, ease='decel'),
]

want = {}
for s in SHOTS:
    for i in range(s['n']):
        want[s['f0'] + i] = (s, i)
todo = sorted(f for f in want if not (OUT / f'{f:04d}.jpg').exists())
print(f'plates wanted {len(want)}, present {len(want)-len(todo)}, to render {len(todo)}', flush=True)
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
    print('renderer:', ok, flush=True)
    if ok != 'ok':
        print(errs[:3]); b.close(); sys.exit(1)

    for done, f in enumerate(todo, 1):
        s, i = want[f]
        k = EASE[s.get('ease', 'smooth')](i / max(1, s['n'] - 1))
        eye = lerp3(s['eyeA'], s['eyeB'], k)
        tgt = lerp3(s['tgtA'], s['tgtB'], k)
        hx, hy, hz = handheld(i, s.get('hh', 0))
        eye = [eye[0] + hx, eye[1] + hy, eye[2] + hz]
        # The aim lags the body, which is what stops handheld reading as the
        # whole world wobbling rather than the operator.
        lx, ly, lz = handheld(i - 3, s.get('hh', 0) * 0.45)
        tgt = [tgt[0] + lx, tgt[1] + ly, tgt[2] + lz]
        yaw, pitch = angles(eye, tgt)
        tt = s['t0'] + (s['t1'] - s['t0']) * k
        pg.evaluate("""([e,yaw,pitch,mode,t]) => {
          window.R.render({eye:e, yaw, pitch, time:t, alert:0, mode, hatches:{inner:0, outer:0}});
        }""", [eye, yaw, pitch, s['mode'], tt])
        pg.locator('#c').screenshot(path=str(OUT / f'{f:04d}.jpg'), type='jpeg', quality=93)
        if done % 40 == 0:
            print(f'  {done}/{len(todo)}', flush=True)
    if errs:
        print('ERRORS:', errs[:3])
    b.close()
print('plates on disk:', len(list(OUT.glob('*.jpg'))))
