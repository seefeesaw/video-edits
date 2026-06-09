"""
N-th Tribonacci Number (LeetCode 1137)

Recurrence: T(n+3) = T(n) + T(n+1) + T(n+2), with T0=0, T1=1, T2=1.

Approach: bottom-up DP — build the array left to right in O(n) time.
Space-optimised variant tracks only the last 3 values in O(1) space.

Complexity:
  Time:  O(n)
  Space: O(n) for dp array; O(1) for the 3-variable version
"""


def tribonacci(n: int) -> int:
    if n == 0:
        return 0
    if n <= 2:
        return 1
    dp = [0] * (n + 1)
    dp[1] = 1
    dp[2] = 1
    for i in range(3, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2] + dp[i - 3]
    return dp[n]


def tribonacci_o1(n: int) -> int:
    """Space-optimised: slide a 3-variable window."""
    if n == 0:
        return 0
    if n <= 2:
        return 1
    a, b, c = 0, 1, 1
    for _ in range(n - 2):
        a, b, c = b, c, a + b + c
    return c


def trace(n: int = 7) -> list:
    """Re-runs the algorithm logging every fill step for animation."""
    steps = []
    if n == 0:
        steps.append({"type": "base", "index": 0, "value": 0})
        return steps
    if n <= 2:
        for i in range(n + 1):
            steps.append({"type": "base", "index": i, "value": [0, 1, 1][i]})
        return steps

    dp = [0] * (n + 1)
    dp[1] = dp[2] = 1
    steps.append({"type": "base", "index": 0, "value": 0})
    steps.append({"type": "base", "index": 1, "value": 1})
    steps.append({"type": "base", "index": 2, "value": 1})

    for i in range(3, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2] + dp[i - 3]
        steps.append({
            "type": "fill",
            "index": i,
            "value": dp[i],
            "sources": [i - 1, i - 2, i - 3],
        })

    steps.append({"type": "answer", "index": n, "value": dp[n]})
    return steps


if __name__ == "__main__":
    expected = [0, 1, 1, 2, 4, 7, 13, 24, 44, 81]
    for i, exp in enumerate(expected):
        got = tribonacci(i)
        assert got == exp, f"tribonacci({i}) = {got}, expected {exp}"
        got_o1 = tribonacci_o1(i)
        assert got_o1 == exp, f"tribonacci_o1({i}) = {got_o1}, expected {exp}"
    assert tribonacci(25) == 1389537
    assert tribonacci(37) == 2082876103
    print("All assertions passed.")
    print("trace(7):", trace(7))
