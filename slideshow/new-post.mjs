#!/usr/bin/env node
// Scaffolds posts/<name>/ from a capture (tools/tiktok-capture.js saves it to
// posts/<name>/capture.json via the review server; or pass any capture file):
//   node new-post.mjs <name> [capture.json]
//   node new-post.mjs <name> --refresh     update an existing post's references (and caption) from a
//                                          fresh capture: TikTok's signed slide URLs expire after ~2 days
// Creates post.json with references + one placeholder slide per reference, screens/screens.css,
// and empty assets/. Existing posts are never overwritten (except references with --refresh).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const [name, capArg] = args.filter((a) => !a.startsWith('--'));
if (!name) throw new Error('usage: node new-post.mjs <name> [capture.json] [--refresh]');
const dir = path.join(ROOT, 'posts', name);
const capFile = capArg || path.join(dir, 'capture.json');
if (!fs.existsSync(capFile)) throw new Error(`no capture at ${capFile}: run tools/tiktok-capture.js on the post first`);
const cap = JSON.parse(fs.readFileSync(capFile, 'utf8'));
if (refresh) {
  const pj = path.join(dir, 'post.json'), post = JSON.parse(fs.readFileSync(pj, 'utf8'));
  if (cap.slides.length !== post.references.length) console.warn(`warning: capture has ${cap.slides.length} slides, post has ${post.references.length}`);
  post.references = cap.slides;
  fs.writeFileSync(pj, JSON.stringify(post, null, 2) + '\n');
  console.log(`refreshed ${cap.slides.length} reference URLs in ${path.relative(process.cwd(), pj)}`);
  process.exit(0);
}
if (fs.existsSync(path.join(dir, 'post.json'))) throw new Error(`${dir} already has a post.json`);
fs.mkdirSync(path.join(dir, 'screens'), { recursive: true });
fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
fs.writeFileSync(path.join(dir, 'screens', 'screens.css'), '/* post-specific styles for screen fragments */\n');
const post = {
  title: cap.title || name,
  source: cap.source,
  caption: cap.caption,
  music: cap.music,
  references_note: 'Original slide URLs (signed CDN links expire); used by review.html to diff renders in-browser.',
  references: cap.slides,
  size: [1080, 1920],
  fonts: ['Inter:wght@400;500;600;700;800;900'],
  css: ['screens/screens.css'],
  background: { type: 'paper', color: '#e8e9e4', grain: 0.02 },
  slides: cap.slides.map((_, i) => ({ name: `slide-${i + 1}`, elements: [] })),
};
fs.writeFileSync(path.join(dir, 'post.json'), JSON.stringify(post, null, 2) + '\n');
console.log(`created ${path.relative(process.cwd(), dir)} with ${cap.slides.length} slides`);
