<script lang="ts">
  import { MECHANICS, VERIFIED, doubt, val } from "../../domain/wiki.ts";
</script>

<div class="wiki-cols">
  {#each MECHANICS as s (s.title)}<section class="wiki"><h2>{s.title}</h2><ul>
    {#each s.lines as x}<li>{val(x)}{#if doubt(x)} <span class="pill" title={doubt(x)}>Unconfirmed</span>{/if}</li>{/each}</ul></section>{/each}
</div>
<p class="hint">Global/EU build, checked {VERIFIED}. Sources are listed on each dungeon's page; hover "Unconfirmed" for the alternatives.</p>
