# Crowd server (`server/`)

An optional Cloudflare Worker + D1 database. Players' apps share the **field-boss timers** and **hidden-cube
openings** their meters see, and download everyone else's. The app works the same when it is down.

- No player names. Each install sends a random UUID (`AppData.install`).
- Sending is opt-in (`settings.crowdShare`). Downloading needs no setting.
- URL: `CROWD_URL` in `src/config.ts`. `VITE_CROWD_URL` overrides it.

## API (`/v1`)

Only backward-compatible changes go into `/v1`. An incompatible change becomes `/v2`, served alongside it.

| Method | Path | Body / answer |
|---|---|---|
| `GET` | `/v1/bosses/:serverId` | `{ serverNow, every, maps: [{ mapId, seenMs, timers: BossTimer[] }] }`, cached 30 s |
| `POST` | `/v1/bosses` | `{ install, serverId, sentMs, maps: [{ mapId, timers }] }` → `{ ok, every }` |
| `GET` | `/v1/cubes` | `{ serverNow, every, spots: [{ mapId, x, y, z, code, n }], codes: number[] }`, cached 1 h |
| `POST` | `/v1/cubes` | `{ install, sentMs, mapId, cubes: [{ x, y, z, code, atMs }], codes }` → `{ ok, every }` |

- **Clocks**: the client sends `sentMs` (its clock). The Worker shifts every time by `serverNow - sentMs`, so a wrong
  PC clock can't push data into the future. Answers carry `serverNow` so the client can map times back
  (`domain/crowd.ts`).
- **`every`** is the poll interval in seconds (`POLL_SECONDS` in `wrangler.toml`). Raise it and redeploy to slow every
  client down.
- **Errors**: `400` bad body, `429` over 60 POSTs per install per hour, `404`, `500`.

## Trust and limits

All request bodies are checked in `server/src/validate.ts` (pure, tested in `validate.test.ts`):

- Body ≤ 16 KB, ≤ 32 maps and ≤ 64 timers per boss POST, ≤ 50 cubes and ≤ 50 codes per cube POST, names ≤ 64 chars.
- Times further than 48 h from now are dropped. Bad items are dropped, and a malformed frame rejects the whole body.
- A boss map keeps only the newest reading (`seen_ms` wins).
- A cube spot (a 300-unit cell) is published once **3** installs report it. A cube object code is published once **2**
  installs report it.

## Schema (`server/migrations/`)

| Table | Key | Holds |
|---|---|---|
| `boss_maps` | `server_id, map_id` | Latest timers per map (JSON) |
| `cube_reports` | `map_id, cell, install` | One report per install per cell |
| `cube_codes` | `code, install` | Object codes learned to be cubes |
| `writes` | `install, hour` | Rate limit counter |

A daily cron (`17 4 * * *`) deletes boss maps older than 7 days, cube reports older than 30 days and old rate-limit rows.

To change the schema, add a new numbered file in `server/migrations/`. Never edit one that's already applied.

## Local development

```bash
cd server
npx wrangler d1 migrations apply aion2 --local
npx wrangler dev                      # http://localhost:8787
```

Then, from the repo root: `VITE_CROWD_URL=http://localhost:8787 npm run dev`.

Checks: `npm test` (runs `server/**/*.test.ts` too) and `npx tsc -p server`. The Worker declares the few Workers types it
uses itself, so there's no `@cloudflare/workers-types` dependency.

## Deploy

Automatic: a merge into `main` that touches `server/` runs the `server` job in `.github/workflows/release.yml`
(`d1 migrations apply aion2 --remote`, then `deploy`). It does not bump the app version. It needs the
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. Logs: Cloudflare dashboard > Workers > Observability.
