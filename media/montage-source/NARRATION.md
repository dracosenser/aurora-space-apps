# AURORA — 30-second montage: narration script

The montage carries these lines **as on-screen captions**, because no speech
synthesis engine is installed in the environment the film was built in and no
external voice service was used. The timings below are the caption timings, so
a recorded voice track can be dropped straight onto them without re-editing.

| in | out | line |
|---|---|---|
| 0:00.70 | 0:03.90 | Far from Earth, even the smallest change matters. |
| 0:04.35 | 0:08.85 | But astronaut health is more than a single measurement. |
| 0:09.35 | 0:14.75 | AURORA brings health signals together, helping mission teams recognise patterns that might otherwise go unnoticed. |
| 0:15.20 | 0:21.90 | From continuous monitoring to connected insights and mission simulations, AURORA helps teams stay informed and prepared. |
| 0:22.35 | 0:26.85 | Because protecting the crew means understanding the signals before they become bigger problems. |

## On-screen headlines

| in | out | text |
|---|---|---|
| 0:01.05 | 0:03.75 | SPACE IS UNFORGIVING. |
| 0:05.00 | 0:08.80 | ONE SIGNAL CAN TELL PART OF THE STORY. |
| 0:09.55 | 0:12.40 | MEET AURORA. |
| 0:15.25 | 0:17.35 | MONITOR CREW HEALTH. |
| 0:17.60 | 0:19.70 | IDENTIFY DEVELOPING PATTERNS. |
| 0:19.95 | 0:22.00 | SUPPORT INFORMED DECISIONS. |
| 0:27.05 | 0:30.00 | AURORA · See the signals. Protect the crew. Support the mission. · NASA Space Apps Challenge 2026 |

## Adding a recorded voice track

```bash
ffmpeg -i AURORA_30s_1920x1080_master.mp4 -i voice.wav \
  -filter_complex "[0:a]volume=0.55[m];[1:a]volume=1.0[v];[m][v]amix=inputs=2:duration=first" \
  -c:v copy -c:a aac -b:a 192k AURORA_30s_voiced.mp4
```

The music is mixed to leave room under the captions; ducking it to about 55%
under a voice track is a sensible starting point.
