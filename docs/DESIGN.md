# Daybook - design brief

Companion to SPEC.md. SPEC.md decides architecture; this file decides how the product looks and reads.
Implementation stages follow it; deviations go to NOTES.md.

## Subject and job

A business-banking dashboard for a fictional German SME (VAT rates 0, 7, 19; EUR primary).
The fiction: a finance person checking money every morning.
The real audience: portfolio visitors who judge craft.
The page's job is to let someone read money quickly and trust the number.

## Direction: ledger ink

A daybook is a ruled book of first entry. The product borrows that: paper surface, ink text, horizontal rules, tabular figures, debit and credit as separate columns.
The ledger table is the one memorable element. Everything else stays quiet.

### Colour tokens

Semantic roles only; components never use raw hex.
Contrast is measured at runtime on `/design`; AA is the floor, adjust values rather than the rule if a pair fails.

| Role             | Light     | Dark      | Use                                              |
| ---------------- | --------- | --------- | ------------------------------------------------ |
| surface          | `#FBFBF9` | `#171917` | page paper                                       |
| surface-raised   | `#FFFFFF` | `#1F221F` | floating layers only: popover, dialog, toast, feed card |
| surface-sunken   | `#F1F1EC` | `#111311` | input wells, table header, selected row           |
| text             | `#15181A` | `#ECEDE9` | ink                                              |
| text-muted       | `#5B6166` | `#A3A8A1` | secondary labels, dates in the ledger            |
| accent           | `#1F5A3C` | `#6FBF8E` | actions, links, selection, focus ring            |
| accent-contrast  | `#FFFFFF` | `#0F1A14` | text on accent                                   |
| positive         | `#236B45` | `#7CCB9A` | credits, confirmations                           |
| negative         | `#A33A2A` | `#E07B6C` | debits, declined, destructive                    |
| warning          | `#9A6B00` | `#D9A441` | pending, budgets past 80 %                       |
| border           | `#D9DBD6` | `#343834` | hairline rules                                   |
| border-strong    | `#838882` | `#6A7069` | input borders, table header rule                 |
| focus            | = accent  | = accent  | 2 px solid ring, 2 px offset, never removed      |
| accent-hover     | `#174A30` | `#8CCFA5` | hover and active on accent surfaces              |
| negative-hover   | `#86301F` | `#E99689` | hover and active on danger surfaces              |
| negative-contrast| `#FFFFFF` | `#0F1A14` | text on negative                                 |

`prefers-contrast: more` darkens muted text to text and thickens rules to border-strong.
`forced-colors: active` maps roles to system colours (`Canvas`, `CanvasText`, `Highlight`, `LinkText`) and keeps focus visible through the platform ring.
Dark is a true ink paper, slightly green-black, not a tinted neutral black; neon is never used.

### Type

System stack, no web fonts: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
One family does everything; hierarchy comes from size, weight 400/600, and colour.

Fluid scale, minor third (1.2), body 15 px at desktop. Tokens:
`--text-xs 12-12.5`, `--text-sm 13-13.5`, `--text-md 14.5-15`, `--text-lg 17-18`, `--text-xl 20-21.5`, `--text-2xl 24-26`, `--text-3xl 28-31`, each a `clamp()`.
Line height 1.45 body, 1.15 headings. Headings weight 600, letter-spacing -0.01em from `--text-2xl` up.
Every number that can be compared with another number uses `font-variant-numeric: tabular-nums` and is right aligned.
Line length under 70 characters for prose; tables are exempt.

Never: all-caps labels, tracked-out eyebrows, a single accented word in a heading, monospace for data labels, middle-dot meta strings, arrows glued to link text.

### Space, radius, shadow, motion

4 px scale: `--space-1` 4 through `--space-10` 40, plus `--space-12` 48 and `--space-16` 64.
Radius: `--radius-sm` 2 px for controls, `--radius-md` 6 px for floating layers, `--radius-full` for avatars and badges. The ledger and sections have no radius.
Shadow: only floating layers get one (`--shadow-raised`); sections never float.
Motion: `--duration-fast` 120 ms, `--duration-base` 200 ms, `--ease-out` cubic-bezier(0.2, 0, 0, 1). `prefers-reduced-motion` sets every duration and delay token (fast, base, shimmer, tooltip delay) to 0 ms.
Z-index: `--z-sticky` 10, `--z-popover` 20, `--z-dialog` 30, `--z-toast` 40.

### Layout

```
+------------------------------------------------------------------+
| Daybook        [Account: Main EUR v]   [search........]  [theme] |
| Overview   Transactions   Cards   Budgets   Design               |  <- one hairline under nav
+------------------------------------------------------------------+
| h1 Overview                                                      |
|                                                                  |
| Main EUR          Operating USD        Payroll EUR               |  <- stat tiles: rule above, label, then the number large
| 48,210.55         12,090.10            9,400.00                  |
| ~~sparkline~~     ~~sparkline~~        ~~sparkline~~             |
| -----------------------------------------------------------------|
| Cash flow                                   | Incoming payments  |  <- feed is the only raised card
| [canvas chart, 12 months + 3 shaded]        | 09:41 Kessler +890 |
| -----------------------------------------------------------------|
| Top categories this month     | Latest activity                  |
+------------------------------------------------------------------+
```

Content is fluid between 24 px gutters (16 px under 900 px) up to a 1920 px content box and centred on wider viewports; the header bar and nav share that box, only the header rule runs full width.
Sections are separated by hairline rules and an `h2`, not boxes. Raised surfaces are reserved for things that float or arrive (popovers, dialogs, toasts, the live feed card).
Filter sidebar on `/transactions` is 260 px, collapses to a `<details>` disclosure under 900 px.

### The ledger

```
Date         Counterparty              Category     Debit        Credit       Balance
16 Sep 2026  Northwind Hosting         Software     1,240.00                  48,210.55
16 Sep 2026  Kessler GmbH              Revenue                   8,900.00     49,450.55
```

Rows 36 px, hairline rule under each row, no zebra striping, header rule in border-strong, header sticky.
Debit and credit are separate right-aligned columns; a debit also carries a leading minus in its accessible text so colour is never the only signal.
Balance column appears only when one account is selected and the sort is by date; otherwise the column is omitted.
Pending rows show the amount in text-muted with a `Pending` badge; declined rows strike nothing, they show a `Declined` badge in negative.
Selected rows take surface-sunken plus a 2 px accent rule on the left edge.
A feed event that inserts a row paints it accent at 12 % alpha and fades over `--duration-base`; under reduced motion it simply appears.

### Motion policy

No entrance animation on load. Motion only answers an action: popover open, toast arrival, feed row arrival, optimistic state change.
One ambient exception: the skeleton shimmer while data is pending, because it signals work in progress rather than decorating; it stops under reduced motion.
View transitions on route change are a 120 ms cross-fade of `main` only; disabled under reduced motion.

### Words

Sentence case everywhere. Buttons name the result: `Categorise 3 transactions`, `Freeze card`, `Save budget`, `Undo`.
A toast repeats the verb: `Categorised 3 transactions` with `Undo`.
Empty states say what to do: `No transactions match these filters. Clear filters or widen the date range.`
Errors say what happened and the fix, never apologise.
The wordmark is `Daybook`, set in the system stack at weight 600, no logo.

## Why this is not the default

A generic banking dashboard is a card grid in navy with soft shadows; this uses rules instead of boxes and a bottle green that reads as ink and ledger, not fintech.
It is also not the hairline broadsheet default: rules are horizontal only and come from the subject (a ruled ledger), controls keep a 2 px radius, there are no newspaper columns, no serif, and no cream.
Dark mode is muted green on ink, not a neon accent on black.
