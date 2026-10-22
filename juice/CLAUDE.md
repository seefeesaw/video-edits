# Juice pipeline — agent notes

A copy of the mug pipeline (`../video`) for juice product videos: same scripts, rules and lessons,
its own videos, products, templates and runs. Changes here don't affect `../video` (and the reverse);
port a fix by hand when it applies to both. The mug-specific examples below (malt balls, dips, the
fondue fork) are kept as lessons: read them as "the product's action" for juice (a pour, a splash,
a glass filling, condensation).

Read README.md first. Deliverable: `videos/<name>/out/<name>.mp4` (1080×1920). Paths: commands run
from `juice/`; the capture writes `juice/videos/<name>/…` (relative to the repo root). On Windows,
`node -e` needs Windows-style paths (`C:/dev/…`), not `/c/dev/…`.

**COST RULE (standing user instruction): at most 2 Sora takes per shot, always.** sora.mjs clamps
`"takes"` to 2 and stops `--more` at 2 takes per shot. Pick the better of the two; if neither works,
fix the keyframe/prompt and replace both with `--force --only sN` — never generate a 3rd, 4th… take.

**Quality settings (juice):** sora-2 renders only 720x1280 (the upload check lists 1024x1792 but
generation rejects it: that needs sora-2-pro, which this Foundry resource doesn't offer; sora.mjs
refuses it up front). Quality comes from the rest: keyframes are drawn at native 9:16 (1152x2048,
`keyframeSize` overrides) and only downscaled to Sora's size, and the final encode is set per video with
`"encode": {"crf": 14, "preset": "slow", "sharpen": 0.4}` (defaults crf 18 / medium / 0). A real upscale
(Real-ESRGAN) needs a GPU: RunPod is not set up here.

## One-shot recipe (YouTube Short URL → replica)

1. **Review server**: start launch config `slideshow-review` (port 5179). It serves the pipelines and
   `save.html`, which writes captured JSON to disk.
2. **Capture the original** in the in-app browser: open the Short, then paste the WHOLE of
   `tools/yt-capture.js` into the javascript tool with `NAME` on its first line set to `<name>`
   (the javascript tool cannot read files: Read the file, edit NAME in your paste). It runs ~4-5 min
   per 10 s of video (~8 min for a 10 s Short, ~12 min for 30 s; a seek every ~150ms; the script returns at once and keeps running, so don't wait
   inside the 45s javascript tool) and then navigates to save.html and back. Delete any old
   `reference.json` first, then wait for the file:
   `until [ -s videos/<name>/reference.json ]; do sleep 5; done` (Bash, in the background). Paste
   only once per tab (a second concurrent run is refused). If nothing appears after ~3x that, read
   `window.__ytcapError` in the tab (it fails loudly when the player won't stay paused or seeks
   don't land; reload the Short and paste again). Reusing a reference captured for another video: copy its `reference.json` AND its
   `out/ref-shots.jpg` + `out/ref-every.jpg` (git-ignored; reference.json only points at them).
   The capture waits for the player to load and again after its own 1080p switch (which reloads the
   media source: the duration reads NaN for a moment; that used to fail with "non-finite" seeks), pins
   the <video> it started on, and ignores fast handheld motion (a fork whipped from board to mug changes a lot
   on BOTH sides of its biggest frame; an edit is one big change). If a 'shot' is under ~0.2 s, check it
   frame by frame (`ytcap.sheetDataUrl([...times])`) before treating it as a cut.
   Check `reference.json`: `cuts`, `sourceFps`,
   `shotMidpoints`. The save reloads the Short, so `ytcap` is gone afterwards.
3. **Look at every shot**: `node refsheet.mjs videos/<name>` → Read `out/ref-shots.jpg` (one frame
   per shot midpoint) and `out/ref-every.jpg` (every 0.5s, shows motion within shots); it also
   prints the `fps` the build needs. For each
   shot write down: action, hands, props, camera distance/angle, motion, and **composition as
   percentages of the frame** (where the main object, hands, screen, background sit, and how big the
   main object is — measure it, e.g. "mug 45% of frame width"). Caption ink boxes:
   re-paste the script with `NAME = null` and use `ytcap.box(t, pred, [x0,y0,x1,y1])` (1080×1920
   coordinates), or — quicker, and when you reused a reference and skipped the capture — paste the
   small `tools/yt-box.js` (`ytbox.lines(t, region)` per text line, `ytbox.runs` for the glyph/emoji gap,
   `ytbox.stable(times, region)` for an emoji: the pixels that don't change across frames). Emoji go in
   their own element with font "Noto Color Emoji" (its glyphs differ from the original's, so add
   `"fitMode": "stretch"` if the fit is off by more than 2px). Check fonts and fits in seconds with
   `node build.mjs videos/<name> --overlays` (out/captions-preview.jpg: your caption over the first
   reference frame). A caption with an emoji: a bright-pixel box also catches the emoji's highlights, so
   scan columns for the gap between text and emoji and fit them separately (text box + emoji box).
   Captions with a dark outline/shadow: the ink box includes it, so fit the white
   glyphs only (pred on bright pixels) and add the shadow in CSS.
4. **Write `video.json`**: `fps` = what refsheet.mjs prints (60 whenever cuts fall between 30fps
   frames, even for a 30fps source); shot `start`/`end` = the reference cuts exactly. A soft jump cut inside one setup is
   still a shot: `"takes": 0, "clip": "clips/<previous shot's take>.mp4"`, a later `from` and a
   different `zoom`/`pan` (`"framing": "manual"`; `pan` +y shows more of the bottom, i.e. content
   moves up). `style` holds only what is constant in EVERY shot (set, lighting, grade,
   framing distance) — per-shot items (a board of snacks, a torch, a hand) go in that shot's prompts,
   or they leak into every keyframe. Overlays with `fit` boxes. `takes: 2`. Never recreate
   copyrighted footage on screens, songs, or brand logos/packaging: use generic stand-ins and say so
   in `notes`. A brief that changes one thing on purpose ("only the background different"): README
   "Changing one thing on purpose" (new bible set + `"compare": {"trim": 0.35}`). **People on camera** (faces are the subject, e.g. a creator talking or reacting): Sora
   rejects input images with faces (even generated ones), so those shots are never keyframed.
   **Continuity bible first** (README "Continuity bible"): list every prop that must not change with
   exact words in `bible.props`, each set with its props and their first-frame layout in
   `bible.sets` (give the set frame the main object's size in the DOMINANT shot; every shot's
   keyframe prompt then states its own size, which overrides the set's scale — wide shots smaller).
   A prop whose `desc` is word for word the same as in an earlier replica: copy that replica's
   `bible/prop-<id>.png` first (~2 min saved per prop) — ONLY then: a board copied from another Short
   showed the wrong snacks in every keyframe. bible.mjs records the prompt behind each image in
   `bible/made.json` and remakes an image whose prompt changed; a copied image has no record and is
   reused with a warning: check it on `bible-sheet.jpg`, then `node bible.mjs videos/<name> --adopt`. Then
   run `node bible.mjs` (gpt-image-2 often takes 2-6 min per image; budget ~20 min for 8 keyframes), and Read
   `bible/bible-sheet.jpg` before any Sora time. Performances then use `"startFrom": "set"` and their
   prompt starts with the person stepping in (0-1 s). Pick takes with people by
   `node continuity.mjs videos/<name> --takes <id> --apply` (then confirm the action by eye). Takes of
   hands-and-product shots that start from the same keyframe score alike on both continuity and
   `--pick` (it prints TIE): decide by the ACTION on `node refsheet.mjs videos/<name> --takes s1,s2,…`
   (does the candle light, is the strawberry dipped; `--full` shows whole takes for retiming
   `from`) and set them with `node compare.mjs videos/<name> --choose s1=v2,s4=1` ("1" = sN.mp4, "v3" or "3" = sN.v3.mp4).
   Every separate generation (text-to-video OR remix of an anchor) can change the face, so a person
   who appears in more than one shot gets **performances** (README "Performances"): one 12 s take
   per person with that person's actions in order, cut into the shots (`"takes": 0`, `"clip"`,
   `"from"`), plus one `remixOf` performance for the rest. Wording: `sets` (strings) is appended to
   Sora prompts of shots with that `"set"`; `bible.sets` (desc/layout/props) drives bible.mjs and
   keyframes.mjs (gpt-image-2) and its props' exact words are appended to Sora prompts too. Keep the
   place described the same way in both. Pick the performance take by face AND
   action with `refsheet.mjs --takes <perf>`. Library characters (`"characters"`, per-shot remixes of
   an anchor) keep clothes/place but still drift the face per shot: use them to start a series'
   next video from the same person, not as the only consistency measure. Recreate people as new generic people, never the original creators. A
   caption that recurs in several windows: define it once in `captions` and use `"elements": "@name"`.
   A **series** reuses its library characters across videos (README "Characters"): check
   `node character.mjs status` first and `refresh` anchors with under 6 h left (Sora deletes them
   after 24 h).
5. **Product**: if the video features a real product, it must be that exact product. Download its
   photos from the brand's store page (Shopify: `/products/<handle>.json`; each image's `alt` or
   `variant_ids` tells which colour variant it shows) into `assets/product/`; crop a variant out of
   a multi-product lifestyle photo with `node tools/crop.mjs in out x y w h` (fractions), set `product` (refs +
   a precise description: shape, colour, lettering, handle, accessories), give every shot
   `keyframe: {prompt: <first frame composition>}` and keep the shot `prompt` for the action only.
   With a bible, make the product a bible prop with `"image": "assets/product/<photo>"` (the store
   photo itself is the prop reference) and give every shot `"set"`: keyframes.mjs then edits from
   the product photos + the set's bible frame + its prop images, so every keyframe shows the same
   room, the same props and the exact product (give shot-specific props via `keyframe.refs`, e.g.
   `["bible/prop-torch.png"]`). Pick the variant's photos by the image's `variant_ids`/`alt`; crop
   multi-product lifestyle photos to the right variant.
   The keyframe is the clip's FIRST frame: draw the reference shot's FIRST moment, not its midpoint.
   When the action starts elsewhere (the fork lifts a waffle off the board, then dips it), the keyframe
   shows the start state (waffle on the board, camera further back), the prompt times every beat
   ("0-0.7 s: lifts it into the mug while the camera moves closer; 0.7-2.5 s: dips and swirls"), and
   `speed` (often 1.4-1.8) makes the take's beats land on the reference's (check on `--full` sheets).
   A keyframe drawn mid-action gives a take that skips the reference's opening move. Sora often
   ignores "the camera moves closer": mark such shots `"push": true` and `--framing` adds a push-in
   zoom `[1, z]` (kept unless it scores clearly below a static crop: the grid barely sees a centred
   subject grow, so it can't be asked to prove the push) (only on marked shots: on static shots the grid also
   rewards push-ins that crop the product away). Its pan stays within ±0.5 across; if the product
   sits off-centre, pin it with `"push": {"pan": [x, y]}` and check the shot on `mine-shots.jpg`. A hand in front of the product: gpt-image-2 tends
   to put it over the product, so say where the product stays visible ("the mug fully visible to the
   RIGHT of the hand, not covered by it") and check the keyframe.
   For "X enters the frame" shots, describe the frame with X
   in place, prompt X leaving quickly ("slides quickly out of the frame within half a second"), and
   set `"reverse": true`. Sora starts the exit on the first frames whatever the prompt says, so the
   reversed shot only settles on its last frame: set `"hold": <s>` (the slot's last s seconds freeze
   the final frame) with `from: 0` and `speed` so the moving part covers the take's exit — e.g. the
   board settles 0.4 s into a 0.85 s slot and the take empties by 0.7 s: `"speed": 1.75, "hold": 0.45`
   (check on `--full`: the take's own exit time sets `from`/`speed`; a take whose object stays put
   and then teleports out gives an EXTRA cut that compare.mjs now reports: use another take). `hold` also rescues a take whose start is right but which then adds
   something the reference doesn't have (Sora lights a candle in an EMPTY mug whatever the prompt
   says): play the clean start and freeze it (`"from": 0, "hold": 0.65` on a static shot).
   Reversed, the moving part plays clip `from + (len − hold)·speed` back down to
   `from`. `node keyframes.mjs videos/<name>`; Read
   the `assets/keyframes/<id>.720x1280.png` files (what Sora gets: the model's 2:3 image minus 8% on
   each side) and compare them with ref-shots.jpg (object size and position!) before spending Sora
   time — regenerate a keyframe with `--force --only sN` rather than fixing it later with zoom.
   gpt-image-2 tends to draw the main object smaller than asked (state its size emphatically, "BIG:
   more than half the frame width"), ignores VERTICAL positions (a rim "at 54%" lands at ~37%) and
   brightens moody scenes into studio light: describe dark/red ambient light emphatically in the
   bible set ("dim room, deep red light, deep shadows, no bright studio light") and Read every
   keyframe against ref-shots.jpg; regenerate the ones that miss with `--force --only sN`. Sora rejects
   input frames showing people or faces (`moderation_blocked: people-in-user-uploads`), including
   on screens: hands only. The check is flaky on hands-only keyframes (the same frame passes on the
   next try): sora.mjs resubmits a blocked take twice before reporting it. A screen that must show a specific picture (a streaming app, an episode, a
   UI) is a GREEN screen in the bible prop and keyframes, and gets the picture per shot via
   `"screen"` after Sora (README "Device screens"); otherwise screens show scenery/abstract light.
   **Dips**: Sora skips a dip (the marshmallow jumps from plain to coated above the mug) unless the
   prompt spells each beat with times: over the mug → lowered straight DOWN INTO the mug until it
   disappears under the chocolate → stays under a moment → rises out coated, dripping. Check the dip
   frame by frame on the take sheet before building.
   **Spills** (a brief asks for lots of chocolate so it spills): Sora won't overflow a half-empty mug
   inside a short slot, so start the keyframe one step from the spill — the mug already heaped / brim
   full with the first pieces or a first drip already over the rim and on the desk — and prompt the
   amount and the spill itself ("a THICK, heavy stream of dozens of malt balls… many tumble over the
   rim and spill across the desk"; for melted chocolate "the chocolate surges up and OVERFLOWS: a big
   wave spills over the rim on all sides and pours down the outside of the mug in thick streams…
   pools in a puddle around its base… Lots of spilled chocolate" — a milder "spills over the rim"
   gives only the keyframe's drip) — and keep the PRODUCT recognisable: say the streams run down the
   sides and back while its shape, handle and lettering stay visible (a big overflow can turn the mug
   into a column of chocolate: the product must stay exactly the store's). The KEYFRAME must already
   show the spill under way (streams down the side and a puddle at the base): from a clean brim-full
   mug Sora mostly just drips the dipped fruit (5 of 6 takes on a brown mug). Make the 2 takes; pick the one that keeps
   spilling through the slot and use `from`/`speed` to show the growing spill.
   **Generate**: `node sora.mjs videos/<name>` (up to 2 jobs at once, often ~1 when anything else
   uses the deployment; ~60–120s each, so ~30 min for 20 takes; background it). `--more --only sN`
   adds a take only up to 2 per shot (cost rule); beyond that, `--force --only sN` replaces both.
6. **Pick, frame, grade, build** (free, no build needed for the first three):
   `node compare.mjs videos/<name> --pick` → `--framing` → `--apply` → `node build.mjs videos/<name>`.
   With device screens, the first `--pick` composites every take (~1-2 min each) — run it in the
   background. A screen picture showing a person on a laptop cut by the frame edge: set
   `"anchor": "center"` so the person, not the room behind them, stays in the visible part.
   `--pick` scores colour layout only: for every shot whose ACTION matters, run `node refsheet.mjs
   videos/<name> --takes sN` and check the take does the right thing at the right moment (order of
   actions, the moment at the shot's midpoint); override with `"clip"` + `"pick": "manual"` and move
   `from` to retime. `--framing` caps zoom at 1.25 and keeps a crop only for a ≥1 point gain (it can enlarge an already-too-big object or trim a hand: set `"framing": "manual"` with zoom 1 where it hurts); check it didn't crop
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

## Restaging (the same video again: another variant, another setting, another hook)

`node tools/restage.mjs templates/<video>.json videos/<name> runs/<run>.json --from videos/<previous>`
fills a template (the latest fixed spec of that video with `{{word}} {{WORD}} {{surface}} {{behind}}
{{layoutTail}} {{hook1}} {{hook2}} {{emoji}} …` placeholders) from a run file (`brand`, `variant`,
setting words + its bible props, reworded hook). Products live in `products/<brand>/variants.json`
(`name` + one entry per variant: `word`, `photos` in `products/<brand>/<variant>/`, `desc` with the
exact product words, and any extra fields the template uses as placeholders); the template's
`bible.props.product` becomes the store photo. It also copies the reference and its sheets and the
previous restage's identical prop and screen images with their `made.json` records. Then the
one-shot recipe from `bible.mjs` on. When a one-shot run needs a fix, fix the pipeline AND the
template, so the next restage starts from it.
