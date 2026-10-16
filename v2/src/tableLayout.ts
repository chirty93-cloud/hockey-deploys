import settings from "./gameConfig";
export { resolveAspect, tableDimensions, fitTable, viewToTable, clampPlayer } from "./tableGeometry.js";
export const TABLE_PRESETS = settings.tablePresets;
export type TablePreset = keyof typeof TABLE_PRESETS;
