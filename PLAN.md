# Cyberstation — Production Launch Plan

Decisions and scope for deploying the game for real users at **cyberstation.djrecognize.com**. (TODOS.md is
intentionally untouched by this plan.)

## Decisions

- **Name**: player-facing name is **Cyberstation** (page title, login screen, HUD, README/docs). Internal identifiers
  (`CELLWARZ_*` env vars, `window.__cellwarz`, package/repo name) stay as they are. *(Approved: player-facing only.)*
- **Hosting**: one always-on **VPS** (~$5–8/month, **approved**) running Docker + Caddy (automatic TLS). Cloudflare DNS
  (free) in front. Jeff creates the VPS/DNS record; the repo ships the Dockerfile, Caddyfile, deploy notes. No other paid service.
- **URL**: `https://cyberstation.djrecognize.com` *(approved)*. The DJ Recognize site (daat repo) links to it; the game links back
  through a build-time `HOME_URL` (default `https://djrecognize.com`). The two repos stay separate.
- **One shared room** for everyone (scale later). Capacity cap `CELLWARZ_MAX_PLAYERS` (default 60 until load-tested);
  when full the login is refused with **"Station is at capacity"**.
- **Passwords**: not required yet (blank-hash callsigns keep working, first non-blank hash still locks one) *(decided: not yet)*.
- **Transporters**: login pads and the in-game stargates both fire on an **Up-arrow press while standing on one** (a
  player can walk past), with the same beam-up look as the login pads *(approved: same look **and** behaviour — the stargates are drawn as the pads)*. A third **HOME** pad on the login screen leaves for
  the DJ Recognize site.

## Work items

1. Up-to-use transporters (login pads + HOME pad; in-game stargates re-skinned/behaving like the login pads).
2. Rename to Cyberstation (player-facing only).
3. Persistence: users (callsign, credential, score, diamonds, look) in SQLite; room snapshot every 10s and on shutdown,
   versioned, with fresh-room fallback when the snapshot is missing/corrupt/old-version.
4. Transport and socket hardening: wss/TLS at the proxy, WebSocket `Origin` check, `maxPayload`, per-IP connection cap,
   per-connection message rate limit, login-attempt throttling, `scrypt` for credentials, callsign validation + reserved names.
5. Black Box recording only when developing locally (never on the real site).
6. Server-side rate cap on score reports (`scored`).
7. Client auto-reconnect (deploys/restarts must not strand players).
8. Capacity: player cap + message, sleeping-avatar eviction, `/healthz` + `/api/status`, load-test script.
9. Static assets: long-cache hashed bundles, `Cache-Control` on art/videos so Cloudflare caches them.
10. Production config: env-driven config, e2e-only flags never default on in prod, `.env.example`, Dockerfile, Caddyfile,
    staging (`beta.`) as a second process on the same VPS, process supervision, logging, deploy guide.

## Status

All ten work items are implemented and covered by tests (see [WORKFLOWS.md](WORKFLOWS.md) → "Going live", "Persistence across
restarts", "Reconnecting", "Login — turned away"). How to deploy: [DEPLOY.md](DEPLOY.md). What is **not** verified from this
machine: the Docker image, Caddy/Cloudflare and the GitHub workflows (no Docker here) — DEPLOY.md's check list covers them on the VPS.

Capacity measurements (`npm run loadtest`, laptop, bots moving constantly): 60 bots ≈ 20% of one core, 150 bots ≈ 40%; sharing each
step's serialized frame between connections cut CPU ~5x. **Bandwidth** is the cost to watch: ~8 MB/s outbound at 60 constantly-moving
players (everyone is sent everything that moves). `permessage-deflate` cut it ~7x but made the browser tests lose/delay key presses, so
it is off; interest management (send each player only what is near them) is the proper next step if traffic matters.
Default cap stays 60 until it is load-tested on the VPS.

Browser tests: the unit tests (474), typecheck and `npm run test:restart` pass. The Playwright suite passes except for one or two of
the long serial specs in `main-room-workflows.spec.ts` (red block, ninja star, wrap opening) and occasionally `robot-body`, which fail
at random in about every full run — **the original code does too** (checked on a clean checkout of HEAD: 1–2 failures in each of
two full runs), because specs share one room and leave avatars standing at the spawn. Run them as `npm test`; re-run a failed serial
block on its own and it passes.

Decisions made while building (flag if you disagree):
- Snapshots keep positions only (no velocities, fuses, rockets, planet): a restart returns everything where it was, at rest.
- Players' avatars come back **asleep** after a restart and wake when their client reconnects; sleepers with no connection are
  removed after 30 minutes (accounts stay).
- Callsigns: 1–32 letters/numbers with inner `space . - _ '`; look-alikes of `djrecognize`, `admin`, `moderator`, `system`, `server`,
  `cyberstation`, `robot` are reserved (DEPLOY.md says how to claim yours).
- Persistence is opt-in (`CELLWARZ_DATA_DIR`), so local dev and the Playwright run behave exactly as before.
- Robots no longer warp through stargates (they never "press Up").
- `tsx` moved to runtime dependencies (the server runs TypeScript directly).

## Out of scope (for now)

- Required passwords / account recovery, multiple rooms, the DJ Recognize site button + "players online" teaser (daat repo).
