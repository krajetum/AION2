// Initial data taken from the Google Sheet. Editable later from the app.
import type { Cadence, Goal, Task } from "./types.ts";

type Row = [category: string, name: string, goals?: Goal[], extra?: Partial<Task>];

const levels: Goal[] = [{ label: "Level", target: 50, step: 5 }];
const vp = (v: number, p: number): Goal[] => [{ label: "Wins", target: v }, { label: "Entries", target: p }];

const SEED: Record<Cadence, Row[]> = {
  daily: [
    ["Buy", "Cloud Merchant (Theostones)", undefined, { note: "Restocks every hour · not for early game" }],
    ["Content", "Duty Quests (Energy/Tickets)", [{ target: 5 }]],
    ["Content", "Pet/Kina Farm", undefined, { note: "Daily cap 1M Kina" }],
  ],
  weekly: [
    ["Content", "Daily Dungeon"],
    ["Content", "Ascension Trial"],
    ["Content", "Shugo Keys"],
    ["Content", "Odyle Energy"],
    ["Content", "Boss Invasion"],
    ["Content", "Nightmare Tickets", undefined, { note: "1x under 1 min" }],
    ["Content", "Arena of Solitude", vp(30, 10)],
    ["Content", "Arena of Cooperation", vp(30, 10)],
    ["Content", "Abyss Siege + Corridors"],
    ["Content", "Sanctuary", undefined, { enabled: false, note: "Not in the game yet" }],
    ["Season Quests", "Battlefield", [{ target: 3 }]],
    ["Season Quests", "Ascension Trial", [{ target: 3 }]],
    ["Season Quests", "Arena", vp(5, 10)],
    ["Season Quests", "Abyss mob", [{ target: 2000 }]],
    ["Season Quests", "Abyss kill/assist", [{ target: 20 }]],
    ["Season Quests", "Abyss Siege", [{ label: "Entries", target: 2 }, { label: "Wins", target: 1 }]],
    ["Season Quests", "Abyss Time"],
    ["Season Quests", "Abyss Boss", [{ target: 5 }]],
    ["Season Quests", "Abyss Bosses", [{ label: "Kaira", target: 10 }, { label: "Argo", target: 3 }, { label: "Nahma", target: 1 }]],
    ["Season Quests", "Abyss Odyle Gathering", [{ target: 30 }]],
    ["Season Quests", "Transcendence Dungeon", [{ label: "Cleared", target: 10 }, { label: "No deaths", target: 3 }, { label: "Under 7 min", target: 1 }]],
    ["Season Quests", "Transcendence Extract Arcana", [{ target: 10 }]],
    ["Season Quests", "Nightmare Bosses", [{ target: 10 }]],
    ["Season Quests", "Nightmare Boss under 1 min", [{ target: 1 }]],
    ["Season Quests", "Elyos Kill Verteron", levels],
    ["Season Quests", "Elyos Kill Altgard", levels],
    ["Buy", "Odyle Energy (Wind Breeze Shop)", [{ target: 20 }]],
    ["Buy", "Soul Crystal (Wind Breeze Shop)", [{ target: 1000 }]],
    ["Buy", "Abyss Command Stones (Abyss Command Merchant)"],
    ["Buy", "Command Algard Quest Scroll (Command Merchant)"],
    ["Buy", "Soul Codex (Nightmare Shop)", [{ target: 5 }]],
    ["Buy", "Soul Codex Reset (Nightmare Shop)", [{ target: 3 }]],
    ["Buy", "Potential Stone (Abyss Shop)", [{ target: 2 }]],
    ["Buy", "Lesser Abyssal Manastone (Abyss Shop)", [{ target: 50 }]],
    ["Buy", "Lesser Abyssal Soulstone (Abyss Shop)", [{ target: 50 }]],
    ["Morph", "Odyle Energy"],
    ["Morph", "Merit Chests (Abyss Proof)"],
    ["Morph", "Silver Medals"],
  ],
  monthly: [
    ["Buy (Shugo Shop)", "Radiant Odyle", [{ target: 3 }]],
    ["Buy (Shugo Shop)", "Soul Crystal", [{ target: 30 }]],
  ],
};

export function seedTasks(): Task[] {
  const out: Task[] = [];
  for (const [cadence, rows] of Object.entries(SEED) as [Cadence, Row[]][]) {
    rows.forEach(([category, name, goals, extra], i) => {
      out.push({ id: `${cadence}-${i}`, cadence, category, name, enabled: true, order: i, goals, ...extra });
    });
  }
  return out;
}

/** Id of the seeded Cloud Merchant task (used for the hourly reminder). */
export const CLOUD_MERCHANT_ID = "daily-0";
