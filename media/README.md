# AURORA — 30-second promotional montage

| file | what it is |
| --- | --- |
| `AURORA_30s_1920x1080.mp4` | Delivery copy. 1920×1080, 30 fps, exactly 30.000 s, H.264 + AAC. |
| `AURORA_30s_1920x1080_master.mp4` | Master at CRF 15, for re-editing or frame-by-frame review. |
| `montage-source/` | Everything needed to rebuild or revise it. |

## What is actually in it

**The spacecraft is AURORA's own renderer.** Every exterior and interior plate
was produced by driving `src/features/flight-deck/render/DeckRenderer.ts` along
a camera path — the same station a judge can walk through in the application,
not stock footage or a separate model.

**The data is AURORA's own data.** The crew, the mission, the daily records,
the indicator definitions, the health scores and the detected event all come
out of `src/data/` and `src/lib/` at build time (`montage-source/data.mjs`).
The film cannot show a number the application would not.

In particular, the montage is set on **mission day 407** because that is a day
where the application genuinely has something to show: it detects a crew-wide
radiation exposure event spanning days 405–406, and it scores Luca Ferreira at
61, *caution*, driven by resting heart rate running +10 bpm against his
pre-flight baseline. An earlier cut had a crew tile flip from "nominal" to
"caution" mid-shot for drama; that was cut, because it would have shown the
engine reaching a verdict it never reached. What animates on screen is the
interface drawing itself in, not the assessment changing.

The payoff deliberately leaves the event flagged as **monitored · tracked, not
resolved**. Nothing in the film claims AURORA fixed anything.

## Two honest limitations

**No voice track.** There is no speech synthesis engine in the build
environment and no external voice service was called. The narration is carried
as on-screen captions instead; `montage-source/NARRATION.md` has the script,
the exact timings, and the one-line ffmpeg command to drop a recorded voice
over the music.

**The interface is rebuilt, not screen-recorded.** `npm install` cannot reach
the registry in the build environment, so the React application could not be
run and captured. The screens in the film are composed in `film.html` from the
application's own design tokens (`src/index.css`) and its own live data, which
makes them faithful in palette, type, layout and content — but they are a
reconstruction, and a screen recording of the running app would be better. If
you can run `npm run dev`, recapturing the interface sections is the single
biggest improvement available.

## Rebuilding

```bash
cd montage-source
python3 -m http.server 8731 &      # serve the transpiled flight-deck renderer
python3 shots3d.py                 # spacecraft plates  → plates/
node data.mjs                      # live data          → data.json
python3 score.py                   # 30 s score         → score.wav
python3 -m http.server 8799 &      # serve film.html
python3 render.py                  # 900 frames         → frames/
./compose.sh                       # encode both MP4s
```

`film.html` renders any frame deterministically from its number, so the render
is restartable and a change can be previewed one frame at a time:
`python3 render.py 420` writes just that frame.
