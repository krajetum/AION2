<script lang="ts">
  import { markAllNewsRead } from "../../app/settings.ts";
  import { isImportant } from "../../domain/news.ts";
  import { act, markRead, refreshNews } from "../actions.ts";
  import { MEME } from "../memes.ts";
  import Meme from "../parts/Meme.svelte";
  import { openNews, ui } from "../state.svelte.ts";

  const long = (text: string) => text.length > 220 || text.split("\n").length > 3;
  function toggle(e: Event, gid: string) {
    if ((e.currentTarget as HTMLDetailsElement).open) openNews.add(gid); else openNews.delete(gid);
  }
</script>

<div class="toolbar">{#if ui.newsError}<span class="note">{ui.newsError}</span>{/if}
  <button class="ghost" onclick={() => act(() => markAllNewsRead(ui.data))}>Pretend I read them</button><button onclick={refreshNews}>F5</button></div>
<section><h2>Official announcements <span class="count">Steam</span></h2>{#each ui.data.news as n (n.gid)}
  <article class="news-item {n.read ? '' : 'unread'}">
    <a href={n.url} target="_blank" rel="noopener" onclick={() => markRead(n.gid)}>{n.title}</a>{#if isImportant(n)}<span class="pill">Important</span>{/if}
    <small>{new Date(n.date * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small>
    <p>{n.contents}</p>
    {#if long(n.contents)}<details open={openNews.has(n.gid)} ontoggle={(e) => toggle(e, n.gid)}>
      <summary><span>Show more</span><span>Show less</span></summary></details>{/if}</article>{:else}<p class="empty"><Meme src={MEME.empty} w={160} h={120} />No news. Devs are cooking.</p>{/each}</section>
