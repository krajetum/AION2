// Shared Twitch Drops campaigns (Home > Twitch Drops) on the crowd Worker: read, share, mark wrong; claimed / wrong marks kept in the save file.
import { crowd } from "../infra/crowd.ts";
import { toggleMark } from "../domain/codes.ts";
import { parseDrops, type TwitchDrop } from "../domain/drops.ts";
import type { AppData } from "../domain/types.ts";

export const fetchDrops = async (): Promise<TwitchDrop[]> => parseDrops(await crowd("/v1/drops"), Date.now());

/** Shares a campaign with everyone until its end. The Worker refuses one already listed or lately ended (CrowdError 409). */
export async function shareDrop(data: AppData, d: { title: string; rewards: string; url: string | null; endsMs: number }): Promise<void> {
  await crowd("/v1/drops", { install: data.install, ...d });
}

/** Your vote that the campaign is wrong or over (5 votes remove it for everyone); marked here too. */
export async function voteWrong(data: AppData, d: TwitchDrop): Promise<boolean> {
  const j = await crowd("/v1/drops/expired", { install: data.install, title: d.title });
  if (!data.drops.expired.includes(d.key)) data.drops.expired = toggleMark(data.drops.expired, d.key);
  return j?.removed === true;
}

export function toggleClaimed(data: AppData, d: TwitchDrop): void {
  data.drops.redeemed = toggleMark(data.drops.redeemed, d.key);
}
