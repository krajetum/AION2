// Memes: files in src/memes/<kind>/. win/empty/mascot: one picked per launch so they don't swap on updates.
const FILES = import.meta.glob<string>("../memes/*/*.{gif,webp,png,jpg}", { eager: true, query: "?url", import: "default" });
const of = (kind: string) => Object.entries(FILES).filter(([path]) => path.startsWith(`../memes/${kind}/`)).map(([, url]) => url);
const pick = (l: string[]) => l[Math.floor(Math.random() * l.length)];

export const MEME = { win: pick(of("win")), empty: pick(of("empty")), mascot: pick(of("mascot")) };
/** Reaction on check: picked fresh every time. */
export const REACT = of("react");
