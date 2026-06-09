"""
Concatenates all 6 narration clips into one 100-second WAV, inserting
silence at the correct offsets so each clip plays exactly when its
corresponding scene is on screen. A single <audio> element can then
cover the whole composition without autoplay re-trigger issues.
"""
import numpy as np
import soundfile as sf

SR = 24000  # sample rate of all Kokoro outputs

# Placement: (file, start_in_seconds)
CLIPS = [
    ("s1.wav", 1.2),
    ("s2.wav", 11.5),
    ("s3.wav", 28.6),
    ("s4.wav", 41.0),
    ("s5.wav", 61.5),
    ("s6.wav", 83.5),
    ("s7.wav", 100.5),
]

TOTAL = 119.0
track = np.zeros(int(TOTAL * SR), dtype=np.float32)

for filename, start in CLIPS:
    data, _ = sf.read(filename, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)   # mono-mix if stereo
    offset = int(start * SR)
    end    = offset + len(data)
    if end > len(track):
        data = data[: len(track) - offset]
        end = len(track)
    track[offset:end] += data
    print(f"  placed {filename} at {start}s  (samples {offset}-{end})")

sf.write("narration.wav", track, SR)
print(f"\nnarration.wav written — {TOTAL}s @ {SR}Hz mono")
