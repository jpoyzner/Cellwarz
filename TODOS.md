# TODOs

## Techincal Approaches & Video Game Basics

- Make it play the game itself to help understand and improve gameplay, keep this mechanism, maybe expand into a development harness for validating video game play, maybe it can suggest the best way to approach this
- Mana pickup/tool activation, portal warp, death/respawn, and multiplayer visibility are now all covered
  end-to-end in the browser (see [e2e/main-room-workflows.spec.ts](e2e/main-room-workflows.spec.ts) and
  [WORKFLOWS.md](WORKFLOWS.md)), using MainRoom's fixed entrance/portals plus one deterministic
  Thruster/Launcher fixture pair. Remaining gaps: death-by-engine-fire specifically (only death-by-missile is
  automated so far), and general mana/booster/ice positions elsewhere in the room are still randomized.
  `MainRoom.getNumRobots()` is temporarily `0` — robots only ever run one direction until permanently blocked,
  so they'd inevitably camp on the fixed test fixtures; re-enable once there's dedicated robot e2e coverage (or
  robots gain a turn-around behavior) to justify the risk.

## Iddeas for game features

- Realtime, side-scrolling multiplayer 2D puzzle game, originally shipped at cellwarz.com. Dormant/backlog — needs a full rewrite with modern tech, but Jeff retains genuine interest. See kb/projects/cellwarz.md. Also possibly ask to rewrite physics or go with something better. I will also use my DJ Recognize site to host cellwarz realtime multiplayers that can remember things if you sign up! Think about limiting chat to avoid hate, maybe just one emoji at a time as a speak bubble above, follows the avatar head perfectly.

- In main room: Near the top floating on a central platform is a DJ booth. Players can sign up and register a song/mix (first 1 hour of it max). that if they are first to sit at the DJ booth when no song is playing, they get to play it. (maybe have a max of 1 play per 4 hours or so?). The players can fight for this with blocks.
Make holes at the top and on sides that when a player falls through, they appear on the other side, so they can take shortcuts. Doors should be at the corners of the recatngle
- Make level designer?

- A "side-quest" mode that players will be able to take that takes them to randomaly generated rooms where they fight NPCs and build around challenges using blocks. They will enter this mode from the main multiplayer mode somehow (we will define this later).

- Need to decide whether players will have their own room or just a big bag of inventory for picking up and hoarding blocks.

- Be able to see the whole game in the background of the DJ Recognize website (in the space), and make it the entry into this game. Perhaps a spaceship can take you to the game somehow. Maybe it bothers the website users.

- Give the 2D UX a "box-shadow" so that it looks 3D, OR EVEN BETTER: Render the actual graphics in 3D but keep the gameplay in 2D for actual physics.

- Could this be a team sport? Maybe NPC players try to guard the tree!!!! Or do they just annoy/kill players? Maybe make them replicate like in exodus lol!?? Game NPC AI - Use Exodus decision trees to drive NPC avatars in CellWarz (the ninja game). Instead of scripted behavior, ninjas evolve their own movement and combat logic autonomously.
    - Trees evolve to control NPC players — movement, targeting, attacking
    - Free to run — no tokens, no API costs, purely computational
    - Sebastian expressed interest; could be a collaborative side project
    - Scoring would need to be adapted for game outcomes (e.g. survival time, kills, territory)

- Maybe make a room where people can collaborate on live music somehow!!! Maybe they play instruments synced together in the same room live!?! A realtime interactive DAW?

- Have events where people submit songs and people vote? Basically to reproduce groove outpost, but maybe this can be done over all time instead of around specific events

- if it gets popular, host real DJs for special hours

## Real Users & Deployment

- If persistence is ever needed (session/avatar state surviving a server restart), use a NoSQL store — no DB is in use today.