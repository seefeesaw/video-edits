---
name: Open Editorial
colors:
  paper: "#FFFFFF"
  ink: "#141414"
  coral: "#F9D8D2"
  coral-deep: "#E8A99D"
  sage: "#3DAA52"
  sky: "#6FB6E0"
  bloom: "#E85FA0"
typography:
  display:
    fontFamily: "Schibsted Grotesk", sans-serif
    fontWeight: 500
    letterSpacing: -0.01em
  headline:
    fontFamily: "Schibsted Grotesk", sans-serif
    fontSize: 4.5rem
    fontWeight: 600
  body:
    fontFamily: "Schibsted Grotesk", sans-serif
    fontSize: 1.4rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Mono", monospace
    fontSize: 0.95rem
    fontWeight: 500
    textTransform: uppercase
    letterSpacing: 0.08em
rounded:
  none: 0px
  sm: 4px
spacing:
  sm: 16px
  md: 32px
  lg: 64px
  xl: 120px
motion:
  energy: moderate
  easing:
    entry: "power3.out"
    exit: "power2.in"
    ambient: "sine.inOut"
  duration:
    entrance: 0.7
    hold: 2.5
    transition: 0.9
  atmosphere:
    - hairline-rules
    - soft-gradient-bloom
    - numbered-index-marks
  transition: cross-warp-morph
---

## Overview

A clean, editorial identity lifted directly from OpenAI's "A Practical Guide to Building Agents" PDF: white paper pages, a single soft-coral section divider, deep charcoal-black type, and one abstract painterly gradient (green → sky → bloom-pink) used sparingly as a mark of warmth inside an otherwise restrained, text-led system. The feeling is a confident publisher, not a tech demo — calm authority, generous whitespace, numbered sections, hairline rules between ideas.

## Colors

- `paper` (#FFFFFF) — primary background for body/content scenes
- `ink` (#141414) — primary text, near-black (matches the PDF's deep charcoal headlines)
- `coral` (#F9D8D2) — section-divider background (the PDF's title/intro/conclusion pages)
- `coral-deep` (#E8A99D) — accent rules, numbered badges, underlines on coral backgrounds
- `sage` / `sky` / `bloom` — the three hues lifted from the cover's abstract gradient art; use only as small painterly accents (glows, gradient blooms, chart highlights), never as large flat fields

## Typography

Geometric grotesk throughout — Schibsted Grotesk, chosen for its newspaper-editorial lineage (the closest open match to the PDF's Söhne). Headlines sit at medium/semibold weight, tight tracking, sentence case — never uppercase, never bold-heavy. Body copy is generously leaded. Numbered list markers ("01", "02"...) appear in IBM Plex Mono, uppercase, wide-tracked — exactly as in the source document. This sans+mono pairing is the system's only register switch: one voice for statements, one for structure/metadata. Don't introduce a third face.

## Elevation

Flat. No shadows, no glassmorphism. Separation comes from hairline 1px rules (`ink` at 12% opacity on paper, `ink` at 20% on coral) and generous whitespace — exactly as the print document separates sections.

## Components

- **Section divider**: full-bleed `coral` background, oversized headline in `ink`, page-number footer in monospace label type — mirrors the PDF's Introduction/Conclusion treatment
- **Numbered list row**: monospace 2-digit badge in `coral-deep` + headline label + supporting copy, separated by hairline rules — mirrors the PDF's "01/02/03" tables
- **Gradient bloom mark**: a soft, organic radial blend of `sage`/`sky`/`bloom`, used once or twice as a quiet visual anchor (echoing the cover art), never as a backdrop for text

## Do's and Don'ts

- DO keep backgrounds flat (`paper` or `coral`) — the gradient bloom is a single accent, not wallpaper
- DO use the numbered-badge device for any list content; it's the document's strongest visual signature
- DO leave generous margins (120px+) — this is a print-derived system, it breathes
- DON'T introduce drop shadows, glass blur, neon glows, or saturated UI gradients
- DON'T set headlines in uppercase or heavy/black weights — medium weight, sentence case only
- DON'T let `sage`/`sky`/`bloom` cover large areas — they read as decoration, not brand color
