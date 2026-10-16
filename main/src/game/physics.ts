import type { GameConfig } from '../config/game.ts';
import type { Body, Point, Side } from './types.ts';

export const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

export function constrain(point: Point, side: Side, c: GameConfig): void {
  const r = c.paddle.radius;
  point.x = clamp(Number.isFinite(point.x) ? point.x : c.table.width / 2, r, c.table.width - r);
  point.y = clamp(
    Number.isFinite(point.y) ? point.y : c.table.height / 2,
    side === 'player' ? c.table.height / 2 + r : r,
    side === 'player' ? c.table.height - r : c.table.height / 2 - r,
  );
}

/** Exact integration of a speed-limited, first-order pointer follower. */
export function movePaddle(
  body: Body,
  target: Point,
  speed: number,
  response: number,
  dt: number,
): void {
  if (dt <= 0) return;
  const dx = target.x - body.x,
    dy = target.y - body.y;
  const distance = Math.hypot(dx, dy);
  const linearTime = response > 0 ? Math.max(0, (distance - speed * response) / speed) : dt;
  const linear = Math.min(distance, speed * Math.min(dt, linearTime));
  const rest =
    response > 0 ? (distance - linear) * -Math.expm1(-Math.max(0, dt - linearTime) / response) : 0;
  const fraction = distance > 0 ? Math.min(distance, linear + rest) / distance : 0;
  body.vx = (dx * fraction) / dt;
  body.vy = (dy * fraction) / dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
}

export function capSpeed(body: Body, maximum: number): void {
  const speed = Math.hypot(body.vx, body.vy);
  if (!Number.isFinite(speed)) {
    body.vx = body.vy = 0;
    return;
  }
  if (speed > maximum) {
    body.vx *= maximum / speed;
    body.vy *= maximum / speed;
  }
  if (speed < 0.001) body.vx = body.vy = 0;
}

export function integratePuck(puck: Body, drag: number, dt: number): void {
  const damping = Math.exp(-drag * dt);
  const distance = drag > 0 ? -Math.expm1(-drag * dt) / drag : dt;
  puck.x += puck.vx * distance;
  puck.y += puck.vy * distance;
  puck.vx *= damping;
  puck.vy *= damping;
}

/** Impulse on relative normal velocity; separating contacts receive no energy. */
export function collidePaddle(puck: Body, paddle: Body, c: GameConfig): number {
  const dx = puck.x - paddle.x,
    dy = puck.y - paddle.y;
  const radius = c.puck.radius + c.paddle.radius;
  const distance = Math.hypot(dx, dy);
  if (distance >= radius) return 0;
  const vx = puck.vx - paddle.vx,
    vy = puck.vy - paddle.vy;
  const speed = Math.hypot(vx, vy);
  const nx = distance > 1e-8 ? dx / distance : speed > 1e-8 ? -vx / speed : 0;
  const ny = distance > 1e-8 ? dy / distance : speed > 1e-8 ? -vy / speed : 1;
  puck.x = paddle.x + nx * (radius + c.physics.separation);
  puck.y = paddle.y + ny * (radius + c.physics.separation);
  const normal = vx * nx + vy * ny;
  if (normal >= 0) return 0;
  puck.vx -= (1 + c.physics.paddleRestitution) * normal * nx;
  puck.vy -= (1 + c.physics.paddleRestitution) * normal * ny;
  capSpeed(puck, c.puck.maxSpeed);
  return -normal;
}

/** The entire puck must fit the opening and cross the back edge to score. */
export function collideRink(
  puck: Body,
  c: GameConfig,
  onWall: (x: number, y: number, speed: number) => void = () => {},
): Side | null {
  const { width, height, goalWidth } = c.table;
  const r = c.puck.radius,
    restitution = c.physics.wallRestitution;
  if (puck.x < r) {
    puck.x = r;
    if (puck.vx < 0) {
      onWall(0, puck.y, -puck.vx);
      puck.vx *= -restitution;
    }
  } else if (puck.x > width - r) {
    puck.x = width - r;
    if (puck.vx > 0) {
      onWall(width, puck.y, puck.vx);
      puck.vx *= -restitution;
    }
  }
  const fitsGoal = Math.abs(puck.x - width / 2) <= goalWidth / 2 - r;
  if (fitsGoal && puck.y <= -r && puck.vy < 0) return 'player';
  if (fitsGoal && puck.y >= height + r && puck.vy > 0) return 'ai';
  const leftPost = (width - goalWidth) / 2;
  const rightPost = (width + goalWidth) / 2;
  const insideOpening = puck.x > leftPost && puck.x < rightPost;
  if (insideOpening) {
    // Inside the opening, the closest point on an end rail is its tip.
    // Resolve that circular contact instead of snapping to a flat end wall.
    const postX = puck.x < width / 2 ? leftPost : rightPost;
    const postY = puck.y < height / 2 ? 0 : height;
    const dx = puck.x - postX, dy = puck.y - postY;
    const distance = Math.hypot(dx, dy);
    if (distance < r) {
      const nx = dx / distance, ny = dy / distance;
      puck.x = postX + nx * (r + c.physics.separation);
      puck.y = postY + ny * (r + c.physics.separation);
      const normal = puck.vx * nx + puck.vy * ny;
      if (normal < 0) {
        onWall(postX, postY, -normal);
        puck.vx -= (1 + restitution) * normal * nx;
        puck.vy -= (1 + restitution) * normal * ny;
      }
    }
  } else if (puck.y < r) {
    puck.y = r;
    if (puck.vy < 0) {
      onWall(puck.x, 0, -puck.vy);
      puck.vy *= -restitution;
    }
  } else if (puck.y > height - r) {
    puck.y = height - r;
    if (puck.vy > 0) {
      onWall(puck.x, height, puck.vy);
      puck.vy *= -restitution;
    }
  }
  return null;
}
