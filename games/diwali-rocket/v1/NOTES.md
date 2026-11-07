# Diwali Rocket v1 notes

- Built from the starter's dodge loop, flipped into a vertical climb: rocket steers left/right near the bottom of the screen while kites and diyas fall past it.
- Scoring: +1/sec survived (altitude via a scoreTimer accumulator) and +10 per diya grabbed, each with its own twinkle burst + chime beep.
- Kites end the run on contact (firework burst, screen shake, crackle-pop beep); a near-miss pops a "close!" text for feel.
- `speed` ramps with `runTime` and drives both kite fall speed and spawn frequency, so the climb gets denser and faster the longer you survive.
- Look & feel: glowing moon, warm-flicker diyas (radial glow + flame), two-tone kites with cross ribs and a tail, a continuous gold sparkler trail behind the rocket.
- `state()` exposes `speed`, `kites`, `diyas`, `dodged`, `diyasGrabbed` alongside the engine's `scene`/`score`/`time` for the playtester.
