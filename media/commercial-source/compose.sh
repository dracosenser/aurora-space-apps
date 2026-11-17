#!/bin/bash
# Encode the graded frames and the score into the delivery file.
set -e
cd /tmp/vid
N=$(ls graded/*.png | wc -l)
echo "encoding $N graded frames"

# Master: visually lossless, for archiving and for any re-edit.
ffmpeg -y -loglevel error -framerate 30 -i graded/%04d.png -i score.wav \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p \
  -profile:v high -level 4.1 -x264-params "ref=5:bframes=4" \
  -c:a aac -b:a 320k -ar 48000 -movflags +faststart -shortest \
  AURORA_commercial_master.mp4

# Delivery: capped bitrate so it plays anywhere, including from a phone.
ffmpeg -y -loglevel error -framerate 30 -i graded/%04d.png -i score.wav \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 20 -maxrate 10M -bufsize 20M \
  -pix_fmt yuv420p -profile:v high -level 4.1 \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart -shortest \
  AURORA_commercial_1920x1080.mp4

ls -lh AURORA_commercial_*.mp4
