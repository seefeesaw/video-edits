# YouTube Metadata — Coin Change

## Title

Coin Change Explained | Dynamic Programming Walkthrough | Python O(total×coins)

*(63 characters — within 80-char limit)*

---

## Description

Find the minimum coins to reach a target amount — full animated visual walkthrough in Python.

We show why greedy always fails here, then build the bottom-up DP solution from scratch: initialize a dp array, fill it left to right using the recurrence dp[i] = min(dp[i − coin] + 1), and trace back the actual coins used. Every decision is animated so you can pause and study each step.

⏱ CHAPTERS
0:00 Problem statement — coins [1, 3, 4], target 6
0:24 The DP insight — dp[i] = min(dp[i − coin] + 1)
0:51 Base case — dp[0] = 0, initialize with infinity
1:08 Fill dp[1] to dp[3]
1:31 Fill dp[4] to dp[6] — where greedy breaks down
1:56 Result + traceback — coins [3, 3]
2:20 Complete Python solution

🐍 FULL SOLUTION
──────────────────────────────────────
def coin_change(coins, total):
    dp = [total + 1] * (total + 1)
    dp[0] = 0
    for amount in range(1, total + 1):
        for coin in coins:
            if coin <= amount:
                dp[amount] = min(
                    dp[amount],
                    dp[amount - coin] + 1
                )
    return dp[total] if dp[total] <= total else -1
──────────────────────────────────────

🧠 KEY INSIGHT
Greedy always picks the largest coin — but that can block a better combination.
DP avoids this by computing every sub-amount from scratch.
For amount 6: greedy picks coin 4 (leaves 2 → 2 more coins = 3 total), but coin 3 gives dp[3]+1 = 2 coins directly.

📊 COMPLEXITY
• Time:  O(total × len(coins)) — two nested loops
• Space: O(total) — one dp array of length total+1

🎯 CHALLENGE — drop your answer in the comments
coins = [2], total = 3 — what does the function return, and why?

📌 RELATED PROBLEMS
• Climbing Stairs — same recurrence, exactly 1 or 2 coins
• Unbounded Knapsack — coin change with weights and values
• Perfect Squares — coin change where coins are perfect squares

──────────────────────────────────────
If this helped you understand dynamic programming, hit Subscribe ↑ for more visual LeetCode breakdowns.

#leetcode #python #dynamicprogramming

---

## Tags

coin change, coin change leetcode, coin change python, coin change dynamic programming, leetcode 322, leetcode medium, dynamic programming, dp python, bottom up dp, dp array, minimum coins, greedy vs dynamic programming, leetcode python, leetcode walkthrough, algorithm visualization, leetcode visual, coding interview, faang interview, data structures and algorithms, python tutorial, dp tutorial, leetcode explained, coin change explained, unbounded knapsack, leetcode dp

---

## Upload Settings

| Field          | Value                  |
|----------------|------------------------|
| Category       | Science & Technology   |
| Language       | English                |
| Made for kids  | No                     |
| Age restriction | No                    |
| Comments       | Enabled                |
| Visibility     | Unlisted (review first), then Public |

---

## End Screen (last 20 seconds — from 2:40)

- Subscribe button — centre-left
- Latest video — centre-right
- Playlist (LeetCode DP playlist) — bottom

---

## Cards

| Time  | Type     | Content                                    |
|-------|----------|--------------------------------------------|
| 0:10  | Playlist | "More LeetCode Dynamic Programming Problems" |
| 2:55  | Poll     | "coins=[2], total=3 returns?" A: 1  B: -1  C: 3 |

---

## Pinned Comment

Post immediately after publishing:

🎯 Challenge answer: coins = [2], total = 3 → -1

Since all coin denominations are even and 3 is odd, it's impossible to sum even numbers to reach an odd total. dp[3] never gets updated from its initial "infinity" value, so the function returns -1.

Did you get it? Reply below 👇
