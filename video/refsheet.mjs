#!/usr/bin/env node
// Moves the reference contact sheets captured by tools/yt-capture.js (embedded in reference.json)
// to videos/<name>/out/ref-shots.jpg (one frame per shot midpoint) and out/ref-every.jpg (every
// 0.5s), and, with --mine, a matching sheet of your build at the same times (out/mine-shots.jpg)
// so the two can be viewed side by side without screenshots of the browser.
//
//   node refsheet.mjs videos/<name> [--mine]
//   node refsheet.mjs videos/<name> --takes s6   every take of a shot over the span the shot uses
//                                                (5 frames each, one row per take): check the ACTION
//                                                and its timing, which the colour-grid score can't see
// It also prints the build fps the reference cuts need.
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
// cuts on odd 1/60 s (frame times offset by half a frame) can only be hit by a 60fps build
const off = (ref.cuts || []).filter((c) => Math.abs(c * 30 - Math.round(c * 30)) > 0.25);
console.log(off.length ? `fps: use "fps": 60 (${off.length} of ${ref.cuts.length} cuts fall between 30fps frames, e.g. ${off.slice(0, 3).join(', ')})` : `fps: ${ref.sourceFps || 30} is enough (every cut is on a 30fps frame)`);
const takesOf = argv.includes('--takes') ? argv[argv.indexOf('--takes') + 1] : null;
if (takesOf) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  const s = spec.shots.find((x) => x.id === takesOf);
  if (!s) throw new Error(`no shot ${takesOf}`);
  const takes = fs.readdirSync(path.join(dir, 'clips')).filter((f) => f === `${s.id}.mp4` || (f.startsWith(`${s.id}.v`) && f.endsWith('.mp4')));
  const len = (s.end - s.start) * (s.speed ?? 1), from = s.from ?? 0;
  const rows = takes.map((f) => {
    const row = path.join(out, `_take-${f}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', from.toFixed(3), '-t', len.toFixed(3), '-i', path.join(dir, 'clips', f), '-vf', `fps=${(5 / len).toFixed(4)},scale=180:320,tile=5x1`, '-frames:v', '1', row]);
    return row;
  });
  const file = path.join(out, `takes-${s.id}.jpg`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...rows.flatMap((r) => ['-i', r]), '-filter_complex', rows.length > 1 ? `vstack=inputs=${rows.length}` : 'null', file]);
  rows.forEach((r) => fs.rmSync(r));
  console.log(`wrote ${path.relative(process.cwd(), file)}: rows top to bottom = ${takes.join(', ')} (clip ${from.toFixed(2)}–${(from + len).toFixed(2)}s)`);
}
if (argv.includes('--mine')) {
  const mp4 = path.join(out, `${path.basename(dir)}.mp4`);
  const times = ref.shotMidpoints || [];
  const fps = 60;
  const sel = times.map((t) => `eq(n\\,${Math.round(t * fps)})`).join('+');
  const cols = Math.min(4, times.length), rows = Math.ceil(times.length / cols);
  const file = path.join(out, 'mine-shots.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', `fps=${fps},select='${sel}',scale=270:480,tile=${cols}x${rows}`, '-frames:v', '1', file]);
  console.log(`wrote ${path.relative(process.cwd(), file)} (same times as ref-shots.jpg)`);
}
