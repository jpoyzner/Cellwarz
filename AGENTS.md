# Cellwarz

Online multiplayer platform game (see [README.md](README.md)). Node.js + TypeScript WebSocket server (Express +
`ws`), React client (rsbuild). No database — all game state is in-memory, matching the original design.

> The pre-migration Java/Tomcat + RequireJS/Backbone implementation is preserved on the `java` git branch/tag.
> This repo was fully rewritten from that codebase to Node/TypeScript/React; the porting notes below describe
> intentional behavior deltas from that original.

## Architecture

- **Server** (`server/`, entry point [server.ts](server.ts)): `World` constructs one `Physics` and one `Zion` at
  startup. `Zion` currently creates a single [MainRoom](server/cell/mainRoom.ts) instance (room), wrapped in an
  `Engine` that runs its own 48 FPS game loop (`Engine.ENGINE_FRAMES_PER_SECOND`) — every login lands in this
  same room for now, on purpose, so all multiplayer players end up together (see TODOS.md; `Zion` still supports
  multiple room instances via its `matrix`/`getRandomEngine()`, this is just a constructor tweak). The loop is a
  fixed-timestep accumulator on top of `setInterval` (not "assume every callback is exactly 1000/48ms"): each
  callback advances a `Date.now()`-based accumulator and runs as many 1/48s simulation steps as elapsed wall
  time calls for (capped at `Engine.MAX_CATCHUP_STEPS` to avoid a catch-up spiral after a long stall), so the
  sim speed stays correct even if Node's timer drifts or briefly coalesces. `Session` maps a login to the
  player's current `Avatar`.
- **Realtime transport**: a single `ws` `WebSocketServer` mounted at `/socketrefresh` in [server.ts](server.ts).
  Each connection gets its own [SocketHub](server/socketHub.ts), which runs its own 48 FPS render loop and speaks
  a small JSON protocol (`connect` / key-down-up) via [jsonGenerator.ts](server/jsonGenerator.ts).
- **Physics/world model**: [CellData](server/cellData.ts) stores sprites in a 2D grid of `Set<Sprite>`
  (`ANIMATION_STEP = 8` px per grid unit). [Physics](server/physics.ts) implements move/push/collision on that
  grid. Sprites (`server/sprite/`) extend the abstract `Sprite`; cells (`server/cell/`) extend abstract `Cell`,
  which populates walls/doors/mana/robots in `init()`. [MainRoom](server/cell/mainRoom.ts) is "the" reusable main
  multiplayer room layout — a fixed (non-random) giant rectangle with long horizontal platform rows, a center
  hole bridged by four straight-up/down stepping-stone columns, scattered decorative blocks, two animated
  `Portal` "stargates" (walking into either warps the avatar to a random other room's spawn portal) in the top
  corners, and one small floating `SpawnPortal` (avatars are deposited/warped-in here) at the bottom center;
  only its mana/`Robot` pickup positions are still randomized per instance. It's the only room type wired into
  `Zion` today. [SimpleSmallCell](server/cell/simpleSmallCell.ts) (small, fully-random walls) is kept
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
- **Movement/jump feel** (`server/sprite/avatar.ts`): grid-discrete movement (still integer `CellData` units, no
  subpixel physics) plus three additive-only forgiveness mechanics layered on top of the original fixed-height
  jump: **variable jump height** (releasing the jump key cuts `yPower` down to `MIN_JUMP_ACTION_LENGTH`; holding
  it keeps the full `FULL_JUMP_ACTION_LENGTH` arc), **coyote time** (`coyoteFramesRemaining`, a few grace frames
  to jump after leaving a ledge), and **jump buffering** (`jumpBufferedFrames`, a press just before landing
  fires the instant you land). `releaseJump()` ignores a release faster than `MIN_HOLD_BEFORE_RELEASE_MS` real
  ms since the jump started — a same-instant keydown+keyup can't be a genuine human tap (that's exactly what a
  zero-delay scripted/automated key press looks like over the wire, and MainRoom's obstacle heights assume a
  full jump), so it's treated as a full-height jump instead of silently shrinking every such input. A
  decelerating jump *arc* was deliberately **not** added server-side (it would need either shrinking the
  reachable height within the same frame budget, risking breaking existing jump-gap traversal, or subpixel
  positions) — the client's render-smoothing layer below covers the visual want instead.
- **Death feedback**: `Avatar.die(knockbackXDirection?, knockbackYDirection?)` takes an optional knockback
  direction (missiles knock back along their flight direction, engine fire knocks upward) applied via one
  `Physics.move` before `removePermanently()` — death is still a single hit, this only adds physicality to it.
  Because a dying player's own `SocketHub.renderClient()` otherwise goes silent forever the instant their
  session unplugs (no avatar left to render for them), it sends one one-shot `{ died: true }` message first so
  their own client can react (see `Renderer.onLocalAvatarDeath()`) instead of the screen just freezing.
- **Client netcode smoothing & "juice" layer** (`src/game/`, all purely cosmetic — none of it changes actual
  positions/collision outcomes, which stay 100% server-authoritative): `Renderer` runs its own
  `requestAnimationFrame` loop, independent of message arrival, that exponentially smooths every sprite's
  drawn position toward its latest known server position (`SMOOTHING_TAU_MS`) instead of snapping to each new
  snapshot; `prediction.ts`'s `LocalPredictor` additionally predicts the *local* avatar's left/right movement
  the instant a key is pressed (softly reconciling against the server a few frames later, snapping instead on a
  large mismatch) since the client has no collision geometry to predict jumps/pushes against. `audio.ts`
  synthesizes short WebAudio blips (no audio asset files were added) and `particles.ts` draws small dust/impact/
  warp bursts, both triggered by diffing incoming sprite positions/deletions (e.g. an avatar sprite disappearing
  ⇒ impact burst; a rendered avatar's y going from falling to flat ⇒ landing dust). **Important**: any state that
  actual game logic or tests depend on (the `sprites`/`avatars` maps) is mutated synchronously as messages
  arrive, never lazily from the `requestAnimationFrame` callback — that loop is throttled/paused by the browser
  for backgrounded/unfocused tabs (this bit a Playwright test with two browser contexts during development;
  see the git history on `src/game/renderer.ts` for the fix), so anything logically load-bearing can't depend
  on it actually running.
- **Minimap** (`src/game/minimap.ts`, drawn by `Renderer` onto its own `#minimap-canvas`; open/closed toggle is
  React state in `GameCanvas`): the wire format has no sprite type, so walls vs. avatars/robots are classified
  from the image path (`/blocks/` vs `/me/`), and a robot is an actor sprite whose id isn't in `avatars` (robots
  never send a name). The wall layer is cached and only rebuilt when a wall sprite appears/disappears.
- **Level backdrops** (`Cell.getBackground()` → `'space' | 'temple'`, sent as `background` in the full-state
  payload and applied in `Renderer.setBackground()`): `MainRoom` uses `'space'` — [spaceBackground.ts](src/game/spaceBackground.ts),
  a starfield plus drifting tetrominoes ported from the daat/DJ Recognize site, drawn on the game canvas before
  sprites; pieces live in world coordinates (the server sends `worldWidth`/`worldHeight`) and shatter into flying
  cells when any avatar's rect overlaps them (the site's mouse-hover became avatar-touch); stars are a
  screen layer that slowly drifts in one shared random direction. `MainRoom` also has five tall ceiling lamps (`Cell.getLamps()`, sent as `lamps`;
  [lamps.ts](src/game/lamps.ts)) casting bright, floor-fading triangular light beams drawn behind the sprites that sway back and forth (alternate
  lamps opposite, so neighbours briefly overlap), so
  the black ninja actors (avatars, robots) read against them and vanish into the dark outside them (players can
  hide). Name tags are yellow and centered over the sprite. Purely cosmetic. `'temple'` (the DOM `#canvas-bg`
  image) is the `Cell` default, kept for the future randomly generated rooms.
- **Score** (top-right `#score` DOM element): when the *local* avatar shatters a background piece, its shards
  (`collect` shards in [spaceBackground.ts](src/game/spaceBackground.ts)) burst out, then home in on the HUD
  (converted to world coordinates by the camera offset) and are counted on arrival; `Renderer` adds 20/block and
  reports `{ scored: n }` over the socket. The server (`Session.addBlocks`, `POINTS_PER_BLOCK`) keeps the
  authoritative per-user total, sent back as `score` in the full-state payload. The old top-left analyzer text
  was removed (`Analyzer` still exists but is no longer drawn).
- **Stand animation already exists**: `Avatar`'s `STAND_LEFT_ACTION`/`STAND_RIGHT_ACTION` already cycle through
  6 art frames (`me/stand1..6`) at `Engine.QUARTER_STEP` — there's no "frozen idle" gap to fill.

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
  itself — `Cell.entrances` and `Cell.getRandomX`/`getRandomY` are `protected` specifically to support this.
  `Cell.addAvatarAtEntrance` picks a random entry from `entrances` (an avatar can be deposited at any of them,
  e.g. MainRoom's two `SpawnPortal`s), not just a single fixed spot.
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
  by accident; `waitUntilGrounded` polls until an avatar's y stops changing, since a fresh spawn now free-falls a
  short distance from its floating `SpawnPortal` before landing) and a small keepout zone in `MainRoom` so
  randomly-placed mana/robots can't spawn on the fixed
  test fixtures or block the floor path e2e tests walk (robots can still *wander* into that zone while
  patrolling, since only their spawn position is constrained — watch for e2e flakiness from this and tighten
  further if it shows up). Remaining e2e gaps: death-by-engine-fire specifically (only death-by-missile is
  automated so far), general mana/booster/ice positions elsewhere in the room are still randomized, and robots
  have unit coverage ([server/__tests__/robot.test.ts](server/__tests__/robot.test.ts)) but no e2e coverage yet.
  `Robot.turnAround()` reverses direction (and keeps patrolling indefinitely) the instant its current direction
  is blocked by a solid obstacle — re-enabled via `MainRoom.getNumRobots()` now that this is covered.
- A few spots intentionally diverge from the original Java's crash-on-null behavior: e.g.
  `Cell.addAvatarAtEntrance` and `Portal.warpRandomly` fail gracefully (no-op) instead of throwing an NPE when a
  room has no free entrance spot. This is called out with comments at each site.
- Many `TODO:` comments carried over from the original Java mark known rough edges (e.g. `Session.unplug()`);
  this is still an actively-evolving hobby project — don't be surprised by them, and don't feel obligated to fix
  them unless asked.

