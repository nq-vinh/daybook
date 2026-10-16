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

## Component library

`src/ui/<Name>/` holds one component per folder with its CSS Module and test; class names are joined with `cx()` from `src/ui/classes.ts`, which tolerates the `string | undefined` that CSS Modules return under `noUncheckedIndexedAccess`.
Focus has one rule in `base.css`: `:focus-visible` draws the 2 px `--color-focus` ring at 2 px offset, `[data-focus-ring]` draws it on the element right after a focused native input (the drawn checkbox box, switch track and theme segment, whose real inputs sit transparent on top of them), and `[data-focus-within-ring]` moves it from its `[data-ring-source]` input to the wrapper (the text field well) while other controls inside keep their own ring.
Dynamic values never use a `style` prop; they go through data attributes or custom properties written on the element through a ref.
Button reserves its width without JS: label and spinner share one grid cell, and while loading the label, rendered once, stays in flow and in the accessibility tree with `color: transparent` while the spinner takes the variant's `--button-foreground`.
Fields share `useFieldIds()`, `Field` and `FieldError` from `src/ui/field.tsx`: a visible label, an optional description and error joined into `aria-describedby`, `aria-invalid` while an error shows, and a polite live region that is always rendered so errors that appear on change are announced.
NumberField is a TextField over non-negative integer minor units (at most 1e15); while focused it keeps the raw draft, validates it on every change against the locale's decimal separator and grouping (pasted currency symbols and bidi marks are stripped) and reports `null` while the draft is invalid, shows the "Enter an amount like ..." error only once a blur leaves the draft invalid and until the next valid change ("Amount is too large." shows at once), and formats with the currency on blur only when the draft is valid.
The theme lives in `src/state/theme.ts`, a `useSyncExternalStore` store persisted under localStorage `theme` (`system`, `light`, `dark`) that writes the resolved scheme to `data-theme` on `<html>`, listens to `prefers-color-scheme` only in system mode, and follows `storage` events from other tabs.
Stage 1d adds a resolved-scheme snapshot and hook to the theme store so `/design` can re-measure contrast live when the scheme changes.
A one-statement inline script in `index.html` applies a stored `light` or `dark` before the stylesheet loads, allowed by its sha256 hash in the CSP; `main.tsx` then calls `initTheme()` before `createRoot`.
Component tests live next to the components but type-check in `tsconfig.node.json` with the other tests, so the jest-dom matcher types from `tests/unit/setup.ts` stay out of the app program.
`tests/unit/tokens-contrast.test.ts` parses the `light-dark()` colour tokens and guards the AA pairs in both themes; `/design` remains the visitor-facing measurement.
Menu and Tooltip use the Popover API and CSS anchor positioning with no positioning code: `src/ui/anchor.ts` derives a per-instance dashed ident from `useId()` and writes `anchor-name` on the trigger and `position-anchor` on the panel through ref callbacks on `element.style`, and the CSS Module places the panel with `position-area` and flips it with `position-try-fallbacks`.
Browser floor: Chromium 129+, Safari 26+ and Firefox 147+ (its anchor-positioning release). Chromium shipped the Popover API earlier and anchor positioning in 125, but the property names used here, `position-area` and `position-try-fallbacks`, arrived in 129 and 128 (125 had `inset-area` and `position-try-options`). The audience uses current browsers, there is no production polyfill, and Playwright runs Chromium.
Menu is a `popover="auto"` panel opened by a `popovertarget` button, so Escape and light dismiss come from the platform; ArrowDown or ArrowUp on the trigger opens it on the first or last item. The `toggle` event sets `aria-expanded`, focuses the first enabled item on open, and on close returns focus to the trigger when focus was inside the menu or fell to `<body>`: an outside click on a focusable element keeps that element focused, an outside click on anything else returns focus to the trigger. Items rove `tabIndex`, disabled items carry `aria-disabled` and are skipped by arrows and type-ahead, Tab closes the menu, the closed panel fades to `opacity: 0` and an item ignores activation unless the panel is still `:popover-open`.
Tooltip is a `popover="manual"` panel shown on pointer enter and focus and hidden on blur, on Escape from anywhere in the document (claimed with `preventDefault()` in the capture phase so an enclosing dialog or popover stays open), and 150 ms after the pointer leaves the trigger unless it enters the tooltip, whose own pointer leave hides it; that grace period does not change under reduced motion. The 300 ms open delay is a CSS `transition-delay` on opacity from `@starting-style`, carried by `--delay-tooltip`, which reduced motion zeroes, so the description is in the accessibility tree at once. The trigger comes from a render prop: the trigger element, a single focusable and never disabled element, spreads the tooltip props (`ref`, `aria-describedby` and the handlers), and any other description ids go through the Tooltip's `describedBy` prop, which is merged with the tooltip id into one `aria-describedby` token list. The ref hides the tooltip if the trigger leaves the DOM while it is open, and leaving a focused trigger with the pointer does not schedule the hide. `anchor-name` is a list too: `src/ui/anchor.ts` appends its name and removes only its own, so one element can anchor a menu and a tooltip.
jsdom has neither the Popover API nor `HTMLDialogElement.showModal()`. `tests/unit/popover.ts` installs a test-only polyfill: `showPopover`/`hidePopover`/`togglePopover`, a synchronous `toggle` event with `newState`/`oldState`, `popovertarget` invoker clicks, light dismiss and Escape for auto popovers, `:popover-open` mapped to a `data-popover-open` attribute in `matches()`, and a stylesheet that hides closed popovers and outranks jsdom's user-agent rule for open ones. `tests/unit/dialog.ts` adds `showModal`/`show`/`close` with the `close` event and Escape through a cancelable `cancel` event. Neither restores focus, so the components' own focus return is what the tests see, and both ignore an Escape whose `keydown` was already default-prevented, as the platform does.
Dialog is controlled: the native `<dialog>` follows its `open` prop in an effect, `showModal()` on open and `close()` in the cleanup, with focus returned to the element focused before opening and a hashed `scrollLock` class (`overflow: hidden`) on `<html>`, whose `scrollbar-gutter: stable` sits permanently in `base.css` so locking never shifts the layout, counted across stacked dialogs. Escape fires a cancelable `cancel`, which the dialog prevents and reports through `onClose`, so only the prop closes it; a non-cancelable `cancel` is left alone; when Chrome's close-watcher anti-abuse skips `cancel` and the dialog closes anyway while `open` is still true, the `close` event calls `onClose` and the effect re-runs, unlocking and re-opening it. Backdrop clicks are ignored.
Tabs activate automatically with Left, Right, Home and End, computed from the focused tab so a controlled parent that rejects a change does not strand focus; a panel has `tabIndex=0` only while it has no focusable descendant, re-checked by a `MutationObserver` on the selected panel, rebuilt only when the selection changes, when its content changes without a Tabs render. Menu, Tabs and Table share `src/ui/roving.ts`: `rovingIndex()` (first, last, next, previous, with wrap, step and skip-disabled) and `useElementMap()` for the per-key element refs.
Toasts live in `src/state/toast.ts`, a frozen-snapshot external store; `<ToastRegion>` is mounted once in the shell as a polite `role="status"` region and shows at most three toasts, the rest queue. Timers never read the clock: one 100 ms `setInterval` runs while toasts are visible and not paused and subtracts a tick from each visible toast's remaining time, so pausing simply stops the interval and resuming continues from what is left (within one tick). The region sets `aria-atomic="false"` so only the new toast is announced, each dismiss button is described by its toast title, and a dismiss or action from a focused button moves focus to the first control of the toast that takes its place, if any. The region pauses while the pointer is over it or focus is inside it, and re-checks focus whenever the list changes, because a dismissed toast takes focus with it without a `focusout`.
Toasts are raised after a dialog closes, never from inside an open modal dialog: `showModal()` makes everything outside the dialog inert, the fixed toast region included.
Stage 1c tokens: `--color-badge-neutral|positive|negative|warning|accent` are explicit badge surfaces and `--color-warning-text` (light `#6E4C00`, dark = warning) is the warning badge text, replacing 12 % `color-mix()` tints that measured 3.59 to 4.02 for warning in light; `tokens-contrast.test.ts` guards each text-on-badge pair at 4.5:1 in both themes. Also new: `--color-backdrop`, `--avatar-1..8`, `--duration-shimmer`, `--delay-tooltip` and layout sizes for popovers, tooltip, dialog, toast, table and avatar. `--z-popover` and `--z-dialog` are removed because Menu, Tooltip and Dialog render in the top layer and do not use `z-index`; `--z-sticky` and `--z-toast` stay.
Table keeps roving focus by row key, not index or object identity: the active row has `tabIndex=0`, Up, Down, Home, End and PageUp/PageDown (10 rows) move it, and the key survives re-renders with fresh row objects or reordering; arrows act only when the row itself has focus, Space toggles selection on a focused row, and row checkboxes are out of the tab order so one Tab stop reaches the rows. Sortable headers are buttons inside `<th>`, `aria-sort` sits only on the sorted column, and clicking proposes ascending first, then flips. `virtualised` switches to `role="grid"` with `aria-rowcount` (data rows plus the header row) and `aria-rowindex` from `rowIndexOffset`; the windowing itself is Stage 2.

## Budgets and checks

- Runtime dependencies: 2, asserted by `scripts/verify-bundle.mjs`.
- Initial JavaScript gzip budget: 90 KB placeholder (`BUDGET_GZIP_BYTES`), replaced by the measured number after Stage 2.
- Lighthouse: `@lhci/cli` in Stage 5; CI carries a commented placeholder step.
- CSP source of truth is `public/staticwebapp.config.json`; `vite preview` serves its `globalHeaders`, so Playwright runs against the real header.
- The CSP has no `'unsafe-inline'`; `script-src` allows `'self'` plus one sha256 hash for the theme bootstrap in `index.html`. `verify-bundle.mjs` fails unless `dist/index.html` has exactly one inline script and its hash is in the deployed CSP, and `source-bans.test.ts` checks the same against the source files.
- Caching: a global `Cache-Control: no-cache` with an `/assets/*` immutable route; that the route-level header takes precedence over the global one is to be confirmed on the live site in Stage 5.
- `verify-bundle.mjs` reads `dist/.vite/manifest.json` to measure the initial chunks, then deletes `dist/.vite` so the manifest is not deployed.

## Deviations

- 2026-10-16, router size: `src/router/` is 355 lines of TypeScript including blank lines against SPEC.md's "about 100 lines". The extra lines are the robustness the review asked for: per-entry scroll restoration that survives Forward and reload, the replace option, pathname-versus-search gating, safe param decoding, and the Link guards for download, cross-origin and non-http links. Splitting them out would hide router behaviour rather than remove it.
- 2026-10-16, process: Stage 1 runs as four sub-stages (1a domain, 1b form primitives and theme, 1c display and overlay components, 1d design page), each its own implementer spawn with its own verify and review round, because the stage exceeds one bounded spawn.
- 2026-10-16, pending share: about 1.1 % of transactions are pending (1,138) instead of SPEC.md's 3 %. Pending is limited to the last 14 days, which hold only about 1.9 % of rows on the recency trend; re-dating 3 % of rows into that window inflated the final month and biased the forecast, so a row already dated inside the window becomes pending with probability 0.6 instead.
- 2026-10-16, interest VAT: interest carries `vatRate` 0 like revenue, salaries and tax, not 19 %, because interest income is VAT exempt.
- 2026-10-16, CSP script-src gains one sha256 hash for the theme bootstrap; no unsafe-inline. Applying the stored theme from the module bundle left a light page for 1.5 s with a delayed bundle and a stored dark theme; a hashed one-statement inline script in `<head>` sets `data-theme` before first paint, and the build check pins it to exactly one script whose hash is in the CSP.
- 2026-10-16, Switch drops `aria-checked`: SPEC.md names it, but the native checked state of `<input type="checkbox" role="switch">` already carries it and ARIA in HTML discourages `aria-checked` on checkbox inputs.
- 2026-10-16, `--color-border-strong` changes from `#9DA19B` to `#838882` (light) and from `#5A5F59` to `#6A7069` (dark): the old values measured 2.53, 2.32 and 2.62 (light) and 2.71, 2.86 and 2.46 (dark) against surface, surface-sunken and surface-raised, below the 3:1 non-text minimum; the new ones measure 3.49, 3.19 and 3.62 (light) and 3.48, 3.67 and 3.16 (dark).
- 2026-10-16, hover tokens are explicit colours not yet in DESIGN.md's table: `--color-accent-hover` `#174A30` / `#8CCFA5` and `--color-negative-hover` `#86301F` / `#E99689` (light / dark), and `--color-negative-contrast` `#FFFFFF` / `#0F1A14`; the guard test keeps their text pairs at 4.5:1 or more.
