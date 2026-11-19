import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCode, cleanMarks, codeKey, emptyMarks, leftText, parseCodes, reminderText, shouldRemind, toggleMark, toRedeem } from "./codes.ts";

const H = 3600_000;

test("parseCodes: onto the local clock, junk and duplicates (any case) dropped", () => {
  const j = { serverNow: 1_000_000, codes: [
    { code: "GIFT-ONE", addedMs: 900_000, expiresMs: 2_000_000, votes: 2 },
    { code: "gift-one", addedMs: 900_000, expiresMs: 2_000_000 },
    { code: "bad code", addedMs: 1, expiresMs: 2 },
    { code: "NOTIMES" },
  ] };
  assert.deepEqual(parseCodes(j, 1_000_050), [{ code: "GIFT-ONE", key: "GIFT-ONE", addedMs: 900_050, expiresMs: 2_000_050, votes: 2 }]);
  assert.deepEqual(parseCodes(null, 0), []);
});

test("cleanCode / codeKey: trimmed, the Worker's shape", () => {
  assert.equal(cleanCode("  Aion2_Launch "), "Aion2_Launch");
  assert.equal(cleanCode("ab"), null);
  assert.equal(cleanCode("two words"), null);
  assert.equal(codeKey("aBc1"), "ABC1");
});

test("toRedeem: live, not redeemed, not marked expired, soonest end first", () => {
  const c = (code: string, expiresMs: number) => ({ code, key: codeKey(code), addedMs: 0, expiresMs, votes: 0 });
  const codes = [c("LATER", 10 * H), c("SOON", 2 * H), c("DONE", 5 * H), c("DEAD", 5 * H), c("OVER", H / 2)];
  const m = { redeemed: ["DONE"], expired: ["DEAD"] };
  assert.deepEqual(toRedeem(codes, m, H).map((x) => x.code), ["SOON", "LATER"]);
  assert.deepEqual(toRedeem(codes, emptyMarks(), H).length, 4);
});

test("marks: toggled, cleaned from a save (capitals, no junk)", () => {
  assert.deepEqual(toggleMark(["A"], "B"), ["A", "B"]);
  assert.deepEqual(toggleMark(["A", "B"], "A"), ["B"]);
  assert.deepEqual(cleanMarks({ redeemed: ["abc", 3, "ABC"], expired: "x" }), { redeemed: ["ABC"], expired: [] });
  assert.deepEqual(cleanMarks(undefined), emptyMarks());
});

test("reminder: the codes and the character the rewards go to; once per character entered", () => {
  const c = (code: string) => ({ code, key: code, addedMs: 0, expiresMs: 1, votes: 0 });
  assert.deepEqual(reminderText([c("ONE")], "Randronirk"), { title: "Redeem the code! ONE", body: "The rewards will go to Randronirk, the character you are playing." });
  assert.equal(reminderText(["A1A1", "B2B2", "C3C3", "D4D4"].map(c), "").title, "Redeem the codes! A1A1, B2B2, C3C3 and 1 more");
  assert.equal(shouldRemind("Randronirk", null), true);
  assert.equal(shouldRemind("Randronirk", "Randronirk"), false);
  assert.equal(shouldRemind("Alt", "Randronirk"), true);
  assert.equal(shouldRemind(undefined, null), false);
});

test("leftText", () => {
  assert.equal(leftText(6 * 24 * H + 5 * H), "6 d 5 h left");
  assert.equal(leftText(5.5 * H), "5 h left");
  assert.equal(leftText(30_000), "1 min left");
  assert.equal(leftText(0), "ended");
});
