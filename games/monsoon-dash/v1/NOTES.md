# Monsoon Dash v1

- Chai-cup scooter auto-rides a rain-soaked street; swerve with ←/→ or A/D (and the touch buttons) to dodge potholes (dark craters) and puddles (blue splashy ellipses), either ends the run.
- Scoring: +1 per second survived, +10 per samosa grabbed (with a steam-sparkle burst, chime and floating "+10 samosa!" text).
- `speed` ramps with run time, which raises both obstacle fall speed and spawn frequency (shorter `spawnIn`), plus rain-streak intensity.
- Crash triggers a splash-colored particle burst, screen shake and a low splat beep; near-misses get a soft blip.
- Title/game-over/restart reuse the starter's overlay (Space/Enter/Tap); chai cup has an animated steam wisp and little face for personality.
- `__jam.state()` exposes `playerX`, `hazards`, `treats`, `speed`, `dodged` on top of the engine's `scene`/`score`/`best`/`time`.
