# Slideshow pipeline — agent notes

Read README.md first. Deliverable: `posts/<name>/out/NN-*.png` (1080×1920), one per slide.

## One-shot recipe (TikTok photo post URL → exact replica)

1. **Capture** (built-in browser). Open the post URL, wait for it to load, then run the contents of
   `tools/tiktok-capture.js` with the browser javascript tool. Save the JSON it returns to a scratch
   file and run `node new-post.mjs <name> <file>`. Headless Chrome gets TikTok's slider CAPTCHA —
   never automate around it; capture through the browser pane only.
2. **Review server.** Start the `slideshow-review` launch config (port 5179) and open
   `http://localhost:5179/review.html?post=<name>`. The CDN images load with CORS, so the page can
   measure the originals without saving them. Console API (all on `window.review`):
   - `show(n, [x,y,w,h], zoom, 'ref')` – crop of reference slide n for a screenshot (read content).
   - `layout(n, region, {ink, gapX, gapY})` – every text line/blob: `[x0,y0,x1,y1] w×h colours`.
     Use colour predicates as `ink` to isolate e.g. purple titles `p=>p[2]>150&&p[1]<110&&p[2]-p[1]>80`,
     yellow `p=>p[0]>200&&p[1]>140&&p[2]<120`, dark text `p=>Math.min(...p)<120`. Use small `gapX`
     (6–12) when words touch other ink (dropdown chevrons, icons).
   - `measure(n, pred, region)`, `measureAll([...])`, `pixel(n,x,y)`, `stats(n,[x,y,w,h])`, `scores()`.
3. **Fonts.** Feed measured `[text, inkW, inkH]` samples to `node fontmatch.mjs … --set display` /
   `--set text`; aspect ties between body fonts are common, so confirm the top 3–5 with a specimen
   (`tools/shot.mjs`) against a zoomed reference crop (single- vs double-storey g/a, t, y).
   Known: Skolify carousels use Coiny (bubble titles), Rammetto One (yellow-on-black badges),
   Open Sans 700 (captions), TikTok Sans 600 (TikTok text), Inter (app UI).
4. **Backgrounds.** `review.stats` on a plain patch; tune `paper`/`crumpled` until mean is within
   ~3 and std-dev within ~1.
5. **Author** `post.json`. Every text line is its own element with `fit` = its measured ink box —
   do not hand-tune sizes. App screens: reuse `@shared/skolify/*` when the screen already exists
   (`welcome.html` with `screenWidth: 560`; a different crop is usually a uniform scale), otherwise
   write a fragment in slide coordinates (`"slideCoords": true`) using `sk.header/sk.t/sk.chat` from
   `@shared/skolify/kit.html`, positioning boxes from `layout` dumps and frame/border scans
   (scan a row/column for dark border pixels to get exact card and frame edges).
6. **Photos** that cannot be rebuilt: add a `generate` job whose prompt states the subject, wardrobe,
   props, setting **and composition as percentages of the frame** (where the head, hands and key
   props sit), run `node generate.mjs posts/<name>`, pick the variant closest to the reference
   layout; fine-tune with `photo.scale`/`offset`.
7. **Render & verify.** `node render.mjs posts/<name>`, reload the review page, read `scores()` and
   the fit warnings. Targets: non-photo slides ≥95% similarity, every fit ≤2px, no warnings. Then
   look at each slide side by side (`show(n, null, 0.3)`) for missing/extra elements, wrong colours
   or shapes, and fix only those.

## Rules

- Rebuild app UI as HTML, never paste screenshots of the reference. Third-party logos are assets
  with drawn fallbacks (`{{img … or …}}`).
- When a post needs something the pipeline can't express, extend lib/*.mjs, lib/tiktok-text.js,
  review.html or the shared kit, and document it in README.md.
- Commit the post (spec, screens, assets, out/*.png) together with pipeline changes.
