# Players page redesign

Status: built · Type: feature | change · Planned: 2026-11-27 · Design: players-redesign.design.md

## Problem
The Players page stacks search, results, profile, gear, stats, boards, Genus and Compare in one long column, the search is clunky,
the profile is hard to scan, Compare is awkward, and Best upgrades hides behind a button. The page lives between the app's nav (232 px)
and inspector (280 px): ~830 px on a 1440 px window. Redesign it as a search bar + profile with tabs, icons on everything, paged results,
Compare slot by slot and a redesigned Best upgrades tab. Visual reference: the mockup https://claude.ai/artifact/JQzfKEjkzFMcWxzRA2azAP
(private to the player; read it with the Artifact tool, `project/Main.dc.html`). Its colours, sizes and data are samples: build with the app's tokens and components.

## Analysis
- **Today** (branch `beta`, where the work starts):
  - `src/ui/pages/Players.svelte`: form (name, region, Search, "← My character") + hint lines (`:116-126`), a Characters `Panel` with a `Table`, not paged,
    "Also names containing it" toggle (`:128-137`), compare state `first`/`comparing` (`:96-110`, `:139-144`), one profile `Panel` with 3 `Kpi`s, `Equipment`,
    a Stats `Table`, `DaevanionBoards`, `GenusInsight` and the official / shugo.gg links (`:146-173`). Search/open logic (`search`, `show`, `openMe`, `want`, `runs`) stays as is.
  - `src/ui/parts/Equipment.svelte` loads the equipment and every piece's details (`equipmentOf`, `itemOf`), renders gear / accessories / arcana `GearCard`s,
    "Stats from gear" (`gearStats`), pet / wings, skills / stigma, and on beta the plans (`planPiece`, `rankPlans`, arcana plans) behind a "Best upgrades" toggle → `UpgradeCards.svelte` (+ `UpgradeInfo.svelte`).
  - `src/ui/parts/UpgradeCards.svelte` (beta): gear cards "Up next" first, score now → after bar, reroll steps with % a try, wanted lines in tiers Best / Good / Fine
    with the static's S/A/B ranks or carry shares, Philosopher's Stone line, reset, unobtainable lines; an Arcana section (Transmute options, farm advice, wasted levels); Already good / ideal lists.
  - `src/ui/parts/PlayerCompare.svelte`: both sides read in full, folds, "Side by side" GearCards per slot.
  - `src/lib/components/app/UnderlineTabs.svelte`: text tabs, no icon or badge.
  - `src/infra/armory.ts:44` throws "only in the desktop app" outside Tauri: `npm run dev` shows no profile today.
- **Gap:** no tabs, no paging, almost no icons, results never fold, Compare is a separate stacked panel, Best upgrades is a toggle inside Gear; the equipment load lives inside `Equipment.svelte`, so several tabs can't share it.
- **Constraints:** UI only, no new dependency (Lucide `@lucide/svelte` through `ui/icons.ts` `ICON` already allowed); layers `domain` ← `app` ← `ui`/`infra`, pure logic (paging, recent list) in `domain` with `npm test`;
  shadcn components (`Panel`, `UnderlineTabs`, `Fold`, `StatList`, `Button`, `Input`, `NativeSelect`, `ToggleGroup`, `Badge`, `Progress`) and the tokens (`--card`, `--border`, `--primary`, `--muted-foreground`, `--gold`, `--star`…), never the mockup's hex colours;
  `design.test.ts` forbids the old shared classes; English UI; game icons stay the CDN images the app already uses (items, skills, pet, wings) and `ui/classes/*.png` (class); keep the official request queue order (Players requests first).
- **Decisions:**
  - Branch off `beta`, merged back into `beta` (Best upgrades only exists there).
  - Delivered step by step, each feature usable on its own (sdlc-build stops after each).
  - Layout: search bar on top (no left rail), profile header with the numbers inside, tabs below.
  - Tabs, in order: Overview, Gear, Upgrades, Stats, Daevanion, Skills, Compare; short labels, an icon each; Upgrades shows a count badge.
  - Opening a profile always starts on Overview (no remembered tab).
  - Results: folded once a profile is open, 6 per page in two columns, pager ‹ › with "1–6 of N".
  - Recent: the last 5 characters opened, kept in localStorage (not the save file or export).
  - Skills and Genus Insight together in the Skills tab.
  - Compare tab: CP / item level / level side by side, then every gear, accessory and arcana slot as a row (both pieces, Δ = enchant + exceed), pet, wings, boards, skills after; second side = your character by default, "Other" opens the search.
  - Upgrades tab: one column at any width (wide mode too); queue rows open in place; Arcana as its own section after the gear queue, same row style.
  - Icons on every control, tab, stat, slot, board and section.
  - Outside Tauri a labelled demo profile so every tab can be checked in the browser pane.

## Features to implement
Ordered: implement top to bottom.

- [ ] **F1. Demo profile outside Tauri** (S) — a fixture profile, equipment and piece details, marked "Demo", returned by the armory adapter outside the desktop app.
  - Acceptance (EARS):
    - WHILE the app runs outside Tauri THE Players page SHALL find a demo character on search and open its profile, equipment and pieces, with a visible "Demo" label.
    - WHILE the app runs in Tauri THE armory adapter SHALL never return demo data.
  - Where: `src/infra/armory.ts` (the `isTauri()` branch at `:44`), a fixture next to it (shape of `domain/armory.ts` `Profile` / `Equipment` / `ItemDetail`, with real-looking item and skill icons left empty or pointing at the app's bundled assets).
  - Tests: browser pane (`web-ui`): Players → search → profile opens with "Demo"; `npm test` stays green.
  - Depends on: none

- [ ] **F2. Search bar, paged results, Recent** (M) — one search row (name with search icon, region, Search, your character as a button with its name); a status line (results toggle "N results for 'X'", servers answered / failed + Again, Recent chips); results fold away when a profile opens, 6 per page in two columns with class icon, name, class · server, level; pager; "Also names containing it" kept.
  - Acceptance (EARS):
    - WHEN a profile opens THE results SHALL fold to the "N results" toggle.
    - WHEN the toggle is pressed THE results SHALL unfold on the page holding the open character.
    - WHEN a new search starts or "Also names containing it" changes THE list SHALL go back to page 1.
    - WHEN a character is opened THE Recent list SHALL put it first, without duplicates (name + server), keeping at most 5, saved in localStorage.
    - IF localStorage is not available THEN THE page SHALL work with an empty Recent list.
    - THE search, region search progress, exact-match auto-open and "My character" SHALL behave as today.
  - Where: `src/domain/` pure helpers (`pageOf(list, page, size)`, `pushRecent(list, entry, max)`) + tests; `src/ui/pages/Players.svelte`.
  - Tests: `npm test` cases for `pageOf` (last partial page, page past the end clamps) and `pushRecent` (dedupe any case, cap 5); browser pane check.
  - Depends on: F1

- [ ] **F3. Profile header and tabs** (M) — header: class icon, name, class · server · level, Compare button, official profile (icon button) and shugo.gg link; CP, item level, BiS lines, Daevanion as four number tiles inside the header; a tab bar with an icon per tab and an optional count badge; a shared equipment + piece-details loader so every tab reads one load.
  - Acceptance (EARS):
    - WHEN a profile opens THE page SHALL show the Overview tab.
    - WHILE the profile or pieces are being read THE header SHALL say so, and a failed read SHALL show the error with Try again (as today).
    - THE equipment and each piece SHALL be requested once per opened character, whatever tabs are visited.
    - THE tab bar SHALL fit ~830 px and scroll sideways when narrower.
  - Where: `UnderlineTabs.svelte` (optional icon and badge per item, existing callers unchanged); `Players.svelte`; the loader lifted out of `Equipment.svelte` (e.g. a `ui/parts/equipment.svelte.ts` state the tabs share).
  - Tests: browser pane: tabs switch, no repeated requests in `read_network_requests`/console; `npm run check`.
  - Depends on: F1

- [ ] **F4. Overview, Gear, Stats, Daevanion tabs** (M) — Overview: compact equipment grid (item icon, slot, enchant, ideal lines bar), pet and wings, key stats with icons. Gear: today's GearCards (BiS flip, Edit) for gear, accessories, arcana. Stats: the official stats table and "Stats from gear", each stat with an icon. Daevanion: `DaevanionBoards`, a board icon each.
  - Acceptance (EARS):
    - THE Gear tab SHALL keep the BiS back side and the player's own BiS lists working as today.
    - THE Stats tab SHALL show every stat the official profile sends, with its effects, and "Stats from gear" with each piece's share.
    - IF a stat has no known icon THEN it SHALL show a generic stat icon.
  - Where: `Players.svelte`, `Equipment.svelte` (split into the tabs' parts), `GearCard.svelte`, `DaevanionBoards.svelte`; an icon map stat → Lucide icon in `ui/`.
  - Tests: browser pane on the demo profile, each tab; `npm run check`; `design.test.ts` green.
  - Depends on: F3

- [ ] **F5. Skills tab** (S) — Active, Passive, Stigma as icon grids with levels (not learned dimmed, stigma equipped marked); Genus Insight below with the preset switch and one card per insight, lines in the grades' colours.
  - Acceptance (EARS):
    - WHILE the open character is one of yours with Genus read THE tab SHALL show Genus Insight.
    - WHILE it is yours without Genus read THE tab SHALL show today's "log in with the companion open" hint.
    - WHILE it is someone else's THE tab SHALL show the skills only.
  - Where: `Players.svelte`, `GenusInsight.svelte`, the skills snippet from `Equipment.svelte`.
  - Tests: browser pane (demo character + a Genus read in `ui.data.genus` under its name).
  - Depends on: F3

- [ ] **F6. Compare tab, slot by slot** (L) — the profile numbers side by side; then one row per gear, accessory and arcana slot: slot icon and name, each side's piece (item icon, enchant, ideal lines), Δ coloured; then pet, wings, Daevanion boards, skills as rows; Swap; "Other" picks the second character from the search; Genus only between your own characters (as today).
  - Acceptance (EARS):
    - WHEN the Compare tab opens on someone else THE second side SHALL be your character, read in full.
    - WHEN the open character is yours THE tab SHALL ask for another character ("Other").
    - WHEN "Other" is used and a character opened from the search THE tab SHALL compare against it and keep the opened profile as the first side.
    - THE Δ SHALL be green where the first side is ahead and red where behind, 0 neutral.
    - IF a slot is empty on one side THEN its row SHALL show "—" on that side.
  - Where: `Players.svelte`, `PlayerCompare.svelte` (reused for the reading of both sides, laid out as rows), `domain/compare.ts` (`slotPairs`, `diffRows` already exist).
  - Tests: `npm test` for any new pairing/Δ helper; browser pane with two demo characters.
  - Depends on: F3, F4

- [ ] **F7. Upgrades tab** (L) — one line on top: pieces worth improving of the total, ≈ tries for all, "How it's scored" (today's `UpgradeInfo`); the gear queue as rows ranked like today (`rankPlans`): rank (first one highlighted, "Up next"), item icon with enchant, name, now / expected bar, slot · now → ≈after / 100 · ≈tries, +gain, chevron; a row opens in place (the first one open at start): reroll steps with % a try, the wanted lines as chips in tiers Best / Good / Fine with rank or share, Philosopher's Stone line and reset as two cards, unobtainable note; then the Arcana section with the same rows (skills have/missing, Transmute options, farm advice, wasted levels); Already good / ideal as icons with names on hover. The tab's badge = pieces to improve.
  - Acceptance (EARS):
    - THE queue SHALL hold everything `UpgradeCards` shows today (no plan data dropped).
    - WHEN a row is pressed THE row SHALL open, and a second press SHALL close it.
    - WHILE pieces are still being read THE tab SHALL say "Reading the pieces… n / N" and show the plans already known.
    - IF nothing is left to improve THEN THE tab SHALL say so and show the Already ideal list.
    - THE layout SHALL be one column at any width.
  - Where: `UpgradeCards.svelte` (rewritten), `UpgradeInfo.svelte`, `Players.svelte`; plan logic in `domain/reroll.ts` / `arcana.ts` unchanged.
  - Tests: `npm test` (`reroll.test.ts`, `arcana.test.ts` green); browser pane on the demo profile with pieces that need rerolls.
  - Depends on: F3, F4

- [ ] **F8. Docs** (S) — CLAUDE.md's Players entries updated to the new layout (tabs, Upgrades tab, demo profile, Recent).
  - Acceptance (EARS):
    - THE CLAUDE.md layout section SHALL describe the Players page as built.
  - Where: `CLAUDE.md`.
  - Tests: review.
  - Depends on: F2-F7

## Deferred
- **D1. Two-column Upgrades in wide mode** — queue left, opened piece right · Why later: the player chose one column at any width · Revisit when: wide mode is used a lot and the column feels empty.
- **D2. Kina / stone totals for the whole queue** — a running cost of every planned try · Why later: not asked this round · Revisit when: the player wants a shopping list.
- **D3. Collapsible inspector from the Players page** — more width while comparing · Why later: the shell's wide toggle already exists · Revisit when: Compare feels cramped.

## Open questions
None. (Icons for stats or slots the game sends that aren't in the demo: the generic icon covers them until named.)
