// Guild use cases: create / join / leave, consent, your card, shared fights, officer actions (the Worker's /v1/guilds).
// Network calls throw (CrowdError) for the page to show; the background ones (sync, fight upload) only log.
import { DEFAULT_SHARE, guildFight, meCard, parseFightBosses, parseGuild, parseGuildFights, type GuildMe, type GuildShare, type GuildView, type Ping } from "../domain/guild.ts";
import type { FightRecord } from "../domain/fights.ts";
import type { Profile } from "../domain/meter.ts";
import type { AppData } from "../domain/types.ts";
import { crowd, CrowdError } from "../infra/crowd.ts";

const warn = (what: string) => (e: unknown) => console.warn(`Guild ${what} failed`, e);
let sentCard = ""; // the card last sent this session: sent again only when it changes

const path = (data: AppData, part = "") => `/v1/guilds/${data.guild!.id}${part}`;
const isGone = (e: unknown) => e instanceof CrowdError && e.status === 403;

export async function createGuild(data: AppData, name: string, serverId: number, me: GuildMe): Promise<void> {
  const r = await crowd("/v1/guilds", { install: data.install, name, serverId, me });
  data.guild = { id: r.id, name: r.name, serverId: r.serverId, memberCode: r.memberCode, officerKey: r.officerKey, share: { ...DEFAULT_SHARE } };
  sentCard = JSON.stringify(me);
}

export async function joinGuild(data: AppData, code: string, me: GuildMe, share: GuildShare = DEFAULT_SHARE): Promise<void> {
  const r = await crowd("/v1/guilds/join", { install: data.install, code, me, share });
  data.guild = { id: r.id, name: r.name, serverId: r.serverId, memberCode: code.toUpperCase().replace(/[\s-]/g, ""), share: { ...share } };
  sentCard = JSON.stringify(me);
}

/** Leaves on the Worker too (your card and fights are deleted there); a guild already gone is left all the same. */
export async function leaveGuild(data: AppData): Promise<void> {
  if (!data.guild) return;
  await crowd(path(data, "/me"), { install: data.install, leave: true }).catch((e) => { if (!isGone(e)) throw e; });
  data.guild = null;
}

export async function setShare(data: AppData, share: GuildShare): Promise<void> {
  if (!data.guild) return;
  await crowd(path(data, "/me"), { install: data.install, share });
  data.guild.share = { ...share };
}

/**
 * The guild as the Worker has it, after sending your card if it changed (only for a character on the guild's server).
 * `removed`: this install isn't a member any more (an officer removed it): data.guild is cleared.
 */
export async function syncGuild(data: AppData, profile: Profile | null | undefined, playing: boolean): Promise<{ view: GuildView | null; removed: boolean }> {
  const g = data.guild;
  if (!g) return { view: null, removed: false };
  try {
    if (profile?.name && profile.serverId === g.serverId) {
      const me = meCard(profile);
      const card = JSON.stringify(me);
      if (card !== sentCard) {
        await crowd(path(data, "/me"), { install: data.install, me, share: g.share });
        sentCard = card;
      }
    }
    const j = await crowd(`${path(data)}?install=${data.install}${playing ? "&playing=1" : ""}`);
    return { view: parseGuild(j, Date.now()), removed: false };
  } catch (e) {
    if (isGone(e)) { data.guild = null; return { view: null, removed: true }; }
    warn("sync")(e);
    return { view: null, removed: false };
  }
}

/** A fight that just ended, shared when you agreed to and you played it on the guild's server. */
export function uploadFight(data: AppData, r: FightRecord, serverId: number | undefined): void {
  const g = data.guild;
  if (!g?.share.fights || serverId !== g.serverId) return;
  crowd(path(data, "/fights"), { install: data.install, fight: guildFight(r) }).catch(warn("fight upload"));
}

export async function fightBosses(data: AppData) {
  return parseFightBosses(await crowd(`${path(data, "/fights")}?install=${data.install}`));
}

export async function bossFights(data: AppData, boss: string): Promise<FightRecord[]> {
  return parseGuildFights(await crowd(`${path(data, "/fights")}?install=${data.install}&boss=${encodeURIComponent(boss)}`));
}

export interface AdminAction { webhook?: string | null; leadMin?: number; bossAlerts?: boolean; remove?: string; rotateCode?: boolean; test?: boolean }

/** An officer action. A rotated code replaces the one kept here; `tested` = the test post went through. */
export async function adminGuild(data: AppData, a: AdminAction): Promise<{ tested?: boolean }> {
  const g = data.guild;
  if (!g?.officerKey) throw new Error("Not an officer of this guild");
  const r = await crowd(path(data, "/admin"), { officerKey: g.officerKey, ...a });
  if (typeof r.memberCode === "string") g.memberCode = r.memberCode;
  return { tested: r.tested };
}

/** A call-up (officers): the Worker reminds the guild's Discord at each lead, the members' apps too. */
export async function createCallup(data: AppData, c: { atMs: number; message: string; ping: Ping; leads: number[] }): Promise<void> {
  const g = data.guild;
  if (!g?.officerKey) throw new Error("Not an officer of this guild");
  await crowd(path(data, "/callups"), { officerKey: g.officerKey, sentMs: Date.now(), ...c });
}

export async function cancelCallup(data: AppData, id: string): Promise<void> {
  const g = data.guild;
  if (!g?.officerKey) throw new Error("Not an officer of this guild");
  await crowd(path(data, `/callups/${id}/delete`), { officerKey: g.officerKey });
}

/** Officer key typed in by an officer on another install (it was shown once, at creation). */
export function setOfficerKey(data: AppData, key: string): void {
  if (data.guild) data.guild.officerKey = key.toUpperCase().replace(/[\s-]/g, "") || undefined;
}
