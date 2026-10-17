# Slideshow pipeline

Builds TikTok photo-mode carousels (1080×1920 PNG slides) from a declarative spec and checks them
pixel-for-pixel against the original post.

```
TikTok post ──tools/tiktok-capture.js──▶ capture.json ──new-post.mjs──▶ posts/<name>/post.json
                                                                         │  + screens/*.html
posts/<name>/post.json ──render.mjs (auto-fit)──▶ posts/<name>/out/NN-<slide>.png
references (CDN URLs or reference/*.jpg) ──review.html──▶ similarity %, layout dumps, box deltas
```

## Commands

```bash
npm install
node new-post.mjs <name> capture.json                 # scaffold a post from a capture
node render.mjs posts/<name>                          # all slides (clears old outputs)
node render.mjs posts/<name> --only 2,4               # some slides
node render.mjs posts/<name> --html                   # keep generated HTML for debugging
node render.mjs posts/<name> --only 1 --variants      # render every photo take to out/candidates/ for review.rankImages()
node serve.mjs                                        # review UI: http://localhost:5179/review.html?post=<name>
node generate.mjs posts/<name> [--only id] [--force]  # create photo assets with gpt-image-2
node fontmatch.mjs '[["TEXT",inkW,inkH],…]' --set display|text   # rank Google Fonts by ink aspect
node tools/shot.mjs page.html out.png [width]         # screenshot any HTML (font specimens etc.)
```

Rendering uses the locally installed Chrome (`CHROME_PATH` overrides) via `puppeteer-core`; Google
Fonts are fetched at render time.

`generate.mjs` calls the `thuma-image` deployment (gpt-image-2) on our Azure AI Foundry resource
(`foundry.json`; override with `AZURE_FOUNDRY_IMAGE_ENDPOINT` / `AZURE_FOUNDRY_IMAGE_DEPLOYMENT` /
`AZURE_FOUNDRY_IMAGE_API_VERSION`). Auth is your `az login` session, no keys. Each `generate` job
writes `out` (extra `variants` land beside it as `.v2`, `.v3`…); existing files are skipped unless
`--force`. `"background": "transparent"` gives cut-out art (stickers, map watermarks) to place with
low `opacity`.

## post.json

```jsonc
{
  "title": "…", "caption": "…", "source": "https://www.tiktok.com/@…/photo/…",
  "references": ["https://…/slide1.jpeg", "…"],       // or posts/<name>/reference/*
  "generate": [{ "id": "hook-photo", "out": "assets/hook-photo.png", "prompt": "…",
                 "size": "1024x1536", "quality": "high", "variants": 2 }],
  "size": [1080, 1920],
  "fonts": ["Coiny", "Open Sans:wght@400;700"],       // Google Fonts families
  "css": ["@shared/skolify/app.css", "screens/screens.css"],
  "background": { "type": "crumpled", "color": "#fdfdff", "relief": 0.37, "surfaceScale": 3, "frequency": 0.08 },
  "slides": [{ "name": "hook", "background": { … }, "elements": [ … ] }]
}
```

Paths are relative to the post directory; `@shared/…` resolves to `slideshow/shared/…` (reusable
app screens, styles, the Skolify UI kit). All coordinates are slide pixels. Every element accepts
`x, y, w, h, z, rotate, opacity, anchor` (`center` | `top-center`), `style` and `className`.

### Auto-fit (the key to exact replicas)

Give an element the **ink box** it has on the reference, `fit: [x0, y0, x1, y1]`, and the renderer
makes the render match it: each target is isolated, screenshotted with a transparent background,
and its alpha bounding box is driven onto the box (two passes, typically ≤1px).

| `fitMode` | adjusts |
|-----------|---------|
| `text` (default for text/badge) | font-size from box height, letter-spacing from box width, then position |
| `box` (default for image/html)  | uniform scale from height, then position |
| `stretch` | x/y scale independently, then position (stickers, odd aspect art) |
| `move` | position only |

Inside HTML fragments use `data-fit="x0,y0,x1,y1"` (+ `data-fit-mode`, `data-fit-label`) on any
element. `tiktokText` takes `fitLines: [[box], …]` per caption line. Fit results print per slide;
anything off by more than 3px is listed as a warning.

Measure ink boxes with the same notion of ink as the fitter: tight boxes around the visible glyphs,
including descenders. Split a line into separate boxes only where the reference does (e.g. a label
touching a dropdown chevron must be measured without the chevron).

### Backgrounds

| type       | keys |
|------------|------|
| `paper`    | `color`, `grain` (noise opacity, ~0.02 subtle), `frequency` |
| `crumpled` | `color`, `relief` (0.3–0.5), `surfaceScale`, `frequency` (crease size), `seed` |
| `color`    | `color` |
| `photo`    | `src`, `position`, `scale`, `offset: [dx,dy]`, `fallback` (background used if the file is missing) |
| `html`     | `file` — a hand-built scene |

Match backgrounds by statistics, not by eye: `review.stats(slide, [x,y,w,h])` on a plain patch gives
mean colour, std-dev and grain (lag-4 autocorrelation) for reference and render.

### Elements

| type         | purpose | keys |
|--------------|---------|------|
| `text`       | text block (no `w` ⇒ single line, no wrapping) | `text`, `font`, `fit` |
| `tiktokText` | TikTok "classic" caption with per-line white bubbles and concave joints | `lines[]`, `cx`, `y`, `lineHeight`, `lineHeights[]` (per line), `padX`, `radius`, `bg`, `minWidths[]`, `offsets[]`, `textOffsets[]`, `fitLines[]`, `font` |
| `badge`      | rounded label (black pill + display type) | `text`, `bg`, `radius`, `fontFamily`, `font`, `textStyle`, `pad`, `fit` |
| `arrow`      | hand-drawn SVG arrow | `path`, `head`, `color`, `strokeWidth`, `headWidth`, `viewBox` |
| `image`      | photo/logo/sticker | `src`, `objectFit` (cover/contain), `position`, `fit` (auto-fit box), `flip`, `fallback` |
| `phone`      | screenshot frame around an HTML screen | `screen`, `border`, `borderColor`, `radius`, `bg`, `screenWidth` (scale a fixed-width screen), `slideCoords` (screen authored in slide px) |
| `html`       | inline `html` or a `file` | `fit`, `fitMode`, `flip` (mirror without breaking auto-fit) |

`font` is `{ family, size, weight, lineHeight, letterSpacing, color, align, transform }`. Text markup:
`**bold**`, `__underline__`, `[color=#hex]…[/color]`, `[style=css]…[/style]`, `\n`.

HTML fragments support `{{img assets/x.png or screens/x.svg}}` (real asset if present, else the
drawn fallback) and `{{include path}}`, and may contain `<script>` (runs before fitting/screenshot).

### Skolify UI kit (`shared/skolify/`)

`app.css` (app styles), `welcome.html` (sign-up screen, 560px wide — use with `screenWidth: 560`),
and `kit.html`, which defines helpers for screens written in slide coordinates:

```html
{{include @shared/skolify/kit.html}}
<div id="s"></div>
<script>
  let h = sk.header({ box: [x0,y0,x1,y1], brand: [inkbox of "Skolify"], logo: [inkbox], me: [cx,cy,r] });
  h += sk.t([x0,y0,x1,y1], 'Text with <b>html</b>', 'font:700 20px Inter;color:#111');  // auto-fitted
  h += sk.chat(cx, cy, r);                                                              // black chat bubble
  document.getElementById('s').outerHTML = h;
</script>
```

## Recreating a post (one shot)

Follow `CLAUDE.md` → "One-shot recipe". In short: capture → scaffold → `review.layout` dump of every
slide → pick fonts with `fontmatch` → write `post.json` and screens with **every text element
fitted to its measured ink box** → generate photos → render → check the review page scores and fit
warnings → fix only what the numbers flag.

## Examples

- `posts/skolify-apply-6-unis` — 5 slides, hand-tuned before auto-fit existed (~97% similarity on
  slides 2–5).
- `posts/skolify-apply-8-unis` — 7 slides built with auto-fit: crumpled paper, Coiny titles, Open
  Sans body, five rebuilt app screens; 95–97% similarity on slides 2–7, every fitted element within
  2px. Slide 1 is a generated photo (cannot match pixel-for-pixel) under an exact caption.
