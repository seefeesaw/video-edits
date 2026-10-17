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
import { fitAll } from './lib/fit.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const CHROME =
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
  const a = { dir: null, only: null, html: false, variants: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') a.only = argv[++i].split(',').map(Number);
    else if (argv[i] === '--html') a.html = true;
    else if (argv[i] === '--variants') a.variants = true;
    else a.dir = argv[i];
  }
  if (!a.dir) throw new Error('usage: node render.mjs posts/<name> [--only N[,M]] [--html] [--variants]');
  return a;
}

function fontLink(fonts) {
  const fams = ['Noto Color Emoji', ...(fonts || [])];
  const q = fams.map((f) => 'family=' + f.replace(/ /g, '+')).join('&');
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=block">`;
}

export function makeContext(dir, post, warnings = []) {
  const ctx = {
    dir,
    // "@shared/…" resolves to slideshow/shared (reusable screens, styles, logos); anything else is
    // relative to the post directory.
    resolve: (f) => (f.startsWith('@shared/') ? path.join(ROOT, 'shared', f.slice(8)) : path.join(dir, f)),
    read: (f) => fs.readFileSync(ctx.resolve(f), 'utf8'),
    asset: (f) => {
      if (!f) return null;
      if (/^(https?:|data:)/.test(f)) return f;
      const p = ctx.resolve(f);
      return fs.existsSync(p) ? pathToFileURL(p).href : null;
    },
    warn: (m) => warnings.push(m),
    size: post.size || [1080, 1920],
  };
  return ctx;
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
  // A full render replaces the whole set, so drop slides left over from renamed/removed entries.
  if (!args.only) for (const f of fs.readdirSync(outDir)) if (/^\d+-.*\.(png|html)$/.test(f)) fs.unlinkSync(path.join(outDir, f));
  const [W, H] = post.size || [1080, 1920];

  const warnings = [];
  const ctx = makeContext(dir, post, warnings);

  if (!CHROME) throw new Error('Chrome not found; set CHROME_PATH');
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    // --variants: for slides with a photo background, also render every sibling take
    // (photo.png -> photo.v2.png, photo.v3.png …) to out/candidates/NN-name.<take>.png so
    // review.rankImages() can pick the one whose composition is closest to the reference.
    if (args.variants) {
      const candDir = path.join(outDir, 'candidates');
      fs.rmSync(candDir, { recursive: true, force: true });
      fs.mkdirSync(candDir, { recursive: true });
      for (const [i, slide] of post.slides.entries()) {
        const n = i + 1, bg = slide.background;
        if ((args.only && !args.only.includes(n)) || bg?.type !== 'photo') continue;
        const file = path.basename(bg.src);
        const ext = path.extname(file);
        const stem = file.slice(0, -ext.length).replace(/\.v\d+$/, ''); // photo.v3.png -> photo
        const dirOf = path.dirname(ctx.resolve(bg.src));
        const isTake = (f) => f.startsWith(`${stem}.v`) && f.endsWith(ext) && /^\d+$/.test(f.slice(stem.length + 2, -ext.length));
        const takes = fs.readdirSync(dirOf).filter((f) => f === `${stem}${ext}` || isTake(f));
        for (const take of takes) {
          const variant = { ...slide, background: { ...bg, src: path.posix.join(path.posix.dirname(bg.src), take) } };
          const htmlPath = path.join(outDir, `__variant.html`);
          fs.writeFileSync(htmlPath, buildSlideHtml(post, variant, ctx));
          await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
          await page.evaluate(() => document.fonts.ready);
          await fitAll(page, W, H, () => {});
          const out = path.join(candDir, `${String(n).padStart(2, '0')}-${slide.name || 'slide'}.${take.replace(/\.\w+$/, '')}.png`);
          writeWithRetry(out, await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } }));
          fs.unlinkSync(htmlPath);
          console.log(`candidate ${path.relative(process.cwd(), out)}`);
        }
      }
      return;
    }
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
      const fits = await fitAll(page, W, H, (m) => warnings.push(`slide ${n}: ${m}`));
      if (fits.length) console.log(`  fitted ${fits.length} element(s), worst ${Math.max(...fits.map((f) => f.err))}px`);
      const file = path.join(outDir, `${name}.png`);
      // a renamed slide must not leave its old NN-*.png behind (the review page pairs by order)
      for (const f of fs.readdirSync(outDir)) if (f.startsWith(`${String(n).padStart(2, '0')}-`) && f.endsWith('.png') && f !== `${name}.png`) fs.unlinkSync(path.join(outDir, f));
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

// run only as a CLI, so other pipelines (video/build.mjs) can import buildSlideHtml/makeContext
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
