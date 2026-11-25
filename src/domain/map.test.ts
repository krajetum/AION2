// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { foundOn, invertAffine, mapOf, onMap, mergeDrops, lootKind, takeLoots, takeSouls, soulOf, unknownMob, type LootKill, type SoulKill, petHome, petList, readDropsFile, dropsFile, type PetDrop, BUNDLED_DROPS, takeBundledDrops, mapOfMob, linkKinds, mobKind, petStops, route, pathLength } from "./map.ts";
import { readFileSync } from "node:fs";
import { ABYSS_FIT, ELYOS_FIT, KRAO_FIT, KRAO_MAP_IDS, URUGUGU_FIT, FIRE_FIT, DRAUPNIR_FIT, VAKRON_FIT, HORN_FIT, KIBELISK_FIT, isMapKey, applyAffine, bearing, BUNDLED_FIT, climb, onRadar, staleFor, STALE_POSITION_MS, travelNote, travelIcon, cleanMap, emptyMap, takeCubes, clusters, fitAffine, fitError, fitView, toImage, toScreen, zoomAt, type MapPoint } from "./map.ts";

const pt = (id: string, x: number, y: number): MapPoint => ({ id, map: "asmodian", x, y, kind: "cube", group: 0, label: "" });

test("fit view centres the whole image", () => {
  const v = fitView(2000, 1000, 1000, 1000);
  assert.deepEqual(v, { scale: 0.5, x: 0, y: 250 });
});

test("zoom keeps the point under the cursor still, within limits", () => {
  const v = { scale: 1, x: 10, y: 20 };
  const before = toImage(v, 300, 200);
  const z = zoomAt(v, 2, 300, 200, 0.1, 4);
  assert.equal(z.scale, 2);
  const after = toScreen(z, before.x, before.y);
  assert.ok(Math.abs(after.x - 300) < 1e-9 && Math.abs(after.y - 200) < 1e-9);
  assert.equal(zoomAt(v, 100, 0, 0, 0.1, 4).scale, 4);
  assert.equal(zoomAt(v, 0.001, 0, 0, 0.1, 4).scale, 0.1);
});

test("close points cluster when zoomed out and split when zoomed in", () => {
  const ps = [pt("a", 100, 100), pt("b", 110, 100), pt("c", 400, 100)];
  const far = clusters(ps, { scale: 0.5, x: 0, y: 0 }, 20); // a, b 5 px apart on screen
  assert.deepEqual(far.map((c) => c.points.map((p) => p.id)), [["a", "b"], ["c"]]);
  assert.deepEqual([far[0].x, far[0].y], [52.5, 50]);
  const near = clusters(ps, { scale: 4, x: 0, y: 0 }, 20); // 40 px apart
  assert.equal(near.length, 3);
});

test("affine fit recovers a known mapping and reports its error", () => {
  const t = (gx: number, gy: number) => ({ x: 0.25 * gx + 120, y: -0.25 * gy + 3000 }); // y flipped, as maps often are
  const refs = [[0, 0], [4000, 0], [0, 8000], [6000, 6000]].map(([gx, gy]) => ({ game: { x: gx, y: gy }, ...t(gx, gy) }));
  const fit = fitAffine(refs)!;
  const p = applyAffine(fit, 1000, 2000);
  assert.ok(Math.abs(p.x - 370) < 1e-6 && Math.abs(p.y - 2500) < 1e-6, JSON.stringify(p));
  assert.ok(fitError(fit, refs) < 1e-6);
  refs[3].x += 9; // a click 9 px off
  assert.ok(fitError(fitAffine(refs)!, refs) > 1);
});

test("affine fit needs three references off one line", () => {
  const r = (gx: number, gy: number) => ({ game: { x: gx, y: gy }, x: gx, y: gy });
  assert.equal(fitAffine([r(0, 0), r(1, 1)]), null);
  assert.equal(fitAffine([r(0, 0), r(1, 1), r(2, 2)]), null);
  assert.notEqual(fitAffine([r(0, 0), r(1, 0), r(0, 1)]), null);
});

test("saved points are cleaned, bad ones dropped", () => {
  const m = cleanMap({ points: [
    { id: "a", x: 1, y: 2, kind: "ref", group: 3, label: "Obelisk", game: { x: 5, y: 6 } },
    { id: "b", map: "abyss", x: 1, y: 2, kind: "weird", group: 99, game: { x: "?" } },
    { id: "c", x: "1", y: 2 },
    null,
  ] });
  assert.deepEqual(m.points, [
    { id: "a", map: "asmodian", x: 1, y: 2, kind: "ref", group: 3, label: "Obelisk", game: { x: 5, y: 6 } },
    { id: "b", map: "abyss", x: 1, y: 2, kind: "cube", group: 0, label: "" },
  ]);
  assert.deepEqual(cleanMap(undefined).points, []);
});

test("bundled fit puts the recorded teleports where the screenshots show them", () => {
  const near = (gx: number, gy: number, px: number, py: number, tol: number) => {
    const p = applyAffine(BUNDLED_FIT, gx, gy);
    assert.ok(Math.hypot(p.x - px, p.y - py) < tol, `${gx},${gy} → ${p.x.toFixed(0)},${p.y.toFixed(0)}, expected ${px},${py}`);
  };
  near(109370, 189246, 2096, 2719, 5); // obelisk near Black Claw Village
  near(189516, -91914, 2517, 1151, 5); // Basfelt Ruins, arrow after the teleport
  near(-86370, -158622, 1023, 776, 12); // walked spots
  near(-43409, -150745, 1255, 829, 20);
});

test("Elyos fit puts the recorded walk where the screenshots show it", () => {
  const near = (gx: number, gy: number, px: number, py: number, tol: number) => {
    const p = applyAffine(ELYOS_FIT, gx, gy);
    assert.ok(Math.hypot(p.x - px, p.y - py) < tol, `${gx},${gy} → ${p.x.toFixed(0)},${p.y.toFixed(0)}, expected ${px},${py}`);
  };
  near(12337, 5864, 1845, 1377, 2); // arrived, 11:08:10
  near(135104, -79098, 2528, 897, 2); // near Drana, 11:11:48
  near(94058, 15873, 2332, 1495, 70); // last position before the third screenshot, walked on from there
});

test("Abyss fit puts the recorded spots where the player marked them", () => {
  const near = (gx: number, gy: number, px: number, py: number) => {
    const p = applyAffine(ABYSS_FIT, gx, gy);
    assert.ok(Math.hypot(p.x - px, p.y - py) < 25, `${gx},${gy} → ${p.x.toFixed(0)},${p.y.toFixed(0)}, expected ${px},${py}`);
  };
  near(54425, -53376, 1246, 167); // 1: the fortress, 14:28:52
  near(38010, 17550, 1098, 829); // 2: after the teleport, 14:29:35
  near(-35673, -23916, 417, 406); // 3: after the teleport, 14:30:11
});

test("cube openings join the save once per spot; codes are learned", () => {
  const m = emptyMap();
  const o = (x: number, y: number, atMs: number, code: number | null = null) => ({ x, y, z: 0, code, atMs, byYou: true });
  assert.equal(takeCubes(m, [1301199], [o(1000, 1000, 1)]), true);
  assert.equal(takeCubes(m, [1301199], [o(1000, 1000, 1)]), false, "same news again");
  assert.equal(takeCubes(m, [], [o(1100, 1050, 5, 42)]), true, "same spot, later: refreshed");
  assert.deepEqual(m.found, [{ x: 1000, y: 1000, z: 0, code: 42, atMs: 5, byYou: true }]);
  takeCubes(m, [77], [o(5000, 1000, 6)]);
  assert.equal(m.found.length, 2);
  assert.deepEqual(m.cubeCodes, [77, 1301199]);
});

test("bearing: map up is north, y grows south", () => {
  assert.deepEqual(bearing({ x: 0, y: 0 }, { x: 0, y: -500 }), { dist: 500, dir: "N", deg: 0 });
  assert.equal(bearing({ x: 0, y: 0 }, { x: 300, y: 300 }).dir, "SE");
  assert.equal(bearing({ x: 0, y: 0 }, { x: -400, y: 0 }).dir, "W");
});

test("old saves get the cube fields; bad entries are dropped", () => {
  const m = cleanMap({ points: [], found: [{ x: 1, y: 2, z: 3, atMs: 4, code: 9 }, { x: "?" }], cubeCodes: [5, -1, "x"] });
  assert.deepEqual(m.found, [{ x: 1, y: 2, z: 3, code: 9, atMs: 4, byYou: false }]);
  assert.deepEqual(m.cubeCodes, [5, 1301199]);
  assert.deepEqual(cleanMap(undefined).cubeCodes, [1301199]);
});

test("climb: up, down or about level", () => {
  assert.deepEqual(climb({ z: 3750 }, { z: -70 }), { dz: -3820, way: "down" }); // the 20:18 cube, from the bank above it
  assert.equal(climb({ z: -68 }, { z: -70 }).way, "level");
  assert.equal(climb({ z: 100 }, { z: 900 }).way, "up");
});

test("radar: north up, east right, off the rim is off", () => {
  assert.deepEqual(onRadar({ x: 0, y: 0 }, { x: 5000, y: -5000 }, 10_000, 100), { x: 50, y: -50 });
  assert.equal(onRadar({ x: 0, y: 0 }, { x: 20_000, y: 0 }, 10_000, 100), null);
});

const drop = (id: string, pet: string, mapId: number | null, x = 0): PetDrop => ({ id, pet, mapId, x, y: 0, z: 0, atMs: 1, by: "" });

test("game map ids pick the page's map; old found cubes stay on the world map", () => {
  assert.equal(mapOf(1110), "asmodian");
  assert.equal(mapOf(20), "abyss");
  assert.equal(mapOf(61), null);
  assert.equal(mapOf(null), null);
  assert.ok(!onMap(null, "asmodian") && !onMap(null, "elyos") && onMap(20, "abyss") && !onMap(20, "elyos"), "an unknown map is on none");
  assert.equal(mapOf(1010), "elyos", "Verteron's map load, 2026-10-26");
  assert.ok(!onMap(777, "elyos") && !onMap(777, "asmodian"), "an id no map claims is on none");
  assert.ok(foundOn({ x: 0, y: 0, z: 0, code: null, atMs: 1, byYou: true }, "asmodian"));
  assert.ok(foundOn({ x: 0, y: 0, z: 0, code: null, atMs: 1, byYou: true, mapId: 20 }, "abyss"));
  const m = emptyMap();
  takeCubes(m, [], [{ x: 0, y: 0, z: 0, code: null, atMs: 1, byYou: true }], 20);
  assert.equal(m.found[0].mapId, 20);
});

test("the inverse fit takes a pixel back to the game", () => {
  const inv = invertAffine(BUNDLED_FIT)!;
  const p = applyAffine(BUNDLED_FIT, 109370, 189246), g = applyAffine(inv, p.x, p.y);
  assert.ok(Math.abs(g.x - 109370) < 0.01 && Math.abs(g.y - 189246) < 0.01, JSON.stringify(g));
  assert.equal(invertAffine([1, 2, 0, 2, 4, 0]), null);
});

test("friends' drops merge once; bad entries are dropped", () => {
  const m = emptyMap();
  assert.equal(mergeDrops(m, [drop("a", "Fox", 1110), drop("b", "Fox", 20)]), 2);
  assert.equal(mergeDrops(m, [drop("a", "Fox", 1110), drop("c", " Owl ", null), { id: "d", pet: "", x: 1, y: 1, atMs: 1 } as any]), 1, "same file again adds only the new one");
  assert.deepEqual(m.pets.map((d) => d.pet), ["Fox", "Fox", "Owl"]);
  m.souls["young slink"] = "Slink";
  const back = readDropsFile(JSON.parse(JSON.stringify(dropsFile(m))));
  assert.deepEqual(back, { drops: m.pets, souls: { "young slink": "Slink" }, items: {}, petNames: {}, kinds: {} });
  assert.deepEqual(readDropsFile({ format: "aion2-companion-pet-drops", version: 1, drops: [] }).souls, {}, "version 1 files have no names");
  assert.throws(() => readDropsFile({ version: 1, drops: [] }));
  assert.deepEqual(cleanMap({ points: [] }).pets, []);
});

test("pet list: search by any part of the name, maps with drops, the map with the most", () => {
  const drops = [drop("a", "Fox", 1110), drop("b", "fox", 20), drop("c", "Fox", 20), drop("d", "Owl", 61)];
  assert.deepEqual(petList(drops), [{ name: "Fox", drops: 3, maps: ["asmodian", "abyss"], mobs: [] }, { name: "Owl", drops: 1, maps: [], mobs: [] }]);
  assert.deepEqual(petList(drops, "OW").map((e) => e.name), ["Owl"]);
  assert.equal(petHome(drops, "fox"), "abyss");
  assert.equal(petHome(drops, "Owl"), null);
  assert.equal(petHome([...drops, { ...drop("e", "Owl", 61), map: "elyos" }], "Owl"), "elyos", "the map it was recorded on wins");
});

test("soul kills: placed where the mob died, one per mob and spot, named by the player's soul names", () => {
  const m = emptyMap();
  const k = (entity: number, mob: string, x: number, atMs: number, mapId: number | null = 1110): SoulKill =>
    ({ entity, x, y: 0, z: 5, mapId, points: 1, atMs, mob });
  assert.equal(takeSouls(m, [k(1, "Slink", 0, 10), k(2, "Slink", 900, 11), k(3, "Young Slink", 900, 12), k(4, "", 0, 13)], "Leo"), true);
  assert.deepEqual(m.pets.map((d) => [d.id, d.pet, d.mob, d.map]), [["kill:Leo:10:1", "Slink", "Slink", "asmodian"], ["kill:Leo:12:3", "Young Slink", "Young Slink", "asmodian"]],
    "the second Slink 9 m away adds nothing; a mob never seen spawning is left out");
  assert.equal(m.soulsSeenMs, 13);
  assert.equal(takeSouls(m, [k(1, "Slink", 0, 10)], "Leo"), false, "the same kills again");
  takeSouls(m, [k(5, "Slink", 5000, 20, 20), k(6, "Slink", 5000, 21, 1010), k(7, "Slink", 5000, 22, 61)], "Leo");
  assert.deepEqual(m.pets.slice(2).map((d) => d.map ?? null), ["abyss", "elyos", null], "map 20 is the Abyss, 1010 Elyos; an arena on none");
  // Young Slink gives Slink soul points: named once, all its drops follow.
  m.souls["young slink"] = "Slink";
  assert.equal(soulOf(m, m.pets[1]), "Slink");
  assert.deepEqual(petList(m.pets, "", m).map((e) => [e.name, e.drops, e.mobs]), [["Slink", 5, ["Slink", "Young Slink"]]]);
  assert.deepEqual(petList(m.pets, "young", m).map((e) => e.name), ["Slink"], "a mob's name finds its soul");
  assert.equal(petHome(m.pets, "slink", m), "asmodian");
});

test("a friend's soul names fill in, yours stay", () => {
  const m = emptyMap();
  m.souls["young slink"] = "Slink";
  mergeDrops(m, [], { souls: { "Young Slink": "Something else", "Withered Branch Spider": "Withered Branch Spider Soul" } });
  assert.deepEqual(m.souls, { "young slink": "Slink", "withered branch spider": "Withered Branch Spider Soul" });
  assert.deepEqual(cleanMap({}).souls, {});
});

test("crystals: a named item's loots become drops, once each; renaming moves them all", () => {
  const m = emptyMap(), seen = new Set<string>();
  // The friend's recording of 2026-10-25 19:16: Mutated Forest Guardian drops Agrint (610531002) and its usual item.
  const l = (entity: number, item: number, x: number, atMs: number, mob = "Mutated Forest Guardian"): LootKill =>
    ({ entity, item, x, y: 39169, z: 3, mapId: 1010, atMs, mob });
  const loots = [l(18041, 610531002, -17177, 1), l(18041, 534660178, -17177, 1), l(34090, 610531002, -9000, 2)];
  assert.equal(takeLoots(m, loots, "Selphine", seen), false, "nothing named yet");
  m.items["610531002"] = "Agrint";
  seen.clear();
  assert.equal(takeLoots(m, loots, "Selphine", seen), true);
  assert.deepEqual(m.pets.map((d) => [d.pet, d.item, d.mob, d.map, d.x]), [["Agrint", 610531002, "Mutated Forest Guardian", "elyos", -17177], ["Agrint", 610531002, "Mutated Forest Guardian", "elyos", -9000]]);
  assert.equal(takeLoots(m, loots, "Selphine", seen), false, "the meter resends them: nothing new");
  assert.equal(takeLoots(m, [l(1, 610531002, -17100, 3)], "Selphine", new Set()), false, "the same spot again adds nothing");
  m.items["610531002"] = "Agrint Crystal";
  assert.equal(soulOf(m, m.pets[0]), "Agrint Crystal");
  assert.deepEqual(petList(m.pets, "", m).map((e) => [e.name, e.drops]), [["Agrint Crystal", 2]]);
  m.souls["mutated forest guardian"] = "Something";
  assert.equal(soulOf(m, m.pets[0]), "Agrint Crystal", "a crystal is named by its item, not its mob");
});

test("kills and loots on a map not known yet wait until the meter fills it in", () => {
  const m = emptyMap(), seen = new Set<string>();
  const k = (atMs: number, mapId: number | null): SoulKill => ({ entity: atMs, x: atMs * 5000, y: 0, z: 0, mapId, points: 1, atMs, mob: "Abyss Aberrant Swarm" });
  assert.equal(takeSouls(m, [k(1, null), k(2, null)], "Leo"), false);
  assert.equal(m.pets.length, 0);
  assert.equal(m.soulsSeenMs, 0, "nothing taken");
  takeSouls(m, [k(1, 20), k(2, 20)], "Leo"); // the field-boss map said 20
  assert.deepEqual(m.pets.map((d) => d.map), ["abyss", "abyss"]);
  m.items["610531002"] = "Agrint";
  const l = (mapId: number | null): LootKill => ({ entity: 9, item: 610531002, x: 0, y: 0, z: 0, mapId, atMs: 3, mob: "Mutated Elim" });
  assert.equal(takeLoots(m, [l(null)], "Leo", seen), false);
  assert.equal(takeLoots(m, [l(20)], "Leo", seen), true, "looked at again once known");
});

test("kills whose mob was not seen spawning are named by their kind, now or once a named one shows it", () => {
  // The recording of 2026-10-26 11:29: 8 kills in Verteron, 5 with the spawn unseen.
  const m = emptyMap();
  const k = (entity: number, kind: number, mob: string, x: number, atMs: number): SoulKill =>
    ({ entity, x, y: 0, z: 0, mapId: 1010, kind, points: 1, atMs, mob });
  takeSouls(m, [k(47337, 1045, "", 0, 1), k(22001, 1097, "", 5000, 2)], "Randronirk");
  assert.deepEqual(m.pets.map((d) => d.mob), [unknownMob(1045), unknownMob(1097)], "kept, not dropped");
  takeSouls(m, [k(40080, 1097, "Highland Karnif", 9000, 3), k(27012, 1097, "", 13000, 4)], "Randronirk");
  assert.deepEqual(m.pets.map((d) => [d.mob, d.pet]), [
    [unknownMob(1045), unknownMob(1045)], ["Highland Karnif", "Highland Karnif"], ["Highland Karnif", "Highland Karnif"], ["Highland Karnif", "Highland Karnif"],
  ], "the earlier unnamed Karnif renamed, the later one named at once");
  assert.equal(m.kinds["1097"], "Highland Karnif");
  m.souls["highland sylphen"] = "Sylphen";
  takeSouls(m, [k(18212, 1045, "Highland Sylphen", 20000, 5)], "Randronirk");
  assert.equal(m.pets[0].mob, "Highland Sylphen");
  assert.equal(m.pets[0].pet, "Sylphen", "renamed to the soul named for its mob");
});

test("a friend's file names pets: their names, and the mob of each kill's pet number", () => {
  const m = emptyMap();
  m.petNames["1117"] = "My Spider";
  const kill = (id: string, kind: number, mob: string): PetDrop => ({ id, pet: mob, mob, kind, mapId: 1010, x: 0, y: 0, z: 0, atMs: 1, by: "Friend" });
  mergeDrops(m, [kill("k1", 1097, "Highland Karnif"), kill("k2", 1045, "Unknown mob #1045")],
    { petNames: { "1117": "Unstable Spider", "1046": "Armadon" }, kinds: { "1121": "Young Slink" } });
  assert.deepEqual(m.petNames, { "1117": "My Spider", "1046": "Armadon" }, "yours stay");
  assert.deepEqual(m.kinds, { "1121": "Young Slink", "1097": "Highland Karnif" }, "an unknown mob names nothing");
});

test("loot codes: each kill's common item, the crystals, the rest", () => {
  assert.equal(lootKind(534660178), "common"); // every Mutated Forest Guardian
  assert.equal(lootKind(534660061), "common"); // every Starturtle
  assert.equal(lootKind(610531002), "crystal"); // Agrint
  assert.equal(lootKind(610530011), "crystal"); // a maxed Starturtle's
  assert.equal(lootKind(110460025), "other");
  assert.equal(lootKind(210660022), "other");
});

test("a saved file's drops name their pets on load (imported before files named pets)", () => {
  const d = (id: string, kind: number | undefined, mob: string) => ({ id, pet: mob, mob, ...(kind != null && { kind }), mapId: 1010, x: 0, y: 0, z: 0, atMs: 1, by: "Friend" });
  const m = cleanMap({ pets: [d("a", 2400300, "Aullaeu Apprentice Shaman"), d("b", 1045, "Unknown mob #1045"), d("c", undefined, "Slink")], kinds: { "1097": "Highland Karnif" } });
  assert.deepEqual(m.kinds, { "1097": "Highland Karnif", "2400300": "Aullaeu Apprentice Shaman" });
});

test("the bundled drops: no player names, every spot on its map, merged once, no copy of drops you already have", () => {
  const raw = JSON.parse(readFileSync(new URL("../assets/pet-drops.json", import.meta.url), "utf8"));
  assert.equal(raw.bundle, BUNDLED_DROPS, "bump BUNDLED_DROPS with the file");
  const file = readDropsFile(raw);
  assert.equal(file.drops.length, 2849);
  assert.ok(file.drops.every((d) => d.by === "" && d.id.startsWith("bundled:")), "players' names stay out of the repo");
  assert.ok(file.drops.every((d) => d.map != null && mapOf(d.mapId) === d.map), "each spot's map id is the map it was put on");
  const m = emptyMap();
  // A kill of yours that is also in the bundle (the players' file had it under your name).
  const mine = { ...file.drops[0], id: "kill:Me:1:2", by: "Me" };
  m.pets.push(mine);
  m.petNames["1206"] = "My Guardite"; // names the player gave stay
  m.kinds["1007"] = "My Crab";
  assert.equal(takeBundledDrops(m, raw), 2848, "your own kill is not added twice");
  assert.equal(m.pets[0], mine, "what you had stays as it was, first");
  assert.equal(m.petNames["1206"], "My Guardite");
  assert.equal(m.kinds["1007"], "My Crab");
  assert.equal(m.petNames["1091"], "Red Spark Ignus", "names you had not given come from the bundle");
  assert.equal(m.bundledDrops, BUNDLED_DROPS);
  m.pets.splice(5, 1); // a spot the player deletes
  assert.equal(takeBundledDrops(m, raw), -1, "merged once: deleted spots stay deleted");
  assert.equal(m.pets.length, 2848);
  assert.equal(cleanMap(JSON.parse(JSON.stringify(m))).bundledDrops, BUNDLED_DROPS, "kept in the save");
});

test("a save that merged the first bundle takes only its corrections: the Abyss run off the Asmodian sea", () => {
  const raw = JSON.parse(readFileSync(new URL("../assets/pet-drops.json", import.meta.url), "utf8"));
  const file = readDropsFile(raw);
  const fixed = file.drops.find((d) => d.id === "bundled:2737")!;
  assert.equal(fixed.mapId, 20);
  assert.ok(!file.drops.some((d) => d.mapId === 1110 && /^Abyss/.test(d.mob ?? "")), "no Abyss mob on the Asmodian map");
  const m = emptyMap();
  m.bundledDrops = "2026-10-26";
  m.pets.push({ ...fixed, mapId: 1110, map: "asmodian" }); // as the first bundle had it
  m.pets.push({ ...fixed, id: "kill:Rec:1", by: "Rec", mapId: 1110, map: "asmodian" }); // the recorder's own copy
  assert.equal(takeBundledDrops(m, raw), 0, "deleted spots stay deleted");
  assert.equal(m.pets.length, 2);
  assert.ok(m.pets.every((d) => d.mapId === 20 && d.map === "abyss"));
  assert.equal(m.bundledDrops, BUNDLED_DROPS);
});

test("a kill while the map is unknown goes on the map its mob's spots are on", () => {
  const m = emptyMap();
  // The bundled Water Spirit spot (Elyos), and a mob seen on two maps.
  const spot = (id: string, mob: string, mapId: number, x: number, y: number) => ({ id, pet: mob, mob, mapId, x, y, z: 0, atMs: 1, by: "" });
  m.pets.push(spot("w", "Water Spirit", 1010, 32709, -109354), spot("s1", "Slink", 1110, 0, 0), spot("s2", "Slink", 1010, 0, 0));
  assert.equal(mapOfMob(m, "Water Spirit", 29459, -105816), 1010);
  assert.equal(mapOfMob(m, "Water Spirit", 29459 + 60_000, -105816), null, "too far from its spots");
  assert.equal(mapOfMob(m, "Slink", 0, 0), null, "on two maps");
  assert.equal(mapOfMob(m, "Nobody", 0, 0), null);
  // The recording of 2026-10-27 11:49: the app started in game, so the meter had no map; kind 1168 = Water Spirit.
  m.kinds["1168"] = "Water Spirit";
  const kill = (atMs: number, mob: string, mapId: number | null, x = 29459) => ({ entity: atMs, x, y: -105816, z: 1395, mapId, kind: 1168, points: 1, atMs, mob });
  assert.equal(takeSouls(m, [kill(10, "Water Spirit", null)], "Me"), true);
  assert.equal(m.pets.at(-1)?.mapId, 1010);
  assert.equal(m.pets.at(-1)?.map, "elyos");
  assert.equal(takeSouls(m, [kill(11, "Slink", null), kill(12, "Water Spirit", null, 31000)], "Me"), false, "an unknown map waits, with the kills after it");
  assert.equal(m.soulsSeenMs, 10);
});

test("kills with no pet number get their mob's: the player's pick, else what its other kills carried most", () => {
  const m = emptyMap();
  const k = (id: string, mob: string, kind?: number, item?: number) =>
    ({ id, pet: mob, mob, ...(kind != null && { kind }), ...(item != null && { item }), mapId: 1110, x: 0, y: 0, z: 0, atMs: 1, by: "" });
  m.pets.push(k("a", "Withered Branch Spider", 1116), k("b", "Withered Branch Spider", 1116), k("c", "Withered Branch Spider", 1071),
    k("d", "Withered Branch Spider"), k("e", "Old Agrint"), k("f", "Old Agrint", undefined, 610531002));
  assert.equal(linkKinds(m), 1);
  assert.deepEqual([m.pets[3].kind, m.pets[3].linked], [1116, true], "the most carried");
  assert.equal(m.pets[4].kind, undefined, "Old Agrint: no kill of it ever carried one");
  m.mobPets["old agrint"] = 1207; // the player's pick (2026-10-27)
  assert.equal(linkKinds(m), 1);
  assert.deepEqual([m.pets[4].kind, m.pets[5].kind], [1207, undefined], "a crystal is not its mob's pet's");
  m.mobPets["withered branch spider"] = 1071;
  linkKinds(m);
  assert.deepEqual([m.pets[0].kind, m.pets[3].kind], [1116, 1071], "recorded numbers stay; linked ones follow the pick");
  const back = cleanMap(JSON.parse(JSON.stringify(m)));
  assert.deepEqual([back.pets[3].kind, back.pets[3].linked, back.mobPets["old agrint"]], [1071, true, 1207]);
});

test("points paired with the wrong kill place no spot (a Forest Guardian's on a Thin Testgrint, 2026-10-27 23:22)", () => {
  const m = emptyMap();
  const d = (id: string, mob: string, kind: number) => ({ id, pet: mob, mob, kind, mapId: 1010, map: "elyos" as const, x: 0, y: 0, z: 0, atMs: 1, by: "" });
  m.pets.push(d("a", "Thin Testgrint", 1209), d("b", "Thin Testgrint", 1209), d("c", "Thin Testgrint", 1209));
  assert.equal(mobKind(m, "thin testgrint"), 1209);
  const kill = (atMs: number, kind: number) => ({ entity: atMs, x: 89375, y: 146525, z: 0, mapId: 1010, kind, points: 1, atMs, mob: "Thin Testgrint" });
  takeSouls(m, [kill(10, 1101)], "Me");
  assert.equal(m.pets.length, 3, "not placed");
  assert.equal(m.kinds["1101"], undefined, "and 1101 is not named Thin Testgrint");
  assert.equal(m.soulsSeenMs, 10, "but taken");
  takeSouls(m, [kill(20, 1209)], "Me");
  assert.equal(m.pets.length, 4, "its own pet's points place it");
  m.pets.push(d("e", "Thin Testgrint", 1101));
  assert.equal(mobKind(m, "Thin Testgrint"), null, "kills that disagree say nothing");
});

test("a position stops being fresh after STALE_POSITION_MS (mount, wings)", () => {
  const pos = { atMs: 100_000 };
  assert.equal(staleFor(pos, 100_000 + STALE_POSITION_MS), null);
  assert.equal(staleFor(pos, 100_000 + 23_400), 23);
});

test("travel note: gliding first, then the mount, nothing on foot or from an older meter", () => {
  assert.equal(travelNote({ mounted: true, gliding: true }), "Gliding · updates on landing");
  assert.equal(travelNote({ mounted: true, gliding: false }), "On a mount · jump to update");
  assert.equal(travelNote({ mounted: false, gliding: false }), null);
  assert.equal(travelNote(undefined), null);
});

test("travel icon: a wing while gliding, a horse on a mount, the dot on foot", () => {
  assert.equal(travelIcon({ mounted: true, gliding: true }), "wings");
  assert.equal(travelIcon({ mounted: true, gliding: false }), "mount");
  assert.equal(travelIcon({ mounted: false, gliding: false }), null);
  assert.equal(travelIcon(null), null);
});

test("pet stops: one per soul, at its busiest spot", () => {
  const d = (pet: string, x: number, y: number): PetDrop => ({ id: `${pet}${x}:${y}`, pet, mapId: 1110, x, y, z: 0, atMs: 0, by: "" });
  const stops = petStops([d("Fox", 0, 0), d("Fox", 50_000, 0), d("Fox", 51_000, 500), d("fox", 50_500, -500), d("Owl", 9, 9)]);
  assert.deepEqual(stops.map((s) => [s.pet, s.spots]), [["Fox", 3], ["Owl", 1]]);
  assert.ok(stops[0].x >= 50_000, "the camp of three, not the lone spot");
});

test("route: every stop once, from you, and 2-opt never worse than nearest-first", () => {
  const line = [3, 1, 2].map((x) => ({ x, y: 0 }));
  assert.deepEqual(route(line, { x: 0, y: 0 }).map((p) => p.x), [1, 2, 3]);
  assert.deepEqual(route(line).map((p) => p.x), [3, 2, 1], "no position: from the first stop");
  assert.deepEqual(route([]), []);
  assert.deepEqual(route([], { x: 0, y: 0 }), []);
  // Nearest-first alone, to compare with.
  const nearest = (pts: { x: number; y: number }[], s: { x: number; y: number }) => {
    const left = [...pts], out = [s];
    while (left.length) {
      const f = out[out.length - 1];
      left.sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y));
      out.push(left.shift()!);
    }
    return out;
  };
  let seed = 7, shorter = 0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let run = 0; run < 20; run++) {
    const pts = Array.from({ length: 30 }, () => ({ x: rnd() * 1000, y: rnd() * 1000 })), s = { x: 500, y: 500 };
    const r = route(pts, s), a = pathLength([s, ...r]), b = pathLength(nearest(pts, s));
    assert.equal(new Set(r).size, 30);
    assert.ok(a <= b + 1e-6, `run ${run}: ${a} > ${b}`);
    if (a < b - 1e-6) shorter++;
  }
  assert.ok(shorter > 0, "2-opt shortened at least one nearest-first route");
});

test("Krao Cave fit puts the recorded spots on the screenshots' arrow", () => {
  const near = (a: { x: number; y: number }, x: number, y: number) => Math.hypot(a.x - x, a.y - y) < 2;
  assert.ok(near(applyAffine(KRAO_FIT, -24000, 33994), 838.8, 1008.8), "the entrance");
  assert.ok(near(applyAffine(KRAO_FIT, -19441, 18198), 955.5, 624.5), "the teleport after the first boss");
  assert.deepEqual(KRAO_MAP_IDS.map(mapOf), ["krao", "krao", "krao"], "every difficulty");
  assert.ok(isMapKey("krao"));
});

test("Urugugu Canyon fit puts the recorded spots on the screenshot", () => {
  const near = (a: { x: number; y: number }, x: number, y: number) => Math.hypot(a.x - x, a.y - y) < 8;
  assert.ok(near(applyAffine(URUGUGU_FIT, -17138, 16847), 130.6, 982.6), "the entrance");
  assert.ok(near(applyAffine(URUGUGU_FIT, 7645, 4175), 452.7, 818.8), "the first boss");
  assert.deepEqual([600011, 600012, 600013].map(mapOf), ["urugugu", "urugugu", "urugugu"], "every difficulty");
});

test("Fire Temple fit puts the recorded spots on the screenshots' arrow", () => {
  const near = (a: { x: number; y: number }, x: number, y: number) => Math.hypot(a.x - x, a.y - y) < 2;
  assert.ok(near(applyAffine(FIRE_FIT, 12730, -22720), 1133, 161), "the entrance");
  assert.ok(near(applyAffine(FIRE_FIT, 20554, -4689), 1328, 589), "the teleport");
  assert.deepEqual([600021, 600022, 600023].map(mapOf), ["fire", "fire", "fire"], "every difficulty");
});

test("Draupnir fit puts the recorded spots on the screenshots' arrow", () => {
  const near = (a: { x: number; y: number }, x: number, y: number) => Math.hypot(a.x - x, a.y - y) < 2;
  assert.ok(near(applyAffine(DRAUPNIR_FIT, -27472, 36816), 413, 1609), "the entrance");
  assert.ok(near(applyAffine(DRAUPNIR_FIT, -13281, 20607), 600, 1402), "the teleport");
  assert.deepEqual([600031, 600032, 600033].map(mapOf), ["draupnir", "draupnir", "draupnir"]);
});

test("Vakron Sky Island fit puts the recorded spots on the screenshots' arrow", () => {
  const near = (a: { x: number; y: number }, x: number, y: number) => Math.hypot(a.x - x, a.y - y) < 2;
  assert.ok(near(applyAffine(VAKRON_FIT, 38219, 58095), 1856, 2125), "the entrance");
  assert.ok(near(applyAffine(VAKRON_FIT, 23123, 29333), 1524, 1492), "the teleport");
  assert.deepEqual([600071, 600072, 600073].map(mapOf), ["vakron", "vakron", "vakron"]);
});

test("Ferocious Horn Den fit puts the recorded stops on the screenshots' arrow", () => {
  const near = (a: { x: number; y: number }, x: number, y: number) => Math.hypot(a.x - x, a.y - y) < 11;
  assert.ok(near(applyAffine(HORN_FIT, -13720, 15158), 259.5, 1574), "a stop in the west rooms (height 13,600)");
  assert.ok(near(applyAffine(HORN_FIT, 21909, -2724), 1207.6, 1093.8), "a stop in the east rooms (height -10,700)");
  assert.deepEqual([600091, 600092, 600093].map(mapOf), ["horn", "horn", "horn"]);
});

test("Kibelisk fit puts the recorded run on the screenshots' rooms", () => {
  const near = (a: { x: number; y: number }, x: number, y: number) => Math.hypot(a.x - x, a.y - y) < 22;
  assert.ok(near(applyAffine(KIBELISK_FIT, -51, 22933), 918, 1505), "the entrance, under the arrow");
  assert.ok(near(applyAffine(KIBELISK_FIT, -23343, 17552), 322, 1375), "the first boss's room");
  assert.ok(near(applyAffine(KIBELISK_FIT, 9010, 15644), 1153, 1336), "the east waypoint");
  assert.deepEqual([600063, 600065, 600068, 610062].map(mapOf), ["kibelisk", "kibelisk", "kibelisk", "kibelisk"]);
});

test("soul spots to share: yours (meter or by hand, old ones too), by map, in time order, after the last sent", async () => {
  const { soulsToSend, SOUL_BATCH } = await import("./map.ts");
  const d = (id: string, by: string, atMs: number, extra: Partial<PetDrop> = {}): PetDrop =>
    ({ id, pet: "Agrint", mob: "Thin Testgrint", kind: 1068, mapId: 1110, x: 10, y: 20, z: 0, atMs, by, ...extra });
  const pets = [
    d("kill:Me:3:1", "Me", 3, { mapId: 600091 }),
    d("kill:Me:1:1", "Me", 1),
    d("kill:Friend:2:1", "Friend", 2),            // a friend's file
    d("kill:Me:4:1", "Me", 4, { kind: undefined, mob: "Nobody Knows", pet: "Nobody Knows" }), // nothing names its pet
    d("kill:Me:5:1", "Me", 5, { kind: undefined, mob: "Thin Testgrint" }),  // an old kill: no sure number
    d("kill:Me:5:2", "Me", 5, { kind: 1068, linked: true, mob: "Young Testlink" }), // a number guessed from its other kills
    d("kill:Me:5:3", "Me", 5, { kind: 1016, linked: true, mob: "Testlink" }), // the number you set for its mob
    d("kill:Me:5:4", "Me", 5, { kind: undefined, mob: "Young Testlink", pet: "Young Testlink" }), // never its mob's name as a pet's
    d("kill:Me:6:1", "Me", 6, { mob: "Unknown mob #1068" }),
    d("9f0c3a5e-uuid", "Me", 7, { kind: undefined, mob: undefined, pet: "My Turtle" }), // placed by hand: the name you gave
    d("kill:Me:8:1", "Me", 8, { item: 610531002 }),  // a crystal
    d("kill::9:1", "", 9),                            // a bundled spot
    d("kill:Me:0:1", "Me", 0),                        // sent already
  ];
  const map = { pets, soulsSentMs: 0.5, petNames: { 1077: "My Turtle" }, mobPets: { testlink: 1016 } };
  const out = soulsToSend(map, new Set(["Me"]));
  assert.deepEqual(out.map((b) => [b.mapId, b.souls.map((s) => `${s.atMs}:${s.kind}`), b.lastMs]),
    [[1110, ["1:1068"], 1], [600091, ["3:1068"], 3], [1110, ["5:1016", "6:1068", "7:1077"], 7]]);
  assert.equal(out[2].souls[1].mob, "", "an unknown mob goes without a name");
  const many = Array.from({ length: SOUL_BATCH + 1 }, (_, i) => d(`kill:Me:${i + 1}:1`, "Me", i + 1));
  assert.deepEqual(soulsToSend({ ...map, pets: many, soulsSentMs: 0 }, new Set(["Me"])).map((b) => b.souls.length), [SOUL_BATCH, 1]);
});

test("shared soul spots: cleaned, shown where you have none of that pet, named by their mob", async () => {
  const { cleanSharedSouls, sharedDrops, allDrops, learnSharedKinds, NEAR_DROP } = await import("./map.ts");
  const shared = cleanSharedSouls([
    { mapId: 1110, kind: 1068, mob: "Thin Testgrint", x: 100.4, y: 200, z: 1, n: 2, atMs: 5 },
    { mapId: 1110, kind: 1068, mob: "", x: 100 + NEAR_DROP * 3, y: 200, z: 1, n: 1, atMs: 5 },
    { mapId: 1110, kind: 1077, mob: "Test Turtle", x: 100, y: 200, z: 1, n: 1, atMs: 5 }, // another pet at your spot
    { mapId: 999999, kind: 1068, mob: "x", x: 0, y: 0, z: 0, n: 1 },                        // a map no page shows
    { mapId: 1110, kind: 0, x: 0, y: 0, z: 0 }, { x: 1 },
  ]);
  assert.equal(shared.length, 4);
  const mine: PetDrop = { id: "kill:Me:1:1", pet: "Agrint", mob: "Thin Testgrint", kind: 1068, mapId: 1110, map: "asmodian", x: 150, y: 220, z: 0, atMs: 1, by: "Me" };
  const map = { pets: [mine], sharedSouls: shared, kinds: {} as Record<string, string>, mobPets: {} };
  const got = sharedDrops(map);
  assert.deepEqual(got.map((g) => [g.kind, g.x, g.mob, g.by, g.shared]), [
    [1068, 100 + NEAR_DROP * 3, "Unknown mob #1068", "another player", true],
    [1077, 100, "Test Turtle", "another player", true],
  ]);
  assert.equal(allDrops(map).length, 3);
  learnSharedKinds(map);
  assert.deepEqual(map.kinds, { 1068: "Thin Testgrint", 1077: "Test Turtle" });
  assert.equal(sharedDrops(map)[0].mob, "Thin Testgrint", "a mob learned from the others names the nameless spot");
});

test("a shared spot of a mob under another pet than the one it gives here is left out", async () => {
  const { cleanSharedSouls, sharedDrops } = await import("./map.ts");
  const kill = (i: number): PetDrop => ({ id: `kill:Me:${i}:1`, pet: "Testlink", mob: "Young Testlink", kind: 1016, mapId: 1110, map: "asmodian", x: 0, y: 0, z: 0, atMs: i, by: "Me" });
  const sharedSouls = cleanSharedSouls([
    { mapId: 1110, kind: 1121, mob: "Young Testlink", x: 90_000, y: 0, z: 0, n: 1 }, // someone's wrong number
    { mapId: 1110, kind: 1016, mob: "Young Testlink", x: 90_000, y: 0, z: 0, n: 1 },
    { mapId: 1110, kind: 1121, mob: "Lake Testray", x: 90_000, y: 0, z: 0, n: 1 }, // a mob not known here
  ]);
  const shown = (pets: PetDrop[], mobPets = {}) => sharedDrops({ pets, sharedSouls, kinds: {}, mobPets }).map((d) => `${d.mob}:${d.kind}`);
  assert.deepEqual(shown([kill(1), kill(2), kill(3)]), ["Young Testlink:1016", "Lake Testray:1121"]);
  assert.deepEqual(shown([kill(1), kill(2)]), ["Young Testlink:1121", "Young Testlink:1016", "Lake Testray:1121"], "2 kills are not enough to judge");
  assert.deepEqual(shown([], { "lake testray": 1200 }), ["Young Testlink:1121", "Young Testlink:1016"], "the pet you set for a mob");
});

test("a save from before SOULS_REV sends its spots again and forgets the Worker's", () => {
  const raw = { pets: [{ id: "kill:Me:1:1", pet: "Slink", mob: "Young Slink", kind: 1016, mapId: 1110, x: 0, y: 0, z: 0, atMs: 1, by: "Me" }],
    kinds: { 1016: "Lake Skyray", 1200: "Old Name" }, soulsSentMs: 50, sharedSouls: [{ mapId: 1110, kind: 1016, mob: "x", x: 0, y: 0, z: 0, n: 1 }] };
  const old = cleanMap(raw);
  assert.equal(old.soulsSentMs, 0, "sent again: nothing on the Worker is lost");
  assert.deepEqual(old.sharedSouls, []);
  assert.deepEqual(old.kinds, { 1016: "Young Slink", 1200: "Old Name" }, "your own kills name their number");
  const now = cleanMap(JSON.parse(JSON.stringify({ ...old, soulsSentMs: 50 })));
  assert.equal(now.soulsSentMs, 50, "once");
});

test("a mob is listed under the pet most of its kills gave, not every pet a mispaired kill put it under", () => {
  const d = (i: number, kind: number, mob: string): PetDrop => ({ id: `kill:Me:${i}:1`, pet: mob, mob, kind, mapId: 1110, x: 0, y: 0, z: 0, atMs: i, by: "Me" });
  const drops = [d(1, 1066, "Faded Papis"), d(2, 1066, "Faded Papis"), d(3, 1072, "Faded Papis"), d(4, 1072, "Tog")];
  const list = petList(drops);
  assert.deepEqual(list.find((e) => e.name === "Papis")?.mobs, ["Faded Papis"]);
  assert.deepEqual(list.find((e) => e.name === "Tog")?.mobs, ["Tog"], "Faded Papis not under Tog");
  assert.equal(list.find((e) => e.name === "Tog")?.drops, 2, "its spot still counts");
});

test("a kill shows under the pet its mob gives in the game's data, not the one an old pairing gave it", async () => {
  const { allDrops, gameKind } = await import("./map.ts");
  assert.equal(gameKind("mumu worker"), 1137, "Soul: Mumu Worker = pet 1137, any case");
  const k = gameKind("Vigilant Oculazen");
  assert.equal(k, 1063, "Soul: Vigilant Oculazen = pet 1063 (recorded loots and soul points of 2026-11-22)");
  assert.equal(gameKind("Eternal Moss Crab"), null, "two souls: can't say");
  assert.equal(gameKind("Nobody Knows"), null);
  const d = (mob: string, kind: number): PetDrop => ({ id: `kill:Me:${kind}:1`, pet: mob, mob, kind, mapId: 1110, map: "asmodian", x: 0, y: 0, z: 0, atMs: 1, by: "Me" });
  const shown = allDrops({ pets: [d("Mumu Worker", 1063), d("Nobody Knows", 1063)], sharedSouls: [], kinds: {}, mobPets: {} });
  assert.notEqual(shown[0].kind, 1063, "a Mumu Worker gives no Oculazen soul");
  assert.equal(shown[0].kind, 1137);
  assert.equal(shown[0].pet, "Mumu Worker");
  assert.equal(shown[1].kind, 1063, "a mob the data doesn't list keeps its number");
});
