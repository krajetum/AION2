import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDrop, dropKey, parseDrops, toClaim } from "./drops.ts";

test("parseDrops: times onto the local clock, junk and duplicate titles dropped, only twitch.tv links kept", () => {
  const j = { serverNow: 1_000, drops: [
    { title: "Launch Drops", rewards: "Mount", url: "https://www.twitch.tv/x", addedMs: 500, startsMs: null, endsMs: 9_000, votes: 2 },
    { title: "launch  drops", addedMs: 1, endsMs: 2 },
    { title: "Evil", addedMs: 1, endsMs: 2 },
    { title: "Other one", url: "https://evil.example", addedMs: 1, endsMs: 5_000 },
    { title: 5 }, null,
  ] };
  const got = parseDrops(j, 1_100);
  assert.deepEqual(got.map((d) => [d.title, d.endsMs, d.url]), [["Launch Drops", 9_100, "https://www.twitch.tv/x"], ["Evil", 102, null], ["Other one", 5_100, null]]);
  assert.deepEqual(parseDrops(undefined, 0), []);
});

test("cleanDrop: title, a future end within 60 days, twitch links only", () => {
  const now = Date.parse("2026-11-25T12:00");
  const f = { title: "  Launch   Drops ", rewards: " Mount ", url: "", ends: "2026-11-30T20:00" };
  assert.deepEqual(cleanDrop(f, now), { title: "Launch Drops", rewards: "Mount", url: null, endsMs: Date.parse("2026-11-30T20:00") });
  assert.equal(typeof cleanDrop({ ...f, title: "ab" }, now), "string");
  assert.equal(typeof cleanDrop({ ...f, ends: "2026-11-24T20:00" }, now), "string");
  assert.equal(typeof cleanDrop({ ...f, ends: "2027-03-01T20:00" }, now), "string");
  assert.equal(typeof cleanDrop({ ...f, ends: "" }, now), "string");
  assert.equal(typeof cleanDrop({ ...f, url: "https://evil.example" }, now), "string");
});

test("toClaim: live, neither claimed nor marked wrong, soonest end first", () => {
  const d = (title: string, endsMs: number) => ({ title, key: dropKey(title), rewards: "", url: null, addedMs: 0, startsMs: null, endsMs, votes: 0 });
  const list = [d("Late one", 300), d("Soon one", 200), d("Ended", 50), d("Claimed", 400)];
  assert.deepEqual(toClaim(list, { redeemed: [dropKey("claimed")], expired: [] }, 100).map((x) => x.title), ["Soon one", "Late one"]);
});
