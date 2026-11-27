---
name: sdlc-plan
description: Planning phase of this project's SDLC. Use EVERY time the user asks to analyze, plan, scope, investigate or think through something in AION 2 Companion — a feature, a change, a bug, a packet recording, an idea ("analyze X", "plan Y", "how should we do Z", "why does X break", "look into this recording", "/sdlc-plan"). Analyzes the problem against the codebase, interviews the user in rounds until they say they are satisfied, runs a clarify pass and a self-check, then saves one plan file (features with EARS acceptance criteria + deferred work) to .claude/plans/ for the implementation phase. Writes no code.
argument-hint: "<problem, idea, bug or recording, optional>"
---

# SDLC: Planning phase

Turn a problem into a plan file the implementation phase can pick up cold, in a fresh session.
**Write no code in this phase.** The only files you change are the plan file and, when the user rejects an idea, `REJECTED_PROPOSALS.md`.
All questions and the plan are in English.

Phases: **1 Intake → 2 Analyze → 3 Interview (loop) → 4 Clarify pass → 5 Self-check → 6 Save.** Don't skip one; don't move on until the current one is done.

## 1. Intake

- The problem is `$ARGUMENTS` (or the user's message that triggered the skill). If there is none, ask for it in one question and wait.
- Look in `.claude/plans/` for a plan on the same topic. If one exists, read it and ask: continue it, or start a new one?
- Classify the request: **feature / change**, **bug**, or **recording / data analysis**. All three go through every phase; for a bug or a recording, the findings become the Analysis and the fix becomes the features.

## 2. Analyze (before asking anything)

Read first, ask second: never ask what the code or the docs can answer.

1. `CLAUDE.md` (layout, rules, allowed deps) and `REJECTED_PROPOSALS.md`: nothing listed there goes back in the plan.
2. The code the problem touches: `codegraph_explore` with the relevant names / question (the repo is indexed); `Read` only what it didn't cover. For a bug, trace every caller of the function at fault: root cause, not symptom. For a recording, run `cargo run -p aion2-meter --example replay -- <file>` (in `src-tauri/`) and read the output.
3. Write a first **Analysis** for yourself:
   - **Today**: what exists now, with `file:line` paths.
   - **Gap / root cause**: what is missing or broken, and why.
   - **Constraints** that apply: ToS (passive traffic copy only: never decrypt, send packets, read memory, simulate input or automate the game), no invented server/event times (`src/config.ts`, `TO VERIFY`), allowed deps only (ask before any other), layers `domain` ← `app` ← `ui` / `infra`, server/meter times never compared with `===`, Discord/Worker limits when `server/` is involved.
   - **Unknowns**: what only the user can answer (game behaviour, what they want, priorities, how it should look).
4. Show the user a short summary of the analysis (5-10 lines) before the first questions, so they can correct it.

## 3. Interview: a loop only the user ends

Each round:
1. Show the current draft, short: problem in one line, features (one line each), deferred (one line each), open questions.
2. Ask with `AskUserQuestion`: up to 4 questions per round, each with 2-4 concrete options, your recommendation first marked "(Recommended)", every question understandable on its own (the user may see only the dialog). Ask about what changes the plan:
   - **Scope**: what is in this round, what waits (deferred), what is not wanted at all (rejected).
   - **Behaviour**: what happens on each trigger, in edge cases (app closed, no meter, demo mode, several characters, out of game), on errors.
   - **Data**: what is saved (save file `AppData` + migration, `fights.json`, IndexedDB, the Worker), what is exported or shared.
   - **UI**: which page / panel, which existing components (`src/lib/components/ui/*`, `app/*`), notifications (channel, sound).
   - **Priority and order** between features.
3. End every round with the question **"Is the plan complete?"** (options "Yes, run the final checks" / "No, keep going"). Anything other than an explicit yes = another round. Never decide on your own that it is complete.
4. Fold the answers into the draft:
   - Turned down ("no", "don't want that") → add it to `REJECTED_PROPOSALS.md` now (date, what it was, area), keep it out of the plan.
   - "Later" / "not now" → **Deferred**, with why and when to revisit.
   - Keep the ponytail ladder in mind: reuse what exists, the smallest version that solves the problem, nice-to-haves go to Deferred.

## 4. Clarify pass (after the user's yes)

Scan every feature for ambiguity, one category at a time: trigger, edge cases, data and migration, UI placement, error handling, notifications, performance (200 ms meter updates, Worker CPU/subrequest limits), tests. Anything underspecified becomes a question round (same rules as phase 3). If nothing is ambiguous, say so in one line and go on.

## 5. Self-check (before saving)

Check the draft against itself and fix it, or ask the user where a fix is a decision:
- Every requirement from the Problem and the Decisions is covered by at least one feature.
- Every feature has EARS acceptance criteria and a test (an `npm test` case, `cargo test`, or a UI check in the browser pane with `web-ui`).
- No feature breaks a `CLAUDE.md` rule or brings back something in `REJECTED_PROPOSALS.md`.
- Dependencies between features form no loop, and the order respects them.
- No new dependency unless the user approved it in the interview.
- Nothing is guessed: unknown game behaviour, ids, times are in Open questions, not in the features.

## 6. Save the plan file

Path: `.claude/plans/<kebab-slug>.plan.md`. Use exactly this shape: the implementation phase relies on it.

```markdown
# <Title>

Status: ready for implementation · Type: feature | bug | analysis · Planned: <YYYY-MM-DD>

## Problem
<2-4 lines: what the user wants and why.>

## Analysis
- **Today:** <what exists, with file:line paths>
- **Gap / root cause:** <…>
- **Constraints:** <the CLAUDE.md rules that apply>
- **Decisions:** <each interview answer that shaped the plan, one line each>

## Features to implement
Ordered: implement top to bottom.

- [ ] **F1. <name>** (S/M/L) — <what it does, one or two lines>
  - Acceptance (EARS):
    - WHEN <event> THE <app/component> SHALL <response>
    - WHILE <state> THE <…> SHALL <…>
    - IF <unwanted condition> THEN THE <…> SHALL <…>
    - THE <…> SHALL <always-true behaviour>
  - Where: <files / layers to touch>
  - Tests: <the test that fails if this breaks>
  - Depends on: <F-ids or "none">

## Deferred
Not in this round.

- **D1. <name>** — <what> · Why later: <…> · Revisit when: <trigger>

## Open questions
<What implementation must not guess (e.g. game behaviour to check in a recording). "None" if none.>
```

Then give the user the file path and ask (one `AskUserQuestion`) whether to start the design phase now (`sdlc-design` skill) or later. Do not start implementing.
