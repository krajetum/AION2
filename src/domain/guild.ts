// Guilds (the crowd Worker's /v1/guilds): which guild this install is in, the members' cards, shared boss fights.
// Pure. The member code and officer key stay in the save file only; the Worker keeps their hashes.
import { dueLeads } from "./alerts.ts";
import { personalBests, yourDps, type Best, type FightRecord } from "./fights.ts";
import { BUFF_KINDS, type BuffUp, type PlayerRow, type Profile, type SkillRow } from "./meter.ts";

export interface GuildShare { gear: boolean; fights: boolean }
/** This install's guild (AppData.guild). memberCode = the code it joined with (to invite others), officerKey = officers only. */
export interface GuildLink { id: string; name: string; serverId: number; memberCode?: string; officerKey?: string; share: GuildShare }
export interface GuildMember {
  /** serverId: the member's game server, null when their card predates it (the guild's then, a guess). */
  name: string; className: string; serverId: number | null; itemLevel: number | null; combatPower: number | null;
  shareGear: boolean; shareFights: boolean; seenMs: number; role: Role; me: boolean;
}
export type Ping = "none" | "here" | "everyone";
/** An officer's planned raid: reminded `leads` minutes before `atMs` (Discord + members' apps), title "Static reminder". */
export interface Callup { id: string; atMs: number; message: string; ping: Ping; leads: number[] }
/** `members` / `callups`: only what your role may see (you are always in `members`); `memberCount` = everyone. */
export interface GuildView {
  id: string; name: string; serverId: number; leadMin: number; bossAlerts: boolean; hasWebhook: boolean; members: GuildMember[]; callups: Callup[];
  role: Role; perms: Record<Perm, Role>; memberCount: number;
}

// ---- Roles (mirror of server/src/validate.ts): Leader > Officer > Member; per guild, the lowest role with each permission ----
export const ROLES = ["member", "officer", "leader"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { member: "Member", officer: "Officer", leader: "Leader" };
export const PERMS = ["view.callups", "view.members", "view.fights", "view.raidplan", "view.raidsummary", "manage.callups", "manage.discord", "manage.members", "manage.invite"] as const;
export type Perm = (typeof PERMS)[number];
export const DEFAULT_PERMS: Record<Perm, Role> = {
  "view.callups": "member", "view.members": "member", "view.fights": "member", "view.raidplan": "member", "view.raidsummary": "officer",
  "manage.callups": "officer", "manage.discord": "officer", "manage.members": "officer", "manage.invite": "officer",
};
export const PERM_LABEL: Record<Perm, string> = {
  "view.callups": "See call-ups", "view.members": "See the members", "view.fights": "See shared fights",
  "view.raidplan": "Raid plan: mark free hours", "view.raidsummary": "Raid plan: see everyone's hours",
  "manage.callups": "Plan and cancel call-ups", "manage.discord": "Discord alerts", "manage.members": "Remove members", "manage.invite": "Invite code",
};
const isRole = (v: unknown): v is Role => ROLES.includes(v as Role);
export const rank = (r: Role) => ROLES.indexOf(r);
/** Your role: Leader while this install keeps the leader key (as the Worker counts it), else the Worker's. */
export const myRole = (view: GuildView, link: GuildLink | null | undefined): Role => (link?.officerKey ? "leader" : view.role);
export const can = (view: GuildView, link: GuildLink | null | undefined, perm: Perm) => rank(myRole(view, link)) >= rank(view.perms[perm]);
/** A member's card as the Worker takes it. */
export interface GuildMe { name: string; className: string; itemLevel: number | null; combatPower: number | null; serverId: number | null }

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
export const meCard = (p: Profile): GuildMe => ({ name: p.name, className: p.job, itemLevel: p.gearScore, combatPower: p.combatPower, serverId: p.serverId || null });

/** GET /v1/guilds/:id, last-seen times put on the local clock. */
export function parseGuild(j: any, localNow: number): GuildView {
  const shift = num(j?.serverNow) ? localNow - j.serverNow : 0;
  const all = (Array.isArray(j?.members) ? j.members : []).filter(isObj).map((m: any): GuildMember => ({
    name: str(m.name), className: str(m.className), serverId: num(m.serverId) && m.serverId > 0 ? m.serverId : null, itemLevel: num(m.itemLevel), combatPower: num(m.combatPower),
    shareGear: m.shareGear === true, shareFights: m.shareFights === true, seenMs: (num(m.seenMs) ?? 0) + shift,
    role: isRole(m.role) ? m.role : "member", me: m.me === true,
  })).filter((m: GuildMember) => m.name);
  // One row per name: the Worker keeps one per install, so a character played from two installs (or after a reinstall)
  // comes twice; it already acts by name (roles, remove). Yours, else the most recently seen.
  const pick = new Map<string, GuildMember>();
  for (const m of all as GuildMember[]) {
    const cur = pick.get(m.name);
    if (!cur || (m.me !== cur.me ? m.me : m.seenMs > cur.seenMs)) pick.set(m.name, m);
  }
  const members = (all as GuildMember[]).filter((m) => pick.get(m.name) === m);
  const perms = { ...DEFAULT_PERMS };
  if (isObj(j?.perms)) for (const p of PERMS) if (isRole(j.perms[p])) perms[p] = j.perms[p];
  const callups = (Array.isArray(j?.callups) ? j.callups : []).filter((c: any) => isObj(c) && typeof c.id === "string" && num(c.atMs)
    && typeof c.message === "string" && Array.isArray(c.leads)).map((c: any): Callup => ({
    id: c.id, atMs: c.atMs + shift, message: c.message, ping: c.ping === "here" || c.ping === "everyone" ? c.ping : "none",
    leads: c.leads.filter((l: unknown) => Number.isInteger(l) && (l as number) >= 0),
  }));
  return {
    id: str(j?.id), name: str(j?.name), serverId: num(j?.serverId) ?? 0, leadMin: num(j?.leadMin) ?? 5,
    bossAlerts: j?.bossAlerts === true, hasWebhook: j?.hasWebhook === true, members, callups,
    role: isRole(j?.role) ? j.role : "member", perms, memberCount: num(j?.memberCount) ?? members.length,
  };
}

/** Call-up keys in AppData.warnedEvent: `callup:<id>@<lead>` → the call-up's time. */
export const callupKey = (c: Callup, lead: number) => `callup:${c.id}@${lead}`;

/** Call-ups with reminders due now and not yet shown here; several due at once (app closed) give one reminder. */
export function dueCallups(callups: Callup[], warned: Record<string, number>, now: number): { callup: Callup; leads: number[] }[] {
  return callups.filter((c) => c.atMs > now - 60_000)
    // atMs is shifted onto the local clock by each sync's latency, so a mark matches within a minute (as boss alerts do).
    .map((c) => ({ callup: c, leads: dueLeads(c.leads, c.atMs - now, (l) => Math.abs((warned[callupKey(c, l)] ?? -Infinity) - c.atMs) < 60_000) }))
    .filter((d) => d.leads.length > 0);
}

/** "2 days", "1 day 6 h", "3 h", "45 min", "at the time". */
export function leadText(min: number): string {
  if (min <= 0) return "at the time";
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return [d && `${d} day${d > 1 ? "s" : ""}`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}

/** A call-up message as Discord shows it, as safe HTML: escaped first, then Discord's bold / italic / underline /
 *  strikethrough / code / "- " bullets. Typed @everyone / @here lose their @, as the Worker strips them. */
export function discordHtml(s: string): string {
  return s.replace(/@(everyone|here)/gi, "$1")
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\*([^*\n]+)\*/g, "<i>$1</i>")
    .replace(/^- /gm, "• ");
}

/** Members by item level (highest first), the official profile's numbers where the member shared none. */
export function rosterRows(members: GuildMember[], official: Record<string, { itemLevel: number | null; combatPower: number | null; className?: string } | null>): (GuildMember & { official: boolean })[] {
  return members.map((m) => {
    const o = official[m.name];
    const fill = m.itemLevel === null && !!o;
    return { ...m, className: m.className || o?.className || "", itemLevel: m.itemLevel ?? o?.itemLevel ?? null, combatPower: m.combatPower ?? o?.combatPower ?? null, official: fill };
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
    .slice(0, MAX_ROWS - (mine ? 1 : 0)).map((x) => ({ ...x, skills: [], healSkills: [], buffs: undefined }));
  let skills = [...(mine?.skills ?? [])].sort((a, b) => b.damage - a.damage);
  // The timeline stays on this PC: the Worker keeps 8 KB a fight.
  // Your buffs go too; dropped first when the fight is too big.
  let buffs = mine?.buffs;
  const build = (s: SkillRow[]): FightRecord => ({ ...r, timeline: undefined, rows: mine ? [{ ...mine, skills: s, healSkills: [], buffs }, ...others] : others });
  let out = build(skills);
  if (JSON.stringify(out).length <= MAX_FIGHT) return out;
  buffs = undefined;
  if (JSON.stringify((out = build(skills))).length <= MAX_FIGHT) return out;
  skills = skills.map(bareSkill);
  while ((out = build(skills)), JSON.stringify(out).length > MAX_FIGHT && skills.length) skills = skills.slice(0, -1);
  return out;
}

const cleanSkill = (s: any): SkillRow => ({
  name: str(s?.name), damage: num(s?.damage) ?? 0, hits: num(s?.hits) ?? 0, casts: num(s?.casts) ?? undefined, critRate: num(s?.critRate) ?? 0,
  share: num(s?.share) ?? 0, dot: s?.dot === true, icon: typeof s?.icon === "string" ? s.icon : null,
});
const cleanRow = (x: any): PlayerRow => ({
  id: num(x?.id) ?? 0, name: str(x?.name), job: str(x?.job), dps: num(x?.dps) ?? 0, damage: num(x?.damage) ?? 0,
  share: num(x?.share) ?? 0, hps: num(x?.hps) ?? 0, heal: num(x?.heal) ?? 0, combatPower: num(x?.combatPower) ?? 0,
  gearScore: num(x?.gearScore) ?? 0, isYou: x?.isYou === true, inParty: x?.inParty === true, isOthers: x?.isOthers === true,
  damageTaken: num(x?.damageTaken) ?? 0, hitsTaken: num(x?.hitsTaken) ?? 0,
  deaths: num(x?.deaths) ?? undefined, activeMs: num(x?.activeMs) ?? undefined,
  deathTimes: Array.isArray(x?.deathTimes) ? x.deathTimes.map(num).filter((t: number | null): t is number => t !== null && t >= 0).slice(0, 50) : undefined,
  reviveTimes: Array.isArray(x?.reviveTimes) && Array.isArray(x?.deathTimes) && x.reviveTimes.length === x.deathTimes.length
    ? x.reviveTimes.map((t: unknown) => num(t)).slice(0, 50) : undefined, hits: num(x?.hits) ?? undefined, critRate: num(x?.critRate) ?? undefined,
  skills: Array.isArray(x?.skills) ? x.skills.map(cleanSkill) : [], healSkills: [],
  buffs: Array.isArray(x?.buffs) ? x.buffs.slice(0, 40).filter(isObj).map((b: any): BuffUp => ({
    id: num(b.id) ?? 0, name: str(b.name), upMs: num(b.upMs) ?? 0, own: b.own === true,
    kind: (BUFF_KINDS as readonly string[]).includes(b.kind) ? b.kind : "buff",
    icon: typeof b.icon === "string" && /^[A-Za-z0-9_]{1,80}$/.test(b.icon) ? b.icon : null,
  })) : undefined,
});

/** GET /v1/guilds/:id/fights?boss=: other members' records, checked field by field (they come from other installs). */
export function parseGuildFights(j: any): FightRecord[] {
  const list = Array.isArray(j?.fights) ? j.fights : [];
  return list.filter((f: any) => isObj(f) && typeof f.id === "string" && typeof f.boss === "string" && Array.isArray(f.rows)
    && num(f.battleTimeMs) && num(f.endMs)).map((f: any): FightRecord => ({
    id: f.id, endMs: f.endMs, battleTimeMs: f.battleTimeMs, boss: f.boss, maxHp: num(f.maxHp) ?? 0, killed: f.killed === true,
    hpLeft: typeof f.hpLeft === "number" && f.hpLeft >= 0 && f.hpLeft <= 1 ? f.hpLeft : undefined,
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

/** Two members' records of one pull may start and end a little apart (each PC's clock, the meter's idle reset). */
export const PULL_SLACK_MS = 30_000;

export interface PullRow { key: string; row: PlayerRow; own: boolean } // own: from that player's own upload (with their skills and totals)
/** One boss pull as several members recorded it. */
export interface Pull { id: string; boss: string; startMs: number; endMs: number; battleTimeMs: number; killed: boolean; hpLeft?: number; chars: string[]; rows: PullRow[] }

const startOf = (f: FightRecord) => f.endMs - f.battleTimeMs;
/** The lowest HP any member saw the boss at (the last one to stop recording saw it lowest); none when no record has it. */
const lowest = (v: (number | undefined)[]) => { const k = v.filter((x): x is number => x != null); return k.length ? Math.min(...k) : undefined; };

/** Shared fights of the same pull grouped (same boss, their times overlapping within PULL_SLACK_MS, one record per member),
 *  newest first. Each player once: their own record's row when they shared it, else the biggest row another member saw of them.
 *  The "Others" row (everyone outside one member's party) is left out once two members merged: it holds the other parties. */
export function groupPulls(fights: FightRecord[]): Pull[] {
  const groups: FightRecord[][] = [];
  for (const f of [...fights].sort((a, b) => startOf(a) - startOf(b))) {
    const g = groups.find((g) => g[0].boss === f.boss && !g.some((x) => x.char === f.char)
      && startOf(f) <= Math.max(...g.map((x) => x.endMs)) + PULL_SLACK_MS && f.endMs + PULL_SLACK_MS >= Math.min(...g.map(startOf)));
    if (g) g.push(f); else groups.push([f]);
  }
  return groups.map((g, i): Pull => {
    const by = new Map<string, PullRow>();
    for (const f of g) for (const r of f.rows) {
      if (r.isOthers && g.length > 1) continue;
      const name = r.name || (r.isYou ? f.char : "");
      if (!name && !r.isOthers) continue;
      const key = r.isOthers ? "\u0000others" : name.toLowerCase();
      const own = r.isYou, had = by.get(key);
      if (!had || (own && !had.own) || (own === had.own && r.damage > had.row.damage)) by.set(key, { key, row: { ...r, name, isYou: false }, own });
    }
    const rows = [...by.values()].sort((a, b) => b.row.damage - a.row.damage);
    const total = rows.reduce((a, r) => a + r.row.damage, 0);
    for (const r of rows) r.row.share = total ? (r.row.damage / total) * 100 : 0;
    const end = Math.max(...g.map((f) => f.endMs));
    return {
      id: `${g[0].id}#${i}`, boss: g[0].boss, startMs: Math.min(...g.map(startOf)), endMs: end, battleTimeMs: Math.max(...g.map((f) => f.battleTimeMs)),
      killed: g.some((f) => f.killed), hpLeft: lowest(g.map((f) => f.hpLeft)), chars: g.map((f) => f.char).filter(Boolean), rows,
    };
  }).sort((a, b) => b.endMs - a.endMs);
}

/** A static fight: at least this many of the static's members in it (your own row counts). Only those are shared and shown. */
export const STATIC_MIN_MEMBERS = 5;

/** How many of the static's members (`names`, any case) have a row in the fight. */
export function membersIn(f: FightRecord, names: string[]): number {
  const want = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const seen = new Set(f.rows.map((r) => (r.name || (r.isYou ? f.char : "")).trim().toLowerCase()).filter((n) => want.has(n)));
  return seen.size;
}
export const isStaticFight = (f: FightRecord, names: string[]) => membersIn(f, names) >= STATIC_MIN_MEMBERS;

/** Past fights sent when you turn sharing on: static fights (isStaticFight) as the character you are in the static as,
 *  the last week (the Worker keeps 90 days), newest first. */
export const BACKFILL_FIGHTS = 20;
export const BACKFILL_MS = 7 * 24 * 3600_000;
export function fightsToShare(log: FightRecord[], char: string, names: string[], now: number): FightRecord[] {
  if (!char) return [];
  return log.filter((f) => f.char === char && now - f.endMs < BACKFILL_MS && f.endMs <= now && isStaticFight(f, names))
    .sort((a, b) => b.endMs - a.endMs).slice(0, BACKFILL_FIGHTS);
}
