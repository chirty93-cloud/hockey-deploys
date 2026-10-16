/** @typedef {{x:number, y:number}} Point */
/** @typedef {Point & {vx:number, vy:number}} Body */

/** Exponential drag integrated exactly for a freely moving puck.
 * Velocities are in simulation units per 60 Hz frame; elapsed time is in seconds.
 * @param {Body} puck @param {number} drag @param {number} seconds */
export function advancePuck(puck, drag, seconds) {
  const damping = Math.exp(-drag * seconds);
  const travel = drag > 0 ? -Math.expm1(-drag * seconds) / drag : seconds;
  puck.x += puck.vx * 60 * travel;
  puck.y += puck.vy * 60 * travel;
  puck.vx *= damping;
  puck.vy *= damping;
}

/** First-order pointer following, bounded by an actual speed limit; no prediction.
 * @param {Body} player @param {Point} target @param {number} responseMs
 * @param {number} maxSpeed Maximum simulation units per second.
 * @param {number} seconds */
export function movePlayer(player, target, responseMs, maxSpeed, seconds) {
  const dx = target.x - player.x, dy = target.y - player.y;
  const distance = Math.hypot(dx, dy);
  const tau = responseMs / 1000;
  // Exact integration of ds/dt = min(distance/tau, maxSpeed).
  const transitionDistance = maxSpeed * tau;
  const linearTime = tau > 0 ? Math.max(0, (distance - transitionDistance) / maxSpeed) : seconds;
  const linearTravel = Math.min(distance, maxSpeed * Math.min(seconds, linearTime));
  const remaining = distance - linearTravel;
  const exponentialTravel = tau > 0 ? remaining * -Math.expm1(-Math.max(0, seconds - linearTime) / tau) : 0;
  const travel = Math.min(distance, linearTravel + exponentialTravel);
  const fraction = distance > 0 ? travel / distance : 0;
  player.x += dx * fraction;
  player.y += dy * fraction;
  player.vx = seconds > 0 ? dx * fraction / (seconds * 60) : 0;
  player.vy = seconds > 0 ? dy * fraction / (seconds * 60) : 0;
}

/** Kinematic mallet: restitution applies to relative normal velocity only.
 * @param {Body} puck @param {Point} paddle @param {Point} paddleVelocity
 * @param {number} radius Sum of puck and paddle radii. @param {number} restitution
 * @param {number} maxSpeed Playability limit in simulation units per frame. */
export function collidePaddle(puck, paddle, paddleVelocity, radius, restitution, maxSpeed = Infinity) {
  const dx = puck.x - paddle.x, dy = puck.y - paddle.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= radius) return;
  const rx = puck.vx - paddleVelocity.x, ry = puck.vy - paddleVelocity.y;
  const relativeSpeed = Math.hypot(rx, ry);
  const nx = distance > 0 ? dx / distance : relativeSpeed > 0 ? -rx / relativeSpeed : 0;
  const ny = distance > 0 ? dy / distance : relativeSpeed > 0 ? -ry / relativeSpeed : 1;
  puck.x = paddle.x + nx * radius;
  puck.y = paddle.y + ny * radius;
  const normalVelocity = rx * nx + ry * ny;
  if (normalVelocity < 0) {
    puck.vx -= (1 + restitution) * normalVelocity * nx;
    puck.vy -= (1 + restitution) * normalVelocity * ny;
    // Limit extreme strikes, preserving direction and all ordinary impacts.
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed > maxSpeed) {
      puck.vx *= maxSpeed / speed;
      puck.vy *= maxSpeed / speed;
    }
    return -normalVelocity;
  }
  return 0;
}
