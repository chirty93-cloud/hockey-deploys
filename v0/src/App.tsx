import { useEffect, useRef, useState, useCallback } from "react";

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

interface GameConfig {
  maxScore: number;
  orientation: Orientation;
  timeLimit: number; // in seconds
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>("menu");
  const [scores, setScores] = useState({ player: 0, ai: 0 });
  const [winner, setWinner] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState(300);
  const [isMobile, setIsMobile] = useState(false);
  const [currentOrientation, setCurrentOrientation] = useState<"vertical" | "horizontal">("vertical");

  const [config, setConfig] = useState<GameConfig>({
    maxScore: 7,
    orientation: "vertical",
    timeLimit: 300,
  });

  const gameRef = useRef({
    puck: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: PUCK_SPEED, vy: PUCK_SPEED } as Vec2 & { vx: number; vy: number },
    player: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 60 } as Vec2,
    ai: { x: CANVAS_WIDTH / 2, y: 60 } as Vec2,
    mouse: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 60 } as Vec2,
    prevPlayer: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 60 } as Vec2,
    prevAi: { x: CANVAS_WIDTH / 2, y: 60 } as Vec2,
    scores: { player: 0, ai: 0 },
    animFrame: 0,
    playerHitCooldown: 0,
    aiHitCooldown: 0,
    aiHalfTimer: 0,
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
  });

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };
    checkMobile();
  }, []);

  // Handle orientation change for mobile
  useEffect(() => {
    if (!isMobile || config.orientation !== "auto") return;

    const handleOrientationChange = () => {
      const orientation = window.innerWidth > window.innerHeight ? "horizontal" : "vertical";
      setCurrentOrientation(orientation);
      if (gameState === "playing") {
        setGameState("paused");
      }
    };

    window.addEventListener("resize", handleOrientationChange);
    window.addEventListener("orientationchange", handleOrientationChange);

    // Initial check
    handleOrientationChange();

    return () => {
      window.removeEventListener("resize", handleOrientationChange);
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, [isMobile, config.orientation, gameState]);

  // Update canvas dimensions based on orientation
  useEffect(() => {
    const orientation = config.orientation === "auto" ? currentOrientation : config.orientation;
    if (orientation === "horizontal") {
      gameRef.current.canvasWidth = CANVAS_HEIGHT;
      gameRef.current.canvasHeight = CANVAS_WIDTH;
    } else {
      gameRef.current.canvasWidth = CANVAS_WIDTH;
      gameRef.current.canvasHeight = CANVAS_HEIGHT;
    }
  }, [config.orientation, currentOrientation]);

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
    g.player.x = cw / 2;
    g.player.y = ch - 60;
    g.ai.x = cw / 2;
    g.ai.y = 60;
    g.mouse.x = cw / 2;
    g.mouse.y = ch - 60;
    g.prevPlayer.x = cw / 2;
    g.prevPlayer.y = ch - 60;
    g.prevAi.x = cw / 2;
    g.prevAi.y = 60;
    resetPuck(1);
    setTimeLeft(config.timeLimit);
    setGameState("playing");
    setWinner("");
  }, [config.timeLimit, resetPuck]);

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

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = cw / rect.width;
      const scaleY = ch / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      g.mouse.x = Math.max(PADDLE_RADIUS, Math.min(cw - PADDLE_RADIUS, mx));
      g.mouse.y = Math.max(ch / 2 + PADDLE_RADIUS, Math.min(ch - PADDLE_RADIUS, my));
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const scaleX = cw / rect.width;
      const scaleY = ch / rect.height;
      const touch = e.touches[0];
      const mx = (touch.clientX - rect.left) * scaleX;
      const my = (touch.clientY - rect.top) * scaleY;
      g.mouse.x = Math.max(PADDLE_RADIUS, Math.min(cw - PADDLE_RADIUS, mx));
      g.mouse.y = Math.max(ch / 2 + PADDLE_RADIUS, Math.min(ch - PADDLE_RADIUS, my));
    };

    canvas.addEventListener("mousemove", handleMouseMove);
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
          g.puck.vx = g.puck.vx - 2 * dot * nx;
          g.puck.vy = g.puck.vy - 2 * dot * ny;
        }

        const impactMultiplier = 1.5;
        g.puck.vx += paddleVel.x * impactMultiplier;
        g.puck.vy += paddleVel.y * impactMultiplier;

        const speed = Math.sqrt(g.puck.vx * g.puck.vx + g.puck.vy * g.puck.vy);
        const minSpeed = PUCK_SPEED * 1.2;
        if (speed < minSpeed) {
          g.puck.vx = (g.puck.vx / (speed || 1)) * minSpeed;
          g.puck.vy = (g.puck.vy / (speed || 1)) * minSpeed;
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

    function update() {
      if (gameState !== "playing") return;

      if (g.playerHitCooldown > 0) g.playerHitCooldown--;
      if (g.aiHitCooldown > 0) g.aiHitCooldown--;

      const playerVelX = g.mouse.x - g.prevPlayer.x;
      const playerVelY = g.mouse.y - g.prevPlayer.y;
      g.prevPlayer.x = g.player.x;
      g.prevPlayer.y = g.player.y;

      g.player.x = g.mouse.x;
      g.player.y = g.mouse.y;

      const aiVelX = g.ai.x - g.prevAi.x;
      const aiVelY = g.ai.y - g.prevAi.y;
      g.prevAi.x = g.ai.x;
      g.prevAi.y = g.ai.y;

      const aiTargetX = g.puck.x;
      const aiTargetY = Math.min(g.puck.y, ch / 2 - PADDLE_RADIUS);
      const aiDx = aiTargetX - g.ai.x;
      const aiDy = aiTargetY - g.ai.y;
      const aiDist = Math.sqrt(aiDx * aiDx + aiDy * aiDy);
      if (aiDist > 1) {
        g.ai.x += (aiDx / aiDist) * AI_SPEED;
        g.ai.y += (aiDy / aiDist) * AI_SPEED;
      }
      g.ai.x = Math.max(PADDLE_RADIUS, Math.min(cw - PADDLE_RADIUS, g.ai.x));
      g.ai.y = Math.max(PADDLE_RADIUS, Math.min(ch / 2 - PADDLE_RADIUS, g.ai.y));

      g.puck.x += g.puck.vx;
      g.puck.y += g.puck.vy;

      if (g.puck.y < ch / 2) {
        g.aiHalfTimer++;
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
        g.puck.vx = Math.abs(g.puck.vx);
      }
      if (g.puck.x + PUCK_RADIUS > cw) {
        g.puck.x = cw - PUCK_RADIUS;
        g.puck.vx = -Math.abs(g.puck.vx);
      }

      const friction = 0.995;
      g.puck.vx *= friction;
      g.puck.vy *= friction;

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
          g.puck.vy = Math.abs(g.puck.vy);
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
          g.puck.vy = -Math.abs(g.puck.vy);
        }
      }

      collidePaddlePuck(g.player, { x: playerVelX, y: playerVelY }, true);
      collidePaddlePuck(g.ai, { x: aiVelX, y: aiVelY }, false);
    }

    function draw() {
      if (!ctx) return;

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
      ctx.fillStyle = "#e74c3c";
      ctx.fill();
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(g.ai.x, g.ai.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#c0392b";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(g.player.x, g.player.y, PADDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#3498db";
      ctx.fill();
      ctx.strokeStyle = "#2980b9";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(g.player.x, g.player.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#2980b9";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(g.puck.x, g.puck.y, PUCK_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#222";
      ctx.fill();
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function gameLoop() {
      if (gameState === "playing") {
        update();
      }
      draw();
      g.animFrame = requestAnimationFrame(gameLoop);
    }

    g.animFrame = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(g.animFrame);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("touchmove", handleTouchMove);
    };
  }, [gameState, config.maxScore, resetPuck]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const effectiveOrientation = config.orientation === "auto" ? currentOrientation : config.orientation;
  const canvasWidth = effectiveOrientation === "horizontal" ? CANVAS_HEIGHT : CANVAS_WIDTH;
  const canvasHeight = effectiveOrientation === "horizontal" ? CANVAS_WIDTH : CANVAS_HEIGHT;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center select-none p-4">
      {gameState === "menu" && (
        <div className="bg-gray-800 p-8 rounded-lg shadow-2xl max-w-md w-full">
          <h1 className="text-3xl font-bold text-white mb-6 text-center tracking-wider">🏒 AIR HOCKEY</h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-gray-300 text-sm font-semibold mb-2">
                Punkty do wygranej
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={config.maxScore}
                onChange={(e) => setConfig({ ...config, maxScore: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-semibold mb-2">
                Orientacja stołu
              </label>
              <select
                value={config.orientation}
                onChange={(e) => setConfig({ ...config, orientation: e.target.value as Orientation })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="vertical">Pionowy</option>
                <option value="horizontal">Poziomy</option>
                {isMobile && <option value="auto">Automatyczny (wykrywanie obrotu)</option>}
              </select>
              {isMobile && config.orientation === "auto" && (
                <p className="text-xs text-gray-400 mt-1">Stół dostosuje się do obrotu ekranu</p>
              )}
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-semibold mb-2">
                Limit czasu (minuty)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={Math.floor(config.timeLimit / 60)}
                onChange={(e) => setConfig({ ...config, timeLimit: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)) * 60 })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

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
          <div className="flex items-center gap-6 mb-4">
            <div className="text-center">
              <div className="text-red-400 text-sm font-semibold">AI</div>
              <div className="text-white text-3xl font-bold">{scores.ai}</div>
            </div>
            <div className="text-gray-500 text-xl">vs</div>
            <div className="text-center">
              <div className="text-blue-400 text-sm font-semibold">YOU</div>
              <div className="text-white text-3xl font-bold">{scores.player}</div>
            </div>
            <div className="text-center ml-4">
              <div className="text-gray-400 text-sm font-semibold">Czas</div>
              <div className={`text-2xl font-bold ${timeLeft < 60 ? 'text-red-400' : 'text-white'}`}>
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>

          <div className="relative">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="rounded-lg shadow-2xl border-4 border-amber-900 cursor-none max-h-[70vh] w-auto"
            />

            {gameState === "paused" && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center rounded-lg">
                <div className="text-4xl font-bold text-white mb-6">PAUZA</div>
                <div className="space-y-3 w-64">
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

          <p className="text-gray-400 text-sm mt-4">
            Poruszaj myszką aby kontrolować <span className="text-blue-400 font-semibold">niebieski paddle</span> • Pierwszy do {config.maxScore} wygrywa!
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
