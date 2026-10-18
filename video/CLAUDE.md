# Video pipeline — agent notes

Read README.md first. Deliverable: `videos/<name>/out/<name>.mp4` (1080×1920). Paths: commands run
from `video/`; the capture writes `video/videos/<name>/…` (relative to the repo root). On Windows,
`node -e` needs Windows-style paths (`C:/dev/…`), not `/c/dev/…`.

## One-shot recipe (YouTube Short URL → replica)

1. **Review server**: start launch config `slideshow-review` (port 5179). It serves the pipelines and
   `save.html`, which writes captured JSON to disk.
2. **Capture the original** in the in-app browser: open the Short, then paste the WHOLE of
   `tools/yt-capture.js` into the javascript tool with `NAME` on its first line set to `<name>`
   (the javascript tool cannot read files: Read the file, edit NAME in your paste). It runs ~2 min
   per 10 s of video (~5 min for a 30 s Short; a seek every ~150ms; the script returns at once and keeps running, so don't wait
   inside the 45s javascript tool) and then navigates to save.html and back. Delete any old
   `reference.json` first, then wait for the file:
   `until [ -s videos/<name>/reference.json ]; do sleep 5; done` (Bash, in the background). Paste
   only once per tab (a second concurrent run is refused). If nothing appears after ~3x that, read
   `window.__ytcapError` in the tab (it fails loudly when the player won't stay paused or seeks
   don't land; reload the Short and paste again). Check `reference.json`: `cuts`, `sourceFps`,
   `shotMidpoints`. The save reloads the Short, so `ytcap` is gone afterwards.
3. **Look at every shot**: `node refsheet.mjs videos/<name>` → Read `out/ref-shots.jpg` (one frame
   per shot midpoint) and `out/ref-every.jpg` (every 0.5s, shows motion within shots); it also
   prints the `fps` the build needs. For each
   shot write down: action, hands, props, camera distance/angle, motion, and **composition as
   percentages of the frame** (where the main object, hands, screen, background sit, and how big the
   main object is — measure it, e.g. "mug 45% of frame width"). Caption ink boxes:
   re-paste the script with `NAME = null` and use `ytcap.box(t, pred, [x0,y0,x1,y1])` (1080×1920
   coordinates). Captions with a dark outline/shadow: the ink box includes it, so fit the white
   glyphs only (pred on bright pixels) and add the shadow in CSS.
4. **Write `video.json`**: `fps` = what refsheet.mjs prints (60 whenever cuts fall between 30fps
   frames, even for a 30fps source); shot `start`/`end` = the reference cuts exactly. A soft jump cut inside one setup is
   still a shot: `"takes": 0, "clip": "clips/<previous shot's take>.mp4"`, a later `from` and a
   different `zoom`/`pan` (`"framing": "manual"`; `pan` +y shows more of the bottom, i.e. content
   moves up). `style` holds only what is constant in EVERY shot (set, lighting, grade,
   framing distance) — per-shot items (a board of snacks, a torch, a hand) go in that shot's prompts,
   or they leak into every keyframe. Overlays with `fit` boxes. `takes: 2`. Never recreate
   copyrighted footage on screens, songs, or brand logos/packaging: use generic stand-ins and say so
   in `notes`. **People on camera** (faces are the subject, e.g. a creator talking or reacting): Sora
   rejects input images with faces (even generated ones), so those shots are never keyframed.
   **Continuity bible first** (README "Continuity bible"): list every prop that must not change with
   exact words in `bible.props`, each set with its props and their first-frame layout in
   `bible.sets` (state the main object's size emphatically), run `node bible.mjs`, and Read
   `bible/bible-sheet.jpg` before any Sora time. Performances then use `"startFrom": "set"` and their
   prompt starts with the person stepping in (0-1 s). Pick every take with
   `node continuity.mjs videos/<name> --takes <id> --apply` (then confirm the action by eye).
   Every separate generation (text-to-video OR remix of an anchor) can change the face, so a person
   who appears in more than one shot gets **performances** (README "Performances"): one 12 s take
   per person with that person's actions in order, cut into the shots (`"takes": 0`, `"clip"`,
   `"from"`), plus one `remixOf` performance for the rest. Pick the performance take by face AND
   action with `refsheet.mjs --takes <perf>`. Library characters (`"characters"`, per-shot remixes of
   an anchor) keep clothes/place but still drift the face per shot: use them to start a series'
   next video from the same person, not as the only consistency measure. Recreate people as new generic people, never the original creators. A
   caption that recurs in several windows: define it once in `captions` and use `"elements": "@name"`.
   A **series** reuses its library characters across videos (README "Characters"): check
   `node character.mjs status` first and `refresh` anchors with under 6 h left (Sora deletes them
   after 24 h).
5. **Product**: if the video features a real product, it must be that exact product. Download its
   photos from the brand's store page (Shopify: `/products/<handle>.json`; each image's `alt` or
   `variant_ids` tells which colour variant it shows) into `assets/product/`, set `product` (refs +
   a precise description: shape, colour, lettering, handle, accessories), give every shot
   `keyframe: {prompt: <first frame composition>}` and keep the shot `prompt` for the action only.
   With a bible, make the product a bible prop with `"image": "assets/product/<photo>"` (the store
   photo itself is the prop reference) and give every shot `"set"`: keyframes.mjs then edits from
   the product photos + the set's bible frame + its prop images, so every keyframe shows the same
   room, the same props and the exact product (give shot-specific props via `keyframe.refs`, e.g.
   `["bible/prop-torch.png"]`). Pick the variant's photos by the image's `variant_ids`/`alt`; crop
   multi-product lifestyle photos to the right variant.
   The keyframe is the clip's FIRST frame: for "X enters the frame" shots, describe the frame with X
   in place, prompt X leaving, and set `"reverse": true`. `node keyframes.mjs videos/<name>`; Read
   the `assets/keyframes/<id>.720x1280.png` files (what Sora gets: the model's 2:3 image minus 8% on
   each side) and compare them with ref-shots.jpg (object size and position!) before spending Sora
   time — regenerate a keyframe with `--force --only sN` rather than fixing it later with zoom.
   gpt-image-2 tends to draw the main object smaller than asked: state its size emphatically
   ("BIG: more than half the frame width"). Sora rejects
   input frames showing people or faces (`moderation_blocked: people-in-user-uploads`), including
   on screens: hands only; screens show scenery/abstract light/title cards.
   **Generate**: `node sora.mjs videos/<name>` (up to 2 jobs at once, often ~1 when anything else
   uses the deployment; ~60–120s each, so ~30 min for 20 takes; background it). `--more N --only sN`
   adds N takes.
6. **Pick, frame, grade, build** (free, no build needed for the first three):
   `node compare.mjs videos/<name> --pick` → `--framing` → `--apply` → `node build.mjs videos/<name>`.
   `--pick` scores colour layout only: for every shot whose ACTION matters, run `node refsheet.mjs
   videos/<name> --takes sN` and check the take does the right thing at the right moment (order of
   actions, the moment at the shot's midpoint); override with `"clip"` + `"pick": "manual"` and move
   `from` to retime. `--framing` caps zoom at 1.25 and keeps a crop only for a ≥1 point gain; check it didn't crop
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
