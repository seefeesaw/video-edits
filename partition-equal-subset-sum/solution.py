"""
Partition Equal Subset Sum
LeetCode #416 — Medium

Reduce to subset sum: if the total is even, find a subset summing to total // 2.
Use a 1-D boolean DP array; iterate nums in outer loop, sums in reverse inner loop.

Recurrence:  dp[j] = dp[j] or dp[j - num]   for j in range(target, num - 1, -1)

Why iterate backwards?  Iterating from high to low ensures each num is only
used once per pass — we look at dp[j - num] from the *previous* iteration,
not the current one.

Time:  O(n * target)   where target = sum(nums) // 2
Space: O(target)       1-D rolling array
"""
from typing import List


def can_partition(nums: List[int]) -> bool:
    total = sum(nums)
    if total % 2 != 0:
        return False
    target = total // 2
    dp = [False] * (target + 1)
    dp[0] = True
    for num in nums:
        for j in range(target, num - 1, -1):
            dp[j] = dp[j] or dp[j - num]
    return dp[target]


def trace(nums: List[int]) -> list:
    """Re-run the algorithm logging every state change for animation."""
    total = sum(nums)
    if total % 2 != 0:
        return [{"step": "odd_sum", "total": total}]
    target = total // 2
    dp = [False] * (target + 1)
    dp[0] = True
    steps = [{"step": "init", "dp": list(dp), "target": target, "total": total}]
    for i, num in enumerate(nums):
        changed = []
        for j in range(target, num - 1, -1):
            if not dp[j] and dp[j - num]:
                dp[j] = True
                changed.append(j)
        steps.append({
            "step": "process_num",
            "item_idx": i,
            "num": num,
            "newly_true": changed,
            "dp": list(dp),
        })
    steps.append({"step": "result", "dp": list(dp), "answer": dp[target]})
    return steps


if __name__ == "__main__":
    assert can_partition([1, 5, 11, 5]) == True,  "expected True"
    assert can_partition([1, 2, 3, 5]) == False,  "expected False"
    assert can_partition([1, 1])        == True,   "expected True"
    assert can_partition([1])           == False,  "expected False"
    assert can_partition([2, 2, 1, 1])  == True,   "expected True"
    assert can_partition([100] * 200)   == True,   "expected True (all equal)"
    print("All assertions passed.")
