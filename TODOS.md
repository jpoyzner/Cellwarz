# TODOs

## Core Gameplay

- Perhaps instead of activating the bocks over them, let them just use physics:
  - yellow block levitates up somehow?
  - red block can blow up somehow? Maybe you activate it somehow?

- use my DJ Recognize site to host cellwarz realtime multiplayers that can remember things if you sign up! Think about limiting chat to avoid hate, maybe just one emoji at a time as a speak bubble above, follows the avatar head perfectly.
- add an "exit" button on login screen that takes you back to my website.
- controls need to work on a phone and login screen updated to explain them
- If persistence is ever needed (session/avatar state surviving a server restart), use a NoSQL store — no DB is in use today.
- check for vulnerabilities, in case some dj asshole hacks into it.
Show number of users, and show other users in a specific color.
- DONE (first pass): robots stand still for a second before turning around; touching one kills you and turns your body into a (red) robot that keeps patrolling, with your camera following it. Follow-ups: let a converted player keep some control, or rejoin the swarm differently?

- Need a record/debug mode that captures position of everything to report weird situations so it can rerun and fix.

## Core Features

- We need a green shield block

- EXPLORE AUDIO.TS!!!!!!!!! IT USES A BASS NOTE SO WELL :) MAYBE IT IS TIME TO MAKE AI MUSIC WITH THIS!!!
- Could this be a team sport? Maybe NPC players try to guard the tree!!!! Or do they just annoy/kill players? Maybe make them replicate like in exodus lol!?? Game NPC AI - Use Exodus decision trees to drive NPC avatars in CellWarz (the ninja game). Instead of scripted behavior, ninjas evolve their own movement and combat logic autonomously.
    - Trees evolve to control NPC players — movement, targeting, attacking
    - Free to run — no tokens, no API costs, purely computational
    - Sebastian expressed interest; could be a collaborative side project
    - Scoring would need to be adapted for game outcomes (e.g. survival time, kills, territory)

- have the flower spit out the blocks: Swap the bespoke Physics grid-push system for something like matter-js/planck.js only if you ever want slopes/rotation/finer collision — not necessary for the current flat-platform aesthetic, and would be the highest-effort, lowest-necessity item here. I might want this for mana blocks bewing spewed out by the plant, make them roll as they fly out and whenever they fall they should bounce.

- Make ice blocks or other blocks climb walls like in boulderdash!?

- Possibly instead of pressing down on blocks, just touching them and any blocks they tuch is enough to get their powers...the tricky part is controlling them.

- In main room: Near the top floating on a central platform is a DJ booth. Players can sign up and register a song/mix (first 1 hour of it max). that if they are first to sit at the DJ booth when no song is playing, they get to play it. (maybe have a max of 1 play per 4 hours or so?). The players can fight for this with blocks. Doors should be at the corners of the recatngle
- Make level designer?

- A "side-quest" mode that players will be able to take that takes them to randomaly generated rooms where they fight NPCs and build around challenges using blocks. There should be a danger sign, and it should be located at the ends of floors 2 & 3. They will enter this mode from the main multiplayer mode somehow (we will define this later).

- Need to decide whether players will have their own room or just a big bag of inventory for picking up and hoarding blocks.

## Social features

- Be able to see the whole game in the background of the DJ Recognize website (in the space), and make it the entry into this game. Perhaps a spaceship can take you to the game somehow. Maybe it bothers the website users.
AND VICE VERSA. Maybe make the tertis pieces float by in the cellwarz levels also and wwe try to break them for points?

## Game expansions

- Cyberpunk pass follow-up: a hazard room element (electrified floor blocks / laser grids reusing the engine-fire kill + knockback) and in-game renames (mana → data shards, launcher → pulse rifle) were deferred; only the client-side look/sound was done.

- Maybe make a room where people can collaborate on live music somehow!!! Maybe they play instruments synced together in the same room live!?! A realtime interactive DAW?

- Have events where people submit songs and people vote? Basically to reproduce groove outpost, but maybe this can be done over all time instead of around specific events
- if it gets popular, host real DJs for special hours

- Add "Fortunate Lies" book to djrecognize.com