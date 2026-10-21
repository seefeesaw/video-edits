# Video pipeline (Sora 2)

Recreates short-form vertical videos (Shorts/Reels/TikToks) from a declarative spec:

```
product photos ──keyframes.mjs (gpt-image-2 edit)──▶ assets/keyframes/<shot>.png (first frames)
video.json ──sora.mjs (image-to-video from the keyframe)──▶ clips/<shot>.mp4 (Sora 2, 720×1280, audio)
           ──build.mjs─▶ out/<name>.mp4  (1080×1920: trimmed/reframed shots, cuts, overlays, audio)
reference Short (YouTube tab) + tools/yt-capture.js ──▶ reference.json ──compare.mjs──▶ per-shot similarity, cuts
```

## Commands

```bash
npm install
node keyframes.mjs videos/<name>            # first frames with the real product (2 at a time)
node sora.mjs videos/<name>                 # generate missing shot clips (2 jobs at a time, resumable)
node sora.mjs videos/<name> --only s3,s5    # specific shots
node sora.mjs videos/<name> --more --only s3   # add a take, up to 2 per shot (cost rule: never more)
node sora.mjs videos/<name> --force         # regenerate
node build.mjs videos/<name> [--frames]     # assemble out/<name>.mp4 (+ one frame per shot)
```

Sora 2 runs on our Azure AI Foundry deployment `thuma-video` (`foundry.json`; override with
`AZURE_FOUNDRY_VIDEO_ENDPOINT` / `AZURE_FOUNDRY_VIDEO_DEPLOYMENT`). Auth is your `az login` session.
API: `POST /openai/v1/videos` (multipart: model, prompt, size `720x1280`, seconds `4|8|12`, optional
`input_reference` image) → poll `GET /openai/v1/videos/{id}` until `completed` → `GET …/{id}/content`.
A 4s clip takes ~40–100s; the rate limit allows about two jobs at once (`SORA_CONCURRENCY`). Job ids
are saved in `clips/jobs.json`, so an interrupted run resumes instead of paying twice.

**Exact products.** Prompts alone give a lookalike. Put the product's photos (e.g. from its store
page) in `assets/product/` and list them in `product.refs`; `keyframes.mjs` composes each shot's
first frame around the real product with gpt-image-2 edits, and Sora animates from it, which keeps
shape, colour and lettering intact through the motion. The image deployment allows ~2 edits at a
time (~150s each); 429s are retried.

Overlays are rendered with the slideshow engine (`../slideshow`), so captions accept every slideshow
element and auto-fit (`fit: [x0,y0,x1,y1]` = ink box measured on the reference).

## Continuity bible (everything that must not change)

```bash
node bible.mjs videos/<name>                         # canonical props + people-free set frames
node continuity.mjs videos/<name> --takes A2 --apply # rank takes on face, outfit, every prop, set
```

`"bible": {"props": {"jar": {"desc": "<exact words>"}}, "sets": {"A": {"desc", "props": [...], "layout"}}}`.
bible.mjs makes one product image per prop, then each set's **people-free first frame** as a
gpt-image-2 edit that takes those prop images as references (so the set contains those exact
objects). Sora refuses images with people but accepts the empty set, so a performance with
`"startFrom": "set"` begins from it — place, props and their positions are pinned by the first frame
and the prompt has the person step in (cut the shots from after that). Every prompt of a set also
gets the props' exact words appended. continuity.mjs shows the vision model (thuma-luna) the bible
images plus the established face (the source performance, or the library character) and the
candidate takes side by side, and scores each take per element; `--apply` picks the best.

## Device screens (a laptop/TV/phone that shows a specific picture)

Sora refuses input frames with people, and an app UI on a generated screen comes out garbled. So the
device is a **green screen** in the bible prop (`"laptop": {"desc": "… its screen lit with a perfectly
flat, uniform, pure chroma-key green (#00FF00) from edge to edge …"}`) and every keyframe/prompt
says the screen is flat chroma-key green; the picture is composited after Sora per shot:

```jsonc
"bible": { "screens": { "e1": { "desc": "<a fictional scene the laptop plays>" } } },   // bible/screen-e1.png (16:9)
"captions": { "player_s2": [ { "type": "html", "x": 0, "y": 0, "w": 1600, "h": 1000,
                "html": "<div …background:url({{src bible/screen-e1.png}})…>…app UI…</div>" } ] },
"shots": [ { "id": "s2", …, "screen": { "ui": "player_s2", "size": [1600, 1000] } } ]   // or { "image": "bible/screen-e1.png" }
// a video you have the rights to (the user's own scene file): plays from "from" and loops; "ui" is then
// an overlay (player chrome on a transparent background)
"screen": { "clip": "assets/screen/scene.mp4", "from": 12.5, "ui": "player_s2" }
```

build.mjs keys the largest green blob of each take (a Christmas tree elsewhere is ignored; the box is
unioned over the clip), cover-fits the rendered screen into it (anchored at the top, since a mug in
front hides the bottom; a device cut by the frame edge shows the picture's side that faces into
the frame, unless `"anchor": "center"`) and caches `out/_screens/<take>.<hash>.mp4`; compare.mjs scores the
composited takes, so --pick/--framing/--apply see the real picture. Because the picture never goes
to Sora it may show people (adults: gpt-image-2 blocks stills of children/teens) and a streaming-app UI — but only original, generated content (never
stills of a real show) and an invented title. A picture that should fill a FULLY visible device (a logo on a whole laptop, like a real computer):
`"screen": {"ui": "…", "whole": true}` — keyframes.mjs asks for the whole device in frame and warns
when a keyframe's screen touches the frame edge, sora.mjs keeps it in frame, and build.mjs scales the
picture to the whole green box. gpt-image-2 copies the device position from the bible set frame and
ignores horizontal margins ("14-52% of the width" still lands flush with the edge), so build the SET
with the device CENTRED behind the product, clear wall on both sides, screen above the product's rim
("symmetric composition"), and repeat that wording in every keyframe prompt. The keyframe check
needs room for the lid and base around the screen, not just a screen off the edge. Don't prompt camera
moves (a "push-in" from the original crops the device): sora.mjs adds "static camera" for whole
screens. A jump cut inside one clip can't zoom both sides then: use a small zoom with the pan at one
side (`"zoom": 1.07, "pan": [-1, 0]` crops only the right).
Text that must be readable in every shot (a title): set `"anchor": "center"` on the shots and keep
it inside the middle third of the screen (x 530-1070 of 1600) — the part a cut-off laptop still shows.
Check every keyframe still shows the green (`node
keyframes.mjs` warns when a `screen` shot's keyframe has none).

## Changing one thing on purpose (another background, another room)

"Exact replica, only the background different": keep every shot's foreground (product, props,
hands, actions, framing, timing) and change only the bible set — the wall/room behind and its
decoration (swap background-only props like a tree for the new ones, never the desk-front props) —
plus the words that name the old background in `style` and in each keyframe prompt ("the tree
glows top-right" → "the fairy-light window glows top-right"). Then set
`"compare": {"trim": 0.35, "grade": "luma"}` (luma: --apply matches brightness/contrast only, so the
new colours stay — an RGB grade turned a navy wall pink): the colour grid would otherwise count the new background as an error,
the grade would pull the new wall back to the old colour, and --pick/--framing would prefer takes
and crops that hide it. With trim, every score and grade fit uses the best-matching 65% of grid
cells per frame. Don't make the new background green when a device screen is keyed.

## Performances (one face across many shots)

A face only stays identical inside ONE continuous clip; every separate generation (text or remix)
is a new chance to drift. So for a person who appears in several shots, generate long takes and
cut the shots out of them:

```jsonc
"performances": [
  { "id": "B1", "set": "B", "seconds": 12, "takes": 2,
    "prompt": "One continuous take with these actions in order. 0-1 s: … 1-4 s: … 4-6 s: …" },
  { "id": "B2", "remixOf": "B1", "seconds": 12, "takes": 2, "prompt": "<the remaining actions>" }
],
"shots": [ { "id": "s4", "start": 9.05, "end": 10.9, "takes": 0, "clip": "clips/B1.v2.mp4", "from": 3.0 } ]
```

**A remix re-renders the WHOLE source video from the source's opening state** (an empty jar stays
empty even if the prompt says it is full). To continue a state (a full, dripping jar after the pour),
remix the source asking to keep it unchanged except its LAST seconds ("Keep the first 8 s exactly;
change only 8-12 s: …") and cut the shot from those last seconds. For an action that doesn't depend on
state (a pour, a drink) any remix works.

`node sora.mjs videos/<name> --only B1` → `node refsheet.mjs videos/<name> --takes B1` (8 frames
over the whole take) → set the performance's `"clip"` to the take with the right face and every
action, and each shot's `clip`/`from` to the moment its action happens → generate `B2` (a remix of
B1's chosen take: one hop from that face) → build. Timed prompts are followed roughly; read the
sheet for the real timings. A chosen performance can become the character's library anchor
(`character.mjs adopt <name> --id <its id from clips/ids.json>`) for the next video in a series.

## Characters (same person across shots and videos)

```bash
node character.mjs create <name> --desc "<person + place>" [--action "…"] [--seconds 4,8]
node character.mjs adopt <name> --id video_…      # a good generated take (ids in clips/ids.json)
node character.mjs refresh <name>                 # before anchors expire (Sora keeps videos 24 h)
node character.mjs status
```

Sora refuses input images that show people, even generated ones, so a recurring character can't
start from a picture. A character is an **anchor**: a Sora clip of that person in their place, kept in
`characters/<name>/` (character.json + reference frames). A video maps its sets to characters
(`"characters": {"A": "<name>"}`); every shot with `"set": "A"` is generated as a **remix** of that
anchor, which keeps face, clothes, place and framing and changes only the action. A remix keeps its
source's length, so a character has one anchor per clip length (4/8/12 s). Anchors expire 24 h after
they are made: run `refresh` (remixes each anchor into an unchanged copy; reports similarity to the
original reference frames) at least daily while a series is in production, or recreate them.

## video.json

```jsonc
{
  "title": "…", "source": "<url of the original>",
  "size": [1080, 1920], "fps": 30, "duration": 10.681,   // fps: 60 when reference.json sourceFps is 60
  "soraSize": "720x1280",
  "style": "shared description appended to every shot prompt (setting, props, lighting, grade)",
  "sets": { "A": "character + location A, word for word", "B": "…" },   // a shot's "set": "A" appends it
  "characters": { "A": "chocmilk-max" },   // set → library character: those shots remix its anchor
  "captions": { "caption": [ /* slideshow elements */ ] },            // reused by overlays as "@caption",
  "product": {                       // a real product that must look exactly like its photos
    "name": "Meltie Mug Mini Fondue Mug, red",
    "refs": ["assets/product/front.png", "assets/product/in-use.jpg"],
    "description": "shape, colour, lettering, handle, accessories…"
  },
  "shots": [
    {
      "id": "s1", "start": 0, "end": 2.267,       // slot in the final timeline (seconds)
      "prompt": "what happens in this shot",
      "seconds": 4,          // Sora clip length (4|8|12); default: smallest covering the slot
      "from": 0.4,           // where in the clip the slot starts (skip Sora's settle-in)
      "speed": 1,            // >1 plays faster (uses more of the clip); <1 slow motion (e.g. 0.8 to
                             // end a slot before a hand enters)
      "zoom": [1.0, 1.08],   // reframe: crop-zoom, constant or animated [start, end]
      "pan": [[0, 0], [0, -0.2]],   // crop window offset -1..1 (x, y), constant or animated:
                             // +x shows more of the right (content moves left), +y shows more of
                             // the bottom (content moves up); only has an effect with zoom > 1
      "framing": "manual",   // compare.mjs --framing leaves this shot's zoom/pan alone
      "push": true,          // the reference camera moves in: --framing may set a push-in zoom [1, z]
      "hold": 0.45,          // freeze the last frame for the slot's last N seconds (a reversed
                             // entrance that must settle mid-slot; Sora exits start at once)
      "reverse": true,       // play the used span backwards (keyframe = first frame, so generate
                             // "X leaves" and reverse it for "X enters the frame")
      "filter": "hflip",     // extra ffmpeg video filters, appended after the grade
      "keyframe": { "prompt": "the shot's first frame: composition as % of frame…" },
                             // built by keyframes.mjs from product.refs (gpt-image-2 edit) and sent
                             // to Sora as input_reference; or a path to an existing image
      "screen": { "ui": "player_s2" },   // composite our picture into the green screen (Device screens)
      "takes": 2,            // generate N variants (s1.mp4, s1.v2.mp4 …); "clip" picks one
      "clip": "clips/s1.v2.mp4"  // may point at another shot's take (a jump cut inside one
                             // setup): set "takes": 0 so sora.mjs skips the shot; --pick leaves it
                             // alone, so re-point it by hand if --pick changes the source shot
    }
  ],
  "overlays": [ { "from": 0, "to": 10.681, "elements": [ /* slideshow elements */ ] },
                { "from": 12.3, "to": 14.9, "elements": "@caption" } ],
  "fonts": ["TikTok Sans:wght@400;500;600"],
  "compare": { "trim": 0.35 },      // only for replicas that change part of the picture on purpose
  "audio": { "sora": 1, "music": "assets/music.mp3", "musicVolume": 1, "musicStart": 0 }
}
```

Audio: by default each shot keeps its Sora audio. `music` mixes in a track **you have the rights
to**; set `"sora": 0` to drop the clip audio. Copyrighted songs, shows or logos from the original
are not recreated — the pipeline uses generic stand-ins and says so in `notes`.

## Comparing with the original

```
YouTube tab: paste tools/yt-capture.js with NAME set → videos/<name>/reference.json (~1–2 min)
node refsheet.mjs videos/<name> [--mine]    # reference contact sheets as images (+ your build's)
node compare.mjs videos/<name> --pick      # choose the best take per shot ("clip")      } from raw
node compare.mjs videos/<name> --framing   # search crop-zoom/pan per shot ("zoom"/"pan") } clips; no
node compare.mjs videos/<name> --apply     # fit a per-shot colour grade ("grade")         } build needed
node build.mjs videos/<name>
node compare.mjs videos/<name>             # per-shot composition score, brightness/warmth, cuts
```
`--only s3,s5` restricts pick/framing/apply.

The capture reads the player's own frames in the page (nothing is downloaded): duration, source fps,
cut times (a seek-based scan every 1/60s; a cut is a large frame change or a strong local peak, which
catches soft jump cuts), a 9×16 colour grid every 0.25s, and two contact sheets (one frame per shot
midpoint, one every 0.5s) embedded as JPEG data URLs that `refsheet.mjs` writes out. It works with
the browser pane hidden. YouTube's CSP blocks loading local files or posting to localhost, so the
script hands the JSON over by navigating to the review server's `save.html`, which writes it under
`video/` or `slideshow/` and navigates back. `ytcap.box(t, pred, region)` measures caption ink.

Shot fields written by compare: `clip` (chosen take), `zoom`/`pan` (reframe), `grade`
(`{r:[gain,offset], g:…, b:…, clip}`, applied as an RGB LUT; ignored by build.mjs if `clip` has
changed since). `--apply` is idempotent (fitted from the raw clip + framing each time). Builds use
exact frame counts per slot, so cuts land on the reference's frames; a 60fps source has cuts between
30fps frames, so build at `"fps": 60` for frame-exact cuts.
