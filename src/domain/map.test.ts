// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { foundOn, invertAffine, mapOf, onMap, mergeDrops, lootKind, takeLoots, takeSouls, soulOf, unknownMob, type LootKill, type SoulKill, petHome, petList, readDropsFile, dropsFile, type PetDrop, BUNDLED_DROPS, takeBundledDrops, mapOfMob, linkKinds } from "./map.ts";
import { readFileSync } from "node:fs";
import { ABYSS_FIT, ELYOS_FIT, applyAffine, bearing, BUNDLED_FIT, climb, onRadar, cleanMap, emptyMap, takeCubes, clusters, fitAffine, fitError, fitView, toImage, toScreen, zoomAt, type MapPoint } from "./map.ts";

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
