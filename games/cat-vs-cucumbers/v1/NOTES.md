# Cat vs Cucumbers v1 — build notes

- Cat moves left/right at the bottom of the screen; cucumbers spawn at random x at
  the top and fall straight down, matching the Block Rain engine's dodge loop.
- Fall speed and spawn rate both scale with `speed = 1 + time * 0.08`, exposed via
  `state().speed`, so difficulty ramps continuously the longer the run lasts.
- Score ticks up by 1 every second survived while `scene === 'playing'` (a soft
  tick beep plays each tick), independent of dodge count.
- A cucumber overlapping the cat's hitbox triggers a green particle burst, screen
  shake and a low thud beep, then ends the run (`scene === 'over'`).
- Re-skinned the shared palette to a bright sky (light blue gradient) with an
  orange/green accent pair, and added a translucent HUD bar behind the score/best
  readout so text stays legible over the light background.
- Cat and cucumber sprites are hand-drawn canvas shapes (ears, stripes, eyes;
  ridged cucumber body) — no emoji/images, keeping the file self-contained.
