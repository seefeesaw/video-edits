#!/usr/bin/env node
// Continuity bible: everything that must not change in a video, generated ONCE and reused by every
// performance/shot (and by later videos in a series).
//
//   video.json "bible": {
//     "props": { "jar": { "desc": "<exact words>" }, "mug": { "desc": "…", "image": "assets/product/x.png" }, … },
//     "sets":  { "A": { "desc": "<place, camera, lighting>", "props": ["jar", "pot", …],
//                        "layout": "<where each prop stands in the first frame>" } }
//   }
//   node bible.mjs videos/<name> [--only jar,A] [--force]
//
// 1. props: one product-style image per prop (gpt-image-2) → bible/prop-<id>.png
// 2. sets:  a PEOPLE-FREE start frame of each set with its props in place, made as an edit that takes
//    the prop images as references (so the props in the set are those exact objects) →
//    bible/set-<id>.png and bible/set-<id>.720x1280.png (what Sora gets).
// Sora refuses input images with people, but a people-free set is accepted: performances start from
// it (`"start": "set"`), so the place and every prop are pinned by the first frame, and the person
// steps in. sora.mjs also appends each listed prop's exact words to every prompt that uses it.
// Then: node continuity.mjs videos/<name> --takes <perf>  ranks takes against these references.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const dir = path.resolve(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--only') || '');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const force = argv.includes('--force');
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
const bible = spec.bible || {};
const bdir = path.join(dir, 'bible');
fs.mkdirSync(bdir, { recursive: true });
const NO = 'No people, no hands, no faces anywhere. No text, no labels, no logos, no brand names, no watermark.';

// jobs run through the slideshow's gpt-image-2 generator (generations, or edits when refs are given)
function run(jobs) {
  const todo = jobs.filter((j) => force || !fs.existsSync(path.join(bdir, j.out)));
  if (!todo.length) return;
  fs.writeFileSync(path.join(bdir, 'post.json'), JSON.stringify({ title: 'bible', slides: [], generate: todo }, null, 2));
  execFileSync('node', [path.join(ROOT, '..', 'slideshow', 'generate.mjs'), bdir, ...(force ? ['--force'] : [])], { stdio: 'inherit' });
}

const props = Object.entries(bible.props || {}).filter(([id]) => !only || only.includes(id));
// a real product: "image": the store photo IS the prop reference (copied, never generated)
for (const [id, p] of props) if (p.image) {
  const out = path.join(bdir, `prop-${id}.png`);
  if (force || !fs.existsSync(out)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, p.image), out]);
}
run(props.filter(([, p]) => !p.image).map(([id, p]) => ({
  id: `prop-${id}`, out: `prop-${id}.png`, size: '1024x1024', quality: 'high', variants: 1,
  prompt: `Photorealistic product photo of exactly one object, centred on a plain light-grey studio background, soft even light, whole object visible: ${p.desc}. ${NO}`,
})));

const sets = Object.entries(bible.sets || {}).filter(([id]) => !only || only.includes(id));
run(sets.map(([id, s]) => {
  const ps = (s.props || []).map((pid) => [pid, bible.props[pid]]);
  const missing = ps.filter(([pid, p]) => !p || !fs.existsSync(path.join(bdir, `prop-${pid}.png`))).map(([pid]) => pid);
  if (missing.length) throw new Error(`set ${id}: props without an image: ${missing.join(', ')} (define them in bible.props; run bible.mjs)`);
  return {
    id: `set-${id}`, out: `set-${id}.png`, size: '1024x1536', quality: 'high', variants: 1,
    refs: ps.map(([pid]) => `prop-${pid}.png`),
    prompt: `Photorealistic first frame of a vertical phone video, the empty set before the person steps in: ${s.desc}. ${s.layout || ''} The objects in it are EXACTLY the reference objects (same shape, proportions, colour, material, caps and handles): ${ps.map(([pid, p]) => `${pid}: ${p.desc}`).join('; ')}. The image will be cropped to 9:16 by cutting 8% off the left and right edges: keep everything important inside the central area. ${NO}`,
  };
}));
// what Sora gets: cover-cropped to its size
for (const [id] of sets) {
  const src = path.join(bdir, `set-${id}.png`), out = path.join(bdir, `set-${id}.${spec.soraSize || '720x1280'}.png`);
  const [w, h] = (spec.soraSize || '720x1280').split('x');
  if (fs.existsSync(src) && (force || !fs.existsSync(out))) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, out]);
}
// one sheet of the whole bible to review at a glance
const imgs = [...Object.keys(bible.props || {}).map((p) => `prop-${p}.png`), ...Object.keys(bible.sets || {}).map((s) => `set-${s}.png`)].filter((f) => fs.existsSync(path.join(bdir, f)));
if (imgs.length) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...imgs.flatMap((f) => ['-i', path.join(bdir, f)]), '-filter_complex',
    `${imgs.map((_, i) => `[${i}]scale=240:320:force_original_aspect_ratio=decrease,pad=240:320:(ow-iw)/2:(oh-ih)/2:white[i${i}]`).join(';')};${imgs.map((_, i) => `[i${i}]`).join('')}xstack=inputs=${imgs.length}:layout=${imgs.map((_, i) => `${(i % 6) * 240}_${Math.floor(i / 6) * 320}`).join('|')}:fill=white`, path.join(bdir, 'bible-sheet.jpg')]);
  console.log(`bible: ${imgs.length} images; review ${path.relative(process.cwd(), path.join(bdir, 'bible-sheet.jpg'))}`);
}
