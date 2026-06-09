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

A late-night-debugger aesthetic for walking through an algorithm: deep charcoal panels, a monospaced "trace" voice for code and data, and a warm humanist sans for the explanation that sits beside it. The screen behaves like an instrument panel — a DP array is the instrument, coins and amounts are the readings, and three signal colors (amber / cyan / green) tell you exactly what the decision is at every cell. Calm, precise, legible — built to be paused and studied.

## Colors

- `bg` (#101316) — base canvas, near-black charcoal
- `surface` (#1A1F24) — panels: code block, legend, stat cards
- `ink` (#ECEEF0) — primary text on dark
- `muted` (#647082) — empty/inactive cells and axis tick marks (structural, not text)
- `muted-text` (#8b96a6) — secondary labels, captions, code default
- `candidate` (#FFB454, warm amber) — the cell currently being computed
- `anchor` (#5DD2D6, cyan) — source cells being referenced in the recurrence
- `resolved` (#6EE7A8, mint green) — cells that have been filled with their final value

## Typography

Hanken Grotesk carries every spoken explanation. Martian Mono is the system's second voice: every number, every line of code, every cell value lives in it.

## Do's and Don'ts

- DO keep the DP array as the throughline — every step shows a cell being filled
- DO let color carry meaning consistently — amber = current cell, cyan = source cells, green = done
- DON'T add gradients or decorative chrome that competes with the data
