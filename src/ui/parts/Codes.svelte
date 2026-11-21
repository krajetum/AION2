<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // Home > Codes: the game's redeem codes players share (crowd Worker, a week each for everyone).
  // Redeemed: your own tick (kept in the save file). Expired: your vote; 5 votes remove the code for everyone.
  import { shareCode, toggleRedeemed, voteExpired } from "../../app/codes.ts";
  import { cleanCode, EXPIRED_VOTES, leftText, toRedeem } from "../../domain/codes.ts";
  import { CrowdError } from "../../infra/crowd.ts";
  import { act, refreshCodes, save } from "../actions.ts";
  import { showStatus } from "../overlays.ts";
  import { ui } from "../state.svelte.ts";

  let draft = $state(""), busy = $state(false), error = $state("");
  const marks = $derived(ui.data.codes);
  const left = $derived(toRedeem(ui.codes, marks, ui.now));
  // Still to redeem first (soonest end first), then the ones you redeemed or marked expired.
  const live = $derived([...left, ...ui.codes.filter((c) => c.expiresMs > ui.now && !left.includes(c))]);

  $effect(() => { refreshCodes(); });

  const why = (e: unknown) => e instanceof CrowdError
    ? e.status === 409 ? (e.reason === "already listed" ? "That code is already in the list." : "That code ended or was marked expired lately.")
      : e.status === 429 ? "Too many changes this hour: try again later." : e.status === 400 ? "That doesn't look like a code." : `The server said: ${e.reason || e.status}`
    : "Offline: the code wasn't sent.";

  async function send(ev: SubmitEvent) {
    ev.preventDefault();
    const code = cleanCode(draft);
    if (!code) { error = "A code is 4-40 letters, digits, dashes or underscores."; return; }
    if (ui.codes.some((c) => c.key === code.toUpperCase())) { error = "That code is already in the list."; return; }
    busy = true; error = "";
    try {
      await shareCode(ui.data, code);
      draft = "";
      showStatus(`Shared ${code} with everyone for a week`);
      await refreshCodes();
    } catch (e) { error = why(e); } finally { busy = false; }
  }

  async function expired(c: (typeof live)[number]) {
    busy = true; error = "";
    try {
      const removed = await voteExpired(ui.data, c);
      await save();
      showStatus(removed ? `${c.code} removed: ${EXPIRED_VOTES} players marked it expired` : `Marked ${c.code} expired`);
      await refreshCodes();
    } catch (e) { error = why(e); } finally { busy = false; }
  }

  const copy = (code: string) => navigator.clipboard?.writeText(code).then(() => showStatus(`${code} copied`), () => {});
</script>

<Panel title="Codes" count={left.length ? `${left.length} to redeem` : "all redeemed"}>
  {#if live.length}<ul class="m-0 list-none p-0">
    {#each live as c (c.key)}{@const done = marks.redeemed.includes(c.key)}{@const dead = marks.expired.includes(c.key)}
      <li class="flex flex-wrap items-center gap-2 border-b py-1.5 {done || dead ? 'opacity-55' : ''}">
        <Button variant="ghost" size="sm" class="font-mono font-semibold tracking-wide" title="Copy the code" onclick={() => copy(c.code)}>{c.code}</Button>
        <small class="text-xs text-muted-foreground">{leftText(c.expiresMs - ui.now)}{c.votes ? ` · ${c.votes}/${EXPIRED_VOTES} marked expired` : ""}</small>
        <span class="ml-auto flex gap-1.5">
          <Button variant={done ? "secondary" : "outline"} size="sm" aria-pressed={done} onclick={() => act(() => toggleRedeemed(ui.data, c.code))}>{done ? "Redeemed" : "Redeem"}</Button>
          <Button variant="ghost" size="sm" disabled={busy || dead} title={dead ? "You marked it expired" : `It no longer works: ${EXPIRED_VOTES} players saying so remove it for everyone`}
            onclick={() => expired(c)}>{dead ? "Marked expired" : "Expired"}</Button>
        </span>
      </li>{/each}
  </ul>{:else}<p class="hint">{ui.codesError || "No code shared right now."}</p>{/if}

  <form class="mt-2.5 flex gap-2" onsubmit={send}>
    <Input class="min-w-0 flex-1" bind:value={draft} placeholder="Share a new code with the others" aria-label="New code" maxlength={40} autocomplete="off" spellcheck="false" />
    <Button type="submit" disabled={busy || !draft.trim()}>Send to others</Button>
  </form>
  {#if error}<p class="hint error">{error}</p>{/if}
  <p class="hint">A shared code stays a week for everyone; a code already listed isn't added again. Redeemed is only yours.
    Entering the game or another character reminds you of the codes left (Settings › Notifications).</p>
</Panel>
