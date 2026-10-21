// Event alert lead times. Pure: tested with `npm test`.

/** Event alert lead times (minutes): unique ints 1..60, longest first, max 3; nothing valid → [5]. */
export function cleanLeads(leads: unknown): number[] {
  const ok = (Array.isArray(leads) ? leads : []).map(Math.round).filter((n) => n >= 1 && n <= 60);
  const out = [...new Set(ok)].sort((a, b) => b - a).slice(0, 3);
  return out.length ? out : [5];
}

/** Lead times now due (msLeft ≤ lead) and not yet warned. The caller marks them all and toasts once. */
export const dueLeads = (leads: number[], msLeft: number, warned: (lead: number) => boolean) =>
  leads.filter((l) => msLeft <= l * 60_000 && !warned(l));
