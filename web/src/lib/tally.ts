import type { Vote } from './schemas';

/**
 * Tally verification. Every function here is pure and runs entirely in the
 * browser: the explorer fetches the public vote list, recomputes the tally
 * locally, and compares it against the official tally from the API. No voter
 * identity is involved — votes are public by SPEC design.
 */

/** Count votes per candidate, ignoring out-of-range indices. */
export function recomputeTally(votes: Pick<Vote, 'candidateIndex'>[], candidateCount: number): number[] {
  const tally = Array.from({ length: Math.max(0, candidateCount) }, () => 0);
  for (const vote of votes) {
    if (vote.candidateIndex >= 0 && vote.candidateIndex < tally.length) {
      tally[vote.candidateIndex] = (tally[vote.candidateIndex] ?? 0) + 1;
    }
  }
  return tally;
}

export interface TallyComparison {
  match: boolean;
  /** `chain[i] - other[i]`, padded to the wider of the two tallies. */
  diff: number[];
}

/** Compare the on-chain tally against a recomputed or EVM tally. */
export function compareTallies(chainTally: number[], other: number[]): TallyComparison {
  const width = Math.max(chainTally.length, other.length);
  const diff = Array.from({ length: width }, (_, index) => (chainTally[index] ?? 0) - (other[index] ?? 0));
  return {
    match: chainTally.length === other.length && diff.every((value) => value === 0),
    diff
  };
}

export interface TimeBucket {
  /** Bucket start as epoch seconds. */
  start: number;
  /** Bucket end as epoch seconds (exclusive, except the last bucket). */
  end: number;
  /** Votes cast up to and including this bucket. */
  cumulative: number;
  /** Votes cast inside this bucket. */
  count: number;
}

/**
 * Bucket votes into `bucketCount` equal time slices between the first and
 * last vote, with running totals for the votes-over-time chart. Degenerate
 * inputs (no votes, a single instant) collapse to fewer buckets, never NaN.
 */
export function bucketVotesByTime(
  votes: Pick<Vote, 'timestamp'>[],
  bucketCount: number
): TimeBucket[] {
  if (votes.length === 0 || bucketCount <= 0) return [];
  const sorted = [...votes].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0]?.timestamp ?? 0;
  const last = sorted[sorted.length - 1]?.timestamp ?? 0;
  if (last <= first) {
    return [{ start: first, end: first, cumulative: sorted.length, count: sorted.length }];
  }

  const count = Math.max(1, Math.min(bucketCount, sorted.length));
  const width = (last - first) / count;
  const buckets: TimeBucket[] = Array.from({ length: count }, (_, index) => ({
    start: first + index * width,
    end: index === count - 1 ? last : first + (index + 1) * width,
    cumulative: 0,
    count: 0
  }));

  let running = 0;
  let bucketIndex = 0;
  for (const vote of sorted) {
    while (bucketIndex < count - 1 && vote.timestamp >= (buckets[bucketIndex]?.end ?? 0)) {
      bucketIndex += 1;
    }
    const bucket = buckets[bucketIndex];
    if (!bucket) break;
    bucket.count += 1;
    running += 1;
    bucket.cumulative = running;
  }
  // Fill buckets that received no votes with the running total before them.
  let carried = 0;
  for (const bucket of buckets) {
    if (bucket.count === 0) bucket.cumulative = carried;
    else carried = bucket.cumulative;
  }
  return buckets;
}
