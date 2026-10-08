# Workflows

Source of truth for Cellwarz's browser regression tests (`e2e/`). Each workflow below lists the user-facing
behavior, how to trigger it, and whether it's covered by an automated Playwright test or requires manual
verification. The two stargate warp portal positions, the one spawn portal position, and one Thruster/Launcher
pair are all fixed and deterministic since [MainRoom](server/cell/mainRoom.ts) replaced the old randomized room
layout, and every login currently lands in the same single room (see [TODOS.md](TODOS.md)) — together these
closed most of the prior randomness-driven browser-test gaps below. The room's *other*
mana/booster/launcher/ice positions stay randomized (robots patrol back and forth, turning around when blocked
— see [robot.ts](server/sprite/robot.ts)).

## Login — enter randomly

1. Load the site; the login screen (`#login`) is shown with a name field and two buttons.
2. Type a name into `#loginName`, click "Enter randomly!" (`#random`).
3. The login screen is removed, `#canvas` becomes visible, and the avatar + room (walls, doors, mana, background)
   render within ~1 second of the WebSocket connecting.

**Covered by**: [e2e/login.spec.ts](e2e/login.spec.ts)

## Login — reattach

1. Enter randomly once (as above) to create an avatar tied to a login name.
2. Reload the page, type the same login name, click "Reattach!" (`#enter`).
3. The player reconnects to the *same* avatar (same room, same position) instead of being placed in a new
   random room.

**Covered by**: [e2e/reattach.spec.ts](e2e/reattach.spec.ts)

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

1. An avatar dies when hit by a Missile (from a Launcher) or burned by active engine fire; death still happens
   in exactly one hit (no health pool was added) — the only change is a short knockback (in the missile's
   flight direction, or upward for engine fire) plays out over the death animation instead of an instant vanish.
2. On death the avatar's session is unplugged; the next login/reattach places it at the fresh spawn portal (see
   "Spawn portal" above).
3. The player who died sees their own screen flash/shake briefly (a one-shot server ping tells their client to
   play the effect, since their connection otherwise goes silent the instant their avatar is removed).

**Covered by**: [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) end-to-end — one browser
context connects to the fixed Launcher fixture and fires a missile at a second context's avatar standing in its
path, then reattaches the victim and asserts it respawns at the known fixed spawn portal position.
The knockback and death-flash are covered at the unit level
([server/__tests__/avatar.test.ts](server/__tests__/avatar.test.ts)); the client-side flash/shake/sound itself
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
   drone plus a sparse arpeggio) starts on the first sound and stops when you leave the game screen.
   Warping and dying also trigger a brief RGB-glitch burst on the whole screen.
2. Movement for every avatar, and the camera itself, is smoothed between server updates instead of snapping to
   each new position; your own avatar's left/right movement also predicts locally the instant a key is pressed
   and quietly reconciles against the server a few frames later (large mismatches — a wall, a push, a warp — snap
   instead of sliding).
3. None of this changes actual gameplay: it's a purely cosmetic/client-side layer on top of the exact same
   server-authoritative positions and collision outcomes as before.

**Covered by**: manual verification only — this is inherently visual/audio polish with no discrete state to
assert on in Playwright (no pixel-diffing or WebAudio-output assertions are in place). The underlying data it's
built on (sprite positions, the `died` ping) is exercised indirectly by the existing movement/death/multiplayer
tests above, which would fail if the underlying server behavior changed.

## Minimap

1. While in-game, a mostly-transparent "radar" (the minimap) sits in the bottom-right corner (`#minimap`, canvas
   `#minimap-canvas`) showing the room's walls in cyan, other players as magenta dots, robots as red dots, and
   your own avatar as a larger pulsing white dot with a lime outline, with a faint scan bar sweeping across it.
2. Click the small "x" (`#minimap-toggle`) to collapse it into a much smaller icon in the same corner; click the
   icon to reopen it. (It's deliberately not a focusable `<button>` so the Spacebar mana-pickup key can't
   accidentally toggle it.)

**Covered by**: [e2e/minimap.spec.ts](e2e/minimap.spec.ts) (renders content, collapses to an icon, reopens) and
[src/game/__tests__/minimap.test.ts](src/game/__tests__/minimap.test.ts) (wall vs. avatar image classification).
The exact colors/dots are manual-only (no canvas pixel-color assertions).

## Space background (orbital station)

1. [MainRoom](server/cell/mainRoom.ts) is drawn over a dark starfield with randomly drifting, glowing neon tetromino
   pieces (ported from the DJ Recognize site's background) and a cyberpunk orbital-station backdrop
   (`'station'` in `Cell.getBackground()`, drawn by [stationBackdrop.ts](src/game/stationBackdrop.ts)): a planet limb
   with city lights on its night side and ship traffic streaking across. The server tells the
   client which backdrop a room uses (`background` in the full-state payload), and the DOM `#canvas-bg` temple
   image is hidden while the station (or plain `'space'`) backdrop is active.
2. When any avatar (yours or another player's) overlaps a drifting piece, it breaks into its individual blocks
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
   labelled RADAR; the login screen is styled as a terminal).
6. The original temple backdrop is kept as the default for non-MainRoom (e.g. future randomly generated) rooms.

**Covered by**: [e2e/space-background.spec.ts](e2e/space-background.spec.ts) (station backdrop active, temple
element hidden, running into a world-space piece shatters it),
[src/game/__tests__/spaceBackground.test.ts](src/game/__tests__/spaceBackground.test.ts) (world-wide scatter, shatter,
star drift, respawn, shard lifetime),
[src/game/__tests__/stationBackdrop.test.ts](src/game/__tests__/stationBackdrop.test.ts) (ship traffic wrapping),
[src/game/__tests__/neonSprites.test.ts](src/game/__tests__/neonSprites.test.ts) (headband recolor, steel tiles, glow
colors) and [server/__tests__/cellBackground.test.ts](server/__tests__/cellBackground.test.ts)
(which room uses which backdrop). The overall look (beams, glow, bloom, CRT, name tags) is manual-only.

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

