---
title: Cat vs Cucumbers
slug: cat-vs-cucumbers
pitch: A jumpy cat dodges falling cucumbers that keep getting faster.
credits: [billusanda5808]
created: 2026-11-05
---
## Controls
Keyboard: ArrowLeft / ArrowRight to move. Touch: on-screen ◀ ▶ buttons.
## Core loop
Cat walks along the bottom of the screen. Cucumbers spawn at random x positions
at the top and fall straight down. Fall speed and spawn rate both ramp up
steadily the longer the run lasts.
## Win/Lose
No win state — it's an endless survivor. Any cucumber touching the cat ends
the run (game over). Restart via Space/Enter/tap.
## Scoring
Score increases every second survived. `best` persists the top score for the
session.
## Look & feel
Bright flat-color canvas art: orange cat (triangle ears, circle body), green
cucumber emoji or simple rounded-rect sprites falling from a light sky
background. Screen shake + particle burst on a hit.
## Sound
WebAudio beeps: soft tick on each second scored, low thud on game over.
## Acceptance
1. Score increases while `state().scene === 'playing'`.
2. `state().speed` (fall speed/spawn rate) increases as `state().time` increases.
3. A cucumber overlapping the cat sets `state().scene === 'over'`.
4. `start()` from the title screen moves `state().scene` to `'playing'` with score 0.
5. `reset()` returns to `state().scene === 'title'`.
6. Game runs with only `ArrowLeft`/`ArrowRight` and on-screen touch buttons — no other input needed.
