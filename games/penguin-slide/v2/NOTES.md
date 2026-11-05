# Penguin Slide v2 — NOTES

- hotfix: hugging the right wall lets the penguin dodge every snowman (bug hunter: billusanda5808)
- root cause: obstacles spawned inset by their own half-size (`s/2`), which could be wider than
  the penguin's half-width, so a penguin pinned flush against the screen edge sat just outside
  every obstacle's reachable spawn positions — a guaranteed-safe corner.
- fix: obstacles now spawn across the full screen width, and the penguin's slide range is kept a
  small `WALL_PAD` (24px) short of the true edge, so an obstacle hugging the opposite side can
  still fully overlap a wall-hugging penguin's hitbox.
- verified with the reported repro (`games/penguin-slide/v1/repro-1.json`): holding ArrowRight for
  30 s now ends the run, instead of surviving indefinitely.
- nothing else changed: scoring, speed ramp, fish pickups and scene transitions are untouched.
