---
name: sdlc-design
description: Design phase of this project's SDLC, after sdlc-plan. Use when the user asks to design something in AION 2 Companion ("design X", "how should we build X", "technical design", "/sdlc-design"), when a plan in .claude/plans/ has Status "ready for implementation" and the user wants to move on, or right after sdlc-plan saves a plan. Reads the plan, designs interfaces, data model, alternatives with decisions, diagrams, errors/risks/tests and ordered tasks per feature, asks the user on each real choice, has a subagent review it, then saves .claude/plans/<slug>.design.md. Writes no code.
argument-hint: "<plan slug or path, optional>"
---

# SDLC: Design phase

Turn a saved plan into a technical design the implementation phase can follow task by task, in a fresh session.
**Write no code in this phase.** The only files you change are the design file and, on the user's yes, the plan file.
All questions and the design are in English.

Phases: **1 Load → 2 Explore → 3 Draft → 4 Choices (loop) → 5 Review → 6 Save.** Don't skip one.

## 1. Load the plan

- `$ARGUMENTS` names the plan (slug or path). If empty, list `.claude/plans/*.plan.md` with Status "ready for implementation" and ask which one (one question). No plan at all → tell the user and start `sdlc-plan` instead.
- Read the plan whole: Problem, Analysis, Decisions, Features (EARS criteria), Deferred, Open questions.
- A `<slug>.design.md` already exists → read it and ask: continue it, or redo it?
- Open questions that block the design (game behaviour, ids, times) → ask the user now; what nobody knows stays an open question and the design works around it (no guessing: `config.ts` `TO VERIFY` for times).

## 2. Explore the code each feature touches

`codegraph_explore` with the plan's "Where" files and symbols (the repo is indexed); `Read` only what it didn't cover. For each feature, note:
- what can be **reused** (a domain helper, a component in `src/lib/components/ui/*` or `app/*`, an existing store, a Worker route): the ponytail ladder — reuse, stdlib, native, installed dep, before new code;
- the **blast radius**: callers and tests of what changes;
- the layer each piece belongs in: `domain` (pure, tested) ← `app` (changes `AppData`) ← `ui` / `infra` (Tauri, Worker, storage); Rust in `src-tauri/` (meter: A2Tools' files kept close to upstream, changes listed in `src-tauri/meter/NOTICE.md`).

## 3. Draft the design

Per feature (and shared parts once):
- **Interfaces** — exact signatures before anything else (contracts first): TypeScript functions/types in `src/domain`, `src/app`; Svelte component props; Rust structs/commands/events; Worker routes with request/response shapes.
- **Data model** — new `AppData` fields (`types.ts`) + migration in `save-file.ts` `normalize` (or `SEED_VERSION` / `patchTasks` for seed changes); `fights.json` format (`FIGHTS_FORMAT`); IndexedDB; D1 migration file `server/migrations/00NN_<name>.sql`; what is exported, shared, uploaded.
- **Alternatives + decision** — only where a real choice exists (storage, where the logic lives, UI place, sync vs local): 2-3 options with trade-offs, the one chosen and why, in a short ADR block. No ADR for obvious choices.
- **Diagram** — a Mermaid flowchart or sequence diagram of the data path when more than two layers are involved (e.g. `meter-update` → `domain` → `app` → `ui` / Worker).
- **Errors, risks, edge cases** — failure modes and what the app does (no meter, demo mode, app closed across a reset, several characters, Worker down / 403, Discord refusing a post); performance (200 ms meter updates, the Worker's 10 ms CPU and 50 subrequests, fight file size); the CLAUDE.md rules that bite (ToS, `===` on server/meter times, allowed deps).
- **Tests** — for each EARS criterion of the feature, the test that checks it (`npm test` file + case name, `cargo test -p aion2-meter`, or a UI check in the browser pane with `web-ui`), written against the interfaces above.
- **Tasks** — ordered, each small enough for one commit: `T1.1`, `T1.2`… under `F1`. Test first, then the code that makes it pass, then UI. Each task names its files and the test that proves it.

## 4. Choices: a loop only the user ends

1. Show the draft in chat, short: per feature, the interfaces in one line each, the decisions to make, the task count.
2. Ask with `AskUserQuestion` only on **real choices** (each ADR still open, anything that changes what the user sees or what is saved): up to 4 per round, 2-4 options, your recommendation first marked "(Recommended)", each question understandable on its own.
3. **The plan is wrong or incomplete** (a feature can't work as written, a criterion is missing or contradicts another, a piece belongs in Deferred) → ask the user; on their yes, edit the plan file (features, EARS criteria, Deferred, Decisions) and record the change under "Plan changes" in the design. A feature turned down → `REJECTED_PROPOSALS.md` (date, what, area).
4. End every round with **"Is the design approved?"** ("Yes, run the review" / "No, keep going"). Only an explicit yes moves on.

## 5. Review pass (subagent)

Save the draft to the design file first (Status: "in review"), then start an `Agent` (general-purpose) with a self-contained prompt: the paths of the plan file, the design file and `CLAUDE.md`, and this checklist, asking for a list of findings only (no edits):
- every EARS criterion has a test; every feature has tasks; every task has files and a test;
- the interfaces are consistent across features and tasks; types and names match the code that exists;
- no CLAUDE.md rule is broken (ToS, layers, allowed deps, `TO VERIFY` times, `===` on server/meter times, meter files close to upstream) and nothing from `REJECTED_PROPOSALS.md` came back;
- the data model has its migration; no task depends on a later one;
- a simpler approach the design missed (reuse of existing code, a smaller version).

Check each finding against the code yourself. Fix the plain ones; real choices go back to the user as a question round (phase 4 rules). Say in one line what the review found and what changed.

## 6. Save the design file

Path: `.claude/plans/<slug>.design.md` (same slug as the plan). Then set the plan's Status line to `designed` and add `Design: <slug>.design.md`. Use exactly this shape: the implementation phase relies on it.

````markdown
# <Title>: design

Status: ready for implementation · Plan: <slug>.plan.md · Designed: <YYYY-MM-DD>

## Overview
<3-5 lines: the approach in plain words.>

```mermaid
<the data path, when more than two layers are involved>
```

## Decisions
### ADR-1. <choice>
- Options: <A> · <B> · <C>
- Chosen: <A> — <why>
- Consequences: <what it costs / rules out>

## Data model
- `AppData.<field>`: <type> — <meaning> · migration: <what normalize does for old saves>
- <fights.json / IndexedDB / D1 migration file / Worker shapes>

## Features

### F1. <name>
**Interfaces**
```ts
<exact signatures>
```
**Errors & edge cases:** <case → behaviour>, one per line
**Tests** (EARS → test):
- WHEN … SHALL … → `src/domain/<x>.test.ts` "<case name>"

**Tasks**
- [ ] **T1.1** <what> — files: <…> — proves: <test>
- [ ] **T1.2** …

## Risks
- <risk> → <mitigation>

## Plan changes
<What the design changed in the plan, with the user's yes. "None" if none.>

## Open questions
<Still unknown; the tasks that depend on each. "None" if none.>
````

Then give the user the file path and ask (one `AskUserQuestion`) whether to start the build phase now (`sdlc-build` skill, preferably in a fresh session) or later. Do not start implementing in this phase.
