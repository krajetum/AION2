<script lang="ts">
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // Home > Twitch Drops: campaigns players share (crowd Worker, listed until they end).
  // Claimed: your own tick (kept in the save file). Wrong / ended: your vote; 5 votes remove it for everyone.
  import { shareDrop, toggleClaimed, voteWrong } from "../../app/drops.ts";
  import { leftText } from "../../domain/codes.ts";
  import { CAMPAIGNS_URL, cleanDrop, DROP_VOTES, MAX_REWARDS, MAX_TITLE, toClaim, type TwitchDrop } from "../../domain/drops.ts";
  import { CrowdError } from "../../infra/crowd.ts";
  import { act, refreshDrops, save } from "../actions.ts";
  import { showStatus } from "../overlays.ts";
  import { ui } from "../state.svelte.ts";

  let draft = $state({ title: "", rewards: "", url: "", ends: "" }), busy = $state(false), error = $state(""), open = $state(false);
  const marks = $derived(ui.data.drops);
  const left = $derived(toClaim(ui.drops, marks, ui.now));
  // Still to claim first (soonest end first), then the ones you claimed or marked wrong.
  const live = $derived([...left, ...ui.drops.filter((d) => d.endsMs > ui.now && !left.includes(d))]);

  $effect(() => { refreshDrops(); });

  const why = (e: unknown) => e instanceof CrowdError
    ? e.status === 409 ? (e.reason === "already listed" ? "That campaign is already in the list." : "That campaign ended or was marked wrong lately.")
      : e.status === 429 ? "Too many changes this hour: try again later." : e.status === 400 ? "The server didn't take that campaign." : `The server said: ${e.reason || e.status}`
    : "Offline: the campaign wasn't sent.";

  async function send(ev: SubmitEvent) {
    ev.preventDefault();
    const d = cleanDrop(draft, Date.now());
    if (typeof d === "string") { error = d; return; }
    busy = true; error = "";
    try {
      await shareDrop(ui.data, d);
      draft = { title: "", rewards: "", url: "", ends: "" };
      open = false;
      showStatus(`Shared ${d.title} with everyone`);
      await refreshDrops();
    } catch (e) { error = why(e); } finally { busy = false; }
  }

  async function wrong(d: TwitchDrop) {
    busy = true; error = "";
    try {
      const removed = await voteWrong(ui.data, d);
      await save();
      showStatus(removed ? `${d.title} removed: ${DROP_VOTES} players marked it wrong` : `Marked ${d.title} wrong`);
      await refreshDrops();
    } catch (e) { error = why(e); } finally { busy = false; }
  }
</script>

<Panel title="Twitch Drops" count={left.length ? `${left.length} to claim` : live.length ? "all claimed" : ""}>
  {#snippet actions()}<a class="text-primary hover:underline" href={CAMPAIGNS_URL} target="_blank" rel="noreferrer">Your drops on Twitch</a>{/snippet}
  {#if live.length}<ul class="m-0 list-none p-0">
    {#each live as d (d.key)}{@const done = marks.redeemed.includes(d.key)}{@const dead = marks.expired.includes(d.key)}
      <li class="flex flex-wrap items-center gap-2 border-b py-1.5 {done || dead ? 'opacity-55' : ''}">
        <div class="min-w-0 flex-1">
          <div class="font-medium">{d.title}</div>
          <small class="text-xs text-muted-foreground">{d.startsMs && d.startsMs > ui.now ? `starts in ${leftText(d.startsMs - ui.now).replace(" left", "")} · ` : ""}{leftText(d.endsMs - ui.now)}{d.rewards ? ` · ${d.rewards}` : ""}{d.votes ? ` · ${d.votes}/${DROP_VOTES} marked wrong` : ""}</small>
        </div>
        <span class="flex gap-1.5">
          {#if d.url}<a class={buttonVariants({ variant: "ghost", size: "sm" })} href={d.url} target="_blank" rel="noreferrer">Watch</a>{/if}
          <Button variant={done ? "secondary" : "outline"} size="sm" aria-pressed={done} onclick={() => act(() => toggleClaimed(ui.data, d))}>{done ? "Claimed" : "Claim"}</Button>
          <Button variant="ghost" size="sm" disabled={busy || dead} title={dead ? "You marked it wrong" : `Wrong or over: ${DROP_VOTES} players saying so remove it for everyone`}
            onclick={() => wrong(d)}>{dead ? "Marked wrong" : "Wrong"}</Button>
        </span>
      </li>{/each}
  </ul>{:else}<p class="hint">{ui.dropsError || "No campaign shared right now."}</p>{/if}

  {#if open}
    <form class="mt-2.5 grid gap-2" onsubmit={send}>
      <Input bind:value={draft.title} placeholder="Campaign title" aria-label="Campaign title" maxlength={MAX_TITLE} required />
      <Input bind:value={draft.rewards} placeholder="Rewards (e.g. mount skin after 2 h watched)" aria-label="Rewards" maxlength={MAX_REWARDS} />
      <div class="flex flex-wrap gap-2">
        <Input class="min-w-0 flex-1" type="datetime-local" bind:value={draft.ends} aria-label="Ends (your local time)" title="Ends (your local time)" required />
        <Input class="min-w-0 flex-1" type="url" bind:value={draft.url} placeholder="https://www.twitch.tv/… (optional)" aria-label="Twitch link" />
      </div>
      <span class="flex gap-2">
        <Button type="submit" disabled={busy || !draft.title.trim() || !draft.ends}>Send to others</Button>
        <Button type="button" variant="ghost" onclick={() => { open = false; error = ""; }}>Cancel</Button>
      </span>
    </form>
  {:else}<Button class="mt-2.5" variant="outline" size="sm" onclick={() => (open = true)}>Share a campaign</Button>{/if}
  {#if error}<p class="hint error">{error}</p>{/if}
  <p class="hint">A shared campaign stays listed for everyone until it ends. Claimed is only yours. Link your game account and watch progress on Twitch.</p>
</Panel>
