// Overlay outside #app: the status line. Plus the sound on a tick.
import { channelVolume } from "../domain/alerts.ts";
import type { Settings } from "../domain/types.ts";
import { playSound } from "../infra/notifier.ts";

// Live region: announces politely and fades after 5 s.
const statusEl = document.body.appendChild(Object.assign(document.createElement("p"), { className: "status", role: "status" }));
let statusTimer = 0;
export function showStatus(msg: string, err = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("err", err);
  statusEl.classList.add("on");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove("on"), 5000);
}

/** Sound on check. */
export function react(s: Settings) {
  const vol = channelVolume(s, "check");
  if (vol) playSound(["check"], vol);
}
