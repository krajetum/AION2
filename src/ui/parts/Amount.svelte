<script lang="ts">
  // A number that counts to its new value and flashes green (more) or red (less) when it changes: the Wallet's amounts.
  import { Tween } from "svelte/motion";
  import { num } from "../format.ts";

  let { value }: { value: number } = $props();
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shown = Tween.of(() => value, { duration: still ? 0 : 500 });
  let dir = $state(0), prev: number | undefined, timer = 0;
  $effect(() => {
    const v = value;
    if (prev !== undefined && v !== prev) {
      dir = Math.sign(v - prev);
      clearTimeout(timer);
      timer = setTimeout(() => { dir = 0; }, 1500);
    }
    prev = v;
    return () => clearTimeout(timer);
  });
</script>

<span class="amount" class:up={dir > 0} class:down={dir < 0}>{num(Math.round(shown.current))}</span>

<style>
  .amount { transition: color 1s; }
  .amount.up { color: var(--positive); transition: none; }
  .amount.down { color: var(--negative); transition: none; }
</style>
