// The design system's guard (app.css header): colours, font sizes and custom properties come from the tokens.
// Reads the stylesheets as text, so it runs with the other tests (npm test) and in CI.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const name = (f: string) => relative(SRC, f).replaceAll("\\", "/");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

const files = walk(SRC).filter((f) => /\.(css|svelte|ts)$/.test(f) && !f.endsWith(".test.ts"));
const text = new Map(files.map((f) => [name(f), readFileSync(f, "utf8")]));
// The token blocks (`:root { … }`, `:root[data-season="winter"] { … }`) are where raw values belong.
const TOKEN_BLOCK = /:root(?:\[[^\]]+\])?\s*\{[^}]*\}/g;
/** Each stylesheet without its token blocks and comments: app.css, the legacy style.css and every component's <style>. */
const sheets = new Map([...text].flatMap(([f, s]): [string, string][] => {
  if (f.endsWith(".css")) return [[f, noComments(s).replace(TOKEN_BLOCK, "")]];
  if (!f.endsWith(".svelte")) return [];
  return [[f, noComments([...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n"))]];
}));

// Raw colours still outside the tokens, per file: a ceiling to lower, never to raise. A file not listed has none.
// Add a token to :root (app.css) instead of a colour here.
const RAW_COLOURS: Record<string, number> = {
  "style.css": 59, // the birthday strip, gear cards, map markers, the mascot's vortex, shadows
  "ui/pages/guild/Callups.svelte": 14, // Discord's own colours: the message preview looks like Discord
  "ui/pages/guild/RaidPlan.svelte": 3, // the grid's four states: free / not free, every week / this week
};

test("colours come from the tokens", () => {
  for (const [f, css] of sheets) {
    const found = css.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? [];
    assert.ok(found.length <= (RAW_COLOURS[f] ?? 0),
      `${f}: ${found.length} raw colours (allowed ${RAW_COLOURS[f] ?? 0}): use a token from :root in app.css. Found: ${[...new Set(found)].join(" ")}`);
  }
});

test("font sizes come from the type scale", () => {
  for (const [f, css] of sheets)
    for (const [, value] of css.matchAll(/font-size:\s*([^;}]+)/g))
      assert.match(value.trim(), /^(var\(--fs-(xs|sm|md|lg|xl|2xl|3xl)\)|inherit)$/, `${f}: font-size ${value.trim()} is not a --fs-* token`);
});

test("every custom property that is used is defined", () => {
  const all = [...text.values()].join("\n");
  // Defined in CSS (`--x:`), by a Svelte style directive (`style:--x=`) or from code (`setProperty("--x"`).
  const defined = new Set([...all.matchAll(/(?:style:|setProperty\(["'])?(--[\w-]+)\s*(?=[:=]|["'],)/g)].map((m) => m[1]));
  for (const [f, css] of sheets)
    for (const [, used] of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(defined.has(used), `${f}: var(${used}) is never defined`);
});

test("no !important outside the reduced-motion reset", () => {
  for (const [f, css] of sheets) {
    const n = (css.match(/!important/g) ?? []).length;
    assert.equal(n, f === "style.css" ? 2 : 0, `${f}: ${n} !important`);
  }
});

// The shared controls are shadcn-svelte components (src/lib/components/ui) and ours (src/lib/components/app): Panel for a
// card, Table, Button, Input, NativeSelect, Switch, Checkbox, ToggleGroup, Badge, Intro. The old global classes for
// them are gone from style.css; a page using one again would get no style at all.
const OLD_CLASSES = ["sheet", "seg", "ghost", "primary", "act", "toolbar", "kpis", "kpi", "pill", "btn", "intro", "dps-table", "prow", "scroll"];
test("pages use the components, not the old shared classes", () => {
  for (const [f, s] of text) {
    if (!f.startsWith("ui/") || !f.endsWith(".svelte")) continue;
    assert.doesNotMatch(s, /<section[\s>]/, `${f}: a <section> card: use Panel ($lib/components/app/Panel.svelte)`);
    for (const [, cls] of s.matchAll(/\bclass="([^"]*)"/g)) {
      const old = cls.split(/\s+/).filter((c) => OLD_CLASSES.includes(c));
      assert.equal(old.length, 0, `${f}: class "${old.join(" ")}": use the shadcn component instead`);
    }
  }
});
