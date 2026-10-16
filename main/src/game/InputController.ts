import type { GameEngine } from "./GameEngine.ts";
import type { Point } from "./types.ts";

export class InputController {
  private canvas: HTMLCanvasElement;
  private engine: GameEngine;
  private toWorld: (clientX: number, clientY: number, point: Point) => void;
  private unlock: () => void;
  private directionToWorld: (x: number, y: number, point: Point) => void;
  private pointer: number | null = null;
  private keys = new Set<string>();
  private point: Point = { x: 0, y: 0 };
  private abort = new AbortController();

  constructor(
    canvas: HTMLCanvasElement,
    engine: GameEngine,
    toWorld: (x: number, y: number, point: Point) => void,
    unlock: () => void,
    directionToWorld: (x: number, y: number, point: Point) => void,
  ) {
    this.canvas = canvas;
    this.engine = engine;
    this.toWorld = toWorld;
    this.unlock = unlock;
    this.directionToWorld = directionToWorld;
    const options = { signal: this.abort.signal };
    canvas.addEventListener("pointerdown", this.down, options);
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerup", this.up, options);
    canvas.addEventListener("pointercancel", this.up, options);
    canvas.addEventListener("lostpointercapture", this.up, options);
    canvas.addEventListener("pointerleave", this.leave, options);
    canvas.addEventListener("keydown", this.keyDown, options);
    canvas.addEventListener("keyup", this.keyUp, options);
    canvas.addEventListener("blur", this.reset, options);
    window.addEventListener("blur", this.reset, options);
  }

  private down = (event: PointerEvent): void => {
    if (
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.unlock();
    this.pointer = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.move(event);
  };

  private move = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse" && this.pointer !== event.pointerId)
      return;
    if (this.pointer !== null && this.pointer !== event.pointerId) return;
    this.toWorld(event.clientX, event.clientY, this.point);
    this.engine.setTarget(this.point.x, this.point.y);
  };

  private up = (event: PointerEvent): void => {
    if (this.pointer !== event.pointerId) return;
    this.pointer = null;
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    this.engine.releaseInput();
  };

  private leave = (): void => {
    if (this.pointer === null) this.engine.releaseInput();
  };
  private keyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (
      ![
        "arrowleft",
        "arrowright",
        "arrowup",
        "arrowdown",
        "w",
        "a",
        "s",
        "d",
      ].includes(key)
    )
      return;
    event.preventDefault();
    this.keys.add(key);
    this.unlock();
  };
  private keyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  update(dt: number): void {
    if (this.keys.size === 0) return;
    const x =
      Number(this.keys.has("arrowright") || this.keys.has("d")) -
      Number(this.keys.has("arrowleft") || this.keys.has("a"));
    const y =
      Number(this.keys.has("arrowdown") || this.keys.has("s")) -
      Number(this.keys.has("arrowup") || this.keys.has("w"));
    const distance =
      (this.engine.config.paddle.maxSpeed * dt * 0.75) /
      (Math.hypot(x, y) || 1);
    this.directionToWorld(x, y, this.point);
    this.engine.setTarget(
      this.engine.state.target.x + this.point.x * distance,
      this.engine.state.target.y + this.point.y * distance,
    );
  }

  reset = (): void => {
    if (this.pointer !== null && this.canvas.hasPointerCapture(this.pointer))
      this.canvas.releasePointerCapture(this.pointer);
    this.pointer = null;
    this.keys.clear();
    this.engine.releaseInput();
  };

  destroy(): void {
    this.abort.abort();
    this.reset();
  }
}
