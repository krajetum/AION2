import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLayout, cleanName, cleanPresets, layoutOf, PRESET_COUNT } from "./hud.ts";

const settings = () => ({ dpsOverlay: true, eventsOverlay: false, cubePopup: true, radar: false, netOverlay: true, soulPopup: true, cubePopupSize: 1, soulPopupSize: 1 });

test("a layout keeps the places, the switches and the popups' sizes", () => {
  const l = layoutOf(settings(), [["overlay", { x: 10, y: 20, w: 300, h: 200 }], ["main", { x: 0, y: 0 }]], 5);
  assert.deepEqual(l.places, [["overlay", { x: 10, y: 20, w: 300, h: 200 }]], "only overlays");
  assert.deepEqual(l.on, { overlay: true, events: false, cube: true, radar: false, net: true, souls: true });
  assert.equal(l.savedMs, 5);
});

test("applying a layout sets the switches and sizes, and says which overlays changed", () => {
  const s = settings();
  const l = layoutOf({ ...settings(), dpsOverlay: false, radar: true, soulPopupSize: 1.3 }, [], 1);
  assert.deepEqual(applyLayout(s, l), ["overlay", "radar", "souls"]);
  assert.equal(s.dpsOverlay, false);
  assert.equal(s.radar, true);
  assert.equal(s.soulPopupSize, 1.3);
  assert.deepEqual(applyLayout(s, l), [], "nothing left to change");
});

test("presets from a save: always six, names kept, broken layouts dropped", () => {
  const p = cleanPresets([
    { name: "  Raid  ", layout: { places: [["overlay", { x: 1.4, y: 2 }], ["overlay", { x: "no" }], ["nope", { x: 1, y: 1 }]], on: { overlay: true, cube: "x" }, cubeSize: 1.2 } },
    { name: "", layout: { places: "bad" } },
  ]);
  assert.equal(p.length, PRESET_COUNT);
  assert.equal(p[0].name, "Raid");
  assert.deepEqual(p[0].layout?.places, [["overlay", { x: 1, y: 2 }]]);
  assert.deepEqual(p[0].layout?.on, { overlay: true });
  assert.equal(p[0].layout?.soulSize, 1);
  assert.equal(p[1].name, "Preset 2");
  assert.equal(p[1].layout, undefined);
  assert.equal(cleanPresets(null)[5].name, "Preset 6");
  assert.equal(cleanName("x".repeat(40), 0).length, 24);
});
