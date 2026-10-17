# Video pipeline — agent notes

Read README.md first. Deliverable: `videos/<name>/out/<name>.mp4` (1080×1920).

## One-shot recipe (YouTube Short URL → replica)

1. **Review server**: start launch config `slideshow-review` (port 5179). It serves the pipelines and
   `save.html`, which writes captured JSON to disk.
2. **Capture the original** in the in-app browser: open the Short, paste the contents of
   `tools/yt-capture.js` into the javascript tool, then run
   `ytcap.captureAndSave('video/videos/<name>/reference.json')`. It runs ~2–3 min in the background,
   then navigates to save.html and back; wait for the file on disk (`until [ -s … ]` in Bash).
   It records duration, exact cut times (first frame of each shot, from requestVideoFrameCallback)
   and a 9×16 colour grid every 0.25s. YouTube's CSP blocks fetch/forms to localhost, which is why
   it hands off by navigation. Re-paste the script after any navigation.
3. **Look at every shot**: paste the script again and use `ytcap.frames([t,…])` + screenshot (one
   frame per shot midpoint; ≤4 frames per call at this pane size) and `ytcap.box(t, pred, region)`
   for caption ink boxes. Write down for each shot: action, hands, props, camera distance/angle,
   motion, and **composition as percentages of the frame** (where the main object, hands, screen,
   background elements sit, and how big the main object is).
4. **Write `video.json`**: shot `start`/`end` = reference cuts rounded to 1/30s; `style` holds
   everything constant (set, props, lighting, grade, *and framing distance*); each prompt holds the
   shot's action + composition. Overlays with `fit` boxes. `takes: 2`. Never recreate copyrighted
   footage on screens, songs, or brand logos/packaging: use generic stand-ins and say so in `notes`.
5. **Product**: if the video features a real product, it must be that exact product. Download its
   photos from the brand's store page (Shopify stores expose `/products/<handle>.json` with image
   URLs) into `assets/product/`, set `product` (refs + a precise description: shape, colour,
   lettering, handle, accessories), give every shot `keyframe: {prompt: <first frame composition>}`
   and keep the shot `prompt` for the action only. `node keyframes.mjs videos/<name>`; look at the
   keyframes before spending Sora time. Sora rejects input frames that show people or faces
   (`moderation_blocked: people-in-user-uploads`), including faces on screens: keyframes may show
   hands only, and screens show scenery/abstract light/title cards (keyframes.mjs asks for this).
   **Generate**: `node sora.mjs videos/<name>` (~2 jobs at once, ~60–100s each).
6. **Pick, frame, grade, build** (all free, no regeneration):
   `node compare.mjs videos/<name> --pick` → `--framing` → `--apply` → `node build.mjs videos/<name>`.
7. **Score**: `node compare.mjs videos/<name>` (per-shot comp, brightness/warmth deltas, cut lists),
   plus a visual check: ffmpeg contact strip of your shot midpoints next to `ytcap.frames` of the
   same times. If a shot's composition is still off (object too big/small, wrong side, missing
   element), fix its prompt and `node sora.mjs videos/<name> --more --only sN`, then step 6 again.
8. Targets: cuts within 1 frame, caption fit ≤2px, every shot's subject/action/framing matching the
   side-by-side, mean comp ≥ 85. Pixel-perfect is impossible for regenerated footage.
