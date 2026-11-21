<script lang="ts">
  // A titled card: the building block of every page (shadcn Card). `count` = a quiet number or note after the
  // title, `actions` = links or buttons on the right of the header, `head` = a title with markup instead of `title`.
  import type { Snippet } from "svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import { cn } from "$lib/utils.js";

  let { title = "", count = "", head, actions, children, class: cls = "", content = "", id }: {
    title?: string; count?: string | number; head?: Snippet; actions?: Snippet; children: Snippet; class?: string; content?: string; id?: string;
  } = $props();
</script>

<Card.Root class={cn("mb-3 gap-3 scroll-mt-16", cls)} {id}>
  {#if title || head || actions || count !== ""}<Card.Header class="flex flex-wrap items-center gap-2">
    <Card.Title class="text-sm font-semibold">{#if head}{@render head()}{:else}{title}{/if}</Card.Title>
    {#if count !== ""}<span class="text-xs text-muted-foreground tabular-nums">{count}</span>{/if}
    {#if actions}<div class="ml-auto flex flex-wrap items-center gap-2 text-sm">{@render actions()}</div>{/if}
  </Card.Header>{/if}
  <Card.Content class={content}>{@render children()}</Card.Content>
</Card.Root>
