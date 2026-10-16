# Deploying Cyberstation

The game runs as one Docker container on one small VPS, behind Caddy (automatic HTTPS), at
**https://cyberstation.djrecognize.com**. The DJ Recognize site (the `daat` repo, on Cloudflare) stays where it is and just links
here; the game's login screen links back through its HOME transporter. See [PLAN.md](PLAN.md) for the decisions.

## What it costs

| Item | Cost |
|---|---|
| VPS (the only paid thing): 2 vCPU / 2-4 GB, e.g. Hetzner CX22 (~€4-5/mo) or DigitalOcean Basic (~$12/mo for 2 GB) | ~$5-12 / month |
| Domain (already yours), Cloudflare DNS/CDN/proxy, HTTPS certificates (Let's Encrypt via Caddy), GitHub Actions | $0 |
| Backups: kept on the server; copying them to Cloudflare R2's free tier (10 GB) is optional and $0 | $0 |

Measured on a laptop with `npm run loadtest`: 60 bots moving constantly used ~20% of one core; 150 bots ~40%. One shared core on a
cheap VPS is slower, so the default cap is a conservative 60 players. Re-run the load test on the VPS before raising it.
**Bandwidth is the real cost**: every player is sent everything that moves, so 60 constantly-moving players is ~8 MB/s outbound
(~700 GB/day if it never let up); 20 players is ~1 MB/s and a quiet room almost nothing. Pick a VPS with a generous traffic
allowance (Hetzner includes 20 TB; many others 1-2 TB), watch it, and lower `CELLWARZ_MAX_PLAYERS` if needed. (Frame compression
would cut it ~7x but made the browser tests lose key presses, so it is off.)

## One-time setup

1. **Create the VPS** (Ubuntu 24.04) and add your SSH key. Note its IP address.
2. **DNS** (Cloudflare → djrecognize.com → DNS): add an `A` record `cyberstation` → the VPS IP, **DNS only (grey cloud)** for now. (Optional
   staging: `cyberstation-beta` the same way.) The existing records for the DJ Recognize site are untouched.
3. **Harden and install** on the VPS:
   ```bash
   ssh root@VPS_IP
   adduser deploy && usermod -aG sudo deploy      # then use that user from here on
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy
   ```
4. **Get the code and configure** (as `deploy`, after logging in again):
   ```bash
   sudo mkdir -p /opt/cyberstation && sudo chown deploy /opt/cyberstation
   git clone git@github.com:jpoyzner/Cellwarz.git /opt/cyberstation     # a read-only deploy key is best
   cd /opt/cyberstation && cp .env.example .env && nano .env
   ```
   Check `PUBLIC_HOME_URL`, `CELLWARZ_STATUS_ORIGIN` and the limits. Never commit `.env`.
5. **Start it**: `docker compose up -d --build`. Caddy gets the HTTPS certificate on the first request (give it a minute).
6. **Check it**:
   - `curl https://cyberstation.djrecognize.com/healthz` → `{"status":"ok",...,"saving":true}`
   - open the site, enter a callsign, TELEPORT in, see the radar and the TVs; press the HOME pad (Up) and confirm it goes to djrecognize.com
   - `docker compose restart cyberstation` while playing: the banner appears, the game comes back, your score and avatar are as they were
   - the Black Box (backtick) does nothing there.

## Cloudflare proxy (optional, recommended once it works)

Switching the `cyberstation` record to **proxied (orange cloud)** makes Cloudflare cache the art and the ~100 MB of videos and
absorb junk traffic; WebSockets work through it. Set SSL/TLS mode to **Full (strict)**. Then, because every request now comes
from Cloudflare, make the game see the real visitor address (the per-address limits depend on it):

- In `.env` set `CELLWARZ_TRUST_PROXY=cloudflare` (it then uses `CF-Connecting-IP`; the default `forwarded` uses Caddy's `X-Forwarded-For`).
- **Firewall**: with that on, the server must be reachable *only* through the proxy, or anyone could forge the header. Allow ports 80/443
  only from Cloudflare's published ranges (https://www.cloudflare.com/ips/):
  ```bash
  sudo ufw delete allow 80 && sudo ufw delete allow 443
  for ip in $(curl -s https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6); do
    sudo ufw allow from "$ip" to any port 80,443 proto tcp; done
  ```
  Without the orange cloud (grey), leave 80/443 open and Caddy supplies the visitor address itself.

## Updating

Locally: `npm run typecheck && npm run test:unit && npm test && npm run test:restart`, push, and wait for CI. Then either run the
**Deploy** workflow from GitHub's Actions tab (needs the secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`) or on the server:

```bash
cd /opt/cyberstation && git pull --ff-only && docker compose up -d --build cyberstation
```

Players are disconnected for a few seconds and reconnect by themselves; the room and accounts come back as they were. Try changes on
the staging copy first (`docker compose --profile beta up -d --build`, at https://cyberstation-beta.djrecognize.com; it has its own data and a 10-player cap).

**Rolling back**: `git checkout <good commit> && docker compose up -d --build cyberstation`. If a release changed the room layout
(`SNAPSHOT_VERSION` in `server/roomSnapshot.ts`), the saved room is simply ignored and a fresh one is built; accounts are unaffected.

## Backups

The accounts live in the `cyberstation-data` Docker volume (`/data/cyberstation.db`). Back them up daily (safe while running):

```bash
crontab -e     # as deploy
17 4 * * * cd /opt/cyberstation && ./scripts/backup.sh >> /var/log/cyberstation-backup.log 2>&1
```

This keeps the newest 14 inside the volume (`/data/backups`). Also copy them off the machine, e.g. with `rclone` to a free Cloudflare R2
bucket, or just `scp` them occasionally: `docker compose cp cyberstation:/data/backups ./backups`.

**Restoring**: stop the game, copy a backup over `/data/cyberstation.db` (delete `cyberstation.db-wal` and `-shm` next to it), start it.

## Watching it

- Uptime: point a free monitor (e.g. UptimeRobot) at `https://cyberstation.djrecognize.com/healthz`.
- `docker compose logs -f cyberstation` for logs; `docker compose ps` shows the container health.
- `/healthz` shows `stepAverageMs` against `stepBudgetMs` (20.8): if the average nears the budget or `eventLoopDelayP99Ms` climbs, the
  server is overloaded; lower `CELLWARZ_MAX_PLAYERS` or move to a bigger VPS.
- `curl https://cyberstation.djrecognize.com/api/status` → `{"name":"Cyberstation","players":3,"capacity":60,"full":false}`.

## Load test

```bash
# Locally (a server with high limits, since every bot comes from this machine):
CELLWARZ_MAX_PLAYERS=200 CELLWARZ_MAX_CONNECTIONS_PER_IP=500 CELLWARZ_MAX_CONNECTIONS=800 npm run server
npm run loadtest -- --url http://localhost:8080 --bots 60 --seconds 30
```

Healthy means every bot reaches the game, the p95 gap between frames stays near 21-30 ms and the server's step average is far below
20.8 ms. To test the VPS itself, use the staging copy (raise its limits temporarily in `.env`) and run the script from your laptop.

## Reserved names and your own callsign

`djrecognize`, `admin`, `moderator`, `system`, `server`, `cyberstation` and `robot` can't be claimed (look-alikes such as "DJ_Recognize"
included). To take **DJ Recognize** yourself: set `CELLWARZ_RESERVED_NAMES=` (empty) in `.env`, restart, log in as that callsign with a
hash, then remove the line and restart. Your account keeps working afterwards.

## Linking from the DJ Recognize site (the `daat` repo)

- A "PLAY CYBERSTATION" button/link to `https://cyberstation.djrecognize.com`.
- Optional live teaser: `fetch('https://cyberstation.djrecognize.com/api/status')` (allowed by `CELLWARZ_STATUS_ORIGIN`) and show
  "● N ninjas online — JOIN". The site's Content-Security-Policy, if it has one, must allow that `connect-src`.
