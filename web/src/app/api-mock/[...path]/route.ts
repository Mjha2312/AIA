/**
 * Mock backend for local development.
 *
 * `/api-mock/api/...` mirrors `docs/SPEC.md` one-to-one, and the typed client in
 * `src/lib/api.ts` points here when `NEXT_PUBLIC_USE_MOCKS=true`.
 */
export { GET, POST } from '@/mocks/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';