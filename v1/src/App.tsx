import { useEffect, useRef, useState, useCallback } from "react";
import { clampPlayer, fitTable, viewToTable, TABLE_PRESETS, type TablePreset } from "./tableLayout";

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const PADDLE_RADIUS = 30;
const PUCK_RADIUS = 15;
const GOAL_WIDTH = 120;
const PUCK_SPEED = 4;
const AI_SPEED = 3.5;

interface Vec2 {
  x: number;
  y: number;
}

type GameState = "menu" | "playing" | "paused" | "gameover";
type Orientation = "vertical" | "horizontal" | "auto";
type PlayerColor = "blue" | "red" | "green" | "purple" | "orange" | "cyan";
type PlayerSide = "left" | "right";

const COLORS: Record<PlayerColor, { label: string; fill: string; outline: string }> = {
  blue: { label: "Niebieski", fill: "#3498db", outline: "#2980b9" },
  red: { label: "Czerwony", fill: "#e74c3c", outline: "#c0392b" },
  green: { label: "Zielony", fill: "#2ecc71", outline: "#27ae60" },
  purple: { label: "Fioletowy", fill: "#9b59b6", outline: "#8e44ad" },
  orange: { label: "Pomarańczowy", fill: "#f39c12", outline: "#d68910" },
  cyan: { label: "Turkusowy", fill: "#1abc9c", outline: "#16a085" },
};
const AI_COLOR: Record<PlayerColor, PlayerColor> = {
  blue: "red", red: "blue", green: "purple", purple: "green", orange: "cyan", cyan: "orange",
};

function PhysicsSlider({
  id, label, value, min, max, step, display, description, onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  description: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-gray-200">{label}</label>
        <span className="text-sm tabular-nums text-cyan-300">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-cyan-400"
      />
      <p className="mt-1 text-xs leading-relaxed text-gray-400">{description}</p>
    </div>
  );
}

interface GameConfig {
  maxScore: number;
  orientation: Orientation;
  timeLimit: number; // in seconds
  playerColor: PlayerColor;
  playerSide: PlayerSide;
  tablePreset: TablePreset;
  physics: PhysicsConfig;
}

interface PhysicsConfig {
  puckFriction: number;
  puckRestitution: number;
  puckHitTransfer: number;
  playerReactionMs: number;
  playerAcceleration: number;
  playerLeadMs: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableSpaceRef = useRef<HTMLDivElement>(null);
  const [tableSize, setTableSize] = useState({ width: 0, height: 0 });
  const [gameState, setGameState] = useState<GameState>("menu");
  const [scores, setScores] = useState({ player: 0, ai: 0 });
  const [winner, setWinner] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState(300);
  const [isMobile, setIsMobile] = useState(false);
  const [currentOrientation, setCurrentOrientation] = useState<"vertical" | "horizontal">(() =>
    window.matchMedia("(orientation: landscape)").matches ? "horizontal" : "vertical"
  );

  const [config, setConfig] = useState<GameConfig>({
    maxScore: 7,
    orientation: "auto",
    timeLimit: 300,
    playerColor: "blue",
    playerSide: "left",
    tablePreset: "full",
    physics: {
      puckFriction: 0.26,
      puckRestitution: 1,
      puckHitTransfer: 1.5,
      playerReactionMs: 0,
      playerAcceleration: 24,
      playerLeadMs: 0,
    },
  });

  const gameRef = useRef({
    puck: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: PUCK_SPEED, vy: PUCK_SPEED } as Vec2 & { vx: number; vy: number },
    player: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 60, vx: 0, vy: 0 } as Vec2 & { vx: number; vy: number },
    ai: { x: CANVAS_WIDTH / 2, y: 60 } as Vec2,
    mouse: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 60 } as Vec2,
    prevMouse: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 60 } as Vec2,
    prevPlayer: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 60 } as Vec2,
    prevAi: { x: CANVAS_WIDTH / 2, y: 60 } as Vec2,
    scores: { player: 0, ai: 0 },
    animFrame: 0,
    playerHitCooldown: 0,
    aiHitCooldown: 0,
    aiHalfTimer: 0,
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    lastFrameTime: 0,
  });

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.matchMedia("(pointer: coarse)").matches || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };
    checkMobile();
  }, []);

  const effectiveOrientation = config.orientation === "auto" ? currentOrientation : config.orientation;
  const horizontal = effectiveOrientation === "horizontal";
  const canvasWidth = horizontal ? CANVAS_HEIGHT : CANVAS_WIDTH;
  const canvasHeight = horizontal ? CANVAS_WIDTH : CANVAS_HEIGHT;

  // Rotate the view only: the original physics stays on a 400 × 600 table.
  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape)");
    const update = () => setCurrentOrientation(query.matches ? "horizontal" : "vertical");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const space = tableSpaceRef.current;
    if (!space) return;
    const observer = new ResizeObserver(([entry]) => {
      setTableSize(fitTable(entry.contentRect.width, entry.contentRect.height, horizontal, config.tablePreset));
    });
    observer.observe(space);
    return () => observer.disconnect();
  }, [gameState, horizontal, config.tablePreset]);

  // Timer countdown
  useEffect(() => {
    if (gameState !== "playing") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setGameState("gameover");
          setWinner("Time's up! You lose!");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState]);

  const resetPuck = useCallback((direction: number) => {
    const g = gameRef.current;
    const cw = g.canvasWidth;
    const ch = g.canvasHeight;
    g.puck.x = cw / 2;
    g.puck.y = ch / 2;
    const angle = (Math.random() * Math.PI / 3) - Math.PI / 6;
    g.puck.vx = Math.sin(angle) * PUCK_SPEED;
    g.puck.vy = Math.cos(angle) * PUCK_SPEED * direction;
    g.aiHalfTimer = 0;
    g.playerHitCooldown = 0;
    g.aiHitCooldown = 0;
  }, []);

  const startGame = useCallback(() => {
    const g = gameRef.current;
    const cw = g.canvasWidth;
    const ch = g.canvasHeight;
    g.scores = { player: 0, ai: 0 };
    setScores({ player: 0, ai: 0 });
    const homeX = cw / 2;
    g.player.x = homeX;
    g.player.y = ch - 60;
    g.ai.x = cw / 2;
    g.ai.y = 60;
    g.mouse.x = homeX;
    g.mouse.y = ch - 60;
    g.prevMouse.x = homeX;
    g.prevMouse.y = ch - 60;
    g.player.vx = 0;
    g.player.vy = 0;
    g.prevPlayer.x = homeX;
    g.prevPlayer.y = ch - 60;
    g.prevAi.x = cw / 2;
    g.prevAi.y = 60;
    resetPuck(1);
    setTimeLeft(config.timeLimit);
    setGameState("playing");
    setWinner("");
  }, [config.timeLimit, config.playerSide, resetPuck]);

  const resetToMenu = useCallback(() => {
    setGameState("menu");
    setScores({ player: 0, ai: 0 });
    setTimeLeft(config.timeLimit);
    setWinner("");
  }, [config.timeLimit]);

  const resumeGame = useCallback(() => {
    setGameState("playing");
  }, []);

  const restartGame = useCallback(() => {
    startGame();
  }, [startGame]);

  useEffect(() => {
    if (gameState !== "playing" && gameState !== "paused") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const g = gameRef.current;
    const cw = g.canvasWidth;
    const ch = g.canvasHeight;

    const movePaddle = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const point = viewToTable(
        (clientX - rect.left) * canvas.width / rect.width,
        (clientY - rect.top) * canvas.height / rect.height,
        horizontal,
        config.playerSide
      );
      Object.assign(g.mouse, clampPlayer(point.x, point.y, cw, ch, PADDLE_RADIUS));
    };
    const handleMouseMove = (e: MouseEvent) => movePaddle(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) movePaddle(touch.clientX, touch.clientY);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("touchstart", handleTouchMove, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });

    const goalStart = cw / 2 - GOAL_WIDTH / 2;
    const goalEnd = cw / 2 + GOAL_WIDTH / 2;

    function collidePaddlePuck(paddle: Vec2, paddleVel: Vec2, isPlayer: boolean) {
      const cooldown = isPlayer ? g.playerHitCooldown : g.aiHitCooldown;

      if (cooldown > 0) return;

      const dx = g.puck.x - paddle.x;
      const dy = g.puck.y - paddle.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = PADDLE_RADIUS + PUCK_RADIUS;

      if (dist < minDist && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;

        g.puck.x = paddle.x + nx * (minDist + 3);
        g.puck.y = paddle.y + ny * (minDist + 3);

        const dot = g.puck.vx * nx + g.puck.vy * ny;
        if (dot < 0) {
          const impulseScale = 1 + config.physics.puckRestitution;
          g.puck.vx -= impulseScale * dot * nx;
          g.puck.vy -= impulseScale * dot * ny;
        }

        const impactMultiplier = config.physics.puckHitTransfer;
        g.puck.vx += paddleVel.x * impactMultiplier;
        g.puck.vy += paddleVel.y * impactMultiplier;

        let speed = Math.sqrt(g.puck.vx * g.puck.vx + g.puck.vy * g.puck.vy);
        const minSpeed = PUCK_SPEED * 1.2;
        if (speed < minSpeed) {
          g.puck.vx = (g.puck.vx / (speed || 1)) * minSpeed;
          g.puck.vy = (g.puck.vy / (speed || 1)) * minSpeed;
          speed = minSpeed;
        }

        const maxSpeed = 12;
        if (speed > maxSpeed) {
          g.puck.vx = (g.puck.vx / speed) * maxSpeed;
          g.puck.vy = (g.puck.vy / speed) * maxSpeed;
        }

        if (isPlayer) g.playerHitCooldown = 8;
        else g.aiHitCooldown = 8;
      }
    }

    function update(dtFrames: number) {
      if (gameState !== "playing") return;

      if (g.playerHitCooldown > 0) g.playerHitCooldown = Math.max(0, g.playerHitCooldown - dtFrames);
      if (g.aiHitCooldown > 0) g.aiHitCooldown = Math.max(0, g.aiHitCooldown - dtFrames);

      const pointerVelX = (g.mouse.x - g.prevMouse.x) / dtFrames;
      const pointerVelY = (g.mouse.y - g.prevMouse.y) / dtFrames;
      g.prevMouse.x = g.mouse.x;
      g.prevMouse.y = g.mouse.y;
      const pointerSpeed = Math.hypot(pointerVelX, pointerVelY);
      const cappedPointerVelX = pointerSpeed > 30 ? pointerVelX * 30 / pointerSpeed : pointerVelX;
      const cappedPointerVelY = pointerSpeed > 30 ? pointerVelY * 30 / pointerSpeed : pointerVelY;
      const leadFrames = config.physics.playerLeadMs * 60 / 1000;
      const leadX = cappedPointerVelX * leadFrames;
      const leadY = cappedPointerVelY * leadFrames;
      const leadDistance = Math.hypot(leadX, leadY);
      const leadScale = leadDistance > 60 ? 60 / leadDistance : 1;
      const playerTarget = clampPlayer(
        g.mouse.x + leadX * leadScale,
        g.mouse.y + leadY * leadScale,
        cw,
        ch,
        PADDLE_RADIUS
      );
      const dxToTarget = playerTarget.x - g.player.x;
      const dyToTarget = playerTarget.y - g.player.y;
      const reactionFrames = config.physics.playerReactionMs * 60 / 1000;
      const desiredDivisor = Math.max(dtFrames, reactionFrames);
      let desiredVelX = dxToTarget / desiredDivisor;
      let desiredVelY = dyToTarget / desiredDivisor;
      const desiredSpeed = Math.hypot(desiredVelX, desiredVelY);
      const maxPlayerSpeed = 24;
      if (desiredSpeed > maxPlayerSpeed) {
        desiredVelX *= maxPlayerSpeed / desiredSpeed;
        desiredVelY *= maxPlayerSpeed / desiredSpeed;
      }
      let changeVelX = desiredVelX - g.player.vx;
      let changeVelY = desiredVelY - g.player.vy;
      const velocityChange = Math.hypot(changeVelX, changeVelY);
      const maxVelocityChange = config.physics.playerAcceleration * dtFrames;
      if (velocityChange > maxVelocityChange) {
        changeVelX *= maxVelocityChange / velocityChange;
        changeVelY *= maxVelocityChange / velocityChange;
      }
      g.player.vx += changeVelX;
      g.player.vy += changeVelY;
      const distanceToTarget = Math.hypot(dxToTarget, dyToTarget);
      const frameTravel = Math.hypot(g.player.vx, g.player.vy) * dtFrames;
      if (distanceToTarget > 0 && frameTravel >= distanceToTarget && g.player.vx * dxToTarget + g.player.vy * dyToTarget > 0) {
        g.player.x = playerTarget.x;
        g.player.y = playerTarget.y;
        g.player.vx = 0;
        g.player.vy = 0;
      } else {
        g.player.x += g.player.vx * dtFrames;
        g.player.y += g.player.vy * dtFrames;
      }
      if (g.player.x <= PADDLE_RADIUS || g.player.x >= cw - PADDLE_RADIUS) g.player.vx = 0;
      if (g.player.y <= ch / 2 + PADDLE_RADIUS || g.player.y >= ch - PADDLE_RADIUS) g.player.vy = 0;
      g.player.x = Math.max(PADDLE_RADIUS, Math.min(cw - PADDLE_RADIUS, g.player.x));
      g.player.y = Math.max(ch / 2 + PADDLE_RADIUS, Math.min(ch - PADDLE_RADIUS, g.player.y));
      const playerVelX = (g.player.x - g.prevPlayer.x) / dtFrames;
      const playerVelY = (g.player.y - g.prevPlayer.y) / dtFrames;
      g.prevPlayer.x = g.player.x;
      g.prevPlayer.y = g.player.y;

      const aiVelX = (g.ai.x - g.prevAi.x) / dtFrames;
      const aiVelY = (g.ai.y - g.prevAi.y) / dtFrames;
      g.prevAi.x = g.ai.x;
      g.prevAi.y = g.ai.y;

      const aiTargetX = g.puck.x;
      const aiTargetY = Math.min(g.puck.y, ch / 2 - PADDLE_RADIUS);
      const aiDx = aiTargetX - g.ai.x;
      const aiDy = aiTargetY - g.ai.y;
      const aiDist = Math.sqrt(aiDx * aiDx + aiDy * aiDy);
      if (aiDist > 1) {
        g.ai.x += (aiDx / aiDist) * AI_SPEED * dtFrames;
        g.ai.y += (aiDy / aiDist) * AI_SPEED * dtFrames;
      }
      g.ai.x = Math.max(PADDLE_RADIUS, Math.min(cw - PADDLE_RADIUS, g.ai.x));
      g.ai.y = Math.max(PADDLE_RADIUS, Math.min(ch / 2 - PADDLE_RADIUS, g.ai.y));

      g.puck.x += g.puck.vx * dtFrames;
      g.puck.y += g.puck.vy * dtFrames;

      if (g.puck.y < ch / 2) {
        g.aiHalfTimer += dtFrames;
        if (g.aiHalfTimer >= 600) {
          g.scores.player++;
          setScores({ ...g.scores });
          if (g.scores.player >= config.maxScore) {
            setGameState("gameover");
            setWinner("You Win!");
            return;
          }
          g.aiHalfTimer = 0;
          resetPuck(1);
          return;
        }
      } else {
        g.aiHalfTimer = 0;
      }

      if (g.puck.x - PUCK_RADIUS < 0) {
        g.puck.x = PUCK_RADIUS;
          g.puck.vx = Math.abs(g.puck.vx) * config.physics.puckRestitution;
      }
      if (g.puck.x + PUCK_RADIUS > cw) {
        g.puck.x = cw - PUCK_RADIUS;
        g.puck.vx = -Math.abs(g.puck.vx) * config.physics.puckRestitution;
      }

      const frictionPerFrame = Math.pow(1 - config.physics.puckFriction, dtFrames / 60);
      g.puck.vx *= frictionPerFrame;
      g.puck.vy *= frictionPerFrame;

      const currentSpeed = Math.sqrt(g.puck.vx * g.puck.vx + g.puck.vy * g.puck.vy);
      if (currentSpeed < PUCK_SPEED * 0.8) {
        const angle = Math.atan2(g.puck.vy, g.puck.vx);
        g.puck.vx = Math.cos(angle) * PUCK_SPEED * 0.8;
        g.puck.vy = Math.sin(angle) * PUCK_SPEED * 0.8;
      }

      if (g.puck.y - PUCK_RADIUS < 0) {
        if (g.puck.x > goalStart && g.puck.x < goalEnd) {
          g.scores.player++;
          setScores({ ...g.scores });
          if (g.scores.player >= config.maxScore) {
            setGameState("gameover");
            setWinner("You Win!");
            return;
          }
          resetPuck(1);
          return;
        } else {
          g.puck.y = PUCK_RADIUS;
          g.puck.vy = Math.abs(g.puck.vy) * config.physics.puckRestitution;
        }
      }
      if (g.puck.y + PUCK_RADIUS > ch) {
        if (g.puck.x > goalStart && g.puck.x < goalEnd) {
          g.scores.ai++;
          setScores({ ...g.scores });
          if (g.scores.ai >= config.maxScore) {
            setGameState("gameover");
            setWinner("AI Wins!");
            return;
          }
          resetPuck(-1);
          return;
        } else {
          g.puck.y = ch - PUCK_RADIUS;
          g.puck.vy = -Math.abs(g.puck.vy) * config.physics.puckRestitution;
        }
      }

      collidePaddlePuck(g.player, { x: playerVelX, y: playerVelY }, true);
      collidePaddlePuck(g.ai, { x: aiVelX, y: aiVelY }, false);
    }

    function draw() {
      if (!ctx) return;

      // The same simulation is viewed from the selected player's side.
      if (horizontal && config.playerSide === "right") ctx.setTransform(0, -1, 1, 0, 0, CANVAS_WIDTH);
      else if (horizontal) ctx.setTransform(0, 1, -1, 0, CANVAS_HEIGHT, 0);
      else ctx.setTransform(1, 0, 0, 1, 0, 0);

      ctx.fillStyle = "#1a5c3a";
      ctx.fillRect(0, 0, cw, ch);

      ctx.strokeStyle = "#8B4513";
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, cw - 8, ch - 8);

      ctx.setLineDash([10, 10]);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, ch / 2);
      ctx.lineTo(cw, ch / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cw / 2, ch / 2, 50, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#111";
      ctx.fillRect(goalStart, 0, GOAL_WIDTH, 8);
      ctx.fillRect(goalStart, ch - 8, GOAL_WIDTH, 8);

      ctx.fillStyle = "#FFD700";
      ctx.fillRect(goalStart - 4, 0, 4, 12);
      ctx.fillRect(goalEnd, 0, 4, 12);
      ctx.fillRect(goalStart - 4, ch - 12, 4, 12);
      ctx.fillRect(goalEnd, ch - 12, 4, 12);

      if (g.aiHalfTimer > 0) {
        const progress = g.aiHalfTimer / 600;
        const barWidth = cw - 40;
        const barX = 20;
        const barY = ch / 2 - 30;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(barX, barY, barWidth, 8);
        const r = Math.floor(255 * progress);
        const gr = Math.floor(255 * (1 - progress));
        ctx.fillStyle = `rgb(${r},${gr},0)`;
        ctx.fillRect(barX, barY, barWidth * progress, 8);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, 8);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        const secondsLeft = Math.ceil((600 - g.aiHalfTimer) / 60);
        ctx.fillText(`${secondsLeft}s`, cw / 2, barY - 3);
      }

      ctx.beginPath();
      ctx.arc(g.ai.x, g.ai.y, PADDLE_RADIUS, 0, Math.PI * 2);
      const aiColors = COLORS[AI_COLOR[config.playerColor]];
      ctx.fillStyle = aiColors.fill;
      ctx.fill();
      ctx.strokeStyle = aiColors.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(g.ai.x, g.ai.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = aiColors.outline;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(g.player.x, g.player.y, PADDLE_RADIUS, 0, Math.PI * 2);
      const playerColors = COLORS[config.playerColor];
      ctx.fillStyle = playerColors.fill;
      ctx.fill();
      ctx.strokeStyle = playerColors.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(g.player.x, g.player.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = playerColors.outline;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(g.puck.x, g.puck.y, PUCK_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#222";
      ctx.fill();
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function gameLoop(now: number) {
      const dtFrames = g.lastFrameTime ? Math.max(0.25, Math.min(3, (now - g.lastFrameTime) / (1000 / 60))) : 1;
      g.lastFrameTime = now;
      if (gameState === "playing") {
        update(dtFrames);
      }
      draw();
      g.animFrame = requestAnimationFrame(gameLoop);
    }

    g.animFrame = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(g.animFrame);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("touchstart", handleTouchMove);
      canvas.removeEventListener("touchmove", handleTouchMove);
    };
  }, [gameState, config.maxScore, config.playerColor, config.playerSide, config.physics, resetPuck, horizontal]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={`bg-gray-900 flex flex-col items-center justify-center select-none p-4 ${(gameState === "playing" || gameState === "paused") ? "game-shell" : gameState === "menu" ? "setup-shell min-h-screen" : "min-h-screen"}`}>
      {gameState === "menu" && (
        <div className="setup-card bg-gray-800 p-8 rounded-lg shadow-2xl max-w-md w-full">
          <h1 className="text-3xl font-bold text-white mb-6 text-center tracking-wider">🏒 AIR HOCKEY</h1>
          
          <div className="setup-fields">
            <div>
              <label htmlFor="max-score" className="block text-gray-300 text-sm font-semibold mb-2">
                Punkty do wygranej
              </label>
              <input id="max-score"
                type="number"
                min="1"
                max="20"
                value={config.maxScore}
                onChange={(e) => setConfig({ ...config, maxScore: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="table-orientation" className="block text-gray-300 text-sm font-semibold mb-2">
                Orientacja stołu
              </label>
              <select id="table-orientation"
                value={config.orientation}
                onChange={(e) => setConfig({ ...config, orientation: e.target.value as Orientation })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="vertical">Pionowy</option>
                <option value="horizontal">Poziomy</option>
                <option value="auto">Automatyczny (wykrywanie obrotu)</option>
              </select>
              {config.orientation === "auto" && (
                <p className="text-xs text-gray-400 mt-1">Stół dostosuje się do obrotu ekranu</p>
              )}
            </div>

            <div>
              <label htmlFor="player-color" className="block text-gray-300 text-sm font-semibold mb-2">
                Kolor twojego krążka
              </label>
              <select
                id="player-color"
                value={config.playerColor}
                onChange={(e) => setConfig({ ...config, playerColor: e.target.value as PlayerColor })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                {Object.entries(COLORS).map(([color, option]) => (
                  <option key={color} value={color}>{option.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Kolor AI zmienia się automatycznie.</p>
            </div>

            <div>
              <label htmlFor="player-side" className="block text-gray-300 text-sm font-semibold mb-2">
                Strona gracza w poziomie
              </label>
              <select
                id="player-side"
                value={config.playerSide}
                onChange={(e) => setConfig({ ...config, playerSide: e.target.value as PlayerSide })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="left">Lewa połowa</option>
                <option value="right">Prawa połowa</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                W pionie zawsze grasz na dole. W poziomie grasz po wybranej stronie.
              </p>
            </div>

            <div>
              <label htmlFor="table-size" className="block text-gray-300 text-sm font-semibold mb-2">
                Rozmiar stołu
              </label>
              <select
                id="table-size"
                value={config.tablePreset}
                onChange={(e) => setConfig({ ...config, tablePreset: e.target.value as TablePreset })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                {Object.entries(TABLE_PRESETS).map(([preset, option]) => (
                  <option key={preset} value={preset}>{option.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Procent największego stołu, który mieści się na ekranie po odjęciu wyniku, przycisków i bezpiecznych marginesów.
              </p>
            </div>

            <div>
              <label htmlFor="time-limit" className="block text-gray-300 text-sm font-semibold mb-2">
                Limit czasu (minuty)
              </label>
              <input id="time-limit"
                type="number"
                min="1"
                max="60"
                value={Math.floor(config.timeLimit / 60)}
                onChange={(e) => setConfig({ ...config, timeLimit: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)) * 60 })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <details className="rounded-lg border border-gray-700 bg-gray-900/70 p-4">
              <summary className="cursor-pointer select-none text-sm font-bold text-cyan-300">
                Dynamika i sterowanie
              </summary>
              <p className="mb-4 mt-2 text-xs leading-relaxed text-gray-400">
                Zmiany działają od razu w nowej grze. Tarcie jest liczone na sekundę, a ruch paletki w klatkach symulacji 60 Hz.
              </p>
              <div className="space-y-5">
                <h2 className="border-b border-gray-700 pb-2 text-sm font-bold uppercase tracking-wide text-white">Krążek</h2>
                <PhysicsSlider
                  id="puck-friction"
                  label="Opór poślizgu"
                  min={0}
                  max={80}
                  step={1}
                  value={Math.round(config.physics.puckFriction * 100)}
                  display={`${Math.round(config.physics.puckFriction * 100)}% / s`}
                  description="Część prędkości tracona w ciągu sekundy. Więcej oznacza krótszy poślizg."
                  onChange={(value) => setConfig((current) => ({ ...current, physics: { ...current.physics, puckFriction: value / 100 } }))}
                />
                <PhysicsSlider
                  id="puck-restitution"
                  label="Sprężystość odbicia"
                  min={50}
                  max={100}
                  step={1}
                  value={Math.round(config.physics.puckRestitution * 100)}
                  display={`${Math.round(config.physics.puckRestitution * 100)}%`}
                  description="Mnożnik prędkości prostopadłej do bandy lub paletki po odbiciu. 100% zachowuje ją w całości."
                  onChange={(value) => setConfig((current) => ({ ...current, physics: { ...current.physics, puckRestitution: value / 100 } }))}
                />
                <PhysicsSlider
                  id="puck-hit-transfer"
                  label="Siła ruchu przy trafieniu"
                  min={0}
                  max={3}
                  step={0.1}
                  value={config.physics.puckHitTransfer}
                  display={`${config.physics.puckHitTransfer.toFixed(1)}×`}
                  description="Część prędkości paletki dodawana do krążka przy uderzeniu. 0× ignoruje ruch paletki."
                  onChange={(value) => setConfig((current) => ({ ...current, physics: { ...current.physics, puckHitTransfer: value } }))}
                />

                <h2 className="border-b border-gray-700 pb-2 pt-2 text-sm font-bold uppercase tracking-wide text-white">Gracz</h2>
                <PhysicsSlider
                  id="player-reaction"
                  label="Czas reakcji"
                  min={0}
                  max={150}
                  step={5}
                  value={config.physics.playerReactionMs}
                  display={config.physics.playerReactionMs === 0 ? "Natychmiast" : `${config.physics.playerReactionMs} ms`}
                  description="Czas doganiania wskaźnika: niższa wartość reaguje szybciej, wyższa daje wyczuwalne opóźnienie."
                  onChange={(value) => setConfig((current) => ({ ...current, physics: { ...current.physics, playerReactionMs: value } }))}
                />
                <PhysicsSlider
                  id="player-acceleration"
                  label="Przyspieszenie paletki"
                  min={1}
                  max={32}
                  step={1}
                  value={config.physics.playerAcceleration}
                  display={`${config.physics.playerAcceleration} px/klatkę²`}
                  description="Maksymalna zmiana prędkości w jednej klatce symulacji 60 Hz. Niżej: łagodniejszy rozbieg i wolniejsze hamowanie."
                  onChange={(value) => setConfig((current) => ({ ...current, physics: { ...current.physics, playerAcceleration: value } }))}
                />
                <PhysicsSlider
                  id="player-lead"
                  label="Wyprzedzenie ruchu"
                  min={0}
                  max={100}
                  step={5}
                  value={config.physics.playerLeadMs}
                  display={`${config.physics.playerLeadMs} ms`}
                  description="Przewiduje pozycję wskaźnika z jego prędkości. Przy gwałtownym ruchu przewidywanie jest ograniczone do 60 px."
                  onChange={(value) => setConfig((current) => ({ ...current, physics: { ...current.physics, playerLeadMs: value } }))}
                />
              </div>
            </details>

            <button
              onClick={startGame}
              className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-lg transition-colors"
            >
              START
            </button>
          </div>
        </div>
      )}

      {(gameState === "playing" || gameState === "paused") && (
        <>
          <div className="scoreboard flex items-center gap-6 mb-4">
            <div className="text-center">
              <div className="text-sm font-semibold" style={{ color: COLORS[AI_COLOR[config.playerColor]].fill }}>AI</div>
              <div className="text-white text-3xl font-bold">{scores.ai}</div>
            </div>
            <div className="text-gray-500 text-xl">vs</div>
            <div className="text-center">
              <div className="text-sm font-semibold" style={{ color: COLORS[config.playerColor].fill }}>YOU</div>
              <div className="text-white text-3xl font-bold">{scores.player}</div>
            </div>
            <div className="text-center ml-4">
              <div className="text-gray-400 text-sm font-semibold">Czas</div>
              <div className={`text-2xl font-bold ${timeLeft < 60 ? 'text-red-400' : 'text-white'}`}>
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>

          <div ref={tableSpaceRef} className="table-space">
          <div className="relative" style={tableSize.width > 0 ? tableSize : undefined}>
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              aria-label={`Stół do air hockey. Steruj krążkiem ${COLORS[config.playerColor].label.toLowerCase()} myszką lub dotykiem.`}
              className="game-canvas rounded-lg shadow-2xl cursor-none"
            />

            {gameState === "paused" && (
              <div className="pause-overlay absolute inset-0 bg-black/80 flex flex-col items-center justify-center rounded-lg">
                <div className="pause-title text-4xl font-bold text-white mb-6">PAUZA</div>
                <div className="pause-actions space-y-3 w-64">
                  <button
                    onClick={resumeGame}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors"
                  >
                    Wznów grę
                  </button>
                  <button
                    onClick={restartGame}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
                  >
                    Restart (te same ustawienia)
                  </button>
                  <button
                    onClick={() => {
                      setGameState("menu");
                      setScores({ player: 0, ai: 0 });
                      setTimeLeft(config.timeLimit);
                      setWinner("");
                    }}
                    className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-lg transition-colors"
                  >
                    Nowe ustawienia
                  </button>
                  <button
                    onClick={resetToMenu}
                    className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors"
                  >
                    Przerwij grę
                  </button>
                </div>
              </div>
            )}

            {gameState === "playing" && (
              <button
                onClick={() => setGameState("paused")}
                className="absolute top-4 right-4 px-4 py-2 bg-gray-800/80 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors"
              >
                ⏸️ Pauza
              </button>
            )}
          </div>

          </div>

          <p className="game-help text-gray-400 text-sm mt-4">
            {isMobile ? "Przesuwaj palcem, aby kontrolować" : "Poruszaj myszką, aby kontrolować"} <span className="font-semibold" style={{ color: COLORS[config.playerColor].fill }}>{COLORS[config.playerColor].label.toLowerCase()} krążek</span> • Pierwszy do {config.maxScore} wygrywa!
          </p>
        </>
      )}

      {gameState === "gameover" && (
        <div className="bg-gray-800 p-8 rounded-lg shadow-2xl max-w-md w-full text-center">
          <div className="text-4xl font-bold text-white mb-4">{winner}</div>
          <div className="text-2xl text-gray-300 mb-6">
            {scores.player} - {scores.ai}
          </div>
          <div className="space-y-3">
            <button
              onClick={restartGame}
              className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-lg transition-colors"
            >
              Zagraj ponownie
            </button>
            <button
              onClick={resetToMenu}
              className="w-full py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg text-lg transition-colors"
            >
              Menu główne
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
