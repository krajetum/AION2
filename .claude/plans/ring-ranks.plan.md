# Ring ranks for Best upgrades

Status: designed · Design: ring-ranks.design.md · Type: change · Planned: 2026-11-27

## Problem
Rings are the only reroll slot the static's rank tables leave out, so they still use kisk's carry shares. There Block (53%) and Critical Hit (51%) pass the keep line (50), and as the commonest lines in a ring's draw they make a ring look easy (Randronirk's Ring2: 24.5% a try) and put it "Up next" ahead of a necklace that the static's own ranks would pick. The player's ring table: Might S, Precision B, Attack B, every active skill A.

## Analysis
- **Today:** `src/domain/upgrades.ts:24-28` uses `rankTable(t.ranks, slot)` when `ranks.json` has the slot, else `worthLines(t.carry[class][slot], …)`; `ranks.json` has no `Ring`. `src/domain/reroll.ts:166-167` `ownSkill`: any skill line on a ring is kept, worth `KEEP` (50). `rankSkills` gives skill lines B (60). Ring draw: `REROLL_POOLS.Ring` (jewel stats without Combat Speed + 12 actives at 20% together).
- **Gap / root cause:** two scales on one page (carry shares on rings, ranks elsewhere); measured on Randronirk 2026-11-27: Ring2 next try 15.8 vs Necklace 12.2.
- **Constraints:** domain stays pure (`domain` ← `app` ← `ui`); no new dependency; the Info panel and CLAUDE.md describe what a line is worth, both must stay true.
- **Decisions:**
  - Ring ranks: Might S, Precision B, Attack B; anything else rerolled (Block, Critical Hit, …).
  - Skill lines on a ring: any of the class's active skills is worth A (the player's own pick), not only the best-in-slot ones; the class's actives come from the profile (`Equipment.active`), never guessed.
  - Rings stop using kisk's carry shares; `carry.json` stays for classes/slots the tables don't cover (none left among reroll slots).

## Features to implement
Ordered: implement top to bottom.

- [ ] **F1. Ring rank table** (S) — a `Ring` entry in `src/assets/ranks.json`: Might S, Precision B, Attack B; rings valued by ranks like every other slot.
  - Acceptance (EARS):
    - THE ranks file SHALL rank ring lines Might S, Precision B, Attack B.
    - WHEN a ring is planned THE plan SHALL treat Block and Critical Hit as lines to reroll (worth below `KEEP`).
  - Where: `src/assets/ranks.json`, `src/domain/upgrades.ts`
  - Tests: `upgrades`/`reroll` test: a ring with Natural MP Regen to reroll does not count Block or Critical Hit among the lines it can land.
  - Depends on: none

- [ ] **F2. Ring skills worth A** (S) — on rings, every active skill of the class (from the profile's `active` list) is a wanted line worth A (80), kept when on the ring and aimed at by rerolls.
  - Acceptance (EARS):
    - WHEN a ring holds any active skill THE plan SHALL keep it, worth A.
    - WHEN a ring line is rerolled THE plan SHALL count landing any active skill the ring lacks as a hit, worth A.
    - IF the profile lists no active skills THEN THE plan SHALL fall back to the best-in-slot ring skills.
  - Where: `src/domain/upgrades.ts` (pass the actives for rings), `src/domain/reroll.ts` (`rankSkills` takes a rank; `ownSkill` unchanged)
  - Tests: a ring plan with actives passed in: skill lines worth 80, a step's chance includes the actives' share of the draw.
  - Depends on: F1

- [ ] **F3. Order and texts** (S) — the queue uses the new values (no code change to `rankPlans`); the Info panel's "what a line is worth" and the cards' hint stop saying rings use kisk; CLAUDE.md updated.
  - Acceptance (EARS):
    - WHEN Randronirk's gear is planned THE queue SHALL put the necklace before Ring2.
    - THE Info panel and hint SHALL describe rings with the static's ranks.
  - Where: `src/ui/parts/UpgradeInfo.svelte`, `src/ui/parts/UpgradeCards.svelte`, `CLAUDE.md`
  - Tests: a test with Randronirk's Ring2 and Necklace lines (2026-11-27): the necklace first; UI text checked in the browser pane (`web-ui`, demo profile).
  - Depends on: F2

## Deferred
- **D1. Weighting slots against each other** — an S on a weapon vs an S on earrings are counted the same · Why later: the tables rank lines within a slot only; the player hasn't said how slots compare · Revisit when: the player gives slot weights.

## Open questions
None.
