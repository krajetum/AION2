<script lang="ts">
  // Planned raids: the list for everyone allowed to see it, the form and Cancel for whoever may plan them.
  import { tick } from "svelte";
  import { cancelCallup, createCallup, sendCallup } from "../../../app/guild.ts";
  import { can, discordHtml, leadText, type GuildLink, type GuildView, type Ping } from "../../../domain/guild.ts";
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
  const PRESETS = [1440, 180, 60, 15, 0];
  const leadLabel = (l: number) => l ? `${leadText(l)} before` : "At the time";
  const options = $derived([...new Set([...PRESETS, ...cuLeads])].sort((a, b) => b - a));
  function toggleLead(l: number) {
    if (cuLeads.includes(l)) cuLeads = cuLeads.filter((x) => x !== l);
    else if (cuLeads.length < 5) cuLeads = [...cuLeads, l].sort((a, b) => b - a);
  }
  const atMs = $derived(cuWhen ? new Date(cuWhen).getTime() : NaN);
  const full = (t: number) => new Date(t).toLocaleString([], { dateStyle: "full", timeStyle: "short" });

  // The message is Discord markdown: the buttons wrap the selection, the preview shows it as Discord will.
  let ta = $state<HTMLTextAreaElement>();
  async function edit(before: string) {
    if (!ta) return;
    const a = ta.selectionStart, b = ta.selectionEnd, sel = cuMessage.slice(a, b);
    cuMessage = (cuMessage.slice(0, a) + before + sel + before + cuMessage.slice(b)).slice(0, 500);
    await tick();
    ta.focus(); ta.setSelectionRange(a + before.length, a + before.length + sel.length);
  }
  async function bullet() {
    if (!ta) return;
    const at = ta.selectionStart, a = cuMessage.lastIndexOf("\n", at - 1) + 1;
    cuMessage = (cuMessage.slice(0, a) + "- " + cuMessage.slice(a)).slice(0, 500);
    await tick();
    ta.focus(); ta.setSelectionRange(at + 2, at + 2);
  }
  // mark, name, glyph on the button, Ctrl+key
  const MARKS = [["**", "Bold", "B", "b"], ["*", "Italic", "I", "i"], ["__", "Underline", "U", "u"], ["~~", "Strikethrough", "S", ""], ["`", "Code", "</>", ""]];
  function keys(e: KeyboardEvent) {
    const m = (e.ctrlKey || e.metaKey) && MARKS.find((x) => x[3] === e.key.toLowerCase());
    if (m) { e.preventDefault(); void edit(m[0]); }
  }

  const addCallup = () => run(async () => {
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
    <p>{@html discordHtml(c.message)}</p>
    <small class="dim">Reminders: {c.leads.map((l) => leadText(l) + (l ? " before" : "")).join(" · ")}</small>
    {#if plans}<div class="acts"><button class="ghost" disabled={gs.busy || !view.hasWebhook} title={view.hasWebhook ? "" : "Set a Discord webhook first"} onclick={() => { if (confirm("Post this call-up to Discord now?")) run(() => sendCallup(ui.data, c.id), "Posted to Discord"); }}>Send to Discord now</button>
    <button class="ghost" disabled={gs.busy} onclick={() => { if (confirm("Cancel this call-up? No more reminders are sent.")) run(() => cancelCallup(ui.data, c.id).then(() => refreshGuild(false)), "Call-up cancelled"); }}>Cancel</button></div>{/if}
  </div>{:else}<p class="hint">No raid planned.{plans ? "" : " You get a \"Guild reminder\" here and in Discord when one is."}</p>{/each}
</section>

{#if plans}<section><h2>New call-up</h2>
  <form class="composer" onsubmit={(e) => { e.preventDefault(); void addCallup(); }}>
    <div class="fields">
      <div class="field"><label for="cu-when">When</label>
        <div class="row"><input id="cu-when" type="datetime-local" bind:value={cuWhen} min={minWhen} required>
          {#if atMs > ui.now}<span class="dim">in {formatCountdown(atMs - ui.now)}</span>{:else if cuWhen}<span class="bad">in the past</span>{/if}</div>
        <small>Your local time. Discord shows it in each reader's own zone.</small>
      </div>

      <div class="field"><label for="cu-msg">Message</label>
        <div class="editor">
          <div class="tools" role="toolbar" aria-label="Formatting">
            {#each MARKS as [mark, name, glyph, key]}
              <button type="button" class="ghost m-{name.toLowerCase()}" title={key ? `${name} (Ctrl+${key.toUpperCase()})` : name} aria-label={name} onclick={() => edit(mark)}>{glyph}</button>{/each}
            <button type="button" class="ghost" title="Bullet" aria-label="Bullet" onclick={bullet}>•</button>
            <span class="count" class:bad={cuMessage.length >= 500}>{cuMessage.length} / 500</span>
          </div>
          <textarea id="cu-msg" bind:this={ta} bind:value={cuMessage} onkeydown={keys} maxlength="500" rows="5" placeholder="Raid Gartua: meet at the portal, bring potions" required></textarea>
        </div>
      </div>

      <div class="field"><span class="lbl" id="cu-ping">Ping in Discord</span>
        <div class="seg" role="group" aria-labelledby="cu-ping">
          {#each [["none", "No ping"], ["here", "@here"], ["everyone", "@everyone"]] as [v, label]}
            <button type="button" class:on={cuPing === v} aria-pressed={cuPing === v} onclick={() => { cuPing = v as Ping; }}>{label}</button>{/each}
        </div>
      </div>

      <div class="field"><span class="lbl" id="cu-leads">Reminders <span class="count">{cuLeads.length} / 5</span></span>
        <div class="pills" role="group" aria-labelledby="cu-leads">
          {#each options as l (l)}
            <button type="button" class="pill" class:on={cuLeads.includes(l)} aria-pressed={cuLeads.includes(l)}
              disabled={!cuLeads.includes(l) && cuLeads.length >= 5} onclick={() => toggleLead(l)}>{leadLabel(l)}</button>{/each}
        </div>
        {#if cuLeads.length < 5}<div class="row">
          <input class="amount" type="number" min="1" max={leadUnit === "days" ? 14 : leadUnit === "hours" ? 336 : 20160} bind:value={leadAmount} aria-label="Reminder amount">
          <select bind:value={leadUnit} aria-label="Reminder unit"><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select>
          <span class="dim">before</span>
          <button type="button" class="ghost" onclick={addLead}>+ Add</button></div>{/if}
      </div>

      <button class="primary" disabled={gs.busy || !cuLeads.length}>Plan call-up</button>
    </div>

    <div class="preview" role="group" aria-label="Preview">
      <span class="lbl">Discord preview</span>
      <div class="discord">
        <div class="avatar" aria-hidden="true">A2</div>
        <div class="msg">
          <div><b>AION 2 Companion</b> <span class="app">APP</span></div>
          {#if cuPing !== "none"}<div><span class="mention">@{cuPing}</span></div>{/if}
          <div class="embed">
            <b>Guild reminder</b>
            <div class="desc" class:blank={!cuMessage.trim()}>{#if cuMessage.trim()}{@html discordHtml(cuMessage.trim())}{:else}Your message{/if}</div>
            <b class="fname">When</b>
            <div>{#if atMs > ui.now}{full(atMs)} <span class="rel">in {formatCountdown(atMs - ui.now)}</span>{:else}<span class="blank">Pick a time</span>{/if}</div>
          </div>
        </div>
      </div>

      <span class="lbl">Reminders go out</span>
      {#if !cuLeads.length}<small class="bad">Pick at least one reminder.</small>
      {:else if !(atMs > ui.now)}<small>Pick a time to see when each one is sent.</small>
      {:else}<ul class="schedule">
        {#each cuLeads as l (l)}{@const t = atMs - l * 60_000}
          <li class:gone={t <= ui.now}><span>{when(t)}</span><span class="dim">{t <= ui.now ? "already passed" : leadLabel(l).toLowerCase()}</span></li>{/each}
      </ul>{/if}
      <small>Members get a "Guild reminder" at each time: in the app, and in Discord
        {#if view.hasWebhook}(the guild's webhook).{:else}once a webhook is set{#if can(view, g, "manage.discord")} (<button type="button" class="link" onclick={() => go("discord")}>Discord</button>){/if}. Until then, only members' apps.{/if}</small>
    </div>
  </form>
</section>{/if}

<style>
  .callup { border-top: 1px solid var(--rule); padding: 8px 0; display: grid; gap: 4px; }
  .callup.past { opacity: 0.6; }
  .callup p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .acts { display: flex; gap: 8px; }
  .tag { font-size: 12px; padding: 0 6px; border-radius: 8px; background: var(--gold-bg); color: var(--gold-ink); }

  .composer { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 24px; align-items: start; margin-top: 10px; }
  .fields, .preview { display: grid; gap: 16px; min-width: 0; }
  .preview { gap: 8px; }
  .field { display: grid; gap: 6px; justify-items: start; }
  label, .lbl { display: flex; gap: 8px; align-items: baseline; font-size: 12px; font-weight: 600; color: var(--muted); }
  .preview .lbl:not(:first-child) { margin-top: 10px; }
  small { color: var(--faint); font-size: 12px; }
  .bad { color: var(--neg-ink); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .amount { width: 72px; }
  .primary { justify-self: start; min-width: 160px; }

  .editor { width: 100%; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--ground); overflow: hidden; }
  .editor:focus-within { border-color: var(--primary); }
  .tools { display: flex; align-items: center; gap: 2px; padding: 4px; border-bottom: 1px solid var(--rule); }
  .tools button { min-width: 28px; height: 26px; padding: 0 6px; border: 0; }
  .tools .count { margin-left: auto; padding-right: 6px; }
  .m-bold { font-weight: 700; }
  .m-italic { font-style: italic; }
  .m-underline { text-decoration: underline; }
  .m-strikethrough { text-decoration: line-through; }
  .m-code { font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
  textarea { display: block; width: 100%; box-sizing: border-box; padding: 8px 10px; border: 0; outline: 0; resize: vertical; background: transparent; color: var(--text); font: inherit; line-height: 1.45; }
  textarea::placeholder { color: var(--faint); }

  .pills { display: flex; flex-wrap: wrap; gap: 6px; }
  .pill { height: 28px; padding: 0 12px; border-radius: var(--r-pill); border: 1px solid var(--border); background: transparent; color: var(--muted); }
  .pill.on { border-color: transparent; background: var(--gold-bg); color: var(--gold-ink); }

  /* Discord's own dark colours: this box shows the post as it lands there. */
  .discord { display: flex; gap: 12px; padding: 14px; border-radius: var(--r-card); background: #313338; color: #dbdee1; font-size: 14px; }
  .avatar { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--primary-fill); color: #fff; font-size: 12px; font-weight: 700; }
  .msg { display: grid; gap: 4px; min-width: 0; justify-items: start; }
  .msg > div:first-child b { color: #f2f3f5; }
  .app { padding: 1px 4px; border-radius: 3px; background: #5865f2; color: #fff; font-size: 10px; font-weight: 600; vertical-align: 1px; }
  .mention { padding: 0 2px; border-radius: 3px; background: #3c4270; color: #c9cdfb; }
  .embed { display: grid; gap: 6px; padding: 10px 14px; border-left: 4px solid #d8b45a; border-radius: 4px; background: #2b2d31; min-width: 0; }
  .embed > b { color: #f2f3f5; }
  .embed .fname { margin-top: 4px; font-size: 13px; }
  .desc { white-space: pre-wrap; overflow-wrap: anywhere; }
  .desc :global(code), .callup p :global(code) { padding: 0 4px; border-radius: 3px; background: #1e1f22; font-size: 13px; }
  .blank { color: #80848e; font-style: italic; }
  .rel { padding: 0 2px; border-radius: 3px; background: #3f4248; }

  .schedule { list-style: none; margin: 0; padding: 0; font-size: 13px; }
  .schedule li { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-top: 1px solid var(--rule); font-variant-numeric: tabular-nums; }
  .schedule li:first-child { border-top: 0; }
  .gone span:first-child { text-decoration: line-through; color: var(--faint); }
  .gone .dim { color: var(--neg-ink); }
</style>
