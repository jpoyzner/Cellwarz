# TODOs

## Migration status

The Java/Tomcat + RequireJS/Backbone stack has been fully replaced with Node.js/TypeScript + React (see
[AGENTS.md](AGENTS.md)). Chat was removed rather than ported — a different communication system will replace it
later. Old code lives on the `java` git branch/tag. Remaining follow-ups, not yet done:

- Make it play the game itself to help understand and improve gameplay, keep this mechanism, maybe expand into a development harness for validating video game play, maybe it can suggest the best way to approach this
- No automated E2E coverage for: mana pickup/tool activation in the browser, portal warp in the browser,
  death/respawn, multiplayer visibility (two sessions in the same room) — see [WORKFLOWS.md](WORKFLOWS.md) for
  why (mostly randomized room/spawn placement with no deterministic test hook yet).
- No real deploy pipeline yet — `npm run build && npm run serve` is the current "local deploy" only, as scoped.
- If persistence is ever needed (session/avatar state surviving a server restart), use a NoSQL store — no DB is
  in use today.

## Agent customizations to consider

- Adapt the `Moshe` agent ([.github/agents/moshe.agent.md](.github/agents/moshe.agent.md)) to Cellwarz's actual
  commands/paths now that the stack matches its assumptions much more closely (npm scripts, `WORKFLOWS.md`,
  `e2e/`, Vitest instead of Jest, no `src/objects/__tests__` — engine unit tests live in `server/__tests__/`).
- `/create-instruction` for the `sprite/` subclassing pattern (`applyTo: server/sprite/**`) — codifies the static
  `init(CellData)` + `(x, y, cellInit, cell)` constructor + `ClusteredInitException` convention, useful if new
  sprites are added often.
- `/create-agent` "game-client" agent scoped to `src/**` with browser tools, for UI-focused iteration on the
  React client.
