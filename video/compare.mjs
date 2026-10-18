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
//   node compare.mjs videos/<name> --framing   search crop zoom (1–1.25, --max-zoom N) and pan per shot
//        and write "zoom"/"pan". A crop is kept only if it gains ≥1 point (the colour grid can be
//        fooled into cropping away set pieces); shots with "framing": "manual" are left alone
//   node compare.mjs videos/<name> --apply     fit a per-channel grade (gain/offset matching the
//        reference's mean and contrast) from the clip + framing and write it to "grade". Idempotent:
//        re-running gives the same grade; the grade records its clip and build.mjs ignores it when
//        the shot's clip has changed since
//   --only s3,s5   restrict --pick/--framing/--apply to those shots
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
  const r = ff(['-ss', clipTime(s, t).toFixed(3), '-i', path.join(dir, clip), '-frames:v', '1', '-vf', `scale=${SW}:${SH}:force_original_aspect_ratio=increase:flags=area,crop=${SW}:${SH}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], 1 << 26);
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
// per-channel linear fit [gain, offset] mapping grids B onto reference grids A
const fitGrade = (A, B) => [0, 1, 2].map((c) => {
  const xa = A.flatMap((a) => a.filter((_, i) => i % 3 === c)), xb = B.flatMap((b) => b.filter((_, i) => i % 3 === c));
  const ma = mean(xa), mb = mean(xb), g = Math.max(0.5, Math.min(2, sd(xa, ma) / sd(xb, mb)));
  return [g, ma - g * mb];
});
const gradeArr = (g) => (g ? [g.r, g.g, g.b] : [[1, 0], [1, 0], [1, 0]]);
const comp = (A, B, gg = gradeArr()) => {
  let d = 0, n = 0;
  A.forEach((a, k) => a.forEach((v, i) => { d += Math.abs(v - Math.max(0, Math.min(255, B[k][i] * gg[i % 3][0] + gg[i % 3][1]))); n++; }));
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
  const mz = +(arg('--max-zoom') || 1.25);
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
    if (best[0] - base < 1) best = [base, 1, [0, 0]];
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
    if (comp(A, B, g) < comp(A, B) - 0.3) { delete s.grade; console.log(`grade ${s.id}: none (a grade hurts comp ${comp(A, B).toFixed(1)} -> ${comp(A, B, g).toFixed(1)})`); continue; }
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
    for (let i = 0; i < a.length; i += 3) {
      d += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
      la += a[i] + a[i + 1] + a[i + 2]; lb += b[i] + b[i + 1] + b[i + 2];
      wa += a[i] - a[i + 2]; wb += b[i] - b[i + 2];
    }
    const cells = a.length / 3;
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
console.log(`mean comp ${mean(comps).toFixed(1)}  (frames ${nframes}, ${(nframes / fps).toFixed(2)}s vs ref ${ref.duration}s)`);
console.log(`cuts ref : ${ref.cuts.join(' ')}`);
console.log(`cuts mine: ${cuts.join(' ')}`);
const unmatched = ref.cuts.filter((c) => !cuts.some((m) => Math.abs(m - c) <= 1.5 / fps));
if (unmatched.length) console.log(`missing/late cuts (> 1.5 frames off): ${unmatched.join(' ')}`);
