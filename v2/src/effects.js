/** @typedef {{x:number,y:number,vx:number,vy:number,age:number,life:number,size:number,color:string}} Particle */
/** @typedef {{x:number,y:number,age:number,life:number,color:string,goal:boolean}} Burst */

/** Visuals share table coordinates with the physics, but never modify game state.
 * @param {{wallDuration:number,goalDuration:number,maxParticles:number}} options
 * @param {boolean} reducedMotion */
export function createGameEffects(options, reducedMotion = false) {
  /** @type {Particle[]} */
  let particles = [];
  /** @type {Burst[]} */
  let bursts = [];
  const limit = Math.max(0, Math.floor(options.maxParticles));
  function emit(x, y, nx, ny, strength, color, goal) {
    const life = goal ? options.goalDuration : options.wallDuration;
    bursts.push({ x, y, age: 0, life, color, goal });
    if (bursts.length > 12) bursts.shift();
    if (reducedMotion) return;
    const count = goal ? 24 : Math.round(4 + strength * 5);
    for (let i = 0; i < count; i++) {
      const spread = (i / Math.max(1, count - 1) - 0.5) * Math.PI * 0.85;
      const speed = (goal ? 100 : 45) + strength * 70 + (i % 3) * 14;
      const cos = Math.cos(spread), sin = Math.sin(spread);
      particles.push({ x, y, vx: (nx * cos - ny * sin) * speed,
        vy: (nx * sin + ny * cos) * speed, age: 0,
        life: life * (0.65 + (i % 4) * 0.1), size: goal ? 2.5 : 1.5, color });
    }
    if (particles.length > limit) particles.splice(0, particles.length - limit);
  }
  return {
    /** @param {number} x @param {number} y @param {number} nx @param {number} ny
     * @param {number} speed @param {string} color */
    wall(x, y, nx, ny, speed, color) {
      if (speed > 0) emit(x, y, nx, ny, Math.min(1, speed / 12), color, false);
    },
    /** @param {number} x @param {number} y @param {number} inwardY @param {string} color */
    goal(x, y, inwardY, color) { emit(x, y, 0, inwardY, 1, color, true); },
    /** @param {number} seconds */
    update(seconds) {
      const dt = Math.max(0, seconds);
      for (const p of particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      for (const burst of bursts) burst.age += dt;
      particles = particles.filter(p => p.age < p.life);
      bursts = bursts.filter(burst => burst.age < burst.life);
    },
    /** @param {CanvasRenderingContext2D} ctx @param {number} width @param {number} height */
    draw(ctx, width, height) {
      if (!bursts.length && !particles.length) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(8, 8, width - 16, height - 16); ctx.clip();
      for (const burst of bursts) {
        const progress = burst.age / burst.life;
        ctx.globalAlpha = (1 - progress) * (reducedMotion ? 0.3 : 0.65);
        ctx.strokeStyle = burst.color;
        ctx.lineWidth = burst.goal ? 4 : 2;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, reducedMotion ? 12 : 8 + progress * (burst.goal ? 95 : 24), 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const p of particles) {
        ctx.globalAlpha = 1 - p.age / p.life;
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); ctx.stroke();
      }
      ctx.restore();
    },
    clear() { particles = []; bursts = []; },
  };
}
