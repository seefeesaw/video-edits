#!/usr/bin/env node
// Slideshow pipeline: posts/<name>/post.json -> one HTML page per slide -> 1080x1920 PNGs.
//
//   node render.mjs posts/<name>            render every slide to posts/<name>/out/
//   node render.mjs posts/<name> --only 3   render slide 3 only (1-based)
//   node render.mjs posts/<name> --html     also keep the generated HTML next to the PNGs
//
// See README.md for the post.json format and the element/background catalogue.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { render } from './lib/elements.mjs';
import { renderBackground } from './lib/backgrounds.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME =
  process.env.CHROME_PATH ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => fs.existsSync(p));

// On Windows a viewer (e.g. the review page) can briefly lock the PNG; retry instead of failing.
function writeWithRetry(file, buf, tries = 20) {
  for (let i = 0; ; i++) {
    try { return fs.writeFileSync(file, buf); } catch (e) {
      if (i >= tries) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
    }
  }
}

function parseArgs(argv) {
  const a = { dir: null, only: null, html: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') a.only = argv[++i].split(',').map(Number);
    else if (argv[i] === '--html') a.html = true;
    else a.dir = argv[i];
  }
  if (!a.dir) throw new Error('usage: node render.mjs posts/<name> [--only N[,M]] [--html]');
  return a;
}

function fontLink(fonts) {
  const fams = ['Noto Color Emoji', ...(fonts || [])];
  const q = fams.map((f) => 'family=' + f.replace(/ /g, '+')).join('&');
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=block">`;
}

export function buildSlideHtml(post, slide, ctx) {
  const [W, H] = post.size || [1080, 1920];
  const css = (post.css || []).map((f) => ctx.read(f)).join('\n');
  const els = (slide.elements || []).map((el) => render(el, ctx)).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8">${fontLink(post.fonts)}
<style>
  html,body{margin:0;padding:0;}
  body{width:${W}px;height:${H}px;position:relative;overflow:hidden;-webkit-font-smoothing:antialiased;font-family:'Inter',sans-serif;}
  .emoji{font-family:'Noto Color Emoji';}
  ${fs.readFileSync(path.join(ROOT, 'lib/base.css'), 'utf8')}
  ${css}
</style></head><body>
${renderBackground(slide.background || post.background, ctx)}
${els}
<script>${fs.readFileSync(path.join(ROOT, 'lib/tiktok-text.js'), 'utf8')}</script>
</body></html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.resolve(args.dir);
  const post = JSON.parse(fs.readFileSync(path.join(dir, 'post.json'), 'utf8'));
  const outDir = path.join(dir, post.outDir || 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const [W, H] = post.size || [1080, 1920];

  const warnings = [];
  const ctx = {
    dir,
    read: (f) => fs.readFileSync(path.join(dir, f), 'utf8'),
    asset: (f) => {
      if (!f) return null;
      if (/^(https?:|data:)/.test(f)) return f;
      const p = path.join(dir, f);
      return fs.existsSync(p) ? pathToFileURL(p).href : null;
    },
    warn: (m) => warnings.push(m),
  };

  if (!CHROME) throw new Error('Chrome not found; set CHROME_PATH');
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    for (const [i, slide] of post.slides.entries()) {
      const n = i + 1;
      if (args.only && !args.only.includes(n)) continue;
      const name = `${String(n).padStart(2, '0')}-${slide.name || 'slide'}`;
      const html = buildSlideHtml(post, slide, ctx);
      // Write next to the post so relative file:// assets resolve.
      const htmlPath = path.join(outDir, `${name}.html`);
      fs.writeFileSync(htmlPath, html);
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => (im.onload = im.onerror = r))))));
      const file = path.join(outDir, `${name}.png`);
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
      writeWithRetry(file, png);
      if (!args.html) fs.unlinkSync(htmlPath);
      console.log(`rendered ${path.relative(process.cwd(), file)}`);
    }
  } finally {
    await browser.close();
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
