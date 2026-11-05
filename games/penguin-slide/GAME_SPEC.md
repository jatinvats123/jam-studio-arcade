---
title: Penguin Slide
slug: penguin-slide
pitch: A penguin slides down an icy hill, dodging snowmen and grabbing fish, speeding up the longer it survives.
credits: [Jatiiin.vats]
created: 2026-11-05
---
## Controls
Keyboard: ArrowLeft / ArrowRight to slide sideways. Touch: on-screen ◀ ▶ buttons.
## Core loop
The penguin auto-slides down an endless icy hill; snowmen and fish scroll up from the bottom
(or fall from the top) at increasing speed and spawn rate the longer the run lasts.
## Win/Lose
No win state — survive as long as possible. Touching a snowman ends the run.
## Scoring
Score increases by 1 per second survived, plus +10 for each fish grabbed.
## Look & feel
Cool blues/whites, icy gradient background, snow particle trail behind the penguin, screen
shake + ice-shard burst on hitting a snowman, little sparkle burst on grabbing a fish.
## Sound
Soft whoosh/beep per score tick, a cheerful blip on fish pickup, a crunchy thud on snowman hit.
## Acceptance
1. Score increases while the player is alive (`state().score`).
2. Speed increases as time passes (`state().speed` rises with `state().time`).
3. Touching a snowman ends the run (`state().scene === 'over'`).
4. Grabbing a fish increases `state().score` by 10 and removes that fish.
5. `start()` moves scene from `'title'` to `'playing'` and resets `score` to 0.
6. `reset()` returns scene to `'title'`.
