// Measure on-screen caption ink boxes of a YouTube Short, in its own tab (small: paste the whole file
// into the browser javascript tool; nothing is downloaded). Coordinates are 1080x1920.
//
//   await ytbox.lines(2.4, [100, 250, 980, 520])          // white text: one box per text line
//   await ytbox.runs(2.4, [400, 370, 680, 430])           // column runs inside one line (glyphs vs emoji)
//   await ytbox.stable([0.6, 2.4, 3.3, 5.8, 8.5], [400, 360, 700, 440])   // pixels that stay the same
//                                                         // across frames = the overlay (emoji too), even
//                                                         // on a busy background
// Use: lines() for the text lines, runs() on the last line to find the gap before the emoji, stable()
// for the emoji box. Put text and emoji in separate overlay elements (README "video.json").
(() => {
  const v = () => document.querySelector('#shorts-player video') || [...document.querySelectorAll('video')].find((e) => e.readyState >= 1 && e.videoWidth) || document.querySelector('video');
  const player = () => document.querySelector('#shorts-player') || document.querySelector('.html5-video-player');
  const ready = async () => { for (let k = 0; k < 100 && !(v() && v().readyState >= 2 && Number.isFinite(v().duration)); k++) await new Promise((r) => setTimeout(r, 200)); try { player().setPlaybackQualityRange('hd1080', 'hd1080'); player().pauseVideo(); } catch {} v().pause(); };
  const seek = (t) => new Promise((res) => { const el = v(); let d = false; const f = () => { if (d) return; d = true; el.removeEventListener('seeked', f); res(); }; if (!el.paused) { try { player().pauseVideo(); } catch {} el.pause(); } el.addEventListener('seeked', f); el.currentTime = t; setTimeout(f, 3000); });
  const frame = async (t, [x0, y0, x1, y1]) => { await seek(t); const c = new OffscreenCanvas(1080, 1920), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(v(), 0, 0, 1080, 1920); return g.getImageData(x0, y0, x1 - x0, y1 - y0).data; };
  const white = (d, i) => d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225;
  const bbox = (W, H, on, x0, y0) => { let a = 1e9, b = 1e9, c = -1, e = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); e = Math.max(e, y); } return c < 0 ? null : [a + x0, b + y0, c + x0, e + y0]; };
  window.ytbox = {
    async lines(t, r) {
      await ready(); const d = await frame(t, r), W = r[2] - r[0], H = r[3] - r[1];
      const rows = Array.from({ length: H }, (_, y) => { let n = 0; for (let x = 0; x < W; x++) if (white(d, (y * W + x) * 4)) n++; return n; });
      const bands = []; let s = -1; rows.forEach((n, y) => { if (n > 2 && s < 0) s = y; if (n <= 2 && s >= 0) { if (y - s > 8) bands.push([s, y - 1]); s = -1; } });
      return bands.map(([a, b]) => bbox(W, b - a + 1, (x, y) => white(d, ((y + a) * W + x) * 4), r[0], r[1] + a));
    },
    async runs(t, r) {
      await ready(); const d = await frame(t, r), W = r[2] - r[0], H = r[3] - r[1];
      const on = (x) => { for (let y = 0; y < H; y++) { const i = (y * W + x) * 4; if (white(d, i) || Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 80) return true; } return false; };
      const out = []; let s = -1; for (let x = 0; x <= W; x++) { const o = x < W && on(x); if (o && s < 0) s = x; if (!o && s >= 0) { out.push([s + r[0], x - 1 + r[0]]); s = -1; } }
      return out;
    },
    async stable(times, r, tol = 18) {
      await ready(); const W = r[2] - r[0], H = r[3] - r[1], fr = []; for (const t of times) fr.push(await frame(t, r));
      const same = (x, y) => { const i = (y * W + x) * 4; return fr.every((d) => Math.abs(d[i] - fr[0][i]) + Math.abs(d[i + 1] - fr[0][i + 1]) + Math.abs(d[i + 2] - fr[0][i + 2]) < tol) && Math.max(fr[0][i], fr[0][i + 1], fr[0][i + 2]) > 60; };
      return bbox(W, H, same, r[0], r[1]);
    },
  };
  return 'ytbox ready: lines(t, region), runs(t, region), stable(times, region)';
})();
