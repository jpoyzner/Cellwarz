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
  switches the reversal off and marks it `spent`, so only being picked up re-arms it (not an avatar standing beside it), red [Launcher](server/sprite/launcher.ts) (5s fuse then explosion: kill radius
  28 with a line-of-sight check to head/middle/feet, shove radius 30), blue [Ice](server/sprite/ice.ts) (constant
  slide drive, reverses when blocked so it never stops), green [Shield](server/sprite/shield.ts) (+ [ShieldBubble](server/sprite/shieldBubble.ts)),
  purple [GravityBlock](server/sprite/gravityBlock.ts) (impulses toward itself; `MainRoom` places none for now), orange
  [StickyBlock](server/sprite/stickyBlock.ts) (repels other orange blocks within 24 cells with a fading `applyImpulse` so they spread out, skipping glued group mates; merges `ManaBody`s with adjacent blocks; a stuck block can be carried — `Mana.detachForCarrying()` frees just it, or everything if it is the orange one), rainbow
  [RainbowBlock](server/sprite/rainbowBlock.ts) (right-hand wall-following crawl that wraps corners and falls under gravity when nothing touches it, shatters into [Diamond](server/sprite/diamond.ts)s
  when a thrown one hits something). **Rigid groups**: `Sprite.getRigidGroup()` (generic hook; sticky blocks share a
  body) makes `Physics.move` move all members as one or none, and `Physics.canInteract` ignores group mates.
  `Physics.move` is also guarded against re-entrancy (a `moving` set): a sprite already being moved up the call stack is
  just blocked — two overlapping sprites can each count as "on top" of the other, which used to recurse forever.
  **Ghost-layer sprites**: visual/effect sprites (`ShieldBubble`, `Explosion`, `Diamond`, `RocketLauncher`) use
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
  `Missile.pathReaches()` (a dry-run of the same integrator the rocket uses) finds a clear arc. It then stops, spawns a
  [RocketLauncher](server/sprite/rocketLauncher.ts) prop, fires a `Missile` with a launch vector after ~0.9s (rocket speed 0.7 cells/frame) (re-aiming at
  the target's then-position), and puts the prop away. `Missile` takes an optional `{ vx, vy }` launch (gravity
  `ROCKET_GRAVITY`) and dies on solid walls/blocks, the round part of a shield bubble and the room's edges; it flies through robots (never exploding on one). On touching a real player or anything solid (wall/block) it explodes via the shared [blast.ts](server/sprite/blast.ts) `detonate()` (also used by `Launcher`: kill radius with line-of-sight, shield immunity, shoves `Mana`, spawns the `Explosion`) with the smaller `ROCKET_KILL_RADIUS` 10 / `ROCKET_SHOVE_RADIUS` 20 — the blast kills robots too; avatars die from the blast, not from the touch. The room's edges and a shield bubble end it without exploding. Client-side, `Renderer.drawSprites` adds [rocketLight.ts](src/game/rocketLight.ts) to every `/projectiles/missile*` sprite — an additive flickering exhaust flame at the tail and a bright light on the tip (facing from the `L` art suffix) so rockets read against dark space. The 31-cell green
  `ShieldBubble` (art: `public/images/effects/bubble.png`, 248px) is clamped inside the room and also makes avatars inside it (`ShieldBubble.isCovered`) immune to `Launcher` blasts.
- **Death feedback**: `Avatar.die(knockbackXDirection?, knockbackYDirection?)` takes an optional knockback
  direction (explosions, including rocket blasts, knock back away from the blast; robots away from themselves) applied via one
  `Physics.move` before `removePermanently()` — death is still a single hit, this only adds physicality to it.
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
  drawn position toward its latest known server position (`SMOOTHING_TAU_MS`) instead of snapping to each new
  snapshot; `prediction.ts`'s `LocalPredictor` additionally predicts the *local* avatar's left/right movement
  the instant a key is pressed (softly reconciling against the server a few frames later, snapping instead on a
  large mismatch) since the client has no collision geometry to predict jumps/pushes against (it stops predicting
  once the server's x has stalled for ~80ms while a direction is held, so running into a wall doesn't overshoot and
  slide back). `audio.ts`
  synthesizes short WebAudio blips (no audio asset files were added) and `particles.ts` draws small dust/impact/
  warp bursts, both triggered by diffing incoming sprite positions/deletions (e.g. an avatar sprite disappearing
  ⇒ impact burst; a rendered avatar's y going from falling to flat ⇒ landing dust). **Important**: any state that
  actual game logic or tests depend on (the `sprites`/`avatars` maps) is mutated synchronously as messages
  arrive, never lazily from the `requestAnimationFrame` callback — that loop is throttled/paused by the browser
  for backgrounded/unfocused tabs (this bit a Playwright test with two browser contexts during development;
  see the git history on `src/game/renderer.ts` for the fix), so anything logically load-bearing can't depend
  on it actually running.
- **Debug recording (backtick)** (`src/game/recorder.ts`, `server/recordingStore.ts`): `attachInputHandlers` turns the
  backtick key into `onToggleRecording` (never sent to the server). `Recorder` (owned by `GameCanvas`, set on
  `syncer.recorder`) snapshots `renderer.snapshot()` at start, then `Syncer.handleMessage`/`sendKey` log every incoming
  message (deep-cloned: the renderer keeps parts of full-state payloads) and key press with timestamps; it auto-stops
  at `MAX_RECORDING_MS` (10s), on a second press, or on leaving the game. The finished recording goes up the socket as
  `{ recording }`; `SocketHub.handleRecording` (login required) writes it via `saveLatestRecording()` to the single
  git-ignored `recordings/latest.json` (`CELLWARZ_RECORDINGS_DIR` overrides; 25MB cap), overwriting the previous one so
  only the latest is kept. To analyze a bug report: read that file — `initial` is the starting state, `events` are
  the `message`/`key` timeline.
- **Login room** ([LoginScreen.tsx](src/components/LoginScreen.tsx), [loginRoom.ts](src/game/loginRoom.ts)): the login
  screen is a client-only 960x540 "inside a huge ship" scene (hull panels, ceiling lights, a viewport onto stars and a
  planet, hazard-striped floor) drawn on `#ship-canvas`, scaled to fit the window (canvas resolution follows the scale;
  the DOM panels/labels sit in a 960x540 `.ship-overlay` that is CSS-scaled the same amount). `RoomAvatar` (pure, unit
  tested) walks/jumps on a flat floor; the avatar is baked with the in-game [neonSprites](src/game/neonSprites.ts) so
  it wears the picked colours. Two transporters stand on the floor with DOM button labels over them: **TELEPORT**
  (`#teleport`, always) and **WAKE UP** (`#wakeup`, only while the typed callsign has a living avatar in the room, read
  from the radar's `avatars`). Standing on a pad ~0.45s or clicking its label calls `LoginRoom.useTransporter()`:
  a 650ms beam-up effect (a `setTimeout`, not the rAF loop, so a throttled background tab still proceeds), then
  `onEnter(name, jump = pad === 'teleport', look)`. No callsign ⇒ nothing fires (`onBlocked`). Arrow keys always drive
  the room avatar (also while the name field is focused). The last callsign/colours persist in localStorage
  ([look.ts](src/game/look.ts) `loadSavedLogin`/`saveLogin`). `window.__cellwarzLogin` (`{ room, radar }`) is the
  test-only hook.
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
  `Avatar.fallAsleep()` (clears run/slide; the avatar just stands, or finishes falling, and **stops animating**:
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
  ends every TV shows a plain white "YOUR AD HERE" on black for `AD_DURATION_MS` (5s), then the video restarts from the beginning. Only the first play (on load) seeks to `randomStartTime()` — a random point at least 10s before the end. The TVs
  show "NO SIGNAL" if no source can be decoded. Each client plays
  independently (no synced playback). Videos are served from `public/videos/` via a `/videos` Express route (and an
  rsbuild dev-proxy entry) — a WebM copy exists because Playwright's Chromium has no H.264. The full-size master lives in
  git-ignored `media-src/`; regenerate the web copies with
  `ffmpeg -i media-src/IMU_FULL.mov -an -vf scale=360:640,fps=24 -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 30 -preset slow -movflags +faststart public/videos/imu_full.mp4`
  and `... -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 -cpu-used 4 public/videos/imu_full.webm`. The ad/contact slots between
  videos (see TODOS.md) are intentionally not built yet.
- **Cyberpunk look (all client-side, cosmetic)**: [neonSprites.ts](src/game/neonSprites.ts) re-skins art at load time
  with no new assets — wall tiles become dark steel with a neon rim, the red headband on every `/me/` frame is recolored
  and given a glow halo (cyan = local avatar, magenta = other players, red = robots; both avatars and robots use the
  same `me/` art so each tint gets its own baked copy), and portals/pickups/projectiles get a `shadowBlur` glow chosen
  from the image path (`glowColorForPath`). [postFx.ts](src/game/postFx.ts) adds a downscaled bright-pass bloom to the
  whole frame and a short RGB-glitch burst on warp/death. A CSS `#crt` overlay (scanlines + vignette), a monospace
  HUD (`CREDITS` score with a digit-scramble on change, `RADAR` minimap with a sweep bar) and the ship-room login
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
  `isAffectedByPlanets()` is true (Avatar incl. Robot, every Mana subclass except the rainbow block) via ordinary `Physics.move`s with a
  per-sprite fractional accumulator, so walls/mass still block it. Range = 6 avatar heights from the surface,
  quadratic falloff, peak `MAX_PULL_PER_FRAME` = 0.55 grid units/frame at the surface (below gravity's 1, so outside
  the planet it never lifts anything); *inside* its disc the pull is a flat `INSIDE_PULL_PER_FRAME` = 1.2 (client
  pieces: `PLANET_PIECE_ACCEL_INSIDE`). An upward pull weaker than gravity is ignored to avoid floor jitter, so only the
  inside pull can lift a sprite. A sprite whose centre gets within `CORE_RADIUS_FRACTION` (0.15) of the planet's radius from
  its centre is *swallowed*: `PlanetField` tracks it in `consuming`, `advanceConsumed()` slides it to the (moving)
  centre with `Physics.moveTo` over `CONSUME_FRAMES` (1s) while `Sprite.setConsumeScale()` goes 1 → 0 (and
  `Sprite.process()` skips `doAction()` so its own gravity/AI/input stop), then `Sprite.onConsumed()` runs
  (default `removePermanently()`; `Avatar` overrides it to `die()`). The scale rides the terse redraw entry's extra
  info as key `'2'` (`jsonGenerator.ts`); `Renderer.shrinks` stores it and `drawSprites` scales around the sprite
  centre (name tag hidden, local prediction off meanwhile). Wire: `planet` in the full-state payload plus separate `{ planet }` messages (on a new
  planet id and every 2s) from `SocketHub` — deliberately *not* a key in the flat redraw frames. The client
  extrapolates from `vx`/`vy` (advanced in `SpaceBackground.update`) and snaps on each resync; the look (palette,
  bands, ring) is derived from `seed`. Background tetrominoes are pulled/swallowed client-side
  (`SpaceBackground.pullPiece`/`consumePiece`: reaching the core shrinks it away over `PLANET_CONSUME_MS`, no shards); the minimap draws it in amber. `CELLWARZ_PLANET_PULL=off` disables only the server
  pull (Playwright sets it for its own server).
- **Diamonds** (`#diamonds`, under the score, marked with a 💎 via CSS `::before`): `Diamond.collect()` credits
  `Session.addDiamonds` for the first real player (not a robot) overlapping it; `SocketHub` sends `{ diamonds: n }` as a
  separate one-shot message when the count changes (and `diamonds` in the full-state payload) so the flat redraw frames
  stay untouched. `Session.plugin()` must `setSession` on the new avatar (warp/respawn make fresh ones) or diamonds can't be
  collected. Client-side, a diamond sprite deleted next to the local avatar spawns a [DiamondFlight](src/game/diamondFlight.ts)
  flyer that arcs to the HUD; `Renderer.diamonds` is the server's total and `shownDiamonds` (what the HUD displays)
  catches up as each flyer arrives (`setDiamonds()` never jumps the HUD; it also catches up after 1.5s if nothing flew).
  Explosions are detected client-side by new sprites whose
  image path is under `/effects/explosion/` (bang, sparks, a distance-faded shake). New block/effect art lives under
  `public/images/{mana/*,effects,weapons}` (generated from the original yellow/red tile art by hue-shifting; frame names
  follow `addAction`: `name1..N`, mirrored frames get an `L` suffix).
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
  `MainRoom.getNumRobots()` now that this is covered. **Robots are lethal**: every frame `Robot.killTouchedPlayers()`
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

