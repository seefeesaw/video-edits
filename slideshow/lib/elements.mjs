// Element renderers: each takes a spec object and returns an HTML string.
// Every element is absolutely positioned on the 1080x1920 canvas (px units).
// Common keys: x, y, w, h, rotate, opacity, z, style (raw CSS appended), className.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const px = (v) => (typeof v === 'number' ? `${v}px` : v);

// Inline text may carry light markup: **bold**, __underline__, [color=#hex]text[/color],
// [style=css]text[/style] (e.g. per-line letter-spacing)
export function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\[color=(#[0-9a-fA-F]{3,8})\](.+?)\[\/color\]/g, '<span style="color:$1">$2</span>')
    .replace(/\[style=([^\]]+)\](.+?)\[\/style\]/g, '<span style="$1">$2</span>')
    .replace(/\n/g, '<br>');
}

function box(el, extra = '') {
  const parts = ['position:absolute'];
  if (el.x != null) parts.push(`left:${px(el.x)}`);
  if (el.y != null) parts.push(`top:${px(el.y)}`);
  if (el.w != null) parts.push(`width:${px(el.w)}`);
  if (el.h != null) parts.push(`height:${px(el.h)}`);
  if (el.z != null) parts.push(`z-index:${el.z}`);
  if (el.opacity != null) parts.push(`opacity:${el.opacity}`);
  const tf = [];
  if (el.anchor === 'center') tf.push('translate(-50%,-50%)');
  if (el.anchor === 'top-center') tf.push('translateX(-50%)');
  if (el.rotate) tf.push(`rotate(${el.rotate}deg)`);
  if (tf.length) parts.push(`transform:${tf.join(' ')}`);
  return `${parts.join(';')};${extra}${el.style || ''}`;
}

function font(el, d = {}) {
  const f = { ...d, ...el.font };
  const p = [];
  if (f.family) p.push(`font-family:${f.family.split(',').map((s) => (s.includes(' ') && !s.includes("'") ? `'${s.trim()}'` : s.trim())).join(',')}`);
  if (f.size) p.push(`font-size:${px(f.size)}`);
  if (f.weight) p.push(`font-weight:${f.weight}`);
  if (f.lineHeight) p.push(`line-height:${f.lineHeight}`);
  if (f.letterSpacing != null) p.push(`letter-spacing:${px(f.letterSpacing)}`);
  if (f.color) p.push(`color:${f.color}`);
  if (f.align) p.push(`text-align:${f.align}`);
  if (f.transform) p.push(`text-transform:${f.transform}`);
  if (f.stretch) p.push(`font-stretch:${f.stretch}`);
  return p.join(';') + ';';
}

// Plain text block.
// `fit: [x0,y0,x1,y1]` (+ optional fitMode) => data attributes picked up by lib/fit.mjs.
const fitAttr = (el) => (el.fit ? ` data-fit="${el.fit.join(',')}"${el.fitMode ? ` data-fit-mode="${el.fitMode}"` : ''}` : '');

function text(el) {
  return `<div class="el text ${el.className || ''}"${fitAttr(el)} style="${box(el, font(el, { lineHeight: 1.2 }) + `white-space:${el.w ? 'pre-wrap' : 'pre'};`)}">${inline(el.text)}</div>`;
}

// TikTok native "classic" caption with per-line rounded background (Aa highlight mode).
// Lines are centred on `cx`; box geometry is resolved in the page by tiktok-text.js so that
// joints between lines of different width get TikTok's concave fillets.
function tiktokText(el) {
  const f = { family: 'TikTok Sans', size: 64, weight: 600, color: '#000', ...el.font };
  const data = {
    lines: el.lines,
    cx: el.cx ?? 540,
    y: el.y,
    lineHeight: el.lineHeight ?? 96,
    padX: el.padX ?? 26,
    radius: el.radius ?? 20,
    bg: el.bg ?? '#fff',
    minWidths: el.minWidths || [],
    offsets: el.offsets || [],
    textOffsets: el.textOffsets || [],
    fitLines: el.fitLines || [], // per-line ink boxes for auto-fit
  };
  return `<div class="el tiktok-text" data-spec='${esc(JSON.stringify(data))}' style="position:absolute;left:0;top:0;width:100%;${font({ font: f })}${el.style || ''}"></div>`;
}

// Rounded label badge (e.g. black pill with yellow display type).
function badge(el) {
  const f = { family: el.fontFamily || 'Paytone One', size: 90, color: '#fdc904', lineHeight: 1, align: 'center', ...el.font };
  const pad = el.pad ?? [0, 0];
  return `<div class="el badge" style="${box(el, `background:${el.bg ?? '#000'};border-radius:${px(el.radius ?? 26)};display:flex;align-items:center;justify-content:center;padding:${px(pad[0])} ${px(pad[1])};box-sizing:border-box;`)}"><div${fitAttr(el)} style="${font({ font: f })}white-space:pre;${el.textStyle || ''}">${inline(el.text)}</div></div>`;
}

// Hand-drawn arrow: a stroked SVG path plus an open "V" arrowhead at the path end.
function arrow(el) {
  const c = el.color ?? '#f6c516';
  const sw = el.strokeWidth ?? 4;
  const head = el.head
    ? `<path d="${el.head}" fill="none" stroke="${c}" stroke-width="${el.headWidth ?? sw}" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  return `<svg class="el arrow" viewBox="${el.viewBox ?? `0 0 ${el.w} ${el.h}`}" style="${box(el, 'overflow:visible;')}"><path d="${el.path}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>${head}</svg>`;
}

// Image (photo, logo, sticker art). src is relative to the post directory.
function image(el, ctx) {
  const src = ctx.asset(el.src);
  if (!src) return el.fallback ? render(el.fallback, ctx) : '';
  return `<img class="el image"${fitAttr({ fitMode: 'box', ...el })} src="${src}" style="${box(el, `object-fit:${el.fit ?? 'cover'};object-position:${el.position ?? 'center'};`)}">`;
}

// Template tokens usable in any screen/html fragment (paths relative to the post dir):
//   {{img assets/x.png or screens/x.svg}}  real asset if present, else inline the fallback file
//   {{include screens/part.html}}           inline another fragment
export function expand(html, ctx) {
  return html
    .replace(/\{\{img\s+(\S+)(?:\s+or\s+(\S+))?\s*\}\}/g, (_, src, fb) => {
      const url = ctx.asset(src);
      if (url) return `<img src="${url}" style="width:100%;height:100%;object-fit:contain">`;
      if (fb) return expand(ctx.read(fb), ctx);
      ctx.warn(`missing asset ${src}`);
      return '';
    })
    .replace(/\{\{include\s+(\S+)\s*\}\}/g, (_, f) => expand(ctx.read(f), ctx));
}

// Device/screenshot frame: rounded rect with a solid border; the screen is an HTML fragment
// (file in the post dir) laid out at `screenWidth` px and scaled to fit the frame's inner width.
function phone(el, ctx) {
  const bw = el.border ?? 4;
  const inner = el.w - bw * 2;
  const sw = el.screenWidth ?? inner;
  const scale = inner / sw;
  const html = expand(el.screen ? ctx.read(el.screen) : el.html || '', ctx);
  // slideCoords: the fragment is laid out in slide pixels (positions read straight off the
  // reference); the frame just clips it.
  if (el.slideCoords) {
    return `<div class="el phone" style="${box(el, `border:${bw}px solid ${el.borderColor ?? '#000'};border-radius:${px(el.radius ?? 56)};overflow:hidden;background:${el.bg ?? '#fff'};box-sizing:border-box;`)}">
    <div class="screen" style="position:absolute;left:${-el.x - bw}px;top:${-el.y - bw}px;width:${ctx.size[0]}px;height:${ctx.size[1]}px;">${html}</div></div>`;
  }
  return `<div class="el phone" style="${box(el, `border:${bw}px solid ${el.borderColor ?? '#000'};border-radius:${px(el.radius ?? 56)};overflow:hidden;background:${el.bg ?? '#fff'};box-sizing:border-box;`)}">
    <div class="screen" style="position:absolute;left:0;top:0;width:${sw}px;height:${(el.h - bw * 2) / scale}px;transform:scale(${scale});transform-origin:0 0;">${html}</div></div>`;
}

// Raw HTML escape hatch (inline `html` or a `file`).
function html(el, ctx) {
  const body = expand(el.file ? ctx.read(el.file) : el.html, ctx);
  return `<div class="el html"${fitAttr({ fitMode: 'box', ...el })} style="${box(el)}">${body}</div>`;
}

const registry = { text, tiktokText, badge, arrow, image, phone, html };

export function render(el, ctx) {
  const fn = registry[el.type];
  if (!fn) throw new Error(`Unknown element type "${el.type}"`);
  return fn(el, ctx);
}

export const types = Object.keys(registry);
