import type { GameConfig } from '../config/game.ts';
import { clamp, constrain } from './physics.ts';
import type { GameState, Point } from './types.ts';

/** Fold an unbounded trajectory into the rink, including any number of bounces. */
export function reflectedX(x: number, minimum: number, maximum: number): number {
  const width = maximum - minimum;
  const position = (((x - minimum) % (width * 2)) + width * 2) % (width * 2);
  return minimum + (position <= width ? position : width * 2 - position);
}

export class AIController {
  readonly target: Point = { x: 0, y: 0 };
  private remaining = 0;
  private config: GameConfig;
  private random: () => number;

  constructor(config: GameConfig, random: () => number) {
    this.config = config;
    this.random = random;
    this.reset();
  }

  reset(): void {
    this.target.x = this.config.table.width / 2;
    this.target.y = this.config.paddle.homeInset;
    this.remaining = 0;
  }

  update(state: GameState, dt: number): void {
    this.remaining -= dt;
    if (this.remaining > 0) return;
    const c = this.config,
      d = c.ai.difficulties[state.difficulty],
      puck = state.puck;
    this.remaining = d.reactionSeconds;
    const middle = c.table.width / 2,
      defense = c.paddle.homeInset;
    let x = middle + (puck.x - middle) * c.ai.defensiveTracking,
      y = defense;
    if (puck.vy < -1) {
      const time = clamp((defense - puck.y) / puck.vy, 0, c.ai.predictionHorizon);
      const predicted = reflectedX(
        puck.x + puck.vx * time,
        c.puck.radius,
        c.table.width - c.puck.radius,
      );
      x = puck.x + (predicted - puck.x) * d.prediction;
    }
    if (
      puck.y < c.table.height * c.ai.attackZone &&
      (puck.vy > -c.puck.serveSpeed * c.ai.incomingAttackRatio || puck.y < defense)
    ) {
      // Approach behind the puck and strike toward the human's goal, away from their mallet.
      const shotOffset = clamp(
        (state.player.x - middle) * c.ai.aimAwayFactor,
        -c.paddle.radius / 2,
        c.paddle.radius / 2,
      );
      x = puck.x + shotOffset;
      y = puck.y - c.paddle.radius - c.puck.radius + c.ai.attackOffset * d.aggression;
    }
    this.target.x = x + (this.random() * 2 - 1) * d.aimError;
    this.target.y = y;
    constrain(this.target, 'ai', c);
  }
}
