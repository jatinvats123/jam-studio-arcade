---
title: Diwali Rocket
slug: diwali-rocket
pitch: A Diwali rocket climbs into the night sky, dodging kites and grabbing diyas for points.
credits: [Jatin]
created: 2026-11-07
approved_by: [Jatin]
---
## Controls
Keyboard: ArrowLeft / ArrowRight to steer. Touch: on-screen ◀ ▶ buttons.
## Core loop
The rocket auto-climbs into the night sky. Kite strings drift across the screen; steer
around them and collect diyas for points. The climb speeds up and kites get denser the
higher (longer) the run goes.
## Win/Lose
Endless climb; there is no win state. Hitting a kite ends the run. Space, Enter or tap
restarts from the title or game-over screen.
## Scoring
+1 score per second survived (altitude). +10 score per diya grabbed.
## Look & feel
Night sky with stars and a glowing moon, a trailing sparkler/flame tail on the rocket,
colourful kites, warm glowing diyas. Firework-spark burst on a hit, gentle twinkle on a
diya grab, screen shake on crash.
## Sound
WebAudio only: soft whoosh for the climb, crackle-pop on hit, chime on diya grab.
## Acceptance
1. Score increases over time while `state().scene === 'playing'`.
2. Grabbing a diya increases `state().score` by 10.
3. Touching a kite ends the run (`state().scene === 'over'`).
4. Obstacle speed/frequency (e.g. `state().speed`) increases the longer the run lasts.
5. The game has a title screen, game-over screen, and restarts on Space/Enter/tap.
