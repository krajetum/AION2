<script lang="ts">
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

<section class="codes"><h2>Codes <span class="count">{left.length ? `${left.length} to redeem` : "all redeemed"}</span></h2>
  {#if live.length}<ul>
    {#each live as c (c.key)}{@const done = marks.redeemed.includes(c.key)}{@const dead = marks.expired.includes(c.key)}
      <li class:done={done || dead}>
        <button class="ghost code" title="Copy the code" onclick={() => copy(c.code)}>{c.code}</button>
        <small>{leftText(c.expiresMs - ui.now)}{c.votes ? ` · ${c.votes}/${EXPIRED_VOTES} marked expired` : ""}</small>
        <span class="acts">
          <button class:on={done} aria-pressed={done} onclick={() => act(() => toggleRedeemed(ui.data, c.code))}>{done ? "Redeemed" : "Redeem"}</button>
          <button class="ghost" disabled={busy || dead} title={dead ? "You marked it expired" : `It no longer works: ${EXPIRED_VOTES} players saying so remove it for everyone`}
            onclick={() => expired(c)}>{dead ? "Marked expired" : "Expired"}</button>
        </span>
      </li>{/each}
  </ul>{:else}<p class="hint">{ui.codesError || "No code shared right now."}</p>{/if}

  <form onsubmit={send}>
    <input bind:value={draft} placeholder="Share a new code with the others" aria-label="New code" maxlength="40" autocomplete="off" spellcheck="false" />
    <button class="primary" disabled={busy || !draft.trim()}>Send to others</button>
  </form>
  {#if error}<p class="error">{error}</p>{/if}
  <p class="hint">A shared code stays a week for everyone; a code already listed isn't added again. Redeemed is only yours.
    Entering the game or another character reminds you of the codes left (Settings › Notifications).</p>
</section>

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 0; border-bottom: 1px solid var(--rule); }
  li.done { opacity: 0.55; }
  .acts button.on { background: var(--active); color: var(--text); }
  .code { font-family: ui-monospace, monospace; font-weight: 600; letter-spacing: 0.03em; padding: 2px 4px; }
  li small { color: var(--muted); }
  .acts { margin-left: auto; display: flex; gap: 6px; }
  form { display: flex; gap: 8px; margin-top: 10px; }
  form input { flex: 1; min-width: 0; }
</style>
