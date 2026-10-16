import { expand } from './elements.mjs';

// Slide backgrounds. Returns CSS/HTML for the full-bleed layer under all elements.

// Fine grain "paper" texture used by most TikTok carousel templates: flat colour + SVG noise.
function paper(bg) {
  const color = bg.color ?? '#e6e7e2';
  const amount = bg.grain ?? 0.07; // opacity of the noise layer
  const freq = bg.frequency ?? 0.85;
  const noise = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${amount * 9} -${amount * 4}'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return `<div class="bg" style="position:absolute;inset:0;background-color:${color};background-image:url(&quot;data:image/svg+xml;utf8,${noise.replace(/"/g, "'")}&quot;);background-size:300px 300px;"></div>`;
}

// Embossed / crumpled paper: fractal noise used as a height map and lit with feDiffuseLighting,
// blended over a base colour. Tune `relief` (strength) and `frequency` (size of the creases) to
// match a reference patch's std-dev and grain (review.stats).
function crumpled(bg) {
  const color = bg.color ?? '#f5f5f7';
  const freq = bg.frequency ?? 0.035;
  const relief = bg.relief ?? 0.14; // opacity of the lighting layer
  const scale = bg.surfaceScale ?? 2.2;
  const seed = bg.seed ?? 7;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1920'><filter id='c' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='5' seed='${seed}' result='t'/><feDiffuseLighting in='t' lighting-color='white' surfaceScale='${scale}'><feDistantLight azimuth='225' elevation='55'/></feDiffuseLighting></filter><rect width='100%' height='100%' filter='url(%23c)'/></svg>`;
  return `<div class="bg" style="position:absolute;inset:0;background:${color};"></div>
<div class="bg" style="position:absolute;inset:0;opacity:${relief};mix-blend-mode:multiply;background-image:url(&quot;data:image/svg+xml;utf8,${svg.replace(/"/g, "'")}&quot;);background-size:1080px 1920px;"></div>`;
}

function color(bg) {
  return `<div class="bg" style="position:absolute;inset:0;background:${bg.color};"></div>`;
}

// Full-bleed photo. If the file is missing, falls back to `bg.fallback` (another background spec).
function photo(bg, ctx) {
  const src = ctx.asset(bg.src);
  if (!src) {
    ctx.warn(`photo background "${bg.src}" not found${bg.fallback ? ', using fallback' : ''}`);
    return bg.fallback ? renderBackground(bg.fallback, ctx) : color({ color: '#333' });
  }
  // scale (>=1) and offset [dx, dy] (slide px) reframe a photo whose subject sits differently from
  // the reference; keep scale large enough that the moved image still covers the slide.
  const [dx, dy] = bg.offset || [0, 0];
  const tf = bg.scale || dx || dy ? `transform:translate(${dx}px,${dy}px) scale(${bg.scale ?? 1});transform-origin:center;` : '';
  return `<img class="bg" src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${bg.position ?? 'center'};${tf}">`;
}

// HTML background (e.g. a hand-built scene) from a file in the post dir.
function htmlBg(bg, ctx) {
  return `<div class="bg" style="position:absolute;inset:0;">${expand(ctx.read(bg.file), ctx)}</div>`;
}

const registry = { paper, crumpled, color, photo, html: htmlBg };

export function renderBackground(bg, ctx) {
  if (!bg) return '';
  const fn = registry[bg.type];
  if (!fn) throw new Error(`Unknown background type "${bg.type}"`);
  return fn(bg, ctx);
}
