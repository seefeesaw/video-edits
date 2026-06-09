"""
Concatenates all 7 narration clips into one 120-second WAV, inserting
silence at the correct offsets so each clip plays exactly when its
corresponding scene is on screen. A single <audio> element can then
cover the whole composition without autoplay re-trigger issues.

Durations (from Kokoro output):
  s1.wav  12.6s
  s2.wav  17.7s
  s3.wav   8.8s
  s4.wav  17.3s
  s5.wav  17.6s
  s6.wav  20.4s
  s7.wav  15.3s
"""
import numpy as np
import soundfile as sf

SR = 24000  # sample rate of all Kokoro outputs

# Placement: (file, start_in_seconds)
CLIPS = [
    ("s1.wav",  1.0),
    ("s2.wav", 15.0),
    ("s3.wav", 34.0),
    ("s4.wav", 44.0),
    ("s5.wav", 63.0),
    ("s6.wav", 82.0),
    ("s7.wav", 104.0),
]

TOTAL = 120.0
track = np.zeros(int(TOTAL * SR), dtype=np.float32)

for filename, start in CLIPS:
    data, _ = sf.read(filename, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    offset = int(start * SR)
    end    = offset + len(data)
    if end > len(track):
        data = data[: len(track) - offset]
        end = len(track)
    track[offset:end] += data
    print(f"  placed {filename} at {start}s  (samples {offset}-{end}, "
          f"ends at {start + len(data)/SR:.1f}s)")

sf.write("narration.wav", track, SR)
print(f"\nnarration.wav written — {TOTAL}s @ {SR}Hz mono")
