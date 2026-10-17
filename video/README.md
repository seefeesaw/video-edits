# Video pipeline (Sora 2)

Recreates short-form vertical videos (Shorts/Reels/TikToks) from a declarative spec:

```
product photos ──keyframes.mjs (gpt-image-2 edit)──▶ assets/keyframes/<shot>.png (first frames)
video.json ──sora.mjs (image-to-video from the keyframe)──▶ clips/<shot>.mp4 (Sora 2, 720×1280, audio)
           ──build.mjs─▶ out/<name>.mp4  (1080×1920: trimmed/reframed shots, cuts, overlays, audio)
reference Short (YouTube tab) + tools/yt-compare.js ──▶ per-shot similarity, cut timing, side-by-sides
```

## Commands

```bash
npm install
node keyframes.mjs videos/<name>            # first frames with the real product (2 at a time)
node sora.mjs videos/<name>                 # generate missing shot clips (2 jobs at a time, resumable)
node sora.mjs videos/<name> --only s3,s5    # specific shots
node sora.mjs videos/<name> --more --only s3   # add another take (s3.v2.mp4 …)
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

## video.json

```jsonc
{
  "title": "…", "source": "<url of the original>",
  "size": [1080, 1920], "fps": 30, "duration": 10.681,
  "soraSize": "720x1280",
  "style": "shared description appended to every shot prompt (setting, props, lighting, grade)",
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
      "speed": 1,            // >1 plays faster (uses more of the clip)
      "zoom": [1.0, 1.08],   // reframe: crop-zoom, constant or animated [start, end]
      "pan": [[0, 0], [0, -0.2]],   // crop offset -1..1 (x, y), constant or animated
      "keyframe": { "prompt": "the shot's first frame: composition as % of frame…" },
                             // built by keyframes.mjs from product.refs (gpt-image-2 edit) and sent
                             // to Sora as input_reference; or a path to an existing image
      "takes": 2,            // generate N variants (s1.mp4, s1.v2.mp4 …); "clip" picks one
      "clip": "clips/s1.v2.mp4"
    }
  ],
  "overlays": [ { "from": 0, "to": 10.681, "elements": [ /* slideshow elements */ ] } ],
  "fonts": ["TikTok Sans:wght@400;500;600"],
  "audio": { "sora": 1, "music": "assets/music.mp3", "musicVolume": 1, "musicStart": 0 }
}
```

Audio: by default each shot keeps its Sora audio. `music` mixes in a track **you have the rights
to**; set `"sora": 0` to drop the clip audio. Copyrighted songs, shows or logos from the original
are not recreated — the pipeline uses generic stand-ins and says so in `notes`.

## Comparing with the original

```
YouTube tab: tools/yt-capture.js → ytcap.captureAndSave('video/videos/<name>/reference.json')
node compare.mjs videos/<name>             # per-shot composition score, brightness/warmth deltas, cuts
node compare.mjs videos/<name> --pick      # choose the best take per shot ("clip")
node compare.mjs videos/<name> --framing   # search crop-zoom/pan per shot ("zoom"/"pan")
node compare.mjs videos/<name> --apply     # fit a per-shot colour grade ("grade")
```

The capture reads the player's own frames in the page (nothing is downloaded): duration, exact cut
times via `requestVideoFrameCallback`, and a 9×16 colour grid every 0.25s. YouTube's CSP blocks
loading local files or posting to localhost, so the script hands the JSON over by navigating to the
review server's `save.html`, which writes it under `video/` or `slideshow/` and navigates back.
`ytcap.frames([…])` shows reference frames for screenshots; `ytcap.box()` measures caption ink.

Shot fields written by compare: `clip` (chosen take), `zoom`/`pan` (reframe), `grade`
(`{r:[gain,offset], g:…, b:…}`, applied as an RGB LUT). Builds use exact frame counts per slot, so
cuts land on the reference's frames.
