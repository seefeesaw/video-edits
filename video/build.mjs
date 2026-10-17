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

async function renderOverlays(spec, dir, outDir, W, H) {
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

export async function build(dir, opts = {}) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  const [W, H] = spec.size || [1080, 1920];
  const fps = spec.fps || 30;
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const name = path.basename(dir);
  await composeScreens(spec, dir, outDir, W, H, fps);
  const overlays = await renderOverlays(spec, dir, outDir, W, H);

  const inputs = [], vf = [], af = [], labels = [];
  const soraAudio = (spec.audio?.sora ?? 1) > 0;
  spec.shots.forEach((shot, i) => {
    const clip = path.join(dir, shot.clip || `clips/${shot.id}.mp4`);
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
    const nf = Math.round(shot.end * fps) - Math.round(shot.start * fps);
    const rev = shot.reverse ? ',reverse' : '';
    vf.push(`[${i}:v]trim=start=${from}:duration=${(dur * speed + 1).toFixed(3)},setpts=(PTS-STARTPTS)/${speed},fps=${fps},trim=end_frame=${nf},setpts=PTS-STARTPTS${rev},${frameFilter(shot, W, H, dur)},setsar=1${lut}${shot.filter ? ',' + shot.filter : ''}[v${i}]`);
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
  build(path.resolve(argv.find((a) => !a.startsWith('--'))), { frames: argv.includes('--frames') }).catch((e) => { console.error(e.message); process.exit(1); });
}
