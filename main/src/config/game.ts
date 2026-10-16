import type { ArenaId } from "./arenas.ts";
import { DEFAULT_EFFECTS } from "./effects.ts";
import type { VisualEffects } from "./effects.ts";
export type Difficulty = "easy" | "medium" | "hard";

export interface AISettings {
  speed: number;
  reactionSeconds: number;
  prediction: number;
  aimError: number;
  aggression: number;
}

/** Distances are world units, speeds units/second, and durations seconds. */
export interface GameConfig {
  table: { width: number; height: number; goalWidth: number };
  paddle: {
    radius: number;
    maxSpeed: number;
    responseSeconds: number;
    homeInset: number;
  };
  puck: {
    radius: number;
    serveSpeed: number;
    maxSpeed: number;
    drag: number;
    serveAngle: number;
  };
  physics: {
    step: number;
    maxFrame: number;
    wallRestitution: number;
    paddleRestitution: number;
    separation: number;
  };
  match: {
    winningScore: number;
    /** Active playing time; 0 disables the match clock. */
    timeLimitSeconds: number;
    goalDelay: number;
    stallSpeed: number;
    stallSeconds: number;
    defaultDifficulty: Difficulty;
  };
  ai: {
    predictionHorizon: number;
    attackOffset: number;
    defensiveTracking: number;
    attackZone: number;
    incomingAttackRatio: number;
    aimAwayFactor: number;
    difficulties: Record<Difficulty, AISettings>;
  };
  audio: { enabled: boolean; volume: number };
  visuals: {
    effects: VisualEffects;
    arena: ArenaId;
    screenShake: boolean;
    padding: number;
    maxResolution: number;
    intensity: number;
    particles: number;
    trailLength: number;
    textureSpacing: number;
    player: number;
    ai: number;
    gold: number;
  };
}

export const GAME_CONFIG: GameConfig = {
  table: { width: 480, height: 760, goalWidth: 168 },
  paddle: {
    radius: 30,
    maxSpeed: 2200,
    responseSeconds: 0.01,
    homeInset: 104,
  },
  puck: {
    radius: 13,
    serveSpeed: 360,
    maxSpeed: 1120,
    drag: 0.055,
    serveAngle: Math.PI / 5,
  },
  physics: {
    step: 1 / 120,
    maxFrame: 0.05,
    wallRestitution: 0.96,
    paddleRestitution: 0.93,
    separation: 0.01,
  },
  match: {
    winningScore: 7,
    timeLimitSeconds: 0,
    goalDelay: 1.25,
    stallSpeed: 18,
    stallSeconds: 7,
    defaultDifficulty: "medium",
  },
  ai: {
    predictionHorizon: 1.5,
    attackOffset: 20,
    defensiveTracking: 0.25,
    attackZone: 0.48,
    incomingAttackRatio: 0.4,
    aimAwayFactor: 0.12,
    difficulties: {
      easy: {
        speed: 310,
        reactionSeconds: 0.22,
        prediction: 0.45,
        aimError: 48,
        aggression: 0.48,
      },
      medium: {
        speed: 470,
        reactionSeconds: 0.12,
        prediction: 0.78,
        aimError: 24,
        aggression: 0.72,
      },
      hard: {
        speed: 640,
        reactionSeconds: 0.065,
        prediction: 0.94,
        aimError: 10,
        aggression: 0.92,
      },
    },
  },
  audio: { enabled: true, volume: 0.22 },
  visuals: {
    effects: { ...DEFAULT_EFFECTS },
    arena: "neon",
    screenShake: true,
    padding: 26,
    maxResolution: 2,
    intensity: 0.8,
    particles: 64,
    trailLength: 9,
    textureSpacing: 18,
    player: 0x4ce8d3,
    ai: 0xff688b,
    gold: 0xf2c879,
  },
};

export function validateConfig(c: GameConfig): void {
  const range = (name: string, value: number, min: number, max: number) => {
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error(
        `Invalid game configuration: ${name} must be ${min}–${max}.`,
      );
  };
  range("table.width", c.table.width, 240, 1600);
  range("table.height", c.table.height, c.table.width, c.table.width * 3.5);
  range("paddle.radius", c.paddle.radius, 10, c.table.width / 8);
  range("puck.radius", c.puck.radius, 5, c.paddle.radius);
  range(
    "goalWidth",
    c.table.goalWidth,
    c.puck.radius * 3,
    c.table.width * 0.65,
  );
  range(
    "homeInset",
    c.paddle.homeInset,
    c.paddle.radius * 2,
    c.table.height / 2 - c.paddle.radius,
  );
  range("paddle.maxSpeed", c.paddle.maxSpeed, 100, 3000);
  range("paddle.responseSeconds", c.paddle.responseSeconds, 0, 0.2);
  range("puck.maxSpeed", c.puck.maxSpeed, 100, 3000);
  range("puck.serveSpeed", c.puck.serveSpeed, 50, c.puck.maxSpeed);
  range("puck.serveAngle", c.puck.serveAngle, 0, Math.PI / 3);
  range("puck.drag", c.puck.drag, 0, 2);
  range("physics.step", c.physics.step, 1 / 480, 1 / 60);
  range("physics.maxFrame", c.physics.maxFrame, c.physics.step, 0.1);
  range("physics.separation", c.physics.separation, 0.001, 0.5);
  range("wallRestitution", c.physics.wallRestitution, 0.1, 1);
  range("paddleRestitution", c.physics.paddleRestitution, 0.1, 1);
  range("winningScore", c.match.winningScore, 1, 99);
  range("timeLimitSeconds", c.match.timeLimitSeconds, 0, 3600);
  if (!Number.isInteger(c.match.winningScore))
    throw new Error("Winning score must be an integer.");
  range("goalDelay", c.match.goalDelay, 0.2, 5);
  range("stallSpeed", c.match.stallSpeed, 0, c.puck.serveSpeed / 2);
  range("stallSeconds", c.match.stallSeconds, 2, 30);
  range("predictionHorizon", c.ai.predictionHorizon, 0.1, 3);
  range("attackOffset", c.ai.attackOffset, 0, c.paddle.radius);
  range("defensiveTracking", c.ai.defensiveTracking, 0, 1);
  range("attackZone", c.ai.attackZone, 0.2, 0.5);
  range("incomingAttackRatio", c.ai.incomingAttackRatio, 0, 1);
  range("aimAwayFactor", c.ai.aimAwayFactor, 0, 0.5);
  for (const [name, a] of Object.entries(c.ai.difficulties)) {
    range(`${name}.speed`, a.speed, 50, c.paddle.maxSpeed);
    range(`${name}.reactionSeconds`, a.reactionSeconds, 0.03, 1);
    range(`${name}.prediction`, a.prediction, 0, 1);
    range(`${name}.aimError`, a.aimError, 0, c.table.width / 3);
    range(`${name}.aggression`, a.aggression, 0, 1);
  }
  if (!c.ai.difficulties[c.match.defaultDifficulty])
    throw new Error("Unknown default difficulty.");
  range("audio.volume", c.audio.volume, 0, 1);
  range("visuals.padding", c.visuals.padding, c.puck.radius, 100);
  range("visuals.maxResolution", c.visuals.maxResolution, 1, 3);
  range("visuals.intensity", c.visuals.intensity, 0, 1);
  range("visuals.particles", c.visuals.particles, 0, 128);
  range("visuals.trailLength", c.visuals.trailLength, 0, 20);
  range("visuals.textureSpacing", c.visuals.textureSpacing, 8, 40);
  if (
    !Number.isInteger(c.visuals.particles) ||
    !Number.isInteger(c.visuals.trailLength)
  )
    throw new Error("Effect pool sizes must be integers.");
  for (const color of [c.visuals.player, c.visuals.ai, c.visuals.gold])
    range("visual color", color, 0, 0xffffff);
}
