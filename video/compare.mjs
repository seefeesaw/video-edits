#!/usr/bin/env node
// Scores a replica against videos/<name>/reference.json (captured from the original with
// tools/yt-capture.js), and tunes shots from their raw Sora clips. Order: --pick → --framing →
// --apply → build.mjs → plain scoring. Only plain scoring needs a built video.
//
//   node compare.mjs videos/<name> [--file out/other.mp4]
//        per shot: composition similarity (mean colour difference of a 9×16 grid; 100 = identical),
//        brightness/warmth vs the reference, and cut times of the build vs the reference
//   node compare.mjs videos/<name> --pick      score every take of every shot (s1.mp4, s1.v2.mp4 …)
//        after a fair per-take colour match and set each shot's "clip" to the best one
//   node compare.mjs videos/<name> --choose s1=v2,s4=1   set takes chosen by eye (locked: "pick": "manual")
//   node compare.mjs videos/<name> --framing   search crop zoom (1–1.15, --max-zoom N) and pan per shot
//        and write "zoom"/"pan". A crop is kept only if it gains ≥1 point (the colour grid can be
//        fooled into cropping away set pieces); shots with "framing": "manual" are left alone
//   node compare.mjs videos/<name> --apply     fit a per-channel grade (gain/offset matching the
//        reference's mean and contrast) from the clip + framing and write it to "grade". Idempotent:
//        re-running gives the same grade; the grade records its clip and build.mjs ignores it when
//        the shot's clip has changed since
//   --only s3,s5   restrict --pick/--framing/--apply to those shots
//   video.json "compare": {"trim": 0.35}: for replicas that change part of the picture on purpose
//        (another background): scores and grade fits ignore the worst-matching 35% of grid cells;
//        add "grade": "luma" so --apply only matches brightness/contrast and keeps the new colours
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { screenClip } from './build.mjs';

const argv = process.argv.slice(2);
const dir = path.resolve(argv.find((a) => !a.startsWith('--') && !/^s\d/.test(a) && !a.endsWith('.mp4')) || '');
const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
const ref = JSON.parse(fs.readFileSync(path.join(dir, 'reference.json'), 'utf8'));
const only = arg('--only')?.split(',');
const [GW, GH] = ref.grid;
const fps = spec.fps || 30, W = GW * 8, H = GH * 8, SW = W * 2, SH = H * 2;
const parse = (hex) => Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
const samplesOf = (s) => ref.samples.filter(([t]) => t >= s.start + 0.03 && t < s.end - 0.03);
const clipOf = (s) => s.clip || `clips/${s.id}.mp4`;
// shots with a "screen" are scored on their takes WITH the screen composited (build.mjs screenClip)
const composited = {};
for (const s of spec.shots.filter((x) => x.screen && fs.existsSync(path.join(dir, 'clips')))) {
  const takes = fs.readdirSync(path.join(dir, 'clips')).filter((f) => f === `${s.id}.mp4` || (f.startsWith(`${s.id}.v`) && f.endsWith('.mp4')));
  for (const c of new Set([...takes.map((f) => `clips/${f}`), clipOf(s)])) composited[`${s.id}|${c}`] = await screenClip(spec, dir, s, c);
}
const seen = (s, clip) => composited[`${s.id}|${clip}`] || clip;
const save = () => fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify(spec, null, 2) + '\n');
const ff = (args, max) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: max, timeout: 120000 });
  if (r.error) throw new Error(`ffmpeg ${r.error.code === 'ETIMEDOUT' ? 'timed out' : r.error.message}`);
  return r;
};
const mean = (x) => x.reduce((p, q) => p + q, 0) / x.length;
const sd = (x, m) => Math.sqrt(x.reduce((p, q) => p + (q - m) ** 2, 0) / x.length) || 1;

// time in the source clip that lands at output time t (same mapping as build.mjs)
const clipTime = (s, t) => {
  const speed = s.speed ?? 1, from = s.from ?? 0, k = t - s.start;
  return from + (s.reverse ? s.end - s.start - k : k) * speed;
};
// raw clip frames (SW×SH RGB) at every reference sample inside the shot
const clipFrames = (s, clip = clipOf(s)) => samplesOf(s).map(([t, hex]) => {
  const r = ff(['-ss', clipTime(s, t).toFixed(3), '-i', path.join(dir, seen(s, clip)), '-frames:v', '1', '-vf', `scale=${SW}:${SH}:force_original_aspect_ratio=increase:flags=area,crop=${SW}:${SH}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], 1 << 26);
  return { t, ref: parse(hex), px: r.stdout };
}).filter((f) => f.px.length === SW * SH * 3);
// 9×16 grid of a frame after crop zoom z / pan, the same window build.mjs crops
const gridOf = (px, z = 1, [panX, panY] = [0, 0]) => {
  const cw = SW / z, ch = SH / z, ox = ((SW - cw) / 2) * (1 + panX), oy = ((SH - ch) / 2) * (1 + panY), out = [];
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const m = [0, 0, 0];
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const x = Math.min(SW - 1, Math.floor(ox + ((gx + (sx + 0.5) / 4) * cw) / GW)), y = Math.min(SH - 1, Math.floor(oy + ((gy + (sy + 0.5) / 4) * ch) / GH));
      const i = (y * SW + x) * 3; for (let c = 0; c < 3; c++) m[c] += px[i + c];
    }
    out.push(m[0] / 16, m[1] / 16, m[2] / 16);
  }
  return out;
};
// "compare": {"trim": 0.35} in video.json: the replica changes part of the picture ON PURPOSE (a
// different background/room, another screen picture), so every score and grade fit ignores the worst-
// matching 35% of grid cells per frame — otherwise the grade drags the new wall back to the original's
// colour and --pick/--framing prefer takes/crops that hide the intended change
const TRIM = spec.compare?.trim ?? 0;
const cellDiffs = (a, b, gg) => {
  const d = [];
  for (let i = 0; i < a.length; i += 3) {
    let t = 0;
    for (let c = 0; c < 3; c++) t += Math.abs(a[i + c] - Math.max(0, Math.min(255, b[i + c] * gg[c][0] + gg[c][1])));
    d.push(t / 3);
  }
  return d;
};
// indices of the cells kept after trimming the worst-matching ones
const keptCells = (d) => {
  if (!TRIM) return d.map((_, i) => i);
  const cut = [...d].sort((x, y) => x - y)[Math.floor(d.length * (1 - TRIM)) - 1];
  return d.map((v, i) => (v <= cut ? i : -1)).filter((i) => i >= 0);
};
// per-channel linear fit [gain, offset] mapping grids B onto reference grids A (with TRIM: fitted on
// the cells that still match after a first fit, so the intentionally changed area doesn't steer it)
const fitOn = (A, B, keep) => [0, 1, 2].map((c) => {
  const xa = A.flatMap((a, k) => keep[k].map((i) => a[i * 3 + c])), xb = B.flatMap((b, k) => keep[k].map((i) => b[i * 3 + c]));
  const ma = mean(xa), mb = mean(xb), g = Math.max(0.5, Math.min(2, sd(xa, ma) / sd(xb, mb)));
  return [g, ma - g * mb];
});
// "compare": {"grade": "luma"}: one gain/offset for all three channels (brightness and contrast only,
// never a hue shift) — for replicas whose new colours are intentional (a navy wall instead of a red one
// would otherwise be pulled towards red)
const LUMA = spec.compare?.grade === 'luma';
const fitGrade = (A, B) => {
  const all = A.map((a) => Array.from({ length: a.length / 3 }, (_, i) => i));
  let g = fitOn(A, B, all);
  if (TRIM) g = fitOn(A, B, A.map((a, k) => keptCells(cellDiffs(a, B[k], g))));
  if (LUMA) { const m = [0, 1].map((j) => (g[0][j] + g[1][j] + g[2][j]) / 3); g = [m, m, m]; }
  return g;
};
const gradeArr = (g) => (g ? [g.r, g.g, g.b] : [[1, 0], [1, 0], [1, 0]]);
const comp = (A, B, gg = gradeArr()) => {
  let d = 0, n = 0;
  A.forEach((a, k) => { const cd = cellDiffs(a, B[k], gg); for (const i of keptCells(cd)) { d += cd[i]; n++; } });
  return 100 - (100 * d) / n / 255;
};
const zoomOf = (s) => (Array.isArray(s.zoom) ? s.zoom[0] : s.zoom ?? 1);
const panOf = (s) => (s.pan ? (Array.isArray(s.pan[0]) ? s.pan[0] : s.pan) : [0, 0]);
// cuts inside the span of a clip that a shot uses (clip seconds), found like the capture finds them
function innerCuts(s, clip) {
  const speed = s.speed ?? 1, from = s.from ?? 0, len = (s.end - s.start) * speed, w = 54, h = 96, fsz = w * h * 3;
  const r = ff(['-ss', from.toFixed(3), '-t', len.toFixed(3), '-i', path.join(dir, clip), '-vf', `fps=30,scale=${w}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], 1 << 26);
  const n = Math.floor(r.stdout.length / fsz), d = [0];
  for (let k = 1; k < n; k++) { let t = 0; for (let i = 0; i < fsz; i++) t += Math.abs(r.stdout[k * fsz + i] - r.stdout[(k - 1) * fsz + i]); d.push(t / fsz); }
  const out = [];
  d.forEach((v, k) => {
    const nb = [...d.slice(Math.max(1, k - 6), k), ...d.slice(k + 1, k + 7)].sort((a, b) => a - b), med = nb[Math.floor(nb.length / 2)] ?? 0;
    // an edit is one big change between two otherwise steady pictures; a splash or avalanche keeps
    // changing on both sides of its biggest frame, so it must also tower over its direct neighbours
    const around = Math.max(d[k - 1] ?? 0, d[k + 1] ?? 0);
    if (k && ((v > 24 && v > 2 * med) || (v > 10 && v > 4 * med)) && v > 3 * around) out.push(+(from + k / 30).toFixed(2));
  });
  return out;
}
const tuned = spec.shots.filter((s) => (!only || only.includes(s.id)) && samplesOf(s).length);

// --choose s1=v2,s4=1,s8=v3: set takes chosen by eye ("1" = sN.mp4, "v2" = sN.v2.mp4) and lock them
// against --pick ("pick": "manual"); reports the grade to refit
if (argv.includes('--choose')) {
  for (const kv of arg('--choose').split(',')) {
    const [id, t] = kv.split('=');
    const s = spec.shots.find((x) => x.id === id) || (spec.performances || []).find((x) => x.id === id);
    if (!s) throw new Error(`--choose: no shot or performance ${id}`);
    // "1"/"v1" = sN.mp4; "v3" or just "3" = sN.v3.mp4
    const n = String(t).replace(/^v/, '');
    const clip = `clips/${n === '1' ? `${id}.mp4` : `${id}.v${n}.mp4`}`;
    if (!fs.existsSync(path.join(dir, clip))) throw new Error(`--choose: ${clip} does not exist`);
    s.clip = clip; if (spec.shots.includes(s)) s.pick = 'manual';
    console.log(`${id}: clip = ${clip}`);
  }
  save();
  console.log('next: --framing, --apply (the grade is per clip), build.mjs');
  process.exit(0);
}

if (argv.includes('--pick')) {
  for (const s of tuned) {
    // "pick": "manual" keeps a take chosen by eye (the colour grid can prefer a take with the wrong
    // content: smoke instead of powder, cereal instead of chocolate)
    if (s.pick === 'manual') { console.log(`pick ${s.id}: manual, kept ${s.clip}`); continue; }
    const takes = fs.readdirSync(path.join(dir, 'clips')).filter((f) => f === `${s.id}.mp4` || (f.startsWith(`${s.id}.v`) && f.endsWith('.mp4')));
    if (!takes.length) continue;
    const scored = takes.map((f) => {
      const fr = clipFrames(s, `clips/${f}`), A = fr.map((x) => x.ref), B = fr.map((x) => gridOf(x.px));
      // Sora sometimes edits a clip (wide → close → wide): a cut inside the used span is a cut the
      // reference doesn't have, so such takes lose 10 points
      const cuts = innerCuts(s, `clips/${f}`);
      return [(fr.length ? comp(A, B, fitGrade(A, B)) : 0) - (cuts.length ? 10 : 0), f, cuts];
    }).sort((x, y) => y[0] - x[0]);
    console.log(`pick ${s.id}: ${scored.map(([v, f, c]) => `${f} ${v.toFixed(1)}${c.length ? ` (inner cut at ${c.join(', ')}s, -10)` : ''}`).join('  ')}`);
    // takes that start from the same keyframe look alike in a short slot: a near-tie is decided by
    // the ACTION, which this score can't see
    if (scored.length > 1 && scored[0][0] - scored[1][0] < 0.3) console.log(`  ${s.id}: TIE (${(scored[0][0] - scored[1][0]).toFixed(2)}): judge the action with node refsheet.mjs ${path.relative(process.cwd(), dir)} --takes ${s.id}, then set "clip" + "pick": "manual"`);
    const old = s.clip, now = `clips/${scored[0][1]}`;
    s.clip = now;
    // jump-cut shots reuse this shot's take ("takes": 0, "clip": <this shot's clip>): keep them on it
    for (const o of spec.shots) if (o !== s && o.takes === 0 && old && o.clip === old && o.clip !== now) { o.clip = now; console.log(`  ${o.id} reuses ${s.id}'s take: now ${now}`); }
  }
  save();
  console.log('set each shot\'s "clip" to its best take; next: --framing, --apply, build.mjs');
  process.exit(0);
}

if (argv.includes('--framing')) {
  // conservative by default: the colour grid rewards crops that look worse (enlarging an already big
  // object, cutting a prop out of frame); --max-zoom raises the cap
  const mz = +(arg('--max-zoom') || 1.15);
  for (const s of tuned) {
    if (s.framing === 'manual') { console.log(`framing ${s.id}: manual, kept zoom ${JSON.stringify(s.zoom ?? 1)}`); continue; }
    const fr = clipFrames(s);
    if (!fr.length) { console.log(`framing ${s.id}: skipped (no decodable clip at ${clipOf(s)})`); continue; }
    const A = fr.map((x) => x.ref);
    // one colour match, fitted on the uncropped frame, for every candidate (a per-candidate fit
    // flattens the differences between crops and the search stops preferring any of them)
    const gg = fitGrade(A, fr.map((x) => gridOf(x.px)));
    const score = (z, p) => comp(A, fr.map((x) => gridOf(x.px, z, p)), gg);
    const base = score(1, [0, 0]);
    let best = [base, 1, [0, 0]];
    for (let z = 1.05; z <= mz + 1e-4; z += 0.05) for (let x = -1; x <= 1.001; x += 0.25) for (let y = -1; y <= 1.001; y += 0.25) {
      const sc = score(z, [x, y]); if (sc > best[0]) best = [sc, +z.toFixed(2), [+x.toFixed(2), +y.toFixed(2)]];
    }
    if (best[0] - base < 2) best = [base, 1, [0, 0]];
    console.log(`framing ${s.id}: zoom ${best[1]} pan [${best[2]}]  comp ${base.toFixed(1)} -> ${best[0].toFixed(1)}`);
    s.zoom = best[1]; s.pan = best[2];
  }
  save();
  console.log('wrote "zoom"/"pan"; next: --apply, build.mjs');
  process.exit(0);
}

if (argv.includes('--apply')) {
  for (const s of tuned) {
    const fr = clipFrames(s);
    if (!fr.length) continue;
    const A = fr.map((x) => x.ref), B = fr.map((x) => gridOf(x.px, zoomOf(s), panOf(s))), g = fitGrade(A, B);
    // the grid score mixes composition and colour, so a grade that fixes a big brightness/warmth gap
    // can cost a little comp; keep it unless it clearly hurts
    if (comp(A, B, g) < comp(A, B)) { delete s.grade; console.log(`grade ${s.id}: none (a grade hurts comp ${comp(A, B).toFixed(1)} -> ${comp(A, B, g).toFixed(1)})`); continue; }
    s.grade = { r: g[0].map((v, i) => +v.toFixed(i ? 2 : 4)), g: g[1].map((v, i) => +v.toFixed(i ? 2 : 4)), b: g[2].map((v, i) => +v.toFixed(i ? 2 : 4)), clip: clipOf(s) };
    console.log(`grade ${s.id}: comp ${comp(A, B).toFixed(1)} -> ${comp(A, B, g).toFixed(1)}`);
  }
  save();
  console.log('wrote per-shot "grade"; next: build.mjs');
  process.exit(0);
}

// plain scoring of the built video
const file = arg('--file') ? path.join(dir, arg('--file')) : path.join(dir, 'out', `${path.basename(dir)}.mp4`);
if (!fs.existsSync(file)) throw new Error(`no build at ${path.relative(process.cwd(), file)}: run build.mjs first`);
const r = ff(['-i', file, '-vf', `fps=${fps},scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], 1 << 30);
if (r.status) throw new Error(r.stderr.toString());
const buf = r.stdout, fsz = W * H * 3, nframes = Math.floor(buf.length / fsz);
const gridAt = (n) => {
  const off = n * fsz, out = [];
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const m = [0, 0, 0];
    for (let y = gy * 8; y < gy * 8 + 8; y++) for (let x = gx * 8; x < gx * 8 + 8; x++) { const i = off + (y * W + x) * 3; m[0] += buf[i]; m[1] += buf[i + 1]; m[2] += buf[i + 2]; }
    out.push(...m.map((v) => v / 64));
  }
  return out;
};
const rows = [], comps = [];
for (const s of spec.shots) {
  const samples = samplesOf(s);
  if (!samples.length) { rows.push(`${s.id.padEnd(4)} (no reference samples inside the slot)`); continue; }
  let sim = 0, dl = 0, dw = 0;
  for (const [t, hex] of samples) {
    const a = parse(hex), b = gridAt(Math.min(nframes - 1, Math.round(t * fps)));
    let d = 0, la = 0, lb = 0, wa = 0, wb = 0;
    const cd = cellDiffs(a, b, gradeArr()), keep = keptCells(cd);
    for (const c of keep) {
      const i = c * 3;
      d += cd[c];
      la += a[i] + a[i + 1] + a[i + 2]; lb += b[i] + b[i + 1] + b[i + 2];
      wa += a[i] - a[i + 2]; wb += b[i] - b[i + 2];
    }
    const cells = keep.length;
    sim += 100 - (100 * d) / cells / 255; dl += (lb - la) / cells / 3; dw += (wb - wa) / cells;
  }
  const n = samples.length;
  comps.push(sim / n);
  rows.push(`${s.id.padEnd(4)} ${s.start.toFixed(2)}-${s.end.toFixed(2)}  comp ${(sim / n).toFixed(1)}  brightness ${dl / n >= 0 ? '+' : ''}${(dl / n).toFixed(0)}  warmth ${dw / n >= 0 ? '+' : ''}${(dw / n).toFixed(0)}`);
}
// cuts in the build: a frame change that is large AND stands out from its neighbours (a powder
// avalanche or splash changes every frame a lot but is no cut), or a strong local peak (soft jump cuts)
const diffs = [0];
for (let n = 1; n < nframes; n++) { let d = 0; const a = (n - 1) * fsz, b = n * fsz; for (let i = 0; i < fsz; i++) d += Math.abs(buf[a + i] - buf[b + i]); diffs.push(d / fsz); }
const cuts = [];
diffs.forEach((d, n) => {
  // neighbours that are real frame changes only: a 60fps build of 30fps clips repeats every frame,
  // and the zero diffs would make any busy motion look like a peak
  const moving = (x) => x > 0.3;
  const nb = [...diffs.slice(1, n).filter(moving).slice(-6), ...diffs.slice(n + 1).filter(moving).slice(0, 6)].sort((a, b) => a - b), med = nb[Math.floor(nb.length / 2)] ?? 0;
  if (n && ((d > 24 && d > 2 * med) || (d > 10 && d > 4 * med))) cuts.push(+(n / fps).toFixed(3));
});
console.log(rows.join('\n'));
console.log(`mean comp ${mean(comps).toFixed(1)}${TRIM ? ` (on the best-matching ${Math.round(100 * (1 - TRIM))}% of the picture: compare.trim)` : ''}  (frames ${nframes}, ${(nframes / fps).toFixed(2)}s vs ref ${ref.duration}s)`);
console.log(`cuts ref : ${ref.cuts.join(' ')}`);
console.log(`cuts mine: ${cuts.join(' ')}`);
const unmatched = ref.cuts.filter((c) => !cuts.some((m) => Math.abs(m - c) <= 1.5 / fps));
if (unmatched.length) console.log(`missing/late cuts (> 1.5 frames off): ${unmatched.join(' ')}`);
