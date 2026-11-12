// Winter theme use cases: the Advent calendar's doors (src/domain/holiday.ts).
import { openDoor } from "../domain/holiday.ts";
import type { AppData } from "../domain/types.ts";

export function openAdventDoor(data: AppData, day: number, now: number) { data.advent = openDoor(data.advent, day, now); }
