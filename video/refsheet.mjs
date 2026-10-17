#!/usr/bin/env node
// Moves the reference contact sheets captured by tools/yt-capture.js (embedded in reference.json)
// to videos/<name>/out/ref-shots.jpg (one frame per shot midpoint) and out/ref-every.jpg (every
// 0.5s), and, with --mine, a matching sheet of your build at the same times (out/mine-shots.jpg)
// so the two can be viewed side by side without screenshots of the browser.
//
//   node refsheet.mjs videos/<name> [--mine]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const dir = path.resolve(argv.find((a) => !a.startsWith('--')) || '');
const ref = JSON.parse(fs.readFileSync(path.join(dir, 'reference.json'), 'utf8'));
const out = path.join(dir, 'out');
fs.mkdirSync(out, { recursive: true });
// the sheets are frames of someone else's video: move them out of reference.json (which is committed)
// into out/*.jpg (git-ignored)
let moved = false;
for (const [k, file] of [['shots', 'ref-shots.jpg'], ['every', 'ref-every.jpg']]) {
  const url = ref.sheets?.[k];
  if (!url?.startsWith('data:')) continue;
  fs.writeFileSync(path.join(out, file), Buffer.from(url.split(',')[1], 'base64'));
  ref.sheets[k] = `out/${file}`; moved = true;
  console.log(`wrote ${path.relative(process.cwd(), path.join(out, file))}`);
}
if (moved) fs.writeFileSync(path.join(dir, 'reference.json'), JSON.stringify(ref) + '\n');
if (!moved && ref.sheets) console.log(`sheets: ${Object.values(ref.sheets).join(', ')}`);
if (argv.includes('--mine')) {
  const mp4 = path.join(out, `${path.basename(dir)}.mp4`);
  const times = ref.shotMidpoints || [];
  const fps = 30;
  const sel = times.map((t) => `eq(n\\,${Math.round(t * fps)})`).join('+');
  const cols = Math.min(4, times.length), rows = Math.ceil(times.length / cols);
  const file = path.join(out, 'mine-shots.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', `fps=${fps},select='${sel}',scale=270:480,tile=${cols}x${rows}`, '-frames:v', '1', file]);
  console.log(`wrote ${path.relative(process.cwd(), file)} (same times as ref-shots.jpg)`);
}
