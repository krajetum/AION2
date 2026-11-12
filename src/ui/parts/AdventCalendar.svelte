<script lang="ts">
  // The Advent calendar (domain/holiday.ts): 24 doors, today's and the ones before it can be opened, each hides a
  // Christmas cracker joke (domain/advent.ts): the question first, the answer when you pull the cracker.
  import { openAdventDoor } from "../../app/holiday.ts";
  import { JOKES } from "../../domain/advent.ts";
  import { ADVENT_DAYS, adventToday, canOpen, openedNow } from "../../domain/holiday.ts";
  import { act } from "../actions.ts";
  import { ui } from "../state.svelte.ts";
  import { winterNow } from "../winter.ts";

  // Stickers behind the opened doors: CC0 pixel art dropped in src/assets/winter/ (credited in NOTICE.md); none = a lit door.
  const STICKERS = Object.values(import.meta.glob<string>("../../assets/winter/*.png", { eager: true, query: "?url", import: "default" }));

  const now = $derived(winterNow(ui.now));
  const opened = $derived(new Set(openedNow(ui.data.advent, now)));
  const today = $derived(adventToday(now));
  const days = Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1);

  let picked = $state<number | null>(null), pulled = $state(false);
  const shown = $derived(picked ?? (today && opened.has(today) ? today : null));
  const joke = $derived(shown ? JOKES[shown - 1] : null);

  function open(day: number) {
    if (!canOpen(day, now)) return;
    if (!opened.has(day)) act(() => openAdventDoor(ui.data, day, now));
    if (picked !== day) pulled = false;
    picked = day;
  }
</script>

<section class="advent" aria-label="Advent calendar">
  <h2>Advent calendar <span class="count">{opened.size} / {ADVENT_DAYS} opened</span></h2>
  <div class="advent-body">
    <div class="doors">
      {#each days as d (d)}{@const ok = canOpen(d, now)}{@const isOpen = opened.has(d)}
        <button class="door" class:open={isOpen} class:today={d === today} class:waiting={ok && !isOpen} class:big={d === ADVENT_DAYS}
          aria-pressed={shown === d} disabled={!ok} title={ok ? (isOpen ? `${d} December` : `Open the door of ${d} December`) : `Opens on ${d} December`}
          onclick={() => open(d)}>
          {#if isOpen && STICKERS.length}<img src={STICKERS[(d - 1) % STICKERS.length]} alt="" />{/if}
          <span class="n">{d}</span></button>{/each}
    </div>
    <div class="cracker" aria-live="polite">
      {#if joke && shown}
        <small>{shown} December</small>
        <p class="setup">{joke.setup}</p>
        {#if pulled}<p class="punch">{joke.punchline}</p>
        {:else}<button onclick={() => { pulled = true; }}>Pull the cracker</button>{/if}
        <p class="credit">{#if joke.url}<a href={joke.url} target="_blank" rel="noopener">{joke.credit}</a>{:else}{joke.credit}{/if}</p>
      {:else if today}<p class="hint">Door {today} is waiting. Open it for today's Christmas cracker joke.</p>
      {:else}<p class="hint">Every door can be opened now: pick one to read its joke again.</p>{/if}
    </div>
  </div>
</section>
