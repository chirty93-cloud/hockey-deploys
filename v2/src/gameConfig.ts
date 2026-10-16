import settings from "./game-config.json";

export type Orientation = "vertical" | "horizontal" | "auto";
export type AspectRatio = "auto" | "16:9" | "4:3";
export type PlayerSide = "left" | "right";
export type PlayerColor = keyof typeof settings.colors;
export type TablePreset = keyof typeof settings.tablePresets;
export type PhysicsKey = keyof typeof settings.physics;
export type PhysicsConfig = Record<PhysicsKey, number>;
export interface GameConfig {
  maxScore: number;
  soundEnabled: boolean;
  orientation: Orientation;
  aspectRatio: AspectRatio;
  timeLimit: number;
  playerColor: PlayerColor;
  playerSide: PlayerSide;
  tablePreset: TablePreset;
  physics: PhysicsConfig;
}

function choice<T extends string>(value: string, options: readonly T[]): T {
  if (!options.includes(value as T)) throw new Error("Nieprawidłowa opcja w game-config.json: " + value);
  return value as T;
}
export const PHYSICS_KEYS = Object.keys(settings.physics) as PhysicsKey[];
const physics = Object.fromEntries(PHYSICS_KEYS.map((key) => {
  const option = settings.physics[key];
  if (!Number.isFinite(option.default) || option.default < option.min || option.default > option.max) {
    throw new Error("Nieprawidłowa wartość domyślna: " + key);
  }
  return [key, option.default];
})) as PhysicsConfig;
export const DEFAULT_CONFIG: GameConfig = {
  ...settings.defaults,
  orientation: choice(settings.defaults.orientation, ["auto", "vertical", "horizontal"] as const),
  aspectRatio: choice(settings.defaults.aspectRatio, ["auto", "16:9", "4:3"] as const),
  playerSide: choice(settings.defaults.playerSide, ["left", "right"] as const),
  playerColor: choice(settings.defaults.playerColor, Object.keys(settings.colors) as PlayerColor[]),
  tablePreset: choice(settings.defaults.tablePreset, Object.keys(settings.tablePresets) as TablePreset[]),
  physics,
};
export const AI_COLOR = Object.fromEntries(Object.entries(settings.opponentColors).map(([key, value]) =>
  [key, choice(value, Object.keys(settings.colors) as PlayerColor[])])) as Record<PlayerColor, PlayerColor>;
export const COLORS = settings.colors;
export default settings;
