"""
0/1 Knapsack
------------
Given n items with weights and values, and a knapsack with capacity W,
select a subset of items to maximize total value without exceeding W.

Each item may be included at most once (zero or one times — hence "0/1").

Approach
========
At each item we make a binary choice: include it or skip it.
Brute-force enumeration of all subsets costs O(2^n).

Dynamic programming collapses overlapping subproblems:

  dp[i][w] = maximum value achievable using items 1..i
             with a weight limit of exactly w

Recurrence (1-indexed items):
  dp[0][w] = 0                          for all w   (no items)
  dp[i][w] = dp[i-1][w]                 if weights[i] > w  (can't fit)
           = max(dp[i-1][w],            (skip item i)
                 values[i] + dp[i-1][w - weights[i]])  (take item i)

Answer: dp[n][W]

Complexity
  Time:  O(n * W)  — fill every cell of the n x W table
  Space: O(n * W)  — the full table (reducible to O(W) with a 1-D array)
"""

from typing import List


def knapsack(capacity: int, weights: List[int], values: List[int]) -> int:
    n = len(weights)
    # dp[i][w] = best value with first i items, weight limit w
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        w_i = weights[i - 1]
        v_i = values[i - 1]
        for w in range(capacity + 1):
            dp[i][w] = dp[i - 1][w]              # skip item i
            if w_i <= w:
                dp[i][w] = max(dp[i][w],
                               v_i + dp[i - 1][w - w_i])  # take item i

    return dp[n][capacity]


def trace(capacity: int, weights: List[int], values: List[int]) -> dict:
    """
    Re-runs the algorithm while recording every decision the DP makes.
    Each entry in `steps` corresponds 1:1 with a beat in the video.
    """
    n = len(weights)
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]
    steps = []

    # Base case row
    steps.append({
        "item": None,
        "row": 0,
        "action": "base",
        "detail": "No items available — all capacities yield zero value.",
        "table_snapshot": [row[:] for row in dp],
    })

    for i in range(1, n + 1):
        w_i = weights[i - 1]
        v_i = values[i - 1]
        for w in range(capacity + 1):
            skip_val = dp[i - 1][w]
            take_val = (v_i + dp[i - 1][w - w_i]) if w_i <= w else None
            if take_val is not None and take_val > skip_val:
                dp[i][w] = take_val
                action = "take"
                detail = (
                    f"Item {i} (w={w_i}, v={v_i}) fits at capacity {w}. "
                    f"Take: {v_i}+{dp[i-1][w-w_i]}={take_val} > skip: {skip_val}."
                )
            else:
                dp[i][w] = skip_val
                action = "skip"
                detail = (
                    f"Capacity {w}: "
                    + (f"item {i} (w={w_i}) doesn't fit." if take_val is None
                       else f"skip ({skip_val}) >= take ({take_val}).")
                )
            steps.append({
                "item": i,
                "row": i,
                "col": w,
                "action": action,
                "detail": detail,
                "table_snapshot": [row[:] for row in dp],
            })

    # Traceback
    chosen = []
    w = capacity
    for i in range(n, 0, -1):
        if dp[i][w] != dp[i - 1][w]:
            chosen.append(i - 1)          # 0-indexed item
            w -= weights[i - 1]

    return {
        "capacity": capacity,
        "weights": weights,
        "values": values,
        "dp": dp,
        "answer": dp[n][capacity],
        "chosen_items": list(reversed(chosen)),
        "steps": steps,
    }


if __name__ == "__main__":
    # Example used in the video
    cap = 5
    W = [2, 3, 4]   # item A, B, C
    V = [3, 4, 5]

    print("capacity:", cap)
    print("weights:", W)
    print("values:", V)
    print("answer:", knapsack(cap, W, V))

    log = trace(cap, W, V)
    print("\nDP table:")
    for i, row in enumerate(log["dp"]):
        label = f"items 0..{i-1}" if i > 0 else "no items"
        print(f"  row {i} ({label}): {row}")
    print("\nchosen items (0-indexed):", log["chosen_items"])
    items = ["A", "B", "C"]
    print("chosen:", [items[j] for j in log["chosen_items"]])

    # sanity checks
    assert knapsack(5, [2, 3, 4], [3, 4, 5]) == 7
    assert knapsack(0, [1], [10]) == 0
    assert knapsack(10, [1, 2, 3], [6, 10, 12]) == 22
    assert knapsack(50, [10, 20, 30], [60, 100, 120]) == 220
    print("\nall checks passed")
