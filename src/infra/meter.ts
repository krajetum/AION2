// DPS meter bridge to the Rust engine (src-tauri/src/meter.rs): start, controls, "meter-update" and
// "meter-overlay" events. Outside Tauri (npm run dev in a browser) there is no capture, so a clearly
// labelled demo fight stands in, only to preview the UI.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { MeterUpdate, PlayerRow } from "../domain/meter.ts";

let started = false;
let last: MeterUpdate | undefined;
const subs = new Set<(u: MeterUpdate) => void>();
const emit = (u: MeterUpdate) => { last = u; subs.forEach((f) => f(u)); };

/**
 * Starts the engine once (capture begins here, not at app launch) and calls `fn` with every update.
 * Returns the unsubscribe function.
 */
export function onMeter(fn: (u: MeterUpdate) => void): () => void {
  subs.add(fn);
  if (last) fn(last);
  if (!started) {
    started = true;
    if (isTauri()) {
      listen<MeterUpdate>("meter-update", (e) => emit(e.payload))
        .then(() => invoke<MeterUpdate>("meter_start"))
        .then(emit)
        .catch((e) => console.error("DPS meter failed to start", e));
    } else startDemo();
  }
  return () => { subs.delete(fn); };
}

const call = (cmd: string, args?: Record<string, unknown>) => (isTauri() ? invoke<void>(cmd, args) : demoCall(cmd, args));
export const meterReset = () => call("meter_reset");
export const meterPause = (paused: boolean) => call("meter_pause", { paused });
export const meterTargetMode = (mode: string) => call("meter_target_mode", { mode });
export const meterReconnect = () => call("meter_reconnect");
/** Opens or closes the always-on-top overlay window (desktop only). */
export const meterOverlay = (show: boolean) => (isTauri() ? invoke<void>("meter_overlay", { show }) : Promise.resolve());
/** The overlay was opened or closed (also from the overlay itself). */
export const onOverlay = (fn: (open: boolean) => void) => (isTauri() ? listen<boolean>("meter-overlay", (e) => fn(e.payload)) : Promise.resolve(() => {}));

// ---------- demo (browser preview only) ----------
let demo = { start: Date.now(), paused: false, mode: "bossTargets", dmg: [0, 0, 0, 0] };
const DEMO_PARTY = [
  { name: "You", job: "Gladiator", rate: 21_000 },
  { name: "Partymate A", job: "Sorcerer", rate: 26_000 },
  { name: "Partymate B", job: "Ranger", rate: 17_000 },
  { name: "Partymate C", job: "Cleric", rate: 6_000 },
];
const DEMO_SPLIT = [0.42, 0.28, 0.2, 0.1];

function demoUpdate(): MeterUpdate {
  const t = Date.now() - demo.start;
  if (!demo.paused) demo.dmg = DEMO_PARTY.map((p, i) => Math.round(p.rate * t / 1000 * (0.9 + 0.2 * Math.abs(Math.sin(t / 3000 + i)))));
  const total = demo.dmg.reduce((a, b) => a + b, 0) || 1;
  const rows: PlayerRow[] = DEMO_PARTY.map((p, i) => ({
    id: i + 1, name: p.name, job: p.job, damage: demo.dmg[i], dps: demo.dmg[i] / Math.max(1, t / 1000),
    share: demo.dmg[i] / total * 100, hps: 0, heal: 0, combatPower: 0, gearScore: 0, isYou: i === 0, isOthers: false,
    skills: DEMO_SPLIT.map((share, k) => ({
      name: `Demo skill ${k + 1}`, damage: Math.round(demo.dmg[i] * share), hits: Math.round(t / 900 / (k + 1)),
      critRate: 0.3 - k * 0.05, share, dot: k === 3,
    })),
  })).sort((a, b) => b.damage - a.damage);
  return {
    status: "connected", message: "Demo fight (browser preview, not real data)", port: null, device: null, pingMs: 42,
    paused: demo.paused, demo: true,
    fight: { target: { name: "Demo Boss", isBoss: true, maxHp: 40_000_000, currentHp: -1, damageDealt: total }, targetMode: demo.mode, battleTimeMs: t, rows },
  };
}

function startDemo() {
  emit(demoUpdate());
  setInterval(() => emit(demoUpdate()), 500);
}

async function demoCall(cmd: string, args?: Record<string, unknown>) {
  if (cmd === "meter_reset") demo = { ...demo, start: Date.now(), dmg: [0, 0, 0, 0] };
  if (cmd === "meter_pause") demo.paused = !!args?.paused;
  if (cmd === "meter_target_mode") demo.mode = String(args?.mode);
  emit(demoUpdate());
}
