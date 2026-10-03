import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ElectionCardSkeleton } from './election-skeleton';
import { ElectionsList } from './elections-list';
import { elections } from '@/test/fixtures';
import { jsonResponse, renderWithI18n } from '@/test/render';
import { vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();

describe('ElectionCardSkeleton', () => {
  it('renders hidden placeholder shapes, never content', () => {
    const { container } = renderWithI18n(<ElectionCardSkeleton />);

    const skeleton = container.firstElementChild;
    expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('ElectionsList loading state', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows skeleton cards plus a single live status while fetching', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    const { container } = renderWithI18n(<ElectionsList />);

    // One announcement for assistive tech…
    expect(screen.getByRole('status')).toHaveTextContent('Loading elections…');
    // …and instant visual placeholders for sighted users.
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('replaces skeletons with real cards once loaded', async () => {
    fetchMock.mockResolvedValue(jsonResponse(elections));

    const { container } = renderWithI18n(<ElectionsList />);

    expect(await screen.findByText('KA-001 · Bengaluru North East')).toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton')).toHaveLength(0);
  });
});
