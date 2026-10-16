import { GAME_CONFIG, validateConfig } from "./game.ts";
import type { Difficulty, GameConfig } from "./game.ts";
import { ARENAS } from "./arenas.ts";
import type { ArenaId } from "./arenas.ts";
import { DEFAULT_EFFECTS, EFFECT_OPTIONS } from "./effects.ts";
import type { VisualEffects } from "./effects.ts";
import { GRAPHICS_PRESETS } from "./graphics.ts";
import type { GraphicsQuality } from "./graphics.ts";

export const THEMES = {
  cyan: { label: "Turkusowa", player: 0x4ce8d3, ai: 0xff688b },
  blue: { label: "Niebieska", player: 0x54caff, ai: 0xff6975 },
  red: { label: "Czerwona", player: 0xff6975, ai: 0x54caff },
  green: { label: "Zielona", player: 0x63e69c, ai: 0xc998ff },
  purple: { label: "Fioletowa", player: 0xc998ff, ai: 0x63e69c },
  orange: { label: "Pomarańczowa", player: 0xffba67, ai: 0x4ce8d3 },
} as const;
export const TABLE_SIZES = {
  full: { label: "Maksymalny · 100%", scale: 1 },
  large: { label: "Duży · 90%", scale: 0.9 },
  medium: { label: "Średni · 80%", scale: 0.8 },
  small: { label: "Mały · 65%", scale: 0.65 },
} as const;
export interface Preferences extends VisualEffects {
  graphicsQuality: GraphicsQuality;
  paddleRadius: number;
  puckRadius: number;
  effectIntensity: number;
  arena: ArenaId;
  screenShake: boolean;
  orientation: "auto" | "vertical" | "horizontal";
  aspect: "auto" | "16:9" | "4:3";
  playerSide: "left" | "right";
  tableSize: keyof typeof TABLE_SIZES;
  theme: keyof typeof THEMES;
  winningScore: number;
  timeLimitSeconds: number;
  difficulty: Difficulty;
  drag: number;
  wallRestitution: number;
  paddleRestitution: number;
  responseMs: number;
  paddleSpeed: number;
}
export const DEFAULT_PREFERENCES: Preferences = {
  ...DEFAULT_EFFECTS,
  graphicsQuality: "medium",
  paddleRadius: GAME_CONFIG.paddle.radius,
  puckRadius: GAME_CONFIG.puck.radius,
  effectIntensity: 100,
  arena: "neon",
  screenShake: true,
  orientation: "auto",
  aspect: "auto",
  playerSide: "left",
  tableSize: "full",
  theme: "cyan",
  winningScore: GAME_CONFIG.match.winningScore,
  timeLimitSeconds: GAME_CONFIG.match.timeLimitSeconds,
  difficulty: GAME_CONFIG.match.defaultDifficulty,
  drag: GAME_CONFIG.puck.drag,
  wallRestitution: GAME_CONFIG.physics.wallRestitution,
  paddleRestitution: GAME_CONFIG.physics.paddleRestitution,
  responseMs: GAME_CONFIG.paddle.responseSeconds * 1000,
  paddleSpeed: GAME_CONFIG.paddle.maxSpeed,
};
export const TUNING_FIELDS = [
  {
    key: "drag",
    label: "Opór krążka",
    min: 0,
    max: 1.5,
    step: 0.005,
    unit: "1/s",
    help: "0 = swobodny ślizg. Większy opór szybciej wyhamowuje krążek.",
  },
  {
    key: "wallRestitution",
    label: "Sprężystość band",
    min: 0.1,
    max: 1,
    step: 0.01,
    unit: "%",
    help: "Część prędkości zachowana po odbiciu od bandy.",
  },
  {
    key: "paddleRestitution",
    label: "Sprężystość paletki",
    min: 0.1,
    max: 1,
    step: 0.01,
    unit: "%",
    help: "Siła odbicia względem ruchu paletki.",
  },
  {
    key: "responseMs",
    label: "Wygładzanie sterowania",
    min: 0,
    max: 150,
    step: 5,
    unit: "ms",
    help: "Niższa wartość = szybsze podążanie za palcem lub myszą.",
  },
  {
    key: "paddleSpeed",
    label: "Szybkość paletki",
    min: 700,
    max: 2800,
    step: 50,
    unit: "j./s",
    help: "Limit ruchu w jednostkach stołu; nie zależy od wielkości ekranu.",
  },
] as const;

export function configFromPreferences(p: Preferences): GameConfig {
  const c = structuredClone(GAME_CONFIG);
  c.paddle.radius = p.paddleRadius;
  c.puck.radius = p.puckRadius;
  const graphics = GRAPHICS_PRESETS[p.graphicsQuality];
  c.visuals.maxResolution = graphics.maxResolution;
  c.visuals.particles = graphics.particles;
  c.visuals.trailLength = graphics.trailLength;
  c.visuals.textureSpacing = graphics.textureSpacing;
  c.match.winningScore = p.winningScore;
  c.match.timeLimitSeconds = p.timeLimitSeconds;
  c.match.defaultDifficulty = p.difficulty;
  c.puck.drag = p.drag;
  c.physics.wallRestitution = p.wallRestitution;
  c.physics.paddleRestitution = p.paddleRestitution;
  c.paddle.responseSeconds = p.responseMs / 1000;
  c.paddle.maxSpeed = p.paddleSpeed;
  c.visuals.player = THEMES[p.theme].player;
  c.visuals.ai = THEMES[p.theme].ai;
  c.visuals.arena = p.arena;
  c.visuals.screenShake = p.screenShake;
  c.visuals.intensity = GAME_CONFIG.visuals.intensity * p.effectIntensity / 100;
  for (const { key } of EFFECT_OPTIONS) c.visuals.effects[key] = p[key];
  if (p.arena !== "neon") {
    c.visuals.player = ARENAS[p.arena].accent;
    c.visuals.ai = ARENAS[p.arena].opponent;
  }
  validateConfig(c);
  return c;
}

const STORAGE_KEY = "air-hockey.settings.v2";
/** Saved settings are untrusted; unknown/invalid fields fall back individually. */
export function sanitizePreferences(value: unknown): Preferences {
  const p = { ...DEFAULT_PREFERENCES };
  if (!value || typeof value !== "object") return p;
  const source = value as Record<string, unknown>;
  const choices = {
    graphicsQuality: Object.keys(GRAPHICS_PRESETS),
    arena: Object.keys(ARENAS),
    orientation: ["auto", "vertical", "horizontal"],
    aspect: ["auto", "16:9", "4:3"],
    playerSide: ["left", "right"],
    tableSize: Object.keys(TABLE_SIZES),
    theme: Object.keys(THEMES),
    difficulty: ["easy", "medium", "hard"],
  };
  for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
    if (
      typeof source[key] === "string" &&
      choices[key].includes(source[key] as string)
    )
      Object.assign(p, { [key]: source[key] });
  }
  for (const field of [
    ...TUNING_FIELDS,
    { key: "winningScore", min: 1, max: 99 },
    { key: "timeLimitSeconds", min: 0, max: 3600 },
    { key: "effectIntensity", min: 0, max: 125 },
    { key: "paddleRadius", min: 20, max: 48 },
    { key: "puckRadius", min: 7, max: 20 },
  ] as const) {
    const v = source[field.key];
    if (
      typeof v === "number" &&
      Number.isFinite(v) &&
      v >= field.min &&
      v <= field.max
    )
      p[field.key] = v;
  }
  p.winningScore = Math.round(p.winningScore);
  if (typeof source.screenShake === "boolean") p.screenShake = source.screenShake;
  for (const { key } of EFFECT_OPTIONS)
    if (typeof source[key] === "boolean") p[key] = source[key];
  p.timeLimitSeconds = Math.round(p.timeLimitSeconds);
  return p;
}
export function readPreferences(): Preferences {
  try {
    return sanitizePreferences(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"),
    );
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}
export function savePreferences(p: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* Storage is optional. */
  }
}
