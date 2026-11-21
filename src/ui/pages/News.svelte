<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  import Empty from "../parts/Empty.svelte";
  import { markAllNewsRead } from "../../app/settings.ts";
  import { isImportant } from "../../domain/news.ts";
  import { act, markRead, refreshNews } from "../actions.ts";
  import { openNews, ui } from "../state.svelte.ts";

  const long = (text: string) => text.length > 220 || text.split("\n").length > 3;
  const toggle = (gid: string) => (openNews.has(gid) ? openNews.delete(gid) : openNews.add(gid));
</script>

<div class="mb-3 flex flex-wrap items-center justify-end gap-2">{#if ui.newsError}<span class="mr-auto text-sm text-gold">{ui.newsError}</span>{/if}
  <Button variant="ghost" size="sm" onclick={() => act(() => markAllNewsRead(ui.data))}>Mark all read</Button><Button variant="outline" size="sm" onclick={refreshNews}>Refresh</Button></div>
<Panel title="Official announcements" count="Steam">{#each ui.data.news as n (n.gid)}
  <article class="relative border-b py-3 pl-4 last:border-0">
    {#if !n.read}<span class="absolute top-[1.15rem] left-0 size-1.5 rounded-full bg-primary"></span>{/if}
    <a class="font-semibold hover:underline {n.read ? 'text-muted-foreground' : ''}" href={n.url} target="_blank" rel="noopener" onclick={() => markRead(n.gid)}>{n.title}</a>{#if isImportant(n)}<Badge variant="secondary" class="ml-2 text-gold">Important</Badge>{/if}
    <div class="mt-0.5 text-xs text-muted-foreground">{new Date(n.date * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
    <p class="mt-1.5 mb-0 max-w-[75ch] whitespace-pre-line text-muted-foreground {openNews.has(n.gid) ? '' : 'line-clamp-3'}">{n.contents}</p>
    {#if long(n.contents)}<Button variant="link" size="xs" class="mt-1 px-0" aria-expanded={openNews.has(n.gid)} onclick={() => toggle(n.gid)}>{openNews.has(n.gid) ? "Show less" : "Show more"}</Button>{/if}
  </article>{:else}<Empty>No news yet.</Empty>{/each}</Panel>
