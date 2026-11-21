<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  import { MECHANICS, VERIFIED, doubt, val } from "../../domain/wiki.ts";
</script>

<div class="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-x-3">
  {#each MECHANICS as s (s.title)}<Panel title={s.title}><ul class="m-0 list-disc space-y-1 pl-5 text-sm marker:text-muted-foreground">
    {#each s.lines as x}<li>{val(x)}{#if doubt(x)} <Badge variant="secondary" class="text-gold" title={doubt(x)}>Unconfirmed</Badge>{/if}</li>{/each}</ul></Panel>{/each}
</div>
<p class="hint">Global/EU build, checked {VERIFIED}. Sources are listed on each dungeon's page; hover "Unconfirmed" for the alternatives.</p>
