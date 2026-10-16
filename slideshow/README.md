# Slideshow pipeline

Builds TikTok photo-mode carousels (1080×1920 PNG slides) from a declarative spec, and checks them
pixel-for-pixel against a reference post.

```
posts/<name>/post.json  ──render.mjs──▶  posts/<name>/out/NN-<slide>.png
        │                                       │
        └── references (URLs or reference/*.jpg) ┴──review.html──▶ similarity %, diff, box deltas
```

## Commands

```bash
npm install
node render.mjs posts/skolify-apply-6-unis            # all slides
node render.mjs posts/skolify-apply-6-unis --only 2,4 # some slides
node render.mjs posts/skolify-apply-6-unis --html     # keep generated HTML for debugging
node serve.mjs                                        # review UI on http://localhost:5179/review.html?post=<name>
node generate.mjs posts/skolify-apply-6-unis          # create missing photo assets with gpt-image-2
```

`generate.mjs` calls the `thuma-image` deployment (gpt-image-2) on our Azure AI Foundry resource
(`foundry.json`; override with `AZURE_FOUNDRY_IMAGE_ENDPOINT` / `AZURE_FOUNDRY_IMAGE_DEPLOYMENT` /
`AZURE_FOUNDRY_IMAGE_API_VERSION`). Auth is your `az login` session, no keys. Each `generate` job in
post.json writes `out` (extra `variants` land beside it as `.v2`, `.v3`…), and existing files are
skipped unless `--force`.

Rendering uses the locally installed Chrome (`CHROME_PATH` overrides) through `puppeteer-core`, and
Google Fonts are fetched at render time.

## post.json

```jsonc
{
  "title": "…", "caption": "…",
  "size": [1080, 1920],
  "fonts": ["Inter:wght@400;700", "Rammetto One"],   // Google Fonts families
  "css": ["screens/screens.css"],                     // extra stylesheets (post-relative)
  "references": ["https://…/slide1.jpeg", "…"],       // optional; else posts/<name>/reference/*
  "generate": [{ "id": "hook-photo", "out": "assets/hook-photo.png", "prompt": "…",
                 "size": "1024x1536", "quality": "high", "variants": 2 }],  // gpt-image-2 jobs
  "background": { "type": "paper", "color": "#e8e9e4", "grain": 0.02 },  // default for slides
  "slides": [
    { "name": "hook", "background": { … }, "elements": [ … ] }
  ]
}
```

All coordinates are slide pixels. Every element accepts `x, y, w, h, z, rotate, opacity, anchor`
(`center` | `top-center`), `style` (raw CSS) and `className`.

### Backgrounds

| type    | keys |
|---------|------|
| `paper` | `color`, `grain` (noise opacity, ~0.02 subtle), `frequency` |
| `color` | `color` |
| `photo` | `src` (post-relative), `position`, `fallback` (another background used when the file is missing) |
| `html`  | `file` — a hand-built scene |

### Elements

| type         | purpose | keys |
|--------------|---------|------|
| `tiktokText` | TikTok "classic" caption with per-line white bubbles and concave joints | `lines[]`, `cx`, `y`, `lineHeight`, `padX`, `radius`, `bg`, `minWidths[]`, `offsets[]` (box dx), `textOffsets[]` ([dx,dy] per line), `font` |
| `badge`      | rounded label (e.g. black pill with yellow display type) | `text`, `bg`, `radius`, `fontFamily`, `font`, `textStyle`, `pad` |
| `text`       | plain text block | `text`, `font` |
| `arrow`      | hand-drawn SVG arrow | `path`, `head`, `color`, `strokeWidth`, `viewBox` |
| `image`      | photo/logo/sticker | `src`, `fit`, `position`, `fallback` (element) |
| `phone`      | screenshot frame; content is an HTML fragment rebuilt from the app UI | `screen` (file), `border`, `borderColor`, `radius`, `bg`, `screenWidth` |
| `html`       | escape hatch: inline `html` or a `file` | — |

`font` is `{ family, size, weight, lineHeight, letterSpacing, color, align, transform }`.

Text supports light markup: `**bold**`, `__underline__`, `[color=#hex]…[/color]`,
`[style=css]…[/style]` (e.g. per-line letter-spacing), and `\n` line breaks.

HTML fragments (screens, html elements/backgrounds) support two tokens, paths relative to the post:

- `{{img assets/logos/uj.png or screens/logos/uj.svg}}` — real asset if the file exists, otherwise
  inline the drawn fallback. Drop real photos/logos in `assets/` and re-render; nothing else changes.
- `{{include screens/part.html}}`

Fragments may contain `<script>` to generate repetitive markup (rows, confetti, line art); it runs
before the screenshot.

## Recreating an existing post (the replica loop)

1. **Capture.** Open the post, list its slides, put the slide image URLs in `references`
   (or save the slides into `posts/<name>/reference/` as `01.jpg`, `02.jpg`, …). Signed TikTok CDN
   URLs expire after a few days.
2. **Measure.** Read element boxes off the reference: badge rects, text ink boxes, phone frame
   borders, colours. In the review page the console helpers return reference and render boxes side
   by side:
   ```js
   review.measure(3, 'yellow', [200, 260, 880, 410])   // {ref:[x0,y0,x1,y1], mine:[…], delta:[…]}
   review.measureAll([[3, 'title', 'dark', [300, 640, 640, 700]], …])
   review.pixel(2, 30, 30)                              // {ref:'#e8e9e4', mine:'#…'}
   ```
   Predicates: `dark, yellow, blue, gray, purple, green, white`, or pass a function `p => …`.
3. **Author.** Write `post.json` plus one HTML fragment per app screen in `screens/`.
   Lay fragments out in absolute local coordinates (slide px minus the phone's inner origin).
4. **Render → review → adjust**, until each element's delta is within ~2px:
   - height mismatch → change `font.size` (`size × refH / mineH`);
   - width mismatch at the right height → change `letterSpacing` (`Δw / glyph count`);
   - offset → move `x/y` (or `textOffsets` / `textStyle: transform:translateY(…)`);
   - background → match mean and std-dev of a plain patch (`color`, `grain`).
   The header of the review page shows a per-slide similarity score; `review.only = N`,
   `review.crop = [x, y, w, h]`, `review.zoom`, and the onion/diff/blink modes help inspect.
5. **Fonts.** If glyph shapes differ, compare candidate Google Fonts by ink aspect ratio
   (width ÷ height of the same string) and pick the closest, then size/space as above.
6. **Photos** that cannot be rebuilt in HTML: describe the shot in a `generate` job (subject,
   wardrobe, props, setting, and where things sit in the frame as % of height so overlays land
   on the same spots), run `generate.mjs`, pick the best variant, and reference it from a `photo`
   background. Third-party logos stay `{{img}}` assets with a drawn fallback.

## Example: `posts/skolify-apply-6-unis`

Replica of a 5-slide university-application carousel. Slides 2–5 (paper background, badges, rebuilt
app screens) score ~97% pixel similarity against the originals with every measured element within
0–3px; the remaining difference is paper grain and the drawn university logos. Slide 1's caption,
flag and "6" sticker match within 2px over a gpt-image-2 photo generated to the original's
composition (~81% similarity; a new photo cannot match pixel-for-pixel). Real logos go in `assets/logos/{uj,up,tut,nwu,wits,vut}.png`.
