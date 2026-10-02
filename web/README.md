# web — voter app + explorer (owner: frontend dev)

Owned by the frontend dev. Other devs: do not edit.

Next.js 14 (App Router) + TypeScript strict + Tailwind + next-intl + wagmi/viem
(admin only) + React Query + zod, built against `../docs/SPEC.md`.

## Run

```sh
cp .env.example .env.local   # never commit .env.local
npm install
npm run dev                  # http://localhost:3000 redirects to /en
```

With `NEXT_PUBLIC_USE_MOCKS=true` (the value in `.env.example`) the whole UI runs
with no backend: every SPEC `GET`/`POST` is served by Next route handlers under
`/api-mock`, with three demo elections — one in Voting, one in Registration, one
Finalized. Live turnout polls `/api-mock/api/ws`; with mocks off it uses the SPEC
`WebSocket /ws` feed instead (`src/lib/live.ts` hides that difference).

## Checks

```sh
npm run lint && npm run typecheck && npm test && npm run i18n:check && npm run build
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/app/[locale]/` | Routes, one per SPEC page, each locale prefixed |
| `src/app/api-mock/[...path]/` | Mock backend, mirrors the SPEC REST API 1:1 |
| `src/components/` | Layout chrome, elections list, live turnout |
| `src/i18n/` | Locale registry, routing, request config, navigation wrappers |
| `src/lib/api.ts` | Typed client, one function per SPEC endpoint |
| `src/lib/schemas.ts` | zod schemas and types, hand-written from the SPEC |
| `src/lib/live.ts` | WebSocket or polling subscription over one API |
| `messages/*.json` | One file per locale, `en.json` is the source of truth |

## Adding a language

1. append the code to `locales` in `src/i18n/locales.ts`
2. add its endonym to `localeNames` in the same file
3. add `messages/<code>.json`

`npm run i18n:check` fails if any locale misses a key present in `en.json`, or if
a message file exists without being registered. Scripts needing a new font face
get a `next/font/google` family in `src/app/[locale]/layout.tsx` plus a variable in
`tailwind.config.ts`.

## Notes for reviewers

- **Translations.** `en`, `hi`, `ta`, `bn`, `te`, `mr` are complete for every
  string that exists today. They were machine drafted: each file carries a
  `_review` block with a `TODO-review` note and the least confident keys. An
  official ECI translator must sign them off before any pilot.
- **Contrast.** Saffron and flag green are decorative only; text uses the
  `-600`/`-700`/`-800` shades so every measured pair clears WCAG AA (72 pairs
  checked across the six locales).
- **Wallet.** wagmi is mounted in `src/app/[locale]/admin/layout.tsx` only —
  voters never sign anything, so the SDKs stay out of the voter bundle.
- **Spec ambiguity.** `phase` is a numeric enum on chain but the JSON envelope is
  unspecified in the SPEC, so the client accepts either the number or the enum
  name and normalises to the number.
- `next.config.mjs` aliases eight optional imports of unused wagmi connectors
  (seven `@x402/*` plus `@react-native-async-storage/async-storage`) to an empty
  module; without it the webpack build fails even though only the injected
  connector is used.