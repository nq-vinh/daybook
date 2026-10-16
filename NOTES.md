# Daybook - working notes

Decisions and measurements that SPEC.md asks to record.
The design brief is [docs/DESIGN.md](docs/DESIGN.md); the architecture is [docs/SPEC.md](docs/SPEC.md).

## Toolchain (pinned 2026-10-16)

Node 22 via `.nvmrc`; exact versions, no carets.

| Package | Version |
| --- | --- |
| react, react-dom | 19.3.1 |
| vite | 8.3.4 (rolldown) |
| @vitejs/plugin-react | 6.1.2 |
| @rolldown/plugin-babel | 0.2.4 |
| @babel/core | 8.0.7 |
| babel-plugin-react-compiler | 1.0.0 |
| typescript | 6.0.3 |
| eslint | 10.12.0 |
| typescript-eslint | 8.71.2 |
| eslint-plugin-react-hooks | 7.1.1 (`flat['recommended-latest']`) |
| eslint-plugin-jsx-a11y | 6.10.2 (`flatConfigs.strict`) |
| vitest | 5.0.5 |
| jsdom | 30.1.3 |
| @playwright/test | 1.64.1 |
| @axe-core/playwright | 4.14.0 |

TypeScript 7.0.2 is the npm `latest`, but typescript-eslint 8.71.2 supports `>=4.8.4 <6.1.0`, so TypeScript stays on 6.0.3 until typescript-eslint supports 7.
eslint-plugin-jsx-a11y 6.10.2 declares an ESLint peer range up to 9; `package.json` `overrides` lets it resolve against ESLint 10, and its rules were checked to fire under ESLint 10.
Engine floor is Node 22.22.2 (`engines`, required by jsdom 30; Babel 8 needs 22.18); CI resolves the latest 22.x from `.nvmrc`, while a local 22.16 installs with engine warnings and passes lint, tests and build.

## React Compiler

`@vitejs/plugin-react` 6 runs React Compiler through Babel via `@rolldown/plugin-babel` with the exported `reactCompilerPreset()` (`vite.config.ts`); the plugin's own `compiler` option is the experimental Rust port and is not used.
Evidence (2026-10-16): an unminified build (`vite build --minify false`) emits `function App() { const $ = (0, import_compiler_runtime.c)(11); ... if ($[0] === Symbol.for("react.memo_cache_sentinel"))`, so the shell component is compiled with an 11-slot memo cache.
Vitest merges `vite.config.ts`, so unit tests run compiled components too.

## Router

Routing is hand-rolled on the History API in `src/router/` and is the one piece of infrastructure written by hand:
`history.ts` (external store for `useSyncExternalStore`, `navigate(to, { replace })`, a key per history entry in `history.state` with scroll positions kept in `sessionStorage` so Back, Forward and reload restore them, `document.startViewTransition` with `flushSync` unless `prefers-reduced-motion`),
`match.ts` (route table with `:param` segments, not-found fallback),
`router.tsx` (provider, `useRoute()`, outlet, title, focus to the page `h1` and scroll after navigation),
`link.tsx` (intercepts plain left clicks only),
`announcer.tsx` (polite `role="status"` region that reads the new page title).
Focus, scroll, announcement and the view transition happen only when the pathname changes; a search-only change updates the location and nothing else.
The initial load neither moves focus nor announces; fragment-only navigations (the skip link) are ignored by the router.
History entry keys are a per-session counter persisted under `daybook:history-seq` in `sessionStorage` (in memory if storage is unavailable).
Scroll is only remembered while the displayed page matches the committed location, so a pending view transition cannot misattribute a position.
Same-page hash links are left to the browser; a link to a fragment on another page scrolls that element into view after the commit.

## Fixed today

The world's today is `2026-09-16T12:00:00Z`, exported as `TODAY` (epoch ms) and `TODAY_ISO` from `src/domain/world.ts`.
`Math.random`, `Date.now` and argument-less `new Date()` are banned by ESLint and by `tests/unit/source-bans.test.ts` everywhere except `src/state/feed.ts` and `src/state/hud.ts`.

## Domain

The window is 36 calendar months, October 2023 through September 2026, ending at the fixed today `2026-09-16T12:00:00Z` (`TODAY` in `src/domain/world.ts`); nothing is dated after today.
All dates are UTC, and `formatDate` formats in UTC so every visitor sees the same day.
`transaction(i)` seeds its own stream with `hashCombine(0xDA7B00, i)` and reads only constant world arrays, so it is pure, O(1) in `i`, and the worker can regenerate any row on its own.

Index scheme: indices `0 .. RECURRING_COUNT - 1` (766) are the recurring schedule, laid out month-major with 21 slots per month (rent on the 1st, 12 salaries on the 25th, 8 card-paid subscriptions on fixed days) for the 35 complete months, then only the 7 slots of September 2026 dated on or before today, then 24 quarterly tax payments (two alternating streams, paid on the 10th of January, April, July and October).
A recurring date after today is dropped rather than shown as pending, so September 2026 has rent and six subscriptions but no salaries; recurring rows are always booked, in the account currency.
Indices `766 .. 99_999` are organic: date first, then status, account, category (from per-account weights), counterparty, amount, currency (85 % the account's own) and, for expense categories, an optional active card of the same account.
Organic dates pick a month through a CDF whose per-day weight grows linearly from 1 to 2.5 across the window, then a uniform instant inside it (the final month is cut at today).
A row dated inside the last 14 days is pending with probability 0.6; 1 % of rows are declined, only on expense categories.

The Main account carries most revenue and all payroll and ends richest; Operations roughly breaks even; UK sales is modestly positive.
Running balance = `openingBalance` + the sum of non-declined amounts converted to the account currency (`accountAmount`); booked and pending both count.
Opening balances are 40,000.00 EUR, 20,000.00 USD and 15,000.00 GBP (lowest running balances without them: -6,736.20, -622.50 and -69.01); closing balances are 2,280,773.30 EUR, 69,132.47 USD and 214,850.84 GBP.
A test scans all 100,000 rows chronologically and asserts no account goes below zero.
Budgets are monthly amounts in EUR minor units, set near the last 12 complete months' average spend so some categories run over.
fx converts with integer rates per 100 EUR (EUR 100, USD 108, GBP 86) in one division, rounding half away from zero to integer minor units; a round trip is off by at most one minor unit.
VAT is 0 % for revenue, interest, salaries and tax, 7 % for meals, 19 % otherwise.

`monthlySeriesByAccount()` returns per account the income, expense (positive minor units) and net of the 35 complete months (October 2023 through August 2026) and the partial September 2026 separately as month to date, so the forecast never reads a month without payroll.
Forecast: income and expense are projected separately, each future month being the mean of the last three complete months times a seasonal factor (the mean of the same calendar month in prior years divided by the overall mean, clamped to 0.5..1.5, and 1 unless both means are positive), rounded half away from zero to integer minor units, with net = income - expense.
No seasonal factor hits the clamp for September to November 2026; forecast nets against mean monthly nets are 53,373.92, 13,677.03 and 143,327.95 EUR against 63,159.78 for Main, 39,609.89, -24,807.46 and 44,267.54 USD against 1,532.60 for Operations, and 33,120.12, -9,567.44 and 12,833.87 GBP against 5,298.78 for UK sales.

## Budgets and checks

- Runtime dependencies: 2, asserted by `scripts/verify-bundle.mjs`.
- Initial JavaScript gzip budget: 90 KB placeholder (`BUDGET_GZIP_BYTES`), replaced by the measured number after Stage 2.
- Lighthouse: `@lhci/cli` in Stage 5; CI carries a commented placeholder step.
- CSP source of truth is `public/staticwebapp.config.json`; `vite preview` serves its `globalHeaders`, so Playwright runs against the real header.
- Caching: a global `Cache-Control: no-cache` with an `/assets/*` immutable route; that the route-level header takes precedence over the global one is to be confirmed on the live site in Stage 5.
- `verify-bundle.mjs` reads `dist/.vite/manifest.json` to measure the initial chunks, then deletes `dist/.vite` so the manifest is not deployed.

## Deviations

- 2026-10-16, router size: `src/router/` is 355 lines of TypeScript including blank lines against SPEC.md's "about 100 lines". The extra lines are the robustness the review asked for: per-entry scroll restoration that survives Forward and reload, the replace option, pathname-versus-search gating, safe param decoding, and the Link guards for download, cross-origin and non-http links. Splitting them out would hide router behaviour rather than remove it.
- 2026-10-16, process: Stage 1 runs as four sub-stages (1a domain, 1b form primitives and theme, 1c display and overlay components, 1d design page), each its own implementer spawn with its own verify and review round, because the stage exceeds one bounded spawn.
- 2026-10-16, pending share: about 1.1 % of transactions are pending (1,138) instead of SPEC.md's 3 %. Pending is limited to the last 14 days, which hold only about 1.9 % of rows on the recency trend; re-dating 3 % of rows into that window inflated the final month and biased the forecast, so a row already dated inside the window becomes pending with probability 0.6 instead.
- 2026-10-16, interest VAT: interest carries `vatRate` 0 like revenue, salaries and tax, not 19 %, because interest income is VAT exempt.
