// Runs inside the page: lays out TikTok "classic" highlighted captions.
// Each line gets its own rounded background box sized to its text; where a narrower line meets a
// wider one, the narrower box's corners become concave fillets (TikTok's merged-bubble look).
(() => {
  const ctx = document.createElement('canvas').getContext('2d');
  for (const host of document.querySelectorAll('.tiktok-text')) {
    const s = JSON.parse(host.dataset.spec);
    const cs = getComputedStyle(host);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const n = s.lines.length;
    const widths = s.lines.map((t, i) => Math.max(Math.round(ctx.measureText(t).width + s.padX * 2), s.minWidths[i] || 0));
    // Lines whose widths are within 2r snap to the same width so no sliver steps appear.
    for (let i = 1; i < n; i++) if (Math.abs(widths[i] - widths[i - 1]) < s.radius * 2) widths[i] = widths[i - 1] = Math.max(widths[i], widths[i - 1]);
    const r = s.radius;
    let out = '';
    s.lines.forEach((t, i) => {
      const w = widths[i];
      const off = s.offsets[i] || 0;
      const x = s.cx - w / 2 + off;
      const y = s.y + i * s.lineHeight;
      const up = i > 0 ? widths[i - 1] : null;
      const dn = i < n - 1 ? widths[i + 1] : null;
      // corner radius: square where this line touches a line at least as wide
      const tl = up != null && up >= w ? 0 : r, tr = tl;
      const bl = dn != null && dn >= w ? 0 : r, br = bl;
      const [tdx, tdy] = s.textOffsets[i] || [0, 0];
      out += `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${s.lineHeight}px;background:${s.bg};border-radius:${tl}px ${tr}px ${br}px ${bl}px;display:flex;align-items:center;justify-content:center;white-space:pre;"><span${s.fitLines[i] ? ` data-fit="${s.fitLines[i].join(',')}"` : ''} style="display:inline-block;transform:translate(${tdx}px,${tdy}px)">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span></div>`;
      // concave fillets flaring from this (narrower) line into the wider neighbour
      // (cx, cy) is the centre of the transparent quarter-circle, i.e. the corner pointing away
      // from both boxes.
      const fillet = (fx, fy, cx, cy) =>
        `<div style="position:absolute;left:${fx}px;top:${fy}px;width:${r}px;height:${r}px;background:radial-gradient(circle at ${cx}px ${cy}px, transparent ${r - 0.5}px, ${s.bg} ${r}px);"></div>`;
      if (up != null && up > w) {
        out += fillet(x - r, y, 0, r);
        out += fillet(x + w, y, r, r);
      }
      if (dn != null && dn > w) {
        out += fillet(x - r, y + s.lineHeight - r, 0, 0);
        out += fillet(x + w, y + s.lineHeight - r, r, 0);
      }
    });
    host.innerHTML = out;
  }
})();
