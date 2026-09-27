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

## Iddeas for game features

- Realtime, side-scrolling multiplayer 2D puzzle game, originally shipped at cellwarz.com. Dormant/backlog — needs a full rewrite with modern tech, but Jeff retains genuine interest. See kb/projects/cellwarz.md. Also possibly ask to rewrite physics or go with something better. I will also use my DJ Recognize site to host cellwarz realtime multiplayers that can remember things if you sign up! Think about limiting chat to avoid hate, maybe just one emoji at a time as a speak bubble above, follows the avatar head perfectly.

- Make level designer?

- The interactive public level should be a giant rectangle with long platforms with plenty of space. There should be a big whole in the middle where there is less platforms, instead small ones so that one can get to the top. Near the top floating on a central platform is a DJ booth. Players can sign up and register a song/mix (first 1 hour of it max). that if they are first to sit at the DJ booth when no song is playing, they get to play it. (maybe have a max of 1 play per 4 hours or so?). The players can fight for this with blocks.

- Need to decide whether players will have their own room or just a big bag of inventory for picking up and hoarding blocks.

- Be able to see the whole game in the background of the DJ Recognize website (in the space), and make it the entry into this game. Perhaps a spaceship can take you to the game somehow. Maybe it bothers the website users.

- Give the 2D UX a "box-shadow" so that it looks 3D, OR EVEN BETTER: Render the actual graphics in 3D but keep the gameplay in 2D for actual physics.

- Could this be a team sport? Maybe NPC players try to guard the tree!!!! Or do they just annoy/kill players? Maybe make them replicate like in exodus lol!?? Game NPC AI - Use Exodus decision trees to drive NPC avatars in CellWarz (the ninja game). Instead of scripted behavior, ninjas evolve their own movement and combat logic autonomously.
    - Trees evolve to control NPC players — movement, targeting, attacking
    - Free to run — no tokens, no API costs, purely computational
    - Sebastian expressed interest; could be a collaborative side project
    - Scoring would need to be adapted for game outcomes (e.g. survival time, kills, territory)

- Maybe make a room where people can collaborate on live music somehow!!! Maybe they play instruments synced together in the same room live!?! A realtime interactive DAW?
