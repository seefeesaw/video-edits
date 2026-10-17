#!/usr/bin/env node
// Scores a built replica against videos/<name>/reference.json (captured from the original with
// tools/yt-capture.js):
//   - per shot: composition similarity (mean colour difference of a 9×16 grid; 100 = identical),
//     plus where the replica is brighter/darker or warmer/cooler than the reference
//   - cut times of the replica vs the reference
//
//   node compare.mjs videos/<name> [--file out/other.mp4]
//   node compare.mjs videos/<name> --apply     also fit a per-shot colour grade (per-channel gain and
//                                              offset matching the reference's mean/contrast) and
//                                              write it to each shot's "grade" in video.json
//                                              (composed with any grade already there); rebuild after.
//   node compare.mjs videos/<name> --pick      score every take of every shot (s1.mp4, s1.v2.mp4 …)
//                                              against the reference after a fair per-take colour
//                                              match, and set each shot's "clip" to the best one.
//   node compare.mjs videos/<name> --framing   search crop-zoom (1–1.25, --max-zoom N) and pan per shot on the raw
//                                              Sora clip (graded) and write the best "zoom"/"pan" to
//                                              video.json. Free: no regeneration. Run before --apply.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const dir = path.resolve(argv.find((a) => !a.startsWith('--')) || '');
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
const ref = JSON.parse(fs.readFileSync(path.join(dir, 'reference.json'), 'utf8'));
const fi = argv.indexOf('--file');
const file = fi >= 0 ? path.join(dir, argv[fi + 1]) : path.join(dir, 'out', `${path.basename(dir)}.mp4`);
const [GW, GH] = ref.grid;
const fps = 30, W = GW * 8, H = GH * 8;

// decode every frame at 72×128 RGB
const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `fps=${fps},scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 });
if (r.status) throw new Error(r.stderr.toString());
const buf = r.stdout, fsz = W * H * 3, nframes = Math.floor(buf.length / fsz);
const gridAt = (n) => {
  const off = n * fsz, out = [];
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const m = [0, 0, 0];
    for (let y = gy * 8; y < gy * 8 + 8; y++) for (let x = gx * 8; x < gx * 8 + 8; x++) { const i = off + (y * W + x) * 3; m[0] += buf[i]; m[1] += buf[i + 1]; m[2] += buf[i + 2]; }
    out.push(...m.map((s) => s / 64));
  }
  return out;
};
const parse = (hex) => Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));

const rows = [];
const apply = argv.includes('--apply');
for (const s of spec.shots) {
  const samples = ref.samples.filter(([t]) => t >= s.start + 0.03 && t < s.end - 0.03);
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
  if (apply) {
    // per channel: match mean and spread of the grid cells (all samples of the shot pooled)
    const g = { r: [1, 0], g: [1, 0], b: [1, 0] };
    ['r', 'g', 'b'].forEach((ch, c) => {
      const A = [], B = [];
      for (const [t, hex] of samples) { const a = parse(hex), bb = gridAt(Math.min(nframes - 1, Math.round(t * fps))); for (let i = c; i < a.length; i += 3) { A.push(a[i]); B.push(bb[i]); } }
      const mean = (x) => x.reduce((p, q) => p + q, 0) / x.length;
      const sd = (x, m) => Math.sqrt(x.reduce((p, q) => p + (q - m) ** 2, 0) / x.length) || 1;
      const ma = mean(A), mb = mean(B);
      const gain = Math.max(0.5, Math.min(2, sd(A, ma) / sd(B, mb)));
      const prev = s.grade?.[ch] || [1, 0];
      // new(x) = gain*(prev(x)) + off, prev(x) = p0*x + p1
      const off = ma - gain * mb;
      g[ch] = [+(gain * prev[0]).toFixed(4), +(gain * prev[1] + off).toFixed(2)];
    });
    s.grade = g;
  }
  rows.push(`${s.id.padEnd(4)} ${s.start.toFixed(2)}-${s.end.toFixed(2)}  comp ${(sim / n).toFixed(1)}  brightness ${dl / n >= 0 ? '+' : ''}${(dl / n).toFixed(0)}  warmth ${dw / n >= 0 ? '+' : ''}${(dw / n).toFixed(0)}`);
}

// --pick: choose the best take per shot (composition after colour matching, so grading doesn't decide)
if (argv.includes('--pick')) {
  for (const s of spec.shots) {
    const samples = ref.samples.filter(([t]) => t >= s.start + 0.03 && t < s.end - 0.03);
    const cdir = path.join(dir, 'clips');
    const takes = fs.readdirSync(cdir).filter((f) => f === `${s.id}.mp4` || (f.startsWith(`${s.id}.v`) && f.endsWith('.mp4')));
    if (!samples.length || takes.length < 1) continue;
    const scored = takes.map((f) => {
      const speed = s.speed ?? 1, from = s.from ?? 0;
      const A = [], B = [];
      for (const [t, hex] of samples) {
        const rr = spawnSync('ffmpeg', ['-v', 'error', '-ss', (from + (t - s.start) * speed).toFixed(3), '-i', path.join(cdir, f), '-frames:v', '1', '-vf', `scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 });
        if (rr.stdout.length !== W * H * 3) continue;
        const a = parse(hex), b = [];
        for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) { const m = [0, 0, 0]; for (let y = gy * 8; y < gy * 8 + 8; y++) for (let x = gx * 8; x < gx * 8 + 8; x++) { const i = (y * W + x) * 3; for (let c = 0; c < 3; c++) m[c] += rr.stdout[i + c]; } b.push(...m.map((v) => v / 64)); }
        A.push(a); B.push(b);
      }
      // per-channel linear match pooled over samples, then composition score
      const gain = [0, 1, 2].map((c) => {
        const xa = A.flatMap((a) => a.filter((_, i) => i % 3 === c)), xb = B.flatMap((b) => b.filter((_, i) => i % 3 === c));
        const m = (x) => x.reduce((p, q) => p + q, 0) / x.length, sd = (x, mm) => Math.sqrt(x.reduce((p, q) => p + (q - mm) ** 2, 0) / x.length) || 1;
        const ma = m(xa), mb = m(xb), g = Math.max(0.5, Math.min(2, sd(xa, ma) / sd(xb, mb)));
        return [g, ma - g * mb];
      });
      let d = 0, n = 0;
      A.forEach((a, k) => a.forEach((v, i) => { d += Math.abs(v - Math.max(0, Math.min(255, B[k][i] * gain[i % 3][0] + gain[i % 3][1]))); n++; }));
      return [100 - (100 * d) / n / 255, f];
    }).sort((x, y) => y[0] - x[0]);
    console.log(`pick ${s.id}: ${scored.map(([v, f]) => `${f} ${v.toFixed(1)}`).join('  ')}`);
    s.clip = `clips/${scored[0][1]}`;
  }
  fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify(spec, null, 2) + '\n');
  console.log('set each shot\'s "clip" to its best take; then --framing / --apply, and rebuild');
  process.exit(0);
}

// --framing: per shot, decode the source clip span at 2x grid resolution and search zoom/pan
if (argv.includes('--framing')) {
  const SW = W * 2, SH = H * 2;
  for (const s of spec.shots) {
    const samples = ref.samples.filter(([t]) => t >= s.start + 0.03 && t < s.end - 0.03);
    if (!samples.length) continue;
    const clip = path.join(dir, s.clip || `clips/${s.id}.mp4`);
    const speed = s.speed ?? 1, from = s.from ?? 0;
    const frames = samples.map(([t, hex]) => {
      const ct = from + (t - s.start) * speed;
      const rr = spawnSync('ffmpeg', ['-v', 'error', '-ss', ct.toFixed(3), '-i', clip, '-frames:v', '1', '-vf', `scale=${SW}:${SH}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
      return { ref: parse(hex), px: rr.stdout };
    }).filter((f) => f.px.length === SW * SH * 3);
    if (!frames.length) { console.log(`framing ${s.id}: skipped (no decodable clip at ${path.relative(dir, clip)})`); continue; }
    const g = s.grade || { r: [1, 0], g: [1, 0], b: [1, 0] }, gg = [g.r, g.g, g.b];
    const score = (z, px0, py0) => {
      // crop window of size (SW/z, SH/z) centred with offset px0/py0 in -1..1 of the free margin
      const cw = SW / z, ch = SH / z, ox = ((SW - cw) / 2) * (1 + px0), oy = ((SH - ch) / 2) * (1 + py0);
      let d = 0, n = 0;
      for (const f of frames) {
        for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
          const m = [0, 0, 0]; let k = 0;
          for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
            const x = Math.min(SW - 1, Math.floor(ox + ((gx + (sx + 0.5) / 4) * cw) / GW)), y = Math.min(SH - 1, Math.floor(oy + ((gy + (sy + 0.5) / 4) * ch) / GH));
            const i = (y * SW + x) * 3; for (let c = 0; c < 3; c++) m[c] += Math.max(0, Math.min(255, f.px[i + c] * gg[c][0] + gg[c][1])); k++;
          }
          const ci = (gy * GW + gx) * 3;
          d += (Math.abs(m[0] / k - f.ref[ci]) + Math.abs(m[1] / k - f.ref[ci + 1]) + Math.abs(m[2] / k - f.ref[ci + 2])) / 3; n++;
        }
      }
      return 100 - (100 * d) / n / 255;
    };
    let best = [score(1, 0, 0), 1, 0, 0];
    // cap the zoom: the colour-grid score can be fooled into cropping away whole set pieces
    // (e.g. a laptop at the frame edge) to match colour areas; --max-zoom raises the cap.
    const mz = argv.includes('--max-zoom') ? +argv[argv.indexOf('--max-zoom') + 1] : 1.25;
    for (let z = 1; z <= mz + 1e-4; z += 0.05) for (let px0 = -1; px0 <= 1.001; px0 += 0.25) for (let py0 = -1; py0 <= 1.001; py0 += 0.25) {
      const sc = score(z, px0, py0); if (sc > best[0] + 0.05) best = [sc, +z.toFixed(2), +px0.toFixed(2), +py0.toFixed(2)];
    }
    const before = score(Array.isArray(s.zoom) ? s.zoom[0] : s.zoom ?? 1, 0, 0);
    console.log(`framing ${s.id}: zoom ${best[1]} pan [${best[2]}, ${best[3]}]  comp ${before.toFixed(1)} -> ${best[0].toFixed(1)}`);
    s.zoom = best[1]; s.pan = [best[2], best[3]];
  }
  fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify(spec, null, 2) + '\n');
  console.log('wrote "zoom"/"pan" to video.json; rebuild with build.mjs');
  process.exit(0);
}

// cuts in the replica (same threshold idea as yt-capture: mean abs diff of consecutive frames)
const cuts = [];
for (let n = 1; n < nframes; n++) {
  let d = 0; const a = (n - 1) * fsz, b = n * fsz;
  for (let i = 0; i < fsz; i++) d += Math.abs(buf[a + i] - buf[b + i]);
  if (d / fsz > 24) cuts.push(+(n / fps).toFixed(3));
}
const all = rows.map((x) => +x.match(/comp ([\d.]+)/)?.[1]).filter(Boolean);
console.log(rows.join('\n'));
console.log(`mean comp ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(1)}  (frames ${nframes}, ${(nframes / fps).toFixed(2)}s vs ref ${ref.duration}s)`);
console.log(`cuts ref : ${ref.cuts.join(' ')}`);
console.log(`cuts mine: ${cuts.join(' ')}`);
if (apply) { fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify(spec, null, 2) + '\n'); console.log('wrote per-shot "grade" to video.json; rebuild with build.mjs'); }
