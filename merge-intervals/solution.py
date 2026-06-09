"""
Merge Intervals
---------------
Given an array of closed intervals, merge all overlapping intervals and
return an array of the resulting non-overlapping intervals.

Approach
========
Two intervals [a, b] and [c, d] (with a <= c) overlap exactly when c <= b —
the second interval starts before (or exactly when) the first one ends.

That observation only becomes useful once the intervals are in start-time
order: with unsorted input, an overlap could be "hiding" anywhere in the
array and we'd have to compare every pair (O(n^2)). Sorting by start time
guarantees that any interval which could possibly overlap the one we're
building up is sitting immediately next to it, so a single left-to-right
pass is enough.

Algorithm
1. Sort intervals by start time                      -> O(n log n)
2. Walk through them left to right, keeping a "merged" list:
   - If the current interval overlaps the last interval placed in
     `merged` (current.start <= last.end), fuse them by stretching
     last.end to cover whichever interval reaches further:
         last.end = max(last.end, current.end)
   - Otherwise the current interval starts a new, disjoint group —
     append it to `merged` as-is.
3. `merged` is the answer.

Complexity
  Time:  O(n log n)  — dominated by the sort; the merge pass is O(n)
  Space: O(n)        — for the sorted copy and the output list
"""

from typing import List


def merge(intervals: List[List[int]]) -> List[List[int]]:
    if not intervals:
        return []

    # Step 1 — sort by start time so overlapping intervals become neighbors
    ordered = sorted(intervals, key=lambda interval: interval[0])

    # Step 2 — sweep left to right, fusing overlaps into the last result
    merged: List[List[int]] = [ordered[0][:]]

    for start, end in ordered[1:]:
        last = merged[-1]
        if start <= last[1]:
            last[1] = max(last[1], end)
        else:
            merged.append([start, end])

    return merged


def trace(intervals: List[List[int]]) -> dict:
    """
    Re-runs the algorithm while recording every decision the sweep makes.
    This is the data the HyperFrames visualization is built from — each
    entry in `steps` corresponds 1:1 with a beat in the video.
    """
    record = {
        "input": [iv[:] for iv in intervals],
        "sorted": sorted((iv[:] for iv in intervals), key=lambda iv: iv[0]),
        "steps": [],
    }

    ordered = record["sorted"]
    merged: List[List[int]] = [ordered[0][:]]
    record["steps"].append({
        "candidate": ordered[0][:],
        "action": "seed",
        "detail": f"First interval after sorting — start the result with {ordered[0]}.",
        "merged_snapshot": [iv[:] for iv in merged],
    })

    for start, end in ordered[1:]:
        last = merged[-1]
        if start <= last[1]:
            new_end = max(last[1], end)
            detail = (
                f"{[start, end]} starts at {start}, which is <= {last[1]} "
                f"(the end of {last[:]}) — they overlap. "
                f"Stretch the end to max({last[1]}, {end}) = {new_end}."
            )
            last[1] = new_end
            action = "merge"
        else:
            detail = (
                f"{[start, end]} starts at {start}, which is > {last[1]} "
                f"(the end of {last[:]}) — no overlap. "
                f"Start a new group with {[start, end]}."
            )
            merged.append([start, end])
            action = "append"

        record["steps"].append({
            "candidate": [start, end],
            "action": action,
            "detail": detail,
            "merged_snapshot": [iv[:] for iv in merged],
        })

    record["output"] = merged
    return record


if __name__ == "__main__":
    example = [[8, 10], [1, 3], [2, 6], [15, 18]]

    print("input :", example)
    print("output:", merge(example))
    print()

    log = trace(example)
    print("sorted by start time:", log["sorted"])
    print()
    for i, step in enumerate(log["steps"], start=1):
        print(f"step {i}: candidate={step['candidate']}  action={step['action']}")
        print(f"        {step['detail']}")
        print(f"        merged so far -> {step['merged_snapshot']}")
    print()
    print("final merged result:", log["output"])

    # sanity checks against known cases
    assert merge([[1, 3], [2, 6], [8, 10], [15, 18]]) == [[1, 6], [8, 10], [15, 18]]
    assert merge([[1, 4], [4, 5]]) == [[1, 5]]
    assert merge([[1, 4], [0, 4]]) == [[0, 4]]
    assert merge([[1, 4], [2, 3]]) == [[1, 4]]
    assert merge([[1, 4]]) == [[1, 4]]
    print("\nall checks passed")
