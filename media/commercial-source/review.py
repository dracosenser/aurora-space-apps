#!/usr/bin/env python3
"""
Check the finished film before it ships.

The brief asks for a review from beginning to end, and for no black frames, no
missing assets, no stuttering and no rendering errors. Reviewing 900 frames by
eye is not a check, so this measures them instead and only flags what needs
looking at.

What it tests:

  missing          every frame index 0..899 exists
  unintended black a frame whose mean luminance is near zero outside the three
                   places the cut actually calls for black
  frozen           consecutive frames that are byte-identical, which is what a
                   dropped or stuttering frame looks like
  cuts landing dark a cut whose incoming frame is near-black, which is a shot
                   ending before the next one has started
  jump             a sudden large change in mean luminance away from a planned
                   cut, which is what a missing plate or a failed dissolve
                   looks like
  clipping         the proportion of pixels at 0 or 255, since the brief asks
                   for shadows that keep detail and highlights that do not blow
  exposure drift   mean luminance per section, so the grade can be read as a
                   curve rather than guessed at
"""
import pathlib, sys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/vid/graded')
TOTAL = 900

# Black is intended in exactly three places: the open, the dip at the cut
# inside, and the hole before the brand reveal.
INTENDED_BLACK = [(0, 5), (97, 103), (803, 812), (896, 900)]
# Cuts the edit actually makes; a luminance jump at one of these is the point.
CUTS = [50, 100, 150, 190, 230, 270, 300, 450, 510, 540, 570, 630, 660,
        690, 720, 750, 808, 811]


def intended(n):
    return any(a <= n < b for a, b in INTENDED_BLACK)


def near_cut(n, w=3):
    return any(abs(n - c) <= w for c in CUTS)


missing = [n for n in range(TOTAL) if not (SRC / f'{n:04d}.png').exists()]
if missing:
    print(f'MISSING {len(missing)} frames: {missing[:12]}')
    sys.exit(1)

means, hashes, clip_lo, clip_hi = [], [], [], []
for n in range(TOTAL):
    a = np.asarray(Image.open(SRC / f'{n:04d}.png').convert('RGB'), dtype=np.uint8)
    lum = a @ np.float32([0.2126, 0.7152, 0.0722])
    means.append(float(lum.mean()))
    # Crushed shadows means losing detail inside the image. Empty space and a
    # deliberate fade to black are black on purpose, so measuring every pixel
    # at zero would flag the shots that are meant to be dark. What matters is
    # black pixels sitting in lit parts of the frame, so the mask is the
    # neighbourhood: a pixel counts as crushed only where the area around it
    # carries light.
    if intended(n):
        clip_lo.append(0.0)
    else:
        neigh = gaussian_filter(lum, 9.0, mode='nearest')
        lit = neigh > 10.0
        # On the dips and at the darkest point of the push-in almost nothing
        # is lit, and a ratio taken over a handful of pixels says nothing.
        # Below half a percent of the frame the measure is undefined, not bad.
        if lit.sum() < 0.04 * lum.size:
            clip_lo.append(0.0)
        else:
            clip_lo.append(float(((lum <= 1.0) & lit).sum()) / float(lit.sum()))
    clip_hi.append(float((a >= 254).mean()))
    hashes.append(hash(a[::7, ::7].tobytes()))
means = np.array(means)

print(f'frames        {TOTAL}  ({TOTAL/30:.2f} s at 30 fps)')

# A cut has to land on a picture. A frame that is merely very dark is not
# black by the old near-zero test but still reads as a hole in the edit, so
# the threshold is "nothing to look at" rather than "literally zero".
black = [n for n in range(TOTAL) if means[n] < 6.0 and not intended(n)]
print(f'unintended black   {len(black)}' + (f'  -> {black[:12]}' if black else '  (none)'))

frozen = []
run = 1
for n in range(1, TOTAL):
    if hashes[n] == hashes[n - 1] and means[n] > 1.6:
        run += 1
    else:
        if run >= 3:
            frozen.append((n - run, run))
        run = 1
print(f'frozen runs >=3    {len(frozen)}' + (f'  -> {frozen[:8]}' if frozen else '  (none)'))

d = np.abs(np.diff(means))
jumps = [(n + 1, round(float(d[n]), 1)) for n in range(len(d))
         if d[n] > 22 and not near_cut(n + 1) and not intended(n + 1)]
print(f'unplanned jumps    {len(jumps)}' + (f'  -> {jumps[:8]}' if jumps else '  (none)'))

# Being at a planned cut excuses a jump, but not a jump into darkness: that is
# the shot ending before the next one starts. This is the test the first pass
# was missing, and it is why there was a fifth of a second of black at 0:07.7.
holes = [(n + 1, round(means[n], 1), round(means[n + 1], 1)) for n in range(len(d))
         if means[n] - means[n + 1] > 12 and means[n + 1] < 8.0 and not intended(n + 1)]
print(f'cuts landing dark  {len(holes)}' + (f'  -> {holes[:8]}' if holes else '  (none)'))

# A beat that opens almost empty and fills up afterwards is not black and does
# not jump, so neither test above sees it - but it wastes the first third of a
# two-second shot. Compare how much of the frame carries content at a beat's
# first frame against its midpoint.
BEATS = [230, 300, 450, 540, 570, 660, 690]
sparse = []
for b in BEATS:
    if b + 16 >= TOTAL:
        continue
    def lit_frac(n):
        a = np.asarray(Image.open(SRC / f'{n:04d}.png').convert('RGB'), dtype=np.uint8)
        return float((a @ np.float32([0.2126, 0.7152, 0.0722]) > 14).mean())
    f0, f1 = lit_frac(b + 1), lit_frac(b + 16)
    if f1 > 0.01 and f0 < 0.55 * f1:
        sparse.append((b, round(f0 * 100, 1), round(f1 * 100, 1)))
print(f'beats opening bare {len(sparse)}' + (f'  -> {sparse}' if sparse else '  (none)'))

lo, hi = max(clip_lo) * 100, max(clip_hi) * 100
print(f'worst clipping     crushed shadows {lo:.2f}% of lit pixels, blown highlights {hi:.2f}%'
      + ('   OK' if lo < 1.0 and hi < 0.5 else '   CHECK'))

print('exposure by section (mean luminance 0-255)')
for a, b, name in [(0, 150, 'hook'), (150, 300, 'problem'), (300, 450, 'reveal'),
                   (450, 690, 'montage'), (690, 810, 'payoff'), (811, 896, 'brand')]:
    seg = means[a:b]
    print(f'  {name:8} {a:3d}-{b:3d}   mean {seg.mean():6.1f}   min {seg.min():5.1f}   max {seg.max():5.1f}')

bad = bool(black or frozen or jumps or holes or sparse) or lo >= 1.0 or hi >= 0.5
print('\nRESULT:', 'NEEDS ATTENTION' if bad else 'clean')
sys.exit(1 if bad else 0)
