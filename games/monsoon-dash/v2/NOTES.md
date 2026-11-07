# Monsoon Dash v2

- hotfix: scooter rides onto the sidewalk and hazards can appear off-road (bug hunter: rohan7384759)
- Added a `roadClampX(x, halfWidth)` helper that keeps any object's edges inside the road (`[view.w*0.08, view.w*0.92]`, 14px buffer); the scooter, potholes/puddles and samosas all spawn/move through it now.
- Holding a direction into the shoulder now stops the scooter well inside the road (playerX ≈114 at 960px wide, vs the old 23) instead of letting it park on the sidewalk.
- Hazard and samosa spawn ranges are derived from the same road bounds, scaled by each object's own half-size, so nothing renders off the asphalt.
- No other gameplay, scoring or visuals changed from v1.
