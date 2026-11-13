<script lang="ts">
  // Planned raids: the list for everyone allowed to see it, the form and Cancel for whoever may plan them.
  import { cancelCallup, createCallup, sendCallup } from "../../../app/guild.ts";
  import { can, leadText, type GuildLink, type GuildView, type Ping } from "../../../domain/guild.ts";
  import { formatCountdown } from "../../../domain/time.ts";
  import { refreshGuild } from "../../actions.ts";
  import { ui } from "../../state.svelte.ts";
  import { gs, run, when } from "./run.svelte.ts";

  let { g, view, go }: { g: GuildLink; view: GuildView; go: (section: string) => void } = $props();
  const plans = $derived(can(view, g, "manage.callups"));

  const localInput = (t: number) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };
  const minWhen = localInput(Date.now());
  let cuWhen = $state(""), cuMessage = $state(""), cuPing = $state<Ping>("none"), cuLeads = $state<number[]>([1440, 60]);
  let leadAmount = $state(2), leadUnit = $state<"minutes" | "hours" | "days">("days");
  function addLead() {
    const min = Math.round(leadAmount * (leadUnit === "days" ? 1440 : leadUnit === "hours" ? 60 : 1));
    if (!(min >= 0 && min <= 14 * 1440) || cuLeads.includes(min)) return;
    cuLeads = [...cuLeads, min].sort((a, b) => b - a);
  }
  const addCallup = () => run(async () => {
    const atMs = new Date(cuWhen).getTime();
    if (!(atMs > Date.now())) throw new Error("Pick a time in the future.");
    await createCallup(ui.data, { atMs, message: cuMessage.trim(), ping: cuPing, leads: cuLeads });
    cuWhen = ""; cuMessage = ""; cuPing = "none";
    await refreshGuild(false);
  }, "Call-up planned");
</script>

<section><h2>Planned <span class="count">{view.callups.length}</span></h2>
  {#each view.callups as c (c.id)}<div class="callup" class:past={c.atMs <= ui.now}>
    <div><b>{when(c.atMs)}</b> <span class="dim">{c.atMs > ui.now ? `in ${formatCountdown(c.atMs - ui.now)}` : "now"}</span>
      {#if c.ping !== "none"}<span class="tag">@{c.ping}</span>{/if}</div>
    <p>{c.message}</p>
    <small class="dim">Reminders: {c.leads.map((l) => leadText(l) + (l ? " before" : "")).join(" · ")}</small>
    {#if plans}<div class="acts"><button class="ghost" disabled={gs.busy || !view.hasWebhook} title={view.hasWebhook ? "" : "Set a Discord webhook first"} onclick={() => { if (confirm("Post this call-up to Discord now?")) run(() => sendCallup(ui.data, c.id), "Posted to Discord"); }}>Send to Discord now</button>
    <button class="ghost" disabled={gs.busy} onclick={() => { if (confirm("Cancel this call-up? No more reminders are sent.")) run(() => cancelCallup(ui.data, c.id).then(() => refreshGuild(false)), "Call-up cancelled"); }}>Cancel</button></div>{/if}
  </div>{:else}<p class="hint">No raid planned.{plans ? "" : " You get a \"Guild reminder\" here and in Discord when one is."}</p>{/each}
</section>

{#if plans}<section><h2>New call-up</h2>
  <form class="new-callup" onsubmit={(e) => { e.preventDefault(); void addCallup(); }}>
    <label>When <input type="datetime-local" bind:value={cuWhen} min={minWhen} required></label>
    <label>Message <textarea bind:value={cuMessage} maxlength="500" rows="3" placeholder="Raid Gartua: meet at the portal, bring potions" required></textarea></label>
    <div class="seg" role="group" aria-label="Ping in Discord">
      {#each [["none", "No ping"], ["here", "@here"], ["everyone", "@everyone"]] as [v, label]}
        <button type="button" class:on={cuPing === v} aria-pressed={cuPing === v} onclick={() => { cuPing = v as Ping; }}>{label}</button>{/each}
    </div>
    <div class="leads">Reminders:
      {#each cuLeads as l, i (l)}<span class="chip">{leadText(l)}{l ? " before" : ""}
        <button type="button" class="ghost" aria-label="Remove reminder {leadText(l)}" onclick={() => { cuLeads = cuLeads.filter((_, k) => k !== i); }}>×</button></span>{/each}
      {#if cuLeads.length < 5}<span class="add">
        <input type="number" min="0" max={leadUnit === "days" ? 14 : leadUnit === "hours" ? 336 : 20160} bind:value={leadAmount} aria-label="Reminder amount">
        <select bind:value={leadUnit} aria-label="Reminder unit"><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select>
        <button type="button" class="ghost" onclick={addLead}>Add reminder</button></span>{/if}
    </div>
    <p class="hint">Members get a "Guild reminder" at each time: in the app, and in Discord
      {#if view.hasWebhook}(the guild's webhook).{:else}once a webhook is set{#if can(view, g, "manage.discord")} (<button type="button" class="link" onclick={() => go("discord")}>Discord</button>){/if}. Until then, only members' apps.{/if}
      0 = at the time.</p>
    <button disabled={gs.busy || !cuLeads.length}>Plan call-up</button>
  </form>
</section>{/if}

<style>
  .callup { border-top: 1px solid var(--rule); padding: 8px 0; display: grid; gap: 4px; }
  .callup.past { opacity: 0.6; }
  .callup p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .acts { display: flex; gap: 8px; }
  .tag { font-size: 12px; padding: 0 6px; border-radius: 8px; background: var(--gold-bg); color: var(--gold-ink); }
  .new-callup { display: grid; gap: 8px; max-width: 560px; }
  .new-callup label { display: grid; gap: 4px; }
  .leads { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px 2px 8px; border-radius: 12px; border: 1px solid var(--border); }
  .add { display: inline-flex; gap: 4px; align-items: center; }
  .add input { width: 64px; }
</style>
