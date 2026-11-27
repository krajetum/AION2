// Players › Upgrades: every read piece's reroll plan (reroll.ts), ranked, and each Unique arcana's Transmute plan
// (arcana.ts), from a character's equipment and piece details. The UI passes the bundled tables in. Pure.
import type { Equipment, ItemDetail, Piece } from "./armory.ts";
import { bisLines, bisSlot, type BisLine, type BisTable } from "./bis.ts";
import { ARMOUR_SLOTS, armourPassives, planPiece, rankPlans, rankSkills, rankTable, statNamesOf, worthLines, type PiecePlan, type RankFile, type RankedLine, type Worth } from "./reroll.ts";
import { arcanaPlan, type ArcanaPlan, type SkillTotals } from "./arcana.ts";

/** bis = the bundled best-in-slot lists, mine = the player's (AppData.bis), carry = kisk's carry shares, ranks = the static's tables. */
export interface Tables { bis: BisTable; mine: BisTable; carry: Record<string, Record<string, Record<string, number>>>; ranks: RankFile }
export interface GearPlan { p: Piece; plan: PiecePlan; ideal: Worth[]; lines: string[]; ranked: Record<string, RankedLine> | null }
export interface ArcanaItem { p: Piece; slot: string; held: { name: string; level: number | null }[]; plan: ArcanaPlan; ideal: BisLine[] }
/** plans = every piece with a plan, the most worth per next try first; todo = something to reroll or add; done = the rest. */
export interface Upgrades { plans: GearPlan[]; todo: GearPlan[]; done: GearPlan[]; arcana: ArcanaItem[]; notUnique: string[]; totals: SkillTotals }

export function buildUpgrades(eq: Equipment | null, details: Record<number, ItemDetail | null>, className: string, t: Tables): Upgrades {
  if (!eq) return { plans: [], todo: [], done: [], arcana: [], notUnique: [], totals: {} };
  const all = [...eq.gear, ...eq.accessories, ...eq.arcana];
  const linesOf = (slot: string | null) => (slot ? bisLines(t.bis, t.mine, className, slot) : null);
  const statNames = statNamesOf(t.carry);
  const plans = rankPlans(all.flatMap((p): GearPlan[] => {
    const slot = bisSlot(p.slotName), d = details[p.slot];
    if (!slot || !d || !d.random) return [];
    const jewel = slot === "Necklace" || slot === "Earring" || ARMOUR_SLOTS.includes(slot);
    // The static's ranks where they have the slot (skill lines: the best-in-slot's, worth B), else kisk's carry shares.
    const ranks = rankTable(t.ranks, slot), passives = jewel ? armourPassives(ARMOUR_SLOTS.map((s) => linesOf(s)), statNames) : [];
    const ideal = ranks
      ? worthLines(ranks.worth, rankSkills(t.ranks, linesOf(slot) ?? []), statNames, rankSkills(t.ranks, passives))
      : worthLines(t.carry[className]?.[slot], linesOf(slot), statNames, passives);
    const canAdd = ![...d.sub, ...d.skills].some((x) => x.added);
    const lines = [...d.sub.map((x) => x.name), ...d.skills.map((x) => x.name)];
    const plan = planPiece(slot, lines, ideal, 4000, canAdd);
    return plan ? [{ p, plan, ideal, lines, ranked: ranks?.ranked ?? null }] : [];
  }));
  // Every skill's level with its bonuses (the profile's), for what the arcana still need.
  const totals: SkillTotals = Object.fromEntries([...eq.active.map((s) => [s.name, { level: s.level ?? 0, passive: false }]),
    ...eq.passive.map((s) => [s.name, { level: s.level ?? 0, passive: true }])]);
  // Arcana: a Transmute plan for each Unique one read, the crafted one first, then the most skills missing.
  const arcana = eq.arcana.flatMap((p): ArcanaItem[] => {
    const slot = bisSlot(p.slotName), d = details[p.slot], ideal = linesOf(slot);
    if (!slot || !d || !ideal || p.grade !== "Unique") return [];
    const plan = arcanaPlan(slot, d.skills, ideal, totals);
    return plan ? [{ p, slot, held: d.skills, plan, ideal }] : [];
  }).sort((a, b) => Number(b.plan.craft) - Number(a.plan.craft) || b.plan.missing.length - a.plan.missing.length);
  const todo = plans.filter((x) => x.plan.steps.length || x.plan.add);
  return { plans, todo, done: plans.filter((x) => !todo.includes(x)), arcana, notUnique: eq.arcana.filter((p) => p.grade !== "Unique").map((p) => p.name), totals };
}
