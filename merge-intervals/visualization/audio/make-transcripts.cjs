// Deterministic word-timing estimate for TTS captions: allocates each clip's
// measured duration across its words proportional to letter count (plus a
// small pause weight after punctuation), since whisper-cpp isn't available
// on this machine to transcribe the generated audio directly.
const fs = require("fs");
const path = require("path");

const DURATIONS = { s1: 7.13, s2: 10.01, s3: 8.02, s4: 11.35, s5: 13.35, s6: 13.82, s7: 10.667 };
const LEAD_IN = 0.12;
const LEAD_OUT = 0.12;

for (const id of Object.keys(DURATIONS)) {
  const text = fs.readFileSync(path.join(__dirname, `${id}.txt`), "utf8").trim();
  const words = text.split(/\s+/);
  const weights = words.map((w) => {
    const letters = w.replace(/[^a-zA-Z0-9']/g, "").length;
    const pause = /[.,;:]$/.test(w) ? 2 : 0;
    return Math.max(letters, 2) + pause;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const duration = DURATIONS[id];
  const speakable = duration - LEAD_IN - LEAD_OUT;

  let t = LEAD_IN;
  const out = words.map((w, i) => {
    const dur = (weights[i] / totalWeight) * speakable;
    const word = { id: `w${i}`, text: w, start: +t.toFixed(3), end: +(t + dur).toFixed(3) };
    t += dur;
    return word;
  });

  fs.writeFileSync(path.join(__dirname, `${id}.transcript.json`), JSON.stringify(out, null, 2));
  console.log(`${id}: ${out.length} words, last end ${out[out.length - 1].end}s of ${duration}s`);
}
