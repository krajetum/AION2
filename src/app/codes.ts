// Shared redeem codes (Home > Codes) on the crowd Worker: read, share, mark expired; redeemed / expired marks kept in the save file.
import { crowd } from "../infra/crowd.ts";
import { codeKey, parseCodes, type RedeemCode, toggleMark } from "../domain/codes.ts";
import type { AppData } from "../domain/types.ts";

export const fetchCodes = async (): Promise<RedeemCode[]> => parseCodes(await crowd("/v1/codes"), Date.now());

/** Shares a new code with everyone. The Worker refuses one already listed or lately ended (CrowdError 409). */
export async function shareCode(data: AppData, code: string): Promise<void> {
  await crowd("/v1/codes", { install: data.install, code });
}

/** Your vote that the code no longer works (5 votes remove it for everyone); marked expired here too. */
export async function voteExpired(data: AppData, c: RedeemCode): Promise<boolean> {
  const j = await crowd("/v1/codes/expired", { install: data.install, code: c.code });
  if (!data.codes.expired.includes(c.key)) data.codes.expired = toggleMark(data.codes.expired, c.key);
  return j?.removed === true;
}

export function toggleRedeemed(data: AppData, code: string): void {
  data.codes.redeemed = toggleMark(data.codes.redeemed, codeKey(code));
}
