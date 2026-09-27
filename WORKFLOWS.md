# Workflows

Source of truth for Cellwarz's browser regression tests (`e2e/`). Each workflow below lists the user-facing
behavior, how to trigger it, and whether it's covered by an automated Playwright test or requires manual
verification (mostly cases that depend on server-side randomness — spawn position, room assignment — that
aren't yet exposed to tests in a deterministic way).

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
pickup). Not covered end-to-end in the browser — mana positions are randomized per room at server startup, so
there's no stable selector/location for a browser test to target yet.

## Portal warp

1. Walk into a Portal sprite (a variant of the cryogenic door) while running.
2. The avatar is relocated to a random other room; the client receives a full state refresh.

**Covered by**: [server/__tests__/portal.test.ts](server/__tests__/portal.test.ts) at the engine level. Not
covered end-to-end — portal position is randomized per room at server startup.

## Death and respawn

1. An avatar dies when hit by a Missile (from a Launcher) or burned by active engine fire.
2. On death the avatar's session is unplugged; the next login/reattach places it at a fresh entrance.

**Manual verification only** — reproducing this deterministically requires two coordinated sessions and
randomized mana/room placement; not yet covered by an automated test.

## Multiplayer visibility

1. Two different login names connect to the same room.
2. Each sees the other's avatar rendered and named on screen.

**Manual verification only** — not yet covered by an automated test (would require two concurrent browser
contexts landing in the same one of the five rooms, which isn't guaranteed since room assignment is random).

## Removed workflows

- **Chat** (typing a message and pressing Enter to broadcast it to the room) was removed from both client and
  server; player communication will be replaced by a different system later. There is no chat-related test
  coverage to maintain.
