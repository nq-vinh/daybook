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

## Budgets and checks

- Runtime dependencies: 2, asserted by `scripts/verify-bundle.mjs`.
- Initial JavaScript gzip budget: 90 KB placeholder (`BUDGET_GZIP_BYTES`), replaced by the measured number after Stage 2.
- Lighthouse: `@lhci/cli` in Stage 5; CI carries a commented placeholder step.
- CSP source of truth is `public/staticwebapp.config.json`; `vite preview` serves its `globalHeaders`, so Playwright runs against the real header.
- Caching: a global `Cache-Control: no-cache` with an `/assets/*` immutable route; that the route-level header takes precedence over the global one is to be confirmed on the live site in Stage 5.
- `verify-bundle.mjs` reads `dist/.vite/manifest.json` to measure the initial chunks, then deletes `dist/.vite` so the manifest is not deployed.

## Deviations

- 2026-10-16, router size: `src/router/` is 355 lines of TypeScript including blank lines against SPEC.md's "about 100 lines". The extra lines are the robustness the review asked for: per-entry scroll restoration that survives Forward and reload, the replace option, pathname-versus-search gating, safe param decoding, and the Link guards for download, cross-origin and non-http links. Splitting them out would hide router behaviour rather than remove it.
