/** @param {"auto" | "16:9" | "4:3"} mode @param {number} width @param {number} height */
export function resolveAspect(mode, width, height) {
  if (mode !== "auto") return mode;
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  return ratio >= (16 / 9 + 4 / 3) / 2 ? "16:9" : "4:3";
}

/** @param {"16:9" | "4:3"} aspect @param {number} shortEdge */
export function tableDimensions(aspect, shortEdge) {
  return { width: shortEdge, height: shortEdge * (aspect === "16:9" ? 16 / 9 : 4 / 3) };
}

/** @param {number} width @param {number} height @param {boolean} horizontal
 * @param {number} scale @param {number} tableWidth @param {number} tableHeight */
export function fitTable(width, height, horizontal, scale, tableWidth, tableHeight) {
  const viewWidth = horizontal ? tableHeight : tableWidth;
  const viewHeight = horizontal ? tableWidth : tableHeight;
  const fit = Math.max(0, Math.min(width / viewWidth, height / viewHeight)) * scale;
  return { width: viewWidth * fit, height: viewHeight * fit };
}

/** @param {number} x @param {number} y @param {boolean} horizontal
 * @param {"left" | "right"} side @param {number} width @param {number} height */
export function viewToTable(x, y, horizontal, side, width, height) {
  if (!horizontal) return { x, y };
  return side === "right" ? { x: width - y, y: x } : { x: y, y: height - x };
}

/** @param {number} x @param {number} y @param {number} width @param {number} height @param {number} radius */
export function clampPlayer(x, y, width, height, radius) {
  return {
    x: Math.max(radius, Math.min(width - radius, x)),
    y: Math.max(height / 2 + radius, Math.min(height - radius, y)),
  };
}
