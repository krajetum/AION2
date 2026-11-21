<script lang="ts">
  // The command palette (Ctrl+K, or the search box in the top bar): type a few letters to open a page, switch character
  // or tick a task of the selected character. A shadcn Dialog: Esc and a click outside close it.
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { setDone } from "../../app/progress.ts";
  import { isDone } from "../../domain/tasks.ts";
  import { act, track } from "../actions.ts";
  import { LABEL, PAGE } from "../format.ts";
  import { react } from "../overlays.ts";
  import { doneHere, TABS, ui, type Tab } from "../state.svelte.ts";

  type Item = { kind: string; label: string; run: () => void };
  const MAX = 12;

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
  }
  function pick(i: Item | undefined) {
    if (!i) return;
    shown = false;
    i.run();
  }
  function shortcut(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
    e.preventDefault();
    if (shown) shown = false; else open();
  }
  function keys(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); at = Math.min(found.length - 1, at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); at = Math.max(0, at - 1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(found[at]); }
  }
</script>

<svelte:window onkeydown={shortcut} />

<Dialog.Root bind:open={shown}>
  <Dialog.Content class="top-[12vh] translate-y-0 gap-2 p-3 sm:max-w-[520px]" showCloseButton={false} aria-label="Go to">
    <Dialog.Title class="sr-only">Go to</Dialog.Title>
    <Input type="search" placeholder="Open a page, switch character, tick a task…" aria-label="Command" autocomplete="off"
      bind:value={query} oninput={() => { at = 0; }} onkeydown={keys} />
    <div class="grid max-h-[50vh] gap-0.5 overflow-y-auto" role="listbox" aria-label="Results">
      {#each found as i, n}<button data-slot="option" role="option" aria-selected={n === at} class="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm {n === at ? 'bg-accent' : ''}"
          tabindex="-1" onclick={() => pick(i)} onpointermove={() => { at = n; }}>
        <span class="min-w-22 flex-none text-xs text-muted-foreground">{i.kind}</span>{i.label}</button>{:else}<p class="m-0 px-2 py-1.5 text-sm text-muted-foreground">Nothing matches.</p>{/each}
    </div>
    <p class="m-0 text-xs text-muted-foreground">↑ ↓ to move · Enter to choose · Esc to close</p>
  </Dialog.Content>
</Dialog.Root>
