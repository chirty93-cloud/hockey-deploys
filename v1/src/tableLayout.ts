// Display geometry only; simulation dimensions never change on rotation.
export const TABLE_PRESETS = {
  small: { label: "Mały — 65%", scale: 0.65 },
  medium: { label: "Średni — 80%", scale: 0.8 },
  large: { label: "Duży — 90%", scale: 0.9 },
  full: { label: "Maksymalny — 100%", scale: 1 },
};
export type TablePreset = keyof typeof TABLE_PRESETS;

export function fitTable(width: number, height: number, horizontal: boolean, preset: TablePreset = "full") {
  const viewWidth = horizontal ? 600 : 400;
  const viewHeight = horizontal ? 400 : 600;
  const scale = Math.max(0, Math.min(width / viewWidth, height / viewHeight)) * TABLE_PRESETS[preset].scale;
  return { width: viewWidth * scale, height: viewHeight * scale };
}

export function viewToTable(x: number, y: number, horizontal = false, side: "left" | "right" = "left") {
  const point = horizontal ? { x: y, y: 600 - x } : { x, y };
  return horizontal && side === "right" ? { x: 400 - point.x, y: 600 - point.y } : point;
}

export function clampPlayer(x: number, y: number, width: number, height: number, radius: number) {
  return {
    x: Math.max(radius, Math.min(width - radius, x)),
    y: Math.max(height / 2 + radius, Math.min(height - radius, y)),
  };
}
