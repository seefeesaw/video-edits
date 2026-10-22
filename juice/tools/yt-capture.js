// Capture a reference fingerprint of a YouTube Short, in the Short's own tab (the player's frames
// are readable in-page; nothing is downloaded). YouTube's CSP blocks fetch/forms to localhost, so
// results are handed to the local review server by navigating to its save.html.
//
// Paste this WHOLE file into the browser javascript tool on https://www.youtube.com/shorts/<id>
// (again after any navigation), set NAME below, and it runs everything in one go:
//   - cut times (seek-based scan at 1/60s; works with the browser pane hidden), source fps
//   - a 9×16 colour grid every 0.25s (compare.mjs scores renders against these)
//   - contact sheets: one frame per shot midpoint, and every 0.5s
// then saves juice/videos/<NAME>/reference.json and returns to the Short. Takes ~4 min per 10 s of video; wait for
// the file on disk. Then `node refsheet.mjs videos/<NAME>` moves the sheets out to out/*.jpg.
// Helpers stay on window.ytcap: cuts(), capture(), box(t, pred, region), sheetDataUrl(times).
const NAME = 'my-video';
(() => {
  // the Shorts page can hold several <video> elements (preloaded neighbours): use the active player's,
  // else the one that has loaded media. YouTube can swap the player's <video> mid-capture (e.g. its
  // ?themeRefresh=1 re-render right after navigation): the capture pins its element (PIN) while
  // that element stays in the page with its media; a new one is only picked once it has metadata
  let PIN = null;
  const ok = (e) => e && e.isConnected && e.readyState >= 1 && Number.isFinite(e.duration) && e.duration > 0;
  const v = () => (ok(PIN) ? PIN : (PIN = [document.querySelector('#shorts-player video'), ...document.querySelectorAll('video')].find(ok) || PIN || document.querySelector('video')));
  // seek and wait for 'seeked' (fires even when the page is hidden, unlike rAF/rVFC); the frame is
  // drawable at once. No setTimeout on this path: hidden tabs clamp timers to ~1s, which turned a
  // 1-minute scan into 10+ minutes.
  // The Shorts player resumes playback (and can reset to 0) behind a plain video.pause(), so pause
  // through the player API, re-pause before every seek, and check the seek landed: a scan reading
  // stale frames silently loses every cut after that point.
  const player = () => document.querySelector('#shorts-player') || document.querySelector('.html5-video-player');
  const seekOnce = (t) => new Promise((res, rej) => {
    if (!Number.isFinite(t)) return rej(new Error(`asked to seek to ${t}: the video's duration was lost (player swapped?); reload the Short and paste again`));
    const el = v(); let done = false;
    if (!el.paused) { try { player().pauseVideo(); } catch {} el.pause(); }
    const fin = () => { if (done) return; done = true; el.removeEventListener('seeked', fin); res(); };
    el.addEventListener('seeked', fin); el.currentTime = t; setTimeout(fin, 3000);
  });
  let misses = 0;
  const seek = async (t) => {
    for (let k = 0; k < 4; k++) {
      if (!ok(v())) await ready();
      await seekOnce(t);
      if (v().paused && Math.abs(v().currentTime - t) < 0.02) return;
    }
    if (++misses > 5) throw new Error(`seeks are not landing (asked ${t}s, at ${v().currentTime.toFixed(3)}s, paused=${v().paused}); reload the Short and paste again`);
  };
  const prep = () => {
    try { player().pauseVideo(); } catch {}
    v().pause(); v().muted = true; misses = 0;
    try { (document.querySelector('#shorts-player') || document.querySelector('.html5-video-player')).setPlaybackQualityRange('hd1080', 'hd1080'); } catch {}
  };
  // pasted right after navigation (or after a quality switch) the player may not have loaded metadata
  // yet (duration NaN): wait for it, since seeks to a non-finite time would throw
  const ready = async () => {
    for (let k = 0; k < 150 && !ok(v()); k++) await new Promise((r) => setTimeout(r, 200));
    if (!ok(v())) throw new Error('the video never loaded (duration unknown): reload the Short and paste again');
  };
  const raw = (w, h) => { const c = new OffscreenCanvas(w, h); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(v(), 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
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
    // Scan at 1/60s. Steps that land on the same decoded frame show ~0 change and are skipped;
    // source fps comes from the spacing of real frame changes. A cut is a change that is large in
    // absolute terms or a strong local peak (catches soft jump cuts inside one setup).
    async cuts() {
      prep(); const el = v(); const D = this.D || el.duration; const pts = []; let prev = null;
      // a scan that sees no frame changes for >1.5s while the video plainly moves is broken: checked below
      for (let t = 0; t < D - 0.01; t += 1 / 60) {
        await seek(+t.toFixed(4)); const d = raw(54, 96);
        if (prev) {
          let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]);
          const diff = s / (54 * 96 * 3); if (diff > 0.3) pts.push([+t.toFixed(4), diff]);
        }
        prev = d;
      }
      const gaps = pts.slice(1).map((p, i) => p[0] - pts[i][0]).filter((g) => g > 0.01 && g < 0.1).sort((a, b) => a - b);
      const fps = gaps.length ? Math.round(1 / gaps[Math.floor(gaps.length / 2)]) : 30;
      const out = [];
      pts.forEach(([t, d], i) => {
        const nb = [...pts.slice(Math.max(0, i - 6), i), ...pts.slice(i + 1, i + 7)].map((p) => p[1]).sort((a, b) => a - b);
        const med = nb.length ? nb[Math.floor(nb.length / 2)] : 0;
        // an edit is ONE big change between two steadier frames; fast handheld motion (a fork whipped
        // from board to mug) changes a lot on both sides of its biggest frame, so it must also tower
        // over its direct neighbours (the same rule compare.mjs uses for inner cuts)
        const around = Math.max(pts[i - 1]?.[1] ?? 0, pts[i + 1]?.[1] ?? 0);
        if ((d > 24 || (d > 10 && d > 4 * med)) && d > 2.5 * around) out.push(t);
      });
      // a cut seen at two consecutive steps (half-frame landing) counts once
      const cuts = out.filter((t, i) => i === 0 || t - out[i - 1] > 0.05);
      const last = pts.length ? pts[pts.length - 1][0] : 0;
      if (D - last > 1.5) throw new Error(`no frame changes after ${last}s of ${D.toFixed(2)}s: the scan read stale frames; reload the Short and paste again`);
      return { fps, cuts };
    },
    async capture(step = 0.25) {
      // two scans at once fight over the seek position and miss cuts: one at a time
      if (window.__ytcapBusy) throw new Error('a capture is already running in this tab');
      window.__ytcapBusy = true;
      try { return await this._capture(step); } finally { window.__ytcapBusy = false; }
    },
    async _capture(step) {
      await ready();
      // prep() asks for 1080p, which makes the player reload its media source: the duration reads NaN
      // until that settles, so wait again before reading it
      prep(); await new Promise((r) => setTimeout(r, 1500)); await ready(); const samples = []; const D = (this.D = v().duration);
      for (let t = 0.05; t < D - 0.02; t += step) { await seek(+t.toFixed(3)); samples.push([+t.toFixed(3), grid()]); }
      const { fps, cuts } = await this.cuts();
      const bounds = [0, ...cuts, D];
      const mids = bounds.slice(1).map((b, i) => +((bounds[i] + b) / 2).toFixed(3));
      const shots = await this.sheetDataUrl(mids);
      const every = await this.sheetDataUrl(Array.from({ length: Math.floor(D / 0.5) }, (_, i) => +(0.1 + i * 0.5).toFixed(2)), 180);
      return JSON.stringify({ source: location.href.split('?')[0], title: document.title.replace(/ - YouTube$/, ''), duration: +D.toFixed(3), size: [v().videoWidth, v().videoHeight], sourceFps: fps, grid: [GW, GH], step, cuts, shotMidpoints: mids, sheets: { shots, every }, samples });
    },
    // contact sheet (JPEG data URL) of frames at the given times, 4 per row, labelled
    async sheetDataUrl(times, w = 270) {
      const h = Math.round((w * 16) / 9), cols = Math.min(4, times.length), rows = Math.ceil(times.length / cols);
      const c = new OffscreenCanvas(cols * w, rows * h); const g = c.getContext('2d');
      for (const [i, t] of times.entries()) {
        await seek(t); const x = (i % cols) * w, y = Math.floor(i / cols) * h;
        g.drawImage(v(), x, y, w, h); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, 70, 20); g.fillStyle = '#ff0'; g.font = 'bold 14px monospace'; g.fillText(`${t}s`, x + 4, y + 15);
      }
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    },
    async box(t, pred, [x0, y0, x1, y1]) {
      prep(); await seek(t);
      const c = new OffscreenCanvas(1080, 1920); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(v(), 0, 0, 1080, 1920);
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let a = 1e9, b = 1e9, cc = -1, dd = -1;
      for (let y = 0; y < y1 - y0; y++) for (let x = 0; x < x1 - x0; x++) { const i = (y * (x1 - x0) + x) * 4; if (pred([d[i], d[i + 1], d[i + 2]])) { a = Math.min(a, x); b = Math.min(b, y); cc = Math.max(cc, x); dd = Math.max(dd, y); } }
      return cc < 0 ? null : [a + x0, b + y0, cc + x0, dd + y0];
    },
    save(file, json) {
      location.href = `http://localhost:5179/save.html#file=${encodeURIComponent(file)}&back=${encodeURIComponent(location.href)}&data=${encodeURIComponent(json)}`;
    },
  };
  window.ytcap = ytcap;
  if (!NAME) return 'ytcap ready (NAME not set: nothing captured)';
  window.__ytcapError = null;
  ytcap.capture().then((json) => ytcap.save(`juice/videos/${NAME}/reference.json`, json)).catch((e) => (window.__ytcapError = e.message));
  return `capturing (waits for the video to load first); juice/videos/${NAME}/reference.json will appear on disk in ~4 min per 10 s of video (then: node refsheet.mjs videos/${NAME})`;
})();
