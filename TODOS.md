# TODOs

## Core Gameplay

- when you die you are in spectator mode (things should not freeze) until you press esc (already the case when a planet sucks you in). You should get a message for this. But everything else should move as normal. When in spectator mode, you can move around the screen by using arrow buttons. If you were converted to a robot, it should follow the robot around until you press an arrow key to activate free movement.
- when client becomes inactive, instead of gray stop screen, take them back to login

- space picks up nearest block, you just need to be touching them now, not be over them to pick them up.

- make sure all blocks are working correctly (play around with them)

- make login room feel like you are in a ship/rocket. Have your avatar and you can move them aorund in a small transporter room. In stead of the reattach respawn buttons have two tranporters, one with "Reatach" one with "Respawn" over it. Have the live radar shown in the room also. They can also be customized here (headband and belt color).


- add more videos! (maybe landscape ones too?)


## INTEGRATION TO REAL SITE

- use my DJ Recognize site to host cellwarz realtime multiplayers that can remember things if you sign up! Think about limiting chat to avoid hate, maybe just one emoji at a time as a speak bubble above, follows the avatar head perfectly.
- add an "exit" button on login screen that takes you back to my website.
- controls need to work on a phone and login screen updated to explain them
- If persistence is ever needed (session/avatar state surviving a server restart), use a NoSQL store — no DB is in use today.
- check for vulnerabilities, in case some dj asshole hacks into it.
Show number of users, and show other users in a specific color.
- DONE (first pass): robots stand still for a second before turning around; touching one kills you and turns your body into a (red) robot that keeps patrolling, with your camera following it. Follow-ups: let a converted player keep some control, or rejoin the swarm differently?

- Need a record/debug mode that captures position of everything to report weird situations so it can rerun and fix.

## Core Features

- have A flower spit out the blocks: I might want this for mana blocks bewing spewed out by the plant, make them roll as they fly out and whenever they fall they should bounce.

- EXPLORE AUDIO.TS!!!!!!!!! IT USES A BASS NOTE SO WELL :) MAYBE IT IS TIME TO MAKE AI MUSIC WITH THIS!!!
- Maybe make a room where people can collaborate on live music somehow!!! Maybe they play instruments synced together in the same room live!?! A realtime interactive DAW?

- In main room: Near the top floating on a central platform is a DJ booth. Players can sign up and register a song/mix (first 1 hour of it max). that if they are first to sit at the DJ booth when no song is playing, they get to play it. (maybe have a max of 1 play per 4 hours or so?). The players can fight for this with blocks. Doors should be at the corners of the recatngle
- When a song or DJ set is on, they all put on headphones, but you can switch back to regular game sounds. Make it so that they can for now put on headphones and listen to my songs? Little notes should be coming out of the headphones...

- A "side-quest" mode that players will be able to take that takes them to randomaly generated rooms where they fight NPCs and build around challenges using blocks. There should be a danger sign, and it should be located at the ends of floors 2 & 3. They will enter this mode from the main multiplayer mode somehow (we will define this later).

- Need to decide whether players will have their own room or just a big bag of inventory for picking up and hoarding blocks.

- Be able to see the whole game in the background of the DJ Recognize website (in the space), and make it the entry into this game. Perhaps a spaceship can take you to the game somehow. Maybe it bothers the website users.
AND VICE VERSA. Maybe make the tertis pieces float by in the cellwarz levels also and wwe try to break them for points?

- Add "Fortunate Lies" book to djrecognize.com

## Game expansions

- Swap the bespoke Physics grid-push system for something like matter-js/planck.js only if you ever want slopes/rotation/finer collision — not necessary for the current flat-platform aesthetic, and would be the highest-effort, lowest-necessity item here. 

- coop games, humans playing against the robots

- Cyberpunk pass follow-up: a hazard room element (electrified floor blocks / laser grids reusing the engine-fire kill + knockback) and in-game renames (mana → data shards, launcher → pulse rifle) were deferred; only the client-side look/sound was done.

- Have events where people submit songs and people vote? Basically to reproduce groove outpost, but maybe this can be done over all time instead of around specific events
- if it gets popular, host real DJs for special hours or have a marathon with us playing in there, invtie Michael Liu.