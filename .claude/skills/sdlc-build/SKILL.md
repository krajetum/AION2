---
name: sdlc-build
description: Build (implementation) phase of this project's SDLC, after sdlc-plan and sdlc-design. Use when the user asks to build, implement, code or start a designed feature in AION 2 Companion ("build X", "implement the plan", "start coding", "/sdlc-build"), or when a design in .claude/plans/ has Status "ready for implementation" and the user wants to move on. Works through the design's tasks in order, test first (red proven, then green), one commit per task on a feature branch, stops after each feature for the user, runs the full local CI, a subagent code review and a CLAUDE.md update, then offers push + PR.
argument-hint: "<plan/design slug, optional>"
---

# SDLC: Build phase

Implement a saved design task by task. The design is the contract: build what it says, nothing more.
Questions, code comments, commits and UI text are in English. No Claude attribution or co-author lines in commits or PRs.

Phases: **1 Load → 2 Branch → 3 Tasks (loop) → 4 Feature checkpoint → 5 Final gate → 6 Finish.** Don't skip one.

## 1. Load

- `$ARGUMENTS` names the slug. If empty, list `.claude/plans/*.design.md` with Status "ready for implementation" (or "building": resume it) and ask which one.
- No design for the plan → ask: run `sdlc-design` first (recommended), or build straight from the plan (only for an S-sized plan).
- Read the plan and the design whole. Open questions that a task depends on → ask now; a task still blocked by one is skipped and listed at the end, never guessed (times: `config.ts` `TO VERIFY`).
- Set the design's Status to `building`.

## 2. Branch

- `git status`: uncommitted changes that aren't this build's → ask what to do (commit them first, stash, or build on top). Never discard them.
- Create `feat/<slug>` off `main` (pull first). If the user is on another feature branch the build depends on, ask whether to branch from it instead.
- Resuming: check out the existing `feat/<slug>`; ticked tasks `[x]` in the design are done.

## 3. Tasks: one at a time, in the design's order

For each unticked task `Tn.m`:
1. **Read** the files it names (`codegraph_explore` first; the repo is indexed) and the interfaces the design gives for it.
2. **Red** — write the task's test (`src/**/*.test.ts` or `server/**/*.test.ts` with `node --test`, Rust `#[test]` in `src-tauri/meter`). Run it (`npm test`, or `cargo test -p aion2-meter` in `src-tauri/`) and see it **fail for the right reason** (the missing behaviour, not a typo or import error). For a UI-only task, the check is a browser-pane check instead (step 4).
3. **Green** — the smallest code that makes it pass, following the design's signatures and the ponytail ladder (reuse what exists, no extra abstractions). Run the tests: the new one and every one before it pass.
4. **UI tasks** — `preview_start` with `web-ui`, check the change in the browser pane (`read_page`, console errors, click through it); outside Tauri the meter shows its demo fight and storage is localStorage. What only `npm run tauri dev` shows (toasts, tray, overlays, real meter) → list it for the user to check.
5. **Refactor** on green if needed; tests still pass. `npx tsc --noEmit` for `.ts`, `npm run check` when a `.svelte` file changed, `cargo build` in `src-tauri/` when Rust changed.
6. **Commit** — one commit per task: `T1.2: <what>` + one line why. Tick the task `[x]` in the design file in the same commit.

**The code can't follow the design** (a signature doesn't fit, a hidden case, existing code to reuse instead, a rule in CLAUDE.md that blocks it) → stop, explain in two or three lines, ask with `AskUserQuestion` (your recommendation first). On yes, edit the design (and the plan if a feature or EARS criterion changes) and log it under `## Build changes` in the design: date, task, what changed, why. A feature dropped → `Deferred` in the plan, or `REJECTED_PROPOSALS.md` if the user doesn't want it at all.

Never: weaken or delete a test to make it pass, skip a hook, add a dependency not in CLAUDE.md's allowed list without asking, break the ToS rules (passive traffic copy only), compare server/meter times with `===`.

## 4. Feature checkpoint (after each feature's last task)

Show, short: the feature, its tasks done (commit hashes), the test results, what was checked in the browser pane, what is left for `tauri dev`, any build changes. Ask: **"Continue with F<next>?"** ("Yes, continue" / "Stop here"). Stop here = the design keeps Status `building`, resumable later.

## 5. Final gate (after the last feature)

1. **Full local CI** — all must pass (the same as the CI's `check` + `release` jobs):
   - `npm test`
   - `npx tsc --noEmit` and the same in `server/` when it changed
   - `npm run check`
   - `cargo test -p aion2-meter` and `cargo build` in `src-tauri/` when Rust changed
   Fix failures here; a failure you can't fix → tell the user with the output, don't hide it.
2. **Subagent code review** — start an `Agent` (general-purpose) with a self-contained prompt: the plan, design and `CLAUDE.md` paths, the branch name and `git diff main...feat/<slug>`; ask for findings only (no edits): bugs, missed EARS criteria, broken CLAUDE.md rules (layers, ToS, allowed deps, `TO VERIFY`, `===` on server/meter times, A2Tools files changed without a `src-tauri/meter/NOTICE.md` entry, old shared CSS classes), simpler code. Check each finding against the code yourself; fix the real ones (test first, own commit `review: <what>`); a finding that needs a decision → ask the user.
3. **CLAUDE.md** — add the new modules, files, settings, commands and rules to the Layout / Rules in the file's own dense style (what, where, why). Commit `docs: CLAUDE.md for <slug>`.
4. Set the design's and the plan's Status to `built`.

## 6. Finish

Report: the branch, the commits, the gate's results, the build changes, what to check in `npm run tauri dev`, the skipped tasks and open questions left.
Then ask: **"Push the branch and open a PR to main?"** ("Yes, push + PR" / "Not now"). Only on yes: `git push -u origin feat/<slug>`, `gh pr create` (title = the plan's title, body = problem, features built, tests, what to check by hand; no attribution lines). Never merge: merging into `main` releases a version, that's the user's call.
