# Workflows

Source of truth for Cellwarz's browser regression tests (`e2e/`). Each workflow below lists the user-facing
behavior, how to trigger it, and whether it's covered by an automated Playwright test or requires manual
verification. The entrance spawn point, portal positions, and one Thruster/Launcher pair are all fixed and
deterministic since [MainRoom](server/cell/mainRoom.ts) replaced the old randomized room layout, and every
login currently lands in the same single room (see [TODOS.md](TODOS.md)) — together these closed most of the
prior randomness-driven browser-test gaps below. The room's *other* mana/booster/launcher/ice positions stay
randomized (robots are disabled for now — see the note in [mainRoom.ts](server/cell/mainRoom.ts)).

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

**Covered by**: [e2e/movement.spec.ts](e2e/movement.spec.ts) (run right); jump and gravity/collision physics are
covered at the unit level in [server/__tests__/physics.test.ts](server/__tests__/physics.test.ts) and
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

1. Walk into a Portal sprite (a variant of the cryogenic door) while running.
2. The avatar is relocated back to the entrance of the (currently only) room; the client receives a full state
   refresh.

**Covered by**: [server/__tests__/portal.test.ts](server/__tests__/portal.test.ts) at the engine level, and
[e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) end-to-end (walks the whole floor to the
bottom-left portal and asserts the avatar warps back to the exact entrance position).

## Death and respawn

1. An avatar dies when hit by a Missile (from a Launcher) or burned by active engine fire.
2. On death the avatar's session is unplugged; the next login/reattach places it at a fresh entrance.

**Covered by**: [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) end-to-end — one browser
context connects to the fixed Launcher fixture and fires a missile at a second context's avatar standing in its
path, then reattaches the victim and asserts it respawns at the (fixed) entrance. Burn-from-engine-fire death is
still manual-only (a Thruster can't burn its own connected pilot by design, so it needs a second avatar
deliberately standing in the flame — not yet automated).

## Multiplayer visibility

1. Two different login names connect to the same room.
2. Each sees the other's avatar rendered and named on screen.

**Covered by**: [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) — two browser contexts log in
to the single shared room and each asserts it can see the other's name and sprite.

## Removed workflows

- **Chat** (typing a message and pressing Enter to broadcast it to the room) was removed from both client and
  server; player communication will be replaced by a different system later. There is no chat-related test
  coverage to maintain.
