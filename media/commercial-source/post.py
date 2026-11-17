#!/usr/bin/env python3
"""
AURORA — 30-second commercial: the finishing pass.

Everything that belongs on pixels rather than in the DOM happens here, so the
frame renderer stays deterministic and cheap and the look can be re-tuned
without re-rendering the film.

Per frame, in this order:

  chromatic aberration   radial, strongest at the edge of frame, strongest on
                         the push-ins where a real lens would show it most
  defocus / DOF          a sharp plate blended toward a blurred copy by a
                         radial mask, so macro shots fall off at the edges
  directional blur       on the tracking and whip-cut frames only
  bloom + halation       thresholded highlights, blurred in linear light, with
                         a warm bleed, which is what gives Earth its glow
  anamorphic flare       a horizontal streak, and only when the frame actually
                         contains a bright source to motivate it
  grade                  lift / gamma / gain per channel, a contrast S-curve
                         and a saturation trim, on a timeline
  glitch                 slice displacement and an RGB split, nine frames only,
                         at the peak of the tension before the reveal
  grain                  deterministic per-frame noise, heavier in the shadows

The grade deliberately lifts the shadows rather than crushing them and holds
the highlights under 1.0, so the blacks keep detail and the Earth limb does not
clip. The blue cast is on a curve: coolest through the problem, warmest at the
payoff, so the whole film is not one colour.
"""
import sys, pathlib
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, gaussian_filter1d
from multiprocessing import Pool

IN = pathlib.Path('/tmp/vid/frames')
OUT = pathlib.Path('/tmp/vid/graded')
OUT.mkdir(exist_ok=True, parents=True)
W, H = 1920, 1080
TOTAL = 900

# A radius map, built once per worker: used by the aberration and the defocus.
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
RX = (xx - W / 2) / (W / 2)
RY = (yy - H / 2) / (H / 2)
R = np.sqrt(RX * RX + RY * RY) / 1.4142
del xx, yy


def lerp(a, b, k):
    return a + (b - a) * k


def ramp(n, a, b):
    """0 before a, 1 after b, smooth between."""
    if b == a:
        return 0.0 if n < a else 1.0
    k = float(np.clip((n - a) / (b - a), 0, 1))
    return k * k * (3 - 2 * k)


# ====================================================== the look, by frame
def params(n):
    p = dict(ca=0.0010, dof=0.00, dof_r=0.55, dirblur=0.0, dirang='h',
             bloom=0.55, bloom_thr=0.74, flare=0.0, grain=0.016, shoulder=1.4,
             lift=(0.012, 0.014, 0.020), gain=(0.96, 0.975, 1.00),
             gamma=(1.00, 1.00, 1.00), sat=0.90, scurve=0.30, glitch=0.0)

    # ---- 0:00-0:05 the hook. Very dark, cool, grainy, soft at the edges.
    if n < 100:                                  # exterior
        p.update(ca=0.0014, dof=0.30, dof_r=0.62, bloom=0.85, bloom_thr=0.56, shoulder=2.6,
                 flare=0.55, grain=0.026, sat=0.80, scurve=0.40,
                 lift=(0.010, 0.013, 0.022), gain=(0.88, 0.905, 0.95))
    elif n < 150:                                # medical bay macro, handheld
        p.update(ca=0.0020, dof=0.78, dof_r=0.30, bloom=0.50, bloom_thr=0.66, shoulder=2.2,
                 flare=0.20, grain=0.024, sat=0.84, scurve=0.38,
                 lift=(0.012, 0.015, 0.024), gain=(0.90, 0.92, 0.96))

    # ---- 0:05-0:10 the problem. Tighter, cooler, more contrast.
    elif n < 190:                                # spine tracking
        p.update(ca=0.0017, dof=0.34, dof_r=0.50, dirblur=0.45, bloom=0.60, shoulder=2.4,
                 bloom_thr=0.62, grain=0.022, sat=0.82, scurve=0.46,
                 lift=(0.010, 0.013, 0.023), gain=(0.90, 0.925, 0.975))
    elif n < 230:                                # console macro
        p.update(ca=0.0023, dof=0.80, dof_r=0.26, bloom=0.65, bloom_thr=0.60, shoulder=2.2,
                 grain=0.021, sat=0.84, scurve=0.46,
                 lift=(0.011, 0.014, 0.024), gain=(0.91, 0.935, 0.985))
    elif n < 270:                                # the display
        p.update(ca=0.0016, dof=0.30, dof_r=0.52, bloom=0.70, bloom_thr=0.66, shoulder=0.8,
                 grain=0.017, sat=0.88, scurve=0.44,
                 lift=(0.010, 0.013, 0.021), gain=(0.93, 0.95, 0.99))
    elif n < 300:                                # the push into the screen
        k = (n - 270) / 29
        p.update(ca=lerp(0.0022, 0.0062, k), dof=lerp(0.40, 0.14, k), dof_r=0.34,
                 dirblur=lerp(0.3, 1.5, k), dirang='radial', bloom=lerp(0.7, 1.5, k),
                 bloom_thr=lerp(0.62, 0.42, k), grain=0.020, sat=0.86, scurve=0.46, shoulder=1.8,
                 lift=(0.010, 0.013, 0.023), gain=(0.92, 0.945, 0.99))
        if 286 <= n <= 294:                      # the tension glitch
            p['glitch'] = 0.35 + 0.65 * (1 - abs(n - 290) / 5)

    # ---- 0:10-0:15 the reveal. The frame opens up.
    elif n < 450:
        k = ramp(n, 300, 340)
        p.update(ca=lerp(0.0040, 0.0013, k), dof=lerp(0.45, 0.10, k), dof_r=0.50,
                 bloom=lerp(1.5, 0.80, k), bloom_thr=lerp(0.46, 0.70, k),
                 grain=0.015, sat=lerp(0.88, 0.97, k), scurve=0.36, shoulder=lerp(1.6, 0.7, k),
                 lift=(0.012, 0.015, 0.022), gain=(0.97, 0.985, 1.015))

    # ---- 0:15-0:23 the product montage
    elif n < 510 or (540 <= n < 630) or (660 <= n < 720):      # interface beats
        p.update(ca=0.0012, dof=0.10, bloom=0.78, bloom_thr=0.70, grain=0.014, shoulder=0.7,
                 sat=0.98, scurve=0.34,
                 lift=(0.013, 0.016, 0.022), gain=(0.98, 0.995, 1.02))
    elif n < 540:                                # the suits
        p.update(ca=0.0019, dof=0.52, dof_r=0.40, bloom=0.80, bloom_thr=0.60, shoulder=2.2,
                 flare=0.30, grain=0.020, sat=0.92, scurve=0.40,
                 lift=(0.013, 0.016, 0.024), gain=(0.95, 0.97, 1.00))
    elif n < 660:                                # the cupola
        p.update(ca=0.0018, dof=0.40, dof_r=0.46, bloom=1.05, bloom_thr=0.52, shoulder=2.4,
                 flare=0.60, grain=0.018, sat=0.98, scurve=0.36,
                 lift=(0.014, 0.017, 0.024), gain=(0.99, 1.00, 1.02))

    # ---- 0:23-0:27 the payoff. Warmest and richest in the film.
    elif n < 750:                                # the window
        p.update(ca=0.0015, dof=0.36, dof_r=0.48, bloom=1.10, bloom_thr=0.50, shoulder=2.4,
                 flare=0.65, grain=0.016, sat=1.04, scurve=0.33,
                 lift=(0.016, 0.018, 0.023), gain=(1.02, 1.015, 1.02))
    elif n < 810:                                # pulling away
        p.update(ca=0.0016, dof=0.30, dof_r=0.54, bloom=1.00, bloom_thr=0.54, shoulder=2.6,
                 flare=0.70, grain=0.017, sat=1.02, scurve=0.34,
                 lift=(0.015, 0.017, 0.024), gain=(1.01, 1.01, 1.025))

    # ---- 0:27-0:30 the brand
    else:
        p.update(ca=0.0009, dof=0.12, bloom=0.95, bloom_thr=0.60, grain=0.011, shoulder=0.5,
                 sat=0.94, scurve=0.30,
                 lift=(0.010, 0.012, 0.018), gain=(1.00, 1.005, 1.02))
    return p


# ============================================================== operators
def chroma(img, amt):
    """Radial aberration: red pulled out, blue pulled in, zero at centre."""
    if amt < 1e-5:
        return img
    out = img.copy()
    for ch, s in ((0, 1.0 + amt), (2, 1.0 - amt)):
        zy = np.clip(((np.arange(H) - H / 2) / s + H / 2), 0, H - 1)
        zx = np.clip(((np.arange(W) - W / 2) / s + W / 2), 0, W - 1)
        y0 = zy.astype(np.int32); x0 = zx.astype(np.int32)
        y1 = np.minimum(y0 + 1, H - 1); x1 = np.minimum(x0 + 1, W - 1)
        fy = (zy - y0)[:, None].astype(np.float32); fx = (zx - x0)[None, :].astype(np.float32)
        c = img[:, :, ch]
        top = c[np.ix_(y0, x0)] * (1 - fx) + c[np.ix_(y0, x1)] * fx
        bot = c[np.ix_(y1, x0)] * (1 - fx) + c[np.ix_(y1, x1)] * fx
        out[:, :, ch] = top * (1 - fy) + bot * fy
    return out


def defocus(img, amt, focus_r):
    """Sharp in the focal zone, falling off outward: cheap but convincing DOF."""
    if amt < 0.02:
        return img
    small = img[::2, ::2]
    blur = gaussian_filter(small, (3.4, 3.4, 0), mode='nearest')
    blur = np.repeat(np.repeat(blur, 2, axis=0), 2, axis=1)[:H, :W]
    mask = np.clip((R - focus_r) / 0.55, 0, 1) ** 1.6 * amt
    return img * (1 - mask[..., None]) + blur * mask[..., None]


def direction_blur(img, amt, kind):
    if amt < 0.05:
        return img
    if kind == 'radial':
        # Zoom blur, approximated by blending successively scaled copies.
        acc = img * 0.44
        wsum = 0.44
        for s, w in ((1.012, 0.22), (1.026, 0.18), (1.042, 0.16)):
            zy = np.clip(((np.arange(H) - H / 2) / s + H / 2), 0, H - 1).astype(np.int32)
            zx = np.clip(((np.arange(W) - W / 2) / s + W / 2), 0, W - 1).astype(np.int32)
            acc += img[np.ix_(zy, zx)] * w
            wsum += w
        acc /= wsum
        return lerp(img, acc, min(1.0, amt))
    b = gaussian_filter1d(img, 2.6 * amt, axis=1, mode='nearest')
    return lerp(img, b, 0.6)


def bloom(img, gain, thr):
    """Thresholded highlights blurred in linear light, with a warm halation."""
    if gain < 0.02:
        return img
    lin = np.clip(img, 0, 1) ** 2.2
    lum = lin @ np.float32([0.2126, 0.7152, 0.0722])
    bright = np.clip(lum - thr, 0, None)[..., None] * lin
    q = bright[::4, ::4]
    wide = gaussian_filter(q, (11.0, 11.0, 0), mode='nearest')
    tight = gaussian_filter(q, (3.2, 3.2, 0), mode='nearest')
    b = wide * 0.62 + tight * 0.38
    b = np.repeat(np.repeat(b, 4, axis=0), 4, axis=1)[:H, :W]
    # Halation: the red channel bleeds furthest, as it does on film.
    b = b * np.float32([1.14, 1.0, 0.94])
    return np.clip((lin + b * gain * 0.85) ** (1 / 2.2), 0, 1.6)


def flare(img, gain):
    """One horizontal anamorphic streak, and only if the frame earns it."""
    if gain < 0.03:
        return img
    lum = img @ np.float32([0.2126, 0.7152, 0.0722])
    if float(lum.max()) < 0.80:          # nothing bright enough to motivate it
        return img
    src = np.clip(lum - 0.80, 0, None)[::4, ::4]
    if float(src.sum()) < 2.0:
        return img
    streak = gaussian_filter1d(src, 46.0, axis=1, mode='constant')
    streak = gaussian_filter1d(streak, 1.1, axis=0, mode='constant')
    streak = np.repeat(np.repeat(streak, 4, axis=0), 4, axis=1)[:H, :W]
    m = float(streak.max()) or 1.0
    streak = (streak / m)[..., None] * np.float32([0.42, 0.66, 1.0])
    return np.clip(img + streak * gain * 0.16, 0, 1.6)


def glitch(img, amt, n):
    """Slice displacement plus an RGB split. Nine frames, once."""
    if amt < 0.02:
        return img
    rng = np.random.default_rng(900 + n)
    out = img.copy()
    for _ in range(int(3 + 5 * amt)):
        y0 = int(rng.integers(0, H - 40))
        hgt = int(rng.integers(8, 54))
        sh = int(rng.integers(-52, 52) * amt)
        out[y0:y0 + hgt] = np.roll(out[y0:y0 + hgt], sh, axis=1)
    sp = int(6 * amt)
    if sp:
        out[:, :, 0] = np.roll(out[:, :, 0], sp, axis=1)
        out[:, :, 2] = np.roll(out[:, :, 2], -sp, axis=1)
    return lerp(img, out, 0.85)


def shoulder(x, strength, knee=0.70):
    """A filmic roll-off above the knee.

    The renderer's cloud tops and ceiling panels come out at or past pure
    white, and the brief asks for controlled highlights and a rich, detailed
    Earth. Hard-clipping them loses the limb; this compresses everything above
    the knee into the remaining range instead, so the clouds keep separation.
    Rational rather than tanh: same shape, a fraction of the cost over 900
    frames.
    """
    if strength < 0.02:
        return np.clip(x, 0, 1)
    hi = np.clip(x - knee, 0, None)
    span = 1.0 - knee
    return np.clip(np.minimum(x, knee) + hi / (1.0 + hi / span * strength), 0, 1)


def grade(img, lift, gain, gamma, sat, scurve, shoulder_amt=1.0):
    x = np.clip(img, 0, 1.6)
    lift = np.float32(lift); gain = np.float32(gain); gamma = np.float32(gamma)
    x = np.clip(x, 0, None) ** (1.0 / gamma)
    x = lift + (gain - lift) * x
    x = shoulder(x, shoulder_amt)
    s = np.clip(x, 0, 1)
    x = lerp(x, s * s * (3 - 2 * s), scurve)          # filmic contrast
    lum = (x @ np.float32([0.2126, 0.7152, 0.0722]))[..., None]
    x = lum + (x - lum) * sat
    return np.clip(x, 0, 1)


def grain(img, amt, n):
    if amt < 1e-4:
        return img
    rng = np.random.default_rng(n * 7919 + 13)
    # Half-res noise, upsampled: grain has structure, it is not per-pixel hash.
    g = rng.normal(0, 1, (H // 2, W // 2, 1)).astype(np.float32)
    g = gaussian_filter(g, (0.65, 0.65, 0), mode='nearest')
    g = np.repeat(np.repeat(g, 2, axis=0), 2, axis=1)[:H, :W]
    lum = img @ np.float32([0.2126, 0.7152, 0.0722])
    shadow = (1.25 - np.clip(lum, 0, 1))[..., None]   # heavier where it is dark
    return np.clip(img + g * amt * shadow, 0, 1)


# ================================================================= driver
def do(n):
    src = IN / f'{n:04d}.png'
    dst = OUT / f'{n:04d}.png'
    if dst.exists() or not src.exists():
        return 0
    p = params(n)
    img = np.asarray(Image.open(src).convert('RGB'), dtype=np.float32) / 255.0
    img = chroma(img, p['ca'])
    img = defocus(img, p['dof'], p['dof_r'])
    img = direction_blur(img, p['dirblur'], p['dirang'])
    img = bloom(img, p['bloom'], p['bloom_thr'])
    img = flare(img, p['flare'])
    img = glitch(img, p['glitch'], n)
    img = grade(img, p['lift'], p['gain'], p['gamma'], p['sat'], p['scurve'], p['shoulder'])
    img = grain(img, p['grain'], n)
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(dst)
    return 1


if __name__ == '__main__':
    frames = list(range(TOTAL)) if len(sys.argv) < 2 else [int(a) for a in sys.argv[1:]]
    todo = [n for n in frames if not (OUT / f'{n:04d}.png').exists()]
    print(f'grading {len(todo)} of {len(frames)}', flush=True)
    with Pool(2) as pool:
        for i, _ in enumerate(pool.imap_unordered(do, todo, chunksize=4), 1):
            if i % 60 == 0:
                print(f'  {i}/{len(todo)}', flush=True)
    print('graded on disk:', len(list(OUT.glob('*.png'))))
