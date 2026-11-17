# AURORA — 30-second cinematic commercial

`AURORA_commercial_1920x1080.mp4` — 1920×1080, 16:9, 30 fps, exactly 30.00 s,
H.264 High / AAC 48 kHz stereo, faststart. 37 MB.

Everything in it was produced inside this repository. No stock footage, no
external video or audio service, no sample library, no new dependency: the
spacecraft is rendered by AURORA's own WebGL renderer, the interface is drawn
from AURORA's own design tokens and filled with AURORA's own data, and the
soundtrack is synthesised with numpy.

## The cut

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:05 | Hook | Station over Earth, creeping in from darkness; cut inside to the medical bay. **"WHEN EVERY SECOND MATTERS…"** |
| 0:05–0:10 | Problem | Tracking shot down the spine, macro on the bench, a glance at the monitoring screen, push toward the console. **"ASTRONAUT HEALTH CAN'T BE LEFT TO CHANCE."** |
| 0:10–0:15 | Reveal | The push resolves into the AURORA dashboard — crew, trends, and the Signal Veil pattern. **"INTRODUCING AURORA."** |
| 0:15–0:23 | Product montage | **"MONITOR."** indicator grid · **"CONNECT THE SIGNALS."** suits, then the Signal Veil correlation · **"UNDERSTAND THE RISKS."** the detected radiation event · **"SUPPORT THE MISSION."** cupola, then mission context |
| 0:23–0:27 | Payoff | Crew overview, the window, pulling away from the vessel. *"Because protecting the crew starts with understanding their health."* |
| 0:27–0:30 | Brand | AURORA · See the signals. Protect the crew. Support the mission. · NASA Space Apps Challenge 2026 |

## Everything on screen is real AURORA output

`data.mjs` imports the application's own `generateMissionRecords`,
`detectAnomalies`, `computeStatus`, `ASTRONAUTS`, `INDICATORS` and mission
model, evaluates them at mission day 407, and writes `data.json`. The film
reads that file. Nothing is typed in by hand.

So the numbers are AURORA's: Maren Holt 97, Kenji Arakawa 93, Amara Diallo 99
all nominal, Luca Ferreira 61 in caution, with the two drivers AURORA itself
computed ("Resting HR +10 bpm vs pre-flight", "HRV −15 ms vs pre-flight"). The
anomaly card is the rule AURORA actually fires on that day — the crew-wide
radiation event over days 405–406 — with its real severity, its real indicator
list and its own explanation text.

Two things were deliberately **not** done, because they would have been
dramatic but false:

- No tile ever changes its verdict mid-shot. On day 407 Ferreira is in caution
  and the others are nominal; that is what every frame shows. Only the
  interface drawing itself in is animated.
- No score counts up. An earlier cut animated the numerals and so held frames
  reading "36" where AURORA's actual score is 61. A number on screen is a
  statement, however briefly it is held, so the numerals now fade in at their
  true values.

## Two honest limitations

**The voiceover is an on-screen caption.** The brief asks for a spoken line at
0:23. There is no text-to-speech engine in this environment and the brief rules
out paid external services, so the line is set as type over the payoff instead
of being read aloud. `NARRATION.md` carries the script, its timing and a
ready-to-run `ffmpeg` command to dub a real voice track over the delivered file
without re-rendering anything.

**The interface is rebuilt, not screen-recorded.** `node_modules` is not
installable in this environment, so the React application cannot be run and
captured. `film.html` reconstructs the interface from `src/index.css` — the
same tokens, type, spacing and status colours the application uses — and drives
it with the real data above. It is a faithful reconstruction of AURORA's
interface, not a recording of it.

## How it is made

Four stages, each restartable, each re-runnable on its own:

```
shots3d.py   440 spacecraft plates at 1600×900, rendered by AURORA's
             DeckRenderer through headless Chrome. Ten camera moves: creeping
             pushes, lateral tracking, two macro shots, a hard push to screen,
             handheld on three of them, speed-ramped paths.
film.html    window.renderFrame(n) paints any one of 900 frames
             deterministically — plates, interface, titles, vignette, dips.
render.py    screenshots all 900 at 1920×1080.
post.py      the finish, on pixels: radial chromatic aberration, defocus,
             zoom and directional blur, bloom with halation, motivated
             anamorphic flares, a filmic highlight shoulder, the grade, a
             nine-frame glitch at the peak of the tension, and film grain.
score.py     the soundtrack, synthesised: sub bed, spacecraft hum, a heartbeat
             that quickens 48→78 bpm through the problem, low impacts on the
             cuts, risers, whooshes, interface marks, a harmonic arc from D
             minor to E minor, and the brand hit.
review.py    checks the result before it ships.
compose.sh   encodes the master (CRF 15) and the delivery file (CRF 20).
```

```
python3 shots3d.py && python3 render.py && python3 post.py \
  && python3 score.py && python3 review.py && ./compose.sh
```

The master (visually lossless, ~100 MB) is not committed — `compose.sh`
rebuilds it from the graded frames.

## The review

900 frames is too many to check by eye, so `review.py` measures them. It tests
for missing frames, unintended black, frozen frames, unplanned luminance jumps,
clipping, and exposure drift by section. Three of its tests exist because they
caught real defects in this film and the earlier tests had missed them:

- **cuts landing dark** — a cut whose incoming frame is near-black. This found
  a fifth of a second of black at 0:07.7, and four black frames on the reveal
  at 0:10, where the bass hit was landing on nothing.
- **beats opening bare** — a shot that opens nearly empty and fills up after.
  All four product-montage beats were doing this, each wasting the first third
  of its two seconds.
- **crushed shadows** — measured only among pixels whose surroundings carry
  light, so that empty space and the deliberate fades are not counted as
  crushed detail.

Current result on the delivered file:

```
frames        900  (30.00 s at 30 fps)
unintended black   0      frozen runs >=3   0
unplanned jumps    0      cuts landing dark 0
beats opening bare 0
worst clipping     crushed shadows 0.78% of lit pixels, blown highlights 0.00%
RESULT: clean
```

## Licensing and attribution

All visual and audio content is original to this project. The soundtrack is
synthesised from scratch in `score.py`; no commercial recording is used. There
are no NASA logos, mission insignia or official markings anywhere in the film,
and nothing in it states or implies that NASA endorses, certifies or developed
AURORA. It is presented as a NASA Space Apps Challenge 2026 project. The
mission itself — ARES-7, and its crew — is clearly fictional, as the
application states.
