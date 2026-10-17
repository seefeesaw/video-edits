// Capture a reference fingerprint of a YouTube Short, in the Short's own tab (the player's frames
// are readable in-page; nothing is downloaded). YouTube's CSP blocks loading local files into the
// page, so comparison happens locally: this produces reference.json, compare.mjs scores renders
// against it. Run this file's contents with the browser javascript tool on
// https://www.youtube.com/shorts/<id>, then:
//
//   ytcap.captureAndSave('video/videos/<name>/reference.json')
//                                    -> captures (~2 min, runs in the background), then navigates to
//                                       the local server's save.html, which writes the file and
//                                       returns here. Poll for the file on disk. (YouTube's CSP blocks
//                                       fetch/form posts to localhost; top-level navigation is allowed.)
//   await ytcap.capture()            -> the JSON string itself
//   await ytcap.cuts()               -> cut times (first frame of each new shot)
//   await ytcap.frames([t, …])       -> full-window view of reference frames for a screenshot
//   await ytcap.box(t, pred, [x0,y0,x1,y1])  -> ink box in 1080x1920 coords (caption fitting)
//   ytcap.close()                    -> remove the frame view
(() => {
  const v = () => document.querySelector('video');
  const seek = (t) => new Promise((res) => {
    const el = v();
    const done = () => { el.removeEventListener('seeked', done); setTimeout(res, 60); };
    el.addEventListener('seeked', done); el.currentTime = t; setTimeout(res, 4000);
  });
  const prep = () => {
    v().pause(); v().muted = true;
    try { (document.querySelector('#shorts-player') || document.querySelector('.html5-video-player')).setPlaybackQualityRange('hd1080', 'hd1080'); } catch {}
  };
  const raw = (w, h) => { const c = new OffscreenCanvas(w, h); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(v(), 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
  // GW×GH grid of mean colours, hex-encoded (r,g,b per cell)
  const GW = 9, GH = 16;
  const grid = () => {
    const w = GW * 8, h = GH * 8, d = raw(w, h); let out = '';
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const m = [0, 0, 0];
      for (let y = gy * 8; y < gy * 8 + 8; y++) for (let x = gx * 8; x < gx * 8 + 8; x++) { const i = (y * w + x) * 4; m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
      out += m.map((s) => Math.round(s / 64).toString(16).padStart(2, '0')).join('');
    }
    return out;
  };
  const ytcap = {
    // Cut times = presentation time of the first frame of each new shot. Uses
    // requestVideoFrameCallback's mediaTime (the frame actually shown), because seeks in YouTube's
    // MSE player land a frame or two off the requested time.
    async cuts(thr = 24) {
      prep(); const el = v(); const out = []; let prev = null, pt = null;
      const seekShown = (t) => new Promise((res) => { let done = false; el.requestVideoFrameCallback((n, m) => { done = true; res(m.mediaTime); }); el.currentTime = t; setTimeout(() => !done && res(null), 1500); });
      for (let t = 0; t < el.duration - 0.02; t += 1 / 60) {
        const mt = await seekShown(+t.toFixed(4)); if (mt === null || mt === pt) continue;
        const d = raw(54, 96);
        if (prev) { let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); if (s / (54 * 96 * 3) > thr) out.push(+mt.toFixed(4)); }
        prev = d; pt = mt;
      }
      return out;
    },
    async capture(step = 0.25) {
      prep();
      const samples = [];
      for (let t = 0.05; t < v().duration - 0.02; t += step) { await seek(+t.toFixed(3)); samples.push([+t.toFixed(3), grid()]); }
      return JSON.stringify({ source: location.href.split('?')[0], title: document.title.replace(/ - YouTube$/, ''), duration: +v().duration.toFixed(3), size: [v().videoWidth, v().videoHeight], grid: [GW, GH], step, cuts: await this.cuts(), samples });
    },
    async frames(times) {
      this.close(); prep();
      const o = document.createElement('div'); o.id = '__ytcap'; o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#111;display:flex;flex-wrap:wrap;gap:4px;align-content:flex-start';
      document.body.appendChild(o);
      const h = Math.min(innerHeight - 8, ((innerWidth - 4 * times.length) / times.length) * 16 / 9);
      for (const t of times) {
        await seek(t);
        const c = document.createElement('canvas'); c.width = 360; c.height = 640; const g = c.getContext('2d'); g.drawImage(v(), 0, 0, 360, 640);
        g.fillStyle = '#ff0'; g.font = 'bold 22px monospace'; g.fillText(`${t}s`, 8, 26);
        c.style.width = `${(h * 9) / 16}px`; o.appendChild(c);
      }
      return `${times.length} frames`;
    },
    async box(t, pred, [x0, y0, x1, y1]) {
      prep(); await seek(t);
      const c = new OffscreenCanvas(1080, 1920); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(v(), 0, 0, 1080, 1920);
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let a = 1e9, b = 1e9, cc = -1, dd = -1;
      for (let y = 0; y < y1 - y0; y++) for (let x = 0; x < x1 - x0; x++) { const i = (y * (x1 - x0) + x) * 4; if (pred([d[i], d[i + 1], d[i + 2]])) { a = Math.min(a, x); b = Math.min(b, y); cc = Math.max(cc, x); dd = Math.max(dd, y); } }
      return cc < 0 ? null : [a + x0, b + y0, cc + x0, dd + y0];
    },
    close() { document.getElementById('__ytcap')?.remove(); },
    save(file, json) {
      location.href = `http://localhost:5179/save.html#file=${encodeURIComponent(file)}&back=${encodeURIComponent(location.href)}&data=${encodeURIComponent(json)}`;
    },
    captureAndSave(file) {
      this.capture().then((json) => this.save(file, json)).catch((e) => (window.__ytcapError = e.message));
      return `capturing; ${file} will appear on disk when done`;
    },
  };
  window.ytcap = ytcap;
  return 'ytcap ready';
})();
