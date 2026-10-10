# Workflows

Source of truth for Cellwarz's browser regression tests (`e2e/`). Each workflow below lists the user-facing
behavior, how to trigger it, and whether it's covered by an automated Playwright test or requires manual
verification. The two stargate warp portal positions, the one spawn portal position, and one yellow, one green and
one red block are all fixed and deterministic since [MainRoom](server/cell/mainRoom.ts) replaced the old randomized
room layout, and every login currently lands in the same single room (see [TODOS.md](TODOS.md)) — together these
closed most of the prior randomness-driven browser-test gaps below. The room's *other* blocks stay randomly
placed, and they move (blocks are light: avatars shove them, robots shove them, purple blocks pull them), so the
Playwright run starts the server with `CELLWARZ_RANDOM_BLOCKS=off CELLWARZ_ROBOTS=off` (alongside
`CELLWARZ_PLANET_PULL=off` and `CELLWARZ_RANDOM_TELEPORT=off`, which makes teleporting in use the spawn portal): only the fixed blocks stay. The bottom floor is a free-running track: no wall blocks stand on it
and no stepping stone hangs low enough above it to stop an avatar, so walking into a fixed block shoves it (the e2e
specs hop over or onto them instead). Robots patrol back and forth, standing still for one
second before turning around when blocked, killing any player they touch and shooting arcing rockets at players
in range — see [robot.ts](server/sprite/robot.ts).

## Login room (the ship)

1. Load the site; the login screen (`#login`) is the inside of a huge ship/rocket: a small room (`#ship-canvas`) with
   your own avatar in it (cyan headband and belt until you pick colours), a viewport onto space, a callsign field
   (`#loginName`), headband/belt colour pickers, a short briefing (`#desc`: welcome blurb, robot warning and the key
   list) and a live radar (see "Login room — live radar"). The room is scaled to fit the window.
2. Walk the avatar with the Left/Right arrows and jump with Up (the arrow keys work even while the callsign field has
   focus; the room is client-only, nothing is sent to the server for it). A name tag shows the callsign over it.
3. There are two transporters on the floor, each with a button label over it (also clickable): **TELEPORT**
   (`#teleport`, always there) and **WAKE UP** (`#wakeup`, only present while the callsign typed has a living —
   awake or asleep — avatar in the main room; typing another name removes it, a dead player never sees it).
4. Standing on a pad for about half a second (or clicking its label) beams the avatar up (a short light-column effect),
   then the login screen is removed, `#canvas` becomes visible, and the avatar + room (walls, doors, mana,
   background) render within ~1 second of the WebSocket connecting. Without a callsign nothing fires: the notice
   `#login-notice` says to enter one and the field is focused.
5. The last callsign and colours are remembered (localStorage) and prefilled next time, including after Escape.

**Covered by**: [e2e/login-room.spec.ts](e2e/login-room.spec.ts) (room, walking, jumping, callsign required, walking onto the
pad), [e2e/login.spec.ts](e2e/login.spec.ts) (entering the game) and [src/game/__tests__/loginRoom.test.ts](src/game/__tests__/loginRoom.test.ts)
(avatar movement and pad detection). The ship's look itself (hull, viewport, lights, beam) is manual-only.

## Login — teleport

1. Type a callsign and use the TELEPORT transporter (`#teleport`).
2. The server always makes a **fresh** avatar (an existing one under that name is removed) and drops it on a random bare
   patch of floor in the main room: it rests on wall blocks with nothing but wall blocks around it (no blocks, portals
   or other avatars) and no robot within 24 grid cells. (If no such spot is found it falls back to a spawn portal.)
   Set `CELLWARZ_RANDOM_TELEPORT=off` to always use the spawn portals; the Playwright run does, so specs can rely on
   where avatars start.

**Covered by**: [server/__tests__/randomFloor.test.ts](server/__tests__/randomFloor.test.ts) (random floor placement),
[server/__tests__/socketHubLogin.test.ts](server/__tests__/socketHubLogin.test.ts) (jump = fresh avatar) and every e2e
spec that logs in through `#teleport` (they use the spawn portal via the env flag).

## Login — wake up (reattach)

1. Teleport once to create an avatar tied to a login name, then reload the page (or press Escape twice).
2. Type the same login name: the WAKE UP transporter (`#wakeup`) appears; use it.
3. The player reconnects to the *same* avatar (same room, same position), awake, instead of getting a new one.

**Covered by**: [e2e/reattach.spec.ts](e2e/reattach.spec.ts), [e2e/login-room.spec.ts](e2e/login-room.spec.ts) (WAKE UP appears
only for a callsign with a living avatar and wakes it where it sleeps)

## Login room — live radar

1. The login room shows the same radar as the game (`#radar`, canvas `#radar-canvas`, titled LIVE RADAR · MAIN ROOM): the
   room's walls, other players as magenta dots, robots as red dots and the amber planet, updating live, plus a readout
   (`#radar-readout`) like "2 PILOTS · 3 ROBOTS". There is no avatar of yours on it yet.
2. It comes from a spectator-only connection (`{ connect, spectate: true }`: the server sends the full state and the
   room's frames, with no login, session or avatar, and never times it out); it is closed when you enter the game. The
   same data tells the room which callsigns have a living avatar (what makes WAKE UP appear).

**Covered by**: [e2e/login-room.spec.ts](e2e/login-room.spec.ts) (walls arrive before login; another player shows up),
[server/__tests__/socketHubLogin.test.ts](server/__tests__/socketHubLogin.test.ts) and
[src/game/__tests__/radarPreview.test.ts](src/game/__tests__/radarPreview.test.ts).

## Avatar colours (headband and belt)

1. In the login room pick a headband colour and a belt colour (`#headband-colors`, `#belt-colors`): a swatch row each
   with a "default" swatch, a palette and a custom colour input. The avatar in the room changes at once. Picking
   nothing keeps the old behaviour (cyan for you, magenta for other players); picking one part fills the other with cyan.
2. Robot red cannot be chosen (the picker says "RED IS RESERVED FOR ROBOTS" and ignores it; the server rejects such a
   look too and the player keeps the default colours).
3. The colours are sent when entering the game, stored on the player's session (they survive respawns) and shown on the
   avatar to everyone: full-state payloads carry `looks` (name → [headband, belt]) and a one-shot `{ looks }` message
   goes out whenever anyone's colours change. Robots (including an assimilated player's robot body) stay red.

**Covered by**: [e2e/login-room.spec.ts](e2e/login-room.spec.ts) (picking, red rejected, another player sees them),
[server/__tests__/look.test.ts](server/__tests__/look.test.ts), [server/__tests__/socketHubLogin.test.ts](server/__tests__/socketHubLogin.test.ts),
[server/__tests__/session.test.ts](server/__tests__/session.test.ts) and [src/game/__tests__/look.test.ts](src/game/__tests__/look.test.ts) /
[neonSprites.test.ts](src/game/__tests__/neonSprites.test.ts). The baked pixel colours are manual-only.

## Leaving the game (Escape)

1. While playing (alive), press Escape. Any held run/jump key is released first. Your avatar falls asleep where it
   stands (see "Sleeping avatar") and you spectate it: "YOUR AVATAR IS ASLEEP" is shown (`#spectator`), the arrow keys pan
   a free camera, and the sleeper ignores all input except Space: pressing Space wakes the avatar up in place and
   you are back in control (the banner goes away; see "Sleeping avatar").
2. Press Escape again (or press it while dead/assimilated, spectating). The game screen (canvas, HUD, minimap) is torn
   down and the login screen (`#login`) is shown again.
3. The avatar stays in the room; typing the same name in the login room and using WAKE UP (`#wakeup`) returns to it at
   the same position, awake (see "Login — wake up"), while TELEPORT gives a fresh avatar at a random floor spot.

**Covered by**: [e2e/login.spec.ts](e2e/login.spec.ts)

## Sleeping avatar (Escape / lost connection)

1. A player presses Escape (first press), closes the tab or loses their connection while their avatar is alive.
2. For everyone still in the room the avatar stands where it is (no running on) perfectly still — no stand animation —
   with its eyes shut, leaning forward and breathing slowly, with small bright "Z"s rising from its head and fading away.
   It takes no input until its player wakes it (Space while spectating it) or reattaches.
3. When the player reattaches (WAKE UP) the avatar wakes up: the lean and the Zs stop. (A dead player has no
   avatar left, so nothing sleeps.)

**Covered by**: [e2e/login.spec.ts](e2e/login.spec.ts) (second browser context watches the sleeper) and
[server/__tests__/session.test.ts](server/__tests__/session.test.ts) / [src/game/__tests__/sleepZs.test.ts](src/game/__tests__/sleepZs.test.ts).

## Inactivity

1. If a player sends no key for about a minute, the server stops streaming to them and tells their client they are
   inactive.
2. The client takes them back to the login screen exactly as if they had pressed Escape (no gray frozen screen);
   their avatar stays in the room and WAKE UP/TELEPORT work as usual.

**Covered by**: [e2e/inactivity-login.spec.ts](e2e/inactivity-login.spec.ts) (feeds the client the server's inactive
message, which would otherwise take a minute) and the server side in
[server/__tests__/socketHubRobotBody.test.ts](server/__tests__/socketHubRobotBody.test.ts).

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

## Blocks: touch, pick up, put down, throw

The coloured "cell blocks" are 3x3 blocks you can shove, pick up and throw. (The old "tap into a block with Down and
fire its powers with 1/2/3" mechanic and its top-right dashboard icons are gone — blocks no longer have buttons.)

1. **Touch**: standing against, on top of or under a block counts as touching it. Some blocks react (below); robots
   never trigger them.
2. **Spacebar** picks up a block you're touching — beside, under or over you; you no longer need to be standing on
   it. If you're touching several, the **nearest** one (centre to centre) is picked up. It then rides just above your
   head, following you; a block that can't be lifted there (a ceiling or another block is in the way) is skipped for the
   next-nearest. **Spacebar again throws it** ahead of you in the direction you're facing, in a short arc; **Down puts
   it back down** under your feet instead. You can't pick up a second block while carrying one. A block stuck to
   others leaves them (the orange block frees them all, see orange). Holding a key doesn't repeat the action (each
   press is one pickup/throw/put-down). The carried block is solid while it rides over your head: you can't run, jump
   or glide into a spot where it would end up inside a wall or another block (you stop as if you'd hit it, so you
   can't run under a low overhang or rise into a ceiling while carrying). If something shoves you into such a spot
   anyway, you let go of the block where it is instead of dragging it into the wall.
3. A thrown block flies up and forward, then falls and bounces like any block. **It also inherits your own motion**:
   throwing while running forward sends it farther, while jumping upward lobs it higher, while falling flatter/lower.

**Covered by**: [server/__tests__/avatar.test.ts](server/__tests__/avatar.test.ts) (pick up / pick up from the side / nearest of
several / out of reach / blocked overhead / can't jump or run the block into a ceiling or overhang / lets go when shoved into a wall / put down / throw / throw inherits the avatar's motion / no second pick-up) and [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) end to end in the browser on
the fixed green block (stand on it, pick it up, it follows you, Down puts it under you, pick it up again, face the
other way and Space throws it in an arc).

## Block physics (all blocks)

1. Blocks are light: an avatar (or robot) running into one pushes it. A pushed block also slides on a little way
   (a few cells) and then stops. Pushing a block from underneath (jumping into it) launches it upward. A block against
   a wall or another immovable thing doesn't move.
2. A block that falls and hits something bounces a little: the higher it fell from, the higher it bounces (the bounce
   is always much smaller than the fall, and dies out after a few hops; a short drop doesn't bounce at all).
3. A block that runs into a wall sideways hardly rebounds.

**Covered by**: [server/__tests__/manaPhysics.test.ts](server/__tests__/manaPhysics.test.ts) (shove + slide-and-stop,
walls hold blocks, bounce height grows with fall height, settling).

## The coloured blocks

Counts in MainRoom: 8 yellow, 10 red, 5 blue, 8 green, 6 orange, 6 rainbow, scattered at random (plus the
fixed yellow/green/red fixtures). **Purple blocks are switched off for now** (none are placed; the block itself still
works, see below).

- **Blue (ice)**: keeps sliding along whatever it rests on (rightward at first) at a steady pace. When a wall or
  something it can't push blocks it, it turns around and slides the other way, so it is always sliding when it can.
  It pushes anything light in its way.
- **Yellow**: an ordinary block until it is touched or picked up, after which gravity is reversed for it for good: it
  "falls upwards" — but only faintly (15% of normal gravity), so it drifts up slowly. Its art then shows an up arrow.
  When it hits the underside of a wall block (e.g. the room's ceiling) the reversed gravity switches off: the arrow
  goes away and it falls back down like an ordinary block, and merely standing beside it no longer sets it off — picking
  it up does. While an avatar **holds** it the upward gravity stays on (a held block doesn't move), so a carrier can
  glide up against the ceiling and keep going; if it is then put down or thrown it rises again until it hits a wall block. Whatever is **touching** an active yellow block becomes much lighter: an avatar carrying it
  (or standing against it) drifts upwards instead of falling, about one cell every three frames, so holding it lets you
  glide upward (you can still run and jump; put it down or throw it and you fall again), and a block resting against it is
  lifted too. (An avatar still standing right beside it overlaps the cells above it and holds it down until it steps away.)
- **Red**: touching or picking it up lights a five second fuse (the block flashes, faster as it burns down; the fuse
  keeps burning while it's carried or thrown). Then it blows up: every avatar (and robot) within 28 grid cells (224px)
  of its centre dies (with a knockback away from the blast), unless a wall is in the way, and every block within 30
  cells is shot away from the blast (more strongly the closer it is). The red block is destroyed; a fireball plays
  (with a bang and a small screen shake that fades with distance).
- **Green (shield)**: always wrapped in a big round protective bubble (a translucent green sphere, 31 cells — about
  four avatars — across, centred on the block and following it, also while carried; kept inside the room when the
  block is against an outer wall). The bubble blocks nothing physically, but rockets that enter it are destroyed and
  a red block's explosion can't kill anyone inside it (it doesn't stop robot touches).
- **Purple (gravity)** (currently not placed in the room): pulls every other block within 36 cells toward itself (harder the closer they are) until they
  touch it. Otherwise an ordinary block (falls, can be shoved, carried and thrown).
- **Orange (sticky)**: **repels other orange blocks** (a push that fades out over 24 cells, so they drift apart on the
  floor and big orange clumps are unlikely; blocks already glued together don't push each other). Sticks to every other block it touches (including other orange ones if they do meet; not rainbow ones), and
  the stuck blocks move, fall, bounce and get shoved as one rigid piece: if any one of them is blocked none moves,
  and an explosion's push is shared out among them. Any stuck block can still be picked up (Space): a block stuck to an
  orange one just leaves the group, but picking up the **orange block itself** un-sticks everything at once (they become
  ordinary loose blocks; put the orange one down next to them and it sticks again).
- **Rainbow (flashing)**: clings to walls and constantly crawls in one random direction until something is in its way
  (a wall, another block, even an avatar), then follows that object's edge, keeping it on its right — around inside and
  outside corners, up walls and along ceilings — and never wanders off into empty space while the object lasts. Ignores
  gravity while it is touching something; with nothing touching it at all (it spawned or was put down in mid-air, or the
  wall it followed is gone) it drops like any other block until it lands against something. It breaks
  if **thrown** and it hits anything: it turns into **5 blue diamonds** that pop out and fall (they bounce a little)
  and can be collected (see Score). Merely shoving a rainbow block doesn't break it.

**Covered by**: [server/__tests__/manaPhysics.test.ts](server/__tests__/manaPhysics.test.ts) (blue, yellow incl. the faint
upward fall and lifting avatars/blocks),
[server/__tests__/specialBlocks.test.ts](server/__tests__/specialBlocks.test.ts) (red fuse/blast radius/line of
sight/shove, green bubble and rockets, purple pull, orange rigid groups and repulsion, rainbow crawling/shattering, diamonds),
[server/__tests__/mainRoomBlocks.test.ts](server/__tests__/mainRoomBlocks.test.ts) (the room's mix of blocks and
fixtures) and [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) end to end for the fixed blocks:
touching the yellow block makes it rise, and touching the red block makes it explode five seconds later, killing
the avatar beside it while a second browser context far away watches (the red block disappears from its view, the
bystander survives). The visual look of each colour and the explosion is manual-only.

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
2. Warping through either corner stargate deposits the avatar at this spawn portal (as does teleporting in, when
   `CELLWARZ_RANDOM_TELEPORT=off`, which the e2e run sets; normally teleporting picks a random floor spot, see "Login —
   teleport"); since it floats above the floor below it, the avatar visibly drops a short distance before landing
   rather than appearing already standing.

**Covered by**: [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) (asserts a fresh avatar
settles at the known fixed spawn portal position after dropping) and
[e2e/reattach.spec.ts](e2e/reattach.spec.ts) (asserts reattaching returns to the same settled position).

## Death and respawn

1. An avatar dies when caught in a red block's explosion, caught in the blast of a robot's rocket, or touched by a robot
   (overlapping it or directly beside/above/below it — a robot patrolling into you, or you walking into a paused
   robot, both kill; robots never kill each other by touch, but a rocket's blast kills robots too); death
   still happens in exactly one hit (no health pool was added) — the only change is a short knockback (away from
   the blast or away from the robot) plays out over the death animation instead
   of an instant vanish.
2. On death the avatar's session is unplugged; the next teleport places a fresh avatar (a random floor spot, or the
   spawn portal in the e2e run, see "Spawn portal" above). WAKE UP is not offered, since there is nothing to wake.
3. The player who died sees their own screen flash/shake briefly (a one-shot server ping tells their client to
   play the effect), then **spectates**: nothing freezes — the world keeps moving as normal, and a message
   ("YOU DIED", with the controls) is shown at the top of the screen until they press Escape (the same applies if a
   planet swallows you). The arrow keys move a free camera around the room (it stays inside the room's bounds).
4. **A death by robot touch assimilates you**: your body immediately gets up as a new robot (red headband, no name
   tag, like every other robot) where you fell, and patrols like any robot — it doesn't freeze. Your own screen
   doesn't freeze either: it keeps showing the world, with the camera following your robot (you can no longer
   control it) and a "YOU WERE ASSIMILATED" message, until you press an arrow key, which activates the free camera
   from where it was (and the message changes to the free-camera one). Press Escape and TELEPORT to get a fresh avatar; the robot
   stays in the room as an ordinary robot. Other deaths (explosion, rocket) just kill you, with no robot.

**Covered by**: [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) end-to-end — one browser
context touches the fixed red block and waits beside it; a second context far away sees it die when the block
explodes five seconds later, then the victim teleports back in at the known fixed spawn portal position (WAKE UP is absent for them).
The knockback and death-flash are covered at the unit level
([server/__tests__/avatar.test.ts](server/__tests__/avatar.test.ts)), as is death-by-robot-touch
([server/__tests__/robot.test.ts](server/__tests__/robot.test.ts); the body is a live, moving, robot; no e2e of
the touch itself because robot positions are random), the follow-your-robot-body stream by
[server/__tests__/socketHubRobotBody.test.ts](server/__tests__/socketHubRobotBody.test.ts), and the client camera
following it (and an arrow key releasing it) by [e2e/robot-body.spec.ts](e2e/robot-body.spec.ts); the spectating
message, the world continuing and the free camera after a real death are asserted in the red-block spec of
[e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts); the client-side flash/shake/sound itself
is manual-only (no automated assertions on canvas pixels or WebAudio output). Death by robot rocket is unit-tested
only (robots are switched off in the e2e run).

## Robot rocket launcher

1. A robot that sees a real player (never another robot) within rocket range — between 24 and 70 grid cells away
   horizontally, no more than 30 cells higher or lower, with a clear arc (nothing solid in the way) — stops,
   turns toward them and pulls out a rocket launcher (a small launcher sprite that follows the robot) for about nine
   tenths of a second, then fires **one rocket** (the same rocket sprite the red block used to fire, flying a bit slower
   than it used to) in an **arc** (it rises, then curves down; it is aimed at where the player is at that moment, so a
   moving player can dodge), keeps the launcher out for another three quarters of a second, puts it away and goes back to patrolling. It rests for about four seconds before
   shooting again (one second if the player left range before it fired).
2. A rocket that touches a real player **or anything solid** (a wall or a block) **explodes** (the same fireball and
   line-of-sight blast as a red block, but smaller: avatars within 10 grid cells die with a knockback away from the
   blast, blocks within 20 are shoved); the touch itself doesn't kill, the blast does, so it can also catch players
   standing next to what it hit. **Robots die in the blast too** (including the one that fired it, if it is that
   close), but a rocket flies through robots without exploding on them. A green block's bubble destroys the rocket
   before anything inside is hurt (the bubble also shields from the blast). The room's edges end it silently, and it
   flies through other rockets.
3. Robots still kill by touch as before; destroying a robot also removes its launcher.
4. Rockets are easy to spot even in unlit space: each draws a bright flickering orange exhaust flame behind it and a
   hot white-yellow light on its tip (client-side and cosmetic only; manual check, no automated pixel assertions).

**Covered by**: [server/__tests__/specialBlocks.test.ts](server/__tests__/specialBlocks.test.ts) ("arcing rockets" and
"robot rocket launcher": stops, pulls out the launcher, fires an arc that explodes on a player in range, puts it away and
resumes patrolling; no shot when out of range, too close, behind a wall, or at another robot) and
[server/__tests__/robot.test.ts](server/__tests__/robot.test.ts) (patrol and touch). Not in the browser tests: the e2e
run switches robots off (they would kill test avatars at random).

## Multiplayer visibility

1. Two different login names connect to the same room.
2. Each sees the other's avatar rendered and named on screen.

**Covered by**: [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) — two browser contexts log in
to the single shared room and each asserts it can see the other's name and sprite.

## Debug recording (backtick)

1. While in-game, press the backtick key (`` ` ``) to start a debug recording. A blinking red `#recording` label
   ("REC 9.8s") appears top-left and counts down. The recording captures the world's sprite positions at the
   start, every message the server then sends (redraw frames, planet, score...) and every key press, all
   timestamped.
2. Press backtick again to stop. Otherwise it stops by itself after 10 seconds, or when you leave with Escape.
3. The finished recording is sent to the server, which writes it to `recordings/latest.json` (git-ignored,
   `CELLWARZ_RECORDINGS_DIR` overrides the folder). Only the latest is kept: a new recording overwrites the old
   file. The backtick key is never sent to the server as a game key. Use it right after an issue happens, then
   point whoever fixes it at `recordings/latest.json`.

**Covered by**: [e2e/recording.spec.ts](e2e/recording.spec.ts) (toggle, HUD, captured keys/positions, the 10s
auto-stop), [src/game/__tests__/recorder.test.ts](src/game/__tests__/recorder.test.ts) and
[server/__tests__/recordingStore.test.ts](server/__tests__/recordingStore.test.ts) (single-file overwrite, size cap,
login required).

## Game feel: audio, particles, screen shake, netcode smoothing

1. Running, landing, picking up/putting down/throwing a block, warping through a portal, a block exploding, a
   nearby avatar dying, collecting a diamond, and your own death now each play a short synthesized sound effect (WebAudio oscillator
   blips — no audio asset files were added; bitcrushed square/saw tones, filter sweeps, noise bursts) and, where
   relevant, a small dust/impact/warp particle puff at the sprite's position. A quiet synthwave bed (detuned
   drone plus a sparse arpeggio) starts on the first sound and stops when you leave the game screen (including when
   an idle player is sent back to the login screen, see "Inactivity").
   Warping and dying also trigger a brief RGB-glitch burst on the whole screen.
2. Movement for every avatar, and the camera itself, is smoothed between server updates instead of snapping to
   each new position; your own avatar's left/right movement also predicts locally the instant a key is pressed
   and quietly reconciles against the server a few frames later (large mismatches — a wall, a push, a warp — snap
   instead of sliding).
3. None of this changes actual gameplay: it's a purely cosmetic/client-side layer on top of the exact same
   server-authoritative positions and collision outcomes as before.

**Covered by**: mostly manual verification — this is inherently visual/audio polish with no discrete state to
assert on in Playwright (no pixel-diffing or WebAudio-output assertions are in place). The exception is the music
pausing/resuming (in the audio manager): [src/game/__tests__/audio.test.ts](src/game/__tests__/audio.test.ts) (with a fake AudioContext). The underlying data it's
built on (sprite positions, the `died` ping) is exercised indirectly by the existing movement/death/multiplayer
tests above, which would fail if the underlying server behavior changed.

## Minimap

1. While in-game, a mostly-transparent "radar" (the minimap) sits in the bottom-right corner (`#minimap`, canvas
   `#minimap-canvas`) labelled MAIN ROOM, showing the room's walls in cyan, other players as magenta dots, robots
   as red dots, and your own avatar as a larger pulsing white dot with a lime outline. The pulse pauses while the
   browser page is hidden. The level's gas giant (see "Gas giant planet") shows as an amber disc with a ring,
   clipped to the map while it flies in or out.
2. Click the small "x" (`#minimap-toggle`) to collapse it into a much smaller icon in the same corner; click the
   icon to reopen it. (It's deliberately not a focusable `<button>` so the Spacebar pickup/throw key can't
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
exception is a rocket: it never wraps around the room's edges — it flies out of an opening and simply ends at the
room's edge instead of coming out the opposite side.

**Covered by**: [server/__tests__/mainRoomWrap.test.ts](server/__tests__/mainRoomWrap.test.ts) (opening geometry,
jump-reachability of the side openings),
[server/__tests__/physics.test.ts](server/__tests__/physics.test.ts) (edge wrapping),
[server/__tests__/missile.test.ts](server/__tests__/missile.test.ts) (a rocket ends at the edge instead of wrapping), and
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
   opposite directions) so neighbouring beams briefly overlap; the lamp fixtures themselves stay fixed to the ceiling. The black ninja avatars (and robots) are drawn over
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
   (quadratic falloff): avatars/robots and every coloured block except the rainbow one, which ignores gravity (not ones being
   carried) are moved on the server grid through normal physics, so walls and heavier things still block the pull
   and you can run or jump out of the weak outer edge. The pull is deliberately gentle outside the
   planet (about half of gravity even at its surface), so it drags things sideways/down but never lifts a sprite off
   the ground. Over the planet itself (anywhere within its disc) the pull is much stronger — stronger than normal
   gravity, so it can drag a sprite up into it and quickly sends it to the core. The background tetromino pieces
   (client-side) fall toward it too (also harder over the planet), without being broken by it.
3. Anything whose centre reaches the planet's core (the middle 15% of its radius) is swallowed: it slides into the
   exact centre while shrinking away over one second (as if being pulled off into the distance), and only when it
   has vanished is it destroyed — a block is removed from the game, an avatar or robot dies (the usual death
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
   and starting at 0. A second score sits right under it (`#diamonds`, just the number, visually marked with a
   💎 emoji): the **blue diamonds** collected (see the rainbow block above).
2. When *your* avatar breaks a background block (see "Space background"), the blocks burst outward, then fly
   across the screen to the score and disappear on arrival, adding 20 points per block (a tetromino is 4 blocks,
   so 80). Blocks broken by other players fly apart without scoring for you.
3. The client reports collected blocks to the server (`scored` message), which keeps the authoritative total on
   the user's `Session`; it persists across death/respawn and reattach (the full-state payload carries `score`).
   Scores are in-memory only, like all game state.
4. The old debug frame-stats text in the top-left corner has been removed.
5. **Diamonds**: the first real player (not a robot) whose body touches a diamond collects it — this works for any
   avatar of that player, including after a warp, reattach or respawn. It disappears at your avatar, flies across the
   screen to the diamonds counter, and the counter goes up by one as it arrives (with a pickup blip). The server owns the count (`Session`), sends it as `diamonds`
   in the full-state payload and as a separate `{ diamonds }` one-shot message whenever it changes; it persists
   across death/respawn and reattach like the credits.

**Covered by**: [e2e/space-background.spec.ts](e2e/space-background.spec.ts) (breaking a block adds 20 per block to
the `#score` text), [src/game/__tests__/spaceBackground.test.ts](src/game/__tests__/spaceBackground.test.ts) (only
the local avatar's blocks fly to the target and are counted) and
[server/__tests__/session.test.ts](server/__tests__/session.test.ts) (20 points per block, kept across re-plug).
Diamonds: [server/__tests__/specialBlocks.test.ts](server/__tests__/specialBlocks.test.ts) (fall, bounce, collected by
players but not robots),
[server/__tests__/socketHubDiamonds.test.ts](server/__tests__/socketHubDiamonds.test.ts) (the `{ diamonds }` message
and full-state total), [server/__tests__/session.test.ts](server/__tests__/session.test.ts),
[src/game/__tests__/diamondFlight.test.ts](src/game/__tests__/diamondFlight.test.ts) (the flight/arrival logic) and the
HUD counter, including the fly-then-count behavior (replaying the server's messages), in
[e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts). Actually picking a diamond up in the room is
unit-tested only (the e2e room has no random blocks to break).

## Removed workflows

- **Chat** (typing a message and pressing Enter to broadcast it to the room) was removed from both client and
  server; player communication will be replaced by a different system later. There is no chat-related test
  coverage to maintain.
