import { api } from './api';
import type { Vote } from './schemas';

/**
 * Fetch every vote for an election by walking the cursor pages.
 *
 * Bounded on purpose: `pageLimit` matches the backend maximum (200) and
 * `maxVotes` caps pathological elections, reporting `truncated` so the UI can
 * say the verification covers the first N votes. Progress callbacks feed the
 * "verify tally" progress bar.
 */

export const DEFAULT_VOTES_PAGE_LIMIT = 200;
export const DEFAULT_MAX_VOTES = 20_000;

export interface FetchAllVotesOptions {
  pageLimit?: number;
  maxVotes?: number;
  signal?: AbortSignal;
  onProgress?: (loaded: number) => void;
}

export interface FetchAllVotesResult {
  votes: Vote[];
  truncated: boolean;
}

export async function fetchAllVotes(
  electionId: string,
  options: FetchAllVotesOptions = {}
): Promise<FetchAllVotesResult> {
  const pageLimit = options.pageLimit ?? DEFAULT_VOTES_PAGE_LIMIT;
  const maxVotes = options.maxVotes ?? DEFAULT_MAX_VOTES;
  const votes: Vote[] = [];
  let cursor: string | undefined;
  let truncated = false;

  for (;;) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const page = await api.getVotes(electionId, { cursor, limit: pageLimit }, options.signal);
    votes.push(...page.items);
    options.onProgress?.(votes.length);
    if (votes.length >= maxVotes) {
      truncated = true;
      return { votes: votes.slice(0, maxVotes), truncated };
    }
    if (!page.nextCursor) return { votes, truncated };
    cursor = page.nextCursor;
  }
}
