# Daybook - architecture spec

This is the internal build spec.
It is the single source of truth for design decisions; implementation stages must follow it or record a deviation in NOTES.md with reasoning.
The public-facing README and the portfolio case study are separate deliverables written at the end.
"Daybook" is a working name (the book of first entry in bookkeeping); rename before the repo goes public if a better one turns up.

## Why this project exists

A React project for the portfolio that demonstrates three things in one app: production-grade React, a design system and UI library built from scratch in plain CSS, and performance that is measured in the running app and asserted in CI.
It sits beside Facet (Vue) and PipeScope (Angular) and follows the same discipline: deterministic data, visitor-verifiable numbers, accessibility down to the last widget.
It must not read as a React port of Facet.
Every performance story here is React-specific or domain-specific; the virtualised table is a supporting feature, not the headline.

## Product

A business-banking dashboard for a fictional SME: accounts, a transaction ledger, cash-flow chart with a forecast, budgets per category, team cards with spend limits, and a live feed of incoming card payments.
Fully client-side.
No backend, no runtime network requests beyond the app's own static assets.
Build output is host-agnostic static files; the host provides an SPA fallback rewrite.

## Stack

- React 19.x (latest stable at project start) with the React Compiler enabled through the official Babel plugin in Vite. No manual `memo`, `useMemo`, or `useCallback` anywhere; an ESLint rule bans them so the compiler claim stays honest.
- TypeScript strict, `noUncheckedIndexedAccess: true`. Never `any`, never non-null assertions.
- Vite (latest), npm, Node 22 pinned in `.nvmrc`.
- Plain CSS through CSS Modules with design tokens. No CSS-in-JS, no utility framework, no component library, no state-management library, no routing library, no date or money library.
- Runtime dependencies: `react`, `react-dom`. Nothing else. `scripts/verify-bundle.mjs` fails the build if `package.json` dependencies list anything more.
- System font stack. Zero third-party requests.
- Routing is hand-rolled on the History API in `src/router/` (about 100 lines): route matching, `<Link>`, focus management to the new page `h1`, a polite route announcer, scroll restoration, and `document.startViewTransition` when available. This is the one piece of infrastructure written by hand and it is documented as such in NOTES.md.

## Repository layout

```
src/
  main.tsx                createRoot + router + app shell
  app.tsx                 shell: skip link, header (wordmark, account switcher, search, theme switch), nav, main landmark, live region, toast region
  router/                 history, matching, Link, announcer, view transitions
  pages/
    overview.tsx          /                balances, cash-flow chart + forecast, top categories, latest activity
    transactions.tsx      /transactions    ledger: filters, search, virtualised table, bulk categorise
    transaction.tsx       /transactions/:id detail with attachments placeholder, category, notes, counterparty history
    cards.tsx             /cards           team cards, limits, per-card spend
    budgets.tsx           /budgets         budgets per category, progress, forecast to month end
    design.tsx            /design          the design system page (tokens, components, states, measured contrast)
  ui/                     the component library (see Design system)
  domain/
    prng.ts               seeded PRNG primitives (same scheme as Facet: splitmix32 hash-combine, mulberry32 streams)
    world.ts              accounts, cards, counterparties, categories, budgets
    transactions.ts       index -> Transaction, pure and random-access
    fx.ts                 fixed deterministic FX table and conversion
    format.ts             Intl-based money, date, relative time, percent; locale aware
    forecast.ts           cash-flow forecast (seasonal moving average over the seeded history)
  state/
    url.ts                FilterState <-> URLSearchParams (round-trip safe)
    query.ts              hook: route query -> worker -> results, with useDeferredValue and useTransition
    feed.ts               external store for the live payments feed, consumed with useSyncExternalStore
    edits.ts              external store for user edits (categories, notes, budgets) persisted in localStorage
    hud.ts                PerformanceObserver metrics (INP, long tasks, DOM nodes, draw rate)
  worker/
    ledger.worker.ts      builds the index over all transactions, answers filter/search/aggregate queries
    protocol.ts           typed request/response messages
  styles/
    tokens.css            colour, space, type, radius, shadow, motion, z-index tokens; light, dark, contrast, forced-colors
    base.css              reset, typography, focus ring, skip link, print
scripts/
  verify-bundle.mjs       runtime dependency count, gzipped size budget, no forbidden markers in output
tests/                    Playwright specs, axe, CSP violation check
```

## Determinism and the PRNG

- `Math.random` and `Date.now` outside `src/state/feed.ts` and `src/state/hud.ts` are banned by ESLint `no-restricted-properties` and a unit test over the source.
- Single world seed constant: `0xDA7B00`.
- `transaction(i)` is a pure random-access function of the index; the main thread and the worker generate the same world independently. A Vitest test asserts identical worlds across two generations and pins a snapshot of a few transactions.
- The world has a fixed "today": the seeded history spans 36 months ending on a constant date, so every number on every screen is identical on every load and screenshots never age.
- The live feed is deterministic too: a seeded sequence of events with a fixed schedule of offsets from app start, so two visitors who load the app at the same moment see the same feed, and a Playwright test can assert the exact fifth event.

## Domain model

```ts
interface Account { id: string; name: string; iban: string; currency: Currency; openingBalance: number }
interface Card { id: string; holder: string; last4: string; accountId: string; monthlyLimit: number; status: 'active' | 'frozen' }
interface Counterparty { id: string; name: string; kind: 'supplier' | 'customer' | 'employee' | 'tax' | 'platform' }
interface Transaction {
  id: number                 // 0..99_999, also the URL param
  accountId: string
  cardId?: string            // card payments only
  counterpartyId: string
  amount: number             // integer minor units, negative = debit
  currency: Currency         // 'EUR' | 'USD' | 'GBP'; converted to account currency via fx.ts for totals
  bookedAt: number           // epoch ms within the 36-month window
  category: CategoryId       // 14 categories (software, travel, office, salaries, tax, marketing, revenue, ...)
  status: 'booked' | 'pending' | 'declined'
  reference: string
  vatRate: 0 | 7 | 19
}
interface Budget { categoryId: CategoryId; monthlyAmount: number }
```

- 100,000 transactions across 3 accounts and 12 cards, weighted toward recent months, with recurring patterns (salaries on the 25th, rent on the 1st, SaaS subscriptions monthly) so the forecast has something real to find.
- About 3% pending, 1% declined.
- Counterparty names, references, and card holders are invented; nothing resembles a real company or person.

## URL as the only filter state

All ledger state lives in the query string; there is no filter store.

| Param      | Meaning                     | Form                                   |
| ---------- | --------------------------- | -------------------------------------- |
| `q`        | search term                 | string, matches counterparty and reference |
| `account`  | account filter              | id                                     |
| `cat`      | categories                  | comma-separated ids                    |
| `card`     | cards                       | comma-separated ids                    |
| `status`   | statuses                    | comma-separated                        |
| `from`/`to`| booked date range           | ISO date                               |
| `min`/`max`| amount range in minor units | integers                               |
| `sort`     | column and direction        | `bookedAt:desc` etc.                   |

Parsing is tolerant (unknown values dropped) and serialisation is canonical (sorted, defaults omitted) so back/forward and sharing behave.

## Design system

The library in `src/ui/` is the product's foundation and the `/design` page is its documentation.
Each component is a folder with `Component.tsx`, `Component.module.css`, `Component.test.tsx`.

Tokens (`tokens.css`): semantic colour roles (surface, surface-raised, text, text-muted, accent, positive, negative, warning, border, focus), a fluid type scale with `clamp()`, a 4 px space scale, radii, shadows, motion durations and easings, z-index layers.
Light and dark via `prefers-color-scheme` with `:root[data-theme]` overrides persisted under `theme`; `prefers-contrast: more` and `forced-colors: active` adjust the same tokens; `prefers-reduced-motion` zeroes the motion tokens.

Components, with the behaviour each owns:

- `Button`, `IconButton`: variants, loading state, `aria-busy`.
- `TextField`, `NumberField` (money input with `Intl` formatting on blur), `Select` (native `<select>` styled), `Checkbox`, `Switch`, `DateRangeField`.
- `Menu` and `Tooltip`: Popover API plus CSS anchor positioning, no positioning library, full roving-focus menu keyboard pattern, escape and outside-click dismissal come from the platform.
- `Dialog`: native `<dialog>`, focus trap from the platform, return focus on close.
- `Tabs`: automatic activation, arrow keys, `aria-controls`.
- `Table`: real `<table>` with `role="grid"` when virtualised, `aria-rowcount` over the full set, roving focus that survives row recycling, Home, End, PageUp, PageDown, sortable headers with `aria-sort`.
- `Toast` region: polite live region, action button (undo), pause on hover and focus, dismissed by time or by the user.
- `Badge`, `StatTile`, `ProgressBar` (with `<meter>` semantics), `Skeleton`, `EmptyState`, `Avatar` (initials, deterministic colour).
- `ThemeSwitch`: tri-state system, light, dark.

Rules:

- No `style` props and no inline `<style>`. Dynamic values go through CSS custom properties set via refs on the element's `style` object (CSSOM, not blocked by CSP) or through data attributes. The CSP has no `'unsafe-inline'` and the Playwright run asserts zero violations against the real header.
- No `!important`. Specificity stays flat through CSS Modules and `:where()`.
- Every interactive component has a visible focus ring from the shared token and a test for its keyboard contract.
- The `/design` page renders every token swatch with its resolved value and its contrast ratio measured at runtime against its paired text colour, and every component in every state, with the keyboard contract written next to it.

## Pages

- `/` Overview: balance tiles per account with a 30-day sparkline, the cash-flow chart (12 months booked plus 3 months forecast, shaded), top five categories this month, latest ten transactions, and the live feed card.
- `/transactions`: filter sidebar (collapses to a disclosure under 900 px), search, the virtualised ledger, selection with a bulk categorise action bar, totals for the current result set (count, debits, credits, net) computed in the worker.
- `/transactions/:id`: detail, category change with optimistic update and undo, notes, counterparty history (last 12 transactions with that counterparty), link back preserving the ledger query.
- `/cards`: card list with spend against limit this month, freeze toggle (optimistic), per-card ledger link.
- `/budgets`: budget per category, progress this month, projected month-end from the forecast, edit amounts.
- `/design`: design system documentation, see above.
- Not found: a 404 state at the router level with a link home.

## State and data flow

- Filters: URL only. `query.ts` parses the route, posts to the worker, and exposes `{ results, totals, isStale }`; typing in search goes through `useDeferredValue`, filter changes through `useTransition`, so the previous result set stays interactive while the next one computes.
- Worker: builds a per-field index over all 100,000 transactions once, answers filter, search, sort, page-window, and aggregate requests. Transferables for result windows. Typed protocol in `protocol.ts`.
- Live feed: `feed.ts` is an external store with `subscribe`/`getSnapshot`, driven by a scheduled seeded sequence. The ledger subscribes per row key and the overview tiles subscribe to totals, so a feed event re-renders exactly the affected row and the tiles.
- Edits: `edits.ts` is an external store persisted in localStorage (categories, notes, budgets, card status). Edits are an overlay on the seeded world; the world itself never mutates.
- Optimistic actions: `useOptimistic` for category changes, card freeze, budget edits, with a toast carrying undo; commits land in `edits.ts` after a simulated 400 ms latency so the optimistic path is visible and testable.
- Charts: cash-flow and sparklines are drawn on `<canvas>` at device pixel ratio from series computed in the worker; each chart has a `<table>` fallback in a disclosure and a text summary for assistive tech. Hover and focus reveal a tooltip through anchor positioning; keyboard users move the cursor with arrow keys.

## Performance commitments

All numbers are measured in the running app before they appear in a caption, hook, or README, and the ones marked CI are asserted on every push.

- Runtime dependencies: 2 (CI, `verify-bundle.mjs`).
- Initial JavaScript, gzipped: budget 90 KB; the measured number replaces the budget in NOTES.md after Stage 2 and tightens the assertion (CI).
- Zero wasted re-renders: a Vitest test wraps the ledger in `<Profiler>` and asserts that a feed event commits exactly one row and the tiles, and that a search keystroke commits nothing outside the search field until the deferred value settles (CI).
- No manual memoisation anywhere (CI, ESLint).
- INP under 50 ms for filter and search interactions on a 4x CPU throttle; measured by the in-app HUD and by a Playwright trace (CI for the trace, HUD for the visitor).
- 23-ish DOM rows while scrolling 100,000; `aria-rowcount` reports the full set (CI).
- Lighthouse 100 in all four categories on `/`, `/transactions`, `/design`; CLS 0.000 (CI via `@lhci/cli` or a scripted Lighthouse run, whichever Facet or PipeScope already proved out).
- axe: zero violations on every page in light and dark (CI).
- CSP: zero violations against the real header (CI).

## Accessibility contract

- Semantic landmarks, one `h1` per page, strict heading order, skip link, route announcer, focus to the page `h1` on navigation.
- Every widget keyboard-operable with its ARIA pattern tested in Vitest with Testing Library and user-event.
- Live feed announces through a throttled polite live region (at most one announcement per 5 s) and can be paused.
- Charts have table fallbacks and text summaries; colour is never the only carrier of meaning (debit and credit also differ by sign and icon).
- Contrast WCAG AA at minimum in both themes, verified by the `/design` page's runtime measurements and by axe.
- `prefers-reduced-motion` disables view transitions, sparkline animation, and skeleton shimmer.

## Testing

- Vitest with Testing Library and user-event for components, hooks, the router, the PRNG, the URL codec, the forecast, and the Profiler re-render tests.
- Playwright for every page: keyboard walkthroughs, axe via `@axe-core/playwright`, CSP violation listener, the HUD numbers, the exact fifth feed event, screenshots at 1440x950 with `deviceScaleFactor: 2` for the portfolio gallery.
- ESLint flat config: `typescript-eslint` `strictTypeChecked`, `eslint-plugin-react-hooks` (including the compiler rules), `eslint-plugin-jsx-a11y`, the memoisation and randomness bans.
- No Prettier; formatting follows the ESLint config, matching Facet.

## CI/CD and hosting

- Single `verify` job in `.github/workflows/ci.yml`: lint, Vitest, build, `verify:bundle`, Playwright with axe, Lighthouse. A final main-only step deploys the already-built `dist` to Azure Static Web Apps with `skip_app_build: true` and the `AZURE_STATIC_WEB_APPS_API_TOKEN` secret. No double build.
- Azure SWA app `daybook` in resource group `portfolio-rg`, East Asia, Free tier, same account as the portfolio. Custom domain `daybook.nqvinh.tech` via a DNS-only Cloudflare CNAME to the default hostname; Azure manages the certificate.
- `staticwebapp.config.json` lives in `public/` so Vite copies it into `dist`; a root-level copy would be silently ignored. It carries the SPA fallback, security headers, immutable caching for hashed assets, and the CSP: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- HSTS one year with `preload` once the domain is live.

## Stages

Each stage is one `deep` spawn of under 60 tool calls, followed by one verifier and one reviewer round in parallel, then at most two fix rounds.
The implementer lints, runs unit tests, and builds once at the end of its round; it does not open a browser.

0. **Scaffold.** Vite + React + TypeScript + React Compiler, ESLint flat config with all bans, Vitest and Playwright wired, `verify-bundle.mjs`, `tokens.css` and `base.css`, the router with announcer and view transitions, the app shell, empty pages. Done means: lint, test, build, and `verify:bundle` pass on an empty app with the dependency count at 2.
1. **World and library.** PRNG, world, transactions, FX, format, forecast with their tests; the component library with tests and the `/design` page with runtime contrast. Done means: every component's keyboard contract has a passing test; `/design` renders every token and component state; axe clean on `/design`.
2. **Ledger.** Worker and protocol, URL codec, `query.ts`, the virtualised `Table`, filter sidebar, search, totals, bulk categorise, the detail page. Done means: 100,000 rows scroll with the DOM row count measured; INP under budget in a Playwright trace; URL round-trips; the Profiler keystroke test passes.
3. **Live and optimistic.** Feed store and schedule, per-row subscriptions, the Profiler feed test, `useOptimistic` flows with undo toasts, cards and budgets pages. Done means: the feed test asserts exactly one row commit; the fifth feed event is asserted in Playwright; undo restores state in both stores.
4. **Overview and charts.** Canvas charts at DPR with table fallbacks and keyboard cursor, sparklines, forecast shading, overview page. Done means: chart draw rate measured in the HUD; fallbacks pass axe; reduced motion verified.
5. **Proof and ship.** Lighthouse and CSP checks in CI, bundle budget tightened to the measured number, README, Azure SWA app, custom domain, HSTS. Done means: CI green on main with a deploy; the live domain serves the real CSP with zero violations.
6. **Portfolio entry.** In the portfolio repo: `src/content/projects/daybook.md` with hooks in the misconception, question, metric, detail format, gallery captured from the live build at 1440x950 at 2x, one shot per screen with one-sentence captions carrying one measured fact each; resume data updated. Done means: the portfolio build's hook and byte assertions pass.

## Candidate hooks for the case study

Measured before written; drop any that does not hold.

- Misconception: a React dashboard this busy is re-rendering constantly. Question: how many components re-render when a payment lands? Metric: one row.
- Misconception: a design system needs a component library behind it. Question: how many runtime dependencies does this UI library have? Metric: zero beyond React.
- Misconception: menus and tooltips need a positioning library. Question: how much JavaScript positions these popovers? Metric: 0 bytes.
- Misconception: a 100,000-row ledger needs a backend and pagination. Question: how many rows are in the DOM right now? Metric: the measured count.
- Misconception: optimistic UI is a trade against correctness. Question: what happens when you undo a categorisation that already committed? Metric: both stores agree.

## Out of scope

- Authentication, real banking data, real FX rates, server-side rendering, internationalisation beyond locale-aware formatting, mobile app, offline support beyond what static hosting gives for free.
- Any mention of AI tooling in the product, the README, or the case study.

## Deviations

Record every deviation from this spec in NOTES.md with the reason and the date.
