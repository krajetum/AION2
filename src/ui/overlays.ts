// Overlays outside #app: the status line and the reaction meme on a tick.
import { channelVolume } from "../domain/alerts.ts";
import type { Settings } from "../domain/types.ts";
import { playSound } from "../infra/notifier.ts";
import { REACT } from "./memes.ts";

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

// Reaction on check: a fresh random pick every time.
const reactEl = document.body.appendChild(Object.assign(document.createElement("img"), { className: "react", alt: "" }));
let reactTimer = 0;
export function react(s: Settings) {
  const vol = channelVolume(s, "check");
  if (vol) playSound(["check"], vol);
  if (!REACT.length) return;
  reactEl.src = REACT[Math.floor(Math.random() * REACT.length)];
  reactEl.classList.remove("on");
  void reactEl.offsetWidth; // restart the animation on quick double checks
  reactEl.classList.add("on");
  clearTimeout(reactTimer);
  reactTimer = setTimeout(() => reactEl.classList.remove("on"), 1500);
}
