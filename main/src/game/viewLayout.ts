import { GAME_CONFIG } from "../config/game.ts";
import { TABLE_SIZES } from "../config/preferences.ts";
import type { Preferences } from "../config/preferences.ts";
import { fitTable, viewToTable } from "../tableGeometry.js";
import type { Point } from "./types.ts";

export interface ViewLayout {
  width: number;
  height: number;
  horizontal: boolean;
  side: "left" | "right";
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Fit real geometry to the available play area; never stretch the canvas or its circles. */
export function resolveView(
  width: number,
  height: number,
  p: Preferences,
  immersive: boolean,
): ViewLayout {
  const horizontal =
    p.orientation === "auto"
      ? immersive && width > height
      : p.orientation === "horizontal";
  const shortSpace = Math.max(1, horizontal ? height : width);
  const longSpace = Math.max(1, horizontal ? width : height);
  const w = GAME_CONFIG.table.width,
    padding = GAME_CONFIG.visuals.padding;
  // On a phone auto uses the full available space. Desktop keeps the original rink proportions.
  const ratio =
    p.aspect === "auto"
      ? immersive
        ? Math.max(
            1,
            Math.min(
              3.5,
              (((w + padding * 2) * longSpace) / shortSpace - padding * 2) / w,
            ),
          )
        : GAME_CONFIG.table.height / w
      : p.aspect === "16:9"
        ? 16 / 9
        : 4 / 3;
  const h = Math.round(w * ratio);
  const fit = fitTable(
    width,
    height,
    horizontal,
    TABLE_SIZES[p.tableSize].scale,
    w + padding * 2,
    h + padding * 2,
  );
  const scale = fit.width / ((horizontal ? h : w) + padding * 2);
  return {
    width: w,
    height: h,
    horizontal,
    side: p.playerSide,
    scale,
    offsetX: (width - (horizontal ? h : w) * scale) / 2,
    offsetY: (height - (horizontal ? w : h) * scale) / 2,
  };
}

export function screenToWorld(
  x: number,
  y: number,
  layout: ViewLayout,
  out: Point,
): void {
  const point = viewToTable(
    (x - layout.offsetX) / layout.scale,
    (y - layout.offsetY) / layout.scale,
    layout.horizontal,
    layout.side,
    layout.width,
    layout.height,
  );
  out.x = point.x;
  out.y = point.y;
}

/** Arrow keys describe screen directions, including after either 90° rotation. */
export function directionToWorld(
  x: number,
  y: number,
  layout: ViewLayout,
  out: Point,
): void {
  out.x = layout.horizontal ? (layout.side === "left" ? y : -y) : x;
  out.y = layout.horizontal ? (layout.side === "left" ? -x : x) : y;
}
