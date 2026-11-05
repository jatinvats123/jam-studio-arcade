# Comet Dash v1 — build notes

- Remixed from Cat vs Cucumbers: same cat-dodging loop, now a space-cat astronaut
  floating in a starfield, dodging comets and collecting stars.
- Comets and stars both ramp fall speed with `speed = 1 + runTime * 0.07`, read live
  via `state().speed`; comet/star spawn intervals shrink as speed rises.
- Stars give +10 score and vanish with a sparkle burst + chime on pickup; scoring also
  ticks +1 per second survived, same cadence as the original.
- Hit a comet → spark burst, screen shake, low thud, `state().scene` flips to `'over'`.
- Cat redesigned as a round-helmet space cat (glass dome, visor glint, cat ears poking
  out, whiskers) with a thruster-dust trail while strafing.
- `state()` exposes `catX`, `comets`, `stars`, `speed` for the playtester on top of the
  engine's `scene`/`score`/`best`/`time`.
