"""
Assembles individual narration clips into a single narration.wav.

IMPORTANT: Run this AFTER generating all .wav files with TTS.
Measure actual clip durations with `soxi -D <file>.wav` and update
the offsets below to match.  The values here are initial estimates.

Estimated durations (speed 0.85, am_adam):
  s1 ~ 17s   s2 ~ 15s   s3 ~ 11s   s4 ~ 15s
  s5 ~ 13s   s6 ~ 12s   s7 ~ 17s   total ~ 100s
"""
import numpy as np
import soundfile as sf

SR = 24000  # Kokoro sample rate

CLIPS = [
    ("s1.wav",   1.0),   # Scene 1 — problem statement   (18.4s, ends 19.4)
    ("s2.wav",  20.5),   # Scene 2 — key insight          (16.9s, ends 37.4)
    ("s3.wav",  38.5),   # Scene 3 — base cases           (13.3s, ends 51.8)
    ("s4.wav",  53.0),   # Scene 4 — fill T[3..5]         (16.1s, ends 69.1)
    ("s5.wav",  70.0),   # Scene 5 — fill T[6..7]         (13.8s, ends 83.8)
    ("s6.wav",  85.0),   # Scene 6 — result               (15.1s, ends 100.1)
    ("s7.wav", 101.5),   # Scene 7 — full solution        (18.4s, ends 119.9)
]

TOTAL = 120.0
track = np.zeros(int(TOTAL * SR), dtype=np.float32)

for filename, start in CLIPS:
    data, _ = sf.read(filename, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    offset = int(start * SR)
    end = offset + len(data)
    if end > len(track):
        data = data[:len(track) - offset]
        end = len(track)
    track[offset:end] += data
    print(f"  placed {filename} at {start}s (ends at {start + len(data)/SR:.2f}s)")

sf.write("narration.wav", track, SR)
print(f"\nnarration.wav written — {TOTAL}s @ {SR}Hz mono")
