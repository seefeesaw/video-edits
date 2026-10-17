# Video pipeline — agent notes

Read README.md first. Deliverable: `videos/<name>/out/<name>.mp4` (1080×1920). Paths: commands run
from `video/`; the capture writes `video/videos/<name>/…` (relative to the repo root). On Windows,
`node -e` needs Windows-style paths (`C:/dev/…`), not `/c/dev/…`.

## One-shot recipe (YouTube Short URL → replica)

1. **Review server**: start launch config `slideshow-review` (port 5179). It serves the pipelines and
   `save.html`, which writes captured JSON to disk.
2. **Capture the original** in the in-app browser: open the Short, then paste the WHOLE of
   `tools/yt-capture.js` into the javascript tool with `NAME` on its first line set to `<name>`
   (the javascript tool cannot read files: Read the file, edit NAME in your paste). It runs ~1–2 min
   in the page and then navigates to save.html and back. Wait for the file:
   `until [ -s videos/<name>/reference.json ]; do sleep 5; done` (Bash, in the background). Paste
   only once per tab (a second concurrent run is refused). Check `reference.json`: `cuts`,
   `sourceFps`, `shotMidpoints`.
3. **Look at every shot**: `node refsheet.mjs videos/<name>` → Read `out/ref-shots.jpg` (one frame
   per shot midpoint) and `out/ref-every.jpg` (every 0.5s, shows motion within shots). For each
   shot write down: action, hands, props, camera distance/angle, motion, and **composition as
   percentages of the frame** (where the main object, hands, screen, background sit, and how big the
   main object is — measure it, e.g. "mug 45% of frame width"). Caption ink boxes:
   re-paste the script with `NAME = null` and use `ytcap.box(t, pred, [x0,y0,x1,y1])` (1080×1920
   coordinates). Captions with a dark outline/shadow: the ink box includes it, so fit the white
   glyphs only (pred on bright pixels) and add the shadow in CSS.
4. **Write `video.json`**: `fps` = 60 if `sourceFps` is 60 (cuts fall between 30fps frames),
   else 30; shot `start`/`end` = the reference cuts exactly. A soft jump cut inside one setup is
   still a shot: reuse the previous shot's clip with a later `from` and a different `zoom`/`pan`
   (`"framing": "manual"`). `style` holds only what is constant in EVERY shot (set, lighting, grade,
   framing distance) — per-shot items (a board of snacks, a torch, a hand) go in that shot's prompts,
   or they leak into every keyframe. Overlays with `fit` boxes. `takes: 2`. Never recreate
   copyrighted footage on screens, songs, or brand logos/packaging: use generic stand-ins and say so
   in `notes`.
5. **Product**: if the video features a real product, it must be that exact product. Download its
   photos from the brand's store page (Shopify: `/products/<handle>.json`; each image's `alt` or
   `variant_ids` tells which colour variant it shows) into `assets/product/`, set `product` (refs +
   a precise description: shape, colour, lettering, handle, accessories), give every shot
   `keyframe: {prompt: <first frame composition>}` and keep the shot `prompt` for the action only.
   The keyframe is the clip's FIRST frame: for "X enters the frame" shots, describe the frame with X
   in place, prompt X leaving, and set `"reverse": true`. `node keyframes.mjs videos/<name>`; Read
   the keyframes and compare them with ref-shots.jpg (object size and position!) before spending Sora
   time — regenerate a keyframe with `--only sN` rather than fixing it later with zoom. Sora rejects
   input frames showing people or faces (`moderation_blocked: people-in-user-uploads`), including
   on screens: hands only; screens show scenery/abstract light/title cards.
   **Generate**: `node sora.mjs videos/<name>` (~2 jobs at once, ~60–100s each; background it).
6. **Pick, frame, grade, build** (free, no build needed for the first three):
   `node compare.mjs videos/<name> --pick` → `--framing` → `--apply` → `node build.mjs videos/<name>`.
   `--framing` caps zoom at 1.25 and keeps a crop only for a ≥0.5 point gain; check it didn't crop
   away a set piece (set `"framing": "manual"` with your own zoom/pan if it did). Re-run `--apply`
   whenever clip or framing changes (build.mjs ignores a grade fitted on another clip).
7. **Score**: `node compare.mjs videos/<name>` (per-shot comp, brightness/warmth, cuts; it lists
   missing cuts) and `node refsheet.mjs videos/<name> --mine` → Read `out/mine-shots.jpg` next to
   `out/ref-shots.jpg`. If a shot's composition is still off (object too big/small, wrong side,
   missing element), fix its keyframe/prompt and `node sora.mjs videos/<name> --more --only sN`
   (or regenerate the keyframe and `--force --only sN`), then step 6 again.
8. Targets: every reference cut matched (0 missing), caption fit ≤2px, every shot's
   subject/action/framing matching the side-by-side, mean comp ≥ 85. Pixel-perfect is impossible
   for regenerated footage.
