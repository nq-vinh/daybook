# Daybook

Daybook is a business-banking dashboard for a fictional small company: accounts, a ledger of 100,000 transactions, a cash-flow chart with a forecast, budgets, team cards and a live feed of card payments.
The world is seeded and deterministic, so every number on every screen is the same on every load.
There is no backend: the app is static files, the data is generated in the browser and in a worker, and the only runtime dependencies are `react` and `react-dom`.

## Measured

Every number below was measured in the running app, the built bundle or the package manifest, and the ones marked CI are asserted on every push.

| Metric | Value | How it was measured |
| --- | --- | --- |
| Initial JavaScript, gzip | 85,963 bytes against an 87,040-byte budget | `npm run build && npm run verify:bundle`: walks the Vite manifest from the entry chunk and gzips every statically imported chunk (CI) |
| INP, filter and search | longest interaction 16 to 24 ms across five local runs on a 4x CPU throttle, budget 50 ms | `tests/e2e/perf.spec.ts`: Chromium at 1440 x 950, CDP CPU throttle 4, a `PerformanceObserver` on `event` entries over six interactions (typing, a filter checkbox, a sort header, Enter on a row) (CI asserts the 50 ms budget) |
| DOM rows while scrolling 100,000 | 35 mid-scroll, 29 at the end | `tests/e2e/ledger.spec.ts`: counts `tbody tr` at 1440 x 950 while `aria-rowcount` reports the full set (CI) |
| Re-renders per feed event | one row and one ledger commit | `src/pages/transactions.test.tsx`, "TransactionsPage live feed": a `<Profiler>` per row and one around the ledger; zero rows when the payment is outside the visible window (CI) |
| Contrast pairs | 30 pairs, all at or above WCAG AA, in both themes | measured at runtime on `/design` (asserted by `tests/e2e/design.spec.ts`) and guarded by `tests/unit/tokens-contrast.test.ts` (CI) |
| Cumulative layout shift | 0 | `tests/e2e/overview.spec.ts`: a `layout-shift` observer on cold loads of `/` through five feed arrivals and of `/transactions`; Lighthouse CLS 0 on all three routes (CI) |
| Lighthouse, desktop | 100 / 100 / 100 / 100 (performance, accessibility, best practices, SEO) on `/`, `/transactions` and `/design` | `npm run lighthouse`: `@lhci/cli` with the desktop preset against `vite preview` of `dist`, median of three runs per route, every category asserted at 100 and CLS at 0 (CI) |
| Lighthouse, mobile | performance 97 on `/` and `/transactions`, 94 on `/design`; accessibility, best practices and SEO 100; CLS 0 | the same config with Lighthouse's default mobile settings, median of three runs; measured, not asserted, because nothing paints until the initial JavaScript has loaded on simulated slow 4G |
| Runtime dependencies | 2 (`react`, `react-dom`) | `scripts/verify-bundle.mjs` fails on anything else in `dependencies` (CI) |

## Run

Use the Node version in `.nvmrc` (22).

```sh
npm ci
npm run dev          # development server
npm test             # Vitest unit and component tests
npm run build        # type-check and production build into dist
npm run test:e2e     # Playwright against vite preview of dist: axe, CSP, keyboard, performance
npm run lighthouse   # Lighthouse CI against vite preview of dist, reports in output/lighthouse
npm run screenshots  # 1440 x 950 at 2x, light and dark, into output/screenshots
```

`test:e2e`, `lighthouse` and `screenshots` serve the built `dist`, so run `npm run build` first.

## Determinism

The world has a fixed today, `2026-09-16T12:00:00Z`, and 36 months of history ending on it.
`transaction(i)` is a pure random-access function of the index: it seeds its own PRNG stream from the world seed `0xDA7B00` and the index, so the main thread and the worker generate the same rows independently.
A Vitest test generates the world twice and pins its fingerprint, `3adee14c`, as an inline snapshot.
The live feed is a seeded schedule of 60 events driven by `setTimeout` chains, so two visitors who open the app at the same moment see the same feed.
`Math.random`, `Date.now` and argument-less `new Date()` are banned in `src` by ESLint (`no-restricted-properties` and `no-restricted-syntax`) and by `tests/unit/source-bans.test.ts`; the only exceptions are the feed clock (`src/state/feed.ts`) and the performance HUD (`src/state/hud.ts`).

## Design system

The direction is ledger ink: a ruled book of first entry, with a paper surface, ink text, horizontal rules instead of boxes, tabular figures, and a bottle green accent that reads as ink rather than fintech; dark mode is a slightly green-black ink paper.
Tokens live in `src/styles/tokens.css` as semantic roles with `light-dark()` values, a fluid type scale, a 4 px space scale, radii, shadows and motion durations that reduced motion sets to 0; `prefers-contrast: more` and `forced-colors: active` adjust the same tokens.
The component library in `src/ui/` is plain CSS Modules with no `style` props and no `!important`, and the `/design` page is its documentation: it renders every token with the value the browser resolved and measures every contrast pair at runtime in the current theme.
There are no positioning libraries: Menu and Tooltip use the Popover API and CSS anchor positioning, and the chart tooltip is placed the same way.
Manual memoisation is banned by ESLint; the React Compiler does it.

## Architecture

- Router: hand-rolled on the History API in `src/router/`, with route matching, focus to the page `h1`, a polite route announcer, per-entry scroll restoration and view transitions on Back and Forward.
- Ledger worker: builds an index over all 100,000 transactions once and answers filter, search, sort and aggregate requests with ids only, as an `Int32Array` whose buffer is transferred; the main thread renders each visible row from `transaction(id)`.
- External stores: history, theme, the live feed, edits and the HUD are stores read through `useSyncExternalStore`, so a feed event re-renders only the rows and tiles it changes.
- Optimistic layer: category edits, card freezes and budget edits are pending actions merged over the persisted edits, committed after a simulated 400 ms latency, each with an undo toast.
- Charts: the cash-flow chart and the sparklines are drawn on `<canvas>` at device pixel ratio from series computed in the worker; the chart has a keyboard cursor, a text summary and a table fallback.

## Hosting

The build is host-agnostic static files deployed to Azure Static Web Apps.
`public/staticwebapp.config.json` is copied into `dist` and carries the SPA fallback, immutable caching for hashed assets, HSTS and the Content Security Policy: no `'unsafe-inline'`, with one sha256 hash for the theme bootstrap script; `vite preview` serves the same headers, so the Playwright suite asserts zero CSP violations against the real policy.
CI (`.github/workflows/ci.yml`) runs one job: lint, unit tests, build, `verify:bundle`, Playwright, Lighthouse CI, and on pushes to `main` a deploy of the already-built `dist`.
Live at https://daybook.nqvinh.tech.
