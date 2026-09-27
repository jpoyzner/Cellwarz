Cellwarz is an online multiplayer platform game created by Jeff Poyzner!

Node.js + TypeScript server (Express + `ws`), React client (rsbuild). See [AGENTS.md](AGENTS.md) for architecture
and [WORKFLOWS.md](WORKFLOWS.md) for the browser regression test catalog.

## Dev commands

- `npm install` — install dependencies.
- `npm run server` — start the game server (Express + WebSocket) on port 8080.
- `npm start` — start the React dev server on port 3000 (proxies `/socketrefresh` and `/images` to the game server).
- `npm run dev` — run both of the above together.
- `npm run build` — production client build to `dist/`.
- `npm run serve` — run the server against the production build (serves `dist/` directly; single-process local deploy).
- `npm run test:unit` — unit tests (Vitest).
- `npm test` / `npm run test:e2e` — browser tests (Playwright); requires the dev server running (or use the
  built-in `webServer` config, which starts both automatically).
