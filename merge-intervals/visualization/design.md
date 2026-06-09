---
name: Sweep Line
colors:
  bg: "#101316"
  surface: "#1A1F24"
  ink: "#ECEEF0"
  muted: "#647082"
  candidate: "#FFB454"
  anchor: "#5DD2D6"
  resolved: "#6EE7A8"
typography:
  headline:
    fontFamily: "Hanken Grotesk", sans-serif
    fontSize: 4rem
    fontWeight: 800
    letterSpacing: -0.01em
  body:
    fontFamily: "Hanken Grotesk", sans-serif
    fontSize: 1.35rem
    fontWeight: 300
    lineHeight: 1.5
  code:
    fontFamily: "Martian Mono", monospace
    fontSize: 1.15rem
    fontWeight: 400
    letterSpacing: -0.01em
  label:
    fontFamily: "Martian Mono", monospace
    fontSize: 0.85rem
    fontWeight: 500
    textTransform: uppercase
    letterSpacing: 0.12em
rounded:
  sm: 6px
  md: 12px
spacing:
  sm: 16px
  md: 32px
  lg: 64px
  xl: 110px
motion:
  energy: moderate
  easing:
    entry: "power3.out"
    exit: "power2.in"
    ambient: "sine.inOut"
  duration:
    entrance: 0.6
    hold: 2.2
    transition: 0.8
  atmosphere:
    - scanline-grid
    - axis-ticks
    - state-legend
  transition: focus-pull
---

## Overview

A late-night-debugger aesthetic for walking through an algorithm: deep charcoal panels, a monospaced "trace" voice for code and data, and a warm humanist sans for the explanation that sits beside it. The screen behaves like an instrument panel — a number line is the instrument, intervals are the readings, and three signal colors (amber / cyan / green) tell you exactly what the sweep is doing to them at every moment. Calm, precise, legible — built to be paused and studied.

## Colors

- `bg` (#101316) — base canvas, near-black charcoal
- `surface` (#1A1F24) — panels: code block, legend, stat cards
- `ink` (#ECEEF0) — primary text on dark
- `muted` (#647082) — pending/inactive interval borders/fills and axis tick marks (structural, not text)
- `muted-text` (#8b96a6) — secondary labels, captions, code default — a lightened reading of `muted` that clears AA contrast (4.5:1) on `bg`/`surface` for small text
- `candidate` (#FFB454, warm amber) — the interval currently being examined
- `anchor` (#5DD2D6, cyan) — the last interval in the result the candidate is being compared against
- `resolved` (#6EE7A8, mint green) — intervals that have been folded into the final merged output

The three signal colors are a fixed semantic system: amber = "looking at this now", cyan = "comparing against this", green = "done, locked into the answer". They never swap roles.

## Typography

Hanken Grotesk carries every spoken explanation — a humanist grotesk with real weight range, set light (300) for body copy and heavy (800) for headlines, so the contrast between "statement" and "emphasis" is unmistakable even in motion. Martian Mono is the system's second voice: every number, every line of code, every interval label lives in it — its slightly unusual, blocky letterforms make data feel like data, distinct from the human voice explaining it. Sans for people, mono for machines: that's the only register switch, and it mirrors the video's actual subject (a human reading a precise mechanical process).

## Elevation

Flat panels on a flat canvas — `surface` blocks sit on `bg` with a single 1px `ink`-at-12% hairline border, never a shadow. Depth comes from layering and motion (panels sliding into place, glows pulsing on active elements), not from blur or elevation tricks.

## Components

- **Number-line track**: a horizontal axis with tick marks in `muted`; intervals are drawn as rounded pill-bars positioned and sized by their start/end values, colored by their current role (`muted` / `candidate` / `anchor` / `resolved`)
- **Code panel**: `surface` block in Martian Mono with line-by-line syntax coloring and a sliding highlight bar that tracks the active line of the algorithm
- **State legend**: small pill-and-label rows (dot + Martian Mono caption) that decode the amber / cyan / green system the moment it's introduced, then persist as a quiet reference
- **Verdict card**: a `surface` callout that states the comparison result in plain language ("2 ≤ 3 → overlap, merge" / "15 > 10 → no overlap, append") right as it happens

## Do's and Don'ts

- DO keep the number line as the throughline — every step shows the data moving on it, not just text describing the move
- DO let color carry meaning consistently — once amber means "candidate", it always means "candidate"
- DO pair the visual change with the matching code-line highlight and a plain-language verdict, every single time
- DON'T add gradients, glows-as-wallpaper, or decorative chrome that competes with the data — this is an instrument panel, not a poster
- DON'T let body copy creep above 300 weight or headlines drop below 700 — the weight contrast is the hierarchy
- DON'T narrate in mono or label data in Hanken Grotesk — the voice/data split is the system's backbone
