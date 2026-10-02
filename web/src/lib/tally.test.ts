import { describe, expect, it } from 'vitest';

import { bucketVotesByTime, compareTallies, recomputeTally } from './tally';

function vote(candidateIndex: number, timestamp = 1_000) {
  return { candidateIndex, timestamp };
}

describe('recomputeTally', () => {
  it('counts votes per candidate', () => {
    expect(recomputeTally([vote(0), vote(2), vote(0), vote(1)], 3)).toEqual([2, 1, 1]);
  });

  it('returns zeros for no votes', () => {
    expect(recomputeTally([], 4)).toEqual([0, 0, 0, 0]);
  });

  it('ignores out-of-range candidate indices instead of crashing', () => {
    expect(recomputeTally([vote(0), vote(9), vote(-1), vote(1)], 2)).toEqual([1, 1]);
  });

  it('handles zero candidates', () => {
    expect(recomputeTally([vote(0)], 0)).toEqual([]);
  });
});

describe('compareTallies', () => {
  it('matches identical tallies with an all-zero diff', () => {
    expect(compareTallies([10, 4, 7], [10, 4, 7])).toEqual({ match: true, diff: [0, 0, 0] });
  });

  it('reports per-candidate diffs on mismatch', () => {
    expect(compareTallies([10, 4, 7], [10, 7, 4])).toEqual({ match: false, diff: [0, -3, 3] });
  });

  it('treats different lengths as a mismatch and pads the diff', () => {
    expect(compareTallies([10, 4], [10, 4, 1])).toEqual({ match: false, diff: [0, 0, -1] });
    expect(compareTallies([10, 4, 1], [10, 4])).toEqual({ match: false, diff: [0, 0, 1] });
  });

  it('matches two empty tallies', () => {
    expect(compareTallies([], [])).toEqual({ match: true, diff: [] });
  });
});

describe('bucketVotesByTime', () => {
  it('returns no buckets for no votes', () => {
    expect(bucketVotesByTime([], 12)).toEqual([]);
    expect(bucketVotesByTime([vote(0)], 0)).toEqual([]);
  });

  it('collapses votes at a single instant into one bucket', () => {
    expect(bucketVotesByTime([vote(0), vote(1)], 12)).toEqual([
      { start: 1_000, end: 1_000, cumulative: 2, count: 2 }
    ]);
  });

  it('builds a cumulative curve across buckets', () => {
    const buckets = bucketVotesByTime(
      [vote(0, 0), vote(1, 10), vote(0, 20), vote(2, 30)],
      3
    );
    expect(buckets).toHaveLength(3);
    expect(buckets.map((bucket) => bucket.count)).toEqual([1, 1, 2]);
    expect(buckets.map((bucket) => bucket.cumulative)).toEqual([1, 2, 4]);
    expect(buckets[0]?.start).toBe(0);
    expect(buckets[2]?.end).toBe(30);
  });

  it('carries the running total through empty buckets', () => {
    const buckets = bucketVotesByTime([vote(0, 0), vote(0, 0), vote(1, 0), vote(2, 90)], 4);
    expect(buckets).toHaveLength(4);
    expect(buckets.map((bucket) => bucket.count)).toEqual([3, 0, 0, 1]);
    expect(buckets.map((bucket) => bucket.cumulative)).toEqual([3, 3, 3, 4]);
  });

  it('caps bucket count at the vote count and sorts out-of-order votes', () => {
    const buckets = bucketVotesByTime([vote(1, 50), vote(0, 0), vote(2, 25)], 10);
    expect(buckets).toHaveLength(3);
    expect(buckets[2]?.cumulative).toBe(3);
  });

  it('never emits NaN bounds', () => {
    for (const bucket of bucketVotesByTime([vote(0, 5), vote(0, 5), vote(1, 9)], 5)) {
      expect(Number.isFinite(bucket.start)).toBe(true);
      expect(Number.isFinite(bucket.end)).toBe(true);
    }
  });
});
