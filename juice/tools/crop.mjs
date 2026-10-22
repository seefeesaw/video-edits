#!/usr/bin/env node
// Crop one product variant out of a multi-product store photo (e.g. the white mug from a photo of a
// red and a white mug), as fractions of the image: x y w h in 0..1.
//   node tools/crop.mjs in.jpg out.png 0.5 0 0.5 1      right half
// Check the result: nothing of the other variant may remain at the edges (crop tighter if it does).
import { execFileSync } from 'node:child_process';
const [src, out, x, y, w, h] = process.argv.slice(2);
if (!h) throw new Error('usage: node tools/crop.mjs in out x y w h   (fractions 0..1)');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `crop=iw*${w}:ih*${h}:iw*${x}:ih*${y}`, out]);
console.log(`wrote ${out}`);
