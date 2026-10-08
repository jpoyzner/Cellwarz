# Workflows

Source of truth for Cellwarz's browser regression tests (`e2e/`). Each workflow below lists the user-facing
behavior, how to trigger it, and whether it's covered by an automated Playwright test or requires manual
verification. The two stargate warp portal positions, the one spawn portal position, and one Thruster/Launcher
pair are all fixed and deterministic since [MainRoom](server/cell/mainRoom.ts) replaced the old randomized room
layout, and every login currently lands in the same single room (see [TODOS.md](TODOS.md)) — together these
closed most of the prior randomness-driven browser-test gaps below. The room's *other*
mana/booster/launcher/ice positions stay randomized (robots patrol back and forth, standing still for one second
before turning around when blocked, and killing any player they touch — see [robot.ts](server/sprite/robot.ts)).

## Login — respawn

1. Load the site; the login screen (`#login`) is shown with a name field and two buttons ("Reattach!" and "Respawn"),
   a short welcome/instructions blurb (including a warning about the ninja robots) and the key list (there is no title banner line above it).
2. Type a name into `#loginName`, click "Respawn" (`#random`).
3. The login screen is removed, `#canvas` becomes visible, and the avatar + room (walls, doors, mana, background)
   render within ~1 second of the WebSocket connecting.

**Covered by**: [e2e/login.spec.ts](e2e/login.spec.ts)

## Login — reattach

1. Respawn once (as above) to create an avatar tied to a login name.
2. Reload the page, type the same login name, click "Reattach!" (`#enter`).
3. The player reconnects to the *same* avatar (same room, same position) instead of being placed in a new
   random room.

**Covered by**: [e2e/reattach.spec.ts](e2e/reattach.spec.ts)

## Leaving the game (Escape)

1. While playing, press Escape.
2. The game screen (canvas, HUD, minimap) is torn down and the login screen (`#login`) is shown again. Any held
   run/jump key is released first, so the avatar you leave behind stands still instead of running on.
3. The avatar stays in the room; typing the same name and clicking "Reattach!" (`#enter`) returns to it at the same
   position (see "Login — reattach"), while "Respawn" places it at a fresh spawn portal.

**Covered by**: [e2e/login.spec.ts](e2e/login.spec.ts)

## Movement — run left/right, jump

1. While in-game, press the Left/Right arrow keys to run; press Up to jump.
2. The avatar's world position changes in the corresponding direction; jumping briefly increases height then
   falls back down under gravity.
3. Tapping Up briefly gives a short hop; holding it gives the full jump (variable jump height — releasing the
   key early cuts the ascent short, holding it doesn't change the max height).
4. Pressing Up up to ~6 frames (an eighth of a second) after walking off a ledge still jumps (coyote time), and
   pressing Up up to ~6 frames before landing queues the jump to fire the instant you land (jump buffering) —
   both are forgiveness-only and never change the jump's height or arc.

**Covered by**: [e2e/movement.spec.ts](e2e/movement.spec.ts) (run right); jump, gravity/collision physics, variable
jump height, coyote time, and jump buffering are covered at the unit level in
[server/__tests__/physics.test.ts](server/__tests__/physics.test.ts) and
[server/__tests__/avatar.test.ts](server/__tests__/avatar.test.ts).

## Mana pickup, structure connection, and tool activation

1. Stand under a mana block (Thruster/Launcher/Ice) and press Down to connect to its structure — number-key
   "dashboard" icons appear (top-right) indicating available tool actions.
2. Press Spacebar to pick up (or set back down) the mana block you're standing under.
3. With a structure connected, press 1/2/3 to activate/deactivate that mana's actions (e.g. a Launcher fires a
   Missile left/right; a Thruster fires its engines).

**Covered by**: [server/__tests__/avatar.test.ts](server/__tests__/avatar.test.ts) and
[server/__tests__/structure.test.ts](server/__tests__/structure.test.ts) (structure connect/activate, mana
pickup) plus [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) end-to-end in the browser,
targeting the one fixed Thruster fixture on MainRoom's floor (connect, pick up/carry, set back down).

## Portal warp

1. Walk into a Portal sprite — an animated "stargate" ring (a little bigger than an avatar) sitting on a
   platform in one of [MainRoom](server/cell/mainRoom.ts)'s two top corners — while running.
2. The avatar is relocated to the room's spawn portal (see "Spawn portal" below); the client receives a full
   state refresh.

**Covered by**: [server/__tests__/portal.test.ts](server/__tests__/portal.test.ts) at the engine level (the
relocate-and-refresh mechanic itself). Reaching a corner stargate requires climbing MainRoom's center
stepping-stone shaft, which is deliberately organic/skill-based platforming (jumping while drifting between
horizontally-offset columns) — not reliably scriptable, so the full walk-up-and-touch-it flow is manual-only,
the same tradeoff already made for burn-from-engine-fire death below.

## Spawn portal

1. A small circular portal floats in the air (off the ground) at the bottom center of MainRoom, directly
   below the stepping-stone shaft.
2. Logging in, reattaching, or warping through either corner stargate deposits the avatar at this spawn
   portal; since it floats above the floor below it, the avatar visibly drops a short distance before landing
   rather than appearing already standing.

**Covered by**: [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) (asserts a fresh avatar
settles at the known fixed spawn portal position after dropping) and
[e2e/reattach.spec.ts](e2e/reattach.spec.ts) (asserts reattaching returns to the same settled position).

## Death and respawn

1. An avatar dies when hit by a Missile (from a Launcher), burned by active engine fire, or touched by a robot
   (overlapping it or directly beside/above/below it — a robot patrolling into you, or you walking into a paused
   robot, both kill; robots never kill each other); death still happens
   in exactly one hit (no health pool was added) — the only change is a short knockback (in the missile's
   flight direction, upward for engine fire, or away from the robot) plays out over the death animation instead
   of an instant vanish.
2. On death the avatar's session is unplugged; the next login/reattach places it at the fresh spawn portal (see
   "Spawn portal" above).
3. The player who died sees their own screen flash/shake briefly (a one-shot server ping tells their client to
   play the effect, since their connection otherwise goes silent the instant their avatar is removed).
4. **A death by robot touch assimilates you**: your body immediately gets up as a new robot (red headband, no name
   tag, like every other robot) where you fell, and patrols like any robot — it doesn't freeze. Your own screen
   doesn't freeze either: it keeps showing the world, with the camera following your robot (you can no longer
   control it). Press Escape and "Reattach!"/"Respawn" to get a fresh avatar at the spawn portal; the robot
   stays in the room as an ordinary robot. Other deaths (missile, engine fire) just kill you, with no robot.

**Covered by**: [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) end-to-end — one browser
context connects to the fixed Launcher fixture and fires a missile at a second context's avatar standing in its
path, then reattaches the victim and asserts it respawns at the known fixed spawn portal position.
The knockback and death-flash are covered at the unit level
([server/__tests__/avatar.test.ts](server/__tests__/avatar.test.ts)), as is death-by-robot-touch
([server/__tests__/robot.test.ts](server/__tests__/robot.test.ts); the body is a live, moving, robot; no e2e of
the touch itself because robot positions are random), the follow-your-robot-body stream by
[server/__tests__/socketHubRobotBody.test.ts](server/__tests__/socketHubRobotBody.test.ts), and the client camera
following it by [e2e/robot-body.spec.ts](e2e/robot-body.spec.ts); the client-side flash/shake/sound itself
is manual-only (no automated assertions on canvas pixels or WebAudio output). Burn-from-engine-fire death is
still manual-only (a Thruster can't burn its own connected pilot by design, so it needs a second avatar
deliberately standing in the flame — not yet automated).

## Multiplayer visibility

1. Two different login names connect to the same room.
2. Each sees the other's avatar rendered and named on screen.

**Covered by**: [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) — two browser contexts log in
to the single shared room and each asserts it can see the other's name and sprite.

## Game feel: audio, particles, screen shake, netcode smoothing

1. Running, jumping, landing, picking up/dropping mana, activating a mana tool, warping through a portal, a
   nearby avatar dying, and your own death now each play a short synthesized sound effect (WebAudio oscillator
   blips — no audio asset files were added; bitcrushed square/saw tones, filter sweeps, noise bursts) and, where
   relevant, a small dust/impact/warp particle puff at the sprite's position. A quiet synthwave bed (detuned
   drone plus a sparse arpeggio) starts on the first sound and stops when you leave the game screen. It also stops
   when the level freezes from inactivity (the screen goes gray) — sound effects don't bring it back — and returns
   once the level wakes up again (frames arrive).
   Warping and dying also trigger a brief RGB-glitch burst on the whole screen.
2. Movement for every avatar, and the camera itself, is smoothed between server updates instead of snapping to
   each new position; your own avatar's left/right movement also predicts locally the instant a key is pressed
   and quietly reconciles against the server a few frames later (large mismatches — a wall, a push, a warp — snap
   instead of sliding).
3. None of this changes actual gameplay: it's a purely cosmetic/client-side layer on top of the exact same
   server-authoritative positions and collision outcomes as before.

**Covered by**: mostly manual verification — this is inherently visual/audio polish with no discrete state to
assert on in Playwright (no pixel-diffing or WebAudio-output assertions are in place). The exception is the music
stopping/resuming around an inactivity freeze: [e2e/inactivity-music.spec.ts](e2e/inactivity-music.spec.ts) and
[src/game/__tests__/audio.test.ts](src/game/__tests__/audio.test.ts) (with a fake AudioContext). The underlying data it's
built on (sprite positions, the `died` ping) is exercised indirectly by the existing movement/death/multiplayer
tests above, which would fail if the underlying server behavior changed.

## Minimap

1. While in-game, a mostly-transparent "radar" (the minimap) sits in the bottom-right corner (`#minimap`, canvas
   `#minimap-canvas`) labelled MAIN ROOM, showing the room's walls in cyan, other players as magenta dots, robots
   as red dots, and your own avatar as a larger pulsing white dot with a lime outline. The pulse pauses while the
   browser page is hidden. The level's gas giant (see "Gas giant planet") shows as an amber disc with a ring,
   clipped to the map while it flies in or out.
2. Click the small "x" (`#minimap-toggle`) to collapse it into a much smaller icon in the same corner; click the
   icon to reopen it. (It's deliberately not a focusable `<button>` so the Spacebar mana-pickup key can't
   accidentally toggle it.)

**Covered by**: [e2e/minimap.spec.ts](e2e/minimap.spec.ts) (renders content, collapses to an icon, reopens) and
[src/game/__tests__/minimap.test.ts](src/game/__tests__/minimap.test.ts) (wall vs. avatar image classification).
The planet's amber disc is covered by [e2e/space-background.spec.ts](e2e/space-background.spec.ts) and the minimap
unit test; the other colors/dots are manual-only (no canvas pixel-color assertions).

## Repeating MainRoom boundaries

MainRoom keeps its solid outer perimeter but has openings through it, and anything that moves through one comes out
of the matching opening on the opposite side (same x going through the floor/ceiling, same y going through the
end walls):

- Two 4-block-wide openings through the floor, the bottom wall and the top wall, each inset 30 blocks from an end
  wall. Walking off the floor into one drops you out of the matching ceiling opening onto the top platform.
- Two openings through each end wall: one at the second-platform level and one at the third-platform level (not the
  bottom floor). Each
  sits on a sill about 12 grid units (96px) above its walkway, so you have to jump up onto it; the opening is
  just taller than an avatar.

Moving sprites wrap at the room grid boundary; other room types retain their existing edge behavior. The one
exception is a Launcher's missile: it never wraps around the side edges — it flies out of an end-wall opening and
simply ends at the room's edge instead of coming out the opposite side.

**Covered by**: [server/__tests__/mainRoomWrap.test.ts](server/__tests__/mainRoomWrap.test.ts) (opening geometry,
jump-reachability of the side openings),
[server/__tests__/physics.test.ts](server/__tests__/physics.test.ts) (edge wrapping),
[server/__tests__/missile.test.ts](server/__tests__/missile.test.ts) (a missile ends at the edge instead of wrapping), and
[e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) (openings present in the rendered room,
bottom-to-top wrap).

## Space background (orbital station)

1. [MainRoom](server/cell/mainRoom.ts) is drawn over a dark starfield with randomly drifting, glowing neon tetromino
   pieces (ported from the DJ Recognize site's background) and a cyberpunk orbital-station backdrop
   (`'station'` in `Cell.getBackground()`, drawn by [stationBackdrop.ts](src/game/stationBackdrop.ts)): ship traffic
   streaking across. The server tells the
   client which backdrop a room uses (`background` in the full-state payload), and the DOM `#canvas-bg` temple
   image is hidden while the station (or plain `'space'`) backdrop is active.
2. When any avatar (yours or another player's) actually touches one of a drifting piece's blocks (the avatar's
   body, not its name tag or the empty space around the piece), it breaks into its individual blocks
   that fly apart, and a new piece reappears elsewhere in the room. The pieces drift slowly through the *world*
   (not the screen), so you can run up to one and touch it; the stars are a screen layer that slowly drifts all
   in one random direction. The backdrop is purely cosmetic — it never affects physics or collisions.
3. Tall ceiling lamps (`Cell.getLamps()`, five evenly spaced in MainRoom) cast bright neon (cyan/magenta/amber)
   triangular beams of light down over much of the floor, fading toward the bottom, and
   sway slowly back and forth (alternate lamps in
   opposite directions) so neighbouring beams briefly overlap. The black ninja avatars (and robots) are drawn over
   the beams and stand out clearly against them; outside the beams they blend into the dark (you can still see
   their eyes), so players can hide in the gaps. Lighting is purely cosmetic and doesn't affect gameplay.
4. Name tags above avatars are neon cyan (with a dark outline) and horizontally centered over the avatar.
5. Art is re-skinned on the client at load time: wall tiles become dark steel with a neon rim, every avatar's
   headband glows (cyan for you, magenta for other players, red for robots), and portals/pickups/projectiles get a
   neon glow. The whole frame gets a light bloom, plus a CRT scanline/vignette overlay (`#crt`). The HUD uses a
   monospace neon style (score is labelled CREDITS and briefly digit-scrambles when it changes; the minimap is
   labelled MAIN ROOM; the login screen is styled as a terminal).
6. The original temple backdrop is kept as the default for non-MainRoom (e.g. future randomly generated) rooms.

**Covered by**: [e2e/space-background.spec.ts](e2e/space-background.spec.ts) (station backdrop active, temple
element hidden, running into a world-space piece shatters it),
[src/game/__tests__/spaceBackground.test.ts](src/game/__tests__/spaceBackground.test.ts) (world-wide scatter, shatter,
star drift, respawn, shard lifetime),
[src/game/__tests__/stationBackdrop.test.ts](src/game/__tests__/stationBackdrop.test.ts) (ship traffic wrapping),
[src/game/__tests__/neonSprites.test.ts](src/game/__tests__/neonSprites.test.ts) (headband recolor, steel tiles, glow
colors) and [server/__tests__/cellBackground.test.ts](server/__tests__/cellBackground.test.ts)
(which room uses which backdrop). The overall look (beams, glow, bloom, CRT, name tags) is manual-only.

## Background TVs

1. [MainRoom](server/cell/mainRoom.ts) has 4 giant background TVs (`Cell.getTvs()`, sent as `tvs` in the full-state
   payload): two on floor 1 (the spawn floor, hung about an avatar height below the middle of that floor) and two on
   the outer edges of floor 3. Floors 2 and 4 have none, and nothing hangs by the spawn portal. They are world-space
   screens (9:16, matching the source video), drawn over the lamp beams but behind the sprites, so avatars stand out
   against the glowing screens.
2. Every TV hangs by two metal chains running up to the platform row directly above it.
3. Every TV shows the same video (`IMU_FULL`, from `public/videos/`), muted. Each player's browser plays its own
   copy, so players don't see the same moment. The video only plays while at least one TV is on screen. When it
   ends, the TVs show plain white "YOUR AD HERE" text on black for about 5 seconds, then the video restarts from the beginning.
   Only the first play after you enter the room starts from a random point in the video (never within 10 seconds of
   the end) rather than the beginning.
   If the browser can't decode either source, the TVs show a flickering "NO SIGNAL" screen instead.
4. TVs are purely cosmetic — they never block, push or collide with anything. Only MainRoom has them.
5. The source master lives in `media-src/` (git-ignored); the game serves small MP4 (H.264) and WebM (VP9) copies
   (see AGENTS.md for the ffmpeg commands). The paid-ad system from [TODOS.md](TODOS.md) is not built yet — the ad
   card is only a placeholder.

**Covered by**: [e2e/tvs.spec.ts](e2e/tvs.spec.ts) (4 TVs received, shared muted video plays while the ground-floor TVs
are on screen (wide viewport); the video's first play starts from a random point; after it ends the ad card shows for ~5s and the video then restarts from the beginning),
[server/__tests__/mainRoomTvs.test.ts](server/__tests__/mainRoomTvs.test.ts) (layout: floors, inside the room, no
overlaps, chains reach the platform row above, floor 1 TVs lowered, MainRoom-only) and
[src/game/__tests__/tvs.test.ts](src/game/__tests__/tvs.test.ts) (cover-crop, on-screen culling, chain-link and chain-visibility math, random start time). The look
of the screens is manual-only.

## Gas giant planet

1. [MainRoom](server/cell/mainRoom.ts) has one randomly generated gas giant with rings flying by in the background at
   a time (random size, banding/color palette, ring tilt, height and direction; slow, crossing the whole room in
   about one to two minutes). When it has flown fully off the far side a new random one enters from a random side.
   It is pure scenery drawn behind the sprites — nothing collides with it. The server owns its position
   ([planet.ts](server/planet.ts), stepped by `Cell.process()`) and sends it as `planet` in the full-state payload
   and as a separate `{ planet }` message when a new planet appears and every 2s as a drift correction (the flat
   redraw frames are untouched); clients extrapolate from its velocity in between.
2. Within about 6 avatar heights (384px) of its surface, things are pulled toward it, harder the closer they get
   (quadratic falloff): avatars/robots and mana-type blocks (mana, ice, boosters, launchers — not ones being
   carried) are moved on the server grid through normal physics, so walls and heavier things still block the pull
   and you can run or jump out of the weak outer edge. The pull is deliberately gentle outside the
   planet (about half of gravity even at its surface), so it drags things sideways/down but never lifts a sprite off
   the ground. Over the planet itself (anywhere within its disc) the pull is much stronger — stronger than normal
   gravity, so it can drag a sprite up into it and quickly sends it to the core. The background tetromino pieces
   (client-side) fall toward it too (also harder over the planet), without being broken by it.
3. Anything whose centre reaches the planet's core (the middle 15% of its radius) is swallowed: it slides into the
   exact centre while shrinking away over one second (as if being pulled off into the distance), and only when it
   has vanished is it destroyed — a mana block is removed from the game, an avatar or robot dies (the usual death
   effects and respawn). The server drives this (`consume scale` is sent as extra info `'2'` on the sprite's redraw
   entry and the client draws the sprite scaled around its centre; the avatar's name tag is hidden meanwhile). A
   tetromino piece reaching the core shrinks away the same way (client-side) and a new one appears elsewhere; it
   does not shatter or score.
4. The minimap shows the planet in its own amber color.

Set `CELLWARZ_PLANET_PULL=off` on the server to keep the planet flying but switch off the server-side pull and swallowing (the
Playwright config does this so its deterministic movement specs aren't shoved around; it only applies when
Playwright starts the server itself).

**Covered by**: [server/__tests__/planet.test.ts](server/__tests__/planet.test.ts) (one planet at a time, respawn,
range/falloff, stronger pull over the planet, walls blocking, lifting only inside the planet, shrink-then-destroy of avatars/mana, wire extra info, MainRoom-only),
[src/game/__tests__/planet.test.ts](src/game/__tests__/planet.test.ts),
[src/game/__tests__/spaceBackground.test.ts](src/game/__tests__/spaceBackground.test.ts) (pieces pulled, not broken, shrunk away at the core),
[src/game/__tests__/minimap.test.ts](src/game/__tests__/minimap.test.ts) and
[e2e/space-background.spec.ts](e2e/space-background.spec.ts) (planet flies, minimap color, pieces pulled and shrunk away at the core).
Avatar/block pull and swallowing are unit-tested only; how the planet looks is manual-only.

## Score

1. Each user has a score, shown in the top-right corner (`#score`, just the number, visually labelled CREDITS)
   and starting at 0.
2. When *your* avatar breaks a background block (see "Space background"), the blocks burst outward, then fly
   across the screen to the score and disappear on arrival, adding 20 points per block (a tetromino is 4 blocks,
   so 80). Blocks broken by other players fly apart without scoring for you.
3. The client reports collected blocks to the server (`scored` message), which keeps the authoritative total on
   the user's `Session`; it persists across death/respawn and reattach (the full-state payload carries `score`).
   Scores are in-memory only, like all game state.
4. The old debug frame-stats text in the top-left corner has been removed.

**Covered by**: [e2e/space-background.spec.ts](e2e/space-background.spec.ts) (breaking a block adds 20 per block to
the `#score` text), [src/game/__tests__/spaceBackground.test.ts](src/game/__tests__/spaceBackground.test.ts) (only
the local avatar's blocks fly to the target and are counted) and
[server/__tests__/session.test.ts](server/__tests__/session.test.ts) (20 points per block, kept across re-plug).
The flight animation itself is manual-only.

## Removed workflows

- **Chat** (typing a message and pressing Enter to broadcast it to the room) was removed from both client and
  server; player communication will be replaced by a different system later. There is no chat-related test
  coverage to maintain.
