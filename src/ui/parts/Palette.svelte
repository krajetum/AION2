<script lang="ts">
  // The command palette (Ctrl+K, or "Go to…" in the sidebar): type a few letters to open a page, switch character
  // or tick a task of the selected character. A native <dialog>: Esc and a click outside close it.
  import { setDone } from "../../app/progress.ts";
  import { isDone } from "../../domain/tasks.ts";
  import { act, track } from "../actions.ts";
  import { LABEL, PAGE } from "../format.ts";
  import { react } from "../overlays.ts";
  import { doneHere, TABS, ui, type Tab } from "../state.svelte.ts";

  type Item = { kind: string; label: string; run: () => void };
  const MAX = 12;

  let dialog: HTMLDialogElement;
  let query = $state(""), at = $state(0), shown = $state(false);

  const go = (t: Tab) => { ui.tab = t; history.replaceState(null, "", "#" + t); };
  // Built only while open: pages, the other characters, the checkbox tasks still to do (goal tasks count on their page).
  const items = $derived.by((): Item[] => !shown ? [] : [
    ...TABS.map((t): Item => ({ kind: "Page", label: PAGE[t][0], run: () => go(t) })),
    ...ui.data.characters.filter((c) => c.id !== ui.charId)
      .map((c): Item => ({ kind: "Character", label: c.name, run: () => { ui.charId = c.id; doneHere.clear(); } })),
    ...ui.data.tasks.filter((t) => t.enabled && !t.goals?.length && !isDone(t, ui.data.progress[ui.charId]?.[t.id]))
      .map((t): Item => ({ kind: `Tick ${LABEL[t.cadence].toLowerCase()}`, label: t.name,
        run: () => act(() => { track(t.id, () => setDone(ui.data, ui.charId, t.id, true)); react(ui.data.settings); }) })),
  ]);
  const words = $derived(query.toLowerCase().split(/\s+/).filter(Boolean));
  const found = $derived(items.filter((i) => words.every((w) => `${i.kind} ${i.label}`.toLowerCase().includes(w))).slice(0, MAX));

  export function open() {
    query = ""; at = 0; shown = true;
    dialog.showModal();
  }
  function pick(i: Item | undefined) {
    if (!i) return;
    dialog.close();
    i.run();
  }
  function shortcut(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
    e.preventDefault();
    if (dialog.open) dialog.close(); else open();
  }
  function keys(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); at = Math.min(found.length - 1, at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); at = Math.max(0, at - 1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(found[at]); }
  }
</script>

<svelte:window onkeydown={shortcut} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (Esc closes it; the click is the backdrop's) -->
<dialog bind:this={dialog} aria-label="Go to" onclose={() => { shown = false; }} onclick={(e) => { if (e.target === dialog) dialog.close(); }}>
  <input type="search" placeholder="Open a page, switch character, tick a task…" aria-label="Command" autocomplete="off"
    bind:value={query} oninput={() => { at = 0; }} onkeydown={keys}>
  <div class="list">
    {#each found as i, n}<button class="plain" class:on={n === at} tabindex="-1" onclick={() => pick(i)} onpointermove={() => { at = n; }}>
      <span class="kind">{i.kind}</span>{i.label}</button>{:else}<p class="hint">Nothing matches.</p>{/each}
  </div>
  <p class="hint">↑ ↓ to move · Enter to choose · Esc to close</p>
</dialog>

<style>
  dialog { width: min(520px, calc(100vw - 32px)); margin-top: 12vh; padding: var(--s-3); color: var(--text); background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: var(--shadow-float); }
  dialog::backdrop { background: color-mix(in srgb, var(--black) 50%, transparent); }
  input { width: 100%; }
  .list { display: grid; gap: 2px; max-height: 50vh; margin-top: var(--s-2); overflow-y: auto; }
  .list button { display: flex; align-items: baseline; gap: var(--s-2); width: 100%; padding: 6px var(--s-2); border-radius: var(--r-sm); }
  .list button.on { background: var(--active); }
  .kind { flex: none; min-width: 88px; color: var(--faint); font-size: var(--fs-sm); }
  .hint { margin: var(--s-2) 0 0; }
</style>
