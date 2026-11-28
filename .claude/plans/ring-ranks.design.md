# Ring ranks for Best upgrades: design

Status: building · Plan: ring-ranks.plan.md · Designed: 2026-11-27

## Overview
Rings join the static's rank tables: a `Ring` entry in `src/assets/ranks.json` (Might S, Precision B, Attack B) and a per-slot skill rank (`skillRank`, Ring: A). `buildUpgrades` gives a slot with a `skillRank` every active skill from the profile (`Equipment.active`) at that rank, falling back to the best-in-slot list when the profile has none. Nothing changes in `planPiece` / `rankPlans`: the new worths flow through as for every other slot. Two layers only (assets → domain → UI text), no diagram.

## Decisions
### ADR-1. Where "skills worth A on rings" lives
- Options: a `skillRank` map in `ranks.json` · a hard-coded `slot === "Ring"` in `upgrades.ts` · a new `ownSkill` value in `reroll.ts`
- Chosen: `skillRank` in `ranks.json` — the static's data stays in one file next to its tables; the code reads it, no slot name hard-coded
- Consequences: `RankFile` grows one optional field; slots without it keep skills at B from the best-in-slot list

## Data model
- `src/assets/ranks.json`: `slots.Ring` = `[["Might","S"],["Precision","B"],["Attack","B"]]`; `skillRank` = `{ "Ring": "A" }`. Bundled asset, no save-file change, no migration.

## Features

### F1. Ring rank table
**Interfaces**
```ts
// reroll.ts
export interface RankFile { tiers: Record<string, number>; slots: Record<string, [string, string, string?][]>; skillRank?: Record<string, string> }
```
**Errors & edge cases:** Ring rows use the draw's names (`REROLL_POOLS.Ring`: "Might", "Precision", "Attack") → matched like every slot.
**Tests** (EARS → test):
- THE ranks file SHALL rank ring lines Might S, Precision B, Attack B → `src/domain/upgrades.test.ts` "rings: the static's ranks, Block and Critical Hit rerolled, every active worth A"
- WHEN a ring is planned THE plan SHALL treat Block and Critical Hit as lines to reroll → same test (`plan.missing` holds neither; a ring holding Block lists it in `steps`)

**Tasks**
- [x] **T1.0** test reading `src/assets/ranks.json` (readFileSync): `slots.Ring` and `skillRank.Ring` — files: `src/domain/upgrades.test.ts` — proves: the real asset, not the test literal
- [ ] **T1.1** failing test with a Templar ring (Natural MP Regen, Attack, Block, two actives) — files: `src/domain/upgrades.test.ts` — proves: the test above (red)
- [x] **T1.2** `Ring` table + `skillRank` in `ranks.json`, `RankFile.skillRank` — files: `src/assets/ranks.json`, `src/domain/reroll.ts` — proves: the Block / Critical Hit half goes green

### F2. Ring skills worth A
**Interfaces**
```ts
// reroll.ts
export const rankSkills: (file: RankFile, lines: { stat: string; pct?: number }[], rank?: string) => { stat: string; pct: number }[]
// rank given: every line at file.tiers[rank]; none: as today (≥ KEEP → B, else its own %)
// upgrades.ts, inside buildUpgrades: const skillRank = t.ranks.skillRank?.[slot];
//   skills = rankSkills(t.ranks, skillRank && eq.active.length ? eq.active.map((s) => ({ stat: s.name })) : linesOf(slot) ?? [], skillRank)
//   ranked gets every such skill as { rank: skillRank } so the cards' chips say "A" (UpgradeCards label/why read ranked first)
```
**Errors & edge cases:** profile with no actives → best-in-slot ring skills at A; a skill on the ring that is not an active (stigma) → `ownSkill` keeps it at `KEEP` as today.
**Tests** (EARS → test):
- WHEN a ring holds any active skill THE plan SHALL keep it, worth A → "rings: …" (its `plan.lines` worth = 80)
- WHEN a ring line is rerolled THE plan SHALL count landing any active the ring lacks → same test (`missing` holds the other actives)
- IF the profile lists no actives THEN fall back to best-in-slot → "rings: no actives in the profile, the best-in-slot ring skills at A"

**Tasks**
- [ ] **T2.1** `rankSkills` rank parameter + actives for `skillRank` slots in `buildUpgrades` — files: `src/domain/reroll.ts`, `src/domain/upgrades.ts` — proves: both ring tests green; the existing "rings: carry shares" test (`upgrades.test.ts` ~349, ranked null) rewritten for ranks, the others still green

### F3. Order and texts
**Tests** (EARS → test):
- WHEN Randronirk's gear is planned THE queue SHALL put the necklace before Ring2 → `src/domain/upgrades.test.ts` "Randronirk 2026-11-27: the necklace before Ring2" (lines as read from the official profile that day)
- THE Info panel and hint SHALL describe rings with the ranks → browser pane (`web-ui`, demo profile), svelte-check

**Tasks**
- [ ] **T3.1** the Randronirk order test — files: `src/domain/upgrades.test.ts` — proves: itself
- [ ] **T3.2** texts: `UpgradeInfo.svelte` line 27, `UpgradeCards.svelte` `label` / `why` (a skill's rank from `ranked`, else B) and hint (rings with the static's ranks, skills on rings A), CLAUDE.md `reroll.ts` entry — proves: svelte-check + a look in the browser pane

## Risks
- Rings with Precision B now count it as a hit: more hits than "Might S + skills" alone → as the player ranked it.
- `carry.json` no longer used by any reroll slot → kept (still named in the hint for classes with no tables? none) — left in place, no deletion without asking.

- Unlearned actives (level 0) are included: the draw can still roll them. A class with more than 12 actives would push the skills' share past the draw's 20% → none seen (Templar 12); noted, not capped.
- An active named like a stat would be dropped by `worthLines`' stat filter → none known; noted.
- `missing` grows to ~15 lines: the bit-mask DP stays small (≤ 4 steps).

## Plan changes
- F2 "Where": `reroll.ts` `ownSkill` unchanged (actives worth 80 already beat its 50); only `rankSkills` changes there. Review finding, no behaviour change.

## Open questions
None.
