// Players: one opened character's official data, read once and shared by every tab (and each side of Compare):
// the profile (within 25 s), its Daevanion boards, the equipment and every piece's details, and the upgrade plans
// built from them (domain/upgrades.ts). `dispose()` drops answers that come after another character was opened.
import bisFile from "../../assets/bis.json";
import carryFile from "../../assets/carry.json";
import rankFile from "../../assets/ranks.json";
import type { Board, Equipment, Found, ItemDetail, Piece, Profile } from "../../domain/armory.ts";
import { bisLines, bisSlot, checkBis, type BisTable } from "../../domain/bis.ts";
import type { RankFile } from "../../domain/reroll.ts";
import { buildUpgrades, type Upgrades } from "../../domain/upgrades.ts";
import { boardOf, equipmentOf, itemOf, profileOf, within } from "../../infra/armory.ts";
import { ui } from "../state.svelte.ts";

export const BIS = bisFile as { classes: BisTable; source: string; sourceUrl: string; captured: string };
export const CARRY = carryFile as { classes: Record<string, Record<string, Record<string, number>>>; source: string; sourceUrl: string; captured: string; players: Record<string, number> };
export const RANKS = rankFile as unknown as RankFile & { source: string; captured: string };

const text = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class CharacterSheet {
  readonly found: Found;
  profile = $state<Profile | null>(null);
  eq = $state<Equipment | null>(null);
  /** By Piece.slot; absent = not read yet. */
  details = $state<Record<number, ItemDetail | null>>({});
  errors = $state<Record<number, string>>({});
  /** By board id; absent = not read yet. */
  boards = $state<Record<number, Board | null>>({});
  boardsError = $state("");
  /** The profile read: loading until it answers, error when it failed. */
  loading = $state(true);
  error = $state("");
  /** The equipment read failed (the profile may still be there). */
  eqError = $state("");
  #className: string;
  #live = true;
  #started = false;

  constructor(found: Found, className = "") { this.found = found; this.#className = className; }

  get className() { return this.profile?.className || this.#className; }
  readonly all: Piece[] = $derived(this.eq ? [...this.eq.gear, ...this.eq.accessories, ...this.eq.arcana] : []);
  /** Pieces read (or failed) of all; null once every piece is read or failed, and before the equipment is. */
  readonly reading: { read: number; total: number } | null = $derived.by(() => {
    const read = this.all.filter((p) => p.slot in this.details || p.slot in this.errors).length;
    return this.eq && read < this.all.length ? { read, total: this.all.length } : null;
  });
  readonly upgrades: Upgrades = $derived(buildUpgrades(this.eq, this.details, this.className,
    { bis: BIS.classes, mine: ui.data.bis, carry: CARRY.classes, ranks: RANKS }));
  /** Best-in-slot lines the pieces have, of every piece's ideal lines. */
  readonly bisCount: { has: number; total: number } = $derived.by(() => {
    let has = 0, total = 0;
    for (const p of this.all) {
      const slot = bisSlot(p.slotName), lines = slot ? bisLines(BIS.classes, ui.data.bis, this.className, slot) : null;
      if (!lines) continue;
      const c = checkBis(lines, this.details[p.slot] ?? null);
      has += c.has; total += c.lines.length;
    }
    return { has, total };
  });
  /** Pieces to reroll and arcana with skills missing or levels wasted: the Upgrades tab's badge. */
  readonly toImprove: number = $derived(this.upgrades.todo.length + this.upgrades.arcana.filter((x) => x.plan.missing.length || x.plan.wasted.length).length);

  /** Starts every request, once. */
  load() {
    if (this.#started) return;
    this.#started = true;
    const { characterId: id, serverId: server } = this.found;
    within(profileOf(id, server)).then((p) => {
      if (!this.#live) return;
      this.profile = p;
      if (!p) { this.error = "the site sent no profile"; return; }
      for (const b of p.boards ?? []) if (b.id) boardOf(id, server, b.id).then(
        (v) => { if (this.#live) this.boards[b.id] = v; }, (e) => { if (this.#live) this.boardsError = text(e); });
    }, (e) => { if (this.#live) this.error = text(e); }).finally(() => { if (this.#live) this.loading = false; });
    equipmentOf(id, server).then((v) => {
      if (!this.#live) return;
      this.eq = v;
      if (!v) { this.eqError = "the site sent no equipment"; return; }
      for (const p of [...v.gear, ...v.accessories, ...v.arcana]) itemOf(p, id, server).then(
        (d) => { if (this.#live) this.details[p.slot] = d; }, (e) => { if (this.#live) this.errors[p.slot] = text(e); });
    }, (e) => { if (this.#live) this.eqError = text(e); });
  }

  dispose() { this.#live = false; }
}
