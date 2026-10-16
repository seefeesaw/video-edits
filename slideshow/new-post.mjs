#!/usr/bin/env node
// Scaffolds posts/<name>/ from a capture (output of tools/tiktok-capture.js):
//   node new-post.mjs <name> capture.json
// Creates post.json with references + one placeholder slide per reference, screens/screens.css,
// and empty assets/. Existing posts are never overwritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const [name, capFile] = process.argv.slice(2);
if (!name || !capFile) throw new Error('usage: node new-post.mjs <name> <capture.json>');
const dir = path.join(ROOT, 'posts', name);
if (fs.existsSync(path.join(dir, 'post.json'))) throw new Error(`${dir} already has a post.json`);
const cap = JSON.parse(fs.readFileSync(capFile, 'utf8'));
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
