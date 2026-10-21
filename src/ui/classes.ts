// Class emblems (the game's own art, as A2Tools DPS Meter ships them: public/assets/<class>.png,
// GPL-3.0 repo, see NOTICE.md), by the English class name the engine sends.
const files = import.meta.glob<string>("./classes/*.png", { eager: true, query: "?url", import: "default" });
export const classIcon = (job: string): string | undefined => files[`./classes/${job}.png`];
