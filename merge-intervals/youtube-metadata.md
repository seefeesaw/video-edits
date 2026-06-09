# YouTube Metadata — Merge Intervals

---

## TITLE
```
Merge Intervals Explained | LeetCode #56 | Python O(n log n) Visual Walkthrough
```
**72 characters.** Keyword order: problem name → problem number → language → complexity → format signal.

---

## DESCRIPTION
```
Merge Intervals (LeetCode #56, Medium) — full animated visual walkthrough in Python.

Given a list of overlapping intervals, combine every overlapping pair into one. We solve it in O(n log n) time using sort + single sweep — no nested loops, no hash maps.

⏱ CHAPTERS
0:00 Problem setup — what are we merging?
0:10 Step 1 — Sort by start time
0:27 Step 2 — Seed the result with the first interval
0:40 Step 3 — First comparison: [2,6] overlaps [1,3] → stretch
0:59 Step 4 — [8,10] and [15,18] don't overlap → append
1:21 Final result + time/space complexity
1:39 Complete Python solution

🐍 FULL SOLUTION
──────────────────────────────────────
from typing import List

def merge(intervals: List[List[int]]):
    if not intervals:
        return []

    ordered = sorted(intervals, key=lambda iv: iv[0])
    merged = [ordered[0][:]]

    for start, end in ordered[1:]:
        last = merged[-1]
        if start <= last[1]:
            last[1] = max(last[1], end)
        else:
            merged.append([start, end])

    return merged
──────────────────────────────────────

🧠 KEY INSIGHT
Sort by start time first. Once intervals are in order, any two ranges that could overlap are guaranteed to sit right next to each other in the list — turning an O(n²) pair-search into a single O(n) sweep.

📊 COMPLEXITY
• Time:  O(n log n) — sort dominates; the sweep that follows is a single O(n) pass
• Space: O(n)       — sorted copy + merged output list

🎯 CHALLENGE — drop your answer in the comments
merge([[1,4],[4,5]]) → what's the output? (hint: touching intervals count as overlapping)

📌 RELATED PROBLEMS
• LeetCode #57  — Insert Interval
• LeetCode #435 — Non-Overlapping Intervals
• LeetCode #252 — Meeting Rooms
• LeetCode #253 — Meeting Rooms II
• LeetCode #986 — Interval List Intersections

──────────────────────────────────────
If this helped you understand the pattern, hit Subscribe ↑ for more visual LeetCode breakdowns.

#leetcode #python #codinginterview
```

---

## TAGS
*(paste all on one line in YouTube Studio — comma-separated)*
```
leetcode, merge intervals, leetcode 56, leetcode medium, python leetcode, leetcode python solution, coding interview, coding interview prep, faang interview, software engineer interview, data structures and algorithms, arrays and sorting, interval merging, sweep line, sorting algorithm python, leetcode explained, leetcode walkthrough, leetcode visual, algorithm visualization, python tutorial, technical interview prep, google interview, amazon interview, meta interview, leetcode medium solution, merge intervals python, interval problems leetcode, two pointers, greedy algorithm
```

---

## THUMBNAIL
**File:** `thumbnail/renders/frame_000001.png` (or `thumbnail-youtube.png`)
**Size:** 1280 × 720 px — already rendered, ready to upload.

---

## UPLOAD SETTINGS

| Field | Value |
|---|---|
| **Category** | Science & Technology |
| **Language** | English |
| **Made for kids** | No |
| **Age restriction** | No |
| **Comments** | Enabled — the challenge card drives comments |
| **Visibility** | Public (or Unlisted to review first) |

---

## CHAPTERS (for YouTube's chapter auto-detection)
YouTube auto-detects chapters from the description if you start with `0:00`.
The chapter block above is already formatted correctly — paste it exactly as written.

| Time | Label |
|---|---|
| 0:00 | Problem setup — what are we merging? |
| 0:10 | Step 1 — Sort by start time |
| 0:27 | Step 2 — Seed the result with the first interval |
| 0:40 | Step 3 — First comparison: [2,6] overlaps [1,3] → stretch |
| 0:59 | Step 4 — [8,10] and [15,18] don't overlap → append |
| 1:21 | Final result + time/space complexity |
| 1:39 | Complete Python solution |

---

## END SCREEN (last 20 seconds — add in YouTube Studio)
The video's final fade ends at ~1:57, leaving ~20 seconds of base canvas.
Add in YouTube Studio → Editor → End screen:
- **Subscribe button** — place centre-left
- **Latest video** — place centre-right
- **Playlist** (your LeetCode playlist if you have one) — place bottom

---

## CARDS (suggested mid-video prompts)
Add in YouTube Studio → Editor → Cards:
| Time | Card type | Content |
|---|---|---|
| 0:10 | Playlist | "More LeetCode Mediums" |
| 1:39 | Poll | "What's the output of merge([[1,4],[4,5]])? A) [[1,4],[4,5]] B) [[1,5]]" |

The poll card at 1:39 reinforces the challenge card already baked into the video.

---

## PINNED COMMENT (post immediately after publishing)
```
🎯 Challenge answer: merge([[1,4],[4,5]]) → [[1,5]]

[4,5] starts at 4, which is ≤ 4 (the end of [1,4]) — touching intervals count as overlapping, so they merge into [1,5].

Did you get it? Reply with your answer before reading this 👇
```

---

## SEO NOTES
- **Primary keyword:** `merge intervals` — appears in title, first line of description, tags
- **Secondary keywords:** `leetcode 56`, `leetcode medium`, `python coding interview`
- **Watch time hook:** The 0:00 chapter forces YouTube to show the problem as the first chapter preview — viewers who search "merge intervals" see immediately this video solves their specific problem
- **Comment velocity:** The challenge drives comments within hours of publishing, which signals engagement to the algorithm
- **CTR asset:** Thumbnail (`thumbnail-youtube.png`) uses high-contrast amber/green palette, large text, and the before/after interval visual — A/B testable against a plain code screenshot
