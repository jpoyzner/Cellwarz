# TODOs

## Core features

- need an overvew map! At least for admin!

- put holes in the ends of levels 2 and 3 and also near the ends of floor 1 (to drop to floor 4)

- give it a cyberpubk flare? Make the background dark and spacy and have the platforms and blocks and avatar light up more

- Redesign the login screen

- Give the 2D UX a "box-shadow" so that it looks 3D, OR EVEN BETTER: Render the actual graphics in 3D but keep the gameplay in 2D for actual physics. I wonder if this can dbe done with fancy CSS
- have the flower spit out the blocks: Swap the bespoke Physics grid-push system for something like matter-js/planck.js only if you ever want slopes/rotation/finer collision — not necessary for the current flat-platform aesthetic, and would be the highest-effort, lowest-necessity item here. I might want this for mana blocks bewing spewed out by the plant, make them roll as they fly out and whenever they fall they should bounce.

- Make ice blocks or other blocks climb walls like in boulderdash!?

- Possibly instead of pressing down on blocks, just touching them and any blocks they tuch is enough to get their powers...the tricky part is controlling them.

- use my DJ Recognize site to host cellwarz realtime multiplayers that can remember things if you sign up! Think about limiting chat to avoid hate, maybe just one emoji at a time as a speak bubble above, follows the avatar head perfectly.

- In main room: Near the top floating on a central platform is a DJ booth. Players can sign up and register a song/mix (first 1 hour of it max). that if they are first to sit at the DJ booth when no song is playing, they get to play it. (maybe have a max of 1 play per 4 hours or so?). The players can fight for this with blocks.
Make holes at the top and on sides that when a player falls through, they appear on the other side, so they can take shortcuts. Doors should be at the corners of the recatngle
- Make level designer?

- A "side-quest" mode that players will be able to take that takes them to randomaly generated rooms where they fight NPCs and build around challenges using blocks. There should be a danger sign, and it should be located at the ends of floors 2 & 3. They will enter this mode from the main multiplayer mode somehow (we will define this later).

- Need to decide whether players will have their own room or just a big bag of inventory for picking up and hoarding blocks.

- Need a record/debug mode that captures position of everything to report weird situations so it can rerun and fix.

- If persistence is ever needed (session/avatar state surviving a server restart), use a NoSQL store — no DB is in use today.


## Social features

- Be able to see the whole game in the background of the DJ Recognize website (in the space), and make it the entry into this game. Perhaps a spaceship can take you to the game somehow. Maybe it bothers the website users.

- Could this be a team sport? Maybe NPC players try to guard the tree!!!! Or do they just annoy/kill players? Maybe make them replicate like in exodus lol!?? Game NPC AI - Use Exodus decision trees to drive NPC avatars in CellWarz (the ninja game). Instead of scripted behavior, ninjas evolve their own movement and combat logic autonomously.
    - Trees evolve to control NPC players — movement, targeting, attacking
    - Free to run — no tokens, no API costs, purely computational
    - Sebastian expressed interest; could be a collaborative side project
    - Scoring would need to be adapted for game outcomes (e.g. survival time, kills, territory)

## Game expansions

- Maybe make a room where people can collaborate on live music somehow!!! Maybe they play instruments synced together in the same room live!?! A realtime interactive DAW?

- Have events where people submit songs and people vote? Basically to reproduce groove outpost, but maybe this can be done over all time instead of around specific events
- if it gets popular, host real DJs for special hours