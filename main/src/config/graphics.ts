export const GRAPHICS_PRESETS = {
  low: { label: "Low", description: "Lżejszy obraz, mniej cząsteczek i krótszy ślad.", maxResolution: 1, particles: 24, trailLength: 4, textureSpacing: 32 },
  medium: { label: "Medium", description: "Obecna jakość · równowaga detali i płynności.", maxResolution: 2, particles: 64, trailLength: 9, textureSpacing: 18 },
  high: { label: "High", description: "Gęstsze detale, więcej cząsteczek i dłuższy ślad.", maxResolution: 2, particles: 96, trailLength: 14, textureSpacing: 12 },
} as const;
export type GraphicsQuality = keyof typeof GRAPHICS_PRESETS;
