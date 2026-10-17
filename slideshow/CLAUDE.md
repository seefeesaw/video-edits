# Slideshow pipeline — agent notes

Read README.md first. Deliverable: `posts/<name>/out/NN-*.png` (1080×1920), one per slide.

## One-shot recipe (TikTok photo post URL → exact replica)

1. **Review server.** Start the `slideshow-review` launch config (port 5179). It serves the review
   page, the pipelines, and `save.html` (writes captured JSON to disk).
2. **Capture** (built-in browser). Open the post, wait for the carousel to load, then run the
   contents of `tools/tiktok-capture.js` with the javascript tool after setting `NAME` on its first
   line. It saves `posts/<NAME>/capture.json` by navigating to save.html and back (TikTok's CSP
   blocks direct requests to localhost). Then `node new-post.mjs <NAME>`. Never automate around
   TikTok's slider CAPTCHA (headless Chrome gets one); capture only through the browser pane.
3. **Read the references** at `http://localhost:5179/review.html?post=<name>` — it works before
   anything is rendered. Console API (`window.review`):
   - `show(n, [x,y,w,h], zoom, 'ref', 20)` – reference crop with a labelled grid in slide px (read
     coordinates straight off the screenshot; zoom auto-fits the viewport).
   - `layout(n, region, {ink, gapX, gapY})` – every text line/blob: `[x0,y0,x1,y1] w×h colours`.
     Colour predicates as `ink`, e.g. purple `p=>p[2]>150&&p[1]<110&&p[2]-p[1]>80`, yellow
     `p=>p[0]>200&&p[1]>140&&p[2]<120`, dark `p=>Math.min(...p)<120`. Small `gapX` (6–12) when
     words touch other ink (dropdown chevrons, icons) — a merged box gets stretched by auto-fit.
   - `scan(n, 'row'|'col', at, [from,to], pred?)` – runs along a line: phone frames, card edges;
     faint borders: `p => Math.max(...p) < 236`.
   - `measure`, `measureAll`, `pixel`, `stats(n,[x,y,w,h])` (background tuning), `scores()`.
4. **Fonts.** Shortlist with `node fontmatch.mjs '[["TEXT",inkW,inkH],…]' --set display|text`, then
   decide by glyph shape: `await review.matchFont(n, inkBox, 'TEXT', [candidates], ink)` (IoU,
   higher wins). Known for Skolify carousels: Coiny (bubble titles), Figtree 700/400 (captions and
   body; the source is likely Canva Sans, which isn't on Google Fonts), Rammetto One (yellow-on-black
   badges), Unbounded 900 (wide SKOLIFY wordmark), TikTok Sans 600 (TikTok captions), Inter (app UI).
5. **Backgrounds.** `review.stats` on a plain patch; tune `paper`/`crumpled` until the mean is
   within ~3 and the std-dev within ~1.
6. **Author** `post.json`: every text line its own element with `fit` = its measured ink box; do not
   hand-tune sizes. App screens: reuse `@shared/skolify/*` (`welcome.html` with `screenWidth: 560`;
   other crops are usually a uniform scale — check one known box, e.g. the button, scales the same),
   otherwise write a fragment in slide coordinates (`"slideCoords": true`) with
   `@shared/skolify/kit.html`: `sk.header`, `sk.t(box, html, style, label, mode)`, `sk.input`,
   `sk.select`, `sk.pill`, `sk.card`, `sk.badge`, `sk.roundBtn`, `sk.closeX`, `sk.tick`, `sk.chat`.
   Text clipped by the phone frame: `sk.t(..., 'move')` with an explicit font size (its measured box
   is clipped too, so size-fitting would be wrong). Things on top of or outside the phone (floating
   cards, carousel arrows, chat bubble): a slide-level `{"type":"html","x":0,"y":0,"w":1080,"h":1920}`
   element; clip a group to a rounded panel with `sk.clip(rect, radius, html)`.
7. **Photos** that cannot be rebuilt: a `generate` job whose prompt states subject, wardrobe, props,
   setting and **composition as percentages of the frame**; `node generate.mjs posts/<name>`
   (`--more --only id` adds takes without overwriting). Pick: `node render.mjs posts/<name> --only N
   --variants`, then `await review.rankImages(N, [urls of out/candidates/*.png])` (lowest wins);
   rename the winner to the job's `out`, delete the rest; fine-tune with `photo.scale`/`offset`. No
   real institutions' crests or names in prompts. Decorative art (map watermarks, stickers):
   `"background": "transparent"`.
8. **Render & verify.** `node render.mjs posts/<name>` (~10s/slide), reload the review page, read
   `scores()` and the fit warnings. Targets: non-photo slides ≥95%, every fit ≤2px, no warnings.
   Then `show(n, null, 0.3)` side by side for missing/extra elements, colours, shapes.

## Rules

- Rebuild app UI as HTML, never paste screenshots of the reference. Third-party logos are assets
  with drawn fallbacks (`{{img … or …}}`).
- When a post needs something the pipeline can't express, extend lib/*.mjs, lib/tiktok-text.js,
  review.html or the shared kit, and document it in README.md.
- Commit the post (spec, screens, assets, out/*.png) together with pipeline changes.
