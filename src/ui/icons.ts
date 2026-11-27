// Icons: Lucide (@lucide/svelte, ISC), the line style of the whole UI. ICON maps each page (tab id) and each action to
// its component: `<ICON.close />`, or `{@const I = ICON[t]}<I />`. CSS sizes them (16px in buttons and nav).
import type { Component } from "svelte";
import {
  Bell, BookOpen, CalendarDays, CalendarRange, ChartColumn, ChevronRight, Coins, Crown, Download, Hammer, House,
  Map as MapIcon, MapPin, Move, Newspaper, PanelRight, PawPrint, Play, ScrollText, Search, Settings, Sparkles, Sun, Swords,
  Timer, Trophy, Upload, Users, UserSearch, Volume2, VolumeX, X,
  Activity, Brain, CircleDot, Clover, Compass, Crosshair, Droplet, Dumbbell, Eye, Feather, Flame, Footprints, Gauge, Gem,
  Hand, HardHat, Heart, Hourglass, Link, Moon, Orbit, Scroll, Shield, ShieldHalf, Shirt, Sparkle, Star, Sword, Target, WandSparkles, Wind, Zap,
} from "@lucide/svelte";

export const ICON: Record<string, Component> = {
  home: House, daily: Sun, weekly: CalendarDays, monthly: CalendarRange, plan: Timer, season: Coins,
  crafting: Hammer, bell: Bell, bosses: Crown, arena: Swords, map: MapIcon, pets: PawPrint, dps: ChartColumn,
  fights: ScrollText, enhance: Sparkles, players: UserSearch, guild: Users, wiki: BookOpen, trophies: Trophy,
  news: Newspaper, settings: Settings, download: Download, upload: Upload, pin: MapPin, search: Search,
  panel: PanelRight, chevron: ChevronRight, close: X, sound: Volume2, muted: VolumeX, play: Play, move: Move,
};

/**
 * Your marker on the Map page and the radar while the meter says you ride a mount or glide (domain/map.ts travelNote):
 * a horse's head and a wing, original filled shapes (24x24, currentColor), legible down to ~11 px.
 */
const filled = (d: string) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;
export const TRAVEL_ICON = {
  mount: filled(`<path fill-rule="evenodd" d="M7 21v-3.6c-1.7-1.6-2.4-3.8-1.9-6l-1.6-1.3 2.4-1.6C6.8 5.4 9.6 3.4 12.8 3.4L14 1.8l1.1 2.2c2.6 1.1 4.5 3.6 5 6.5l.4 2.1c.2.9-.6 1.6-1.5 1.4l-2.6-.8-2-1.6-1.4 1.6c.5 2 1.5 3.6 3 4.7V21H7zm8.2-12.6a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z"/>`),
  wings: filled(`<path d="M3 6c5 0 10 1 18-2-1 3-3 5-6 6 1.6.5 3.2.5 4.8 0-1.5 2.5-4 4-7 4.2 1.5.6 3 .8 4.5.6-2 2.2-5 3.2-8 2.8 1 .7 2 1.2 3 1.4-3.5 1.5-7 0-8.5-3S3 9 3 6z"/>`),
};

/** Players: a stat's icon by its name (official profile, gear lines), any case, " Bonus" / " Increase" ignored; else a sparkle. */
export const STAT_ICON: Record<string, Component> = {
  might: Dumbbell, precision: Crosshair, dexterity: Feather, constitution: Heart, willpower: Brain, knowledge: Brain, intelligence: Brain,
  attack: Sword, defense: Shield, "critical hit": Target, "critical attack": Target, "critical damage boost": Target, accuracy: Eye,
  evasion: Wind, block: ShieldHalf, hp: Heart, mp: Droplet, "combat speed": Gauge, "move speed": Footprints, "damage boost": Flame,
  "weapon damage boost": Flame, "multi-hit chance": Zap, "flight power": Feather, "natural hp regen": Heart, "natural mp regen": Droplet,
  "critical hit resist": ShieldHalf, "damage tolerance": Shield, "status effect chance": WandSparkles, "status effect resist": ShieldHalf,
  "perfect chance": Star, "double chance": Zap, regeneration: Activity,
  justice: Scroll, freedom: Wind, illusion: Moon, life: Heart, destruction: Flame, death: Hourglass, wisdom: Brain, destiny: Clover,
  time: Hourglass, space: Orbit,
};
export const statIcon = (name: string): Component => {
  const n = name.toLowerCase().replace(/\s*\[.*\]$/, "").replace(/ (bonus|increase)$/, "").trim();
  return STAT_ICON[n] ?? Sparkle;
};
/** Players: an equipment slot's icon by its best-in-slot name (bis.ts bisSlot); else a shirt. */
export const SLOT_ICON: Record<string, Component> = {
  Weapon: Sword, "Off-hand": ShieldHalf, Helmet: HardHat, Shoulders: Shield, Torso: Shirt, Pants: Shirt, Gloves: Hand, Boots: Footprints,
  Cape: Feather, Necklace: Gem, Earring: CircleDot, Ring: CircleDot, Bracelet: Link,
  Arcana1: Sparkle, Arcana2: Scroll, Arcana3: Compass, Arcana4: Bell, Arcana5: Moon,
};
export const slotIcon = (slot: string | null): Component => (slot && SLOT_ICON[slot]) || Shirt;
