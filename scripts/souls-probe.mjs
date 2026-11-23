// One-off probe: how aion2hub's item page holds a Soul's "Dropped by" list. Prints where "Faded Papis" appears.
// node scripts/souls-probe.mjs > probe.txt
const r = await fetch("https://aion2hub.com/database/items/534660067");
const html = await r.text();
console.log("status", r.status, "length", html.length);
console.log("next data:", html.includes("__NEXT_DATA__"), "flight:", html.includes("self.__next_f"));
let at = -1, n = 0;
while ((at = html.indexOf("Faded Papis", at + 1)) >= 0 && n++ < 4) console.log(`--- at ${at}\n${html.slice(Math.max(0, at - 600), at + 400)}`);
for (const m of new Set(html.match(/\/_next\/static\/chunks\/[\w./-]+\.js/g) ?? [])) console.log("chunk", m);
for (const m of new Set(html.match(/\/api\/[\w./?=&-]+/g) ?? [])) console.log("api", m);
