export const EFFECT_OPTIONS = [
  { key: "trail", label: "Ślad krążka", help: "Świetlny ślad zależny od prędkości." },
  { key: "sparks", label: "Iskry zderzeń", help: "Cząsteczki przy uderzeniach i golach." },
  { key: "hitRings", label: "Fale uderzeń", help: "Rozchodzące się pierścienie w miejscu kontaktu." },
  { key: "hitFlash", label: "Błysk paletki", help: "Krótki błysk po mocnym uderzeniu." },
  { key: "goalWave", label: "Fala po golu", help: "Impuls światła przechodzący przez stół." },
  { key: "speedLines", label: "Linie prędkości", help: "Nowe · krótkie smugi za szybkim krążkiem." },
  { key: "paddleWake", label: "Smugi paletek", help: "Nowe · delikatne światło za poruszającą się paletką." },
] as const;
export type VisualEffects = Record<(typeof EFFECT_OPTIONS)[number]["key"], boolean>;
export const DEFAULT_EFFECTS: VisualEffects = {
  trail: true, sparks: true, hitRings: true, hitFlash: true, goalWave: true,
  speedLines: false, paddleWake: false,
};
