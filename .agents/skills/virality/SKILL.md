---
name: virality
description: Increase video watch time, audience retention, and return viewership for HyperFrames compositions. Covers the 6 core virality levers (hook, progress, pattern interrupt, payoff loop, CTA placement, re-engagement challenge), how to implement each as a HyperFrames overlay, and platform-specific optimisation rules for YouTube, social shorts, and web embeds.
---

# Virality — Watch Time & Return Viewership

A viral video is not lucky — it's engineered. The algorithm optimises for two signals above everything else: **Average View Duration (AVD)** and **Click-Through Rate (CTR)**. Every virality technique either lifts one or both.

## The 6 Core Levers

### 1. Hook (0–8 seconds) — wins the click, earns the watch

The viewer's brain decides in 2–3 seconds whether to keep watching. The hook must:
- **Show the destination.** Reveal the output before explaining the journey. For a coding tutorial: flash the before/after side by side. For a product demo: show the finished thing running.
- **Create a curiosity gap.** State a problem the viewer recognises but can't yet solve. "Most engineers write O(n²) here — there's a one-line fix."
- **Signal the format.** Step counter, progress bar, chapter markers — tell the viewer exactly how long the journey is. Anxiety about length is a drop-off trigger.

**In HyperFrames:** Add a preview element to Scene 1. Show the final answer (greyed out or blurred) as a visual destination. Start the narration with a question or surprising fact, not a restatement of the title.

### 2. Progress Indicator — the completion pull

A visible progress bar creates the **Zeigarnik Effect**: unfinished tasks occupy working memory until completed. A viewer who can see they're 60% through will power through a dull stretch just to reach 100%.

Rules:
- Keep it subtle — 4–6px at the top or bottom edge, 20–30% opacity fill track
- Use a colour that ties to your reward state (green = solved, amber = in progress)
- Never animate it backwards (even during scene rewinds)

**In HyperFrames:** Single full-duration `clip` on a high track index, `pointer-events:none`, `z-index:200`. Animate `width: 0% → 100%` with `ease: "none"` across `data-duration`.

```html
<div id="vrl-progress" class="clip" data-start="0" data-duration="VIDEO_DURATION"
     data-track-index="4" data-layout-ignore>
  <div id="vrl-bar-bg"></div>
  <div id="vrl-bar-fill"></div>
</div>
```
```js
tl.fromTo("#vrl-bar-fill", { width: "0%" }, { width: "100%", duration: VIDEO_DURATION, ease: "none" }, 0);
```

### 3. Step Counter — structure that removes friction

Viewers abandon when they feel lost. A persistent step indicator ("STEP 3 / 5 · COMPARE") tells them:
- How many steps remain
- Which concept they're currently on
- That the video has a logical end

Rules:
- Place top-right corner, small and monospace — it's reference, not content
- Match step labels to scene content exactly (no vague names like "Part 2")
- Pulse or flash the step number briefly on each transition to draw the eye
- Hide the counter in the intro (before step 1) and during the outro (final code/summary scene)

**In HyperFrames:** Single `clip` element spanning steps 1–N. Use `tl.call()` to change inner text at each scene boundary. Entrance: `tl.from()` at the first step start. Exit: `tl.to()` shortly before final scene starts.

```html
<div id="vrl-step" class="clip" data-start="STEP1_START" data-duration="STEP_DURATION"
     data-track-index="5">
  <span id="vrl-step-num">STEP 1/N</span>
  <span>·</span>
  <span id="vrl-step-label">LABEL</span>
</div>
```
```js
tl.call(function() {
  document.getElementById("vrl-step-num").textContent = "STEP 2/N";
  document.getElementById("vrl-step-label").textContent = "NEXT_LABEL";
}, [], SCENE2_START + 0.2);
```

### 4. Pattern Interrupt — resets attention every 30–60 seconds

Viewer attention spans reset after a stimulus change. Without interrupts, engagement decay is ~10% per minute. With them, it's near-flat.

Interrupt types (ranked by energy cost):
| Type | Energy | Implementation |
|------|--------|---------------|
| Colour pulse on key element | Low | `tl.to(el, { backgroundColor: "#ffb454", duration: 0.15 })` then revert |
| New visual layer enters | Medium | Slide in a verdict card, arrow, annotation |
| Scene transition | High | Cross-fade, scale punch, wipe |
| Narration beat change | Zero (audio) | Rising tone, pause, emphasis word |

Rules:
- Never let a single visual state hold for more than 50 seconds without a change
- High-energy interrupts (scene transitions) can reset the 50s clock completely
- Low-energy interrupts (colour changes, element entrances) buy 20–25 seconds

### 5. CTA Placement — the 80% rule

Never put a subscribe/like call-to-action in the first third of a video. Viewers who haven't seen value yet will ignore it or feel annoyed. The optimal window is **75–90% of total duration**, after the payoff moment (the problem solved, the result revealed, the code complete).

Rules:
- Place CTA at the emotional peak — the moment the viewer feels "that was worth it"
- Keep CTA duration to 6–10 seconds — long enough to read, short enough to not feel like an ad
- Use a secondary frame (separate overlay element, not narration script text) — mid-sentence subscribe prompts break immersion
- Make the CTA feel earned: "if this helped →" not "please subscribe"
- For tutorial content: amber/warm colour for the CTA frame distinguishes it from the content palette

**In HyperFrames:** Short-duration `clip` element, bottom-right corner, fades in at the payoff moment.

```html
<div id="vrl-cta" class="clip" data-start="CTA_START" data-duration="8"
     data-track-index="6">
  <span id="vrl-cta-icon">↑</span>
  <span id="vrl-cta-text">Like & Subscribe for more breakdowns</span>
</div>
```

### 6. Re-engagement Challenge — the return trigger

The hardest retention problem is not "watch to the end" — it's "come back tomorrow." A challenge prompt at the end of the video creates an **open cognitive loop**: the viewer thinks about it between sessions. When they want to verify their answer, they rewatch.

Rules:
- Use the exact same problem structure as the video (same algorithm, different input)
- Make it slightly harder than the example shown — adds status (solving it feels good)
- Place it in the final 10% of the video, AFTER the CTA
- Frame it as optional: "Try it:" or "What's the output?" — not "homework"
- The answer should not be visible in the video (forces a rewatch or code execution)

**In HyperFrames:** Reuse the CTA element via `tl.call()` text swap after the CTA phase ends. Keeps track count low.

```js
tl.call(function() {
  document.getElementById("vrl-cta-icon").textContent = "→";
  document.getElementById("vrl-cta-text").textContent = "Try it: yourFunction(input) — what's the output?";
}, [], CTA_START + 6.5);
```

---

## HyperFrames Implementation Rules

### Track Assignment
Reserve high track indices for virality overlays so they never conflict with scene content:
- Track 4: Progress bar (full duration)
- Track 5: Step counter (scene range only)
- Track 6: CTA + challenge (final 15% of video)

### Overlay CSS Pattern
All virality overlays use this base:
```css
#vrl-overlay {
  position: absolute;
  z-index: 200;
  pointer-events: none;
  /* No width/height — let content define size */
}
```

### Exit Rules
Virality overlays are NOT scene elements — the "no exit animations except final scene" rule does NOT apply to them. You may add `tl.to()` exits on overlay elements at any time. However:
- Progress bar never exits (it finishes at 100% at the end)
- Step counter exits before the final "payoff" scene begins (it's done its job)
- CTA/challenge exits before the composition's final fade

### Colour Rules (dark compositions)
- Progress bar fill: gradient from secondary → primary accent (e.g., `#5dd2d6 → #6ee7a8`)
- Step counter text: primary accent colour for the number, muted for the label
- CTA frame: amber (`#ffb454`) border + icon — distinguishes it from content palette
- Challenge frame: reuse CTA element with icon swap — cyan (`→`) or white

### What NOT to do
- Never animate the progress bar backwards, even during rewinds or intro sequences
- Never place a step counter during the hook (first scene) — it creates pressure before value is established
- Never make the CTA a full-screen takeover — overlays above 20% of screen area feel like ads and trigger skip
- Never put two virality overlays in the same corner at the same time
- Never use `Math.random()` for any virality element — they must be deterministic for rendering

---

## Platform-Specific Rules

### YouTube (standard 16:9)
- Hook: first 8s must show value (YouTube shows 10s preview on hover — this IS your thumbnail motion)
- CTA position: 75–90% of duration
- AVD target: >40% of video duration = algorithmically favoured
- End screen: use last 5–7 seconds for end screen elements (challenge card is perfect here)

### YouTube Shorts / TikTok (9:16)
- Hook: first 3s, text must be visible without audio (85% of shorts start muted)
- No step counter — screen is too narrow; use a brief text flash instead
- CTA: can be verbal + text overlay simultaneously (no rules against audio CTA in shorts)
- Loop optimisation: last frame should match or rhyme with first frame to encourage loops

### Web embed / landing page
- Progress bar is less important (viewer controls scrubber anyway)
- Hook is critical — autoplay with muted means you have 2s of visual to earn the unmute
- No explicit CTA needed — the call to action is the surrounding page

---

## Checklist (run before shipping)

- [ ] Hook shows problem + destination within 8 seconds
- [ ] Progress bar spans full duration, animates linearly, is on its own track
- [ ] Step counter covers the instructional body of the video (not intro/outro)
- [ ] At least one pattern interrupt per 45-second segment
- [ ] CTA placed at 75–90% of total duration
- [ ] Re-engagement challenge placed after CTA, before final fade
- [ ] No two overlays in the same screen quadrant simultaneously
- [ ] All overlay clips use `data-layout-ignore` or have `data-layout-allow-overflow` where tags float outside bounds
- [ ] `npm run check` passes with 0 errors after adding overlays
