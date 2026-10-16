# Game configuration

The active game's typed physics and rendering defaults are **`src/config/game.ts`**, exported as `GAME_CONFIG`. **`src/config/preferences.ts`** defines the start-menu settings, slider ranges, color pairs and table-size presets. Saved user settings override the corresponding defaults. Changes take effect on reload in development; rebuild with `npm run build` for production.

Positions and radii use **world units**. Velocities are **world units per second**, independently of CSS size and device-pixel ratio. Durations are **seconds**. Do not tune physics in screen pixels or frames.

Goal-opening corners use circular contact normals: grazing a post redirects the puck along the contact angle, preserving tangential velocity and applying wall restitution only to the normal component. Separating contacts receive positional correction without another impulse.

## Match and table

| Property                                 | Default  | Meaning                                                                               |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `table.width`, `table.height`            | 480, 760 | Desktop default geometry; mobile Auto adjusts height to fit available space           |
| `table.goalWidth`                        | 168      | Opening centered on each end wall; the complete puck must fit                         |
| `match.winningScore`                     | 7        | Positive integer; the first side reaching this score immediately wins                 |
| `match.goalDelay`                        | 1.25     | Time between a goal and the next serve; pausing freezes this delay                    |
| `match.defaultDifficulty`                | `medium` | Initial opponent; the UI can change it during play                                    |
| `match.stallSpeed`, `match.stallSeconds` | 18, 7    | A puck below this speed for this long receives a fresh serve without awarding a point |

The simulation always places the player in the lower half. The view can rotate 90° in either direction, placing the player on the selected left/right half; input and arrow keys use the same inverse transform. Mobile Auto adjusts the table height (between 1 and 3.5 short edges) to fit the available area. Body positions scale proportionally, scores and velocities are retained, and paddles are constrained again. Explicit aspect ratios retain their shape and may leave margins. Desktop Auto keeps the original portrait presentation. A goal is counted only after the whole puck crosses the back edge within the opening. The next serve goes toward the side that conceded. Every new match serves toward the player.

`match.timeLimitSeconds` defaults to **0** (no timer). With a limit, only active playing time counts. Pause and goal-reset delays freeze the clock. The current leader wins on expiry; equal scores produce a draw. The UI receives clock updates once per second.

## Start-menu preferences

- `orientation`: `auto`, `vertical`, `horizontal`.
- `aspect`: `auto` (fits the mobile play area), `16:9`, `4:3`.
- `playerSide`: `left` or `right`, used only in landscape.
- `tableSize`: `full`, `large`, `medium`, `small` (100%, 90%, 80%, 65%).
- `theme`: one of six contrasting player/AI color pairs in `THEMES`.
- `winningScore`, `timeLimitSeconds`, `difficulty`: actual engine rules for a new match.
- `drag`, `wallRestitution`, `paddleRestitution`, `responseMs`, `paddleSpeed`: the optional dynamics controls.
- `arena`: `neon`, `ice` or `retro`; palettes and material colors live in `src/config/arenas.ts`. Neon uses the selected paddle theme; Ice and Retro use their arena's paired colors.
- `screenShake`: allows brief, bounded camera offsets for goals and strong paddle hits; system reduced-motion preferences override it. Disabling it does not affect physics or other visual effects.
- `effectIntensity`: 0–125% of the original effect strength (default 100); mapped to `visuals.intensity` 0–1. At 0%, animated table effects and shake are disabled. Arena textures, contrast and UI animations are unchanged.
- `graphicsQuality`: `low`, `medium` (default), or `high`, from `src/config/graphics.ts`. These set maximum pixel density (1/2/2), particle budgets (24/64/96), trail lengths (4/9/14) and surface dot spacing (32/18/12). Particle emission scales with the budget. Effect intensity and switches remain unchanged.
- `paddleRadius`: 20–48 (default 30), shared by both paddles; `puckRadius`: 7–20 (default 13). The UI displays diameters. These bounds keep every combination valid for the goal opening, AI attack offset and all supported table proportions. Rendering and physics use the same radii.
- `trail`, `sparks`, `hitRings`, `hitFlash`, `goalWave`: independent existing-effect switches. `speedLines` and `paddleWake` add optional velocity-driven accents, both off by default. These map to `visuals.effects`; their catalog lives in `src/config/effects.ts`. All animated table effects honor system reduced-motion preferences and pause with the match.

`configFromPreferences` translates these choices into validated engine configuration. Local storage uses `air-hockey.settings.v2`; `sanitizePreferences` validates every field and falls back safely if data is stale or storage is unavailable. “Ustawienia domyślne” restores the default draft; starting the match saves it. Changing setup starts a fresh match, whereas resizing/rotating preserves the existing one.

## Movement and collisions

| Property                    | Default | Meaning                                                                              |
| --------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `paddle.radius`             | 30      | Radius shared by both paddles                                                        |
| `paddle.maxSpeed`           | 2200    | Maximum human paddle speed; prevents pointer teleports                               |
| `paddle.responseSeconds`    | 0.01    | First-order following time constant; 0 removes smoothing but retains the speed limit |
| `paddle.homeInset`          | 104     | Paddle home distance from its end of the table                                       |
| `puck.radius`               | 13      | Collision and rendering radius                                                       |
| `puck.serveSpeed`           | 360     | Speed of a fresh serve                                                               |
| `puck.maxSpeed`             | 1120    | Hard limit after collisions, preserving direction                                    |
| `puck.drag`                 | 0.055   | Exponential drag in 1/seconds: `v(t) = v₀ exp(-drag × t)`; 0 disables it             |
| `puck.serveAngle`           | π/5     | Maximum random serve angle away from the table's long axis, in radians               |
| `physics.step`              | 1/120   | Fixed simulation timestep                                                            |
| `physics.maxFrame`          | 0.05    | Maximum elapsed time accepted from one render frame; prevents catch-up explosions    |
| `physics.wallRestitution`   | 0.96    | Normal speed retained by a wall bounce, between 0 and 1                              |
| `physics.paddleRestitution` | 0.93    | Restitution against a moving mallet's relative normal velocity                       |
| `physics.separation`        | 0.01    | Small contact clearance preventing repeated overlap impulses                         |

The fixed step is further divided so maximum relative mallet/puck travel is less than half a puck radius per substep. This catches fast crossings without a separate physics dependency. Collisions correct penetration, impulse only closing contacts, retain tangential velocity, and cap energy gain. A stationary puck does not accelerate by itself; the explicit scoreless stall recovery avoids an abandoned point.

## AI

| Difficulty | Speed | Reaction delay | Prediction | Aim error | Aggression |
| ---------- | ----: | -------------: | ---------: | --------: | ---------: |
| Easy       |   310 |         0.22 s |       0.45 | ±48 units |       0.48 |
| Medium     |   470 |         0.12 s |       0.78 | ±24 units |       0.72 |
| Hard       |   640 |        0.065 s |       0.94 | ±10 units |       0.92 |

Edit `ai.difficulties` to tune these levels. `prediction` blends direct tracking with a reflected trajectory that accounts for side-wall bounces. `reactionSeconds` limits how often the AI chooses a new target. Aim error is bounded; even Hard has finite speed, delayed decisions, and imperfect prediction.

- `ai.predictionHorizon`: maximum look-ahead, default 1.5 seconds.
- `ai.defensiveTracking`: how far the home position follows an outgoing puck, default 0.25.
- `ai.attackZone`: fraction of table height in which the AI considers an attack, default 0.48; never above 0.5.
- `ai.incomingAttackRatio`: incoming speed threshold as a fraction of serve speed, default 0.4. Faster approaches favor interception.
- `ai.attackOffset`: extra reach behind a strike, default 20 units, multiplied by difficulty aggression.
- `ai.aimAwayFactor`: how much the human's position influences shot direction, default 0.12.

## Audio and visuals

`audio.enabled` sets the initial sound preference unless local storage already contains a user choice. `audio.volume` is a 0–1 master gain, default 0.22. One AudioContext owns a cached sample bank and at most eight overlapping voices. Human and AI impacts use different pitches; walls, goals, wins, and losses have distinct procedural sounds.

`visuals.player`, `visuals.ai`, and `visuals.gold` are numeric RGB colors. `visuals.intensity` (0–1) controls effect strength, `particles` (default 64) bounds the reusable particle pool, and `trailLength` (default 9) controls the puck trail. `padding` leaves room for rail glow and goals. `maxResolution` caps the rendering device-pixel ratio at 2 by default. Reduced-motion preferences suppress sparks, trails, and expanding rings without changing gameplay.

`validateConfig` rejects nonfinite values, invalid geometry, impossible speed ranges, fractional scores or pool sizes, and unsupported difficulty values. All three difficulties must remain present. Tests use a configurable random source to reproduce decisions and serves.
