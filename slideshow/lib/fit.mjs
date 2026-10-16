// Auto-fit: make an element's rendered ink match a box measured on the reference slide.
//
// Mark targets with data-fit="x0,y0,x1,y1" (slide px, inclusive ink box). In post.json, `fit` on a
// text/badge element does this for you. data-fit-mode:
//   text (default) – scale font-size to the box height, letter-spacing to its width, then move
//   box            – uniform scale to the box height, then move (shapes, icons, images)
//   stretch        – independent x/y scale to the box, then move (stickers, wide/narrow art)
//   move           – only move
//
// Each target is isolated (everything else hidden, transparent background), screenshotted around
// its box, and its alpha bounding box compared with the target. Two passes converge to ~1px.
import { PNG } from 'pngjs';

const FIT_CSS = `
  body.__fitting, body.__fitting .bg { background: transparent !important; }
  body.__fitting * { visibility: hidden !important; }
  body.__fitting .__fit-target, body.__fitting .__fit-target * { visibility: visible !important; }
`;

async function inkBox(page, idx, [x0, y0, x1, y1], W, H) {
  const pad = Math.max(80, Math.round((x1 - x0) * 0.5), Math.round((y1 - y0) * 0.6));
  const cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad);
  const cx1 = Math.min(W, x1 + pad), cy1 = Math.min(H, y1 + pad);
  await page.evaluate((i) => { document.body.classList.add('__fitting'); document.querySelectorAll('[data-fit]')[i].classList.add('__fit-target'); }, idx);
  const buf = await page.screenshot({ clip: { x: cx0, y: cy0, width: cx1 - cx0, height: cy1 - cy0 }, omitBackground: true });
  await page.evaluate((i) => { document.body.classList.remove('__fitting'); document.querySelectorAll('[data-fit]')[i].classList.remove('__fit-target'); }, idx);
  const png = PNG.sync.read(buf);
  let a = 1e9, b = 1e9, c = -1, d = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 110) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  }
  return c < 0 ? null : [a + cx0, b + cy0, c + cx0, d + cy0];
}

export async function fitAll(page, W, H, log = () => {}) {
  await page.addStyleTag({ content: FIT_CSS });
  const targets = await page.evaluate(() => [...document.querySelectorAll('[data-fit]')].map((el) => ({
    box: el.dataset.fit.split(',').map(Number),
    mode: el.dataset.fitMode || 'text',
    label: el.dataset.fitLabel || el.textContent.trim().slice(0, 24),
  })));
  const results = [];
  for (const [i, t] of targets.entries()) {
    const [x0, y0, x1, y1] = t.box;
    const tw = x1 - x0, th = y1 - y0;
    let m = await inkBox(page, i, t.box, W, H);
    if (!m) { log(`fit: "${t.label}" has no visible ink near its box`); continue; }
    const before = await page.evaluate((i) => document.querySelectorAll('[data-fit]')[i].getAttribute('style') || '', i);
    try {
    for (let pass = 0; pass < 2; pass++) {
      if (t.mode === 'text') {
        await page.evaluate((i, k) => { const el = document.querySelectorAll('[data-fit]')[i]; el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * k}px`; }, i, th / Math.max(1, m[3] - m[1]));
        m = await inkBox(page, i, t.box, W, H);
        if (!m) throw new Error('lost');
        const dw = tw - (m[2] - m[0]);
        await page.evaluate((i, dw) => {
          const el = document.querySelectorAll('[data-fit]')[i];
          const n = Math.max(...el.innerText.split('\n').map((l) => l.length));
          const ls = parseFloat(getComputedStyle(el).letterSpacing) || 0;
          el.style.letterSpacing = `${ls + dw / Math.max(1, n - 1)}px`;
        }, i, dw);
      } else if (t.mode === 'stretch') {
        await page.evaluate((i, kx, ky) => { const el = document.querySelectorAll('[data-fit]')[i]; const [sx, sy = sx] = (el.style.scale || '1').split(' ').map(Number); el.style.scale = `${sx * kx} ${sy * ky}`; el.style.transformOrigin = '0 0'; }, i, tw / Math.max(1, m[2] - m[0]), th / Math.max(1, m[3] - m[1]));
      } else if (t.mode === 'box') {
        await page.evaluate((i, k) => { const el = document.querySelectorAll('[data-fit]')[i]; const s = parseFloat(el.style.scale || '1') * k; el.style.scale = String(s); el.style.transformOrigin = '0 0'; }, i, th / Math.max(1, m[3] - m[1]));
      }
      m = await inkBox(page, i, t.box, W, H);
      if (!m) throw new Error('lost');
      await page.evaluate((i, dx, dy) => {
        const el = document.querySelectorAll('[data-fit]')[i];
        // targets inside scaled containers (phone screens) move in local px
        const k = el.getBoundingClientRect().width / (el.offsetWidth || 1) / parseFloat((el.style.scale || '1').split(' ')[0]) || 1;
        const [ox, oy] = (el.style.translate || '0px 0px').split(' ').map((v) => parseFloat(v) || 0);
        el.style.translate = `${ox + dx / k}px ${oy + dy / k}px`;
      }, i, x0 - m[0], y0 - m[1]);
      m = await inkBox(page, i, t.box, W, H);
      if (!m) throw new Error('lost');
    }
    } catch {
      // the target left its box (e.g. clipped by a frame); restore and report instead of failing
      await page.evaluate((i, st) => document.querySelectorAll('[data-fit]')[i].setAttribute('style', st), i, before);
      log(`fit: "${t.label}" could not be fitted (ink disappeared while adjusting); left as authored`);
      continue;
    }
    if (!m) continue;
    const err = Math.max(...m.map((v, k) => Math.abs(v - t.box[k])));
    results.push({ label: t.label, err });
    if (err > 3) log(`fit: "${t.label}" off by ${err}px (target ${t.box}, got ${m})`);
  }
  return results;
}
