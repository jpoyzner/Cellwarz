Cyberstation is an online multiplayer platform game created by Jeff Poyzner! It lives at
https://cyberstation.djrecognize.com, reached from the DJ Recognize website (and back again through the HOME transporter on
its login screen). (The repo and some internal names still say "cellwarz".)

Node.js + TypeScript server (Express + `ws`), React client (rsbuild). See [AGENTS.md](AGENTS.md) for architecture,
[WORKFLOWS.md](WORKFLOWS.md) for the browser regression test catalog, [PLAN.md](PLAN.md) for the launch decisions and
[DEPLOY.md](DEPLOY.md) for putting it on a server.

## Dev commands

- `npm install` — install dependencies.
- `npm run server` — start the game server (Express + WebSocket) on port 8080.
- `npm start` — start the React dev server on port 3000 (proxies `/socketrefresh` and `/images` to the game server).
- `npm run dev` — run both of the above together.
- `npm run build` — production client build to `dist/`.
- `npm run serve` — run the server against the production build (serves `dist/` directly; single-process local deploy).
- `npm run typecheck` — TypeScript checks for the client and the server.
- `npm run test:unit` — unit tests (Vitest).
- `npm test` / `npm run test:e2e` — browser tests (Playwright); requires the dev server running (or use the
  built-in `webServer` config, which starts both automatically). If a dev server already uses ports 3000/8080, run
  the suite beside it with `CELLWARZ_API_PORT=8181 CELLWARZ_WEB_PORT=3131 npm test`.
- `npm run test:restart` — starts the real server, plays a bot, restarts it and checks the account and room came back.
- `npm run loadtest -- --url http://localhost:8080 --bots 60` — connects many bots and reports how the server held up.

## Saving and configuration

Nothing is saved unless `CELLWARZ_DATA_DIR` is set (local dev and the e2e run leave it unset); with it, players and the main
room survive restarts. All settings are environment variables with safe defaults: see [.env.example](.env.example) and
[server/config.ts](server/config.ts).
