# what it shows — splitting ticket #4471

Analysis of the support desk's ticket **#4471** ("dates parse mm/dd in eu locales",
412 reports merged, marked known), from the desk's kb export. Run with the desk's own
logic (`support-kb/src/lib/kb/causes.ts`): the ticket holds **two different bugs**,
not one.

| problem | reports | ticket |
|---|---|---|
| `parser` — shared parser reads every date month first; day-first tenants get month/day flipped | **379** | [issue #1](https://github.com/sabakp01/mega-s01e03-what-it-shows/issues/1) |
| `hint` — `booking-v3` prints `MM/DD/YYYY` under the date field for day-first tenants; the form reads what people type the tenant's way | **33** | [issue #2](https://github.com/sabakp01/mega-s01e03-what-it-shows/issues/2) |

Counts are over **412 unique ids** (the raw export holds 427 entries; 15 ids repeat from
overlapping export pages). Intake tags disagree with the cause on 38 reports.

## What's in this repo

- `support-kb/` — the desk's kb export as given, plus my signed page:
  `support-kb/src/routes/kb/incidents/4471-split/+page.svx` (signature `Piotr + Cline`,
  desk ref `DR-YZWP-XEYZ`).
- `page/4471-split.html` — that page as the desk will see it: runbook frame, `CauseTable`,
  `QueueTimeline`, `Callout`, `RenderStamp`, all computed from the export data.
- `tools/analyze.mjs` — reproduces `causes.ts` over the export and prints the counts.
- `tools/render.mjs` — renders the page to `page/4471-split.html`.

Verify: `node tools/analyze.mjs` (needs Node 18+; uses `Intl` for locale day-order).

Written by Piotr with harness Cline, 2026-10-28, for MEGA.dev Challenge S01E03.
