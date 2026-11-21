import { test } from "node:test";
import assert from "node:assert/strict";

test("sound theme: one preset for every sound, or a theme per channel with custom", async () => {
  const { themeFor } = await import("./alerts.ts");
  assert.equal(themeFor({ soundTheme: "pingy", channelThemes: { cube: "scream" } }, "cube"), "pingy");
  const custom = { soundTheme: "custom" as const, channelThemes: { shugo: "scream" as const, cube: "pingy" as const } };
  assert.equal(themeFor(custom, "shugo"), "scream");
  assert.equal(themeFor(custom, "cube"), "pingy");
  assert.equal(themeFor(custom, "news"), "default");
});
