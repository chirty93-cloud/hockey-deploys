import { GAME_CONFIG, validateConfig } from "../config/game.ts";
import type { Difficulty, GameConfig } from "../config/game.ts";
import { AIController } from "./AIController.ts";
import {
  capSpeed,
  collidePaddle,
  collideRink,
  constrain,
  integratePuck,
  movePaddle,
} from "./physics.ts";
import type { Body, GameEvent, GameState, MatchStats, Side, Snapshot } from "./types.ts";

const body = (x: number, y: number): Body => ({ x, y, vx: 0, vy: 0 });
const emptyStats = (): MatchStats => ({
  player: { hits: 0, saves: 0, fastestShot: 0, bankGoals: 0 },
  ai: { hits: 0, saves: 0, fastestShot: 0, bankGoals: 0 },
  longestRally: 0, longestRallyHits: 0, elapsed: 0,
});

/** Authoritative simulation. No DOM, renderer, audio context, or wall-clock timers. */
export class GameEngine {
  readonly state: GameState;
  readonly config: GameConfig;
  readonly ai: AIController;
  onChange: (snapshot: Snapshot) => void = () => {};
  onEvent: (event: GameEvent) => void = () => {};
  private random: () => number;
  private accumulator = 0;
  private stalledFor = 0;
  private resumePhase: "playing" | "goal" = "playing";
  private serveTo: Side = "player";
  private stats = emptyStats();
  private rallyTime = 0;
  private rallyHits = 0;
  private lastTouch: Side | null = null;
  private banked = false;
  private wallHit = (x: number, y: number, speed: number) => {
    if (this.lastTouch && (x === 0 || x === this.config.table.width)) this.banked = true;
    if (speed > 1) this.onEvent({ type: "hit", kind: "wall", x, y, speed });
  };

  constructor(
    config: GameConfig = GAME_CONFIG,
    random: () => number = Math.random,
  ) {
    validateConfig(config);
    this.config = structuredClone(config);
    this.random = random;
    this.ai = new AIController(this.config, random);
    this.state = {
      phase: "ready",
      player: body(0, 0),
      ai: body(0, 0),
      puck: body(0, 0),
      target: { x: 0, y: 0 },
      score: { player: 0, ai: 0 },
      difficulty: config.match.defaultDifficulty,
      winner: null,
      lastScorer: null,
      goalRemaining: 0,
      elapsed: 0,
      endReason: null,
    };
    this.resetPositions(false);
  }

  snapshot(): Snapshot {
    const s = this.state;
    return {
      stats: s.phase === "gameover" ? { ...structuredClone(this.stats), elapsed: s.elapsed } : null,
      phase: s.phase,
      playerScore: s.score.player,
      aiScore: s.score.ai,
      difficulty: s.difficulty,
      winner: s.winner,
      lastScorer: s.lastScorer,
      remainingSeconds: this.config.match.timeLimitSeconds
        ? Math.max(
            0,
            Math.ceil(this.config.match.timeLimitSeconds - s.elapsed - 1e-8),
          )
        : null,
      endReason: s.endReason,
    };
  }

  start(): void {
    this.resetMatch(true);
  }

  returnToMenu(): void {
    this.resetMatch(false);
  }

  private resetMatch(serve: boolean): void {
    const s = this.state;
    s.score.player = s.score.ai = 0;
    s.winner = s.lastScorer = null;
    s.endReason = null;
    s.goalRemaining = s.elapsed = 0;
    this.accumulator = this.stalledFor = 0;
    this.stats = emptyStats();
    this.resumePhase = "playing";
    this.serveTo = "player";
    this.resetPositions(serve);
    s.phase = serve ? "playing" : "ready";
    this.onChange(this.snapshot());
  }

  /** Settings apply atomically to a fresh match; the renderer/audio instance is reused. */
  configure(config: GameConfig): void {
    validateConfig(config);
    Object.assign(this.config, structuredClone(config));
    this.state.difficulty = config.match.defaultDifficulty;
    this.onEvent({ type: "configure" });
  }

  /** Resizing preserves the point and score, even during a goal or paused reset. */
  resizeTable(width: number, height: number): void {
    const c = this.config,
      s = this.state;
    if (width === c.table.width && height === c.table.height) return;
    validateConfig({ ...c, table: { ...c.table, width, height } });
    const sx = width / c.table.width,
      sy = height / c.table.height;
    for (const point of [s.player, s.ai, s.puck, s.target]) {
      point.x *= sx;
      point.y *= sy;
    }
    c.table.width = width;
    c.table.height = height;
    constrain(s.player, "player", c);
    constrain(s.ai, "ai", c);
    constrain(s.target, "player", c);
    this.releaseInput();
    s.ai.vx = s.ai.vy = 0;
    this.ai.reset();
    this.accumulator = 0;
  }

  setDifficulty(difficulty: Difficulty): void {
    if (!this.config.ai.difficulties[difficulty]) return;
    this.state.difficulty = difficulty;
    this.ai.reset();
    this.onChange(this.snapshot());
  }

  setTarget(x: number, y: number): void {
    if (
      this.state.phase !== "playing" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return;
    this.state.target.x = x;
    this.state.target.y = y;
    constrain(this.state.target, "player", this.config);
  }

  releaseInput(): void {
    this.state.target.x = this.state.player.x;
    this.state.target.y = this.state.player.y;
    this.state.player.vx = this.state.player.vy = 0;
  }

  pause(): void {
    if (this.state.phase !== "playing" && this.state.phase !== "goal") return;
    this.resumePhase = this.state.phase;
    this.state.phase = "paused";
    this.accumulator = 0;
    this.releaseInput();
    this.onChange(this.snapshot());
  }

  resume(): void {
    if (this.state.phase !== "paused") return;
    this.state.phase = this.resumePhase;
    this.accumulator = 0;
    this.onChange(this.snapshot());
  }

  advance(seconds: number): void {
    const s = this.state,
      c = this.config;
    if (
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      (s.phase !== "playing" && s.phase !== "goal")
    )
      return;
    this.accumulator += Math.min(seconds, c.physics.maxFrame);
    while (this.accumulator + 1e-10 >= c.physics.step) {
      this.accumulator = Math.max(0, this.accumulator - c.physics.step);
      if (s.phase === "goal") {
        s.goalRemaining = Math.max(0, s.goalRemaining - c.physics.step);
        if (s.goalRemaining < 1e-8) {
          this.resetPositions(true);
          s.phase = "playing";
          s.lastScorer = null;
          this.onChange(this.snapshot());
        }
      } else if (s.phase === "playing") {
        this.step(c.physics.step);
      } else {
        this.accumulator = 0;
        break;
      }
    }
  }

  private resetPositions(serve: boolean): void {
    this.rallyTime = this.rallyHits = 0;
    this.lastTouch = null;
    this.banked = false;
    const c = this.config,
      s = this.state,
      mid = c.table.width / 2;
    Object.assign(s.player, body(mid, c.table.height - c.paddle.homeInset));
    Object.assign(s.ai, body(mid, c.paddle.homeInset));
    Object.assign(s.puck, body(mid, c.table.height / 2));
    this.releaseInput();
    this.ai.reset();
    this.stalledFor = 0;
    if (serve) {
      const angle = (this.random() * 2 - 1) * c.puck.serveAngle;
      s.puck.vx = Math.sin(angle) * c.puck.serveSpeed;
      s.puck.vy =
        Math.cos(angle) *
        c.puck.serveSpeed *
        (this.serveTo === "player" ? 1 : -1);
    }
    this.onEvent({ type: "reset" });
  }

  private step(dt: number): void {
    const s = this.state,
      c = this.config;
    if (
      !Number.isFinite(s.puck.x) ||
      !Number.isFinite(s.puck.y) ||
      !Number.isFinite(s.puck.vx) ||
      !Number.isFinite(s.puck.vy) ||
      !Number.isFinite(s.player.x) ||
      !Number.isFinite(s.player.y) ||
      !Number.isFinite(s.ai.x) ||
      !Number.isFinite(s.ai.y)
    ) {
      this.resetPositions(true);
      return;
    }
    const before = Math.ceil(c.match.timeLimitSeconds - s.elapsed - 1e-8);
    s.elapsed += dt;
    this.rallyTime += dt;
    this.stats.longestRally = Math.max(this.stats.longestRally, this.rallyTime);
    if (
      c.match.timeLimitSeconds &&
      s.elapsed + 1e-8 >= c.match.timeLimitSeconds
    ) {
      s.elapsed = c.match.timeLimitSeconds;
      s.phase = "gameover";
      s.endReason = "time";
      s.lastScorer = null;
      s.winner =
        s.score.player === s.score.ai
          ? null
          : s.score.player > s.score.ai
            ? "player"
            : "ai";
      s.puck.vx = s.puck.vy = 0;
      this.onEvent({ type: "finish", winner: s.winner });
      this.onChange(this.snapshot());
      return;
    }
    if (
      c.match.timeLimitSeconds &&
      before !== Math.ceil(c.match.timeLimitSeconds - s.elapsed - 1e-8)
    )
      this.onChange(this.snapshot());
    capSpeed(s.puck, c.puck.maxSpeed);
    this.ai.update(s, dt);
    constrain(s.target, "player", c);
    // Relative travel per substep is less than half a puck radius, including fast mallets.
    const count = Math.max(
      1,
      Math.ceil(
        ((c.puck.maxSpeed + c.paddle.maxSpeed) * dt) / (c.puck.radius * 0.45),
      ),
    );
    const substep = dt / count;
    for (let i = 0; i < count; i++) {
      movePaddle(
        s.player,
        s.target,
        c.paddle.maxSpeed,
        c.paddle.responseSeconds,
        substep,
      );
      movePaddle(
        s.ai,
        this.ai.target,
        c.ai.difficulties[s.difficulty].speed,
        0,
        substep,
      );
      constrain(s.player, "player", c);
      constrain(s.ai, "ai", c);
      integratePuck(s.puck, c.puck.drag, substep);
      this.paddleHit("player");
      this.paddleHit("ai");
      const scorer = collideRink(s.puck, c, this.wallHit);
      if (scorer) {
        this.score(scorer);
        return;
      }
    }
    if (Math.hypot(s.puck.vx, s.puck.vy) < c.match.stallSpeed)
      this.stalledFor += dt;
    else this.stalledFor = 0;
    if (this.stalledFor >= c.match.stallSeconds) {
      s.phase = "goal";
      s.lastScorer = null;
      s.goalRemaining = c.match.goalDelay;
      s.puck.vx = s.puck.vy = 0;
      this.onChange(this.snapshot());
    }
  }

  private paddleHit(side: Side): void {
    const puck = this.state.puck;
    const c = this.config;
    // A save intercepts a trajectory aimed inside this side's goal opening.
    const goalY = side === "player" ? c.table.height : 0;
    const towardGoal = side === "player" ? puck.vy > 0 : puck.vy < 0;
    const travel = towardGoal ? (goalY - puck.y) / puck.vy : -1;
    const projectedX = puck.x + puck.vx * travel;
    const saving = travel >= 0 && Math.abs(projectedX - c.table.width / 2) <= c.table.goalWidth / 2 - c.puck.radius;
    const speed = collidePaddle(this.state.puck, this.state[side], this.config);
    if (speed > 0) {
      const stats = this.stats[side];
      stats.hits++;
      if (saving) stats.saves++;
      stats.fastestShot = Math.max(stats.fastestShot, Math.hypot(puck.vx, puck.vy));
      this.rallyHits++;
      this.stats.longestRallyHits = Math.max(this.stats.longestRallyHits, this.rallyHits);
      this.lastTouch = side;
      this.banked = false;
    }
    if (speed > 1)
      this.onEvent({
        type: "hit",
        kind: "paddle",
        side,
        x: this.state.puck.x,
        y: this.state.puck.y,
        speed,
      });
  }

  private score(side: Side): void {
    const s = this.state;
    if (s.phase !== "playing") return;
    if (this.lastTouch === side && this.banked) this.stats[side].bankGoals++;
    s.score[side]++;
    s.lastScorer = side;
    const won = s.score[side] >= this.config.match.winningScore;
    s.winner = won ? side : null;
    s.endReason = won ? "score" : null;
    s.phase = won ? "gameover" : "goal";
    s.goalRemaining = this.config.match.goalDelay;
    s.puck.vx = s.puck.vy = 0;
    this.serveTo = side === "player" ? "ai" : "player";
    this.onEvent({
      type: "goal",
      side,
      won,
      x: s.puck.x,
      y: side === "player" ? 0 : this.config.table.height,
    });
    this.onChange(this.snapshot());
  }
}
