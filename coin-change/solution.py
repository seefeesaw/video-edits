"""
Coin Change — LeetCode #322

Approach: Bottom-up dynamic programming.

Recurrence:
  dp[i] = min(dp[i - coin] + 1)  for each coin where coin <= i

Base case:
  dp[0] = 0  (zero coins needed to make amount 0)

Initialize dp[1..total] = total + 1 (sentinel for infinity — no valid answer
needs more coins than the total itself).

After filling the table, if dp[total] is still > total, no solution exists.

Complexity:
  Time:  O(total * len(coins))
  Space: O(total)
"""


def solve(coins: list, total: int) -> int:
    dp = [total + 1] * (total + 1)
    dp[0] = 0

    for amount in range(1, total + 1):
        for coin in coins:
            if coin <= amount:
                dp[amount] = min(dp[amount], dp[amount - coin] + 1)

    return dp[total] if dp[total] <= total else -1


def trace(coins: list, total: int) -> list:
    """Re-run solve() logging every decision as steps[].

    Each step dict has:
      event: 'init' | 'fill' | 'result'
      dp:    snapshot of dp array at that moment
      For 'fill': amount, value, coin_used
      For 'result': answer
    """
    dp = [total + 1] * (total + 1)
    dp[0] = 0
    steps = []

    steps.append({
        "event": "init",
        "dp": dp[:],
        "note": "dp[0]=0, dp[1..{}]=infinity".format(total),
    })

    for amount in range(1, total + 1):
        best = dp[amount]
        used_coin = None
        for coin in coins:
            if coin <= amount and dp[amount - coin] + 1 < best:
                best = dp[amount - coin] + 1
                used_coin = coin
        dp[amount] = best
        steps.append({
            "event": "fill",
            "amount": amount,
            "value": best,
            "coin_used": used_coin,
            "dp": dp[:],
        })

    answer = dp[total] if dp[total] <= total else -1
    steps.append({
        "event": "result",
        "answer": answer,
        "dp": dp[:],
    })
    return steps


if __name__ == "__main__":
    assert solve([1, 3, 4], 6) == 2,  "coins=[1,3,4] total=6 -> 2"
    assert solve([2], 3) == -1,        "coins=[2] total=3 -> -1"
    assert solve([1], 0) == 0,         "total=0 -> 0"
    assert solve([1, 5, 10], 11) == 2, "coins=[1,5,10] total=11 -> 2"
    assert solve([2, 5, 10], 6) == 3,  "coins=[2,5,10] total=6 -> 3"
    print("All assertions passed.")

    steps = trace([1, 3, 4], 6)
    for s in steps:
        print(s)
