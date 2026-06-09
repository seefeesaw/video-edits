# YouTube Metadata — N-th Tribonacci Number (LeetCode 1137)

---

## Title

N-th Tribonacci Number Explained | Dynamic Programming Visual Walkthrough | Python O(n)

---

## Description

Given n, return the n-th Tribonacci number — full animated visual walkthrough in Python.

The Tribonacci sequence extends Fibonacci by summing the three previous terms. We build a bottom-up DP array in O(n) time, then refine it to a 3-variable sliding window for O(1) space — the cleanest possible solution for a sequence problem.

CHAPTERS
0:00 Problem setup — Tribonacci definition and base cases
0:18 The recurrence — T(n) = T(n-1) + T(n-2) + T(n-3)
0:35 Initialization — seed T(0), T(1), T(2)
0:49 Fill indices 3 to 5 — window slides right
1:05 Fill indices 6 to 7 — values accelerate
1:20 Result — T(7) = 24, space-optimised trick
1:34 Complete Python solution — O(n) time, O(1) space

FULL SOLUTION
──────────────────────────────────────
def tribonacci(n):
    if n == 0: return 0
    if n <= 2: return 1
    a, b, c = 0, 1, 1
    for _ in range(n - 2):
        a, b, c = b, c, a + b + c
    return c
──────────────────────────────────────

KEY INSIGHT
Since only the last 3 values are ever needed, we never have to allocate a full array.
A 3-variable sliding window (a, b, c) keeps constant space while still running in O(n) time.
This is the optimal solution for any sequence defined by a fixed-width recurrence.

COMPLEXITY
- Time:  O(n) — single loop from 3 to n
- Space: O(1) — three variables, no array

CHALLENGE — drop your answer in the comments
What is T(10)? Hint: the sequence so far is 0, 1, 1, 2, 4, 7, 13, 24, 44, ...

RELATED PROBLEMS
- Fibonacci Number (LeetCode 509) — same idea with 2-variable window
- Climbing Stairs (LeetCode 70) — Fibonacci in disguise
- House Robber (LeetCode 198) — 2-state DP recurrence

──────────────────────────────────────
If this helped you understand dynamic programming, hit Subscribe for more visual LeetCode breakdowns.

#leetcode #python #dynamicprogramming

---

## Tags

n-th tribonacci number, tribonacci, tribonacci python, tribonacci leetcode, leetcode 1137, leetcode easy, dynamic programming, dp python, fibonacci, sequence dp, bottom up dp, sliding window dp, leetcode python, leetcode walkthrough, algorithm visualization, leetcode visual, coding interview, faang interview, data structures and algorithms, python tutorial, dp tutorial, leetcode explained, tribonacci explained, fibonacci extension, recurrence relation

---

## Upload Settings

| Field           | Value                  |
|-----------------|------------------------|
| Category        | Science & Technology   |
| Language        | English                |
| Made for kids   | No                     |
| Age restriction | No                     |
| Comments        | Enabled                |
| Visibility      | Unlisted (review first)|

---

## End Screen (last 20 seconds)

- Subscribe button — centre-left
- Latest video — centre-right
- Playlist (LeetCode DP playlist) — bottom

---

## Cards

| Time  | Type     | Content                                  |
|-------|----------|------------------------------------------|
| ~0:10 | Playlist | "More LeetCode Dynamic Programming"      |
| ~1:35 | Poll     | "What is T(10)? A) 44  B) 81  C) 149"   |

---

## Pinned Comment

Post immediately after publishing:

CHALLENGE answer: T(10) = 149

T(8)=44, T(9)=81, T(10)=T(9)+T(8)+T(7) = 81+44+24 = 149

Did you get it? Drop your answer below!
