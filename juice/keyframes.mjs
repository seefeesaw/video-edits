#!/usr/bin/env node
// Builds each shot's first frame with gpt-image-2 *edits*, using real product photos as image
// references, so the product in the video is the actual product (shape, colour, lettering) rather
// than Sora's guess. sora.mjs then sends the keyframe as input_reference (image-to-video).
//
//   node keyframes.mjs videos/<name>              make missing keyframes
//   node keyframes.mjs videos/<name> --only s2    (--force to redo)
//
// video.json:
//   "product": { "name": "...", "refs": ["assets/product/front.png", …], "description": "..." }
//   shot.keyframe: { "prompt": "first frame of the shot: composition…", "refs": [optional extra refs] }
//     -> writes assets/keyframes/<id>.png (1024×1536 from the model) and <id>.720x1280.png (sent to Sora)
//   A string shot.keyframe is used as-is (an existing image path).
//
// Uses the image deployment from ../slideshow/foundry.json (gpt-image-2, Entra ID via az login).
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { greenBox, wholeDeviceIssue } from './build.mjs';
import { realityText } from './lib/reality.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'slideshow', 'foundry.json'), 'utf8'));
const ENDPOINT = (process.env.AZURE_FOUNDRY_IMAGE_ENDPOINT || cfg.endpoint).replace(/\/+$/, '');
const DEPLOYMENT = process.env.AZURE_FOUNDRY_IMAGE_DEPLOYMENT || cfg.deployment;
const API_VERSION = process.env.AZURE_FOUNDRY_IMAGE_EDIT_API_VERSION || cfg.apiVersion;

const token = () => execSync('az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv', { encoding: 'utf8' }).trim();
const mime = (f) => (f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

// Sora wants input_reference at exactly the output size; cover-crop the keyframe to it.
export function soraSizedKeyframe(src, size = '720x1280') {
  const [w, h] = size.split('x').map(Number);
  const out = src.replace(/\.png$/, `.${w}x${h}.png`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`, out]);
  return out;
}

// the keyframe's own size: gpt-image-2 takes any size divisible by 16 (longest edge ≤ 3840), so a 9:16
// Sora frame is drawn at 9:16 (1152x2048) and only downscaled to Sora's size — no side crop, no upscale
// (the old 2:3 image lost 16% of its width and was upscaled). "keyframeSize" overrides.
export const keyframeSize = (spec) => {
  if (spec.keyframeSize) return spec.keyframeSize;
  const [w, h] = (spec.soraSize || '720x1280').split('x').map(Number);
  return Math.abs(w / h - 9 / 16) < 0.01 ? '1152x2048' : '1024x1536';
};
async function edit(prompt, refs, bearer, size = '1024x1536') {
  const fd = new FormData();
  fd.set('prompt', prompt);
  fd.set('size', size);
  fd.set('quality', 'high');
  fd.set('n', '1');
  for (const r of refs) fd.append('image[]', new Blob([fs.readFileSync(r)], { type: mime(r) }), path.basename(r));
  const url = `${ENDPOINT}/openai/deployments/${encodeURIComponent(DEPLOYMENT)}/images/edits?api-version=${API_VERSION}`;
  // the image deployment allows few calls per minute: wait out 429s instead of failing
  let res, text;
  for (let attempt = 0; ; attempt++) {
    // network blips ("fetch failed") are retried like 429s instead of ending the whole run
    try { res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${bearer}` }, body: fd }); }
    catch (e) { if (attempt >= 5) throw e; console.log(`  ${e.message}; retrying in 15s`); await new Promise((r) => setTimeout(r, 15000)); continue; }
    text = await res.text();
    if (res.status !== 429 || attempt >= 15) break;
    const wait = +(text.match(/retry after (\d+) seconds/i)?.[1] || 30);
    await new Promise((r) => setTimeout(r, (wait + 2) * 1000));
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 400)}`);
  return Buffer.from(JSON.parse(text).data[0].b64_json, 'base64');
}

async function main() {
  const argv = process.argv.slice(2);
  const oi = argv.indexOf('--only');
  const only = oi >= 0 ? argv[oi + 1].split(',') : null;
  const force = argv.includes('--force');
  const dir = path.resolve(argv.find((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1)) || '');
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  const product = spec.product || {};
  const jobs = spec.shots.filter((s) => s.keyframe && typeof s.keyframe === 'object' && (!only || only.includes(s.id)));
  const bearer = token();
  const queue = [...jobs];
  const worker = async () => { while (queue.length) await one(queue.shift()); };
  const one = async (s) => {
    const out = path.join(dir, 'assets', 'keyframes', `${s.id}.png`);
    if (fs.existsSync(out) && !force) return;
    // continuity bible: the shot's set frame (the same room and props in every keyframe) + that set's
    // prop images go in as references too, so every keyframe is an edit of the same world
    const set = s.set && spec.bible?.sets?.[s.set];
    const bibleRefs = set ? [`bible/set-${s.set}.png`, ...(set.props || []).map((p) => `bible/prop-${p}.png`)].filter((f) => fs.existsSync(path.join(dir, f))) : [];
    // the edits endpoint takes a limited number of images: product photos first, then the bible
    const refs = [...(product.refs || []), ...bibleRefs, ...(s.keyframe.refs || [])].slice(0, 10).map((r) => path.join(dir, r));
    const prompt = [
      s.keyframe.prompt,
      // the shot's exact physical state (counts, levels, open/closed) + the hard reality rules, so every
      // first frame continues the previous shot's end instead of re-imagining the scene
      realityText(spec, s, { still: true }),
      set ? `The place is EXACTLY the set reference image (same room, furniture, wall colours, lighting and props in the same places), only the camera distance/angle and the action change as described. Sizes and positions stated for THIS shot override the scale of the set image (a wide shot shows the product smaller than the set image does). Props must look exactly like their reference images: ${(set.props || []).map((p) => `${p}: ${spec.bible.props[p].desc}`).join('; ')}.` : '',
      spec.style,
      product.refs?.length ? `The product in the reference image(s) — ${product.name || 'the product'}${product.description ? `: ${product.description}` : ''} — must appear exactly as photographed: same shape, proportions, colour, glaze, lettering and handle. Do not redesign it.` : '',
      // Sora's moderation blocks input images showing people ("people-in-user-uploads"); hands are fine.
      `This is the first frame of a vertical phone video. Photorealistic, no added text or watermark. No people or faces anywhere in the image — only hands and forearms may appear; ${s.screen ? `the device screen is lit flat, uniform, pure chroma-key green (#00FF00) from edge to edge, with no picture, interface, reflection or glare (a picture is composited into it later)${s.screen.whole ? '; the WHOLE device (all four corners of the screen and its frame) is inside the picture, not cut by any edge' : ''}` : 'any screen (laptop, TV, phone) shows scenery, abstract light or a title card, never a person'}.`,
      // the 2:3 image is cover-cropped to 9:16 for Sora (8% off each side), and the model tends to
      // shrink the main object below the stated size
      (() => { const [kw, kh] = keyframeSize(spec).split('x').map(Number); return Math.abs(kw / kh - 9 / 16) < 0.01
        ? 'The image is the full vertical 9:16 frame: positions given as percentages refer to the whole image. Object sizes given as percentages are hard requirements: do not draw the main object smaller than stated. Tack-sharp, high detail, crisp textures.'
        : 'The image will be cropped to 9:16 by cutting 8% off the left and right edges: all positions given as percentages refer to the remaining central area, and nothing important may sit in the outer 8% strips. Object sizes given as percentages are hard requirements: do not draw the main object smaller than stated.'; })(),
    ].filter(Boolean).join('\n\n');
    const t0 = Date.now();
    const buf = await edit(prompt, refs, bearer, keyframeSize(spec));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    soraSizedKeyframe(out, spec.soraSize);
    console.log(`keyframe ${path.relative(process.cwd(), out)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    // a "screen" shot needs a clean green screen in its first frame, or the composite has nothing to key
    if (s.screen) {
      const sized = out.replace(/\.png$/, `.${spec.soraSize || '720x1280'}.png`), [w, h] = (spec.soraSize || '720x1280').split('x').map(Number);
      const b = greenBox(execFileSync('ffmpeg', ['-v', 'error', '-i', sized, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 }), w, h);
      if (!b || b.n < w * h * 0.01) console.warn(`warning: ${s.id}: no green screen in its keyframe; regenerate with --force --only ${s.id}`);
      else if (s.screen.whole && wholeDeviceIssue(b, w, h)) console.warn(`warning: ${s.id}: "whole" wants the device fully in frame, but ${wholeDeviceIssue(b, w, h)}; regenerate with --force --only ${s.id} (centre the device behind the product in the bible set if it keeps landing at the edge)`);
      else console.log(`  ${s.id}: green screen ${((100 * b.n) / (w * h)).toFixed(0)}% of the frame`);
    }
  };
  await Promise.all(Array.from({ length: +(process.env.IMAGE_CONCURRENCY || 2) }, worker));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
