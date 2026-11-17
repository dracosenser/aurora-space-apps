#!/usr/bin/env python3
"""
AURORA — 30-second commercial: score and sound design, synthesised from scratch.

Everything is generated with numpy. No sample library and no external service,
so the soundtrack is re-renderable from source and carries no licensing
question into the submission.

Built as layers rather than as a tune:

  BED        sub floor, spacecraft hum, air, a slow machinery cycle
  PULSE      the heart, quickening through the problem, calm at the end
  IMPACTS    low hits placed on the picture cuts
  RISERS     noise and pitch sweeps into the two big transitions
  WHOOSHES   movement under the whip pans and push-ins
  INTERFACE  small dry marks when AURORA does something
  HARMONY    minor at the hook, suspended at the reveal, major at the payoff
  BRAND      near-silence, then one hit and its tail

Two deliberate choices. The loudest moment is the brand hit at 27.05 s, not the
tension at 9 s: a trailer whose middle is its peak has its arc inverted. And
there is a real hole punched in the mix from 26.72 to 27.05, because a reveal
lands far harder out of near-silence than out of noise.
"""
import numpy as np
from scipy.io import wavfile
from scipy import signal as sp

SR = 48000
DUR = 30.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(11)
mix = np.zeros(N)


def idx(sec):
    return int(np.clip(sec, 0, DUR) * SR)


def env(start, end, attack, release, peak=1.0, shape=1.6):
    e = np.zeros(N)
    a0, a1 = idx(start), idx(end)
    if a1 <= a0:
        return e
    seg = np.ones(a1 - a0)
    na = min(max(1, int(attack * SR)), max(1, len(seg) // 2))
    nr = min(max(1, int(release * SR)), max(1, len(seg) // 2))
    seg[:na] = np.linspace(0, 1, na) ** shape
    seg[len(seg) - nr:] = np.linspace(1, 0, nr) ** shape
    e[a0:a1] = seg * peak
    return e


def tone(freq, start, end, attack, release, peak, detune=0.0, harm=(1.0, 0.0, 0.0)):
    drift = 1 + 0.0013 * np.sin(2 * np.pi * 0.08 * t + freq)
    sig = np.zeros(N)
    for i, amp in enumerate(harm):
        if amp:
            sig += amp * np.sin(2 * np.pi * np.cumsum(freq * (i + 1) * drift) / SR)
    if detune:
        sig += 0.5 * np.sin(2 * np.pi * np.cumsum(freq * (1 + detune) * drift) / SR)
    return sig * env(start, end, attack, release, peak)


def place(buf, at, sig, gain=1.0):
    i0 = idx(at)
    n = min(len(sig), N - i0)
    if n > 0:
        buf[i0:i0 + n] += sig[:n] * gain


def noise_band(lo, hi, n, order=2):
    sos = sp.butter(order, [lo / (SR / 2), hi / (SR / 2)], btype='band', output='sos')
    x = sp.sosfilt(sos, rng.normal(0, 1, n))
    m = np.max(np.abs(x))
    return x / m if m > 0 else x


# ==================================================================== BED
mix += tone(37.0, 0.0, 26.8, 1.8, 2.2, 0.25, detune=0.014, harm=(1.0, 0.16, 0.0))
mix += tone(55.0, 9.8, 26.8, 2.0, 2.0, 0.095)
mix += noise_band(92, 185, N, 4) * (env(0.0, 26.9, 2.2, 2.6, 0.085) + env(0.0, 5.2, 1.4, 1.0, 0.045))
mix += noise_band(2400, 7200, N, 2) * env(0.0, 29.2, 3.0, 4.0, 0.013)
# A pump somewhere, well down in the mix.
mix += (0.5 + 0.5 * np.sin(2 * np.pi * 0.21 * t)) * noise_band(240, 420, N, 2) * env(0.6, 26.5, 2.5, 3.0, 0.030)


# ================================================================== PULSE
def heartbeat(strength=1.0, spacing=0.30):
    out = np.zeros(int(0.62 * SR))
    for off, amp, f0 in [(0.0, 1.0, 54.0), (spacing, 0.60, 46.0)]:
        i0 = int(off * SR)
        n = int(0.26 * SR)
        lt = np.arange(n) / SR
        f = f0 * np.exp(-6.0 * lt)
        out[i0:i0 + n] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-14.0 * lt) * amp * strength
    return out


tb, bpm = 0.62, 48.0
while tb < 10.4:
    place(mix, tb, heartbeat(0.95 if tb < 5 else 1.05))
    tb += 60.0 / bpm
    bpm = min(78.0, bpm + 2.6)

tb, bpm = 23.2, 54.0
while tb < 26.6:
    place(mix, tb, heartbeat(0.52))
    tb += 60.0 / bpm


# ================================================================ IMPACTS
def impact(level=1.0, length=2.2, f0=58.0, click=0.5):
    n = int(length * SR)
    lt = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(f0 * np.exp(-1.5 * lt)) / SR) * np.exp(-2.3 * lt)
    sub = np.sin(2 * np.pi * np.cumsum(32 * np.exp(-0.9 * lt)) / SR) * np.exp(-1.7 * lt) * 0.8
    tr = noise_band(600, 5200, n, 2) * np.exp(-55 * lt) * click
    return (body + sub + tr) * level


place(mix, 0.30, impact(0.62, 3.0, 50.0, 0.30))
for at, lv in [(5.00, 0.40), (6.30, 0.30), (7.30, 0.30), (8.30, 0.34), (9.30, 0.38)]:
    place(mix, at, impact(lv, 1.5, 62.0, 0.5))
place(mix, 10.00, impact(0.78, 2.8, 54.0, 0.6))
for at in (15.0, 17.0, 19.0, 21.0):
    place(mix, at, impact(0.34, 1.3, 66.0, 0.45))
place(mix, 23.05, impact(0.46, 2.6, 48.0, 0.25))


# ================================================================= RISERS
def riser(length, f_lo=180, f_hi=2600, curve=2.4):
    n = int(length * SR)
    lt = np.arange(n) / SR
    k = (lt / lt[-1]) ** curve
    sweep = np.sin(2 * np.pi * np.cumsum(f_lo + (f_hi - f_lo) * k) / SR)
    return (sweep * 0.5 + noise_band(500, 9000, n, 2) * k * 0.5) * (k ** 1.2)


place(mix, 8.15, riser(1.85) * 0.17)
place(mix, 25.55, riser(1.5, 140, 1800, 2.0) * 0.12)


# =============================================================== WHOOSHES
def whoosh(length=0.42, lo=260, hi=4200):
    n = int(length * SR)
    k = np.arange(n) / (n - 1)
    return noise_band(lo, hi, n, 2) * np.sin(np.pi * k) ** 1.5


for at, g in [(5.00, 0.10), (6.30, 0.085), (7.30, 0.085), (8.30, 0.09), (9.62, 0.12),
              (15.0, 0.07), (17.0, 0.07), (19.0, 0.07), (21.0, 0.07), (23.05, 0.08)]:
    place(mix, at - 0.16, whoosh() * g)


# =============================================================== INTERFACE
def blip(f=1850.0, length=0.030, amp=0.05, decay=140.0):
    n = int(length * SR)
    lt = np.arange(n) / SR
    return np.sin(2 * np.pi * f * lt) * np.exp(-decay * lt) * amp


tt, gap = 5.2, 0.46
while tt < 9.9:
    place(mix, tt, blip(2050, 0.024, 0.055))
    tt += gap
    gap = max(0.15, gap * 0.85)
for at in (10.75, 11.2, 11.65, 12.3, 12.95, 13.6):
    place(mix, at, blip(1500, 0.034, 0.042, 110))
for at in (15.35, 17.35, 19.35, 21.35):
    place(mix, at, blip(1250, 0.040, 0.038, 90))


# ================================================================= HARMONY
def chord(freqs, start, end, attack, release, peak):
    for i, f in enumerate(freqs):
        yield tone(f, start, end, attack, release, peak * (0.94 ** i), harm=(1.0, 0.22, 0.07))


for s in chord([146.83, 174.61, 220.00], 4.6, 10.2, 1.3, 0.8, 0.060):
    mix += s                                   # D minor, unresolved
for s in chord([146.83, 196.00, 220.00, 293.66], 10.0, 15.2, 0.9, 1.2, 0.072):
    mix += s                                   # Dsus4, opening
for s in chord([174.61, 220.00, 261.63, 349.23], 15.0, 23.2, 1.3, 1.1, 0.062):
    mix += s                                   # F major, confident
for s in chord([164.81, 196.00, 246.94, 329.63], 23.0, 26.75, 1.5, 1.2, 0.078):
    mix += s                                   # E minor, the emotional peak

for at, f in [(15.25, 587.33), (17.25, 659.25), (19.25, 698.46), (21.25, 880.00)]:
    mix += tone(f, at, at + 1.4, 0.02, 1.3, 0.048, harm=(1.0, 0.12, 0.03))


# =================================================================== BRAND
duck = np.ones(N)
d0, d1 = idx(26.72), idx(27.05)
duck[d0:d1] = np.linspace(1.0, 0.12, d1 - d0)
duck[d1:idx(27.1)] = 0.12
mix *= duck

HIT = 27.05
place(mix, HIT, impact(1.0, 3.0, 46.0, 0.55))
mix += tone(110.00, HIT, HIT + 2.85, 0.006, 2.7, 0.195, harm=(1.0, 0.36, 0.12))
mix += tone(164.81, HIT, HIT + 2.80, 0.010, 2.6, 0.105, harm=(1.0, 0.18, 0.0))
mix += tone(246.94, HIT, HIT + 2.75, 0.014, 2.5, 0.070, harm=(1.0, 0.10, 0.0))
mix += tone(329.63, HIT, HIT + 2.70, 0.020, 2.4, 0.042, harm=(1.0, 0.08, 0.0))
mix += noise_band(1800, 9000, N, 2) * env(HIT, 29.9, 0.03, 2.4, 0.022)


# =============================================================== MASTERING
sos = sp.butter(2, 26 / (SR / 2), btype='high', output='sos')
mix = sp.sosfilt(sos, mix)
mix = mix / np.max(np.abs(mix)) * 0.74
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
mix *= env(0.0, DUR, 0.12, 0.55, 1.0)

d = int(0.0055 * SR)
left, right = mix.copy(), mix.copy()
right[d:] += 0.12 * mix[:-d]
left[d:] += 0.07 * mix[:-d]
stereo = np.stack([left, right], axis=1)
stereo /= np.max(np.abs(stereo)) / 0.92
wavfile.write('/tmp/vid/score.wav', SR, (stereo * 32767).astype(np.int16))

print(f'score.wav {DUR:.0f}s  peak {np.max(np.abs(stereo)):.3f}')
for a, b, n in [(0, 5, 'hook'), (5, 10, 'problem'), (10, 15, 'reveal'),
                (15, 23, 'montage'), (23, 27, 'payoff'), (27, 30, 'brand')]:
    seg = stereo[a * SR:b * SR]
    print(f'  {n:8} {a:2d}-{b:2d}s  rms {np.sqrt((seg**2).mean()):.4f}  peak {np.abs(seg).max():.3f}')
