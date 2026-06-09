"""
Concatenate TTS clips into a single narration.wav track.
Run from the audio/ directory after generating all .wav files:
    python concat.py

IMPORTANT: Update the clip offsets below after measuring actual TTS durations.
These are estimates based on typical am_adam speed=0.85 output.
"""
import numpy as np
import soundfile as sf

SR = 24000  # Kokoro sample rate

# (filename, start_seconds) — adjust after measuring actual durations
CLIPS = [
    ("s1.wav",  1.0),    # Problem statement  (~13s)
    ("s2.wav",  16.0),   # Key insight        (~15s)
    ("s3.wav",  33.5),   # Base case          (~12s)
    ("s4.wav",  46.0),   # Process item 1     (~13s)
    ("s5.wav",  62.0),   # Items 5 and 11     (~15s)
    ("s6.wav",  80.5),   # Result + last item (~15s)
    ("s7.wav",  99.5),   # Full code          (~15s)
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
    print(f"  placed {filename} at {start}s (ends at {start + len(data)/SR:.1f}s)")

sf.write("narration.wav", track, SR)
print(f"\nnarration.wav written — {TOTAL}s @ {SR}Hz mono")
