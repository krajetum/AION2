// Guilds (the crowd Worker's /v1/guilds): which guild this install is in, the members' cards, shared boss fights.
// Pure. The member code and officer key stay in the save file only; the Worker keeps their hashes.
import { dueLeads } from "./alerts.ts";
import { personalBests, yourDps, type Best, type FightRecord } from "./fights.ts";
import type { PlayerRow, Profile, SkillRow } from "./meter.ts";

export interface GuildShare { gear: boolean; fights: boolean }
/** This install's guild (AppData.guild). memberCode = the code it joined with (to invite others), officerKey = officers only. */
export interface GuildLink { id: string; name: string; serverId: number; memberCode?: string; officerKey?: string; share: GuildShare }
export interface GuildMember {
  name: string; className: string; itemLevel: number | null; combatPower: number | null;
  shareGear: boolean; shareFights: boolean; seenMs: number;
}
export type Ping = "none" | "here" | "everyone";
/** An officer's planned raid: reminded `leads` minutes before `atMs` (Discord + members' apps), title "Guild reminder". */
export interface Callup { id: string; atMs: number; message: string; ping: Ping; leads: number[] }
export interface GuildView { id: string; name: string; serverId: number; leadMin: number; hasWebhook: boolean; members: GuildMember[]; callups: Callup[] }
/** A member's card as the Worker takes it. */
export interface GuildMe { name: string; className: string; itemLevel: number | null; combatPower: number | null }

/** Upload limits (server/src/validate.ts MAX_FIGHT, MAX_ROWS). */
export const MAX_FIGHT = 8 * 1024;
export const MAX_ROWS = 24;
export const DEFAULT_SHARE: GuildShare = { gear: true, fights: false };
/** A member seen by the Worker within this is "online" (the apps sync every 2 min while playing). */
export const ONLINE_MS = 5 * 60_000;

const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** AppData.guild from a save or an import, or null. */
export function cleanGuild(raw: unknown): GuildLink | null {
  if (!isObj(raw) || typeof raw.id !== "string" || !raw.id || !Number.isInteger(raw.serverId)) return null;
  const g: GuildLink = {
    id: raw.id, name: str(raw.name), serverId: raw.serverId,
    share: { gear: raw.share?.gear !== false, fights: raw.share?.fights === true },
  };
  if (typeof raw.memberCode === "string" && raw.memberCode) g.memberCode = raw.memberCode;
  if (typeof raw.officerKey === "string" && raw.officerKey) g.officerKey = raw.officerKey;
  return g;
}

/** Your card from what the meter saw (gear score = item level). */
export const meCard = (p: Profile): GuildMe => ({ name: p.name, className: p.job, itemLevel: p.gearScore, combatPower: p.combatPower });

/** GET /v1/guilds/:id, last-seen times put on the local clock. */
export function parseGuild(j: any, localNow: number): GuildView {
  const shift = num(j?.serverNow) ? localNow - j.serverNow : 0;
  const members = (Array.isArray(j?.members) ? j.members : []).filter(isObj).map((m: any): GuildMember => ({
    name: str(m.name), className: str(m.className), itemLevel: num(m.itemLevel), combatPower: num(m.combatPower),
    shareGear: m.shareGear === true, shareFights: m.shareFights === true, seenMs: (num(m.seenMs) ?? 0) + shift,
  })).filter((m: GuildMember) => m.name);
  const callups = (Array.isArray(j?.callups) ? j.callups : []).filter((c: any) => isObj(c) && typeof c.id === "string" && num(c.atMs)
    && typeof c.message === "string" && Array.isArray(c.leads)).map((c: any): Callup => ({
    id: c.id, atMs: c.atMs + shift, message: c.message, ping: c.ping === "here" || c.ping === "everyone" ? c.ping : "none",
    leads: c.leads.filter((l: unknown) => Number.isInteger(l) && (l as number) >= 0),
  }));
  return {
    id: str(j?.id), name: str(j?.name), serverId: num(j?.serverId) ?? 0, leadMin: num(j?.leadMin) ?? 5,
    hasWebhook: j?.hasWebhook === true, members, callups,
  };
}

/** Call-up keys in AppData.warnedEvent: `callup:<id>@<lead>` → the call-up's time. */
export const callupKey = (c: Callup, lead: number) => `callup:${c.id}@${lead}`;

/** Call-ups with reminders due now and not yet shown here; several due at once (app closed) give one reminder. */
export function dueCallups(callups: Callup[], warned: Record<string, number>, now: number): { callup: Callup; leads: number[] }[] {
  return callups.filter((c) => c.atMs > now - 60_000)
    .map((c) => ({ callup: c, leads: dueLeads(c.leads, c.atMs - now, (l) => warned[callupKey(c, l)] === c.atMs) }))
    .filter((d) => d.leads.length > 0);
}

/** "2 days", "1 day 6 h", "3 h", "45 min", "at the time". */
export function leadText(min: number): string {
  if (min <= 0) return "at the time";
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return [d && `${d} day${d > 1 ? "s" : ""}`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}

/** Members by item level (highest first), the official profile's numbers where the member shared none. */
export function rosterRows(members: GuildMember[], official: Record<string, { itemLevel: number | null; combatPower: number | null } | null>): (GuildMember & { official: boolean })[] {
  return members.map((m) => {
    const o = official[m.name];
    const fill = m.itemLevel === null && !!o;
    return { ...m, itemLevel: m.itemLevel ?? o?.itemLevel ?? null, combatPower: m.combatPower ?? o?.combatPower ?? null, official: fill };
  }).sort((a, b) => (b.itemLevel ?? -1) - (a.itemLevel ?? -1) || a.name.localeCompare(b.name));
}

const bareSkill = (s: SkillRow): SkillRow => ({ ...s, icon: null });

/**
 * A fight trimmed for the guild: your row with its skills, the others by damage without skills, at most MAX_ROWS rows.
 * Under MAX_FIGHT: icons dropped first, then your smallest skills.
 */
export function guildFight(r: FightRecord): FightRecord {
  const mine = r.rows.find((x) => x.isYou);
  const others = r.rows.filter((x) => !x.isYou).sort((a, b) => b.damage - a.damage)
    .slice(0, MAX_ROWS - (mine ? 1 : 0)).map((x) => ({ ...x, skills: [], healSkills: [] }));
  let skills = [...(mine?.skills ?? [])].sort((a, b) => b.damage - a.damage);
  const build = (s: SkillRow[]): FightRecord => ({ ...r, rows: mine ? [{ ...mine, skills: s, healSkills: [] }, ...others] : others });
  let out = build(skills);
  if (JSON.stringify(out).length <= MAX_FIGHT) return out;
  skills = skills.map(bareSkill);
  while ((out = build(skills)), JSON.stringify(out).length > MAX_FIGHT && skills.length) skills = skills.slice(0, -1);
  return out;
}

const cleanSkill = (s: any): SkillRow => ({
  name: str(s?.name), damage: num(s?.damage) ?? 0, hits: num(s?.hits) ?? 0, critRate: num(s?.critRate) ?? 0,
  share: num(s?.share) ?? 0, dot: s?.dot === true, icon: typeof s?.icon === "string" ? s.icon : null,
});
const cleanRow = (x: any): PlayerRow => ({
  id: num(x?.id) ?? 0, name: str(x?.name), job: str(x?.job), dps: num(x?.dps) ?? 0, damage: num(x?.damage) ?? 0,
  share: num(x?.share) ?? 0, hps: num(x?.hps) ?? 0, heal: num(x?.heal) ?? 0, combatPower: num(x?.combatPower) ?? 0,
  gearScore: num(x?.gearScore) ?? 0, isYou: x?.isYou === true, inParty: x?.inParty === true, isOthers: x?.isOthers === true,
  damageTaken: num(x?.damageTaken) ?? 0, hitsTaken: num(x?.hitsTaken) ?? 0,
  skills: Array.isArray(x?.skills) ? x.skills.map(cleanSkill) : [], healSkills: [],
});

/** GET /v1/guilds/:id/fights?boss=: other members' records, checked field by field (they come from other installs). */
export function parseGuildFights(j: any): FightRecord[] {
  const list = Array.isArray(j?.fights) ? j.fights : [];
  return list.filter((f: any) => isObj(f) && typeof f.id === "string" && typeof f.boss === "string" && Array.isArray(f.rows)
    && num(f.battleTimeMs) && num(f.endMs)).map((f: any): FightRecord => ({
    id: f.id, endMs: f.endMs, battleTimeMs: f.battleTimeMs, boss: f.boss, maxHp: num(f.maxHp) ?? 0, killed: f.killed === true,
    mapId: num(f.mapId), char: str(f.char), gearScore: num(f.gearScore), combatPower: num(f.combatPower), rows: f.rows.map(cleanRow),
  }));
}

/** GET /v1/guilds/:id/fights: bosses with shared fights. */
export function parseFightBosses(j: any): { boss: string; n: number }[] {
  return (Array.isArray(j?.bosses) ? j.bosses : []).filter((b: any) => typeof b?.boss === "string" && num(b?.n)).map((b: any) => ({ boss: b.boss, n: b.n }));
}

export interface MemberBest extends Best { char: string }

/** One boss's fights: each member's best DPS and fastest kill, best DPS first. */
export function memberBests(fights: FightRecord[]): MemberBest[] {
  const by = new Map<string, FightRecord[]>();
  for (const f of fights) by.set(f.char, [...(by.get(f.char) ?? []), f]);
  return [...by].map(([char, list]) => ({ char, ...Object.values(personalBests(list))[0] }))
    .sort((a, b) => (b.dps ? yourDps(b.dps) : 0) - (a.dps ? yourDps(a.dps) : 0));
}
