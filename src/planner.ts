// Session planner: the best set of unfinished tasks for an N-minute session. Pure: tested with `npm test`.
//
// It's a knapsack: capacity = session minutes, weight = minutes left on a task, value = priority × urgency.
// Tasks with goals can be done in part (fractional knapsack: greedy by value/minute is optimal),
// tasks without goals are all-or-nothing (0/1 knapsack: DP over whole minutes). The mix is solved exactly
// by trying every split of the capacity between the two. Then fixed-time events are pinned on the
// timeline and the chosen tasks fill the gaps around them.
import type { GameEvent, ResetConfig } from "./config.ts";
import { isDone, nextBoundary, nextEvent } from "./reset.ts";
import type { Progress, Task } from "./types.ts";

export const DEFAULT_MINUTES = 10; // estimate for a task never timed
export const DEFAULT_PRIORITY = 2; // 1 low · 2 normal · 3 high
const URGENT = 3; // value × 3 when the task resets before the next session (do it now or lose it)
const MIN = 60_000;

export interface Step { kind: "task" | "event"; id: string; name: string; start: number; minutes: number; urgent?: boolean; part?: number } // part: share of the whole task done in this step (split tasks)
export interface Skipped { id: string; name: string; minutes: number; urgent: boolean }
export interface Plan { steps: Step[]; skipped: Skipped[]; candidates: number; end: number }
export interface PlanInput {
  tasks: Task[]; progress: Record<string, Progress>; events: GameEvent[];
  now: number; minutes: number; nextSessionHours: number; config: ResetConfig;
}

/** Share of the task still to do: 1 = untouched, 0 = done. With goals, the furthest-behind goal decides. */
export function leftShare(t: Task, p?: Progress) {
  if (isDone(t, p)) return 0;
  if (!t.goals?.length) return 1;
  return Math.max(...t.goals.map((g, i) => Math.max(0, g.target - (p?.counts?.[i] ?? 0)) / g.target));
}

/** New estimate (minutes for the whole task) after `elapsed` minutes did `share` of it.
 *  Ignores ticks under 10 s (ticking things done earlier) and samples over max(3× estimate, 30 min) (AFK). */
export function learn(estimate: number, elapsed: number, share: number) {
  if (share <= 0 || elapsed < 1 / 6) return estimate;
  const sample = elapsed / share;
  if (sample > Math.max(3 * estimate, 30)) return estimate;
  return Math.max(0.5, Math.round((0.7 * estimate + 0.3 * sample) * 2) / 2);
}

interface Item { t: Task; est: number; minutes: number; value: number; urgent: boolean; split: boolean }
const ratio = (x: Item) => x.value / x.minutes;

export function plan(inp: PlanInput): Plan {
  const { now, config: c } = inp, end = now + inp.minutes * MIN, nextSession = now + inp.nextSessionHours * 3600_000;

  const events: Step[] = [];
  for (const ev of inp.events)
    for (let t = nextEvent(ev, now, c.timeZone); t < end; t = nextEvent(ev, t, c.timeZone))
      events.push({ kind: "event", id: ev.id, name: ev.name, start: t, minutes: ev.duration });
  events.sort((a, b) => a.start - b.start);

  // ponytail: a task whose reset falls inside the session is planned as one cycle; fine for ≤ a few hours.
  const items: Item[] = inp.tasks.filter((t) => t.enabled).flatMap((t) => {
    const share = leftShare(t, inp.progress[t.id]);
    if (!share) return [];
    const est = Math.max(0.5, t.minutes ?? DEFAULT_MINUTES), urgent = nextBoundary(t.cadence, now, c) <= nextSession;
    // Value is for finishing, not × share: a half-done task pays the same for half the minutes.
    return [{ t, est, minutes: share * est, value: (t.priority ?? DEFAULT_PRIORITY) * (urgent ? URGENT : 1), urgent, split: !!t.goals?.length }];
  });

  const W = Math.max(0, Math.floor(inp.minutes - events.reduce((a, e) => a + e.minutes, 0)));
  const whole = items.filter((x) => !x.split), parts = items.filter((x) => x.split).sort((a, b) => ratio(b) - ratio(a));

  // 0/1 knapsack over whole tasks: dp[cap] = best value using ≤ cap minutes.
  const w = whole.map((x) => Math.max(1, Math.ceil(x.minutes)));
  let dp = new Array<number>(W + 1).fill(0);
  const keep: boolean[][] = whole.map((x, i) => {
    const next = dp.slice(), k = new Array<boolean>(W + 1).fill(false);
    for (let cap = w[i]; cap <= W; cap++)
      if (dp[cap - w[i]] + x.value > next[cap]) { next[cap] = dp[cap - w[i]] + x.value; k[cap] = true; }
    dp = next;
    return k;
  });
  // Fractional fill of the rest with split tasks, best value/minute first.
  const fill = (r: number) => {
    const alloc = new Map<Item, number>();
    let v = 0;
    for (const x of parts) {
      if (r <= 0) break;
      const m = Math.min(x.minutes, r);
      alloc.set(x, m); v += ratio(x) * m; r -= m;
    }
    return { v, alloc };
  };
  let best = 0, bestV = -1;
  for (let cap = 0; cap <= W; cap++) { const v = dp[cap] + fill(W - cap).v; if (v > bestV + 1e-9) { bestV = v; best = cap; } }

  const chosen = new Map<Item, number>(fill(W - best).alloc);
  for (let i = whole.length - 1, cap = best; i >= 0; i--) if (keep[i][cap]) { chosen.set(whole[i], whole[i].minutes); cap -= w[i]; }

  // Timeline: urgent first, then value/minute. Before each event, first-fit: a split task is cut at the
  // event and resumes after it; a whole task that doesn't fit waits for after the event.
  // ponytail: idle gaps before an event aren't counted in W, so `end` can run a few minutes past the window.
  const queue = [...chosen].map(([x, left]) => ({ x, left }))
    .sort((a, b) => +b.x.urgent - +a.x.urgent || ratio(b.x) - ratio(a.x));
  const steps: Step[] = [];
  let cur = now;
  const put = (x: Item, m: number) => {
    steps.push({ kind: "task", id: x.t.id, name: x.t.name, start: cur, minutes: m, urgent: x.urgent, ...(x.split && { part: m / x.est }) });
    cur += m * MIN;
  };
  for (const ev of [...events, undefined]) {
    const stop = ev ? ev.start : Infinity;
    for (let i = 0; i < queue.length; ) {
      const q = queue[i], gap = (stop - cur) / MIN;
      if (gap < 0.5) break;
      if (q.left <= gap + 1e-9) { put(q.x, q.left); queue.splice(i, 1); }
      else if (q.x.split) { put(q.x, gap); q.left -= gap; break; }
      else i++;
    }
    if (ev) { const s = Math.max(cur, ev.start); steps.push({ ...ev, start: s }); cur = s + ev.minutes * MIN; }
  }

  const skipped = items.filter((x) => !chosen.has(x))
    .map((x) => ({ id: x.t.id, name: x.t.name, minutes: x.minutes, urgent: x.urgent }))
    .sort((a, b) => +b.urgent - +a.urgent);
  return { steps, skipped, candidates: items.length, end: cur };
}
