import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFERENCES,
  configFromPreferences,
  sanitizePreferences,
} from "../src/config/preferences.ts";
import { GAME_CONFIG } from "../src/config/game.ts";
import {
  resolveView,
  screenToWorld,
  directionToWorld,
} from "../src/game/viewLayout.ts";
import { GameEngine } from "../src/game/GameEngine.ts";
import { collidePaddle } from "../src/game/physics.ts";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const advance = (engine, seconds) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) engine.advance(1 / 120);
};

test("mobile Auto fills portrait and landscape space without stretching; desktop keeps its rink", () => {
  for (const [width, height] of [
    [390, 765],
    [844, 322],
    [320, 490],
    [1024, 689],
  ]) {
    const layout = resolveView(width, height, DEFAULT_PREFERENCES, true);
    assert.equal(layout.horizontal, width > height);
    const viewW = layout.horizontal ? layout.height : layout.width;
    const viewH = layout.horizontal ? layout.width : layout.height;
    const border = GAME_CONFIG.visuals.padding * 2;
    assert.ok(Math.abs((viewW + border) * layout.scale - width) < 2);
    assert.ok(Math.abs((viewH + border) * layout.scale - height) < 2);
  }
  assert.equal(
    resolveView(700, 550, DEFAULT_PREFERENCES, false).height,
    GAME_CONFIG.table.height,
  );
});

test("both rotations map pointer and screen-relative keyboard movement into the correct half", () => {
  for (const side of ["left", "right"])
    for (const orientation of ["vertical", "horizontal"]) {
      const layout = resolveView(
        844,
        322,
        { ...DEFAULT_PREFERENCES, playerSide: side, orientation },
        true,
      );
      const point = { x: 130, y: layout.height - 100 };
      const vx = !layout.horizontal
        ? point.x
        : side === "left"
          ? layout.height - point.y
          : point.y;
      const vy = !layout.horizontal
        ? point.y
        : side === "left"
          ? point.x
          : layout.width - point.x;
      const result = { x: 0, y: 0 };
      screenToWorld(
        layout.offsetX + vx * layout.scale,
        layout.offsetY + vy * layout.scale,
        layout,
        result,
      );
      near(result.x, point.x);
      near(result.y, point.y);
      assert.ok(result.y > layout.height / 2);
      directionToWorld(1, 0, layout, result);
      if (!layout.horizontal) assert.deepEqual(result, { x: 1, y: 0 });
      else {
        near(result.x, 0);
        assert.equal(result.y, side === "left" ? -1 : 1);
      }
    }
});

test("explicit shape, orientation and table size remain selected across device rotations", () => {
  const p = { ...DEFAULT_PREFERENCES, orientation: "vertical", aspect: "4:3" };
  for (const [width, height] of [
    [390, 765],
    [844, 322],
  ]) {
    const full = resolveView(width, height, p, true);
    const small = resolveView(
      width,
      height,
      { ...p, tableSize: "small" },
      true,
    );
    assert.equal(full.horizontal, false);
    near(full.height / full.width, 4 / 3);
    near(small.scale / full.scale, 0.65);
  }
});

test("resize preserves scores, pause/reset phase and legal paddles without mutating defaults", () => {
  for (const phase of ["playing", "goal", "paused", "gameover"]) {
    const engine = new GameEngine();
    engine.start();
    engine.state.phase = phase;
    engine.state.score.player = 3;
    engine.state.goalRemaining = 0.5;
    engine.state.player.y = 650;
    engine.state.target.y = 680;
    engine.state.puck.y = 250;
    engine.state.puck.vx = 300;
    engine.resizeTable(480, 1060);
    assert.equal(engine.state.phase, phase);
    assert.equal(engine.state.score.player, 3);
    near(engine.state.goalRemaining, 0.5);
    near(engine.state.puck.y, (250 * 1060) / 760);
    assert.equal(engine.state.puck.vx, 300);
    assert.ok(engine.state.player.y > 530 && engine.state.player.y <= 1030);
    assert.ok(engine.state.ai.y >= 30 && engine.state.ai.y < 530);
    engine.resizeTable(480, 640);
    assert.ok(engine.state.player.y >= 350 && engine.state.player.y <= 610);
  }
  assert.equal(GAME_CONFIG.table.height, 760);
});

test("a timed match freezes on pause/goal and ends with the leading side or a draw", () => {
  for (const [player, ai, winner] of [
    [2, 1, "player"],
    [0, 1, "ai"],
    [1, 1, null],
  ]) {
    const c = configFromPreferences({
      ...DEFAULT_PREFERENCES,
      timeLimitSeconds: 1,
    });
    const engine = new GameEngine(c, () => 0.5);
    engine.start();
    engine.state.score = { player, ai };
    Object.assign(engine.state.puck, { x: 240, y: 380, vx: 0, vy: 0 });
    advance(engine, 0.25);
    engine.pause();
    advance(engine, 2);
    near(engine.state.elapsed, 0.25);
    engine.resume();
    engine.state.phase = "goal";
    engine.state.goalRemaining = 1;
    advance(engine, 0.5);
    near(engine.state.elapsed, 0.25);
    engine.state.phase = "playing";
    Object.assign(engine.state.puck, { x: 240, y: 380, vx: 0, vy: 0 });
    advance(engine, 0.75);
    assert.equal(engine.state.phase, "gameover");
    assert.equal(engine.state.winner, winner);
    assert.equal(engine.state.endReason, "time");
    assert.equal(engine.snapshot().remainingSeconds, 0);
    const result = structuredClone(engine.state);
    advance(engine, 5);
    assert.deepEqual(engine.state, result);
    engine.start();
    assert.equal(engine.snapshot().remainingSeconds, 1);
    assert.equal(engine.state.endReason, null);
  }
});

test("setup applies score, timer, difficulty, theme and dynamics to the actual simulation", () => {
  const p = {
    ...DEFAULT_PREFERENCES,
    winningScore: 3,
    timeLimitSeconds: 180,
    difficulty: "hard",
    theme: "purple",
    drag: 0.7,
    responseMs: 80,
    paddleSpeed: 1800,
    wallRestitution: 0.8,
  };
  const engine = new GameEngine();
  engine.start();
  engine.state.score.ai = 6;
  engine.configure(configFromPreferences(p));
  engine.start();
  assert.deepEqual(engine.state.score, { player: 0, ai: 0 });
  assert.equal(engine.state.difficulty, "hard");
  assert.equal(engine.config.match.winningScore, 3);
  assert.equal(engine.config.puck.drag, 0.7);
  assert.equal(engine.config.paddle.responseSeconds, 0.08);
  assert.equal(engine.config.paddle.maxSpeed, 1800);
  assert.equal(engine.config.visuals.player, 0xc998ff);
  assert.equal(engine.snapshot().remainingSeconds, 180);
  assert.equal(GAME_CONFIG.match.winningScore, 7);
});

test("invalid or stale saved settings cannot break initialization", () => {
  for (const value of [
    null,
    "bad",
    [],
    {
      orientation: "broken",
      theme: "unknown",
      difficulty: "__proto__",
      winningScore: Infinity,
      paddleSpeed: 1,
      timeLimitSeconds: -5,
    },
  ]) {
    assert.doesNotThrow(
      () => new GameEngine(configFromPreferences(sanitizePreferences(value))),
    );
  }
  assert.equal(sanitizePreferences({ winningScore: 4.8 }).winningScore, 5);
});

test("arena and motion settings persist safely and select a coherent palette", () => {
  for (const arena of ["neon", "ice", "retro"]) {
    const p = sanitizePreferences({ arena, screenShake: false });
    assert.equal(p.arena, arena);
    assert.equal(p.screenShake, false);
    const c = configFromPreferences(p);
    assert.equal(c.visuals.arena, arena);
    assert.equal(c.visuals.screenShake, false);
    assert.doesNotThrow(() => new GameEngine(c));
  }
  assert.equal(sanitizePreferences({ arena: "__proto__", screenShake: "false" }).arena, "neon");
  assert.equal(sanitizePreferences({ arena: "unknown", screenShake: "false" }).screenShake, true);
  assert.notEqual(configFromPreferences(sanitizePreferences({ arena: "ice" })).visuals.player,
    configFromPreferences(sanitizePreferences({ arena: "retro" })).visuals.player);
});

test("visual effect settings support off, reduced and mildly boosted intensity", () => {
  for (const effectIntensity of [0, 50, 100, 125]) {
    const p = sanitizePreferences({ effectIntensity, trail: false, hitFlash: false,
      sparks: false, hitRings: false, goalWave: false, speedLines: true, paddleWake: true });
    const c = configFromPreferences(p);
    assert.equal(c.visuals.intensity, GAME_CONFIG.visuals.intensity * effectIntensity / 100);
    assert.deepEqual(c.visuals.effects, {
      trail: false, hitFlash: false, sparks: false, hitRings: false,
      goalWave: false, speedLines: true, paddleWake: true,
    });
    assert.doesNotThrow(() => new GameEngine(c));
  }
  for (const invalid of [-1, 126, Infinity, "50", null])
    assert.equal(sanitizePreferences({ effectIntensity: invalid }).effectIntensity, 100);
  const p = sanitizePreferences({ trail: "false", speedLines: 1, paddleWake: null });
  assert.equal(p.trail, true);
  assert.equal(p.speedLines, false);
  assert.equal(p.paddleWake, false);
  assert.equal(GAME_CONFIG.visuals.intensity, 0.8);
  assert.equal(GAME_CONFIG.visuals.effects.trail, true);
});

test("graphics presets change rendering budgets without overriding effect preferences", () => {
  const configs = ["low", "medium", "high"].map(graphicsQuality => configFromPreferences(
    sanitizePreferences({ graphicsQuality, effectIntensity: 50, sparks: false, speedLines: true }),
  ));
  for (const c of configs) {
    assert.equal(c.visuals.intensity, 0.4);
    assert.equal(c.visuals.effects.sparks, false);
    assert.equal(c.visuals.effects.speedLines, true);
    assert.doesNotThrow(() => new GameEngine(c));
  }
  assert.ok(configs[0].visuals.maxResolution < configs[1].visuals.maxResolution);
  assert.ok(configs[0].visuals.particles < configs[1].visuals.particles);
  assert.ok(configs[1].visuals.particles < configs[2].visuals.particles);
  assert.ok(configs[0].visuals.trailLength < configs[2].visuals.trailLength);
  assert.ok(configs[0].visuals.textureSpacing > configs[2].visuals.textureSpacing);
  assert.equal(configs[1].visuals.particles, GAME_CONFIG.visuals.particles);
  assert.equal(sanitizePreferences({ graphicsQuality: "invalid" }).graphicsQuality, "medium");
});

test("all supported body sizes work with collision, mobile geometry and saved settings", () => {
  for (const paddleRadius of [20, 30, 48]) for (const puckRadius of [7, 13, 20]) {
    const p = sanitizePreferences({ paddleRadius, puckRadius });
    const c = configFromPreferences(p);
    const engine = new GameEngine(c, () => 0.5);
    engine.start();
    const layout = resolveView(844, 300, p, true);
    assert.doesNotThrow(() => engine.resizeTable(layout.width, layout.height));
    const paddle = { x: 200, y: 300, vx: 0, vy: 0 };
    const puck = { x: 200 + paddleRadius + puckRadius - 1, y: 300, vx: -400, vy: 0 };
    assert.ok(collidePaddle(puck, paddle, c) > 0);
    assert.ok(puck.vx > 0);
    assert.ok(puck.x - paddle.x >= paddleRadius + puckRadius);
    assert.equal(c.paddle.radius, paddleRadius);
    assert.equal(c.puck.radius, puckRadius);
    engine.advance(1 / 60);
    assert.ok(Object.values(engine.state.puck).every(Number.isFinite));
  }
  const defaults = sanitizePreferences({ paddleRadius: 5, puckRadius: 99 });
  assert.equal(defaults.paddleRadius, 30);
  assert.equal(defaults.puckRadius, 13);
});
