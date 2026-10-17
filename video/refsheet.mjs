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
  // a shot, or a performance (a long take shots are cut from: shown over its whole length, 8 frames)
  const perf = (spec.performances || []).find((x) => x.id === takesOf);
  const s = spec.shots.find((x) => x.id === takesOf) || (perf && { ...perf, start: 0, end: perf.seconds, from: 0 });
  if (!s) throw new Error(`no shot or performance ${takesOf}`);
  const takes = fs.readdirSync(path.join(dir, 'clips')).filter((f) => f === `${s.id}.mp4` || (f.startsWith(`${s.id}.v`) && f.endsWith('.mp4')));
  const len = (s.end - s.start) * (s.speed ?? 1), from = s.from ?? 0;
  // a shot of a library character gets that character's reference frames as the first row, so each
  // take's face can be judged against the canonical one
  const ch = !perf && s.set && spec.characters?.[s.set];
  const refRow = [];
  if (ch) {
    const cdir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'characters', ch);
    const c = JSON.parse(fs.readFileSync(path.join(cdir, 'character.json'), 'utf8'));
    const row = path.join(out, `_take-ref.jpg`);
    const ins = c.frames.flatMap((f) => ['-i', path.join(cdir, f)]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', `${c.frames.map((_, i) => `[${i}]scale=180:320[r${i}]`).join(';')};${c.frames.map((_, i) => `[r${i}]`).join('')}hstack=inputs=${c.frames.length},pad=900:320:0:0:white`, '-frames:v', '1', row]);
    refRow.push(row);
  }
  const rows = takes.map((f) => {
    const row = path.join(out, `_take-${f}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', from.toFixed(3), '-t', len.toFixed(3), '-i', path.join(dir, 'clips', f), '-vf', `fps=${((perf ? 8 : 5) / len).toFixed(4)},scale=180:320,tile=${perf ? 8 : 5}x1`, '-frames:v', '1', row]);
    return row;
  });
  // Sora sometimes edits inside a clip (jumps between action beats): list each take's jump-free
  // segments so shot windows ("from" + slot length) can be placed inside one of them
  for (const f of takes) {
    const w = 54, h = 96, fsz = w * h * 3;
    const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', from.toFixed(3), '-t', len.toFixed(3), '-i', path.join(dir, 'clips', f), '-vf', `fps=30,scale=${w}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
    const n = Math.floor(buf.length / fsz), d = [0];
    for (let k = 1; k < n; k++) { let t = 0; for (let i = 0; i < fsz; i++) t += Math.abs(buf[k * fsz + i] - buf[(k - 1) * fsz + i]); d.push(t / fsz); }
    const cuts = [];
    d.forEach((v, k) => {
      const nb = [...d.slice(Math.max(1, k - 6), k), ...d.slice(k + 1, k + 7)].sort((x, y) => x - y), med = nb[Math.floor(nb.length / 2)] ?? 0;
      if (k && ((v > 24 && v > 2 * med) || (v > 10 && v > 4 * med)) && v > 3 * Math.max(d[k - 1] ?? 0, d[k + 1] ?? 0)) cuts.push(+(from + k / 30).toFixed(2));
    });
    const b = [from, ...cuts, +(from + len).toFixed(2)];
    console.log(`  ${f}: jump-free segments ${b.slice(1).map((e, i) => `${b[i].toFixed(2)}-${e.toFixed(2)}`).join('  ')}`);
  }
  const file = path.join(out, `takes-${s.id}.jpg`);
  const all = [...refRow, ...rows];
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...all.flatMap((r) => ['-i', r]), '-filter_complex', all.length > 1 ? `vstack=inputs=${all.length}` : 'null', file]);
  all.forEach((r) => fs.rmSync(r));
  console.log(`wrote ${path.relative(process.cwd(), file)}: rows top to bottom = ${[...(refRow.length ? ['character reference'] : []), ...takes].join(', ')} (clip ${from.toFixed(2)}–${(from + len).toFixed(2)}s)`);
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
