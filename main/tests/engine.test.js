import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CONFIG as config, validateConfig } from '../src/config/game.ts';
import { GameEngine } from '../src/game/GameEngine.ts';
import { AIController, reflectedX } from '../src/game/AIController.ts';
import {
  collidePaddle,
  collideRink,
  constrain,
  integratePuck,
  movePaddle,
} from '../src/game/physics.ts';

const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const fresh = () => {
  const engine = new GameEngine(structuredClone(config), () => 0.5);
  engine.start();
  return engine;
};
const stepFor = (engine, seconds) => {
  for (let i = 0; i < Math.round(seconds / config.physics.step); i++)
    engine.advance(config.physics.step);
};

test('match summary records real hits, saves, bank goals and resets for a rematch', () => {
  const c = structuredClone(config);
  c.match.winningScore = 1;
  const engine = new GameEngine(c, () => 0.5);
  engine.start();
  assert.equal(engine.snapshot().stats, null);
  const player = engine.state.player;
  Object.assign(engine.state.puck, {
    x: player.x, y: player.y - c.paddle.radius - c.puck.radius + 1,
    vx: 0, vy: 400,
  });
  engine.advance(c.physics.step);
  assert.ok(engine.state.puck.vy < 0, 'the player actually returns the shot');
  const returnedSpeed = Math.hypot(engine.state.puck.vx, engine.state.puck.vy);
  engine.pause();
  engine.advance(10);
  engine.resume();
  Object.assign(engine.state.puck, { x: c.puck.radius - 1, y: 300, vx: -400, vy: -100 });
  engine.advance(c.physics.step);
  scoreGoal(engine, 'player');
  const stats = engine.snapshot().stats;
  assert.equal(stats.player.hits, 1);
  assert.equal(stats.player.saves, 1);
  assert.ok(stats.player.fastestShot >= returnedSpeed);
  assert.ok(stats.player.fastestShot <= c.puck.maxSpeed);
  assert.equal(stats.player.bankGoals, 1);
  assert.equal(stats.ai.hits, 0);
  assert.equal(stats.longestRallyHits, 1);
  near(stats.elapsed, c.physics.step * 3);
  near(stats.longestRally, stats.elapsed);
  stats.player.hits = 999;
  assert.equal(engine.snapshot().stats.player.hits, 1, 'snapshot is detached from the engine');
  engine.start();
  scoreGoal(engine, 'ai');
  const rematch = engine.snapshot().stats;
  assert.equal(rematch.player.hits, 0);
  assert.equal(rematch.player.bankGoals, 0);
  assert.equal(rematch.longestRallyHits, 0);
});
function scoreGoal(engine, side) {
  Object.assign(engine.state.puck, {
    x: config.table.width / 2,
    y: side === 'player' ? -config.puck.radius + 1 : config.table.height + config.puck.radius - 1,
    vx: 0,
    vy: side === 'player' ? -500 : 500,
  });
  engine.advance(config.physics.step);
}

test('an opponent touch clears bank-shot attribution before a goal', () => {
  const engine = fresh();
  engine.config.match.winningScore = 1;
  const c = engine.config;
  Object.assign(engine.state.puck, {
    x: engine.state.player.x, y: engine.state.player.y - c.paddle.radius - c.puck.radius + 1,
    vx: 0, vy: 400,
  });
  engine.advance(c.physics.step);
  Object.assign(engine.state.puck, { x: c.puck.radius - 1, y: 300, vx: -400, vy: -100 });
  engine.advance(c.physics.step);
  Object.assign(engine.state.puck, {
    x: engine.state.ai.x, y: engine.state.ai.y + c.paddle.radius + c.puck.radius - 1,
    vx: 0, vy: -400,
  });
  engine.advance(c.physics.step);
  scoreGoal(engine, 'player');
  const stats = engine.snapshot().stats;
  assert.equal(stats.player.hits, 1);
  assert.equal(stats.ai.hits, 1);
  assert.equal(stats.player.bankGoals, 0);
  assert.equal(stats.ai.bankGoals, 0);
  assert.equal(stats.longestRallyHits, 2);
});

test('rink side walls reflect the normal component and retain tangential velocity', () => {
  for (const x of [0, config.table.width]) {
    const puck = { x, y: 300, vx: x === 0 ? -600 : 600, vy: 85 };
    const hits = [];
    assert.equal(
      collideRink(puck, config, (...hit) => hits.push(hit)),
      null,
    );
    near(Math.abs(puck.vx), 600 * config.physics.wallRestitution);
    assert.equal(puck.vy, 85);
    assert.equal(hits.length, 1);
    assert.ok(puck.x >= config.puck.radius && puck.x <= config.table.width - config.puck.radius);
  }
});

test('only a puck fully crossing inside a goal opening scores; back walls and post edges rebound', () => {
  const puck = { x: 240, y: 0, vx: 0, vy: -500 };
  assert.equal(collideRink(puck, config), null, 'touching the goal line is not yet a goal');
  puck.y = -config.puck.radius - 1;
  assert.equal(collideRink(puck, config), 'player');
  puck.y = config.table.height + config.puck.radius + 1;
  puck.vy = 500;
  assert.equal(collideRink(puck, config), 'ai');
  for (const x of [50, config.table.width - 50]) {
    Object.assign(puck, { x, y: -1, vy: -400 });
    assert.equal(collideRink(puck, config), null);
    assert.equal(puck.y, config.puck.radius);
    assert.ok(puck.vy > 0);
  }
});

test('all four goal posts reflect the contact normal and preserve tangential motion', () => {
  const r = config.puck.radius;
  for (const side of [-1, 1]) for (const end of [0, config.table.height]) {
    const postX = config.table.width / 2 + side * config.table.goalWidth / 2;
    const nx = -side / Math.sqrt(2), ny = (end === 0 ? 1 : -1) / Math.sqrt(2);
    const puck = {
      x: postX + nx * r * 0.9, y: end + ny * r * 0.9,
      vx: -400 * nx - 85 * ny, vy: -400 * ny + 85 * nx,
    };
    const hits = [];
    assert.equal(collideRink(puck, config, (...hit) => hits.push(hit)), null);
    near(Math.hypot(puck.x - postX, puck.y - end), r + config.physics.separation);
    near(puck.vx * nx + puck.vy * ny, 400 * config.physics.wallRestitution);
    near(-puck.vx * ny + puck.vy * nx, 85);
    assert.equal(hits.length, 1);
    collideRink(puck, config, (...hit) => hits.push(hit));
    assert.equal(hits.length, 1, 'separated contact must not receive another impulse');
  }
});

test('a puck exiting beside a post is not teleported back into the rink', () => {
  const postX = (config.table.width - config.table.goalWidth) / 2;
  const puck = { x: postX + config.puck.radius - 1, y: -1, vx: 50, vy: -400 };
  const before = { ...puck };
  assert.equal(collideRink(puck, config), null);
  assert.ok(puck.y < 0);
  assert.equal(puck.vx, before.vx);
  assert.equal(puck.vy, before.vy);
});

test('moving mallet transfers normal velocity, separates contacts, and caps extreme strikes', () => {
  const paddle = { x: 200, y: 600, vx: 800, vy: 50 };
  const puck = { x: 241, y: 600, vx: -600, vy: 120 };
  assert.ok(collidePaddle(puck, paddle, config) > 0);
  assert.ok(puck.vx > 0);
  assert.ok(Math.hypot(puck.vx, puck.vy) <= config.puck.maxSpeed + 1e-8);
  assert.ok(puck.x - paddle.x > config.paddle.radius + config.puck.radius);
  assert.equal(collidePaddle(puck, paddle, config), 0);
  const same = { x: 200, y: 600, vx: 0, vy: 0 };
  collidePaddle(same, { ...paddle, vx: 0, vy: 0 }, config);
  assert.ok(Object.values(same).every(Number.isFinite));
});

test('separating overlaps receive positional correction but no repeated impulse', () => {
  const puck = { x: 241, y: 600, vx: 400, vy: 25 };
  assert.equal(collidePaddle(puck, { x: 200, y: 600, vx: 0, vy: 0 }, config), 0);
  assert.equal(puck.vx, 400);
  assert.equal(puck.vy, 25);
});

test('drag and paddle following are frame-rate independent in world units per second', () => {
  let previous;
  for (const fps of [30, 60, 120, 144, 240]) {
    const puck = { x: 0, y: 0, vx: 400, vy: -100 },
      paddle = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let i = 0; i < fps; i++) {
      integratePuck(puck, 0.2, 1 / fps);
      movePaddle(paddle, { x: 300, y: 400 }, 600, 0.05, 1 / fps);
    }
    near(puck.vx, 400 * Math.exp(-0.2));
    near(puck.x, (400 * -Math.expm1(-0.2)) / 0.2);
    if (previous) near(paddle.x, previous.x);
    previous = paddle;
  }
});

test('player and AI stay in their legal halves and obey speed limits', () => {
  for (const side of ['player', 'ai']) {
    for (const point of [
      { x: -999, y: -999 },
      { x: 9999, y: 9999 },
    ]) {
      constrain(point, side, config);
      assert.ok(
        point.x >= config.paddle.radius && point.x <= config.table.width - config.paddle.radius,
      );
      if (side === 'player')
        assert.ok(
          point.y >= config.table.height / 2 + config.paddle.radius &&
            point.y <= config.table.height - config.paddle.radius,
        );
      else
        assert.ok(
          point.y >= config.paddle.radius &&
            point.y <= config.table.height / 2 - config.paddle.radius,
        );
    }
  }
  const engine = fresh();
  engine.setTarget(9999, -9999);
  const previous = { ...engine.state.player };
  engine.advance(1 / 60);
  assert.ok(
    Math.hypot(engine.state.player.x - previous.x, engine.state.player.y - previous.y) <=
      config.paddle.maxSpeed / 60 + 1e-8,
  );
  assert.ok(
    Math.hypot(engine.state.ai.vx, engine.state.ai.vy) <=
      config.ai.difficulties.medium.speed + 1e-7,
  );
});

test('substeps catch a fast mallet crossing the puck instead of teleporting through it', () => {
  const engine = fresh(),
    hits = [];
  engine.onEvent = (event) => hits.push(event);
  Object.assign(engine.state.player, { x: 90, y: 600, vx: 0, vy: 0 });
  Object.assign(engine.state.puck, { x: 190, y: 600, vx: 0, vy: 0 });
  engine.setTarget(420, 600);
  stepFor(engine, 0.12);
  assert.ok(hits.some((e) => e.type === 'hit' && e.kind === 'paddle' && e.side === 'player'));
  assert.ok(engine.state.puck.vx > 0);
  assert.ok(Math.hypot(engine.state.puck.vx, engine.state.puck.vy) <= config.puck.maxSpeed);
});

test('goals award the correct player exactly once and freeze physics until reset completes', () => {
  for (const side of ['player', 'ai']) {
    const engine = fresh();
    scoreGoal(engine, side);
    assert.equal(engine.state.score[side], 1);
    assert.equal(engine.state.phase, 'goal');
    const puck = { ...engine.state.puck },
      ai = { ...engine.state.ai };
    stepFor(engine, config.match.goalDelay / 2);
    assert.deepEqual(engine.state.puck, puck);
    assert.deepEqual(engine.state.ai, ai);
    assert.equal(engine.state.score[side], 1);
    stepFor(engine, config.match.goalDelay / 2 + 0.02);
    assert.equal(engine.state.phase, 'playing');
    assert.equal(engine.state.score[side], 1);
    assert.ok(Math.hypot(engine.state.puck.vx, engine.state.puck.vy) > 0);
  }
});

test('first to seven ends immediately for either side and restart resets the complete match', () => {
  for (const side of ['player', 'ai']) {
    const engine = fresh();
    assert.equal(config.match.winningScore, 7);
    for (let score = 1; score <= 7; score++) {
      scoreGoal(engine, side);
      assert.equal(engine.state.score[side], score);
      if (score < 7) stepFor(engine, config.match.goalDelay + 0.02);
    }
    assert.equal(engine.state.phase, 'gameover');
    assert.equal(engine.state.winner, side);
    const ended = structuredClone(engine.state);
    stepFor(engine, 5);
    assert.deepEqual(engine.state, ended);
    engine.start();
    assert.deepEqual(engine.state.score, { player: 0, ai: 0 });
    assert.equal(engine.state.winner, null);
    assert.equal(engine.state.lastScorer, null);
    assert.equal(engine.state.elapsed, 0);
    assert.equal(engine.state.goalRemaining, 0);
    assert.equal(engine.state.phase, 'playing');
    assert.equal(engine.state.puck.x, config.table.width / 2);
    assert.equal(engine.ai.target.y, config.paddle.homeInset);
  }
});

test('pausing freezes both gameplay and the goal reset countdown, then resumes that phase', () => {
  const engine = fresh();
  for (const phase of ['playing', 'goal']) {
    if (phase === 'goal') scoreGoal(engine, 'player');
    engine.pause();
    const paused = structuredClone(engine.state);
    stepFor(engine, 4);
    assert.deepEqual(engine.state, paused);
    engine.resume();
    assert.equal(engine.state.phase, phase);
  }
});

test('fixed accumulator gives identical outcomes at normal display frame rates and caps tab gaps', () => {
  let baseline;
  for (const fps of [30, 60, 120, 144]) {
    const engine = fresh();
    engine.setTarget(80, 630);
    for (let i = 0; i < fps * 2; i++) engine.advance(1 / fps);
    if (!baseline) baseline = structuredClone(engine.state);
    for (const body of ['puck', 'player', 'ai'])
      for (const key of ['x', 'y', 'vx', 'vy']) near(engine.state[body][key], baseline[body][key]);
    assert.deepEqual(engine.state.score, baseline.score);
  }
  const engine = fresh();
  engine.advance(60);
  assert.ok(engine.state.elapsed <= config.physics.maxFrame + 1e-8);
});

test('AI reflection predicts multiple bounces; reaction delay and difficulty change actual movement', () => {
  assert.equal(reflectedX(500, 0, 480), 460);
  assert.equal(reflectedX(-20, 0, 480), 20);
  assert.equal(reflectedX(1940, 0, 480), 20);
  const distances = [];
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const engine = fresh();
    engine.setDifficulty(difficulty);
    Object.assign(engine.state.puck, { x: 400, y: 280, vx: 0, vy: -400 });
    stepFor(engine, 0.05);
    distances.push(Math.abs(engine.state.ai.x - 240));
    assert.ok(
      Math.hypot(engine.state.ai.vx, engine.state.ai.vy) <=
        config.ai.difficulties[difficulty].speed + 1e-7,
    );
    const target = { ...engine.ai.target };
    engine.state.puck.x = 50;
    engine.ai.update(engine.state, 0.001);
    assert.deepEqual(engine.ai.target, target, 'AI should not react again immediately');
  }
  assert.ok(distances[0] < distances[1] && distances[1] < distances[2]);
});

test('AI attacks a stationary puck on its half and returns to defense when it moves away', () => {
  const engine = fresh(),
    ai = new AIController(config, () => 0.5);
  Object.assign(engine.state.puck, { x: 360, y: 260, vx: 0, vy: 0 });
  ai.update(engine.state, 1);
  assert.ok(ai.target.y > config.paddle.homeInset);
  assert.ok(ai.target.y < engine.state.puck.y);
  Object.assign(engine.state.puck, { y: 600, vy: 500 });
  ai.update(engine.state, 1);
  assert.equal(ai.target.y, config.paddle.homeInset);
});

test('invalid numeric state recovers safely and stalled pucks receive a scoreless fresh serve', () => {
  const engine = fresh();
  engine.state.puck.x = NaN;
  engine.advance(config.physics.step);
  assert.ok(Object.values(engine.state.puck).every(Number.isFinite));
  const before = { ...engine.state.target };
  engine.setTarget(Infinity, NaN);
  assert.deepEqual(engine.state.target, before);
  Object.assign(engine.state.puck, { x: 240, y: 380, vx: 0, vy: 0 });
  stepFor(engine, config.match.stallSeconds + 0.01);
  assert.equal(engine.state.phase, 'goal');
  assert.equal(engine.state.lastScorer, null);
  assert.deepEqual(engine.state.score, { player: 0, ai: 0 });
});

test('AI reaches and strikes a stationary puck toward the human goal', () => {
  const engine = fresh(),
    hits = [];
  engine.onEvent = (event) => {
    if (event.type === 'hit' && event.side === 'ai') hits.push(event);
  };
  Object.assign(engine.state.puck, { x: 320, y: 240, vx: 0, vy: 0 });
  stepFor(engine, 0.5);
  assert.ok(hits.length > 0);
  assert.ok(engine.state.puck.vy > 0, 'the AI should strike toward the lower goal');
});

test('returning to the menu clears any match phase and permits a clean new match', () => {
  for (const phase of ['playing', 'paused', 'goal', 'gameover']) {
    const engine = fresh();
    engine.setDifficulty('hard');
    engine.state.phase = phase;
    engine.state.score.player = 4;
    engine.state.lastScorer = 'player';
    engine.state.winner = phase === 'gameover' ? 'player' : null;
    engine.state.goalRemaining = 0.5;
    engine.state.elapsed = 12;
    const events = [], snapshots = [];
    engine.onEvent = event => events.push(event);
    engine.onChange = snapshot => snapshots.push(snapshot);
    engine.returnToMenu();
    assert.equal(engine.state.phase, 'ready');
    assert.deepEqual(engine.state.score, { player: 0, ai: 0 });
    assert.equal(engine.state.winner, null);
    assert.equal(engine.state.lastScorer, null);
    assert.equal(engine.state.elapsed, 0);
    assert.equal(engine.state.goalRemaining, 0);
    assert.equal(engine.state.difficulty, 'hard');
    assert.equal(engine.state.puck.vx, 0);
    assert.equal(engine.state.puck.vy, 0);
    assert.equal(engine.snapshot().stats, null);
    assert.deepEqual(events, [{ type: 'reset' }]);
    assert.equal(snapshots.length, 1);
    const menu = structuredClone(engine.state);
    engine.advance(10);
    engine.resume();
    assert.deepEqual(engine.state, menu);
    engine.start();
    assert.equal(engine.state.phase, 'playing');
    assert.ok(Math.hypot(engine.state.puck.vx, engine.state.puck.vy) > 0);
  }
});

test('configuration rejects invalid geometry, nonfinite values, and fractional winning scores', () => {
  validateConfig(config);
  for (const change of [
    (c) => {
      c.match.winningScore = 2.5;
    },
    (c) => {
      c.puck.maxSpeed = Infinity;
    },
    (c) => {
      c.table.goalWidth = 1000;
    },
  ]) {
    const invalid = structuredClone(config);
    change(invalid);
    assert.throws(() => new GameEngine(invalid), /configuration|integer/i);
  }
});

test('React snapshots are emitted only for UI changes, not every simulation step', () => {
  const engine = fresh(),
    snapshots = [];
  engine.onChange = (snapshot) => snapshots.push(snapshot);
  stepFor(engine, 0.3);
  assert.equal(snapshots.length, 0);
  engine.pause();
  engine.resume();
  engine.setDifficulty('hard');
  assert.equal(snapshots.length, 3);
});
