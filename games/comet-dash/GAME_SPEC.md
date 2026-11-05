---
title: Comet Dash
slug: comet-dash
pitch: A space cat dodges falling comets and collects stars, speeding up the longer it survives.
credits: [Jatiiin.vats]
created: 2026-11-05
remix_of: cat-vs-cucumbers
---
## Controls
Keyboard: ArrowLeft / ArrowRight to move. Touch: on-screen ◀ ▶ buttons.
## Core loop
A cat astronaut floats along the bottom of a starfield. Comets spawn at random x
positions at the top and streak straight down; stars spawn the same way but can be
collected. Fall speed and spawn rate for both ramp up steadily the longer the run lasts.
## Win/Lose
No win state — endless survivor. Any comet touching the cat ends the run. Restart via
Space/Enter/tap.
## Scoring
Score increases every second survived, plus +10 for each star collected.
## Look & feel
Deep-space canvas art: a cat in a round helmet, glowing streaked comets, twinkling
starfield background. Screen shake + spark burst on a hit; a brief sparkle trail on
star pickup.
## Sound
WebAudio beeps: soft tick each second scored, a bright chime on star pickup, low thud
on game over.
## Acceptance
1. Score increases while `state().scene === 'playing'`.
2. `state().speed` (fall speed/spawn rate) increases as `state().time` increases.
3. A comet overlapping the cat sets `state().scene === 'over'`.
4. Collecting a star increases `state().score` by 10 and removes that star.
5. `start()` from the title screen moves `state().scene` to `'playing'` with score 0.
6. `reset()` returns to `state().scene === 'title'`.
