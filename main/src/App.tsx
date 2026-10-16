import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  HelpCircle,
  Keyboard,
  LogOut,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { ARENAS } from "./config/arenas.ts";
import { MatchSummary } from "./components/MatchSummary.tsx";
import { GAME_CONFIG } from "./config/game.ts";
import type { Difficulty } from "./config/game.ts";
import {
  configFromPreferences,
  readPreferences,
  savePreferences,
} from "./config/preferences.ts";
import type { Preferences } from "./config/preferences.ts";
import { GameEngine } from "./game/GameEngine.ts";
import { GameSurface } from "./components/GameSurface.tsx";
import type { GameSurfaceHandle } from "./components/GameSurface.tsx";
import { GameOverlay } from "./components/GameOverlay.tsx";
import { GameSetup } from "./components/GameSetup.tsx";
import { ControlGuide } from "./components/ControlGuide.tsx";
import { readSoundPreference, saveSoundPreference } from "./audio.js";

const COMPACT_QUERY = "(max-width: 760px), (pointer: coarse)";
const difficulties: { id: Difficulty; label: string; description: string }[] = [
  {
    id: "easy",
    label: "Łatwy",
    description: "Złap rytm. Jest miejsce na naukę.",
  },
  {
    id: "medium",
    label: "Średni",
    description: "Szybkie reakcje. Wymagający przeciwnik.",
  },
  {
    id: "hard",
    label: "Trudny",
    description: "Celne odbicia. Liczy się każdy strzał.",
  },
];
const color = (value: number) => `#${value.toString(16).padStart(6, "0")}`;
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export default function App() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [engine] = useState(
    () => new GameEngine(configFromPreferences(preferences)),
  );
  const [game, setGame] = useState(() => engine.snapshot());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState(() =>
    readSoundPreference(GAME_CONFIG.audio.enabled),
  );
  const [compact, setCompact] = useState(
    () => matchMedia(COMPACT_QUERY).matches,
  );
  const [setupOpen, setSetupOpen] = useState(compact);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const shell = useRef<HTMLElement>(null);
  const surface = useRef<GameSurfaceHandle>(null);
  const phase = game.phase;
  const active = phase === "playing" || phase === "goal";
  const immersive = fullscreen || (compact && phase !== "ready");
  const target = preferences.winningScore;
  const theme = engine.config.visuals;
  const sidebarLocked = phase !== "ready" && phase !== "gameover";
  const celebration = phase === "goal" || phase === "gameover";
  const arena = ARENAS[preferences.arena];
  const canFullscreen =
    typeof document.documentElement.requestFullscreen === "function";

  useEffect(() => {
    engine.onChange = setGame;
    return () => {
      engine.onChange = () => {};
    };
  }, [engine]);
  useEffect(() => {
    const media = matchMedia(COMPACT_QUERY);
    const change = () => setCompact(media.matches);
    const onFullscreen = () =>
      setFullscreen(document.fullscreenElement === shell.current);
    media.addEventListener("change", change);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      media.removeEventListener("change", change);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  const enterFullscreen = useCallback(() => {
    if (!document.fullscreenElement)
      void shell.current?.requestFullscreen?.().catch(() => {});
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
    else enterFullscreen();
  };
  const start = useCallback(
    (next: Preferences = preferences) => {
      surface.current?.unlock();
      if (compact) enterFullscreen();
      setPreferences(next);
      savePreferences(next);
      engine.configure(configFromPreferences(next));
      engine.start();
      setSetupOpen(false);
      setHelpOpen(false);
      requestAnimationFrame(() => surface.current?.focus());
    },
    [engine, preferences, compact, enterFullscreen],
  );
  const resume = useCallback(() => {
    surface.current?.unlock();
    engine.resume();
    requestAnimationFrame(() => surface.current?.focus());
  }, [engine]);
  const pause = useCallback(() => {
    engine.pause();
    surface.current?.silence();
  }, [engine]);
  const openSetup = () => {
    pause();
    setHelpOpen(false);
    setSetupOpen(true);
  };
  const returnToMenu = () => {
    surface.current?.silence();
    engine.returnToMenu();
    setHelpOpen(false);
    setSetupOpen(compact);
    if (document.fullscreenElement === shell.current)
      void document.exitFullscreen().catch(() => {});
  };
  const openHelp = () => {
    pause();
    setHelpOpen(true);
  };
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    saveSoundPreference(next);
    surface.current?.setSound(next);
  };
  const changeDifficulty = (difficulty: Difficulty) => {
    if (sidebarLocked) return;
    const next = { ...preferences, difficulty };
    setPreferences(next);
    savePreferences(next);
    engine.setDifficulty(difficulty);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        setupOpen ||
        helpOpen
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, input, select, summary, [role="dialog"]')
      )
        return;
      if (
        event.key.toLowerCase() === "p" ||
        event.key === "Escape" ||
        event.code === "Space"
      ) {
        event.preventDefault();
        if (engine.state.phase === "paused") resume();
        else pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, pause, resume, setupOpen, helpOpen]);

  const soundButton = (
    <button
      className="icon-button"
      role="switch"
      aria-checked={sound}
      aria-label="Dźwięki gry"
      onClick={toggleSound}
    >
      {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>
  );

  return (
    <main
      ref={shell}
      className={`app-shell arena-${preferences.arena} ${phase === "ready" ? "menu-idle" : ""} ${preferences.screenShake ? "" : "no-shake"} ${compact ? "compact-device" : ""} ${immersive ? "immersive" : ""}`}
      style={
        {
          "--player-color": color(theme.player),
          "--ai-color": color(theme.ai),
        } as CSSProperties
      }
    >
      <header className="app-header">
        <a
          className="wordmark"
          href="#main-game"
          aria-label="Air Hockey, przejdź do gry"
        >
          <span className="brand-symbol">
            <span />
          </span>{" "}
          SIDEQUEST<span className="wordmark-divider">/</span>
          <span className="wordmark-sub">TWÓJ DOMOWY ARCADE</span>
        </a>
        <div className="header-right">
          <span className="online-mark">
            <i /> GRASZ SOLO
          </span>
          {!immersive && soundButton}
        </div>
      </header>
      <div className="game-layout" id="main-game">
        <aside className="sidebar">
          <div className="side-copy">
            <div className="eyebrow">
              <span>01</span> KLASYKA W NOWEJ ENERGII
            </div>
            <h1>
              AIR
              <br />
              <em>HOCKEY.</em>
            </h1>
            <span className="arena-edition">{arena.label} / EDITION</span>
            <p>
              Szybkie ręce. Celne strzały.
              <br />
              Jeszcze jeden mecz.
            </p>
          </div>
          <section
            className="match-settings"
            aria-labelledby="difficulty-label"
          >
            <div className="section-label" id="difficulty-label">
              <Zap size={14} /> TWÓJ PRZECIWNIK
            </div>
            <fieldset className="difficulty-options" disabled={sidebarLocked}>
              <legend className="sr-only">Poziom AI</legend>
              {difficulties.map((d) => (
                <label
                  key={d.id}
                  className={game.difficulty === d.id ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="difficulty"
                    value={d.id}
                    checked={game.difficulty === d.id}
                    onChange={() => changeDifficulty(d.id)}
                  />
                  <span>{d.label}</span>
                </label>
              ))}
            </fieldset>
            <p className="difficulty-description">
              {difficulties.find((d) => d.id === game.difficulty)!.description}
            </p>
            <button className="settings-button" disabled={sidebarLocked} onClick={openSetup}>
              <Settings2 size={17} /> Ustawienia meczu
            </button>
            {sidebarLocked && <p className="settings-lock" role="note">Mecz trwa. Ustawienia otworzysz z menu pauzy.</p>}
          </section>
          <div className="play-guide">
            <div className="section-label">
              <HelpCircle size={15} /> JAK GRAĆ
            </div>
            <p>
              Bronisz bramki w kolorze swojej paletki. Traf do bramki AI —
              pierwszy do {target} wygrywa.
            </p>
            <ControlGuide compact />
          </div>
          <div className="sidebar-bottom">
            <span className="tiny-puck" /> MNIEJ SCROLLOWANIA. WIĘCEJ GRY.
            <ArrowUpRight size={14} />
          </div>
        </aside>
        <section className="arena" aria-label="Mecz air hockey">
          <div className="arena-topline">
            <span>
              <i className={active ? "status-dot live" : "status-dot"} />
              {phase === "ready"
                ? "STÓŁ CZEKA NA CIEBIE"
                : phase === "paused"
                  ? "MECZ WSTRZYMANY"
                  : phase === "gameover"
                    ? "KONIEC MECZU"
                    : "MECZ W TOKU"}
            </span>
            <span>TY vs. AI</span>
          </div>
          <div className="match-hud">
            <div
              className="scoreboard"
              aria-label={`Wynik: ty ${game.playerScore}, AI ${game.aiScore}`}
            >
              <div className={`score-team player-team ${celebration && game.lastScorer === "player" ? "just-scored" : ""}`} key={`player-${game.playerScore}`}>
                <span className="team-icon">
                  <span />
                </span>
                <div>
                  <span className="team-name">TY</span>
                  <span className="team-caption">GRACZ</span>
                </div>
                <strong data-testid="player-score">
                  {String(game.playerScore).padStart(2, "0")}
                </strong>
              </div>
              <div className="score-center">
                <span>{game.remainingSeconds === null ? "DO" : "CZAS"}</span>
                <strong
                  className={
                    game.remainingSeconds !== null ? "match-clock" : ""
                  }
                >
                  {game.remainingSeconds === null
                    ? target
                    : formatTime(game.remainingSeconds)}
                </strong>
                <span className="match-dash">—</span>
              </div>
              <div className={`score-team ai-team ${celebration && game.lastScorer === "ai" ? "just-scored" : ""}`} key={`ai-${game.aiScore}`}>
                <strong data-testid="ai-score">
                  {String(game.aiScore).padStart(2, "0")}
                </strong>
                <div>
                  <span className="team-name">AI</span>
                  <span className="team-caption">
                    {difficulties
                      .find((d) => d.id === game.difficulty)!
                      .label.toUpperCase()}
                  </span>
                </div>
                <span className="team-icon">
                  <span />
                </span>
              </div>
            </div>
            {immersive && (
              <div className="mobile-actions">
                <button
                  className="icon-button"
                  aria-label={phase === "paused" ? "Wznów mecz" : "Pauza"}
                  disabled={
                    !ready || !!error || (!active && phase !== "paused")
                  }
                  onClick={phase === "paused" ? resume : pause}
                >
                  {phase === "paused" ? (
                    <Play size={18} />
                  ) : (
                    <Pause size={18} />
                  )}
                </button>
                {soundButton}
                <button
                  className="icon-button"
                  aria-label="Ustawienia meczu"
                  onClick={openSetup}
                >
                  <Settings2 size={18} />
                </button>
                {canFullscreen && (
                  <button
                    className="icon-button fullscreen-button"
                    aria-label={
                      fullscreen ? "Wyjdź z pełnego ekranu" : "Pełny ekran"
                    }
                    onClick={toggleFullscreen}
                  >
                    {fullscreen ? (
                      <Minimize size={17} />
                    ) : (
                      <Maximize size={17} />
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="rink-stage">
            <GameSurface
              ref={surface}
              engine={engine}
              soundEnabled={sound}
              preferences={preferences}
              immersive={immersive}
              onReady={setReady}
              onError={setError}
            />
            {error ? (
              <GameOverlay title="Nie można uruchomić gry">
                <h2>Gra przerwana</h2>
                <p>{error}</p>
                <button
                  className="primary-button"
                  onClick={() => window.location.reload()}
                >
                  Wczytaj ponownie <RotateCcw size={17} />
                </button>
              </GameOverlay>
            ) : !ready ? (
              <div className="loading-state" role="status">
                <span className="loading-puck" />
                Przygotowuję stół…
              </div>
            ) : !setupOpen && !helpOpen && phase === "ready" ? (
              <GameOverlay title="Gotowy do gry" modal={false}>
                <span className="overlay-badge">
                  <Play size={24} fill="currentColor" />
                </span>
                <span className="overlay-kicker">TWÓJ STÓŁ. TWÓJ STRZAŁ.</span>
                <h2>Czas na mecz.</h2>
                <p>
                  Mysz, palec lub <strong>strzałki / WASD</strong>.<br />
                  Pierwszy do {target} punktów wygrywa.
                </p>
                <button className="primary-button" onClick={() => start()}>
                  Rozpocznij mecz <ArrowRight size={18} />
                </button>
                <button className="text-button" onClick={openSetup}>
                  <Settings2 size={16} /> Ustawienia przed grą
                </button>
              </GameOverlay>
            ) : !setupOpen && !helpOpen && phase === "paused" ? (
              <GameOverlay title="Mecz wstrzymany" onDismiss={resume}>
                <span className="overlay-kicker">ZŁAP ODDECH</span>
                <h2>Gramy dalej?</h2>
                <p>
                  Mysz, dotyk, strzałki lub WASD.
                  <br />
                  <kbd>Esc</kbd> — powrót do gry.
                </p>
                <button className="primary-button" onClick={resume}>
                  Wznów mecz <Play size={17} />
                </button>
                <div className="overlay-secondary">
                  <button onClick={() => start()}>
                    <RotateCcw size={14} /> Od nowa
                  </button>
                  <button onClick={openSetup}>
                    <Settings2 size={14} /> Ustawienia
                  </button>
                </div>
                <div className="overlay-secondary">
                  <button onClick={openHelp}>
                    <HelpCircle size={14} /> Sterowanie
                  </button>
                  {canFullscreen && (
                    <button onClick={toggleFullscreen}>
                      {fullscreen ? (
                        <Minimize size={14} />
                      ) : (
                        <Maximize size={14} />
                      )}
                      {fullscreen ? "Wyjdź z ekranu" : "Pełny ekran"}
                    </button>
                  )}
                </div>
                <button className="text-button" onClick={returnToMenu}>
                  <LogOut size={15} /> Zakończ mecz
                </button>
              </GameOverlay>
            ) : !setupOpen && !helpOpen && phase === "gameover" ? (
              <GameOverlay
                className="result-scrim"
                title={
                  game.winner === "player"
                    ? "Wygrywasz mecz"
                    : game.winner === "ai"
                      ? "AI wygrywa mecz"
                      : "Remis"
                }
              >
                <span className="overlay-badge">
                  {game.winner === "player" ? (
                    <Trophy size={26} />
                  ) : (
                    <Sparkles size={26} />
                  )}
                </span>
                <span className="overlay-kicker">
                  {game.endReason === "time" ? "CZAS MINĄŁ" : "DOBRY MECZ"}
                </span>
                <h2>
                  {game.winner === "player"
                    ? "Ten mecz jest twój."
                    : game.winner === "ai"
                      ? "AI wygrywa mecz."
                      : "Równo do końca."}
                </h2>
                <p className="final-score">
                  <span>{game.playerScore}</span>
                  <span>—</span>
                  <span>{game.aiScore}</span>
                </p>
                {game.stats && <MatchSummary stats={game.stats} />}
                <button className="primary-button rematch-button" onClick={() => start()}>
                  Rewanż <RotateCcw size={17} />
                </button>
                <button className="text-button" onClick={openSetup}>
                  <Settings2 size={15} /> Zmień ustawienia
                </button>
                <button className="text-button" onClick={returnToMenu}>
                  <LogOut size={15} /> Wróć do ekranu startowego
                </button>
              </GameOverlay>
            ) : null}
            {phase === "goal" && (
              <div
                key={`goal-${game.playerScore}-${game.aiScore}`}
                className={`goal-banner ${game.lastScorer === "ai" ? "ai-goal" : ""}`}
                role="status"
              >
                <span>{game.lastScorer ? "GOL!" : "NOWY KRĄŻEK"}</span>
                <span className="goal-score">{game.playerScore} : {game.aiScore}</span>
                <strong>
                  {game.lastScorer === "player"
                    ? "Ten punkt jest twój."
                    : game.lastScorer === "ai"
                      ? "AI trafia do bramki."
                      : "Gramy dalej."}
                </strong>
                <div
                  className="serve-progress"
                  style={{
                    animationDuration: `${GAME_CONFIG.match.goalDelay}s`,
                  }}
                />
              </div>
            )}
          </div>
          <div className="arena-controls">
            <p id="controls-help">
              <Keyboard size={15} />
              <span>
                Mysz · dotyk · <strong>strzałki / WASD</strong>
                <span className="desktop-help">
                  {" "}
                  · <kbd>P</kbd> pauza
                </span>
              </span>
            </p>
            <div>
              <button
                className="control-button help-button"
                aria-label="Jak sterować"
                onClick={openHelp}
              >
                <HelpCircle size={17} />
              </button>
              {!immersive && (
                <>
                  <button
                    className="control-button"
                    disabled={
                      !ready || !!error || (!active && phase !== "paused")
                    }
                    onClick={phase === "paused" ? resume : pause}
                  >
                    {phase === "paused" ? (
                      <Play size={15} />
                    ) : (
                      <Pause size={15} />
                    )}
                    {phase === "paused" ? "Wznów" : "Pauza"}
                  </button>
                  <button
                    className="control-button restart-button"
                    aria-label="Rozpocznij mecz od nowa"
                    disabled={!ready || !!error || phase === "ready"}
                    onClick={() => start()}
                  >
                    <RotateCcw size={16} />
                  </button>
                  {canFullscreen && (
                    <button
                      className="control-button fullscreen-button"
                      aria-label="Pełny ekran"
                      onClick={toggleFullscreen}
                    >
                      <Maximize size={16} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <span
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {game.lastScorer
              ? `${game.lastScorer === "player" ? "Zdobywasz punkt" : "AI zdobywa punkt"}. `
              : ""}
            Ty {game.playerScore}, AI {game.aiScore}.
            {phase === "gameover"
              ? ` ${game.winner === "player" ? "Wygrywasz" : game.winner === "ai" ? "AI wygrywa" : "Remis"}.`
              : ""}
          </span>
        </section>
      </div>
      <footer className="app-footer">
        <span>Z MIŁOŚCI DO GRY.</span>
        <span>
          JESZCZE JEDEN MECZ? <span>↗</span>
        </span>
      </footer>
      {setupOpen && !error && (
        <GameSetup
          preferences={preferences}
          sound={sound}
          ready={ready}
          onSound={toggleSound}
          onStart={start}
          onClose={() => setSetupOpen(false)}
        />
      )}
      {helpOpen && (
        <GameOverlay
          title="Sterowanie"
          className="help-scrim"
          onDismiss={() => setHelpOpen(false)}
        >
          <h2>Twoja połowa. Twój ruch.</h2>
          <ControlGuide />
          <p>
            W pionie grasz na dole. W poziomie po stronie wybranej w
            ustawieniach. Strzałki zawsze wskazują kierunki na ekranie.
          </p>
          <button className="primary-button" onClick={() => setHelpOpen(false)}>
            Rozumiem <ArrowRight size={16} />
          </button>
        </GameOverlay>
      )}
    </main>
  );
}
