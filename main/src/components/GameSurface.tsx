import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createGameAudio } from "../audio.js";
import type { GameEngine } from "../game/GameEngine.ts";
import { InputController } from "../game/InputController.ts";
import type { TableRenderer } from "../game/TableRenderer.ts";
import type { Preferences } from "../config/preferences.ts";
import { resolveView } from "../game/viewLayout.ts";

export interface GameSurfaceHandle {
  unlock(): void;
  focus(): void;
  silence(): void;
  setSound(enabled: boolean): void;
}
interface Props {
  engine: GameEngine;
  soundEnabled: boolean;
  preferences: Preferences;
  immersive: boolean;
  onReady: (ready: boolean) => void;
  onError: (error: string | null) => void;
}

export const GameSurface = forwardRef<GameSurfaceHandle, Props>(
  function GameSurface(
    { engine, soundEnabled, preferences, immersive, onReady, onError },
    ref,
  ) {
    const host = useRef<HTMLDivElement>(null);
    const audio = useRef<ReturnType<typeof createGameAudio> | null>(null);
    const renderer = useRef<TableRenderer | null>(null);
    const viewOptions = useRef({ preferences, immersive });
    const resizeView = useRef(() => {});
    viewOptions.current = { preferences, immersive };
    useEffect(() => {
      resizeView.current();
    }, [preferences, immersive]);
    useImperativeHandle(
      ref,
      () => ({
        unlock: () => {
          void audio.current?.unlock();
        },
        focus: () =>
          renderer.current?.app.canvas.focus({ preventScroll: true }),
        silence: () => audio.current?.silence(),
        setSound: (enabled) => {
          audio.current?.setEnabled(enabled);
          if (enabled) void audio.current?.unlock();
        },
      }),
      [],
    );

    useEffect(() => {
      audio.current?.setEnabled(soundEnabled);
    }, [soundEnabled]);

    useEffect(() => {
      const container = host.current!;
      let cancelled = false;
      let cleanup = () => {};
      const sound = createGameAudio(soundEnabled, engine.config.audio.volume);
      audio.current = sound;
      onReady(false);
      onError(null);
      void (async () => {
        const { TableRenderer: Renderer } = await import(
          "../game/TableRenderer.ts"
        );
        if (cancelled) return;
        const view = await Renderer.create(engine.config);
        if (cancelled) {
          view.destroy();
          return;
        }
        const disposers: (() => void)[] = [() => view.destroy()];
        cleanup = () => {
          engine.onEvent = () => {};
          resizeView.current = () => {};
          for (const dispose of disposers.splice(0).reverse()) dispose();
        };
        renderer.current = view;
        const canvas = view.app.canvas;
        canvas.tabIndex = 0;
        canvas.setAttribute("role", "application");
        canvas.setAttribute(
          "aria-label",
          "Stół do air hockey. Sterowanie: mysz, dotyk, strzałki lub WASD.",
        );
        canvas.setAttribute("aria-describedby", "controls-help");
        container.appendChild(canvas);
        const input = new InputController(
          canvas,
          engine,
          view.toWorld,
          () => {
            void sound.unlock();
          },
          view.directionToWorld,
        );
        disposers.push(() => input.destroy());
        const resize = () => {
          const width = container.clientWidth,
            height = container.clientHeight;
          if (!width || !height) return;
          const { preferences: p, immersive: full } = viewOptions.current;
          const layout = resolveView(width, height, p, full);
          engine.resizeTable(layout.width, layout.height);
          view.resize(width, height, layout);
          canvas.setAttribute(
            "aria-label",
            `Stół do air hockey. Twoja połowa: ${layout.horizontal ? (layout.side === "left" ? "lewa" : "prawa") : "dolna"}. Mysz, dotyk, strzałki lub WASD.`,
          );
          canvas.dataset.orientation = layout.horizontal
            ? "horizontal"
            : "vertical";
          canvas.dataset.side = layout.horizontal ? layout.side : "bottom";
        };
        resizeView.current = resize;
        const observer = new ResizeObserver(resize);
        disposers.push(() => observer.disconnect());
        observer.observe(container);
        window.addEventListener("resize", resize);
        window.visualViewport?.addEventListener("resize", resize);
        disposers.push(() => {
          window.removeEventListener("resize", resize);
          window.visualViewport?.removeEventListener("resize", resize);
        });
        const motion = matchMedia("(prefers-reduced-motion: reduce)");
        const updateMotion = () => view.setReducedMotion(motion.matches);
        motion.addEventListener("change", updateMotion);
        disposers.push(() =>
          motion.removeEventListener("change", updateMotion),
        );
        updateMotion();
        const pause = () => {
          engine.pause();
          input.reset();
          sound.silence();
        };
        const visibility = () => {
          if (document.hidden) pause();
        };
        window.addEventListener("blur", pause);
        document.addEventListener("visibilitychange", visibility);
        disposers.push(() => {
          window.removeEventListener("blur", pause);
          document.removeEventListener("visibilitychange", visibility);
        });
        const lostContext = (event: Event) => {
          event.preventDefault();
          pause();
          view.app.stop();
          onReady(false);
          onError(
            "Przerwano połączenie z grafiką. Wczytaj grę ponownie, aby wrócić do stołu.",
          );
        };
        canvas.addEventListener("webglcontextlost", lostContext);
        disposers.push(() =>
          canvas.removeEventListener("webglcontextlost", lostContext),
        );
        engine.onEvent = (event) => {
          view.event(event);
          if (event.type === "configure") {
            resize();
          } else if (event.type === "reset") {
            input.reset();
            sound.silence();
          } else if (event.type === "hit")
            sound.hit(event.kind, event.speed / 60, event.side);
          else if (event.type === "finish")
            sound.finish(event.winner === "player");
          else if (event.won) sound.finish(event.side === "player");
          else sound.goal(event.side === "player");
        };
        const tick = () => {
          const dt = Math.min(
            view.app.ticker.deltaMS / 1000,
            engine.config.physics.maxFrame,
          );
          input.update(dt);
          engine.advance(dt);
          view.render(engine.state, dt);
        };
        resize();
        view.render(engine.state, 0);
        view.app.ticker.add(tick);
        disposers.push(() => view.app.ticker.remove(tick));
        view.app.start();
        onReady(true);
      })().catch(() => {
        if (!cancelled) {
          cleanup();
          cleanup = () => {};
          renderer.current = null;
          onError(
            "Nie udało się uruchomić grafiki. Włącz akcelerację sprzętową lub użyj przeglądarki obsługującej WebGL.",
          );
        }
      });
      return () => {
        cancelled = true;
        cleanup();
        sound.dispose();
        audio.current = null;
        renderer.current = null;
      };
      // The stable engine owns resources; the separate sound effect updates mute state.
    }, [engine, onReady, onError]);

    return <div ref={host} className="pixi-surface" />;
  },
);
