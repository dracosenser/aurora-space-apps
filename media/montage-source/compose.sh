#!/bin/bash
# Assemble the montage: 900 PNG frames at 30 fps, plus the synthesised score.
#
# Two outputs from one source: a master at a high bitrate for archive and
# re-editing, and a delivery file sized for sending to judges and playing from
# a browser. Both are 1920x1080 at exactly 30.000 seconds.
set -e
cd /tmp/vid
N=$(ls frames/*.png | wc -l)
echo "frames: $N (expect 900)"

COMMON="-y -framerate 30 -i frames/%04d.png -i score.wav \
  -c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.1 \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -movflags +faststart -shortest -r 30"

# Master: near-visually-lossless, for re-editing and for any judge who wants
# to scrub it frame by frame.
ffmpeg $COMMON -preset slow -crf 15 -x264-params "keyint=60:min-keyint=30" \
  /tmp/vid/AURORA_30s_1920x1080_master.mp4 -loglevel error

# Delivery: the same picture at a size that sends and streams comfortably.
ffmpeg $COMMON -preset slow -crf 21 -maxrate 9M -bufsize 16M \
  /tmp/vid/AURORA_30s_1920x1080.mp4 -loglevel error

for f in AURORA_30s_1920x1080.mp4 AURORA_30s_1920x1080_master.mp4; do
  echo "--- $f"
  ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height,r_frame_rate,nb_frames,codec_name \
    -show_entries format=duration,size -of default=nw=1 "$f"
  ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels \
    -of default=nw=1 "$f"
  du -h "$f"
done
