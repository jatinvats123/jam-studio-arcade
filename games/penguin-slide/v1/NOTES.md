# Penguin Slide v1 — notes

- Core loop: penguin auto-slides, player steers left/right with ArrowLeft/ArrowRight (or A/D,
  or the on-screen ◀ ▶ buttons); snowmen and fish fall from the top at increasing speed.
- Scoring: +1/sec survived (`addScore(1)` on a 1s timer) and +10 per fish grabbed, with a
  "+10 fish!" popup and sparkle burst; hitting a snowman ends the run.
- Difficulty ramps via `speed = 1 + runTime * 0.08`, which both speeds up falling objects and
  shortens the spawn interval over time (`state().speed` rises with `state().time`).
- Juice: continuous snow trail behind the penguin, drifting background snow, icy blue gradient
  backdrop (drawn inside `Game.draw` so it layers over the engine's starfield), screen shake +
  ice-shard burst + crunchy thud on snowman hit, soft tick beep per score second, cheerful blip
  on fish pickup.
- `state()` exposes `playerX`, `speed`, `snowmen`, `fish` counts alongside the engine's
  `scene`/`score`/`best`/`time`, covering all 6 acceptance items.
- Title/game-over screens, restart and mute are all handled by the unmodified starter engine.
