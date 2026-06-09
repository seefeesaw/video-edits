"""
Concatenates all 7 narration clips into one 180-second WAV.

Durations (from Kokoro / am_adam speed 0.85):
  s1.wav  22.6s
  s2.wav  24.5s
  s3.wav  14.7s
  s4.wav  20.9s
  s5.wav  23.4s
  s6.wav  21.3s
  s7.wav  27.5s
"""
import numpy as np
import soundfile as sf

SR = 24000  # Kokoro sample rate

CLIPS = [
    ("s1.wav",   1.0),   # ends  23.6
    ("s2.wav",  26.0),   # ends  50.5
    ("s3.wav",  52.5),   # ends  67.2
    ("s4.wav",  69.5),   # ends  90.4
    ("s5.wav",  92.5),   # ends 115.9
    ("s6.wav", 118.0),   # ends 139.3
    ("s7.wav", 141.5),   # ends 169.0
]

TOTAL = 180.0
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
    print(f"  placed {filename} at {start}s  (ends at {start + len(data)/SR:.1f}s)")

sf.write("narration.wav", track, SR)
print(f"\nnarration.wav written — {TOTAL}s @ {SR}Hz mono")
