import { useEffect, useRef, useState, useCallback } from "react";
import { createGameEffects } from "./effects.js";
import { createRinkArtwork } from "./rinkArtwork";
import { clampPlayer, fitTable, viewToTable, resolveAspect, tableDimensions, TABLE_PRESETS, type TablePreset } from "./tableLayout";
import settings, { DEFAULT_CONFIG, COLORS, AI_COLOR, PHYSICS_KEYS, type GameConfig, type Orientation, type AspectRatio, type PlayerColor, type PlayerSide } from "./gameConfig";
import { createGameAudio, readSoundPreference, saveSoundPreference } from "./audio.js";
import { advancePuck, movePlayer, collidePaddle } from "./physics.js";

const CANVAS_WIDTH = settings.table.shortEdge;
const CANVAS_HEIGHT = CANVAS_WIDTH * 4 / 3;
const PADDLE_RADIUS = settings.table.paddleRadius;
const PUCK_RADIUS = settings.table.puckRadius;
const GOAL_WIDTH = settings.table.goalWidth;
const HOME_OFFSET = settings.table.homeOffset;
const PUCK_SPEED = settings.gameplay.serveSpeed / 60;
const AI_SPEED = settings.gameplay.aiSpeed / 60;
const AI_HALF_FRAMES = settings.gameplay.aiHalfTimeoutSeconds * 60;

interface Vec2 {
  x: number;
  y: number;
}

type GameState = "menu" | "playing" | "paused" | "gameover";
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

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableSpaceRef = useRef<HTMLDivElement>(null);
  const [tableSize, setTableSize] = useState({ width: 0, height: 0 });
  const [gameState, setGameState] = useState<GameState>("menu");
  const [scores, setScores] = useState({ player: 0, ai: 0 });
  const [goalNotice, setGoalNotice] = useState<{ playerScored: boolean; id: number; isGoal: boolean } | null>(null);
  const [winner, setWinner] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState(DEFAULT_CONFIG.timeLimit);
  const [isMobile, setIsMobile] = useState(false);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [config, setConfig] = useState<GameConfig>(() => ({
    ...DEFAULT_CONFIG, physics: { ...DEFAULT_CONFIG.physics },
    soundEnabled: readSoundPreference(DEFAULT_CONFIG.soundEnabled),
  }));

  const [sound] = useState(() => createGameAudio(config.soundEnabled, settings.audio.volume));
  useEffect(() => () => sound.dispose(), [sound]);
  useEffect(() => {
    if (gameState === "paused" || gameState === "menu") sound.silence();
  }, [gameState, sound]);

  const toggleSound = useCallback(() => {
    const next = !config.soundEnabled;
    sound.setEnabled(next);
    if (next) void sound.unlock();
    saveSoundPreference(next);
    setConfig((current) => ({ ...current, soundEnabled: next }));
  }, [config.soundEnabled, sound]);

  useEffect(() => {
    if (!goalNotice) return;
    const timer = window.setTimeout(() => setGoalNotice(null), settings.effects.noticeMs);
    return () => window.clearTimeout(timer);
  }, [goalNotice]);

  const gameRef = useRef({
    puck: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: PUCK_SPEED, vy: PUCK_SPEED } as Vec2 & { vx: number; vy: number },
    player: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - HOME_OFFSET, vx: 0, vy: 0 } as Vec2 & { vx: number; vy: number },
    ai: { x: CANVAS_WIDTH / 2, y: HOME_OFFSET } as Vec2,
    mouse: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - HOME_OFFSET } as Vec2,
    scores: { player: 0, ai: 0 },
    animFrame: 0,
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

  const currentOrientation = viewport.width > viewport.height ? "horizontal" : "vertical";
  const effectiveOrientation = config.orientation === "auto" ? currentOrientation : config.orientation;
  const horizontal = effectiveOrientation === "horizontal";
  const activeAspect = resolveAspect(config.aspectRatio, viewport.width, viewport.height);
  const { width: tableWidth, height: tableHeight } = tableDimensions(activeAspect, CANVAS_WIDTH);
  const canvasWidth = horizontal ? tableHeight : tableWidth;
  const canvasHeight = horizontal ? tableWidth : tableHeight;

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, []);

  // Change the field geometry, never stretch a circular puck into an ellipse.
  // Preserve relative positions on resize; portrait always retains the bottom half.
  useEffect(() => {
    const g = gameRef.current;
    const scaleX = tableWidth / g.canvasWidth;
    const scaleY = tableHeight / g.canvasHeight;
    for (const body of [g.player, g.ai, g.puck, g.mouse]) {
      body.x *= scaleX;
      body.y *= scaleY;
    }
    g.canvasWidth = tableWidth;
    g.canvasHeight = tableHeight;
    Object.assign(g.player, clampPlayer(g.player.x, g.player.y, tableWidth, tableHeight, PADDLE_RADIUS));
    Object.assign(g.mouse, clampPlayer(g.mouse.x, g.mouse.y, tableWidth, tableHeight, PADDLE_RADIUS));
    g.ai.x = Math.max(PADDLE_RADIUS, Math.min(tableWidth - PADDLE_RADIUS, g.ai.x));
    g.ai.y = Math.max(PADDLE_RADIUS, Math.min(tableHeight / 2 - PADDLE_RADIUS, g.ai.y));
    g.puck.x = Math.max(PUCK_RADIUS, Math.min(tableWidth - PUCK_RADIUS, g.puck.x));
    g.puck.y = Math.max(PUCK_RADIUS, Math.min(tableHeight - PUCK_RADIUS, g.puck.y));
    g.player.vx = g.player.vy = 0;
    g.lastFrameTime = 0;
  }, [tableWidth, tableHeight]);

  useEffect(() => {
    const space = tableSpaceRef.current;
    if (!space) return;
    const observer = new ResizeObserver(([entry]) => {
      setTableSize(fitTable(entry.contentRect.width, entry.contentRect.height, horizontal, TABLE_PRESETS[config.tablePreset].scale, tableWidth, tableHeight));
    });
    observer.observe(space);
    return () => observer.disconnect();
  }, [gameState, horizontal, config.tablePreset, tableWidth, tableHeight]);

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
  }, []);

  const startGame = useCallback(() => {
    void sound.unlock();
    setGoalNotice(null);
    const g = gameRef.current;
    const cw = g.canvasWidth;
    const ch = g.canvasHeight;
    g.scores = { player: 0, ai: 0 };
    setScores({ player: 0, ai: 0 });
    const homeX = cw / 2;
    g.player.x = homeX;
    g.player.y = ch - HOME_OFFSET;
    g.ai.x = cw / 2;
    g.ai.y = HOME_OFFSET;
    g.mouse.x = homeX;
    g.mouse.y = ch - HOME_OFFSET;
    g.player.vx = 0;
    g.player.vy = 0;
    resetPuck(1);
    setTimeLeft(config.timeLimit);
    setGameState("playing");
    setWinner("");
  }, [config.timeLimit, config.playerSide, resetPuck, sound]);

  const resetToMenu = useCallback(() => {
    setGameState("menu");
    setScores({ player: 0, ai: 0 });
    setTimeLeft(config.timeLimit);
    setWinner("");
  }, [config.timeLimit]);

  const resumeGame = useCallback(() => {
    void sound.unlock();
    setGameState("playing");
  }, [sound]);

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
    const effects = createGameEffects(settings.effects, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const pointFeedback = (playerScored: boolean, isGoal = true) => {
      sound.goal(playerScored);
      setGoalNotice({ playerScored, isGoal, id: Date.now() });
      if (isGoal) effects.goal(cw / 2, playerScored ? 10 : ch - 10, playerScored ? 1 : -1,
        COLORS[playerScored ? config.playerColor : AI_COLOR[config.playerColor]].fill);
    };
    const wallFeedback = (x: number, y: number, nx: number, ny: number, speed: number) => {
      if (speed <= 0) return;
      sound.hit("wall", speed);
      const color = COLORS[y >= ch / 2 ? config.playerColor : AI_COLOR[config.playerColor]].fill;
      effects.wall(x, y, nx, ny, speed, color);
    };
    const artwork = createRinkArtwork(cw, ch, GOAL_WIDTH, PADDLE_RADIUS, PUCK_RADIUS,
      COLORS[config.playerColor].fill, COLORS[AI_COLOR[config.playerColor]].fill);

    const movePaddle = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const point = viewToTable(
        (clientX - rect.left) * canvas.width / rect.width,
        (clientY - rect.top) * canvas.height / rect.height,
        horizontal,
        config.playerSide,
        cw,
        ch
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

    function update(dtFrames: number) {
      if (gameState !== "playing") return true;
      const seconds = dtFrames / 60;
      const target = clampPlayer(g.mouse.x, g.mouse.y, cw, ch, PADDLE_RADIUS);
      movePlayer(g.player, target, config.physics.playerResponseMs, config.physics.playerMaxSpeed * cw, seconds);
      const playerVelX = g.player.vx;
      const playerVelY = g.player.vy;
      const previousAiX = g.ai.x;
      const previousAiY = g.ai.y;

      const aiTargetX = g.puck.x;
      const aiTargetY = Math.min(g.puck.y, ch / 2 - PADDLE_RADIUS);
      const aiDx = aiTargetX - g.ai.x;
      const aiDy = aiTargetY - g.ai.y;
      const aiDist = Math.sqrt(aiDx * aiDx + aiDy * aiDy);
      if (aiDist > 1) {
        const travel = Math.min(aiDist, AI_SPEED * dtFrames);
        g.ai.x += (aiDx / aiDist) * travel;
        g.ai.y += (aiDy / aiDist) * travel;
      }
      g.ai.x = Math.max(PADDLE_RADIUS, Math.min(cw - PADDLE_RADIUS, g.ai.x));
      g.ai.y = Math.max(PADDLE_RADIUS, Math.min(ch / 2 - PADDLE_RADIUS, g.ai.y));

      const aiVelX = (g.ai.x - previousAiX) / dtFrames;
      const aiVelY = (g.ai.y - previousAiY) / dtFrames;
      advancePuck(g.puck, config.physics.puckDrag, seconds);

      if (AI_HALF_FRAMES > 0 && g.puck.y < ch / 2) {
        g.aiHalfTimer += dtFrames;
        if (g.aiHalfTimer >= AI_HALF_FRAMES) {
          g.scores.player++;
          pointFeedback(true, false);
          setScores({ ...g.scores });
          if (g.scores.player >= config.maxScore) {
            setGameState("gameover");
            setWinner("You Win!");
            return true;
          }
          g.aiHalfTimer = 0;
          resetPuck(1);
          return true;
        }
      } else {
        g.aiHalfTimer = 0;
      }

      if (g.puck.x - PUCK_RADIUS < 0) {
        if (g.puck.vx < 0) wallFeedback(8, g.puck.y, 1, 0, -g.puck.vx);
        g.puck.x = PUCK_RADIUS;
        g.puck.vx = Math.abs(g.puck.vx) * config.physics.wallRestitution;
      }
      if (g.puck.x + PUCK_RADIUS > cw) {
        if (g.puck.vx > 0) wallFeedback(cw - 8, g.puck.y, -1, 0, g.puck.vx);
        g.puck.x = cw - PUCK_RADIUS;
        g.puck.vx = -Math.abs(g.puck.vx) * config.physics.wallRestitution;
      }

      if (g.puck.y - PUCK_RADIUS < 0) {
        if (g.puck.x > goalStart && g.puck.x < goalEnd) {
          g.scores.player++;
          pointFeedback(true);
          setScores({ ...g.scores });
          if (g.scores.player >= config.maxScore) {
            setGameState("gameover");
            setWinner("You Win!");
            return true;
          }
          resetPuck(1);
          return true;
        } else {
          if (g.puck.vy < 0) wallFeedback(g.puck.x, 8, 0, 1, -g.puck.vy);
          g.puck.y = PUCK_RADIUS;
          g.puck.vy = Math.abs(g.puck.vy) * config.physics.wallRestitution;
        }
      }
      if (g.puck.y + PUCK_RADIUS > ch) {
        if (g.puck.x > goalStart && g.puck.x < goalEnd) {
          g.scores.ai++;
          pointFeedback(false);
          setScores({ ...g.scores });
          if (g.scores.ai >= config.maxScore) {
            setGameState("gameover");
            setWinner("AI Wins!");
            return true;
          }
          resetPuck(-1);
          return true;
        } else {
          if (g.puck.vy > 0) wallFeedback(g.puck.x, ch - 8, 0, -1, g.puck.vy);
          g.puck.y = ch - PUCK_RADIUS;
          g.puck.vy = -Math.abs(g.puck.vy) * config.physics.wallRestitution;
        }
      }

      sound.hit("paddle", collidePaddle(g.puck, g.player, { x: playerVelX, y: playerVelY }, PADDLE_RADIUS + PUCK_RADIUS, config.physics.paddleRestitution, settings.gameplay.puckMaxSpeed * cw / 60) ?? 0);
      sound.hit("paddle", collidePaddle(g.puck, g.ai, { x: aiVelX, y: aiVelY }, PADDLE_RADIUS + PUCK_RADIUS, config.physics.paddleRestitution, settings.gameplay.puckMaxSpeed * cw / 60) ?? 0);
    }

    function draw() {
      if (!ctx) return;

      // The same simulation is viewed from the selected player's side.
      if (horizontal && config.playerSide === "right") ctx.setTransform(0, -1, 1, 0, 0, cw);
      else if (horizontal) ctx.setTransform(0, 1, -1, 0, ch, 0);
      else ctx.setTransform(1, 0, 0, 1, 0, 0);

      ctx.drawImage(artwork.board, 0, 0);

      if (AI_HALF_FRAMES > 0 && g.aiHalfTimer > 0) {
        const progress = g.aiHalfTimer / AI_HALF_FRAMES;
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
        const secondsLeft = Math.ceil((AI_HALF_FRAMES - g.aiHalfTimer) / 60);
        ctx.fillText(`${secondsLeft}s`, cw / 2, barY - 3);
      }

      effects.draw(ctx, cw, ch);
      artwork.drawPieces(ctx, g.player, g.ai, g.puck, gameState === "playing");
    }

    function gameLoop(now: number) {
      const dtFrames = g.lastFrameTime ? Math.max(0, Math.min(3, (now - g.lastFrameTime) / (1000 / 60))) : 1;
      g.lastFrameTime = now;
      if (gameState === "playing") {
        effects.update(dtFrames / 60);
        // Small adaptive steps prevent fast mallets/pucks crossing without contact.
        let remaining = dtFrames;
        while (remaining > 0.000001) {
          const relativeSpeed = Math.hypot(g.puck.vx, g.puck.vy) + Math.max(config.physics.playerMaxSpeed * cw / 60, AI_SPEED);
          const step = Math.min(remaining, 0.25, PUCK_RADIUS * 0.5 / Math.max(1, relativeSpeed));
          if (update(step)) break;
          remaining -= step;
        }
      }
      draw();
      g.animFrame = requestAnimationFrame(gameLoop);
    }

    g.lastFrameTime = 0;
    g.animFrame = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(g.animFrame);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("touchstart", handleTouchMove);
      canvas.removeEventListener("touchmove", handleTouchMove);
    };
  }, [gameState, config.maxScore, config.playerColor, config.playerSide, config.physics, resetPuck, horizontal, tableWidth, tableHeight, sound]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={`air-hockey bg-gray-900 flex flex-col items-center justify-center select-none p-4 ${(gameState === "playing" || gameState === "paused") ? "game-shell" : gameState === "menu" ? "setup-shell min-h-screen" : "min-h-screen"}`}>
      {goalNotice && gameState !== "menu" && (
        <div key={goalNotice.id} className="goal-notice" role="status" aria-live="polite">
          <div className="goal-notice-card" style={{
            color: COLORS[goalNotice.playerScored ? config.playerColor : AI_COLOR[config.playerColor]].fill,
            animationDuration: settings.effects.noticeMs + "ms",
          }}>
            <strong>{goalNotice.isGoal ? "GOL!" : "+1 PUNKT"}</strong>
            <span>{goalNotice.playerScored ? "TY" : "AI"} +1</span>
          </div>
        </div>
      )}
      {gameState === "menu" && (
        <div className="setup-card bg-gray-800 p-8 rounded-lg shadow-2xl max-w-md w-full">
          <h1 className="text-3xl font-bold text-white mb-6 text-center tracking-wider"><span className="brand-air">AIR</span> <span className="brand-hockey">HOCKEY</span></h1>
          
          <div className="setup-fields">
            <div>
              <label htmlFor="max-score" className="block text-gray-300 text-sm font-semibold mb-2">
                Punkty do wygranej
              </label>
              <input id="max-score"
                type="number"
                min={settings.limits.maxScore.min}
                max={settings.limits.maxScore.max}
                value={config.maxScore}
                onChange={(e) => setConfig({ ...config, maxScore: Math.max(settings.limits.maxScore.min, Math.min(settings.limits.maxScore.max, parseInt(e.target.value) || settings.limits.maxScore.min)) })}
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
              <label htmlFor="table-aspect" className="block text-gray-300 text-sm font-semibold mb-2">
                Proporcje stołu
              </label>
              <select id="table-aspect" value={config.aspectRatio}
                onChange={(e) => setConfig({ ...config, aspectRatio: e.target.value as AspectRatio })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none">
                <option value="auto">Auto — według proporcji ekranu</option>
                <option value="16:9">16:9 — panoramiczny</option>
                <option value="4:3">4:3 — klasyczny</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Aktualnie {activeAspect}. W pionie proporcje są odwrócone; gracz zawsze na dole.
              </p>
            </div>

            <div>
              <label htmlFor="player-color" className="block text-gray-300 text-sm font-semibold mb-2">
                Kolor twojej paletki
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
                min={settings.limits.timeMinutes.min}
                max={settings.limits.timeMinutes.max}
                value={Math.floor(config.timeLimit / 60)}
                onChange={(e) => setConfig({ ...config, timeLimit: Math.max(settings.limits.timeMinutes.min, Math.min(settings.limits.timeMinutes.max, parseInt(e.target.value) || settings.limits.timeMinutes.min)) * 60 })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-600 p-3">
              <div>
                <label id="sound-label" htmlFor="sound-toggle" className="block text-sm font-semibold text-gray-200">Dźwięki gry</label>
                <p className="mt-1 text-xs text-gray-400">Uderzenia, odbicia i bramki.</p>
              </div>
              <button id="sound-toggle" type="button" role="switch" aria-checked={config.soundEnabled}
                aria-labelledby="sound-label" onClick={toggleSound}
                className="px-4 py-2 bg-gray-700 text-white font-semibold">
                {config.soundEnabled ? "Włączone" : "Wyłączone"}
              </button>
            </div>

            <details className="rounded-lg border border-gray-700 bg-gray-900/70 p-4">
              <summary className="cursor-pointer select-none text-sm font-bold text-cyan-300">
                Dynamika i sterowanie
              </summary>
              <p className="mb-4 mt-2 text-xs leading-relaxed text-gray-400">
                Ustawienia obowiązują w nowej grze. Prędkość krążka wynika z oporu i zderzeń; nie jest sztucznie podbijana.
              </p>
              <div className="space-y-5">
                {["Krążek", "Gracz"].map((group) => (
                  <div key={group} className="space-y-5">
                    <h2 className="border-b border-gray-700 pb-2 text-sm font-bold uppercase tracking-wide text-white">{group}</h2>
                    {PHYSICS_KEYS.filter((key) => settings.physics[key].group === group).map((key) => {
                      const option = settings.physics[key];
                      const value = config.physics[key];
                      const display = option.unit === "%" ? Math.round(value * 100) + "%" : Number(value.toFixed(2)) + " " + option.unit;
                      return (
                        <PhysicsSlider key={key} id={key} label={option.label}
                          min={option.min} max={option.max} step={option.step}
                          value={value} display={display} description={option.description}
                          onChange={(next) => setConfig((current) => ({
                            ...current, physics: { ...current.physics, [key]: next },
                          }))}
                        />
                      );
                    })}
                  </div>
                ))}
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
              <div className="text-sm font-semibold" style={{ color: COLORS[config.playerColor].fill }}>TY</div>
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
              onPointerDown={() => { void sound.unlock(); }}
              width={canvasWidth}
              height={canvasHeight}
              aria-label={`Stół do air hockey. Steruj paletką w kolorze ${COLORS[config.playerColor].label.toLowerCase()} myszką lub dotykiem.`}
              className="game-canvas rounded-lg shadow-2xl cursor-none"
            />

            {gameState === "paused" && (
              <div className="pause-overlay absolute inset-0 bg-black/80 flex flex-col items-center justify-center rounded-lg">
                <div className="pause-title text-4xl font-bold text-white mb-6">PAUZA</div>
                <div className="pause-actions space-y-3 w-64">
                  <button type="button" role="switch" aria-checked={config.soundEnabled}
                    aria-label="Dźwięki gry" onClick={toggleSound}
                    className="w-full py-3 bg-gray-600 text-white font-bold rounded-lg">
                    Dźwięki: {config.soundEnabled ? "włączone" : "wyłączone"}
                  </button>
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
                className="pause-button absolute top-4 right-4 px-4 py-2 bg-gray-800/80 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors"
              >
                ⏸️ Pauza
              </button>
            )}
          </div>

          </div>

          <p className="game-help text-gray-400 text-sm mt-4">
            {isMobile ? "Przesuwaj palcem, aby kontrolować" : "Poruszaj myszką, aby kontrolować"} <span className="font-semibold" style={{ color: COLORS[config.playerColor].fill }}>paletkę</span> • Pierwszy do {config.maxScore} wygrywa!
          </p>
        </>
      )}

      {gameState === "gameover" && (
        <div className="result-card bg-gray-800 p-8 rounded-lg shadow-2xl max-w-md w-full text-center">
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
