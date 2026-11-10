// Guild page sections share one busy flag and one error line: a change runs, saves, then says what happened.
import { CrowdError } from "../../../infra/crowd.ts";
import { save } from "../../actions.ts";
import { showStatus } from "../../overlays.ts";

export const gs = $state({ busy: false, error: "" });

export const say = (e: unknown) => e instanceof CrowdError
  ? e.status === 404 ? "No guild has that code." : e.status === 429 ? "Too many changes this hour: try again later."
    : e.status === 403 ? `Refused: ${e.reason || "not allowed"}.` : e.status === 400 ? "The server refused that (check what you typed)." : e.message
  : e instanceof Error ? e.message : String(e);

export async function run(work: () => Promise<unknown>, done?: string) {
  gs.busy = true; gs.error = "";
  try { await work(); await save(); if (done) showStatus(done); }
  catch (e) { gs.error = say(e); }
  gs.busy = false;
}

export const copy = (text: string) => navigator.clipboard.writeText(text).then(() => showStatus("Copied"), () => showStatus("Copy failed"));
/** A call-up's time: "Sat 15 Nov, 21:00". */
export const when = (t: number) => new Date(t).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** A code in groups of four, as it is shown and typed. */
export const pretty = (c: string) => c.replace(/(.{4})(?=.)/g, "$1-");
