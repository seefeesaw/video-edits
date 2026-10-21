#!/usr/bin/env node
// Assembles a video spec into videos/<name>/out/<name>.mp4:
//   Sora clips (trimmed/retimed/reframed per shot) -> cuts -> text overlays -> audio mix.
//
//   node build.mjs videos/<name>              build the final video
//   node build.mjs videos/<name> --frames     also dump one PNG per shot midpoint to out/frames/
//
// Overlays reuse the slideshow renderer, so captions support every slideshow element (text,
// tiktokText, badge, html…) including auto-fit to measured ink boxes. Each overlay group is
// rendered once to a transparent PNG and composited during its time window.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { buildSlideHtml, makeContext, CHROME } from '../slideshow/render.mjs';
import { fitAll } from '../slideshow/lib/fit.mjs';

const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

export async function renderOverlays(spec, dir, outDir, W, H) {
  const groups = spec.overlays || [];
  if (!groups.length) return [];
  const post = { size: [W, H], fonts: spec.fonts || [], css: spec.css || [] };
  const warnings = [];
  const ctx = makeContext(dir, post, warnings);
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  const files = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    for (const [i, g] of groups.entries()) {
      // "elements": "@name" reuses spec.captions[name] (a caption that recurs in several time windows)
      const elements = typeof g.elements === 'string' ? spec.captions?.[g.elements.replace(/^@/, '')] : g.elements;
      if (!elements) throw new Error(`overlay ${i}: unknown caption ${g.elements}`);
      const html = buildSlideHtml(post, { elements }, ctx).replace('<body>', '<body style="background:transparent">');
      const htmlPath = path.join(outDir, `__overlay${i}.html`);
      fs.writeFileSync(htmlPath, html);
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
      // load the caption fonts explicitly: fonts.ready can resolve before a web font is even requested,
      // and the first overlay then fits and renders in a serif fallback
      await page.evaluate(async (fams) => { await Promise.all(fams.map((f) => document.fonts.load(`500 40px "${f}"`).catch(() => null))); await document.fonts.ready; await window.__tiktokTextReady; }, (spec.fonts || []).map((f) => f.split(':')[0]));
      const fits = await fitAll(page, W, H, (m) => warnings.push(`overlay ${i}: ${m}`));
      const file = path.join(outDir, `overlay${i}.png`);
      fs.writeFileSync(file, await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H }, omitBackground: true }));
      fs.unlinkSync(htmlPath);
      files.push({ file, from: g.from ?? 0, to: g.to ?? spec.duration });
      console.log(`overlay ${i}${fits.length ? ` (fitted ${fits.length}, worst ${Math.max(...fits.map((f) => f.err))}px)` : ''}`);
    }
  } finally {
    await browser.close();
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
  return files;
}

// "screens": a phone/laptop in a Sora clip shows OUR video. Sora generates the device with a pure
// green screen (people-free, so it can also be keyframed); this pre-pass finds the green box in a
// frame, keys it out and composites the screen video (+ an optional UI overlay rendered from
// `captions[ui]`, e.g. a TikTok-style caption and side rail) behind it, writing
// out/_screens/<id>.mp4 at the output size. Shots then cut/zoom that file like any clip, so the
// screen zooms with the device.
//   "screens": [{ "id": "PHONE", "clip": "clips/PHONE.mp4", "from": 0, "len": 7,
//                 "screen": { "clip": "clips/SCREEN.mp4", "from": 1.0 }, "ui": "screenui" }]
async function composeScreens(spec, dir, outDir, W, H, fps) {
  const list = spec.screens || [];
  if (!list.length) return;
  const sdir = path.join(outDir, '_screens');
  fs.mkdirSync(sdir, { recursive: true });
  for (const s of list) {
    const base = path.join(dir, s.clip), scr = path.join(dir, s.screen.clip);
    // green box + key colour from a frame in the middle of the used span
    const f = path.join(sdir, `_${s.id}.raw`);
    ff(['-ss', String((s.from ?? 0) + s.len / 2), '-i', base, '-frames:v', '1', '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', f]);
    const px = fs.readFileSync(f); fs.rmSync(f);
    let x0 = W, y0 = H, x1 = -1, y1 = -1, sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3, r = px[i], g = px[i + 1], b = px[i + 2];
      if (g > 110 && g > 1.5 * r && g > 1.5 * b) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); sr += r; sg += g; sb += b; n++; }
    }
    if (n < 2000) throw new Error(`screen ${s.id}: no green screen found in ${s.clip}`);
    const key = `0x${[sr, sg, sb].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`;
    const bw = (x1 - x0 + 1) & ~1, bh = (y1 - y0 + 1) & ~1;
    let ui = null;
    if (s.ui) {
      const [file] = await renderOverlays({ ...spec, overlays: [{ from: 0, to: s.len, elements: `@${s.ui}` }] }, dir, sdir, W, H);
      ui = file.file;
    }
    const out = path.join(sdir, `${s.id}.mp4`);
    const scrChain = `[1:v]trim=start=${s.screen.from ?? 0}:duration=${s.len},setpts=PTS-STARTPTS,fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${ui ? '[sv];[sv][2:v]overlay=0:0[su];[su]' : ','}scale=${bw}:${bh}[scr]`;
    ff(['-i', base, '-i', scr, ...(ui ? ['-loop', '1', '-i', ui] : []), '-filter_complex',
      `[0:v]trim=start=${s.from ?? 0}:duration=${s.len},setpts=PTS-STARTPTS,fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},chromakey=${key}:0.16:0.06[k];${scrChain};color=black:size=${W}x${H}:rate=${fps}:duration=${s.len}[bg];[bg][scr]overlay=${x0}:${y0}[t];[t][k]overlay=0:0:shortest=1[v]`,
      '-map', '[v]', '-map', '0:a?', '-t', String(s.len), '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-pix_fmt', 'yuv420p', out]);
    console.log(`screen ${s.id}: green box [${x0},${y0},${x1},${y1}] key ${key} → ${path.relative(process.cwd(), out)}`);
  }
}

// Per-shot "screen": the laptop/TV/phone in THIS shot's take is a pure green screen (the bible prop
// says so, so keyframes and Sora keep it green) and shows a still we render ourselves after Sora — so
// it may show anything Sora would refuse as an input (people, a streaming-app UI):
//   "screen": { "ui": "<captions name>", "size": [1600, 1000] }   html elements (backgrounds via
//             {{src bible/screen-x.png}}), rendered at the screen's own size
//   "screen": { "image": "bible/screen-x.png" }                   a still, cover-fitted
//   "screen": { "clip": "assets/screen/scene.mp4", "from": 12.5, "ui": "player" }   a video you have the
//             rights to (plays from "from", loops), optionally under an html overlay (player chrome)
//   "whole": true  the device is fully in frame: the picture fills the whole green box (a real display)
//   "anchor": "left"|"right"|"center"  which side of the picture shows when the device is cut by the
//             frame edge (default: the side facing into the frame)
// The composite is made per TAKE (out/_screens/<take>.<hash>.mp4, cached) at the clip's own size, so
// --pick/--framing/--apply score and build.mjs cuts it exactly like a raw clip. The green area is the
// largest green blob (a Christmas tree or plant elsewhere in frame is ignored), unioned over the clip so
// a slowly drifting camera stays covered; only pixels inside that box are keyed.
export const GREEN = (r, g, b) => g > 110 && g > 1.5 * r && g > 1.5 * b;
// largest 4-connected green blob of an RGB frame (w×h): {x0,y0,x1,y1,n,key:[r,g,b]} or null
export function greenBox(px, w, h) {
  const seen = new Uint8Array(w * h);
  let best = null;
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !GREEN(px[s * 3], px[s * 3 + 1], px[s * 3 + 2])) continue;
    const st = [s], b = { x0: w, y0: h, x1: -1, y1: -1, n: 0, sum: [0, 0, 0] };
    seen[s] = 1;
    while (st.length) {
      const p = st.pop(), x = p % w, y = (p - x) / w;
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); b.n++;
      for (let c = 0; c < 3; c++) b.sum[c] += px[p * 3 + c];
      for (const q of [x > 0 && p - 1, x < w - 1 && p + 1, y > 0 && p - w, y < h - 1 && p + w]) {
        if (q === false || seen[q] || !GREEN(px[q * 3], px[q * 3 + 1], px[q * 3 + 2])) continue;
        seen[q] = 1; st.push(q);
      }
    }
    if (!best || b.n > best.n) best = b;
  }
  if (!best) return null;
  best.key = best.sum.map((v) => Math.round(v / best.n));
  return best;
}
// "whole": the DEVICE (not just its screen) must be in frame. A laptop's lid and base reach well past
// its screen (base ~12% of the screen width each side, lid ~6% above), so a screen box that merely
// doesn't touch the edge can still have the laptop cut: require that margin. Returns a reason or null.
export function wholeDeviceIssue(b, w, h) {
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0, mx = 0.12 * bw + 4, my = 0.06 * bh + 4;
  if (b.x0 < mx) return `the screen is ${b.x0}px from the left edge (the laptop needs ~${Math.round(mx)}px)`;
  if (w - 1 - b.x1 < mx) return `the screen is ${w - 1 - b.x1}px from the right edge (the laptop needs ~${Math.round(mx)}px)`;
  if (b.y0 < my) return `the screen is ${b.y0}px from the top (the lid needs ~${Math.round(my)}px)`;
  return null;
}
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', f], { encoding: 'utf8' }));
export async function screenClip(spec, dir, shot, clip) {
  const scr = shot.screen;
  if (!scr || !fs.existsSync(path.join(dir, clip))) return clip;
  const src = path.join(dir, clip), sdir = path.join(dir, 'out', '_screens');
  fs.mkdirSync(sdir, { recursive: true });
  const ui = scr.ui ? JSON.stringify(spec.captions?.[scr.ui]) : '';
  if (scr.ui && !spec.captions?.[scr.ui]) throw new Error(`${shot.id}: screen ui "${scr.ui}" is not in captions`);
  const stamp = ['v2', clip, fs.statSync(src).mtimeMs, JSON.stringify(scr), ui, scr.image && fs.statSync(path.join(dir, scr.image)).mtimeMs, scr.clip && fs.statSync(path.join(dir, scr.clip)).mtimeMs].join('|');
  const hash = (await import('node:crypto')).createHash('sha1').update(stamp).digest('hex').slice(0, 8);
  const rel = `out/_screens/${path.basename(clip, '.mp4')}.${hash}.mp4`, out = path.join(dir, rel);
  if (fs.existsSync(out)) return rel;
  const info = probe(src), { width: w, height: h } = info.streams[0], len = +info.format.duration;
  // the green box: union of the largest green blob in 6 frames across the clip
  let box = null, key = [0, 0, 0], nk = 0;
  for (let k = 0; k < 6; k++) {
    const px = execFileSync('ffmpeg', ['-v', 'error', '-ss', (len * (k + 0.5) / 6).toFixed(2), '-i', src, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
    const b = greenBox(px, w, h);
    if (!b || b.n < w * h * 0.01) continue;
    box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
    key = key.map((v, c) => v + b.key[c] * b.n); nk += b.n;
  }
  if (!box) throw new Error(`${shot.id}: no green screen in ${clip} (the keyframe/prompt must show the screen as flat chroma green)`);
  const pad = 4, x0 = Math.max(0, box.x0 - pad) & ~1, y0 = Math.max(0, box.y0 - pad) & ~1;
  const bw = (Math.min(w, box.x1 + pad + 1) - x0) & ~1, bh = (Math.min(h, box.y1 + pad + 1) - y0) & ~1;
  const keyHex = `0x${key.map((v) => Math.round(v / nk).toString(16).padStart(2, '0')).join('')}`;
  // the screen source: a video ("clip", e.g. a scene YOU have the rights to; loops, starts at "from"),
  // a still ("image"), or html ("ui", rendered at the screen's size; over a clip it is an overlay)
  let [sw, sh] = scr.size || [1600, 1000];
  let still = scr.image && path.join(dir, scr.image), uiPng = null;
  // a still keeps its own aspect (a 3:2 film still on a 16:10 laptop): fit and edge crops use it
  if (still && !scr.ui && !scr.size) ({ width: sw, height: sh } = probe(still).streams[0]);
  if (scr.ui) {
    const [file] = await renderOverlays({ ...spec, overlays: [{ from: 0, to: 1, elements: `@${scr.ui}` }] }, dir, sdir, sw, sh);
    if (scr.clip) uiPng = file.file;
    else {
      still = path.join(sdir, `${path.basename(clip, '.mp4')}.${hash}.png`);
      ff(['-f', 'lavfi', '-i', `color=black:size=${sw}x${sh}`, '-i', file.file, '-filter_complex', '[0][1]overlay=0:0', '-frames:v', '1', still]);
      fs.rmSync(file.file);
    }
  }
  if (!scr.clip && !still) throw new Error(`${shot.id}: "screen" needs "ui", "image" or "clip"`);
  // fit the still to the box, anchored at the top (the bottom of a laptop screen is what a mug hides).
  // A screen cut off by the frame edge continues out of shot: scale it by its height to its real width
  // and show the part on the visible side (the reference crops it the same way), else cover-fit centred.
  const atL = box.x0 <= 2, atR = box.x1 >= w - 3;
  // "whole": the device is meant to be fully in frame, so the picture fills the screen exactly like a
  // real display (scaled to the green box, nothing cropped); warn if the take cut the screen anyway
  const cut = scr.whole && wholeDeviceIssue(box, w, h);
  if (cut) console.warn(`warning: ${shot.id} (${clip}): "whole" wants the device fully in frame, but ${cut} (pick another take / regenerate)`);
  const anchor = scr.whole ? 'fill' : scr.anchor || (atL && !atR ? 'right' : atR && !atL ? 'left' : 'center');
  const fullW = Math.max(bw, Math.round((bh * sw) / sh / 2) * 2);
  const fit = anchor === 'fill' ? `scale=${bw}:${bh}` : anchor === 'center' ? `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh}:(iw-${bw})/2:0`
    : `scale=${fullW}:-2,crop=${bw}:min(ih\\,${bh}):${anchor === 'right' ? `iw-${bw}` : 0}:0,pad=${bw}:${bh}:0:0`;
  const srcIn = scr.clip ? ['-stream_loop', '-1', '-ss', String(scr.from ?? 0), '-i', path.join(dir, scr.clip), ...(uiPng ? ['-loop', '1', '-i', uiPng] : [])] : ['-loop', '1', '-i', still];
  const srcChain = scr.clip ? `[1:v]fps=${(spec.fps || 30)},scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh}${uiPng ? '[sv];[sv][2:v]overlay=0:0,' : ','}${fit}` : `[1:v]${fit}`;
  ff(['-i', src, ...srcIn, '-filter_complex',
    `[0:v]split[base][c];[c]crop=${bw}:${bh}:${x0}:${y0},chromakey=${keyHex}:0.16:0.06,despill=type=green[fg];` +
    `${srcChain},format=yuva420p[s];` +
    `[s][fg]overlay=0:0[box];[base][box]overlay=${x0}:${y0}:shortest=1[v]`,
    '-map', '[v]', '-map', '0:a?', '-t', len.toFixed(3), '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', out]);
  if (uiPng) fs.rmSync(uiPng);
  console.log(`screen ${shot.id} (${clip}): green box [${x0},${y0},${x0 + bw},${y0 + bh}] key ${keyHex} anchor ${anchor} → ${rel}`);
  return rel;
}

// Reframe filter for one shot: cover-scale to W×H, then optional zoom (≥1) and pan, both of which
// may animate linearly over the shot (zoom: [from, to], pan: [[x,y],[x,y]] as -1..1 offsets).
function frameFilter(shot, W, H, dur) {
  const z = Array.isArray(shot.zoom) ? shot.zoom : [shot.zoom ?? 1, shot.zoom ?? 1];
  const p = shot.pan ? (Array.isArray(shot.pan[0]) ? shot.pan : [shot.pan, shot.pan]) : [[0, 0], [0, 0]];
  const k = `min(t/${dur.toFixed(3)},1)`;
  const zt = `(${z[0]}+(${z[1] - z[0]})*${k})`;
  // scale large enough for the max zoom, then crop a moving window
  const zmax = Math.max(...z);
  const sw = Math.ceil((W * zmax) / 2) * 2, sh = Math.ceil((H * zmax) / 2) * 2;
  const cw = `${W}*${zmax}/${zt}`, ch = `${H}*${zmax}/${zt}`;
  const px = `(${p[0][0]}+(${p[1][0] - p[0][0]})*${k})`, py = `(${p[0][1]}+(${p[1][1] - p[0][1]})*${k})`;
  return [
    `scale=${sw}:${sh}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${sw}:${sh}`,
    `crop=w='${cw}':h='${ch}':x='(iw-${cw})/2*(1+${px})':y='(ih-${ch})/2*(1+${py})'`,
    `scale=${W}:${H}:flags=lanczos`,
  ].join(',');
}

async function previewOverlays(dir) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  const [W, H] = spec.size || [1080, 1920];
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const files = await renderOverlays(spec, dir, outDir, W, H);
  const sheet = path.join(outDir, 'ref-shots.jpg');
  // first overlay over the first reference shot frame (ref-shots.jpg cells are 270x480)
  const base = fs.existsSync(sheet) ? ['-i', sheet, '-filter_complex', `[0]crop=270:480:0:0,scale=${W}:${H}[b];[b][1]overlay=0:0`] : ['-f', 'lavfi', '-i', `color=gray:size=${W}x${H}`, '-filter_complex', '[0][1]overlay=0:0'];
  if (files.length) ff([...base.slice(0, 2), '-i', files[0].file, ...base.slice(2), '-frames:v', '1', path.join(outDir, 'captions-preview.jpg')]);
  console.log(`wrote ${path.relative(process.cwd(), path.join(outDir, 'captions-preview.jpg'))} (overlay 0 over the first reference shot)`);
}

export async function build(dir, opts = {}) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  const [W, H] = spec.size || [1080, 1920];
  const fps = spec.fps || 30;
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const name = path.basename(dir);
  await composeScreens(spec, dir, outDir, W, H, fps);
  const overlays = await renderOverlays(spec, dir, outDir, W, H);

  // shots with a "screen" use their take with the screen composited in (cached per take)
  const clipFor = {};
  for (const shot of spec.shots) clipFor[shot.id] = await screenClip(spec, dir, shot, shot.clip || `clips/${shot.id}.mp4`);
  const inputs = [], vf = [], af = [], labels = [];
  const soraAudio = (spec.audio?.sora ?? 1) > 0;
  spec.shots.forEach((shot, i) => {
    const clip = path.join(dir, clipFor[shot.id]);
    if (!fs.existsSync(clip)) throw new Error(`missing clip for ${shot.id}: ${path.relative(process.cwd(), clip)} (run sora.mjs)`);
    inputs.push('-i', clip);
    const dur = shot.end - shot.start, speed = shot.speed ?? 1, from = shot.from ?? 0;
    // grade: per-channel linear colour match {r:[gain,offset], g:…, b:…, clip} (compare.mjs --apply
    // writes it); a grade fitted on another take is skipped, re-run --apply
    let g = shot.grade;
    if (g?.clip && g.clip !== (shot.clip || `clips/${shot.id}.mp4`)) { console.warn(`warning: ${shot.id}: grade was fitted on ${g.clip}, not ${shot.clip}; ignored (run compare.mjs --apply)`); g = null; }
    const lut = g ? `,lutrgb=r='clip(val*${g.r[0]}+${g.r[1]},0,255)':g='clip(val*${g.g[0]}+${g.g[1]},0,255)':b='clip(val*${g.b[0]}+${g.b[1]},0,255)'` : '';
    // exact frame count per slot (from the slot's start/end frame indices), so cuts never drift.
    // "reverse": true plays the used span backwards (a keyframe is always the clip's FIRST frame, so
    // for "X enters the frame" shots, generate X leaving and reverse it). "filter": extra ffmpeg filters.
    // "hold": N seconds at the end of the slot freeze the last frame shown — for a reversed entrance
    // ("X slides into place") whose take started moving at once, so X settles by the reference's moment
    // and stays put (Sora ignores "stay still first"); the moving part is the slot minus the hold.
    const nf = Math.round(shot.end * fps) - Math.round(shot.start * fps);
    const nh = Math.min(nf - 1, Math.round((shot.hold ?? 0) * fps));
    const rev = shot.reverse ? ',reverse' : '';
    const hold = nh > 0 ? `,tpad=stop_mode=clone:stop=${nh}` : '';
    vf.push(`[${i}:v]trim=start=${from}:duration=${(dur * speed + 1).toFixed(3)},setpts=(PTS-STARTPTS)/${speed},fps=${fps},trim=end_frame=${nf - nh},setpts=PTS-STARTPTS${rev}${hold},${frameFilter(shot, W, H, dur)},setsar=1${lut}${shot.filter ? ',' + shot.filter : ''}[v${i}]`);
    if (soraAudio) af.push(`[${i}:a]atrim=start=${from}:duration=${(dur * speed).toFixed(3)},asetpts=PTS-STARTPTS,${speed !== 1 ? `atempo=${speed},` : ''}aresample=48000,apad,atrim=duration=${dur.toFixed(3)}${shot.reverse ? ',areverse' : ''}[a${i}]`);
    labels.push(soraAudio ? `[v${i}][a${i}]` : `[v${i}]`);
  });
  const n = spec.shots.length;
  let graph = [...vf, ...af, `${labels.join('')}concat=n=${n}:v=1:a=${soraAudio ? 1 : 0}[vc]${soraAudio ? '[ac]' : ''}`];
  let vlast = 'vc';
  overlays.forEach((o, k) => {
    const idx = n + k;
    inputs.push('-loop', '1', '-i', o.file);
    graph.push(`[${vlast}][${idx}:v]overlay=0:0:enable='between(t,${o.from},${o.to})':shortest=1[vo${k}]`);
    vlast = `vo${k}`;
  });
  // audio: optional music bed (a file you have the rights to) mixed with Sora's own audio
  let alast = soraAudio ? 'ac' : null;
  const music = spec.audio?.music && path.join(dir, spec.audio.music);
  if (music && fs.existsSync(music)) {
    const idx = n + overlays.length;
    inputs.push('-i', music);
    graph.push(`[${idx}:a]atrim=start=${spec.audio.musicStart ?? 0},asetpts=PTS-STARTPTS,volume=${spec.audio.musicVolume ?? 1}[mus]`);
    if (alast) { graph.push(`[${alast}]volume=${spec.audio.sora ?? 1}[sa]`, `[sa][mus]amix=inputs=2:duration=first:normalize=0[am]`); alast = 'am'; } else alast = 'mus';
  } else if (spec.audio?.music) console.warn(`warning: music ${spec.audio.music} not found; using Sora audio only`);
  else if (alast && spec.audio?.sora !== undefined) { graph.push(`[${alast}]volume=${spec.audio.sora}[am]`); alast = 'am'; }

  const out = path.join(outDir, `${name}.mp4`);
  ff([...inputs, '-filter_complex', graph.join(';'), '-map', `[${vlast}]`, ...(alast ? ['-map', `[${alast}]`, '-c:a', 'aac', '-b:a', '192k'] : []),
    '-t', String(spec.duration ?? spec.shots[n - 1].end), '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  console.log(`built ${path.relative(process.cwd(), out)}`);

  if (opts.frames) {
    const fdir = path.join(outDir, 'frames');
    fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
    for (const shot of spec.shots) ff(['-ss', ((shot.start + shot.end) / 2).toFixed(3), '-i', out, '-frames:v', '1', path.join(fdir, `${shot.id}.png`)]);
    console.log(`frames in ${path.relative(process.cwd(), fdir)}`);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const target = path.resolve(argv.find((a) => !a.startsWith('--')));
  // --overlays: render only the captions over the reference's shot frames (out/captions-preview.jpg),
  // to check fonts and fits in seconds without a build
  if (argv.includes('--overlays')) previewOverlays(target).catch((e) => { console.error(e.message); process.exit(1); });
  else build(target, { frames: argv.includes('--frames') }).catch((e) => { console.error(e.message); process.exit(1); });
}
