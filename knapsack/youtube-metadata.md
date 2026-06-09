# YouTube Metadata — 0/1 Knapsack

---

## TITLE
```
0/1 Knapsack Explained | Dynamic Programming Visual Walkthrough | Python O(n·W)
```
**79 characters.** Keyword order: problem name → technique → format signal → language → complexity.

---

## DESCRIPTION
```
0/1 Knapsack (Classic DP, Medium) — full animated visual walkthrough in Python.

Given items with weights and values and a knapsack with a fixed capacity, select a subset to maximize total value. We solve it in O(n·W) time using a 2-D DP table — no recursion, no memoization overhead.

⏱ CHAPTERS
0:00 Problem setup — weights, values, capacity
0:10 The DP insight — dp[i][w] and the recurrence
0:26 Base case — row 0 is all zeros
0:39 Fill row 1 — item A (w=2, v=3)
0:57 Fill rows 2 & 3 — items B and C; the key cell dp[2][5]=7
1:17 Result + traceback: items A+B, value 7
1:35 Complete Python solution

🐍 FULL SOLUTION
──────────────────────────────────────
from typing import List

def knapsack(capacity: int, weights: List[int], values: List[int]) -> int:
    n = len(weights)
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        w_i, v_i = weights[i - 1], values[i - 1]
        for w in range(capacity + 1):
            dp[i][w] = dp[i - 1][w]
            if w_i <= w:
                dp[i][w] = max(dp[i][w], v_i + dp[i - 1][w - w_i])

    return dp[n][capacity]
──────────────────────────────────────

🧠 KEY INSIGHT
dp[i][w] = max value using the first i items within weight limit w.
Two choices per cell: skip item i (inherit dp[i-1][w]) or take it (v_i + dp[i-1][w - w_i]).
Fill the table bottom-up — no overlapping subproblems recomputed.

📊 COMPLEXITY
• Time:  O(n · W) — fill every cell of the n × W table once
• Space: O(n · W) — reducible to O(W) with a rolling 1-D array

🎯 CHALLENGE — drop your answer in the comments
capacity=6, weights=[1,2,3], values=[1,2,3] — what's the maximum value?

📌 RELATED PROBLEMS
• Unbounded Knapsack — each item may be used unlimited times
• Subset Sum — is there a subset with exactly target sum?
• Coin Change — minimum coins to make amount (unbounded variant)
• Partition Equal Subset Sum — LeetCode #416
• Target Sum — LeetCode #494

──────────────────────────────────────
If this helped you understand DP tables, hit Subscribe ↑ for more visual LeetCode breakdowns.

#leetcode #python #dynamicprogramming
```

---

## TAGS
*(paste all on one line in YouTube Studio — comma-separated)*
```
knapsack problem, 0 1 knapsack, knapsack dynamic programming, knapsack python, dynamic programming, dp table, leetcode dynamic programming, coding interview, coding interview prep, faang interview, software engineer interview, data structures and algorithms, dp problems, knapsack explained, knapsack algorithm, dp tutorial, python dynamic programming, leetcode explained, leetcode walkthrough, leetcode visual, algorithm visualization, python tutorial, technical interview prep, dp interview questions, knapsack problem python, 2d dp, bottom up dp, tabulation, memoization vs tabulation, subset sum
```

---

## THUMBNAIL
**File:** `thumbnail/renders/frame_000001.png` (or `thumbnail-youtube.png`)
**Size:** 1280 × 720 px — render the thumbnail separately once it's designed.

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

| Time | Label |
|---|---|
| 0:00 | Problem setup — weights, values, capacity |
| 0:10 | The DP insight — dp[i][w] and the recurrence |
| 0:26 | Base case — row 0 is all zeros |
| 0:39 | Fill row 1 — item A (w=2, v=3) |
| 0:57 | Fill rows 2 and 3 — items B and C |
| 1:17 | Result + traceback: items A+B, value 7 |
| 1:35 | Complete Python solution |

---

## END SCREEN (last 20 seconds — add in YouTube Studio)
- **Subscribe button** — place centre-left
- **Latest video** — place centre-right
- **Playlist** (your LeetCode playlist) — place bottom

---

## CARDS (suggested mid-video prompts)

| Time | Card type | Content |
|---|---|---|
| 0:10 | Playlist | "More LeetCode DP Problems" |
| 1:35 | Poll | "Challenge: capacity=6, w=[1,2,3], v=[1,2,3] — answer? A) 5 B) 6 C) 4" |

---

## PINNED COMMENT (post immediately after publishing)
```
🎯 Challenge answer: capacity=6, weights=[1,2,3], values=[1,2,3] → 6

Take all three items: 1+2+3=6 weight (fits in capacity 6), value 1+2+3=6.

Did you get it? Reply below 👇
```

---

## SEO NOTES
- **Primary keyword:** `knapsack problem` / `0 1 knapsack` — appears in title, first line of description, tags
- **Secondary keywords:** `dynamic programming`, `dp table`, `coding interview`
- **Watch time hook:** The DP table filling animation is visual and unfamiliar — viewers pause and replay
- **Comment velocity:** The challenge drives comments within hours of publishing
