import { Phase } from '@/lib/phases';
import type { Election } from '@/lib/schemas';

/** Same three elections as `src/mocks/store.ts`, in three different phases. */
export const elections: Election[] = [
  {
    id: '1',
    constituencyId: 'KA-001 · Bengaluru North East',
    candidates: ['Anitha R.', 'B. Suresh Kumar', 'Farida Qureshi', 'Gururaj P.', 'N. Vinod Singh'],
    phase: Phase.Voting,
    registeredCount: 12_400,
    votedCount: 4_683,
    turnoutPct: 37.8,
    tally: null
  },
  {
    id: '2',
    constituencyId: 'MH-014 · Pune Sadashiv Nagar',
    candidates: ['Meera Joshi', 'Rakesh Yadav', 'Sana Ansari'],
    phase: Phase.Registration,
    registeredCount: 486,
    votedCount: 0,
    turnoutPct: 0,
    tally: null
  },
  {
    id: '3',
    constituencyId: 'TN-021 · Chennai Central',
    candidates: ['Karthik Raman', 'Lakshmi Iyer', 'Priya Nair', 'S. Arun Kumar'],
    phase: Phase.Finalized,
    registeredCount: 9_802,
    votedCount: 8_124,
    turnoutPct: 82.9,
    tally: [1_951, 2_004, 2_077, 2_092]
  }
];