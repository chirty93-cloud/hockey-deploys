// Visuals only. All positions and radii use the existing simulation coordinates.
type Point = { x: number; y: number };
type Puck = Point & { vx: number; vy: number };
type Paint = string | CanvasGradient;

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, paint: Paint) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = paint;
  ctx.fill();
}

function metal(ctx: CanvasRenderingContext2D, size: number) {
  const gradient = ctx.createLinearGradient(-size, -size, size, size);
  [[0, "#e9f2ff"], [0.22, "#8593a7"], [0.42, "#f6faff"], [0.55, "#475165"], [0.8, "#b7bdc9"], [1, "#293345"]].forEach(([stop, color]) =>
    gradient.addColorStop(Number(stop), String(color)));
  return gradient;
}

function sprite(radius: number, color?: string) {
  const padding = 8;
  const size = (radius + padding) * 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  ctx.scale(2, 2);
  ctx.translate(size / 2, size / 2);
  ctx.shadowColor = "#000b";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  circle(ctx, 0, 0, radius, metal(ctx, radius));
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  circle(ctx, 0, 0, radius - 2, "#091220");
  ctx.strokeStyle = color ?? "#c5f6ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius - 3, 0, Math.PI * 2);
  ctx.stroke();
  if (color) {
    circle(ctx, 0, -1, radius * 0.75, metal(ctx, radius));
    const dome = ctx.createRadialGradient(-radius * 0.2, -radius * 0.3, 1, 0, 0, radius * 0.58);
    dome.addColorStop(0, "#eaffff");
    dome.addColorStop(0.25, color);
    dome.addColorStop(0.72, color);
    dome.addColorStop(1, "#101a2c");
    circle(ctx, 0, -2, radius * 0.59, dome);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-radius * 0.16, -radius * 0.32, radius * 0.19, radius * 0.08, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    const face = ctx.createLinearGradient(0, -radius, 0, radius);
    face.addColorStop(0, "#35465e");
    face.addColorStop(0.45, "#131e2d");
    face.addColorStop(1, "#03070e");
    circle(ctx, 0, 0, radius - 4, face);
    ctx.strokeStyle = "#71879d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius - 6, Math.PI * 1.1, Math.PI * 1.8);
    ctx.stroke();
  }
  return { canvas, size };
}

export function createRinkArtwork(
  width: number, height: number, goalWidth: number,
  paddleRadius: number, puckRadius: number, playerColor: string, aiColor: string,
) {
  // Cache the perforated surface and shaded pieces once, outside the frame loop.
  const board = document.createElement("canvas");
  board.width = width;
  board.height = height;
  const ctx = board.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const surface = ctx.createRadialGradient(width * 0.35, height * 0.45, 20, width / 2, height / 2, height * 0.7);
  surface.addColorStop(0, "#253d53");
  surface.addColorStop(0.6, "#142438");
  surface.addColorStop(1, "#080f1b");
  ctx.fillStyle = surface;
  ctx.fillRect(0, 0, width, height);
  for (let y = 18; y < height - 12; y += 14) {
    for (let x = 18; x < width - 12; x += 14) {
      circle(ctx, x, y + 1, 1.2, "#ffffff12");
      circle(ctx, x, y, 1.1, "#050c18aa");
    }
  }
  ctx.strokeStyle = "#b7c9de66";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([9, 9]);
  ctx.beginPath();
  ctx.moveTo(8, height / 2);
  ctx.lineTo(width - 8, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 50, 0, Math.PI * 2);
  ctx.stroke();
  circle(ctx, width / 2, height / 2, 3, "#b7c9de99");
  // Thin rails preserve the existing playable bounds and goal openings.
  ctx.strokeStyle = metal(ctx, height);
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, width - 6, height - 6);
  ctx.strokeStyle = "#030710";
  ctx.lineWidth = 2;
  ctx.strokeRect(7, 7, width - 14, height - 14);
  for (const [bottom, color] of [[false, aiColor], [true, playerColor]] as const) {
    ctx.save();
    ctx.translate(width / 2, bottom ? height : 0);
    if (bottom) ctx.rotate(Math.PI);
    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, goalWidth * 0.75);
    glow.addColorStop(0, color + "40");
    glow.addColorStop(1, color + "00");
    ctx.fillStyle = glow;
    ctx.fillRect(-goalWidth, 0, goalWidth * 2, goalWidth);
    ctx.fillStyle = "#060c17";
    ctx.fillRect(-goalWidth / 2, 0, goalWidth, 8);
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-goalWidth / 2, 0);
    ctx.lineTo(-goalWidth / 2, 14);
    ctx.bezierCurveTo(-goalWidth / 2, 62, goalWidth / 2, 62, goalWidth / 2, 14);
    ctx.lineTo(goalWidth / 2, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ecfbff";
    ctx.fillRect(-goalWidth / 2 - 2, 0, 4, 10);
    ctx.fillRect(goalWidth / 2 - 2, 0, 4, 10);
    ctx.restore();
  }
  const playerSprite = sprite(paddleRadius, playerColor);
  const aiSprite = sprite(paddleRadius, aiColor);
  const puckSprite = sprite(puckRadius);
  const paintSprite = (target: CanvasRenderingContext2D, art: ReturnType<typeof sprite>, point: Point) =>
    target.drawImage(art.canvas, point.x - art.size / 2, point.y - art.size / 2, art.size, art.size);

  return {
    board,
    drawPieces(target: CanvasRenderingContext2D, player: Point, ai: Point, puck: Puck, showTrail: boolean) {
      target.save();
      const speed = Math.hypot(puck.vx, puck.vy);
      if (showTrail && speed > 2) {
        // A short velocity cue, not a second simulated object.
        const length = Math.min(42, speed * 2);
        const x = puck.x - puck.vx / speed * length;
        const y = puck.y - puck.vy / speed * length;
        const trail = target.createLinearGradient(x, y, puck.x, puck.y);
        trail.addColorStop(0, "#00d9ff00");
        trail.addColorStop(1, "#00d9ff66");
        target.strokeStyle = trail;
        target.lineWidth = puckRadius;
        target.lineCap = "round";
        target.beginPath();
        target.moveTo(x, y);
        target.lineTo(puck.x, puck.y);
        target.stroke();
      }
      paintSprite(target, aiSprite, ai);
      paintSprite(target, playerSprite, player);
      paintSprite(target, puckSprite, puck);
      target.restore();
    },
  };
}
