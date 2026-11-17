# Narration

The brief calls for a spoken line at 0:23–0:27. There is no text-to-speech
engine in this environment, and the brief rules out paid external services, so
the line is set as type over the payoff instead of being read aloud. The film
is otherwise complete, and the voice track can be added later without
re-rendering a frame.

## The line

> **0:23.4 – 0:26.6** — *Because protecting the crew starts with understanding
> their health.*

Delivered unhurried, close-mic, warm. About 3.2 seconds of speech inside a
3.2-second window, so there is no room to rush it and none to pad it.

The score already makes space: the harmony moves to E minor at 23.0 and the
heartbeat drops to half strength, so the midrange is clear under the line. The
mix then ducks hard from 26.72 and the brand hit lands at 27.05 — the line must
be finished by 26.6.

## Dubbing it in

Record the line to `vo.wav` with roughly 0.4 s of silence at the head, then:

```bash
ffmpeg -i AURORA_commercial_1920x1080.mp4 -i vo.wav \
  -filter_complex "[1:a]adelay=23000|23000,volume=1.0[v]; \
                   [0:a][v]sidechaincompress=threshold=0.05:ratio=4:attack=12:release=240[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k \
  AURORA_commercial_1920x1080_vo.mp4
```

The sidechain ducks the score under the voice rather than fighting it. If the
caption is no longer wanted once the line is spoken, remove its entry from
`TITLES` in `film.html` — it is the last row, at 23.45 — and re-run the render
from frame 700 to 810.
