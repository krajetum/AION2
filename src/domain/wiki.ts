// Wiki: Expeditions (Exploration, Conquest, Hard) and Transcendence, global/EU build. Pure data: tested with `npm test`.
// Sources (checked 2026-10-30): aion2.wiki.fextralife.com/Expeditions (2026-10-09), couga54.github.io/aion2-guides (2026-10-10),
// timesaver.gg (2026-10-17/20/22), expcarry.com Krao Cave Hard (2026-10-27), gamesfuze.com, games.gg (2026-10-05).
// Guides disagree often: a value only one site gives, or given differently, is `unconfirmed` with the alternatives in the note.
// Drop rates from boosting sites are never used. Update by hand after a patch; KR-only values stay out unless marked.
import { SEASONAL, WEEKLY } from "./season.ts";

export const VERIFIED = "2026-10-30";

/** A value; the object form = not confirmed (one source only, or sources disagree), `note` says why. */
export type Val = string | { v: string; note: string };
export const val = (x: Val) => (typeof x === "string" ? x : x.v);
export const doubt = (x: Val | undefined) => (x && typeof x !== "string" ? x.note : "");
const maybe = (v: string, note: string): Val => ({ v, note });

export type Kind = "expedition" | "transcendence";
export interface Source { name: string; url: string; date: string }
export interface Mode {
  name: string; // "Exploration" / "Conquest" / "Hard" / "Stage 1"…
  level: Val;
  itemLevel: Val;
  party: string;
  odyle: number; // Odyle Energy to open the reward cube
  kina?: Val; // per full cube (final + 2 mini-bosses)
  guaranteed?: Val; // pick-one reward after N cube claims
  frenzy?: Val; // boss enrage timer
  revives?: Val;
  timeLimit?: Val;
  drops: string[];
  changes?: Val[]; // what differs from the mode before it
}
export interface Boss { name: Val; role: "mini" | "gate" | "final"; mechanics: string[] }
export interface Dungeon {
  id: string;
  name: string;
  kind: Kind;
  tier?: number; // Conquest stars
  summary: string;
  modes: Mode[];
  bosses: Boss[];
  gear: string[]; // gear sets, grade, slots
  other: Val[]; // non-gear drops worth knowing
  tips: string[];
  cp?: Val; // recommended Combat Power, player reports only
  sources: Source[];
}
export interface Section { title: string; lines: Val[] }

const FEX: Source = { name: "Fextralife wiki: Expeditions", url: "https://aion2.wiki.fextralife.com/Expeditions", date: "2026-10-09" };
const COUGA: Source = { name: "AION 2 Guides: dungeon boss mechanics (BIGSKALA walkthrough)", url: "https://couga54.github.io/aion2-guides/en/dungeons/", date: "2026-10-10" };
const TS_REQ: Source = { name: "Timesaver: expedition requirements", url: "https://timesaver.gg/blog/aion-2-expedition-requirements-guide", date: "2026-10-17" };
const TS_HARD: Source = { name: "Timesaver: Hard mode expeditions", url: "https://timesaver.gg/blog/aion-2-hard-mode-expedition-guide", date: "2026-10-22" };
const TS_TR: Source = { name: "Timesaver: Transcendence", url: "https://timesaver.gg/blog/aion-2-transcendence-guide", date: "2026-10-20" };
const EXP_KRAO: Source = { name: "Expcarry: Krao Cave Hard", url: "https://expcarry.com/aion-2-krao-cave-hard-guide", date: "2026-10-27" };
const GF_TR: Source = { name: "Gamesfuze: Transcendence dungeons", url: "https://gamesfuze.com/guides/aion-2-full-transcendence-dungeons-guide/", date: "2026-10-01" };
const GF_DRAUP: Source = { name: "Gamesfuze: Draupnir", url: "https://gamesfuze.com/guides/aion-2-draupnir-cave-dungeon-guide-all-bosses-mechanics-and-rewards/", date: "2026-09-30" };
const GG_FIRE: Source = { name: "games.gg: Fire Temple", url: "https://games.gg/aion-2/guides/aion-2-fire-temple-expedition/", date: "2026-10-05" };

const P15 = "1–5", P25 = "2–5";
const COMMON = "Earth (Common) and Vagabond (Rare) gear, Refining Stones, Soul Codex, Amplify Stone Fragment (Unique) by chance";
const CONQ_MATS = "Balaur's Essence; higher tiers add Wrathful Mind, Wrathful Will, Wrathful Ego";
const kina = (final: number, mini: number) => `${((final + 2 * mini) / 1000).toFixed(0)}k (final ${final / 1000}k + 2 × ${mini / 1000}k)`;
// Hard mode, patch of 2026-10-21 (CEST): only these two dungeons on global.
const hard = (dungeon: string): Mode => ({
  name: "Hard", level: "45", itemLevel: "2,600", party: P15, odyle: 40,
  kina: maybe("more than Conquest", "Patch notes say more Kina, no amount"),
  guaranteed: maybe(`28 claims: pick one`, "Client data quoted by one guide"),
  frenzy: "4 min", revives: "3 per player", timeLimit: maybe("60 min", "One guide only"),
  drops: [`Ariel Fragment: ${dungeon} (Bound), for the Ariel Daevanion Board (Hard only)`,
    "Philosopher's Stone: Revelation (Bound): by chance, or as the guaranteed pick",
    "All Unique crafting materials (Wrathful Mind, Will, Ego)", "Expedition Hero Artwork (chance, collector achievement)"],
  changes: ["Bosses level 68", "4-minute boss Frenzy timer", "3 revives per player", "Ariel Fragments drop only here"],
});

export const DUNGEONS: Dungeon[] = [
  {
    id: "krao", name: "Krao Cave", kind: "expedition", tier: 1,
    summary: "First expedition (Exploration from level 20). Conquest ★1 drops Rupture weapons and Berk accessories; Hard mode since 2026-10-21.",
    modes: [
      { name: "Exploration", level: "20", itemLevel: "200", party: P15, odyle: 20, kina: kina(25000, 25000),
        guaranteed: "1 claim: Red Agate armor piece (Legend)",
        drops: ["Red Agate (Legend) weapons and armor", "Incomplete Test Subject Ring (mini-bosses)", "Frontline (Rare) gear"] },
      { name: "Conquest", level: "45", itemLevel: "700", party: P15, odyle: 40, kina: kina(70000, 65000),
        guaranteed: "14 claims: Gear Change Voucher: Krao Cave, or a Berk accessory (Unique)",
        drops: ["Rupture (Unique) weapons", "Berk (Unique) accessories: Ring, Earrings, Necklace", "Division (Legend) weapons, armor, accessories",
          "Sealed Will Guard (mini-bosses)", "Sealed Black Fragment Wings", "Artwork: Krao"],
        changes: ["Weekly cube count applies", "Unique gear and Sealed Wings"] },
      hard("Krao"),
    ],
    bosses: [
      { name: "Enhanced Harcon", role: "mini", mechanics: ["Jumps to the middle and fires two laser waves at 75% and 35% HP", "Places four pulsing orbs and ground explosions: leave the circles",
        "Leaps at a target, summons a Krao Giant Test Subject"] },
      { name: "Neglected Gadioton", role: "mini", mechanics: ["Repeated-hit line attack on single players", "Pulls everyone in, then a close-range knockdown: dodge out after the pull"] },
      { name: "Krao Seal Guardian", role: "gate", mechanics: ["Required: opens the sealed passage to Berk (the two bosses above are side routes)"] },
      { name: "Ultimate Berk", role: "final", mechanics: [
        "Wave of Fury: flies to the middle, four rocks appear at the edges; hide behind a rock (green shadow) within ~5 s or die",
        "Pizza-slice hit then a spin at one player that bleeds: stay off its path, dodge or use an invulnerability",
        "Claws raised = Stagger check (near 50% on Hard): break the bar together or the group dies; broken = free damage",
        "Rush lane, Wrathful Blade (bleed), Roar (stun): watch the cast bar"] },
    ],
    gear: ["Rupture (Unique): all 8 weapons", "Berk (Unique): Ring, Earrings, Necklace", "Division (Legend): weapons, armor, accessories", "Red Agate (Legend, Exploration)"],
    other: [COMMON, CONQ_MATS],
    tips: ["Save stagger skills for Berk's claws", "Krao Hard is reported as the easier Hard: one stagger check"],
    cp: maybe("140k–160k for Hard", "Launch-day player reports, not official"),
    sources: [FEX, COUGA, TS_REQ, TS_HARD, EXP_KRAO],
  },
  {
    id: "draupnir", name: "Draupnir", kind: "expedition", tier: 1,
    summary: "Bakarma's lair: Bakarma armor and Guard (Unique). Exploration and Conquest drop the same sets; Hard mode since 2026-10-21.",
    modes: [
      { name: "Exploration", level: "45", itemLevel: "700", party: P15, odyle: 40, kina: kina(40000, 40000),
        guaranteed: "3 claims: Bakarma armor piece (Unique)",
        drops: ["Bakarma (Unique) Guard and armor", "Anguish (Legend) weapons, armor, Ring", "Lakshmi Necklace, Saraswati Earrings (mini-bosses)"] },
      { name: "Conquest", level: "45", itemLevel: "700", party: P15, odyle: 40, kina: kina(70000, 65000),
        guaranteed: "14 claims: Gear Change Voucher: Draupnir, or a Bakarma armor piece",
        drops: ["Same sets as Exploration", "Sealed Blue Wave Wings", "Artwork: Draupnir"], changes: ["Weekly cube count applies", "More Kina, Sealed Wings"] },
      { ...hard("Draupnir"), changes: [...hard("Draupnir").changes!, "Bakarma: whirlpools at 75% and extra projectiles at 35% (Sep guide, before the global Hard; unconfirmed)"] },
    ],
    bosses: [
      { name: "Predator Saraswati", role: "mini", mechanics: ["Blue poison puddles: leave at once; ranged stay at the edges",
        "Roots and poisons a player, then a poison cone: if it hits, they turn into a larva; healer covers them", "Three circles that leave poison puddles"] },
      { name: "Phantasmal Lakshmi", role: "mini", mechanics: ["Aerial circle: block or dodge (Shift), don't get stunned together",
        "Teleports behind a player, then small circles and falling projectiles: keep moving", "~50% HP: a healing minion spawns, kill it first"] },
      { name: "Transcendent Bakarma", role: "final", mechanics: [
        "Screen goes black → waves roll out: jump each wave (Space) to reach the safe zone next to him; gap-closers help",
        "75% and 35% HP: party scattered, then Stagger check: break the bar fast or the group wipes",
        "Dive: small circles track each player, then a big hit when he resurfaces: spread, keep moving, leave the big area",
        "Body slam in front; after 75% he jumps away: stay put, avoid the outgoing ring, he comes back",
        "Wave phase repeats near the end with tornadoes on the water"] },
    ],
    gear: ["Bakarma (Unique): Guard, armor", "Anguish (Legend): weapons, armor, Ring", "Lakshmi Necklace, Saraswati Earrings"],
    other: [COMMON, CONQ_MATS],
    tips: ["Time the wave jumps slightly early", "Reported as the harder Hard: you reposition into each stagger check"],
    cp: maybe("140k–160k for Hard", "Launch-day player reports, not official"),
    sources: [FEX, COUGA, GF_DRAUP, TS_HARD],
  },
  {
    id: "urugugu", name: "Urugugu Canyon", kind: "expedition", tier: 2,
    summary: "Conquest ★2: Aulamus weapons and accessories (Unique). At least 2 players.",
    modes: [
      { name: "Exploration", level: "28", itemLevel: "300", party: P25, odyle: 20, kina: kina(30000, 30000),
        guaranteed: "1 claim: Faith armor piece (Legend)",
        drops: ["Faith (Legend) weapons and armor", "Brave Warrior Earrings (mini-bosses)", "Intruder (Rare) gear"] },
      { name: "Conquest", level: "45", itemLevel: "1,400", party: P25, odyle: 40, kina: kina(100000, 100000),
        guaranteed: "21 claims: Gear Change Voucher: Urugugu Canyon, or an Aulamus accessory",
        drops: ["Aulamus (Unique) weapons and accessories", "Divine Canyon (Legend) weapons, armor, accessories", "Turbulence Guard (mini-bosses)",
          "Sealed Ancient Aullaeu Wings", "Skin: Divine Auldor Mask", "Artwork: Urugugu"] },
    ],
    bosses: [
      { name: "Guardian Captain Raur", role: "mini", mechanics: ["Lowers his shield → damage zone under him: stop attacking and step away until it ends"] },
      { name: "Judge Urahum", role: "mini", mechanics: ["Enrages: faster movement and attacks, use defensives"] },
      { name: "Divine Auldor", role: "final", mechanics: ["Winds in front: stand behind him; if caught he lifts and slams you",
        "Marks a player, arrows close in from four sides: the group stacks in the circle to split the hit",
        "Phase 2: same pattern from the middle with a vortex around the arena"] },
    ],
    gear: ["Aulamus (Unique): weapons, accessories", "Divine Canyon (Legend): weapons, armor, accessories", "Faith (Legend, Exploration)"],
    other: [COMMON, CONQ_MATS],
    tips: ["Never stand in front of Auldor"],
    sources: [FEX, COUGA, TS_REQ],
  },
  {
    id: "vakron", name: "Vakron Sky Island", kind: "expedition", tier: 2,
    summary: "Conquest ★2: Vakron armor and Guard (Unique). A root debuff builds while you run: clear it at fountains.",
    modes: [
      { name: "Exploration", level: "45", itemLevel: "1,400", party: P25, odyle: 40, kina: kina(50000, 50000),
        guaranteed: "3 claims: Vakron armor piece (Unique)",
        drops: ["Vakron (Unique) Guard and armor", "Unyielding (Legend) weapons, armor, Necklace, Earrings", "Wind Forest Ring (mini-bosses)"] },
      { name: "Conquest", level: "45", itemLevel: "1,400", party: P25, odyle: 40, kina: kina(100000, 100000),
        guaranteed: "21 claims: Gear Change Voucher: Vakron Sky Island, or a Vakron armor piece",
        drops: ["Same sets as Exploration", "Sealed Forest Spirit Wings", "Artwork: Vakron Sky Island"] },
    ],
    bosses: [
      { name: "Tiere", role: "mini", mechanics: ["Kill the flower and move together so the poison stays behind",
        "Retreats to the middle and poisons all but a small circle: kill the flower inside it to clean the area"] },
      { name: "Thamon", role: "mini", mechanics: ["Stone circles turn you to stone: break the stone fast before a huge area hit",
        "Phase 2: red glow = melee stop, purple = casters stop (wrong hits heal him a lot)", "After him: carry four spheres to the matching statues"] },
      { name: "Vakron", role: "final", mechanics: ["Seeds a player who roots in spikes and spreads it: step out slightly so others free them",
        "Three rings: jump them, stand between the red lines, glide over the last blast",
        "Red floor: three waves then a blast; jump each wave, glide under the blast",
        "Red rock: break it as a group and leave the circle through the gap, or die"] },
    ],
    gear: ["Vakron (Unique): Guard, armor", "Unyielding (Legend): weapons, armor, Necklace, Earrings", "Wind Forest Ring"],
    other: [COMMON, CONQ_MATS, "Debuff on the way: level 3 roots you; supports hit the roots"],
    tips: ["Bring a glider-ready party: two Vakron mechanics need a glide"],
    sources: [FEX, COUGA, TS_REQ],
  },
  {
    id: "fire", name: "Fire Temple", kind: "expedition", tier: 3,
    summary: "Conquest ★3: Enraged Kromede weapons and accessories (Unique). Fire-wall maze at Kromede.",
    modes: [
      { name: "Exploration", level: "35", itemLevel: "500", party: P15, odyle: 30, kina: kina(35000, 35000),
        guaranteed: "1 claim: Judicator armor piece (Legend)",
        drops: ["Kromede (Unique) weapons", "Judicator (Legend) armor and Earrings", "Silent Necklace (mini-bosses)", "Intruder (Rare) gear"] },
      { name: "Conquest", level: "45", itemLevel: "2,100", party: P15, odyle: 40, kina: kina(140000, 130000),
        guaranteed: "28 claims: Gear Change Voucher: Fire Temple, or an Enraged Kromede accessory",
        drops: ["Enraged Kromede (Unique) weapons and accessories", "Corrupted Judicator (Legend) weapons, armor, Necklace",
          "Ignus Guard, Murute Earrings (mini-bosses)", "Sealed Kromede Wings", "Artwork: Fire Temple"] },
    ],
    bosses: [
      { name: "Red Spark Ignus", role: "mini", mechanics: ["75%: when marked, go to the edge so the lava puddles stay off the centre",
        "65%: dodge the big donut, then spread a little against chain jumps", "Triple circles, tank dash with explosion, star-shaped lines"] },
      { name: "Black Smoke Murute", role: "mini", mechanics: ["Arm slams and delayed circles: block or perfect-dodge, the blast comes after the visual",
        "50%: three expanding stomp waves, block or perfect-dodge each", "Tank jump, dash with boulder throw, fan lines"] },
      { name: "Kromede's Desire", role: "final", mechanics: [
        "Bow raised: arrows rain, keep moving; bow lowered: debuffing balls, then leaps between players and a 3-step leap",
        "Fire walls at 75% and 25%: one gap per wall that shifts, 7 waves; fireballs join on the second wall (turn early with high ping)",
        "50%: clone lines and a rear fan: block or perfect-dodge; frontal sweeps: stand behind her",
        "Clones rush in and hit together: dash out; after the second wall they shoot from the edges"] },
    ],
    gear: ["Enraged Kromede (Unique): weapons, accessories", "Corrupted Judicator (Legend): weapons, armor, Necklace", "Kromede (Unique) weapons and Judicator (Legend) in Exploration"],
    other: [COMMON, CONQ_MATS, maybe("Hard mode: not on global yet", "KR has it (2,600 ilvl, clones from 75%, teleport at 25% with 14 s to the safe circle, Sync Stone fragments)")],
    tips: ["Bring yellow potions for debuffs; Chanter/Cleric take cleanses"],
    sources: [FEX, COUGA, GG_FIRE],
  },
  {
    id: "horn", name: "Ferocious Horn Den", kind: "expedition", tier: 3,
    summary: "Conquest ★3: Nuakum armor and Guard (Unique). Exploration needs the same 2,100 item level.",
    modes: [
      { name: "Exploration", level: "45", itemLevel: "2,100", party: P15, odyle: 40, kina: kina(60000, 60000),
        guaranteed: "3 claims: Nuakum armor piece (Unique)",
        drops: ["Nuakum (Unique) Guard and armor", "Black Claw (Legend) weapons, armor, Earrings, Ring", "Fera Necklace (mini-bosses)"] },
      { name: "Conquest", level: "45", itemLevel: "2,100", party: P15, odyle: 40, kina: kina(140000, 130000),
        guaranteed: "28 claims: Gear Change Voucher: Ferocious Horn Den, or a Nuakum armor piece",
        drops: ["Same sets as Exploration", "Sealed Dark Veil Wings", "Artwork: Ferocious Horn Den"] },
    ],
    bosses: [
      { name: "Watchdog Kwapo", role: "mini", mechanics: ["Area hits and jumps; collect the fireballs fast (each slows you), uncollected ones explode",
        "Jump the wave from the middle"] },
      { name: "Necromancer Duanka", role: "mini", mechanics: ["Totem room: grab bombs from the stairs (three at a time) to clear adds",
        "Four souls: one player (ranged) takes the orb to damage them", "Marked player: big circle, supports share it inside",
        "Final pull: run out and dodge the souls flying to him"] },
      { name: "Ferocious Horn Nuakum", role: "final", mechanics: [
        "Illusion leap: marks and roots a player; small circle = supports run in, big = run out; someone stands in the illusion's path (2 jumps, then 3)",
        "Orb in the middle pulls players: the marked player runs so the strike passes through the orb; 3 of 4 must hit it"] },
    ],
    gear: ["Nuakum (Unique): Guard, armor", "Black Claw (Legend): weapons, armor, Earrings, Ring", "Fera Necklace"],
    other: [COMMON, CONQ_MATS],
    tips: ["Assign the orb runner and the illusion blocker before the pull"],
    sources: [FEX, COUGA, TS_REQ],
  },
  {
    id: "deus", name: "Deus Research Base", kind: "transcendence",
    summary: "Four-stage challenge for Arcana (Bell, Compass, Chalice). No gear. Kill mobs to fill the progress counter that opens the final boss.",
    modes: [1600, 1900, 2200, 2500].map((il, i) => trStage(i + 1, il)),
    bosses: [
      { name: "Gelcos", role: "mini", mechanics: ["Whip stacks a debuff: at 3 stacks you explode with lightning",
        "Marks a player and charges twice, leaving electric puddles: the marked player drags him to a corner",
        "Ground pound zones, then the great whip: run out of the ring or block it"] },
      { name: "Nazmun", role: "mini", mechanics: ["Rotating lasers and consecutive beams: jump them, don't step back in after the first",
        "Bombs leave zones; jump the electric threads from three devices", "Ticking zone on a marked player: carry it away from the group"] },
      { name: "Atiel", role: "final", mechanics: [
        "Chains: between players = spread; to the platform = stack on the chained player; blue to Atiel = stay close",
        "Platform shrinks over time; waves stun briefly (jump/dodge), wind pushes you to the exploding edge",
        "Falling off can't be revived",
        "~20% HP: last Stagger while copies rush across: break the bar or the platform is destroyed and the run fails"] },
    ],
    gear: ["No gear"],
    other: ["Arcana: Bell, Compass, Chalice (of Vigor / of Magic)", "Lesser and Intermediate Manastones, Soulstones (Intermediate at the top stage)",
      "Final boss: Silentium ×10, Enhance Stone ×2,000", "Season ranking points"],
    tips: ["Save stagger skills for Atiel's last phase", "Leaving mid-run fails the dungeon for the whole group"],
    sources: [FEX, COUGA, TS_TR, GF_TR],
  },
  {
    id: "arkanis", name: "Shattered Arkanis", kind: "transcendence",
    summary: "Four-stage challenge for Arcana (Mirror, Parchment, Chalice). No gear. Activate the obelisk to respawn closer after a wipe.",
    modes: [1600, 1900, 2200, 2500].map((il, i) => trStage(i + 1, il)),
    bosses: [
      { name: "Siliator of Deceit", role: "mini", mechanics: ["~75%: two marked players line up their red bars so the chakrams collide in an X near the boss, then stop",
        "~60%: chakrams placed around the arena return along their paths: stand between the paths",
        "Line on the furthest player, circle on the tank, frontal + donut"] },
      { name: "Ruthilis of Pain", role: "mini", mechanics: ["Quadrant lightning, clockwise, up to 3 puddles: move to the next safe quarter",
        "Arena turns red: run to her; lightning hits leave rings to jump", "Jumps to the furthest player with a knock-down donut (from 95%)",
        "~50%: guillotine line with bleed: spread"] },
      { name: "Talisra of the Void", role: "final", mechanics: [
        "~75% and ~30%: purple/white droplets: pre-assign colours, take your own (the wrong one stuns)",
        "Domes: stand under your colour's dome for each colour she shows (2 colours, then 3); wrong dome can kill",
        "Light Spear: four spears, ~6 s cast: destroy the white one in front (20 hits) or the group dies",
        "~50% Diamond Jail on a player: aim three spears at the cage, stop hitting the boss",
        "White wave out, purple wave in: jump both"] },
    ],
    gear: ["No gear"],
    other: ["Arcana: Mirror, Parchment, Chalice (of Vigor / of Magic)", "Lesser and Intermediate Manastones, Soulstones (Intermediate at the top stage)",
      "Final boss: Silentium ×10, Enhance Stone ×2,000", "Season ranking points"],
    tips: ["Safest spot against the rotating walls: the middle, by the pillar", "Agree on droplet colours before the pull"],
    sources: [FEX, COUGA, TS_TR, GF_TR],
  },
];

function trStage(n: number, itemLevel: number): Mode {
  return {
    name: `Stage ${n}`, level: "45", itemLevel: itemLevel.toLocaleString("en-US"), party: P25, odyle: 40,
    kina: `${(100 + 20 * (n - 1))}k per boss`,
    drops: [n >= 3 ? "Arcana up to Unique" : "Arcana below Unique", ...(n === 4 ? ["Unique Chalice (stage 4 only)", "Intermediate Soulstones"] : [])],
    changes: n === 1 ? ["Unlock the next stage by clearing this one"] : [maybe(`Atiel level ${56 + 4 * (n - 1)}`, "One guide, Deus Research Base")],
  };
}

/** Shared rules, for the Mechanics page. */
export const MECHANICS: Section[] = [
  { title: "Expedition types", lines: [
    "Exploration: from level 20, no weekly limit, Legend gear and a few Unique pieces",
    "Conquest: level 45, three tiers (★1 700 · ★2 1,400 · ★3 2,100 item level), Unique gear, Sealed Wings, more Kina",
    "Hard: Krao Cave and Draupnir only (2026-10-21), 2,600 item level, 4-min Frenzy, 3 revives, Ariel Fragments",
    "Transcendence: level 45, 2–5 players, 4 stages (1,600 / 1,900 / 2,200 / 2,500), Arcana instead of gear",
    "Unlock: episode quest at level 10 (Elyos: Wind Breeze Merchants · Asmodians: Daeva in a Dream)"] },
  { title: "Reward cube and Odyle Energy", lines: [
    "Each run ends with one cube holding the final boss's and both mini-bosses' loot: opening it costs Odyle Energy (20/30/40 in Exploration, 40 elsewhere)",
    "Odyle Energy: +15 every 3 h (120/day), auto-recharge up to 560 (840 with the Quai Membership); basic energy is spent first",
    "Odyle Energy (Bound) item = 40, Small = 10; item energy stacks up to 2,000",
    maybe("Membership: a second open of the same cube", "One guide only"),
    "Kina from cubes drops once a server's weekly play count passes some thresholds (not published)"] },
  { title: "Weekly limits (Conquest, Hard, Transcendence)", lines: [
    maybe("Remaining Unobtained Cube Count: 10 per week, per server, reset Wednesday", "Fextralife 2026-10-09; Timesaver (2026-10-20) says 1 reward count every 12 h, banked up to 14, and 28 final-boss kills a week"),
    "A clear lowers the count even if you skip the cube: have the Energy before you go in",
    "At 0 you can't enter Conquest or Transcendence; Exploration has no limit",
    "No re-entry cooldown"] },
  { title: "Guaranteed rewards", lines: [
    "After N cube claims per dungeon and mode you pick one item; collect it before going in again",
    "Exploration: 1 claim (Krao, Urugugu, Fire Temple: a Legend armor piece) or 3 claims (Draupnir, Vakron, Horn Den: a Unique armor piece)",
    "Conquest: 14 (★1) · 21 (★2) · 28 (★3) claims: a Gear Change Voucher or a Unique piece",
    maybe("Hard: 28 claims", "Client data, one guide"),
    "Transcendence: none"] },
  { title: "Final boss rolls", lines: [
    "Exploration: Silentium ×4, Enhance Stone 1,000–1,500",
    "Conquest: Silentium ×7, Enhance Stone ×2,000",
    "Transcendence: Silentium ×10, Enhance Stone ×2,000",
    "Any boss: Soul Codex, Amplify Stone Fragment (Unique) by chance"] },
  { title: "Gear Change Voucher and Sealed Wings", lines: [
    "Gear Change Voucher: one per dungeon, swaps a piece from that dungeon's set",
    "Sealed Wings (Conquest): Substance Morph material for wings",
    "Artwork per dungeon; Expedition Hero Artwork only in Hard (collector achievement)"] },
  { title: "Hard mode", lines: [
    "Item level 2,600 (patch notes); no Combat Power requirement",
    "Boss Frenzy 4 min, 3 revives per player",
    maybe("Revive limit per run or per boss: not stated", "Unknown whether Resurrection Spiritstones count"),
    "Ariel Fragments → Ariel Daevanion Board: 100 fragments = 1 Daevanion Crystal: Ariel (Bound), max 30 per character; extra fragments → Enhance Stones",
    "Philosopher's Stone: Revelation (Bound): chance drop or guaranteed pick"] },
  { title: "Transcendence", lines: [
    "Mobs and bosses fill a progress counter: the final boss stays locked until it is full",
    "Each clear is ranked by speed and deaths (S, A, B…)",
    "Leaving mid-run fails the dungeon for the whole group",
    "Arcana: 5 card slots, add an Empyrean Lord stat and class skill levels; grades Common → Unique (Unique from stage 3)",
    "Sets: 4 × \"of Vigor\" = +150 PvE Attack above 70% HP · 4 × \"of Magic\" = +1,000 PvE Defense above 50% MP",
    "Ignore guides quoting stage 7 or 10: that is the Korean structure"] },
  { title: "Stagger and Frenzy", lines: [
    "Stagger bar: fill it with stagger skills before the timer ends; broken = boss stunned, free damage; failed = usually a wipe",
    "Save stagger skills for the scripted checks instead of spending them on cooldown",
    "Frenzy: the boss enrages when its timer runs out (4 min in Hard)"] },
];

/** Season Oath Coin missions for a dungeon (from season.ts, never copied). */
export const seasonMissions = (name: string) =>
  [...SEASONAL.map((m) => ({ ...m, weekly: false })), ...WEEKLY.map((m) => ({ ...m, weekly: true }))].filter((m) => m.name.startsWith(name));

/** Lowest–highest item level over the modes, e.g. "200–2,600". */
export function itemLevelRange(d: Dungeon) {
  const n = d.modes.map((m) => Number(val(m.itemLevel).replace(/,/g, ""))).filter((x) => !Number.isNaN(x));
  const f = (x: number) => x.toLocaleString("en-US");
  return Math.min(...n) === Math.max(...n) ? f(n[0]) : `${f(Math.min(...n))}–${f(Math.max(...n))}`;
}
