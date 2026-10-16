import { Application, Container, FillGradient, Graphics } from "pixi.js";
import { ARENAS } from "../config/arenas.ts";
import type { GameConfig } from "../config/game.ts";
import type { GameEvent, GameState, Point } from "./types.ts";
import { directionToWorld, screenToWorld } from "./viewLayout.ts";
import type { ViewLayout } from "./viewLayout.ts";

interface Particle {
  view: Graphics;
  vx: number;
  vy: number;
  life: number;
  remaining: number;
}
interface Ring {
  view: Graphics;
  remaining: number;
  duration: number;
  goal: boolean;
  strength: number;
}

export class TableRenderer {
  readonly app: Application;
  readonly world = new Container();
  private config: GameConfig;
  private player!: Container;
  private ai!: Container;
  private puck!: Container;
  private layout: ViewLayout | null = null;
  private drawnWidth = 0;
  private drawnHeight = 0;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private trail: Graphics[] = [];
  private gradients: FillGradient[] = [];
  private particleIndex = 0;
  private ringIndex = 0;
  private trailTime = 0;
  private reducedMotion = false;
  private playerFlash!: Graphics;
  private aiFlash!: Graphics;
  private goalWave!: Graphics;
  private speedLines!: Graphics;
  private playerWake!: Graphics;
  private aiWake!: Graphics;
  private goalTime = 0;
  private goalSide: "player" | "ai" = "player";
  private shotHeat = 0;
  private playerHeat = 0;
  private aiHeat = 0;
  private shakeTime = 0;
  private shakePower = 0;

  static async create(config: GameConfig): Promise<TableRenderer> {
    const app = new Application();
    try {
      await app.init({
        preference: "webgl",
        width: 1,
        height: 1,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(
          devicePixelRatio || 1,
          config.visuals.maxResolution,
        ),
        autoStart: false,
        sharedTicker: false,
      });
      return new TableRenderer(app, config);
    } catch (error) {
      if (app.renderer) app.destroy({ removeView: true }, { children: true });
      else app.stage.destroy({ children: true });
      throw error;
    }
  }

  private constructor(app: Application, config: GameConfig) {
    this.app = app;
    this.config = config;
    app.stage.eventMode = "none";
    app.stage.addChild(this.world);
    this.buildScene();
  }

  private buildScene(): void {
    const config = this.config;
    this.drawnWidth = config.table.width;
    this.drawnHeight = config.table.height;
    this.drawTable();
    for (let i = 0; i < config.visuals.trailLength; i++) {
      const dot = new Graphics()
        .circle(0, 0, config.puck.radius)
        .fill(0xcceeff);
      dot.visible = false;
      this.trail.push(dot);
      this.world.addChild(dot);
    }
    this.playerWake = this.createWake(config.visuals.player);
    this.aiWake = this.createWake(config.visuals.ai);
    this.ai = this.createPaddle(config.visuals.ai);
    this.player = this.createPaddle(config.visuals.player);
    this.playerFlash = this.createFlash(this.player);
    this.aiFlash = this.createFlash(this.ai);
    this.puck = new Container();
    const r = config.puck.radius;
    this.puck.addChild(
      new Graphics().circle(1, 5, r + 2).fill({ color: 0x000000, alpha: 0.4 }),
    );
    this.puck.addChild(
      new Graphics().circle(0, 0, r + 4).fill({ color: 0xc9efff, alpha: 0.08 }),
    );
    this.puck.addChild(
      new Graphics()
        .circle(0, 0, r)
        .fill(ARENAS[config.visuals.arena].puck)
        .stroke({ width: 2.5, color: 0x06111d }),
    );
    this.puck.addChild(
      new Graphics()
        .circle(-r * 0.08, -r * 0.15, r * 0.77)
        .fill(ARENAS[config.visuals.arena].puck)
        .circle(-r * 0.3, -r * 0.38, r * 0.23)
        .fill(0xffffff),
    );
    this.world.addChild(this.puck);
    this.speedLines = new Graphics();
    for (const [x, y, length] of [[-20, -9, 25], [-25, 0, 35], [-20, 9, 25]])
      this.speedLines.moveTo(x, y).lineTo(x - length, y).stroke({ color: 0xffffff, width: 1.2 });
    this.speedLines.visible = false;
    this.world.addChild(this.speedLines);
    for (let i = 0; i < config.visuals.particles; i++) {
      const view = new Graphics().circle(0, 0, 2).fill(0xffffff);
      view.visible = false;
      this.world.addChild(view);
      this.particles.push({ view, vx: 0, vy: 0, life: 0, remaining: 0 });
    }
    for (let i = 0; i < 8; i++) {
      const view = new Graphics()
        .circle(0, 0, 10)
        .stroke({ color: 0xffffff, width: 1.2 });
      view.visible = false;
      this.world.addChild(view);
      this.rings.push({ view, remaining: 0, duration: 0, goal: false, strength: 0 });
    }
    this.goalWave = new Graphics().rect(0, -3, config.table.width, 6)
      .fill(0xffffff).rect(0, -16, config.table.width, 32).fill({ color: 0xffffff, alpha: 0.12 });
    this.goalWave.visible = false;
    this.world.addChild(this.goalWave);
  }

  private createWake(color: number): Graphics {
    const wake = new Graphics().ellipse(-18, 0, 32, this.config.paddle.radius * 0.65)
      .fill({ color, alpha: 0.16 }).ellipse(-10, 0, 23, this.config.paddle.radius * 0.45)
      .fill({ color, alpha: 0.16 });
    wake.visible = false;
    this.world.addChild(wake);
    return wake;
  }

  private createFlash(paddle: Container): Graphics {
    const flash = new Graphics().circle(0, 0, this.config.paddle.radius + 2)
      .fill({ color: 0xffffff, alpha: 0.65 });
    flash.alpha = 0;
    paddle.addChild(flash);
    return flash;
  }

  private drawTable(): void {
    const { width: w, height: h, goalWidth } = this.config.table;
    const { player, ai, gold } = this.config.visuals;
    const palette = ARENAS[this.config.visuals.arena];
    const left = (w - goalWidth) / 2,
      right = (w + goalWidth) / 2;
    const surface = new FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      colorStops: [
        { offset: 0, color: palette.surface[0] },
        { offset: 0.5, color: palette.surface[1] },
        { offset: 1, color: palette.surface[2] },
      ],
    });
    this.gradients.push(surface);
    const board = new Graphics();
    board
      .roundRect(-18, -18, w + 36, h + 36, 34)
      .fill({ color: 0x00040a, alpha: 0.7 });
    board
      .roundRect(-12, -12, w + 24, h + 24, 28)
      .fill(palette.rail)
      .stroke({ color: 0x48616e, width: 1, alpha: 0.55 });
    board.roundRect(0, 0, w, h, 18).fill(surface);
    const spacing = this.config.visuals.textureSpacing;
    for (let x = spacing; x < w; x += spacing)
      for (let y = spacing; y < h; y += spacing)
        board.circle(x, y, 0.65).fill({ color: palette.markings, alpha: 0.12 });
    // Static texture and reflected rail light are built only on scene changes.
    for (let i = 1; i <= 5; i++) {
      const alpha = (6 - i) * 0.008;
      board.rect(i * 5, 20, 5, h - 40).fill({ color: ai, alpha });
      board.rect(w - i * 5 - 5, 20, 5, h - 40).fill({ color: player, alpha });
    }
    if (this.config.visuals.arena === "ice") {
      for (let i = 0; i < 28; i++) {
        const x = 20 + ((i * 137) % (w - 60));
        const y = 30 + ((i * 193) % (h - 90));
        board.moveTo(x, y).lineTo(Math.min(w - 10, x + 35), y + 24)
          .stroke({ color: 0xffffff, width: 1, alpha: 0.18 });
      }
    } else if (this.config.visuals.arena === "retro") {
      for (let y = 30; y < h; y += 30)
        board.moveTo(8, y).lineTo(w - 8, y).stroke({ color: palette.markings, width: 1, alpha: 0.055 });
      for (let x = 30; x < w; x += 30)
        board.moveTo(x, 8).lineTo(x, h - 8).stroke({ color: palette.markings, width: 1, alpha: 0.055 });
    }
    for (let x = 12; x < w - 12; x += 16)
      board
        .moveTo(x, h / 2)
        .lineTo(Math.min(x + 7, w - 12), h / 2)
        .stroke({ color: palette.markings, alpha: 0.24, width: 1.4 });
    board
      .circle(w / 2, h / 2, w * 0.15)
      .stroke({ color: palette.markings, width: 1.5, alpha: 0.18 });
    board.circle(w / 2, h / 2, 4).fill({ color: palette.markings, alpha: 0.4 });
    for (const y of [0, h]) {
      const radius = goalWidth * 0.75;
      board
        .moveTo(w / 2 + (y === 0 ? radius : -radius), y)
        .arc(
          w / 2,
          y,
          radius,
          y === 0 ? 0 : Math.PI,
          y === 0 ? Math.PI : Math.PI * 2,
        )
        .stroke({ color: y === 0 ? ai : player, width: 1, alpha: 0.12 });
      board.roundRect(left, y - 5, goalWidth, 10, 3).fill(0x050c16);
      board
        .roundRect(left + 4, y === 0 ? -13 : h + 7, goalWidth - 8, 6, 3)
        .fill({ color: gold, alpha: 0.7 });
    }
    this.world.addChild(board);
    // Three translucent strokes make a soft rail glow without a full-screen blur filter.
    for (const [strokeWidth, alpha] of [
      [15, 0.025],
      [7, 0.09],
      [2, 0.85],
    ]) {
      for (const [y, direction, color] of [
        [0, 1, ai],
        [h, -1, player],
      ]) {
        const rail = new Graphics();
        rail
          .moveTo(left - 4, y)
          .lineTo(18, y)
          .quadraticCurveTo(0, y, 0, y + direction * 18)
          .lineTo(0, h / 2);
        rail
          .moveTo(right + 4, y)
          .lineTo(w - 18, y)
          .quadraticCurveTo(w, y, w, y + direction * 18)
          .lineTo(w, h / 2);
        rail.stroke({ color, width: strokeWidth, alpha });
        this.world.addChild(rail);
      }
    }
    const posts = new Graphics();
    for (const x of [left, right])
      for (const y of [0, h]) {
        posts.circle(x, y, 9).fill({ color: gold, alpha: 0.1 });
        posts
          .circle(x, y, 4)
          .fill(gold)
          .circle(x - 1, y - 1, 1.5)
          .fill(0xfff5d9);
      }
    this.world.addChild(posts);
  }

  private createPaddle(color: number): Container {
    const paddle = new Container(),
      r = this.config.paddle.radius;
    paddle.addChild(
      new Graphics().ellipse(2, 9, r + 5, r * 0.94).fill({ color: ARENAS[this.config.visuals.arena].shadow, alpha: 0.4 })
        .ellipse(1, 5, r + 1, r * 0.94).fill({ color: 0x000000, alpha: 0.24 }),
    );
    paddle.addChild(
      new Graphics()
        .circle(0, 0, r + 10)
        .fill({ color, alpha: 0.025 })
        .circle(0, 0, r + 5)
        .fill({ color, alpha: 0.08 }),
    );
    paddle.addChild(
      new Graphics().circle(0, 0, r).fill(0x0b1823).stroke({ color, width: 3 }),
    );
    paddle.addChild(
      new Graphics()
        .circle(0, -1, r - 5)
        .fill({ color, alpha: 0.85 })
        .circle(0, -2, r - 9)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.2 }),
    );
    paddle.addChild(
      new Graphics()
        .circle(0, 0, r * 0.42)
        .fill({ color: 0x03111a, alpha: 0.4 })
        .circle(0, -3, r * 0.36)
        .fill(color)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.28 }),
    );
    paddle.addChild(new Graphics().arc(0, -1, r - 3, Math.PI * 1.12, Math.PI * 1.8)
      .stroke({ color: 0xffffff, alpha: 0.55, width: 1.5 })
      .ellipse(-5, -r * 0.5, r * 0.34, 2).fill({ color: 0xffffff, alpha: 0.14 }));
    this.world.addChild(paddle);
    return paddle;
  }

  private rebuild(): void {
    for (const child of this.world.removeChildren())
      child.destroy({ children: true });
    for (const gradient of this.gradients) gradient.destroy();
    this.gradients = [];
    this.trail = [];
    this.particles = [];
    this.rings = [];
    this.trailTime = this.particleIndex = this.ringIndex = 0;
    this.buildScene();
    this.clearEffects();
  }

  resize(width: number, height: number, layout: ViewLayout): void {
    if (width <= 0 || height <= 0) return;
    this.layout = layout;
    if (this.drawnWidth !== layout.width || this.drawnHeight !== layout.height)
      this.rebuild();
    this.app.renderer.resize(
      width,
      height,
      Math.min(devicePixelRatio || 1, this.config.visuals.maxResolution),
    );
    this.world.scale.set(layout.scale);
    this.world.pivot.set(layout.width / 2, layout.height / 2);
    this.world.rotation = layout.horizontal
      ? layout.side === "left"
        ? Math.PI / 2
        : -Math.PI / 2
      : 0;
    this.world.position.set(width / 2, height / 2);
  }

  toWorld = (clientX: number, clientY: number, point: Point): void => {
    const rect = this.app.canvas.getBoundingClientRect();
    if (!this.layout) return;
    screenToWorld(
      ((clientX - rect.left) * this.app.screen.width) / Math.max(1, rect.width),
      ((clientY - rect.top) * this.app.screen.height) /
        Math.max(1, rect.height),
      this.layout,
      point,
    );
  };

  directionToWorld = (x: number, y: number, point: Point): void => {
    if (this.layout) directionToWorld(x, y, this.layout, point);
  };

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.clearEffects();
  }

  clearEffects(): void {
    for (const p of this.particles) {
      p.remaining = 0;
      p.view.visible = false;
    }
    for (const r of this.rings) {
      r.remaining = 0;
      r.view.visible = false;
    }
    for (const t of this.trail) t.visible = false;
    this.trailTime = 0;
    this.goalTime = this.shotHeat = this.playerHeat = this.aiHeat = this.shakeTime = 0;
    this.playerFlash.alpha = this.aiFlash.alpha = 0;
    this.goalWave.visible = false;
    this.speedLines.visible = this.playerWake.visible = this.aiWake.visible = false;
    if (this.layout) this.world.position.set(this.app.screen.width / 2, this.app.screen.height / 2);
  }

  event(event: GameEvent): void {
    if (event.type === "configure") {
      this.rebuild();
      return;
    }
    if (event.type === "finish") return;
    if (event.type === "reset") {
      this.clearEffects();
      return;
    }
    const effects = this.config.visuals.effects;
    if (this.config.visuals.intensity === 0 || this.reducedMotion) return;
    const goal = event.type === "goal";
    const strength = goal ? 1 : Math.min(1, event.speed / this.config.puck.maxSpeed);
    if (goal && effects.goalWave) {
      this.goalTime = 1;
      this.goalSide = event.side;
    } else if (!goal && event.kind === "paddle") {
      this.shotHeat = strength;
      if (effects.hitFlash) {
        if (event.side === "player") this.playerHeat = strength;
        else this.aiHeat = strength;
      }
    }
    if (!this.reducedMotion && this.config.visuals.screenShake && (goal || strength > 0.85 && event.kind === "paddle")) {
      this.shakeTime = goal ? 0.24 : 0.1;
      this.shakePower = (goal ? 2 : 0.8) * this.config.visuals.intensity / 0.8;
    }
    const color =
      event.side === "player"
        ? this.config.visuals.player
        : event.side === "ai"
          ? this.config.visuals.ai
          : 0xbedde7;
    if (effects.hitRings) {
      const ring = this.rings[this.ringIndex++ % this.rings.length];
      Object.assign(ring, {
        duration: goal ? 0.85 : 0.24,
        remaining: goal ? 0.85 : 0.24,
        goal,
        strength,
      });
      ring.view.position.set(event.x, event.y);
      ring.view.tint = color;
    }
    if (!effects.sparks) return;
    const count = Math.round((goal ? 28 : 2 + strength * 7) * this.config.visuals.intensity * this.config.visuals.particles / 64);
    for (let i = 0; i < count && this.particles.length; i++) {
      const p = this.particles[this.particleIndex++ % this.particles.length];
      const angle = (i / count) * Math.PI * 2;
      const speed = (goal ? 140 : 35 + strength * 95) * (0.5 + (i % 4) / 4);
      p.view.position.set(event.x, event.y);
      p.view.tint = color;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = p.remaining = goal ? 0.8 : 0.3;
    }
  }

  render(state: GameState, seconds: number): void {
    this.player.position.set(state.player.x, state.player.y);
    this.ai.position.set(state.ai.x, state.ai.y);
    this.puck.position.set(state.puck.x, state.puck.y);
    const dt = state.phase === "paused" ? 0 : Math.min(seconds, 0.05);
    this.shotHeat = Math.max(0, this.shotHeat - dt * 1.4);
    this.playerHeat = Math.max(0, this.playerHeat - dt * 5);
    this.aiHeat = Math.max(0, this.aiHeat - dt * 5);
    const effects = this.config.visuals.effects;
    const gain = this.config.visuals.intensity / 0.8;
    const animated = !this.reducedMotion && gain > 0;
    this.playerFlash.alpha = animated && effects.hitFlash ? Math.min(1, this.playerHeat * 0.65 * gain) : 0;
    this.aiFlash.alpha = animated && effects.hitFlash ? Math.min(1, this.aiHeat * 0.65 * gain) : 0;
    const speedRatio = Math.min(1, Math.hypot(state.puck.vx, state.puck.vy) / this.config.puck.maxSpeed);
    this.speedLines.visible = animated && effects.speedLines && state.phase === "playing" && speedRatio > 0.65;
    if (this.speedLines.visible) {
      this.speedLines.position.set(state.puck.x, state.puck.y);
      this.speedLines.rotation = Math.atan2(state.puck.vy, state.puck.vx);
      this.speedLines.scale.set(0.6 + speedRatio * 0.4);
      this.speedLines.tint = ARENAS[this.config.visuals.arena].puck;
      this.speedLines.alpha = (speedRatio - 0.65) * gain;
    }
    for (const [wake, body] of [[this.playerWake, state.player], [this.aiWake, state.ai]] as const) {
      const speed = Math.hypot(body.vx, body.vy);
      wake.visible = animated && effects.paddleWake && state.phase === "playing" && speed > 80;
      if (wake.visible) {
        const ratio = Math.min(1, speed / this.config.paddle.maxSpeed);
        wake.position.set(body.x, body.y);
        wake.rotation = Math.atan2(body.vy, body.vx);
        wake.scale.set(0.4 + ratio * 1.1, 0.8);
        wake.alpha = ratio * gain;
      }
    }
    this.goalTime = Math.max(0, this.goalTime - dt);
    this.goalWave.visible = animated && effects.goalWave && this.goalTime > 0;
    if (this.goalWave.visible) {
      const progress = 1 - this.goalTime;
      this.goalWave.y = (this.goalSide === "player" ? progress : 1 - progress) * this.config.table.height;
      this.goalWave.tint = this.goalSide === "player" ? this.config.visuals.player : this.config.visuals.ai;
      this.goalWave.alpha = (1 - progress) * 0.4 * this.config.visuals.intensity;
    }
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    const shake = animated && this.config.visuals.screenShake ? Math.min(1, this.shakeTime / 0.1) * this.shakePower : 0;
    this.world.position.set(this.app.screen.width / 2 + Math.sin(this.shakeTime * 160) * shake,
      this.app.screen.height / 2 + Math.sin(this.shakeTime * 210) * shake * 0.5);
    if (state.phase === "playing" && animated && effects.trail && this.trail.length) {
      this.trailTime += dt;
      if (this.trailTime >= 1 / 60) {
        this.trailTime %= 1 / 60;
        for (let i = this.trail.length - 1; i > 0; i--) {
          this.trail[i].position.copyFrom(this.trail[i - 1].position);
          this.trail[i].visible = this.trail[i - 1].visible;
        }
        this.trail[0].position.set(state.puck.x, state.puck.y);
        this.trail[0].visible = Math.hypot(state.puck.vx, state.puck.vy) > 60;
      }
      for (let i = 0; i < this.trail.length; i++) {
        this.trail[i].tint = this.shotHeat > 0.15 ? this.config.visuals.gold : ARENAS[this.config.visuals.arena].puck;
        this.trail[i].scale.set(1 - i / (this.trail.length + 1));
        this.trail[i].alpha =
          (0.06 + speedRatio * 0.12 + this.shotHeat * 0.12) * (1 - i / this.trail.length) * this.config.visuals.intensity;
      }
    } else for (const t of this.trail) t.visible = false;
    for (const p of this.particles) {
      p.remaining = Math.max(0, p.remaining - dt);
      p.view.visible = animated && effects.sparks && p.remaining > 0;
      if (!p.view.visible) continue;
      p.view.x += p.vx * dt;
      p.view.y += p.vy * dt;
      p.view.alpha = (p.remaining / p.life) * this.config.visuals.intensity;
    }
    for (const r of this.rings) {
      r.remaining = Math.max(0, r.remaining - dt);
      r.view.visible = animated && effects.hitRings && r.remaining > 0;
      if (!r.view.visible) continue;
      const progress = 1 - r.remaining / r.duration;
      r.view.scale.set(
        this.reducedMotion ? 1.8 : 1 + progress * (r.goal ? 9 : 1 + r.strength * 3),
      );
      r.view.alpha = (1 - progress) * (0.2 + r.strength * 0.45) * this.config.visuals.intensity;
    }
  }

  destroy(): void {
    this.app.destroy({ removeView: true }, { children: true });
    for (const gradient of this.gradients) gradient.destroy();
  }
}
