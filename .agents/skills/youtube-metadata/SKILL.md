---
name: youtube-metadata
description: Generate complete YouTube upload metadata for coding tutorial and algorithm-explainer videos. Covers title SEO, description structure (chapters, code, challenge), tags strategy, upload settings, end screens, cards, and pinned comments. Includes hard constraints about disallowed characters and field limits.
---

# YouTube Metadata — Coding Tutorials

Complete YouTube metadata for a video. Every field matters for the first 48 hours — the algorithm uses early engagement signals to decide reach.

## Hard Constraints (Non-Negotiable)

1. **No `<` or `>` angle brackets anywhere** — title, description, tags, or pinned comment. YouTube strips or rejects them. This includes Python return-type annotations (`->`): strip the `->` or rewrite as a comment.
2. **Title max 100 characters** — target 70 for clean display in search results (no truncation).
3. **Description chapters MUST start with `0:00`** — YouTube only auto-detects chapters if the first timestamp is exactly `0:00`. No leading spaces before the number.
4. **Tags: 500-character total limit** — comma-separated, each tag up to 100 chars, 500 total characters in the tags field.
5. **No HTML in description** — YouTube description is plain text. Unicode arrows (→ ↑) are fine; `<br>` or `<b>` are not.

---

## Title Formula

```
[Problem Name] Explained | [Source #N] | [Language] [Complexity] [Format Signal]
```

| Component | Purpose | Example |
|---|---|---|
| Problem name | Primary keyword | `Merge Intervals` |
| Source + number | Searchability | `LeetCode #56` |
| Language | Filter intent | `Python` |
| Complexity | Quality signal | `O(n log n)` |
| Format signal | Click qualifier | `Visual Walkthrough` |

Good separators: `|` (pipe). Avoid `:` in titles — it reads as a subtitle and wastes characters.

---

## Description Structure

Order matters. YouTube indexes the first ~150 characters for search snippets.

```
[One-sentence problem statement + algorithm used + complexity]

[2-3 sentence key insight — the "why", not the "what"]

⏱ CHAPTERS
0:00 [Label]
0:XX [Label]
...

🐍 FULL SOLUTION
──────────────────────────────────────
[code block — no fences, just indented text]
──────────────────────────────────────

🧠 KEY INSIGHT
[1-2 sentences on the non-obvious trick]

📊 COMPLEXITY
• Time:  O(n log n) — [reason]
• Space: O(n)       — [reason]

🎯 CHALLENGE — drop your answer in the comments
[function]([[input]]) → what's the output? (hint: [hint])

📌 RELATED PROBLEMS
• LeetCode #XX — [Title]
• LeetCode #XX — [Title]

──────────────────────────────────────
[Subscribe CTA with channel benefit statement]

#[tag1] #[tag2] #[tag3]
```

### Code Blocks in Description

YouTube description is plain text. Use visual separators instead of markdown fences:

```
──────────────────────────────────────
from typing import List

def merge(intervals: List[List[int]]):
    if not intervals:
        return []
    ...
──────────────────────────────────────
```

**Strip Python return type annotations** — `->` contains `>` which may cause issues. Use input-only type hints or remove type hints entirely. The algorithm logic is what viewers come for.

---

## Tags Strategy

Three tiers, most specific first:

| Tier | Purpose | Examples |
|---|---|---|
| **Exact** | People searching this exact problem | `merge intervals`, `leetcode 56`, `merge intervals python` |
| **Category** | Problem type / technique | `interval merging`, `sweep line`, `sorting algorithm python` |
| **Platform** | Broad discovery | `leetcode medium`, `coding interview`, `faang interview`, `data structures and algorithms` |

Target 20–30 tags. First tag = primary keyword. Keep total under 500 characters.

**No special characters in tags.** No `<>`, `/`, `#`, `@`. Hyphens are fine (`two-pointer`).

---

## Upload Settings

| Field | Value |
|---|---|
| Category | Science & Technology |
| Language | English |
| Made for kids | No |
| Age restriction | No |
| Comments | Enabled — challenge drives comment velocity |
| Visibility | Unlisted first (review), then Public |

---

## End Screen (last 20 seconds)

Add in YouTube Studio → Editor → End screen. Three-element layout:

- **Subscribe button** — centre-left
- **Latest video** — centre-right  
- **Playlist** (your LeetCode playlist) — bottom centre

---

## Cards

| Placement | Type | Content |
|---|---|---|
| ~10% of duration | Playlist | Your algorithm series |
| ~90% of duration | Poll | Re-state the challenge as a poll (A/B answer choices) |

The poll card reinforces the in-video challenge card — doubles comment + poll engagement signals.

---

## Pinned Comment

Post within the first 5 minutes of publishing. Format:

```
🎯 Challenge answer: [function]([[input]]) → [[output]]

[1-2 sentence explanation of why]

Did you get it? Reply with your answer before reading this 👇
```

The "reply before reading" line creates a commitment device — viewers answer first, scroll to verify, reply. Each reply is a signal to the algorithm.

---

## SEO Checklist

- [ ] Primary keyword in title (first 3 words ideally)
- [ ] Primary keyword in first line of description
- [ ] Primary keyword as first tag
- [ ] `0:00` starts the chapters block
- [ ] Challenge prompt in description AND as a card AND as pinned comment (3x touchpoints)
- [ ] Related problems link to adjacent LeetCode numbers (YouTube counts these as topical authority)
- [ ] No `<` or `>` anywhere in any field
- [ ] Title under 70 characters for search display
- [ ] Tags under 500 characters total

---

## Pattern Interrupt: Watch Time via Metadata

The description challenge creates a **re-watch loop**:
1. Viewer finishes the video
2. Reads the challenge in the description
3. Thinks about it, wants to verify
4. Re-watches the relevant section OR re-runs the code
5. Comments their answer

This is the same Zeigarnik Effect as the in-video progress bar — just triggered via YouTube's own surfaces (description, pinned comment, card poll).

Design every metadata field with this loop in mind: the video is the hook, the description is the retention tool, the pinned comment is the conversion point.
