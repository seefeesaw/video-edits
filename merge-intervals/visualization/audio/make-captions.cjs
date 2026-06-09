// Builds global caption groups (3-5 words, breaking on punctuation) from the
// per-clip word transcripts, offsetting each clip's local word times by its
// composition-timeline placement (data-start).
const fs = require("fs");
const path = require("path");

const CLIPS = [
  { id: "s1", start: 1.2 },
  { id: "s2", start: 11.5 },
  { id: "s3", start: 28.6 },
  { id: "s4", start: 41.0 },
  { id: "s5", start: 61.5 },
  { id: "s6", start: 83.5 },
  { id: "s7", start: 100.5 },
];

const groups = [];
for (const clip of CLIPS) {
  const words = JSON.parse(fs.readFileSync(path.join(__dirname, `${clip.id}.transcript.json`), "utf8"));
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    groups.push({
      text: cur.map((w) => w.text).join(" "),
      start: +(cur[0].start + clip.start).toFixed(3),
      end: +(cur[cur.length - 1].end + clip.start).toFixed(3),
    });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const endsClause = /[.,;:]$/.test(w.text);
    if (cur.length >= 5 || (cur.length >= 3 && endsClause) || i === words.length - 1) {
      flush();
    }
  });
}

fs.writeFileSync(path.join(__dirname, "captions.json"), JSON.stringify(groups, null, 2));
groups.forEach((g, i) => console.log(`${i}: [${g.start}-${g.end}] "${g.text}"`));
console.log(`\n${groups.length} caption groups -> captions.json`);
