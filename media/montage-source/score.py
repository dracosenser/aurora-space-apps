#!/usr/bin/env python3
"""
AURORA — 30-second cinematic score, synthesised from scratch.

No sample library and no external service: every sound here is generated with
numpy, which keeps the whole thing re-renderable from source and free of any
licensing question.

The design follows the storyboard's emotional arc rather than a musical form:

  0.0 – 4.0   a sub-bass floor and a slow heart, almost nothing else
  4.0 – 9.0   tension accumulates — a rising partial, a quickening tick
  9.0 – 15.0  the reveal: the harmony opens from minor to suspended fourth
 15.0 – 22.0  momentum: a steady pulse with a tone on each feature beat
 22.0 – 27.0  resolution, the heart returns calm
 27.0 – 30.0  one restrained hit and its tail

Everything is held well below clipping and the ending is deliberately not a
wall of sound; the brief asked for powerful but restrained, and a trailer that
peaks at -1 dBFS for its last three seconds is neither.
"""
import numpy as np
from scipy.io import wavfile
from scipy import signal as sp

SR = 48000
DUR = 30.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

mix = np.zeros(N)


def env(start, end, attack, release, peak=1.0):
    """A trapezoid window in seconds, for shaping one element."""
    e = np.zeros(N)
    a0, a1 = int(start * SR), int(end * SR)
    if a1 <= a0:
        return e
    seg = np.ones(a1 - a0)
    na = max(1, int(attack * SR))
    nr = max(1, int(release * SR))
    na = min(na, len(seg) // 2)
    nr = min(nr, len(seg) // 2)
    seg[:na] = np.linspace(0, 1, na) ** 1.6
    seg[-nr:] = np.linspace(1, 0, nr) ** 1.6
    e[a0:a1] = seg * peak
    return e


def tone(freq, start, end, attack, release, peak, detune=0.0, harm=(1.0, 0.0, 0.0)):
    """A few partials with a slow drift, which keeps it from sounding sterile."""
    drift = 1 + 0.0012 * np.sin(2 * np.pi * 0.09 * t + freq)
    sig = np.zeros(N)
    for i, amp in enumerate(harm):
        if amp == 0:
            continue
        f = freq * (i + 1) * drift
        sig += amp * np.sin(2 * np.pi * np.cumsum(f) / SR)
    if detune:
        sig += 0.5 * np.sin(2 * np.pi * np.cumsum(freq * (1 + detune) * drift) / SR)
    return sig * env(start, end, attack, release, peak)


# ---------------------------------------------------------------- sub floor
# The bed the whole piece sits on. Two close frequencies beat slowly against
# each other, which reads as pressure rather than as a note.
mix += tone(38.0, 0.0, 27.6, 1.6, 2.4, 0.26, detune=0.013, harm=(1.0, 0.18, 0.0))
mix += tone(57.0, 8.6, 27.6, 2.2, 2.0, 0.10, harm=(1.0, 0.0, 0.0))


# ------------------------------------------------------------ spacecraft hum
# Narrow-band noise around 120 Hz with a little air above it: the sound of a
# pressurised module, not a synthesiser pad.
noise = rng.normal(0, 1, N)
# Second-order sections, not transfer-function form: a narrow band this low
# (95-190 Hz against a 24 kHz Nyquist) is numerically unstable as b/a and the
# filter returned nothing but NaN.
sos = sp.butter(4, [95 / (SR / 2), 190 / (SR / 2)], btype='band', output='sos')
hum = sp.sosfilt(sos, noise)
hum /= np.max(np.abs(hum)) + 1e-9
mix += hum * (env(0.0, 27.0, 2.0, 3.0, 0.085) + env(0.0, 4.2, 1.2, 0.8, 0.05))

sos = sp.butter(2, [2200 / (SR / 2), 7000 / (SR / 2)], btype='band', output='sos')
air = sp.sosfilt(sos, rng.normal(0, 1, N))
air /= np.max(np.abs(air)) + 1e-9
mix += air * env(0.0, 29.0, 3.0, 4.0, 0.012)


# ------------------------------------------------------------------- the heart
def heartbeat(at, strength=1.0, spacing=0.30):
    """Lub-dub: two damped thumps, the second softer and a little higher."""
    out = np.zeros(N)
    for k, (off, amp, f0) in enumerate([(0.0, 1.0, 54.0), (spacing, 0.62, 47.0)]):
        i0 = int((at + off) * SR)
        if i0 >= N:
            continue
        dur = int(0.26 * SR)
        i1 = min(N, i0 + dur)
        n = i1 - i0
        lt = np.arange(n) / SR
        # Pitch falls through the thump, which is what makes it a body sound.
        f = f0 * np.exp(-6.0 * lt)
        thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-14.0 * lt)
        out[i0:i1] += thump * amp * strength
        void = k
    return out


# Slow and spaced at the open; quickening slightly as the problem emerges;
# steady and calm again once AURORA has the picture.
beat_times = []
tb = 0.55
bpm = 52.0
while tb < 9.2:
    beat_times.append((tb, 0.95))
    tb += 60.0 / bpm
    bpm = min(74.0, bpm + 2.4)          # tension: the heart speeds up
for bt, s in beat_times:
    mix += heartbeat(bt, s)

# Calm again under the payoff.
tb, bpm = 22.3, 56.0
while tb < 27.0:
    mix += heartbeat(tb, 0.55)
    tb += 60.0 / bpm


# ------------------------------------------------------------------- the tick
# A data-acquisition tick that accelerates through the problem section. Short,
# band-limited, and quiet: it should register as instrumentation, not percussion.
def tick(at, amp, f=2100.0):
    i0 = int(at * SR)
    n = int(0.022 * SR)
    if i0 + n >= N:
        return np.zeros(N)
    out = np.zeros(N)
    lt = np.arange(n) / SR
    out[i0:i0 + n] = np.sin(2 * np.pi * f * lt) * np.exp(-150 * lt) * amp
    return out


tt, gap = 4.1, 0.50
while tt < 9.0:
    mix += tick(tt, 0.085)
    tt += gap
    gap = max(0.16, gap * 0.86)         # accelerating

# A steadier instrument tick through the feature montage, one per beat.
for k in range(14):
    mix += tick(15.0 + k * 0.5, 0.05, 1750.0)


# ------------------------------------------------------- tension, then release
# A partial that rises through the problem section and resolves at the reveal.
rise_f = 180 + 300 * np.clip((t - 4.0) / 5.2, 0, 1) ** 2.2
mix += np.sin(2 * np.pi * np.cumsum(rise_f) / SR) * env(4.2, 9.25, 2.4, 0.35, 0.040)

# The alert: two restrained amber blips, not a klaxon.
for at in (7.35, 7.62):
    mix += tone(880.0, at, at + 0.14, 0.004, 0.11, 0.048, harm=(1.0, 0.3, 0.0))


# --------------------------------------------------------------- the harmony
# D minor opening to a suspended fourth at the reveal, then lifting a tone for
# the payoff. Restrained voicings, no big orchestral swell.
def chord(freqs, start, end, attack, release, peak):
    for i, f in enumerate(freqs):
        yield tone(f, start, end, attack, release, peak * (0.95 ** i), harm=(1.0, 0.22, 0.07))


for s in chord([146.83, 174.61, 220.00], 9.0, 15.4, 1.1, 1.0, 0.075):
    mix += s                                    # Dm
for s in chord([146.83, 196.00, 220.00, 293.66], 15.0, 22.3, 1.4, 1.2, 0.062):
    mix += s                                    # Dsus4 — opens without resolving
for s in chord([164.81, 196.00, 246.94, 329.63], 22.0, 27.4, 1.6, 1.6, 0.070):
    mix += s                                    # Em — the lift into the payoff


# --------------------------------------------------- feature-beat tone marks
# One clean tone as each benefit line appears, spaced to the edit.
for at, f in [(15.3, 587.33), (17.6, 659.25), (19.9, 783.99)]:
    mix += tone(f, at, at + 1.5, 0.02, 1.35, 0.055, harm=(1.0, 0.12, 0.04))


# ------------------------------------------------------------------ the hit
# The brand reveal. One strike with a long tail, and a sub drop under it.
hit_at = 27.05
mix += tone(110.0, hit_at, hit_at + 2.9, 0.006, 2.8, 0.30, harm=(1.0, 0.4, 0.14))
mix += tone(164.81, hit_at, hit_at + 2.85, 0.010, 2.7, 0.155, harm=(1.0, 0.2, 0.0))
mix += tone(246.94, hit_at, hit_at + 2.8, 0.014, 2.6, 0.100, harm=(1.0, 0.1, 0.0))
i0 = int(hit_at * SR)
n = int(1.5 * SR)
lt = np.arange(n) / SR
mix[i0:i0 + n] += np.sin(2 * np.pi * np.cumsum(46 * np.exp(-1.1 * lt)) / SR) * np.exp(-2.2 * lt) * 0.34

# A breath of noise just before the hit, which is what makes it land.
sos = sp.butter(2, 900 / (SR / 2), btype='high', output='sos')
swell = sp.sosfilt(sos, rng.normal(0, 1, N))
swell /= np.max(np.abs(swell)) + 1e-9
mix += swell * env(26.0, 27.1, 1.0, 0.06, 0.055)

# A moment of near-silence just before it, so the hit has somewhere to land.
duck = np.ones(N)
d0, d1 = int(26.80 * SR), int(27.05 * SR)
duck[d0:d1] = np.linspace(1.0, 0.25, d1 - d0)
mix *= duck


# ------------------------------------------------------------------ mastering
# Gentle high-pass to clear subsonic energy, a soft knee, and headroom left at
# the top. Trailer loudness is not the goal; intelligibility under captions is.
sos = sp.butter(2, 28 / (SR / 2), btype='high', output='sos')
mix = sp.sosfilt(sos, mix)

peak = np.max(np.abs(mix))
mix = mix / peak * 0.72
mix = np.tanh(mix * 1.22) / np.tanh(1.22)      # soft knee, no hard clipping

# Fade the very ends so there is no click on either side.
mix *= env(0.0, DUR, 0.25, 0.9, 1.0)

# A narrow stereo image: the bed slightly wide, the heart and hit centred.
delay = int(0.0055 * SR)
left = mix.copy()
right = mix.copy()
right[delay:] += 0.11 * mix[:-delay]
left[delay:] += 0.07 * mix[:-delay]
stereo = np.stack([left, right], axis=1)
stereo /= np.max(np.abs(stereo)) / 0.90

wavfile.write('/tmp/vid/score.wav', SR, (stereo * 32767).astype(np.int16))
rms = np.sqrt(np.mean(stereo ** 2))
print(f"score.wav  {DUR:.1f}s  peak {np.max(np.abs(stereo)):.3f}  rms {rms:.4f} ({20*np.log10(rms):.1f} dBFS)")
