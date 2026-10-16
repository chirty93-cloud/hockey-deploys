# Air Hockey

A playable neon arcade game built with React 18, strict TypeScript, Vite 6, and **PixiJS 8.22**. The desktop view keeps the neon rink and sidebar. On phones, starting a match switches to a viewport-filling rink with a compact score/control bar. First to seven wins by default; the start menu supports the layout and tuning options from the original `main` game.

## Run locally

Use **Node.js 24.19.0** (pinned in `.nvmrc`) and npm. Node's built-in TypeScript support runs the simulation tests without another test framework.

```sh
npm ci
npm run dev
```

Vite listens on port **3000**. No backend, environment variables, credentials, image downloads, or external audio files are required.

```sh
npm test
npm run typecheck
npm run build
```

The production application is generated in `dist/`. To check that build locally:

```sh
npx vite preview --port 4173
```

There is no configured lint command. `npm test` covers the active simulation, shared table geometry, settings, and audio.

## Play

- Move the mouse over the rink, or press and drag with a finger or stylus. Pointer capture keeps a drag working at the edge of the canvas. Instructions for mouse, touch, and **arrows / WASD** remain visible beside the playing field.
- With the rink focused, use the **arrow keys** or **WASD**. Press **P**, **Space**, or **Escape** to pause. Resume with the button or Escape.
- Choose **Łatwy (Easy)**, **Średni (Medium)**, or **Trudny (Hard)** before a match. The desktop sidebar's difficulty and settings controls are disabled throughout play, goal breaks and pause, including keyboard navigation. Open settings from Pause to start a new match with different rules.
- Sound starts after a gesture. The accessible sound switch remembers your preference locally.
- Choose **Neon**, **Lód (Ice)** or **Retro arcade** in match settings. Each arena has its own surface, texture, rails, paddle colors and puck contrast; Neon also supports custom paddle colors. Impact flashes, rings and trails respond to strike strength. Goals send a light wave across the rink and animate the score. Optional subtle screen shake can be disabled in settings; system reduced-motion preferences disable animated effects.
- **Efekty wizualne** in settings provides a 0–125% table-effect intensity slider (100% preserves the original strength), three intensity presets and individual switches for trails, sparks, contact rings, paddle flashes, goal waves and shake. Optional speed lines and paddle wakes add motion accents and default to off. Settings are remembered and apply when starting a match. System reduced motion overrides all animated table effects; 0% disables them without changing physics or arena materials.
- **Low / Medium / High** graphics presets independently control render resolution, particle budget/density, trail length and surface detail; Medium retains the previous rendering quality. Effect intensity and switches remain independent. **Rozmiar paletek i krążka** changes both paddles' diameter (40–96 units, default 60) and the puck's diameter (14–40 units, default 26), including actual collisions and goal clearance. These settings are saved and apply to a new match.
- After a match, the summary compares hits, saves, fastest shots (world units/second) and goals after a side-rail bounce. It also shows active playing time, the longest point and the most paddle contacts in one point. A save means intercepting a puck whose current straight-line trajectory points inside your goal opening. A bank goal requires the scorer's last paddle touch, then a side-rail bounce without another paddle touch. Replays reset all statistics.
- A goal freezes play briefly before a fresh serve. Leaving the tab pauses the match, including an in-progress goal reset. Restart and Play again reset the entire match.
- **Zakończ mecz** in Pause returns to the start screen and unlocks the desktop sidebar. It clears the abandoned match and its statistics while keeping preferences. The result screen also offers a return to the start screen.
- Open **Ustawienia meczu** before starting, or from Pause, to choose score target, optional time limit, AI, paddle color, portrait/landscape/Auto, aspect ratio, player side, table size, and physics tuning. Settings are saved locally and applied to the next match. The default timer is off; timed matches end with the leading score or a draw, and pause/goal breaks freeze the clock.
- In portrait you play at the bottom. Landscape can place you on the left or right. **Auto** rotates the table with the available mobile play area and fits its geometry to the screen; **16:9** / **4:3** retain fixed proportions. Pucks and paddles stay circular. Desktop Auto retains the original portrait layout.
- Rotating or resizing preserves scores and the current point, including while paused. Keyboard directions stay relative to the screen after either rotation.
- Mobile Start requests browser fullscreen when supported. The game also fills the visible viewport if that API is unavailable or denied (including mobile Safari), with safe-area spacing and no scrolling over the rink. The fullscreen button can enter or exit that mode; desktop fullscreen also offers the immersive layout. Browser chrome may remain on platforms that do not support fullscreen; installing the PWA provides a standalone view.

## Configuration and architecture

Edit **`src/config/game.ts`** for the winning score, dimensions, goal width, physics, AI, sound, and effects. See [CONFIGURATION.md](CONFIGURATION.md) for units, constraints, and defaults. Configuration is validated when the engine is created and when settings change. `src/config/preferences.ts` defines the start-menu choices, limits, defaults and persistence. The legacy table coordinate/fit helpers are reused.

| File                                 | Responsibility                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `src/App.tsx`                        | Match UI, scoreboard, difficulty, sound, and keyboard pause controls             |
| `src/components/GameSurface.tsx`     | React/Pixi lifecycle, resize handling, ticker, focus/visibility, audio ownership |
| `src/components/GameSetup.tsx`       | Start menu, appearance/layout choices and optional dynamics sliders              |
| `src/game/viewLayout.ts`             | Responsive geometry, both rotations and screen-relative keyboard mapping         |
| `src/components/GameOverlay.tsx`     | Accessible pause, ready, error, and game-over overlays                           |
| `src/game/GameEngine.ts`             | Authoritative match state, fixed timestep, goals, resets, pause, and win rules   |
| `src/game/physics.ts`                | World-space movement, drag, circle impulses, speed caps, and goal boundaries     |
| `src/game/AIController.ts`           | Delayed decisions, wall-bounce prediction, defense, and attacking                |
| `src/game/InputController.ts`        | Pointer capture, keyboard steering, screen-to-world input                        |
| `src/game/TableRenderer.ts`          | Native Pixi graphics, gradients, reusable trail, particle and ring pools         |
| `src/audio.js`, `src/soundDesign.js` | Shared Web Audio context, procedural impact/goal/victory samples                 |
| `tests/engine.test.js`               | Deterministic physics, AI, scoring, reset, and lifecycle tests                   |

React updates only when UI-visible match values change. Physics uses a 120 Hz accumulator with bounded frame deltas and adaptive substeps; Pixi renders independently. The surface releases its ticker, graphics, gradients, listeners, resize observer, pointer capture, and audio context on unmount, including React Strict Mode's development remount.

`tableGeometry.js` provides shared coordinate and fit helpers for the Pixi layout. The active settings live in `src/config/game.ts` and `src/config/preferences.ts`.

## Browser support and offline play

Use a modern browser with **WebGL** enabled. Unsupported graphics initialization produces a recoverable error screen. Missing or blocked Web Audio leaves the game playable and silent. The game respects reduced-motion preferences.

The production build retains the installable PWA. Its build-specific service worker precaches all generated JS/CSS chunks and icons, including the lazy Pixi renderer. After the first online visit finishes installing the service worker, the game can reload offline. HTTPS is required outside local development. Development mode does not register a service worker.

Deterministic tests cover physics, goal attribution, configurable match rules, timed results, both rotation transforms, geometry resizing, settings validation, and audio. Chromium checks cover desktop/laptop layout, visible keyboard instructions, mobile touch at device-pixel ratio 2, rotation during a paused match, both player sides and keyboard transforms, a match using the selected score target, settings persistence, fullscreen fallback, and runtime errors. Physical-device audio quality, browser-specific touch feel, and the operating system's PWA installation flow still benefit from a manual check.
