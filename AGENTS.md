# Cellwarz (player-facing name: Cyberstation)

Online multiplayer platform game (see [README.md](README.md)). Node.js + TypeScript WebSocket server (Express +
`ws`), React client (rsbuild). Game state lives in memory while running; in production (`CELLWARZ_DATA_DIR` set) accounts
and the main room are also saved so a restart brings them back (see "Production & persistence"). The name players see is
**Cyberstation** — the repo, the `CELLWARZ_*` env vars, `window.__cellwarz` and the package keep the old name on purpose
(see [PLAN.md](PLAN.md)). It is deployed at https://cyberstation.djrecognize.com ([DEPLOY.md](DEPLOY.md)).

> The pre-migration Java/Tomcat + RequireJS/Backbone implementation is preserved on the `java` git branch/tag.
> This repo was fully rewritten from that codebase to Node/TypeScript/React; the porting notes below describe
> intentional behavior deltas from that original.

## Jargon (Jeff's shorthand)

- **"Black Box"** (a.k.a. "black box recording", "the recording") — the in-game flight recorder (local development only: off on the real site). When Jeff says
  "check the Black Box", **read [black-box/latest.json](black-box/latest.json) immediately** (no searching needed; it's
  git-ignored and only the latest one exists). It holds the client's starting snapshot and every server message/key
  press for up to 10s, plus a `server` section with the server's own dump of **every** sprite (real class, size, layer,
  mass, motion) at the start and end. Details: "Black Box" under Architecture below, and
  [WORKFLOWS.md](WORKFLOWS.md#the-black-box-backtick).

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
- **Production & persistence** (all env-driven via [server/config.ts](server/config.ts) — `loadConfig`, see [.env.example](.env.example)):
  - [server.ts](server.ts) is the thin entry: config → optional [Persistence](server/persistence.ts) → `World` → `createApp`
    ([server/web.ts](server/web.ts): security headers/CSP in production, `/healthz`, `/api/status`, cache headers, `/images`,
    `/videos`, `dist/`) → a `WebSocketServer({ noServer })` whose `upgrade` handler enforces the path, the `Origin`
    ([connectionGuard.ts](server/connectionGuard.ts): same-site or listed; any localhost page outside production) and the
    per-address/total socket caps, then ping/pong heartbeats, graceful SIGTERM/SIGINT (save, hang up so clients reconnect) and a
    fatal-error handler that saves accounts only. A production server refuses to start with the e2e-only `CELLWARZ_*` switches set.
  - **Accounts**: `Session.toStored/fromStored` ⇄ [UserStore](server/userStore.ts) (Node's built-in `node:sqlite`, `cyberstation.db`,
    `PRAGMA user_version` schema). Credentials are salted `scrypt` (`CREDENTIAL_KDF`, with a per-process quick digest so a reconnect
    skips the slow hash). `Zion.addSession()` is the one place a session is registered (it wires the change listener that marks it
    dirty); `Persistence` flushes dirty users every snapshot interval and on shutdown. A restored `Session` has no avatar
    (`new Session()` with none; `UI` accepts that).
  - **Room snapshot** ([roomSnapshot.ts](server/roomSnapshot.ts), written by `Persistence` as `room-snapshot.json` + `.prev`, atomically):
    where every coloured block, robot, diamond and player's avatar was (grid units; no velocities/fuses — a deliberate fidelity
    trade-off). `Cell.restoreFrom()` makes `MainRoom.init()` skip the fixtures and random scatter and call `restoreItems()`;
    `Zion` then `restorePlayers()` (avatars come back asleep and plugged into their sessions). `SNAPSHOT_VERSION` **must be bumped**
    whenever the room layout or the saved fields change; `validateSnapshot` also checks room size, shapes and bounds, and
    `Persistence.loadSnapshot` falls back to the previous file, then to a fresh room.
  - **Hardening** in `SocketHub` (constructed with `HubOptions { config, address, loginThrottle }`; the defaults are permissive for
    unit tests): per-connection `TokenBucket` message limit, JSON must be an object, key must be a number, callsign rules
    ([callsign.ts](server/callsign.ts): 1–32 letters/numbers + inner punctuation, reserved look-alikes), [LoginThrottle](server/loginThrottle.ts)
    on wrong hashes, capacity via `Zion.isFull()` (`connect: 'full'`), score reports through `Session.claimBlocks` (token bucket),
    Black Box handlers gated on `config.blackBoxEnabled` (also sent as `blackBox` in the full-state payload; the client's
    `Syncer.blackBoxEnabled` gates the backtick key). Refusals are `{ connect: 'denied'|'displaced'|'full'|'throttled'|'invalid'|'reserved'|'inactive' }`.
  - **Capacity**: redraw frames are serialized once per engine step and shared by every connection (`frameCache` in
    `socketHub.ts`) — this took 60 bots from ~95% to ~20% of a core. Bandwidth is the cost: ~8 MB/s to 60 constantly-moving
    players (it grows with players², and every redraw is echoed for 10 frames). `permessage-deflate` shrinks that ~7x but made the
    browser tests lose/delay key messages, so it is off (`server.ts`); the real fix would be interest management.
    `Zion.evictSleepers()` (every 10s) removes avatars asleep without a connection for `CELLWARZ_SLEEPER_EVICT_MINUTES`.
    `Engine.takeStepStats()` feeds `/healthz`. `npm run loadtest` ([scripts/loadtest.mjs](scripts/loadtest.mjs)) and
    `npm run test:restart` ([scripts/restart-smoke.mjs](scripts/restart-smoke.mjs)) exercise a real server.
  - **Client resilience**: `Syncer` reconnects with jittered backoff ([reconnect.ts](src/game/reconnect.ts)), a silence watchdog, re-attaches
    with `jump: false` after the first accepted login, and `GameCanvas` shows `#reconnecting`; it gives up after 2 minutes.
  - **Deploy files**: [Dockerfile](Dockerfile), [docker-compose.yml](docker-compose.yml) (game + Caddy + optional `beta` profile),
    [deploy/Caddyfile](deploy/Caddyfile), [scripts/backup.sh](scripts/backup.sh), `.github/workflows/{ci,deploy}.yml`.
    `rsbuild.config.mjs` doesn't copy `public/` into `dist/` (the server serves it directly).
- **Realtime transport**: a single `ws` `WebSocketServer` (`noServer`, upgrade handled in [server.ts](server.ts)) serving `/socketrefresh`.
  Each connection gets its own [SocketHub](server/socketHub.ts), which polls every few ms and sends one frame right after each engine step (`Engine.getStepCount()`; the frame holds every sprite redrawn since its last one via `Engine.getRedrawSpritesSince` — a free-running second 48 FPS timer used to drift against the engine's, so frames went out unevenly and could skip a step's changes) and speaks
  a small JSON protocol (`connect` / key-down-up) via [jsonGenerator.ts](server/jsonGenerator.ts).
- **Physics/world model**: [CellData](server/cellData.ts) stores sprites in a 2D grid of `Set<Sprite>`
  (`ANIMATION_STEP = 8` px per grid unit). [Physics](server/physics.ts) implements move/push/collision on that
  grid. Sprites (`server/sprite/`) extend the abstract `Sprite`; cells (`server/cell/`) extend abstract `Cell`,
  which populates walls/doors/mana/robots in `init()`. [MainRoom](server/cell/mainRoom.ts) is "the" reusable main
  multiplayer room layout — a fixed (non-random) giant rectangle with long horizontal platform rows, a center
  hole bridged by four straight-up/down stepping-stone columns, scattered decorative blocks, two animated
  `Portal` "stargates" (standing in one and pressing **Up** beams the avatar up for ~0.65s, then warps it to a random other
  room's spawn portal; see "Stargates" below) in the top corners, and one small floating `SpawnPortal` (avatars are deposited/warped-in here) at the bottom center;
  only its coloured-block/`Robot` positions are still randomized per instance (plus three fixed fixture blocks, see
  the e2e note below). MainRoom also **wraps at its edges**
  (`Cell.wrapsAtEdges()` → `CellData` wraps a moved sprite's x/y modulo the grid): the outer walls are kept but have
  openings — two 4-block floor/ceiling ones inset 30 blocks from the end walls, and two per end wall (second- and
  third-platform levels, on a ~12-unit sill so they take a jump to reach) — so leaving through one comes out the
  matching opening on the opposite side. Opening positions are the `*_WRAP_OPENINGS` constants (exported to e2e as
  `WRAP_OPENING_PIXELS`). It's the only room type wired into
  `Zion` today. [SimpleSmallCell](server/cell/simpleSmallCell.ts) (small, fully-random walls) is kept
  around as a fast fixture for unit tests and as the likely starting point for the future randomly-generated
  "side-quest" room mode (see [TODOS.md](TODOS.md)) — it isn't used in production room selection anymore.
- **Wire format is intentionally terse**: `getSprites` in [jsonGenerator.ts](server/jsonGenerator.ts) emits
  `[imageIndex, xPixels, yPixels, extraInfo?]` per sprite keyed by cell index, and `[-1]` means "deleted this
  frame" — this is a size/perf optimization for frequent redraw messages, preserve it when touching this path.
  **Redraw-only frames are the sprite map itself (flat, unwrapped)**; only full-refresh frames (on login/stale)
  wrap it under a `sprites` key alongside `avatars`/`imagePaths` — see `SocketHub.renderClient()`. (The old `tools`
  dashboard payload went away with the "tap into a block" mechanic.)
- **Client** (`src/`, served from `dist/` in production): React app. `App.tsx` switches between `LoginScreen` (the ship-interior
  "login room", see below) and `GameCanvas`. `GameCanvas` owns the `<canvas>` and, in a single `useEffect`, wires up `game/ui.ts` (input),
  `game/renderer.ts` (canvas drawing from server JSON), `game/syncer.ts` (the `WebSocket` connection), and
  `game/analyzer.ts` (perf HUD) — these draw imperatively outside React's render cycle for performance, same
  design intent as the original Backbone views. `GameCanvas` also exposes `window.__cellwarz` (public game state
  only) as a test-only introspection hook for E2E tests (see [e2e/global.d.ts](e2e/global.d.ts)).
- **Login hash & takeover**: the login screen has a plain-text (not masked) `HASH` field (`#loginHash`, "(unprotected)" placeholder). The
  connect message carries `hash`; the first non-blank one a callsign is seen with fixes it via `Session.protect()` (salted sha256, in
  memory; blank = still unprotected) and every later login for that callsign must pass `Session.acceptsPassword()` or
  `SocketHub` answers `{ connect: 'denied' }` and closes before touching the avatar. `Session.attach(owner)` drops the
  previous owner (`SessionOwner.drop()` → `{ connect: 'displaced' }` + close; the last login wins). The client
  (`Syncer.onDenied`/`onDisplaced`) returns to the login screen with a notice; the hash is never put in localStorage.
  There is no rate limiting on guesses yet.
- **No chat**: player-to-player text chat was removed entirely (client input handling, `Cell.postMessage` /
  `MESSAGE_PARAM` on the server) — a different communication system will replace it later. Don't re-add it
  without an explicit request.
- **Emoji bubbles**: number keys 0–9 (`server/ui.ts`, via `digitOfKey`/`NUMBER_EMOJIS` in [emoji.ts](server/emoji.ts), the
  single place to change which emoji a digit shows; no flags/political ones) call `Avatar.showEmoji()`, which keeps one emoji
  for `EMOJI_BUBBLE_FRAMES` (5s of sim time, ticked in `Avatar.process()`; both the start and the end set `needsRedraw`).
  It rides the terse sprite entry's extra info as key `'5'` (like sleeping `'3'`/health `'4'`; full-state and redraw
  frames), so a frame without it clears the bubble. `Renderer.emojis` (sprite id → emoji) is drawn by
  [emojiBubble.ts](src/game/emojiBubble.ts) right on top of the head, with the name tag lifted above it. `Robot` uses the
  same hook: `noticeNewPlayers()` (every `EIGHTH_STEP`) shows 💀 the first time it sees a player name (range
  `SIGHT_RANGE`, line of sight via `canReach` from `blast.ts`), remembered per robot in `seenPlayers`. A dying player calls
  `Avatar.noticePlayerDeath()` on every other avatar (a no-op except in `Robot`, which shows 💀 if within
  `DEATH_NOTICE_RANGE` or in sight). `Robot.die()` scatters `DIAMONDS_PER_ROBOT` (50) diamonds (a planet swallowing a
  robot, `onConsumed`, doesn't). Number keys toggle: pressing the digit whose emoji is already up calls `clearEmoji()`.
  The login screen's `CONTROL_KEYS` lists "0-9 SAY AN EMOJI".
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
- **Coloured blocks ("mana")** (`server/sprite/`): `Mana` is the abstract base (3x3, `OBJECT_LAYER`, mass 1 — light
  enough that an avatar/robot pushes it; 0 while carried). Its own motion model (not `Physics.gravitate`) lives in
  `Mana.stepMotion()`: float velocities `vx`/`vy` (cells/frame, sub-cell remainders carried) on a shared
  [ManaBody](server/sprite/manaBody.ts), gravity 0.1/frame², ground friction (shoves slide a few cells and stop),
  landing restitution 0.5 (bounce height grows with fall height; tiny rebounds settle), moves made one cell at a time
  through `Physics.move`. Shoves arrive through the generic `Sprite.onPushed(x, y)` hook that `Physics` calls after a
  successful push (don't special-case block types in `Physics`). A carried block rides over the avatar's head: the avatar's
  own moves go through `Avatar.moveCarrying()`, which refuses a step that would put the block inside a wall/another block
  (`isSpotOverHeadFree` with an offset), and `adjustHandledMana()` drops the block if an outside shove left no room for it. Subclass hooks: `onFrame()` (runs even while
  carried), `getGravityDirection()`/`getGravityStrength()` (their product is `getGravityPull()`; `ManaBody` sums the members'
  pulls for direction and averages the magnitude), `getSlideDrive()`, `acceptsImpulses()`, `canBondWith()`, `onTouched()` (an
  avatar touched or picked it up — `Avatar.touchAdjacentMana()` scans the one-cell ring around the avatar each frame;
  robots don't), `onImpact(wasThrown)`. Colours → classes: yellow [Thruster](server/sprite/thruster.ts) (reverses
  gravity once touched/picked up, but only at 15% strength; every frame it calls `lift()` on the `Avatar`s/`Mana` touching it
  — a lifted avatar rises one cell per 3 frames instead of falling, so a carrier glides upward; a lifted block feels a faint
  upward pull; both lapse 3 frames after the touch ends). Hitting the underside of a `CellBlock` wall (or the room edge)
  while rising and *not* carried (`onImpact(wasThrown, direction)` — the new `direction` is the vertical hit direction)
  switches the reversal off and marks it `spent`, so only being picked up re-arms it (not an avatar standing beside it) — or standing *on* it: `Avatar.standOnMana()` calls `Mana.standOn()` → `Thruster.onStoodOn()`, which re-arms it, and the avatar's lift glide (`Avatar.riseOneCell()`) drags it up via `followRiderUp()` so it works as an elevator; holding Down (`Avatar.pressDown()`/`releaseDown()`, wired in `server/ui.ts`; ignored while carrying, where Down puts the block down) sets `loweringFrames` so it stops lifting and is lowered, red [Launcher](server/sprite/launcher.ts) (5s fuse then explosion: kill radius
  28 with a line-of-sight check to head/middle/feet, shove radius 30), blue [Ice](server/sprite/ice.ts) (constant
  slide drive, reverses when blocked so it never stops; a driven block with |drive| ≤ 1 steps whole cells on engine frames shared with avatars' run steps, not a free-running fractional phase, so riders/runners don't wobble ±1 cell every frame), green [Shield](server/sprite/shield.ts) (+ [ShieldBubble](server/sprite/shieldBubble.ts)),
  purple [GravityBlock](server/sprite/gravityBlock.ts) (impulses toward itself; `MainRoom` places none for now), orange
  [StickyBlock](server/sprite/stickyBlock.ts) (repels other orange blocks within 24 cells with a fading `applyImpulse` so they spread out, skipping glued group mates; merges `ManaBody`s with adjacent blocks; a stuck block can be carried — `Mana.detachForCarrying()` frees just it, or everything if it is the orange one), rainbow
  [RainbowBlock](server/sprite/rainbowBlock.ts) (right-hand wall-following crawl that wraps corners and falls under gravity when nothing touches it, shatters into [Diamond](server/sprite/diamond.ts)s
  when a thrown one hits something). **Rigid groups**: `Sprite.getRigidGroup()` (generic hook; sticky blocks share a
  body) makes `Physics.move` move all members as one or none, and `Physics.canInteract` ignores group mates.
  `Physics.move` is also guarded against re-entrancy (a `moving` set): a sprite already being moved up the call stack is
  just blocked — two overlapping sprites can each count as "on top" of the other, which used to recurse forever.
  Stable sprites (`isStable()`: wall blocks, the stargates/spawn portal, ghost effects) are never shoved — a mover that touches
  one is just blocked (`Physics.isBlockedBy`). Before this, a planet-pulled `Diamond` (ghost layer, mass 1) pushed the corner stargates
  across the room over time.
  `CellData` keeps a `live` set: `move`/`moveTo` ignore a sprite that was already deleted. Without it a deleted block still
  listed in a stuck group (e.g. a whole group swallowed by the planet before anyone pruned it) was written back into the
  grid every time the group moved — an invisible solid 3x3 block (not in `sprites`, so never sent to clients).
  **Ghost-layer sprites**: visual/effect sprites (`ShieldBubble`, `Explosion`, `Diamond`) use
  `Physics.BACKGROUND_LAYER` (nothing treats it as an obstacle), `melts()` true, mass 0, and `isStable()` true so a mover
  doesn't drag them (a `Shield` re-creates/re-positions its bubble each frame; `Robot`/`Shield` override
  `removePermanently()` to take their prop/bubble with them). Controls (`server/ui.ts`): Space picks up the nearest block the
  avatar touches (`Avatar.pickUpMana`: beside/under/over via `getAdjacentSprites`; a block under the feet swaps places
  with the avatar, any other is `moveTo`'d onto the spot over the head if `isSpotOverHeadFree`, else the next-nearest is tried),
  or throws it if you're carrying one (`Avatar.throwMana`: launch velocity 0.8 forward, -1.5 up, plus the avatar's own recent velocity — measured from its displacement over the last `Engine.HALF_STEP` frames, clamped to ±2 — so running/jumping/falling carries into the throw); Down puts it
  back (`putDownMana`); there is no "tap in"/structure/mana-action/dashboard code any more.
- **Robot rockets**: `Robot` (`server/sprite/robot.ts`) runs a small `idle → drawing → putting-away` state machine
  (`updateRocketAttack`): every `EIGHTH_STEP` frames it looks for the nearest real player (`Avatar.isRobot()` false)
  in range (24–70 cells away, ≤30 cells of height difference) for which `aimAt()` solves a launch velocity and
  `Missile.pathReaches()` (a dry-run of the same integrator the rocket uses) finds a clear arc. It then stops (`aiming` phase) and, after ~0.9s, fires a `Missile` with a launch vector (rocket speed 0.7 cells/frame, re-aiming at
  the target's then-position) and resumes patrolling at once; there is no launcher/bazooka prop or animation (it was removed — the rocket just leaves a point just past the robot's side). `Missile` takes an optional `{ vx, vy }` launch (gravity
  `ROCKET_GRAVITY`) and dies on solid walls/blocks, the round part of a shield bubble and the room's edges; it flies through robots (never exploding on one). On touching a real player or anything solid (wall/block) it explodes via the shared [blast.ts](server/sprite/blast.ts) `detonate()` (also used by `Launcher`: kill radius with line-of-sight, shield immunity, shoves `Mana`, spawns the `Explosion`) with the smaller `ROCKET_KILL_RADIUS` 10 / `ROCKET_SHOVE_RADIUS` 20 — the blast hurts robots too; avatars lose 20% health from the blast (`damage` option, see "Health & ninja stars"), not from the touch. The room's edges and a shield bubble end it without exploding. Client-side, `Renderer.drawSprites` adds [rocketLight.ts](src/game/rocketLight.ts) to every `/projectiles/missile*` sprite — an additive flickering exhaust flame at the tail and a bright light on the tip (facing from the `L` art suffix) so rockets read against dark space. The 23-cell green
  `ShieldBubble` (art: `public/images/effects/bubble.png`, 248px) is clamped inside the room and also makes avatars inside it (`ShieldBubble.isCovered`) immune to `Launcher` blasts.
- **Health & ninja stars**: `Avatar` (incl. `Robot`) has `health` (`MAX_HEALTH` 100). Rockets and ninja stars call `detonate()`
  with `damage: HIT_DAMAGE_PERCENT` (20), which makes it call `Avatar.takeDamage()` (small knockback, `needsRedraw`) instead of
  `die()`; the hit taking health to 0 is a normal `die()`. A red block's blast (no `damage` option) and robot touch still kill
  outright. Shift (`server/ui.ts`) → `Avatar.throwStar()` spawns a [NinjaStar](server/sprite/ninjaStar.ts) (3x3, `EFFECTS_LAYER`,
  1.5 cells/frame with a slight droop (`STAR_GRAVITY` 0.006 cells/frame², ~15 cells over a full flight; a planet's pull adds to it), 72-frame life, never wraps, 20-frame cooldown, max 3 in flight): it explodes on any
  avatar except its thrower (robots included), `LEVEL_LAYER` sprite or `Mana`, via `detonate()` with `STAR_KILL_RADIUS` 6 /
  `STAR_SHOVE_RADIUS` 12 and `small: true` → [SmallExplosion](server/sprite/explosion.ts) (14 cells, own art
  `effects/explosion/small1..6`); a `ShieldBubble` swallows it. Like `Missile`, it must override `getDefaultAction()` (the
  `Sprite` constructor reads it before subclass fields exist). Client-side, a star is *on fire*: [starFire.ts](src/game/starFire.ts) draws an additive flickering halo with flame tongues over every `/projectiles/star*` sprite, `neonSprites` gives it an orange glow, and `Renderer` spawns `ParticleSystem.spawnSparks()` embers at it on every position update so a trail of sparks hangs along its arc. Wire: key `'4'` = remaining health percent, sent on any
  `Avatar` below 100 (redraw and full-state frames alike); client `Renderer.health` → [damage.ts](src/game/damage.ts)
  `damageStage()` (0–4) → `NeonSprites.actor(..., damage)` bakes `applyDamage()` wounds into the body (separate cache table per
  stage). Stars/avatar art: `public/images/projectiles/star1..4.png`. Only five alive looks exist (100/80/60/40/20%), the
  sixth state is death. `Renderer.onExplosion` scales burst/shake for the small art.
- **Death feedback**: `Avatar.die(knockbackXDirection?, knockbackYDirection?, cause?)` takes an optional knockback
  direction (explosions, including rocket blasts, knock back away from the blast; robots away from themselves) applied via one
  `Physics.move` before `removePermanently()` — death is still a single hit, this only adds physicality to it.
  `cause` (a [DeathCause](server/deathCause.ts): `'blast' | 'rocket' | 'star' | 'planet'`, passed through
  `BlastOptions.cause` / `takeDamage`) is recorded on the `Session` and rides the death ping as
  `{ died: true, cause }` so the death card can say how to avoid it (robot assimilation names none).
  A dead player **spectates** instead of freezing: once their session unplugs, `SocketHub.renderClient()` keeps
  streaming the room (it remembers the last `cell`) and sends a one-shot `{ died: true }` followed by one full
  refresh (no local avatar; `following` = their robot body's cell index, or null). The client reacts in
  `Renderer.onLocalAvatarDeath()` (flash/shake/sound) and the refresh picks a `SpectatorMode` (`'following'` the
  robot body, else `'free'` at the last camera centre; `onSpectatorChange` drives the `#spectator` message in
  `GameCanvas`). Arrow keys pan the free camera (and hand a following camera over to the player); if the followed
  robot is destroyed the camera stays put. Everything else keeps moving; Escape leaves as always. Planet
  swallowing (`Avatar.onConsumed` → `die()`) takes the same path.
- **Client netcode smoothing & "juice" layer** (`src/game/`, all purely cosmetic — none of it changes actual
  positions/collision outcomes, which stay 100% server-authoritative): `Renderer` runs its own
  `requestAnimationFrame` loop, independent of message arrival, that exponentially smooths every sprite's
  drawn position toward its latest known server position (two cascaded exponential stages of `SMOOTHING_TAU_MS`, since one left a visible speed ripple on a steady glide arriving as 8px steps) instead of snapping to each new
  snapshot; `prediction.ts`'s `LocalPredictor` (it keeps a `lead` offset from the server x, so with nothing predicted — no key held, e.g. riding ice — the avatar is drawn exactly at the server x; it used to lag behind a fast server and trip its own snap threshold every few frames, which is the jitter seen in a debug recording) additionally predicts the *local* avatar's left/right movement
  the instant a key is pressed (softly reconciling against the server a few frames later, snapping instead on a
  large mismatch) since the client has no collision geometry to predict jumps/pushes against (it stops predicting
  once the server's x has stalled for ~80ms while a direction is held, so running into a wall doesn't overshoot and
  slide back — only *new headway* in the held direction counts, so a server x that merely wobbles, e.g. against a moving ice block, doesn't count as progress — and it predicts at the server's observed pace when that is faster than a run, as when riding a block). `audio.ts`
  synthesizes short WebAudio blips (no audio asset files were added) and `particles.ts` draws small dust/impact/
  warp bursts, both triggered by diffing incoming sprite positions/deletions (e.g. an avatar sprite disappearing
  ⇒ impact burst; a rendered avatar's y going from falling to flat ⇒ landing dust). **Important**: any state that
  actual game logic or tests depend on (the `sprites`/`avatars` maps) is mutated synchronously as messages
  arrive, never lazily from the `requestAnimationFrame` callback — that loop is throttled/paused by the browser
  for backgrounded/unfocused tabs (this bit a Playwright test with two browser contexts during development;
  see the git history on `src/game/renderer.ts` for the fix), so anything logically load-bearing can't depend
  on it actually running.
- **The Black Box (backtick)** — the in-game flight recorder; "check the Black Box" means read
  `black-box/latest.json` (`src/game/blackBox.ts`, `server/blackBoxStore.ts`, `server/blackBoxDump.ts`):
  `attachInputHandlers` turns the backtick key into `onToggleBlackBox` (never sent to the server). `BlackBox` (owned by
  `GameCanvas`, set on `syncer.blackBox`) snapshots `renderer.snapshot()` at start (sprites plus the per-sprite
  sleeping/health/emoji/shrink state, looks and planet — everything redraw frames build on) and sends `{ blackBoxStarted }`;
  then `Syncer.handleMessage`/`sendKey` log every incoming message (deep-cloned: the renderer keeps parts of full-state
  payloads) and key press with timestamps; it auto-stops at `MAX_BLACK_BOX_MS` (10s), on a second press, or on leaving the
  game. The finished recording goes up the socket as `{ blackBox }`. Because the terse wire format has no sprite class,
  mass or velocity, the **server** adds ground truth: `SocketHub.handleBlackBoxStarted` stores `dumpSprites(cell)` and
  `handleBlackBox` (login required) attaches `server: { startSprites, endSprites }` (every sprite's id = cell index, class
  name, x/y in grid units, size, layer, mass, removed, plus `Sprite.getDebugState()` — a generic hook `Mana` overrides with
  vx/vy/group size) before `saveLatestBlackBox()` writes the single git-ignored `black-box/latest.json`
  (`CELLWARZ_BLACK_BOX_DIR` overrides; 25MB cap), overwriting the previous one so only the latest is kept. To analyze a bug
  report: read that file — `initial` is the client's starting state, `events` the `message`/`key` timeline, `server` the
  authoritative sprite dumps. (When adding sprite state worth debugging, expose it through `getDebugState()`.)
- **Login room** ([LoginScreen.tsx](src/components/LoginScreen.tsx), [loginRoom.ts](src/game/loginRoom.ts)): the login
  screen is a client-only 960x540 "inside a huge ship" scene (hull panels, ceiling lights, a viewport onto stars and a
  planet, hazard-striped floor) drawn on `#ship-canvas`, scaled to fit the window (canvas resolution follows the scale;
  the DOM panels/labels sit in a 960x540 `.ship-overlay` that is CSS-scaled the same amount). `RoomAvatar` (pure, unit
  tested) walks/jumps on a flat floor; the avatar is baked with the in-game [neonSprites](src/game/neonSprites.ts) so
  it wears the picked colours. Three transporters stand on the floor with DOM button labels over them: **TELEPORT**
  (`#teleport`, always), **HOME** (`#home`, always; leads to `HOME_URL` from [homeUrl.ts](src/game/homeUrl.ts), build-time
  `PUBLIC_HOME_URL`, default https://djrecognize.com) and **WAKE UP** (`#wakeup`, only while the typed callsign has a living avatar
  in the room, read from the radar's `avatars`). A pad is used by **pressing Up while standing on it** — `LoginRoom.setKey('jump', true,
  repeat)` consumes a fresh press on a pad (no jump; a held/auto-repeated Up never fires one, and the press stays consumed until
  released) — or by clicking its label; either calls `LoginRoom.useTransporter()`: a 650ms beam-up effect (a `setTimeout`, not the rAF
  loop, so a throttled background tab still proceeds), then `onEnter(name, jump = pad === 'teleport', look)` (HOME navigates with
  `window.location.assign` instead). No callsign ⇒ TELEPORT/WAKE UP don't fire (`onBlocked`); HOME needs none. The avatar starts at
  `START_X`, between WAKE UP and HOME, on no pad. The pad/cone/beam drawing lives in [transporterPad.ts](src/game/transporterPad.ts),
  shared with the in-game stargates. Arrow keys always drive
  the room avatar (also while the name field is focused). The last callsign/colours persist in localStorage
  ([look.ts](src/game/look.ts) `loadSavedLogin`/`saveLogin`). `window.__cellwarzLogin` (`{ room, radar }`) is the
  test-only hook.
- **Stargates (in-game transporters)**: `Avatar.attemptJump()` (the Up key) first checks `beamUpFromPortal()` — grounded and overlapping a
  `Portal` — and if so starts a `BEAM_FRAMES` (31) beam instead of jumping: `doAction()` holds the avatar still, re-flags it for
  redraw each frame, and at the end calls `portal.warpRandomly(this)`; `fallAsleep()` cancels. Walking into a portal does nothing
  (and robots no longer warp). The beam progress rides the avatar's terse entry as extra key `'6'` (`BEAM_KEY` in
  [jsonGenerator.ts](server/jsonGenerator.ts) / [beam.ts](src/game/beam.ts)); `Renderer.beams` stretches/fades the sprite and draws the
  white column, and `vanishing()` (beams or planet shrinks) hides the name tag, emoji bubble and local prediction. The client draws
  every stargate sprite as the login pads' look (`drawStargatePad`) instead of its server art.
- **Login radar / spectator connection** ([radarPreview.ts](src/game/radarPreview.ts)): `RadarPreview` opens its own
  WebSocket sending `{ connect: true, spectate: true }`; `SocketHub.handleSpectate()` sends the main room's full state
  and then `renderSpectator()` streams the flat redraw frames and planet pings — no login, `Session`, avatar, score or
  inactivity cut-off (the spectator hub has `login` undefined, so keys/scores are ignored). The client feeds them into
  the same [Minimap](src/game/minimap.ts) the game uses and keeps `avatars` (name → sprite id) current from frame
  extras, which is also how "WAKE UP" availability and the pilots/robots readout are known. It reconnects on close and
  stops when the login screen unmounts; a later `connect` with a `login` turns a hub back into a normal player hub.
- **Avatar colours (headband/belt)**: the ninja art's red pixels are the headband (rows above `BELT_MIN_Y` = 20) and the
  belt (rows below); `recolorActorParts` colours them separately and `NeonSprites.actor(..., look)` bakes/caches a copy per
  look (one glow layer per part). A `Look` is `{ headband, belt }` hex strings. The client sends `headband`/`belt` on the
  `connect` message; `parseLook()` ([server/look.ts](server/look.ts), mirrored by [src/game/look.ts](src/game/look.ts))
  validates both and rejects anything malformed or robot-red (`isRobotRed`: hue within 20° of red, saturation ≥ 0.5, value
  ≥ 0.35 — pink/orange/dark reds pass). A `connect` message states the look outright (none/invalid ⇒ cleared back to
  default tints; a key press reviving an idle player does not touch it). It lives on `Session` (`setLook`, survives respawns;
  `Session.looksRevision` bumps on change). Everyone gets `looks` (name → [headband, belt]) in the full-state payload plus a
  one-shot `{ looks }` message when the revision changes (like `planet`/`diamonds`, never a key in the flat redraw frames).
  `Renderer.looks` maps names to colours; robots (incl. a player's assimilated body, not in `avatars`) never wear one.
- **Teleport = random floor spot** (`Cell.addAvatarAtRandomFloor`, used for every new avatar from `SocketHub.handleLogin`;
  `Portal` warps still use `addAvatarAtEntrance`): picks random (x, y), drops straight down over empty grid cells, and
  accepts the landing only if the inner footprint columns rest on something, everything in the one-cell ring around the
  avatar is a `CellBlock` (no blocks/portals/avatars) and no robot is within `ROBOT_SAFE_DISTANCE` (24 cells); after
  `RANDOM_FLOOR_ATTEMPTS` failures it falls back to an entrance. `CELLWARZ_RANDOM_TELEPORT=off` (set by Playwright) makes it
  use the entrances so e2e specs have deterministic spawns.
- **Learning to play (discoverability, all client-side/cosmetic)**: there is no chat or tutorial level, so teaching lives
  in the screens players already see. [hints.ts](src/game/hints.ts)'s `HintSystem` (owned by `Renderer.hints`,
  rendered as `#hint` by `GameCanvas`) shows one first-run prompt at a time (`move` → `grab` → `carry`), driven by
  `Renderer.updateHints()` (every ~100ms from the raw server sprite positions: a `/mana/` sprite within the avatar's one-cell
  ring = touching, one sitting on its head = carrying — mirrors `Avatar.getHandledManaX/Y`) plus `onLocalKey`. Each prompt ends when the
  player does what it asks and is remembered in `localStorage` (`cellwarz.hints.done`). The login screen's
  [controlsDemo.ts](src/game/controlsDemo.ts) is a looping grab-and-throw clip on `#controls-demo` (`demoFrame(t)` is a pure
  function of time, so it is unit-tested) next to key caps, and `#legend` ("block index") is a static list in
  [LoginScreen.tsx](src/components/LoginScreen.tsx) (`BLOCK_LEGEND`: keep it in step with the blocks MainRoom scatters and
  what they do). The death card ([deathCause.ts](src/game/deathCause.ts) `describeDeath`) turns the server's `cause` into
  `#death-cause`/`#death-tip` under "YOU DIED". Remaining ideas are in [TODOS.md](TODOS.md).
- **Mobile controls (touch devices only, landscape only)**: [touchDevice.ts](src/game/touchDevice.ts) `isTouchDevice()` is
  `(pointer: coarse)` (or `?touch=1`/`?touch=0`); [index.tsx](src/index.tsx) adds the `touch-device` class to `<html>` and every
  touch-only rule in [cellwarz.css](src/styles/cellwarz.css) hangs off it (or off `#touch-controls`/`#rotate-prompt`, which only
  render on touch), so the desktop layout is untouched — keep it that way. [TouchControls.tsx](src/components/TouchControls.tsx)
  is a DOM gamepad over the canvas (plain `div`s, not `<button>`s — a focused button would fire on Space) that sends the
  *same key codes as the keyboard* through `GameCanvas`'s shared `sendKey` (server message + `renderer.onLocalKey`), so the server
  has no mobile code. [touchKeys.ts](src/game/touchKeys.ts)'s `TouchKeyState` maps pointer ids → keys (a key is down while any
  finger holds it; `releaseAll()` on blur/pagehide/hidden/spectator change/unmount so nothing sticks); the run pad is one element whose
  left/right half is re-evaluated on `pointermove` under pointer capture. The Action button's label comes from
  `Renderer.onCarryingChange` (GRAB/THROW) and the spectator mode (WAKE). `pressEscape()` in [ui.ts](src/game/ui.ts) is shared
  by the Escape key and the ☰ button; the old swipe/tap handlers are gone. `App` mounts `RotatePrompt` (portrait overlay,
  pure CSS `@media (orientation: portrait)`) and asks for fullscreen + landscape lock on the first tap (`enterImmersiveMode`, once;
  no-op on iOS). `Renderer.resize()` (wired only on touch) keeps canvas/camera in step with the window, and
  `Renderer.unlockAudio()`/`AudioManager.unlock()` resume WebAudio on every tap. `HintSystem` takes a `touch` flag that re-words
  its prompts. `TOUCH_CONTROL_KEYS` in `LoginScreen` mirrors `CONTROL_KEYS` for the login key caps. Known gaps: no
  `viewport-fit=cover`/safe-area insets, no PWA manifest (iOS "Add to Home Screen"), the login panels are just scaled down, the
  controls clip's badge still says `[SPACE]`, and the starfield isn't repopulated after a resize.
- **Leaving the game (Escape)**: `ui.ts` handles Escape itself and sends key-up for the movement keys first. While the
  avatar is alive (`Renderer.canFallAsleep()`) the *first* Escape sends key 27 (`ESCAPE_KEY`, [server/ui.ts](server/ui.ts)
  → `Avatar.fallAsleep()`) and the player becomes a spectator of their sleeping avatar (`SpectatorMode` `'asleep'`: the
  same free camera as after a death, entered when the server flags the local avatar asleep). Any Escape while dead,
  assimilated, asleep or without an avatar calls `onExit`, which `App` wires to clearing the session so the login
  screen shows again; `GameCanvas`'s cleanup closes the socket and stops the renderer. The avatar stays in the room
  (same as closing the tab, see the `Session.unplug()` TODO) and the WAKE UP transporter with the same name picks it back up.
- **Sleeping avatars** (Escape, closed tab or lost connection while alive): each `SocketHub` claims its `Session` on
  login (`Session.attach(hub)`) and releases it when its socket closes (`Session.detach(hub)` — ignored if a newer
  connection already took over, so a quick reattach/reload can't put the fresh session to sleep). Detaching calls
  `Avatar.fallAsleep()` (clears run/slide; sleepers stay in the room indefinitely on purpose — only death or the planet removes them; the avatar just stands, or finishes falling, and **stops animating**:
  `animate()` is false, frozen on frame 0) and attaching calls `wakeUp()`. `UI.reactTo` ignores every key for a
  sleeping avatar except Space, which calls `wakeUp()` (the player, still spectating it, takes control again; the client
  leaves `'asleep'` mode when the flag drops from the next frame). A dead player has no avatar, so nothing sleeps. The flag rides the terse sprite entry's extra info as
  key `'3'` (`jsonGenerator.ts`; sent in redraw *and* full-state sprites so a client joining mid-nap sees it at once).
  Client-side (cosmetic): `Renderer.sleeping` leans the sprite forward around its feet with a slow breathing sway,
  [sleepFace.ts](src/game/sleepFace.ts) paints its eyes (the light pixels in the head art) shut, and
  [sleepZs.ts](src/game/sleepZs.ts) floats small bright, fading "Z"s up from the head; a frame without the flag wakes it.
  The local predictor ignores key presses while the local avatar sleeps.
- **Minimap** (`src/game/minimap.ts`, drawn by `Renderer` onto its own `#minimap-canvas`; open/closed toggle is
  React state in `GameCanvas`): the wire format has no sprite type, so walls vs. avatars/robots are classified
  from the image path (`/blocks/` vs `/me/`), and a robot is an actor sprite whose id isn't in `avatars` (robots
  never send a name). The wall layer is cached and only rebuilt when a wall sprite appears/disappears.
- **Spinning stargates** (cosmetic): `Renderer.drawSprite` rotates the corner `Portal` art (`/doors/stargate/`,
  [stargateSpin.ts](src/game/stargateSpin.ts)) around its centre once per `STARGATE_SPIN_PERIOD_MS` (4s) from the
  render loop's clock, so it turns smoothly and constantly regardless of the server's 8-frame swirl animation.
- **Level backdrops** (`Cell.getBackground()` → `'space' | 'station' | 'temple'`, sent as `background` in the full-state
  payload and applied in `Renderer.setBackground()`): `MainRoom` uses `'station'` — [spaceBackground.ts](src/game/spaceBackground.ts),
  a starfield plus drifting neon tetrominoes ported from the daat/DJ Recognize site, drawn on the game canvas before
  sprites, with a [stationBackdrop.ts](src/game/stationBackdrop.ts) parallax layer slotted in between the stars and the
  pieces (ship traffic; `'space'` is the same without that layer); pieces live in world coordinates (the server sends
  `worldWidth`/`worldHeight`) and shatter into flying
  cells when any avatar's rect overlaps them (the site's mouse-hover became avatar-touch); stars are a
  screen layer that slowly drifts in one shared random direction. `MainRoom` also has five tall ceiling lamps (`Cell.getLamps()`, sent as `lamps`;
  [lamps.ts](src/game/lamps.ts)) casting bright neon (cyan/magenta/amber), floor-fading triangular light beams drawn behind the sprites that sway back and forth (alternate
  lamps opposite, so neighbours briefly overlap), so
  the black ninja actors (avatars, robots) read against them and vanish into the dark outside them (players can
  hide). Name tags are neon cyan and centered over the sprite. Purely cosmetic. `'temple'` (the DOM `#canvas-bg`
  image) is the `Cell` default, kept for the future randomly generated rooms.
- **Background TVs** (`Cell.getTvs()` → `tvs` in the full-state payload; [tvs.ts](src/game/tvs.ts), drawn by
  `Renderer` after the lamps and before the sprites — screens emit their own light, so a lamp beam's additive glow
  mustn't tint them): `MainRoom` has 4 world-space 9:16 screens, each hanging by two chains (`chainTopY`) from the platform row
  directly above it: two on floor 1 (one avatar height below band center) and two on floor 3 (floors count up from
  the spawn floor; floors 2 and 4 have none, nor does the spawn portal area).
  One shared muted `<video>` (kept in the DOM, invisible, since some browsers stop decoding detached videos) is
  drawn into every visible TV with `drawImage`; it is paused whenever no TV is on screen. It does **not** loop: when it
  ends every TV shows a plain white "YOUR AD HERE" on black for `AD_DURATION_MS` (5s), then a *different* randomly picked video (`pickVideoIndex`, never the one that just
  played) plays from its beginning; `loadNext()` swaps the element's `src` the moment the last one ends so the next file buffers during the ad. The rotation is the `VIDEO_NAMES` list in tvs.ts
  (`imu_full`, `mami_full`, `sapphire_city_full`; a file that errors is skipped). Only the first play (on load) picks a random video and seeks to `randomStartTime()` — a random point at least 10s before the end. The TVs
  show "NO SIGNAL" if no source can be decoded. Each client plays
  independently (no synced playback). Videos are served from `public/videos/` via a `/videos` Express route (and an
  rsbuild dev-proxy entry) — a WebM copy exists because Playwright's Chromium has no H.264. The full-size masters live in
  git-ignored `media-src/`; regenerate each web copy (all are 720x1280 portrait masters) with
  `ffmpeg -i media-src/IMU_FULL.mov -an -vf scale=360:640,fps=24 -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 30 -preset slow -movflags +faststart public/videos/imu_full.mp4`
  and `... -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 -cpu-used 4 public/videos/imu_full.webm` (likewise `MAMI_full.mov` → `mami_full.*`,
  `SapphireCityMusicVideo_FULL.mov` → `sapphire_city_full.*`). To add a video, drop both copies in `public/videos/` and add its name to `VIDEO_NAMES`. The ad/contact slots between
  videos (see TODOS.md) are intentionally not built yet.
- **Block-spitting flower** ([flower.ts](server/sprite/flower.ts), art in `public/images/flower/`): MainRoom hangs one from the
  ceiling just right of the middle lamp (`FLOWER_PIXELS`). A ghost-layer, mass-0 `Sprite` (not a `Mana`) whose `doAction()` counts
  down `SPIT_INTERVAL_FRAMES` (30s), then creates a random kind of block (`BLOCK_KINDS`, no purple) at its mouth and
  fires it with the new `Mana.eject(vx, vy)` — like `launch()` but without the thrown flag, so a rainbow block doesn't shatter on
  landing. Angle is uniform over the half circle below it, speed 1–3 cells/frame, and is picked one second ahead (`CHARGE_FRAMES`): the head
  turns to face it using pre-drawn poses (`flower/charge/<deg>_1..2`, `flower/spit/<deg>`, every 15° from 0 = right through 90 = down to 180 =
  left; the wire format only carries an image index, so a turn is a frame swap — regenerate the art if the head design changes) and the
  block is created at the mouth for that angle (`HEAD_PIVOT`/`MOUTH_DISTANCE`, inside the flower's own box, so `isClear()` ignores the
  flower rather than using `cellInit` clustering). A mouth that's occupied waits for a clear frame.
  There is deliberately no cap on blocks in the room (to be addressed later). `MainRoom` passes `randomBlocks` as the flower's `spitsBlocks`, so `CELLWARZ_RANDOM_BLOCKS=off`
  keeps it decorative for e2e. Client: a glow color in `glowColorForPath`, plus the flower's **ceiling hue and vines**
  ([vines.ts](src/game/vines.ts)): `Cell.getVines()` (MainRoom only, `vines` in the full-state payload) gives the stem's x, the ceiling
  wall's top/lower-face y, the x span (MainRoom: only the ceiling over the central opening, `CENTER_OPENING_PIXELS`, about one screen),
  any `gaps` inside it (no wall, so nothing is drawn across them) and `noHanging` spans (flower, lamp fixtures); `VineField` washes the
  wall blocks over that span (minus gaps) with a translucent dark green gradient (fading at the span's ends; no roots are drawn over the
  blocks any more, so they blend in) and grows seeded-deterministic hanging vines below it,
  and `Renderer.drawSprites` draws the wall blocks first, then the hue/vines, then everything else so actors stay on top. Cosmetic only.
- **Cyberpunk look (all client-side, cosmetic)**: [neonSprites.ts](src/game/neonSprites.ts) re-skins art at load time
  with no new assets — wall tiles become dark steel with a neon rim, the red headband on every `/me/` frame is recolored
  and given a glow halo (cyan = local avatar, magenta = other players, red = robots; both avatars and robots use the
  same `me/` art so each tint gets its own baked copy), and portals/pickups/projectiles get a `shadowBlur` glow chosen
  from the image path (`glowColorForPath`). [postFx.ts](src/game/postFx.ts) adds a downscaled bright-pass bloom to the
  whole frame and a short RGB-glitch burst on warp/death. A CSS `#crt` overlay (scanlines + vignette), a monospace
  HUD (score marked with a 🪩 emoji via CSS `::before`, with a digit-scramble on change, `RADAR` minimap with a sweep bar) and the ship-room login
  screen are in [cellwarz.css](src/styles/cellwarz.css); [audio.ts](src/game/audio.ts) uses bitcrushed/filter-swept
  synth sounds plus a quiet synthwave ambient bed that starts on the first sound and is torn down by
  `AudioManager.dispose()` from `Renderer.stop()`. There is no gray "stale" screen any more: when the server stops
  streaming an idle player (`connect: 'inactive'`, ~1 minute without a key), `Syncer.onInactive` makes `GameCanvas`
  take the same exit as Escape (back to the login screen; the avatar stays in the room, WAKE UP picks it up).
  `Syncer.handleMessage()` is public so e2e can feed it that message; `window.__cellwarz` also exposes `syncer`.
- **Gas giant planet** (`Cell.usesPlanets()`, MainRoom only; server [planet.ts](server/planet.ts), client
  [planet.ts](src/game/planet.ts)): `PlanetField` keeps one planet at a time crossing the room (random size/speed/
  height/direction/`seed`), stepped from `Cell.process()`, replaced by a new one once fully off the far side. It
  is not a `Sprite` (no grid presence/collision); its pull is applied each step to sprites whose
  `isAffectedByPlanets()` is true (Avatar incl. Robot, every Mana subclass except the rainbow block, and `Diamond`) via ordinary `Physics.move`s with a
  per-sprite fractional accumulator, so walls/mass still block it. Range = 6 avatar heights from the surface,
  quadratic falloff, peak `MAX_PULL_PER_FRAME` = 0.55 grid units/frame at the surface (below gravity's 1, so outside
  the planet it never lifts anything); *inside* its disc the pull is a flat `INSIDE_PULL_PER_FRAME` = 1.2 (client
  pieces: `PLANET_PIECE_ACCEL_INSIDE`). An upward pull weaker than gravity is ignored to avoid floor jitter, so only the
  inside pull can lift a sprite, so the planet's centre may go as low as `MAX_Y_FRACTION` = 93% of the room height: that lets its
  disc reach MainRoom's bottom floor (surface at 96%), which is otherwise unreachable and where everything piles up. It is the
  room's only cleanup, so anything that can multiply must be pullable or capped (the flower stops making rainbow blocks at
  `MAX_RAINBOW_BLOCKS` = 10, since the planet ignores them; robots are not capped). A sprite whose centre gets within `CORE_RADIUS_FRACTION` (0.15) of the planet's radius from
  its centre is *swallowed*: `PlanetField` tracks it in `consuming`, `advanceConsumed()` slides it to the (moving)
  centre with `Physics.moveTo` over `CONSUME_FRAMES` (1s) while `Sprite.setConsumeScale()` goes 1 → 0 (and
  `Sprite.process()` skips `doAction()` so its own gravity/AI/input stop), then `Sprite.onConsumed()` runs
  (default `removePermanently()`; `Avatar` overrides it to `die()`). The scale rides the terse redraw entry's extra
  info as key `'2'` (`jsonGenerator.ts`); `Renderer.shrinks` stores it and `drawSprites` scales around the sprite
  centre (name tag hidden, local prediction off meanwhile). Wire: `planet` in the full-state payload plus separate `{ planet }` messages (on a new
  planet id and every 2s) from `SocketHub` — deliberately *not* a key in the flat redraw frames. The client
  extrapolates from `vx`/`vy` (advanced in `SpaceBackground.update`) and snaps on each resync; the look (palette,
  bands, ring) is derived from `seed`. Background tetrominoes are pulled/swallowed client-side
  (`SpaceBackground.pullPiece`/`consumePiece`: reaching the core shrinks it away over `PLANET_CONSUME_MS`, no shards); the minimap draws it in amber. Flying projectiles (`Missile`, `NinjaStar`) keep their own exact-position integrators, so they aren't in the `isAffectedByPlanets()` loop: each frame they ask `Cell.getProjectilePlanetAcceleration()` (→ `PlanetField.projectileAcceleration`, the same pull × `PROJECTILE_PULL_SCALE` 0.1, cells/frame²) and add it to their velocity (a star now has `vy` too); they are never swallowed, and `Missile.pathReaches` (robot aiming) ignores the pull. `CELLWARZ_PLANET_PULL=off` disables only the server
  pull (Playwright sets it for its own server).
- **Diamonds** (`#diamonds`, under the score, marked with a 💎 via CSS `::before`): `Diamond.collect()` credits
  `Session.addDiamonds` for the first real player (not a robot) overlapping it; `SocketHub` sends `{ diamonds: n }` as a
  separate one-shot message when the count changes (and `diamonds` in the full-state payload) so the flat redraw frames
  stay untouched. `Session.plugin()` must `setSession` on the new avatar (warp/respawn make fresh ones) or diamonds can't be
  collected. Redraw frames only carry sprites flagged `needsRedraw`, which a new sprite isn't until it moves, so the
  `Diamond` constructor flags itself (found via the Black Box: two diamonds that spawned wedged in were collected without
  the client ever being told they existed, so they were invisible and nothing flew to the HUD). Client-side, a diamond sprite deleted next to the local avatar spawns a [DiamondFlight](src/game/diamondFlight.ts)
  flyer that arcs to the HUD; `Renderer.diamonds` is the server's total and `shownDiamonds` (what the HUD displays)
  catches up as each flyer arrives (`setDiamonds()` never jumps the HUD; it also catches up after 1.5s if nothing flew).
  Explosions are detected client-side by new sprites whose
  image path is under `/effects/explosion/` (bang, sparks, a distance-faded shake). New block/effect art lives under
  `public/images/{mana/*,effects}` (generated from the original yellow/red tile art by hue-shifting; frame names
  follow `addAction`: `name1..N`, mirrored frames get an `L` suffix).
- **Disco shards leaderboard** (money = the score, shown on the login screen as "Disco shards"; the in-game HUD stays just
  the 🪩 number): [leaderboard.ts](server/leaderboard.ts) `topScores()` ranks the `Zion` hardlines' scores (top 3, zeros left
  out). It only goes to login-screen spectator connections, as a one-shot `{ leaderboard: [[name, shards], ...] }` message
  (on connect, then on change, checked ~1s in `SocketHub.sendLeaderboardIfChanged`) — never in the flat redraw frames;
  `RadarPreview.leaderboard` stores it and `LoginScreen`'s `#leaderboard` panel (under the viewport window) renders it. The login room draws its avatar/beam/particles on a second transparent canvas (`#ship-front-canvas`,
  `LoginRoom`'s optional third constructor arg, `pointer-events: none`) stacked above the DOM panels so the avatar walks in
  front of the leaderboard.
- **Score** (top-right `#score` DOM element): when the *local* avatar shatters a background piece, its shards
  (`collect` shards in [spaceBackground.ts](src/game/spaceBackground.ts)) burst out, then home in on the HUD
  (converted to world coordinates by the camera offset) and are counted on arrival; `Renderer` adds 20/block and
  reports `{ scored: n }` over the socket. The server (`Session.addBlocks`, `POINTS_PER_BLOCK`) keeps the
  authoritative per-user total, sent back as `score` in the full-state payload. The old top-left analyzer text
  was removed (`Analyzer` still exists but is no longer drawn).
- **Crouch & look-down**: while grounded with Down held (`pressingDown`, not carrying a block), `Avatar.doAction` plays
  `CROUCH_*_ACTION` (single frame `me/crouch[L].png`, made by cutting the thigh rows out of `stand1` — same frame size and
  red headband so `neonSprites` tints it like every `/me/` frame; hitbox unchanged). Client-side, `Renderer.onLocalKey`
  feeds Down into [lookDown.ts](src/game/lookDown.ts), which after 250ms scrolls the camera down up to a quarter of the window
  height (cosmetic only; `computeCameraOffset` adds it for alive players only and the base `lastCameraCenter` excludes it).
- **Stand animation already exists**: `Avatar`'s `STAND_LEFT_ACTION`/`STAND_RIGHT_ACTION` already cycle through
  6 art frames (`me/stand1..6`) at `Engine.QUARTER_STEP` — there's no "frozen idle" gap to fill.

## Build / run

- Two dev processes: `npm run server` (Express + `ws` on :8080) and `npm start` (rsbuild dev server on :3000,
  proxies `/socketrefresh` and `/images` to :8080). `npm run dev` runs both together via `concurrently`.
- `npm run build` — production client bundle to `dist/`. `npm run serve` — runs the server serving that build
  (a local single-process deploy). Real deploys use the Docker image + Caddy on a VPS: see [DEPLOY.md](DEPLOY.md); CI is
  `.github/workflows/ci.yml` (typecheck, unit tests, build, restart smoke test, Playwright) and `deploy.yml` is a manual SSH deploy.
- `npm run typecheck`, `npm run test:restart`, `npm run loadtest` — see [README.md](README.md). Set `CELLWARZ_API_PORT` /
  `CELLWARZ_WEB_PORT` to run Playwright beside an already-running dev server on the default ports.
- `npm run test:unit` — Vitest, for engine/physics logic (`server/__tests__/`).
- `npm test` / `npm run test:e2e` — Playwright browser tests (`e2e/`); see [WORKFLOWS.md](WORKFLOWS.md) for the
  workflow-to-test mapping. `playwright.config.ts` auto-starts both dev processes via its `webServer` array (it reuses ones already running on
  those ports — which then lack its test-only env flags).
- Node version: see [.nvmrc](.nvmrc).

## Conventions & gotchas

- `Cell` subclasses usually only override the small set of abstract sizing/spawn-count methods (see
  [SimpleSmallCell](server/cell/simpleSmallCell.ts)); prefer that for new room types. A subclass that needs a
  fully custom, deterministic layout (like [MainRoom](server/cell/mainRoom.ts)) can instead override `init()`
  itself — `Cell.entrances` and `Cell.getRandomX`/`getRandomY` are `protected` specifically to support this.
  `Cell.addAvatarAtEntrance` picks a random entry from `entrances` (an avatar can be deposited at any of them,
  e.g. MainRoom's two `SpawnPortal`s), not just a single fixed spot. `Cell.initSprites()` registers every sprite
  type's art (keep it the single place, in a fixed order), and `Cell.spawnPickupsAndRobots()` scatters the blocks and
  robots from the `getNum*()` counts (the newer block kinds default to 0 in `Cell`; MainRoom overrides them).
- Known pre-existing quirk, worth knowing when debugging block interactions: `CellData.adjustClipping` removes the wrong
  column/row (off by one) when a frame is clipped on the right/bottom, so a standing avatar's map footprint has a
  phantom extra column beside it. Effect: a block directly beside an avatar can be held down/up by it (a risen yellow
  block won't rise until the avatar steps away). Left alone on purpose (unrelated, touches all avatar collisions).
- Sprite subclasses under `server/sprite/` follow a consistent pattern: static `init(CellData)` registers
  animation frames/images once per cell (shared static `Map`, not per-instance — this only stays correct because
  every `CellData` registers images in the same deterministic order), instance constructors take
  `(x, y, cellInit, cell)` and can throw `ClusteredInitException` if the spawn position is occupied.
- Circular-import safety: the sprite/cell/engine/physics modules reference each other in both directions (e.g.
  `Cell` constructs sprites, sprites read back `cell.getWorld()`/`cell.getEngine()`). This only works because
  every "back-reference" is a **type-only import** (`import type`), which is erased at build time — never
  change one of these to a value import without checking the dependency direction first.
- Because every login shares the one `MainRoom` and avatars are never cleaned up on disconnect (see the
  `Session.unplug()` TODO below), e2e specs that depend on deterministic positions/timing (block touch/pickup/throw,
  explosions, portal warp, death/respawn, multiplayer visibility — see [main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts))
  run inside one `test.describe.configure({ mode: 'serial' })` block so their avatars can't push/collide with
  each other; they also lean on shared helpers in [e2e/gameHelpers.ts](e2e/gameHelpers.ts) (`walkTo` jumps only
  when the avatar's x actually stalls, rather than blindly, to avoid climbing MainRoom's stepping-stone columns
  by accident; `waitUntilGrounded` polls until an avatar's y stops changing, since a fresh spawn now free-falls a
  short distance from its floating `SpawnPortal` before landing; `standOnBlock` backs off, then jumps while running right
  and lets go over the block to land on it; `hopTo` runs right while jumping every ~600ms to clear fixtures — blocks
  are shoveable and nothing on the floor stops them, so "walk into it, jump when stuck" doesn't work) and a
  small keepout zone in `MainRoom` so randomly-placed blocks/robots can't spawn on the fixed fixtures or block the floor
  path e2e tests walk. The fixed fixtures are a yellow, a green and a red block at `TEST_FIXTURE_PIXELS`, resting
  on the floor with nothing behind them (the bottom floor is a free-running track: `MainRoom` builds no wall blocks on
  it and skips any stepping stone within an avatar's height of it, covered by
  [mainRoomBlocks.test.ts](server/__tests__/mainRoomBlocks.test.ts)); they sit far enough right of the spawn that other specs' short walks never
  touch them (touching is one-shot for yellow and red). Because blocks and robots now move around on their own, the
  Playwright config starts the server with `CELLWARZ_PLANET_PULL=off CELLWARZ_ROBOTS=off CELLWARZ_RANDOM_BLOCKS=off
  CELLWARZ_RANDOM_TELEPORT=off` (`MainRoom` reads the robots/blocks ones: no robots, no random blocks — only the fixtures
  stay; the last makes teleporting in use the spawn portal instead of a random floor spot, see "Teleport" above;
  `e2e/gameHelpers.ts` `login()` fills the callsign and clicks `#teleport`). Remaining e2e gaps: robots
  (unit-tested only: [robot.test.ts](server/__tests__/robot.test.ts) and the rocket tests in
  [specialBlocks.test.ts](server/__tests__/specialBlocks.test.ts)) and the purple/orange/rainbow/blue/green-bubble
  behaviors (unit-tested only). A dying player's own client stops receiving frames, so e2e checks a death from a
  *second* browser context (see the red-block spec).
  A `Robot` that is blocked by a solid obstacle stands still (facing it) for `TURN_AROUND_PAUSE_FRAMES` (one second),
  then `Robot.turnAround()` reverses direction, and it keeps patrolling indefinitely — re-enabled via
  `MainRoom.getNumRobots()` now that this is covered. A room whose `getNumRobots()` is positive is never left without
  one: `Cell.keepARobotAround()` (from `Cell.process()`, checked once a second) warps a new `Robot` onto a random bare
  floor spot ≥60 cells from real players when none is alive, and the client shows a warp burst for a robot sprite that
  first appears in a redraw frame ([robotWarpIn.test.ts](server/__tests__/robotWarpIn.test.ts)). **Robots are lethal**: every frame `Robot.killTouchedPlayers()`
  kills any non-robot `Avatar` overlapping or directly adjacent to it (sides, top and bottom; knocked away from the
  robot), so a wandering robot can now kill an e2e spec's avatar — another reason for the keepout zone above.
  The victim is **assimilated**: `Robot.assimilate()` dies the avatar (knocked away) then spawns a new `Robot` at the
  same spot and records it on the player's `Session` (`setRobotBody`/`getRobotBody`, cleared by `plugin()` and
  treated as gone once destroyed). `SocketHub.renderClient()` then keeps streaming to that player through the robot
  body — death ping, then one full refresh carrying `following` (the robot's cell index, null otherwise), then ordinary
  redraw frames — and the client's `Renderer` follows that sprite with the camera (`followSpriteId`) while drawing it
  as a normal red robot (it isn't in `avatars`, so `neonSprites` tints it as a robot). A `Missile` never wraps at a
  room's edges (`Missile.doAction` ends it at the grid boundary even in wrapping rooms like `MainRoom`).
- A few spots intentionally diverge from the original Java's crash-on-null behavior: e.g.
  `Cell.addAvatarAtEntrance` and `Portal.warpRandomly` fail gracefully (no-op) instead of throwing an NPE when a
  room has no free entrance spot. This is called out with comments at each site.
- Many `TODO:` comments carried over from the original Java mark known rough edges (e.g. `Session.unplug()`);
  this is still an actively-evolving hobby project — don't be surprised by them, and don't feel obligated to fix
  them unless asked.

