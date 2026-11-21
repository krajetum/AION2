<script lang="ts">
  // A titled fold (shadcn Collapsible): a chevron, the title, a quiet note after it; open by default when `open`.
  // `nested` = inside another fold (a step lighter). The Players page's Total + one fold per part (Daevanion, Genus, Stats from gear).
  import type { Snippet } from "svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { cn } from "$lib/utils.js";

  let { title, note = "", open = $bindable(false), nested = false, children }: {
    title: string; note?: string; open?: boolean; nested?: boolean; children: Snippet;
  } = $props();
</script>

<Collapsible.Root bind:open class={cn("rounded-md", nested ? "bg-secondary/60" : "border bg-card")}>
  <Collapsible.Trigger class="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-semibold hover:bg-accent/40 rounded-md">
    <ChevronRight class="size-4 shrink-0 text-primary transition-transform {open ? 'rotate-90' : ''}" />{title}
    {#if note}<span class="text-xs font-normal text-muted-foreground">{note}</span>{/if}
  </Collapsible.Trigger>
  <Collapsible.Content class="px-3 pb-3">{@render children()}</Collapsible.Content>
</Collapsible.Root>
