---
title: Monsoon Dash
slug: monsoon-dash
pitch: A chai cup riding a scooter dodges potholes and puddles in heavy Mumbai rain.
credits: [Jatin]
created: 2026-11-06
approved_by: [Jatin]
---
## Controls
Keyboard: ArrowLeft / ArrowRight to swerve. Touch: on-screen ◀ ▶ buttons.
## Core loop
The chai-cup scooter auto-rides down a rain-soaked street. Potholes and puddles scroll
toward the player; swerve to dodge them and grab samosas for points. Rain intensity (and
obstacle speed/frequency) ramps up the longer the run lasts.
## Win/Lose
Endless survival run; there is no win state. Hitting a pothole or puddle ends the run.
Space, Enter or tap restarts from the title or game-over screen.
## Scoring
+1 score per second survived. +10 score per samosa grabbed.
## Look & feel
Grey rain-slicked street, falling rain streaks, a chai-cup character on a little scooter.
Splash/puddle-spray particle burst on a hit, steam-wisp sparkle on a samosa grab, screen
shake on crash.
## Sound
WebAudio only: soft splash blip on hit, cheerful chime on samosa grab, ambient rain hiss.
## Acceptance
1. Score increases over time while `state().scene === 'playing'`.
2. Grabbing a samosa increases `state().score` by 10.
3. Touching a pothole or puddle ends the run (`state().scene === 'over'`).
4. Obstacle speed/frequency (e.g. `state().speed`) increases the longer the run lasts.
5. The game has a title screen, game-over screen, and restarts on Space/Enter/tap.
