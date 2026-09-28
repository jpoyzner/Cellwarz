# Cellwarz

Online multiplayer platform game (see [README.md](README.md)). Node.js + TypeScript WebSocket server (Express +
`ws`), React client (rsbuild). No database — all game state is in-memory, matching the original design.

> The pre-migration Java/Tomcat + RequireJS/Backbone implementation is preserved on the `java` git branch/tag.
> This repo was fully rewritten from that codebase to Node/TypeScript/React; the porting notes below describe
> intentional behavior deltas from that original.

## Architecture

- **Server** (`server/`, entry point [server.ts](server.ts)): `World` constructs one `Physics` and one `Zion` at
  startup. `Zion` currently creates a single [MainRoom](server/cell/mainRoom.ts) instance (room), wrapped in an
  `Engine` that runs its own 48 FPS `setInterval` game loop (`Engine.ENGINE_FRAMES_PER_SECOND`) — every login
  lands in this same room for now, on purpose, so all multiplayer players end up together (see TODOS.md; `Zion`
  still supports multiple room instances via its `matrix`/`getRandomEngine()`, this is just a constructor tweak).
  `Session` maps a login to the player's current `Avatar`.
- **Realtime transport**: a single `ws` `WebSocketServer` mounted at `/socketrefresh` in [server.ts](server.ts).
  Each connection gets its own [SocketHub](server/socketHub.ts), which runs its own 48 FPS render loop and speaks
  a small JSON protocol (`connect` / key-down-up) via [jsonGenerator.ts](server/jsonGenerator.ts).
- **Physics/world model**: [CellData](server/cellData.ts) stores sprites in a 2D grid of `Set<Sprite>`
  (`ANIMATION_STEP = 8` px per grid unit). [Physics](server/physics.ts) implements move/push/collision on that
  grid. Sprites (`server/sprite/`) extend the abstract `Sprite`; cells (`server/cell/`) extend abstract `Cell`,
  which populates walls/doors/mana/robots in `init()`. [MainRoom](server/cell/mainRoom.ts) is "the" reusable main
  multiplayer room layout — a fixed (non-random) giant rectangle with long horizontal platform rows, a center
  hole bridged by two straight-up/down stepping-stone columns, scattered decorative blocks, and one `Portal` in
  each corner; only its mana/`Robot` pickup positions are still randomized per instance. It's the only room type
  wired into `Zion` today. [SimpleSmallCell](server/cell/simpleSmallCell.ts) (small, fully-random walls) is kept
  around as a fast fixture for unit tests and as the likely starting point for the future randomly-generated
  "side-quest" room mode (see [TODOS.md](TODOS.md)) — it isn't used in production room selection anymore.
- **Wire format is intentionally terse**: `getSprites` in [jsonGenerator.ts](server/jsonGenerator.ts) emits
  `[imageIndex, xPixels, yPixels, extraInfo?]` per sprite keyed by cell index, and `[-1]` means "deleted this
  frame" — this is a size/perf optimization for frequent redraw messages, preserve it when touching this path.
  **Redraw-only frames are the sprite map itself (flat, unwrapped)**; only full-refresh frames (on login/stale)
  wrap it under a `sprites` key alongside `avatars`/`tools`/`imagePaths` — see `SocketHub.renderClient()`.
- **Client** (`src/`, served from `dist/` in production): React app. `App.tsx` switches between `LoginScreen` and
  `GameCanvas`. `GameCanvas` owns the `<canvas>` and, in a single `useEffect`, wires up `game/ui.ts` (input),
  `game/renderer.ts` (canvas drawing from server JSON), `game/syncer.ts` (the `WebSocket` connection), and
  `game/analyzer.ts` (perf HUD) — these draw imperatively outside React's render cycle for performance, same
  design intent as the original Backbone views. `GameCanvas` also exposes `window.__cellwarz` (public game state
  only) as a test-only introspection hook for E2E tests (see [e2e/global.d.ts](e2e/global.d.ts)).
- **No chat**: player-to-player text chat was removed entirely (client input handling, `Cell.postMessage` /
  `MESSAGE_PARAM` on the server) — a different communication system will replace it later. Don't re-add it
  without an explicit request.

## Build / run

- Two dev processes: `npm run server` (Express + `ws` on :8080) and `npm start` (rsbuild dev server on :3000,
  proxies `/socketrefresh` and `/images` to :8080). `npm run dev` runs both together via `concurrently`.
- `npm run build` — production client bundle to `dist/`. `npm run serve` — runs the server serving that build
  (this is the current "local deploy"; no CI/remote deploy pipeline exists yet — that will be built out later).
- `npm run test:unit` — Vitest, for engine/physics logic (`server/__tests__/`).
- `npm test` / `npm run test:e2e` — Playwright browser tests (`e2e/`); see [WORKFLOWS.md](WORKFLOWS.md) for the
  workflow-to-test mapping. `playwright.config.ts` auto-starts both dev processes via its `webServer` array.
- Node version: see [.nvmrc](.nvmrc).

## Conventions & gotchas

- `Cell` subclasses usually only override the small set of abstract sizing/spawn-count methods (see
  [SimpleSmallCell](server/cell/simpleSmallCell.ts)); prefer that for new room types. A subclass that needs a
  fully custom, deterministic layout (like [MainRoom](server/cell/mainRoom.ts)) can instead override `init()`
  itself — `Cell.entrance` and `Cell.getRandomX`/`getRandomY` are `protected` specifically to support this.
- Sprite subclasses under `server/sprite/` follow a consistent pattern: static `init(CellData)` registers
  animation frames/images once per cell (shared static `Map`, not per-instance — this only stays correct because
  every `CellData` registers images in the same deterministic order), instance constructors take
  `(x, y, cellInit, cell)` and can throw `ClusteredInitException` if the spawn position is occupied.
- Circular-import safety: the sprite/cell/engine/physics modules reference each other in both directions (e.g.
  `Cell` constructs sprites, sprites read back `cell.getWorld()`/`cell.getEngine()`). This only works because
  every "back-reference" is a **type-only import** (`import type`), which is erased at build time — never
  change one of these to a value import without checking the dependency direction first.
- Because every login shares the one `MainRoom` and avatars are never cleaned up on disconnect (see the
  `Session.unplug()` TODO below), e2e specs that depend on deterministic positions/timing (mana pickup, portal
  warp, death/respawn, multiplayer visibility — see [main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts))
  run inside one `test.describe.configure({ mode: 'serial' })` block so their avatars can't push/collide with
  each other; they also lean on shared helpers in [e2e/gameHelpers.ts](e2e/gameHelpers.ts) (`walkTo` jumps only
  when the avatar's x actually stalls, rather than blindly, to avoid climbing MainRoom's stepping-stone columns
  by accident) and a small keepout zone in `MainRoom` so randomly-placed mana can't land on the fixed test
  fixtures or block the floor path e2e tests walk. Remaining e2e gaps: death-by-engine-fire specifically (only
  death-by-missile is automated so far), and general mana/booster/ice positions elsewhere in the room are still
  randomized. `MainRoom.getNumRobots()` is temporarily `0` — robots only ever run one direction until
  permanently blocked, so they'd inevitably camp on the fixed test fixtures; re-enable once there's dedicated
  robot e2e coverage (or robots gain a turn-around behavior) to justify the risk.
- A few spots intentionally diverge from the original Java's crash-on-null behavior: e.g.
  `Cell.addAvatarAtEntrance` and `Portal.warpRandomly` fail gracefully (no-op) instead of throwing an NPE when a
  room has no free entrance spot. This is called out with comments at each site.
- Many `TODO:` comments carried over from the original Java mark known rough edges (e.g. `Session.unplug()`);
  this is still an actively-evolving hobby project — don't be surprised by them, and don't feel obligated to fix
  them unless asked.

